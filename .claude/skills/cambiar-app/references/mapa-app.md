# Mapa del código de escritorio

Localizar siempre por **anclas** (cadenas literales, greppables); nunca por números de línea ni leyendo archivos enteros. Los 4 archivos de app usan secciones comentadas `// ─── NOMBRE`.

## Receta: operación nueva de punta a punta

1. **db.js** — función en su sección: `load()` → mutar el array cacheado → `save()` → `const s = _sync(); if (s) s.markDirty('<tabla>', id)` (o `markDeleted`). Operaciones masivas: además `addLog(tipo, descripcion, detalles)`.
2. **main.js** — handler en `// ─── IPC HANDLERS`: `ipcMain.handle('canal-kebab', (_, ...args) => db.funcionCamel(...args));`
3. **preload.js** — entrada en `exposeInMainWorld('api', {...})`: `funcionCamel: (...a) => ipcRenderer.invoke('canal-kebab', ...a),` (eventos push desde main: `ipcRenderer.on`).
4. **renderer.js** — función en su sección + refresco con su `loadX()` al final.
5. **test** del criterio de aceptación (recetas abajo) → `npm test`.

## renderer.js (~1220 líneas)

**Secciones (anclas):** `DIÁLOGOS NATIVOS (fix de foco)`, `ESTADO`, `NAVEGACIÓN`, `DASHBOARD`, `PESTAÑAS DE PÁGINA (Kilómetros / Datos)`, `VEHÍCULOS`, `ALUMNOS`, `PRÁCTICAS`, `IMPORTAR CSV`, `EXPORTAR / COMPARAR CSV`, `MODALES`, `UTILS`, `PREFERENCIAS (rango de km por defecto)`, `SOLAPAMIENTOS`, `LOGS`, `BACKUP`, `TIMELINE DEL VEHÍCULO`, `SYNC UI`, `CREDENCIALES DE SINCRONIZACIÓN`, `AJUSTES`, `AUTO-UPDATE`, `TOASTS (mensajes no bloqueantes)`, `REGISTRO RÁPIDO`, `INIT` (todas con prefijo `// ─── `).

El sidebar quedó en 4 grupos — Gestión (dashboard, registro-rapido, alumnos, vehiculos), Análisis (kilometros, logs), Datos (datos), Sistema (ajustes) — pero las secciones internas de renderer.js casi no cambiaron de nombre: `IMPORTAR CSV`/`EXPORTAR / COMPARAR CSV` (antes página propia) ahora se renderizan dentro de `page-datos` como pestañas Importar/Exportar/Comparar; `SOLAPAMIENTOS` y `TIMELINE DEL VEHÍCULO` (antes páginas propias) ahora son las pestañas "Conflictos" y "Mapa del vehículo" de `page-kilometros`; `BACKUP` (antes página propia) ahora vive dentro de `page-ajustes` junto con sync, updates y preferencias. Las funciones internas (`loadSolapamientos`, `loadTimelineSelect`, `hacerBackup`, etc.) siguen igual bajo el capó — solo cambió cómo se llega a ellas.

