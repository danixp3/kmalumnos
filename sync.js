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
const { CAMPOS_EXTRA, normalizarCampoExtra } = require('./db/campos-extra');

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
// Callback para avisar a la UI de que este sync TRAJO datos de la nube (clases
// del móvil, alumnos dados de alta en la web...): la pantalla abierta se repinta sola.
let _onDatosNuevos = null;

const STATUS = {
  OFFLINE:  'offline',
  SYNCING:  'syncing',
  OK:       'ok',
  ERROR:    'error',
  PENDING:  'pending'
};

let currentStatus = STATUS.OFFLINE;
let _lastError = null; // motivo del último error de sync, para mostrarlo en la UI

// sync() trabaja con la copia de data.json y de la cola que carga al empezar
// (varios segundos de red). Lo que se marque con markDirty/markDeleted mientras
// tanto se apunta aquí ('tabla:id') para que, al terminar, ni la edición local
// ni su subida pendiente se pierdan (ver _fusionarConDisco). null = sin sync.
let _remarcados = null;
let _syncPromesa = null; // sync en curso: una segunda llamada espera a esta

// Ids creados desde la web del móvil o el portal (secuencias *_web_id_seq y
// reservas_portal_id_seq de Supabase): rango propio, disjunto del contador
// local del escritorio. El contador local NUNCA debe saltar a este rango, o
// escritorio y web acabarían eligiendo el mismo id y uno pisaría al otro.
const ID_WEB_MIN = 1000000000;
const TAM_PAGINA = 1000; // filas máximas que devuelve PostgREST por consulta
const TAM_LOTE_SUBIDA = 200; // filas por petición al subir alumnos/prácticas en bloque
const TAM_LOTE_IDS = 200; // ids por petición en «where id in (...)» (van en la URL)
const PETICIONES_A_LA_VEZ = 4; // subidas/borrados en bloque que viajan en paralelo
// Margen al fijar lastSync: filas escritas en la nube mientras corría el sync
// (o con el reloj de otro equipo algo desfasado) se vuelven a mirar en el
// siguiente. Re-bajar una fila ya aplicada no cambia nada.
const MARGEN_LASTSYNC_MS = 10 * 60 * 1000;

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
  if (!Array.isArray(data.cargos))     data.cargos = [];
  if (!Array.isArray(data.logs))       data.logs = [];
  if (!data._seq) data._seq = { v: 1, pf: 1, a: 1, p: 1, t: 1, pg: 1, suc: 1, r: 1, cargo: 1 };
  if (!data._seq.pf) data._seq.pf = 1;
  if (!data._seq.t) data._seq.t = 1;
  if (!data._seq.pg) data._seq.pg = 1;
  if (!data._seq.suc) data._seq.suc = 1;
  if (!data._seq.r) data._seq.r = 1;
  if (!data._seq.cargo) data._seq.cargo = 1;
  _repararSeqWeb(data);
  return { data, regenerado };
}

// Contadores locales que una versión anterior pudo empujar al rango de la web
// (>= ID_WEB_MIN) al bajar un registro creado desde el móvil: se devuelven al
// siguiente id libre del rango del escritorio.
const _SEQ_TABLA = { v: 'vehiculos', pf: 'profesores', a: 'alumnos', p: 'practicas', t: 'tarifas', pg: 'pagos', r: 'reservas', cargo: 'cargos', suc: 'sucursales' };
function _repararSeqWeb(data) {
  for (const [k, tabla] of Object.entries(_SEQ_TABLA)) {
    if (!data._seq || !(data._seq[k] >= ID_WEB_MIN)) continue;
    const max = (data[tabla] || []).reduce((m, r) => (r && r.id < ID_WEB_MIN && r.id > m ? r.id : m), 0);
    data._seq[k] = max + 1;
  }
}

// Avanza el contador local al bajar un registro remoto, salvo que el id sea
// del rango de la web (ver ID_WEB_MIN).
function _avanzarSeq(data, k, id) {
  if (typeof id !== 'number' || id >= ID_WEB_MIN) return;
  if (!data._seq[k] || id >= data._seq[k]) data._seq[k] = id + 1;
}

