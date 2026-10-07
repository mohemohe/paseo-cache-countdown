import type { PluginTheme } from "@getpaseo/plugin";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { CACHE_PROFILES, countdownColor } from "./countdown";
import { CircleProgress } from "./circle-progress";
import {
  groupSessions,
  matchesSessionQuery,
  sessionLocation,
  sessionTitle,
  sortByRemaining,
  type CountdownSession,
} from "./sessions";

/**
 * `groups` adds host and workspace headings, `remaining` orders by time remaining and
 * labels each row with its location, and `plain` suits a single workspace.
 */
export type SessionListLayout = "groups" | "remaining" | "plain";

export interface SessionListProps {
  theme: PluginTheme;
  sessions: readonly CountdownSession[];
  layout: SessionListLayout;
  /** Prefixes locations with a host name. */
  hostLabel?: (session: CountdownSession) => string | null;
  emptyText: string;
  onOpen?: (session: CountdownSession) => void;
}

export interface HostOption {
  id: string;
  label: string;
}

export interface SessionBrowserProps {
  theme: PluginTheme;
  sessions: readonly CountdownSession[];
  hosts: readonly HostOption[];
  /** Host ID, or null for every host. */
  selectedHost: string | null;
  onSelectHost: (hostId: string | null) => void;
  hostOf: (session: CountdownSession) => string;
  onOpen?: (session: CountdownSession) => void;
}

type SessionSort = "location" | "remaining";

const SORT_OPTIONS: readonly { value: SessionSort; label: string }[] = [
  { value: "location", label: "Host & project" },
  { value: "remaining", label: "Time remaining" },
];

/** Session list with host, search, and sort controls. Plain React Native, so the preview can render it. */
export function SessionBrowser({ theme, sessions, hosts, selectedHost, onSelectHost, hostOf, onOpen }: SessionBrowserProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SessionSort>("location");
  const visibleSessions = useMemo(
    () => sessions.filter((session) => (selectedHost === null || hostOf(session) === selectedHost) && matchesSessionQuery(session, query)),
    [sessions, selectedHost, hostOf, query],
  );
  const hostLabel = useMemo(() => {
    if (selectedHost !== null || hosts.length < 2) return undefined;
    const labels = new Map(hosts.map(({ id, label }) => [id, label]));
    return (session: CountdownSession) => labels.get(hostOf(session)) ?? hostOf(session);
  }, [selectedHost, hosts, hostOf]);
  const hostOptions = useMemo(
    () => [{ value: null, label: "All" }, ...hosts.map(({ id, label }) => ({ value: id, label }))],
    [hosts],
  );
  const filtered = selectedHost !== null || query.trim() !== "";
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 10 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search projects or sessions"
          placeholderTextColor={theme.colors.foregroundMuted}
          accessibilityLabel="Search projects or sessions"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={{
            color: theme.colors.foreground, backgroundColor: theme.colors.surface2, borderColor: theme.colors.border,
            borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
          }}
        />
        <ChoiceRow theme={theme} label="Host" options={hostOptions} value={selectedHost} onChange={onSelectHost} />
        <ChoiceRow theme={theme} label="Sort" options={SORT_OPTIONS} value={sort} onChange={setSort} />
      </View>
      <SessionList
        theme={theme}
        sessions={visibleSessions}
        layout={sort === "remaining" ? "remaining" : "groups"}
        hostLabel={hostLabel}
        emptyText={filtered ? "No sessions match the filters." : "No Codex or Claude Code sessions."}
        onOpen={onOpen}
      />
    </View>
  );
}

function ChoiceRow<Value extends string | null>({ theme, label, options, value, onChange }: {
  theme: PluginTheme;
  label: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, minWidth: 32 }}>{label}</Text>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
              borderColor: selected ? theme.colors.accent : theme.colors.border,
              backgroundColor: selected ? theme.colors.accent : "transparent",
            }}
          >
            <Text style={{ color: selected ? theme.colors.accentForeground : theme.colors.foreground, fontSize: 12 }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Plain React Native list shared by the screen, the panel, and the preview. */
export function SessionList({ theme, sessions, layout, hostLabel, emptyText, onOpen }: SessionListProps) {
  const remainingKey = useRemainingKey(sessions, layout === "remaining");
  const ordered = useMemo(
    () => layout === "remaining" ? sortByRemaining(sessions) : sessions,
    // remainingKey changes whenever a session's remaining time does.
    [sessions, layout, remainingKey],
  );
  if (sessions.length === 0) return <Text style={{ color: theme.colors.foregroundMuted }}>{emptyText}</Text>;
  const rows = (items: readonly CountdownSession[]) => items.map((session) => (
    <SessionRow
      key={`${session.serverId ?? ""}:${session.id}`}
      theme={theme}
      session={session}
      location={layout === "remaining" ? sessionLocation(session, hostLabel) : undefined}
      onOpen={onOpen}
    />
  ));
  if (layout !== "groups") return <View style={{ gap: 2 }}>{rows(ordered)}</View>;
  return (
    <View style={{ gap: 16 }}>
      {groupSessions(sessions, hostLabel).map((group) => (
        <View key={group.key} style={{ gap: 2 }}>
          <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingBottom: 4 }}>{group.label}</Text>
          {rows(group.sessions)}
        </View>
      ))}
    </View>
  );
}

/** Changes when any listed session's remaining time changes, so the order can follow. */
function useRemainingKey(sessions: readonly CountdownSession[], enabled: boolean) {
  const subscribe = useCallback((listener: () => void) => {
    if (!enabled) return () => {};
    const unsubscribes = sessions.map((session) => session.store.subscribe(listener));
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [sessions, enabled]);
  const getSnapshot = useCallback(
    () => enabled ? sessions.map((session) => session.store.getSnapshot().remainingMs ?? "").join() : "",
    [sessions, enabled],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

function SessionRow({ theme, session, location, onOpen }: {
  theme: PluginTheme;
  session: CountdownSession;
  /** Shown before the provider when rows are not under a heading. */
  location?: string;
  onOpen?: (session: CountdownSession) => void;
}) {
  // Subscribing starts the shared timeline observation, as the composer pill does.
  const snapshot = useSyncExternalStore(session.store.subscribe, session.store.getSnapshot);
  const color = countdownColor(theme, snapshot.tone);
  const title = sessionTitle(session);
  const profileName = CACHE_PROFILES[session.profile].name;
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
        <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{location ? `${location} · ${profileName}` : profileName}</Text>
      </View>
      <Text style={{ color, fontVariant: ["tabular-nums"] }}>{snapshot.time}</Text>
    </Pressable>
  );
}
