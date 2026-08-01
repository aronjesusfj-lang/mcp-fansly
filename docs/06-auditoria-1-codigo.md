# 06. Auditoría 1 — Código y Lógica (`src/index.ts`)

> **Propósito:** detección de bugs, mal criterio, configuraciones deficientes y código basura en el código fuente del servidor MCP, con correcciones siguiendo buenas prácticas de programación.
>
> **Método:** revisión sistemática línea por línea del archivo `src/index.ts` (Sección 4 de `desorden.txt`) y su interacción con la base de datos (Sección 3) y la configuración (Sección 2).

---

## Resumen ejecutivo

| Severidad | Total |
|-----------|-------|
| 🔴 Crítico | 4 |
| 🟠 Alto | 6 |
| 🟡 Medio | 5 |
| 🔵 Bajo | 3 |
| **Total** | **18** |

---

## A1-1. 🔴 El motor HTTP nunca comparte las cookies del navegador

- **Archivo/línea:** `src/index.ts` — `fetchApi()` (bloque 2).
- **Evidencia:**
  ```typescript
  async fetchApi(endpoint: string): Promise<any> {
    await this.initSession();
    ...
    const res = await fetch(endpoint, { headers: this.headers });
  ```
- **Problema:** `this.headers` solo contiene `Accept` y `Authorization` (del `localStorage`). El `fetch` se ejecuta en **Node.js**, fuera del contexto del navegador, por lo que **no envía las cookies** de sesión del perfil persistente. Fansly autentica vía cookies de sesión; sin ellas, las peticiones devolverán `401 Unauthorized`. El diseño "navegador persistente + fetch de Node" queda desactivado en la práctica.
- **Corrección (buenas prácticas):** ejecutar las peticiones **dentro del contexto del navegador** (via `page.request` o `context.request`) para heredar cookies automáticamente, o extraer el valor de la cookie `session_token` desde el contexto y reenviarla en cada petición junto con `Cookie`. (Véase [07-auditoria-2-arquitectura-seguridad.md](./07-auditoria-2-arquitectura-seguridad.md) → A2-1.)

---

## A1-2. 🔴 El token se extrae una sola vez y nunca se refresca

- **Archivo/línea:** `src/index.ts` — `initSession()`.
- **Evidencia:**
  ```typescript
  async initSession() {
    if (!this.context) { ... this.headers = await page.evaluate(...); }
  }
  ```
- **Problema:** la extracción del `session_token` ocurre **solo una vez** al lanzar el contexto. Si el token caduca o la sesión muere, `this.context` ya está cacheado y nunca se re-ejecuta `initSession`, dejando el servidor con headers obsoletos indefinidamente.
- **Corrección:** implementar refresco de sesión: detectar `401` y volver a extraer headers (re-evaluar `localStorage`), o reintentar `initSession` ante fallos de autenticación, con un límite de intentos.

---

## A1-3. 🔴 El algoritmo de reintentos puede retornar `undefined` silenciosamente

- **Archivo/línea:** `src/index.ts` — `fetchApi()`.
- **Evidencia:**
  ```typescript
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(endpoint, { headers: this.headers });
      if (res.status === 429) { await sleep(...); continue; }
      ...
    } catch (err) {
      if (i === retries - 1) throw err;
    }
  }
  // sin return explícito → undefined si se agotan los retries con 429
  ```
- **Problema:** si todas las iteraciones terminan en `429`, el bucle termina y la función **retorna `undefined`** sin lanzar error. Las herramientas que usan el resultado producirán salidas corruptas o errores confusos ("no se puede leer propiedad de undefined").
- **Corrección:**
  ```typescript
  const lastError = new Error(`Request failed after ${retries} attempts`);
  if (res.status === 429) {
    await sleep(...);
    lastError = new Error(`Rate limited (429) tras ${i + 1} intentos`);
    continue;
  }
  throw lastError;
  ```

---

## A1-4. 🔴 Los errores no-429 se tragan sin backoff

- **Archivo/línea:** `src/index.ts` — bloque `catch`.
- **Evidencia:**
  ```typescript
  } catch (err) {
    if (i === retries - 1) throw err;
  }
  ```
- **Problema:** para errores de red o `5xx`, el `catch` relanza **solo** en el último intento, pero en los intentos intermedios **no espera ningún backoff** → reintenta de inmediato (efecto "thundering herd") y consume los `MAX_RETRIES` sin pausa.
- **Corrección:** aplicar el mismo backoff exponencial a cualquier error recuperable (429, 5xx, ECONNRESET) antes del siguiente intento.

---

## A1-5. 🟠 Sin timeout en `fetch` ni en `page.goto`; `networkidle` puede colgarse

- **Archivo/línea:** `initSession()` (`page.goto(..., { waitUntil: "networkidle" })`) y `fetchApi()`.
- **Problema:** `networkidle` en páginas pesadas (como el dashboard de Fansly) puede no dispararse nunca, colgando el arranque. El `fetch` de Node, sin `AbortController`, puede quedarse esperando indefinidamente.
- **Corrección:**
  ```typescript
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  // y en fetch:
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const res = await fetch(endpoint, { headers, signal: controller.signal });
  clearTimeout(timer);
  ```

