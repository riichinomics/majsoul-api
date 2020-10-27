import { Credentials } from 'google-auth-library';
import * as fs from "fs";
import * as path from "path";

export enum Key {
	OAuthPrivateKey = "riichi.key.pem",
	OAuthPublicKey = "riichi.crt.pem",
}

export interface ISecrets {
	majsoul: {
		uid: string;
		accessToken: string;
	};
	googleCreds: {
		installed: {
			client_id: string;
			client_secret: string;
			redirect_uris: string[];
		}
	}
	googleAuthToken: Credentials;
	mongo: {
		username: string;
		password: string;
	}
	riichiRoot: {
		username: string;
		password: string;
	}
}

export function getSecretsFilePath(): string {
	return process.env.NODE_ENV === "production"
		? "/run/secrets/majsoul.json"
		: path.join(path.dirname(__filename), 'secrets.json');
}

export function getSecrets() : ISecrets {
	return JSON.parse(fs.readFileSync(getSecretsFilePath(), 'utf8'));
}

export function getKey(key: Key): Promise<Buffer> {
	return new Promise<Buffer>((res, rej) => fs.readFile(path.join(keyLocation(), key), (err, key) => {
		if (err) {
			console.log("couldn't load private key for auth tokens, disabling rigging");
			console.log(err);
			return;
		}
		res(key);
	}));
}

function keyLocation(): string {
	return process.env.NODE_ENV === "production" ? "/run/secrets/" : path.dirname(process.argv[1]);
}
