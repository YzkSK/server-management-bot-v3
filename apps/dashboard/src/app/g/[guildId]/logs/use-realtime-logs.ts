"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import {
  REALTIME_LOGS_ERROR,
  REALTIME_LOGS_EVENT,
  REALTIME_LOGS_SUBSCRIBE,
  REALTIME_LOGS_SUBSCRIBED,
  REALTIME_LOGS_UNSUBSCRIBE,
  type RealtimeLogEventPayload
} from "@sm-bot/shared";

import type { LogEntryData } from "./logs-view";
import { nextConnectionStatus, type RealtimeConnectionStatus } from "./realtime-connection-status";
import {
  applyIncomingRealtimeLogs,
  createInitialRealtimeLogBufferState,
  setRealtimeLogsPaused,
  type RealtimeLogBufferState
} from "./realtime-log-buffer";

function toLogEntryData(payload: RealtimeLogEventPayload): LogEntryData {
  return payload;
}

export function useRealtimeLogs(guildId: string) {
  const [status, setStatus] = useState<RealtimeConnectionStatus>("idle");
  const [buffer, setBuffer] = useState<RealtimeLogBufferState>(createInitialRealtimeLogBufferState);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    setBuffer(createInitialRealtimeLogBufferState());
    setStatus("idle");
  }, [guildId]);

  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    setStatus((s) => nextConnectionStatus(s, "subscribe"));
    socket.on("connect", () => {
      setStatus((s) => nextConnectionStatus(s, "connect"));
      socket.emit(REALTIME_LOGS_SUBSCRIBE, { guildId });
    });
    socket.on(REALTIME_LOGS_SUBSCRIBED, () => {
      setStatus((s) => nextConnectionStatus(s, "subscribed"));
    });
    socket.on(REALTIME_LOGS_EVENT, (payload: RealtimeLogEventPayload) => {
      setStatus((s) => nextConnectionStatus(s, "subscribed"));
      setBuffer((b) => applyIncomingRealtimeLogs(b, [toLogEntryData(payload)]));
    });
    socket.on(REALTIME_LOGS_ERROR, () => {
      setStatus((s) => nextConnectionStatus(s, "error"));
    });
    socket.on("disconnect", () => {
      setStatus((s) => nextConnectionStatus(s, "disconnect"));
    });
    socket.on("connect_error", () => {
      setStatus((s) => nextConnectionStatus(s, "error"));
    });

    return () => {
      socket.emit(REALTIME_LOGS_UNSUBSCRIBE);
      socket.close();
      socketRef.current = null;
    };
  }, [guildId]);

  const setPaused = useMemo(
    () => (paused: boolean) => setBuffer((b) => setRealtimeLogsPaused(b, paused)),
    []
  );

  return {
    status,
    displayed: buffer.displayed,
    pendingCount: buffer.pending.length,
    setPaused
  };
}
