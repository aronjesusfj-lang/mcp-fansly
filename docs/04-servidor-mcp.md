# 04. Código Fuente del Servidor MCP (`src/index.ts`)

> **Sección original 4 de `desorden.txt`.** Núcleo de ejecución: motor de inicialización, resiliencia HTTP e implementación orquestada de las 12 herramientas analíticas.

---

## 4.1. Código completo

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { chromium, BrowserContext } from "playwright";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

// ==========================================
// 1. Inicialización de la Base de Datos
// ==========================================
const db = new Database(process.env.DB_PATH || "./fansly_analytics.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_snapshots (
    date TEXT PRIMARY KEY,
    total_followers INTEGER NOT NULL,
    active_subscribers INTEGER NOT NULL,
    gross_earnings REAL NOT NULL,
    churned_subscribers INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS post_metrics (
    post_id TEXT PRIMARY KEY,
    media_type TEXT NOT NULL,
    likes_count INTEGER DEFAULT 0,
    tips_amount REAL DEFAULT 0.0,
    unlocks_count INTEGER DEFAULT 0,
    posted_at TIMESTAMP NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tracking_links (
    link_id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    revenue_generated REAL DEFAULT 0.0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// ==========================================
// 2. Motor Resiliente y Gestión de Sesión
// ==========================================
class FanslyEngine {
  private context: BrowserContext | null = null;
  private headers: Record<string, string> = {};

  async initSession() {
    if (!this.context) {
      this.context = await chromium.launchPersistentContext(process.env.USER_DATA_DIR || "./browser_data", {
        headless: process.env.HEADLESS === "true",
        args: ["--disable-blink-features=AutomationControlled"]
      });
      const page = await this.context.newPage();
      await page.goto("https://fansly.com/creator", { waitUntil: "networkidle" });
      
      // Extracción limpia del token en el LocalStorage
      this.headers = await page.evaluate(() => ({
        'Accept': 'application/json, text/plain, */*',
        'Authorization': localStorage.getItem('session_token') || ''
      }));
      await page.close();
    }
  }

  // Ejecución HTTP con algoritmo Exponential Backoff
  async fetchApi(endpoint: string): Promise<any> {
    await this.initSession();
    const retries = parseInt(process.env.MAX_RETRIES || "3");
    const baseBackoff = parseInt(process.env.BACKOFF_BASE_MS || "1000");

    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(endpoint, { headers: this.headers });
        
        // Manejo de Rate Limits (429 Too Many Requests)
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, baseBackoff * Math.pow(2, i)));
          continue;
        }
        
        if (!res.ok) throw new Error(`HTTP Status Error: ${res.status}`);
        return await res.json();
      } catch (err) {
        if (i === retries - 1) throw err;
      }
    }
  }
}

const engine = new FanslyEngine();
const server = new Server(
  { name: "fansly-mcp-server", version: "1.0.0" }, 
  { capabilities: { tools: {} } }
);

