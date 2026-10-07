import type { CacheProfile } from "./countdown";
import type { CountdownStore } from "./countdown-store";

export interface CountdownSession {
  id: string;
  /** Host of a borrowed API; null for the installation's own host. */
  serverId: string | null;
  workspaceId: string;
  profile: CacheProfile;
  title: string | null;
  projectName: string | null;
  workspaceName: string | null;
  createdAt: string;
  /** On the own host, shared with the composer pill so a session observes its timeline once. */
  store: CountdownStore;
}

export interface SessionGroup {
  key: string;
  workspaceId: string;
  label: string;
  sessions: CountdownSession[];
}

/** Publishes registered sessions to the session list screen and panel. */
export function createSessionDirectory() {
  let sessions: readonly CountdownSession[] = [];
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => sessions,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(next: readonly CountdownSession[]) {
      sessions = [...next].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      for (const listener of listeners) listener();
    },
  };
}

export type SessionDirectory = ReturnType<typeof createSessionDirectory>;

/**
 * Groups sessions by host and workspace in order of first appearance. `hostLabel`
 * prefixes headings when sessions come from several hosts.
 */
export function groupSessions(
  sessions: readonly CountdownSession[],
  hostLabel?: (session: CountdownSession) => string | null,
): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();
  for (const session of sessions) {
    const key = `${session.serverId ?? ""}\n${session.workspaceId}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, workspaceId: session.workspaceId, label: sessionLocation(session, hostLabel), sessions: [] };
      groups.set(key, group);
    }
    group.sessions.push(session);
  }
  return [...groups.values()];
}

export function sessionTitle(session: CountdownSession) {
  return session.title ?? "Untitled session";
}

/** Host, project, and workspace, as shown in group headings. */
export function sessionLocation(session: CountdownSession, hostLabel?: (session: CountdownSession) => string | null) {
  const host = hostLabel?.(session);
  const label = workspaceLabel(session);
  return host ? `${host} · ${label}` : label;
}

/** Case-insensitive substring match on the session title, project, or workspace name. */
export function matchesSessionQuery(session: CountdownSession, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [sessionTitle(session), session.projectName, session.workspaceName]
    .some((value) => value?.toLocaleLowerCase().includes(needle));
}

/**
 * Orders running caches by least time remaining, then expired caches, then unknown
 * ones. Ties keep the incoming order.
 */
export function sortByRemaining(sessions: readonly CountdownSession[]) {
  const rank = (session: CountdownSession): [number, number] => {
    const { remainingMs } = session.store.getSnapshot();
    if (remainingMs === null) return [2, 0];
    return remainingMs === 0 ? [1, 0] : [0, remainingMs];
  };
  return sessions
    .map((session) => ({ session, rank: rank(session) }))
    .sort((left, right) => left.rank[0] - right.rank[0] || left.rank[1] - right.rank[1])
    .map(({ session }) => session);
}

function workspaceLabel({ projectName, workspaceName, workspaceId }: CountdownSession) {
  if (projectName && workspaceName && workspaceName !== projectName) return `${projectName} · ${workspaceName}`;
  return projectName ?? workspaceName ?? workspaceId;
}
