import { expect, it } from "vitest";
import { alertCommands, alerts } from "./alerts";

it("disables every alert without commands by default", () => {
  const off = { enabled: false, commands: [] };
  expect(alerts.schema.parse({})).toEqual({
    codex: { warning: off, danger: off },
    claude: { warning: off, danger: off },
    "claude-subagent": { warning: off, danger: off },
  });
});

it("fills missing levels and profiles around saved values", () => {
  const values = alerts.schema.parse({ claude: { danger: { enabled: true, commands: ["say red"] } } });
  expect(values.claude).toEqual({
    warning: { enabled: false, commands: [] },
    danger: { enabled: true, commands: ["say red"] },
  });
  expect(values.codex.warning.enabled).toBe(false);
});

it("trims commands and drops blank ones", () => {
  expect(alertCommands(["  say one ", "", "   ", "say two"])).toEqual(["say one", "say two"]);
});
