export type CacheProvider = "codex" | "claude";
export type CacheProfile = CacheProvider | "claude-subagent";

export const CACHE_PROFILES = {
  codex: { name: "Codex", durationMs: 30 * 60 * 1_000 },
  claude: { name: "Claude Code", durationMs: 60 * 60 * 1_000 },
  "claude-subagent": { name: "Claude Code (subagent)", durationMs: 5 * 60 * 1_000 },
} as const;

/** Fractions of the duration at or below which the countdown turns yellow or red. */
export const CACHE_THRESHOLDS = { warning: 1 / 2, danger: 1 / 8 } as const;

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

/** Formats milliseconds as `mm:ss`, rounding seconds up. */
export function formatRemaining(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1_000);
  const minutesPart = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secondsPart = String(seconds % 60).padStart(2, "0");
  return `${minutesPart}:${secondsPart}`;
}
