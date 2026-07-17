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
renderer.js   → toda la lógica de UI (vanilla JS)
index.html    → SPA con CSS inline
db.js         → CRUD + algoritmos de km (solapamientos, relleno masivo, CSV, backups)
sync.js       → sincronización bidireccional con Supabase (auto-sync cada 2 min)
web-remote/   → web móvil + API serverless (deploy: cd web-remote && vercel --prod --yes)
CONTEXT.md    → documentación técnica detallada (arquitectura, funciones, endpoints)
RELEASE.md    → proceso paso a paso para publicar una nueva versión (automatizado en /publicar-release)
CHANGELOG-SECURITY.md → auditoría de seguridad de julio 2026 y pendientes
HISTORIAL.md  → historial de tareas cerradas (leer solo si hace falta contexto pasado)
.claude/skills/ → skills del proyecto: publicar-release, desplegar-web, diagnostico-sync
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
_Última actualización: 2026-07-17._

- **Versión:** 1.3.12 (2026-07-16), instalada en los 2 PCs; web-remote desplegada y verificada. Sync bidireccional OK: nube = espejo del PC principal (1 vehículo / 10 alumnos / 113 prácticas). Suite: 38 tests en verde (`npm test`).
- **Skills del proyecto** (`.claude/skills/`, usarlas siempre que aplique en vez de rehacer el proceso a mano): `/publicar-release` (release completa verificada), `/desplegar-web` (deploy Vercel por API), `/diagnostico-sync` (runbook de discrepancias de datos), `/preparar-cambio` (arranque de tarea con mapa condensado), `/cerrar-tarea` (ritual de cierre), `/estado-nube` (chequeo rápido local vs nube).
- **MCPs:** Supabase, GitHub y Vercel en `.mcp.json` (git-ignored). El `gh` CLI da 401: para GitHub usar el MCP o la API REST con ese token.
- **CRÍTICO pendiente (A5):** la BD sigue expuesta: repo público + anon key en `sync.js` + RLS `allow_all`. Falta: meter credenciales de sync en ambos PCs (UI: Backup → Cuenta de sincronización) y cambiar RLS a "solo el usuario de sync autenticado" (por uid). Ojo: privatizar el repo rompería el auto-update, y endurecer RLS antes de que ambos PCs tengan credenciales rompería el sync. El PIN (2004) está commiteado en CHANGELOG-SECURITY.md y CONTEXT.md; el token web es `base64(PIN:timestamp)` sin rate limiting real.
- **Notas:** `restaurarBackup` no marca pendientes de subir → tras restaurar, usar "Subir todo a la nube". Limpieza pendiente: `dist2/`, `.hermes/`, `dogfood-output/` sin trackear ni ignorar.

## Metodología de trabajo

1. Actúas como Agente Supervisor: el usuario no programa; háblale de objetivos y resultados, nunca de detalles de código salvo que lo pida.
2. Toda petición se trocea en tareas atómicas, cada una con un criterio de aceptación verificable. Preséntalas antes de ejecutar.
3. Para explorar código o buscar información extensa, delega en sub-agentes y quédate solo con sus resúmenes; no cargues archivos enteros en el contexto principal sin necesidad.
4. Ninguna tarea se da por cerrada sin pasar la validación: los tests del proyecto (cuando existan) y el criterio de aceptación. Si falla, itera sin pedir intervención del usuario salvo bloqueo real.
5. Al cerrar cada tarea, actualiza la sección "Estado actual" de este archivo en máximo 3 líneas por cambio.
6. Antes de cambios arriesgados (borrar datos, tocar Supabase, releases), explica el riesgo y pide confirmación explícita.
