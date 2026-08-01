# KMALUMNOS — Contexto del proyecto

## Stack
- **Electron** app de escritorio (Node.js + Chromium)
- **Supabase** como backend remoto (PostgreSQL)
- **Vercel** para web-remote (registro móvil)
- Almacenamiento local en `data.json` en `app.getPath('userData')`
- Sincronización bidireccional offline-first

## Arquitectura
```
┌─────────────────────────────────────────────────────────────────┐
│                    APP ELECTRON (ESCRITORIO)                     │
├─────────────────────────────────────────────────────────────────┤
│ main.js      → proceso principal, IPC handlers, auto-updater    │
│ preload.js   → puente contextBridge, expone window.api          │
│ renderer/    → lógica UI (vanilla JS), 18 <script> por dominio  │
│ db.js        → índice de 40 líneas, re-exporta db/ (51 exports) │
│ db/          → CRUD + algoritmos, 10 módulos, guarda data.json  │
│ sync.js      → sincronización bidireccional con Supabase        │
│ index.html   → SPA (solo HTML) + styles.css                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ sync cada 2 min
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                 │
│  Proyecto: kmalumnos-bd (dmwoqugdnwgkcqtixhyw)                  │
│  Tablas: vehiculos, alumnos, practicas                          │
│  Columnas especiales:                                           │
│    - updated_at: timestamp para sync                            │
│    - deleted: soft delete                                       │
│    - source: 'desktop' | 'web-remote' (origen de la práctica)   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ API REST
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    WEB-REMOTE (VERCEL)                          │
│  URL: https://kmalumnos-remote.vercel.app                       │
│  Función: registrar prácticas desde móvil                       │
│  Autenticación: PIN de 4 dígitos                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Estructura de datos

### data.json (local)
```js
{
  vehiculos: [{ id, nombre, matricula, km_actual }],
  alumnos:   [{ id, nombre, permiso, vehiculo_id }],
  practicas: [{ id, alumno_id, vehiculo_id, fecha, km_inicial, km_final, nota?, updated_at? }],
  logs:      [{ id, fecha, tipo, descripcion, detalles[] }],
  _seq:      { v, a, p }  // auto-increment IDs locales
}
```

### Supabase (remoto)
```sql
-- Tablas con IDs auto-incrementales (SERIAL)
-- Columnas adicionales: updated_at, deleted, source
-- source = 'desktop' | 'web-remote'
```

---

## sync.js — Sincronización

### Estrategia offline-first
1. La app siempre trabaja contra `data.json` (fuente de verdad local)
2. `pending_sync.json` guarda IDs de cambios pendientes de subir
3. Al sincronizar: sube cambios locales → baja cambios remotos
4. Sin internet: funciona 100% local, cambios se encolan

### Funciones
| Función | Descripción |
|---------|-------------|
| `sync()` | Sincronización completa: sube pending, baja nuevos del remoto |
| `pushAll()` | Sube TODOS los datos locales (útil para primera sincronización) |
| `markDirty(table, id)` | Marca un registro como pendiente de sincronizar |
| `markDeleted(table, id)` | Marca un registro como eliminado (soft delete remoto) |
| `getStatus()` | Estado actual: 'offline', 'syncing', 'ok', 'error', 'pending' |
| `startAutoSync(ms)` | Inicia sync automático cada N ms (default 2 min) |
| `stopAutoSync()` | Detiene el sync automático |
| `onStatusChange(cb)` | Callback cuando cambia el estado de sync |

### Resolución de conflictos
- Compara `updated_at` antes de sobrescribir
- Si local es más reciente que remoto, NO sobrescribe (preserva edición local)
- Si remoto es más reciente, actualiza local

### Estados de sync
```js
STATUS = {
  OFFLINE:  'offline',   // Sin conexión a internet
  SYNCING:  'syncing',   // Sincronizando...
  OK:       'ok',        // Todo sincronizado
  ERROR:    'error',     // Error de sync
  PENDING:  'pending'    // Hay cambios locales sin subir
}
```

---

## db/core.js — Mejoras de robustez

### save() — Guardado atómico
```js
// Antes: escribía directo (riesgo de corrupción si falla a mitad)
// Ahora: escribe a .tmp y renombra (atómico)
function save() {
  try {
    fs.writeFileSync(path + '.tmp', data);
    fs.renameSync(path + '.tmp', path);  // Atómico
    return true;
  } catch (e) {
    _lastSaveError = { timestamp, message, code };
    return false;
  }
}
```

### getLastSaveError()
Devuelve el último error de guardado (si lo hubo) para mostrar al usuario.

---

## web-remote/ — Registro desde móvil

### URL
https://kmalumnos-remote.vercel.app

### Autenticación
- PIN de 4 dígitos configurado en Vercel (`API_PIN`)
- Token válido 24 horas
- Se guarda en localStorage

### Endpoints API (Vercel Functions)

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/auth` | POST | ❌ | Login con PIN → devuelve token |
| `/api/vehiculos` | GET | ✅ | Lista vehículos |
| `/api/alumnos` | GET | ✅ | Lista alumnos |
| `/api/practica` | POST | ✅ | Registrar práctica (km=0,0) |
| `/api/crear-alumno` | POST | ✅ | Crear alumno nuevo |
| `/api/historial` | GET | ✅ | Prácticas de últimas 24h desde web |
| `/api/cancelar-practica` | POST | ✅ | Cancelar práctica (soft delete) |

