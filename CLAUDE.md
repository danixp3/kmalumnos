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
_Última actualización: 2026-07-18._

- **Versión:** 1.4.0 (2026-07-17) publicada y en uso; lote de 8 mejoras + sistema multi-empresa (fases 1-3, Auth nativo de Supabase por email+contraseña, detalle en HISTORIAL.md) cerrados el 2026-07-18, aún SIN publicar como release. Esquema de Supabase aditivo (profesores, pagos, tarifas, tipo de práctica, empresa_id): no rompe la 1.4.0 instalada, pero los 2 PCs deben actualizar a la próxima release para ver las novedades. Suite: 93 tests en verde (`npm test`).
- **Skills del proyecto** (`.claude/skills/`, usarlas siempre que aplique en vez de rehacer el proceso a mano): `/publicar-release` (release completa verificada), `/desplegar-web` (deploy Vercel por API), `/diagnostico-sync` (runbook de discrepancias de datos), `/preparar-cambio` (arranque de tarea con mapa condensado), `/cerrar-tarea` (ritual de cierre), `/estado-nube` (chequeo rápido local vs nube), `/cambiar-web` (desarrollo de web-remote con mapa + smoke test), `/cambiar-app` (desarrollo de escritorio: anclas + receta punta a punta + tests), `/mejorar-ui` (rediseño iterativo de las dos interfaces).
- **MCPs:** Supabase, GitHub y Vercel en `.mcp.json` (git-ignored). El `gh` CLI da 401: para GitHub usar el MCP o la API REST con ese token.
- **CRÍTICO pendiente (A5):** RLS sigue en `allow_all` — la BD sigue expuesta (repo público + anon key en `sync.js`). El sistema multi-empresa ya está implementado (empresa_id en las 7 tablas, UI de cuenta en Ajustes, web-remote filtrando por empresa) pero falta cerrar el candado: 1) iniciar sesión en Ajustes → Cuenta de empresa en ambos PCs, 2) verificar sync en ambos, 3) cambiar RLS a `empresa_id = auth.uid()` en las 7 tablas, 4) re-backfill de filas con `empresa_id NULL` creadas entre medias. Requiere acceso físico a ambos PCs; NO ejecutar sin confirmación explícita del usuario.
- **Notas:** Limpieza pendiente: `dist2/`, `.hermes/`, `dogfood-output/` sin trackear ni ignorar.

## Metodología de trabajo

1. Fable 5 actúa como Director: interpreta la petición, la trocea en tareas atómicas con criterio de aceptación verificable, y las presenta antes de ejecutar. El usuario no programa: háblale de objetivos y resultados, nunca de detalles de código salvo que lo pida.
2. **El Director no ejecuta: dirige.** Toda modificación de archivos (código, documentación o skills) la realiza un worker (Agent tool con `model: "sonnet"`) con instrucciones cerradas del Director: qué cambiar, dónde y con qué criterio de aceptación. El Director solo lee/verifica lo mínimo imprescindible para dirigir y validar.
3. Los workers deben usar las skills del proyecto (`.claude/skills/`) como primera fuente (mapas, anclas, recetas) en vez de releer archivos enteros — es la vía para ahorrar tokens y ser eficientes.
4. Si un cambio deja desactualizada una skill, el Director dictamina la corrección y la aplica otro worker; nunca el Director directamente.
5. Ninguna tarea se da por cerrada sin validación: los tests del proyecto y el criterio de aceptación. Si falla, el Director itera con nuevos encargos a workers sin pedir intervención del usuario salvo bloqueo real.
6. Al cerrar cada tarea, actualizar la sección "Estado actual" de este archivo en máximo 3 líneas por cambio.
7. Antes de cambios arriesgados (borrar datos, tocar Supabase, releases), explicar el riesgo y pedir confirmación explícita.
