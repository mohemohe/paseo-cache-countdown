import type { PluginClientContext } from "@getpaseo/plugin/client";
import { getCacheProfile, isCacheProvider } from "./countdown";
import { createCountdownStore, type CountdownSnapshot } from "./countdown-store";
import type { CountdownSession, SessionDirectory } from "./sessions";

type PaseoApi = PluginClientContext["paseo"];

interface AgentTarget {
  id: string;
  workspaceId?: string | null;
  provider: string;
  archivedAt?: string | null;
  labels?: Readonly<Record<string, unknown>> | null;
  title?: string | null;
  createdAt?: string;
}

interface ProjectTarget {
  projectName?: string | null;
  workspaceName?: string | null;
}

export interface SessionAttachment {
  update(snapshot: CountdownSnapshot): void;
  detach(): void;
}

export interface ObserveSessionsOptions {
  /** Host of a borrowed API; null for the installation's own host. */
  serverId?: string | null;
  /** Adds per-session UI, such as the composer pill, while the session is registered. */
  attach?: (session: CountdownSession) => SessionAttachment;
}

/** Tracks supported, unarchived agents with a workspace and publishes them to the directory. */
export function observeCountdownSessions(
  paseo: PaseoApi,
  directory: SessionDirectory,
  { serverId = null, attach }: ObserveSessionsOptions = {},
) {
  const sessions = new Map<string, { session: CountdownSession; attachment?: SessionAttachment }>();
  const lifetime = new AbortController();
  let stopped = false;
  let sessionsChanged = false;
  let unsubscribe: (() => void) | undefined;

  function publishSessions() {
    if (!sessionsChanged) return;
    sessionsChanged = false;
    directory.publish([...sessions.values()].map(({ session }) => session));
  }

  // Updates may omit the project, so keep the last known names.
  function describe(agent: AgentTarget, project: ProjectTarget | null | undefined, previous?: CountdownSession) {
    return {
      title: agent.title ?? null,
      projectName: project ? project.projectName ?? null : previous?.projectName ?? null,
      workspaceName: project ? project.workspaceName ?? null : previous?.workspaceName ?? null,
      createdAt: agent.createdAt ?? previous?.createdAt ?? "",
    };
  }

  function remove(agentId: string) {
    const entry = sessions.get(agentId);
    if (!entry) return;
    entry.session.store.dispose();
    entry.attachment?.detach();
    sessions.delete(agentId);
    sessionsChanged = true;
  }

  function register(agent: AgentTarget, project?: ProjectTarget | null) {
    if (stopped) return;
    if (!agent.workspaceId || agent.archivedAt || !isCacheProvider(agent.provider)) {
      remove(agent.id);
      return;
    }
    const cacheProfile = getCacheProfile(agent.provider, agent.labels);
    const existing = sessions.get(agent.id);
    if (existing?.session.workspaceId === agent.workspaceId && existing.session.profile === cacheProfile) {
      const { session } = existing;
      const details = describe(agent, project, session);
      if (details.title !== session.title || details.projectName !== session.projectName || details.workspaceName !== session.workspaceName || details.createdAt !== session.createdAt) {
        existing.session = { ...session, ...details };
        sessionsChanged = true;
      }
      return;
    }
    remove(agent.id);

    let attachment: SessionAttachment | undefined;
    const store = createCountdownStore(cacheProfile, paseo.agents.ref(agent.id).timeline, (snapshot) => {
      attachment?.update(snapshot);
    });
    const session = { id: agent.id, serverId, workspaceId: agent.workspaceId, profile: cacheProfile, store, ...describe(agent, project) };
    attachment = attach?.(session);
    sessions.set(agent.id, { session, attachment });
    sessionsChanged = true;
  }

  // Active-directory sync returns a full snapshot, beyond the default 200-row page.
  void paseo.agents.list({ scope: "active", sync: {}, subscribe: {}, signal: lifetime.signal }).then(({ subscription }) => {
    if (stopped) {
      void subscription.release().catch(() => {});
      return;
    }
    unsubscribe = subscription.subscribe({
      snapshot: ({ entries }) => {
        const present = new Set(entries.map(({ agent }) => agent.id));
        for (const id of sessions.keys()) if (!present.has(id)) remove(id);
        for (const { agent, project } of entries) register(agent, project);
        publishSessions();
      },
      update: (message) => {
        if (message.type !== "agent_update") return;
        if (message.payload.kind === "remove") remove(message.payload.agentId);
        else register(message.payload.agent, message.payload.project);
        publishSessions();
      },
      error: (error) => {
        if (!stopped) console.error("[paseo-cache-countdown] Agent observation failed", error);
      },
    });
  }).catch((error) => {
    if (!stopped) console.error("[paseo-cache-countdown] Agent observation failed", error);
  });

  return () => {
    stopped = true;
    lifetime.abort();
    unsubscribe?.();
    for (const id of sessions.keys()) remove(id);
    publishSessions();
  };
}
