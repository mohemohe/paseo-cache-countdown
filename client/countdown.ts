import type { PluginTheme } from "@getpaseo/plugin";
import { CACHE_PROFILES, CACHE_THRESHOLDS, formatRemaining, type CacheProfile } from "../shared/cache-profiles";

export {
  CACHE_PROFILES,
  PARENT_AGENT_ID_LABEL,
  getCacheProfile,
  isCacheProvider,
  type CacheProfile,
  type CacheProvider,
} from "../shared/cache-profiles";

export type CountdownTone = "success" | "warning" | "danger" | "unknown";

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
  return {
    remainingMs,
    fraction: remainingMs / duration,
    time: formatRemaining(remainingMs),
    tone: remainingMs <= duration * CACHE_THRESHOLDS.danger ? "danger" : remainingMs <= duration * CACHE_THRESHOLDS.warning ? "warning" : "success",
  };
}

export function countdownColor(theme: PluginTheme, tone: CountdownTone): string {
  if (tone === "success") return theme.colors.statusSuccess;
  if (tone === "warning") return theme.colors.statusWarning;
  if (tone === "danger") return theme.colors.statusDanger;
  return theme.colors.foregroundMuted;
}