**Funciones por área** (cada una llama a su `window.api.*` homónimo salvo nota):
- Dashboard: `loadDashboard` (getResumen + alertas), `navegarA(page, tab?)` (el 2º argumento opcional selecciona pestaña interna, p.ej. `navegarA('kilometros','conflictos')` para ir directo a Conflictos desde una alerta).
- Vehículos: `loadVehiculos`, `rellenarMasivo`, `addVehiculo`/`deleteVehiculo`, `openEditVehiculo`/`saveVehiculoKm`.
- Alumnos: `loadAlumnos`, `addAlumno`/`deleteAlumno`, `openEditAlumno`/`saveAlumno`, `verAnotaciones`; subvistas con `verPracticas()`/`volverAlumnos()`.
- Prácticas: `loadPracticas`, `generarKmPractica`, `addPractica`/`deletePractica`, `openEditPractica`/`savePractica` (valida solapamiento antes de guardar; refresca según página activa).
- Página Kilómetros (pestañas): `cambiarTabKilometros(tab)` (`'mapa'`|`'conflictos'`) conmuta `#tab-kilometros-mapa`/`#tab-kilometros-conflictos` y dispara `loadTimelineSelect()`/`loadSolapamientos()`. Debajo siguen `loadSolapamientos`/`corregirTodosSolapamientos` (Conflictos) y `loadTimelineSelect`/`loadTimeline`/`renderTimelineChart` (Mapa del vehículo).
- Página Datos (pestañas): `cambiarTabDatos(tab)` (`'importar'`|`'exportar'`|`'comparar'`) conmuta `#tab-datos-importar` etc. Debajo siguen `seleccionarCSV`/`importarCSV`, `exportarCSV`, `seleccionarCsvA/B`/`compararCSVs`.
- Registro rápido: `loadRegistroRapido(Init)`, `renderRRAlumnos`, `abrirNotaRR`/`guardarNotaRR`, `ajustarRR`, `cambiarFechaRR`.
- Ajustes (`loadAjustes`, ejecuta al entrar a la página): pinta versión (`window.api.getVersion()` → `#ajustes-version`), rango km por defecto (`aplicarRangoPref('pref-km-min','pref-km-max')`) y estado de credenciales/sync. Incluye `hacerBackup`/`restaurarBackup` (termina en `location.reload()`) y las barras `#push-all-bar`/`#update-bar` (antes en el footer del sidebar). Preferencia de rango km: `getRangoPref()`/`guardarRangoPref(min,max)` (localStorage `kmalumnos_rango_km`, default 40/45), `aplicarRangoPref(idMin,idMax)` (rellena un par de inputs con la pref guardada, se usa en Vehículos/Kilómetros/Datos/Ajustes) y `guardarRangoPrefDesdeAjustes()` (lee `#pref-km-min`/`#pref-km-max` y guarda).
- Sync: `updateSyncBar`, `syncNow`, `pushAllToCloud`, listener `onSyncStatus`; credenciales `refrescarEstadoCredsSync`/`abrirCredsSync`/`guardarCredsSync`. El footer del sidebar ahora solo tiene el indicador compacto `#sync-dot`/`#sync-label` (click = `syncNow()`) y `#app-version`.
- Update: `checkUpdates`, `showUpdateProgress`, listeners `onUpdate*`.

**Patrones de la casa** (imitarlos, no inventar otros):
- Tabla: `tbody.innerHTML = rows.map(...).join('')` + fila `class="empty"` si no hay datos.
- Modal: `openModal(id)`/`closeModal(id)` (clase `open` sobre `.overlay`); editar = `openEditX()` rellena inputs antes de abrir.
- Avisos: `el.className = 'alert alert-<ok|err|warn|info>'`; no bloqueantes: `showToast(id, msg, type)`/`hideToast` (auto-oculta a los 4 s).
- Refresco: toda función que muta llama a su `loadX()` al terminar.
- **Escape**: `esc(str)` en todo HTML inyectado con datos del usuario.
- Navegación: links del `#sidebar` con `data-page` conmutan `.page` y despachan a su `loadX()`.

## main.js (~280 líneas)

Secciones `// ─── IPC HANDLERS` y `// ─── SYNC IPC HANDLERS`; ventana en `function createWindow() {`; auto-updater desde `// NO descargar automáticamente - preguntar primero` (listeners `autoUpdater.on(...)`).