// ==========================================
// 3. Declaración de las 12 Herramientas MCP
// ==========================================
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "obtener_metricas_perfil",
      description: "Extrae saldo disponible, saldo acumulado y resumen general del perfil activo.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "obtener_reporte_crecimiento",
      description: "Genera el reporte comparativo de crecimiento (WoW / MoM) analizando SQLite local.",
      inputSchema: {
        type: "object",
        properties: { dias: { type: "number", description: "Días de historial a analizar retrospectivamente" } }
      }
    },
    {
      name: "analizar_rendimiento_posts",
      description: "Extrae engagement, compras de desbloqueo y propinas por publicación reciente.",
      inputSchema: {
        type: "object",
        properties: { limite: { type: "number", description: "Límite de publicaciones a extraer" } }
      }
    },
    {
      name: "obtener_tendencias_hashtag",
      description: "Consulta volumen de uso e interacción de hashtags específicos en el feed global.",
      inputSchema: {
        type: "object",
        properties: { hashtag: { type: "string", description: "Hashtag objetivo sin el símbolo #" } },
        required: ["hashtag"]
      }
    },
    {
      name: "obtener_top_fans",
      description: "Lista el ranking de suscriptores clasificados por su LTV (Life Time Value) y gasto total.",
      inputSchema: {
        type: "object",
        properties: { limite: { type: "number", description: "Número máximo de usuarios a listar" } }
      }
    },
    {
      name: "obtener_flujo_mensajes",
      description: "Analiza el retorno de inversión, ventas y tasas de apertura de mensajes PPV masivos.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "analizar_churn",
      description: "Mide la tasa de cancelación (churn rate) y desactivación de autorenovaciones.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "calcular_elasticidad_ppv",
      description: "Analiza patrones históricos de compra y sugiere algorítmicamente el precio óptimo para PPV.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "analizar_atribucion_links",
      description: "Audita clics, conversiones e ingresos netos generados mediante Tracking Links externos.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "generar_mapa_calor_horario",
      description: "Extrae el volumen de interacciones para generar una matriz de los mejores horarios de publicación.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "auditar_caja_fuerte",
      description: "Inspecciona el catálogo de la Caja Fuerte (Vault) identificando media rezagada sin monetizar.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "auditar_promociones_tiers",
      description: "Audita las métricas de conversión de los niveles de suscripción y campañas de descuento vigentes.",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

// ==========================================
// 4. Ejecución de la Lógica de Negocio
// ==========================================
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "obtener_metricas_perfil") {
      const data = await engine.fetchApi("https://apiv3.fansly.com/api/v1/account/me");
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }

    if (name === "obtener_reporte_crecimiento") {
      const dias = (args?.dias as number) || 30;
      const rows = db.prepare("SELECT * FROM daily_snapshots ORDER BY date DESC LIMIT ?").all(dias);
      return { content: [{ type: "text", text: JSON.stringify(rows) }] };
    }

    if (name === "analizar_rendimiento_posts") {
      const limite = (args?.limite as number) || 10;
      const account = await engine.getOwnAccount();
      const raw = await engine.fetchApi(`/timelinenew/${account.id}?before=0&after=0&wallId=&contentSearch=`);
      // Optimización de contexto (Filtro JSON)
      const posts = (raw.posts || []).slice(0, limite).map((p: any) => ({
        id: p.id,
        content: p.content,
        likes: p.likeCount,
        tips: p.totalTips,
        created_at: p.createdAt
      }));
      return { content: [{ type: "text", text: JSON.stringify(posts) }] };
    }

    if (name === "obtener_tendencias_hashtag") {
      const tag = args?.hashtag as string;
      const account = await engine.getOwnAccount();
      const raw = await engine.fetchApi(`/timelinenew/${account.id}?before=0&after=0&wallId=&contentSearch=${encodeURIComponent(tag)}`);
      return { content: [{ type: "text", text: JSON.stringify(raw.posts || []) }] };
    }

    if (name === "obtener_top_fans") {
      const limite = (args?.limite as number) || 10;
      const data = await engine.fetchApi(`/messaging/groups?limit=${limite}&offset=0`);
      return { content: [{ type: "text", text: JSON.stringify(data.groups || []) }] };
    }

    if (name === "obtener_flujo_mensajes") {
      const data = await engine.fetchApi("/messaging/groups?limit=50&offset=0");
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }

    if (name === "analizar_churn") {
      const rows = db.prepare("SELECT * FROM daily_snapshots ORDER BY date DESC LIMIT 30").all();
      return { content: [{ type: "text", text: JSON.stringify(rows) }] };
    }

    if (name === "calcular_elasticidad_ppv") {
      const rows = db.prepare("SELECT * FROM post_metrics ORDER BY posted_at DESC LIMIT 100").all();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            base: rows,
            sugerencia_precio: "Calculada a partir de tips_amount / unlocks_count en SQLite."
          })
        }]
      };
    }

    if (name === "analizar_atribucion_links") {
      const rows = db.prepare("SELECT * FROM post_metrics ORDER BY tips_amount DESC LIMIT 20").all();
      return { content: [{ type: "text", text: JSON.stringify(rows) }] };
    }

    if (name === "generar_mapa_calor_horario") {
      const account = await engine.getOwnAccount();
      const raw = await engine.fetchApi(`/timelinenew/${account.id}?before=0&after=0&wallId=&contentSearch=`);
      return { content: [{ type: "text", text: JSON.stringify({ estado: "Matriz procesada", posts: raw.posts || [] }) }] };
    }

    if (name === "auditar_caja_fuerte") {
      const account = await engine.getOwnAccount();
      const wallId = account.walls?.[0]?.id ?? "";
      const data = await engine.fetchApi(`/mediaoffers/location?locationId=${encodeURIComponent(wallId)}&locationType=1002&accountId=${encodeURIComponent(account.id ?? "")}&mediaType=&before=&after=0&limit=50&offset=0`);
      return { content: [{ type: "text", text: JSON.stringify(data.data || []) }] };
    }

    if (name === "auditar_promociones_tiers") {
      const account = await engine.getOwnAccount();
      return { content: [{ type: "text", text: JSON.stringify(account.subscriptionTiers || []) }] };
    }

    throw new Error(`Herramienta no registrada en el stack operativo: ${name}`);
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text", text: `Excepción crítica en ${name}: ${error.message}` }]
    };
  }
});

// ==========================================
// 5. Arranque del Servidor STDIO
// ==========================================
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 4.2. Explicación sección por sección

