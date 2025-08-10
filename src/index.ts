import {
	CITY_TO_NEW_LOCATION,
	IPINFO_ACCESS_TOKEN_ENV_KEY,
	PRIVATE_ACCESS_COOKIE_ENV_KEY,
	ROBLOX_SECURITY_TOKENS_ENV_PREFIX,
} from "./constants";
import {
	getGameServerJoinData,
	getIpInfo,
	listExperienceSorts,
	listPublicServers,
	shuffleArray,
	type ListedExperience,
} from "./utils";

export type DataCenterLocation = {
	city: string;
	region: string;
	country: string;
	latLong: [string, string];
};

export type DataCenterData = {
	dataCenterId: number;
	location: DataCenterLocation;
	ips: string[];
	internalIps: string[];
};

export type DataCenterGroupData = {
	dataCenterIds: number[];
	location: DataCenterLocation;
};

type RunIntervalData = {
	requestCount: number;
	receivedCount: number;
	totalPlaying: number;
	dataCenters: DataCenterData[];
};

type RunProps = {
	robloxCookies: string[];
	privateAccessCookie?: string;
	ipInfoAccessToken: string;
	dataCenters: DataCenterData[];
	interval?: (data: RunIntervalData) => void;
};

export default async function run({
	robloxCookies,
	privateAccessCookie,
	ipInfoAccessToken,
	dataCenters: _dataCenters,
	interval,
}: RunProps) {
	const dataCenters = [..._dataCenters];
	let usedRobloxCookieIndex = 0;

	let experiences: ListedExperience[] = [];
	let cursor: string | undefined;

	const sessionId = crypto.randomUUID();

	while (true) {
		const data = await listExperienceSorts(
			{
				sessionId,
				sortsPageToken: cursor,
			},
			robloxCookies[usedRobloxCookieIndex],
		);

		for (const sort of data.sorts) {
			if (sort.contentType === "Games" && "games" in sort) {
				for (const experience of sort.games) {
					experiences.push(experience);
				}
			}
		}

		if (!data.nextSortsPageToken) {
			break;
		}
		cursor = data.nextSortsPageToken;
	}

	experiences = shuffleArray(experiences);

	const checkedIPsThisSession = new Set<string>();
	const discoveredRCCChannelNames = new Set<string>();

	let requestCount = 0;
	let receivedCount = 0;
	let totalPlaying = 0;

	setInterval(() => {
		interval?.({
			dataCenters,
			requestCount,
			receivedCount,
			totalPlaying,
		});
	}, 10_000);

	for (const experience of experiences) {
		let cursor: string | undefined;

		while (true) {
			const data = await listPublicServers(
				{
					placeId: experience.rootPlaceId,
					cursor,
					limit: 100,
					excludeFulLGames: true,
				},
				robloxCookies[usedRobloxCookieIndex],
			);

			for (const server of data.data) {
				requestCount++;
				totalPlaying += server.playing;

				getGameServerJoinData(
					{
						placeId: experience.rootPlaceId,
						gameId: server.id,
					},
					robloxCookies[usedRobloxCookieIndex],
					privateAccessCookie,
				).then((data) => {
					receivedCount++;

					if (data) {
						const rccChannelName = data.rcc.channelName;
						if (
							rccChannelName !== "LIVE" &&
							!discoveredRCCChannelNames.has(rccChannelName)
						) {
							discoveredRCCChannelNames.add(rccChannelName);
							console.log(
								`${experience.name} (${experience.universeId})`,
								requestCount,
								receivedCount,
								server.id,
								data.rcc.version,
								rccChannelName,
							);
						}

						if (!checkedIPsThisSession.has(data.connection.address)) {
							checkedIPsThisSession.add(data.connection.address);

							getIpInfo(
								{
									ip: data.connection.address,
								},
								ipInfoAccessToken,
							).then((ipInfo) => {
								if ("bogon" in ipInfo) {
									return;
								}

								const latLong = ipInfo.loc.split(",") as [string, string];
								/*if (!data.connection.address.startsWith("128.116.")) {
									console.log(server.id, experience.rootPlaceId);
								}*/

								// remove last number of ip
								const internalIPPrefix = data.internalConnection?.address
									.split(".")
									.slice(0, 2)
									.concat("")
									.join(".");
								for (const item of dataCenters) {
									const includesDataCenterId =
										item.dataCenterId === data.datacenter.id;
									const includesIP = item.ips.includes(data.connection.address);
									const includesInternalIPPrefix = internalIPPrefix
										? item.internalIps.includes(internalIPPrefix)
										: undefined;

									if (includesDataCenterId) {
										if (!includesIP) item.ips.push(data.connection.address);
										if (!includesInternalIPPrefix && internalIPPrefix)
											item.internalIps.push(internalIPPrefix);

										let otherIPChecked = false;

										for (const otherIP of item.ips) {
											if (
												otherIP !== data.connection.address &&
												!checkedIPsThisSession.has(otherIP)
											) {
												otherIPChecked = true;
												break;
											}
										}

										if (
											item.location.country !== ipInfo.country ||
											item.location.region !== ipInfo.region ||
											item.location.city !== ipInfo.city ||
											item.location.latLong[0] !== latLong[0] ||
											item.location.latLong[1] !== latLong[1]
										) {
											console.log(
												"Data center id",
												item.dataCenterId,
												"changed location",
												otherIPChecked,
											);

											item.location = {
												city: ipInfo.city,
												region: ipInfo.region,
												country: ipInfo.country,
												latLong,
											};
										}

										return;
									}
								}

								// no data center found
								dataCenters.push({
									dataCenterId: data.datacenter.id,
									location: {
										city: ipInfo.city,
										region: ipInfo.region,
										country: ipInfo.country,
										latLong,
									},
									ips: [data.connection.address],
									internalIps: internalIPPrefix ? [internalIPPrefix] : [],
								});
							});
						}
					}
				});
			}

			if (!data.nextPageCursor) {
				break;
			}
			cursor = data.nextPageCursor;
			usedRobloxCookieIndex++;
		}

		if (usedRobloxCookieIndex >= robloxCookies.length) {
			usedRobloxCookieIndex = 0;
		}
	}
}