// La clave primaria de cada tabla de la nube es GLOBAL (todas las empresas),
// pero cada PC numera por su cuenta y solo ve los ids de su empresa: dos
// autoescuelas, o la cuenta de prueba y la real en el mismo PC, acababan
// eligiendo el mismo id y la segunda no podía subirlo (RLS de la otra
// empresa: se quedaba en la cola para siempre). ids_maximos() (función de la
// migración 2026-10-03, sin exponer ninguna fila) da el mayor id de cada tabla
// y el contador local se pone por encima. Sin la migración, no hace nada.
const SEQ_POR_TABLA = { vehiculos: 'v', profesores: 'pf', alumnos: 'a', practicas: 'p', tarifas: 't', pagos: 'pg', sucursales: 'suc', reservas: 'r', cargos: 'cargo' };
let _idsMaximosDisponible = null; // false = la función no existe todavía
async function _avanzarSeqGlobal(sb, data) {
  if (_idsMaximosDisponible === false || !_empresaId || !sb || typeof sb.rpc !== 'function') return false;
  try {
    const { data: maximos, error } = await sb.rpc('ids_maximos');
    if (error) {
      if (/ids_maximos|PGRST202|42883|could not find the function/i.test(`${error.message} ${error.code}`)) _idsMaximosDisponible = false;
      return false;
    }
    _idsMaximosDisponible = true;
    let cambio = false;
    for (const [tabla, k] of Object.entries(SEQ_POR_TABLA)) {
      const max = Number(maximos && maximos[tabla]);
      if (Number.isFinite(max) && max > 0 && max < ID_WEB_MIN - 1 && !(data._seq[k] > max)) { data._seq[k] = max + 1; cambio = true; }
    }
    return cambio;
  } catch { return false; }
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
  _sondeoVisto = null; // otra sesión/empresa: lo «visto» de la anterior ya no vale
  _authError = null;
  _empresaId = null;
  _perfilCache = null; // cambio de sesión: invalidar el perfil (rol/empresa) cacheado
  _sucursalesDisponibleCache = null; // idem: reconsultar si la migración está aplicada
  _reservasDisponibleCache = null; // idem: reconsultar si la migración de reservas está aplicada
  _cargosDisponibleCache = null; // idem: reconsultar si la migración de cargos está aplicada
  _alumnosEmailDisponibleCache = null; // idem: reconsultar si la columna email está disponible
  _alumnosDatosDisponibleCache = null; // idem: reconsultar si las columnas de ficha ampliada están disponibles
  _alumnosLibroDisponibleCache = null; // idem: reconsultar si las columnas del libro de registro están disponibles
  _alumnosPermisosDisponibleCache = null; // idem: reconsultar si la columna permisos está disponible
  _pagosCamposDisponibleCache = null; // idem: reconsultar si forma_pago/empleado están disponibles
  _profesoresDniDisponibleCache = null; // idem: reconsultar si la columna dni de profesores está disponible
  _alumnosFichaDgtDisponibleCache = null; // idem: reconsultar si las columnas de la ficha DGT están disponibles
  _practicasHoraInicioDisponibleCache = null; // idem: reconsultar si la columna hora_inicio está disponible
  _practicasMovilDisponibleCache = null; // idem: reconsultar si las columnas del flujo móvil (firma...) están disponibles
  _columnasCache = {};
  _modulosCache = null; // idem: reconsultar los módulos contratados de la nueva sesión
  _idsMaximosDisponible = null; // idem: la migración pudo aplicarse mientras tanto
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
  _sondeoVisto = null; // otra sesión/empresa: lo «visto» de la anterior ya no vale
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
      _cargosDisponibleCache = null; // idem: reconsultar si la migración de cargos está aplicada
      _alumnosEmailDisponibleCache = null; // idem: reconsultar si la columna email está disponible
      _alumnosDatosDisponibleCache = null; // idem: reconsultar si las columnas de ficha ampliada están disponibles
      _alumnosLibroDisponibleCache = null; // idem: reconsultar si las columnas del libro de registro están disponibles
  _alumnosPermisosDisponibleCache = null; // idem: reconsultar si la columna permisos está disponible
  _pagosCamposDisponibleCache = null; // idem: reconsultar si forma_pago/empleado están disponibles
  _profesoresDniDisponibleCache = null; // idem: reconsultar si la columna dni de profesores está disponible
  _alumnosFichaDgtDisponibleCache = null; // idem: reconsultar si las columnas de la ficha DGT están disponibles
  _practicasHoraInicioDisponibleCache = null; // idem: reconsultar si la columna hora_inicio está disponible
  _practicasMovilDisponibleCache = null; // idem: reconsultar si las columnas del flujo móvil (firma...) están disponibles
  _columnasCache = {};
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

// ─── CARGOS (descuentos/promociones + cargos automáticos, tarea D2) ──────────
// Mismo patrón exacto que _reservasDisponible de arriba: mientras la
// migración `migraciones/2026-08-06_cargos.sql` no esté aplicada, la tabla
// `cargos` no existe en Supabase y cualquier consulta a ella falla — se
// trata como "modo clásico", nunca como un error real: cargos simplemente
// no se sube ni se baja. Cacheado en memoria durante la sesión; se invalida
// en los mismos puntos que _reservasDisponibleCache (setCredentials/
// registrarEmpresa más arriba).
let _cargosDisponibleCache = null;

async function _cargosDisponible(sb) {
  if (_cargosDisponibleCache !== null) return _cargosDisponibleCache;
  try {
    const { error } = await sb.from('cargos').select('id').limit(1);
    _cargosDisponibleCache = !error;
  } catch {
    _cargosDisponibleCache = false;
  }
  return _cargosDisponibleCache;
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

// Mismo patrón exacto que _alumnosEmailDisponible de arriba, para los campos
// de ficha ampliada del alumno (teléfono, DNI, fecha de nacimiento, dirección,
// fecha de alta, observaciones, estado — migraciones `migraciones/2026-08-06_alumno_datos.sql`
// y `migraciones/2026-08-06_alumno_estado.sql`, TODAVÍA NO aplicadas): si no
// están aplicadas, esas columnas no existen en Supabase y se trata como "modo
// clásico", nunca como un error real. Basta comprobar una sola columna
// (`telefono`): se aplican juntas. Cacheado en memoria durante la sesión; se
// invalida en los mismos puntos que _alumnosEmailDisponibleCache
// (setCredentials/registrarEmpresa).
let _alumnosDatosDisponibleCache = null;

async function _alumnosDatosDisponible(sb) {
  if (_alumnosDatosDisponibleCache !== null) return _alumnosDatosDisponibleCache;
  try {
    const { error } = await sb.from('alumnos').select('telefono').limit(1);
    _alumnosDatosDisponibleCache = !error;
  } catch {
    _alumnosDatosDisponibleCache = false;
  }
  return _alumnosDatosDisponibleCache;
}

// Mismo patrón exacto que _alumnosDatosDisponible de arriba, pero para el
// grupo APARTE del "libro de registro de alumnos" (RD 1295/2003 art. 39:
// nº de inscripción, permisos que ya posee, fechas de inicio/fin de la
// enseñanza y resultado — migración `migraciones/2026-08-06_alumno_libro.sql`,
// TODAVÍA NO aplicada): si no está aplicada, esas columnas no existen en
// Supabase y se trata como "modo clásico", nunca como un error real. Basta
// comprobar una sola columna (`n_inscripcion`): se aplican juntas. Cacheado
// en memoria durante la sesión; se invalida en los mismos puntos que
// _alumnosDatosDisponibleCache (setCredentials/registrarEmpresa).
let _alumnosLibroDisponibleCache = null;

async function _alumnosLibroDisponible(sb) {
  if (_alumnosLibroDisponibleCache !== null) return _alumnosLibroDisponibleCache;
  try {
    const { error } = await sb.from('alumnos').select('n_inscripcion').limit(1);
    _alumnosLibroDisponibleCache = !error;
  } catch {
    _alumnosLibroDisponibleCache = false;
  }
  return _alumnosLibroDisponibleCache;
}

// Mismo patrón exacto que _alumnosLibroDisponible de arriba, para el campo
// NUEVO `permisos` (array con los DEMÁS permisos que cursa el alumno, aparte
// del `permiso` principal que NO se toca — sigue rigiendo tarifas/pagos) —
// migración `migraciones/2026-08-06_alumno_permisos.sql`, TODAVÍA NO
// aplicada. Si no está aplicada, la columna `permisos` no existe en Supabase
// y se trata como "modo clásico", nunca como un error real. Cacheado en
// memoria durante la sesión; se invalida en los mismos puntos que
// _alumnosLibroDisponibleCache (setCredentials/registrarEmpresa).
let _alumnosPermisosDisponibleCache = null;

async function _alumnosPermisosDisponible(sb) {
  if (_alumnosPermisosDisponibleCache !== null) return _alumnosPermisosDisponibleCache;
  try {
    const { error } = await sb.from('alumnos').select('permisos').limit(1);
    _alumnosPermisosDisponibleCache = !error;
  } catch {
    _alumnosPermisosDisponibleCache = false;
  }
  return _alumnosPermisosDisponibleCache;
}

// Mismo patrón exacto que _alumnosLibroDisponible de arriba, pero para las
// columnas NUEVAS de `pagos` (tarea D1 del PLAN-MAESTRO: arqueo de caja) —
// `forma_pago` y `empleado` — migración
// `migraciones/2026-08-06_pago_forma_empleado.sql`, TODAVÍA NO aplicada. Si
// no está aplicada, esas columnas no existen en Supabase y se trata como
// "modo clásico", nunca como un error real. Basta comprobar una sola columna
// (`forma_pago`): se aplican juntas. Cacheado en memoria durante la sesión;
// se invalida en los mismos puntos que _alumnosLibroDisponibleCache
// (setCredentials/registrarEmpresa).
let _pagosCamposDisponibleCache = null;

async function _pagosCamposDisponible(sb) {
  if (_pagosCamposDisponibleCache !== null) return _pagosCamposDisponibleCache;
  try {
    const { error } = await sb.from('pagos').select('forma_pago').limit(1);
    _pagosCamposDisponibleCache = !error;
  } catch {
    _pagosCamposDisponibleCache = false;
  }
  return _pagosCamposDisponibleCache;
}

// Mismo patrón exacto que _pagosCamposDisponible de arriba, para la columna
// NUEVA `dni` de profesores (tarea "Ficha alumno – formación práctica" DGT) —
// migración `migraciones/2026-09-09_profesor_dni.sql`, TODAVÍA NO aplicada.
// Si no está aplicada, la columna no existe en Supabase y se trata como
// "modo clásico", nunca como un error real. Cacheado en memoria durante la
// sesión; se invalida en los mismos puntos que _pagosCamposDisponibleCache
// (setCredentials/registrarEmpresa).
let _profesoresDniDisponibleCache = null;

async function _profesoresDniDisponible(sb) {
  if (_profesoresDniDisponibleCache !== null) return _profesoresDniDisponibleCache;
  try {
    const { error } = await sb.from('profesores').select('dni').limit(1);
    _profesoresDniDisponibleCache = !error;
  } catch {
    _profesoresDniDisponibleCache = false;
  }
  return _profesoresDniDisponibleCache;
}

// Mismo patrón exacto que _alumnosLibroDisponible, pero para el grupo APARTE
// de la ficha DGT del alumno (primer_apellido, segundo_apellido,
// codigo_postal, poblacion — mismo grupo de tarea que profesores.dni y
// practicas.hora_inicio, ver comentario junto a CAMPOS_DATOS_ALUMNO en
// db/alumnos.js) — migración `migraciones/2026-09-09_alumno_ficha_dgt.sql`,
// TODAVÍA NO aplicada. Si no está aplicada, esas 4 columnas no existen en
// Supabase y se trata como "modo clásico", nunca como un error real. Basta
// comprobar una sola columna (`primer_apellido`): se aplican juntas.
// Cacheado en memoria durante la sesión; se invalida en los mismos puntos
// que _alumnosLibroDisponibleCache (setCredentials/registrarEmpresa).
let _alumnosFichaDgtDisponibleCache = null;

async function _alumnosFichaDgtDisponible(sb) {
  if (_alumnosFichaDgtDisponibleCache !== null) return _alumnosFichaDgtDisponibleCache;
  try {
    const { error } = await sb.from('alumnos').select('primer_apellido').limit(1);
    _alumnosFichaDgtDisponibleCache = !error;
  } catch {
    _alumnosFichaDgtDisponibleCache = false;
  }
  return _alumnosFichaDgtDisponibleCache;
}

// Mismo patrón exacto que las anteriores, para la columna NUEVA
// `hora_inicio` de prácticas (misma tarea "Ficha alumno – formación práctica"
// DGT) — migración `migraciones/2026-09-09_practica_hora_inicio.sql`,
// TODAVÍA NO aplicada. Si no está aplicada, la columna no existe en Supabase
// y se trata como "modo clásico", nunca como un error real. Cacheado en
// memoria durante la sesión; se invalida en los mismos puntos que
// _alumnosFichaDgtDisponibleCache (setCredentials/registrarEmpresa).
let _practicasHoraInicioDisponibleCache = null;

async function _practicasHoraInicioDisponible(sb) {
  if (_practicasHoraInicioDisponibleCache !== null) return _practicasHoraInicioDisponibleCache;
  try {
    const { error } = await sb.from('practicas').select('hora_inicio').limit(1);
    _practicasHoraInicioDisponibleCache = !error;
  } catch {
    _practicasHoraInicioDisponibleCache = false;
  }
  return _practicasHoraInicioDisponibleCache;
}

// Mismo patrón exacto que las anteriores, para las columnas NUEVAS del flujo
// móvil de prácticas (rediseño 2026-09): `firma` (imagen de la firma del alumno),
// `trabajado` (qué se ha practicado), `tipo_detalle` (tipo elegido en el móvil) y
// `hora_fin` — migración `migraciones/2026-09-29_practica_movil.sql`, TODAVÍA NO
// aplicada. Sin ella, esas columnas no se estampan ni se piden: se trata como
// "modo clásico", nunca como un error real.
// Detección genérica de columnas/tablas de migraciones recientes (zonas,
// punto de partida del alumno, ajustes compartidos). Solo se memoriza un "no
// existe" real; un fallo de red no deja la función apagada toda la sesión.
let _columnasCache = {};
async function _columnasDisponibles(sb, tabla, cols) {
  const k = tabla + ':' + cols;
  if (k in _columnasCache) return _columnasCache[k];
  try {
    const { error } = await sb.from(tabla).select(cols).limit(1);
    if (!error) return (_columnasCache[k] = true);
    const noExiste = ['42703', 'PGRST204', '42P01', 'PGRST205'].includes(error.code) ||
      /does not exist|could not find/i.test(error.message || '');
    if (noExiste) _columnasCache[k] = false;
    return false;
  } catch {
    return false;
  }
}
const _practicasZonasDisponible = sb => _columnasDisponibles(sb, 'practicas', 'zonas');
const _alumnosPreviasDisponible = sb => _columnasDisponibles(sb, 'alumnos', 'clases_previas, km_previos');
const _ajustesEmpresaDisponible = sb => _columnasDisponibles(sb, 'ajustes_empresa', 'clave, valor, updated_at');
// Migración 2026-10-02: firma del profesor, fracción de clase (¼ ½ ¾) y minutos
// acumulados del alumno (los sobrantes de las clases por minutos del móvil).
const _profesoresFirmaDisponible = sb => _columnasDisponibles(sb, 'profesores', 'firma');
const _practicasFraccionDisponible = sb => _columnasDisponibles(sb, 'practicas', 'fraccion');
const _alumnosMinutosDisponible = sb => _columnasDisponibles(sb, 'alumnos', 'minutos_sobrantes');
// Migración 2026-10-03: datos completos de alumnos, profesores y coches (los
// de Ariauto) y coches retirados (db/campos-extra.js). Un grupo por tabla.
const _extraDisponible = (sb, tabla) => _columnasDisponibles(sb, tabla, Object.keys(CAMPOS_EXTRA[tabla]).join(', '));
async function _extraTablas(sb) {
  return {
    alumnos: await _extraDisponible(sb, 'alumnos'),
    profesores: await _extraDisponible(sb, 'profesores'),
    vehiculos: await _extraDisponible(sb, 'vehiculos')
  };
}
// Subida: los campos ampliados del registro local, limpios.
function _ponerExtra(tabla, payload, local) {
  for (const [c, t] of Object.entries(CAMPOS_EXTRA[tabla])) payload[c] = normalizarCampoExtra(t, local[c]);
  return payload;
}
// Bajada: lo que trae la nube; si la fila no trae la columna (nube sin la
// migración), se conserva lo que había en este PC.
function _traerExtra(tabla, destino, remoto, local) {
  for (const [c, t] of Object.entries(CAMPOS_EXTRA[tabla])) {
    if (c in remoto) destino[c] = normalizarCampoExtra(t, remoto[c]);
    else if (local && c in local) destino[c] = local[c];
  }
  return destino;
}
// Subida completa (objeto local entero): sin las columnas en la nube hay que
// quitarlos o el upsert entero fallaría.
function _quitarExtra(tabla, obj, on) {
  const out = { ...obj };
  for (const [c, t] of Object.entries(CAMPOS_EXTRA[tabla])) {
    if (on) out[c] = normalizarCampoExtra(t, obj[c]); else delete out[c];
  }
  return out;
}

let _practicasMovilDisponibleCache = null;

async function _practicasMovilDisponible(sb) {
  if (_practicasMovilDisponibleCache !== null) return _practicasMovilDisponibleCache;
  try {
    const { error } = await sb.from('practicas').select('firma, trabajado, tipo_detalle, hora_fin').limit(1);
    _practicasMovilDisponibleCache = !error;
  } catch {
    _practicasMovilDisponibleCache = false;
  }
  return _practicasMovilDisponibleCache;
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
// Cierra la sesión de la cuenta en TODOS los demás dispositivos (móviles,
// tablets, otros PCs) y deja abierta solo la de este PC. Para una tablet
// perdida o un profesor que deja la autoescuela; después conviene cambiar la
// contraseña si alguien más pudo verla.
async function cerrarOtrasSesiones() {
  const sb = await ensureClient();
  if (!sb || !_empresaId) return { ok: false, msg: _authError || 'Inicia sesión con la cuenta de la autoescuela primero.' };
  try {
    const { error } = await sb.auth.signOut({ scope: 'others' });
    if (error) return { ok: false, msg: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

async function invitarEmpleado(email, rol, sucursal_id) {
  // Seguridad (2026-10-07): meter la cuenta de otra persona en tu empresa solo
  // con su email, sin que lo acepte, permitía dejar fuera de sus datos a otra
  // autoescuela. La base de datos ya no lo permite (migración 2026-10-07_seguridad).
  return { ok: false, msg: 'Por seguridad, ya no se pueden añadir cuentas de empleado solo con el email. Escribe a soporte si necesitas cuentas separadas.' };
  // eslint-disable-next-line no-unreachable
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
  // Un cambio de cuenta que se quedó a medias (cierre brusco) también se
  // trata como conflicto: cambiarDatosDeCuenta() lo termina.
  _conflictoEmpresa = (owner.empresaId === empresaId && !_leerMarcaCambio())
    ? null
    : { emailAnterior: owner.email || null, empresaAnterior: owner.empresaId };
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

// ─── DATOS LOCALES POR CUENTA (varias cuentas en el mismo PC) ─────────────────
// Cada cuenta que entra en este PC conserva sus propios datos locales. Los de
// la cuenta activa siguen donde siempre (data.json + pending_sync.json, dueña
// en local_empresa.json); al entrar con OTRA cuenta (conflicto detectado en
// el login) se guardan en cuentas/<id>/ y se traen los de la nueva o, si es
// la primera vez que entra aquí, se empieza vacío y se baja todo de la nube.
// Así se puede ir y volver entre la cuenta de prueba y la de la autoescuela
// sin perder nada: lo que no llegó a subirse (sin conexión) y lo que solo
// vive en el PC (jornadas, vencimientos, exámenes, registro de cambios)
// vuelve con su cuenta. Antes había que «vaciar los datos locales» cada vez.
// cambio_cuenta.json marca un cambio a medias: si la app se cierra en mitad,
// el siguiente intento lo termina sin volver a guardar encima de la copia.
const ARCHIVOS_CUENTA = ['data.json', 'pending_sync.json'];

function getCuentasDir() {
  return path.join(app.getPath('userData'), 'cuentas');
}
function _dirCuenta(empresaId) {
  return path.join(getCuentasDir(), String(empresaId).replace(/[^A-Za-z0-9_-]/g, '_'));
}
function _rutaMarcaCambio() {
  return path.join(app.getPath('userData'), 'cambio_cuenta.json');
}
function _leerMarcaCambio() {
  try { return JSON.parse(fs.readFileSync(_rutaMarcaCambio(), 'utf-8')); } catch { return null; }
}
function _copiarAtomico(origen, destino) {
  const tmp = destino + '.tmp';
  fs.copyFileSync(origen, tmp);
  fs.renameSync(tmp, destino);
}
function _colaVacia() {
  return {
    vehiculos: [], profesores: [], alumnos: [], practicas: [], tarifas: [], pagos: [], sucursales: [], reservas: [], cargos: [],
    deleted: { practicas: [], alumnos: [], vehiculos: [], profesores: [], tarifas: [], pagos: [], sucursales: [], reservas: [], cargos: [] },
    lastSync: '1970-01-01T00:00:00.000Z'
  };
}

// Cuentas con datos en este PC (la activa la primera), para ofrecerlas al
// iniciar sesión. Nunca incluye contraseñas.
function getCuentasGuardadas() {
  const lista = [];
  const activa = getLocalEmpresaOwner();
  if (activa && activa.empresaId) lista.push({ empresaId: activa.empresaId, email: activa.email || null, activa: true });
  let nombres = [];
  try { nombres = fs.readdirSync(getCuentasDir()); } catch { /* aún no hay ninguna guardada */ }
  for (const n of nombres) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(getCuentasDir(), n, 'cuenta.json'), 'utf-8'));
      if (c && c.empresaId && !lista.some(x => x.empresaId === c.empresaId)) {
        lista.push({ empresaId: c.empresaId, email: c.email || null, activa: false, guardado: c.guardado || null });
      }
    } catch { /* carpeta sin datos de cuenta: se ignora */ }
  }
  return lista;
}

// Cambios de este PC que aún no están en la nube (cola de pending_sync.json).
function contarPendientes() {
  const p = loadPending();
  let n = 0;
  for (const [k, v] of Object.entries(p)) if (k !== 'deleted' && Array.isArray(v)) n += v.length;
  for (const v of Object.values(p.deleted || {})) if (Array.isArray(v)) n += v.length;
  return n;
}

// Resuelve el conflicto de cuenta cambiando de datos (en lugar de vaciarlos).
// `ajustesLocales`: ajustes de este PC que son de la cuenta y viven en el
// navegador (datos del centro para la ficha DGT, precios...): se guardan con
// la cuenta anterior y se devuelven los que tuviera guardados la nueva (null
// si nunca entró aquí: se quedan los actuales).
async function cambiarDatosDeCuenta(ajustesLocales) {
  if (!_empresaId || !_conflictoEmpresa) return { ok: false, reason: 'No hay ningún cambio de cuenta pendiente.' };
  // Ninguna sincronización a medias (las de ahora no tocan nada, por el conflicto)
  while (_syncPromesa) { try { await _syncPromesa; } catch { /* da igual cómo acabó */ } }
  if (!_empresaId || !_conflictoEmpresa) return { ok: false, reason: 'La sesión cambió mientras tanto. Vuelve a intentarlo.' };

  const userData = app.getPath('userData');
  const anterior = getLocalEmpresaOwner() || {};
  const nueva = { empresaId: _empresaId, email: _creds ? _creds.email : null };
  try {
    try { require('./db').crearBackup(); } catch { /* la copia es un extra */ }
    const { data: actuales } = loadDataSafe();
    const seqAnterior = { ...(actuales._seq || {}) };

    // 1) Guardar los datos de la cuenta anterior (salvo si ya se guardaron en
    //    un intento que se quedó a medias: lo activo podría ser ya de la nueva)
    const marca = _leerMarcaCambio();
    if (anterior.empresaId && !(marca && marca.de === anterior.empresaId)) {
      const dir = _dirCuenta(anterior.empresaId);
      fs.mkdirSync(dir, { recursive: true });
      for (const f of ARCHIVOS_CUENTA) {
        const origen = path.join(userData, f);
        if (fs.existsSync(origen)) _copiarAtomico(origen, path.join(dir, f));
      }
      fs.writeFileSync(path.join(dir, 'ajustes_locales.json'), JSON.stringify(ajustesLocales && typeof ajustesLocales === 'object' ? ajustesLocales : {}), 'utf-8');
      fs.writeFileSync(path.join(dir, 'cuenta.json'), JSON.stringify({ empresaId: anterior.empresaId, email: anterior.email || null, guardado: new Date().toISOString() }), 'utf-8');
      fs.writeFileSync(_rutaMarcaCambio(), JSON.stringify({ de: anterior.empresaId, a: nueva.empresaId }), 'utf-8');
    }

    // 2) Traer los de la cuenta nueva, o empezar vacío y bajarlo todo
    const dirNueva = _dirCuenta(nueva.empresaId);
    const guardados = fs.existsSync(path.join(dirNueva, 'data.json'));
    if (guardados) {
      _copiarAtomico(path.join(dirNueva, 'data.json'), getDataPath());
      if (fs.existsSync(path.join(dirNueva, 'pending_sync.json'))) _copiarAtomico(path.join(dirNueva, 'pending_sync.json'), getPendingPath());
      else savePending(_colaVacia());
    } else {
      saveData({ vehiculos: [], profesores: [], alumnos: [], practicas: [], tarifas: [], pagos: [], sucursales: [], reservas: [], cargos: [], logs: [], _seq: seqAnterior });
      savePending(_colaVacia());
    }
    // 3) Este PC nunca repite un id entre sus cuentas: la clave primaria de la
    //    nube es global y la segunda en subirlo no podría (RLS de la otra empresa).
    const { data } = loadDataSafe();
    for (const [k, v] of Object.entries(seqAnterior)) {
      if (typeof v === 'number' && v < ID_WEB_MIN && !(data._seq[k] >= v)) data._seq[k] = v;
    }
    saveData(data);
    let ajustesNueva = null;
    try { ajustesNueva = JSON.parse(fs.readFileSync(path.join(dirNueva, 'ajustes_locales.json'), 'utf-8')); } catch { /* nunca entró aquí */ }

    // 4) La nueva ya es la dueña de los datos activos
    _guardarLocalEmpresaOwner(nueva.empresaId, nueva.email);
    try { fs.unlinkSync(_rutaMarcaCambio()); } catch { /* no había marca */ }
    _conflictoEmpresa = null;
    try { require('./db')._clearCache(); } catch {}
    try { require('./db').addLog('cuenta', `Cambio de cuenta en este PC: ${nueva.email || 'cuenta nueva'}${anterior.email ? ` (los datos de ${anterior.email} quedan guardados aquí)` : ''}`, []); } catch {}

    // 5) Subir lo pendiente de esta cuenta y bajar lo nuevo de la nube
    const res = await sync();
    return {
      ok: true, nueva: !guardados, email: nueva.email, emailAnterior: anterior.email || null,
      ajustesLocales: ajustesNueva, sync: { ok: !!(res && res.ok), reason: (res && res.reason) || null }
    };
  } catch (e) {
    return { ok: false, reason: 'No se pudieron cambiar los datos de cuenta: ' + e.message };
  }
}

// ─── PENDING QUEUE ────────────────────────────────────────────────────────────

function loadPending() {
  const p = getPendingPath();
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
  }
  return {
    vehiculos: [], profesores: [], alumnos: [], practicas: [], tarifas: [], pagos: [], sucursales: [], reservas: [], cargos: [],
    deleted: { practicas: [], alumnos: [], vehiculos: [], profesores: [], tarifas: [], pagos: [], sucursales: [], reservas: [], cargos: [] },
    lastSync: '1970-01-01T00:00:00.000Z'
  };
}

function savePending(pending) {
  fs.writeFileSync(getPendingPath(), JSON.stringify(pending, null, 2), 'utf-8');
}

// Marcar muchos registros de una vez (importar, deshacer, borrar en bloque...):
// una sola lectura y escritura de la cola. De uno en uno se reescribía
// pending_sync.json entero por cada registro (y se avisaba a la ventana otras
// tantas veces): con miles de filas la app se quedaba congelada.
function markDirtyVarios(table, ids) {
  const lista = [...(ids || [])];
  if (!lista.length) return;
  const p = loadPending();
  // Defensa: un pending_sync.json de una versión anterior puede no traer la
  // clave de una tabla nueva (p.ej. "profesores" en instalaciones ya en uso).
  if (!p[table]) p[table] = [];
  const ya = new Set(p[table]);
  for (const id of lista) {
    if (!ya.has(id)) { p[table].push(id); ya.add(id); }
    if (_remarcados) _remarcados.add(table + ':' + id);
  }
  savePending(p);
  setStatus(STATUS.PENDING);
  programarSyncInmediato();
}

function markDeletedVarios(table, ids) {
  const lista = [...(ids || [])];
  if (!lista.length) return;
  const p = loadPending();
  if (!p.deleted) p.deleted = {};
  if (!p.deleted[table]) p.deleted[table] = [];
  const ya = new Set(p.deleted[table]);
  for (const id of lista) {
    if (!ya.has(id)) { p.deleted[table].push(id); ya.add(id); }
    if (_remarcados) _remarcados.add(table + ':' + id);
  }
  // Quitar de dirty si estaban
  const borrados = new Set(lista);
  p[table] = (p[table] || []).filter(x => !borrados.has(x));
  savePending(p);
  setStatus(STATUS.PENDING);
  programarSyncInmediato();
}

// Anula borrados que aún no han llegado a la nube (deshacer una fusión de
// alumnos antes del siguiente sync): si no, el borrado pendiente ganaría a la
// subida del registro recuperado.
function desmarcarBorradosVarios(table, ids) {
  const lista = new Set([...(ids || [])]);
  if (!lista.size) return;
  const p = loadPending();
  if (!p.deleted || !p.deleted[table]) return;
  p.deleted[table] = p.deleted[table].filter(x => !lista.has(x));
  savePending(p);
}

function markDirty(table, id) { markDirtyVarios(table, [id]); }
function markDeleted(table, id) { markDeletedVarios(table, [id]); }

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
  { tabla: 'reservas',   seq: 'r'  },
  { tabla: 'cargos',     seq: 'cargo' }
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
    const { data: remotos, error } = await _traerTodo(() => _conEmpresa(sb.from(tabla).select('id')).order('id'));
    if (error || !remotos || !remotos.length) continue;

    const remoteIds = new Set(remotos.map(r => r.id));
    const maxRemoto = remotos.reduce((m, r) => (r.id < ID_WEB_MIN ? Math.max(m, r.id || 0) : m), 0);
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
    data.cargos.forEach(c => { if (c.alumno_id != null && remaps.alumnos.has(c.alumno_id)) c.alumno_id = remaps.alumnos.get(c.alumno_id); });
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

// ─── BAJADA POR PÁGINAS ───────────────────────────────────────────────────────
// PostgREST devuelve como mucho TAM_PAGINA filas por consulta. Sin paginar, un
// PC nuevo (o un sync tras días sin conexión) se quedaba con las 1.000 primeras
// y lastSync avanzaba igual: el resto no se bajaba nunca. `construir` devuelve
// una consulta nueva cada vez (una consulta de supabase-js no se reutiliza).
async function _traerTodo(construir) {
  const filas = [];
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await construir().range(desde, desde + TAM_PAGINA - 1);
    if (error) return { data: null, error };
    const lote = data || [];
    filas.push(...lote);
    if (lote.length < TAM_PAGINA) return { data: filas, error: null };
  }
}

// ─── PETICIONES EN BLOQUE ─────────────────────────────────────────────────────
// Varias peticiones a la vez (como mucho `n`): con miles de filas, una detrás
// de otra se sumaba la espera de cada viaje a la nube. Si una lanza (fallo de
// red), no se empiezan más, se espera a las que ya iban y se relanza el error,
// igual que hacía el bucle de una en una.
async function _enParalelo(tareas, n = PETICIONES_A_LA_VEZ) {
  let i = 0, fallo = null;
  const trabajador = async () => {
    while (i < tareas.length && !fallo) {
      const tarea = tareas[i++];
      try { await tarea(); } catch (e) { if (!fallo) fallo = e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tareas.length) }, trabajador));
  if (fallo) throw fallo;
}

