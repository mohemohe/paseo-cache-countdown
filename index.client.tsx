import type { PluginClientContext } from "@getpaseo/plugin/client";
import { registerCountdowns } from "./client/register";

export default function contribute(client: PluginClientContext) {
  return registerCountdowns(client);
}
