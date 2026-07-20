# KMAlumnos

## Qué es
Aplicación de escritorio (Windows) para una autoescuela: gestiona vehículos, alumnos y los kilómetros de sus prácticas. Tiene además una web móvil ("web-remote") para registrar prácticas desde el teléfono. El usuario/propietario no programa: trabajar en modo supervisor, explicando en términos de objetivos y resultados.

## Stack
- **Escritorio:** Electron 33 (Node.js + Chromium), JavaScript vanilla, sin framework ni bundler. Instalador NSIS vía `electron-builder`, auto-update con `electron-updater` contra releases de GitHub (`danixp3/kmalumnos`).
- **Datos locales:** `data.json` en `app.getPath('userData')` (fuente de verdad, offline-first). Cola de cambios pendientes en `pending_sync.json`.
- **Backend remoto:** Supabase (PostgreSQL) — proyecto `dmwoqugdnwgkcqtixhyw`, tablas `vehiculos`, `alumnos`, `practicas` (+ `meta` para ping). Cliente `@supabase/supabase-js`; URL y anon key están hardcodeadas en `sync.js`.
- **Web móvil:** `web-remote/` desplegada en Vercel (https://kmalumnos-remote.vercel.app). Serverless functions en `web-remote/api/`, login email/contraseña de Supabase Auth (misma cuenta de empresa que el escritorio), peticiones autenticadas con `Authorization: Bearer <access_token>`.

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
_Última actualización: 2026-07-20._

- **SaaS puro (2026-07-20):** cuenta de empresa ahora obligatoria — ya no existe "Continuar sin cuenta" ni modo local: el modal de bienvenida es un gate bloqueante (`comprobarBienvenida()` exige `getEstadoCuenta().conectado`) que además oculta `#app` del todo (`gate-hidden`, no solo difuminado) hasta iniciar sesión o crear cuenta, y cerrar sesión reabre el gate. Alta de empresas nuevas reactivada en Supabase Auth (`disable_signup: false`, `site_url`/`uri_allow_list` apuntando a la web). Reset de contraseña y confirmación de email de punta a punta con páginas dedicadas en `web-remote/` (`reset-password.html`, `email-confirmado.html`) que hacen `signOut()` inmediato para no dejar sesión abierta en el navegador. Tras registrarse, botón "Ir a iniciar sesión" (pre-rellena email/contraseña) y reintento automático en segundo plano hasta que el email quedé confirmado (login solo, sin más clics). `getEstadoCuenta().conectado` ahora depende de `_authOk` (autenticación realmente confirmada, persistida en `auth_status.json`), no solo de si hay credenciales guardadas — corrige un bug donde el gate podía darse por bueno sin que el login hubiera funcionado nunca. Campos de contraseña con botón de mostrar/ocultar (`toggleVerPassword`). **Auditoría de aislamiento multi-empresa (2026-07-20, tras prueba real de Víctor con 2 cuentas en el mismo PC):** confirmado en Supabase real (no solo por código) que las 8 tablas tienen RLS activo con la política correcta y el rol `anon` sin ningún permiso efectivo; los endpoints de `web-remote/api/` pasan el JWT propio del usuario a Supabase (no una clave de servicio) además de filtrar por `empresa_id`, doble capa. El problema que vio Víctor no era de la base de datos: `data.json` (caché local del PC) no estaba vinculado a ninguna cuenta, así que una segunda cuenta creada en el mismo PC seguía viendo los datos locales de la primera. Corregido con un marcador de propiedad (`local_empresa.json`: `{empresaId, email}`) — si no hay marcador se adopta la cuenta actual en silencio (no afecta a instalaciones existentes de un solo negocio); si hay marcador y no coincide con la cuenta que acaba de iniciar sesión, `getEstadoCuenta().conflictoEmpresa` lo expone y el gate muestra un modal bloqueante con dos opciones: vaciar datos locales y descargar limpio los de la cuenta actual (`resolverConflictoEmpresa()`, nunca `pushAll`), o cancelar y volver a iniciar sesión con la cuenta correcta. `pushAll()` (botón "Subir todo a la nube") rechaza la operación mientras el conflicto siga sin resolver, para no reasignar en la nube datos de la cuenta anterior a la nueva. Pendiente de mejora, no urgente: los `id` de las tablas son una secuencia global compartida entre empresas (no UUID), así que el RPC `reparar_secuencias` necesita ver el máximo de todas las empresas para repararla (solo expone un contador, no datos) y en teoría una empresa podría estimar el volumen total de registros del sistema por los huecos de sus propios ids — cambiar a UUID lo cerraría del todo pero es un cambio de esquema grande, no se ha hecho. Suite: 140 tests en verde. Limitación conocida: no se ha probado con una cuenta de prueba real el envío/recepción del email (de registro, reset o confirmación) de punta a punta — pendiente de que Víctor lo pruebe con su correo.
- **Versión:** 1.8.0 (2026-07-20) publicada en GitHub (https://github.com/danixp3/kmalumnos/releases/tag/v1.8.0) con auto-update verificado (latest.yml → 1.8.0, instalador HTTP 200) → `RELEASE-OK`. Contenido: SaaS puro (cuenta obligatoria, registro/login/reset de contraseña de punta a punta) + salvaguarda de aislamiento multi-empresa en el mismo PC. Commit `7c4c7d8`. Los PCs se actualizarán solos al reiniciar la app.
- **Skills del proyecto** (`.claude/skills/`, usarlas siempre que aplique en vez de rehacer el proceso a mano): `/publicar-release` (release completa verificada), `/desplegar-web` (deploy Vercel por API), `/diagnostico-sync` (runbook de discrepancias de datos), `/preparar-cambio` (arranque de tarea con mapa condensado), `/cerrar-tarea` (ritual de cierre), `/estado-nube` (chequeo rápido local vs nube), `/cambiar-web` (desarrollo de web-remote con mapa + smoke test), `/cambiar-app` (desarrollo de escritorio: anclas + receta punta a punta + tests), `/mejorar-ui` (rediseño iterativo de las dos interfaces).
- **MCPs/CLIs:** tokens en `.mcp.json` (git-ignored). SQL de Supabase vía `node .claude/scripts/sql.js` (Management API); el MCP de Supabase queda solo como fallback y para `get_logs` en /diagnostico-sync. `gh` CLI autenticado con el PAT de `.mcp.json` (si da 401: `gh auth login --with-token` con ese PAT). Releases siguen vía `publicar_release.py` y deploy web vía `desplegar_web.js` (API REST, sin MCP).
- **Notas:** el smoke test de la web (`/cambiar-web`) usa las envs SYNC_EMAIL/SYNC_PASSWORD de Vercel solo como credenciales de prueba. Limpieza pendiente: `dist2/`, `.hermes/`, `dogfood-output/` sin trackear ni ignorar.

## Metodología de trabajo

1. Fable 5 actúa como Director: interpreta la petición, la trocea en tareas atómicas con criterio de aceptación verificable, y las presenta antes de ejecutar. El usuario no programa: háblale de objetivos y resultados, nunca de detalles de código salvo que lo pida.
2. **El Director no ejecuta: dirige.** Toda modificación de archivos (código, documentación o skills) la realiza un worker (Agent tool con `model: "sonnet"`) con instrucciones cerradas del Director: qué cambiar, dónde y con qué criterio de aceptación. El Director solo lee/verifica lo mínimo imprescindible para dirigir y validar.
3. Los workers deben usar las skills del proyecto (`.claude/skills/`) como primera fuente (mapas, anclas, recetas) en vez de releer archivos enteros — es la vía para ahorrar tokens y ser eficientes.
4. Si un cambio deja desactualizada una skill, el Director dictamina la corrección y la aplica otro worker; nunca el Director directamente.
5. Ninguna tarea se da por cerrada sin validación: los tests del proyecto y el criterio de aceptación. Si falla, el Director itera con nuevos encargos a workers sin pedir intervención del usuario salvo bloqueo real.
6. Al cerrar cada tarea, actualizar la sección "Estado actual" de este archivo en máximo 3 líneas por cambio.
7. Antes de cambios arriesgados (borrar datos, tocar Supabase, releases), explicar el riesgo y pedir confirmación explícita.
