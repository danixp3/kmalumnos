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

// Autenticación CONFIRMADA (fase 2, gate obligatorio): a diferencia de
// hasCredentials() (solo dice si hay credenciales guardadas en memoria),
// _authOk solo es true tras un login real y exitoso contra Supabase Auth. Se
// pone a false ante cualquier rechazo real de credenciales (contraseña
// incorrecta, email sin confirmar...). Un fallo de RED (sin conexión) no lo
// toca: no es un rechazo de la cuenta, y el gate debe poder seguir abierto
// sin internet si ya se confirmó antes (ver getAuthStatusPath).
let _authOk = false;

// Conflicto de "datos locales de otra cuenta" (ver sección PROPIETARIO DE LOS
// DATOS LOCALES más abajo): null si no hay ninguno; { emailAnterior } si el
// login/registro que acaba de tener éxito es de una empresa distinta a la
// dueña de los datos que ya hay en data.json en este PC. Se recalcula en cada
// login/registro con éxito (ver _comprobarConflictoEmpresaLocal).
let _conflictoEmpresa = null;

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

// Persistencia de "¿la última vez que se probó, esta cuenta funcionaba?"
// (auth_status.json en userData, propio de sync.js). Permite que al reabrir
// la app (restaurarCredenciales) el gate no se cierre en falso: si la cuenta
// ya se confirmó una vez y ahora no hay internet, se deja pasar igual, y el
// primer sync real (automático o manual) corrige el estado si ya no valiera.
function getAuthStatusPath() {
  return path.join(app.getPath('userData'), 'auth_status.json');
}

function _cargarAuthOkPersistido() {
  try {
    const p = getAuthStatusPath();
    if (fs.existsSync(p)) return !!JSON.parse(fs.readFileSync(p, 'utf-8')).ok;
  } catch { /* si no se puede leer, más vale pedir confirmación de nuevo */ }
  return false;
}

function _guardarAuthOk(ok) {
  try { fs.writeFileSync(getAuthStatusPath(), JSON.stringify({ ok }), 'utf-8'); } catch { /* no crítico */ }
}

// Distingue un rechazo real de credenciales (contraseña incorrecta, email sin
// confirmar...) de un fallo de red disfrazado de error de auth: supabase-js
// devuelve ambos como `{ error }` resuelto, nunca como excepción, así que hay
// que mirar el mensaje. Si no reconoce el mensaje, se trata como fallo de red
// (no se penaliza una cuenta ya confirmada solo por un mensaje nuevo/rarro).
function _esErrorDeCredenciales(msg) {
  if (!msg) return false;
  return /invalid login credentials|invalid email or password|email not confirmed|user not found|email logins are disabled/i.test(msg);
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
  if (!Array.isArray(data.sucursales)) data.sucursales = [];
  if (!Array.isArray(data.reservas))   data.reservas = [];
  if (!Array.isArray(data.logs))       data.logs = [];
  if (!data._seq) data._seq = { v: 1, pf: 1, a: 1, p: 1, t: 1, pg: 1, suc: 1, r: 1 };
  if (!data._seq.pf) data._seq.pf = 1;
  if (!data._seq.t) data._seq.t = 1;
  if (!data._seq.pg) data._seq.pg = 1;
  if (!data._seq.suc) data._seq.suc = 1;
  if (!data._seq.r) data._seq.r = 1;
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
  _perfilCache = null; // cambio de sesión: invalidar el perfil (rol/empresa) cacheado
  _sucursalesDisponibleCache = null; // idem: reconsultar si la migración está aplicada
  _reservasDisponibleCache = null; // idem: reconsultar si la migración de reservas está aplicada
  _alumnosEmailDisponibleCache = null; // idem: reconsultar si la columna email está disponible
  _modulosCache = null; // idem: reconsultar los módulos contratados de la nueva sesión
  // Entrada fresca de credenciales (login manual, registro, o logout): nunca
  // se da por buena hasta que un login real lo confirme. Distinto de
  // restaurarCredenciales(), pensada para el arranque de la app.
  _authOk = false;
  _guardarAuthOk(false);
  // Un conflicto detectado en la sesión anterior no debe sobrevivir a un
  // logout o a credenciales nuevas: se recalcula desde cero en el próximo
  // login/registro con éxito.
  _conflictoEmpresa = null;
}

// Restaura las credenciales guardadas en disco al arrancar la app (llamarla
// solo desde ahí, no desde el login/registro manual). A diferencia de
// setCredentials(), parte del último estado de autenticación confirmada
// persistido en auth_status.json: si esta cuenta ya se validó en una sesión
// anterior, el gate no se cierra en falso solo porque ahora mismo no haya
// internet. El siguiente sync real (automático a los 3s, o uno manual)
// corrige _authOk si las credenciales ya no fueran válidas.
function restaurarCredenciales(email, password) {
  _creds = (email && password) ? { email, password } : null;
  supabase = null;
  _authError = null;
  _empresaId = null;
  _authOk = _creds ? _cargarAuthOkPersistido() : false;
  // Igual que en setCredentials(): se recalcula en el próximo login real
  // (el primer ensureClient() que corra, automático o manual).
  _conflictoEmpresa = null;
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

// Añade el filtro por empresa_id si hay sesión activa; en modo legado (sin
// credenciales) no se añade filtro, igual que siempre. Usado tanto en la
// resolución de colisiones de la primera vinculación (ver más abajo) como en
// la bajada normal de sync().
function _conEmpresa(query) {
  return _empresaId ? query.eq('empresa_id', _empresaId) : query;
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
      if (error) {
        _authError = error.message;
        // Solo un rechazo real de credenciales invalida la sesión confirmada
        // (y se persiste): un fallo de red no debe desloguear una cuenta que
        // ya se validó antes (ver _esErrorDeCredenciales).
        if (_esErrorDeCredenciales(error.message)) {
          _authOk = false;
          _guardarAuthOk(false);
        }
        return null;
      }
      // El uid identifica la empresa: se usa para estampar empresa_id al subir
      // y filtrar por él al bajar (ver sync()/pushAll() más abajo).
      _empresaId = authData && authData.user ? authData.user.id : null;
      _authOk = true;
      _guardarAuthOk(true);
      _comprobarConflictoEmpresaLocal(_empresaId, _creds.email);
    } catch (e) {
      // Excepción de red (offline de verdad): no es un rechazo de credenciales,
      // no se toca _authOk.
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
    const { data, error } = await client.auth.signUp({
      email, password,
      options: { emailRedirectTo: 'https://aulamovil.vercel.app/email-confirmado.html' }
    });

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
      _perfilCache = null; // sesión nueva: invalidar el perfil (rol/empresa) cacheado
      _sucursalesDisponibleCache = null; // idem: reconsultar si la migración está aplicada
      _reservasDisponibleCache = null; // idem: reconsultar si la migración de reservas está aplicada
      _alumnosEmailDisponibleCache = null; // idem: reconsultar si la columna email está disponible
      _modulosCache = null; // idem: reconsultar los módulos contratados de la nueva sesión
      _authOk = true;
      _guardarAuthOk(true);
      _comprobarConflictoEmpresaLocal(_empresaId, email);
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

// Solicita a Supabase Auth el envío de un correo de recuperación de contraseña.
// Se hace SIN sesión activa (el usuario la ha olvidado): cliente nuevo e
// independiente del cacheado en `supabase`, igual que registrarEmpresa.
// Supabase no revela si el email existe o no (devuelve éxito genérico en
// ambos casos), así que no hay que añadir lógica propia para ocultarlo: basta
// con repetir tal cual la respuesta de la librería.
async function solicitarResetPassword(email) {
  if (!email || typeof email !== 'string' || !email.trim()) {
    return { ok: false, msg: 'Introduce tu email.' };
  }
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false }
    });
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://aulamovil.vercel.app/reset-password.html'
    });
    if (error) {
      return { ok: false, msg: 'No se pudo enviar el correo de recuperación. Inténtalo de nuevo más tarde.' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No se pudo enviar el correo de recuperación. Inténtalo de nuevo más tarde.' };
  }
}

