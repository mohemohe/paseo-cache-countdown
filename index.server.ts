import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createAlertScheduler } from "./server/alerts";
import { createCommandRunner } from "./server/run-command";
import { alerts } from "./shared/alerts";
import { preferences } from "./shared/preferences";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(preferences);
  const alertSettings = server.registerSettings(alerts);
  const runner = createCommandRunner();
  const scheduler = createAlertScheduler({
    async readSettings() {
      const state = await alertSettings.read();
      if (state.status === "ready") return state.values;
      console.error("[paseo-cache-countdown] Alert settings are invalid", state.error);
      return null;
    },
    run: runner.run,
  });
  const removeHooks = [
    server.on("agent.turn_started", ({ agent }) => scheduler.cancel(agent.id)),
    server.on("agent.turn_ended", ({ agent }) => scheduler.turnEnded(agent)),
    server.on("agent.archived", ({ agent }) => scheduler.cancel(agent.id)),
  ];
  return () => {
    for (const remove of removeHooks) remove();
    scheduler.dispose();
    runner.dispose();
  };
}
