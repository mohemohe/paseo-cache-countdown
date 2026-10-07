import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { preferences } from "../shared/preferences";

export function CountdownSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(preferences);
  if (settings.status === "loading") return <Text style={{ color: theme.colors.foregroundMuted }}>Loading settings…</Text>;
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="Display">
        <Text style={{ color: theme.colors.statusDanger }}>{settings.error}</Text>
        <SettingsCard>
          <SettingsAction label="Reload settings" actionLabel="Reload" onPress={() => void settings.reload()} />
          {settings.status === "invalid" ? (
            <SettingsAction label="Restore default settings" actionLabel="Reset" onPress={() => void settings.reset()} />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    );
  }
  return (
    <SettingsSection title="Display">
      <SettingsCard>
        <SettingsSwitch
          label="Show “Cache” in the pill"
          hint="When off, the pill shows only the remaining time."
          value={settings.values.showCachePrefix}
          disabled={settings.saving}
          error={settings.saveError}
          onValueChange={(showCachePrefix) => void settings.save({ ...settings.values, showCachePrefix }, settings.revision)}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
