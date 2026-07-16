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

function getPendingPath() {
  if (!_pendingPath) _pendingPath = path.join(app.getPath('userData'), 'pending_sync.json');
  return _pendingPath;
}

function getDataPath() {
  if (!_dataPath) _dataPath = path.join(app.getPath('userData'), 'data.json');
  return _dataPath;
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
      setStatus(STATUS.ERROR);
      return { ok: false, reason: 'Credenciales de sincronización inválidas' };
    }
    setStatus(STATUS.OFFLINE);
    return { ok: false, reason: 'Sin conexión a internet' };
  }

  setStatus(STATUS.SYNCING);

  try {
    const rawData = fs.readFileSync(getDataPath(), 'utf-8');
    const data = JSON.parse(rawData);
    const pending = loadPending();
    const sb = await ensureClient();
    if (!sb) { setStatus(STATUS.ERROR); return { ok: false, reason: 'Credenciales de sincronización inválidas' }; }

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

    // ── 2. BAJAR CAMBIOS REMOTOS (del móvil) ─────────────────────────────────

    const lastSync = pending.lastSync || '1970-01-01T00:00:00.000Z';
    let pulled = 0;
    let dataChanged = false;

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

    if (dataChanged) {
      fs.writeFileSync(getDataPath(), JSON.stringify(data, null, 2), 'utf-8');
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

    setStatus(STATUS.OK);
    return { ok: true, pulled };

  } catch (e) {
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
    const data = JSON.parse(fs.readFileSync(getDataPath(), 'utf-8'));
    const sb   = await ensureClient();
    if (!sb) { setStatus(STATUS.ERROR); return { ok: false, reason: 'Credenciales de sincronización inválidas' }; }
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

    // Limpiar pending y marcar lastSync
    const pending = loadPending();
    pending.vehiculos = []; pending.alumnos = []; pending.practicas = [];
    pending.deleted = { practicas: [], alumnos: [], vehiculos: [] };
    pending.lastSync = now;
    savePending(pending);

    setStatus(STATUS.OK);
    return { ok: true };
  } catch (e) {
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
  getAuthError
};
