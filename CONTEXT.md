# KMALUMNOS — Contexto del proyecto

## Stack
- **Electron** app de escritorio (Node.js + Chromium)
- Sin base de datos: almacenamiento en `data.json` en `app.getPath('userData')`
- Sin módulos nativos externos, solo `fs`, `path`, `electron`

## Arquitectura
```
main.js      → proceso principal Electron, IPC handlers
preload.js   → puente contextBridge, expone window.api al renderer
renderer.js  → lógica UI (vanilla JS, sin framework)
db.js        → toda la lógica de datos (CRUD + algoritmos)
index.html   → SPA con CSS inline, sin bundler
```

## Estructura de datos (data.json)
```js
{
  vehiculos: [{ id, nombre, matricula, km_actual }],
  alumnos:   [{ id, nombre, permiso, vehiculo_id }],
  practicas: [{ id, alumno_id, vehiculo_id, fecha, km_inicial, km_final }],
  logs:      [{ id, fecha, tipo, descripcion, detalles[] }],
  _seq:      { v, a, p }  // auto-increment IDs
}
// km_inicial=0 && km_final=0 → práctica "sin km" (pendiente de rellenar)
// permiso: 'B' | 'A' | 'A2' | 'AM' | 'C'
// fecha: string 'AAAA-MM-DD'
```

---

## db.js — Funciones exportadas

### Vehículos
| Función | Firma | Descripción |
|---|---|---|
| `getVehiculos` | `()` | Lista ordenada por nombre |
| `addVehiculo` | `(nombre, matricula, km_actual)` → id | Crea vehículo |
| `updateVehiculoKm` | `(id, km)` | Actualiza odómetro |
| `deleteVehiculo` | `(id)` | Borra y desasigna de alumnos |

### Alumnos
| Función | Firma | Descripción |
|---|---|---|
| `getAlumnos` | `()` | Lista con `vehiculo_nombre` añadido |
| `addAlumno` | `(nombre, permiso, vehiculo_id)` → id | Crea alumno |
| `updateAlumno` | `(id, nombre, permiso, vehiculo_id)` | Edita alumno |
| `deleteAlumno` | `(id)` | Borra alumno y todas sus prácticas |

### Prácticas
| Función | Firma | Descripción |
|---|---|---|
| `getPracticasByAlumno` | `(alumno_id)` | Lista ordenada por fecha+id, con `vehiculo_nombre` |
| `getUltimaPractica` | `(alumno_id)` | Última práctica del alumno |
| `addPractica` | `(alumno_id, vehiculo_id, fecha, km_inicial, km_final)` → id | Crea práctica, actualiza `km_actual` del vehículo si kf > km_actual |
| `updatePractica` | `(id, fecha, km_inicial, km_final)` | Edita práctica |
| `deletePractica` | `(id)` | Borra práctica |

### Algoritmos de KM
| Función | Firma | Descripción |
|---|---|---|
| `rellenarKmMasivo` | `(vehiculo_id, kmMin=40, kmMax=45)` → `{rellenadas}` | Rellena prácticas con km=0,0. Algoritmo: ordena por fecha, usa cursor = max km_final de prácticas con km reales anteriores o iguales, asigna ki=cursor, kf=cursor+rand(min,max) |
| `getPracticasSinKm` | `(vehiculo_id)` → número | Cuenta prácticas con km_inicial=0 y km_final=0 |
| `corregirSolapamientos` | `(vehiculo_id, kmMin=40, kmMax=45)` → `{corregidas}` | Algoritmo quirúrgico: ordena por km_inicial, detecta solapamientos [a.kmI, a.kmF] ∩ [b.kmI, b.kmF] ≠ ∅, mantiene "ancla" (primera), desplaza "móvil" preservando duración. Máx 10 pasadas |
| `getSolapamientos` | `()` | Devuelve lista de conflictos `{vehiculo, vehiculo_id, practica_a, practica_b}` |
| `validarSolapamiento` | `(vehiculo_id, fecha, kmI, kmF, excluirPracticaId=null)` → conflictos[] | Comprueba si rango [kmI,kmF] solapa con otras prácticas del mismo vehículo |
| `getResumen` | `()` → `{vehiculos, alumnos, practicas}` | Contadores globales |

