import type { McpServer } from "@modelcontextprotocol/server";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "auditar-perfil",
    {
      title: "Auditoría integral del perfil",
      description:
        "Ejecuta las herramientas clave del servidor y resume recomendaciones de monetización.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Ejecuta obtener_metricas_perfil, analizar_rendimiento_posts y analizar_churn. " +
              "Después resume las 3 recomendaciones de monetización más importantes para el perfil.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "analizar-contenido-rezagado",
    {
      title: "Analizar contenido rezagado",
      description:
        "Inspecciona la caja fuerte y sugiere publicaciones para monetizar.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Ejecuta auditar_caja_fuerte y generar_mapa_calor_horario. " +
              "Después propón una estrategia para monetizar el media rezagado en los mejores horarios.",
          },
        },
      ],
    })
  );
}
