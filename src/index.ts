import {
	CITY_TO_NEW_LOCATION,
	IPINFO_ACCESS_TOKEN_ENV_KEY,
	PRIVATE_ACCESS_COOKIE_ENV_KEY,
	ROBLOX_SECURITY_TOKENS_ENV_PREFIX,
} from "./constants";
import {
	getGameServerJoinData,
	getIpInfo,
	type ListedExperience,
	listExperienceSorts,
	listPublicServers,
	shuffleArray,
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

export type StatusMessage = {
	statusCode: number;
	status?: string;
};

type RunIntervalData = {
	requestCount: number;
	receivedCount: number;
	totalPlaying: number;
	dataCenters: DataCenterData[];
	rccChannelNames?: string[];
	statusMessages?: StatusMessage[];
};

type RunProps = {
	robloxCookies: string[];
	privateAccessCookie?: string;
	ipInfoAccessToken: string;
	dataCenters: DataCenterData[];
	rccChannelNames?: string[];
	statusMessages?: StatusMessage[];
	interval?: (data: RunIntervalData) => void;
};

export default async function run({
	robloxCookies,
	privateAccessCookie,
	ipInfoAccessToken,
	dataCenters,
	rccChannelNames,
	statusMessages,
	interval,
}: RunProps) {
	let usedRobloxCookieIndex = 0;

	const experiences: ListedExperience[] = [];
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
	shuffleArray(experiences);

	const checkedIPsThisSession = new Set<string>();

	let requestCount = 0;
	let receivedCount = 0;
	let totalPlaying = 0;

	setInterval(() => {
		interval?.({
			dataCenters,
			requestCount,
			receivedCount,
			totalPlaying,
			rccChannelNames,
			statusMessages,
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
				).then(async (data) => {
					receivedCount++;

					if (!data) return;

					if (data?.data) {
						if (rccChannelNames) {
							const channelName = data.data?.rcc.channelName;
							if (
								channelName &&
								channelName !== "LIVE" &&
								!rccChannelNames.includes(channelName)
							) {
								rccChannelNames.push(channelName);
							}
						}

						const dataCenter = dataCenters.find(
							(dataCenter) =>
								dataCenter.dataCenterId === data.data?.datacenter.id,
						);

						const internalIPPrefix = data.data.internalConnection?.address
							.split(".")
							.slice(0, 2)
							.concat("")
							.join(".");
						const ipAddress = data.data.connection.address;
						if (dataCenter) {
							if (!dataCenter.ips.includes(ipAddress)) {
								dataCenter.ips.push(ipAddress);
							}
							if (
								internalIPPrefix &&
								!dataCenter.internalIps.includes(internalIPPrefix)
							) {
								dataCenter.internalIps.push(internalIPPrefix);
							}

							let hasCheckedThisSession = false;
							for (const ip of dataCenter.ips) {
								if (checkedIPsThisSession.has(ip)) {
									hasCheckedThisSession = true;
									break;
								}
							}

							if (!hasCheckedThisSession) {
								const ipInfo = await getIpInfo(
									{
										ip: ipAddress,
									},
									ipInfoAccessToken,
								);

								if ("bogon" in ipInfo) return;

								const latLong = ipInfo.loc.split(",") as [string, string];

								if (
									dataCenter.location.country !== ipInfo.country ||
									dataCenter.location.region !== ipInfo.region ||
									dataCenter.location.city !== ipInfo.city ||
									dataCenter.location.latLong[0] !== latLong[0] ||
									dataCenter.location.latLong[1] !== latLong[1]
								) {
									dataCenter.location = {
										city: ipInfo.city,
										region: ipInfo.region,
										country: ipInfo.country,
										latLong,
									};
								}
							}
						} else {
							// no data center found
							const ipInfo = await getIpInfo(
								{
									ip: ipAddress,
								},
								ipInfoAccessToken,
							);

							if ("bogon" in ipInfo) return;

							const latLong = ipInfo.loc.split(",") as [string, string];

							// no data center found
							dataCenters.push({
								dataCenterId: data.data.datacenter.id,
								location: {
									city: ipInfo.city,
									region: ipInfo.region,
									country: ipInfo.country,
									latLong,
								},
								ips: [data.data.connection.address],
								internalIps: internalIPPrefix ? [internalIPPrefix] : [],
							});
						}
					} else if (statusMessages) {
						for (const item of statusMessages) {
							if (
								item.status === data.status &&
								item.statusCode === data.statusCode
							) {
								return;
							}
						}

						statusMessages.push({
							statusCode: data.statusCode,
							status: data.status,
						});
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
		.catch((err) => {
			if (err.code === "ENOENT") return [];

			throw err;
		});
	const statusMessages = await Bun.file("./data/status_messages.json")
		.json()
		.catch((err) => {
			if (err.code === "ENOENT") return [];

			throw err;
		});
	const rccChannelNames = await Bun.file("./data/channel_names.json")
		.json()
		.catch((err) => {
			if (err.code === "ENOENT") return [];

			throw err;
		});

	while (true) {
		console.info("Running again...");
		await run({
			robloxCookies,
			privateAccessCookie,
			ipInfoAccessToken,
			dataCenters,
			statusMessages,
			rccChannelNames,
			interval: async ({
				dataCenters,
				requestCount,
				receivedCount,
				totalPlaying,
				rccChannelNames,
				statusMessages,
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
					rccChannelNames,
					statusMessages,
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

				await Promise.all([
					Bun.write(
						"data/datacenters.json",
						JSON.stringify(dataCenters, null, 4),
					),
					Bun.write(
						"data/grouped_datacenters.json",
						JSON.stringify(dataCentersGroupData, null, 4),
					),
					statusMessages &&
						Bun.write(
							"data/status_messages.json",
							JSON.stringify(statusMessages, null, 4),
						),
					rccChannelNames &&
						Bun.write(
							"data/channel_names.json",
							JSON.stringify(rccChannelNames, null, 4),
						),
				]);

				await Bun.$`git add data/grouped_datacenters.json && git commit --message ${Date.now()} && git push`
					.quiet()
					.catch(() => {});
			},
		});
	}
}
