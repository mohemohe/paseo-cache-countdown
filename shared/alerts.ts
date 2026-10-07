import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import type { CacheProfile } from "./cache-profiles";

export type AlertLevel = "warning" | "danger";

export const ALERT_LEVELS = ["warning", "danger"] as const satisfies readonly AlertLevel[];
export const ALERT_PROFILES = ["codex", "claude", "claude-subagent"] as const satisfies readonly CacheProfile[];

const levelSchema = z.object({
  enabled: z.boolean().default(false),
  commands: z.array(z.string()).default([]),
});

// `prefault` parses `{}` through the nested defaults; `default` would skip them.
const profileSchema = z.object({
  warning: levelSchema.prefault({}),
  danger: levelSchema.prefault({}),
});

export const alerts = defineSettings({
  id: "alerts",
  scope: "host",
  version: 1,
  schema: z.object({
    codex: profileSchema.prefault({}),
    claude: profileSchema.prefault({}),
    "claude-subagent": profileSchema.prefault({}),
  }),
});

export type AlertSettings = z.output<typeof alerts.schema>;

/** Commands to run, ignoring blank entries. */
export function alertCommands(commands: readonly string[]): string[] {
  return commands.map((command) => command.trim()).filter((command) => command.length > 0);
}

/** Environment variables passed to alert commands, documented in the settings screen and READMEs. */
export const ALERT_ENVIRONMENT = [
  { name: "PASEO_CACHE_PROVIDER", description: "Agent provider: codex or claude." },
  { name: "PASEO_CACHE_PROFILE", description: "Countdown profile: codex, claude, or claude-subagent." },
  { name: "PASEO_CACHE_PROFILE_NAME", description: "Display name, such as Codex or Claude Code (subagent)." },
  { name: "PASEO_CACHE_LEVEL", description: "warning (yellow) or danger (red)." },
  { name: "PASEO_CACHE_REMAINING", description: "Remaining time as mm:ss, such as 15:00." },
  { name: "PASEO_CACHE_REMAINING_SECONDS", description: "Remaining time in whole seconds, rounded up." },
  { name: "PASEO_CACHE_DURATION_SECONDS", description: "Full cache duration in seconds." },
  { name: "PASEO_CACHE_EXPIRES_AT", description: "Estimated expiration time in ISO 8601 (UTC)." },
  { name: "PASEO_AGENT_ID", description: "Agent ID." },
  { name: "PASEO_AGENT_TITLE", description: "Agent title; empty when the agent has none." },
  { name: "PASEO_WORKSPACE_ID", description: "Workspace ID." },
  { name: "PASEO_AGENT_CWD", description: "Agent working directory." },
] as const;
