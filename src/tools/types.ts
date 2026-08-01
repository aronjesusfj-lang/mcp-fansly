import type { McpServer } from "@modelcontextprotocol/server";
import type { FanslyEngine } from "../engine/fansly.js";
import type { AnalyticsRepository } from "../db/repository.js";

export interface ToolDeps {
  engine: FanslyEngine;
  repository: AnalyticsRepository;
}

export interface ToolModule {
  register(server: McpServer, deps: ToolDeps): void;
}
