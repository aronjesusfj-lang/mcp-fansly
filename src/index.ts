import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.js";
import { createEngine } from "./engine/fansly.js";
import { AnalyticsRepository } from "./db/repository.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
  const config = loadConfig();

  const engine = createEngine(config);
  const repository = new AnalyticsRepository(config.dbPath);

  const server = new McpServer(
    { name: "fansly-mcp", version: "0.2.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  registerResources(server, repository);
  registerPrompts(server);
  registerTools(server, { engine, repository });

  const snapshotDaily = async (): Promise<void> => {
    try {
      const account = await engine.getOwnAccount();
      const today = new Date().toISOString().slice(0, 10);
      repository.upsertDailySnapshot({
        date: today,
        total_followers: account.followCount ?? 0,
        active_subscribers: account.subscriberCount ?? 0,
        gross_earnings: 0,
        churned_subscribers: 0,
      });
      try {
        const subs = await engine.getSubscriptions();
        const stats = subs.stats ?? {};
        repository.upsertSubscribers({
          date: today,
          total_active: (stats as Record<string, unknown>).totalActive as number ?? 0,
          total_expired: (stats as Record<string, unknown>).totalExpired as number ?? 0,
          total: (stats as Record<string, unknown>).total as number ?? 0,
        });
      } catch {
        /* las suscripciones pueden fallar sin dañar el snapshot */
      }
      const competitors = repository.getCompetitors();
      for (const competitor of competitors) {
        try {
          const profiles = await engine.getPublicAccounts([competitor.account_id]);
          const profile = profiles[0];
          if (!profile) continue;
          const stats = profile.timelineStats ?? {};
          repository.upsertCompetitorSnapshot({
            account_id: competitor.account_id,
            date: today,
            follow_count: profile.followCount ?? 0,
            subscriber_count: profile.subscriberCount ?? 0,
            image_count: stats.imageCount ?? 0,
            video_count: stats.videoCount ?? 0,
            bundle_count: stats.bundleCount ?? 0,
          });
        } catch {
          continue;
        }
      }
    } catch {
      /* el scheduler no debe tumbar el servidor */
    }
  };

  const intervalMs = parseNumber(process.env.SNAPSHOT_INTERVAL_MS, 0);
  const scheduler = intervalMs > 0 ? setInterval(() => void snapshotDaily(), intervalMs) : null;
  if (scheduler) {
    void snapshotDaily();
  }

  const shutdown = async (): Promise<void> => {
    if (scheduler) clearInterval(scheduler);
    console.error("Fansly MCP server: cerrando recursos...");
    await engine.close();
    repository.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  process.stdin.on("end", () => void shutdown());

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Fansly MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