### Archivos
```
web-remote/
├── index.html          → SPA con login, registro, historial
├── api/
│   ├── _utils.js       → CORS, validadores, auth helpers
│   ├── auth.js         → Endpoint de login
│   ├── vehiculos.js    → GET vehículos
│   ├── alumnos.js      → GET alumnos
│   ├── practica.js     → POST nueva práctica
│   ├── crear-alumno.js → POST nuevo alumno
│   ├── historial.js    → GET últimas 24h
│   └── cancelar-practica.js → POST cancelar
└── package.json
```

### Seguridad implementada
1. **Autenticación PIN**: Token base64 con timestamp, válido 24h
2. **CORS restringido**: Solo permite `kmalumnos-remote.vercel.app` y `localhost`
3. **Validación de entrada**: Todos los campos se validan (tipo, formato, rango)
4. **Escape XSS**: `escapeHtml()` en el frontend
5. **Soft delete**: Las prácticas se marcan `deleted=true`, no se borran
6. **Campo source**: Identifica origen ('web-remote' vs 'desktop')

### Variables de entorno (Vercel)
```
SUPABASE_URL=https://dmwoqugdnwgkcqtixhyw.supabase.co
SUPABASE_ANON_KEY=eyJ...
API_PIN=2004
```

---

## db/ — Funciones exportadas (vía índice db.js)

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
| `getPracticasByAlumno` | `(alumno_id)` | Lista ordenada por fecha+id |
| `getUltimaPractica` | `(alumno_id)` | Última práctica del alumno |
| `addPractica` | `(alumno_id, vehiculo_id, fecha, km_inicial, km_final)` → id | Crea práctica |
| `updatePractica` | `(id, fecha, km_inicial, km_final)` | Edita práctica |
| `deletePractica` | `(id)` | Borra práctica |

### Algoritmos de KM
| Función | Descripción |
|---|---|
| `rellenarKmMasivo(vid, min, max, inicio?, final?)` | Rellena prácticas con km=0,0. Parámetros `inicio` y `final` opcionales para topes de odómetro |
| `getPracticasSinKm(vid)` | Cuenta prácticas pendientes de km |
| `corregirSolapamientos(vid, min, max)` | Corrige solapamientos automáticamente |
| `getSolapamientos()` | Lista conflictos de km |
| `validarSolapamiento(vid, fecha, ki, kf, excluirId)` | Valida antes de guardar |
| `getResumen()` | Contadores globales + alertas |
| `getTimelineVehiculo(vid)` | Timeline visual del vehículo |

### CSV
| Función | Descripción |
|---|---|
| `importarCSV(rows, min, max)` | Importa prácticas desde CSV |
| `exportarCSV(opciones)` | Exporta a CSV |
| `compararCSVs(rowsA, rowsB)` | Compara dos CSVs |

