/**
 * db.js  –  almacenamiento en JSON local (sin módulos nativos)
 * Estructura del archivo data.json:
 * {
 *   vehiculos:  [ { id, nombre, matricula, km_actual } ],
 *   profesores: [ { id, nombre, nota } ],
 *   alumnos:    [ { id, nombre, permiso, vehiculo_id } ],
 *   practicas:  [ { id, alumno_id, vehiculo_id, fecha, km_inicial, km_final, profesor_id, tipo } ],
 *   tarifas:    [ { id, permiso, tipo, precio } ],
 *   pagos:      [ { id, alumno_id, fecha, cantidad, nota } ]
 * }
 */

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

let dataPath;
let _data = null;

// Referencia lazy a sync para evitar dependencia circular
function _sync() {
  try { return require('./sync'); } catch { return null; }
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
  if (!_data) _data = { vehiculos: [], profesores: [], alumnos: [], practicas: [], tarifas: [], pagos: [], logs: [], _seq: { v: 1, pf: 1, a: 1, p: 1, t: 1, pg: 1 } };
  if (!_data._seq) _data._seq = { v: 1, pf: 1, a: 1, p: 1 };
  if (!_data._seq.pf) _data._seq.pf = 1;
  if (!_data._seq.t) _data._seq.t = 1;
  if (!_data._seq.pg) _data._seq.pg = 1;
  if (!_data.logs) _data.logs = [];
  if (!_data.profesores) _data.profesores = [];
  if (!_data.tarifas) _data.tarifas = [];
  if (!_data.pagos) _data.pagos = [];
  return _data;
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

// ─── VALIDACIÓN CRUZADA DE KM ────────────────────────────────────────────────
/**
 * Comprueba si el rango [kmI, kmF] para un vehículo en una fecha concreta
 * se solapa con alguna práctica ya existente del mismo vehículo.
 * Devuelve lista de conflictos encontrados.
 */
function validarSolapamiento(vehiculo_id, fecha, kmI, kmF, excluirPracticaId = null) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const conflictos = [];

  const practicas = d.practicas.filter(p =>
    p.vehiculo_id === vid &&
    p.id !== excluirPracticaId &&
    !(p.km_inicial === 0 && p.km_final === 0)
  );

  for (const p of practicas) {
    // Solapamiento de rangos km
    if (kmI < p.km_final && p.km_inicial < kmF) {
      const alumno = d.alumnos.find(a => a.id === p.alumno_id);
      conflictos.push({
        alumno: alumno ? alumno.nombre : '?',
        fecha: p.fecha,
        km_inicial: p.km_inicial,
        km_final: p.km_final
      });
    }
  }

  return conflictos;
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

// ─── VEHÍCULOS ───────────────────────────────────────────────────────────────
function getVehiculos() {
  return load().vehiculos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function addVehiculo(nombre, matricula, km_actual) {
  const d = load();
  const id = nextId('v');
  d.vehiculos.push({ id, nombre, matricula: matricula || '', km_actual: parseFloat(km_actual) || 0 });
  save();
  const s = _sync(); if (s) s.markDirty('vehiculos', id);
  return id;
}

function updateVehiculoKm(id, km) {
  const d = load();
  const v = d.vehiculos.find(x => x.id === id);
  if (v) { v.km_actual = parseFloat(km); save(); const s = _sync(); if (s) s.markDirty('vehiculos', id); }
}

function deleteVehiculo(id) {
  const d = load();
  d.vehiculos = d.vehiculos.filter(x => x.id !== id);
  d.alumnos.forEach(a => { if (a.vehiculo_id === id) a.vehiculo_id = null; });
  save();
  const s = _sync(); if (s) s.markDeleted('vehiculos', id);
}

// ─── PROFESORES ──────────────────────────────────────────────────────────────
function getProfesores() {
  const d = load();
  return d.profesores
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map(p => ({ ...p, num_practicas: d.practicas.filter(x => x.profesor_id === p.id).length }));
}

function addProfesor(nombre, nota) {
  const d = load();
  const id = nextId('pf');
  d.profesores.push({ id, nombre, nota: nota || '' });
  save();
  const s = _sync(); if (s) s.markDirty('profesores', id);
  return id;
}

function updateProfesor(id, nombre, nota) {
  const d = load();
  const p = d.profesores.find(x => x.id === id);
  if (p) {
    p.nombre = nombre;
    p.nota = nota || '';
    save();
    const s = _sync(); if (s) s.markDirty('profesores', id);
  }
}

function deleteProfesor(id) {
  const d = load();
  d.profesores = d.profesores.filter(x => x.id !== id);
  // Las prácticas ya impartidas conservan su profesor_id: no se tocan ni se
  // reasignan, igual que las prácticas de un alumno borrado conservan sus km.
  save();
  const s = _sync(); if (s) s.markDeleted('profesores', id);
}

// ─── TARIFAS ─────────────────────────────────────────────────────────────────
function getTarifas() {
  const d = load();
  return d.tarifas
    .slice()
    .sort((a, b) => a.permiso.localeCompare(b.permiso) || a.tipo.localeCompare(b.tipo));
}

function setTarifa(permiso, tipo, precio) {
  const d = load();
  const t = d.tarifas.find(x => x.permiso === permiso && x.tipo === tipo);
  if (t) {
    t.precio = parseFloat(precio) || 0;
    save();
    const s = _sync(); if (s) s.markDirty('tarifas', t.id);
    return t.id;
  }
  const id = nextId('t');
  d.tarifas.push({ id, permiso, tipo, precio: parseFloat(precio) || 0 });
  save();
  const s = _sync(); if (s) s.markDirty('tarifas', id);
  return id;
}

function deleteTarifa(id) {
  const d = load();
  d.tarifas = d.tarifas.filter(x => x.id !== id);
  save();
  const s = _sync(); if (s) s.markDeleted('tarifas', id);
}

// ─── ALUMNOS ─────────────────────────────────────────────────────────────────
function getAlumnos() {
  const d = load();
  return d.alumnos
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map(a => {
      const v = d.vehiculos.find(x => x.id === a.vehiculo_id);
      return { ...a, vehiculo_nombre: v ? v.nombre : null };
    });
}

function addAlumno(nombre, permiso, vehiculo_id) {
  const d = load();
  const id = nextId('a');
  d.alumnos.push({ id, nombre, permiso: permiso || 'B', vehiculo_id: vehiculo_id ? parseInt(vehiculo_id) : null });
  save();
  const s = _sync(); if (s) s.markDirty('alumnos', id);
  return id;
}

function deleteAlumno(id) {
  const d = load();
  // Encolar también el borrado de sus prácticas en la nube: si no, quedan
  // "vivas" en Supabase y reaparecen al reconstruir otro PC.
  const practicasDelAlumno = d.practicas.filter(x => x.alumno_id === id).map(x => x.id);
  d.alumnos   = d.alumnos.filter(x => x.id !== id);
  d.practicas = d.practicas.filter(x => x.alumno_id !== id);
  save();
  const s = _sync();
  if (s) {
    for (const pid of practicasDelAlumno) s.markDeleted('practicas', pid);
    s.markDeleted('alumnos', id);
  }
}

function updateAlumno(id, nombre, permiso, vehiculo_id) {
  const d = load();
  const a = d.alumnos.find(x => x.id === id);
  if (a) {
    a.nombre = nombre;
    a.permiso = permiso;
    a.vehiculo_id = vehiculo_id ? parseInt(vehiculo_id) : null;
    save();
    const s = _sync(); if (s) s.markDirty('alumnos', id);
  }
}

// ─── PRÁCTICAS ───────────────────────────────────────────────────────────────
function getPracticasByAlumno(alumno_id) {
  const d = load();
  return d.practicas
    .filter(p => p.alumno_id === alumno_id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
    .map(p => {
      const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
      const prof = d.profesores.find(x => x.id === p.profesor_id);
      return { ...p, vehiculo_nombre: v ? v.nombre : null, profesor_nombre: prof ? prof.nombre : null };
    });
}

function getUltimaPractica(alumno_id) {
  const practicas = getPracticasByAlumno(alumno_id);
  return practicas.length ? practicas[practicas.length - 1] : null;
}

function addPractica(alumno_id, vehiculo_id, fecha, km_inicial, km_final, profesor_id = null, tipo = 'circulacion') {
  const d = load();
  const id = nextId('p');
  const ki = parseFloat(km_inicial);
  const kf = parseFloat(km_final);
  d.practicas.push({
    id, alumno_id: parseInt(alumno_id), vehiculo_id: parseInt(vehiculo_id), fecha, km_inicial: ki, km_final: kf,
    profesor_id: profesor_id ? parseInt(profesor_id) : null,
    tipo: tipo || 'circulacion'
  });
  // Actualizar km vehículo si corresponde
  const v = d.vehiculos.find(x => x.id === parseInt(vehiculo_id));
  if (v && kf > v.km_actual) v.km_actual = kf;
  save();
  const s = _sync(); if (s) s.markDirty('practicas', id);
  return id;
}

function deletePractica(id) {
  const d = load();
  d.practicas = d.practicas.filter(x => x.id !== id);
  save();
  const s = _sync(); if (s) s.markDeleted('practicas', id);
}

function updatePractica(id, fecha, km_inicial, km_final, profesor_id = null, tipo = 'circulacion') {
  const d = load();
  const p = d.practicas.find(x => x.id === id);
  if (p) {
    p.fecha = fecha;
    p.km_inicial = parseFloat(km_inicial);
    p.km_final = parseFloat(km_final);
    p.profesor_id = profesor_id ? parseInt(profesor_id) : null;
    p.tipo = tipo || 'circulacion';
    save();
    const s = _sync(); if (s) s.markDirty('practicas', id);
  }
}

// ─── PAGOS ───────────────────────────────────────────────────────────────────
function getPagosByAlumno(alumno_id) {
  const d = load();
  const aid = parseInt(alumno_id);
  return d.pagos
    .filter(p => p.alumno_id === aid)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
}

function addPago(alumno_id, fecha, cantidad, nota) {
  const d = load();
  const id = nextId('pg');
  d.pagos.push({
    id,
    alumno_id: parseInt(alumno_id),
    fecha,
    cantidad: parseFloat(cantidad) || 0,
    nota: nota || ''
  });
  save();
  const s = _sync(); if (s) s.markDirty('pagos', id);
  return id;
}

function updatePago(id, fecha, cantidad, nota) {
  const d = load();
  const p = d.pagos.find(x => x.id === id);
  if (p) {
    p.fecha = fecha;
    p.cantidad = parseFloat(cantidad) || 0;
    p.nota = nota || '';
    save();
    const s = _sync(); if (s) s.markDirty('pagos', id);
  }
}

function deletePago(id) {
  const d = load();
  d.pagos = d.pagos.filter(x => x.id !== id);
  save();
  const s = _sync(); if (s) s.markDeleted('pagos', id);
}

function getDeudas() {
  const d = load();
  return d.alumnos
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map(alumno => {
      const practicasAlumno = d.practicas.filter(p => p.alumno_id === alumno.id);
      let total_generado = 0;
      let sin_tarifa = false;
      for (const p of practicasAlumno) {
        const tipo = p.tipo || 'circulacion';
        const tarifa = d.tarifas.find(t => t.permiso === alumno.permiso && t.tipo === tipo);
        if (tarifa) {
          total_generado += tarifa.precio;
        } else {
          sin_tarifa = true;
        }
      }
      const total_pagado = getPagosByAlumno(alumno.id).reduce((sum, p) => sum + p.cantidad, 0);
      const saldo = total_generado - total_pagado;
      return {
        alumno_id: alumno.id,
        alumno_nombre: alumno.nombre,
        permiso: alumno.permiso,
        num_practicas: practicasAlumno.length,
        total_generado,
        total_pagado,
        saldo,
        sin_tarifa
      };
    });
}

// ─── IMPORTACIÓN CSV ─────────────────────────────────────────────────────────
function _randomKm(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function importarCSV(rows, kmMin = 40, kmMax = 45) {
  const d = load();
  let insertados = 0;
  const erroresDetalle = [];
  // Cache: último km_final por alumno_id para encadenar prácticas generadas
  const ultimoKmPorAlumno = {};

  rows.forEach((row, idx) => {
    try {
      const alumno  = (row.alumno  || '').trim();
      const vehiculo = (row.vehiculo || '').trim();
      const fecha   = (row.fecha   || '').trim();

      if (!alumno)   { erroresDetalle.push({ fila: idx + 2, motivo: 'Nombre de alumno vacío', datos: JSON.stringify(row) }); return; }
      if (!vehiculo) { erroresDetalle.push({ fila: idx + 2, motivo: 'Vehículo vacío', datos: JSON.stringify(row) }); return; }
      if (!fecha)    { erroresDetalle.push({ fila: idx + 2, motivo: 'Fecha vacía', datos: JSON.stringify(row) }); return; }

      // Validar formato fecha AAAA-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        erroresDetalle.push({ fila: idx + 2, motivo: `Formato de fecha incorrecto: "${fecha}" (debe ser AAAA-MM-DD)`, datos: `${alumno} / ${fecha}` });
        return;
      }

      // Vehículo
      let v = d.vehiculos.find(x => x.nombre.toLowerCase() === vehiculo.toLowerCase());
      if (!v) {
        const vid = nextId('v');
        v = { id: vid, nombre: vehiculo, matricula: '', km_actual: 0 };
        d.vehiculos.push(v);
        const s = _sync(); if (s) s.markDirty('vehiculos', vid);
      }

      // Alumno
      let a = d.alumnos.find(x => x.nombre.toLowerCase() === alumno.toLowerCase());
      if (!a) {
        const aid = nextId('a');
        a = { id: aid, nombre: alumno, permiso: 'B', vehiculo_id: v.id };
        d.alumnos.push(a);
        const s = _sync(); if (s) s.markDirty('alumnos', aid);
      }

      // Kilómetros
      let kmI = parseFloat(row.km_inicial);
      let kmF = parseFloat(row.km_final);
      const tieneKms = !isNaN(kmI) && !isNaN(kmF);

      if (tieneKms && kmF <= kmI) {
        erroresDetalle.push({ fila: idx + 2, motivo: `Km final (${kmF}) debe ser mayor que km inicial (${kmI})`, datos: `${alumno} / ${fecha}` });
        return;
      }

      if (!tieneKms) {
        let base = ultimoKmPorAlumno[a.id];
        if (base === undefined) {
          const practicasAlumno = d.practicas
            .filter(p => p.alumno_id === a.id)
            .sort((x, y) => x.fecha.localeCompare(y.fecha) || x.id - y.id);
          base = practicasAlumno.length ? practicasAlumno[practicasAlumno.length - 1].km_final : v.km_actual;
        }
        kmI = base;
        kmF = Math.round((kmI + _randomKm(kmMin, kmMax)) * 10) / 10;
      }

      const pid = nextId('p');
      d.practicas.push({ id: pid, alumno_id: a.id, vehiculo_id: v.id, fecha, km_inicial: kmI, km_final: kmF });
      const s = _sync(); if (s) s.markDirty('practicas', pid);
      if (kmF > v.km_actual) {
        v.km_actual = kmF;
        if (s) s.markDirty('vehiculos', v.id);
      }
      ultimoKmPorAlumno[a.id] = kmF;
      insertados++;
    } catch (e) {
      erroresDetalle.push({ fila: idx + 2, motivo: `Error inesperado: ${e.message}`, datos: JSON.stringify(row) });
    }
  });

  addLog('importacion', `Importación CSV: ${insertados} prácticas insertadas, ${erroresDetalle.length} errores`,
    erroresDetalle.map(e => `⚠ Fila ${e.fila}: ${e.motivo} [${e.datos}]`)
  );
  save();
  return { insertados, errores: erroresDetalle.length, erroresDetalle };
}

// ─── EXPORTACIÓN CSV ─────────────────────────────────────────────────────────
/**
 * Exporta todas las prácticas en formato CSV compatible con importarCSV.
 * Opciones: filtrar por alumno_id, vehiculo_id, rango de fechas.
 */
function exportarCSV(opciones = {}) {
  const d = load();
  let practicas = d.practicas.filter(p => !p.deleted);

  if (opciones.alumno_id) practicas = practicas.filter(p => p.alumno_id === parseInt(opciones.alumno_id));
  if (opciones.vehiculo_id) practicas = practicas.filter(p => p.vehiculo_id === parseInt(opciones.vehiculo_id));
  if (opciones.fecha_desde) practicas = practicas.filter(p => p.fecha >= opciones.fecha_desde);
  if (opciones.fecha_hasta) practicas = practicas.filter(p => p.fecha <= opciones.fecha_hasta);

  practicas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);

  const lineas = ['alumno,vehiculo,fecha,km_inicial,km_final'];
  for (const p of practicas) {
    const alumno = d.alumnos.find(a => a.id === p.alumno_id);
    const vehiculo = d.vehiculos.find(v => v.id === p.vehiculo_id);
    const escapar = s => s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    lineas.push([
      escapar(alumno ? alumno.nombre : '?'),
      escapar(vehiculo ? vehiculo.nombre : '?'),
      p.fecha,
      p.km_inicial,
      p.km_final
    ].join(','));
  }
  return { csv: lineas.join('\n'), total: practicas.length };
}

// ─── COMPARADOR DE CSV ───────────────────────────────────────────────────────
/**
 * Compara dos arrays de prácticas (ya parseados) y devuelve análisis detallado.
 * csvA: origen (ej: generado por IA), csvB: destino (ej: anotaciones manuales)
 */
function compararCSVs(rowsA, rowsB, opciones = {}) {
  const normalizarNombre = n => (n || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Parsear filas
  const parsear = (rows) => rows.map((r, i) => ({
    alumno: (r.alumno || '').trim(),
    alumnoNorm: normalizarNombre(r.alumno),
    fecha: (r.fecha || '').trim(),
    fila: i + 2
  })).filter(p => p.alumno && p.fecha);

  const practicasA = parsear(rowsA);
  const practicasB = parsear(rowsB);

  // Agrupar por alumno -> fecha -> cantidad
  const agrupar = (practicas) => {
    const mapa = new Map(); // alumnoNorm -> { nombre, fechas: Map<fecha, count> }
    for (const p of practicas) {
      if (!mapa.has(p.alumnoNorm)) {
        mapa.set(p.alumnoNorm, { nombre: p.alumno, fechas: new Map() });
      }
      const alumno = mapa.get(p.alumnoNorm);
      alumno.fechas.set(p.fecha, (alumno.fechas.get(p.fecha) || 0) + 1);
    }
    return mapa;
  };

  const grupoA = agrupar(practicasA);
  const grupoB = agrupar(practicasB);

  // Obtener todos los alumnos (unión de A y B)
  const todosAlumnos = new Map();
  for (const [norm, data] of grupoA) todosAlumnos.set(norm, data.nombre);
  for (const [norm, data] of grupoB) if (!todosAlumnos.has(norm)) todosAlumnos.set(norm, data.nombre);

  const resultado = {
    resumen: { 
      totalA: practicasA.length, 
      totalB: practicasB.length, 
      diasCoinciden: 0, 
      diasConflicto: 0, 
      diasSoloEnA: 0, 
      diasSoloEnB: 0,
      alumnosTotal: todosAlumnos.size
    },
    porAlumno: [], // { nombre, coincidencias: [{fecha, cant}], conflictos: [{fecha, cantA, cantB}], soloEnA: [{fecha, cant}], soloEnB: [{fecha, cant}] }
    alumnosSoloEnA: [],
    alumnosSoloEnB: []
  };

  // Comparar por alumno
  for (const [alumnoNorm, nombre] of todosAlumnos) {
    const fechasA = grupoA.get(alumnoNorm)?.fechas || new Map();
    const fechasB = grupoB.get(alumnoNorm)?.fechas || new Map();
    
    // Si el alumno solo está en uno de los CSV
    if (!grupoA.has(alumnoNorm)) {
      resultado.alumnosSoloEnB.push(nombre);
      const soloEnB = [];
      for (const [fecha, cant] of fechasB) {
        soloEnB.push({ fecha, cant });
        resultado.resumen.diasSoloEnB++;
      }
      resultado.porAlumno.push({ nombre, coincidencias: [], conflictos: [], soloEnA: [], soloEnB });
      continue;
    }
    if (!grupoB.has(alumnoNorm)) {
      resultado.alumnosSoloEnA.push(nombre);
      const soloEnA = [];
      for (const [fecha, cant] of fechasA) {
        soloEnA.push({ fecha, cant });
        resultado.resumen.diasSoloEnA++;
      }
      resultado.porAlumno.push({ nombre, coincidencias: [], conflictos: [], soloEnA, soloEnB: [] });
      continue;
    }

    // Alumno está en ambos - comparar fechas
    const todasFechas = new Set([...fechasA.keys(), ...fechasB.keys()]);
    const coincidencias = [], conflictos = [], soloEnA = [], soloEnB = [];

    for (const fecha of todasFechas) {
      const cantA = fechasA.get(fecha) || 0;
      const cantB = fechasB.get(fecha) || 0;

      if (cantA > 0 && cantB > 0) {
        if (cantA === cantB) {
          coincidencias.push({ fecha, cant: cantA });
          resultado.resumen.diasCoinciden++;
        } else {
          conflictos.push({ fecha, cantA, cantB });
          resultado.resumen.diasConflicto++;
        }
      } else if (cantA > 0) {
        soloEnA.push({ fecha, cant: cantA });
        resultado.resumen.diasSoloEnA++;
      } else {
        soloEnB.push({ fecha, cant: cantB });
        resultado.resumen.diasSoloEnB++;
      }
    }

    // Ordenar por fecha
    const ordenar = arr => arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
    resultado.porAlumno.push({
      nombre,
      coincidencias: ordenar(coincidencias),
      conflictos: ordenar(conflictos),
      soloEnA: ordenar(soloEnA),
      soloEnB: ordenar(soloEnB)
    });
  }

  // Ordenar alumnos por nombre
  resultado.porAlumno.sort((a, b) => a.nombre.localeCompare(b.nombre));

  return resultado;
}

// ─── RELLENO MASIVO DE KM ────────────────────────────────────────────────────
/**
 * Rellena los km en blanco (km_inicial=0 y km_final=0) de todas las prácticas
 * de un vehículo dado, de forma coherente con el odómetro global del vehículo.
 *
 * Algoritmo:
 * 1. Ordena TODAS las prácticas del vehículo por fecha y por km_inicial (nulls al final).
 * 2. Recorre la lista con un cursor = km actual del vehículo.
 * 3. Para cada práctica con km reales: avanza el cursor si km_final > cursor.
 * 4. Para cada práctica sin km (0,0): asigna km_inicial=cursor, km_final=cursor+rand(min,max).
 */
function rellenarKmMasivo(vehiculo_id, kmMin = 40, kmMax = 45, kmInicio = null, kmFinal = null) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return { rellenadas: 0, errores: ['Vehículo no encontrado'] };

  // Prácticas del vehículo
  const practicas = d.practicas.filter(p => p.vehiculo_id === vid);
  if (!practicas.length) return { rellenadas: 0, errores: [] };

  // Separar las que tienen km reales y las que están en blanco (0,0)
  const conKm   = practicas.filter(p => !(p.km_inicial === 0 && p.km_final === 0)).sort((a, b) => {
    const dc = a.fecha.localeCompare(b.fecha);
    return dc !== 0 ? dc : a.km_inicial - b.km_inicial;
  });
  const sinKm   = practicas.filter(p => p.km_inicial === 0 && p.km_final === 0).sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (!sinKm.length) return { rellenadas: 0, errores: [] };

  // Cursor inicial: usar kmInicio si se proporciona, sino km_actual del vehículo
  const cursorInicial = (kmInicio !== null && kmInicio > 0) ? kmInicio : v.km_actual;
  
  // Tope final: si se proporciona, no superar este km
  const topeFinal = (kmFinal !== null && kmFinal > 0) ? kmFinal : null;

  // Ordenar todas las fechas únicas
  const todasFechas = [...new Set([...conKm.map(p => p.fecha), ...sinKm.map(p => p.fecha)])].sort();

  let rellenadas = 0;
  let saltadas = 0;

  for (const fecha of todasFechas) {
    const sinKmHoy = sinKm.filter(p => p.fecha === fecha);
    if (!sinKmHoy.length) continue;

    // Calcular cursor para este día
    let cursor = cursorInicial;
    conKm.forEach(p => {
      if (p.fecha <= fecha && p.km_final > cursor) cursor = p.km_final;
    });
    sinKm.forEach(p => {
      if (p.fecha < fecha && p.km_final > 0 && p.km_final > cursor) cursor = p.km_final;
    });

    // Rellenar las prácticas sin km de este día
    for (const p of sinKmHoy) {
      const kmI = cursor;
      const incremento = _randomKm(kmMin, kmMax);
      let kmF = Math.round((kmI + incremento) * 10) / 10;
      
      // Si hay tope final y lo superaríamos, saltar esta práctica
      if (topeFinal !== null && kmF > topeFinal) {
        saltadas++;
        continue;
      }
      
      p.km_inicial = kmI;
      p.km_final   = kmF;
      cursor = kmF;
      rellenadas++;
      // Marcar el cambio para que los km lleguen a la nube (antes solo quedaban en este PC)
      const s = _sync(); if (s) s.markDirty('practicas', p.id);
    }
  }

  // Actualizar km_actual del vehículo si creció
  let maxKm = v.km_actual;
  d.practicas.filter(p => p.vehiculo_id === vid).forEach(p => { if (p.km_final > maxKm) maxKm = p.km_final; });
  if (maxKm !== v.km_actual) {
    v.km_actual = maxKm;
    const s = _sync(); if (s) s.markDirty('vehiculos', vid);
  }

  const detallesLog = sinKm.filter(p => p.km_final > 0).map(p => {
    const alumno = load().alumnos.find(a => a.id === p.alumno_id);
    return `${alumno ? alumno.nombre : '?'} / ${fmtFechaLog(p.fecha)}: ${p.km_inicial} → ${p.km_final} km`;
  });
  const rangoInfo = kmInicio || kmFinal 
    ? `(rango ${kmMin}-${kmMax} km, tope ${kmInicio || '?'}-${kmFinal || '?'} km)` 
    : `(rango ${kmMin}-${kmMax} km)`;
  addLog('relleno', `Relleno masivo ${v.nombre}: ${rellenadas} rellenada(s)${saltadas ? `, ${saltadas} saltada(s) por tope` : ''} ${rangoInfo}`, detallesLog);
  save();
  return { rellenadas, saltadas };
}

function getPracticasSinKm(vehiculo_id) {
  const d = load();
  return d.practicas
    .filter(p => p.vehiculo_id === parseInt(vehiculo_id) && p.km_inicial === 0 && p.km_final === 0)
    .length;
}

// ─── CORRECCIÓN QUIRÚRGICA DE SOLAPAMIENTOS ──────────────────────────────────
/**
 * Algoritmo quirúrgico: solo toca las prácticas que están en conflicto real.
 * Para cada par solapado, mantiene intacta la práctica "ancla" (la que empieza
 * antes o tiene id menor) y desplaza la otra para que empiece justo donde
 * termina la ancla, conservando su duración original.
 * Se repite hasta que no queden solapamientos (máx 10 pasadas).
 */
function corregirSolapamientos(vehiculo_id, kmMin = 40, kmMax = 45) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return { corregidas: 0 };

  const cambios = {}; // id -> { antes, despues }
  const MAX_PASADAS = 10;

  for (let pasada = 0; pasada < MAX_PASADAS; pasada++) {
    const practicas = d.practicas
      .filter(p => p.vehiculo_id === vid && !(p.km_inicial === 0 && p.km_final === 0))
      .sort((a, b) => a.km_inicial - b.km_inicial);

    let encontrado = false;

    for (let i = 0; i < practicas.length; i++) {
      for (let j = i + 1; j < practicas.length; j++) {
        const ancla  = practicas[i];
        const movil  = practicas[j];

        // No hay solapamiento
        if (movil.km_inicial >= ancla.km_final) break;

        // Solapamiento detectado: desplazar "movil" para que empiece donde acaba "ancla"
        const duracion = Math.max(Math.round((movil.km_final - movil.km_inicial) * 10) / 10, 1);
        const nuevaKi  = Math.round(ancla.km_final * 10) / 10;
        const nuevaKf  = Math.round((nuevaKi + duracion) * 10) / 10;

        if (!cambios[movil.id]) {
          cambios[movil.id] = { alumno: (d.alumnos.find(a => a.id === movil.alumno_id) || {}).nombre || '?', fecha: movil.fecha, antes_ki: movil.km_inicial, antes_kf: movil.km_final };
        }

        movil.km_inicial = nuevaKi;
        movil.km_final   = nuevaKf;
        cambios[movil.id].despues_ki = nuevaKi;
        cambios[movil.id].despues_kf = nuevaKf;

        encontrado = true;
      }
    }

    if (!encontrado) break;
  }

  const corregidas = Object.keys(cambios).length;

  if (corregidas > 0) {
    // Marcar los cambios para que lleguen a la nube (antes solo quedaban en este PC)
    const s = _sync();
    if (s) Object.keys(cambios).forEach(id => s.markDirty('practicas', Number(id)));

    // Actualizar km_actual del vehículo
    const maxKm = Math.max(...d.practicas.filter(p => p.vehiculo_id === vid).map(p => p.km_final));
    if (maxKm > v.km_actual) {
      v.km_actual = maxKm;
      if (s) s.markDirty('vehiculos', vid);
    }

    const detalles = Object.values(cambios).map(c =>
      `${c.alumno} / ${fmtFechaLog(c.fecha)}: ${c.antes_ki}→${c.antes_kf}  ➜  ${c.despues_ki}→${c.despues_kf} km`
    );
    addLog('correccion', `Corrección solapamientos ${v.nombre}: ${corregidas} práctica(s) ajustadas`, detalles);
    save();
  }

  return { corregidas };
}
// ─── SOLAPAMIENTOS ───────────────────────────────────────────────────────────
function getSolapamientos() {
  const d = load();
  const conflictos = [];

  // Agrupar prácticas por vehículo
  const porVehiculo = {};
  d.practicas.forEach(p => {
    if (!porVehiculo[p.vehiculo_id]) porVehiculo[p.vehiculo_id] = [];
    porVehiculo[p.vehiculo_id].push(p);
  });

  for (const [vidStr, practicas] of Object.entries(porVehiculo)) {
    const vid = parseInt(vidStr);
    const v = d.vehiculos.find(x => x.id === vid);
    const vNombre = v ? v.nombre : `Vehículo #${vid}`;

    // Ordenar por km_inicial
    const sorted = practicas.slice().sort((a, b) => a.km_inicial - b.km_inicial);

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        // Solapamiento: los rangos [a.km_inicial, a.km_final] y [b.km_inicial, b.km_final] se intersectan
        if (a.km_inicial < b.km_final && b.km_inicial < a.km_final) {
          // Solo reportar si son de distinto alumno O misma práctica duplicada
          const alumnoA = d.alumnos.find(x => x.id === a.alumno_id);
          const alumnoB = d.alumnos.find(x => x.id === b.alumno_id);
          conflictos.push({
            vehiculo: vNombre,
            vehiculo_id: vid,
            practica_a: { id: a.id, alumno: alumnoA ? alumnoA.nombre : '?', fecha: a.fecha, km_inicial: a.km_inicial, km_final: a.km_final },
            practica_b: { id: b.id, alumno: alumnoB ? alumnoB.nombre : '?', fecha: b.fecha, km_inicial: b.km_inicial, km_final: b.km_final }
          });
        }
        // Si b.km_inicial >= a.km_final ya no puede haber solapamiento con los siguientes (están ordenados)
        if (b.km_inicial >= a.km_final) break;
      }
    }
  }

  return conflictos;
}

