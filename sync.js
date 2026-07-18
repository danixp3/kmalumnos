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

// "Sync inmediato": tras cada cambio local se reprograma este debounce, para
// que una ráfaga de mutaciones (relleno masivo, importación CSV...) dispare UN
// solo sync al terminar, no uno por cambio. Solo se arma mientras el auto-sync
// está en marcha (ver startAutoSync/stopAutoSync) — así los tests que llaman a
// markDirty/markDeleted sin arrancar la app no programan timers reales.
let _syncInmediatoTimer      = null;
let _syncInmediatoActivo     = false;
let _syncInmediatoDebounceMs = 5000;

// Credenciales de la cuenta de sincronización (email/contraseña de Supabase Auth).
// Si están presentes, la app inicia sesión antes de sincronizar y así la base de
// datos puede exigir usuarios autenticados (RLS) en lugar de aceptar la anon key
// pública sola. Si no hay credenciales, se trabaja solo con la anon key (modo
// transición, compatible con la configuración antigua).
let _creds     = null;
let _authError = null;
// uid del usuario autenticado (= empresa/autoescuela dueña de estos datos, fase
// 1 del sistema multi-empresa). Solo se rellena si hay credenciales y el login
// tuvo éxito; en modo legado (sin credenciales) se queda a null y todo el sync
// se comporta exactamente igual que antes (sin estampar ni filtrar).
let _empresaId = null;

// Callbacks para notificar a la UI el estado de sync
let _onStatusChange = null;
// Callback para notificar a la UI cuántos conflictos reales hubo en el último
// sync() (ver "DETECCIÓN DE CONFLICTOS" más abajo).
let _onConflictos = null;

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
  if (!Array.isArray(data.vehiculos))  data.vehiculos = [];
  if (!Array.isArray(data.profesores)) data.profesores = [];
  if (!Array.isArray(data.alumnos))    data.alumnos = [];
  if (!Array.isArray(data.practicas))  data.practicas = [];
  if (!Array.isArray(data.tarifas))    data.tarifas = [];
  if (!Array.isArray(data.pagos))      data.pagos = [];
  if (!Array.isArray(data.logs))       data.logs = [];
  if (!data._seq) data._seq = { v: 1, pf: 1, a: 1, p: 1, t: 1, pg: 1 };
  if (!data._seq.pf) data._seq.pf = 1;
  if (!data._seq.t) data._seq.t = 1;
  if (!data._seq.pg) data._seq.pg = 1;
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
  _empresaId = null;
}

function hasCredentials() {
  return !!_creds;
}

function getAuthError() {
  return _authError;
}

// uid de la sesión activa (null en modo legado o si aún no se ha sincronizado
// con credenciales). Expuesto para la fase 2 (UI de cuenta/empresa).
function getEmpresaId() {
  return _empresaId;
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
      const { data: authData, error } = await client.auth.signInWithPassword({
        email: _creds.email,
        password: _creds.password
      });
      if (error) { _authError = error.message; return null; }
      // El uid identifica la empresa: se usa para estampar empresa_id al subir
      // y filtrar por él al bajar (ver sync()/pushAll() más abajo).
      _empresaId = authData && authData.user ? authData.user.id : null;
    } catch (e) {
      _authError = e.message;
      return null;
    }
  } else {
    _empresaId = null;
  }
  _authError = null;
  supabase = client;
  return supabase;
}

