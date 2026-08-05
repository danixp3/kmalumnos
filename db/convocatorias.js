// ─── EXÁMENES: PRESENTACIONES A CONVOCATORIA Y TASAS ───────────────────────
// Control de presentación a examen (teórico/maniobras/circulación) por
// convocatoria, tasas administrativas asociadas al alumno y estadísticas de
// aprobados. Es un registro LOCAL — igual que jornadas/vencimientos, NO
// sincroniza con Supabase en esta v1 (no toca sync.js ni markDirty/markDeleted);
// cada PC lleva el suyo propio en su data.json.

const { load, save, nextId, addLog, filtrarPorSucursal } = require('./core');

const TIPOS_VALIDOS = ['teorico', 'maniobras', 'circulacion'];
const RESULTADOS_VALIDOS = ['pendiente', 'apto', 'no_apto', 'aplazado', 'no_presentado'];
const ESTADOS_TASA_VALIDOS = ['vigente', 'usada', 'caducada'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function _validarFecha(fecha, campo) {
  if (!fecha || !FECHA_RE.test(fecha)) {
    throw new Error(`${campo || 'Fecha'} no válida: "${fecha}". Debe tener formato YYYY-MM-DD.`);
  }
}

function _validarTipo(tipo) {
  if (!TIPOS_VALIDOS.includes(tipo)) {
    throw new Error(`Tipo de examen no válido: "${tipo}". Debe ser uno de: ${TIPOS_VALIDOS.join(', ')}.`);
  }
}

function _validarResultado(resultado) {
  if (!RESULTADOS_VALIDOS.includes(resultado)) {
    throw new Error(`Resultado no válido: "${resultado}". Debe ser uno de: ${RESULTADOS_VALIDOS.join(', ')}.`);
  }
}

function _validarEstadoTasa(estado) {
  if (!ESTADOS_TASA_VALIDOS.includes(estado)) {
    throw new Error(`Estado de tasa no válido: "${estado}". Debe ser uno de: ${ESTADOS_TASA_VALIDOS.join(', ')}.`);
  }
}

// ─── PRESENTACIONES A EXAMEN ────────────────────────────────────────────────

function getPresentaciones(sucursalId) {
  const d = load();
  if (!d.presentaciones) d.presentaciones = [];
  return filtrarPorSucursal(d.presentaciones.filter(p => !p.deleted), sucursalId)
    .slice()
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

function addPresentacion({ alumno_id, tipo, fecha, profesor_id, n_convocatoria, resultado, sucursal_id, nota } = {}) {
  _validarTipo(tipo);
  _validarFecha(fecha, 'Fecha de presentación');
  const res = resultado || 'pendiente';
  _validarResultado(res);
  const d = load();
  if (!d.presentaciones) d.presentaciones = [];
  const id = nextId('pres');
  const p = {
    id,
    alumno_id: alumno_id != null && alumno_id !== '' ? parseInt(alumno_id) : null,
    tipo,
    fecha,
    profesor_id: profesor_id != null && profesor_id !== '' ? parseInt(profesor_id) : null,
    n_convocatoria: n_convocatoria != null && n_convocatoria !== '' ? parseInt(n_convocatoria) : 1,
    resultado: res,
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null,
    nota: nota || ''
  };
  d.presentaciones.push(p);
  addLog('presentacion', 'Añadida presentación a examen ' + tipo, [fecha]);
  save();
  return p;
}

function updatePresentacion(id, campos = {}) {
  const d = load();
  if (!d.presentaciones) d.presentaciones = [];
  const p = d.presentaciones.find(x => x.id === id);
  if (!p) return;
  if ('tipo' in campos) _validarTipo(campos.tipo);
  if ('fecha' in campos) _validarFecha(campos.fecha, 'Fecha de presentación');
  if ('resultado' in campos) _validarResultado(campos.resultado);
  const CAMPOS_EDITABLES = ['alumno_id', 'tipo', 'fecha', 'profesor_id', 'n_convocatoria', 'resultado', 'sucursal_id', 'nota'];
  for (const campo of CAMPOS_EDITABLES) {
    if (campo in campos) {
      if (campo === 'alumno_id' || campo === 'profesor_id') {
        p[campo] = campos[campo] != null && campos[campo] !== '' ? parseInt(campos[campo]) : null;
      } else if (campo === 'n_convocatoria') {
        p.n_convocatoria = campos.n_convocatoria != null && campos.n_convocatoria !== '' ? parseInt(campos.n_convocatoria) : 1;
      } else if (campo === 'sucursal_id') {
        p.sucursal_id = campos.sucursal_id ? parseInt(campos.sucursal_id) : null;
      } else {
        p[campo] = campos[campo];
      }
    }
  }
  save();
}

function setResultadoPresentacion(id, resultado) {
  _validarResultado(resultado);
  const d = load();
  if (!d.presentaciones) d.presentaciones = [];
  const p = d.presentaciones.find(x => x.id === id);
  if (!p) return;
  p.resultado = resultado;
  save();
}

// Borrado local: igual que vencimientos/jornadas, se quita de verdad del
// array — es un registro por puesto que no sincroniza, no hace falta la
// marca `deleted` que sí usan las entidades que viajan a Supabase.
function deletePresentacion(id) {
  const d = load();
  if (!d.presentaciones) d.presentaciones = [];
  d.presentaciones = d.presentaciones.filter(x => x.id !== id);
  save();
}

// ─── TASAS ───────────────────────────────────────────────────────────────────

function getTasas(sucursalId) {
  const d = load();
  if (!d.tasas) d.tasas = [];
  return filtrarPorSucursal(d.tasas.filter(t => !t.deleted), sucursalId)
    .slice()
    .sort((a, b) => (b.fecha_compra || '').localeCompare(a.fecha_compra || ''));
}

function getTasasAlumno(alumnoId) {
  const d = load();
  if (!d.tasas) d.tasas = [];
  const aid = parseInt(alumnoId);
  return d.tasas.filter(t => !t.deleted && t.alumno_id === aid);
}

function addTasa({ alumno_id, concepto, fecha_compra, fecha_caducidad, importe, estado, sucursal_id, nota } = {}) {
  if (fecha_compra) _validarFecha(fecha_compra, 'Fecha de compra');
  if (fecha_caducidad) _validarFecha(fecha_caducidad, 'Fecha de caducidad');
  const est = estado || 'vigente';
  _validarEstadoTasa(est);
  const d = load();
  if (!d.tasas) d.tasas = [];
  const id = nextId('tasa');
  const t = {
    id,
    alumno_id: alumno_id != null && alumno_id !== '' ? parseInt(alumno_id) : null,
    concepto: concepto || '',
    fecha_compra: fecha_compra || null,
    fecha_caducidad: fecha_caducidad || null,
    importe: importe != null && importe !== '' ? Number(importe) : null,
    estado: est,
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null,
    nota: nota || ''
  };
  d.tasas.push(t);
  addLog('tasa', 'Añadida tasa ' + (concepto || ''), [fecha_compra]);
  save();
  return t;
}

function updateTasa(id, campos = {}) {
  const d = load();
  if (!d.tasas) d.tasas = [];
  const t = d.tasas.find(x => x.id === id);
  if (!t) return;
  if ('fecha_compra' in campos && campos.fecha_compra) _validarFecha(campos.fecha_compra, 'Fecha de compra');
  if ('fecha_caducidad' in campos && campos.fecha_caducidad) _validarFecha(campos.fecha_caducidad, 'Fecha de caducidad');
  if ('estado' in campos) _validarEstadoTasa(campos.estado);
  const CAMPOS_EDITABLES = ['alumno_id', 'concepto', 'fecha_compra', 'fecha_caducidad', 'importe', 'estado', 'sucursal_id', 'nota'];
  for (const campo of CAMPOS_EDITABLES) {
    if (campo in campos) {
      if (campo === 'alumno_id') {
        t.alumno_id = campos.alumno_id != null && campos.alumno_id !== '' ? parseInt(campos.alumno_id) : null;
      } else if (campo === 'importe') {
        t.importe = campos.importe != null && campos.importe !== '' ? Number(campos.importe) : null;
      } else if (campo === 'sucursal_id') {
        t.sucursal_id = campos.sucursal_id ? parseInt(campos.sucursal_id) : null;
      } else {
        t[campo] = campos[campo];
      }
    }
  }
  save();
}

function deleteTasa(id) {
  const d = load();
  if (!d.tasas) d.tasas = [];
  d.tasas = d.tasas.filter(x => x.id !== id);
  save();
}

// ─── ESTADÍSTICAS DE APROBADOS ──────────────────────────────────────────────

function _acumular(acc, resultado) {
  acc.presentados++;
  if (resultado === 'apto') acc.aptos++;
}

function _conRatio(acc) {
  return { ...acc, ratio: acc.presentados > 0 ? acc.aptos / acc.presentados : 0 };
}

function getEstadisticasAprobados(sucursalId) {
  const d = load();
  if (!d.presentaciones) d.presentaciones = [];
  const relevantes = filtrarPorSucursal(d.presentaciones.filter(p => !p.deleted), sucursalId)
    .filter(p => p.resultado === 'apto' || p.resultado === 'no_apto');

  const global = { presentados: 0, aptos: 0 };
  const porTipo = {
    teorico: { presentados: 0, aptos: 0 },
    maniobras: { presentados: 0, aptos: 0 },
    circulacion: { presentados: 0, aptos: 0 }
  };
  const porProfesorMap = new Map(); // profesor_id -> { presentados, aptos }

  for (const p of relevantes) {
    _acumular(global, p.resultado);
    if (porTipo[p.tipo]) _acumular(porTipo[p.tipo], p.resultado);
    if (p.profesor_id != null) {
      if (!porProfesorMap.has(p.profesor_id)) porProfesorMap.set(p.profesor_id, { presentados: 0, aptos: 0 });
      _acumular(porProfesorMap.get(p.profesor_id), p.resultado);
    }
  }

  const porProfesor = Array.from(porProfesorMap.entries()).map(([profesor_id, acc]) => {
    const prof = (d.profesores || []).find(x => x.id === profesor_id);
    return { profesor_id, nombre: prof ? prof.nombre : '—', ..._conRatio(acc) };
  });

  return {
    global: _conRatio(global),
    porTipo: {
      teorico: _conRatio(porTipo.teorico),
      maniobras: _conRatio(porTipo.maniobras),
      circulacion: _conRatio(porTipo.circulacion)
    },
    porProfesor
  };
}

module.exports = {
  getPresentaciones, addPresentacion, updatePresentacion, setResultadoPresentacion, deletePresentacion,
  getTasas, getTasasAlumno, addTasa, updateTasa, deleteTasa,
  getEstadisticasAprobados,
};
