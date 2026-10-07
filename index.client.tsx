import type { PluginClientContext } from "@getpaseo/plugin/client";
import { registerCountdowns } from "./client/register";
import { CountdownSettings } from "./client/settings-screen";

export default function contribute(client: PluginClientContext) {
  const removeSettings = client.addSettingsScreen({
    id: "display",
    title: "Display",
    icon: "SlidersHorizontal",
    Component: CountdownSettings,
  });
  const stopCountdowns = registerCountdowns(client);
  return () => {
    stopCountdowns();
    void removeSettings();
  };
}
