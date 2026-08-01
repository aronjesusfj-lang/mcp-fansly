import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";
import { registerMetricsTools } from "./metrics.js";
import { registerPostsTools } from "./posts.js";
import { registerSubscribersTools } from "./subscribers.js";
import { registerMessagingTools } from "./messaging.js";
import { registerTrackingTools } from "./tracking.js";
import { registerVaultTools } from "./vault.js";

export function registerTools(server: McpServer, deps: ToolDeps): void {
  registerMetricsTools(server, deps);
  registerPostsTools(server, deps);
  registerSubscribersTools(server, deps);
  registerMessagingTools(server, deps);
  registerTrackingTools(server, deps);
  registerVaultTools(server, deps);
}
