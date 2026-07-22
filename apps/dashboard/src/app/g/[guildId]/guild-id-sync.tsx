"use client";

import { useEffect } from "react";

import { setCurrentGuildId } from "../../../guild-context";

export function GuildIdSync({ guildId }: { guildId: string }) {
  useEffect(() => {
    setCurrentGuildId(guildId);
    return () => setCurrentGuildId(null);
  }, [guildId]);

  return null;
}
