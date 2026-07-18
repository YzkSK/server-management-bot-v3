import { z } from "zod";

export const normalizedEventSchema = z.object({
  eventTimestamp: z.coerce.date(),
  receivedAt: z.coerce.date(),
  eventName: z.string().min(1),
  guildId: z.string().min(1).nullable(),
  actorId: z.string().min(1).nullable(),
  channelId: z.string().min(1).nullable(),
  messageId: z.string().min(1).nullable(),
  payload: z.record(z.string(), z.unknown())
});

export type NormalizedEvent = z.infer<typeof normalizedEventSchema>;
