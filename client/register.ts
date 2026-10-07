import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { CACHE_PROFILES, getCacheProfile, isCacheProvider } from "./countdown";
import { createCountdownStore } from "./countdown-store";
import { createPillComponents } from "./pill";
import { createSessionDirectory, type CountdownSession, type SessionDirectory } from "./sessions";

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

export function registerCountdowns(client: PluginClientContext, directory: SessionDirectory = createSessionDirectory()) {
  const pills = new Map<string, { registration: PluginButtonRegistration; session: CountdownSession }>();
  const lifetime = new AbortController();
  let stopped = false;
  let sessionsChanged = false;
  let unsubscribe: (() => void) | undefined;
  let showCachePrefix = true;

  function label(time: string) {
    return showCachePrefix ? `Cache ${time}` : time;
  }

  function setShowCachePrefix(show: boolean) {
    if (stopped || show === showCachePrefix) return;
    showCachePrefix = show;
    for (const pill of pills.values()) pill.registration.update({ label: label(pill.session.store.getSnapshot().time) });
  }

  function publishSessions() {
    if (!sessionsChanged) return;
    sessionsChanged = false;
    directory.publish([...pills.values()].map(({ session }) => session));
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
    const pill = pills.get(agentId);
    if (!pill) return;
    pill.session.store.dispose();
    pill.registration.remove();
    pills.delete(agentId);
    sessionsChanged = true;
  }

  function register(agent: AgentTarget, project?: ProjectTarget | null) {
    if (stopped) return;
    if (!agent.workspaceId || agent.archivedAt || !isCacheProvider(agent.provider)) {
      remove(agent.id);
      return;
    }
    const cacheProfile = getCacheProfile(agent.provider, agent.labels);
    const existing = pills.get(agent.id);
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

    const profile = CACHE_PROFILES[cacheProfile];
    let registration: PluginButtonRegistration | undefined;
    const store = createCountdownStore(cacheProfile, client.paseo.agents.ref(agent.id).timeline, (snapshot) => {
      registration?.update({
        label: label(snapshot.time),
        title: snapshot.lastMessageAt === null || snapshot.remainingMs === null
          ? `${profile.name} prompt cache countdown`
          : `Cache expired at ${new Date(snapshot.lastMessageAt + snapshot.clockOffsetMs + profile.durationMs).toLocaleString()}`,
      });
    });
    const { CountdownIcon, CountdownDetails } = createPillComponents(cacheProfile, store, setShowCachePrefix);
    registration = client.addComposerPill({
      id: "cache-countdown",
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: {
        title: `${profile.name} prompt cache countdown`,
        icon: CountdownIcon,
        label: label(store.getSnapshot().time),
        behavior: { kind: "popover", Content: CountdownDetails },
      },
    });
    const session = { id: agent.id, workspaceId: agent.workspaceId, profile: cacheProfile, store, ...describe(agent, project) };
    pills.set(agent.id, { registration, session });
    sessionsChanged = true;
  }

  // Active-directory sync returns a full snapshot, beyond the default 200-row page.
  void client.paseo.agents.list({ scope: "active", sync: {}, subscribe: {}, signal: lifetime.signal }).then(({ subscription }) => {
    if (stopped) {
      void subscription.release().catch(() => {});
      return;
    }
    unsubscribe = subscription.subscribe({
      snapshot: ({ entries }) => {
        const present = new Set(entries.map(({ agent }) => agent.id));
        for (const id of pills.keys()) if (!present.has(id)) remove(id);
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
    for (const id of pills.keys()) remove(id);
    publishSessions();
  };
}
