# Mapa condensado de KMAlumnos

Versión comprimida de CONTEXT.md para orientarse sin leerlo. Si algo de aquí contradice al código, manda el código (y conviene actualizar este mapa al cerrar la tarea).

## Flujo de una operación de UI (escritorio)

```
index.html (SPA, CSS inline) → renderer.js (toda la UI, vanilla JS)
  → window.api.<metodo>()        [preload.js: contextBridge]
  → ipcMain.handle('<canal>')    [main.js]
  → db.js (datos locales) y/o sync.js (nube)
```

**Una operación nueva de UI toca los 4 archivos**: función en `db.js`/`sync.js` → handler en `main.js` → exposición en `preload.js` → llamada y pintado en `renderer.js`. El renderer está aislado (`contextIsolation: true`, `nodeIntegration: false`): nada de `require` ni acceso directo a datos desde la UI.

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

## db.js — funciones por bloque (firmas completas en CONTEXT.md si hacen falta)

- **CRUD**: `getVehiculos/addVehiculo/updateVehiculoKm/deleteVehiculo`, `getAlumnos/addAlumno/updateAlumno/deleteAlumno` (borra también sus prácticas), `getPracticasByAlumno/getUltimaPractica/addPractica/updatePractica/deletePractica`.
- **Km**: `rellenarKmMasivo(vid,min,max,inicio?,final?)`, `getPracticasSinKm`, `corregirSolapamientos`, `getSolapamientos`, `validarSolapamiento`, `getResumen`, `getTimelineVehiculo`.
- **CSV**: `importarCSV(rows,min,max)`, `exportarCSV`, `compararCSVs`.
- **Backup**: `crearBackup`, `restaurarBackup` (⚠ no marca pendientes de subir), `getLastSaveError`.

## sync.js

Auto-sync cada 2 min: sube pendientes de `pending_sync.json` → baja de la nube todo con `updated_at > lastSync`, en orden vehículos → alumnos → prácticas. Conflictos por `updated_at` (gana el más reciente; local más nuevo no se pisa). Funciones: `sync()`, `pushAll()` (sube todo, no adelanta `lastSync`), `markDirty(tabla,id)`, `markDeleted(tabla,id)`, `getStatus()` (`offline|syncing|ok|error|pending`), `startAutoSync/stopAutoSync/onStatusChange`. URL y anon key hardcodeadas; si hay credenciales de cuenta de sync (cifradas con `safeStorage` en `sync_creds.json`) autentica antes.

## web-remote/ (Vercel, ES modules — la app usa `require`)

`index.html` (SPA móvil) + `api/`: `_utils.js` (CORS, validación, auth, `getSupabase()` server-side con `SYNC_EMAIL`/`SYNC_PASSWORD`), `auth` (POST, PIN→token base64 24 h), `vehiculos`/`alumnos` (GET), `practica` (POST, crea con km=0,0), `crear-alumno` (POST), `historial` (GET últimas 24 h), `cancelar-practica` (POST, soft delete, solo `source='web-remote'`). Envs en Vercel: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `API_PIN`, `SYNC_EMAIL`, `SYNC_PASSWORD`. Tocar web-remote ⇒ desplegar con /desplegar-web.

## Checklist de invariantes (repasar SIEMPRE antes de codificar)

1. **Toda mutación de datos en `db.js` debe llamar a `markDirty`/`markDeleted`** — incluidas las masivas e indirectas. Olvidarlo dejó 113 prácticas con km=0 en la nube (v1.3.12).
2. **Borrados = soft delete siempre** (`deleted=true` + `updated_at`), nunca DELETE real en Supabase: la FK de prácticas lo impide para alumnos y sin tombstone los otros dispositivos no se enteran (v1.3.11).
3. **Fechas como strings `YYYY-MM-DD`** sin zona horaria; Supabase/Vercel van en UTC (por eso el historial web filtra "últimas 24 h", no "hoy").
4. **Español en todo**: funciones de dominio, mensajes de UI, commits.
5. Leer `data.json` con defensas (puede faltar o estar dañado); escribir siempre atómico (v1.3.10).
6. Cambios de esquema en Supabase: por migración (`apply_migration`) y compatibles con las versiones de la app ya instaladas en los 2 PCs.

## Tests

`npm test` (Jest, 38 en verde). `tests/` con mock de Electron en `tests/mocks/`; los de `db.js` corren contra un directorio temporal (nunca datos reales) y los de `sync.js` contra un Supabase simulado en memoria (`tests/sync.test.js`). **Toda tarea de código añade o ajusta tests de su criterio de aceptación.**