// Registra una nueva cuenta de empresa (Supabase Auth signUp). Usa un cliente
// nuevo e independiente del cacheado en `supabase` (que sigue atado a las
// credenciales de sesión actuales, si las hay).
async function registrarEmpresa(email, password) {
  if (!email || !password) {
    return { ok: false, msg: 'Faltan email o contraseña.' };
  }
  if (password.length < 8) {
    return { ok: false, msg: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false }
    });
    const { data, error } = await client.auth.signUp({ email, password });

    if (error) {
      if (/already registered|already exists/i.test(error.message)) {
        return { ok: false, msg: 'Ese email ya tiene una cuenta de empresa. Inicia sesión en su lugar.' };
      }
      return { ok: false, msg: 'No se pudo crear la cuenta: ' + error.message };
    }

    // Comportamiento real de Supabase Auth: si el email ya existe y las
    // confirmaciones por email están activas, signUp no devuelve error (para no
    // filtrar qué emails existen) pero el usuario devuelto tiene identities: []
    // y no hay sesión.
    if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0 && !data.session) {
      return { ok: false, msg: 'Ese email ya tiene una cuenta de empresa. Inicia sesión en su lugar.' };
    }

    if (data && data.session && data.user) {
      // Alta con sesión directa (confirmaciones desactivadas): queda logueada ya.
      _creds = { email, password };
      supabase = client;
      _empresaId = data.user.id;
      _authError = null;
      return { ok: true, estado: 'activa', email, empresaId: data.user.id };
    }

    if (data && data.user) {
      // Alta pendiente de confirmación por email: no quedar logueada con una
      // cuenta sin confirmar.
      return {
        ok: true,
        estado: 'pendiente_confirmacion',
        email,
        msg: 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.'
      };
    }

    return { ok: false, msg: 'No se pudo crear la cuenta: respuesta inesperada del servidor.' };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

// Estado de cuenta en memoria, sin tocar la red. Nunca devuelve la contraseña.
function getEstadoCuenta() {
  return {
    conectado: hasCredentials(),
    email: _creds ? _creds.email : null,
    empresaId: getEmpresaId()
  };
}

// ─── PENDING QUEUE ────────────────────────────────────────────────────────────

function loadPending() {
  const p = getPendingPath();
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
  }
  return {
    vehiculos: [], profesores: [], alumnos: [], practicas: [], tarifas: [], pagos: [],
    deleted: { practicas: [], alumnos: [], vehiculos: [], profesores: [], tarifas: [], pagos: [] },
    lastSync: '1970-01-01T00:00:00.000Z'
  };
}

function savePending(pending) {
  fs.writeFileSync(getPendingPath(), JSON.stringify(pending, null, 2), 'utf-8');
}

function markDirty(table, id) {
  const p = loadPending();
  // Defensa: un pending_sync.json de una versión anterior puede no traer la
  // clave de una tabla nueva (p.ej. "profesores" en instalaciones ya en uso).
  if (!p[table]) p[table] = [];
  if (!p[table].includes(id)) p[table].push(id);
  savePending(p);
  setStatus(STATUS.PENDING);
  programarSyncInmediato();
}

