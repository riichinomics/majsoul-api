import * as React from "react";
import { LeagueStandingChart } from "./LeagueStandingChart";
import { fetchContestSummary, fetchContestSessions, ActionType, fetchContestPlayers, fetchGamesHook, fetchContestPlayerGames, fetchContests } from "../Actions";
import { IState, Contest } from "../State";
import { useSelector, useDispatch } from "react-redux";
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import { Session } from "./Session";
import { Teams } from "./Teams";
import YouTube from 'react-youtube';
import { Rest } from "majsoul-api";
import Accordion from "react-bootstrap/Accordion";
import { GameResultSummary, getSeatCharacter } from "./GameResultSummary";
import moment = require("moment");
import { Link } from "react-router-dom";

function SongPlayer(props: {videoId: string, play?: boolean}): JSX.Element {
	const [player, setPlayer] = React.useState<YT.Player>(null);
	React.useEffect(() => {
		if (player == null || !props.play) {
			return;
		}
		player.playVideo();
		return () => player.stopVideo();
	}, [player, props.play, props.videoId]);
	return <div style={{display:"none"}}>
		<YouTube
			videoId={props.videoId}
			onReady={(event) => setPlayer(event.target)}
			onStateChange={(event) => event.data === 0 && event.target.playVideo()}
		>
		</YouTube>
	</div>
}

export function ContestSummary(props: {contestId: string}): JSX.Element {
	const contest = useSelector((state: IState) => state.contest);

	const dispatch = useDispatch();

	React.useEffect(() => {
		fetchContestSummary(dispatch, props.contestId);
		fetchContestSessions(dispatch, props.contestId);
	}, [props.contestId]);

	const [secret, setSecret] = React.useState(false);
	React.useEffect(() => {
		if (!secret) {
			return;
		}
		setTimeout(() => setSecret(true), 5000);
	}, [secret]);

	if (contest == null) {
		return <Container className="text-light text-center pt-4">
			<h5 className="bg-dark rounded py-3">
				Tourney #{props.contestId} doesn't exist.
			</h5>
		</Container>;
	}

	return <Container>
		<SongPlayer videoId="PNcXo7_b9M4" play={secret}/>
		<Row className="px-4 pt-4 pb-3 no-gutters align-items-center">
			<Col>
				<h1 onClick={() => setSecret(true)}><u style={{cursor: "pointer"}}>{contest?.name}</u></h1>
			</Col>
			<Col md="auto">
				<i>
					{secret
						? "<secret goes here>"
						: "<tagline goes here>"}
					</i>
				</Col>
		</Row>

		{contest != null ? <TourneyContestSummary contestId={contest._id}/> : null}
	</Container>
}