function getResumen() {
  const d = load();
  const sinKm = d.practicas.filter(p => p.km_inicial === 0 && p.km_final === 0).length;
  // Contar solapamientos
  const conflictos = getSolapamientos();
  return {
    vehiculos: d.vehiculos.length,
    alumnos: d.alumnos.length,
    practicas: d.practicas.length,
    sinKm,
    solapamientos: conflictos.length
  };
}

// ─── ALUMNOS POR VEHÍCULO (para registro rápido) ─────────────────────────────
/**
 * Devuelve todos los alumnos asignados a un vehículo específico,
 * junto con si ya tienen práctica registrada en la fecha indicada.
 */
function getAlumnosPorVehiculo(vehiculo_id, fecha) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  
  const alumnos = d.alumnos
    .filter(a => a.vehiculo_id === vid)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  
  return alumnos.map(a => {
    // Contar cuántas prácticas tiene ese día y obtener nota si existe
    const practicasHoy = d.practicas.filter(p => 
      p.alumno_id === a.id && 
      p.vehiculo_id === vid && 
      p.fecha === fecha
    );
    const nota = practicasHoy.length > 0 ? (practicasHoy[0].nota || '') : '';
    return {
      id: a.id,
      nombre: a.nombre,
      permiso: a.permiso,
      num_practicas: practicasHoy.length,
      nota: nota
    };
  });
}

