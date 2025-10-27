import type { DataCenterLocation } from ".";

export const ROBLOX_SECURITY_TOKENS_ENV_PREFIX = "ROBLOX_SECURITY_TOKENS_";
export const IPINFO_ACCESS_TOKEN_ENV_KEY = "IPINFO_ACCESS_TOKEN";
export const PRIVATE_ACCESS_COOKIE_ENV_KEY =
	"ROBLOX_PRIVATE_ACCESS_SECURITY_TOKEN";

export const ROBLOX_USER_AGENT =
	"Roblox/WinInet RobloxApp/0.696.0.6960797 (GlobalDist; RobloxDirectDownload) RoSealExtension (RoSeal/chrome/2.1.23/dev)";

export const CITY_TO_NEW_LOCATION: Record<string, DataCenterLocation> = {
	Secaucus: {
		city: "New York City",
		region: "New York",
		country: "US",
		latLong: ["40.7128", "-74.0060"],
	},
	"Frankfurt am Main": {
		city: "Frankfurt",
		region: "Hesse",
		country: "DE",
		latLong: ["50.1155", "8.6842"],
	},
};

export const ROBLOX_IP_ADDRESS_PREFIX = "128.116.";
