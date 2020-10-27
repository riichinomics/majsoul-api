import * as store from "./store";
import { getKey, getSecrets, Key } from "./secrets";
import * as express from 'express';
import * as cors from "cors";
import { GameResult, Session, ContestPlayer } from './rest/types/types';
import { ObjectId, FilterQuery, Condition } from 'mongodb';
import * as expressJwt from 'express-jwt';
import { Observable } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { body } from 'express-validator';

async function getSessionSummary(
	mongoStore: store.Store,
	contest: store.Contest,
	startSession: store.Session,
	endSession?: store.Session
): Promise<Record<string, number>> {
	const timeWindow: Condition<number> = {
		$gte: startSession.scheduledTime
	};

	if (endSession) {
		timeWindow.$lt = endSession.scheduledTime
	}

	const games = await mongoStore.gamesCollection.find({
		end_time: timeWindow
	}).toArray();

	return games.reduce<Record<string, number>>((total, game) => {
		game.finalScore.forEach((score, index) => {
			const winningTeam = contest.teams.find(t => t.players.find(p => p._id.equals(game.players[index]._id)));
			total[winningTeam._id.toHexString()] = (total[winningTeam._id.toHexString()] ?? 0) + score.uma;
		});
		return total;
	}, {});
}

function getSessions(
	mongoStore: store.Store,
	contest: store.Contest<ObjectId>
): Observable<Session> {
	return new Observable((subscriber) => {
		setTimeout(async () => {
			try {
				const sessions = await mongoStore.sessionsCollection.find(
					{ contestId: contest._id },
					{ sort: { scheduledTime: 1 } }
				).toArray();

				let aggregateTotals: Record<string, number> = {};
				for (let i = 0; i < sessions.length; i++) {
					aggregateTotals = {...aggregateTotals};
					const totals = await getSessionSummary(mongoStore, contest, sessions[i], sessions[i + 1]);

					for (const team in totals) {
						if (aggregateTotals[team] == null) {
							aggregateTotals[team] = 0;
						}
						aggregateTotals[team] += totals[team];
					}

					subscriber.next({
						...sessions[i],
						totals,
						aggregateTotals
					});
				}

				subscriber.complete();
			} catch (error) {
				subscriber.error(error);
			}
		});
	});
}