### Backup
| Función | Descripción |
|---|---|
| `crearBackup(destDir)` | Crea backup JSON |
| `restaurarBackup(srcFile)` | Restaura desde backup |
| `getLastSaveError()` | Último error de guardado |

---

## main.js — IPC Handlers adicionales

### Sync
```
sync-now        → sync.sync()
sync-push-all   → sync.pushAll()
sync-status     → sync.getStatus()
```

### Auto-updater
```
check-for-updates → autoUpdater.checkForUpdates()
install-update    → autoUpdater.quitAndInstall()

// Eventos que se envían al renderer:
'update-available'       → hay nueva versión
'update-not-available'   → estás al día
'update-download-start'  → empezó descarga
'update-download-progress' → progreso %
'update-downloaded'      → listo para instalar
'update-error'           → error
```

---

## Estadísticas avanzadas — db/estadisticas.js

### getStatsProfesores()
Análisis por profesor (solo lectura, no marca sync). Devuelve array de objetos:
```js
{
  profesor_id: integer,
  profesor_nombre: string,
  num_practicas: integer,        // prácticas impartidas (no borradas)
  km_totales: number,            // sum(km_final - km_inicial)
  alumnos_distintos: integer,    // count(distinct alumno_id)
  practicas_pista: integer,      // where tipo='pista'
  practicas_circulacion: integer,// where tipo='circulacion' o null
  ultima_practica: 'YYYY-MM-DD'  // max(fecha)
}
```
Soporta filtro opcional de rango de fechas (parámetros `inicio`/`final` como strings `YYYY-MM-DD`).

### getTodasPracticas()
Todas las prácticas de todos los alumnos (solo lectura). Devuelve array ordenado por fecha descendente:
```js
{
  id, fecha, alumno_id, alumno_nombre, permiso, vehiculo_id, vehiculo_nombre,
  km_inicial, km_final, profesor_id, profesor_nombre, nota, tipo, updated_at
}
```
Soporta filtros (alumno, vehículo, profesor, permiso, tipo) y búsqueda de texto libre (alumno/profesor).

### getDatosGraficos()
Datos para 5 gráficos SVG renderizados en `renderer/graficos.js` (solo lectura). Estructura:
```js
{
  practicas_por_mes: { mes: 'YYYY-MM', cantidad: int }[],          // últimos 12 meses
  km_por_mes: { mes: 'YYYY-MM', km: number }[],                    // últimos 12 meses
  alumnos_por_permiso: { permiso: string, cantidad: int }[],        // distribución
  practicas_por_tipo: { tipo: 'pista'|'circulacion', cantidad: int }[], // T/C
  deuda_por_alumno_top: { alumno_nombre: string, deuda: number }[] // top 5 deudores
}
```
Se renderiza en `renderer/graficos.js` con JavaScript puro (SVG a mano, sin librerías ni CDN, offline-first). Los colores se toman de las variables CSS `--chart-series-1` a `--chart-series-8` definidas en `styles.css` con valores distintos por tema (`data-theme`).

---

## Roles y sucursales (multi-empresa, migración pendiente)

### Estado actual: modo clásico
La app funciona como siempre hasta que se aplique la migración de `migraciones/`. La detección es en runtime: si las tablas no existen, la app se comporta exactamente igual que hoy (sin roles, sin sucursales).

### Modelo implementado (lado app, funcional cuando la migración se aplique)
- **Jefe:** usuario que inició sesión con credenciales email+contraseña en Ajustes → Cuenta de empresa. Control total: ve Pagos, estadísticas de profesores, gestión de empleados.
- **Empleado:** usuario asignado por el jefe a una sucursal. Acceso limitado: registra prácticas, ve alumnos/vehículos; **no ve Pagos ni estadísticas de profesores** (barrera de UI, no de BD — ya tiene los datos en su `data.json` local). La seguridad real está en RLS de la nube: jefe solo ve sus sucursales, empleado solo su sucursal.
- **Sucursales:** carpetas lógicas dentro de una empresa. Cada vehículo/alumno/práctica tiene `sucursal_id`. El sync filtra por sucursal del dispositivo.

