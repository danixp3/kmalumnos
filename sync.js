/**
 * sync.js — Sincronización bidireccional offline-first con Supabase
 *
 * Estrategia:
 *   - La app siempre trabaja contra data.json (fuente de verdad local)
 *   - pending_sync.json guarda los IDs de cambios locales pendientes de subir
 *   - Al sincronizar: sube cambios locales → baja cambios remotos (del móvil)
 *   - Sin internet: funciona completamente en local, los cambios se encolan
 */

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');
const { createClient } = require('@supabase/supabase-js');

// Polyfill WebSocket for Node.js (required by supabase-js realtime)
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}

const SUPABASE_URL  = 'https://dmwoqugdnwgkcqtixhyw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtd29xdWdkbndna2NxdGl4aHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMjA5NjYsImV4cCI6MjA5OTU5Njk2Nn0.8XhWdS0ohrCbZcKpHWKsJz22rY8ASA4IkgpbtE_pHkc';

let supabase = null;
let _pendingPath = null;
let _dataPath    = null;
let _syncTimer   = null;

// Credenciales de la cuenta de sincronización (email/contraseña de Supabase Auth).
// Si están presentes, la app inicia sesión antes de sincronizar y así la base de
// datos puede exigir usuarios autenticados (RLS) en lugar de aceptar la anon key
// pública sola. Si no hay credenciales, se trabaja solo con la anon key (modo
// transición, compatible con la configuración antigua).
let _creds     = null;
let _authError = null;

// Callbacks para notificar a la UI el estado de sync
let _onStatusChange = null;

const STATUS = {
  OFFLINE:  'offline',
  SYNCING:  'syncing',
  OK:       'ok',
  ERROR:    'error',
  PENDING:  'pending'
};

let currentStatus = STATUS.OFFLINE;
let _lastError = null; // motivo del último error de sync, para mostrarlo en la UI

function getPendingPath() {
  if (!_pendingPath) _pendingPath = path.join(app.getPath('userData'), 'pending_sync.json');
  return _pendingPath;
}

function getDataPath() {
  if (!_dataPath) _dataPath = path.join(app.getPath('userData'), 'data.json');
  return _dataPath;
}

// Carga data.json de forma defensiva (igual que db.js): si el archivo no existe
// o está dañado, devuelve la estructura vacía en vez de lanzar excepción, y
// marca `regenerado` para que el sync haga una descarga completa desde la nube.
// Si el archivo estaba dañado, guarda una copia antes de descartarlo.
function loadDataSafe() {
  const p = getDataPath();
  let data = null;
  let regenerado = false;
  if (fs.existsSync(p)) {
    try {
      data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      try { fs.copyFileSync(p, p + '.danado-' + Date.now()); } catch {}
      regenerado = true;
    }
  } else {
    regenerado = true;
  }
  if (!data || typeof data !== 'object') data = {};
  if (!Array.isArray(data.vehiculos)) data.vehiculos = [];
  if (!Array.isArray(data.alumnos))   data.alumnos = [];
  if (!Array.isArray(data.practicas)) data.practicas = [];
  if (!Array.isArray(data.logs))      data.logs = [];
  if (!data._seq) data._seq = { v: 1, a: 1, p: 1 };
  return { data, regenerado };
}

// Escritura atómica (tmp + rename) para que un cierre brusco a mitad de
// escritura no deje data.json corrupto.
function saveData(data) {
  const p = getDataPath();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

// Fija las credenciales de sincronización. Al cambiarlas se descarta el cliente
// cacheado para forzar un nuevo inicio de sesión en la próxima operación.
function setCredentials(email, password) {
  _creds = (email && password) ? { email, password } : null;
  supabase = null;
  _authError = null;
}

function hasCredentials() {
  return !!_creds;
}

function getAuthError() {
  return _authError;
}

// Crea el cliente de Supabase y, si hay credenciales, inicia sesión.
// Devuelve el cliente listo, o null si el inicio de sesión falló.
async function ensureClient() {
  if (supabase) return supabase;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false }
  });
  if (_creds) {
    try {
      const { error } = await client.auth.signInWithPassword({
        email: _creds.email,
        password: _creds.password
      });
      if (error) { _authError = error.message; return null; }
    } catch (e) {
      _authError = e.message;
      return null;
    }
  }
  _authError = null;
  supabase = client;
  return supabase;
}

