/**
 * db/core.js  –  base común: rutas, carga/caché de data.json, guardado
 * atómico, logs y backups. De aquí dependen todos los demás módulos de db/.
 */

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

let dataPath;
let _data = null;

// Referencia lazy a sync para evitar dependencia circular
function _sync() {
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
  if (!_data) _data = { vehiculos: [], profesores: [], alumnos: [], practicas: [], tarifas: [], pagos: [], sucursales: [], logs: [], _seq: { v: 1, pf: 1, a: 1, p: 1, t: 1, pg: 1, suc: 1 } };
  if (!_data._seq) _data._seq = { v: 1, pf: 1, a: 1, p: 1 };
  if (!_data._seq.pf) _data._seq.pf = 1;
  if (!_data._seq.t) _data._seq.t = 1;
  if (!_data._seq.pg) _data._seq.pg = 1;
  if (!_data._seq.suc) _data._seq.suc = 1;
  if (!_data.logs) _data.logs = [];
  if (!_data.profesores) _data.profesores = [];
  if (!_data.tarifas) _data.tarifas = [];
  if (!_data.pagos) _data.pagos = [];
  if (!_data.sucursales) _data.sucursales = [];
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

function getLogs() {
  return load().logs;
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
      return { ok: false, msg: 'El archivo no parece un backup válido de KM Alumnos.' };
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

module.exports = {
  // Uso interno entre módulos de db/
  _sync,
  getDataPath,
  load,
  save,
  nextId,
  fmtFechaLog,
  addLog,
  getLastSaveError,
  filtrarPorSucursal,
  // Superficie pública (re-exportada tal cual por db.js)
  _clearCache,
  getLogs,
  clearLogs,
  registrarLogEnData,
  crearBackup,
  restaurarBackup,
  obtenerUltimoBackup,
};
