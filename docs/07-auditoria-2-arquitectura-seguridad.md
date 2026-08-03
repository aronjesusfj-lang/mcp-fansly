# 07. Auditoría 2 — Arquitectura, Seguridad y Configuración

> **Propósito:** detección de mal criterio de arquitectura, riesgos de seguridad, contradicciones de configuración y aspectos de diseño que comprometen la robustez y la confidencialidad del servidor MCP de Fansly.
>
> **Método:** análisis de la documentación completa (Secciones 1–5 del documento original, ya eliminado): diagrama, principios de seguridad, `.env`, `package.json`, `claude_desktop_config.json` e integración Playwright/SQLite.

---

## Resumen ejecutivo

| Severidad | Total |
|-----------|-------|
| 🔴 Crítico | 3 |
| 🟠 Alto | 4 |
| 🟡 Medio | 4 |
| 🔵 Bajo | 2 |
| **Total** | **13** |

---

## A2-1. 🔴 Contradicción de diseño: navegador persistente + `fetch` de Node sin cookies

- **Evidencia:** diagrama (Sección 1.1) muestra "Peticiones HTTPS Directas (JSON)" desde el Chromium; pero el código usa `fetch()` de Node.
- **Problema:** la arquitectura declara un navegador persistente para **sesión**, pero la ejecución HTTP escapa del contexto del navegador, perdiendo cookies y perfil TLS. El flujo real no coincide con el diagrama.
- **Impacto:** autenticación fallida (401), diseño engañoso.
- **Corrección:** ejecutar las peticiones con `context.request.get()` (API Playwright) para heredar cookies; o extraer `cookie` y `csrf` del contexto y reenviarlos en el `fetch`.

---

## A2-2. 🟠 `HEADLESS="true"` contradice la autenticación manual inicial

- **Evidencia:** `HEADLESS="true"` en `.env` y en la config del cliente; la Sección 1.2 dice "La autenticación inicial se realiza manualmente una sola vez".
- **Problema:** en modo headless no hay ventana para hacer login manual. La primera autenticación es imposible tal y como está configurada.
- **Corrección:** definir un modo `HEADLESS="false"` solo para el primer arranque (auth) y pasarlo a `true` después; documentar el flujo de `bootstrap`.

---

## A2-3. 🟠 Flag de evasión de detección: `--disable-blink-features=AutomationControlled`

- **Evidencia:** `args: ["--disable-blink-features=AutomationControlled"]`.
- **Problema:** oculta la automatización de Chromium; es una técnica de evasión que suele incumplir los términos de servicio del proveedor y puede derivar en bloqueo de cuenta.
- **Corrección:** eliminar el flag y gestionar la autenticación de forma legítima y transparente; añadir moderación/rate limiting en el motor para no disparar alarmas.

---

## A2-4. 🟠 Nombres inconsistentes entre archivos de configuración

- **Evidencia:**
  - `package.json` → `fansly-mcp-server-definitive`
  - Código `new Server({ name: "fansly-mcp-server" })`
  - `claude_desktop_config.json` → `fansly-mcp-engine`
- **Problema:** tres identidades distintas dificultan diagnóstico y mantenimiento.
- **Corrección:** unificar un único nombre (p.ej. `fansly-mcp`), usar `serverInfo.name` coherente y referenciar el mismo identificador en el cliente.

---

## A2-5. 🟠 Carencia de `tsconfig.json` y script `build` incompleto

- **Evidencia:** no existe `tsconfig.json`; el script `build: "tsc"` usa valores por defecto; el `start` apunta a `dist/` sin garantía de que se genere.
- **Problema:** la compilación es impredecible (sin `outDir`, sin `strict`, sin `module` ESM correcto); el cliente apunta a una ruta que puede no existir.
- **Corrección:** crear `tsconfig.json` oficial (ver [08-conformidad-mcp-oficial.md](./08-conformidad-mcp-oficial.md) → C2/C3) y ajustar `build`/`start`.

---

## A2-6. 🟠 Duplicidad de variables de entorno (`.env` vs bloque `env` del cliente)

