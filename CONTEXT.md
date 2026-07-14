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
│ renderer.js  → lógica UI (vanilla JS)                           │
│ db.js        → CRUD + algoritmos, guarda en data.json           │
│ sync.js      → sincronización bidireccional con Supabase        │
│ index.html   → SPA con CSS inline                               │
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

## db.js — Mejoras de robustez

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