function markDeleted(table, id) {
  const p = loadPending();
  if (!p.deleted) p.deleted = {};
  if (!p.deleted[table]) p.deleted[table] = [];
  if (!p.deleted[table].includes(id)) p.deleted[table].push(id);
  // Quitar de dirty si estaba
  p[table] = (p[table] || []).filter(x => x !== id);
  savePending(p);
  setStatus(STATUS.PENDING);
  programarSyncInmediato();
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

// ─── DETECCIÓN DE CONFLICTOS ──────────────────────────────────────────────────
// La regla de resolución no cambia: en la bajada, el registro con updated_at
// más reciente gana siempre (sea local o remoto). Lo que faltaba era darse
// cuenta de cuándo esa sustitución descarta de verdad una edición local que
// aún no había llegado a la nube — antes pasaba en silencio.
//
// Un conflicto real es: el id que la nube acaba de sustituir localmente estaba
// en pending_sync.json (edición local sin subir todavía) Y el contenido que
// baja de la nube es distinto del que había en local. Si el contenido es
// idéntico, es simplemente el eco de nuestra propia subida del paso 1 de este
// mismo sync() (no hay pérdida de nada, no se registra).
//
// LIMITACIÓN CONOCIDA (caso inverso, no cubierto aquí): si la edición local es
// la más reciente, este mismo sync() la subirá en el paso 1 con un upsert ciego
// que sobrescribe la nube sin comprobar antes su contenido. Si otro dispositivo
// había dejado ahí un cambio que este PC nunca llegó a descargar, se pierde sin
// avisar. Detectarlo exigiría un SELECT extra por cada id pendiente antes de
// subir (un viaje de red más por sync) — se deja documentado, sin implementar.
function _valoresDifieren(local, remoto, campos) {
  return campos.some(c => {
    const a = local ? local[c] : undefined;
    const b = remoto ? remoto[c] : undefined;
    const an = (a === undefined || a === null) ? '' : a;
    const bn = (b === undefined || b === null) ? '' : b;
    return String(an) !== String(bn);
  });
}

function _detectarYRegistrarConflicto(data, tabla, pendingIds, id, campos, localAntes, remotoNuevo, conflictos) {
  if (!(pendingIds || []).includes(id)) return; // este PC no tenía una edición local sin subir
  if (!_valoresDifieren(localAntes, remotoNuevo, campos)) return; // eco de nuestra propia subida, no un conflicto

  const cambios = campos
    .filter(c => _valoresDifieren(localAntes, remotoNuevo, [c]))
    .map(c => `${c}: "${localAntes ? (localAntes[c] ?? '') : ''}" (este PC, descartado) → "${remotoNuevo[c] ?? ''}" (otro dispositivo)`)
    .join('; ');
  const descripcion = `Conflicto de sincronización en ${tabla} #${id}: dos ediciones a la vez, gana el otro dispositivo (más reciente).`;

  conflictos.push({ tabla, id, ganador: 'remoto', cambios });
  try {
    require('./db').registrarLogEnData(data, 'conflicto_sync', descripcion, [cambios]);
  } catch { /* no interrumpir el sync por un fallo al loguear */ }
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

    // Conflictos reales detectados en la bajada de este sync (ver "DETECCIÓN DE
    // CONFLICTOS" más arriba): edición local sin subir todavía que la nube
    // acaba de sustituir con un contenido distinto.
    const conflictos = [];

    // ── 1. SUBIR CAMBIOS LOCALES ──────────────────────────────────────────────
    // OJO (caso inverso, no cubierto — ver nota junto a _detectarYRegistrarConflicto):
    // estos upserts son ciegos, no comprueban el estado remoto antes de escribir.
    //
    // empresa_id (fase 1 multi-empresa): con sesión autenticada (_empresaId no
    // nulo) toda fila subida se estampa con el uid; en modo legado (sin
    // credenciales) no se añade la clave, comportamiento idéntico al de antes.

    // Vehículos dirty
    for (const id of pending.vehiculos) {
      const v = data.vehiculos.find(x => x.id === id);
      if (v) {
        const payload = {
          id: v.id, nombre: v.nombre, matricula: v.matricula,
          km_actual: v.km_actual, deleted: false, updated_at: new Date().toISOString()
        };
        if (_empresaId) payload.empresa_id = _empresaId;
        await sb.from('vehiculos').upsert(payload, { onConflict: 'id' });
      }
    }

    // Profesores dirty
    for (const id of (pending.profesores || [])) {
      const pr = data.profesores.find(x => x.id === id);
      if (pr) {
        const payload = {
          id: pr.id, nombre: pr.nombre, nota: pr.nota || '',
          deleted: false, updated_at: new Date().toISOString()
        };
        if (_empresaId) payload.empresa_id = _empresaId;
        await sb.from('profesores').upsert(payload, { onConflict: 'id' });
      }
    }

    // Tarifas dirty
    for (const id of (pending.tarifas || [])) {
      const t = data.tarifas.find(x => x.id === id);
      if (t) {
        const payload = {
          id: t.id, permiso: t.permiso, tipo: t.tipo, precio: t.precio || 0,
          deleted: false, updated_at: new Date().toISOString()
        };
        if (_empresaId) payload.empresa_id = _empresaId;
        await sb.from('tarifas').upsert(payload, { onConflict: 'id' });
      }
    }

    // Alumnos dirty
    for (const id of pending.alumnos) {
      const a = data.alumnos.find(x => x.id === id);
      if (a) {
        const payload = {
          id: a.id, nombre: a.nombre, permiso: a.permiso,
          vehiculo_id: a.vehiculo_id, deleted: false, updated_at: new Date().toISOString()
        };
        if (_empresaId) payload.empresa_id = _empresaId;
        await sb.from('alumnos').upsert(payload, { onConflict: 'id' });
      }
    }

    // Prácticas dirty
    for (const id of pending.practicas) {
      const p = data.practicas.find(x => x.id === id);
      if (p) {
        const payload = {
          id: p.id, alumno_id: p.alumno_id, vehiculo_id: p.vehiculo_id,
          fecha: p.fecha, km_inicial: p.km_inicial, km_final: p.km_final,
          nota: p.nota || '', profesor_id: p.profesor_id || null,
          tipo: p.tipo || null,
          deleted: false, updated_at: new Date().toISOString()
        };
        if (_empresaId) payload.empresa_id = _empresaId;
        await sb.from('practicas').upsert(payload, { onConflict: 'id' });
      }
    }

    // Pagos dirty
    for (const id of (pending.pagos || [])) {
      const pg = data.pagos.find(x => x.id === id);
      if (pg) {
        const payload = {
          id: pg.id, alumno_id: pg.alumno_id, fecha: pg.fecha,
          cantidad: pg.cantidad || 0, nota: pg.nota || '',
          deleted: false, updated_at: new Date().toISOString()
        };
        if (_empresaId) payload.empresa_id = _empresaId;
        await sb.from('pagos').upsert(payload, { onConflict: 'id' });
      }
    }

    // Eliminaciones — todas por soft delete (marca deleted). Borrar de verdad
    // un alumno falla en Supabase si tiene prácticas (clave foránea) y además
    // sin la marca los otros dispositivos nunca se enteran del borrado.
    for (const id of (pending.deleted.practicas || [])) {
      await sb.from('practicas').update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
    }
    for (const id of (pending.deleted.alumnos || [])) {
      await sb.from('alumnos').update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
    }
    for (const id of (pending.deleted.vehiculos || [])) {
      await sb.from('vehiculos').update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
    }
    for (const id of (pending.deleted.profesores || [])) {
      await sb.from('profesores').update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
    }
    for (const id of (pending.deleted.tarifas || [])) {
      await sb.from('tarifas').update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
    }
    for (const id of (pending.deleted.pagos || [])) {
      await sb.from('pagos').update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
    }

    // ── 2. BAJAR CAMBIOS REMOTOS (del móvil / del otro PC) ───────────────────
    // Orden importante: vehiculos → profesores → tarifas → alumnos → practicas → pagos,
    // para que un PC vacío pueda reconstruir todo en una sola pasada (las prácticas se
    // descartan si su alumno o vehículo no existe aún localmente; tarifas y pagos no
    // dependen de nada más y se aplican directamente).

    const lastSync = pending.lastSync || '1970-01-01T00:00:00.000Z';
    let pulled = 0;
    let dataChanged = false;

    // Con sesión autenticada, cada bajada se filtra por empresa_id (uid de la
    // sesión) para no traer datos de otra empresa. En modo legado (_empresaId
    // null) no se añade filtro, igual que antes.
    function conEmpresa(query) {
      return _empresaId ? query.eq('empresa_id', _empresaId) : query;
    }

    // Vehículos nuevos o modificados
    const { data: remoteVehiculos, error: errV } = await conEmpresa(sb
      .from('vehiculos')
      .select('*')
      .gt('updated_at', lastSync));

    if (!errV && remoteVehiculos) {
      for (const rv of remoteVehiculos) {
        const idx = data.vehiculos.findIndex(x => x.id === rv.id);
        if (rv.deleted) {
          // Borrado en otro dispositivo: quitarlo también aquí
          if (idx !== -1) {
            data.vehiculos.splice(idx, 1);
            data.alumnos.forEach(a => { if (a.vehiculo_id === rv.id) a.vehiculo_id = null; });
            dataChanged = true;
          }
          continue;
        }
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
            const nuevo = {
              nombre: rv.nombre, matricula: rv.matricula || '',
              km_actual: parseFloat(rv.km_actual) || 0
            };
            _detectarYRegistrarConflicto(data, 'vehiculos', pending.vehiculos,
              rv.id, ['nombre', 'matricula', 'km_actual'], data.vehiculos[idx], nuevo, conflictos);
            Object.assign(data.vehiculos[idx], nuevo, { updated_at: rv.updated_at });
            dataChanged = true;
            pulled++;
          }
        }
      }
    }

    // Profesores nuevos o modificados
    const { data: remoteProfesores, error: errPf } = await conEmpresa(sb
      .from('profesores')
      .select('*')
      .gt('updated_at', lastSync));

    if (!errPf && remoteProfesores) {
      for (const rp of remoteProfesores) {
        const idx = data.profesores.findIndex(x => x.id === rp.id);
        if (rp.deleted) {
          // Borrado en otro dispositivo: quitarlo también aquí. Sus prácticas
          // ya impartidas conservan el profesor_id (igual que un alumno borrado).
          if (idx !== -1) {
            data.profesores.splice(idx, 1);
            dataChanged = true;
          }
          continue;
        }
        if (idx === -1) {
          data.profesores.push({ id: rp.id, nombre: rp.nombre, nota: rp.nota || '', updated_at: rp.updated_at });
          if (rp.id >= data._seq.pf) data._seq.pf = rp.id + 1;
          dataChanged = true;
          pulled++;
        } else {
          const localUpdated  = data.profesores[idx].updated_at || '1970-01-01T00:00:00.000Z';
          const remoteUpdated = rp.updated_at || '1970-01-01T00:00:00.000Z';
          if (remoteUpdated > localUpdated) {
            const nuevo = { nombre: rp.nombre, nota: rp.nota || '' };
            _detectarYRegistrarConflicto(data, 'profesores', pending.profesores,
              rp.id, ['nombre', 'nota'], data.profesores[idx], nuevo, conflictos);
            Object.assign(data.profesores[idx], nuevo, { updated_at: rp.updated_at });
            dataChanged = true;
            pulled++;
          }
        }
      }
    }

    // Tarifas nuevas o modificadas
    const { data: remoteTarifas, error: errT } = await conEmpresa(sb
      .from('tarifas')
      .select('*')
      .gt('updated_at', lastSync));

    if (!errT && remoteTarifas) {
      for (const rt of remoteTarifas) {
        const idx = data.tarifas.findIndex(x => x.id === rt.id);
        if (rt.deleted) {
          if (idx !== -1) {
            data.tarifas.splice(idx, 1);
            dataChanged = true;
          }
          continue;
        }
        if (idx === -1) {
          data.tarifas.push({ id: rt.id, permiso: rt.permiso, tipo: rt.tipo, precio: parseFloat(rt.precio) || 0, updated_at: rt.updated_at });
          if (rt.id >= data._seq.t) data._seq.t = rt.id + 1;
          dataChanged = true;
          pulled++;
        } else {
          const localUpdated  = data.tarifas[idx].updated_at || '1970-01-01T00:00:00.000Z';
          const remoteUpdated = rt.updated_at || '1970-01-01T00:00:00.000Z';
          if (remoteUpdated > localUpdated) {
            const nuevo = { permiso: rt.permiso, tipo: rt.tipo, precio: parseFloat(rt.precio) || 0 };
            _detectarYRegistrarConflicto(data, 'tarifas', pending.tarifas,
              rt.id, ['permiso', 'tipo', 'precio'], data.tarifas[idx], nuevo, conflictos);
            Object.assign(data.tarifas[idx], nuevo, { updated_at: rt.updated_at });
            dataChanged = true;
            pulled++;
          }
        }
      }
    }

    // Nuevos alumnos desde el móvil (por si se añaden desde la web)
    const { data: remoteAlumnos, error: errA } = await conEmpresa(sb
      .from('alumnos')
      .select('*')
      .gt('updated_at', lastSync));

    if (!errA && remoteAlumnos) {
      for (const ra of remoteAlumnos) {
        const idx = data.alumnos.findIndex(x => x.id === ra.id);
        if (ra.deleted) {
          // Borrado en otro dispositivo: quitar el alumno y sus prácticas aquí
          if (idx !== -1) {
            data.alumnos.splice(idx, 1);
            data.practicas = data.practicas.filter(p => p.alumno_id !== ra.id);
            dataChanged = true;
          }
          continue;
        }
        if (idx === -1) {
          data.alumnos.push({ id: ra.id, nombre: ra.nombre, permiso: ra.permiso, vehiculo_id: ra.vehiculo_id });
          if (ra.id >= data._seq.a) data._seq.a = ra.id + 1;
          dataChanged = true;
          pulled++;
        }
      }
    }

    // Nuevas prácticas desde el móvil
    const { data: remotePracticas, error: errP } = await conEmpresa(sb
      .from('practicas')
      .select('*')
      .gt('updated_at', lastSync)
      .order('updated_at', { ascending: true }));

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
                nota: rp.nota || '', profesor_id: rp.profesor_id != null ? rp.profesor_id : null,
                tipo: rp.tipo != null ? rp.tipo : null,
                updated_at: rp.updated_at
              };
              if (idx !== -1) {
                // Comparar timestamps: solo sobrescribir si el remoto es más reciente
                const local = data.practicas[idx];
                const localUpdated = local.updated_at || '1970-01-01T00:00:00.000Z';
                const remoteUpdated = rp.updated_at || '1970-01-01T00:00:00.000Z';
            
                if (remoteUpdated > localUpdated) {
                  _detectarYRegistrarConflicto(data, 'practicas', pending.practicas, rp.id,
                    ['alumno_id', 'vehiculo_id', 'fecha', 'km_inicial', 'km_final', 'nota', 'profesor_id', 'tipo'],
                    local, practica, conflictos);
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

    // Pagos nuevos o modificados
    const { data: remotePagos, error: errPg } = await conEmpresa(sb
      .from('pagos')
      .select('*')
      .gt('updated_at', lastSync));

    if (!errPg && remotePagos) {
      for (const rpg of remotePagos) {
        const idx = data.pagos.findIndex(x => x.id === rpg.id);
        if (rpg.deleted) {
          if (idx !== -1) {
            data.pagos.splice(idx, 1);
            dataChanged = true;
          }
          continue;
        }
        if (idx === -1) {
          data.pagos.push({
            id: rpg.id, alumno_id: rpg.alumno_id, fecha: rpg.fecha,
            cantidad: parseFloat(rpg.cantidad) || 0, nota: rpg.nota || '',
            updated_at: rpg.updated_at
          });
          if (rpg.id >= data._seq.pg) data._seq.pg = rpg.id + 1;
          dataChanged = true;
          pulled++;
        } else {
          const localUpdated  = data.pagos[idx].updated_at || '1970-01-01T00:00:00.000Z';
          const remoteUpdated = rpg.updated_at || '1970-01-01T00:00:00.000Z';
          if (remoteUpdated > localUpdated) {
            const nuevo = {
              alumno_id: rpg.alumno_id, fecha: rpg.fecha,
              cantidad: parseFloat(rpg.cantidad) || 0, nota: rpg.nota || ''
            };
            _detectarYRegistrarConflicto(data, 'pagos', pending.pagos,
              rpg.id, ['alumno_id', 'fecha', 'cantidad', 'nota'], data.pagos[idx], nuevo, conflictos);
            Object.assign(data.pagos[idx], nuevo, { updated_at: rpg.updated_at });
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
    pending.profesores          = [];
    pending.tarifas             = [];
    pending.alumnos             = [];
    pending.practicas           = [];
    pending.pagos               = [];
    pending.deleted.practicas   = [];
    pending.deleted.alumnos     = [];
    pending.deleted.vehiculos   = [];
    pending.deleted.profesores  = [];
    pending.deleted.tarifas     = [];
    pending.deleted.pagos       = [];
    pending.lastSync            = new Date().toISOString();
    savePending(pending);

    _lastError = null;
    setStatus(STATUS.OK);
    if (conflictos.length && _onConflictos) _onConflictos(conflictos);
    return { ok: true, pulled, conflictos: conflictos.length };

  } catch (e) {
    _lastError = e.message;
    setStatus(STATUS.ERROR);
    return { ok: false, reason: e.message };
  }
}

// ─── SYNC INMEDIATO (debounce tras cada cambio) ──────────────────────────────
// Objetivo: que el usuario no espere hasta el ciclo de 2 minutos del auto-sync.
// Cada llamada reinicia el temporizador de 5 s; si llegan varios cambios
// seguidos (relleno masivo, importación CSV...) solo se dispara UN sync al
// terminar la ráfaga. El auto-sync de 2 minutos sigue como red de seguridad.

function programarSyncInmediato() {
  // Sin auto-sync en marcha (app aún no arrancada del todo, o un test que llama
  // a markDirty/markDeleted directamente) no se programa nada: evita timers
  // reales colgando y sincronizaciones de fondo fuera de la app real.
  if (!_syncInmediatoActivo) return;
  if (_syncInmediatoTimer) clearTimeout(_syncInmediatoTimer);
  _syncInmediatoTimer = setTimeout(_dispararSyncInmediato, _syncInmediatoDebounceMs);
  if (typeof _syncInmediatoTimer.unref === 'function') _syncInmediatoTimer.unref();
}

function _dispararSyncInmediato() {
  _syncInmediatoTimer = null;
  if (currentStatus === STATUS.SYNCING) {
    // Ya hay un sync en curso (el propio auto-sync, un "Subir todo" manual...):
    // reprogramar para cuando acabe, en vez de solapar dos syncs a la vez.
    programarSyncInmediato();
    return;
  }
  // Llamada a través de module.exports (no a la función local) para que sea
  // observable/interceptable desde los tests igual que cualquier otro caller.
  module.exports.sync();
}

// Solo para tests: activa/desactiva el mecanismo sin depender del setInterval
// real de startAutoSync, y permite acortar el debounce para no alargar los
// tests. Sin esta activación explícita (o startAutoSync), markDirty/markDeleted
// no programan ningún temporizador.
function _configurarSyncInmediatoParaTests({ activo, debounceMs } = {}) {
  if (activo !== undefined) _syncInmediatoActivo = activo;
  if (debounceMs !== undefined) _syncInmediatoDebounceMs = debounceMs;
  if (!_syncInmediatoActivo && _syncInmediatoTimer) {
    clearTimeout(_syncInmediatoTimer);
    _syncInmediatoTimer = null;
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

    // empresa_id (fase 1 multi-empresa): con sesión autenticada se estampa el
    // uid en cada fila subida; en modo legado no se añade la clave (igual que
    // antes de esta fase).
    const conEmpresaTag = _empresaId ? { empresa_id: _empresaId } : {};

    // Subir en orden: vehiculos → profesores → tarifas → alumnos → practicas → pagos
    if (data.vehiculos.length) {
      await sb.from('vehiculos').upsert(
        data.vehiculos.map(v => ({ ...v, ...conEmpresaTag, deleted: false, updated_at: now })),
        { onConflict: 'id' }
      );
    }
    if (data.profesores.length) {
      await sb.from('profesores').upsert(
        data.profesores.map(p => ({ ...p, ...conEmpresaTag, deleted: false, updated_at: now })),
        { onConflict: 'id' }
      );
    }
    if (data.tarifas.length) {
      await sb.from('tarifas').upsert(
        data.tarifas.map(t => ({ ...t, ...conEmpresaTag, deleted: false, updated_at: now })),
        { onConflict: 'id' }
      );
    }
    if (data.alumnos.length) {
      await sb.from('alumnos').upsert(
        data.alumnos.map(a => ({ ...a, ...conEmpresaTag, deleted: false, updated_at: now })),
        { onConflict: 'id' }
      );
    }
    if (data.practicas.length) {
      await sb.from('practicas').upsert(
        data.practicas.map(p => ({ ...p, ...conEmpresaTag, deleted: false, updated_at: now })),
        { onConflict: 'id' }
      );
    }
    if (data.pagos.length) {
      await sb.from('pagos').upsert(
        data.pagos.map(pg => ({ ...pg, ...conEmpresaTag, deleted: false, updated_at: now })),
        { onConflict: 'id' }
      );
    }

    // Ejecutar los borrados pendientes antes de vaciar la cola: antes se
    // descartaban sin subir y los registros borrados quedaban vivos en la nube.
    const pending = loadPending();
    for (const id of (pending.deleted.practicas || [])) {
      await sb.from('practicas').update({ deleted: true, updated_at: now }).eq('id', id);
    }
    for (const id of (pending.deleted.alumnos || [])) {
      await sb.from('alumnos').update({ deleted: true, updated_at: now }).eq('id', id);
    }
    for (const id of (pending.deleted.vehiculos || [])) {
      await sb.from('vehiculos').update({ deleted: true, updated_at: now }).eq('id', id);
    }
    for (const id of (pending.deleted.profesores || [])) {
      await sb.from('profesores').update({ deleted: true, updated_at: now }).eq('id', id);
    }
    for (const id of (pending.deleted.tarifas || [])) {
      await sb.from('tarifas').update({ deleted: true, updated_at: now }).eq('id', id);
    }
    for (const id of (pending.deleted.pagos || [])) {
      await sb.from('pagos').update({ deleted: true, updated_at: now }).eq('id', id);
    }

    // Limpiar pending. OJO: no adelantar lastSync aquí — si este PC aún no ha
    // descargado los datos antiguos de la nube, adelantarla se los saltaría.
    pending.vehiculos = []; pending.profesores = []; pending.tarifas = []; pending.alumnos = []; pending.practicas = []; pending.pagos = [];
    pending.deleted = { practicas: [], alumnos: [], vehiculos: [], profesores: [], tarifas: [], pagos: [] };
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
  // Arma el mecanismo de sync inmediato (debounce tras cada cambio local)
  _syncInmediatoActivo = true;
  // Sync inmediato al arrancar
  const initialTimer = setTimeout(() => sync(), 3000);
  if (typeof initialTimer.unref === 'function') initialTimer.unref();
  // Luego cada intervalMs
  _syncTimer = setInterval(() => sync(), intervalMs);
}

function stopAutoSync() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  _syncInmediatoActivo = false;
  if (_syncInmediatoTimer) { clearTimeout(_syncInmediatoTimer); _syncInmediatoTimer = null; }
}

function onStatusChange(cb) {
  _onStatusChange = cb;
}

// cb recibe el array de conflictos { tabla, id, ganador, cambios } del último
// sync() que encontró alguno. No se llama si no hubo ninguno.
function onConflictos(cb) {
  _onConflictos = cb;
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
  onConflictos,
  setCredentials,
  hasCredentials,
  getAuthError,
  getEmpresaId,
  getLastError,
  programarSyncInmediato,
  _configurarSyncInmediatoParaTests,
  registrarEmpresa,
  getEstadoCuenta
};
