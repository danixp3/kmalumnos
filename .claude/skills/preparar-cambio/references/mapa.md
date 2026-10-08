# Mapa condensado de KMAlumnos

Versión comprimida de CONTEXT.md para orientarse sin leerlo. Si algo de aquí contradice al código, manda el código (y conviene actualizar este mapa al cerrar la tarea).

## Flujo de una operación de UI (escritorio)

```
index.html (SPA, enlaza styles.css) → renderer/<modulo>.js (18 <script> clásicos, orden fijo)
  → window.api.<metodo>()        [preload.js: contextBridge]
  → ipcMain.handle('<canal>')    [main.js]
  → db/<modulo>.js (datos locales, vía db.js índice) y/o sync.js (nube)
```

**Una operación nueva de UI toca 4 capas**: función en `db/<modulo>.js`/`sync.js` → handler en `main.js` → exposición en `preload.js` → llamada y pintado en `renderer/<modulo>.js`. El renderer está aislado (`contextIsolation: true`, `nodeIntegration: false`): nada de `require` ni acceso directo a datos desde la UI. Detalle de módulos y anclas en `/cambiar-app`.

## Datos

`data.json` en `%APPDATA%\kmalumnos\` (fuente de verdad local, escritura atómica vía `.tmp`+rename):

```js
{
  vehiculos: [{ id, nombre, matricula, km_actual }],
  alumnos:   [{ id, nombre, permiso, vehiculo_id }],
  practicas: [{ id, alumno_id, vehiculo_id, fecha, km_inicial, km_final, nota?, updated_at? }],
  logs:      [{ id, fecha, tipo, descripcion, detalles[] }],
  _seq:      { v, a, p }   // autoincrement local
}
```

Supabase (proyecto `dmwoqugdnwgkcqtixhyw`): tablas `vehiculos`, `alumnos`, `practicas` con columnas extra `updated_at` (motor del sync), `deleted` (soft delete) y `source` (`'desktop'`|`'web-remote'`), más `meta` para el ping. IDs: `_seq` en local, SERIAL en la nube; al sincronizar se respeta el id de quien creó el registro.

## db/ — funciones por bloque (firmas completas en CONTEXT.md si hacen falta)

- **CRUD**: `getVehiculos/addVehiculo/updateVehiculoKm/deleteVehiculo`, `getAlumnos/addAlumno/updateAlumno/deleteAlumno` (borra también sus prácticas), `getPracticasByAlumno/getUltimaPractica/addPractica/updatePractica/deletePractica`.
- **Km**: `rellenarKmMasivo(vid,min,max,inicio?,final?)`, `getPracticasSinKm`, `corregirSolapamientos`, `getSolapamientos`, `validarSolapamiento`, `getResumen`, `getTimelineVehiculo`. **Cuadrar km (2026-10-06, `db/cuadre-km.js`)**: `proponerCuadreKm(vid, opciones)` → `aplicarCuadreKm(vid, cambios)` → `deshacerCuadreKm(id)`; ordena por fecha y hora, arregla km imposibles (inicial 0, final < inicial, 600 km en una clase…), reparte los huecos entre las clases sin km y nunca inventa clases (los tramos sin explicar se dan por `marcarHuecoRevisado`). **Asistente de km y editor de clases (2026-10-07)**: `recomendarPlanKm(vid)` / `proponerPlanKm(vid, pasos)` (`db/plan-km.js`, pasos combinables simulados en secuencia → `aplicarCuadreKm`) y `proponerClase(op)` / `aplicarClase(prev)` / `sumarClasesDia` (`db/clases-sesion.js`: añadir, editar o encajar clases en ¼, ubicar los km, desplazar las siguientes, borrar la firma si cambia la cantidad). Las vistas previas usan `core.simular(fn)` (clon de los datos, `save()`/`_sync()` apagados): una función que se previsualice debe poder ejecutarse así. `getTodasPracticas` usa su `mapaContinuidad` (la clase con km rotos se señala a sí misma; huecos ≤ 15 km = el coche volviendo a la autoescuela).
- **Fracciones de clase y firmas** (2026-10-02): `practica.fraccion` (¼ ½ ¾, null = entera) cuenta lo que vale en cobros (precio × fracción), totales y ficha DGT (`core.clasesDePractica`/`fmtClases`). `alumno.minutos_sobrantes` = minutos acumulados de clases por minutos (lo escribe solo la web). `profesor.firma` (PNG) firma todas sus clases en la ficha DGT (`getDatosFichaDGT` → `firma_alumno`/`firma_profesor` por fila; `fichas-dgt.js` las dibuja). Pie de la ficha: firma del director (ajuste compartido `ajustes_empresa.director`, perfil en Profesores; si es profesor, su misma firma) y del profesor de la cabecera.
- **Cantidades de clase (2026-10-06):** todo va de ¼ en ¼. `core.leerCantidadClases` lee «1,5», «1 ½», «1/2», «0.25»…; `trozosDeClases(2.75)` = [1, 1, 0.75] (una práctica por trozo, la fracción en `fraccion`); `kmPorPesos(total, pesos)` reparte km en proporción. `alumno.clases_previas` admite fracción (numeric en la nube, migración `2026-10-06_clases_previas_fracciones.sql`); la numeración de clases es `Math.ceil(previas + suma de lo que vale cada una)` (escritorio y web). Lo usan Puesta en marcha (clases ya hechas, clases anteriores, archivo de la IA), «Traer de otro programa», el CSV de prácticas (columna opcional `clases`) y Ariauto.
- **Alumnos repetidos y nombres juntos (2026-10-06, `db/alumnos-repetidos.js`):** `proponerSepararNombres`/`aplicarSepararNombres` (los creados en el móvil con todo en `nombre`), `buscarAlumnosRepetidos` (mismo DNI o nombre + mismo permiso, sin nº distinto), `previaFusionAlumnos` → `fusionarAlumnos` (todo lo de una ficha pasa a la otra: practicas, pagos, cargos, reservas, presentaciones, tasas, bonos, leads, vencimientos; completa vacíos; copia previa; `data.fusiones_alumnos`) → `deshacerFusionAlumnos` (usa `sync.desmarcarBorradosVarios`). Ariauto y Excel/CSV aceptan `opciones.decisiones` (por ficha/fila: id del alumno de la app, 'nuevo' u 'omitir').
- **Cobros** (2026-10-01): conceptos en `ajustes_empresa.conceptos_cobro` (`getConceptosCobro/setConceptosCobro`, compartidos con la web) y `addCargosAlta` (matrícula y demás al dar de alta). Pago «por clases» = n × tarifa del permiso (solo UI, se guarda como un pago normal).
- **Pagos**: `getTarifas/setTarifa/deleteTarifa`, `getPagosByAlumno/addPago/updatePago/deletePago`, `getDeudas` (deuda por alumno) y `getDesglosePagosAlumno(alumno_id)` (desglose práctica a práctica, FIFO en céntimos) — estas dos últimas **solo lectura, no marcan sync**.
- **Dashboard**: `getStatsDashboard(hoy?)` — solo lectura, `{ practicasHoy, kmMes, totalAdeudado, alumnosConDeuda }` para las tarjetas opcionales del dashboard (dinero en euros con decimales, no céntimos).
- **CSV**: `importarCSV(rows,min,max)` (alumno por DNI o nombre y apellidos en cualquier orden, fechas AAAA-MM-DD o dd/mm/aaaa; el handler lee con el lector universal), `exportarCSV` (nombre completo + `dni`), `compararCSVs`.
- **Datos ampliados, coches retirados, exámenes y listas largas** (2026-10-03, v1.26.0): `db/campos-extra.js` define los campos nuevos de alumnos/profesores/vehículos (tipo y limpieza) y lo usan alta, edición, sync e importación — un campo nuevo es una línea ahí + migración. Ficha del alumno editable en el sitio (`#ficha-datos`, `updateAlumnoCampos`), coches `activo=false` (fuera de selectores para dar clase, estadísticas por coche y el móvil), buscador de exámenes (`buscarExamenes`), exportar a Excel (`db/exportar.js`), estado de alumno `inactivo`. Listas de miles de filas: `pintarPorTandas` + `retrasar` en el renderer (nunca pintar todo de golpe).
- **Traer de otro programa** (2026-10-02): `db/lector-tablas.js` (Excel/ODS/DBF con SheetJS, CSV/TXT con cualquier separador y codificación, texto pegado) + `db/migracion.js` (`detectarTablaMigracion` → `analizarImportacion` = vista previa → `aplicarImportacion` → `deshacerImportacion`; alumnos con todos sus datos o historial de clases como `tipo_detalle='anterior'`; empareja por DNI/nombre sin duplicar; registro local `data.importaciones`). Pantalla `renderer/migracion.js`. **Ariauto** (2026-10-03): `db/ariauto.js` lee su base Access (.accdb, `mdb-reader`) y la importa por su cuenta (alumnos en curso, clases ya hechas, exámenes, tasas, caducidades, coches, profesores, centro; cobros opcionales y desaconsejados porque Ariauto no los apunta).
- **Nº de registro y coche del profesor** (2026-10-03): `siguienteNRegistro` (db/campos-extra.js; misma regla en web-remote/api/_utils.js) da el siguiente nº al dar de alta (escritorio, Puesta en marcha, móvil); `profesores.vehiculo_id` = coche habitual (migración `2026-10-03_profesor_vehiculo.sql` APLICADA; campo de `CAMPOS_EXTRA.profesores`), lo propone la web al iniciar/anotar. Importar de Ariauto o de Excel empareja también por parecido y no vuelve a contar las clases que el alumno ya tiene en la app (ver mapa-app, `ariauto.js`).
- **Procedencia (2026-10-08, `db/procedencia.js`):** `procedencia` = programa del que se trajo el dato (null = creado en AulaMovil) en alumnos, prácticas, profesores, coches, pagos, cargos (sincronizan) y exámenes, tasas, caducidades (locales). Todo importador nuevo debe llamar a `etiquetarCreados(d, registro.creados, nombre)` antes de `registrarImportacion`. `getProcedencias`, `renombrarProcedencia` (vacío = quitar), `coincideProcedencia`, `etiquetarImportacionesAnteriores` (al arrancar). Registro compartido en `ajustes_empresa.procedencias`.
- **Backup**: `crearBackup`, `restaurarBackup` (⚠ no marca pendientes de subir), `getLastSaveError`.