### Funciones en renderer/roles.js
- `getPerfilActual()` → objeto `{ rol: 'jefe'|'empleado', sucursal_id?: int }` (sincronizado con `sync.js`). Usada para ocultar UI: si `rol==='empleado'`, esconder Pagos + estadísticas de profesores.
- `puedeVer(permiso)` → boolean (p.ej. `puedeVer('pagos')` devuelve false si empleado).

### Función en db/sucursales.js
- `getSucursales()` → lista de sucursales de la empresa.
- `addSucursal(nombre)` → crea sucursal (solo jefe).
- `getSucursalActiva()` → `sucursal_id` del dispositivo (guardado en `sync.creds.sucursal_id` tras login del jefe y selección de empleado).
- (Más funciones de CRUD si el jefe gestiona empleados desde la app.)

### Sincronización con Supabase (con migración aplicada)
- `sync.js` detecta en `ensureClient()` si el usuario autenticado es jefe o empleado (columna `role` en `auth.users`).
- Jefe: subidas no filtran por sucursal (sube todo lo suyo), bajadas filtran `where empresa_id = auth.uid()`.
- Empleado: subidas estampan `sucursal_id`, bajadas filtran `where empresa_id = (SELECT empresa_id FROM empleados WHERE uid = auth.uid()) AND sucursal_id = (SELECT sucursal_id FROM empleados WHERE uid = auth.uid())`.

---

## Resolución de colisiones de IDs — sync.js

### Problema: colisión al vincular dos PCs
Dos PCs creados independientemente comienzan con `_seq.id = 1` (contador local). Cuando el segundo vincula su cuenta, hace una subida inicial (`pushAll`) e intenta insertar registros con ids locales 1, 2, 3... que ya existen en la nube del primer PC → sobrescribe sin aviso, pérdida de datos.

### Solución: _resolverColisionesPrimeraVinculacion()
Función en `sync.js`, llamada una sola vez por cuenta+dispositivo (marcada con flag `_colisiones_resueltas = true`). Pasos:
1. Detecta ids locales que ya existen en la nube pero con datos distintos (colisión real).
2. Reasigna los ids locales colisionantes a valores nuevos (incrementa `_seq.id` hasta encontrar uno libre).
3. Corrige todas las referencias cruzadas en `data.json` (prácticas que refieren alumno/vehículo con id viejo, etc.).
4. Limpia la cola de `pending_sync.json` de los ids viejos y encolada los nuevos.
5. Registra el evento en logs (`addLog('resolucion_colisiones', ...)`) con id_viejo → id_nuevo.
6. **Idempotente:** si se llama de nuevo, no hace nada (flag ya marcado).

### Limitación conocida
Dos PCs YA vinculados que crean registros simultáneamente (en la ventana de 2 minutos entre syncs) pueden colisionar si el sync del PC A sube el id 100 mientras el PC B también está creando el id 100 en local. Solución de fondo: migrar a UUID globales (no SERIAL locales). Documentado en `sync.js` y CLAUDE.md.

---

## Despliegue

### App Electron
Ver `RELEASE.md` para instrucciones de publicación.

### Web-remote
```bash
cd web-remote
vercel --prod --yes
```

### Variables de entorno necesarias en Vercel
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `API_PIN` (4 dígitos para login)

---

## Notas técnicas

### Zona horaria
- Supabase y Vercel usan UTC
- El historial web filtra por últimas 24h (no por "hoy") para evitar problemas de timezone
- Las fechas en `data.json` son strings `YYYY-MM-DD` sin zona horaria

### IDs
- Localmente: auto-increment con `_seq`
- Supabase: SERIAL (secuencias PostgreSQL)
- Al sincronizar, se respetan los IDs de quien creó el registro

### Soft delete
- `deleted: true` en Supabase
- El sync respeta y propaga los soft deletes
- La web-remote solo puede cancelar prácticas marcadas como `source: 'web-remote'`