---

## A1-6. 🟠 Endpoints de la API probablemente inventados ✅ RESUELTO

- **Archivo/línea:** `src/index.ts` — Bloque 4 (varios endpoints).
- **Endpoints dudosos (antes):** `/api/v1/stat/topfans`, `/api/v1/message/stats`, `/api/v1/subscribers/churn`, `/api/v1/tracking/links`, `/api/v1/vault/media`, `/api/v1/subscriptions/tiers`, `/api/v1/tag/search`.
- **Problema:** no se ha verificado que estos endpoints existan en la API v3 de Fansly. Si son inventados, todas esas herramientas devolverán `404`/errores y el valor del servidor es nulo.
- **Resolución (verificada contra API real):** las herramientas fueron re-escritas usando únicamente endpoints confirmados:
  - `GET /api/v1/account/me` → `response.account` (seguidores, `timelineStats`, `subscriptionTiers`, `walls`).
  - `GET /api/v1/timelinenew/{id}` → `response.posts` (con `contentSearch` para hashtags).
  - `GET /api/v1/messaging/groups` y `GET /api/v1/message?groupId=` → conversaciones y propinas.
  - `GET /api/v1/mediaoffers/location` → media del muro (caja fuerte).
  - Métricas sin endpoint público (churn, elasticidad PPV, atribución de ingresos) se calculan desde SQLite local.
  - El motor añade `ngsw-bypass=true`, headers `fansly-client-ts`/`Origin`/`Referer`, valida `success` y desempaqueta `response`.

---

## A1-7. 🟠 La base de datos nunca se escribe (código muerto)

- **Archivo/línea:** `src/index.ts` — Bloque 1 (DDL) y `obtener_reporte_crecimiento`.
- **Evidencia:** el DDL crea `daily_snapshots`, `post_metrics` y `tracking_links`, pero **ninguna herramienta inserta datos**. Solo se lee:
  ```typescript
  const rows = db.prepare("SELECT * FROM daily_snapshots ORDER BY date DESC LIMIT ?").all(dias);
  ```
- **Problema:** `obtener_reporte_crecimiento` siempre devolverá una lista vacía; las tablas son **código muerto**. El análisis de series temporales prometido no se sustenta.
- **Corrección:** crear herramientas/scheduler que **escriban** snapshots diarios (`INSERT OR REPLACE`), persistan `post_metrics` al extraer posts, y actualicen `tracking_links`. Ejemplo de upsert:
  ```sql
  INSERT OR REPLACE INTO daily_snapshots (date, total_followers, active_subscribers, gross_earnings, churned_subscribers)
  VALUES (@date, @followers, @subscribers, @earnings, @churned)
  ```

---

## A1-8. 🟠 `obtener_reporte_crecimiento` promete WoW/MoM pero solo hace SELECT crudo

- **Archivo/línea:** `src/index.ts` — `obtener_reporte_crecimiento`.
- **Problema:** la descripción dice "reporte comparativo de crecimiento (WoW / MoM)", pero el código solo vuelca filas. No calcula variaciones porcentuales, ni descompone WoW/MoM.
- **Corrección:** calcular las métricas derivadas en SQL o en JS:
  ```typescript
  const rows = db.prepare("SELECT date, total_followers, gross_earnings FROM daily_snapshots ORDER BY date DESC LIMIT ?").all(dias);
  const [actual, prev] = rows;
  const wow = actual && prev ? ((actual.total_followers - prev.total_followers) / prev.total_followers) * 100 : null;
  ```

---

## A1-9. 🟠 `calcular_elasticidad_ppv` tiene el precio hardcodeado (engañoso)

- **Archivo/línea:** `src/index.ts` — `calcular_elasticidad_ppv`.
- **Evidencia:**
  ```typescript
  sugerencia_precio: "Rango óptimo estimado de venta PPV algorítmico: $8.00 - $12.00 por desbloqueo."
  ```
- **Problema:** se presenta como "algorítmico" un valor **fijo escrito a mano**. No hay análisis de elasticidad ni modelo. Esto es **código engañoso**: el LLM la tomará como dato real.
- **Corrección:** o eliminar la herramienta hasta implementar análisis real (curva precio/demanda sobre `post_metrics`), o renombrarla (`sugerencia_ppv_estatica`) y documentar que el rango es orientativo/manual.

---

## A1-10. 🟠 `generar_mapa_calor_horario` no genera ningún mapa de calor

- **Archivo/línea:** `src/index.ts` — `generar_mapa_calor_horario`.
- **Evidencia:**
  ```typescript
  return { content: [{ type: "text", text: JSON.stringify({ estado: "Matriz procesada", muestra: posts }) }] };
  ```
- **Problema:** devuelve posts crudos con el texto "Matriz procesada", pero **no agrupa por hora/día** ni construye la matriz de mejores horarios. Falsa implementación (código basura).
- **Corrección:** agrupar `posts.createdAt` en buckets `(día de la semana, hora)` y contar interacciones, devolviendo una matriz `7x24` real.