/**
 * Registra prácticas masivas para varios alumnos en una fecha.
 * Añade práctica con km 0,0 (para rellenar después con relleno masivo).
 */
function registrarPracticasMasivas(vehiculo_id, fecha, alumno_ids) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  let registradas = 0;
  const detalles = [];

  for (const aid of alumno_ids) {
    const alumno_id = parseInt(aid);
    // Verificar que no exista ya práctica ese día para ese alumno/vehículo
    const existe = d.practicas.some(p => 
      p.alumno_id === alumno_id && 
      p.vehiculo_id === vid && 
      p.fecha === fecha
    );
    if (existe) continue;

    const alumno = d.alumnos.find(a => a.id === alumno_id);
    if (!alumno) continue;

    const pid = nextId('p');
    d.practicas.push({
      id: pid,
      alumno_id,
      vehiculo_id: vid,
      fecha,
      km_inicial: 0,
      km_final: 0
    });
    registradas++;
    detalles.push(`${alumno.nombre} (${fecha})`);
    const s = _sync(); if (s) s.markDirty('practicas', pid);
  }

  if (registradas > 0) {
    addLog('registro_rapido', `Registro rápido: ${registradas} práctica(s) añadidas`, detalles);
    save();
  }

  return { registradas };
}

/**
 * Ajusta el número de prácticas de un alumno en una fecha.
 * Si delta > 0, añade prácticas. Si delta < 0, elimina.
 */
