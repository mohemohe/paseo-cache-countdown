import type { PluginSurfaceProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState, Text } from "react-native";
import { SessionList } from "./session-list";
import type { CountdownSession, SessionDirectory } from "./sessions";

const ESTIMATE_NOTE = "Remaining times are estimates based on message and tool result timestamps.";

function useResumeRefresh(sessions: readonly CountdownSession[]) {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") for (const session of sessions) session.store.refresh();
    });
    return () => subscription.remove();
  }, [sessions]);
}

export function createSessionScreens(directory: SessionDirectory) {
  /** Opened from the sidebar; lists every registered session on the selected host. */
  function SessionsScreen({ theme, layout, navigation }: PluginSurfaceProps) {
    const sessions = useSyncExternalStore(directory.subscribe, directory.getSnapshot);
    useResumeRefresh(sessions);
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 16 }}>
        <SessionList
          theme={theme}
          sessions={sessions}
          grouped
          emptyText="No Codex or Claude Code sessions."
          onOpen={navigation ? (session) => navigation.openAgent({ agentId: session.id }) : undefined}
        />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{ESTIMATE_NOTE}</Text>
      </ScrollView>
    );
  }

  /** Workspace or Explorer tab listing the sessions in its workspace. */
  function WorkspaceSessionsPanel({ theme, layout, navigation, workspaceId }: PluginWorkspacePanelProps) {
    const allSessions = useSyncExternalStore(directory.subscribe, directory.getSnapshot);
    const sessions = useMemo(() => allSessions.filter((session) => session.workspaceId === workspaceId), [allSessions, workspaceId]);
    useResumeRefresh(sessions);
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 8 : 12, gap: 12 }}>
        <SessionList
          theme={theme}
          sessions={sessions}
          grouped={false}
          emptyText="No Codex or Claude Code sessions in this workspace."
          onOpen={navigation ? (session) => navigation.openAgent({ agentId: session.id }) : undefined}
        />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{ESTIMATE_NOTE}</Text>
      </ScrollView>
    );
  }

  return { SessionsScreen, WorkspaceSessionsPanel };
}
