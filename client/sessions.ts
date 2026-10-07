import type { CacheProfile } from "./countdown";
import type { CountdownStore } from "./countdown-store";

export interface CountdownSession {
  id: string;
  workspaceId: string;
  profile: CacheProfile;
  title: string | null;
  projectName: string | null;
  workspaceName: string | null;
  createdAt: string;
  /** Shared with the composer pill, so a session observes its timeline once. */
  store: CountdownStore;
}

export interface SessionGroup {
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

/** Groups newest-first sessions by workspace, keeping the newest workspace first. */
export function groupSessions(sessions: readonly CountdownSession[]): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();
  for (const session of sessions) {
    let group = groups.get(session.workspaceId);
    if (!group) {
      group = { workspaceId: session.workspaceId, label: workspaceLabel(session), sessions: [] };
      groups.set(session.workspaceId, group);
    }
    group.sessions.push(session);
  }
  return [...groups.values()];
}

function workspaceLabel({ projectName, workspaceName, workspaceId }: CountdownSession) {
  if (projectName && workspaceName && workspaceName !== projectName) return `${projectName} · ${workspaceName}`;
  return projectName ?? workspaceName ?? workspaceId;
}