function ajustarPracticasAlumno(vehiculo_id, fecha, alumno_id, delta, profesor_id = null, tipo = 'circulacion') {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const aid = parseInt(alumno_id);

  const practicasExistentes = d.practicas.filter(p =>
    p.alumno_id === aid &&
    p.vehiculo_id === vid &&
    p.fecha === fecha
  );

  const actual = practicasExistentes.length;
  const nuevo = Math.max(0, actual + delta);
  const diff = nuevo - actual;

  if (diff > 0) {
    // Añadir prácticas
    for (let i = 0; i < diff; i++) {
      const pid = nextId('p');
      d.practicas.push({
        id: pid,
        alumno_id: aid,
        vehiculo_id: vid,
        fecha,
        km_inicial: 0,
        km_final: 0,
        profesor_id: profesor_id ? parseInt(profesor_id) : null,
        tipo: tipo || 'circulacion'
      });
      const s = _sync(); if (s) s.markDirty('practicas', pid);
    }
  } else if (diff < 0) {
    // Eliminar prácticas (las más recientes primero)
    const aEliminar = practicasExistentes.slice(diff); // últimas |diff|
    for (const p of aEliminar) {
      const idx = d.practicas.findIndex(x => x.id === p.id);
      if (idx !== -1) {
        d.practicas.splice(idx, 1);
        const s = _sync(); if (s) s.markDeleted('practicas', p.id);
      }
    }
  }
  
  if (diff !== 0) save();
  return { num_practicas: nuevo };
}