// Estado de cuenta en memoria, sin tocar la red. Nunca devuelve la contraseña.
function getEstadoCuenta() {
  return {
    conectado: _authOk,
    email: _creds ? _creds.email : null,
    empresaId: getEmpresaId(),
    conflictoEmpresa: _conflictoEmpresa
  };
}

// ─── ROLES (JEFE / EMPLEADO, fase 2 multi-empresa) ────────────────────────────
// La migración migraciones/2026-08-01_roles_y_sucursales.sql (tabla `perfiles`)
// TODAVÍA NO se ha aplicado en producción a fecha de escribir esto — se aplicará
// más tarde, a mano. Mientras tanto la tabla no existe y CUALQUIER consulta a
// ella falla; ese fallo se trata como "modo clásico", nunca como un error real:
// el rol efectivo es siempre 'jefe' (no se oculta nada) hasta que la migración
// esté aplicada Y el usuario tenga sesión iniciada.
//
// Cacheado en memoria durante la sesión (una sola consulta por sesión, no una
// por cada render de la UI); se invalida al cambiar de credenciales (ver
// setCredentials/registrarEmpresa más arriba).
let _perfilCache = null;

// Devuelve { disponible, rol, empresa_id?, sucursal_id?, nombre? }.
//   disponible=false → modo clásico (migración no aplicada, sin sesión, o
//     cualquier error consultando `perfiles`): rol efectivo 'jefe' SIEMPRE,
//     para que la interfaz de hoy no oculte nada. Nunca al revés.
//   disponible=true  → hay fila en `perfiles` para este usuario: rol real.
async function getPerfilActual() {
  if (_perfilCache) return _perfilCache;
  if (!_creds) {
    // Modo legado (sin cuenta) o app recién arrancada sin credenciales guardadas.
    _perfilCache = { disponible: false, rol: 'jefe' };
    return _perfilCache;
  }
  try {
    const sb = await ensureClient();
    // Sin cliente (credenciales inválidas / sin conexión) o sin uid resuelto:
    // no hay forma de consultar `perfiles` por auth.uid() todavía.
    if (!sb || !_empresaId) {
      _perfilCache = { disponible: false, rol: 'jefe' };
      return _perfilCache;
    }
    const { data, error } = await sb.from('perfiles').select('*').eq('user_id', _empresaId).maybeSingle();
    if (error || !data) {
      // error: la tabla `perfiles` no existe todavía (Postgres: relación
      // inexistente) u otro fallo de la consulta — modo clásico.
      // !data: usuario autenticado sin fila propia en `perfiles` (no debería
      // pasar tras el backfill de la migración, pero por seguridad se trata
      // igual que modo clásico en vez de negar el acceso).
      _perfilCache = { disponible: false, rol: 'jefe' };
      return _perfilCache;
    }
    _perfilCache = {
      disponible: true,
      rol: data.rol,
      empresa_id: data.empresa_id,
      sucursal_id: data.sucursal_id != null ? data.sucursal_id : null,
      nombre: data.nombre || null
    };
    return _perfilCache;
  } catch (e) {
    _perfilCache = { disponible: false, rol: 'jefe' };
    return _perfilCache;
  }
}

// ─── SUCURSALES (fase 2 multi-empresa) ────────────────────────────────────────
// Mismo patrón exacto que _perfilCache/getPerfilActual de arriba: mientras la
// migración no esté aplicada, cualquier consulta a la tabla `sucursales`
// falla (relación inexistente) y eso se trata como "modo clásico", nunca
// como un error real. La migración crea la tabla `sucursales` y las columnas
// `sucursal_id` en la misma transacción (ver migraciones/2026-08-01_...sql),
// así que basta con comprobar la tabla para saber que las columnas también
// existen — no hace falta una consulta separada por columna/tabla.
// Cacheado en memoria durante la sesión; se invalida al cambiar de
// credenciales (setCredentials/registrarEmpresa más arriba).
let _sucursalesDisponibleCache = null;

async function _sucursalesDisponible(sb) {
  if (_sucursalesDisponibleCache !== null) return _sucursalesDisponibleCache;
  try {
    const { error } = await sb.from('sucursales').select('id').limit(1);
    _sucursalesDisponibleCache = !error;
  } catch {
    _sucursalesDisponibleCache = false;
  }
  return _sucursalesDisponibleCache;
}

// ─── RESERVAS (agenda, Bloque 2 SaaS) ─────────────────────────────────────────
// Mismo patrón exacto que _sucursalesDisponible de arriba: mientras la
// migración `migraciones/2026-08-05_reservas.sql` no esté aplicada, la tabla
// `reservas` no existe en Supabase y cualquier consulta a ella falla — se
// trata como "modo clásico", nunca como un error real: reservas simplemente
// no se sube ni se baja. Cacheado en memoria durante la sesión; se invalida
// en los mismos puntos que _sucursalesDisponibleCache (setCredentials/
// registrarEmpresa más arriba).
let _reservasDisponibleCache = null;

async function _reservasDisponible(sb) {
  if (_reservasDisponibleCache !== null) return _reservasDisponibleCache;
  try {
    const { error } = await sb.from('reservas').select('id').limit(1);
    _reservasDisponibleCache = !error;
  } catch {
    _reservasDisponibleCache = false;
  }
  return _reservasDisponibleCache;
}

// Mismo patrón exacto que _sucursalesDisponible de arriba: mientras la
// migración `migraciones/2026-08-05_alumno_email.sql` (portal del alumno,
// Bloque 2 SaaS) no esté aplicada, la columna `alumnos.email` no existe en
// Supabase y cualquier consulta a ella falla — se trata como "modo clásico",
// nunca como un error real. Cacheado en memoria durante la sesión; se
// invalida en los mismos puntos que _sucursalesDisponibleCache
// (setCredentials/registrarEmpresa más arriba).
let _alumnosEmailDisponibleCache = null;

async function _alumnosEmailDisponible(sb) {
  if (_alumnosEmailDisponibleCache !== null) return _alumnosEmailDisponibleCache;
  try {
    const { error } = await sb.from('alumnos').select('email').limit(1);
    _alumnosEmailDisponibleCache = !error;
  } catch {
    _alumnosEmailDisponibleCache = false;
  }
  return _alumnosEmailDisponibleCache;
}

// ─── MÓDULOS CONTRATADOS (fase 0 SaaS, entitlements por empresa) ─────────────
// Mismo patrón exacto que _perfilCache/getPerfilActual y
// _sucursalesDisponibleCache/_sucursalesDisponible de arriba: mientras la
// migración de módulos (o la de roles, de la que depende — ver
// migraciones/2026-08-04_modulos_empresa.sql) no esté aplicada, o no haya
// perfil resuelto, cualquier consulta a `modulos_empresa` falla y se trata
// como "modo clásico": ningún módulo se da por activo, nunca al revés. El
// núcleo actual de la app NO consulta moduloActivo() en ningún sitio
// todavía, así que esto no cambia nada de lo que existe hoy.
// Cacheado en memoria durante la sesión; se invalida al cambiar de
// credenciales (setCredentials/registrarEmpresa más arriba).
let _modulosCache = null;

