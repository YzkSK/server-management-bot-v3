import type { NormalizedEvent } from "@sm-bot/shared";
import {
  PermissionFlagsBits,
  type AuditLogEvent,
  type Guild,
  type GuildAuditLogsEntry
} from "discord.js";

import { userPayload } from "./payloads.js";

const AUDIT_LOG_LOOKUP_WINDOW_MS = 30_000;
const AUDIT_LOG_FETCH_LIMIT = 100;
const AUDIT_LOG_RETRY_ATTEMPTS = 2;
const AUDIT_LOG_RETRY_DELAY_MS = 300;

export interface AuditLogLookupResult {
  status: "matched" | "not_found" | "missing_permission" | "missing_guild" | "error";
  actorId: string | null;
  reason: string | null;
  payload: Record<string, unknown>;
}

export interface AuditLogLookupOptions {
  /** 監査ログがまだ反映されていない場合の追加試行回数。初回を含まない。 */
  retries?: number;
  retryDelayMs?: number;
  /** マッチ判定の基準時刻。イベント発生時刻を渡すことで、処理遅延やイベント多発時の誤相関を防ぐ。既定は呼び出し時刻。 */
  referenceTime?: Date;
}

export async function lookupAuditLog(
  guild: Guild | null,
  action: AuditLogEvent,
  targetId: string,
  options: AuditLogLookupOptions = {}
): Promise<AuditLogLookupResult> {
  if (!guild) {
    return {
      status: "missing_guild",
      actorId: null,
      reason: null,
      payload: { status: "missing_guild", action, targetId }
    };
  }

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));

  if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
    return {
      status: "missing_permission",
      actorId: null,
      reason: null,
      payload: {
        status: "missing_permission",
        action,
        targetId,
        requiredPermission: "ViewAuditLog"
      }
    };
  }

  const retries = options.retries ?? AUDIT_LOG_RETRY_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? AUDIT_LOG_RETRY_DELAY_MS;
  const referenceTimestamp = (options.referenceTime ?? new Date()).getTime();

  try {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const logs = await guild.fetchAuditLogs({ type: action, limit: AUDIT_LOG_FETCH_LIMIT });
      const entry = findClosestMatchingAuditLogEntry(
        logs.entries.values(),
        action,
        targetId,
        referenceTimestamp
      );

      if (entry) {
        return {
          status: "matched",
          actorId: entry.executorId,
          reason: entry.reason,
          payload: {
            status: "matched",
            id: entry.id,
            action: entry.action,
            targetId: entry.targetId,
            executorId: entry.executorId,
            executor: entry.executor ? userPayload(entry.executor) : null,
            reason: entry.reason,
            createdAt: entry.createdAt.toISOString()
          }
        };
      }

      if (attempt < retries) {
        await sleep(retryDelayMs);
      }
    }

    return {
      status: "not_found",
      actorId: null,
      reason: null,
      payload: { status: "not_found", action, targetId }
    };
  } catch (error: unknown) {
    return {
      status: "error",
      actorId: null,
      reason: null,
      payload: {
        status: "error",
        action,
        targetId,
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function applyAuditLog(
  event: NormalizedEvent,
  auditLog: AuditLogLookupResult
): NormalizedEvent {
  return {
    ...event,
    actorId: auditLog.actorId ?? event.actorId,
    payload: {
      ...event.payload,
      auditLog: auditLog.payload
    }
  };
}

function findClosestMatchingAuditLogEntry(
  entries: Iterable<GuildAuditLogsEntry>,
  action: AuditLogEvent,
  targetId: string,
  referenceTimestamp: number
): GuildAuditLogsEntry | null {
  let closest: GuildAuditLogsEntry | null = null;
  let closestDelta = Infinity;

  for (const entry of entries) {
    if (!isMatchingAuditLogEntry(entry, action, targetId, referenceTimestamp)) {
      continue;
    }

    const delta = Math.abs(referenceTimestamp - entry.createdTimestamp);

    if (delta < closestDelta) {
      closest = entry;
      closestDelta = delta;
    }
  }

  return closest;
}

function isMatchingAuditLogEntry(
  entry: GuildAuditLogsEntry,
  action: AuditLogEvent,
  targetId: string,
  referenceTimestamp: number
): boolean {
  if (entry.action !== action) {
    return false;
  }

  if (Math.abs(referenceTimestamp - entry.createdTimestamp) > AUDIT_LOG_LOOKUP_WINDOW_MS) {
    return false;
  }

  return entry.targetId === targetId || getObjectId(entry.target) === targetId;
}

function getObjectId(value: unknown): string | null {
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id: unknown }).id;
    return typeof id === "string" ? id : null;
  }

  return null;
}
