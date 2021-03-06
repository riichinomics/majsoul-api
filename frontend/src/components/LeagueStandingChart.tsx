import * as React from "react";
import { Line, ChartData } from "react-chartjs-2";
import * as chartjs from "chart.js";
import { IState, ContestTeam, Session } from "../State";
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import * as moment from "moment";
import { useSelector } from "react-redux";

chartjs.defaults.global.defaultFontColor = "white";

function createData(sessions: Session[], teams: Record<string, ContestTeam>): ChartData<chartjs.ChartData> {
	return {
		labels: ["Start"].concat(sessions.map(session => {
			const time =  moment(session.scheduledTime).tz('UTC');
			return `${time.hours() === 18 ? 'EU' : 'US'} ${time.format('D/M')}`
		})),

		datasets: Object.values(teams ?? {}).map(team => ({
			label: team.name,
			fill: false,
			lineTension: 0.1,
			borderCapStyle: 'butt',
			borderDash: [],
			borderDashOffset: 0.0,
			borderJoinStyle: 'miter',
			pointBorderColor: team.color,
			pointBackgroundColor: team.color,
			backgroundColor: team.color,
			borderColor: team.color,
			pointHoverBackgroundColor: team.color,
			pointHoverBorderColor: team.color,
			pointBorderWidth: 1,
			pointHoverRadius: 4,
			pointHoverBorderWidth: 2,
			pointRadius: 3,
			pointHitRadius: 10,
			data: [0].concat(sessions.map(session => session.aggregateTotals[team._id] / 1000)),
			yAxisID: "uma",
			xAxisID: "sessions",
		}))
	}
}

// private onClick(event?: MouseEvent, activeElements?: {}[]) {
// 	console.log(event, activeElements);
// }

// private onElementsClick(e: any){
// 	console.log(e);
// }

export function LeagueStandingChart(): JSX.Element {
	const sessions = useSelector((state: IState) => {
		const now = Date.now();
		if (state.contest.sessions == null) {
			return [];
		}
		return state.contest.sessions.filter(session => session.scheduledTime < now);
	});

	const teams = useSelector((state: IState) => state.contest?.teams);

	return <Container className="bg-dark rounded text-white">
		<Row className="px-2 pb-3 pt-4">
			<Line
				data={createData(sessions, teams)}
				options={{
					// onClick: this.onClick,
					scales: {
						yAxes: [
							{
								id: "uma",
								position: "right",
								gridLines: {
									color: "#666666",
									zeroLineColor: "#666666"
								}
							},
						],
						xAxes: [
							{
								id: "sessions",
								gridLines: {
									display: false
								}
							},
						]
					},
					legend: {
						display: false
					}
				}}
				// onElementsClick={this.onElementsClick}
			></Line>
		</Row>
	</Container>
}
