interface ImportMeta {
	main: boolean;
	env: {
		[
			key: `${typeof import("../constants").ROBLOX_SECURITY_TOKENS_ENV_PREFIX}${number}`
		]: string;
		IPINFO_ACCESS_TOKEN: string;
	};
}