async function main () {
	const secrets = getSecrets();
	const mongoStore = new store.Store();
	await mongoStore.init(secrets.mongo?.username ?? "root", secrets.mongo?.password ?? "example");

	const app = express();
	app.use(cors());
	app.use(express.json({limit: "1MB"}));

	app.get<any, store.Contest<ObjectId>[]>('/contests', (req, res) => {
		mongoStore.contestCollection.find({},
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

	app.get<any, store.Contest<ObjectId>>('/contests/:id', (req, res) => {
		mongoStore.contestCollection.findOne(
			{ majsoulFriendlyId: parseInt(req.params.id) },
			{
				projection: {
					sessions: 0
				}
			}
		).then((contest) => {
			res.send(contest);
		})
		.catch(error => {
			console.log(error);
			res.status(500).send(error)
		});
	});

	app.get<any, Session<ObjectId>[]>('/contests/:id/sessions', (req, res) => {
		mongoStore.contestCollection.findOne(
			{ majsoulFriendlyId: parseInt(req.params.id) }
		).then((contest) => {
			if (contest == null) {
				res.sendStatus(404);
				return;
			}

			getSessions(mongoStore, contest).pipe(toArray())
				.subscribe(
					sessions => res.send(sessions),
					error => {
						console.log(error);
						res.status(500).send(error)
					}
				);
		})
		.catch(error => {
			console.log(error);
			res.status(500).send(error)
		});
	});

	app.get<any, GameResult<ObjectId>[]>('/games', async (req, res) => {
		const filter: FilterQuery<store.GameResult<ObjectId>> = {};
		filter.$and = [];

		const contestIds = (req.query.contests as string)?.split(' ');
		if (contestIds) {
			const contests = await mongoStore.contestCollection.find(
				{ $or: [
					{ majsoulFriendlyId: { $in: contestIds.map(id => parseInt(id)) } },
					{ _id: { $in: contestIds.map(id => ObjectId.isValid(id) ? ObjectId.createFromHexString(id) : null) } },
				]}
			).toArray();

			filter.$and.push(
				{
					$or: contestIds.map(string => ({
						contestMajsoulId: { $in: contests.map(p => p.majsoulId) }
					}))
				}
			);
		}

		const sessionIds = (req.query?.sessions as string)?.split(' ');
		let sessionMap: {
			startSession: store.Session,
			endSession: store.Session
		}[] = [];
		if (sessionIds) {
			const sessions = await mongoStore.sessionsCollection.find({
				_id: { $in: sessionIds.map(id => new ObjectId(id)) }
			}).toArray();

			const sessionOr = [];
			for(const session of sessions) {
				let [startSession, endSession] = await mongoStore.sessionsCollection.find(
					{scheduledTime: {$gte: session.scheduledTime}}
				).sort({scheduledTime: 1}).limit(2).toArray();

				sessionMap.push({
					startSession,
					endSession
				});

				const end_time: Condition<number> = {
					$gte: startSession.scheduledTime
				}

				if(endSession != null) {
					end_time.$lt = endSession.scheduledTime;
				}

				sessionOr.push({end_time});
			}

			filter.$and.push({ $or: sessionOr });
		}

		if (filter.$and.length === 0) {
			delete filter.$and;
		}

		const cursor = mongoStore.gamesCollection.find(filter);

		if (req.query?.last) {
			const last = parseInt(req.query.last as string);
			if (last) {
				cursor.sort({end_time: -1})
				.limit(last);
			}
		}

		try {
			const games = await cursor.toArray();
			const contests = await mongoStore.contestCollection.find(
				{majsoulId: { $in: [...new Set(games.map(g => g.contestMajsoulId))] } }
			).toArray();

			res.send(games.map(game => ({
				...game,
				contestId: contests.find(c => c.majsoulId === game.contestMajsoulId)._id,
				sessionId: sessionMap.find((session) =>
					game.end_time >= session.startSession.scheduledTime
						&& (session.endSession == null || game.end_time < session.endSession.scheduledTime)
				)?.startSession?._id
			})));
		} catch (error) {
			console.log(error);
			res.status(500).send(error)
		}
	});

	app.get<any, GameResult[]>('/contests/:contestId/players/:playerId/games', async (req, res) => {
		try {
			const contest = await mongoStore.contestCollection.findOne(
				{ $or: [
					{ majsoulFriendlyId: parseInt(req.params.contestId) },
					{ _id: ObjectId.isValid(req.params.contestId) ? ObjectId.createFromHexString(req.params.contestId) : null },
				]}
			);

			if (contest == null) {
				res.sendStatus(404);
				return;
			}

			const games = await mongoStore.gamesCollection.find(
				{
					contestMajsoulId: contest.majsoulId,
					"players._id": ObjectId.createFromHexString(req.params.playerId)
				}
			).toArray();

			res.send(games.map(game => ({
				...game,
				contestId: contest._id
			})));
		} catch (error){
			console.log(error);
			res.status(500).send(error)
		}
	});

	app.get<any, ContestPlayer[]>('/contests/:id/players', async (req, res) => {
		try {
			const contest = await mongoStore.contestCollection.findOne(
				{ $or: [
					{ majsoulFriendlyId: parseInt(req.params.id) },
					{ _id: ObjectId.isValid(req.params.id) ? ObjectId.createFromHexString(req.params.id) : null },
				]}
			);

			if (contest == null) {
				res.sendStatus(404);
				return;
			}

			const games = await mongoStore.gamesCollection.find(
				{ contestMajsoulId: contest.majsoulId }
			).toArray();

			const playerGameInfo = games.reduce<Record<string, ContestPlayer>>((total, game) => {
				game.players.forEach((player, index) => {
					const id = player._id.toHexString();
					if (!(id in total)) {
						total[id] = {
							...player,
							tourneyScore: 0,
							tourneyRank: undefined,
							gamesPlayed: 0,
						};
					}

					const games = 5;

					total[id].gamesPlayed++;
					if (total[id].gamesPlayed > games) {
						return;
					}
					total[id].tourneyScore += game.finalScore[index].uma;
				});
				return total;
			}, {});

			const players = await mongoStore.playersCollection.find(
				{ _id: { $in: Object.values(playerGameInfo).map(p => p._id) } },
				{ projection: { majsoulId: 0 } }
			).toArray();

			res.send(
				players.map(player => ({
					...playerGameInfo[player._id.toHexString()],
					...player,
				})).sort((a, b) => b.tourneyScore - a.tourneyScore)
				.map((p, i) => ({...p, tourneyRank: i}))
			);
		} catch (error){
			console.log(error);
			res.status(500).send(error)
		}
	});

	app.listen(9515, () => console.log(`Express started`));

	let publicKey: Buffer;
	try {
		publicKey = await getKey(Key.OAuthPublicKey);
	} catch (err) {
		console.log("Couldn't load keys for auth tokens, disabling rigging");
		console.log(err);
		return;
	}

	app.use(
		expressJwt({
			secret: publicKey,
			audience: "riichi.moe",
			issuer: "riichi.moe",
			credentialsRequired: true,
		}).unless({
			method: "GET"
		})
	).use(function (err, req, res, next) {
		if (err.name === 'UnauthorizedError') {
		  res.status(401).send('token invalid');
		  return;
		}
		next();
	})

	.put<any, store.Contest<ObjectId>>(
		'/contests',
		[
			body('majsoulFriendlyId').isInt(),
			body('password').isLength({ min: 5 })
		],
		(req, res) => {
		const patch = req.body as Session<string>;
		if (patch?.scheduledTime == undefined) {
			res.sendStatus(304);
			return;
		}

		mongoStore.contestCollection.findOneAndUpdate(
			{ _id: new ObjectId(req.params.id) },
			{ $set: { scheduledTime: patch.scheduledTime } },
			{ returnOriginal: false }
		).then((session) => {
			res.send({
				_id: session.value._id
			} as Session);
		}).catch((err) => {
			console.log(err);
			res.status(500).send(err);
		})
	})

	.patch<any, Session<ObjectId>>('/sessions/:id', (req, res) => {
		const patch = req.body as Session<string>;
		if (patch?.scheduledTime == undefined) {
			res.sendStatus(304);
			return;
		}

		mongoStore.sessionsCollection.findOneAndUpdate(
			{ _id: new ObjectId(req.params.id) },
			{ $set: { scheduledTime: patch.scheduledTime } },
			{ returnOriginal: false }
		).then((session) => {
			res.send({
				_id: session.value._id,
				scheduledTime: session.value.scheduledTime
			} as Session);
		}).catch((err) => {
			console.log(err);
			res.status(500).send(err);
		})
	})

	.patch<any, store.ContestTeam<ObjectId>>('/teams/:id', (req, res) => {
		const body = req.body as store.ContestTeam<string>;

		if (body.image == undefined && body.anthem == undefined) {
			res.sendStatus(304);
			return;
		}

		const teamId = new ObjectId(req.params.id);

		mongoStore.contestCollection.findOneAndUpdate(
			{ teams: { $elemMatch: { _id: teamId } } },
			{ $set: {
				"teams.$.image": body.image,
				"teams.$.anthem": body.anthem
			} },
			{ returnOriginal: false, projection: { teams: true } }
		).then((contest) => {
			res.send(contest.value.teams.find(team => team._id.equals(teamId) ));
		}).catch((err) => {
			console.log(err);
			res.status(500).send(err);
		})
	})
}

main();
