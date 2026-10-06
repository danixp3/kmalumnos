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
- **Km**: `rellenarKmMasivo(vid,min,max,inicio?,final?)`, `getPracticasSinKm`, `corregirSolapamientos`, `getSolapamientos`, `validarSolapamiento`, `getResumen`, `getTimelineVehiculo`. **Cuadrar km (2026-10-06, `db/cuadre-km.js`)**: `proponerCuadreKm(vid, opciones)` → `aplicarCuadreKm(vid, cambios)` → `deshacerCuadreKm(id)`; ordena por fecha y hora, arregla km imposibles (inicial 0, final < inicial, 600 km en una clase…), reparte los huecos entre las clases sin km y nunca inventa clases (los tramos sin explicar se dan por `marcarHuecoRevisado`). `getTodasPracticas` usa su `mapaContinuidad` (la clase con km rotos se señala a sí misma; huecos ≤ 15 km = el coche volviendo a la autoescuela).
- **Fracciones de clase y firmas** (2026-10-02): `practica.fraccion` (¼ ½ ¾, null = entera) cuenta lo que vale en cobros (precio × fracción), totales y ficha DGT (`core.clasesDePractica`/`fmtClases`). `alumno.minutos_sobrantes` = minutos acumulados de clases por minutos (lo escribe solo la web). `profesor.firma` (PNG) firma todas sus clases en la ficha DGT (`getDatosFichaDGT` → `firma_alumno`/`firma_profesor` por fila; `fichas-dgt.js` las dibuja). Pie de la ficha: firma del director (ajuste compartido `ajustes_empresa.director`, perfil en Profesores; si es profesor, su misma firma) y del profesor de la cabecera.
- **Cobros** (2026-10-01): conceptos en `ajustes_empresa.conceptos_cobro` (`getConceptosCobro/setConceptosCobro`, compartidos con la web) y `addCargosAlta` (matrícula y demás al dar de alta). Pago «por clases» = n × tarifa del permiso (solo UI, se guarda como un pago normal).
- **Pagos**: `getTarifas/setTarifa/deleteTarifa`, `getPagosByAlumno/addPago/updatePago/deletePago`, `getDeudas` (deuda por alumno) y `getDesglosePagosAlumno(alumno_id)` (desglose práctica a práctica, FIFO en céntimos) — estas dos últimas **solo lectura, no marcan sync**.
- **Dashboard**: `getStatsDashboard(hoy?)` — solo lectura, `{ practicasHoy, kmMes, totalAdeudado, alumnosConDeuda }` para las tarjetas opcionales del dashboard (dinero en euros con decimales, no céntimos).
- **CSV**: `importarCSV(rows,min,max)` (alumno por DNI o nombre y apellidos en cualquier orden, fechas AAAA-MM-DD o dd/mm/aaaa; el handler lee con el lector universal), `exportarCSV` (nombre completo + `dni`), `compararCSVs`.
- **Datos ampliados, coches retirados, exámenes y listas largas** (2026-10-03, v1.26.0): `db/campos-extra.js` define los campos nuevos de alumnos/profesores/vehículos (tipo y limpieza) y lo usan alta, edición, sync e importación — un campo nuevo es una línea ahí + migración. Ficha del alumno editable en el sitio (`#ficha-datos`, `updateAlumnoCampos`), coches `activo=false` (fuera de selectores para dar clase, estadísticas por coche y el móvil), buscador de exámenes (`buscarExamenes`), exportar a Excel (`db/exportar.js`), estado de alumno `inactivo`. Listas de miles de filas: `pintarPorTandas` + `retrasar` en el renderer (nunca pintar todo de golpe).
- **Traer de otro programa** (2026-10-02): `db/lector-tablas.js` (Excel/ODS/DBF con SheetJS, CSV/TXT con cualquier separador y codificación, texto pegado) + `db/migracion.js` (`detectarTablaMigracion` → `analizarImportacion` = vista previa → `aplicarImportacion` → `deshacerImportacion`; alumnos con todos sus datos o historial de clases como `tipo_detalle='anterior'`; empareja por DNI/nombre sin duplicar; registro local `data.importaciones`). Pantalla `renderer/migracion.js`. **Ariauto** (2026-10-03): `db/ariauto.js` lee su base Access (.accdb, `mdb-reader`) y la importa por su cuenta (alumnos en curso, clases ya hechas, exámenes, tasas, caducidades, coches, profesores, centro; cobros opcionales y desaconsejados porque Ariauto no los apunta).
- **Nº de registro y coche del profesor** (2026-10-03): `siguienteNRegistro` (db/campos-extra.js; misma regla en web-remote/api/_utils.js) da el siguiente nº al dar de alta (escritorio, Puesta en marcha, móvil); `profesores.vehiculo_id` = coche habitual (migración `2026-10-03_profesor_vehiculo.sql` APLICADA; campo de `CAMPOS_EXTRA.profesores`), lo propone la web al iniciar/anotar. Importar de Ariauto o de Excel empareja también por parecido y no vuelve a contar las clases que el alumno ya tiene en la app (ver mapa-app, `ariauto.js`).
- **Backup**: `crearBackup`, `restaurarBackup` (⚠ no marca pendientes de subir), `getLastSaveError`.

