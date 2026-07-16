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
RELEASE.md    → proceso paso a paso para publicar una nueva versión
CHANGELOG-SECURITY.md → auditoría de seguridad de julio 2026 y pendientes
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
- Los borrados remotos de prácticas son soft delete (`deleted: true`); alumnos y vehículos se borran de verdad en Supabase.
- Fechas como strings `YYYY-MM-DD` sin zona horaria; Supabase/Vercel funcionan en UTC.

## Estado actual (actualizar al cerrar cada tarea)
_Última actualización: 2026-07-16 — T1 (diagnóstico BD) y T4 (tests de sync) completadas._

- **2026-

- **2026-07-15 (Fase 1):** Jest configurado con `npm test` (18 tests en verde) cubriendo los cálculos de `db.js`: solapamientos de km (detección, validación y corrección), relleno masivo (encadenado, topes de odómetro) e import/export CSV (filas válidas, errores, km autogenerados). Los tests corren en Node puro contra un directorio temporal; nunca tocan datos reales.
- **2026-07-16 (T4):** 8 tests de sincronización (`tests/sync.test.js`) contra un Supabase simulado en memoria: modo offline con reencolado, subida de cambios, bajada desde móvil, resolución de conflictos por fecha de edición y soft delete en ambos sentidos. Total suite: 26 tests en verde.
- **2026-07-16 (T1 · CRÍTICO):** La base de datos está EXPUESTA. El repo GitHub `danixp3/kmalumnos` es **público**, así que la anon key commiteada en `sync.js` es visible para cualquiera. Las 5 tablas tienen RLS activado pero con una política `allow_all` (`USING true` para el rol `public`, comando `ALL`): equivale a no tener protección. Cualquiera con la key puede leer, modificar y borrar todos los datos de alumnos saltándose el PIN. Pendiente de corrección (requiere decisión del usuario sobre modelo de acceso).
- **MCPs:** Supabase, GitHub y Vercel configurados en `.mcp.json` (git-ignored; requiere reiniciar Claude Code para que carguen). Tokens verificados (HTTP 200).
- **2026-07-16 (Opción A · paso A3 · lado escritorio, HECHO):** La app ya puede iniciar sesión con una cuenta de sincronización (email/contraseña) antes de sincronizar; `sync.js` autentica si hay credenciales y sigue funcionando con solo la anon key si no las hay (modo transición sin cortes). Credenciales cifradas con `safeStorage` en `userData/sync_creds.json`, nunca en el código. UI: tarjeta + modal en la página Backup. 3 tests nuevos de autenticación (suite total: 29 en verde). App arranca sin errores.
- **2026-07-16 (A1+A2 HECHOS, autorizados):** Cuenta de sync creada en Supabase Auth (`pzdani04+kmsync@gmail.com`, uid `8cd0d71a-534d-48d7-9137-1639cf4a203f`), login verificado, registro público de cuentas desactivado (`disable_signup: true`). Web-remote autentica server-side con esa cuenta (`getSupabase()` en `_utils.js`, envs `SYNC_EMAIL`/`SYNC_PASSWORD` en Vercel) y redesplegada: PIN + endpoints verificados OK.
- **Opción A · pendiente:** A4 publicar v1.3.9 (requiere confirmación) y meter credenciales en los 2 PCs (UI: Backup → Cuenta de sincronización); A5 cambiar políticas RLS `allow_all` → "solo el usuario de sync autenticado" (política por uid) y verificar que la anon key sola ya no lee. **A5 solo cuando ambos PCs tengan v1.3.9 con credenciales.** Hasta A5, la BD sigue expuesta.

- **Versión:** 1.3.8. App en producción real (instalada y en uso), web-remote desplegada.
- **Funciona:** CRUD completo, algoritmos de km, import/export CSV, backups, auto-update, sync bidireccional cada 2 min, web móvil con PIN e historial 24 h.
- **Tests:** los cálculos de `db.js` están cubiertos (`npm test`). Siguen sin tests: sincronización (`sync.js`), API web-remote y UI.
- **Riesgos de seguridad conocidos (pendientes):**
  - **CONFIRMADO (T1, 2026-07-16):** la BD está totalmente expuesta. El repo GitHub es público, la anon key está en `sync.js`, y las 5 tablas tienen una política RLS `allow_all` (todo permitido a `public`). Cualquiera puede leer/modificar/borrar todos los datos. Ojo al arreglar: privatizar el repo rompe el auto-update (usa releases públicas) y la app de escritorio usa la anon key directamente, así que endurecer RLS sin más la rompería.
  - El PIN real (2004) está escrito en `CHANGELOG-SECURITY.md` y `CONTEXT.md`, commiteados en el repo.
  - El token de sesión web es `base64(PIN:timestamp)`: quien vea un token recupera el PIN. Sin rate limiting real en el login (solo un delay de 500 ms).
- **Limpieza pendiente:** `dist2/` (instalador viejo 1.2.0), `.hermes/` y `dogfood-output/` sin trackear; `.gitignore` no los cubre. `AAAAA INSTRUCCIONES.MD` borrado y sustituido por `AAAAA-INSTRUCCIONES.MD` sin commitear.

## Metodología de trabajo

1. Actúas como Agente Supervisor: el usuario no programa; háblale de objetivos y resultados, nunca de detalles de código salvo que lo pida.
2. Toda petición se trocea en tareas atómicas, cada una con un criterio de aceptación verificable. Preséntalas antes de ejecutar.
3. Para explorar código o buscar información extensa, delega en sub-agentes y quédate solo con sus resúmenes; no cargues archivos enteros en el contexto principal sin necesidad.
4. Ninguna tarea se da por cerrada sin pasar la validación: los tests del proyecto (cuando existan) y el criterio de aceptación. Si falla, itera sin pedir intervención del usuario salvo bloqueo real.
5. Al cerrar cada tarea, actualiza la sección "Estado actual" de este archivo en máximo 3 líneas por cambio.
6. Antes de cambios arriesgados (borrar datos, tocar Supabase, releases), explica el riesgo y pide confirmación explícita.
