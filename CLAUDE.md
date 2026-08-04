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
index.html    → SPA (solo HTML), enlaza styles.css y los 21 <script> de renderer/
styles.css    → CSS de la app de escritorio, incl. temas [data-theme="oscuro"/"negro"], paleta de gráficos
renderer/     → UI (vanilla JS) dividida en 21 <script> clásicos (globales, no módulos ES),
                cargados en orden fijo desde index.html; arranque.js SIEMPRE el último
  estado.js, utils-ui.js → estado, modales, esc/fmt/fmtFecha/tagPermiso, TEMA, toasts
  dashboard.js, vehiculos.js, profesores.js, alumnos.js, practicas.js, pagos.js → CRUD
  csv.js, solapamientos.js, logs-backups.js, timeline.js → importación/exportación/análisis
  sync-ui.js, ajustes.js, registro-rapido.js → sincronización, configuración, entrada rápida
  tutorial.js, ventana.js → tutorial interactivo, barra de título propia
  graficos.js → 5 gráficos SVG configurables (dashboard personalizable)
  practicas-global.js → todas las prácticas de todos los alumnos con filtros/búsqueda
  roles.js → funciones de gestión de roles jefe/empleado (modo clásico ↔ multi-empresa)
  sucursales.js → selector de sucursal en la barra, filtrado por sede
  arranque.js → bienvenida + código de arranque (siempre el último)
db.js         → índice de 40 líneas que re-exporta db/ (misma superficie pública, 51 exports)
db/           → CRUD + algoritmos de km, por módulo
  core.js         → rutas, caché de data.json, save/nextId, logs, backups
  vehiculos.js, profesores.js, tarifas.js, alumnos.js, practicas.js, pagos.js, csv.js
  km-algoritmos.js → solapamientos, relleno masivo, corrección
  estadisticas.js  → resumen, dashboard, timeline, estadísticas por profesor
  sucursales.js → CRUD sucursales (modo multi-empresa con migración pendiente)
sync.js       → sincronización bidireccional con Supabase (auto-sync cada 2 min), resolución de colisiones
migraciones/  → migraciones SQL de Supabase escritas pero NO APLICADAS (roles + sucursales)
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

## Estado actual (solo el estado vivo — al cerrar tareas, resumir aquí y archivar el detalle en HISTORIAL.md)
_Última actualización: 2026-08-04. El detalle histórico completo está en HISTORIAL.md._

- **Versión:** 1.10.1 (release publicada). Suite: 201 tests en verde, 17 suites (`npm test`).
- **Rebranding KMAlumnos → AulaMovil + logo real (2026-08-04, v1.10.1):** cambios visuales en título de ventana, modales de bienvenida/backup, barras y sidebar; dominio web remoto migrado a aulamovil.vercel.app con redirects y CORS actualizados; logo real (volante + birrete + móvil, azul/naranja) integrado en app y web via `img/generar-iconos.js` (sharp + png-to-ico, exporta `icon.png`/`logo.png`/`icon.ico` con recorte automático); identificadores internos conservados para compatibilidad con datos y auto-update.
- **INVARIANTE — Migración roles/sucursales NO APLICADA:** todo cambio de roles/sucursales DEBE funcionar en "modo clásico" (la app detecta en runtime si existen las tablas; si no, se comporta como hoy). SQL + ROLLBACK + README en `migraciones/`. Solo Pagos es seguridad real (RLS servidor); ocultar estadísticas es barrera blanda (el empleado ya tiene las prácticas locales).
- **Sync/RLS:** RLS endurecido (`empresa_all`, `anon` sin acceso). Los PCs necesitan sesión en Ajustes → Cuenta de empresa para sincronizar; sin sesión trabajan en local.
- **Herramientas:** SQL de Supabase vía `node .claude/scripts/sql.js`; `gh` CLI autenticado; releases y deploy web por scripts (sin MCP).
- **Limpieza pendiente:** `dist2/`, `.hermes/`, `dogfood-output/` sin trackear ni ignorar.

## Metodología de trabajo

1. El Director (modelo potente: Opus/Fable) interpreta la petición, la trocea en tareas atómicas con criterio de aceptación verificable y las presenta antes de ejecutar. Al usuario háblale de objetivos y resultados, no de código salvo que lo pida.
2. **El Director dirige, no ejecuta:** toda modificación de archivos la hace un subagente de `.claude/agents/` con instrucciones cerradas (qué, dónde, criterio). Subagentes: **`explorador`** (haiku, localizar código sin editar), **`worker`** (sonnet, implementar), **`tester`** (haiku, `npm test` resumido), **`documentador`** (haiku, docs al cerrar). El Director solo lee/verifica lo mínimo.
3. Los subagentes usan primero las skills de `.claude/skills/` (mapas, anclas, recetas) en vez de releer archivos enteros.
4. Si un cambio deja una skill obsoleta, el Director encarga la corrección a un worker (nunca la aplica él).
5. Ninguna tarea se cierra sin validación (tests + criterio de aceptación). Si falla, el Director itera con nuevos encargos sin molestar al usuario salvo bloqueo real.
6. Al cerrar, actualizar "Estado actual" (máx 3 líneas/cambio) y archivar el detalle en HISTORIAL.md.
7. Antes de cambios arriesgados (borrar datos, tocar Supabase, releases), explicar el riesgo y pedir confirmación explícita.
