import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps, MessagingGroup } from "./types.js";
import { pearsonCorrelation, toIso, toNumber } from "./helpers.js";

interface MessagePayload {
  messages?: Array<{
    id?: string;
    content?: string;
    createdAt?: number | string;
    fromAccountId?: string;
    [key: string]: unknown;
  }>;
  tips?: Array<{ amount?: number; fromAccountId?: string; createdAt?: number | string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export function registerMessagingTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "obtener_flujo_mensajes",
    {
      title: "Flujo de mensajes",
      description:
        "Lista conversaciones (messaging/groups) y agrega propinas recibidas en los mensajes recientes (message).",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const data = await deps.engine.fetchApi<{ groups?: MessagingGroup[] }>(
        "/messaging/groups?limit=50&offset=0"
      );
      const groups = data.groups ?? [];
      let propinas_total = 0;
      let propinas_contadas = 0;
      const grupos_analizados = Math.min(groups.length, 10);

      for (const group of groups.slice(0, grupos_analizados)) {
        if (!group.id) continue;
        try {
          const payload = await deps.engine.fetchApi<MessagePayload>(
            `/message?groupId=${encodeURIComponent(group.id)}&limit=25`
          );
          const tips = payload.tips ?? [];
          propinas_contadas += tips.length;
          propinas_total += tips.reduce((sum, tip) => sum + toNumber(tip.amount), 0);
        } catch {
          continue;
        }
      }

      const resumen = {
        total_conversaciones: groups.length,
        grupos_analizados,
        propinas_contadas,
        propinas_total,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "ranking_fans_gasteros",
    {
      title: "Ranking de fans que más gastan",
      description:
        "Agrupa propinas por fan (fromAccountId) en los mensajes recientes y ordena por gasto total.",
      inputSchema: z.object({
        limite: z.number().int().min(1).max(50).optional().describe("Número máximo de fans a listar"),
      }),
    },
    async ({ limite }) => {
      const limit = limite ?? 10;
      const data = await deps.engine.fetchApi<{ groups?: MessagingGroup[] }>(
        "/messaging/groups?limit=50&offset=0"
      );
      const groups = data.groups ?? [];
      const gastosPorFan = new Map<string, { username: string | null; total: number; propinas: number }>();

      for (const group of groups) {
        if (!group.id) continue;
        const user = group.users?.find((u) => typeof u.username === "string" && u.username.length > 0);
        const username = user?.username ?? null;
        const userId = user?.userId ?? user?.id ?? null;
        try {
          const payload = await deps.engine.fetchApi<MessagePayload>(
            `/message?groupId=${encodeURIComponent(group.id)}&limit=50`
          );
          const tips = payload.tips ?? [];
          for (const tip of tips) {
            const amount = toNumber(tip.amount);
            if (amount <= 0) continue;
            const fanKey = String(tip.fromAccountId ?? userId ?? group.id);
            const current = gastosPorFan.get(fanKey) ?? { username, total: 0, propinas: 0 };
            current.total += amount;
            current.propinas += 1;
            gastosPorFan.set(fanKey, current);
          }
        } catch {
          continue;
        }
      }

      const ranking = [...gastosPorFan.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, limit)
        .map(([fanId, dataRow], index) => ({
          rank: index + 1,
          fan_id: fanId,
          username: dataRow.username,
          gasto_total: dataRow.total,
          propinas: dataRow.propinas,
        }));

      const resumen = {
        total_fans_con_gasto: gastosPorFan.size,
        ranking,
        notas:
          ranking.length === 0
            ? "Sin propinas detectadas en los mensajes recientes."
            : "Basado en los últimos 50 mensajes por conversación; puede requerir más historial.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "correlacion_mensajes_posts",
    {
      title: "Correlación mensajes ↔ posts",
      description:
        "Cruza la actividad de mensajes por día (messaging/groups) con las publicaciones por día para medir si publicar impulsa los mensajes (correlación de Pearson).",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const data = await deps.engine.fetchApi<{ groups?: MessagingGroup[] }>(
        "/messaging/groups?limit=100&offset=0"
      );
      const groups = data.groups ?? [];
      const mensajesPorDia = new Map<string, number>();
      for (const group of groups) {
        const iso = toIso(group.lastMessage?.createdAt);
        if (!iso) continue;
        const dia = iso.slice(0, 10);
        mensajesPorDia.set(dia, (mensajesPorDia.get(dia) ?? 0) + 1);
      }

      const account = await deps.engine.getOwnAccount();
      const timeline = await deps.engine.getTimeline(account.id ?? "", { limit: 50 });
      const postsPorDia = new Map<string, number>();
      for (const post of timeline.posts ?? []) {
        const iso = toIso(post.createdAt);
        if (!iso) continue;
        const dia = iso.slice(0, 10);
        postsPorDia.set(dia, (postsPorDia.get(dia) ?? 0) + 1);
      }

      const dias = [...new Set([...mensajesPorDia.keys(), ...postsPorDia.keys()])].sort();
      const xs = dias.map((d) => postsPorDia.get(d) ?? 0);
      const ys = dias.map((d) => mensajesPorDia.get(d) ?? 0);
      const r = pearsonCorrelation(xs, ys);

      const resumen = {
        dias_analizados: dias.length,
        conversaciones_activas: groups.length,
        correlacion_pearson: r,
        interpretacion:
          r === null
            ? "Datos insuficientes para correlacionar (se necesitan días con actividad variada)."
            : r >= 0.5
              ? "Correlación positiva fuerte: publicar coincide con picos de mensajes. Mantén la frecuencia."
              : r >= 0.2
                ? "Correlación positiva débil: publicar ayuda algo a activar mensajes."
                : r <= -0.2
                  ? "Correlación negativa: los picos de mensajes no siguen a las publicaciones."
                  : "Sin relación aparente entre publicar y recibir mensajes.",
        actividad_por_dia: dias.map((d) => ({
          dia: d,
          posts: postsPorDia.get(d) ?? 0,
          conversaciones_con_mensaje: mensajesPorDia.get(d) ?? 0,
        })),
        notas:
          "Proxy basado en el último mensaje de cada conversación; la API no expone el historial completo de mensajes por fecha.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "metricas_mensajeria",
    {
      title: "Métricas de mensajería",
      description:
        "Resume conversaciones activas, propinas por conversación y fans con interacción reciente.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const data = await deps.engine.fetchApi<{ groups?: MessagingGroup[] }>(
        "/messaging/groups?limit=100&offset=0"
      );
      const groups = data.groups ?? [];
      const conUltimoMensaje = groups.filter((g) => g.lastMessage?.content);
      const resumen = {
        total_conversaciones: groups.length,
        conversaciones_con_mensaje: conUltimoMensaje.length,
        fans_unicos: groups.length,
        notas:
          groups.length === 0
            ? "Sin conversaciones activas. Los fans deben iniciar chat para aparecer aquí."
            : "La API no expone tiempo de respuesta; este resumen mide volumen de interacción.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "calcular_elasticidad_ppv",
    {
      title: "Sugerencia de precio PPV",
      description:
        "Analiza patrones históricos de compra desde SQLite y sugiere un precio orientativo para PPV.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const posts = deps.repository.getPostMetrics(100);
      const desbloqueos = posts.reduce((sum, post) => sum + post.unlocks_count, 0);
      const ingresos = posts.reduce((sum, post) => sum + post.tips_amount, 0);

      const resultado = {
        notas:
          desbloqueos === 0
            ? "Sin datos históricos de desbloqueos en SQLite. Registra snapshots diarios para obtener una sugerencia basada en datos."
            : `Basado en ${posts.length} publicaciones con ${desbloqueos} desbloqueos y ${ingresos.toFixed(2)} en propinas.`,
        sugerencia_precio_orientativa:
          desbloqueos === 0 || ingresos === 0
            ? null
            : (ingresos / desbloqueos).toFixed(2),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultado) }],
        structuredContent: resultado,
      };
    }
  );

  server.registerTool(
    "sugerencia_ppv_tipo",
    {
      title: "Precio PPV por tipo de contenido",
      description:
        "Sugiere precio PPV segmentado por tipo (video, imagen, bundle) usando media-vault y métricas históricas.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const vault = deps.repository.getVaultMedia();
      const posts = deps.repository.getPostMetrics(100);

      const porTipo = new Map<string, { media: number; likes: number; unlocks: number; precio_total: number; con_precio: number }>();
      for (const item of vault) {
        const type = item.media_type || "desconocido";
        const current = porTipo.get(type) ?? { media: 0, likes: 0, unlocks: 0, precio_total: 0, con_precio: 0 };
        current.media += 1;
        current.likes += item.likes;
        current.unlocks += item.unlocks;
        current.precio_total += item.price;
        if (item.price > 0) current.con_precio += 1;
        porTipo.set(type, current);
      }

      const ingresosTotales = posts.reduce((s, p) => s + p.tips_amount, 0);
      const desbloqueosPosts = posts.reduce((s, p) => s + p.unlocks_count, 0);
      const desbloqueosVault = vault.reduce((s, item) => s + item.unlocks, 0);

      const sugerencias = [...porTipo.entries()].map(([tipo, datos]) => ({
        tipo,
        media: datos.media,
        likes_promedio: datos.media > 0 ? Number((datos.likes / datos.media).toFixed(2)) : 0,
        desbloqueos: datos.unlocks,
        ingreso_estimado: Number((datos.unlocks * (datos.con_precio > 0 ? datos.precio_total / datos.con_precio : 0)).toFixed(2)),
        precio_promedio_existente:
          datos.con_precio > 0 ? Number((datos.precio_total / datos.con_precio).toFixed(2)) : 0,
        sugerencia_usd:
          tipo === "video"
            ? "4.99-9.99"
            : tipo === "imagen"
              ? "2.99-4.99"
              : tipo === "bundle"
                ? "7.99-14.99"
                : "3.99-6.99",
      }));

      const resultado = {
        ingresos_registrados: ingresosTotales,
        desbloqueos_registrados: desbloqueosPosts,
        desbloqueos_vault: desbloqueosVault,
        sugerencias_por_tipo: sugerencias,
        notas:
          vault.length === 0
            ? "Caja fuerte vacía en SQLite. Ejecuta auditar_caja_fuerte para poblar media_vault."
            : "Sugerencias basadas en benchmarks del nicho; ajusta según respuesta de tu audiencia.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resultado) }],
        structuredContent: resultado,
      };
    }
  );
}
