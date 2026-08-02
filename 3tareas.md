# 3 Tareas — Fansly MCP

## Tarea 1: Fundamentos de datos, métricas y marketing (30 propuestas)

### Fase 1 — Fundación
- **A1** Tabla `earnings_history` (tips, subs, PPV, wallet)
- **A2** Tabla `post_metric_history` (serie temporal por post)
- **A3** Tabla `subscribers_history` (activos/vencidos reales desde `/subscriptions`)
- **A4** Tabla `hashtag_metrics` (rendimiento por hashtag)
- **A5** `tracking_links` con UTMs (source/medium/campaign/post_id)
- **A6** Tabla `media_vault` (precio PPV, permissionFlags, likes)
- **A7** Tabla `post_history` (tracking de cambios)
- **A8** Migraciones versionadas con `PRAGMA user_version`
- **B1** Mapeo completo `account/me` (subscriberCount, earningsWallet, postLikes, etc.)
- **B2** Tool `obtener_suscriptores` usando `/subscriptions`
- **B3** Paginación cursor en `timelinenew`
- **B4** Precio PPV real desde `accountMedia.price`

### Fase 2 — Análisis
- **B5** Detalle de post (`/posts/{id}`)
- **B6** Tips por fan (ranking gasteros)
- **B7** `mediaoffers` con unlocks/likes por ítem
- **B8** Caché TTL en `fetchApi`
- **C1** Reporte integral de ingresos (tips + subs + PPV)
- **C2** Engagement rate por tipo de contenido
- **C3** KPI conversión follower→suscriptor
- **C4** Forecast de crecimiento (regresión lineal 7/30 días)
- **C5** Churn real con `totalExpired` de `/subscriptions`
- **C6** Score ponderado por post (likes, media_likes, tips, antigüedad)
- **C7** Métricas de mensajería (tiempo respuesta, tips/conversación)

### Fase 3 — Marketing
- **D1** Alta de links de tracking con UTMs + registro de clics/conversiones
- **D2** Ranking hashtags por engagement
- **D3** Ventana óptima de publicación por tipo de contenido
- **D4** Sugerencia de precio PPV segmentada por tipo (video/imagen/bundle)
- **D5** Alertas de recesión (sin posts, caída de engagement)

### Fase 4 — Orquestación
- **E1** Scheduler diario integrado (snapshot completo automático)
- **E2** Prompts orquestados: dashboard semanal, plan de contenido, auditoría competencia, análisis post profundo + recursos MCP por post

---

## Tarea 2: Analítica de contenido (20 propuestas)

| # | Propuesta | Herramienta |
|---|-----------|-------------|
| P1 | Perfil completo de post (score + percentil + copy + huella) | `analizar_post` |
| P2 | Curva de vida del post (snapshots diarios) | `curva_vida_post` |
| P3 | Análisis de copy (emojis, preguntas, CTA, longitud) | `analizar_post` |
| P4 | Huella del post (hora, día, tipo, adjuntos) | `analizar_post` |
| P5 | Ranking de hashtags propios por engagement | `analizar_hashtags` |
| P6 | Co-ocurrencia de hashtags en posts top | `analizar_hashtags` |
| P7 | Tendencias WoW de hashtags | `analizar_hashtags` |
| P8 | Hashtags por tipo de contenido | `analizar_hashtags` |
| P9 | Ventana óptima por tipo de contenido | `horarios_publicacion` |
| P10 | Consistencia de publicación (intervalo, racha) | `horarios_publicacion` |
| P11 | Engagement por hora del día | `horarios_publicacion` |
| P12 | Tasa de conversión post→propina | `interaccion_contenido` |
| P13 | Comparativa de interacción por formato | `interaccion_contenido` |
| P14 | Media-likes como proxy de vistas/engagement | `interaccion_contenido` |
| P15 | Correlación post ↔ picos de mensajes | `correlacion_mensajes_posts` |
| P16 | Top/Bottom posts con contexto | `top_bottom_posts` |
| P17 | Tendencia temporal semanal del engagement | `top_bottom_posts` |
| P18 | Contenido rezagado en caja fuerte | `contenido_rezagado` |
| P19 | Tracker de fypFlags (presencia FYP) | `tracker_fyp` |
| P20 | Optimizador FYP (patrones de entrada) | `optimizador_fyp` |

