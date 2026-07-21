import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, type AnyThreadChannel } from "discord.js";

import {
  normalizeThreadCreate,
  normalizeThreadDelete,
  normalizeThreadUpdate
} from "./thread-events.js";
import { correlateWithAuditLog } from "./audit-log.js";
import { writeSafely } from "./write-safely.js";

export interface ThreadLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface ThreadLogHandlers {
  onThreadCreate: (thread: AnyThreadChannel, newlyCreated: boolean) => Promise<void>;
  onThreadDelete: (thread: AnyThreadChannel) => Promise<void>;
  onThreadUpdate: (oldThread: AnyThreadChannel, newThread: AnyThreadChannel) => Promise<void>;
}

export function createThreadLogHandlers(deps: ThreadLogHandlerDeps): ThreadLogHandlers {
  return {
    async onThreadCreate(thread, newlyCreated) {
      // discord.jsのthreadCreateは新規作成時だけでなく、既存スレッドへの
      // アクセス同期(botが権限追加等で見えるようになった場合)でも発火するため、
      // 実際に作成された場合のみthread.createとして記録する。
      if (!newlyCreated) {
        return;
      }
      const event = normalizeThreadCreate(thread, newlyCreated);
      const correlated = await correlateWithAuditLog(
        event,
        thread.guild,
        AuditLogEvent.ThreadCreate,
        thread.id
      );
      await writeSafely(deps, correlated, "thread-log-handlers");
    },

    async onThreadDelete(thread) {
      const event = normalizeThreadDelete(thread);
      const correlated = await correlateWithAuditLog(
        event,
        thread.guild,
        AuditLogEvent.ThreadDelete,
        thread.id
      );
      await writeSafely(deps, correlated, "thread-log-handlers");
    },

    async onThreadUpdate(oldThread, newThread) {
      const event = normalizeThreadUpdate(oldThread, newThread);
      if (!event) {
        return;
      }
      const correlated = await correlateWithAuditLog(
        event,
        newThread.guild,
        AuditLogEvent.ThreadUpdate,
        newThread.id
      );
      await writeSafely(deps, correlated, "thread-log-handlers");
    }
  };
}