/**
 * Guarda una nota en las prácticas de un alumno para una fecha.
 * Si no tiene prácticas ese día, crea una con km=0 para poder guardar la nota.
 */
function guardarNotaAlumno(vehiculo_id, fecha, alumno_id, nota, profesor_id = null, tipo = 'circulacion') {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const aid = parseInt(alumno_id);

  let practicas = d.practicas.filter(p =>
    p.alumno_id === aid &&
    p.vehiculo_id === vid &&
    p.fecha === fecha
  );

  // Si no tiene prácticas ese día, crear una para poder guardar la nota
  if (practicas.length === 0 && nota) {
    const nuevaPractica = {
      id: d._seq.p++,
      alumno_id: aid,
      vehiculo_id: vid,
      fecha: fecha,
      km_inicial: 0,
      km_final: 0,
      nota: nota,
      profesor_id: profesor_id ? parseInt(profesor_id) : null,
      tipo: tipo || 'circulacion'
    };
    d.practicas.push(nuevaPractica);
    save();
    const s = _sync(); if (s) s.markDirty('practicas', nuevaPractica.id);
    return { ok: true, created: true };
  }
  
  if (practicas.length > 0) {
    practicas[0].nota = nota;
    save();
    const s = _sync(); if (s) s.markDirty('practicas', practicas[0].id);
  }
  
  return { ok: true };
}