// Devuelve { disponible, modulos }.
//   disponible=false → modo clásico: modulos siempre {} (moduloActivo() en
//     el renderer devuelve false para cualquier módulo).
//   disponible=true  → modulos es un mapa modulo -> activo (boolean) con las
//     filas encontradas para la empresa actual.
async function getModulosActivos() {
  if (_modulosCache) return _modulosCache;
  try {
    const perfil = await getPerfilActual();
    if (!perfil.disponible || !perfil.empresa_id) {
      // Sin fila en `perfiles` (migración de roles no aplicada, o sin
      // sesión) no hay empresa_id fiable con el que filtrar: modo clásico.
      _modulosCache = { disponible: false, modulos: {} };
      return _modulosCache;
    }
    const sb = await ensureClient();
    if (!sb) {
      _modulosCache = { disponible: false, modulos: {} };
      return _modulosCache;
    }
    const { data, error } = await sb.from('modulos_empresa').select('modulo, activo').eq('empresa_id', perfil.empresa_id);
    if (error || !data) {
      // error: la tabla `modulos_empresa` no existe todavía (migración no
      // aplicada) u otro fallo de la consulta — modo clásico.
      _modulosCache = { disponible: false, modulos: {} };
      return _modulosCache;
    }
    const modulos = {};
    for (const fila of data) modulos[fila.modulo] = !!fila.activo;
    _modulosCache = { disponible: true, modulos };
    return _modulosCache;
  } catch (e) {
    _modulosCache = { disponible: false, modulos: {} };
    return _modulosCache;
  }
}

