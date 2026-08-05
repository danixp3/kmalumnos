// ─── BONOS / PACKS DE PRÁCTICAS ────────────────────────────────────────────
// Bonos de clases prepagadas por alumno (ej. "10 clases" con saldo que se va
// consumiendo). Es un registro LOCAL — igual que jornadas/vencimientos, NO
// sincroniza con Supabase en esta v1 (no toca sync.js ni markDirty/markDeleted);
// cada PC lleva el suyo propio en su data.json.

const { load, save, nextId, addLog, filtrarPorSucursal } = require('./core');

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS_VALIDOS = ['activo', 'agotado', 'anulado'];

function _hoy() {
  return new Date().toISOString().slice(0, 10);
}

function _validarNClases(n_clases) {
  if (!Number.isInteger(n_clases) || n_clases <= 0) {
    throw new Error(`Número de clases no válido: "${n_clases}". Debe ser un entero mayor que 0.`);
  }
}

function _validarFecha(fecha, campo) {
  if (fecha == null || fecha === '') return; // fecha_caducidad puede ser null/vacía
  if (!FECHA_RE.test(fecha)) {
    throw new Error(`${campo} no válida: "${fecha}". Debe tener formato YYYY-MM-DD.`);
  }
}

function getBonos(sucursalId) {
  const d = load();
  if (!d.bonos) d.bonos = [];
  return filtrarPorSucursal(d.bonos.filter(b => !b.deleted), sucursalId)
    .slice()
    .sort((a, b) => (b.fecha_compra || '').localeCompare(a.fecha_compra || ''));
}

function getBonosAlumno(alumnoId) {
  const d = load();
  if (!d.bonos) d.bonos = [];
  const hoy = _hoy();
  return d.bonos
    .filter(b => !b.deleted && b.alumno_id === alumnoId)
    .map(b => ({
      ...b,
      saldo: b.n_clases - b.n_usadas,
      caducado: !!(b.fecha_caducidad && b.fecha_caducidad < hoy)
    }));
}

function getSaldoBonosAlumno(alumnoId) {
  return getBonosAlumno(alumnoId)
    .filter(b => b.estado === 'activo' && !b.caducado)
    .reduce((sum, b) => sum + b.saldo, 0);
}

function addBono({ alumno_id, nombre, n_clases, precio, fecha_compra, fecha_caducidad, sucursal_id, nota } = {}) {
  const nClasesNum = Number(n_clases);
  _validarNClases(nClasesNum);
  _validarFecha(fecha_compra, 'Fecha de compra');
  _validarFecha(fecha_caducidad, 'Fecha de caducidad');
  const d = load();
  if (!d.bonos) d.bonos = [];
  const id = nextId('bono');
  const b = {
    id,
    alumno_id: alumno_id != null && alumno_id !== '' ? parseInt(alumno_id) : null,
    nombre: nombre || '',
    n_clases: nClasesNum,
    n_usadas: 0,
    precio: precio != null && precio !== '' ? parseFloat(precio) : null,
    fecha_compra: fecha_compra || '',
    fecha_caducidad: fecha_caducidad || null,
    estado: 'activo',
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null,
    nota: nota || ''
  };
  d.bonos.push(b);
  addLog('bono', 'Añadido bono ' + (nombre || ''), [String(nClasesNum)]);
  save();
  return b;
}

function updateBono(id, campos = {}) {
  const d = load();
  if (!d.bonos) d.bonos = [];
  const b = d.bonos.find(x => x.id === id);
  if (!b) return;
  if ('n_clases' in campos) _validarNClases(Number(campos.n_clases));
  if ('fecha_compra' in campos) _validarFecha(campos.fecha_compra, 'Fecha de compra');
  if ('fecha_caducidad' in campos) _validarFecha(campos.fecha_caducidad, 'Fecha de caducidad');
  const CAMPOS_EDITABLES = ['nombre', 'n_clases', 'precio', 'fecha_compra', 'fecha_caducidad', 'nota', 'estado'];
  for (const campo of CAMPOS_EDITABLES) {
    if (campo in campos) {
      if (campo === 'n_clases') {
        b.n_clases = parseInt(campos.n_clases);
      } else if (campo === 'precio') {
        b.precio = campos.precio != null && campos.precio !== '' ? parseFloat(campos.precio) : null;
      } else if (campo === 'estado') {
        if (ESTADOS_VALIDOS.includes(campos.estado)) b.estado = campos.estado;
      } else {
        b[campo] = campos[campo];
      }
    }
  }
  if (b.n_usadas >= b.n_clases && b.estado !== 'anulado') {
    b.estado = 'agotado';
  }
  save();
}

function consumirBono(id, n = 1) {
  const d = load();
  if (!d.bonos) d.bonos = [];
  const b = d.bonos.find(x => x.id === id);
  if (!b) return { ok: false };
  if (b.estado === 'anulado' || b.estado === 'agotado') return { ok: false };
  b.n_usadas = Math.min(b.n_clases, b.n_usadas + n);
  const saldo = b.n_clases - b.n_usadas;
  if (saldo <= 0) b.estado = 'agotado';
  save();
  return { ok: true, saldo, estado: b.estado };
}

function reponerBono(id, n = 1) {
  const d = load();
  if (!d.bonos) d.bonos = [];
  const b = d.bonos.find(x => x.id === id);
  if (!b) return { ok: false };
  b.n_usadas = Math.max(0, b.n_usadas - n);
  if (b.estado === 'agotado' && b.n_usadas < b.n_clases) {
    b.estado = 'activo';
  }
  const saldo = b.n_clases - b.n_usadas;
  save();
  return { ok: true, saldo };
}

function anularBono(id) {
  const d = load();
  if (!d.bonos) d.bonos = [];
  const b = d.bonos.find(x => x.id === id);
  if (!b) return;
  b.estado = 'anulado';
  save();
}

// Borrado local: igual que jornadas/vencimientos, se quita de verdad del
// array — es un registro por puesto que no sincroniza, no hace falta la
// marca `deleted` que sí usan las entidades que sí viajan a Supabase.
function deleteBono(id) {
  const d = load();
  if (!d.bonos) d.bonos = [];
  d.bonos = d.bonos.filter(x => x.id !== id);
  save();
}

module.exports = {
  getBonos, getBonosAlumno, getSaldoBonosAlumno, addBono, updateBono, consumirBono, reponerBono, anularBono, deleteBono,
};
