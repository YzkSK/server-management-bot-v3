export type RealtimeConnectionStatus = "idle" | "connecting" | "live" | "offline" | "error";
export type RealtimeConnectionEvent = "subscribe" | "connect" | "subscribed" | "disconnect" | "error";

export function nextConnectionStatus(
  current: RealtimeConnectionStatus,
  event: RealtimeConnectionEvent
): RealtimeConnectionStatus {
  if (event === "error") {
    return "error";
  }

  switch (event) {
    case "subscribe":
      return "connecting";
    case "connect":
      return current === "live" ? "live" : "connecting";
    case "subscribed":
      return "live";
    case "disconnect":
      return "offline";
    default:
      return current;
  }
}
