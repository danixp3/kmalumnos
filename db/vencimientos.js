// ─── VENCIMIENTOS / ALERTAS DE CADUCIDADES ─────────────────────────────────
// Recordatorios de fechas límite ligadas a vehículos, profesores, alumnos o
// generales (ITV, seguro, psicotécnico, DNI, certificados, convocatorias...).
// Es un registro LOCAL — igual que jornadas, NO sincroniza con Supabase en
// esta v1 (no toca sync.js ni markDirty/markDeleted); cada PC lleva el suyo
// propio en su data.json.

const { load, save, nextId, addLog, filtrarPorSucursal } = require('./core');

const ENTIDADES_VALIDAS = ['vehiculo', 'profesor', 'alumno', 'general'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function _validarFecha(fecha) {
  if (!fecha || !FECHA_RE.test(fecha)) {
    throw new Error(`Fecha de vencimiento no válida: "${fecha}". Debe tener formato YYYY-MM-DD.`);
  }
}

function _validarEntidadTipo(entidad_tipo) {
  if (!ENTIDADES_VALIDAS.includes(entidad_tipo)) {
    throw new Error(`Tipo de entidad no válido: "${entidad_tipo}". Debe ser uno de: ${ENTIDADES_VALIDAS.join(', ')}.`);
  }
}

// Diferencia en días (sin zona horaria) entre fecha y hoy, ambas YYYY-MM-DD.
function _diasRestantes(fecha, hoyStr) {
  const [ay, am, ad] = fecha.split('-').map(Number);
  const [hy, hm, hd] = hoyStr.split('-').map(Number);
  const msFecha = Date.UTC(ay, am - 1, ad);
  const msHoy = Date.UTC(hy, hm - 1, hd);
  return Math.round((msFecha - msHoy) / 86400000);
}

function getVencimientos(sucursalId) {
  const d = load();
  if (!d.vencimientos) d.vencimientos = [];
  return filtrarPorSucursal(d.vencimientos.filter(v => !v.deleted), sucursalId)
    .slice()
    .sort((a, b) => (a.fecha_vencimiento || '').localeCompare(b.fecha_vencimiento || ''));
}

function addVencimiento({ entidad_tipo, entidad_id, tipo, descripcion, fecha_vencimiento, nota, sucursal_id } = {}) {
  _validarEntidadTipo(entidad_tipo);
  _validarFecha(fecha_vencimiento);
  const d = load();
  if (!d.vencimientos) d.vencimientos = [];
  const id = nextId('venc');
  const v = {
    id,
    entidad_tipo,
    entidad_id: entidad_id != null && entidad_id !== '' ? parseInt(entidad_id) : null,
    tipo: tipo || '',
    descripcion: descripcion || '',
    fecha_vencimiento,
    nota: nota || '',
    completado: false,
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null
  };
  d.vencimientos.push(v);
  addLog('vencimiento', 'Añadido vencimiento ' + tipo, [fecha_vencimiento]);
  save();
  return v;
}

function updateVencimiento(id, campos = {}) {
  const d = load();
  if (!d.vencimientos) d.vencimientos = [];
  const v = d.vencimientos.find(x => x.id === id);
  if (!v) return;
  if ('entidad_tipo' in campos) _validarEntidadTipo(campos.entidad_tipo);
  if ('fecha_vencimiento' in campos) _validarFecha(campos.fecha_vencimiento);
  const CAMPOS_EDITABLES = ['entidad_tipo', 'entidad_id', 'tipo', 'descripcion', 'fecha_vencimiento', 'nota', 'sucursal_id'];
  for (const campo of CAMPOS_EDITABLES) {
    if (campo in campos) {
      if (campo === 'entidad_id') {
        v.entidad_id = campos.entidad_id != null && campos.entidad_id !== '' ? parseInt(campos.entidad_id) : null;
      } else if (campo === 'sucursal_id') {
        v.sucursal_id = campos.sucursal_id ? parseInt(campos.sucursal_id) : null;
      } else {
        v[campo] = campos[campo];
      }
    }
  }
  save();
}

function setCompletadoVencimiento(id, completado) {
  const d = load();
  if (!d.vencimientos) d.vencimientos = [];
  const v = d.vencimientos.find(x => x.id === id);
  if (!v) return;
  v.completado = !!completado;
  save();
}

// Borrado local: igual que jornadas (borrarJornada), se quita de verdad del
// array — es un registro por puesto que no sincroniza, no hace falta la
// marca `deleted` que sí usan las entidades que sí viajan a Supabase.
function deleteVencimiento(id) {
  const d = load();
  if (!d.vencimientos) d.vencimientos = [];
  d.vencimientos = d.vencimientos.filter(x => x.id !== id);
  save();
}

function getProximosVencimientos(diasAviso, hoyStr, sucursalId) {
  const dias = diasAviso != null ? diasAviso : 30;
  const hoy = hoyStr || new Date().toISOString().slice(0, 10);
  const d = load();
  if (!d.vencimientos) d.vencimientos = [];

  const nombreEntidad = (v) => {
    if (v.entidad_tipo === 'general' || v.entidad_id == null) return '—';
    if (v.entidad_tipo === 'vehiculo') {
      const veh = (d.vehiculos || []).find(x => x.id === v.entidad_id);
      return veh ? (veh.matricula || veh.nombre || '—') : '—';
    }
    if (v.entidad_tipo === 'profesor') {
      const prof = (d.profesores || []).find(x => x.id === v.entidad_id);
      return prof ? (prof.nombre || '—') : '—';
    }
    if (v.entidad_tipo === 'alumno') {
      const al = (d.alumnos || []).find(x => x.id === v.entidad_id);
      return al ? (al.nombre || '—') : '—';
    }
    return '—';
  };

  return filtrarPorSucursal(d.vencimientos.filter(v => !v.deleted && !v.completado), sucursalId)
    .map(v => {
      const diasRestantes = _diasRestantes(v.fecha_vencimiento, hoy);
      return { ...v, diasRestantes, vencido: diasRestantes < 0, nombreEntidad: nombreEntidad(v) };
    })
    .filter(v => v.diasRestantes <= dias)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}

module.exports = {
  getVencimientos, addVencimiento, updateVencimiento, setCompletadoVencimiento, deleteVencimiento, getProximosVencimientos,
};