// Rechazo por permisos (RLS): repetirlo fila a fila daría lo mismo.
const _esSinPermiso = error => !!error && (error.code === '42501' || /row-level security|permission denied/i.test(error.message || ''));

// Borra en la nube (marca deleted, nunca DELETE) muchos ids: una petición por
// cada TAM_LOTE_IDS ids, varias a la vez. Antes iba una petición por id: 2.800
// alumnos de una importación deshecha tardaban unos 4 minutos. Si un bloque
// falla por otra cosa que permisos, se repite id a id para que solo se quede
// en la cola el que da error. `anotar(respuesta, id)` recibe el resultado.
async function _marcarBorradosEnNube(sb, tabla, ids, anotar, cuando) {
  const lista = [...new Set(ids || [])];
  const tareas = [];
  for (let i = 0; i < lista.length; i += TAM_LOTE_IDS) {
    const trozo = lista.slice(i, i + TAM_LOTE_IDS);
    tareas.push(async () => {
      const marca = { deleted: true, updated_at: cuando || new Date().toISOString() };
      if (trozo.length > 1) {
        const r = await sb.from(tabla).update(marca).in('id', trozo);
        if (!(r && r.error) || _esSinPermiso(r.error)) { for (const id of trozo) anotar(r, id); return; }
      }
      for (const id of trozo) anotar(await sb.from(tabla).update(marca).eq('id', id), id);
    });
  }
  await _enParalelo(tareas);
}

// ─── BAJADA EN DOS PASOS (tablas grandes) ─────────────────────────────────────
// Primero solo id/updated_at/deleted de lo cambiado (pocos bytes por fila) y
// después la fila entera solo de lo que de verdad hay que aplicar aquí. Se
// ahorra lo que este PC ya tiene igual o más nuevo (p. ej. lo que acaba de
// subir él mismo) y los borrados (basta el id; si aquí no existe, nada que
// hacer). Antes, tras importar o borrar miles de registros, cada sync de los
// 10 minutos siguientes (margen de lastSync) volvía a bajarlos enteros. Si hay
// que bajar mucho (PC nuevo, importación hecha en otro PC), se baja todo por
// páginas como siempre. `localDe(id)` = registro de este PC o undefined.
async function _traerCambios(sb, tabla, lastSync, localDe, ordenar = q => q.order('id', { ascending: true })) {
  const completo = () => _traerTodo(() => ordenar(_conEmpresa(sb.from(tabla).select('*').gt('updated_at', lastSync))));
  if (!lastSync || lastSync <= '1970-01-01T00:00:00.000Z') return completo();
  const { data: ligeras, error } = await _traerTodo(() => _conEmpresa(sb.from(tabla).select('id, updated_at, deleted').gt('updated_at', lastSync)).order('id', { ascending: true }));
  if (error || !ligeras) return completo();
  const filas = [];
  const faltan = [];
  for (const r of ligeras) {
    const local = localDe(r.id);
    if (r.deleted) { if (local) filas.push(r); continue; }
    if (local && String(r.updated_at || '') <= String(local.updated_at || '')) continue;
    faltan.push(r.id);
  }
  // Mucho que bajar: por páginas sale en menos peticiones que id a id.
  if (faltan.length > TAM_LOTE_IDS && faltan.length * 5 > ligeras.length) return completo();
  for (let i = 0; i < faltan.length; i += TAM_LOTE_IDS) {
    const { data, error: errFilas } = await _conEmpresa(sb.from(tabla).select('*').in('id', faltan.slice(i, i + TAM_LOTE_IDS)));
    if (errFilas) return { data: null, error: errFilas };
    filas.push(...(data || []));
  }
  return { data: filas, error: null };
}

