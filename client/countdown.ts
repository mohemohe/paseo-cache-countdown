export type CacheProvider = "codex" | "claude";
export type CacheProfile = CacheProvider | "claude-subagent";
export type CountdownTone = "success" | "warning" | "danger" | "unknown";

export const CACHE_PROFILES = {
  codex: { name: "Codex", durationMs: 30 * 60 * 1_000 },
  claude: { name: "Claude Code", durationMs: 60 * 60 * 1_000 },
  "claude-subagent": { name: "Claude Code (subagent)", durationMs: 5 * 60 * 1_000 },
} as const;

/** Paseo marks delegated agents with this label. */
export const PARENT_AGENT_ID_LABEL = "paseo.parent-agent-id";

export function isCacheProvider(provider: string): provider is CacheProvider {
  return provider === "codex" || provider === "claude";
}

export function getCacheProfile(
  provider: CacheProvider,
  labels: Readonly<Record<string, unknown>> | null | undefined,
): CacheProfile {
  const parentAgentId = labels?.[PARENT_AGENT_ID_LABEL];
  const delegated = typeof parentAgentId === "string" && parentAgentId.trim().length > 0;
  return provider === "claude" && delegated ? "claude-subagent" : provider;
}

export interface Countdown {
  remainingMs: number | null;
  fraction: number;
  time: string;
  tone: CountdownTone;
}

export function getCountdown(
  profile: CacheProfile,
  lastMessageAt: number | null,
  now: number,
): Countdown {
  if (lastMessageAt === null || !Number.isFinite(lastMessageAt) || !Number.isFinite(now)) {
    return { remainingMs: null, fraction: 0, time: "--:--", tone: "unknown" };
  }

  const duration = CACHE_PROFILES[profile].durationMs;
  const remainingMs = Math.max(0, Math.min(duration, lastMessageAt + duration - now));
  const seconds = Math.ceil(remainingMs / 1_000);
  const minutesPart = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secondsPart = String(seconds % 60).padStart(2, "0");
  return {
    remainingMs,
    fraction: remainingMs / duration,
    time: `${minutesPart}:${secondsPart}`,
    tone: remainingMs <= duration / 8 ? "danger" : remainingMs <= duration / 2 ? "warning" : "success",
  };
}
