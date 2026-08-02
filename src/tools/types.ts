import type { FanslyEngine } from "../engine/fansly.js";
import type { AnalyticsRepository } from "../db/repository.js";

export interface ToolDeps {
  engine: FanslyEngine;
  repository: AnalyticsRepository;
}

export interface MessagingGroup {
  id?: string;
  users?: Array<{
    userId?: string;
    username?: string;
    displayName?: string;
    [key: string]: unknown;
  }>;
  lastMessage?: { content?: string; createdAt?: string; [key: string]: unknown };
  [key: string]: unknown;
}