// ─── VERIFICACIÓN DE INTEGRIDAD (autorreparación) ─────────────────────────────
// Red de seguridad para registros locales que nunca llegaron a la nube (p. ej.
// por el fallo, ya corregido, que vaciaba la cola aunque la subida hubiera
// fallado). Como mucho una vez al día compara los ids locales con los de la
// nube (solo la columna id) y vuelve a encolar los que falten. Nunca borra.
const _TABLAS_INTEGRIDAD = ['vehiculos', 'profesores', 'alumnos', 'practicas'];
async function _verificarIntegridad(sb, data, pending, ahora = Date.now()) {
  if (!_empresaId) return 0;
  const ultima = pending.ultimaVerificacion ? Date.parse(pending.ultimaVerificacion) : 0;
  if (ultima && ahora - ultima < 20 * 3600 * 1000) return 0;
  let reencolados = 0;
  for (const tabla of _TABLAS_INTEGRIDAD) {
    const locales = (data[tabla] || []).filter(r => r && !r.deleted);
    if (!locales.length) continue;
    const { data: remotos, error } = await _traerTodo(() => _conEmpresa(sb.from(tabla).select('id')).order('id'));
    if (error || !remotos) return reencolados; // sin respuesta fiable: no tocar nada
    const enNube = new Set(remotos.map(r => r.id));
    if (!pending[tabla]) pending[tabla] = [];
    const enCola = new Set([...pending[tabla], ...((pending.deleted && pending.deleted[tabla]) || [])]);
    for (const r of locales) {
      if (enNube.has(r.id) || enCola.has(r.id)) continue;
      pending[tabla].push(r.id);
      enCola.add(r.id);
      reencolados++;
    }
  }
  pending.ultimaVerificacion = new Date(ahora).toISOString();
  return reencolados;
}

// ─── FUSIÓN FINAL CON LO QUE HAYA EN DISCO ───────────────────────────────────
// sync() modifica una copia de data.json cargada al empezar. Si mientras tanto
// la app guardó cambios (el usuario siguió trabajando), guardar esa copia tal
// cual los borraría. Antes de guardar se relee el disco y se respetan: los
// registros marcados durante el sync (_remarcados), las tablas que el sync no
// toca (jornadas, bonos...), los logs nuevos y el contador de ids más alto.
const _TABLAS_SYNC = ['vehiculos', 'profesores', 'tarifas', 'alumnos', 'practicas', 'pagos', 'sucursales', 'reservas', 'cargos'];
function _fusionarConDisco(data) {
  const { data: disco } = loadDataSafe();
  const remarcado = (t, id) => !!_remarcados && _remarcados.has(t + ':' + id);
  for (const clave of Object.keys(disco)) {
    if (_TABLAS_SYNC.includes(clave)) {
      const lista = Array.isArray(data[clave]) ? data[clave] : [];
      const idxPorId = new Map(lista.map((r, i) => [r.id, i]));
      const enDisco = new Set();
      for (const r of disco[clave]) {
        enDisco.add(r.id);
        if (!remarcado(clave, r.id)) continue;
        if (idxPorId.has(r.id)) lista[idxPorId.get(r.id)] = r; else lista.push(r);
      }
      // Quitado del disco y marcado durante el sync = borrado en local: fuera.
      data[clave] = lista.filter(r => enDisco.has(r.id) || !remarcado(clave, r.id));
    } else if (clave === '_seq') {
      for (const [k, v] of Object.entries(disco._seq || {})) {
        if (!(data._seq[k] >= v)) data._seq[k] = v;
      }
    } else if (clave === 'logs') {
      const ids = new Set((data.logs || []).map(l => l.id));
      const nuevos = (disco.logs || []).filter(l => !ids.has(l.id));
      if (nuevos.length) {
        data.logs = [...nuevos, ...(data.logs || [])]
          .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
          .slice(0, 500);
      }
    } else if (clave === 'ajustes_empresa') {
      const aj = data.ajustes_empresa || (data.ajustes_empresa = {});
      for (const [k, v] of Object.entries(disco.ajustes_empresa || {})) {
        if (remarcado('ajustes_empresa', k) || !aj[k]) aj[k] = v;
      }
    } else {
      data[clave] = disco[clave]; // tablas solo locales: el sync no las toca, manda el disco
    }
  }
}

// Una sola sincronización a la vez: si ya hay una en marcha (auto-sync, botón
// "Sincronizar", sync inmediato), la segunda llamada espera a esa misma. Lo
// que se marque mientras tanto queda en la cola y lo recoge el siguiente sync.
async function sync() {
  if (_syncPromesa) return _syncPromesa;
  _remarcados = new Set();
  _syncPromesa = _syncInterno().finally(() => { _syncPromesa = null; _remarcados = null; });
  return _syncPromesa;
}

