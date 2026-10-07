import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginButtonContentProps, PluginButtonIconProps } from "@getpaseo/plugin/client";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, Text, View } from "react-native";
import { CACHE_PROFILES, type CacheProfile, type CountdownTone } from "./countdown";
import type { CountdownStore } from "./countdown-store";
import { CircleProgress } from "./circle-progress";

export function countdownColor(theme: PluginTheme, tone: CountdownTone): string {
  if (tone === "success") return theme.colors.statusSuccess;
  if (tone === "warning") return theme.colors.statusWarning;
  if (tone === "danger") return theme.colors.statusDanger;
  return theme.colors.foregroundMuted;
}

export function createPillComponents(cacheProfile: CacheProfile, store: CountdownStore) {
  function CountdownIcon({ size, theme }: PluginButtonIconProps) {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    useEffect(() => {
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") store.refresh();
      });
      return () => subscription.remove();
    }, []);
    return <CircleProgress size={size} fraction={snapshot.fraction} color={countdownColor(theme, snapshot.tone)} trackColor={theme.colors.border} />;
  }

  function CountdownDetails({ theme }: PluginButtonContentProps) {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const profile = CACHE_PROFILES[cacheProfile];
    const color = countdownColor(theme, snapshot.tone);
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "600" }}>Prompt cache · {profile.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <CircleProgress size={32} fraction={snapshot.fraction} color={color} trackColor={theme.colors.border} />
          <Text style={{ color, fontSize: 28, fontVariant: ["tabular-nums"] }}>{snapshot.time}</Text>
        </View>
        <Text style={{ color: theme.colors.foregroundMuted }}>
          {snapshot.status === "error" ? "Could not determine the last update time." : snapshot.status === "loading" ? "Loading conversation history…" : snapshot.lastMessageAt === null ? "No messages or tool results yet." : snapshot.remainingMs === 0 ? "The cache duration has elapsed." : `Counting down ${profile.durationMs / 60_000} minutes from the last message or tool completion or failure.`}
        </Text>
        {snapshot.lastMessageAt !== null ? <Text style={{ color: theme.colors.foregroundMuted }}>Last updated: {new Date(snapshot.lastMessageAt + snapshot.clockOffsetMs).toLocaleString()}</Text> : null}
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>The remaining time is an estimate based on message and tool result timestamps.</Text>
      </View>
    );
  }
  return { CountdownIcon, CountdownDetails };
}
