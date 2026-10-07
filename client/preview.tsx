// Development-only React Native Web preview; never imported by the plugin entry.
import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { CACHE_PROFILES, countdownColor, getCountdown, type CacheProfile } from "./countdown";
import { CircleProgress } from "./circle-progress";
import type { CountdownSnapshot, CountdownStore } from "./countdown-store";
import { SessionList } from "./session-list";
import type { CountdownSession } from "./sessions";

const theme: PluginTheme = { colors: {
  surface0: "#101214", surface1: "#191c20", surface2: "#25292f", border: "#343a43",
  foreground: "#f3f4f6", foregroundMuted: "#a5aab4", accent: "#91a7ff", accentForeground: "#101214",
  statusSuccess: "#4ade80", statusWarning: "#facc15", statusDanger: "#f87171",
} };

// Sample stores tick on wall-clock time without observing a Paseo timeline.
function sampleStore(profile: CacheProfile, lastMessageAt: number | null): CountdownStore {
  const compute = (): CountdownSnapshot => ({
    ...getCountdown(profile, lastMessageAt, Date.now()), lastMessageAt, clockOffsetMs: 0, status: lastMessageAt === null ? "loading" : "ready",
  });
  let snapshot = compute();
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      timer ??= setInterval(() => { snapshot = compute(); for (const notify of listeners) notify(); }, 1_000);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== undefined) { clearInterval(timer); timer = undefined; }
      };
    },
    refresh() {},
    dispose() {},
  };
}

const startedAt = Date.now();
const sampleSessions: CountdownSession[] = ([
  ["s1", "w1", "claude", "Refactor timeline observer", startedAt - 10 * 60_000, "paseo", "main"],
  ["s2", "w1", "claude-subagent", "Search for flaky tests", startedAt - 4 * 60_000, "paseo", "main"],
  ["s3", "w1", "codex", null, startedAt - 26 * 60_000, "paseo", "main"],
  ["s4", "w2", "codex", "Review pull request #42", startedAt - 45 * 60_000, "paseo", "review-42"],
  ["s5", "w2", "claude", "Waiting for history", null, "paseo", "review-42"],
] as const).map(([id, workspaceId, profile, title, lastMessageAt, projectName, workspaceName], index) => ({
  id, workspaceId, profile, title, projectName, workspaceName,
  createdAt: new Date(startedAt - index * 60_000).toISOString(), store: sampleStore(profile, lastMessageAt),
}));

function Preview() {
  const [provider, setProvider] = useState<CacheProfile>("codex");
  const [lastMessageAt, setLastMessageAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  const countdown = getCountdown(provider, lastMessageAt, now);
  const duration = CACHE_PROFILES[provider].durationMs;
  const buttonStyle = { padding: 12, borderRadius: 8, backgroundColor: theme.colors.surface2 };
  return <View style={{ padding: 32, gap: 24, maxWidth: 780, width: "100%", alignSelf: "center" }}>
    <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "600" }}>Paseo Cache Countdown</Text>
    <Text style={{ color: theme.colors.foregroundMuted }}>Component preview · Does not connect to Paseo.</Text>
    <View style={{ flexDirection: "row", gap: 8 }}>
      {(["codex", "claude", "claude-subagent"] as const).map((value) => <Pressable key={value} style={buttonStyle} onPress={() => { setProvider(value); setLastMessageAt(Date.now()); setNow(Date.now()); }}><Text style={{ color: provider === value ? theme.colors.accent : theme.colors.foreground }}>{CACHE_PROFILES[value].name}</Text></Pressable>)}
    </View>
    <View style={{ backgroundColor: theme.colors.surface1, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 16 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", alignSelf: "flex-start", borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 7 }}>
        <CircleProgress size={16} fraction={countdown.fraction} color={countdownColor(theme, countdown.tone)} trackColor={theme.colors.border} />
        <Text style={{ color: theme.colors.foreground, fontSize: 12, fontVariant: ["tabular-nums"] }}>Cache {countdown.time}</Text>
      </View>
      <Text style={{ color: theme.colors.foregroundMuted }}>Type a message…</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
        <Text style={{ color: theme.colors.foregroundMuted }}>{CACHE_PROFILES[provider].name}</Text>
        <Pressable style={buttonStyle} onPress={() => { setLastMessageAt(Date.now()); setNow(Date.now()); }}><Text style={{ color: theme.colors.foreground }}>Simulate sending a message</Text></Pressable>
      </View>
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {[{ label: "50% remaining", fraction: 0.5 }, { label: "1/8 remaining", fraction: 0.125 }, { label: "Expired", fraction: 0 }].map(({ label, fraction }) => <Pressable key={label} style={buttonStyle} onPress={() => { const time = Date.now(); setLastMessageAt(time - duration * (1 - fraction)); setNow(time); }}><Text style={{ color: theme.colors.foreground }}>{label}</Text></Pressable>)}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 28 }}>
      {[1, 0.75, 0.5, 0.25, 0.125, 0].map((fraction) => {
        const state = getCountdown(provider, now - duration * (1 - fraction), now);
        return <View key={fraction} style={{ alignItems: "center", gap: 8 }}><CircleProgress size={40} fraction={fraction} color={countdownColor(theme, state.tone)} trackColor={theme.colors.border} /><Text style={{ color: theme.colors.foregroundMuted }}>{state.time}</Text></View>;
      })}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
      <View style={{ flexGrow: 1, flexBasis: 360, gap: 12 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>Sidebar screen</Text>
        <View style={{ backgroundColor: theme.colors.surface0, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, padding: 24 }}>
          <SessionList theme={theme} sessions={sampleSessions} grouped emptyText="No Codex or Claude Code sessions." onOpen={() => {}} />
        </View>
      </View>
      <View style={{ width: 280, gap: 12 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>Workspace panel</Text>
        <View style={{ backgroundColor: theme.colors.surface0, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 16 }}>
          <SessionList theme={theme} sessions={sampleSessions.filter(({ workspaceId }) => workspaceId === "w1")} grouped={false} emptyText="No Codex or Claude Code sessions in this workspace." onOpen={() => {}} />
          <SessionList theme={theme} sessions={[]} grouped={false} emptyText="No Codex or Claude Code sessions in this workspace." />
        </View>
      </View>
    </View>
  </View>;
}

// Keep DOM access isolated to client/web.ts, as required by the Paseo scaffold.
import { previewRoot } from "./web";
createRoot(previewRoot()).render(createElement(Preview));
