import { getPaseoClient, useHosts, type PluginSurfaceProps, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppState, Text } from "react-native";
import { SessionBrowser, SessionList, type HostOption } from "./session-list";
import { observeCountdownSessions } from "./session-observer";
import { createSessionDirectory, type CountdownSession, type SessionDirectory } from "./sessions";

const ESTIMATE_NOTE = "Remaining times are estimates based on message and tool result timestamps.";

type RemoteSessionsChange = (serverId: string, sessions: readonly CountdownSession[] | null) => void;

function useResumeRefresh(sessions: readonly CountdownSession[]) {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") for (const session of sessions) session.store.refresh();
    });
    return () => subscription.remove();
  }, [sessions]);
}

/** Observes another host's sessions through a borrowed API while mounted. */
function RemoteHostSessions({ serverId, onChange }: { serverId: string; onChange: RemoteSessionsChange }) {
  useEffect(() => {
    const directory = createSessionDirectory();
    const unsubscribe = directory.subscribe(() => onChange(serverId, directory.getSnapshot()));
    let stop: (() => void) | undefined;
    try {
      stop = observeCountdownSessions(getPaseoClient(serverId), directory, { serverId });
    } catch (error) {
      console.error(`[paseo-cache-countdown] Could not observe host ${serverId}`, error);
    }
    return () => {
      unsubscribe();
      stop?.();
      onChange(serverId, null);
    };
  }, [serverId, onChange]);
  return null;
}

export function createSessionScreens(directory: SessionDirectory) {
  /** Opened from the sidebar; lists sessions on the selected online host, or on every one. */
  function SessionsScreen({ theme, layout, navigation, host }: PluginSurfaceProps) {
    const ownSessions = useSyncExternalStore(directory.subscribe, directory.getSnapshot);
    const hosts = useHosts();
    const [selectedHost, setSelectedHost] = useState<string | null>(null);
    const [remoteSessions, setRemoteSessions] = useState<ReadonlyMap<string, readonly CountdownSession[]>>(() => new Map());
    const updateRemoteSessions = useCallback<RemoteSessionsChange>((serverId, sessions) => {
      setRemoteSessions((previous) => {
        const next = new Map(previous);
        if (sessions) next.set(serverId, sessions);
        else next.delete(serverId);
        return next;
      });
    }, []);
    const hostOptions = useMemo<HostOption[]>(() => [
      { id: host.id, label: host.label },
      ...hosts.filter(({ serverId, status }) => status === "online" && serverId !== host.id).map(({ serverId, label }) => ({ id: serverId, label })),
    ], [hosts, host.id, host.label]);
    // A selected host that went offline falls back to every host.
    const effectiveHost = hostOptions.some(({ id }) => id === selectedHost) ? selectedHost : null;
    // The own host keeps the pill's stores; other hosts are observed only while shown on this screen.
    const remoteServerIds = hostOptions.slice(1).map(({ id }) => id).filter((id) => effectiveHost === null || id === effectiveHost);
    const sessions = useMemo(
      () => [...ownSessions, ...hostOptions.flatMap(({ id }) => remoteSessions.get(id) ?? [])],
      [ownSessions, hostOptions, remoteSessions],
    );
    const hostOf = useCallback((session: CountdownSession) => session.serverId ?? host.id, [host.id]);
    useResumeRefresh(sessions);
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 16 }}>
        {remoteServerIds.map((serverId) => <RemoteHostSessions key={serverId} serverId={serverId} onChange={updateRemoteSessions} />)}
        <SessionBrowser
          theme={theme}
          sessions={sessions}
          hosts={hostOptions}
          selectedHost={effectiveHost}
          onSelectHost={setSelectedHost}
          hostOf={hostOf}
          onOpen={navigation ? (session) => navigation.openAgent({ agentId: session.id, serverId: session.serverId ?? undefined }) : undefined}
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
          layout="plain"
          emptyText="No Codex or Claude Code sessions in this workspace."
          onOpen={navigation ? (session) => navigation.openAgent({ agentId: session.id }) : undefined}
        />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{ESTIMATE_NOTE}</Text>
      </ScrollView>
    );
  }

  return { SessionsScreen, WorkspaceSessionsPanel };
}