if (import.meta.main) {
	const ipInfoAccessToken = import.meta.env[IPINFO_ACCESS_TOKEN_ENV_KEY];
	const privateAccessCookieRaw = import.meta.env[PRIVATE_ACCESS_COOKIE_ENV_KEY];
	const privateAccessCookie = privateAccessCookieRaw
		? `.ROBLOSECURITY=${privateAccessCookieRaw}`
		: undefined;

	if (!ipInfoAccessToken) {
		throw new Error(
			`"${IPINFO_ACCESS_TOKEN_ENV_KEY}" is not defined in the environment variables.`,
		);
	}

	const robloxCookies: string[] = [];
	for (const key in import.meta.env) {
		if (key.startsWith(ROBLOX_SECURITY_TOKENS_ENV_PREFIX)) {
			// @ts-expect-error: nuh uh
			robloxCookies.push(`.ROBLOSECURITY=${import.meta.env[key]}`);
		}
	}

	if (!robloxCookies.length) {
		throw new Error(
			`You must define at least 1 environment variable that is prefixed with "${ROBLOX_SECURITY_TOKENS_ENV_PREFIX}"`,
		);
	}

	const dataCenters = await Bun.file("./data/datacenters.json")
		.json()
		.catch(() => []);

	while (true) {
		console.log("Running again...");
		await run({
			robloxCookies,
			privateAccessCookie,
			ipInfoAccessToken,
			dataCenters,
			interval: async ({
				dataCenters,
				requestCount,
				receivedCount,
				totalPlaying,
			}) => {
				console.log(
					"Requested:",
					requestCount,
					"Received:",
					receivedCount,
					"Total players",
					totalPlaying,
					"Memory usage:",
					`${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`,
				);

				const dataCentersGroupData: DataCenterGroupData[] = [];
				for (const dataCenter of dataCenters) {
					const locationMatch = dataCentersGroupData.find((dataCenter2) => {
						const diffLat = Math.abs(
							Number.parseFloat(dataCenter2.location.latLong[0]) -
								Number.parseFloat(dataCenter.location.latLong[0]),
						);
						const diffLong = Math.abs(
							Number.parseFloat(dataCenter2.location.latLong[1]) -
								Number.parseFloat(dataCenter.location.latLong[1]),
						);

						return diffLat < 2 && diffLong < 2;
					});

					if (locationMatch) {
						locationMatch.dataCenterIds.push(dataCenter.dataCenterId);
					} else {
						dataCentersGroupData.push({
							dataCenterIds: [dataCenter.dataCenterId],
							location:
								CITY_TO_NEW_LOCATION[dataCenter.location.city] ||
								dataCenter.location,
						});
					}
				}

				for (const item of dataCentersGroupData) {
					item.dataCenterIds.sort((a, b) => a - b);
				}

				dataCentersGroupData.sort(
					(a, b) => a.dataCenterIds[0] - b.dataCenterIds[0],
				);

				await Bun.write(
					"data/datacenters.json",
					JSON.stringify(dataCenters, null, 4),
				);
				await Bun.write(
					"data/grouped_datacenters.json",
					JSON.stringify(dataCentersGroupData, null, 4),
				);

				await Bun.$`git add data/grouped_datacenters.json && git commit --message ${Date.now()} && git push`.catch(
					() => {},
				);
			},
		});
	}
}
