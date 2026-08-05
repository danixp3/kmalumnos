// ─── CARGOS Y DESCUENTOS ────────────────────────────────────────────────────
// Movimientos de cargo/descuento por alumno (matrícula, tasas, cargos
// puntuales, descuentos/promociones — tarea D2 del PLAN-MAESTRO). Un cargo
// tiene un `importe` CON SIGNO: positivo aumenta la deuda del alumno
// (matrícula/tasa/cargo), negativo la reduce (descuento/promo). SÍ
// sincroniza con Supabase (a diferencia de bonos/jornadas/vencimientos):
// mismo patrón gateado que reservas — mientras la migración
// `migraciones/2026-08-06_cargos.sql` no esté aplicada, la tabla `cargos`
// no existe en Supabase y sync.js lo trata como "modo clásico" (ver
// sync.js/_cargosDisponible). Soft delete (`deleted:true`) porque, a
// diferencia de reservas (que borra de verdad en local y solo marca
// `deleted` al subir), aquí conviene conservar el registro local también
// borrado para no reaparecer si otro dispositivo aún no ha sincronizado el
// borrado.

const { load, save, nextId, _sync, addLog, filtrarPorSucursal } = require('./core');

const TIPOS_VALIDOS = ['matricula', 'tasa', 'cargo', 'descuento', 'promo'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function _validarTipo(tipo) {
  if (!TIPOS_VALIDOS.includes(tipo)) {
    throw new Error(`Tipo de cargo no válido: "${tipo}". Debe ser uno de: ${TIPOS_VALIDOS.join(', ')}.`);
  }
}

function _validarImporte(importe) {
  const n = Number(importe);
  if (!Number.isFinite(n)) {
    throw new Error(`Importe no válido: "${importe}". Debe ser un número.`);
  }
  return n;
}

function _validarFecha(fecha) {
  if (fecha == null || fecha === '') return;
  if (!FECHA_RE.test(fecha)) {
    throw new Error(`Fecha no válida: "${fecha}". Debe tener formato YYYY-MM-DD.`);
  }
}

// sucursalId opcional: sin argumento devuelve todos los cargos no borrados
// (modo clásico o "Todas las sucursales") — ver filtrarPorSucursal en core.js.
function getCargos(sucursalId) {
  const d = load();
  if (!d.cargos) d.cargos = [];
  return filtrarPorSucursal(d.cargos.filter(c => !c.deleted), sucursalId)
    .slice()
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

function getCargosAlumno(alumnoId) {
  const d = load();
  if (!d.cargos) d.cargos = [];
  const aid = parseInt(alumnoId);
  return d.cargos
    .filter(c => !c.deleted && c.alumno_id === aid)
    .slice()
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.id - b.id);
}

function getTotalCargosAlumno(alumnoId) {
  return getCargosAlumno(alumnoId).reduce((sum, c) => sum + (c.importe || 0), 0);
}

function addCargo({ alumno_id, concepto, tipo, importe, fecha, sucursal_id, nota } = {}) {
  _validarTipo(tipo);
  const importeNum = _validarImporte(importe);
  _validarFecha(fecha);
  const d = load();
  if (!d.cargos) d.cargos = [];
  const id = nextId('cargo');
  const c = {
    id,
    alumno_id: alumno_id != null && alumno_id !== '' ? parseInt(alumno_id) : null,
    concepto: concepto || '',
    tipo,
    importe: importeNum,
    fecha: fecha || '',
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null,
    nota: nota || '',
    deleted: false,
    updated_at: new Date().toISOString()
  };
  d.cargos.push(c);
  addLog('cargo', 'Añadido cargo ' + (concepto || tipo), [String(importeNum)]);
  save();
  const s = _sync(); if (s) s.markDirty('cargos', id);
  return c;
}

function updateCargo(id, campos = {}) {
  const d = load();
  if (!d.cargos) d.cargos = [];
  const c = d.cargos.find(x => x.id === id);
  if (!c) return;
  if ('tipo' in campos) _validarTipo(campos.tipo);
  if ('importe' in campos) _validarImporte(campos.importe);
  if ('fecha' in campos) _validarFecha(campos.fecha);
  const CAMPOS_EDITABLES = ['concepto', 'tipo', 'importe', 'fecha', 'nota'];
  for (const campo of CAMPOS_EDITABLES) {
    if (campo in campos) {
      if (campo === 'importe') {
        c.importe = _validarImporte(campos.importe);
      } else {
        c[campo] = campos[campo];
      }
    }
  }
  c.updated_at = new Date().toISOString();
  save();
  const s = _sync(); if (s) s.markDirty('cargos', id);
}

function deleteCargo(id) {
  const d = load();
  if (!d.cargos) d.cargos = [];
  const c = d.cargos.find(x => x.id === id);
  if (!c) return;
  c.deleted = true;
  c.updated_at = new Date().toISOString();
  save();
  const s = _sync(); if (s) s.markDeleted('cargos', id);
}

module.exports = {
  getCargos, getCargosAlumno, getTotalCargosAlumno, addCargo, updateCargo, deleteCargo,
};
