import * as express from 'express';
import * as cors from "cors";
import * as crypto from "crypto";
import * as store from "./store";
import * as jwt from "jsonwebtoken";
import { getKey, getSecrets, Key } from "./secrets";

async function main () {
	const secrets = getSecrets();
	const mongoStore = new store.Store();
	await mongoStore.init(secrets.mongo?.username ?? "root", secrets.mongo?.password ?? "example");

	const app = express();
	app.use(cors());
	app.use(express.json({limit: "1MB"}));

	const root = secrets.riichiRoot;
	if (root?.username != null && root?.password != null) {
		const salt = crypto.randomBytes(24).toString("hex");
		const sha = crypto.createHash("sha256");
		await mongoStore.userCollection.findOneAndUpdate(
			{
				nickname: root.username,
			},
			{
				$setOnInsert: {
					password : {
						salt,
						hash: sha.update(`${root.password}:${salt}`).digest("hex")
					},
					scopes: ["root"]
				}
			},
			{ upsert: true }
		);
	}

	let privateKey: Buffer;
	try {
		privateKey = await getKey(Key.OAuthPrivateKey);
	} catch (err) {
		console.log("Couldn't load keys for auth tokens, disabling rigging");
		console.log(err);
		return;
	}

	app.get("/token", async (req, res) => {
		const user = await mongoStore.userCollection.findOne({
			nickname: req.header("Username") as string,
		});

		if (!user) {
			res.sendStatus(401);
			return;
		}

		const sha = crypto.createHash("sha256");
		if (user.password.hash !== sha.update(`${req.header("Password") as string}:${user.password.salt}`).digest("hex")) {
			res.sendStatus(401);
			return;
		}

		jwt.sign(
			{
				name: user.nickname,
				roles: user.scopes
			},
			privateKey,
			{
				algorithm: 'RS256',
				issuer: "riichi.moe",
				audience: "riichi.moe",
				expiresIn: "1d",
				notBefore: 0,
			},
			(err, token) => {
			if (err) {
				console.log(err);
				res.status(500).send(err);
				return;
			}
			res.send(token);
		});
	});

	app.listen(9517, () => console.log(`Express started`));
}

main();
