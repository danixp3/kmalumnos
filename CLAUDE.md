# KMAlumnos

## Qué es
Aplicación de escritorio (Windows) para una autoescuela: gestiona vehículos, alumnos y los kilómetros de sus prácticas. Tiene además una web móvil ("web-remote") para registrar prácticas desde el teléfono. El usuario/propietario no programa: trabajar en modo supervisor, explicando en términos de objetivos y resultados.

## Stack
- **Escritorio:** Electron 33 (Node.js + Chromium), JavaScript vanilla, sin framework ni bundler. Instalador NSIS vía `electron-builder`, auto-update con `electron-updater` contra releases de GitHub (`danixp3/kmalumnos`).
- **Datos locales:** `data.json` en `app.getPath('userData')` (fuente de verdad, offline-first). Cola de cambios pendientes en `pending_sync.json`.
- **Backend remoto:** Supabase (PostgreSQL) — proyecto `dmwoqugdnwgkcqtixhyw`, tablas `vehiculos`, `alumnos`, `practicas` (+ `meta` para ping). Cliente `@supabase/supabase-js`; URL y anon key están hardcodeadas en `sync.js`.
- **Web móvil:** `web-remote/` desplegada en Vercel (https://kmalumnos-remote.vercel.app). Serverless functions en `web-remote/api/`, login por PIN de 4 dígitos (env `API_PIN` en Vercel), token base64 válido 24 h.

## Estructura
```
main.js       → proceso principal Electron: ventana, IPC handlers, auto-updater
preload.js    → contextBridge, expone window.api al renderer
index.html    → SPA (solo HTML), enlaza styles.css y los 18 <script> de renderer/
styles.css    → CSS de la app de escritorio, incl. temas [data-theme="oscuro"/"negro"]
renderer/     → UI (vanilla JS) dividida en 18 <script> clásicos (globales, no módulos ES),
                cargados en orden fijo desde index.html; arranque.js SIEMPRE el último
  estado.js            → estado global/caches/navegación
  utils-ui.js           → modales, esc/fmt/fmtFecha/tagPermiso, TEMA, toasts
  dashboard.js, vehiculos.js, profesores.js, alumnos.js, practicas.js,
  pagos.js, csv.js, solapamientos.js, logs-backups.js, timeline.js,
  sync-ui.js, ajustes.js, registro-rapido.js, tutorial.js, ventana.js → por dominio
  arranque.js           → bienvenida + todo el código que se ejecuta al cargar (último)
db.js         → índice de 40 líneas que re-exporta db/ (misma superficie pública, 51 exports)
db/           → CRUD + algoritmos de km, por módulo
  core.js         → rutas, caché de data.json, save/nextId, logs, backups
  vehiculos.js, profesores.js, tarifas.js, alumnos.js, practicas.js, pagos.js, csv.js
  km-algoritmos.js → solapamientos, relleno masivo, corrección
  estadisticas.js  → resumen, dashboard, timeline
sync.js       → sincronización bidireccional con Supabase (auto-sync cada 2 min)
web-remote/   → web móvil + API serverless (deploy: cd web-remote && vercel --prod --yes)
CONTEXT.md    → documentación técnica detallada (arquitectura, funciones, endpoints)
RELEASE.md    → proceso paso a paso para publicar una nueva versión (automatizado en /publicar-release)
CHANGELOG-SECURITY.md → auditoría de seguridad de julio 2026 y pendientes
HISTORIAL.md  → historial de tareas cerradas (leer solo si hace falta contexto pasado)
.claude/skills/ → skills del proyecto: publicar-release, desplegar-web, diagnostico-sync, etc.
.claude/agents/ → subagentes: explorador (haiku, localiza código), worker (sonnet, implementa),
                  tester (haiku, ejecuta npm test), documentador (haiku, actualiza documentación)
```

## Comandos
| Acción | Comando |
|---|---|
| Arrancar la app en desarrollo | `npm start` |
| Generar instalador Windows | `npm run dist` (sale en `dist/`) |
| Desplegar web móvil | `cd web-remote && vercel --prod --yes` |
| Tests | `npm test` (Jest; tests en `tests/`, mock de Electron en `tests/mocks/`) |

## Convenciones
- Todo en español: nombres de funciones/variables de dominio (`getVehiculos`, `rellenarKmMasivo`), mensajes de UI y commits (`v1.X.X - descripción breve`).
- Versionado semántico en `package.json`; el proceso de release completo está en `RELEASE.md`.
- Sin TypeScript, sin bundler, sin frameworks: JS plano con `require` (app) y ES modules (web-remote/api).
- Renderer aislado: `contextIsolation: true`, `nodeIntegration: false`; toda operación pasa por IPC (`main.js`) → `db.js`/`sync.js`.
- Todos los borrados remotos son soft delete (`deleted: true`) desde v1.3.11: prácticas, alumnos y vehículos. Nunca borrar filas de verdad en Supabase — la FK de prácticas lo impide para alumnos y, sin la marca, los demás dispositivos no se enteran del borrado.
- Fechas como strings `YYYY-MM-DD` sin zona horaria; Supabase/Vercel funcionan en UTC.

## Estado actual (solo el estado vivo — al cerrar tareas, añadir aquí y mover lo viejo a HISTORIAL.md)
_Última actualización: 2026-08-01._

- **Versión:** 1.6.0 (sin cambiar). Suite: 119 tests en verde (`npm test`).
- **Refactor de organización de archivos (2026-08-01, sin cambios funcionales):** `renderer.js` (2638 líneas) dividido en 18 módulos por dominio bajo `renderer/` (`<script>` clásicos, orden fijo en `index.html`, `arranque.js` siempre el último); `db.js` (1373 líneas) pasó a ser un índice de 40 líneas que re-exporta 10 módulos bajo `db/` (misma superficie pública, 51 exports); CSS inline extraído a `styles.css`. Objetivo: workers y skills leen solo el módulo relevante en vez de archivos monolíticos, ahorrando tokens.
- **Subagentes nuevos (`.claude/agents/`):** `explorador` (haiku, localiza código), `worker` (sonnet, implementa), `tester` (haiku, valida con tests), `documentador` (haiku, actualiza documentación) — criterio de uso en "Metodología de trabajo".
- **Skills del proyecto** (`.claude/skills/`, usarlas siempre que aplique en vez de rehacer el proceso a mano): `/publicar-release` (release completa verificada), `/desplegar-web` (deploy Vercel por API), `/diagnostico-sync` (runbook de discrepancias de datos), `/preparar-cambio` (arranque de tarea con mapa condensado), `/cerrar-tarea` (ritual de cierre), `/estado-nube` (chequeo rápido local vs nube), `/cambiar-web` (desarrollo de web-remote con mapa + smoke test), `/cambiar-app` (desarrollo de escritorio: anclas + receta punta a punta + tests), `/mejorar-ui` (rediseño iterativo de las dos interfaces).
- **MCPs/CLIs:** tokens en `.mcp.json` (git-ignored). SQL de Supabase vía `node .claude/scripts/sql.js` (Management API); el MCP de Supabase queda solo como fallback y para `get_logs` en /diagnostico-sync. `gh` CLI autenticado con el PAT de `.mcp.json` (si da 401: `gh auth login --with-token` con ese PAT). Releases siguen vía `publicar_release.py` y deploy web vía `desplegar_web.js` (API REST, sin MCP).
- **CRÍTICO A5 RESUELTO (2026-07-18):** RLS endurecido en las 7 tablas de datos (vehiculos, alumnos, practicas, profesores, tarifas, pagos, logs) — sustituida `allow_all` por la política `empresa_all` (`authenticated`, `USING/WITH CHECK empresa_id = auth.uid()`); `meta` solo permite SELECT a `authenticated`. El rol `anon` se queda sin ninguna política (denegado por defecto): la BD ya no está expuesta pese al repo público y la anon key en `sync.js`. Verificado con anon sin sesión (0 filas), sesión autenticada (datos reales + INSERT/soft-delete + RPC `reparar_secuencias` funcionando) y smoke test de la web (`WEB-OK`). Queda operativo: los 2 PCs deben estar en 1.5.0+ y con sesión iniciada en Ajustes → Cuenta de empresa para sincronizar; sin sesión trabajan en local y encolan cambios sin subir. Detalle completo en HISTORIAL.md.
- **Notas:** el smoke test de la web (`/cambiar-web`) usa las envs SYNC_EMAIL/SYNC_PASSWORD de Vercel solo como credenciales de prueba. Limpieza pendiente: `dist2/`, `.hermes/`, `dogfood-output/` sin trackear ni ignorar.

## Metodología de trabajo

1. Fable 5 actúa como Director: interpreta la petición, la trocea en tareas atómicas con criterio de aceptación verificable, y las presenta antes de ejecutar. El usuario no programa: háblale de objetivos y resultados, nunca de detalles de código salvo que lo pida.
2. **El Director no ejecuta: dirige.** Toda modificación de archivos (código, documentación o skills) la realiza un subagente de `.claude/agents/` con instrucciones cerradas del Director: qué cambiar, dónde y con qué criterio de aceptación. El Director solo lee/verifica lo mínimo imprescindible para dirigir y validar. Cuatro subagentes según la tarea: **`explorador`** (haiku, solo lectura) cuando no esté claro dónde vive el código, antes de gastar un subagente de escritura; **`worker`** (sonnet) para implementar el cambio; **`tester`** (haiku) para validar con `npm test` y resumir el resultado; **`documentador`** (haiku) para actualizar CLAUDE.md/HISTORIAL.md/skills al cerrar la tarea.
3. Los subagentes deben usar las skills del proyecto (`.claude/skills/`) como primera fuente (mapas, anclas, recetas) en vez de releer archivos enteros — es la vía para ahorrar tokens y ser eficientes.
4. Si un cambio deja desactualizada una skill, el Director dictamina la corrección y la aplica otro worker; nunca el Director directamente.
5. Ninguna tarea se da por cerrada sin validación: los tests del proyecto y el criterio de aceptación. Si falla, el Director itera con nuevos encargos a workers sin pedir intervención del usuario salvo bloqueo real.
6. Al cerrar cada tarea, actualizar la sección "Estado actual" de este archivo en máximo 3 líneas por cambio.
7. Antes de cambios arriesgados (borrar datos, tocar Supabase, releases), explicar el riesgo y pedir confirmación explícita.
