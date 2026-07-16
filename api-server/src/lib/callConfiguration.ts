export type IceServerConfiguration = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

function parseConfiguredUrls(...values: Array<string | undefined>): string[] {
  return [...new Set(values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean))];
}

export function getCallConfiguration() {
  const stunUrls = parseConfiguredUrls(process.env.STUN_URLS, process.env.STUN_URL);
  const turnUrls = parseConfiguredUrls(process.env.TURN_URLS, process.env.TURN_URL);
  const username = String(process.env.TURN_USERNAME || "").trim();
  const credential = String(process.env.TURN_CREDENTIAL || "").trim();
  const hasTurnCredentials = Boolean(username && credential);
  const validTurnUrls = turnUrls.length > 0 && turnUrls.every((url) => /^turns?:/i.test(url));
  const validStunUrls = stunUrls.every((url) => /^stuns?:/i.test(url));
  const iceServers: IceServerConfiguration[] = [];

  if (stunUrls.length) iceServers.push({ urls: stunUrls });
  if (turnUrls.length) {
    iceServers.push({
      urls: turnUrls,
      ...(hasTurnCredentials ? { username, credential } : {}),
    });
  }

  const productionReady = validTurnUrls && hasTurnCredentials;
  return {
    provider: process.env.CALL_PROVIDER || (productionReady ? "webrtc-turn" : stunUrls.length ? "webrtc-stun" : "audio-fallback"),
    iceServers,
    hasStun: stunUrls.length > 0,
    hasTurn: turnUrls.length > 0,
    hasTurnCredentials,
    validStunUrls,
    validTurnUrls,
    productionReady,
    warning: productionReady
      ? null
      : "Production voice calling requires valid TURN_URLS plus TURN_USERNAME and TURN_CREDENTIAL.",
  };
}

export function getCallConfigurationStatus() {
  const configuration = getCallConfiguration();
  return {
    provider: configuration.provider,
    hasStun: configuration.hasStun,
    hasTurn: configuration.hasTurn,
    hasTurnCredentials: configuration.hasTurnCredentials,
    validStunUrls: configuration.validStunUrls,
    validTurnUrls: configuration.validTurnUrls,
    productionReady: configuration.productionReady,
    warning: configuration.warning,
  };
}
