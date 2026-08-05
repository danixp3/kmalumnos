// ─── CRM DE CAPTACIÓN (LEADS) ──────────────────────────────────────────────
// Gestión de leads/candidatos previos a matricularse: origen, presupuesto,
// embudo de conversión. Es un registro LOCAL — igual que vencimientos/jornadas,
// NO sincroniza con Supabase en esta v1 (no toca sync.js ni markDirty/markDeleted);
// cada PC lleva el suyo propio en su data.json.

const { load, save, nextId, addLog, filtrarPorSucursal } = require('./core');
const { addAlumno } = require('./alumnos');

const ESTADOS_VALIDOS = ['nuevo', 'contactado', 'presupuesto', 'ganado', 'perdido'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function _hoy() {
  return new Date().toISOString().slice(0, 10);
}

function _validarEstado(estado) {
  if (!ESTADOS_VALIDOS.includes(estado)) {
    throw new Error(`Estado de lead no válido: "${estado}". Debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}.`);
  }
}

function _validarFecha(fecha) {
  if (!FECHA_RE.test(fecha)) {
    throw new Error(`Fecha no válida: "${fecha}". Debe tener formato YYYY-MM-DD.`);
  }
}

function getLeads(sucursalId) {
  const d = load();
  if (!d.leads) d.leads = [];
  return filtrarPorSucursal(d.leads.filter(l => !l.deleted), sucursalId)
    .slice()
    .sort((a, b) => (b.fecha_alta || '').localeCompare(a.fecha_alta || ''));
}

function addLead({ nombre, telefono, email, origen, estado, permiso_interes, presupuesto, notas, fecha_alta, sucursal_id } = {}) {
  const nombreLimpio = (nombre || '').trim();
  if (!nombreLimpio) throw new Error('El nombre del lead es obligatorio.');
  const estadoFinal = estado || 'nuevo';
  _validarEstado(estadoFinal);
  const fecha = fecha_alta || _hoy();
  _validarFecha(fecha);

  const d = load();
  if (!d.leads) d.leads = [];
  const id = nextId('lead');
  const l = {
    id,
    nombre: nombreLimpio,
    telefono: telefono || '',
    email: email || '',
    origen: origen || '',
    estado: estadoFinal,
    permiso_interes: permiso_interes || '',
    presupuesto: presupuesto != null && presupuesto !== '' ? Number(presupuesto) : null,
    notas: notas || '',
    fecha_alta: fecha,
    fecha_conversion: null,
    alumno_id: null,
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null
  };
  d.leads.push(l);
  addLog('lead', 'Añadido lead ' + nombreLimpio, [l.origen]);
  save();
  return l;
}

function updateLead(id, campos = {}) {
  const d = load();
  if (!d.leads) d.leads = [];
  const l = d.leads.find(x => x.id === id);
  if (!l) return;
  if ('estado' in campos) _validarEstado(campos.estado);
  if ('fecha_alta' in campos) _validarFecha(campos.fecha_alta);

  const CAMPOS_EDITABLES = ['nombre', 'telefono', 'email', 'origen', 'estado', 'permiso_interes', 'presupuesto', 'notas', 'fecha_alta'];
  for (const campo of CAMPOS_EDITABLES) {
    if (campo in campos) {
      if (campo === 'presupuesto') {
        l.presupuesto = campos.presupuesto != null && campos.presupuesto !== '' ? Number(campos.presupuesto) : null;
      } else {
        l[campo] = campos[campo];
      }
    }
  }
  if ('estado' in campos && campos.estado === 'ganado' && !l.fecha_conversion) {
    l.fecha_conversion = _hoy();
  }
  save();
}

function setEstadoLead(id, estado) {
  _validarEstado(estado);
  const d = load();
  if (!d.leads) d.leads = [];
  const l = d.leads.find(x => x.id === id);
  if (!l) return;
  l.estado = estado;
  if (estado === 'ganado' && !l.fecha_conversion) l.fecha_conversion = _hoy();
  save();
}

// Borrado local: igual que vencimientos, se quita de verdad del array — es un
// registro por puesto que no sincroniza, no hace falta la marca `deleted`.
function deleteLead(id) {
  const d = load();
  if (!d.leads) d.leads = [];
  d.leads = d.leads.filter(x => x.id !== id);
  save();
}

function convertirLeadEnAlumno(id) {
  const d = load();
  if (!d.leads) d.leads = [];
  const l = d.leads.find(x => x.id === id);
  if (!l) return { ok: false, msg: 'Lead no encontrado' };
  if (l.alumno_id != null) return { ok: false, msg: 'Ya convertido' };

  const alumno_id = addAlumno(
    l.nombre,
    l.permiso_interes || 'B',
    null,
    null,
    l.sucursal_id,
    l.email || null,
    { telefono: l.telefono || null }
  );

  l.estado = 'ganado';
  l.alumno_id = alumno_id;
  l.fecha_conversion = _hoy();
  addLog('lead', 'Lead convertido en alumno: ' + l.nombre, []);
  save();
  return { ok: true, alumno_id };
}

function getEstadisticasCrm(sucursalId) {
  const leads = getLeads(sucursalId);
  const total = leads.length;

  const porEstado = { nuevo: 0, contactado: 0, presupuesto: 0, ganado: 0, perdido: 0 };
  for (const l of leads) {
    if (porEstado[l.estado] != null) porEstado[l.estado]++;
  }

  const origenesMap = new Map();
  for (const l of leads) {
    const origen = l.origen || 'Sin especificar';
    if (!origenesMap.has(origen)) origenesMap.set(origen, { origen, total: 0, ganados: 0 });
    const o = origenesMap.get(origen);
    o.total++;
    if (l.estado === 'ganado') o.ganados++;
  }
  const porOrigen = Array.from(origenesMap.values()).map(o => ({
    ...o,
    ratio: o.total > 0 ? o.ganados / o.total : 0
  }));

  const ratioConversion = total > 0 ? porEstado.ganado / total : 0;

  return { total, porEstado, porOrigen, ratioConversion };
}

module.exports = {
  getLeads, addLead, updateLead, setEstadoLead, deleteLead, convertirLeadEnAlumno, getEstadisticasCrm,
};