export function ContestPlayerDisplay(props: {contestId: string, contestPlayer: Rest.ContestPlayer}): JSX.Element {
	const games = useSelector((state: IState) => {
		if (state.games == null) {
			return [];
		}

		return Object.values(state.games)
			.filter(game => game.contestId === props.contestId
				&& game.players.findIndex(p => p._id === props.contestPlayer._id) >= 0);
	});

	const dispatch = useDispatch();
	const [loadGames, setLoadGames] = React.useState(false);
	React.useEffect(() => {
		if (!loadGames) {
			return;
		}

		fetchContestPlayerGames(dispatch, props.contestId, props.contestPlayer._id);
	}, [props.contestId, props.contestPlayer._id, loadGames]);

	const maxGames = 5;

	return <Accordion as={Container} className="p-0">
		<Accordion.Toggle as={Row} eventKey="0" className="no-gutters align-items-center flex-nowrap" onClick={() => setLoadGames(true)} style={{cursor: "pointer"}}>
			<Col md="auto" style={{minWidth: 50}} className="mr-3 text-right"> <h5><b>{props.contestPlayer.tourneyRank + 1}位</b></h5></Col>
			<Col className="text-nowrap" style={{flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis"}}>
				<Container className="p-0">
					<Row className="no-gutters">
						<Col md="auto" className="font-weight-bold h5 text-truncate"  style={{borderBottom: `3px solid ${props.contestPlayer.gamesPlayed >= maxGames ? "LightGreen" : "grey" }`}}>
							{props.contestPlayer.nickname}
						</Col>
					</Row>
				</Container>
			</Col>
			<Col md="auto" className="mr-3"> <h5><b>{props.contestPlayer.tourneyScore / 1000}</b></h5></Col>
			<Col md="auto" className="mr-3"> <h5><b>{Math.min(maxGames, props.contestPlayer.gamesPlayed)}戦</b></h5></Col>
		</Accordion.Toggle>
		<Accordion.Collapse as={Row} eventKey="0" >
			<Container>
				{games.sort((a, b) => b.start_time - a.start_time).slice(-maxGames).map(game => {
					const playerSeat = game.players.findIndex(p => p._id === props.contestPlayer._id);
					const position = game.finalScore
						.map((score, seat) => ({score, seat}))
						.sort((a, b) => b.score.uma - a.score.uma)
						.findIndex(r => r.seat === playerSeat);
					return <Row key={game._id}>
						<Col md="auto">
							{getSeatCharacter(playerSeat)}
						</Col>

						<Col md="auto">
							{position + 1}位
						</Col>

						<Col>
							{game.finalScore[playerSeat].uma / 1000}
						</Col>

						<Col md="auto">
							{moment(game.start_time).calendar()}
						</Col>

						<Col md="auto">
							<a href={`https://mahjongsoul.game.yo-star.com/?paipu=${game.majsoulId}`} rel="noreferrer" target="_blank">On Majsoul</a>
						</Col>
					</Row>
				})}
			</Container>
		</Accordion.Collapse>
	</Accordion>
}

export function PlayerStandings(props: {contestId: string}): JSX.Element {
	const contestPlayers = useSelector((state: IState) => state.contest?.players);
	const dispatch = useDispatch();

	React.useEffect(() => {
		fetchContestPlayers(dispatch, props.contestId);
	}, [props.contestId]);

	if (contestPlayers == null) {
		return null;
	}

	return <Container className="rounded bg-dark text-light px-3 py-4">
		{contestPlayers.map((player, placing) =>
			<Row key={player._id} className={`${placing > 0 ? "mt-3" : ""} no-gutters`} style={{maxWidth: 640, margin: "auto"}}>
				<ContestPlayerDisplay contestId={props.contestId} contestPlayer={player}/>
			</Row>
		)}
	</Container>
}

export function TourneyContestSummary(props: {contestId: string}): JSX.Element {
	const games = useSelector((state: IState) => {
		if (state.games == null) {
			return [];
		}

		return Object.values(state.games)
			.filter(game => game.contestId === props.contestId)
			.sort((a, b) => a.start_time - b.start_time)
			.slice(0, 4);
	});

	const dispatch = useDispatch();

	React.useEffect(() => {
		fetchGamesHook(dispatch, {
			contestIds: [props.contestId],
			last: 4,
		});
	}, [props.contestId]);

	return <>
		<Row className="mt-3">
			<PlayerStandings contestId={props.contestId} />
		</Row>
		<Row className="px-4 py-3 justify-content-end" >
			<Col md="auto" className="h4 mb-0"><u>Recent Games</u></Col>
		</Row>
		<Row>
			<Container className="p-0 rounded bg-dark text-light px-1 py-2">
				<Row className="no-gutters">
					{games?.map((game, index) => <React.Fragment key={game._id}>
						<Col style={{minWidth: "auto"}}>
							<GameResultSummary game={game}/>
						</Col>
						{(index % 2 == 1) && <div className="w-100"/>}
					</React.Fragment>)}
				</Row>
			</Container>
		</Row>
	</>
}

export function LeagueContestSummary(props: {contest: Contest}): JSX.Element {
	const games = useSelector((state: IState) => Object.values(state.games ?? [])?.sort((a, b) => b.end_time - a.end_time));
	const musicPlayer = useSelector((state: IState) => state.musicPlayer);
	const dispatch = useDispatch();

	const contest = props.contest;

	const nextSessionIndex = contest?.sessions?.findIndex(session => session.scheduledTime > Date.now()) ?? -1;
	const nextSession = contest?.sessions == null ? null : contest.sessions[nextSessionIndex];
	const currentSession = contest?.sessions == null ? null : contest.sessions[(nextSessionIndex < 1 ? contest.sessions.length : nextSessionIndex) - 1];

	React.useEffect(() => {
		if (nextSession != null || currentSession == null || musicPlayer.playing || contest?.teams == null) {
			return;
		}

		if (games.filter(g => g.start_time > currentSession.scheduledTime).length < 4) {
			return;
		}

		const firstPlace = Object.entries(currentSession.aggregateTotals).map(([teamId, score]) => ({teamId, score})).sort((a, b) => b.score - a.score)[0];
		const anthem = contest.teams[firstPlace.teamId]?.anthem;
		if (anthem == null) {
			return;
		}

		dispatch({
			type: navigator.userAgent.indexOf('Firefox') != -1 ? ActionType.SetMusic : ActionType.PlayMusic,
			videoId: anthem
		});
	}, [nextSession, currentSession, contest?.teams]);

	if (contest == null) {
		return null;
	}

	return <>
		<Row className="mt-3">
			<Teams session={currentSession} />
		</Row>
		<Row className="mt-3">
			<LeagueStandingChart/>
		</Row>
		{ nextSession != null && <>
			<Row className="px-4 py-3 justify-content-end" >
				<Col md="auto" className="h4 mb-0"><u>Next Session</u></Col>
			</Row>
			<Row>
				<Session session={nextSession}></Session>
			</Row>
		</>}
		<Row className="px-4 py-3 justify-content-end" >
			<Col md="auto" className="h4 mb-0"><u>Recent Session</u></Col>
		</Row>
		<Row>
			<Session session={currentSession}></Session>
		</Row>
	</>
}

export function ContestList(): JSX.Element {
	const dispatch = useDispatch();
	React.useEffect(() => {
		fetchContests(dispatch);
	}, [true]);
	const contests = useSelector((state: IState) => Object.values(state.contestsByMajsoulFriendlyId));
	return <Container>
		{contests.map(contest =>
			<Row className="bg-dark rounded text-white" key={contest._id}>
				<Link to={`/contests/${contest.majsoulFriendlyId}`}>
					<h4>{contest.name}</h4>
				</Link>
			</Row>
		)}
	</Container>
}
