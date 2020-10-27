import { Spreadsheet } from "./google";
import * as fs from "fs";
import * as express from 'express';
import * as cors from "cors";

import { ObjectId } from 'mongodb';
import * as majsoul from "./majsoul";
import * as store from "./store";
import { getSecrets, getSecretsFilePath } from "./secrets";

const leagueContest = 113331;

async function main() {
	async function addToSpreadSheet(gameId): Promise<void> {
		return;
		if (process.env.NODE_ENV !== "production" || process.env.MAJSOUL_ENV === "staging") {
			console.log("skipping spreadsheet write");
			return;
		}

		if(spreadsheet.isGameRecorded(gameId) && spreadsheet.isGameDetailRecorded(gameId)) {
			console.log(`Already written game ${gameId} to spreadsheet`);
			return;
		}

		const gameResult = await api.getGame(gameId);

		if (gameResult == null){
			console.log(`Unable to retrieve game ${gameId}, skipping spreadsheet add`);
			return;
		}

		if (gameResult.players.length < 4 || !gameResult.players.every(p => p.nickname)) {
			return;
		}

		spreadsheet.addGame(gameResult);
		spreadsheet.addGameDetails(gameResult);
	};

	const secrets = getSecrets();

	const googleAppInfo = {
		clientId: secrets.googleCreds.installed.client_id,
		clientSecret: secrets.googleCreds.installed.client_secret,
		redirectUri: secrets.googleCreds.installed.redirect_uris[0],
		authToken: secrets.googleAuthToken
	}

	if (!googleAppInfo.authToken && process.env.NODE_ENV !== "production") {
		googleAppInfo.authToken = secrets.googleAuthToken = await Spreadsheet.getAuthTokenInteractive(googleAppInfo);
		fs.writeFileSync(getSecretsFilePath(), JSON.stringify(secrets));
	}

	const spreadsheet = new Spreadsheet(googleAppInfo);
	await spreadsheet.init();

	const api = new majsoul.Api(await majsoul.Api.retrieveApiResources());
	await api.init();
	await api.logIn(secrets.majsoul.uid, secrets.majsoul.accessToken);

	//console.log(api.majsoulCodec.decodeMessage(Buffer.from("0227000a282e6c712e4c6f6262792e6c65617665437573746f6d697a6564436f6e7465737443686174526f6f6d1200", "hex")));

	const majsoulContest = await api.findContestByContestId(657799);
	// const contestId2 = await api.findContestUniqueId(917559);
	const sub = api.subscribeToContestChatSystemMessages(majsoulContest.majsoulId).subscribe(notification => {
		if (notification.game_end && notification.game_end.constructor.name === "CustomizedContestGameEnd") {
			setTimeout(() => addToSpreadSheet(notification.uuid), 5000);
		}
	});

	//spreadsheet.addGameDetails(await api.getGame(decodePaipuId("jijpnt-q3r346x6-y108-64fk-hbbn-lkptsjjyoszx_a925250810_2").split('_')[0]));

	const mongoStore = new store.Store();
	await mongoStore.init(secrets.mongo?.username ?? "root", secrets.mongo?.password ?? "example");

	let contest = (await mongoStore.contestCollection.findOneAndUpdate(
		{ majsoulId: majsoulContest.majsoulId },
		{ $setOnInsert: { ...majsoulContest } },
		{ upsert: true, returnOriginal: false }
	)).value;

	if (contest.majsoulFriendlyId === leagueContest) {
		if (!contest.teams) {
			console.log(`Contest doesn't have teams, importing`);

			const teams = await spreadsheet.getTeamInformation();
			for (const team of teams) {
				team.players = (await Promise.all(team.players.map(player => mongoStore.playersCollection.findOneAndUpdate(
					{ nickname: player.nickname },
					{ $set: { displayName: player.displayName } },
					{
						upsert: true,
						returnOriginal: false,
						projection: { majsoulId: false }
					}
				)))).map(r => r.value);
				team._id = new ObjectId();
			}

			contest = (await mongoStore.contestCollection.findOneAndUpdate(
				{ _id: contest._id },
				{ $set: { teams } },
				{ returnOriginal: false }
			)).value;
		}

		if (!(await mongoStore.sessionsCollection.findOne({contestId: contest._id}))) {
			console.log(`Generating contest sessions`);
			const sessions = (await spreadsheet.getMatchInformation(contest.teams))
				.map(s => {s.contestId = contest._id; return s});
			await mongoStore.sessionsCollection.insertMany(sessions);
		}
	}

	const gameIds = await api.getContestGamesIds(contest.majsoulId);

	for (const game of gameIds) {
		await addToSpreadSheet(game.majsoulId);
	}

	for (const game of gameIds) {
		if (await mongoStore.isGameRecorded(game)){
			console.log(`Game id ${game.majsoulId} already recorded`);
			continue;
		}

		const gameResult = await api.getGame(game.majsoulId);

		await mongoStore.recordGame(contest, gameResult);
	}

	const mongoSub = api.subscribeToContestChatSystemMessages(majsoulContest.majsoulId).subscribe(notification => {
		if (notification.game_end && notification.game_end.constructor.name === "CustomizedContestGameEnd") {
			setTimeout(() => {
				api.getGame(notification.uuid)
					.then(gameResult => mongoStore.recordGame(contest, gameResult)
					.catch(e => console.log(e)));
			}, 5000);
		}
	});

	const app = express();
	app.use(cors());
	app.use(express.json({limit: "1MB"}));

	app.get<any, store.Contest<ObjectId>[]>('/contests', (req, res) => {
		this.mongoStore.contestCollection.find({},
			{
				projection: {
					_id: 0,
					majsoulId: 0,
					teams: 0,
					sessions: 0
				}
			})
			.toArray()
			.then(contests => res.send(contests))
			.catch(error => res.status(500).send(error));
	});

	app.listen(9516, () => console.log(`Express started`));
}

main();
