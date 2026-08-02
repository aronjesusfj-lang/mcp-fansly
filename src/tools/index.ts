import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";
import { registerMetricsTools } from "./metrics.js";
import { registerAccountsTools } from "./accounts.js";
import { registerPostsTools } from "./posts.js";
import { registerSubscribersTools } from "./subscribers.js";
import { registerMessagingTools } from "./messaging.js";
import { registerTrackingTools } from "./tracking.js";
import { registerVaultTools } from "./vault.js";
import { registerCompetitorsTools } from "./competitors.js";
import { registerSnapshotTool } from "./snapshot.js";

export function registerTools(server: McpServer, deps: ToolDeps): void {
  registerMetricsTools(server, deps);
  registerAccountsTools(server, deps);
  registerPostsTools(server, deps);
  registerSubscribersTools(server, deps);
  registerMessagingTools(server, deps);
  registerTrackingTools(server, deps);
  registerVaultTools(server, deps);
  registerCompetitorsTools(server, deps);
  registerSnapshotTool(server, deps);
}