## sync.js

Auto-sync cada 2 min: sube pendientes de `pending_sync.json` (solo sale de la cola lo que la nube confirma; alumnos, prácticas, pagos y cargos por lotes de 200 con las mismas columnas, varios a la vez; borrados en bloques de 200 ids; el contador de ids se pone por encima de `ids_maximos()` de la nube). Cada cuenta que entra en el PC tiene sus propios datos locales (`cuentas/<id>/`, se cambian solos al iniciar sesión con otra) → baja de la nube, por páginas, todo con `updated_at > lastSync` (inicio del sync anterior − 10 min; alumnos/prácticas/pagos en dos pasos para no re-bajar lo propio ni los borrados), en orden vehículos → alumnos → prácticas. Ids ≥ 1e9 = creados en la web (rango propio). Detalle y reglas en `/cambiar-app` (sección sync.js). Conflictos por `updated_at` (gana el más reciente; local más nuevo no se pisa). Funciones: `sync()`, `pushAll()` (sube todo, no adelanta `lastSync`), `markDirty(tabla,id)`, `markDeleted(tabla,id)` (muchos de golpe: `markDirtyVarios/markDeletedVarios(tabla, ids)`, nunca en bucle), `getStatus()` (`offline|syncing|ok|error|pending`), `startAutoSync/stopAutoSync/onStatusChange`. URL y anon key hardcodeadas; si hay credenciales de cuenta de sync (cifradas con `safeStorage` en `sync_creds.json`) autentica antes.

## Ventana y preferencias de UI (localStorage)

La ventana de escritorio es `frame: false` (sin marco nativo): la barra de título la pinta `index.html`/`renderer/ventana.js` (`#titlebar`), con los canales IPC `ventana-minimizar/-maximizar/-cerrar/-esta-maximizada` y el evento push `ventana-maximizada`. Varias preferencias de usuario viven en `localStorage`, no en `data.json` (no sincronizan entre PCs): rango km por defecto (`kmalumnos_rango_km`), tarjetas visibles del dashboard (`kmalumnos_dashboard_stats`), tutorial visto por página (`kmalumnos_tutorial_visto`), bienvenida descartada (`kmalumnos_bienvenida_descartada`).

## web-remote/ (Vercel, ES modules — la app usa `require`)

`index.html` (SPA móvil del profesor, rediseño 2026-09-29: Hoy → Iniciar → En curso → Km final (escritos o «Los pone la app») → Firma; mapa fino en /cambiar-web) + `api/`: `_utils.js` (CORS, validación, `requireAuth` con JWT Bearer de Supabase Auth, `getSupabase(token)` → RLS por empresa, `conFallbackColumnas` para columnas de migraciones no aplicadas), `vehiculos`/`alumnos`/`hoy`/`historial`/`practicas-alumno`/`profesores`/`agenda-profesor` (GET), `practica` (POST clásico km=0,0), `registrar-clase` (POST, clase completa hecha sin cobertura; reenviable sin duplicar), `iniciar-practica`/`finalizar-practica`/`firmar-practica` (POST, flujo en curso), `anotar-practica` (POST, clase olvidada hasta 30 días atrás), `crear-alumno` (carga los cobros de alta de `ajustes_empresa.conceptos_cobro`), `cancelar-practica` (soft delete, solo `source='web-remote'`), `alumno-*` (portal del alumno). Envs en Vercel: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SYNC_EMAIL`, `SYNC_PASSWORD` (ya no hay PIN). **Sin conexión (2026-10-06):** `web-remote/offline.js` + bloque «SIN CONEXIÓN» de `index.html` (cola en IndexedDB, caché de lecturas, clases hechas sin red) — detalle en `/cambiar-web`. Pruebas: `npm run test:api` (api + offline + service worker). Tocar web-remote ⇒ desplegar con /desplegar-web.

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

## Tests

`npm test` (Jest, 546 en verde). `tests/` con mock de Electron en `tests/mocks/`; los de `db/` corren contra un directorio temporal (nunca datos reales) y los de `sync.js` contra un Supabase simulado en memoria (`tests/sync.test.js`). **Toda tarea de código añade o ajusta tests de su criterio de aceptación.**
