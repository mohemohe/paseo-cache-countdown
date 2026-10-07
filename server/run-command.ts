/// <reference types="node" />
import { spawn, type ChildProcess } from "node:child_process";

/** Runs shell commands on the daemon machine and stops any still running during cleanup. */
export function createCommandRunner() {
  const children = new Set<ChildProcess>();

  return {
    run(command: string, env: Readonly<Record<string, string>>) {
      const child = spawn(command, { shell: true, env: { ...process.env, ...env }, stdio: "ignore" });
      children.add(child);
      child.on("error", (error) => {
        children.delete(child);
        console.error(`[paseo-cache-countdown] Alert command could not start: ${command}`, error);
      });
      child.on("exit", (code, signal) => {
        children.delete(child);
        if (code !== 0 && signal === null) console.error(`[paseo-cache-countdown] Alert command exited with code ${code}: ${command}`);
      });
    },
    dispose() {
      for (const child of children) child.kill();
      children.clear();
    },
  };
}