---

## Tarea 3: Análisis de competencia (20 propuestas)

| # | Propuesta | Herramienta |
|---|-----------|-------------|
| C1 | Descubrimiento de competidores (followers/following → creadoras) | `descubrir_competidores` |
| C2 | Perfil competitivo completo + snapshot inicial | `registrar_competidor` |
| C3 | Clasificación por nicho (micro/mid/top) y actividad | `clasificar_competidores` |
| C4 | Detección de inactividad (lastSeenAt) | `clasificar_competidores` |
| C5 | Frecuencia de posteo y evolución | `snapshot_competidores` + `analizar_crecimiento_competencia` |
| C6 | Matriz de formatos (imagen/video/bundle ratio) | `clasificar_competidores` |
| C7 | Precios y tiers de la competencia | `registrar_competidor` |
| C8 | Horarios de publicación ajenos (perfil público) | `registrar_competidor` |
| C9 | Benchmark de conversión follower→suscriptor | `benchmark_competencia` |
| C10 | Índice de eficiencia de contenido (followers ÷ posts) | `benchmark_competencia` |
| C11 | Comparativa de engagement vs segmento (percentil) | `benchmark_competencia` |
| C12 | Co-movimiento WoW (si sube un competidor nos afecta) | `analizar_crecimiento_competencia` |
| C13 | Patrones de crecimiento (ráfagas vs lineal) | `analizar_crecimiento_competencia` |
| C14 | Benchmark de hashtags (cobertura/frecuencia) | `benchmark_hashtags` (integrado en scoreboard) |
| C15 | Hashtags de cola larga (alta ratio engagement) | `benchmark_hashtags` |
| C16 | Patrones de copy en competidores top | `copy_competidores` (vía scoreboard) |
| C17 | Temas emergentes (delta semana a semana) | `alertas_competencia` |
| C18 | Monitor FYP competitivo (quiénes aparecen en nuestro FYP) | `monitor_fyp_competitivo` |
| C19 | Alertas de cambios (nombre, borrado, inactividad) | `alertas_competencia` |
| C20 | Scoreboard general orquestado (todos los KPIs) | `scoreboard_general` |

---

## Herramientas totales: ~55

### Nuevas herramientas (36):
- `obtener_suscriptores`, `reporte_ingresos`, `tasa_conversion_audiencia`, `pronostico_crecimiento`, `alertas_recesion`
- `registrar_link_tracking`, `registrar_click_link`, `analizar_atribucion_links` (mejorada)
- `analizar_post`, `curva_vida_post`, `top_bottom_posts`
- `analizar_hashtags`, `horarios_publicacion`, `interaccion_contenido`
- `correlacion_mensajes_posts`, `ranking_posts`
- `tracker_fyp`, `optimizador_fyp`, `contenido_rezagado` (mejorada)
- `descubrir_competidores`, `registrar_competidor`, `eliminar_competidor`, `snapshot_competidores`
- `clasificar_competidores`, `benchmark_competencia`, `analizar_crecimiento_competencia`
- `alertas_competencia`, `scoreboard_general`
- `ranking_fans_gasteros`, `metricas_mensajeria`, `sugerencia_ppv_tipo`
- `snapshot_diario`

### Herramientas existentes mejoradas (5):
- `analizar_rendimiento_posts` (mapeo corregido, rendimiento_por_tipo, persistencia post_metric_history)
- `obtener_metricas_perfil` (subscriberCount, earningsWallet, postLikes, etc.)
- `obtener_tendencias_hashtag` (mapeo corregido)
- `generar_mapa_calor_horario` (engagement por celda, no solo volumen)
- `analizar_churn` (datos reales de /subscriptions)
