import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsInput, SettingsRow, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { ALERT_ENVIRONMENT, ALERT_LEVELS, ALERT_PROFILES, alertCommands, alerts, type AlertLevel } from "../shared/alerts";
import { CACHE_PROFILES, CACHE_THRESHOLDS, formatRemaining } from "../shared/cache-profiles";

const LEVEL_NAMES: Record<AlertLevel, string> = { warning: "Yellow", danger: "Red" };

interface Draft {
  key: number;
  text: string;
}

function CommandEditor({ commands, disabled, onSave }: {
  commands: readonly string[];
  disabled: boolean;
  onSave(commands: string[]): Promise<boolean>;
}) {
  const nextKey = useRef(0);
  const toDrafts = (texts: readonly string[]) => texts.map((text) => ({ key: nextKey.current++, text }));
  const [drafts, setDrafts] = useState<Draft[]>(() => toDrafts(commands));
  const savedKey = JSON.stringify(alertCommands(commands));
  // SettingsInput owns its text after mounting, so new keys reseed the inputs.
  useEffect(() => setDrafts(toDrafts(commands)), [savedKey]);
  const pending = alertCommands(drafts.map(({ text }) => text));
  const dirty = JSON.stringify(pending) !== savedKey;

  async function save() {
    if (await onSave(pending)) setDrafts(toDrafts(pending));
  }

  return (
    <>
      {drafts.map((draft, index) => (
        <SettingsInput
          key={draft.key}
          label={`Command ${index + 1}`}
          initialValue={draft.text}
          placeholder="afplay /System/Library/Sounds/Glass.aiff"
          disabled={disabled}
          onChangeText={(text) => setDrafts((current) => current.map((item) => item.key === draft.key ? { ...item, text } : item))}
        />
      ))}
      <SettingsAction label="Add a command" actionLabel="Add" disabled={disabled} onPress={() => setDrafts((current) => [...current, ...toDrafts([""])])} />
      <SettingsAction
        label="Save commands"
        hint="Clear a command to remove it."
        actionLabel="Save"
        disabled={disabled || !dirty}
        onPress={() => void save()}
      />
    </>
  );
}

export function AlertSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(alerts);
  if (settings.status === "loading") return <Text style={{ color: theme.colors.foregroundMuted }}>Loading settings…</Text>;
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="Alerts">
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

  const { values, revision } = settings;
  return (
    <>
      <SettingsSection title="Alerts">
        <SettingsCard>
          <SettingsRow
            label="Commands run in a shell on the daemon machine"
            hint="Timing starts when a turn ends and stops when the next turn starts or the agent is archived. Restarting the daemon or reloading the plugin clears pending alerts."
            error={settings.saveError}
          />
        </SettingsCard>
      </SettingsSection>
      {ALERT_PROFILES.flatMap((profile) => ALERT_LEVELS.map((level) => {
        const config = values[profile][level];
        const remaining = formatRemaining(CACHE_PROFILES[profile].durationMs * CACHE_THRESHOLDS[level]);
        const update = (patch: Partial<typeof config>) => settings.save({
          ...values,
          [profile]: { ...values[profile], [level]: { ...config, ...patch } },
        }, revision);
        return (
          <SettingsSection key={`${profile}-${level}`} title={`${CACHE_PROFILES[profile].name} · ${LEVEL_NAMES[level]}`}>
            <SettingsCard>
              <SettingsSwitch
                label="Run commands"
                hint={`Runs when ${remaining} remain.`}
                value={config.enabled}
                disabled={settings.saving}
                onValueChange={(enabled) => void update({ enabled })}
              />
              <CommandEditor
                commands={config.commands}
                disabled={settings.saving}
                onSave={(commands) => update({ commands })}
              />
            </SettingsCard>
          </SettingsSection>
        );
      }))}
      <SettingsSection title="Environment variables">
        <SettingsCard>
          {ALERT_ENVIRONMENT.map(({ name, description }) => (
            <SettingsRow key={name} label={name} hint={description} />
          ))}
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
