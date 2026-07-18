import { z } from "zod";

import { eventNameSchema } from "./events.js";

const strictDateSchema = z.preprocess((value) => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return value;
}, z.date());

export const normalizedEventSchema = z.object({
  eventTimestamp: strictDateSchema,
  receivedAt: strictDateSchema,
  eventName: eventNameSchema,
  guildId: z.string().min(1).nullable(),
  actorId: z.string().min(1).nullable(),
  channelId: z.string().min(1).nullable(),
  messageId: z.string().min(1).nullable(),
  payload: z.record(z.string(), z.unknown())
});

export type NormalizedEvent = z.infer<typeof normalizedEventSchema>;