### CSV Import
| Función | Firma | Descripción |
|---|---|---|
| `importarCSV` | `(rows[], kmMin=40, kmMax=45)` → `{insertados, errores, erroresDetalle}` | `rows` = objetos `{alumno, vehiculo, fecha, km_inicial, km_final}`. Crea vehículos/alumnos si no existen. Si km vacíos, genera automáticamente encadenando desde el último km_final del alumno |

### Logs
| Función | Firma | Descripción |
|---|---|---|
| `getLogs` | `()` | Devuelve logs (máx 500, más recientes primero) |
| `clearLogs` | `()` | Borra todos los logs |
| Tipos de log | — | `'importacion'`, `'relleno'`, `'correccion'` |

### Backup
| Función | Firma | Descripción |
|---|---|---|
| `crearBackup` | `(destDir)` → `{ok, file}` | Copia `data.json` a `kmalumnos_backup_TIMESTAMP.json` |
| `restaurarBackup` | `(srcFile)` → `{ok, msg?}` | Valida estructura y sobreescribe `data.json`, limpia caché |

---

## main.js — IPC Handlers (channel → db función)
```
get-vehiculos       → db.getVehiculos()
add-vehiculo        → db.addVehiculo(nombre, matricula, km_actual)
delete-vehiculo     → db.deleteVehiculo(id)
update-vehiculo-km  → db.updateVehiculoKm(id, km)

get-alumnos         → db.getAlumnos()
add-alumno          → db.addAlumno(nombre, permiso, vehiculo_id)
delete-alumno       → db.deleteAlumno(id)
update-alumno       → db.updateAlumno(id, nombre, permiso, vehiculo_id)

get-practicas       → db.getPracticasByAlumno(alumno_id)
get-ultima-practica → db.getUltimaPractica(alumno_id)
add-practica        → db.addPractica(aid, vid, fecha, ki, kf)
delete-practica     → db.deletePractica(id)
update-practica     → db.updatePractica(id, fecha, ki, kf)

get-resumen         → db.getResumen()
get-solapamientos   → db.getSolapamientos()
rellenar-km-masivo  → db.rellenarKmMasivo(vid, min, max)
get-practicas-sin-km→ db.getPracticasSinKm(vid)
corregir-solapamientos → db.corregirSolapamientos(vid, min, max)
validar-solapamiento→ db.validarSolapamiento(vid, f, ki, kf, exId)
get-logs            → db.getLogs()
clear-logs          → db.clearLogs()
generar-km          → calcula: ki=kmInicial, kf=ki+rand(min,max) → {km_inicial, km_final, diff}

crear-backup        → dialog.showOpenDialog (carpeta) → db.crearBackup(dir)
restaurar-backup    → dialog.showOpenDialog (archivo .json) → db.restaurarBackup(file)
open-csv-dialog     → dialog.showOpenDialog → filePath|null
importar-csv        → lee CSV con fs, parsea, llama db.importarCSV(rows, min, max)
```

---

## preload.js — window.api (renderer → IPC)
```js
// Vehículos
window.api.getVehiculos()
window.api.addVehiculo(nombre, matricula, km)
window.api.deleteVehiculo(id)
window.api.updateVehiculoKm(id, km)

// Alumnos
window.api.getAlumnos()
window.api.addAlumno(nombre, permiso, vehiculo_id)
window.api.deleteAlumno(id)
window.api.updateAlumno(id, nombre, permiso, vehiculo_id)

// Prácticas
window.api.getPracticas(alumno_id)
window.api.getUltimaPractica(alumno_id)
window.api.addPractica(aid, vid, fecha, ki, kf)
window.api.deletePractica(id)
window.api.updatePractica(id, fecha, ki, kf)

// Utilidades
window.api.generarKm(kmInicial, min, max)    // → {km_inicial, km_final, diff}
window.api.getResumen()
window.api.getSolapamientos()
window.api.rellenarKmMasivo(vid, min, max)
window.api.getPracticasSinKm(vid)
window.api.corregirSolapamientos(vid, min, max)
window.api.validarSolapamiento(vid, fecha, ki, kf, excluirId)
window.api.getLogs()
window.api.clearLogs()
window.api.crearBackup()
window.api.restaurarBackup()
window.api.openCsvDialog()
window.api.importarCsv(filePath, kmMin, kmMax)
```