Handlers: mecánicos en su mayoría — canal kebab-case → misma función camelCase de db.js (`get-vehiculos`→`db.getVehiculos`, `add-practica`→`db.addPractica`...). Excepciones con lógica propia: `importar-csv`/`comparar-csvs` (parsean el CSV en main), `exportar-csv` y `crear-backup`/`restaurar-backup` (diálogos de archivo), `generar-km` (cálculo inline), `save-sync-creds`/`get-sync-creds-status` (safeStorage local + `sync.setCredentials`), `sync-now`/`sync-push-all`/`sync-status` → `sync.*`. Handler mecánico sin argumentos: `ipcMain.handle('app:version', () => app.getVersion())`, justo tras el handler de fix de foco `ui:refocus`; expuesto en preload.js como `getVersion: () => ipcRenderer.invoke('app:version')` y pintado en `#app-version` (footer del sidebar) y `#ajustes-version` (página Ajustes).

## db.js (~940 líneas)

**Secciones:** `BACKUP`, `VALIDACIÓN CRUZADA DE KM`, `VEHÍCULOS`, `ALUMNOS`, `PRÁCTICAS`, `IMPORTACIÓN CSV`, `EXPORTACIÓN CSV`, `COMPARADOR DE CSV`, `RELLENO MASIVO DE KM`, `CORRECCIÓN QUIRÚRGICA DE SOLAPAMIENTOS`, `SOLAPAMIENTOS`, `ALUMNOS POR VEHÍCULO (para registro rápido)`, `TIMELINE DE VEHÍCULO`. Logs: `addLog(tipo, ...)` arriba del archivo (unshift + recorte a 500).

**El mecanismo de sync — la trampa nº 1 del proyecto:** es `db.js` quien marca, nunca `main.js`. Tras `save()`, cada mutadora hace `const s = _sync(); if (s) s.markDirty('<tabla>', id)` (`_sync()` es un require lazy de `./sync` que evita la dependencia circular). Ejemplo canónico, `addPractica`: `load()` → push a `d.practicas` → si `kf > v.km_actual` actualiza el odómetro del vehículo → `save()` → `markDirty('practicas', id)`. **Si tu función muta prácticas Y vehículo, marca los dos.** La validación de negocio (fechas, solapamientos) vive en renderer/IPC, no en db.js.

## sync.js (~450 líneas)

Secciones: `PENDING QUEUE` (`markDirty`, `markDeleted`), `SYNC` (`async function sync()`), `FULL PUSH (subida completa inicial)` (`pushAll`), `AUTO-SYNC`. No obvio:
- `markDirty/markDeleted` solo escriben en `pending_sync.json`; la subida real es en `sync()`. `markDeleted` saca el id de la cola dirty (no subir lo que se va a borrar).
- Descarga en orden estricto vehículos → alumnos → prácticas; prácticas remotas cuyo alumno/vehículo no exista aún en local se descartan en esa pasada.
- Conflictos por `updated_at` (gana el más reciente; local más nuevo no se pisa). `pushAll` NO adelanta `lastSync` (a propósito).
- Error de login ≠ offline: `_authError` distingue "Credenciales de sincronización inválidas" de "Sin conexión".

## Tests (Jest, `npm test`)

`helpers.js` → `resetData(db)` limpia un dir temporal por proceso y `db._clearCache()`; `electron` está mockeado vía `moduleNameMapper` en jest.config.js.

**Test de db.js:**
```js
const db = require('../db');
const { resetData } = require('./helpers');
beforeEach(() => { resetData(db); });
test('...', () => {
  const vid = db.addVehiculo('Coche 1', '', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-07-01', 0, 0);
  expect(db.rellenarKmMasivo(vid, 40, 45)).toEqual({ rellenadas: 1, saltadas: 0 });
});
```
(Si hay azar: `jest.spyOn(Math, 'random').mockReturnValue(0.5)` y `restoreAllMocks` en afterEach.)

**Test de sync:** declarar ANTES de requerir `sync` (hoisting de Jest):
```js
const mockRemote = { online: true, tables: {} };
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./mocks/fake-supabase')(mockRemote)
}));
```
Luego `resetData`, sembrar `data.json` a mano (patrón `writeData(baseData())` de sync.test.js), llamar `sync.sync()`/`pushAll()` y comprobar `mockRemote.tables` y/o los ficheros locales. `mockRemote.online = false` simula estar sin conexión.
