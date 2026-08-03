# 08. Conformidad con la Documentación Oficial de MCP (build-server 2026-07-28)

> **Propósito:** verificar que la estructura del MCP para Fansly se construye de forma correcta y con buenas prácticas según la documentación oficial de Model Context Protocol.
>
> **Fuentes consultadas:**
> - [Build an MCP server](https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server) (tutorial TypeScript)
> - [Understanding MCP servers](https://modelcontextprotocol.io/docs/2026-07-28/learn/server-concepts)
> - [Spec: Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
> - [Spec: Resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)
> - [Spec: Prompts](https://modelcontextprotocol.io/specification/2026-07-28/server/prompts)
> - [Spec: Logging](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/logging)

---

## 8.1. Conceptos nucleares que exige MCP

Un servidor MCP expone **tres bloques de construcción**:

| Building block | Controlado por | Nuestro servidor |
|----------------|----------------|------------------|
| **Tools** | Modelo (puede invocarlas) | ✅ 12 herramientas declaradas |
| **Resources** | Aplicación (datos de contexto, lectura) | ❌ No expone ninguna |
| **Prompts** | Usuario (plantillas invocadas explícitamente) | ❌ No expone ninguno |

> Un servidor para **analítica** como el de Fansly debería exponer además **Resources** (ej. `fansly://metricas/2026-07`) y **Prompts** (ej. `auditar-perfil`), pero la doc oficial permite servidores **solo-Tools** (la lista puede ser vacía, pero si declara `tools` debe responder `tools/list`).

---

## 8.2. Checklist de conformidad (C1–C10)

| ID | Requisito oficial | Estado | Detalle / corrección |
|----|-------------------|--------|----------------------|
| **C1** | Usar el SDK recomendado: paquete `@modelcontextprotocol/server` con la clase `McpServer` y `server.registerTool(name, { description, inputSchema: z.object(...) }, handler)` | ❌ No cumple | El documento original (ya eliminado) usa `@modelcontextprotocol/sdk` (API antigua `Server` + `setRequestHandler`). La guía 2026-07-28 instala `@modelcontextprotocol/server` + `zod`. |
| **C2** | Tener `tsconfig.json` con: `target: ES2022`, `module: Node16`, `moduleResolution: Node16`, `types: ["node"]`, `outDir: ./build`, `rootDir: ./src`, `strict`, `esModuleInterop`, `skipLibCheck`, `forceConsistentCasingInFileNames` | ❌ No cumple | No existe `tsconfig.json` en el original. |
| **C3** | `package.json`: `"type": "module"`, `"bin"`, script `"build": "tsc && chmod 755 build/index.js"`, `"files": ["build"]` | ⚠️ Parcial | `"type": "module"` ✅; falta `bin`, `files`, y `build` usa salida `dist/` inconsistente. |
| **C4** | Patrón de arranque `main()` con `try/catch` y `process.exit(1)` | ❌ No cumple | El original usa `await server.connect(transport)` a nivel raíz sin manejo de errores fatales. |
| **C5** | Logging: **nunca `console.log`** en STDIO; usar `console.error` (stderr); la capacidad MCP `logging` está **deprecada** en 2026-07-28 | ⚠️ Parcial | No hay logs (correcto por omisión), pero falta el log de arranque a stderr y no hay logger estructurado. |
| **C6** | Tools sin parámetros → `inputSchema: { "type": "object", "additionalProperties": false }` (recomendado) | ⚠️ Parcial | Usan `{ type: "object", properties: {} }` (permitido, pero no el recomendado). |
| **C7** | `outputSchema` + `structuredContent` para salidas tipadas | ❌ No cumple | No se declaran `outputSchema` ni `structuredContent`. |
| **C8** | Tool desconocido → **error de protocolo** JSON-RPC `-32602`; fallos de API → **error de ejecución** `isError: true` | ⚠️ Parcial | `isError: true` ✅ para fallos; pero tool desconocida se devuelve como error de ejecución, no de protocolo. |
| **C9** | Seguridad Tools: validar inputs, rate-limit, sanitizar salidas | ❌ No cumple | Sin validación de `dias`/`limite`/`hashtag`, sin rate-limit, salidas crudas. |
| **C10** | Tools/Resources/Prompts + orden determinístico de tools | ⚠️ Parcial | Solo Tools (permitido). Orden estático determinístico ✅. |

---

## 8.3. Verificación de cada bloque del código

### Configuración (build-server → "Set up your environment")
- ✅ Node 20+ requerido (implícito en el original con `@types/node ^20`).
- ❌ Dependencias: falta `zod`; falta el paquete nuevo `@modelcontextprotocol/server`.
- ❌ `tsconfig.json` inexistente.
- ⚠️ Scripts de build/start deben apuntar a `build/` de forma consistente.

### Servidor e instancia
- ✅ Se crea una instancia de servidor con `name` y `version`.
- ❌ API antigua (`Server` + `setRequestHandler`) en vez de `McpServer` + `registerTool`.
- ✅ `StdioServerTransport` correcto.
- ❌ `main().catch()` ausente.

### Herramientas
- ✅ Cada tool tiene `name`, `description`, `inputSchema`.
- ❌ Sin validación con `zod`; sin `outputSchema`; sin `additionalProperties: false` en tools sin args.
- ✅ Errores de ejecución con `isError: true`.
- ❌ Tool desconocida debería ser error de protocolo.

### Logging (spec deprecada)
- ⚠️ No se usa la capacidad MCP `logging` (correcto: deprecada en 2026-07-28).
- ✅ No hay `console.log` (nada corrompe el transporte STDIO).
- ❌ Falta logging a stderr y redacción de errores (ver A2-13).

### Recursos y Prompts
- ❌ Sin `resources` capability ni `resources/list`/`resources/read`.
- ❌ Sin `prompts` capability ni `prompts/list`/`prompts/get`.

---

## 8.4. Conclusión de la verificación

**La estructura del documento original (`desorden.txt`, ya eliminado) NO está construida conforme a la documentación oficial actual de MCP (2026-07-28).** Cumple parcialmente con los conceptos (transporte STDIO, tools, `isError`), pero falla en:

1. **SDK y API de registro** (C1) — usa la API antigua.
2. **Configuración de compilación** (C2, C3) — sin `tsconfig.json`, salidas inconsistentes.
3. **Arranque robusto** (C4) — sin `main().catch()`.
4. **Validación y seguridad** (C9) — sin zod, sin rate-limit, sin sanitización.
5. **Bloques faltantes** (C10) — sin Resources ni Prompts.

La corrección completa de estos puntos se implementa en el **scaffold corregido de referencia** incluido en el proyecto (Fase 4), que cumple C1–C10 y las buenas prácticas de logging STDIO.

---

## 8.5. Scaffold corregido de referencia

El proyecto raíz contiene los archivos de referencia construidos según la doc oficial:

```
EXTENSION-FANSLY/
├── docs/                         # Documentación separada + auditorías + conformidad
│                                 # (el documento original desorden.txt fue eliminado tras migrarse aquí)
├── package.json                  # Nuevo: @modelcontextprotocol/server, zod, bin, build
├── tsconfig.json                 # Nuevo: opciones oficiales (ES2022, Node16, strict)
├── .env.example                  # Nuevo: variables documentadas
├── .gitignore                    # Nuevo: node_modules, build, browser_data, .env
└── src/
    ├── index.ts                  # main() + McpServer + registro de tools/resources/prompts
    ├── config.ts                 # Carga y validación de configuración
    ├── engine/fansly.ts          # Motor HTTP resiliente sobre Playwright
    ├── db/repository.ts          # Repositorio SQLite con writes y migraciones
    ├── tools/                    # Implementación de las 12 herramientas (zod)
    ├── resources/                # Recursos fansly://...
    └── prompts/                  # Plantillas de prompts
```

> Véanse los archivos raíz para la implementación completa.