// ─── PENDING QUEUE ────────────────────────────────────────────────────────────

function loadPending() {
  const p = getPendingPath();
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
  }
  return { vehiculos: [], alumnos: [], practicas: [], deleted: { practicas: [], alumnos: [], vehiculos: [] }, lastSync: '1970-01-01T00:00:00.000Z' };
}

function savePending(pending) {
  fs.writeFileSync(getPendingPath(), JSON.stringify(pending, null, 2), 'utf-8');
}

function markDirty(table, id) {
  const p = loadPending();
  if (!p[table].includes(id)) p[table].push(id);
  savePending(p);
  setStatus(STATUS.PENDING);
}

function markDeleted(table, id) {
  const p = loadPending();
  if (!p.deleted[table]) p.deleted[table] = [];
  if (!p.deleted[table].includes(id)) p.deleted[table].push(id);
  // Quitar de dirty si estaba
  p[table] = (p[table] || []).filter(x => x !== id);
  savePending(p);
  setStatus(STATUS.PENDING);
}

function setStatus(status) {
  currentStatus = status;
  if (_onStatusChange) _onStatusChange(status);
}

function getStatus() {
  return currentStatus;
}

function getLastError() {
  return _lastError;
}

// ─── SYNC ────────────────────────────────────────────────────────────────────

