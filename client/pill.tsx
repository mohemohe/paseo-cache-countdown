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
          {snapshot.status === "error" ? "最終更新時刻を取得できませんでした。" : snapshot.status === "loading" ? "会話履歴を読み込み中…" : snapshot.lastMessageAt === null ? "まだメッセージやツール結果がありません。" : snapshot.remainingMs === 0 ? "キャッシュの有効時間を経過しました。" : `最後のメッセージまたはツールの完了・失敗から${profile.durationMs / 60_000}分のカウントダウンです。`}
        </Text>
        {snapshot.lastMessageAt !== null ? <Text style={{ color: theme.colors.foregroundMuted }}>最終更新: {new Date(snapshot.lastMessageAt + snapshot.clockOffsetMs).toLocaleString()}</Text> : null}
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>残り時間はメッセージ・ツール結果の時刻に基づく目安です。</Text>
      </View>
    );
  }
  return { CountdownIcon, CountdownDetails };
}
