// ─── EXÁMENES: PRESENTACIONES A CONVOCATORIA Y TASAS ───────────────────────
// Control de presentación a examen (teórico/maniobras/circulación) por
// convocatoria, tasas administrativas asociadas al alumno y estadísticas de
// aprobados. Es un registro LOCAL — igual que jornadas/vencimientos, NO
// sincroniza con Supabase en esta v1 (no toca sync.js ni markDirty/markDeleted);
// cada PC lleva el suyo propio en su data.json.

const { load, save, nextId, addLog, filtrarPorSucursal } = require('./core');
const { coincideProcedencia } = require('./procedencia');

const TIPOS_VALIDOS = ['teorico', 'maniobras', 'circulacion'];
const RESULTADOS_VALIDOS = ['pendiente', 'apto', 'no_apto', 'aplazado', 'no_presentado'];
const ESTADOS_TASA_VALIDOS = ['vigente', 'usada', 'caducada'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Datos del examen que también guarda Ariauto (2026-10-03): permiso al que se
// presenta, examinador, coche del examen (matrícula o nombre), nº de fallos y
// su detalle (p. ej. «Eliminatoria: 11.4 Obediencia de las señales…») y nº de
// solicitud del expediente en Tráfico. Todos opcionales.
const CAMPOS_EXAMEN_EXTRA = ['permiso', 'examinador', 'vehiculo', 'fallos', 'fallos_detalle', 'n_solicitud'];
function _examenExtra(campos, soloPresentes) {
  const out = {};
  for (const c of CAMPOS_EXAMEN_EXTRA) {
    if (soloPresentes && !(c in campos)) continue;
    const v = campos[c];
    if (c === 'fallos' || c === 'n_solicitud') {
      const n = parseInt(v, 10);
      out[c] = Number.isFinite(n) && n >= 0 && v !== '' && v != null ? n : null;
    } else {
      const t = v == null ? '' : String(v).trim();
      out[c] = t ? (c === 'permiso' ? t.toUpperCase().slice(0, 10) : t.slice(0, c === 'fallos_detalle' ? 2000 : 120)) : null;
    }
  }
  return out;
}

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

function addPresentacion(campos = {}) {
  const { alumno_id, tipo, fecha, profesor_id, n_convocatoria, resultado, sucursal_id, nota } = campos;
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
    nota: nota || '',
    ..._examenExtra(campos, false)
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
  Object.assign(p, _examenExtra(campos, true));
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

function addTasa({ alumno_id, concepto, fecha_compra, fecha_caducidad, importe, estado, sucursal_id, nota, n_justificante, tipo_tasa } = {}) {
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
    nota: nota || '',
    // Nº del justificante (el código de la tasa) y tipo (2.1, 4.1...)
    n_justificante: n_justificante ? String(n_justificante).trim().slice(0, 40) || null : null,
    tipo_tasa: tipo_tasa ? String(tipo_tasa).trim().slice(0, 20) || null : null
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
  const CAMPOS_EDITABLES = ['alumno_id', 'concepto', 'fecha_compra', 'fecha_caducidad', 'importe', 'estado', 'sucursal_id', 'nota', 'n_justificante', 'tipo_tasa'];
  for (const campo of CAMPOS_EDITABLES) {
    if (campo in campos) {
      if (campo === 'n_justificante' || campo === 'tipo_tasa') {
        t[campo] = campos[campo] ? String(campos[campo]).trim() || null : null;
      } else if (campo === 'alumno_id') {
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

// ─── BUSCADOR DE EXÁMENES ───────────────────────────────────────────────────
// Exámenes de todos los alumnos con filtros (pantalla Exámenes): texto
// (alumno, DNI, nº de registro, examinador, notas), tipo, resultado, profesor,
// permiso, examinador, fechas y «próximos / ya hechos». Devuelve las filas
// con el nombre del alumno ya puesto, el resumen de lo filtrado (aptos, no
// aptos, % de aprobados) y las opciones de los desplegables.
const sinTildes = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function buscarExamenes(filtros = {}, sucursalId) {
  const d = load();
  const hoy = filtros.hoy || (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; })();
  const alumnos = new Map((d.alumnos || []).map(a => [a.id, a]));
  const profes = new Map((d.profesores || []).map(p => [p.id, p]));
  const todos = filtrarPorSucursal((d.presentaciones || []).filter(p => !p.deleted), sucursalId);
  const texto = sinTildes(filtros.texto).trim();
  const palabras = texto ? texto.split(/\s+/) : [];
  const filas = [];
  const permisos = new Set(), examinadores = new Set(), profesIds = new Set(), procedencias = new Set();
  for (const p of todos) {
    const a = alumnos.get(p.alumno_id) || null;
    const permiso = p.permiso || (a ? a.permiso : null) || null;
    if (permiso) permisos.add(permiso);
    if (p.examinador) examinadores.add(p.examinador);
    if (p.profesor_id != null) profesIds.add(p.profesor_id);
    if (p.procedencia) procedencias.add(p.procedencia);
    if (filtros.tipo && p.tipo !== filtros.tipo) continue;
    if (filtros.resultado && p.resultado !== filtros.resultado) continue;
    if (filtros.profesor_id && String(p.profesor_id || '') !== String(filtros.profesor_id)) continue;
    if (filtros.permiso && permiso !== filtros.permiso) continue;
    if (filtros.examinador && p.examinador !== filtros.examinador) continue;
    // Traídos de otro programa ('__otros'), creados aquí ('__app') o de un programa concreto
    if (!coincideProcedencia(p.procedencia, filtros.procedencia)) continue;
    if (filtros.desde && (p.fecha || '') < filtros.desde) continue;
    if (filtros.hasta && (p.fecha || '') > filtros.hasta) continue;
    if (filtros.cuando === 'proximos' && !((p.fecha || '') >= hoy && p.resultado === 'pendiente')) continue;
    if (filtros.cuando === 'hechos' && !((p.fecha || '') < hoy || p.resultado !== 'pendiente')) continue;
    const nombre = a ? [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ') : '—';
    if (palabras.length) {
      const pajar = sinTildes([nombre, a && a.dni, a && a.n_registro, a && a.telefono, p.examinador, p.nota, p.fallos_detalle, p.vehiculo].filter(Boolean).join(' '));
      if (!palabras.every(w => pajar.includes(w))) continue;
    }
    const prof = p.profesor_id != null ? profes.get(p.profesor_id) : null;
    filas.push({
      ...p, permiso,
      alumno_nombre: nombre, alumno_dni: a ? a.dni || null : null, alumno_n_registro: a ? a.n_registro || null : null,
      alumno_estado: a ? a.estado || null : null, alumno_vehiculo_id: a ? a.vehiculo_id || null : null,
      profesor_nombre: prof ? prof.nombre : null
    });
  }
  const asc = filtros.cuando === 'proximos' || filtros.orden === 'asc';
  filas.sort((x, y) => (asc ? 1 : -1) * ((x.fecha || '').localeCompare(y.fecha || '') || x.id - y.id));
  const resumen = { total: filas.length, aptos: 0, no_aptos: 0, pendientes: 0, otros: 0 };
  for (const f of filas) {
    if (f.resultado === 'apto') resumen.aptos++;
    else if (f.resultado === 'no_apto') resumen.no_aptos++;
    else if (f.resultado === 'pendiente') resumen.pendientes++;
    else resumen.otros++;
  }
  resumen.ratio = resumen.aptos + resumen.no_aptos > 0 ? resumen.aptos / (resumen.aptos + resumen.no_aptos) : null;
  return {
    filas, resumen, totalExamenes: todos.length,
    opciones: {
      permisos: [...permisos].sort(),
      examinadores: [...examinadores].sort((x, y) => x.localeCompare(y, 'es')),
      procedencias: [...procedencias].sort((x, y) => x.localeCompare(y, 'es')),
      profesores: [...profesIds].map(id => ({ id, nombre: profes.get(id) ? profes.get(id).nombre : `Profesor ${id}` })).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
    }
  };
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
  getPresentaciones, addPresentacion, updatePresentacion, setResultadoPresentacion, deletePresentacion, buscarExamenes,
  getTasas, getTasasAlumno, addTasa, updateTasa, deleteTasa,
  getEstadisticasAprobados,
};