async function checkOnline() {
  try {
    const sb = await ensureClient();
    if (!sb) return false;
    const { error } = await sb.from('meta').select('key').limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function sync() {
  const online = await checkOnline();
  if (!online) {
    // Distinguir "sin internet" de "credenciales inválidas": si el cliente no se
    // pudo crear por un fallo de inicio de sesión, avisar de credenciales.
    if (_authError) {
      _lastError = _authError;
      setStatus(STATUS.ERROR);
      return { ok: false, reason: 'Credenciales de sincronización inválidas' };
    }
    setStatus(STATUS.OFFLINE);
    return { ok: false, reason: 'Sin conexión a internet' };
  }

  setStatus(STATUS.SYNCING);

  try {
    const { data, regenerado } = loadDataSafe();
    const pending = loadPending();
    // Si data.json no existía o estaba dañado, forzar descarga completa
    if (regenerado) pending.lastSync = '1970-01-01T00:00:00.000Z';
    const sb = await ensureClient();
    if (!sb) { _lastError = _authError || 'Credenciales de sincronización inválidas'; setStatus(STATUS.ERROR); return { ok: false, reason: _lastError }; }

    // ── 1. SUBIR CAMBIOS LOCALES ──────────────────────────────────────────────

    // Vehículos dirty
    for (const id of pending.vehiculos) {
      const v = data.vehiculos.find(x => x.id === id);
      if (v) {
        await sb.from('vehiculos').upsert({
          id: v.id, nombre: v.nombre, matricula: v.matricula,
          km_actual: v.km_actual, updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      }
    }

    // Alumnos dirty
    for (const id of pending.alumnos) {
      const a = data.alumnos.find(x => x.id === id);
      if (a) {
        await sb.from('alumnos').upsert({
          id: a.id, nombre: a.nombre, permiso: a.permiso,
          vehiculo_id: a.vehiculo_id, updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      }
    }

    // Prácticas dirty
    for (const id of pending.practicas) {
      const p = data.practicas.find(x => x.id === id);
      if (p) {
        await sb.from('practicas').upsert({
          id: p.id, alumno_id: p.alumno_id, vehiculo_id: p.vehiculo_id,
          fecha: p.fecha, km_inicial: p.km_inicial, km_final: p.km_final,
          nota: p.nota || '', deleted: false, updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      }
    }

    // Eliminaciones
    for (const id of (pending.deleted.practicas || [])) {
      await sb.from('practicas').update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
    }
    for (const id of (pending.deleted.alumnos || [])) {
      await sb.from('alumnos').delete().eq('id', id);
    }
    for (const id of (pending.deleted.vehiculos || [])) {
      await sb.from('vehiculos').delete().eq('id', id);
    }

    // ── 2. BAJAR CAMBIOS REMOTOS (del móvil / del otro PC) ───────────────────
    // Orden importante: vehiculos → alumnos → practicas, para que un PC vacío
    // pueda reconstruir todo en una sola pasada (las prácticas se descartan si
    // su alumno o vehículo no existe aún localmente).

    const lastSync = pending.lastSync || '1970-01-01T00:00:00.000Z';
    let pulled = 0;
    let dataChanged = false;

    // Vehículos nuevos o modificados
    const { data: remoteVehiculos, error: errV } = await sb
      .from('vehiculos')
      .select('*')
      .gt('updated_at', lastSync);

    if (!errV && remoteVehiculos) {
      for (const rv of remoteVehiculos) {
        const idx = data.vehiculos.findIndex(x => x.id === rv.id);
        if (idx === -1) {
          data.vehiculos.push({
            id: rv.id, nombre: rv.nombre, matricula: rv.matricula || '',
            km_actual: parseFloat(rv.km_actual) || 0, updated_at: rv.updated_at
          });
          if (rv.id >= data._seq.v) data._seq.v = rv.id + 1;
          dataChanged = true;
          pulled++;
        } else {
          const localUpdated  = data.vehiculos[idx].updated_at || '1970-01-01T00:00:00.000Z';
          const remoteUpdated = rv.updated_at || '1970-01-01T00:00:00.000Z';
          if (remoteUpdated > localUpdated) {
            Object.assign(data.vehiculos[idx], {
              nombre: rv.nombre, matricula: rv.matricula || '',
              km_actual: parseFloat(rv.km_actual) || 0, updated_at: rv.updated_at
            });
            dataChanged = true;
            pulled++;
          }
        }
      }
    }

    // Nuevos alumnos desde el móvil (por si se añaden desde la web)
    const { data: remoteAlumnos, error: errA } = await sb
      .from('alumnos')
      .select('*')
      .gt('updated_at', lastSync);

    if (!errA && remoteAlumnos) {
      for (const ra of remoteAlumnos) {
        const idx = data.alumnos.findIndex(x => x.id === ra.id);
        if (idx === -1) {
          data.alumnos.push({ id: ra.id, nombre: ra.nombre, permiso: ra.permiso, vehiculo_id: ra.vehiculo_id });
          if (ra.id >= data._seq.a) data._seq.a = ra.id + 1;
          dataChanged = true;
          pulled++;
        }
      }
    }

    // Nuevas prácticas desde el móvil
    const { data: remotePracticas, error: errP } = await sb
      .from('practicas')
      .select('*')
      .gt('updated_at', lastSync)
      .order('updated_at', { ascending: true });

    if (!errP && remotePracticas) {
          for (const rp of remotePracticas) {
            // Verificar que alumno y vehículo existan localmente
            const alumnoExiste  = data.alumnos.find(a => a.id === rp.alumno_id);
            const vehiculoExiste = data.vehiculos.find(v => v.id === rp.vehiculo_id);
            if (!alumnoExiste || !vehiculoExiste) continue;

            const idx = data.practicas.findIndex(x => x.id === rp.id);
            if (rp.deleted) {
              if (idx !== -1) { data.practicas.splice(idx, 1); dataChanged = true; }
            } else {
              const practica = {
                id: rp.id, alumno_id: rp.alumno_id, vehiculo_id: rp.vehiculo_id,
                fecha: rp.fecha, km_inicial: parseFloat(rp.km_inicial), km_final: parseFloat(rp.km_final),
                nota: rp.nota || '', updated_at: rp.updated_at
              };
              if (idx !== -1) {
                // Comparar timestamps: solo sobrescribir si el remoto es más reciente
                const local = data.practicas[idx];
                const localUpdated = local.updated_at || '1970-01-01T00:00:00.000Z';
                const remoteUpdated = rp.updated_at || '1970-01-01T00:00:00.000Z';
            
                if (remoteUpdated > localUpdated) {
                  data.practicas[idx] = practica;
                  dataChanged = true;
                  pulled++;
                }
                // Si local es más reciente, no sobrescribir (el usuario editó localmente)
              } else {
                data.practicas.push(practica);
                // Actualizar seq si hace falta
                if (rp.id >= data._seq.p) data._seq.p = rp.id + 1;
                dataChanged = true;
                pulled++;
              }
            }
          }
        }

    if (dataChanged || regenerado) {
      saveData(data);
      // Limpiar caché de db.js
      try { require('./db')._clearCache(); } catch {}
    }

    // ── 3. ACTUALIZAR ESTADO PENDING ─────────────────────────────────────────
    pending.vehiculos           = [];
    pending.alumnos             = [];
    pending.practicas           = [];
    pending.deleted.practicas   = [];
    pending.deleted.alumnos     = [];
    pending.deleted.vehiculos   = [];
    pending.lastSync            = new Date().toISOString();
    savePending(pending);

    _lastError = null;
    setStatus(STATUS.OK);
    return { ok: true, pulled };

  } catch (e) {
    _lastError = e.message;
    setStatus(STATUS.ERROR);
    return { ok: false, reason: e.message };
  }
}

// ─── FULL PUSH (subida completa inicial) ─────────────────────────────────────

async function pushAll() {
  const online = await checkOnline();
  if (!online) return { ok: false, reason: 'Sin conexión' };

  setStatus(STATUS.SYNCING);
  try {
    const { data } = loadDataSafe();
    const sb   = await ensureClient();
    if (!sb) { _lastError = _authError || 'Credenciales de sincronización inválidas'; setStatus(STATUS.ERROR); return { ok: false, reason: _lastError }; }
    const now  = new Date().toISOString();

    // Subir en orden: vehiculos → alumnos → practicas
    if (data.vehiculos.length) {
      await sb.from('vehiculos').upsert(
        data.vehiculos.map(v => ({ ...v, updated_at: now })),
        { onConflict: 'id' }
      );
    }
    if (data.alumnos.length) {
      await sb.from('alumnos').upsert(
        data.alumnos.map(a => ({ ...a, updated_at: now })),
        { onConflict: 'id' }
      );
    }
    if (data.practicas.length) {
      await sb.from('practicas').upsert(
        data.practicas.map(p => ({ ...p, deleted: false, updated_at: now })),
        { onConflict: 'id' }
      );
    }

    // Limpiar pending. OJO: no adelantar lastSync aquí — si este PC aún no ha
    // descargado los datos antiguos de la nube, adelantarla se los saltaría.
    const pending = loadPending();
    pending.vehiculos = []; pending.alumnos = []; pending.practicas = [];
    pending.deleted = { practicas: [], alumnos: [], vehiculos: [] };
    savePending(pending);

    _lastError = null;
    setStatus(STATUS.OK);
    return { ok: true };
  } catch (e) {
    _lastError = e.message;
    setStatus(STATUS.ERROR);
    return { ok: false, reason: e.message };
  }
}

// ─── AUTO-SYNC ────────────────────────────────────────────────────────────────

function startAutoSync(intervalMs = 2 * 60 * 1000) {
  // Sync inmediato al arrancar
  setTimeout(() => sync(), 3000);
  // Luego cada intervalMs
  _syncTimer = setInterval(() => sync(), intervalMs);
}

function stopAutoSync() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
}

function onStatusChange(cb) {
  _onStatusChange = cb;
}

module.exports = {
  sync,
  pushAll,
  markDirty,
  markDeleted,
  getStatus,
  STATUS,
  startAutoSync,
  stopAutoSync,
  onStatusChange,
  setCredentials,
  hasCredentials,
  getAuthError,
  getLastError
};
