import type { PluginTheme } from "@getpaseo/plugin";
import { useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import { CACHE_PROFILES, countdownColor } from "./countdown";
import { CircleProgress } from "./circle-progress";
import { groupSessions, type CountdownSession } from "./sessions";

export interface SessionListProps {
  theme: PluginTheme;
  sessions: readonly CountdownSession[];
  /** Shows workspace headings; a workspace panel already has one context. */
  grouped: boolean;
  emptyText: string;
  onOpen?: (session: CountdownSession) => void;
}

/** Plain React Native list shared by the screen, the panel, and the preview. */
export function SessionList({ theme, sessions, grouped, emptyText, onOpen }: SessionListProps) {
  if (sessions.length === 0) return <Text style={{ color: theme.colors.foregroundMuted }}>{emptyText}</Text>;
  const rows = (items: readonly CountdownSession[]) => items.map((session) => (
    <SessionRow key={session.id} theme={theme} session={session} onOpen={onOpen} />
  ));
  if (!grouped) return <View style={{ gap: 2 }}>{rows(sessions)}</View>;
  return (
    <View style={{ gap: 16 }}>
      {groupSessions(sessions).map((group) => (
        <View key={group.workspaceId} style={{ gap: 2 }}>
          <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingBottom: 4 }}>{group.label}</Text>
          {rows(group.sessions)}
        </View>
      ))}
    </View>
  );
}

function SessionRow({ theme, session, onOpen }: {
  theme: PluginTheme;
  session: CountdownSession;
  onOpen?: (session: CountdownSession) => void;
}) {
  // Subscribing starts the shared timeline observation, as the composer pill does.
  const snapshot = useSyncExternalStore(session.store.subscribe, session.store.getSnapshot);
  const color = countdownColor(theme, snapshot.tone);
  const title = session.title ?? "Untitled session";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, cache ${snapshot.time}`}
      disabled={!onOpen}
      onPress={() => onOpen?.(session)}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8,
        backgroundColor: pressed ? theme.colors.surface2 : "transparent",
      })}
    >
      <CircleProgress size={16} fraction={snapshot.fraction} color={color} trackColor={theme.colors.border} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{CACHE_PROFILES[session.profile].name}</Text>
      </View>
      <Text style={{ color, fontVariant: ["tabular-nums"] }}>{snapshot.time}</Text>
    </Pressable>
  );
}
