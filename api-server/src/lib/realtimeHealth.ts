export type RealtimeCapability = {
  websocketEvents: boolean;
  websocketCalls: boolean;
  httpAudioFallback: boolean;
  turnRequiredForProduction: boolean;
};

export function getRealtimeCapability(): RealtimeCapability {
  return {
    websocketEvents: true,
    websocketCalls: true,
    httpAudioFallback: true,
    turnRequiredForProduction: !process.env.TURN_URLS,
  };
}