---

## renderer.js — Funciones UI

### Estado global
```js
currentAlumnoId         // alumno seleccionado en vista prácticas
currentAlumnoVehiculoId // vehículo del alumno seleccionado
selectedCsvPath         // ruta del CSV seleccionado
vehiculosCache          // array de vehículos cacheado
```

### Funciones por sección
| Función | Descripción |
|---|---|
| `loadDashboard()` | Carga stats (resumen) |
| `loadVehiculos()` | Renderiza tabla vehículos + actualiza select relleno masivo |
| `actualizarContadorSinKm()` | Muestra nº prácticas sin km del vehículo seleccionado |
| `rellenarMasivo()` | Llama `rellenarKmMasivo`, muestra alerta resultado |
| `addVehiculo()` | Lee form y crea vehículo |
| `deleteVehiculo(id, nombre)` | Confirm + borrar |
| `openEditVehiculo(id, nombre, km)` | Abre modal editar vehículo |
| `saveVehiculoKm()` | Guarda km del modal vehículo |
| `loadVehiculosSelect()` | Rellena selects `a-vehiculo` y `edit-a-vehiculo` |
| `loadAlumnos()` | Renderiza tabla alumnos con nº prácticas |
| `addAlumno()` | Lee form y crea alumno |
| `deleteAlumno(id, nombre)` | Confirm + borrar |
| `openEditAlumno(id, nombre, permiso, vehiculo_id)` | Abre modal editar alumno |
| `saveAlumno()` | Guarda alumno del modal |
| `verPracticas(alumnoId, vehiculoId, nombre)` | Cambia a vista prácticas del alumno |
| `volverAlumnos()` | Vuelve a lista alumnos |
| `loadPracticas()` | Renderiza tabla prácticas del alumno actual |
| `generarKmPractica()` | Genera km aleatorios desde última práctica o km vehículo |
| `addPractica()` | Añade práctica (ki/kf vacíos → guarda 0,0) |
| `deletePractica(id)` | Confirm + borrar |
| `openEditPractica(id, fecha, ki, kf)` | Abre modal editar práctica |
| `savePractica()` | Guarda práctica con validación de solapamiento (confirm si hay conflicto) |
| `seleccionarCSV()` | Abre dialog CSV, guarda path |
| `importarCSV()` | Importa CSV con rango km, muestra resultado |
| `showImportAlert(msg, type)` | Muestra alerta importación ('ok'/'err'/'info') |
| `loadSolapamientos()` | Analiza y renderiza solapamientos por vehículo |
| `corregirTodosSolapamientos()` | Corrige todos los vehículos afectados en bucle |
| `loadLogs()` | Renderiza historial de operaciones |
| `borrarLogs()` | Confirm + borrar logs |
| `hacerBackup()` | Crea backup, muestra ruta resultado |
| `restaurarBackup()` | Restaura backup y recarga app |
| `openModal(id)` / `closeModal(id)` | Gestión de modales overlay |
| `fmt(num)` | Formatea número con `es-ES`, 1 decimal |
| `fmtFecha(str)` | `AAAA-MM-DD` → `DD/MM/AAAA` |
| `esc(str)` | Escapa comillas y `<>` para HTML |
| `tagPermiso(p)` | Devuelve `<span class="tag tag-b/a/c">` |

---

## Páginas del SPA (index.html)
| ID | Sección |
|---|---|
| `page-dashboard` | Panel principal con stats |
| `page-vehiculos` | CRUD vehículos + relleno masivo |
| `page-alumnos` | CRUD alumnos + vista prácticas inline |
| `page-importar` | Importación CSV |
| `page-solapamientos` | Detección y corrección de solapamientos |
| `page-logs` | Historial de operaciones automáticas |
| `page-backup` | Crear/restaurar backup JSON |

## Modales
- `modal-vehiculo` → editar km del vehículo
- `modal-alumno` → editar nombre/permiso/vehículo del alumno
- `modal-practica` → editar fecha/km de práctica (con validación solapamiento)
