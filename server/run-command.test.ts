/// <reference types="node" />
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createCommandRunner } from "./run-command";

const directory = mkdtempSync(join(tmpdir(), "paseo-cache-countdown-"));

afterEach(() => {
  vi.restoreAllMocks();
});

it("runs a shell command with the alert environment", async () => {
  const runner = createCommandRunner();
  const output = join(directory, "env.txt");
  runner.run(`printf '%s %s' "$PASEO_CACHE_LEVEL" "$PASEO_CACHE_REMAINING" > '${output}'`, { PASEO_CACHE_LEVEL: "danger", PASEO_CACHE_REMAINING: "03:45" });
  await vi.waitFor(() => expect(readFileSync(output, "utf8")).toBe("danger 03:45"));
});

it("logs a failing command", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  createCommandRunner().run("exit 3", {});
  await vi.waitFor(() => expect(error).toHaveBeenCalledWith("[paseo-cache-countdown] Alert command exited with code 3: exit 3"));
});

it("stops running commands during cleanup", async () => {
  const runner = createCommandRunner();
  const marker = join(directory, "late.txt");
  runner.run(`sleep 0.3; touch '${marker}'`, {});
  runner.dispose();
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(existsSync(marker)).toBe(false);
});

process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
