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
              "Ejecuta obtener_metricas_perfil, analizar_rendimiento_posts, analizar_churn y tasa_conversion_audiencia. " +
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
              "Ejecuta auditar_caja_fuerte, contenido_rezagado y generar_mapa_calor_horario. " +
              "Después propón una estrategia para monetizar el media rezagado en los mejores horarios.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "dashboard-semanal",
    {
      title: "Dashboard semanal",
      description:
        "Genera el reporte semanal completo: crecimiento, ingresos, rendimiento de posts, hashtags y competencia.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Ejecuta obtener_reporte_crecimiento (dias=7), reporte_ingresos (dias=7), analizar_rendimiento_posts (limite=20), " +
              "analizar_hashtags, horarios_publicacion y benchmark_competencia. " +
              "Resume en un dashboard semanal con: tendencias, mejores formatos, hashtags ganadores y acciones recomendadas.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "plan-contenido-semanal",
    {
      title: "Plan de contenido semanal",
      description:
        "Diseña el calendario de publicaciones de la próxima semana con base en datos históricos.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Ejecuta horarios_publicacion, interaccion_contenido, analizar_hashtags y optimizador_fyp. " +
              "Después diseña un plan de contenido para los próximos 7 días: qué tipo de post, a qué hora, con qué hashtags, " +
              "y qué repostear de la caja fuerte.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "auditoria-competencia",
    {
      title: "Auditoría de competencia",
      description:
        "Compara el perfil contra los competidores registrados y propone acciones para cerrar la brecha.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Ejecuta snapshot_competidores, benchmark_competencia, clasificar_competidores y scoreboard_general. " +
              "Analiza nuestra posición vs competidores y propón 5 acciones concretas para mejorar.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "analisis-post-profundo",
    {
      title: "Análisis profundo de un post",
      description:
        "Analiza a fondo un post específico: score, copy, hashtags, huella y curva de vida.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Pide al usuario el ID de un post y ejecuta analizar_post, curva_vida_post y top_bottom_posts. " +
              "Explica por qué rinde así y qué cambiarías en el próximo post similar.",
          },
        },
      ],
    })
  );
}