async function _syncInterno() {
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
    const inicioSync = Date.now();
    const { data, regenerado } = loadDataSafe();
    const pending = loadPending();
    // Si data.json no existía o estaba dañado, forzar descarga completa
    if (regenerado) pending.lastSync = '1970-01-01T00:00:00.000Z';

    // Resultado de cada subida. supabase-js NO lanza ante un error (RLS, clave
    // foránea, sesión caducada...): lo devuelve en { error }. Antes se ignoraba
    // y la cola se vaciaba igual → registros que nunca llegaban a la nube, sin
    // aviso. Ahora solo sale de la cola lo que la nube confirma.
    const hechos = {};     // tabla → Set de ids subidos (o que ya no existen en local)
    const hechosDel = {};  // tabla → Set de ids cuyo borrado se subió
    const erroresSubida = [];
    const hecho = (t, id) => { (hechos[t] || (hechos[t] = new Set())).add(id); };
    const subidaOk = (res, t, id, del = false) => {
      if (res && res.error) {
        // Un empleado sin acceso a pagos/cargos (RLS de jefe): no se reintenta
        // (lo subirá el jefe), igual que antes.
        const sinPermiso = (t === 'pagos' || t === 'cargos') && _esSinPermiso(res.error);
        if (!sinPermiso) { erroresSubida.push(`${t} ${id}: ${res.error.message || res.error.code || 'error'}`); return false; }
      }
      if (del) (hechosDel[t] || (hechosDel[t] = new Set())).add(id); else hecho(t, id);
      return true;
    };
    const sb = await ensureClient();
    if (!sb) { _lastError = _authError || 'Credenciales de sincronización inválidas'; setStatus(STATUS.ERROR); return { ok: false, reason: _lastError }; }

    // Subida por lotes de alumnos y prácticas: tras traer los datos de otro
    // programa puede haber cientos o miles pendientes, y de uno en uno tardaban
    // muchos minutos en llegar al móvil. Solo se juntan filas con exactamente
    // las mismas columnas (en un upsert en lote, la columna que falta en una
    // fila se pondría a NULL, y aquí «no venir» significa «no tocar», p. ej. la
    // firma). Si un lote falla, se repite fila a fila: solo se queda en la cola
    // la que da error, como antes. Varios lotes viajan a la vez.
    // Cada fila es [id, payload, registroLocal]: al confirmarse la subida, el
    // registro local se queda con el mismo updated_at que la nube, y la bajada
    // lo reconoce como propio en vez de volver a descargarlo y reescribirlo.
    const subirEnLotes = async (tabla, filas) => {
      const confirmar = ([id, payload, local]) => {
        hecho(tabla, id);
        if (local) {
          local.updated_at = payload.updated_at; marcasLocales = true;
          // La firma ya se borró en la nube: la marca no debe quedarse y borrar una firma nueva hecha después en el móvil
          if (tabla === 'practicas' && local.firma_borrar && payload.firma === null) delete local.firma_borrar;
        }
      };
      const grupos = new Map();
      for (const f of filas) {
        const k = Object.keys(f[1]).sort().join(',');
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(f);
      }
      const tareas = [];
      for (const grupo of grupos.values()) {
        for (let i = 0; i < grupo.length; i += TAM_LOTE_SUBIDA) {
          const trozo = grupo.slice(i, i + TAM_LOTE_SUBIDA);
          tareas.push(async () => {
            if (trozo.length > 1) {
              const r = await sb.from(tabla).upsert(trozo.map(f => f[1]), { onConflict: 'id' });
              if (r && !r.error) { trozo.forEach(confirmar); return; }
            }
            for (const f of trozo) {
              let r = await sb.from(tabla).upsert(f[1], { onConflict: 'id' });
              // Nube aún sin la migración que admite ¼ ½ ¾ en «clases ya hechas»
              // (columna entera): se sube redondeado antes que dejarlo atascado
              if (r && r.error && tabla === 'alumnos' && f[1].clases_previas % 1 && /integer/i.test(r.error.message || '')) {
                f[1] = { ...f[1], clases_previas: Math.round(f[1].clases_previas) };
                r = await sb.from(tabla).upsert(f[1], { onConflict: 'id' });
              }
              if (subidaOk(r, tabla, f[0]) && !(r && r.error)) confirmar(f);
            }
          });
        }
      }
      await _enParalelo(tareas);
    };
    // Borrados en bloque (ver _marcarBorradosEnNube).
    const borrarEnNube = (tabla, ids) => _marcarBorradosEnNube(sb, tabla, ids, (r, id) => subidaOk(r, tabla, id, true));

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
    // Cargos y descuentos (tarea D2 del PLAN-MAESTRO — ver comentario junto a
    // _cargosDisponible): mismo patrón que reservasOn, si la migración no
    // está aplicada la tabla `cargos` ni se sube ni se baja, sin errores ni
    // reintentos atascados.
    const cargosOn = await _cargosDisponible(sb);
    // Email de alumno (Bloque 2 SaaS, portal del alumno — ver comentario junto
    // a _alumnosEmailDisponible): mismo patrón que sucursalesOn, si la
    // migración no está aplicada la columna `email` no se estampa en el
    // payload de subida de alumnos, comportamiento idéntico al de antes.
    const emailOn = await _alumnosEmailDisponible(sb);
    // Datos ampliados de alumno (teléfono, DNI, fecha de nacimiento, dirección,
    // fecha de alta, observaciones — ver comentario junto a
    // _alumnosDatosDisponible): mismo patrón que emailOn, si la migración no
    // está aplicada esas 6 columnas no se estampan en el payload de subida.
    const datosOn = await _alumnosDatosDisponible(sb);
    // Libro de registro de alumnos (RD 1295/2003 art. 39) — ver comentario
    // junto a _alumnosLibroDisponible: mismo patrón que datosOn, si la
    // migración no está aplicada esas 5 columnas no se estampan en el payload.
    const libroOn = await _alumnosLibroDisponible(sb);
    // Permisos múltiples del alumno (tarea B1 del PLAN-MAESTRO) — ver
    // comentario junto a _alumnosPermisosDisponible: mismo patrón que
    // libroOn, si la migración no está aplicada la columna `permisos` no se
    // estampa en el payload de subida de alumnos.
    const permisosOn = await _alumnosPermisosDisponible(sb);
    // Forma de pago y empleado de caja (tarea D1 del PLAN-MAESTRO, arqueo) —
    // ver comentario junto a _pagosCamposDisponible: mismo patrón que
    // permisosOn, si la migración no está aplicada esas 2 columnas no se
    // estampan en el payload de subida de pagos.
    const pagosCamposOn = await _pagosCamposDisponible(sb);
    // DNI de profesor (tarea "Ficha alumno – formación práctica" DGT) — ver
    // comentario junto a _profesoresDniDisponible: mismo patrón que
    // pagosCamposOn, si la migración no está aplicada la columna `dni` no se
    // estampa en el payload de subida de profesores.
    const profesoresDniOn = await _profesoresDniDisponible(sb);
    // Ficha DGT del alumno (primer_apellido/segundo_apellido/codigo_postal/
    // poblacion) — ver comentario junto a _alumnosFichaDgtDisponible: mismo
    // patrón que profesoresDniOn, si la migración no está aplicada esas 4
    // columnas no se estampan en el payload de subida de alumnos.
    const fichaDgtOn = await _alumnosFichaDgtDisponible(sb);
    // Hora de inicio de práctica — ver comentario junto a
    // _practicasHoraInicioDisponible: mismo patrón que fichaDgtOn, si la
    // migración no está aplicada la columna `hora_inicio` no se estampa en
    // el payload de subida de prácticas.
    const horaInicioOn = await _practicasHoraInicioDisponible(sb);
    // Columnas del flujo móvil (firma, trabajado, tipo_detalle, hora_fin): ver _practicasMovilDisponible.
    const movilOn = await _practicasMovilDisponible(sb);
    // Migración 2026-10-01: zonas recorridas, punto de partida del alumno y
    // ajustes compartidos con la web (la tabla necesita empresa: sin sesión no).
    const zonasOn = await _practicasZonasDisponible(sb);
    const previasOn = await _alumnosPreviasDisponible(sb);
    const ajustesOn = _empresaId ? await _ajustesEmpresaDisponible(sb) : false;
    const firmaProfOn = await _profesoresFirmaDisponible(sb);
    const fraccionOn = await _practicasFraccionDisponible(sb);
    const extraOn = await _extraTablas(sb);
    // Marcas locales que cambian al subir (firma_pendiente): hay que guardar data.json.
    let marcasLocales = false;
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

    // Lo próximo que se cree en este PC, por encima del mayor id de la nube de
    // todas las cuentas (ver _avanzarSeqGlobal).
    if (await _avanzarSeqGlobal(sb, data)) marcasLocales = true;

    // Autorreparación: vuelve a encolar lo que exista en local y falte en la
    // nube (ver _verificarIntegridad). Se sube en este mismo sync.
    try {
      const reencolados = await _verificarIntegridad(sb, data, pending);
      if (reencolados) console.log(`Sync: ${reencolados} registro(s) locales que faltaban en la nube vuelven a la cola de subida.`);
    } catch (e) {
      console.error('Sync: no se pudo verificar la integridad:', e.message);
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
        if (!v) { hecho('vehiculos', id); continue; }
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
          if (extraOn.vehiculos) _ponerExtra('vehiculos', payload, v);
          // v.id: la reconciliación por matrícula puede haberle dado el id remoto.
          if (subidaOk(await sb.from('vehiculos').upsert(payload, { onConflict: 'id' }), 'vehiculos', v.id)) hecho('vehiculos', id);
        }
      }
    } catch (e) {
      console.error('Sync: no se pudieron subir vehículos (error de red o del servidor):', e.message);
    }

    // Profesores dirty
    try {
      for (const id of (pending.profesores || [])) {
        const pr = data.profesores.find(x => x.id === id);
        if (!pr) { hecho('profesores', id); continue; }
        if (pr) {
          const payload = {
            id: pr.id, nombre: pr.nombre, nota: pr.nota || '',
            deleted: false, updated_at: new Date().toISOString()
          };
          if (_empresaId) payload.empresa_id = _empresaId;
          if (sucursalesOn) payload.sucursal_id = pr.sucursal_id != null ? pr.sucursal_id : null;
          if (profesoresDniOn) payload.dni = pr.dni || null;
          if (extraOn.profesores) _ponerExtra('profesores', payload, pr);
          // La firma solo viaja cuando se cambió en este PC (firma_pendiente):
          // así editar el nombre aquí nunca pisa una firma hecha en el móvil.
          const conFirma = firmaProfOn && pr.firma_pendiente;
          if (conFirma) payload.firma = pr.firma || null;
          if (subidaOk(await sb.from('profesores').upsert(payload, { onConflict: 'id' }), 'profesores', id) && conFirma) {
            delete pr.firma_pendiente;
            marcasLocales = true;
          }
        }
      }
    } catch (e) {
      console.error('Sync: no se pudieron subir profesores (error de red o del servidor):', e.message);
    }

    // Tarifas dirty
    for (const id of (pending.tarifas || [])) {
      const t = data.tarifas.find(x => x.id === id);
      if (!t) { hecho('tarifas', id); continue; }
      if (t) {
        const payload = {
          id: t.id, permiso: t.permiso, tipo: t.tipo, precio: t.precio || 0,
          deleted: false, updated_at: new Date().toISOString()
        };
        if (_empresaId) payload.empresa_id = _empresaId;
        subidaOk(await sb.from('tarifas').upsert(payload, { onConflict: 'id' }), 'tarifas', id);
      }
    }

    // Búsqueda por id sin recorrer la lista entera por cada pendiente (con miles
    // de registros pendientes eran millones de comparaciones con la app parada).
    const porId = tabla => new Map((data[tabla] || []).map(r => [r.id, r]));

    // Alumnos dirty (se suben por lotes al final del bucle)
    try {
      const loteAlumnos = [];
      const alumnosPorId = porId('alumnos');
      for (const id of pending.alumnos) {
        const a = alumnosPorId.get(id);
        if (!a) { hecho('alumnos', id); continue; }
        if (a) {
          const payload = {
            id: a.id, nombre: a.nombre, permiso: a.permiso,
            vehiculo_id: a.vehiculo_id, profesor_id: a.profesor_id || null,
            deleted: false, updated_at: new Date().toISOString()
          };
          if (_empresaId) payload.empresa_id = _empresaId;
          if (sucursalesOn) payload.sucursal_id = a.sucursal_id != null ? a.sucursal_id : null;
          if (emailOn) payload.email = a.email ? a.email : null;
          if (datosOn) {
            payload.telefono = a.telefono || null;
            payload.dni = a.dni || null;
            payload.fecha_nacimiento = a.fecha_nacimiento || null;
            payload.direccion = a.direccion || null;
            payload.fecha_alta = a.fecha_alta || null;
            payload.observaciones = a.observaciones || null;
            payload.estado = a.estado || null;
          }
          if (libroOn) {
            payload.n_inscripcion = a.n_inscripcion != null ? a.n_inscripcion : null;
            payload.permisos_posee = a.permisos_posee || null;
            payload.fecha_inicio = a.fecha_inicio || null;
            payload.fecha_fin = a.fecha_fin || null;
            payload.resultado = a.resultado || null;
          }
          if (permisosOn) payload.permisos = JSON.stringify(a.permisos || []);
          if (fichaDgtOn) {
            payload.primer_apellido = a.primer_apellido || null;
            payload.segundo_apellido = a.segundo_apellido || null;
            payload.codigo_postal = a.codigo_postal || null;
            payload.poblacion = a.poblacion || null;
          }
          if (previasOn) {
            // De ¼ en ¼ (12 ½ clases ya hechas): columna numeric desde la migración 2026-10-06
            payload.clases_previas = a.clases_previas > 0 ? Math.round(a.clases_previas * 4) / 4 : null;
            payload.km_previos = a.km_previos > 0 ? Math.round(a.km_previos) : null;
          }
          if (extraOn.alumnos) _ponerExtra('alumnos', payload, a);
          loteAlumnos.push([id, payload, a]);
        }
      }
      await subirEnLotes('alumnos', loteAlumnos);
    } catch (e) {
      console.error('Sync: no se pudieron subir alumnos (error de red o del servidor):', e.message);
    }

    // Prácticas dirty (se suben por lotes al final del bucle)
    try {
      const lotePracticas = [];
      const practicasPorId = porId('practicas');
      for (const id of pending.practicas) {
        const p = practicasPorId.get(id);
        if (!p) { hecho('practicas', id); continue; }
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
          if (horaInicioOn) payload.hora_inicio = p.hora_inicio || null;
          // Datos que nacen en el móvil (firma, lo trabajado, zonas...): solo se
          // suben si este PC los tiene. Mandar null borraría en la nube, p. ej.,
          // una firma hecha después de que este PC bajara la práctica.
          if (movilOn) {
            // Alumno anonimizado (derecho de supresión): su firma se borra también en la nube
            if (p.firma_borrar) payload.firma = null;
            else if (p.firma) payload.firma = p.firma;
            if (Array.isArray(p.trabajado)) payload.trabajado = p.trabajado;
            if (p.tipo_detalle) payload.tipo_detalle = p.tipo_detalle;
            if (p.hora_fin) payload.hora_fin = p.hora_fin;
          }
          if (zonasOn && Array.isArray(p.zonas)) payload.zonas = p.zonas;
          if (fraccionOn) payload.fraccion = p.fraccion > 0 && p.fraccion < 1 ? p.fraccion : null;
          lotePracticas.push([id, payload, p]);
        }
      }
      await subirEnLotes('practicas', lotePracticas);
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
    // Por lotes, como alumnos y prácticas (una importación puede traer miles).
    try {
      const lotePagos = [];
      const pagosPorId = porId('pagos');
      for (const id of (pending.pagos || [])) {
        const pg = pagosPorId.get(id);
        if (!pg) { hecho('pagos', id); continue; }
        const payload = {
          id: pg.id, alumno_id: pg.alumno_id, fecha: pg.fecha,
          cantidad: pg.cantidad || 0, nota: pg.nota || '',
          deleted: false, updated_at: new Date().toISOString()
        };
        if (_empresaId) payload.empresa_id = _empresaId;
        if (sucursalesOn) payload.sucursal_id = pg.sucursal_id != null ? pg.sucursal_id : null;
        if (pagosCamposOn) { payload.forma_pago = pg.forma_pago || null; payload.empleado = pg.empleado || null; }
        lotePagos.push([id, payload, pg]);
      }
      await subirEnLotes('pagos', lotePagos);
    } catch (e) {
      console.error('Sync: no se pudo subir pagos (permiso denegado o error de red):', e.message);
      // Empleado sin acceso a pagos: no se reintenta (lo subirá el jefe).
      if (/permission denied|row-level security/i.test(e.message || '')) {
        for (const id of (pending.pagos || [])) hecho('pagos', id);
      }
    }

    // Sucursales dirty. Solo se procesa si la migración está aplicada
    // (sucursalesOn): sin ella la tabla no existe y no hay nada que subir —
    // la cola pending.sucursales se queda tal cual, sin vaciarse ni fallar,
    // hasta que la migración esté aplicada de verdad.
    if (sucursalesOn) {
      for (const id of (pending.sucursales || [])) {
        const suc = data.sucursales.find(x => x.id === id);
        if (!suc) { hecho('sucursales', id); continue; }
        if (suc) {
          const payload = {
            id: suc.id, nombre: suc.nombre, activa: suc.activa !== false,
            deleted: false, updated_at: new Date().toISOString()
          };
          if (_empresaId) payload.empresa_id = _empresaId;
          subidaOk(await sb.from('sucursales').upsert(payload, { onConflict: 'id' }), 'sucursales', id);
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
        if (!r) { hecho('reservas', id); continue; }
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
          subidaOk(await sb.from('reservas').upsert(payload, { onConflict: 'id' }), 'reservas', id);
        }
      }
    }

    // Cargos y descuentos dirty (tarea D2). Solo se procesa si la migración
    // está aplicada (cargosOn): sin ella la tabla no existe y no hay nada
    // que subir — la cola pending.cargos se queda tal cual, sin vaciarse ni
    // fallar, hasta que la migración esté aplicada de verdad. Se sube
    // después de alumnos (más arriba) para que un cargo nuevo nunca llegue
    // antes que el alumno al que pertenece.
    if (cargosOn) {
      const loteCargos = [];
      const cargosPorId = porId('cargos');
      for (const id of (pending.cargos || [])) {
        const c = cargosPorId.get(id);
        if (!c) { hecho('cargos', id); continue; }
        const payload = {
          id: c.id, alumno_id: c.alumno_id || null, concepto: c.concepto || '',
          tipo: c.tipo, importe: c.importe || 0, fecha: c.fecha || null, nota: c.nota || '',
          deleted: !!c.deleted, updated_at: new Date().toISOString()
        };
        if (_empresaId) payload.empresa_id = _empresaId;
        if (sucursalesOn) payload.sucursal_id = c.sucursal_id != null ? c.sucursal_id : null;
        loteCargos.push([id, payload, c]);
      }
      await subirEnLotes('cargos', loteCargos);
    }

    // Ajustes compartidos con la web (p. ej. zonas de prácticas): la "id" en la
    // cola es la clave del ajuste. Sin la tabla o sin sesión se quedan en cola.
    if (ajustesOn) {
      for (const clave of (pending.ajustes_empresa || [])) {
        const aj = (data.ajustes_empresa || {})[clave];
        if (!aj) { hecho('ajustes_empresa', clave); continue; }
        subidaOk(await sb.from('ajustes_empresa').upsert({
          empresa_id: _empresaId, clave, valor: aj.valor, updated_at: aj.updated_at || new Date().toISOString()
        }, { onConflict: 'empresa_id,clave' }), 'ajustes_empresa', clave);
      }
    }

    // Eliminaciones — todas por soft delete (marca deleted). Borrar de verdad
    // un alumno falla en Supabase si tiene prácticas (clave foránea) y además
    // sin la marca los otros dispositivos nunca se enteran del borrado.
    // En bloques de ids (ver _marcarBorradosEnNube), prácticas antes que alumnos.
    await borrarEnNube('practicas', pending.deleted.practicas);
    await borrarEnNube('alumnos', pending.deleted.alumnos);
    await borrarEnNube('vehiculos', pending.deleted.vehiculos);
    await borrarEnNube('profesores', pending.deleted.profesores);
    await borrarEnNube('tarifas', pending.deleted.tarifas);
    try {
      await borrarEnNube('pagos', pending.deleted.pagos);
    } catch (e) {
      console.error('Sync: no se pudo borrar pagos en la nube (permiso denegado o error de red):', e.message);
    }
    if (sucursalesOn) await borrarEnNube('sucursales', pending.deleted.sucursales);
    if (reservasOn) await borrarEnNube('reservas', pending.deleted.reservas);
    if (cargosOn) await borrarEnNube('cargos', pending.deleted.cargos);

    // ── 2. BAJAR CAMBIOS REMOTOS (del móvil / del otro PC) ───────────────────
    // Orden importante: vehiculos → profesores → tarifas → alumnos → practicas → pagos,
    // para que un PC vacío pueda reconstruir todo en una sola pasada (las prácticas se
    // descartan si su alumno o vehículo no existe aún localmente; tarifas y pagos no
    // dependen de nada más y se aplican directamente).

    const lastSync = pending.lastSync || '1970-01-01T00:00:00.000Z';
    let pulled = 0;
    let practicasTraidas = 0; // las que llegaron nuevas o cambiadas (clases del móvil, del otro PC)
    let dataChanged = false;

    // Con sesión autenticada, cada bajada se filtra por empresa_id (uid de la
    // sesión) para no traer datos de otra empresa. En modo legado (_empresaId
    // null) no se añade filtro, igual que antes.
    const conEmpresa = _conEmpresa;

    // Vehículos nuevos o modificados
    const { data: remoteVehiculos, error: errV } = await _traerTodo(() => conEmpresa(sb
      .from('vehiculos')
      .select('*')
      .gt('updated_at', lastSync))
      .order('id', { ascending: true }));

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
          data.vehiculos.push(_traerExtra('vehiculos', {
            id: rv.id, nombre: rv.nombre, matricula: rv.matricula || '',
            km_actual: parseFloat(rv.km_actual) || 0,
            sucursal_id: rv.sucursal_id != null ? rv.sucursal_id : null,
            updated_at: rv.updated_at
          }, rv, null));
          _avanzarSeq(data, 'v', rv.id);
          dataChanged = true;
          pulled++;
        } else {
          const localUpdated  = data.vehiculos[idx].updated_at || '1970-01-01T00:00:00.000Z';
          const remoteUpdated = rv.updated_at || '1970-01-01T00:00:00.000Z';
          if (remoteUpdated > localUpdated) {
            const nuevo = _traerExtra('vehiculos', {
              nombre: rv.nombre, matricula: rv.matricula || '',
              km_actual: parseFloat(rv.km_actual) || 0,
              sucursal_id: rv.sucursal_id != null ? rv.sucursal_id : null
            }, rv, data.vehiculos[idx]);
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
    const { data: remoteProfesores, error: errPf } = await _traerTodo(() => conEmpresa(sb
      .from('profesores')
      .select('*')
      .gt('updated_at', lastSync))
      .order('id', { ascending: true }));

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
          data.profesores.push(_traerExtra('profesores', {
            id: rp.id, nombre: rp.nombre, nota: rp.nota || '',
            sucursal_id: rp.sucursal_id != null ? rp.sucursal_id : null,
            dni: rp.dni != null ? rp.dni : null,
            firma: typeof rp.firma === 'string' ? rp.firma : null,
            updated_at: rp.updated_at
          }, rp, null));
          _avanzarSeq(data, 'pf', rp.id);
          dataChanged = true;
          pulled++;
        } else {
          const localUpdated  = data.profesores[idx].updated_at || '1970-01-01T00:00:00.000Z';
          const remoteUpdated = rp.updated_at || '1970-01-01T00:00:00.000Z';
          if (remoteUpdated > localUpdated) {
            const nuevo = _traerExtra('profesores', { nombre: rp.nombre, nota: rp.nota || '', sucursal_id: rp.sucursal_id != null ? rp.sucursal_id : null, dni: rp.dni != null ? rp.dni : null }, rp, data.profesores[idx]);
            _detectarYRegistrarConflicto(data, 'profesores', pending.profesores,
              rp.id, ['nombre', 'nota', 'dni'], data.profesores[idx], nuevo, conflictos);
            // Firma: manda la nube, salvo que aquí haya una cambiada sin subir aún.
            if ('firma' in rp && !data.profesores[idx].firma_pendiente) nuevo.firma = typeof rp.firma === 'string' ? rp.firma : null;
            Object.assign(data.profesores[idx], nuevo, { updated_at: rp.updated_at });
            dataChanged = true;
            pulled++;
          }
        }
      }
    }

    // Tarifas nuevas o modificadas
    const { data: remoteTarifas, error: errT } = await _traerTodo(() => conEmpresa(sb
      .from('tarifas')
      .select('*')
      .gt('updated_at', lastSync))
      .order('id', { ascending: true }));

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
          _avanzarSeq(data, 't', rt.id);
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

    // Posición de cada registro local por id: buscar con findIndex por cada fila
    // que llega eran millones de comparaciones tras una importación grande.
    const posiciones = lista => new Map(lista.map((r, i) => [r.id, i]));

    // Alumnos nuevos o modificados desde el móvil / otro PC
    const posAlumnos = posiciones(data.alumnos);
    const { data: remoteAlumnos, error: errA } = await _traerCambios(sb, 'alumnos', lastSync,
      id => data.alumnos[posAlumnos.get(id)]);

    if (!errA && remoteAlumnos) {
      const alumnosFuera = new Set();
      for (const ra of remoteAlumnos) {
        const idx = posAlumnos.has(ra.id) ? posAlumnos.get(ra.id) : -1;
        if (ra.deleted) {
          // Borrado en otro dispositivo: quitar el alumno y sus prácticas aquí
          // (de una vez al final del bucle).
          if (idx !== -1) {
            alumnosFuera.add(ra.id);
            dataChanged = true;
          }
          continue;
        }
        const alumno = {
          id: ra.id, nombre: ra.nombre, permiso: ra.permiso, vehiculo_id: ra.vehiculo_id,
          profesor_id: ra.profesor_id != null ? ra.profesor_id : null,
          sucursal_id: ra.sucursal_id != null ? ra.sucursal_id : null,
          email: ra.email != null ? ra.email : null,
          telefono: ra.telefono != null ? ra.telefono : null,
          dni: ra.dni != null ? ra.dni : null,
          fecha_nacimiento: ra.fecha_nacimiento != null ? ra.fecha_nacimiento : null,
          direccion: ra.direccion != null ? ra.direccion : null,
          fecha_alta: ra.fecha_alta != null ? ra.fecha_alta : null,
          observaciones: ra.observaciones != null ? ra.observaciones : null,
          estado: ra.estado != null ? ra.estado : null,
          // Libro de registro de alumnos (RD 1295/2003 art. 39): mismo patrón
          // que el resto de campos opcionales de arriba (columna nueva
          // sincronizada, detección en runtime, sin migración aplicada).
          n_inscripcion: ra.n_inscripcion != null ? ra.n_inscripcion : null,
          permisos_posee: ra.permisos_posee != null ? ra.permisos_posee : null,
          fecha_inicio: ra.fecha_inicio != null ? ra.fecha_inicio : null,
          fecha_fin: ra.fecha_fin != null ? ra.fecha_fin : null,
          resultado: ra.resultado != null ? ra.resultado : null,
          // Permisos múltiples (tarea B1): la columna es jsonb, pero se
          // tolera también texto (JSON.stringify en la subida) — parsea si
          // llega como string, pasa tal cual si ya llega como array/null.
          permisos: ra.permisos ? (typeof ra.permisos === 'string' ? JSON.parse(ra.permisos) : ra.permisos) : [],
          // Ficha DGT (tarea "Ficha alumno – formación práctica"): mismo
          // patrón que el resto de campos opcionales de arriba.
          primer_apellido: ra.primer_apellido != null ? ra.primer_apellido : null,
          segundo_apellido: ra.segundo_apellido != null ? ra.segundo_apellido : null,
          codigo_postal: ra.codigo_postal != null ? ra.codigo_postal : null,
          poblacion: ra.poblacion != null ? ra.poblacion : null,
          // Punto de partida (clases/km hechos antes de usar la app).
          clases_previas: ra.clases_previas != null ? ra.clases_previas : null,
          km_previos: ra.km_previos != null ? ra.km_previos : null,
          // Minutos que le sobran de clases por minutos del móvil (solo los
          // escribe la web; este PC no los sube nunca).
          minutos_sobrantes: ra.minutos_sobrantes != null ? Number(ra.minutos_sobrantes) : null,
          updated_at: ra.updated_at
        };
        _traerExtra('alumnos', alumno, ra, idx !== -1 ? data.alumnos[idx] : null);
        if (idx !== -1) {
          // Comparar timestamps: solo sobrescribir si el remoto es más reciente
          const local = data.alumnos[idx];
          const localUpdated = local.updated_at || '1970-01-01T00:00:00.000Z';
          const remoteUpdated = ra.updated_at || '1970-01-01T00:00:00.000Z';

          if (remoteUpdated > localUpdated) {
            _detectarYRegistrarConflicto(data, 'alumnos', pending.alumnos, ra.id,
              ['nombre', 'permiso', 'vehiculo_id', 'profesor_id', 'email',
                'telefono', 'dni', 'fecha_nacimiento', 'direccion', 'fecha_alta', 'observaciones', 'estado',
                'n_inscripcion', 'permisos_posee', 'fecha_inicio', 'fecha_fin', 'resultado', 'permisos',
                'primer_apellido', 'segundo_apellido', 'codigo_postal', 'poblacion', 'clases_previas', 'km_previos'],
              local, alumno, conflictos);
            data.alumnos[idx] = alumno;
            dataChanged = true;
            pulled++;
          }
          // Si local es más reciente, no sobrescribir (el usuario editó localmente)
        } else {
          posAlumnos.set(ra.id, data.alumnos.push(alumno) - 1);
          _avanzarSeq(data, 'a', ra.id);
          dataChanged = true;
          pulled++;
        }
      }
      if (alumnosFuera.size) {
        data.alumnos = data.alumnos.filter(a => !alumnosFuera.has(a.id));
        data.practicas = data.practicas.filter(p => !alumnosFuera.has(p.alumno_id));
      }
    }

    // Nuevas prácticas desde el móvil
    const posPracticas = posiciones(data.practicas);
    const { data: remotePracticas, error: errP } = await _traerCambios(sb, 'practicas', lastSync,
      id => data.practicas[posPracticas.get(id)],
      q => q.order('updated_at', { ascending: true }).order('id', { ascending: true }));

    if (!errP && remotePracticas) {
          const alumnosAqui = new Set(data.alumnos.map(a => a.id));
          const vehiculosAqui = new Set(data.vehiculos.map(v => v.id));
          const practicasFuera = new Set();
          for (const rp of remotePracticas) {
            const idx = posPracticas.has(rp.id) ? posPracticas.get(rp.id) : -1;
            // Borrada en otro dispositivo: fuera de aquí también (de una vez al final).
            if (rp.deleted) {
              if (idx !== -1) { practicasFuera.add(rp.id); dataChanged = true; }
              continue;
            }
            // Verificar que alumno y vehículo existan localmente
            if (!alumnosAqui.has(rp.alumno_id) || !vehiculosAqui.has(rp.vehiculo_id)) continue;
            const practica = {
              id: rp.id, alumno_id: rp.alumno_id, vehiculo_id: rp.vehiculo_id,
              fecha: rp.fecha, km_inicial: parseFloat(rp.km_inicial), km_final: parseFloat(rp.km_final),
              nota: rp.nota || '', profesor_id: rp.profesor_id != null ? rp.profesor_id : null,
              tipo: rp.tipo != null ? rp.tipo : null,
              sucursal_id: rp.sucursal_id != null ? rp.sucursal_id : null,
              hora_inicio: rp.hora_inicio != null ? rp.hora_inicio : null,
              firma: rp.firma != null ? rp.firma : null,
              trabajado: rp.trabajado != null ? rp.trabajado : null,
              tipo_detalle: rp.tipo_detalle != null ? rp.tipo_detalle : null,
              hora_fin: rp.hora_fin != null ? rp.hora_fin : null,
              zonas: Array.isArray(rp.zonas) ? rp.zonas : null,
              fraccion: Number(rp.fraccion) > 0 && Number(rp.fraccion) < 1 ? Number(rp.fraccion) : null,
              source: rp.source != null ? rp.source : null,
              updated_at: rp.updated_at
            };
            if (idx !== -1) {
              // Comparar timestamps: solo sobrescribir si el remoto es más reciente
              const local = data.practicas[idx];
              const localUpdated = local.updated_at || '1970-01-01T00:00:00.000Z';
              const remoteUpdated = rp.updated_at || '1970-01-01T00:00:00.000Z';

              if (remoteUpdated > localUpdated) {
                _detectarYRegistrarConflicto(data, 'practicas', pending.practicas, rp.id,
                  ['alumno_id', 'vehiculo_id', 'fecha', 'km_inicial', 'km_final', 'nota', 'profesor_id', 'tipo', 'hora_inicio'],
                  local, practica, conflictos);
                data.practicas[idx] = practica;
                dataChanged = true;
                pulled++; practicasTraidas++;
              }
              // Si local es más reciente, no sobrescribir (el usuario editó localmente)
            } else {
              posPracticas.set(rp.id, data.practicas.push(practica) - 1);
              // Actualizar seq si hace falta
              _avanzarSeq(data, 'p', rp.id);
              dataChanged = true;
              pulled++; practicasTraidas++;
            }
          }
          if (practicasFuera.size) data.practicas = data.practicas.filter(p => !practicasFuera.has(p.id));
        }

    // Pagos nuevos o modificados. Igual que en la subida: un empleado sin
    // acceso a `pagos` por RLS no debe tumbar el resto de la bajada
    // (vehículos/alumnos/prácticas ya se bajaron arriba y no deben perderse
    // por esto), así que la consulta va envuelta en try/catch además del
    // chequeo normal de `error`.
    try {
      const posPagos = posiciones(data.pagos);
      const { data: remotePagos, error: errPg } = await _traerCambios(sb, 'pagos', lastSync,
        id => data.pagos[posPagos.get(id)]);

      if (!errPg && remotePagos) {
        const pagosFuera = new Set();
        for (const rpg of remotePagos) {
          const idx = posPagos.has(rpg.id) ? posPagos.get(rpg.id) : -1;
          if (rpg.deleted) {
            if (idx !== -1) {
              pagosFuera.add(rpg.id);
              dataChanged = true;
            }
            continue;
          }
          if (idx === -1) {
            posPagos.set(rpg.id, data.pagos.length);
            data.pagos.push({
              id: rpg.id, alumno_id: rpg.alumno_id, fecha: rpg.fecha,
              cantidad: parseFloat(rpg.cantidad) || 0, nota: rpg.nota || '',
              sucursal_id: rpg.sucursal_id != null ? rpg.sucursal_id : null,
              forma_pago: rpg.forma_pago != null ? rpg.forma_pago : null,
              empleado: rpg.empleado != null ? rpg.empleado : null,
              updated_at: rpg.updated_at
            });
            _avanzarSeq(data, 'pg', rpg.id);
            dataChanged = true;
            pulled++;
          } else {
            const localUpdated  = data.pagos[idx].updated_at || '1970-01-01T00:00:00.000Z';
            const remoteUpdated = rpg.updated_at || '1970-01-01T00:00:00.000Z';
            if (remoteUpdated > localUpdated) {
              const nuevo = {
                alumno_id: rpg.alumno_id, fecha: rpg.fecha,
                cantidad: parseFloat(rpg.cantidad) || 0, nota: rpg.nota || '',
                sucursal_id: rpg.sucursal_id != null ? rpg.sucursal_id : null,
                forma_pago: rpg.forma_pago != null ? rpg.forma_pago : null,
                empleado: rpg.empleado != null ? rpg.empleado : null
              };
              _detectarYRegistrarConflicto(data, 'pagos', pending.pagos,
                rpg.id, ['alumno_id', 'fecha', 'cantidad', 'nota'], data.pagos[idx], nuevo, conflictos);
              Object.assign(data.pagos[idx], nuevo, { updated_at: rpg.updated_at });
              dataChanged = true;
              pulled++;
            }
          }
        }
        if (pagosFuera.size) data.pagos = data.pagos.filter(p => !pagosFuera.has(p.id));
      }
    } catch (e) {
      console.error('Sync: no se pudo leer pagos (permiso denegado o error de red):', e.message);
    }

    // Sucursales nuevas o modificadas. Igual que el resto de tablas nuevas:
    // solo se consulta si la migración está aplicada (sucursalesOn), y
    // envuelta en try/catch por si el rol/RLS deniega algo inesperado.
    if (sucursalesOn) {
      try {
        const { data: remoteSucursales, error: errSuc } = await _traerTodo(() => conEmpresa(sb
          .from('sucursales')
          .select('*')
          .gt('updated_at', lastSync))
          .order('id', { ascending: true }));

        if (!errSuc && remoteSucursales) {
          for (const rs of remoteSucursales) {
            const idx = data.sucursales.findIndex(x => x.id === rs.id);
            if (rs.deleted) {
              if (idx !== -1) { data.sucursales.splice(idx, 1); dataChanged = true; }
              continue;
            }
            if (idx === -1) {
              data.sucursales.push({ id: rs.id, nombre: rs.nombre, activa: rs.activa !== false, updated_at: rs.updated_at });
              _avanzarSeq(data, 'suc', rs.id);
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
        const { data: remoteReservas, error: errR } = await _traerTodo(() => conEmpresa(sb
          .from('reservas')
          .select('*')
          .gt('updated_at', lastSync))
          .order('id', { ascending: true }));

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
              _avanzarSeq(data, 'r', rr.id);
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

    // Cargos y descuentos nuevos o modificados (tarea D2). Mismo patrón que
    // reservas: solo se consulta si la migración está aplicada (cargosOn), y
    // envuelta en try/catch por si el rol/RLS deniega algo inesperado. A
    // diferencia de reservas (que borra de verdad en local), aquí el borrado
    // remoto también se aplica como soft delete local (deleted:true), no se
    // quita la fila: mantiene el mismo criterio que db/cargos.js.
    if (cargosOn) {
      try {
        const { data: remoteCargos, error: errC } = await _traerTodo(() => conEmpresa(sb
          .from('cargos')
          .select('*')
          .gt('updated_at', lastSync))
          .order('id', { ascending: true }));

        if (!errC && remoteCargos) {
          const posCargos = posiciones(data.cargos);
          for (const rc of remoteCargos) {
            const idx = posCargos.has(rc.id) ? posCargos.get(rc.id) : -1;
            const cargo = {
              id: rc.id, alumno_id: rc.alumno_id != null ? rc.alumno_id : null,
              concepto: rc.concepto || '', tipo: rc.tipo, importe: parseFloat(rc.importe) || 0,
              fecha: rc.fecha || null, nota: rc.nota || '',
              sucursal_id: rc.sucursal_id != null ? rc.sucursal_id : null,
              deleted: !!rc.deleted,
              updated_at: rc.updated_at
            };
            if (idx === -1) {
              posCargos.set(rc.id, data.cargos.push(cargo) - 1);
              _avanzarSeq(data, 'cargo', rc.id);
              dataChanged = true;
              pulled++;
            } else {
              const localUpdated  = data.cargos[idx].updated_at || '1970-01-01T00:00:00.000Z';
              const remoteUpdated = rc.updated_at || '1970-01-01T00:00:00.000Z';
              if (remoteUpdated > localUpdated) {
                _detectarYRegistrarConflicto(data, 'cargos', pending.cargos, rc.id,
                  ['concepto', 'tipo', 'importe', 'fecha', 'nota'], data.cargos[idx], cargo, conflictos);
                data.cargos[idx] = cargo;
                dataChanged = true;
                pulled++;
              }
              // Si local es más reciente, no sobrescribir (el usuario editó localmente)
            }
          }
        }
      } catch (e) {
        console.error('Sync: no se pudo leer cargos (permiso denegado o error de red):', e.message);
      }
    }

    // Ajustes compartidos (zonas de prácticas...): gana el más reciente.
    if (ajustesOn) {
      try {
        const { data: remAj, error: errAj } = await conEmpresa(sb
          .from('ajustes_empresa')
          .select('clave, valor, updated_at')
          .gt('updated_at', lastSync));
        if (!errAj && remAj) {
          if (!data.ajustes_empresa) data.ajustes_empresa = {};
          for (const r of remAj) {
            const local = data.ajustes_empresa[r.clave];
            if (!local || String(r.updated_at || '') > String(local.updated_at || '')) {
              data.ajustes_empresa[r.clave] = { valor: r.valor, updated_at: r.updated_at };
              dataChanged = true;
              pulled++;
            }
          }
        }
      } catch (e) {
        console.error('Sync: no se pudieron leer los ajustes compartidos:', e.message);
      }
    }

    if (dataChanged || regenerado || vehiculoReconciliado || marcasLocales) {
      // Respeta lo que la app haya guardado mientras corría el sync.
      _fusionarConDisco(data);
      saveData(data);
      // Limpiar caché de db.js
      try { require('./db')._clearCache(); } catch {}
    }

    // ── 3. ACTUALIZAR ESTADO PENDING ─────────────────────────────────────────
    // Sale de la cola solo lo que la nube confirmó (hechos/hechosDel) y que no
    // se volvió a marcar mientras tanto. Se funde con la cola del disco, que
    // puede traer marcas nuevas hechas durante el sync. Las tablas cuya
    // migración no está aplicada no se procesan y conservan su cola.
    const enDisco = loadPending();
    const remarcado = (tabla, id) => !!_remarcados && _remarcados.has(tabla + ':' + id);
    const quedan = (actual, delDisco, subidos, tabla, existe) => {
      const union = [...new Set([...(actual || []), ...(delDisco || [])])];
      return union.filter(id => remarcado(tabla, id) ||
        (!(subidos && subidos.has(id)) && (!existe || existe(id))));
    };
    for (const tabla of [..._TABLAS_SYNC, 'ajustes_empresa']) {
      // Un id sin registro en local (p. ej. renumerado por la reconciliación
      // de vehículos) ya no tiene nada que subir.
      const idsAqui = tabla === 'ajustes_empresa' ? null : new Set((data[tabla] || []).map(r => r.id));
      const existe = tabla === 'ajustes_empresa'
        ? (k => !!(data.ajustes_empresa && data.ajustes_empresa[k]))
        : (id => idsAqui.has(id));
      pending[tabla] = quedan(pending[tabla], enDisco[tabla], hechos[tabla], tabla, existe);
      if (tabla === 'ajustes_empresa') continue;
      if (!pending.deleted) pending.deleted = {};
      pending.deleted[tabla] = quedan(pending.deleted[tabla], (enDisco.deleted || {})[tabla], hechosDel[tabla], tabla);
    }
    pending.lastSync = new Date(inicioSync - MARGEN_LASTSYNC_MS).toISOString();
    savePending(pending);
    if (pulled > 0 && _onDatosNuevos) { try { _onDatosNuevos({ pulled, practicas: practicasTraidas }); } catch (e) { /* la UI no debe tumbar el sync */ } }

    if (erroresSubida.length) {
      // Siguen en la cola y se reintentan en el próximo sync; la UI lo avisa.
      console.error('Sync: no se pudieron subir algunos cambios:', erroresSubida.slice(0, 10).join(' | '));
      _lastError = `${erroresSubida.length} cambio(s) no se pudieron subir a la nube; se reintentará. Primero: ${erroresSubida[0]}`;
      setStatus(STATUS.ERROR);
      if (conflictos.length && _onConflictos) _onConflictos(conflictos);
      return { ok: false, reason: _lastError, pulled, pendientes: erroresSubida.length };
    }

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
    // cargos (tarea D2, descuentos/promociones + cargos automáticos): mismo
    // cuidado, si la tabla no existe aún en el servidor ni se sube ni se
    // intenta.
    const cargosOn = await _cargosDisponible(sb);
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
    // datos ampliados de alumno (teléfono, DNI, fecha de nacimiento, dirección,
    // fecha de alta, observaciones, estado): mismo cuidado que quitarEmail — si
    // la migración no está aplicada hay que quitarlos del objeto o el upsert de
    // alumnos falla entero (columnas inexistentes en el servidor).
    const datosOn = await _alumnosDatosDisponible(sb);
    const quitarDatos = obj => {
      if (!datosOn) {
        const { telefono, dni, fecha_nacimiento, direccion, fecha_alta, observaciones, estado, ...resto } = obj;
        return resto;
      }
      return {
        ...obj,
        telefono: obj.telefono || null,
        dni: obj.dni || null,
        fecha_nacimiento: obj.fecha_nacimiento || null,
        direccion: obj.direccion || null,
        fecha_alta: obj.fecha_alta || null,
        observaciones: obj.observaciones || null,
        estado: obj.estado || null
      };
    };
    // libro de registro de alumnos (RD 1295/2003 art. 39): mismo cuidado que
    // quitarDatos — si la migración no está aplicada hay que quitar estas 5
    // columnas del objeto o el upsert de alumnos falla entero (columnas
    // inexistentes en el servidor).
    const libroOn = await _alumnosLibroDisponible(sb);
    const quitarLibro = obj => {
      if (!libroOn) {
        const { n_inscripcion, permisos_posee, fecha_inicio, fecha_fin, resultado, ...resto } = obj;
        return resto;
      }
      return { ...obj, n_inscripcion: obj.n_inscripcion != null ? obj.n_inscripcion : null, permisos_posee: obj.permisos_posee||null, fecha_inicio: obj.fecha_inicio||null, fecha_fin: obj.fecha_fin||null, resultado: obj.resultado||null };
    };
    // forma_pago/empleado (tarea D1 del PLAN-MAESTRO, arqueo de caja): mismo
    // cuidado que quitarSucursal — si la migración no está aplicada hay que
    // quitarlos del objeto o el upsert de pagos falla entero (columnas
    // inexistentes en el servidor).
    const pagosCamposOn = await _pagosCamposDisponible(sb);
    const quitarPagosCampos = obj => {
      if (!pagosCamposOn) { const { forma_pago, empleado, ...resto } = obj; return resto; }
      return { ...obj, forma_pago: obj.forma_pago || null, empleado: obj.empleado || null };
    };
    // permisos múltiples del alumno (tarea B1 del PLAN-MAESTRO): mismo cuidado
    // que quitarLibro — si la migración no está aplicada hay que quitar la
    // columna del objeto o el upsert de alumnos falla entero (columna
    // inexistente en el servidor). Se sube como JSON string (columna jsonb).
    const permisosOn = await _alumnosPermisosDisponible(sb);
    const quitarPermisos = obj => {
      if (!permisosOn) {
        const { permisos, ...resto } = obj;
        return resto;
      }
      return { ...obj, permisos: JSON.stringify(obj.permisos || []) };
    };
    // dni de profesor (tarea "Ficha alumno – formación práctica" DGT): mismo
    // cuidado que quitarPermisos — si la migración no está aplicada hay que
    // quitar la columna del objeto o el upsert de profesores falla entero
    // (columna inexistente en el servidor).
    const profesoresDniOn = await _profesoresDniDisponible(sb);
    const quitarDniProfesor = obj => {
      const { firma, firma_pendiente, ...sinFirma } = obj; // la firma no viaja en bloque
      if (!profesoresDniOn) { const { dni, ...resto } = sinFirma; return resto; }
      return { ...sinFirma, dni: sinFirma.dni || null };
    };
    // ficha DGT del alumno (primer_apellido/segundo_apellido/codigo_postal/
    // poblacion), mismo cuidado que quitarPermisos.
    const fichaDgtOn = await _alumnosFichaDgtDisponible(sb);
    const quitarFichaDgt = obj => {
      if (!fichaDgtOn) {
        const { primer_apellido, segundo_apellido, codigo_postal, poblacion, ...resto } = obj;
        return resto;
      }
      return {
        ...obj,
        primer_apellido: obj.primer_apellido || null,
        segundo_apellido: obj.segundo_apellido || null,
        codigo_postal: obj.codigo_postal || null,
        poblacion: obj.poblacion || null
      };
    };
    // hora_inicio de práctica, mismo cuidado que quitarFichaDgt.
    const horaInicioOn = await _practicasHoraInicioDisponible(sb);
    const quitarHoraInicio = obj => {
      if (!horaInicioOn) { const { hora_inicio, ...resto } = obj; return resto; }
      return { ...obj, hora_inicio: obj.hora_inicio || null };
    };

    // Columnas del flujo móvil de prácticas, mismo cuidado que quitarHoraInicio.
    // En la subida completa NO viajan: nacen en el móvil y la nube es su
    // fuente. En un upsert masivo, la fila que no los tuviera en local los
    // pondría a NULL en la nube (borraría, p. ej., la firma del alumno).
    const quitarMovil = obj => {
      const { firma, trabajado, tipo_detalle, hora_fin, zonas, fraccion, ...resto } = obj;
      return resto;
    };
    // Punto de partida del alumno (migración 2026-10-01), mismo cuidado que quitarFichaDgt.
    const previasOn = await _alumnosPreviasDisponible(sb);
    const extraOn = await _extraTablas(sb);
    const quitarPrevias = obj => {
      const { clases_previas, km_previos, minutos_sobrantes, ...resto } = obj;
      if (!previasOn) return resto;
      return { ...resto, clases_previas: clases_previas > 0 ? Math.round(clases_previas * 4) / 4 : null, km_previos: km_previos > 0 ? Math.round(km_previos) : null };
    };
    // supabase-js no lanza ante un error: se recoge cada { error } para no dar
    // por subido lo que la nube rechazó.
    const erroresPush = [];
    const comprobar = (res, que, toleraSinPermiso = false) => {
      if (res && res.error) {
        const sinPermiso = res.error.code === '42501' || /row-level security|permission denied/i.test(res.error.message || '');
        if (!(toleraSinPermiso && sinPermiso)) erroresPush.push(`${que}: ${res.error.message || res.error.code}`);
      }
      return res;
    };
    // En trozos de TAM_LOTE_SUBIDA filas, varios a la vez: una sola petición
    // con miles de filas (tras importar de otro programa) podía pasarse del
    // tiempo máximo de la nube y no subir nada.
    const subirTodo = async (tabla, filas, que, toleraSinPermiso = false) => {
      const tareas = [];
      for (let i = 0; i < filas.length; i += TAM_LOTE_SUBIDA) {
        const trozo = filas.slice(i, i + TAM_LOTE_SUBIDA);
        tareas.push(async () => { comprobar(await sb.from(tabla).upsert(trozo, { onConflict: 'id' }), que, toleraSinPermiso); });
      }
      await _enParalelo(tareas);
    };

    // Subir en orden: vehiculos → profesores → tarifas → alumnos → practicas → pagos
    if (data.vehiculos.length) {
      await subirTodo('vehiculos',
        data.vehiculos.map(v => _quitarExtra('vehiculos', quitarSucursal({ ...v, ...conEmpresaTag, deleted: false, updated_at: now }), extraOn.vehiculos)),
        'subida completa');
    }
    if (data.profesores.length) {
      await subirTodo('profesores',
        data.profesores.map(p => _quitarExtra('profesores', quitarDniProfesor(quitarSucursal({ ...p, ...conEmpresaTag, deleted: false, updated_at: now })), extraOn.profesores)),
        'subida completa');
    }
    if (data.tarifas.length) {
      await subirTodo('tarifas',
        data.tarifas.map(t => ({ ...t, ...conEmpresaTag, deleted: false, updated_at: now })),
        'subida completa');
    }
    if (data.alumnos.length) {
      await subirTodo('alumnos',
        data.alumnos.map(a => _quitarExtra('alumnos', quitarPrevias(quitarFichaDgt(quitarPermisos(quitarLibro(quitarDatos(quitarEmail(quitarSucursal({ ...a, ...conEmpresaTag, deleted: false, updated_at: now }))))))), extraOn.alumnos)),
        'subida completa');
    }
    if (data.practicas.length) {
      await subirTodo('practicas',
        data.practicas.map(p => quitarMovil(quitarHoraInicio(quitarSucursal({ ...p, ...conEmpresaTag, deleted: false, updated_at: now })))),
        'subida completa');
    }
    // Sucursales: solo si la migración está aplicada (si no, ni la tabla existe).
    if (sucursalesOn && data.sucursales.length) {
      await subirTodo('sucursales',
        data.sucursales.map(s => ({ ...s, ...conEmpresaTag, deleted: false, updated_at: now })),
        'subida completa');
    }
    // Reservas: solo si la migración está aplicada (si no, ni la tabla existe).
    if (reservasOn && data.reservas.length) {
      await subirTodo('reservas',
        data.reservas.map(r => quitarSucursal({ ...r, ...conEmpresaTag, deleted: false, updated_at: now })),
        'subida completa');
    }
    // Cargos: solo si la migración está aplicada (si no, ni la tabla existe).
    if (cargosOn && data.cargos.length) {
      await subirTodo('cargos',
        data.cargos.map(c => quitarSucursal({ ...c, ...conEmpresaTag, updated_at: now })),
        'subida completa');
    }
    // Pagos: igual tolerancia que en sync() — un empleado sin acceso a la
    // tabla por RLS no debe abortar la subida completa de las demás tablas.
    try {
      if (data.pagos.length) {
        await subirTodo('pagos',
          data.pagos.map(pg => quitarPagosCampos(quitarSucursal({ ...pg, ...conEmpresaTag, deleted: false, updated_at: now }))),
          'pagos', true);
      }
    } catch (e) {
      console.error('Sync (subir todo): no se pudo subir pagos (permiso denegado o error de red):', e.message);
    }

    // Ejecutar los borrados pendientes antes de vaciar la cola: antes se
    // descartaban sin subir y los registros borrados quedaban vivos en la nube.
    // En bloques de ids, como en sync() (ver _marcarBorradosEnNube).
    const pending = loadPending();
    const borrar = (tabla) => _marcarBorradosEnNube(sb, tabla, pending.deleted[tabla], () => {}, now);
    await borrar('practicas');
    await borrar('alumnos');
    await borrar('vehiculos');
    await borrar('profesores');
    await borrar('tarifas');
    try {
      await borrar('pagos');
    } catch (e) {
      console.error('Sync (subir todo): no se pudo borrar pagos en la nube (permiso denegado o error de red):', e.message);
    }
    if (sucursalesOn) await borrar('sucursales');
    if (reservasOn) await borrar('reservas');
    if (cargosOn) await borrar('cargos');

    if (erroresPush.length) {
      // No se vacía la cola: lo que falló se reintentará en el siguiente sync.
      _lastError = 'La subida completa no terminó: ' + erroresPush[0];
      setStatus(STATUS.ERROR);
      return { ok: false, reason: _lastError };
    }

    // Limpiar pending. OJO: no adelantar lastSync aquí — si este PC aún no ha
    // descargado los datos antiguos de la nube, adelantarla se los saltaría.
    pending.vehiculos = []; pending.profesores = []; pending.tarifas = []; pending.alumnos = []; pending.practicas = []; pending.pagos = [];
    pending.deleted = { practicas: [], alumnos: [], vehiculos: [], profesores: [], tarifas: [], pagos: [], sucursales: pending.deleted.sucursales, reservas: pending.deleted.reservas, cargos: pending.deleted.cargos };
    if (sucursalesOn) { pending.sucursales = []; pending.deleted.sucursales = []; }
    if (reservasOn) { pending.reservas = []; pending.deleted.reservas = []; }
    if (cargosOn) { pending.cargos = []; pending.deleted.cargos = []; }
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

// ─── SONDEO RÁPIDO (casi en vivo) ────────────────────────────────────────────
// Un sync completo cada 2 minutos hacía que las clases que un profesor guarda en
// el móvil tardaran hasta 2 min en verse en el ordenador de la oficina. Ahora,
// además, cada pocos segundos se hace una pregunta barata a la nube: «¿cuál es
// la última modificación de cada tabla que escribe la web?» (una fila por tabla).
// Solo si ha cambiado algo respecto a lo último visto se lanza el sync completo,
// que ya sabe bajar y mezclar. Sin cambios = unas pocas consultas ligeras y nada más.
// La web escribe: prácticas (clases), alumnos (altas), profesores (firma, coche
// habitual) y reservas (solicitudes del portal del alumno).
const TABLAS_SONDEO = ['practicas', 'alumnos', 'profesores', 'reservas'];
let _sondeoVisto = null;          // { tabla: última updated_at vista tras un sync correcto }
let _sondeoTimer = null;
let _sondeoActivo = false;
let _sondeoEnCurso = false;
let _sondeoRitmoMs = 12 * 1000;   // con la ventana a la vista; en segundo plano baja (setRitmoSondeo)

async function sondearNube() {
  if (_sondeoEnCurso || _syncPromesa || currentStatus === STATUS.SYNCING) return { ok: true, ocupado: true };
  _sondeoEnCurso = true;
  try {
    const sb = await ensureClient();
    if (!sb) return { ok: false, motivo: 'sin sesión' };
    const marcas = await Promise.all(TABLAS_SONDEO.map(async t => {
      try {
        const { data, error } = await _conEmpresa(sb.from(t).select('updated_at')).order('updated_at', { ascending: false }).limit(1);
        if (error) return { error: true };
        return { marca: data && data[0] && data[0].updated_at ? String(data[0].updated_at) : '' };
      } catch (e) { return { error: true }; }
    }));
    // Una tabla que da error (p. ej. aún sin migración) se ignora; si fallan todas, no hay conexión
    if (marcas.every(m => m.error)) return { ok: false, motivo: 'sin respuesta' };
    const actual = {};
    TABLAS_SONDEO.forEach((t, i) => { actual[t] = marcas[i].error ? '' : marcas[i].marca; });
    const hayNovedad = !_sondeoVisto || TABLAS_SONDEO.some(t => actual[t] !== (_sondeoVisto[t] || ''));
    if (!hayNovedad) return { ok: true, novedades: false };
    const r = await module.exports.sync();
    // Solo se da por visto si el sync llegó a bajar (con errores de SUBIDA también baja: no repetir cada pocos segundos)
    if (r && (r.ok || r.pulled !== undefined)) _sondeoVisto = actual;
    return { ok: !!(r && r.ok), novedades: true, pulled: r && r.pulled };
  } catch (e) {
    return { ok: false, motivo: e.message };
  } finally {
    _sondeoEnCurso = false;
  }
}

function _programarSondeo() {
  if (_sondeoTimer) clearTimeout(_sondeoTimer);
  if (!_sondeoActivo) return;
  _sondeoTimer = setTimeout(async () => {
    _sondeoTimer = null;
    try { await sondearNube(); } catch (e) { /* el siguiente turno lo reintenta */ }
    _programarSondeo();
  }, _sondeoRitmoMs);
  if (typeof _sondeoTimer.unref === 'function') _sondeoTimer.unref();
}

// Más lento con la ventana minimizada o sin foco, rápido al volver (lo llama main.js)
function setRitmoSondeo(ms) {
  _sondeoRitmoMs = Math.max(5000, Number(ms) || 12000);
  if (_sondeoActivo) _programarSondeo();
}

// Preguntar ya (al volver a la ventana, al despertar el PC, al recuperar internet)
function sondearAhora() {
  if (!_sondeoActivo) return Promise.resolve({ ok: false, motivo: 'inactivo' });
  return sondearNube();
}

function startAutoSync(intervalMs = 2 * 60 * 1000) {
  // Arma el mecanismo de sync inmediato (debounce tras cada cambio local)
  _syncInmediatoActivo = true;
  // Sync inmediato al arrancar
  const initialTimer = setTimeout(() => sync(), 1000);
  if (typeof initialTimer.unref === 'function') initialTimer.unref();
  // Luego cada intervalMs (red de seguridad) y el sondeo rápido de novedades
  _syncTimer = setInterval(() => sync(), intervalMs);
  _sondeoActivo = true;
  _sondeoVisto = null;
  _programarSondeo();
}

function stopAutoSync() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  _syncInmediatoActivo = false;
  if (_syncInmediatoTimer) { clearTimeout(_syncInmediatoTimer); _syncInmediatoTimer = null; }
  _sondeoActivo = false;
  if (_sondeoTimer) { clearTimeout(_sondeoTimer); _sondeoTimer = null; }
}

function onStatusChange(cb) {
  _onStatusChange = cb;
}

// cb({ pulled, practicas }) se llama cada vez que un sync trae datos nuevos de la nube.
function onDatosNuevos(cb) {
  _onDatosNuevos = cb;
}

// cb recibe el array de conflictos { tabla, id, ganador, cambios } del último
// sync() que encontró alguno. No se llama si no hubo ninguno.
function onConflictos(cb) {
  _onConflictos = cb;
}

module.exports = {
  sync,
  pushAll,
  cerrarOtrasSesiones,
  markDirty,
  markDeleted,
  markDirtyVarios,
  markDeletedVarios,
  desmarcarBorradosVarios,
  getStatus,
  STATUS,
  startAutoSync,
  stopAutoSync,
  sondearNube,
  sondearAhora,
  setRitmoSondeo,
  onDatosNuevos,
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
  resolverConflictoEmpresa,
  // Varias cuentas en el mismo PC (cada una con sus datos locales)
  cambiarDatosDeCuenta,
  getCuentasGuardadas,
  contarPendientes
};