## sync.js

**Casi en vivo (2026-10-07, v1.33.0):** además del sync completo cada 2 min (red de seguridad), `sondearNube()` pregunta cada 12 s (30 s sin foco, 90 s minimizada; `setRitmoSondeo`) la última `updated_at` de `practicas`, `alumnos`, `profesores` y `reservas` (una fila por tabla) y SOLO si cambió respecto a lo visto tras el último sync correcto lanza `sync()`; `sondearAhora()` al volver a la ventana, al despertar el PC y al recuperar internet. Tras subir lo suyo el PC ve «novedades» una vez más (son propias, no hay bucle). `onDatosNuevos(cb)` avisa `{pulled, practicas}` a la UI cuando un sync TRAE datos (main.js lo reenvía como `datos-actualizados`). Realtime de Supabase se descartó: exige migración (`alter publication supabase_realtime`) y el sondeo basta. **Auto-sync cada 2 min:** sube pendientes de `pending_sync.json` (solo sale de la cola lo que la nube confirma; alumnos, prácticas, pagos y cargos por lotes de 200 con las mismas columnas, varios a la vez; borrados en bloques de 200 ids; el contador de ids se pone por encima de `ids_maximos()` de la nube). Cada cuenta que entra en el PC tiene sus propios datos locales (`cuentas/<id>/`, se cambian solos al iniciar sesión con otra) → baja de la nube, por páginas, todo con `updated_at > lastSync` (inicio del sync anterior − 10 min; alumnos/prácticas/pagos en dos pasos para no re-bajar lo propio ni los borrados), en orden vehículos → alumnos → prácticas. Ids ≥ 1e9 = creados en la web (rango propio). Detalle y reglas en `/cambiar-app` (sección sync.js). Conflictos por `updated_at` (gana el más reciente; local más nuevo no se pisa). Funciones: `sync()`, `pushAll()` (sube todo, no adelanta `lastSync`), `markDirty(tabla,id)`, `markDeleted(tabla,id)` (muchos de golpe: `markDirtyVarios/markDeletedVarios(tabla, ids)`, nunca en bucle), `getStatus()` (`offline|syncing|ok|error|pending`), `startAutoSync/stopAutoSync/onStatusChange`. URL y anon key hardcodeadas; si hay credenciales de cuenta de sync (cifradas con `safeStorage` en `sync_creds.json`) autentica antes.

