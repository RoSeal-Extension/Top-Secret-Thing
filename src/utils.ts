import { ROBLOX_USER_AGENT } from "./constants";

type InternalServerJoinData = {
	jobId: string;
	status: number;
	statusData?: {
		creatorExperienceBan?: {
			startTime: string;
			durationSeconds: number;
			displayReason: string;
			displayReasonTextFilterStatus: 1 | 2 | 3;
			isInherited: boolean;
		};
	};
	joinScriptUrl: string;
	authenticationUrl: string;
	authenticationTicket: string;
	message: string;
	joinScript?: {
		ClientPort: number;
		MachineAddress: string;
		ServerPort: number;
		ServerConnections: {
			Address: string;
			Port: number;
		}[];
		UdmuxEndpoints?: {
			Address: string;
			Port: number;
		}[];
		DirectServerReturn: boolean;
		TokenGenAlgorithm: number;
		PepperId: number;
		TokenValue: string;
		PingUrl: string;
		PingInterval: number;
		UserName: string;
		DisplayName: string;
		HasVerifiedBadge: boolean;
		SeleniumTestMode: boolean;
		UserId: number;
		RobloxLocale: string;
		GameLocale: string;
		SuperSafeChat: boolean;
		FlexibleChatEnabled: boolean;
		CharacterAppearance: string;
		ClientTicket: string;
		GameId: string;
		PlaceId: number;
		BaseUrl: string;
		ChatStyle: string;
		CreatorId: number;
		CreatorTypeEnum: string;
		MembershipType: string;
		AccountAge: number;
		CookieStoreFirstTimePlayKey: string;
		CookieStoreFiveMinutePlayKey: string;
		CookieStoreEnabled: boolean;
		IsUnknownOrUnder13: boolean;
		GameChatType: string;
		WhoCanWhisperChatWithMeInExperiences: string;
		SessionId: string;
		AnalyticsSessionId: string;
		DataCenterId: number;
		UniverseId: number;
		FollowUserId: number;
		characterAppearanceId: number;
		CountryCode: string;
		AlternateName: string;
		RandomSeed1: string;
		ClientPublicKeyData: string;
		RccVersion: string;
		ChannelName: string;
		VerifiedAMP: number;
		PrivateServerOwnerID: number;
		PrivateServerID: string;
		EventId: string;
		EphemeralEarlyPubKey: string;
		PartyId: string;
		ShowRobloxTranslations?: boolean;
		MatchmakingAttributes?: string;
		TranslationDisplayMode?: string;
		PlaceVersion?: number;
		NetStackPort?: number;
		NetStackConfig?: string;
		NetStackTokenValue?: string;
	};
	queuePosition: number;
};

type GetGameServerJoinDataRequest = {
	placeId: number;
	gameId: string;
};

export type MinimalServerJoinData = {
	success: boolean;
	statusCode: number;
	status?: string;
	queuePosition?: number;
	data?: {
		connection: {
			address: string;
			port: number;
			isUdmuxProtected: boolean;
		};
		internalConnection?: {
			address: string;
			port: number;
		};
		datacenter: {
			id: number;
		};
		rcc: {
			version: string;
			isPrivateChannel: boolean;
			channelName: string;
		};
	};
};

export async function getGameServerJoinData(
	request: GetGameServerJoinDataRequest,
	cookie: string,
	privateAccessCookie?: string,
): Promise<MinimalServerJoinData | null> {
	let isPrivateRetry = false;

	let attempts = 0;
	while (true) {
		attempts++;
		if (attempts > 10) {
			console.log(request);
		}

		try {
			const res = await fetch(
				"https://gamejoin.roblox.com/v1/join-game-instance",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						cookie:
							isPrivateRetry && privateAccessCookie
								? privateAccessCookie
								: cookie,
						"user-agent": ROBLOX_USER_AGENT,
					},
					body: JSON.stringify(request),
				},
			);

			if (!res.ok) {
				await Bun.sleep(10_000);
				continue;
			}

			const data = (await res.json()) as InternalServerJoinData;
			const { joinScript, status, message, queuePosition } = data;

			if (status === 19 && privateAccessCookie) {
				isPrivateRetry = true;
				continue;
			}

			if (!joinScript) {
				return {
					success: false,
					statusCode: status,
					status: message,
					queuePosition,
				};
			}

			const connection =
				joinScript.UdmuxEndpoints?.[0] ?? joinScript.ServerConnections?.[0];
			const internalConnection = joinScript.ServerConnections?.[0];

			if (joinScript.NetStackConfig) {
				console.log(
					joinScript.NetStackConfig,
					joinScript.NetStackPort,
					joinScript.NetStackTokenValue,
				);
			}
			return {
				success: true,
				statusCode: status,
				status: message,
				queuePosition,
				data: {
					connection: {
						address: connection.Address,
						port: connection.Port,
						isUdmuxProtected: !!joinScript.UdmuxEndpoints?.length,
					},
					internalConnection: internalConnection && {
						address: internalConnection.Address,
						port: internalConnection.Port,
					},
					datacenter: {
						id: joinScript.DataCenterId,
					},
					rcc: {
						version: joinScript.RccVersion,
						isPrivateChannel: isPrivateRetry,
						channelName: joinScript.ChannelName || "LIVE",
					},
				},
			};
		} catch (err) {
			console.error("getGameServerJoinData Error: ", err);
		}
	}
}

