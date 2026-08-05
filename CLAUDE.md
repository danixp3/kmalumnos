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
_Última actualización: 2026-08-06. El detalle histórico completo está en HISTORIAL.md._

- **Versión:** 1.15.1 (2026-08-06) — correcciones de interfaz. (1) **Calendario**: al pulsar las flechas de cambio de mes se cerraba solo. Causa: `dpRender()` reescribe el `innerHTML` del popup, dejando el `e.target` del clic fuera del DOM, y el manejador global de 'clic fuera' lo interpretaba como externo. Arreglado en `renderer/datepicker.js` (guarda `e.target.isConnected` + `stopPropagation` en `dpClickPop`) y además ahora se reposiciona al cambiar de mes. Bug PREEXISTENTE (venía de antes de la v1.14.0). (2) **Exámenes**: el desplegable de profesor salía vacío — `abrirNuevaPresentacion` llamaba a `llenarSelectProfesores` sin `await`. (3) **Jornada**: `actualizarBotonFichaje` se dispara en cada tecla y las respuestas podían llegar desordenadas, dejando el botón apuntando a la jornada de otro empleado; ahora descarta respuestas obsoletas (token de secuencia) y `toggleFichaje` reconsulta la jornada abierta antes de fichar en vez de fiarse del `dataset` del botón. (4) **main.js**: `loadFile('index.html')` pasa a ruta absoluta con `path.join(__dirname, ...)` (la relativa se resolvía contra `app.getAppPath()`).
- **Probador de interfaz (2026-08-06):** `npm run smoke` (`scripts/smoke-ui.js`) arranca la app real instrumentada, espera a que cargue, ejecuta una prueba de regresión del calendario, recorre las 19 secciones y abre todos los modales detectando errores de consola, promesas rechazadas y desplegables vacíos; con `npm run smoke -- --guardar` además rellena y guarda un registro en cada pantalla haciendo copia de `data.json` y restaurándola al terminar. Existe porque **`package.json` no define config de jest → los tests corren en entorno node sin DOM: cubren `db/` y `sync.js` pero NADA de `renderer/`**. Los 4 bugs de la 1.15.1 se encontraron así.
- **Versión anterior:** 1.15.0 (2026-08-06). Segundo bloque de puro desarrollo (7 tareas): C3 bonos + política cancelación, D3 informes avanzados (PDF/CSV), D1 arqueo + formas pago + morosidad, D2 cargos, D4 CRM, A3 ficha de prácticas firmable, D6 auditoría + permisos granulares. Todo aditivo, suite 335 tests / 37 suites en verde.
- **RUMBO — Pivote a SaaS modular (2026-08-04):** AulaMovil será un SaaS por módulos contratables por empresa. **`PLAN-MAESTRO.md` (2026-08-06) es la hoja de ruta general**: estado real del producto + checklist de mercado (`ANALISISAUTGEST.md`) contrastado + fases A–E de todo lo que falta. Complementos: `ROADMAP-SAAS.md` (visión SaaS), `INVESTIGACION-AUES-VERIFACTU.md` (AUES/VeriFactu/firma/pagos), `CHECKLIST-PROPIETARIO.md` (tareas del dueño). Leer `PLAN-MAESTRO.md` al arrancar tarea nueva.
- **Base de módulos/entitlements (2026-08-04):** creada la infraestructura de "módulos contratados por empresa" SIN aplicar en Supabase y SIN cambiar comportamiento. `migraciones/2026-08-04_modulos_empresa.sql` (+ROLLBACK): tabla `modulos_empresa` (PK `empresa_id,modulo`), RLS solo SELECT `authenticated` por empresa. `sync.js:getModulosActivos()` (caché, error→modo clásico) + IPC `get-modulos-activos` + preload + `renderer/roles.js:moduloActivo(nombre)` (false en modo clásico; el núcleo NO lo llama aún). Hardening: `buscar_uid_por_email` en la migración de roles ahora exige rol='jefe' estricto (evita enumeración de cuentas). Tests: `tests/modulos.test.js` (6). Suite: **207 tests / 18 suites** en verde. APLICADO en Supabase el 2026-08-05 (ver entrada "APLICADO EN SUPABASE").
- **Agenda/reservas + analítica (2026-08-05, Fase 0/1/2):** (a) **Agenda** — tabla `reservas` APLICADA en Supabase (RLS empresa), db/reservas.js + sync (patrón sucursales, gateado) + pantalla "Agenda" (crear/confirmar/cancelar/realizar) + tarjeta dashboard + buscador. Modelo "solicitudes de práctica" (estado solicitada/confirmada/cancelada/realizada). **El alumno YA solicita desde el portal** (2026-08-06): `portal_solicitar_reserva()` + secuencia `reservas_portal_id_seq` (ids >= 1e9, rango DISJUNTO del escritorio; sync.js no avanza `_seq.r` con ids >= 1e9 → nunca colisionan). `portal_mis_datos()` devuelve también las próximas clases. Web desplegada. Migración `2026-08-06_portal_reservas.sql` APLICADA. (b) **Semáforo de examen** (`db/estadisticas.js:getSemaforoExamen`) — verde/ámbar/rojo por nº prácticas+km+recencia, en lista de alumnos y dashboard. (c) **Alumnos en riesgo de abandono** (`getAlumnosEnRiesgo`, >30 días sin práctica) en dashboard. Todo db+UI verificado (node --check + tests); UI de escritorio NO validada visualmente (sin entorno gráfico aquí). Suite: **233 tests / 23 suites**.
- **Portal del alumno v1 — solo lectura, login por email OTP (2026-08-05, Fase 0 · Bloque 2):** entregable aditivo, NO rompe la web actual (solo se modifican/crean archivos del propio portal en `web-remote/`; index.html y demás intactos). Flujo: alumno escribe su email → código de un solo uso al correo (Supabase Auth email OTP = el "2FA") → ve sus prácticas en solo lectura; casilla "recordar sesión". Alumno gana campo `email` (app+sync, gateado para no romper modo clásico; commit previo). Archivos: `web-remote/alumno.html` (3 pantallas), `api/alumno-solicitar-codigo.js` (anti-enumeración: 200 genérico siempre), `api/alumno-mis-datos.js` (JWT del alumno → RPC). Migraciones NO aplicadas: `2026-08-05_alumno_email.sql` (columna email) y `2026-08-05_portal_alumno.sql` (funciones `alumno_email_existe(text)` y `portal_mis_datos()` SECURITY DEFINER; esta última sin parámetros, saca el email de `auth.jwt()` → imposible falsear). Enfoque `portal_token` anterior DESCARTADO. Portal gateado por módulo `portal_alumno` (`empresa_tiene_portal(uuid)`, graceful: sin `modulos_empresa` no bloquea). Plan de aplicación consolidado en `migraciones/RUNBOOK-APLICACION-SAAS.md`. Suite 211 en verde. Migraciones APLICADAS el 2026-08-05 (ver entrada "APLICADO EN SUPABASE"). Falta solo config de Supabase Auth (email OTP + plantilla `{{ .Token }}`) para que llegue el código. Siguiente capa (reservar/pagar/firmar) requiere decisión de agenda.
- **Investigación AUES/VeriFactu (2026-08-04):** informe de viabilidad cerrado. AUES = Web Service oficial DGT (certificado @firma + alta `soportecau@dgt.es` + homologación pruebas→producción; 2 operaciones: tramitabilidad y solicitud). VeriFactu = API de tercero como colaborador social (VerifactuAPI.es/Facturware, cliente sin certificado). Firma OTP (eIDAS) + pagos Stripe/Redsys por API. Detalle y fuentes en `INVESTIGACION-AUES-VERIFACTU.md`.
- **Versión anterior:** 1.14.0 (PUBLICADA 2026-08-06, auto-update verificado). Cumplimiento legal y ciclo DGT (módulos locales, sin sync): A1 jornadas laborales (fichaje/salida auditadas, export CSV art. 34.9), A2 libro registro alumnos (nº inscripción, permisos, imprimible RD 1295/2003), B3 vencimientos (ITV/seguro/psico/DNI/certificado), B1 estados ampliados + permisos múltiples, B2 convocatorias (exámenes, tasas). Suite: 291 tests / 30 suites en verde.
- **Versión anterior:** 1.13.0 (PUBLICADA 2026-08-06, auto-update verificado). Añade las "funciones básicas" pedidas: ficha del alumno enriquecida (teléfono, DNI, fecha nacimiento, dirección, fecha alta, observaciones), estado del alumno (activo/aprobado/baja) + filtro, buscador de alumnos por DNI/teléfono, resumen económico por alumno desde su ficha (generado/pagado/saldo + pagos + desglose), y ficha imprimible/PDF del alumno. También: el alumno ya solicita reservas desde el portal (web, ya desplegado). Columnas nuevas de alumno APLICADAS en Supabase (telefono, dni, fecha_nacimiento, direccion, fecha_alta, observaciones, estado). Suite: **250 tests / 25 suites**. App verificada que arranca sin errores.
- **Versión anterior:** 1.12.0 (PUBLICADA 2026-08-05, auto-update verificado). Incluía todo lo del pivote SaaS visible en escritorio: Agenda/reservas (con nº de prácticas configurable y auto-creación de prácticas al completar), Semáforo de examen, Alumnos en riesgo de abandono, Análisis de uso/coste de vehículos, campo email del alumno, y ajustes (minutos por clase, precio/consumo combustible). Portal del alumno (web) validado y funcionando por enlace mágico. Suite: **244 tests / 24 suites** en verde. App verificada que arranca sin errores.
- **Versión anterior:** 1.11.0 (release publicada, auto-update verificado).
- **Buscador global en la barra de título (2026-08-04, v1.11.0):** `renderer/buscador.js` + pastilla `.cir-search` en `#titlebar`; filtra secciones y funciones concretas (catálogo `BUSCADOR_DESTINOS` con `page`/`tab`/`anchor`/`kw`), muestra resultados desde la 1ª letra, navega vía `navegarA()` y hace scroll + resaltado (`.cir-flash`) a la tarjeta destino (anclas `id` añadidas en Ajustes y Vehículos). Atajo Ctrl/⌘+K.
- **Rebranding KMAlumnos → AulaMovil + logo real (2026-08-04, v1.10.1):** cambios visuales en título de ventana, modales de bienvenida/backup, barras y sidebar; dominio web remoto migrado a aulamovil.vercel.app con redirects y CORS actualizados; logo real (volante + birrete + móvil, azul/naranja) integrado en app y web via `img/generar-iconos.js` (sharp + png-to-ico, exporta `icon.png`/`logo.png`/`icon.ico` con recorte automático); identificadores internos conservados para compatibilidad con datos y auto-update.
- **APLICADO EN SUPABASE (2026-08-05):** las 4 migraciones del pivote SaaS están aplicadas en producción y verificadas (datos intactos: 51 alumnos, 357 prácticas, 10 vehículos): `2026-08-01_roles_y_sucursales`, `2026-08-04_modulos_empresa`, `2026-08-05_alumno_email`, `2026-08-05_portal_alumno`. Backfill de `perfiles`: las 3 cuentas quedaron jefe de su propia empresa (RLS equivalente a antes → sin cambios para la app). Módulo `portal_alumno` ACTIVADO para la empresa principal `8cd0d71a` (pzdani04+kmsync). Endurecimiento aplicado: `empresa_tiene_portal` y `portal_mis_datos` revocadas de anon/PUBLIC (Supabase concede EXECUTE por defecto). Índice matrícula única ya estaba aplicado de antes. La detección "modo clásico" en runtime SIGUE existiendo en el código (backward-compat) pero producción ya es multi-empresa. Solo Pagos es seguridad real (RLS servidor); ocultar estadísticas es barrera blanda.
- **Migraciones NO aplicadas acumuladas:** `2026-08-06_alumno_libro.sql`, `2026-08-06_alumno_permisos.sql`, `2026-08-06_pago_forma_empleado.sql`, `2026-08-06_cargos.sql` — aplicarlas en Supabase cuando se quiera sincronizar libro/permisos/forma_pago-empleado/cargos entre PCs.
- **PENDIENTE para el portal del alumno end-to-end:** (1) configurar Supabase Auth (habilitar email OTP + plantilla con `{{ .Token }}` + SMTP propio para volumen) — tarea de panel del propietario; (2) poner email a los alumnos (campo ya en la app). Sin (1) el portal responde pero no llega el código.
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
