// ─── ALUMNOS ─────────────────────────────────────────────────────────────────
// CRUD de alumnos y anotaciones de alumno (notas guardadas en sus prácticas).

const { load, save, nextId, _sync, filtrarPorSucursal } = require('./core');

// sucursalId opcional: sin argumento devuelve todos los alumnos (modo clásico
// o "Todas las sucursales") — ver filtrarPorSucursal en core.js.
function getAlumnos(sucursalId) {
  const d = load();
  return filtrarPorSucursal(d.alumnos, sucursalId)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map(a => {
      const v = d.vehiculos.find(x => x.id === a.vehiculo_id);
      const prof = d.profesores.find(x => x.id === a.profesor_id);
      return { ...a, vehiculo_nombre: v ? v.nombre : null, profesor_nombre: prof ? prof.nombre : null };
    });
}

// Campos "de ficha" ampliados (todos opcionales, texto libre salvo las dos
// fechas): teléfono, DNI/NIE, fecha de nacimiento, dirección, fecha de alta y
// observaciones. Se agrupan en un objeto `datos` como ÚLTIMO parámetro para no
// alargar más la firma posicional — igual criterio que el resto de campos ya
// opcionales de esta función. Si no se pasa `datos`, no cambia nada (compat).
// `estado` sigue el mismo patrón pero con valores cerrados (ver
// ESTADOS_ALUMNO_VALIDOS): cualquier otro valor (u omitido) se guarda como
// null y la UI lo trata como 'activo' por defecto.
const CAMPOS_DATOS_ALUMNO = ['telefono', 'dni', 'fecha_nacimiento', 'direccion', 'fecha_alta', 'observaciones', 'estado'];
const ESTADOS_ALUMNO_VALIDOS = ['activo', 'aprobado', 'baja'];

// Normaliza el objeto `datos`: trim de cada campo y vacío → null; `estado`
// además se valida contra ESTADOS_ALUMNO_VALIDOS (cualquier otro valor → null).
function _normalizarDatosAlumno(datos) {
  const out = {};
  for (const campo of CAMPOS_DATOS_ALUMNO) {
    const v = datos && datos[campo] != null ? String(datos[campo]).trim() : '';
    if (campo === 'estado') {
      out[campo] = ESTADOS_ALUMNO_VALIDOS.includes(v) ? v : null;
    } else {
      out[campo] = v || null;
    }
  }
  return out;
}

function addAlumno(nombre, permiso, vehiculo_id, profesor_id = null, sucursal_id = null, email = null, datos = null) {
  const d = load();
  const id = nextId('a');
  d.alumnos.push({
    id, nombre, permiso: permiso || 'B', vehiculo_id: vehiculo_id ? parseInt(vehiculo_id) : null,
    profesor_id: profesor_id ? parseInt(profesor_id) : null,
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null,
    email: email ? String(email).trim() : null,
    ..._normalizarDatosAlumno(datos)
  });
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

function updateAlumno(id, nombre, permiso, vehiculo_id, profesor_id = null, email = null, datos = null) {
  const d = load();
  const a = d.alumnos.find(x => x.id === id);
  if (a) {
    a.nombre = nombre;
    a.permiso = permiso;
    a.vehiculo_id = vehiculo_id ? parseInt(vehiculo_id) : null;
    a.profesor_id = profesor_id ? parseInt(profesor_id) : null;
    a.email = email ? String(email).trim() : null;
    if (datos) Object.assign(a, _normalizarDatosAlumno(datos));
    save();
    const s = _sync(); if (s) s.markDirty('alumnos', id);
  }
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
  getAlumnos, addAlumno, deleteAlumno, updateAlumno,
  getAnotacionesAlumno,
  ESTADOS_ALUMNO_VALIDOS,
};