type GetIpInfoRequest = {
	ip: string;
};

export type GetIpInfoResponse =
	| {
			city: string;
			region: string;
			country: string;
			loc: string;
	  }
	| {
			ip: string;
			bogon: boolean;
	  };

const cachedIpInfoData: Record<string, GetIpInfoResponse> = {
	"128.116.86.33": {
		city: "São Paulo",
		region: "São Paulo",
		country: "BR",
		loc: "-23.5505,-46.6333",
	},
	"128.116.46.33": {
		city: "Singapore",
		region: "Singapore",
		country: "SP",
		loc: "1.2897,103.8501",
	},
};

export function getIpInfo(
	{ ip }: GetIpInfoRequest,
	accessToken: string,
): Promise<GetIpInfoResponse> {
	if (cachedIpInfoData[ip]) {
		return Promise.resolve(cachedIpInfoData[ip]);
	}
	return fetch(`https://ipinfo.io/${ip}/json`, {
		headers: {
			authorization: `Bearer ${accessToken}`,
		},
	}).then((res) => res.json());
}

type ListPublicServersRequest = {
	placeId: number;
	limit?: number;
	sortOrder?: "Asc" | "Desc";
	cursor?: string;
	excludeFulLGames?: boolean;
};

export type PublicServerData = {
	id: string;
	maxPlayers: number;
	playing: number;
	playerTokens: string[];
	players: unknown[];
	fps: number;
	ping: number;
};

type ListPublicServersResponse = {
	previousPageCursor: string | null;
	nextPageCursor: string | null;
	data: PublicServerData[];
};

export async function listPublicServers(
	{ placeId, ...search }: ListPublicServersRequest,
	cookie: string,
): Promise<ListPublicServersResponse> {
	const url = new URL(
		`https://games.roblox.com/v1/games/${placeId}/servers/Public`,
	);
	url.search = new URLSearchParams(
		filterObject(search) as Record<string, string>,
	).toString();

	let requestCount = 0;
	while (true) {
		if (requestCount >= 20) {
			await Bun.sleep(requestCount * 500);
		}

		try {
			const res = await fetch(url.toString(), {
				headers: {
					cookie,
					"user-agent": ROBLOX_USER_AGENT,
				},
			});

			if (res.ok) {
				return res.json();
			} else {
				console.log("listPublicServers: ", res.status);
			}

			requestCount++;
		} catch (err) {
			console.error("listPublicServers Error:", err);
		}
	}
}

type ListExperienceSortsRequest = {
	sessionId: string;
	sortsPageToken?: string;
};

export type ListedExperience = {
	ageRecommendationDisplayName: string;
	isSponsored: boolean;
	minimumAge: number;
	name: string;
	nativeAdData: string;
	playerCount: number;
	rootPlaceId: number;
	totalDownVotes: number;
	totalUpVotes: number;
	universeId: number;
};

type ListExperienceSortsResponse = {
	nextSortsPageToken: string | null;
	sorts: (
		| {
				contentType: "Filters";
		  }
		| {
				appliedFilters: string;
				contentType: "Games";
				gameSetTargetId: number;
				gameSetTypeId: number;
				games: ListedExperience[];
				primarySortId: number;
				secondarySortId: number;
				sortDisplayName: string;
				sortId: string;
				topicLayoutData: Record<string, unknown>;
				treatmentType: string;
		  }
	)[];
};

export function listExperienceSorts(
	request: ListExperienceSortsRequest,
	cookie: string,
): Promise<ListExperienceSortsResponse> {
	const url = new URL("https://apis.roblox.com/explore-api/v1/get-sorts");
	url.search = new URLSearchParams(
		filterObject(request as Record<string, string>),
	).toString();

	return fetch(url.toString(), {
		headers: {
			"user-agent": ROBLOX_USER_AGENT,
			cookie,
		},
	}).then((res) => res.json());
}

type FilterObject<T extends Record<string, unknown>> = {
	[key in keyof T]: T[key] extends null | undefined ? never : T[key];
};

export function filterObject<T extends Record<string, unknown>>(
	obj: T,
): FilterObject<T> {
	const newObj = {} as FilterObject<T>;
	for (const key in obj) {
		if (obj[key] !== null && obj[key] !== undefined) {
			// @ts-expect-error: fine
			newObj[key] = obj[key];
		}
	}

	return newObj;
}

export function shuffleArray<T extends unknown[]>(array: T): T {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}
