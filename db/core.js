/**
 * db/core.js  –  base común: rutas, carga/caché de data.json, guardado
 * atómico, logs y backups. De aquí dependen todos los demás módulos de db/.
 */

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

let dataPath;
let _data = null;
// Mientras dura una simulación (ver simular) los datos son una copia: no se escribe
// en disco y no se marca nada para la nube.
let _simulando = 0;

// Referencia lazy a sync para evitar dependencia circular
function _sync() {
  if (_simulando) return null;
  try { return require('../sync'); } catch { return null; }
}

function getDataPath() {
  if (!dataPath) dataPath = path.join(app.getPath('userData'), 'data.json');
  return dataPath;
}

function _clearCache() {
  _data = null;
}

function load() {
  if (_data) return _data;
  const p = getDataPath();
  if (fs.existsSync(p)) {
    try { _data = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { _data = null; }
  }
  if (!_data) _data = { vehiculos: [], profesores: [], alumnos: [], practicas: [], tarifas: [], pagos: [], sucursales: [], reservas: [], logs: [], _seq: { v: 1, pf: 1, a: 1, p: 1, t: 1, pg: 1, suc: 1, r: 1, venc: 1, pres: 1, tasa: 1, bono: 1, cargo: 1, lead: 1 } };
  if (!_data._seq) _data._seq = { v: 1, pf: 1, a: 1, p: 1 };
  if (!_data._seq.pf) _data._seq.pf = 1;
  if (!_data._seq.t) _data._seq.t = 1;
  if (!_data._seq.pg) _data._seq.pg = 1;
  if (!_data._seq.suc) _data._seq.suc = 1;
  if (!_data._seq.r) _data._seq.r = 1;
  if (!_data._seq.j) _data._seq.j = 1;
  if (_data._seq.venc == null) _data._seq.venc = 1;
  if (_data._seq.pres == null) _data._seq.pres = 1;
  if (_data._seq.tasa == null) _data._seq.tasa = 1;
  if (_data._seq.bono == null) _data._seq.bono = 1;
  if (_data._seq.cargo == null) _data._seq.cargo = 1;
  if (_data._seq.lead == null) _data._seq.lead = 1;
  // Los ids >= 1e9 son de la web/portal (rango propio, ver sync.js ID_WEB_MIN):
  // si una versión anterior empujó el contador local ahí, se devuelve a su rango.
  for (const [k, tabla] of [['a', 'alumnos'], ['p', 'practicas'], ['v', 'vehiculos'], ['r', 'reservas']]) {
    if (_data._seq[k] >= 1000000000) {
      _data._seq[k] = (_data[tabla] || []).reduce((m, r) => (r && r.id < 1000000000 && r.id > m ? r.id : m), 0) + 1;
    }
  }
  if (!_data.logs) _data.logs = [];
  if (!_data.profesores) _data.profesores = [];
  if (!_data.tarifas) _data.tarifas = [];
  if (!_data.pagos) _data.pagos = [];
  if (!_data.sucursales) _data.sucursales = [];
  if (!_data.reservas) _data.reservas = [];
  if (!_data.jornadas) _data.jornadas = [];
  if (!_data.vencimientos) _data.vencimientos = [];
  if (!_data.presentaciones) _data.presentaciones = [];
  if (!_data.tasas) _data.tasas = [];
  if (!_data.bonos) _data.bonos = [];
  if (!_data.cargos) _data.cargos = [];
  if (!_data.leads) _data.leads = [];
  return _data;
}

// Filtro compartido por sucursal: sucursalId vacío/null/undefined = sin
// filtro (comportamiento de "Todas las sucursales", idéntico al modo clásico
// sin la migración aplicada). Los registros sin sucursal_id (NULL = sede
// principal, o instalaciones sin migrar) nunca coinciden con un filtro
// concreto, solo aparecen con "Todas" — ver CLAUDE.md.
function filtrarPorSucursal(arr, sucursalId) {
  if (sucursalId === undefined || sucursalId === null || sucursalId === '') return arr;
  const sid = parseInt(sucursalId);
  return arr.filter(x => x.sucursal_id === sid);
}

// Práctica "en curso": la abre el móvil al empezar la clase (con el km inicial
// real del cuentakilómetros y km_final 0) y se cierra al fijar el km final.
// Solo cuenta si es de HOY; una sin cerrar de días anteriores es "sin cerrar".
// Ojo: NO es lo mismo que "sin km" (km_inicial 0 y km_final 0 = en blanco).
function esPracticaEnCurso(p, hoy) {
  return !!p && !p.deleted && p.km_inicial > 0 && !p.km_final && p.fecha === hoy;
}
function esPracticaSinCerrar(p, hoy) {
  return !!p && !p.deleted && p.km_inicial > 0 && !p.km_final && !!p.fecha && p.fecha < hoy;
}
// Cuánto vale una práctica en clases: 1 (null/ausente) o una fracción ¼, ½, ¾
// (columna `fraccion`, la pone el móvil). Cuenta en cobros, ficha DGT y totales.
function clasesDePractica(p) {
  const f = p ? Number(p.fraccion) : NaN;
  return f > 0 && f < 1 ? Math.round(f * 4) / 4 || 0.25 : 1;
}
// «2,5» → «2 ½»; «0,75» → «¾». Para textos («2 ½ clases»).
function fmtClases(n) {
  const v = Math.round((Number(n) || 0) * 4) / 4;
  const ent = Math.floor(v), q = Math.round((v - ent) * 4);
  const frac = ['', '¼', '½', '¾'][q];
  return ent && frac ? `${ent} ${frac}` : frac || String(ent);
}
// Redondea a cuartos de clase (las clases van de ¼ en ¼).
const aCuartos = n => Math.round((Number(n) || 0) * 4) / 4;
// Lee una cantidad de clases escrita de cualquier forma: «2», «1,5», «1.5»,
// «0.25», «½», «1 ½», «1½», «1/2», «1 1/2», «3 clases». Solo vale de ¼ en ¼
// (x.25, x.5, x.75). null si no se entiende o no va de ¼ en ¼.
const FRACCIONES_TXT = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
function leerCantidadClases(v) {
  if (typeof v === 'number') { const q = Math.round(v * 4); return Number.isFinite(v) && q >= 1 && Math.abs(v * 4 - q) < 1e-6 ? q / 4 : null; }
  const t = String(v == null ? '' : v).toLowerCase().replace(/\b(clases?|cl\.?)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  let n, r;
  if ((r = t.match(/^(\d+)?\s*([¼½¾])$/))) n = (r[1] ? +r[1] : 0) + FRACCIONES_TXT[r[2]];
  else if ((r = t.match(/^(\d+)\s+(\d)\s*\/\s*(\d)$/))) n = +r[1] + (+r[3] ? +r[2] / +r[3] : NaN);
  else if ((r = t.match(/^(\d)\s*\/\s*(\d)$/))) n = +r[2] ? +r[1] / +r[2] : NaN;
  else if (/^\d*[.,]?\d+$/.test(t)) n = Number(t.replace(',', '.'));
  else return null;
  const q = Math.round(n * 4);
  return Number.isFinite(n) && q >= 1 && Math.abs(n * 4 - q) < 1e-6 ? q / 4 : null;
}
// Trozos en que se guarda una cantidad: 2,75 → [1, 1, 0.75]. Cada trozo es una
// práctica (las enteras sin fracción; la última, con la suya).
function trozosDeClases(cantidad) {
  const c = aCuartos(cantidad);
  if (!(c >= 0.25)) return [];
  const t = Array(Math.floor(c)).fill(1);
  if (c % 1) t.push(aCuartos(c % 1));
  return t;
}
// Reparte `total` km entre trozos que valen `pesos` (1, 1, ½…) en proporción a
// lo que vale cada uno; el resto de uno en uno a los que más se quedaron sin
// repartir, y cada trozo con al menos 1 km. [40 km, (1, ½)] → [27, 13].
function kmPorPesos(total, pesos) {
  const suma = pesos.reduce((a, b) => a + b, 0);
  const ideal = pesos.map(w => (total * w) / suma), km = ideal.map(Math.floor);
  let resto = total - km.reduce((a, b) => a + b, 0);
  ideal.map((x, i) => [x - km[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (resto > 0) { km[i]++; resto--; } });
  for (let i = 0; i < km.length; i++) if (km[i] < 1) { const m = km.indexOf(Math.max(...km)); km[m]--; km[i]++; }
  return km;
}

// Firma dibujada (alumno o profesor): imagen PNG en data URL, tamaño razonable.
const FIRMA_MAX = 200000;
function firmaValida(f) {
  return typeof f === 'string' && f.length <= FIRMA_MAX && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(f);
}
// Alumnos que ya no vienen a clase (dados de baja, aprobados, inactivos…): no deben
// salir en avisos, semáforos, caducidades ni listas de «quién viene hoy».
const ESTADOS_ALUMNO_TERMINADO = ['baja', 'aprobado', 'apto', 'no_apto', 'inactivo'];
const alumnoTerminado = a => !!a && ESTADOS_ALUMNO_TERMINADO.includes(a.estado);
// Nombre y primer apellido del alumno: así se distinguen dos personas que se llaman igual.
// Si el nombre ya trae el apellido (datos traídos de otro programa) no se repite.
function nombreCorto(a) {
  if (!a) return '';
  const nombre = String(a.nombre || '').trim();
  const apellido = String(a.primer_apellido || '').trim();
  if (!apellido) return nombre;
  const plano = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return plano(nombre).includes(plano(apellido)) ? nombre : `${nombre} ${apellido}`;
}

function hoyLocalISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function fmtFechaLog(str) {
  if (!str) return str;
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function _construirLog(tipo, descripcion, detalles = []) {
  return {
    id: Date.now(),
    fecha: new Date().toISOString(),
    tipo,
    descripcion,
    detalles
  };
}

function addLog(tipo, descripcion, detalles = []) {
  const d = load();
  d.logs.unshift(_construirLog(tipo, descripcion, detalles));
  // Limitar a 500 entradas
  if (d.logs.length > 500) d.logs = d.logs.slice(0, 500);
}

// Añade una entrada de log directamente a un objeto `data` ya cargado por otro
// módulo (sync.js gestiona su propio `data` en memoria y su propio save(), por
// lo que no puede usar addLog()/load()/save() sin arriesgar pisarse con su
// propia escritura). Misma forma y mismo recorte a 500 que addLog, para no
// duplicar el formato de los logs.
function registrarLogEnData(data, tipo, descripcion, detalles = []) {
  if (!Array.isArray(data.logs)) data.logs = [];
  data.logs.unshift(_construirLog(tipo, descripcion, detalles));
  if (data.logs.length > 500) data.logs = data.logs.slice(0, 500);
}

// filtro opcional: { texto, tipo, desde, hasta }. Sin filtro (o filtro vacío)
// devuelve todos los logs, igual que antes de añadir la pantalla de
// Auditoría — así ningún llamador existente cambia de comportamiento.
function getLogs(filtro) {
  const logs = load().logs;
  if (!filtro) return logs;
  const { texto, tipo, desde, hasta } = filtro;
  return logs.filter(log => {
    if (tipo && log.tipo !== tipo) return false;
    // log.fecha es un ISO string completo (new Date().toISOString()); los 10
    // primeros caracteres son la fecha YYYY-MM-DD, comparable como texto con
    // los límites del filtro (mismas convenciones de fecha del proyecto).
    const fechaLog = (log.fecha || '').slice(0, 10);
    if (desde && fechaLog < desde) return false;
    if (hasta && fechaLog > hasta) return false;
    if (texto) {
      const t = texto.toLowerCase();
      const enDescripcion = (log.descripcion || '').toLowerCase().includes(t);
      const enDetalles = Array.isArray(log.detalles) && log.detalles.some(d => String(d).toLowerCase().includes(t));
      if (!enDescripcion && !enDetalles) return false;
    }
    return true;
  });
}

function clearLogs() {
  const d = load();
  d.logs = [];
  save();
}

// ─── BACKUP ──────────────────────────────────────────────────────────────────
const MAX_BACKUPS = 20;

function getBackupsDir() {
  const dir = path.join(path.dirname(getDataPath()), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function _pruneBackupsAntiguos() {
  const dir = getBackupsDir();
  const nombres = fs.readdirSync(dir).filter(f => /^backup-.*\.json$/.test(f));
  if (nombres.length <= MAX_BACKUPS) return;
  nombres.sort();
  const aBorrar = nombres.slice(0, nombres.length - MAX_BACKUPS);
  for (const nombre of aBorrar) {
    try { fs.unlinkSync(path.join(dir, nombre)); } catch { /* no interrumpir por un fallo puntual */ }
  }
}

function crearBackup(destDir) {
  const src = getDataPath();
  if (!fs.existsSync(src)) return { ok: false, msg: 'No hay datos que guardar.' };
  if (destDir) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const destFile = path.join(destDir, `kmalumnos_backup_${ts}.json`);
    fs.copyFileSync(src, destFile);
    return { ok: true, file: destFile };
  }
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  const nombre = `backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.json`;
  const destFile = path.join(getBackupsDir(), nombre);
  fs.copyFileSync(src, destFile);
  _pruneBackupsAntiguos();
  return { ok: true, file: destFile, nombre: path.basename(destFile) };
}

function obtenerUltimoBackup() {
  try {
    const dir = getBackupsDir();
    const nombres = fs.readdirSync(dir).filter(f => /^backup-.*\.json$/.test(f));
    if (!nombres.length) return null;
    nombres.sort();
    const nombre = nombres[nombres.length - 1];
    const file = path.join(dir, nombre);
    return { file, nombre, fecha: fs.statSync(file).mtime.toISOString() };
  } catch {
    return null;
  }
}

function restaurarBackup(srcFile) {
  try {
    const raw = fs.readFileSync(srcFile, 'utf-8');
    const parsed = JSON.parse(raw);
    // Validación mínima
    if (!parsed.vehiculos || !parsed.alumnos || !parsed.practicas) {
      return { ok: false, msg: 'El archivo no parece un backup válido de AulaMovil.' };
    }
    fs.writeFileSync(getDataPath(), JSON.stringify(parsed, null, 2), 'utf-8');
    _data = null; // limpiar caché para recargar
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

// Variable para almacenar el último error de guardado
let _lastSaveError = null;

function getLastSaveError() {
  return _lastSaveError;
}

function save() {
  if (_simulando) return true;
  try {
    const dataStr = JSON.stringify(_data, null, 2);
    const filePath = getDataPath();

    // Escribir a archivo temporal primero (atomic write)
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, dataStr, 'utf-8');

    // Renombrar archivo temporal al archivo final (más seguro)
    fs.renameSync(tempPath, filePath);

    _lastSaveError = null;
    return true;
  } catch (e) {
    _lastSaveError = {
      timestamp: new Date().toISOString(),
      message: e.message,
      code: e.code
    };
    console.error('ERROR guardando datos:', e.message);

    // Intentar notificar al proceso principal si estamos en renderer
    try {
      const { ipcRenderer } = require('electron');
      if (ipcRenderer) {
        ipcRenderer.send('save-error', _lastSaveError);
      }
    } catch {}

    return false;
  }
}

function nextId(type) {
  const id = _data._seq[type]++;
  return id;
}

/**
 * Ejecuta `fn` sobre una COPIA de los datos: lo que haga (crear, cambiar o borrar
 * clases, aplicar un cuadre de km...) no se guarda en disco ni se marca para la
 * nube, y al terminar los datos reales quedan exactamente como estaban. Sirve para
 * enseñar «cómo quedaría» una cadena de pasos antes de tocar nada: cada paso trabaja
 * sobre lo que dejó el anterior, igual que cuando se aplican de verdad.
 */
function simular(fn) {
  const real = load();
  const copia = typeof structuredClone === 'function' ? structuredClone(real) : JSON.parse(JSON.stringify(real));
  _data = copia;
  _simulando++;
  try {
    return fn(copia);
  } finally {
    _simulando--;
    _data = real;
  }
}

module.exports = {
  // Uso interno entre módulos de db/
  _sync,
  getDataPath,
  load,
  save,
  nextId,
  simular,
  fmtFechaLog,
  addLog,
  getLastSaveError,
  filtrarPorSucursal,
  esPracticaEnCurso,
  esPracticaSinCerrar,
  hoyLocalISO,
  nombreCorto,
  ESTADOS_ALUMNO_TERMINADO,
  alumnoTerminado,
  clasesDePractica,
  fmtClases,
  aCuartos,
  leerCantidadClases,
  trozosDeClases,
  kmPorPesos,
  firmaValida,
  FIRMA_MAX,
  // Superficie pública (re-exportada tal cual por db.js)
  _clearCache,
  getLogs,
  clearLogs,
  registrarLogEnData,
  crearBackup,
  restaurarBackup,
  obtenerUltimoBackup,
};