## Ventana y preferencias de UI (localStorage)

La ventana de escritorio es `frame: false` (sin marco nativo): la barra de título la pinta `index.html`/`renderer/ventana.js` (`#titlebar`), con los canales IPC `ventana-minimizar/-maximizar/-cerrar/-esta-maximizada` y el evento push `ventana-maximizada`. Varias preferencias de usuario viven en `localStorage`, no en `data.json` (no sincronizan entre PCs): rango km por defecto (`kmalumnos_rango_km`), tarjetas visibles del dashboard (`kmalumnos_dashboard_stats`), tutorial visto por página (`kmalumnos_tutorial_visto`), bienvenida descartada (`kmalumnos_bienvenida_descartada`).

## web-remote/ (Vercel, ES modules — la app usa `require`)

`index.html` (SPA móvil del profesor, rediseño 2026-09-29: Hoy → Iniciar → En curso → Km final (escritos o «Los pone la app») → Firma; mapa fino en /cambiar-web) + `api/`: `_utils.js` (CORS, validación, `requireAuth` con JWT Bearer de Supabase Auth, `getSupabase(token)` → RLS por empresa, `conFallbackColumnas` para columnas de migraciones no aplicadas), `vehiculos`/`alumnos`/`hoy`/`historial`/`practicas-alumno`/`profesores`/`agenda-profesor` (GET), `practica` (POST clásico km=0,0), `registrar-clase` (POST, clase completa hecha sin cobertura; reenviable sin duplicar), `iniciar-practica`/`finalizar-practica`/`firmar-practica` (POST, flujo en curso), `anotar-practica` (POST, clase olvidada hasta 30 días atrás; km escritos, `km_auto` o sin km), `km-coche` (GET, clase anterior/siguiente del coche en un día y hora), `crear-alumno` (nombre y apellidos separados, DNI, teléfono; 409 `posible_duplicado`; carga los cobros de alta de `ajustes_empresa.conceptos_cobro`), `cancelar-practica` (soft delete, solo `source='web-remote'`), `alumno-*` (portal del alumno). Envs en Vercel: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SYNC_EMAIL`, `SYNC_PASSWORD` (ya no hay PIN). **Sin conexión (2026-10-06):** `web-remote/offline.js` + bloque «SIN CONEXIÓN» de `index.html` (cola en IndexedDB, caché de lecturas, clases hechas sin red) — detalle en `/cambiar-web`. Pruebas: `npm run test:api` (api + offline + service worker). Tocar web-remote ⇒ desplegar con /desplegar-web.

## Seguridad y legal (2026-10-07) — no romper

- Electron 44 con `sandbox`, CSP en `index.html` y navegación bloqueada: nada de recursos externos ni `window.open` en el renderer (PDF/impresión: IPC `documento-pdf`). En la web, CSP por `vercel.json`: todo servido desde el propio sitio.
- RLS por empresa en todas las tablas; `perfiles` sin inserción directa (migración `2026-10-07_seguridad.sql`). Funciones nuevas `SECURITY DEFINER`: `set search_path` y `revoke ... from public, anon`.
- Datos personales: borrar = anonimizar (`db/privacidad.js`), exportar = `db/exportar.js`; las exportaciones y anonimizaciones quedan en el historial. Km que pone la app → `tipo_detalle = 'km_auto'` (la ficha DGT los marca con «*»).
- Textos legales: `scripts/paginas-legales.js` + `VERSION_LEGAL` (también en `renderer/legal.js`); al cambiar condiciones, subir la versión en los dos. Resumen en `LEGAL.md`.

## Checklist de invariantes (repasar SIEMPRE antes de codificar)

1. **Toda mutación de datos en `db/` debe llamar a `markDirty`/`markDeleted`** — incluidas las masivas e indirectas. Olvidarlo dejó 113 prácticas con km=0 en la nube (v1.3.12).
2. **Borrados = soft delete siempre** (`deleted=true` + `updated_at`), nunca DELETE real en Supabase: la FK de prácticas lo impide para alumnos y sin tombstone los otros dispositivos no se enteran (v1.3.11).
3. **Fechas como strings `YYYY-MM-DD`** sin zona horaria; Supabase/Vercel van en UTC (por eso el historial web filtra "últimas 24 h", no "hoy").
4. **Español en todo**: funciones de dominio, mensajes de UI, commits.
5. Leer `data.json` con defensas (puede faltar o estar dañado); escribir siempre atómico (v1.3.10).
6. Cambios de esquema en Supabase: por migración (`apply_migration`) y compatibles con las versiones de la app ya instaladas en los 2 PCs.
7. **supabase-js no lanza ante un error** (RLS, FK, sesión caducada): devuelve `{ error }`. Todo `await sb.from(...)` que escribe debe comprobarlo; ignorarlo perdió registros en silencio hasta 2026-10-01.
9. **La clave primaria de cada tabla de la nube es global** (todas las empresas): los ids nuevos del escritorio salen por encima de `ids_maximos()`; nunca reutilizar ids «libres» de la propia empresa.
8. **PostgREST devuelve como mucho 1.000 filas**: listados sin límite natural → paginar (`_traerTodo` en sync.js, `traerTodo` en web-remote).
10. **Web móvil: ninguna acción que escriba datos puede ejecutarse dos veces** (doble toque / reintento por mala cobertura): `unaVez` en el cliente + endpoint idempotente en el servidor (mapa-web, invariante 7).
11. **Cambiar el nº de clases de una sesión cerrada borra la firma** (`firma=null`; en el escritorio además `firma_borrar=true` para que el sync la quite de la nube): lo firmado era otra cantidad.


## Tests

`npm test` (Jest, 627 en verde). `tests/` con mock de Electron en `tests/mocks/`; los de `db/` corren contra un directorio temporal (nunca datos reales) y los de `sync.js` contra un Supabase simulado en memoria (`tests/sync.test.js`). **Toda tarea de código añade o ajusta tests de su criterio de aceptación.**