/**
 * Elimina práctica de un alumno en una fecha específica para un vehículo.
 */
function eliminarPracticaPorFecha(vehiculo_id, fecha, alumno_id) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const aid = parseInt(alumno_id);
  
  const idx = d.practicas.findIndex(p => 
    p.alumno_id === aid && 
    p.vehiculo_id === vid && 
    p.fecha === fecha
  );
  
  if (idx !== -1) {
    const practica = d.practicas[idx];
    d.practicas.splice(idx, 1);
    save();
    const s = _sync(); if (s) s.markDeleted('practicas', practica.id);
    return { eliminada: true };
  }
  return { eliminada: false };
}

// ─── TIMELINE DE VEHÍCULO ────────────────────────────────────────────────────
/**
 * Devuelve todas las prácticas de un vehículo ordenadas por km_inicial,
 * con datos de alumno y flag de solapamiento con la anterior.
 */
function getTimelineVehiculo(vehiculo_id) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return [];

  const practicas = d.practicas
    .filter(p => p.vehiculo_id === vid)
    .sort((a, b) => {
      // Las sin km van al final
      const aSinKm = a.km_inicial === 0 && a.km_final === 0;
      const bSinKm = b.km_inicial === 0 && b.km_final === 0;
      if (aSinKm && !bSinKm) return 1;
      if (!aSinKm && bSinKm) return -1;
      if (aSinKm && bSinKm) return a.fecha.localeCompare(b.fecha);
      return a.km_inicial - b.km_inicial || a.fecha.localeCompare(b.fecha);
    });

  return practicas.map((p, i) => {
    const alumno = d.alumnos.find(a => a.id === p.alumno_id);
    const sinKm = p.km_inicial === 0 && p.km_final === 0;
    // Detectar hueco o solapamiento con la práctica anterior con km
    let gap = null; // null=ok, >0=hueco, <0=solapa
    if (!sinKm && i > 0) {
      const prevConKm = practicas.slice(0, i).reverse().find(x => !(x.km_inicial === 0 && x.km_final === 0));
      if (prevConKm) {
        const diff = Math.round((p.km_inicial - prevConKm.km_final) * 10) / 10;
        if (diff !== 0) gap = diff;
      }
    }
    return {
      ...p,
      alumno_nombre: alumno ? alumno.nombre : '?',
      sin_km: sinKm,
      gap
    };
  });
}

