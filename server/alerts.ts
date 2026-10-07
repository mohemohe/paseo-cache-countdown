import type { PluginHookAgent } from "@getpaseo/plugin/server";
import { ALERT_LEVELS, alertCommands, type ALERT_ENVIRONMENT, type AlertLevel, type AlertSettings } from "../shared/alerts";
import { CACHE_PROFILES, CACHE_THRESHOLDS, formatRemaining, isCacheProvider, type CacheProfile } from "../shared/cache-profiles";

export type AlertEnvironment = Record<(typeof ALERT_ENVIRONMENT)[number]["name"], string>;

export interface AlertSchedulerOptions {
  /** Returns the current settings, or null when they cannot be used. */
  readSettings(): Promise<AlertSettings | null>;
  run(command: string, env: AlertEnvironment): void;
  now?: () => number;
}

interface Schedule {
  timers: Set<ReturnType<typeof setTimeout>>;
}

/** Matches the pills: supported providers in a workspace, with delegated Claude Code agents as subagents. */
export function getAlertProfile(agent: PluginHookAgent): CacheProfile | null {
  if (!agent.workspaceId || !isCacheProvider(agent.provider)) return null;
  const delegated = typeof agent.parentAgentId === "string" && agent.parentAgentId.trim().length > 0;
  return agent.provider === "claude" && delegated ? "claude-subagent" : agent.provider;
}

export function alertEnvironment(
  agent: PluginHookAgent,
  profile: CacheProfile,
  level: AlertLevel,
  idleSince: number,
  now: number,
): AlertEnvironment {
  const durationMs = CACHE_PROFILES[profile].durationMs;
  const expiresAt = idleSince + durationMs;
  const remainingMs = Math.max(0, Math.min(durationMs, expiresAt - now));
  return {
    PASEO_CACHE_PROVIDER: agent.provider,
    PASEO_CACHE_PROFILE: profile,
    PASEO_CACHE_PROFILE_NAME: CACHE_PROFILES[profile].name,
    PASEO_CACHE_LEVEL: level,
    PASEO_CACHE_REMAINING: formatRemaining(remainingMs),
    PASEO_CACHE_REMAINING_SECONDS: String(Math.ceil(remainingMs / 1_000)),
    PASEO_CACHE_DURATION_SECONDS: String(durationMs / 1_000),
    PASEO_CACHE_EXPIRES_AT: new Date(expiresAt).toISOString(),
    PASEO_AGENT_ID: agent.id,
    PASEO_AGENT_TITLE: agent.title ?? "",
    PASEO_WORKSPACE_ID: agent.workspaceId ?? "",
    PASEO_AGENT_CWD: agent.cwd,
  };
}

/** Runs the configured commands when an idle agent's estimate reaches yellow or red. */
export function createAlertScheduler({ readSettings, run, now = Date.now }: AlertSchedulerOptions) {
  const schedules = new Map<string, Schedule>();
  let disposed = false;

  function cancel(agentId: string) {
    const schedule = schedules.get(agentId);
    if (!schedule) return;
    for (const timer of schedule.timers) clearTimeout(timer);
    schedules.delete(agentId);
  }

  async function fire(agent: PluginHookAgent, profile: CacheProfile, level: AlertLevel, idleSince: number, schedule: Schedule) {
    const settings = await readSettings();
    // A new turn, archive, or cleanup replaced this schedule while settings were read.
    if (schedules.get(agent.id) !== schedule) return;
    if (schedule.timers.size === 0) schedules.delete(agent.id);
    const config = settings?.[profile][level];
    if (!config?.enabled) return;
    const commands = alertCommands(config.commands);
    if (commands.length === 0) return;
    const env = alertEnvironment(agent, profile, level, idleSince, now());
    for (const command of commands) run(command, env);
  }

  return {
    /** Starts counting from the end of a turn, replacing any earlier schedule for the agent. */
    turnEnded(agent: PluginHookAgent) {
      cancel(agent.id);
      const profile = getAlertProfile(agent);
      if (disposed || profile === null) return;
      const idleSince = now();
      const durationMs = CACHE_PROFILES[profile].durationMs;
      const schedule: Schedule = { timers: new Set() };
      schedules.set(agent.id, schedule);
      for (const level of ALERT_LEVELS) {
        const timer = setTimeout(() => {
          schedule.timers.delete(timer);
          fire(agent, profile, level, idleSince, schedule).catch((error) => {
            console.error("[paseo-cache-countdown] Alert failed", error);
          });
        }, durationMs * (1 - CACHE_THRESHOLDS[level]));
        schedule.timers.add(timer);
      }
    },
    cancel,
    dispose() {
      disposed = true;
      for (const agentId of [...schedules.keys()]) cancel(agentId);
    },
  };
}