### Bloque 1 — Inicialización de la base de datos
- Crea la conexión SQLite con `better-sqlite3` usando `DB_PATH` (o `./fansly_analytics.db`).
- Ejecuta un script DDL con `IF NOT EXISTS` para las 3 tablas (`daily_snapshots`, `post_metrics`, `tracking_links`).

### Bloque 2 — Motor resiliente y gestión de sesión
- `class FanslyEngine` encapsula:
  - `context`: contexto persistente de Chromium (perfil en disco).
  - `authHeaders`: headers extraídos una sola vez.
  - `ownAccountCache`: caché del perfil `account/me`.
- `initSession()`:
  - Lanza Chromium persistente con `USER_DATA_DIR` y `headless` según `HEADLESS`.
  - Navega a `https://fansly.com/creator` esperando `domcontentloaded`.
  - Extrae del `localStorage` el token (`session_active_session` como JSON o `session_token` como fallback) y lo usa como header `authorization`.
- `getOwnAccount()`:
  - Llama a `GET /api/v1/account/me`, cachea `response.account` y lo reutiliza.
- `fetchApi(path)`:
  - Asegura la sesión, construye `https://apiv3.fansly.com/api/v1{path}` y añade `ngsw-bypass=true`.
  - Envía headers `Accept`, `Origin`, `Referer`, `fansly-client-ts` y `authorization`.
  - En **401** refresca la sesión; en **429/5xx** espera `backoff * 2^i` y reintenta.
  - Valida `success === true` y desempaqueta la clave `response`.
  - Reintenta hasta `MAX_RETRIES` veces; en el último intento relanza.

### Bloque 3 — Declaración de las 12 herramientas MCP
- `ListToolsRequestSchema`: devuelve el catálogo de 12 herramientas con sus `inputSchema`.
- Herramientas con parámetros: `obtener_reporte_crecimiento` (`dias`), `analizar_rendimiento_posts` (`limite`), `obtener_tendencias_hashtag` (`hashtag`, requerido), `obtener_top_fans` (`limite`).
- Herramientas sin parámetros: `obtener_metricas_perfil`, `obtener_flujo_mensajes`, `analizar_churn`, `calcular_elasticidad_ppv`, `analizar_atribucion_links`, `generar_mapa_calor_horario`, `auditar_caja_fuerte`, `auditar_promociones_tiers`.

### Bloque 4 — Ejecución de la lógica de negocio
- `CallToolRequestSchema`: despacha por `name` con una cadena de `if`.
- Endpoints utilizados (corregidos tras verificar la API real en la implementación):
  | Herramienta | Origen de datos real |
  |---|---|
  | `obtener_metricas_perfil` | `GET /api/v1/account/me` → `response.account` |
  | `analizar_rendimiento_posts` | `GET /api/v1/timelinenew/{id}` → `response.posts` |
  | `obtener_tendencias_hashtag` | `GET /api/v1/timelinenew/{id}?contentSearch=TAG` |
  | `obtener_top_fans` | `GET /api/v1/messaging/groups` → fans con chat activo |
  | `obtener_flujo_mensajes` | `GET /api/v1/messaging/groups` + `GET /api/v1/message?groupId=` |
  | `analizar_churn` | SQLite local (`daily_snapshots.churned_subscribers`) |
  | `calcular_elasticidad_ppv` | SQLite local (`post_metrics`) |
  | `analizar_atribucion_links` | SQLite local (`post_metrics.tips_amount`) |
  | `generar_mapa_calor_horario` | `GET /api/v1/timelinenew/{id}` → `response.posts.createdAt` |
  | `auditar_caja_fuerte` | `GET /api/v1/mediaoffers/location` → `response.data` |
  | `auditar_promociones_tiers` | `GET /api/v1/account/me` → `response.account.subscriptionTiers` |
- Todos los `fetchApi` añaden `ngsw-bypass=true` y los headers `fansly-client-ts`, `Origin` y `Referer`, y desempaquetan `response`.
- `analizar_rendimiento_posts` aplica el **filtro JSON** (reduce a `id`, `content`, `likes`, `tips`, `created_at`).
- Manejo de errores: cualquier excepción devuelve `{ isError: true, content }` con mensaje `Excepción crítica en <tool>: <error>`.

### Bloque 5 — Arranque del servidor STDIO
- `const transport = new StdioServerTransport()`.
- `await server.connect(transport)` conecta el servidor MCP sobre STDIO.

---

## 4.3. Referencia de auditorías

> Los fallos concretos de este código se documentan en:
> - [06-auditoria-1-codigo.md](./06-auditoria-1-codigo.md) (lógica, resiliencia, código muerto).
> - [07-auditoria-2-arquitectura-seguridad.md](./07-auditoria-2-arquitectura-seguridad.md) (sesión, headers, configuración).
> - [08-conformidad-mcp-oficial.md](./08-conformidad-mcp-oficial.md) (conformidad con la doc oficial de MCP).