- **Evidencia:** las mismas 5 variables están en `.env` y en `mcpServers.fansly-mcp-engine.env`.
- **Problema:** dos fuentes de verdad; divergencias silenciosas según desde dónde se arranque (npm vs cliente MCP).
- **Corrección:** elegir **una** fuente: o bien el cliente inyecta `env` completo, o bien el servidor lee `.env`. Documentar claramente la prioridad.

---

## A2-7. 🟡 Sin validación de variables de entorno

- **Evidencia:** `parseInt(process.env.MAX_RETRIES || "3")` sin verificar que sea numérico positivo.
- **Problema:** un `MAX_RETRIES="abc"` produce `NaN` y el bucle no itera; `BACKOFF_BASE_MS="0"` da backoff nulo.
- **Corrección:** un loader de config que valide con `zod` (o manual) y falle rápido con mensaje claro.

---

## A2-8. 🟡 Envío potencial de datos sensibles al LLM

- **Evidencia:** la Sección 1.2 promete aislamiento total de credenciales, pero `obtener_metricas_perfil` devuelve el JSON completo de `/account/me` y los errores crudos (`Excepción crítica en ${name}: ${error.message}`) van en `content` al modelo.
- **Problema:** si `/account/me` incluye email, IDs internos o campos de sesión, esos datos llegarían al modelo, contradiciendo el principio de aislamiento.
- **Corrección:** sanitizar con DTOs (solo métricas), redactar mensajes de error y nunca volcar respuestas crudas completas.

---

## A2-9. 🟡 Sin logging estructurado ni adherencia a STDIO

- **Evidencia:** no hay logs en el servidor; la doc oficial de MCP exige `console.error` (stderr) y prohíbe `console.log` (stdout) en servidores STDIO.
- **Problema:** al no loguear, es imposible diagnosticar; si en el futuro se añade un `console.log`, se corromperá el transporte JSON-RPC.
- **Corrección:** logger mínimo a `stderr` (niveles), evitando stdout por completo. La capacidad MCP `logging` está **deprecada** en 2026-07-28.

---

## A2-10. 🟡 Migraciones de base de datos inexistentes

- **Evidencia:** DDL ejecutado inline en `db.exec()`.
- **Problema:** cambios de esquema futuros sin historial ni control; romperá instalaciones existentes.
- **Corrección:** usar migraciones versionadas (números) y un `schema_version` (o librería `kysely`/`drizzle`).

---

## A2-11. 🟡 Sin scheduler de snapshots

- **Evidencia:** la tabla `daily_snapshots` solo puede poblarse con un proceso que corra diariamente; no hay ninguno.
- **Problema:** el análisis temporal (churn, WoW/MoM, elasticidad) es inviable sin datos históricos.
- **Corrección:** añadir un worker/scheduler (`node-cron` o `setInterval` de 24h) que capture y persista el snapshot diario; o exponer una herramienta `registrar_snapshot_diario` invocable.

---

## A2-12. 🔵 `dotenv` + config del cliente = doble arranque según contexto

- **Evidencia:** el servidor carga `.env` con `dotenv.config()` pero el cliente inyecta `env`.
- **Problema:** según cómo se arranque (STDIO manual vs cliente MCP) la config proviene de fuentes distintas.
- **Corrección:** decidir fuente única (ver A2-6) y documentarlo en [05-orquestacion-cliente.md](./05-orquestacion-cliente.md).

---

## A2-13. 🔵 Gestión de errores crudos hacia el modelo

- **Evidencia:** `Excepción crítica en ${name}: ${error.message}` en `content`.
- **Problema:** detalles internos (URLs, mensajes de red) se exponen al LLM y al log; sin redacción.
- **Corrección:** devolver errores de ejecución accionables y redactados (p. ej. "Fansly API devolvió 429; reintenta más tarde") y loguear el detalle técnico solo a `stderr`.

---

## Conclusiones

1. **La base de seguridad (aislamiento de credenciales) es sólida en intención** pero se viola en la práctica (A2-8, A2-13).
2. **La configuración es fragmentada y contradictoria** (A2-4, A2-6, A2-12).
3. **El diseño de sesión necesita replanteamiento** (A2-1, A2-2, A2-3).
4. La mitigación completa se encuentra en el **scaffold corregido** del proyecto y se alinea con la conformidad oficial (ver [08-conformidad-mcp-oficial.md](./08-conformidad-mcp-oficial.md)).
