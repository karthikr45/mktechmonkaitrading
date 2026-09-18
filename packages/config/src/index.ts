import { z } from "zod";
export const Environment = z.object({
  EXECUTION_MODE: z.literal("paper").default("paper"),
  LIVE_TRADING_ENABLED: z.literal("false").default("false"),
  AI_PROVIDER: z.enum(["disabled", "mock", "ollama"]).default("disabled"),
  DEFAULT_TIMEZONE: z.string().default("Asia/Kolkata"),
  PORT: z.coerce.number().int().min(1024).default(4000),
});
