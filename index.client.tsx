import type { PluginClientContext } from "@getpaseo/plugin/client";
import { registerCountdowns } from "./client/register";
import { createSessionScreens } from "./client/session-screens";
import { createSessionDirectory } from "./client/sessions";
import { CountdownSettings } from "./client/settings-screen";

export default function contribute(client: PluginClientContext) {
  const removeSettings = client.addSettingsScreen({
    id: "display",
    title: "Display",
    icon: "SlidersHorizontal",
    Component: CountdownSettings,
  });
  const directory = createSessionDirectory();
  const stopCountdowns = registerCountdowns(client, directory);
  const { SessionsScreen, WorkspaceSessionsPanel } = createSessionScreens(directory);
  const removeSurface = client.addSurface("sessions", SessionsScreen);
  const removeSidebarItem = client.addSidebarItem({
    id: "sessions",
    title: "Cache Countdown",
    icon: "Timer",
    surface: "sessions",
  });
  const removePanel = client.addWorkspacePanel({
    id: "sessions",
    title: "Cache Countdown",
    icon: "Timer",
    context: "workspace",
    locations: ["explorer", "workspace"],
    Component: WorkspaceSessionsPanel,
  });
  return () => {
    stopCountdowns();
    void removePanel();
    void removeSidebarItem();
    void removeSurface();
    void removeSettings();
  };
}
