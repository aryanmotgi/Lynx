import { z } from "zod";

export { db, withTenant } from "./db";

export const DispatchRequest = z.object({
  company_id: z.string().uuid(),
  goal: z.string().min(1),
  start_url: z.string().url().optional(),
  identity_id: z.string().uuid().optional(),
  max_actions: z.number().int().positive().default(50),
});
export type DispatchRequest = z.infer<typeof DispatchRequest>;

export const RunStatus = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const ActionType = z.enum([
  "navigate",
  "click",
  "type",
  "scroll",
  "wait",
  "screenshot",
  "extract",
  "captcha_solve",
  "tier_escalate",
]);
export type ActionType = z.infer<typeof ActionType>;

export const Action = z.object({
  idx: z.number().int().nonnegative(),
  type: ActionType,
  payload: z.record(z.unknown()),
  ts: z.string(),
});
export type Action = z.infer<typeof Action>;

export const PlaybookStep = z.object({
  action: ActionType,
  selector: z.string().optional(),
  value: z.string().optional(),
  note: z.string().optional(),
});
export type PlaybookStep = z.infer<typeof PlaybookStep>;

export const Playbook = z.object({
  company_id: z.string().uuid(),
  domain: z.string(),
  version: z.number().int(),
  steps: z.array(PlaybookStep),
  success_rate: z.number().min(0).max(1),
});
export type Playbook = z.infer<typeof Playbook>;
