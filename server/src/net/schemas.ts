// Kiểm tra mọi gói client → server (spec mục 11). Gói sai schema bị bỏ qua.
import { z } from 'zod';
import { ACTIVITY_IDS, ANIM_IDS, EMOTE_IDS } from '@shared/index';

export const joinSchema = z.object({
  key: z.string().max(64).nullable(),
  name: z.string().max(80),
  room: z.string().max(16).nullable(),
  create: z.boolean(),
});

export const poseSchema = z.object({
  x: z.number(),
  z: z.number(),
  ry: z.number(),
  anim: z.enum(ANIM_IDS),
});

export const emoteSchema = z.enum(EMOTE_IDS);
export const stationIdSchema = z.string().min(1).max(64);
export const pidSchema = z.string().min(1).max(32);
export const chatSchema = z.string().max(600);

export const actSchema = z.object({
  a: z.enum(ACTIVITY_IDS),
  type: z.string().min(1).max(32),
  data: z.unknown().optional(),
});

export const hostSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('gift'), target: pidSchema, amount: z.number().int() }),
  z.object({ type: z.literal('punish'), target: pidSchema }),
  z.object({ type: z.literal('go_bar') }),
  z.object({ type: z.literal('go_temple') }),
  z.object({
    type: z.literal('activity'),
    a: z.enum(ACTIVITY_IDS),
    action: z.string().min(1).max(32),
    data: z.unknown().optional(),
  }),
]);