---

## A1-11. 🟡 Sin validación de entrada (inputs inseguros)

- **Archivo/línea:** `src/index.ts` — `dias`, `limite`, `hashtag`.
- **Evidencia:**
  ```typescript
  const dias = (args?.dias as number) || 30;
  const tag = args?.hashtag as string;
  ```
- **Problema:** no se valida rango ni tipo: `dias: -5` o `limite: 999999999` son aceptados; `hashtag` puede venir vacío o con `#` incluido. Además, se inyecta directo en la URL.
- **Corrección:** validar y normalizar:
  ```typescript
  const dias = Math.min(Math.max(Number(args?.dias) || 30, 1), 365);
  const limite = Math.min(Math.max(Number(args?.limite) || 10, 1), 100);
  const tag = String(args?.hashtag ?? "").replace(/^#/, "").trim();
  ```

---

## A1-12. 🟡 Inyección en URL por falta de `encodeURIComponent`

- **Archivo/línea:** `src/index.ts` — `obtener_tendencias_hashtag`.
- **Evidencia:**
  ```typescript
  const data = await engine.fetchApi(`https://apiv3.fansly.com/api/v1/tag/search?q=${tag}`);
  ```
- **Problema:** un hashtag con caracteres especiales rompe la query o permite inyección de parámetros.
- **Corrección:**
  ```typescript
  const url = `https://apiv3.fansly.com/api/v1/tag/search?q=${encodeURIComponent(tag)}`;
  ```

---

## A1-13. 🟡 Uso masivo de `any` sin tipado

- **Archivo/línea:** `src/index.ts` — `Promise<any>`, `(p: any)`, `error: any`.
- **Problema:** sin tipado, los errores de estructura de la API pasan en silencio y el "Parser / Reductor de Tokens" no es verificable.
- **Corrección:** definir interfaces (`AccountProfile`, `Post`, `TimelineResponse`) y tipar las respuestas del engine con genéricos.

---

## A1-14. 🟡 No hay cierre de recursos (leak de DB y navegador)

- **Archivo/línea:** todo el archivo.
- **Problema:** no se llama `db.close()` ni `engine.context.close()` ante señales de cierre (`SIGINT`, `SIGTERM`). El navegador Chromium y el archivo SQLite quedan abiertos (leaks en uso continuo).
- **Corrección:** registrar un handler de cierre graceful:
  ```typescript
  process.on("SIGINT", async () => { await engine.close(); db.close(); process.exit(0); });
  ```

---

## A1-15. 🟡 Cadena de `if` frágil para despachar 12 herramientas

- **Archivo/línea:** `src/index.js` — Bloque 4.
- **Problema:** 12 `if` encadenados con el mismo patrón → difícil de mantener, propenso a olvidos y duplicación (dos herramientas usan el mismo endpoint `/message/stats`).
- **Corrección:** tabla de registro de herramientas (registry/map de handlers), separando declaración y ejecución.

---

## A1-16. 🔵 El `throw` de "herramienta no registrada" debería ser un error de protocolo

- **Archivo/línea:** `src/index.ts` — final del Bloque 4.
- **Problema:** la especificación MCP distingue **errores de protocolo** (tool desconocida → JSON-RPC error `-32602`) de **errores de ejecución** (`isError: true`). Aquí un tool desconocido se devuelve como error de ejecución.
- **Corrección:** lanzar un error de protocolo `-32602` para nombres desconocidos (vía SDK) y reservar `isError: true` para fallos de la API/lógica.

---

## A1-17. 🔵 `obtener_metricas_perfil` devuelve JSON crudo sin sanitizar

- **Archivo/línea:** `src/index.ts` — `obtener_metricas_perfil`.
- **Problema:** contradice el principio de "Sanitización de Datos" de la Sección 1.2: vuelca el objeto completo de `/account/me`, incluyendo campos sensibles no necesarios para la analítica.
- **Corrección:** aplicar un DTO que filtre solo lo necesario (saldo disponible, saldo acumulado, resumen), evitando enviar datos PII al modelo.

---

## A1-18. 🔵 Sin pruebas ni script de test

- **Archivo/línea:** `package.json` (scripts).
- **Problema:** no hay tests. El motor de reintentos, el parser y las 12 herramientas no tienen cobertura.
- **Corrección:** añadir `vitest` (o Node `node:test`), tests unitarios del backoff y tests de integración con `fetch` mockeado.

---

## Conclusiones

1. **El servidor no funcionará contra la API real** sin resolver A1-1 (cookies) y A1-2 (refresco de sesión).
2. **Hay código engañoso** (A1-9, A1-10) y **código muerto** (A1-7) que dan falsas expectativas al modelo.
3. **El manejo de errores del motor es deficiente** (A1-3, A1-4, A1-5) y puede producir salidas silenciosas corruptas.
4. La corrección completa de estas deficiencias se materializa en el **scaffold corregido** del proyecto (`src/`) documentado en [08-conformidad-mcp-oficial.md](./08-conformidad-mcp-oficial.md).