// ─── GESTIÓN DE EMPLEADOS (solo jefe, solo con la migración aplicada) ─────────
// La propia base de datos ya exige rol jefe para tocar `perfiles` (RLS:
// perfiles_insert_jefe/_update_jefe/_delete_jefe en la migración); estas
// funciones comprueban el rol en el cliente solo para dar un mensaje en
// español claro en vez de dejar pasar un error crudo de Postgres/PostgREST.
async function listarEmpleados() {
  const perfil = await getPerfilActual();
  if (!perfil.disponible) return { ok: false, msg: 'La gestión de empleados todavía no está disponible en esta cuenta.' };
  const sb = await ensureClient();
  if (!sb) return { ok: false, msg: _authError || 'Sin conexión.' };
  try {
    const { data, error } = await sb.from('perfiles').select('*').eq('empresa_id', perfil.empresa_id);
    if (error) return { ok: false, msg: error.message };
    return { ok: true, empleados: data || [] };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

// Da de alta en `perfiles` a un usuario que YA tiene cuenta creada (Supabase
// Auth). No existe forma de resolver un email a su uid desde el cliente con
// solo la anon key (la tabla auth.users no está expuesta por PostgREST y la
// API de administración exige la service_role key, que esta app no tiene) —
// se apoya en la función `buscar_uid_por_email` (RPC SECURITY DEFINER, misma
// familia que empresa_actual()/rol_actual() de la migración). OJO: esa RPC
// todavía NO está en migraciones/2026-08-01_roles_y_sucursales.sql; hace
// falta añadirla en una migración posterior antes de que esta función sirva
// contra producción. Aquí se deja implementada y probada con mocks para que
// el resto del flujo (UI, IPC, mensajes de error) esté listo.
async function invitarEmpleado(email, rol, sucursal_id) {
  const perfil = await getPerfilActual();
  if (!perfil.disponible) return { ok: false, msg: 'La gestión de empleados todavía no está disponible en esta cuenta.' };
  if (perfil.rol !== 'jefe') return { ok: false, msg: 'Solo el jefe puede invitar empleados.' };
  if (!email) return { ok: false, msg: 'Falta el email del empleado.' };
  if (rol !== 'jefe' && rol !== 'empleado') return { ok: false, msg: 'Rol no válido.' };
  const sb = await ensureClient();
  if (!sb) return { ok: false, msg: _authError || 'Sin conexión.' };
  try {
    const { data: uid, error: errBuscar } = await sb.rpc('buscar_uid_por_email', { p_email: email });
    if (errBuscar) return { ok: false, msg: 'No se pudo verificar el email: ' + errBuscar.message };
    if (!uid) {
      return {
        ok: false,
        msg: 'Ese email no tiene todavía una cuenta creada. Pide primero a esa persona que se registre en la app y, cuando la tenga, invítala de nuevo.'
      };
    }
    const payload = { user_id: uid, empresa_id: perfil.empresa_id, rol, sucursal_id: sucursal_id || null };
    const { error } = await sb.from('perfiles').upsert(payload, { onConflict: 'user_id' });
    if (error) return { ok: false, msg: 'No se pudo dar de alta al empleado: ' + error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

async function cambiarRolEmpleado(user_id, rol) {
  const perfil = await getPerfilActual();
  if (!perfil.disponible) return { ok: false, msg: 'La gestión de empleados todavía no está disponible en esta cuenta.' };
  if (perfil.rol !== 'jefe') return { ok: false, msg: 'Solo el jefe puede cambiar roles.' };
  if (rol !== 'jefe' && rol !== 'empleado') return { ok: false, msg: 'Rol no válido.' };
  const sb = await ensureClient();
  if (!sb) return { ok: false, msg: _authError || 'Sin conexión.' };
  try {
    const { error } = await sb.from('perfiles').update({ rol }).eq('user_id', user_id);
    if (error) return { ok: false, msg: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

async function quitarEmpleado(user_id) {
  const perfil = await getPerfilActual();
  if (!perfil.disponible) return { ok: false, msg: 'La gestión de empleados todavía no está disponible en esta cuenta.' };
  if (perfil.rol !== 'jefe') return { ok: false, msg: 'Solo el jefe puede quitar empleados.' };
  const sb = await ensureClient();
  if (!sb) return { ok: false, msg: _authError || 'Sin conexión.' };
  try {
    const { error } = await sb.from('perfiles').delete().eq('user_id', user_id);
    if (error) return { ok: false, msg: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

// ─── PROPIETARIO DE LOS DATOS LOCALES (aislamiento entre cuentas en el mismo PC) ──
// data.json no está vinculado a ninguna cuenta: son "los datos de este PC" a
// secas, pensado en su día para una instalación de un solo negocio. Si en el
// mismo PC se crea una cuenta de empresa de prueba y luego una real (o al
// revés), data.json sigue teniendo los datos de la primera y la UI los
// seguiría mostrando bajo la sesión de la segunda — y "Subir todo a la nube"
// los re-subiría estampados con el empresa_id equivocado (ver pushAll()).
//
// local_empresa.json guarda { empresaId, email } de la cuenta a la que
// "pertenecen" los datos locales actuales. Se compara tras cada login o
// registro con éxito (ensureClient()/registrarEmpresa()):
//   - Sin marcador todavía (instalación existente de un solo negocio, o
//     data.json recién creado/vacío): se adopta la empresa actual en
//     SILENCIO, sin ningún aviso. Es imprescindible para no romper las
//     instalaciones reales que ya existen hoy.
//   - Marcador presente y coincide: todo normal.
//   - Marcador presente y NO coincide: conflicto real, expuesto en
//     getEstadoCuenta().conflictoEmpresa para que la UI lo resuelva (ver
//     resolverConflictoEmpresa()).
function getLocalEmpresaPath() {
  return path.join(app.getPath('userData'), 'local_empresa.json');
}

function getLocalEmpresaOwner() {
  try {
    const p = getLocalEmpresaPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch { /* marcador dañado: tratar como si no existiera */ }
  return null;
}

function _guardarLocalEmpresaOwner(empresaId, email) {
  try {
    fs.writeFileSync(getLocalEmpresaPath(), JSON.stringify({ empresaId, email: email || null }), 'utf-8');
  } catch { /* no crítico */ }
}

function _comprobarConflictoEmpresaLocal(empresaId, email) {
  if (!empresaId) return;
  const owner = getLocalEmpresaOwner();
  if (!owner || !owner.empresaId) {
    _guardarLocalEmpresaOwner(empresaId, email);
    _conflictoEmpresa = null;
    return;
  }
  _conflictoEmpresa = (owner.empresaId === empresaId) ? null : { emailAnterior: owner.email || null };
}

// Resuelve un conflicto ya detectado ("Vaciar datos locales y empezar
// limpio"): vacía las tablas de data.json (conserva _seq tal cual) y la cola
// de pending_sync.json, adopta la empresa actual como dueña de los datos
// locales, y dispara una sincronización NORMAL (nunca pushAll — eso subiría
// datos de la cuenta anterior a la nube con el empresa_id equivocado) para
// descargar los datos reales de esta cuenta, ya filtrados por empresa_id en
// la bajada como siempre.
async function resolverConflictoEmpresa() {
  if (!_empresaId) return { ok: false, reason: 'No hay sesión activa.' };
  const { data } = loadDataSafe();
  data.vehiculos  = [];
  data.profesores = [];
  data.alumnos    = [];
  data.practicas  = [];
  data.tarifas    = [];
  data.pagos      = [];
  data.logs       = [];
  saveData(data);
  try { require('./db')._clearCache(); } catch {}

  savePending({
    vehiculos: [], profesores: [], alumnos: [], practicas: [], tarifas: [], pagos: [],
    deleted: { practicas: [], alumnos: [], vehiculos: [], profesores: [], tarifas: [], pagos: [] },
    lastSync: '1970-01-01T00:00:00.000Z'
  });

  _guardarLocalEmpresaOwner(_empresaId, _creds ? _creds.email : null);
  _conflictoEmpresa = null;

  return sync();
}

// ─── PENDING QUEUE ────────────────────────────────────────────────────────────

function loadPending() {
  const p = getPendingPath();
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
  }
  return {
    vehiculos: [], profesores: [], alumnos: [], practicas: [], tarifas: [], pagos: [], sucursales: [], reservas: [],
    deleted: { practicas: [], alumnos: [], vehiculos: [], profesores: [], tarifas: [], pagos: [], sucursales: [], reservas: [] },
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

// ─── PRIMERA VINCULACIÓN CON UNA CUENTA: colisiones de id ────────────────────
// Los ids de vehiculos/alumnos/practicas/etc. son contadores secuenciales por
// DISPOSITIVO (1, 2, 3...), no UUIDs globales. Si este PC llevaba tiempo
// trabajando SIN cuenta (todo en data.json local) y ahora se vincula a una
// cuenta de empresa que ya tiene datos — creados desde otro dispositivo —, sus
// ids pueden coincidir por pura casualidad con ids remotos que son REGISTROS
// DISTINTOS. Sin esto, el paso "SUBIR CAMBIOS LOCALES" de sync() (más abajo)
// haría un upsert ciego por id que sobrescribiría en la nube el registro ajeno
// con el contenido de este PC, perdiéndolo sin avisar.
//
// Se ejecuta una sola vez por cuenta y dispositivo — antes de subir nada — y
// queda marcada en pending.colisionesResueltas para no repetirse en reintentos
// tras un fallo a mitad de sync (evitar reasignar dos veces el mismo registro).
// Cualquier colisión encontrada aquí se trata como dos registros distintos:
// se reasigna el id LOCAL a uno libre, se actualizan las referencias cruzadas
// (vehiculo_id, profesor_id, alumno_id) y las colas de pendientes (dirty y
// borrados) para que sigan apuntando al registro correcto.
//
// LIMITACIÓN CONOCIDA (fuera del alcance de esta protección): una vez vinculado
// el dispositivo, colisiones puntuales entre creaciones simultáneas de dos
// dispositivos ya vinculados siguen siendo posibles (mismo problema de fondo
// que el "caso inverso" documentado junto a _detectarYRegistrarConflicto). Esta
// función solo cubre el momento crítico: la primera vez que este PC sube datos
// a una cuenta que puede llevar tiempo usándose desde otro sitio.
const _TABLAS_COLISION = [
  { tabla: 'vehiculos',  seq: 'v'  },
  { tabla: 'profesores', seq: 'pf' },
  { tabla: 'tarifas',    seq: 't'  },
  { tabla: 'alumnos',    seq: 'a'  },
  { tabla: 'practicas',  seq: 'p'  },
  { tabla: 'pagos',      seq: 'pg' },
  { tabla: 'reservas',   seq: 'r'  }
];

async function _resolverColisionesPrimeraVinculacion(data, pending, sb) {
  if (!_empresaId) return { ejecutado: false, huboColisiones: false, resumen: {} };
  if (!pending.colisionesResueltas) pending.colisionesResueltas = {};
  if (pending.colisionesResueltas[_empresaId]) return { ejecutado: false, huboColisiones: false, resumen: {} };

  const remaps = {};
  const resumen = {};
  let huboColisiones = false;

  for (const { tabla, seq } of _TABLAS_COLISION) {
    const map = new Map();
    remaps[tabla] = map;
    const { data: remotos, error } = await _conEmpresa(sb.from(tabla).select('id'));
    if (error || !remotos || !remotos.length) continue;

    const remoteIds = new Set(remotos.map(r => r.id));
    const maxRemoto = remotos.reduce((m, r) => Math.max(m, r.id || 0), 0);
    if (!data._seq[seq] || data._seq[seq] <= maxRemoto) data._seq[seq] = maxRemoto + 1;

    for (const registro of data[tabla]) {
      if (remoteIds.has(registro.id)) {
        const nuevoId = data._seq[seq]++;
        map.set(registro.id, nuevoId);
        registro.id = nuevoId;
        huboColisiones = true;
      }
    }
    if (map.size) resumen[tabla] = map.size;
  }

  // Referencias cruzadas: un registro que no colisionó puede apuntar a otro
  // que sí (p.ej. un alumno que conserva su id pero cuyo vehículo cambió).
  if (remaps.vehiculos.size) {
    data.alumnos.forEach(a => { if (remaps.vehiculos.has(a.vehiculo_id)) a.vehiculo_id = remaps.vehiculos.get(a.vehiculo_id); });
    data.practicas.forEach(p => { if (remaps.vehiculos.has(p.vehiculo_id)) p.vehiculo_id = remaps.vehiculos.get(p.vehiculo_id); });
    data.reservas.forEach(r => { if (remaps.vehiculos.has(r.vehiculo_id)) r.vehiculo_id = remaps.vehiculos.get(r.vehiculo_id); });
  }
  if (remaps.profesores.size) {
    data.alumnos.forEach(a => { if (a.profesor_id != null && remaps.profesores.has(a.profesor_id)) a.profesor_id = remaps.profesores.get(a.profesor_id); });
    data.practicas.forEach(p => { if (p.profesor_id != null && remaps.profesores.has(p.profesor_id)) p.profesor_id = remaps.profesores.get(p.profesor_id); });
    data.reservas.forEach(r => { if (r.profesor_id != null && remaps.profesores.has(r.profesor_id)) r.profesor_id = remaps.profesores.get(r.profesor_id); });
  }
  if (remaps.alumnos.size) {
    data.practicas.forEach(p => { if (remaps.alumnos.has(p.alumno_id)) p.alumno_id = remaps.alumnos.get(p.alumno_id); });
    data.pagos.forEach(pg => { if (remaps.alumnos.has(pg.alumno_id)) pg.alumno_id = remaps.alumnos.get(pg.alumno_id); });
    data.reservas.forEach(r => { if (r.alumno_id != null && remaps.alumnos.has(r.alumno_id)) r.alumno_id = remaps.alumnos.get(r.alumno_id); });
  }

  // Colas de pendientes: que sigan apuntando al id correcto tras la reasignación.
  const remapLista = (arr, map) => (arr || []).map(id => (map && map.has(id)) ? map.get(id) : id);
  if (!pending.deleted) pending.deleted = {};
  for (const { tabla } of _TABLAS_COLISION) {
    pending[tabla] = remapLista(pending[tabla], remaps[tabla]);
    pending.deleted[tabla] = remapLista(pending.deleted[tabla], remaps[tabla]);
    // Un registro reasignado que aún no estuviera en la cola de subida (no
    // debería pasar en una instalación normal, pero por seguridad) se añade:
    // si no se sube ahora, se queda huérfano en local sin subir nunca.
    for (const nuevoId of remaps[tabla].values()) {
      if (!pending[tabla].includes(nuevoId)) pending[tabla].push(nuevoId);
    }
  }

  pending.colisionesResueltas[_empresaId] = true;

  if (huboColisiones) {
    const detalle = _TABLAS_COLISION
      .map(({ tabla }) => resumen[tabla] ? `${resumen[tabla]} ${tabla}` : null)
      .filter(Boolean)
      .join(', ');
    try {
      require('./db').registrarLogEnData(data, 'vinculacion_cuenta',
        `Vinculación con la cuenta: se reasignaron los ids de ${detalle} de este equipo por coincidir con registros ya existentes en la cuenta (se conservan ambos).`, []);
    } catch { /* no interrumpir el sync por un fallo al loguear */ }
  }

  return { ejecutado: true, huboColisiones, resumen };
}

// Reconciliación proactiva por matrícula (ver migraciones/2026-08-04_unique_
// matricula_vehiculos.sql): antes de subir un vehículo local con matrícula no
// vacía, comprueba si la nube ya tiene un vehículo ACTIVO con esa misma
// matrícula pero con OTRO id — la señal de que el mismo vehículo real se dio
// de alta en dos instalaciones con secuencias de id independientes (el bug
// que motivó esta función: la sync empareja por id, no por matrícula, así que
// dos ids distintos para el mismo coche quedaban duplicados en Supabase). Si
// se detecta, se ADOPTA el id remoto en local en vez de subir uno nuevo:
// fusiona el posible duplicado local que ya tuviera ese id, repunta alumnos y
// prácticas, y deja la cola de pendientes apuntando al id correcto.
// Sin red o sin colisión: no toca nada y devuelve false (se sube por id, como
// hasta ahora; el índice único del servidor — ver migración — protege igual).
async function _reconciliarVehiculoPorMatricula(sb, data, pending, v) {
  if (!v.matricula) return false;
  try {
    let query = sb.from('vehiculos').select('id, updated_at').eq('matricula', v.matricula).eq('deleted', false);
    if (_empresaId) query = query.eq('empresa_id', _empresaId);
    const { data: filas, error } = await query;
    if (error || !filas) return false;

    const remota = filas.find(f => f.id !== v.id);
    if (!remota) return false;
    const remoteId = remota.id;
    const idViejo = v.id;

    // Si ya existe OTRO vehículo local con el id remoto (p.ej. bajado en un
    // sync anterior), fusionar antes de mover: se conserva el contenido del
    // más reciente y se descarta el sobrante, para no dejar dos filas locales
    // con el mismo id.
    const idxDuplicadoLocal = data.vehiculos.findIndex(x => x.id === remoteId);
    if (idxDuplicadoLocal !== -1) {
      const duplicado = data.vehiculos[idxDuplicadoLocal];
      const dupUpdated = duplicado.updated_at || '1970-01-01T00:00:00.000Z';
      const vUpdated = v.updated_at || '1970-01-01T00:00:00.000Z';
      if (dupUpdated > vUpdated) {
        v.nombre = duplicado.nombre;
        v.matricula = duplicado.matricula;
        v.km_actual = duplicado.km_actual;
      }
      data.vehiculos.splice(idxDuplicadoLocal, 1);
    }

    // Repuntar todas las referencias locales del id viejo al id remoto.
    data.alumnos.forEach(a => { if (a.vehiculo_id === idViejo) a.vehiculo_id = remoteId; });
    data.practicas.forEach(p => { if (p.vehiculo_id === idViejo) p.vehiculo_id = remoteId; });

    v.id = remoteId;
    if (remoteId >= data._seq.v) data._seq.v = remoteId + 1;

    // La cola de pendientes debe apuntar ya al id correcto (sin duplicar).
    pending.vehiculos = (pending.vehiculos || []).filter(pid => pid !== idViejo);
    if (!pending.vehiculos.includes(remoteId)) pending.vehiculos.push(remoteId);

    return true;
  } catch (e) {
    console.error('Sync: fallo al reconciliar vehículo por matrícula:', e.message);
    return false;
  }
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

    // Sucursales (fase 2, ver comentario junto a _sucursalesDisponible): si la
    // migración no está aplicada, `sucursal_id` no se estampa en ningún
    // payload de subida (columna inexistente en el servidor) y la tabla
    // `sucursales` ni se sube ni se baja — comportamiento idéntico al de
    // antes de esta funcionalidad, sin errores ni reintentos atascados.
    const sucursalesOn = await _sucursalesDisponible(sb);
    // Reservas (agenda, Bloque 2 SaaS — ver comentario junto a
    // _reservasDisponible): mismo patrón que sucursalesOn, si la migración no
    // está aplicada la tabla `reservas` ni se sube ni se baja, sin errores ni
    // reintentos atascados.
    const reservasOn = await _reservasDisponible(sb);
    // Email de alumno (Bloque 2 SaaS, portal del alumno — ver comentario junto
    // a _alumnosEmailDisponible): mismo patrón que sucursalesOn, si la
    // migración no está aplicada la columna `email` no se estampa en el
    // payload de subida de alumnos, comportamiento idéntico al de antes.
    const emailOn = await _alumnosEmailDisponible(sb);
    // Conflicto de empresa sin resolver (ver sección "PROPIETARIO DE LOS DATOS
    // LOCALES"): el login de ensureClient() acaba de revelar que data.json
    // pertenece a otra cuenta. No tocar nada — ni subir lo que hay en local
    // (sería de la cuenta anterior) ni bajar los datos reales de esta cuenta
    // por encima (los mezclaría con los de la anterior) — hasta que el
    // usuario resuelva el conflicto (ver resolverConflictoEmpresa()). Se
    // informa como una conexión correcta (las credenciales SÍ son válidas,
    // que es lo que "Guardar y probar" necesita para no mostrar un error de
    // login), simplemente sin sincronizar datos todavía.
    if (_conflictoEmpresa) {
      _lastError = null;
      setStatus(STATUS.OK);
      return { ok: true, pulled: 0, conflictos: 0 };
    }

    // Conflictos reales detectados en la bajada de este sync (ver "DETECCIÓN DE
    // CONFLICTOS" más arriba): edición local sin subir todavía que la nube
    // acaba de sustituir con un contenido distinto.
    const conflictos = [];

    // Se pone a true si _reconciliarVehiculoPorMatricula() adopta un id remoto
    // durante la subida (paso 1, más abajo): ese cambio vive solo en memoria
    // hasta que se persiste con saveData(data); sin esta marca, si la bajada
    // (paso 2) no trae ningún cambio propio, "dataChanged" seguiría en false y
    // la reconciliación se perdería al reiniciar la app (pending ya se vacía
    // sin condición al final del sync).
    let vehiculoReconciliado = false;

    // Primera vinculación con esta cuenta (ver comentario junto a la función):
    // si este dispositivo tenía datos locales sin sincronizar, resuelve antes
    // de subir nada las colisiones de id con lo que ya hubiera en la cuenta.
    const resColisiones = await _resolverColisionesPrimeraVinculacion(data, pending, sb);
    if (resColisiones.ejecutado) {
      // Persistir ya mismo data.json y pending_sync.json: si algo falla más
      // abajo (p.ej. un push que lanza una excepción de red), la reasignación
      // ya hecha no debe perderse ni repetirse en el reintento.
      saveData(data);
      savePending(pending);
      try { require('./db')._clearCache(); } catch {}
    }

    // ── 1. SUBIR CAMBIOS LOCALES ──────────────────────────────────────────────
    // OJO (caso inverso, no cubierto — ver nota junto a _detectarYRegistrarConflicto):
    // estos upserts son ciegos, no comprueban el estado remoto antes de escribir.
    //
    // empresa_id (fase 1 multi-empresa): con sesión autenticada (_empresaId no
    // nulo) toda fila subida se estampa con el uid; en modo legado (sin
    // credenciales) no se añade la clave, comportamiento idéntico al de antes.

    // Vehículos dirty. Envuelto en try/catch (igual que pagos, ver más abajo):
    // un fallo puntual (de red, de RLS, o de la propia reconciliación) no debe
    // tumbar el resto del sync — los ids afectados se quedan en pending para
    // el siguiente intento.
    try {
      for (const id of pending.vehiculos) {
        const v = data.vehiculos.find(x => x.id === id);
        if (v) {
          // Reconciliación proactiva por matrícula: si la nube ya tiene este
          // mismo vehículo con otro id, adoptarlo antes de subir (ver función).
          if (v.matricula && await _reconciliarVehiculoPorMatricula(sb, data, pending, v)) {
            vehiculoReconciliado = true;
          }
          const payload = {
            id: v.id, nombre: v.nombre, matricula: v.matricula,
            km_actual: v.km_actual, deleted: false, updated_at: new Date().toISOString()
          };
          if (_empresaId) payload.empresa_id = _empresaId;
          if (sucursalesOn) payload.sucursal_id = v.sucursal_id != null ? v.sucursal_id : null;
          await sb.from('vehiculos').upsert(payload, { onConflict: 'id' });
        }
      }
    } catch (e) {
      console.error('Sync: no se pudieron subir vehículos (error de red o del servidor):', e.message);
    }

    // Profesores dirty
    try {
      for (const id of (pending.profesores || [])) {
        const pr = data.profesores.find(x => x.id === id);
        if (pr) {
          const payload = {
            id: pr.id, nombre: pr.nombre, nota: pr.nota || '',
            deleted: false, updated_at: new Date().toISOString()
          };
          if (_empresaId) payload.empresa_id = _empresaId;
          if (sucursalesOn) payload.sucursal_id = pr.sucursal_id != null ? pr.sucursal_id : null;
          await sb.from('profesores').upsert(payload, { onConflict: 'id' });
        }
      }
    } catch (e) {
      console.error('Sync: no se pudieron subir profesores (error de red o del servidor):', e.message);
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
    try {
      for (const id of pending.alumnos) {
        const a = data.alumnos.find(x => x.id === id);
        if (a) {
          const payload = {
            id: a.id, nombre: a.nombre, permiso: a.permiso,
            vehiculo_id: a.vehiculo_id, profesor_id: a.profesor_id || null,
            deleted: false, updated_at: new Date().toISOString()
          };
          if (_empresaId) payload.empresa_id = _empresaId;
          if (sucursalesOn) payload.sucursal_id = a.sucursal_id != null ? a.sucursal_id : null;
          if (emailOn) payload.email = a.email ? a.email : null;
          await sb.from('alumnos').upsert(payload, { onConflict: 'id' });
        }
      }
    } catch (e) {
      console.error('Sync: no se pudieron subir alumnos (error de red o del servidor):', e.message);
    }

    // Prácticas dirty
    try {
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
          if (sucursalesOn) payload.sucursal_id = p.sucursal_id != null ? p.sucursal_id : null;
          await sb.from('practicas').upsert(payload, { onConflict: 'id' });
        }
      }
    } catch (e) {
      console.error('Sync: no se pudieron subir prácticas (error de red o del servidor):', e.message);
    }

    // Pagos dirty. Tras la migración de roles, un empleado no tiene acceso a
    // `pagos` (RLS restringe esa tabla a jefe): envuelto en try/catch para que
    // ese rechazo no tumbe el resto del sync (vehículos/alumnos/prácticas deben
    // subir igual). La cola de pagos se vacía de todos modos en el paso 3, así
    // que un empleado sin permiso no se queda con reintentos atascados: sus
    // pagos pendientes simplemente no llegan a la nube (el jefe los subirá
    // cuando sincronice él).
    try {
      for (const id of (pending.pagos || [])) {
        const pg = data.pagos.find(x => x.id === id);
        if (pg) {
          const payload = {
            id: pg.id, alumno_id: pg.alumno_id, fecha: pg.fecha,
            cantidad: pg.cantidad || 0, nota: pg.nota || '',
            deleted: false, updated_at: new Date().toISOString()
          };
          if (_empresaId) payload.empresa_id = _empresaId;
          if (sucursalesOn) payload.sucursal_id = pg.sucursal_id != null ? pg.sucursal_id : null;
          await sb.from('pagos').upsert(payload, { onConflict: 'id' });
        }
      }
    } catch (e) {
      console.error('Sync: no se pudo subir pagos (permiso denegado o error de red):', e.message);
    }

    // Sucursales dirty. Solo se procesa si la migración está aplicada
    // (sucursalesOn): sin ella la tabla no existe y no hay nada que subir —
    // la cola pending.sucursales se queda tal cual, sin vaciarse ni fallar,
    // hasta que la migración esté aplicada de verdad.
    if (sucursalesOn) {
      for (const id of (pending.sucursales || [])) {
        const suc = data.sucursales.find(x => x.id === id);
        if (suc) {
          const payload = {
            id: suc.id, nombre: suc.nombre, activa: suc.activa !== false,
            deleted: false, updated_at: new Date().toISOString()
          };
          if (_empresaId) payload.empresa_id = _empresaId;
          await sb.from('sucursales').upsert(payload, { onConflict: 'id' });
        }
      }
    }

    // Reservas dirty (agenda, Bloque 2 SaaS). Solo se procesa si la migración
    // está aplicada (reservasOn): sin ella la tabla no existe y no hay nada
    // que subir — la cola pending.reservas se queda tal cual, sin vaciarse ni
    // fallar, hasta que la migración esté aplicada de verdad.
    if (reservasOn) {
      for (const id of (pending.reservas || [])) {
        const r = data.reservas.find(x => x.id === id);
        if (r) {
          const payload = {
            id: r.id, alumno_id: r.alumno_id || null, profesor_id: r.profesor_id || null,
            vehiculo_id: r.vehiculo_id || null, fecha: r.fecha || null, hora_inicio: r.hora_inicio || null,
            duracion_min: r.duracion_min || 45, estado: r.estado || 'solicitada',
            origen: r.origen || 'desktop', nota: r.nota || '',
            n_practicas: r.n_practicas != null ? r.n_practicas : 1,
            deleted: false, updated_at: new Date().toISOString()
          };
          if (_empresaId) payload.empresa_id = _empresaId;
          if (sucursalesOn) payload.sucursal_id = r.sucursal_id != null ? r.sucursal_id : null;
          await sb.from('reservas').upsert(payload, { onConflict: 'id' });
        }
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
    try {
      for (const id of (pending.deleted.pagos || [])) {
        await sb.from('pagos').update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
      }
    } catch (e) {
      console.error('Sync: no se pudo borrar pagos en la nube (permiso denegado o error de red):', e.message);
    }
    if (sucursalesOn) {
      for (const id of (pending.deleted.sucursales || [])) {
        await sb.from('sucursales').update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
      }
    }
    if (reservasOn) {
      for (const id of (pending.deleted.reservas || [])) {
        await sb.from('reservas').update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
      }
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
    const conEmpresa = _conEmpresa;

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
            km_actual: parseFloat(rv.km_actual) || 0,
            sucursal_id: rv.sucursal_id != null ? rv.sucursal_id : null,
            updated_at: rv.updated_at
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
              km_actual: parseFloat(rv.km_actual) || 0,
              sucursal_id: rv.sucursal_id != null ? rv.sucursal_id : null
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
          data.profesores.push({
            id: rp.id, nombre: rp.nombre, nota: rp.nota || '',
            sucursal_id: rp.sucursal_id != null ? rp.sucursal_id : null,
            updated_at: rp.updated_at
          });
          if (rp.id >= data._seq.pf) data._seq.pf = rp.id + 1;
          dataChanged = true;
          pulled++;
        } else {
          const localUpdated  = data.profesores[idx].updated_at || '1970-01-01T00:00:00.000Z';
          const remoteUpdated = rp.updated_at || '1970-01-01T00:00:00.000Z';
          if (remoteUpdated > localUpdated) {
            const nuevo = { nombre: rp.nombre, nota: rp.nota || '', sucursal_id: rp.sucursal_id != null ? rp.sucursal_id : null };
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

    // Alumnos nuevos o modificados desde el móvil / otro PC
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
        const alumno = {
          id: ra.id, nombre: ra.nombre, permiso: ra.permiso, vehiculo_id: ra.vehiculo_id,
          profesor_id: ra.profesor_id != null ? ra.profesor_id : null,
          sucursal_id: ra.sucursal_id != null ? ra.sucursal_id : null,
          email: ra.email != null ? ra.email : null,
          updated_at: ra.updated_at
        };
        if (idx !== -1) {
          // Comparar timestamps: solo sobrescribir si el remoto es más reciente
          const local = data.alumnos[idx];
          const localUpdated = local.updated_at || '1970-01-01T00:00:00.000Z';
          const remoteUpdated = ra.updated_at || '1970-01-01T00:00:00.000Z';

          if (remoteUpdated > localUpdated) {
            _detectarYRegistrarConflicto(data, 'alumnos', pending.alumnos, ra.id,
              ['nombre', 'permiso', 'vehiculo_id', 'profesor_id', 'email'],
              local, alumno, conflictos);
            data.alumnos[idx] = alumno;
            dataChanged = true;
            pulled++;
          }
          // Si local es más reciente, no sobrescribir (el usuario editó localmente)
        } else {
          data.alumnos.push(alumno);
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
                sucursal_id: rp.sucursal_id != null ? rp.sucursal_id : null,
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

    // Pagos nuevos o modificados. Igual que en la subida: un empleado sin
    // acceso a `pagos` por RLS no debe tumbar el resto de la bajada
    // (vehículos/alumnos/prácticas ya se bajaron arriba y no deben perderse
    // por esto), así que la consulta va envuelta en try/catch además del
    // chequeo normal de `error`.
    try {
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
              sucursal_id: rpg.sucursal_id != null ? rpg.sucursal_id : null,
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
                cantidad: parseFloat(rpg.cantidad) || 0, nota: rpg.nota || '',
                sucursal_id: rpg.sucursal_id != null ? rpg.sucursal_id : null
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
    } catch (e) {
      console.error('Sync: no se pudo leer pagos (permiso denegado o error de red):', e.message);
    }

    // Sucursales nuevas o modificadas. Igual que el resto de tablas nuevas:
    // solo se consulta si la migración está aplicada (sucursalesOn), y
    // envuelta en try/catch por si el rol/RLS deniega algo inesperado.
    if (sucursalesOn) {
      try {
        const { data: remoteSucursales, error: errSuc } = await conEmpresa(sb
          .from('sucursales')
          .select('*')
          .gt('updated_at', lastSync));

        if (!errSuc && remoteSucursales) {
          for (const rs of remoteSucursales) {
            const idx = data.sucursales.findIndex(x => x.id === rs.id);
            if (rs.deleted) {
              if (idx !== -1) { data.sucursales.splice(idx, 1); dataChanged = true; }
              continue;
            }
            if (idx === -1) {
              data.sucursales.push({ id: rs.id, nombre: rs.nombre, activa: rs.activa !== false, updated_at: rs.updated_at });
              if (rs.id >= data._seq.suc) data._seq.suc = rs.id + 1;
              dataChanged = true;
              pulled++;
            } else {
              const localUpdated  = data.sucursales[idx].updated_at || '1970-01-01T00:00:00.000Z';
              const remoteUpdated = rs.updated_at || '1970-01-01T00:00:00.000Z';
              if (remoteUpdated > localUpdated) {
                const nuevo = { nombre: rs.nombre, activa: rs.activa !== false };
                _detectarYRegistrarConflicto(data, 'sucursales', pending.sucursales,
                  rs.id, ['nombre', 'activa'], data.sucursales[idx], nuevo, conflictos);
                Object.assign(data.sucursales[idx], nuevo, { updated_at: rs.updated_at });
                dataChanged = true;
                pulled++;
              }
            }
          }
        }
      } catch (e) {
        console.error('Sync: no se pudo leer sucursales (permiso denegado o error de red):', e.message);
      }
    }

    // Reservas nuevas o modificadas (agenda, Bloque 2 SaaS). Mismo patrón que
    // sucursales: solo se consulta si la migración está aplicada (reservasOn),
    // y envuelta en try/catch por si el rol/RLS deniega algo inesperado.
    if (reservasOn) {
      try {
        const { data: remoteReservas, error: errR } = await conEmpresa(sb
          .from('reservas')
          .select('*')
          .gt('updated_at', lastSync));

        if (!errR && remoteReservas) {
          for (const rr of remoteReservas) {
            const idx = data.reservas.findIndex(x => x.id === rr.id);
            if (rr.deleted) {
              if (idx !== -1) { data.reservas.splice(idx, 1); dataChanged = true; }
              continue;
            }
            const reserva = {
              id: rr.id, alumno_id: rr.alumno_id != null ? rr.alumno_id : null,
              profesor_id: rr.profesor_id != null ? rr.profesor_id : null,
              vehiculo_id: rr.vehiculo_id != null ? rr.vehiculo_id : null,
              fecha: rr.fecha || null, hora_inicio: rr.hora_inicio || null,
              duracion_min: rr.duracion_min != null ? rr.duracion_min : 45,
              estado: rr.estado || 'solicitada', origen: rr.origen || 'desktop',
              nota: rr.nota || '',
              sucursal_id: rr.sucursal_id != null ? rr.sucursal_id : null,
              n_practicas: rr.n_practicas != null ? rr.n_practicas : 1,
              updated_at: rr.updated_at
            };
            if (idx === -1) {
              data.reservas.push(reserva);
              // Solo avanzar el contador local con ids del rango de ESCRITORIO
              // (< 1.000.000.000). Las reservas creadas desde el portal usan
              // ids >= 1e9 (secuencia reservas_portal_id_seq): son un rango
              // disjunto y NO deben arrastrar _seq.r hacia arriba, o el
              // escritorio empezaría a chocar con los ids del portal. Ver
              // migraciones/2026-08-06_portal_reservas.sql.
              if (rr.id < 1000000000 && rr.id >= data._seq.r) data._seq.r = rr.id + 1;
              dataChanged = true;
              pulled++;
            } else {
              const localUpdated  = data.reservas[idx].updated_at || '1970-01-01T00:00:00.000Z';
              const remoteUpdated = rr.updated_at || '1970-01-01T00:00:00.000Z';
              if (remoteUpdated > localUpdated) {
                _detectarYRegistrarConflicto(data, 'reservas', pending.reservas, rr.id,
                  ['estado', 'fecha', 'hora_inicio', 'profesor_id', 'n_practicas'], data.reservas[idx], reserva, conflictos);
                data.reservas[idx] = reserva;
                dataChanged = true;
                pulled++;
              }
              // Si local es más reciente, no sobrescribir (el usuario editó localmente)
            }
          }
        }
      } catch (e) {
        console.error('Sync: no se pudo leer reservas (permiso denegado o error de red):', e.message);
      }
    }

    if (dataChanged || regenerado || vehiculoReconciliado) {
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
    // Sucursales: solo se vacía la cola si de verdad se procesó (migración
    // aplicada) — si no, se deja tal cual para cuando lo esté (ver subida más
    // arriba), sin generar errores de sync mientras tanto.
    if (sucursalesOn) {
      pending.sucursales          = [];
      pending.deleted.sucursales  = [];
    }
    // Reservas: mismo criterio que sucursales, solo se vacía si de verdad se
    // procesó (migración aplicada).
    if (reservasOn) {
      pending.reservas            = [];
      pending.deleted.reservas    = [];
    }
    pending.lastSync            = new Date().toISOString();
    savePending(pending);

    _lastError = null;
    setStatus(STATUS.OK);
    if (conflictos.length && _onConflictos) _onConflictos(conflictos);
    const totalColisiones = Object.values(resColisiones.resumen || {}).reduce((a, b) => a + b, 0);
    return { ok: true, pulled, conflictos: conflictos.length, colisionesResueltas: totalColisiones };

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
  // Salvaguarda de la fase 3 (aislamiento de datos entre cuentas en el mismo
  // PC): con un conflicto de empresa sin resolver, data.json todavía tiene
  // datos de la cuenta anterior — subirlos "a ciegas" los reasignaría de
  // verdad en la nube a la cuenta actual. Hay que resolver el conflicto
  // (vaciar y sincronizar, ver resolverConflictoEmpresa()) antes de poder
  // usar este botón otra vez.
  if (_conflictoEmpresa) {
    return { ok: false, reason: 'Los datos locales de este PC pertenecen a otra cuenta. Resuelve el conflicto (vaciar y sincronizar) antes de subir nada a la nube.' };
  }
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
    // sucursal_id (fase 2): solo se sube si la migración está aplicada — si
    // no, la columna no existe en el servidor y el upsert fallaría.
    const sucursalesOn = await _sucursalesDisponible(sb);
    // reservas (agenda, Bloque 2 SaaS): mismo cuidado, si la tabla no existe
    // aún en el servidor ni se sube ni se intenta.
    const reservasOn = await _reservasDisponible(sb);
    // `...v` ya trae sucursal_id si el registro local lo tiene; sin la
    // migración aplicada se elimina del objeto para no mandarlo al servidor.
    const quitarSucursal = obj => {
      if (!sucursalesOn) { const { sucursal_id, ...resto } = obj; return resto; }
      return { ...obj, sucursal_id: obj.sucursal_id != null ? obj.sucursal_id : null };
    };
    // email (Bloque 2 SaaS, portal del alumno): mismo cuidado que sucursal_id
    // — `...a` ya trae `email` porque el objeto local lo guarda desde ahora;
    // si la migración no está aplicada hay que quitarlo del objeto o el
    // upsert de alumnos falla entero (columna inexistente en el servidor).
    const emailOn = await _alumnosEmailDisponible(sb);
    const quitarEmail = obj => {
      if (!emailOn) { const { email, ...resto } = obj; return resto; }
      return { ...obj, email: obj.email ? obj.email : null };
    };

    // Subir en orden: vehiculos → profesores → tarifas → alumnos → practicas → pagos
    if (data.vehiculos.length) {
      await sb.from('vehiculos').upsert(
        data.vehiculos.map(v => quitarSucursal({ ...v, ...conEmpresaTag, deleted: false, updated_at: now })),
        { onConflict: 'id' }
      );
    }
    if (data.profesores.length) {
      await sb.from('profesores').upsert(
        data.profesores.map(p => quitarSucursal({ ...p, ...conEmpresaTag, deleted: false, updated_at: now })),
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
        data.alumnos.map(a => quitarEmail(quitarSucursal({ ...a, ...conEmpresaTag, deleted: false, updated_at: now }))),
        { onConflict: 'id' }
      );
    }
    if (data.practicas.length) {
      await sb.from('practicas').upsert(
        data.practicas.map(p => quitarSucursal({ ...p, ...conEmpresaTag, deleted: false, updated_at: now })),
        { onConflict: 'id' }
      );
    }
    // Sucursales: solo si la migración está aplicada (si no, ni la tabla existe).
    if (sucursalesOn && data.sucursales.length) {
      await sb.from('sucursales').upsert(
        data.sucursales.map(s => ({ ...s, ...conEmpresaTag, deleted: false, updated_at: now })),
        { onConflict: 'id' }
      );
    }
    // Reservas: solo si la migración está aplicada (si no, ni la tabla existe).
    if (reservasOn && data.reservas.length) {
      await sb.from('reservas').upsert(
        data.reservas.map(r => quitarSucursal({ ...r, ...conEmpresaTag, deleted: false, updated_at: now })),
        { onConflict: 'id' }
      );
    }
    // Pagos: igual tolerancia que en sync() — un empleado sin acceso a la
    // tabla por RLS no debe abortar la subida completa de las demás tablas.
    try {
      if (data.pagos.length) {
        await sb.from('pagos').upsert(
          data.pagos.map(pg => quitarSucursal({ ...pg, ...conEmpresaTag, deleted: false, updated_at: now })),
          { onConflict: 'id' }
        );
      }
    } catch (e) {
      console.error('Sync (subir todo): no se pudo subir pagos (permiso denegado o error de red):', e.message);
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
    try {
      for (const id of (pending.deleted.pagos || [])) {
        await sb.from('pagos').update({ deleted: true, updated_at: now }).eq('id', id);
      }
    } catch (e) {
      console.error('Sync (subir todo): no se pudo borrar pagos en la nube (permiso denegado o error de red):', e.message);
    }
    if (sucursalesOn) {
      for (const id of (pending.deleted.sucursales || [])) {
        await sb.from('sucursales').update({ deleted: true, updated_at: now }).eq('id', id);
      }
    }
    if (reservasOn) {
      for (const id of (pending.deleted.reservas || [])) {
        await sb.from('reservas').update({ deleted: true, updated_at: now }).eq('id', id);
      }
    }

    // Limpiar pending. OJO: no adelantar lastSync aquí — si este PC aún no ha
    // descargado los datos antiguos de la nube, adelantarla se los saltaría.
    pending.vehiculos = []; pending.profesores = []; pending.tarifas = []; pending.alumnos = []; pending.practicas = []; pending.pagos = [];
    pending.deleted = { practicas: [], alumnos: [], vehiculos: [], profesores: [], tarifas: [], pagos: [], sucursales: pending.deleted.sucursales, reservas: pending.deleted.reservas };
    if (sucursalesOn) { pending.sucursales = []; pending.deleted.sucursales = []; }
    if (reservasOn) { pending.reservas = []; pending.deleted.reservas = []; }
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
  restaurarCredenciales,
  hasCredentials,
  getAuthError,
  getEmpresaId,
  getLastError,
  programarSyncInmediato,
  _configurarSyncInmediatoParaTests,
  registrarEmpresa,
  getEstadoCuenta,
  getPerfilActual,
  getModulosActivos,
  listarEmpleados,
  invitarEmpleado,
  cambiarRolEmpleado,
  quitarEmpleado,
  solicitarResetPassword,
  getLocalEmpresaOwner,
  resolverConflictoEmpresa
};
