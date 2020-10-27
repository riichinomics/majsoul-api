import { Action, Dispatch } from "redux";
import { Store, Rest } from "majsoul-api";
import { ThunkAction } from "redux-thunk";
import { IState, Session, ContestTeam } from "./State";
import { SplitChunksPlugin } from "webpack";

export type AppThunk<AType extends Action<ActionType>, TReturn = void> =  ThunkAction<TReturn, IState, unknown, AType>;

export enum ActionType {
	ContestSummaryRetrieved,
	GamesRetrieved,
	RiggingTokenGet,
	SessionPatched,
	LogOut,
	PatchTeam,
	GetContestSessions,
	PlayMusic,
	SetMusic,
	StopMusic,
	GetContestPlayers,
	GetContestPlayerGames,
	GetContests,
}

export interface SummaryRetrievedAction extends Action<ActionType.ContestSummaryRetrieved> {
	contest: Store.Contest<string>;
}

export interface SessionGamesRetrieved extends Action<ActionType.GamesRetrieved> {
	games: Rest.GameResult[];
}

export interface RiggingTokenAquired extends Action<ActionType.RiggingTokenGet> {
	token: string;
}

export interface SessionPatched extends Action<ActionType.SessionPatched> {
	session: Store.Session;
}

export interface PatchTeam extends Action<ActionType.PatchTeam> {
	team: ContestTeam;
}

export interface GetContestSessions extends Action<ActionType.GetContestSessions> {
	sessions: Session[];
}

export interface SetMusic extends Action<ActionType.PlayMusic> {
	videoId: string;
}

export interface PlayMusic extends Action<ActionType.PlayMusic> {
	videoId: string;
}

export interface GetContestPlayers extends Action<ActionType.GetContestPlayers> {
	players: Rest.ContestPlayer[];
}

export interface GetContestPlayerGames extends Action<ActionType.GetContestPlayerGames> {
	games: Store.GameResult[];
}

export interface GetContests extends Action<ActionType.GetContests> {
	contests: Store.Contest[];
}

enum Server {
	Connector,
	Rest
}

function baseApi(server: Server): string {
	switch (server) {
		case Server.Rest: {
			if (process.env.NODE_ENV === "production") {
				return "/api/riichi/";
			}
			return ":9515/";
		} case Server.Connector: {
			if (process.env.NODE_ENV === "production") {
				return "/api/majsoul/";
			}
			return ":9516/";
		}
	}
}

export function buildApiUrl(path: string, server: Server = Server.Rest): URL {
	if (process.env.NODE_ENV === "production") {
		return new URL(`${location.protocol}//${location.host}${baseApi(server)}${path}`);
	}
	return new URL(`${location.protocol}//${location.hostname}${baseApi(server)}${path}`);
}

export function fetchContestSummary(dispatch: Dispatch, contestId: string): void {
	fetch(buildApiUrl(`contests/${contestId}`).toString())
		.then(response => response.json())
		.then(contest => dispatch({
			type: ActionType.ContestSummaryRetrieved,
			contest
		}));
}

export function fetchContestSessions(dispatch: Dispatch, contestId: string): void {
	fetch(buildApiUrl(`contests/${contestId}/sessions`).toString())
		.then(response => response.json())
		.then(sessions => dispatch({
			type: ActionType.GetContestSessions,
			sessions
		}));
}

export function fetchContestPlayers(dispatch: Dispatch, contestId: string | number): void {
	fetch(buildApiUrl(`contests/${contestId}/players`).toString())
		.then(response => response.json())
		.then(players => dispatch({
			type: ActionType.GetContestPlayers,
			players
		}));
}

export function fetchContestPlayerGames(dispatch: Dispatch, contestId: string, playerId: string): void {
	fetch(buildApiUrl(`contests/${contestId}/players/${playerId}/games`).toString())
		.then(response => response.json())
		.then(games => dispatch({
			type: ActionType.GetContestPlayerGames,
			games
		}));
}

export function fetchContests(dispatch: Dispatch): void {
	fetch(buildApiUrl(`contests`).toString())
		.then(response => response.json())
		.then(contests => dispatch({
			type: ActionType.GetContests,
			contests
		}));
}

export interface FetchGamesOptions {
	sessionIds?: string[];
	last?: number;
	contestIds?: string[];
}

export function fetchGamesHook(dispatch: Dispatch, params: FetchGamesOptions): void {
	const url = buildApiUrl(`games`);
	const queryParameters: Record<string, string> = {};
	if (params.sessionIds != null) {
		queryParameters.sessions = params.sessionIds?.join('+');
	}

	if (params.contestIds != null) {
		queryParameters.contests = params.contestIds?.join('+');
	}

	if (params.last != null) {
		queryParameters.last = params.last?.toString();
	}

	url.search = new URLSearchParams(queryParameters).toString();

	fetch(url.toString())
		.then(response => response.json())
		.then(games => dispatch({
			type: ActionType.GamesRetrieved,
			games
		}));
}

export function patchSession(dispatch: Dispatch, token: string, session: Session): Promise<unknown> {
	const url = buildApiUrl(`sessions/${session._id}`);
	return fetch(
		url.toString(),
		{
			method: "PATCH",
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${token}`
			},
			body: JSON.stringify({ scheduledTime: session.scheduledTime })
		})
		.then(response => response.json())
		.then(session => dispatch({
			type: ActionType.SessionPatched,
			session
		}));
}

export interface GetRiggingTokenOptions {
	username: string;
	password: string;
}

export const getRiggingToken = (params: GetRiggingTokenOptions): AppThunk<RiggingTokenAquired, Promise<boolean>> => {
	return function (dispatch) {
		const url = buildApiUrl(`rigging/token`);
		return fetch(
			url.toString(),
			{
				headers: {
					"Username": params.username,
					"Password": params.password
				}
			}
		).then(response => {
			if (response.status !== 200) {
				return false;
			}
			response.text().then(token => dispatch({type: ActionType.RiggingTokenGet, token}));
			return true;
		});
	}
}

export function logout(dispatch: Dispatch) {
	dispatch({type: ActionType.LogOut});
}

export function patchTeam(dispatch: Dispatch, token: string, team: ContestTeam): Promise<unknown> {
	const url = buildApiUrl(`teams/${team._id}`);
	return fetch(
		url.toString(),
		{
			method: "PATCH",
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${token}`
			},
			body: JSON.stringify(team)
		})
		.then(response => response.json())
		.then(team => dispatch({
			type: ActionType.PatchTeam,
			team
		}));
}