/**
 * Devuelve todas las anotaciones de un alumno (prácticas que tienen nota).
 * Cada entrada incluye fecha, vehículo y texto de la nota.
 */
function getAnotacionesAlumno(alumno_id) {
  const d = load();
  const aid = parseInt(alumno_id);
  return d.practicas
    .filter(p => p.alumno_id === aid && p.nota && p.nota.trim() !== '')
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    .map(p => {
      const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
      return {
        id: p.id,
        fecha: p.fecha,
        vehiculo_nombre: v ? v.nombre : '?',
        nota: p.nota
      };
    });
}

module.exports = {
  getVehiculos, addVehiculo, updateVehiculoKm, deleteVehiculo,
  getProfesores, addProfesor, updateProfesor, deleteProfesor,
  getTarifas, setTarifa, deleteTarifa,
  getAlumnos, addAlumno, deleteAlumno, updateAlumno,
  getPracticasByAlumno, getUltimaPractica, addPractica, deletePractica, updatePractica,
  getPagosByAlumno, addPago, updatePago, deletePago, getDeudas,
  importarCSV, exportarCSV, compararCSVs, getResumen, getSolapamientos,
  rellenarKmMasivo, getPracticasSinKm,
  corregirSolapamientos,
  getLogs, clearLogs, registrarLogEnData,
  crearBackup, restaurarBackup, obtenerUltimoBackup,
  validarSolapamiento,
  getTimelineVehiculo,
  getAlumnosPorVehiculo, registrarPracticasMasivas, eliminarPracticaPorFecha, ajustarPracticasAlumno, guardarNotaAlumno,
  getAnotacionesAlumno,
  _clearCache
};
