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

## Estado actual (solo el estado vivo — al cerrar tareas, añadir aquí y mover lo viejo a HISTORIAL.md)
_Última actualización: 2026-08-01._

- **Versión:** 1.6.0 (sin cambiar). Suite: 177 tests en verde, 17 suites (`npm test`).
- **Tema claro/oscuro/negro (2026-08-01):** selector en Ajustes que persiste el color de fondo de ventana en `ui-prefs.json` (evita parpadeo al abrir).
- **Fix crítico de pérdida de datos al vincular (2026-08-01):** antes, dos PCs vinculados a una cuenta que ya tenía datos sufrían colisiones ciegas de ids (ambos empiezan en 1). Ahora `_resolverColisionesPrimeraVinculacion()` en `sync.js` reasigna ids locales que colisionan antes de subir, idempotente y solo la 1ª vez. **Limitación conocida:** dos PCs YA vinculados creando registros simultáneamente pueden colisionar (solución de fondo: ids globales). Registrado en logs.
- **Estadísticas por profesor (2026-08-01):** new `getStatsProfesores` en `db/estadisticas.js`, pantalla Profesores con prácticas/km/alumnos distintos/pista-circulación/última práctica, filtro de fechas y columnas ordenables.
- **Prácticas global (2026-08-01):** new `getTodasPracticas` en `db/estadisticas.js`, módulo `renderer/practicas-global.js` con todas las prácticas de todos los alumnos, filtros, buscador, orden y resumen.
- **Sistema de gráficos configurable (2026-08-01):** 5 gráficos SVG (sin librerías ni CDN, offline-first) en `renderer/graficos.js` + `getDatosGraficos` en `db/estadisticas.js`, configurables desde Ajustes ampliando preferencia de dashboard; paleta `--chart-series-1..8` en `styles.css` con valores por tema.
- **Modales sin cierre accidental (2026-08-01):** arreglado el bug de clic que empieza dentro y termina fuera (ahora mira el ancestro común de mousedown/mouseup, no solo el click final).
- **ADVERTENCIA CRÍTICA — Migración de roles/sucursales pendiente de aplicar:** En `migraciones/` hay SQL + ROLLBACK + README en lenguaje llano (tablas jefe/empleado, sucursales, RLS por sucursal). **La app funciona en "modo clásico" hasta que se aplique**: detecta en runtime si existen las tablas y, si no, se comporta exactamente como hoy. Lado app ya implementado: `getPerfilActual()`, `db/sucursales.js`, gestión de empleados, puerta de acceso (empleado: sin Pagos ni estadísticas de prof.), selector de sede en barra. Únicamente Pagos es seguridad real (RLS servidor); ocultar estadísticas es barrera blanda (empleado YA tiene prácticas locales). 3 correcciones de seguridad: escalada de privilegios por `empresa_id` (trigger que protege rol, empresa_id, sucursal_id), `logs` en coalesce RLS, `buscar_uid_por_email` valida que quien llama es jefe.
- **Subagentes y skills (documentado ya en CLAUDE.md):** explorador/worker/tester/documentador en `.claude/agents/` + 9 skills en `.claude/skills/` (publicar-release, desplegar-web, cambiar-app/web/ui, diagnostico-sync, preparar-cambio, cerrar-tarea, estado-nube).
- **MCPs/CLIs:** SQL vía `node .claude/scripts/sql.js` (Management API); `gh` CLI autenticado. Releases y deploy web vía scripts de Python/JS (sin MCP).
- **CRÍTICO A5 RESUELTO (2026-07-18):** RLS endurecido — `allow_all` reemplazada por `empresa_all` en 7 tablas; `anon` sin acceso. Verificado: anon da 0 filas, sesión autenticada funciona, RPC `reparar_secuencias` activo, smoke test web OK. Operativo: PCs en 1.5.0+ con sesión en Ajustes para sincronizar; sin sesión trabajan local.
- **Notas:** Limpieza pendiente: `dist2/`, `.hermes/`, `dogfood-output/` sin trackear ni ignorar.

## Metodología de trabajo

1. Fable 5 actúa como Director: interpreta la petición, la trocea en tareas atómicas con criterio de aceptación verificable, y las presenta antes de ejecutar. El usuario no programa: háblale de objetivos y resultados, nunca de detalles de código salvo que lo pida.
2. **El Director no ejecuta: dirige.** Toda modificación de archivos (código, documentación o skills) la realiza un subagente de `.claude/agents/` con instrucciones cerradas del Director: qué cambiar, dónde y con qué criterio de aceptación. El Director solo lee/verifica lo mínimo imprescindible para dirigir y validar. Cuatro subagentes según la tarea: **`explorador`** (haiku, solo lectura) cuando no esté claro dónde vive el código, antes de gastar un subagente de escritura; **`worker`** (sonnet) para implementar el cambio; **`tester`** (haiku) para validar con `npm test` y resumir el resultado; **`documentador`** (haiku) para actualizar CLAUDE.md/HISTORIAL.md/skills al cerrar la tarea.
3. Los subagentes deben usar las skills del proyecto (`.claude/skills/`) como primera fuente (mapas, anclas, recetas) en vez de releer archivos enteros — es la vía para ahorrar tokens y ser eficientes.
4. Si un cambio deja desactualizada una skill, el Director dictamina la corrección y la aplica otro worker; nunca el Director directamente.
5. Ninguna tarea se da por cerrada sin validación: los tests del proyecto y el criterio de aceptación. Si falla, el Director itera con nuevos encargos a workers sin pedir intervención del usuario salvo bloqueo real.
6. Al cerrar cada tarea, actualizar la sección "Estado actual" de este archivo en máximo 3 líneas por cambio.
7. Antes de cambios arriesgados (borrar datos, tocar Supabase, releases), explicar el riesgo y pedir confirmación explícita.
