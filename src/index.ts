import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.js";
import { createEngine } from "./engine/fansly.js";
import { AnalyticsRepository } from "./db/repository.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const engine = createEngine(config);
  const repository = new AnalyticsRepository(config.dbPath);

  const server = new McpServer(
    { name: "fansly-mcp", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  registerResources(server, repository);
  registerPrompts(server);
  registerTools(server, { engine, repository });

  const shutdown = async (): Promise<void> => {
    console.error("Fansly MCP server: cerrando recursos...");
    await engine.close();
    repository.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Fansly MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
