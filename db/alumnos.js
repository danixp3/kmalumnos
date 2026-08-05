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
// Ciclo de estados ampliado (tarea B1 del PLAN-MAESTRO): matriculado → en
// teórica → apto teórico → en prácticas → presentado a examen → apto/no apto,
// más 'baja' en cualquier punto. 'activo'/'aprobado' se conservan al final por
// retrocompatibilidad con alumnos ya guardados con esos valores (sync de
// `estado` no cambia: sigue siendo la misma columna gateada de siempre).
const ESTADOS_ALUMNO_VALIDOS = ['matriculado', 'en_teorica', 'apto_teorico', 'en_practicas', 'presentado', 'apto', 'no_apto', 'baja', 'activo', 'aprobado'];

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

// Campos del "libro de registro de alumnos" (RD 1295/2003 art. 39): permisos
// que YA posee, fechas de inicio/fin de la enseñanza y resultado final.
// Grupo APARTE de CAMPOS_DATOS_ALUMNO para que su detección de migración en
// sync.js sea independiente (mismo criterio que separó "email" de "datos").
// n_inscripcion NO va aquí: se asigna con asignarNumInscripcion/backfillNumInscripcion,
// nunca a mano desde la ficha.
const CAMPOS_LIBRO_ALUMNO = ['permisos_posee', 'fecha_inicio', 'fecha_fin', 'resultado'];
const RESULTADOS_ALUMNO_VALIDOS = ['apto', 'no_apto', 'baja'];

// Normaliza el objeto `libro`: solo devuelve las claves PRESENTES en `libro`
// (para no pisar con null lo no enviado en updates parciales); trim→null para
// los 3 de texto/fecha, y `resultado` se valida contra RESULTADOS_ALUMNO_VALIDOS
// (cualquier otro valor → null). Mismo criterio que _normalizarDatosAlumno.
function _normalizarLibroAlumno(datos) {
  const out = {};
  if (!datos) return out;
  for (const campo of CAMPOS_LIBRO_ALUMNO) {
    if (!(campo in datos)) continue;
    const v = datos[campo] != null ? String(datos[campo]).trim() : '';
    if (campo === 'resultado') {
      out[campo] = RESULTADOS_ALUMNO_VALIDOS.includes(v) ? v : null;
    } else {
      out[campo] = v || null;
    }
  }
  return out;
}

// Permisos múltiples (tarea B1 del PLAN-MAESTRO): campo NUEVO `permisos`
// (array) para los DEMÁS permisos que cursa el alumno, aparte del `permiso`
// principal (string, intacto, sigue rigiendo tarifas/pagos en db/pagos.js).
const PERMISOS_VALIDOS = ['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C1', 'C', 'D1', 'D', 'CAP', 'ADR'];

// Acepta array o null/undefined → array de códigos válidos: filtra contra el
// catálogo, quita duplicados, en mayúsculas y recortados. null/undefined → [].
function _normalizarPermisos(permisos) {
  if (!Array.isArray(permisos)) return [];
  const set = new Set();
  for (const p of permisos) {
    const codigo = String(p || '').trim().toUpperCase();
    if (PERMISOS_VALIDOS.includes(codigo)) set.add(codigo);
  }
  return [...set];
}

function addAlumno(nombre, permiso, vehiculo_id, profesor_id = null, sucursal_id = null, email = null, datos = null, libro = null, permisos = null) {
  const d = load();
  const id = nextId('a');
  d.alumnos.push({
    id, nombre, permiso: permiso || 'B', vehiculo_id: vehiculo_id ? parseInt(vehiculo_id) : null,
    profesor_id: profesor_id ? parseInt(profesor_id) : null,
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null,
    email: email ? String(email).trim() : null,
    n_inscripcion: null,
    ..._normalizarDatosAlumno(datos),
    // En el alta se normalizan las 4 claves del libro siempre (aunque vengan
    // vacías/undefined), a diferencia de update donde solo se tocan las
    // claves presentes: así un alumno nuevo siempre arranca con las 4 en null.
    ..._normalizarLibroAlumno({ permisos_posee: null, fecha_inicio: null, fecha_fin: null, resultado: null, ...(libro || {}) }),
    permisos: _normalizarPermisos(permisos)
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

function updateAlumno(id, nombre, permiso, vehiculo_id, profesor_id = null, email = null, datos = null, libro = null, permisos = null) {
  const d = load();
  const a = d.alumnos.find(x => x.id === id);
  if (a) {
    a.nombre = nombre;
    a.permiso = permiso;
    a.vehiculo_id = vehiculo_id ? parseInt(vehiculo_id) : null;
    a.profesor_id = profesor_id ? parseInt(profesor_id) : null;
    a.email = email ? String(email).trim() : null;
    if (datos) Object.assign(a, _normalizarDatosAlumno(datos));
    if (libro) Object.assign(a, _normalizarLibroAlumno(libro));
    if (permisos !== null) a.permisos = _normalizarPermisos(permisos);
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

// ─── LIBRO DE REGISTRO DE ALUMNOS (RD 1295/2003 art. 39) ──────────────────
// Siguiente nº de inscripción a asignar: max(n_inscripcion) + 1 de TODOS los
// alumnos (sin filtrar por sucursal — el libro es único para toda la
// autoescuela), o 1 si ninguno tiene número todavía.
function getSiguienteNumInscripcion() {
  const d = load();
  const max = d.alumnos.reduce((m, a) => a.n_inscripcion != null && a.n_inscripcion > m ? a.n_inscripcion : m, 0);
  return max + 1;
}

// Idempotente: si el alumno ya tiene n_inscripcion, lo devuelve tal cual sin
// tocar nada; si no, le asigna el siguiente número disponible y guarda.
function asignarNumInscripcion(id) {
  const d = load();
  const a = d.alumnos.find(x => x.id === id);
  if (!a) return null;
  if (a.n_inscripcion != null) return a.n_inscripcion;
  const n = getSiguienteNumInscripcion();
  a.n_inscripcion = n;
  save();
  const s = _sync(); if (s) s.markDirty('alumnos', id);
  return n;
}

// Numera de una vez a todos los alumnos que aún no tienen n_inscripcion,
// ordenados por (fecha_alta || fecha_inicio || '9999-99-99') asc y luego id
// asc, empezando en getSiguienteNumInscripcion(). Una sola save() al final
// (operación masiva) pero markDirty por cada alumno tocado (misma trampa nº 1
// del proyecto: toda mutación marca sync, también las masivas).
function backfillNumInscripcion() {
  const d = load();
  const pendientes = d.alumnos
    .filter(a => a.n_inscripcion == null)
    .sort((a, b) => {
      const fa = a.fecha_alta || a.fecha_inicio || '9999-99-99';
      const fb = b.fecha_alta || b.fecha_inicio || '9999-99-99';
      return fa.localeCompare(fb) || a.id - b.id;
    });
  if (!pendientes.length) return 0;
  let n = getSiguienteNumInscripcion();
  const s = _sync();
  for (const a of pendientes) {
    a.n_inscripcion = n++;
    if (s) s.markDirty('alumnos', a.id);
  }
  save();
  return pendientes.length;
}

// Devuelve el libro de registro: alumnos filtrados por sucursal (igual que
// getAlumnos) ordenados por n_inscripcion asc (los que no tienen número van
// al final, ordenados por nombre), en el formato plano que exige la tabla
// imprimible del art. 39.
function getLibroRegistro(sucursalId) {
  const d = load();
  return filtrarPorSucursal(d.alumnos, sucursalId)
    .slice()
    .sort((a, b) => {
      if (a.n_inscripcion == null && b.n_inscripcion == null) return a.nombre.localeCompare(b.nombre);
      if (a.n_inscripcion == null) return 1;
      if (b.n_inscripcion == null) return -1;
      return a.n_inscripcion - b.n_inscripcion;
    })
    .map(a => ({
      n_inscripcion: a.n_inscripcion,
      nombre: a.nombre,
      dni: a.dni || null,
      fecha_nacimiento: a.fecha_nacimiento || null,
      permisos_posee: a.permisos_posee || null,
      permiso: a.permiso,
      fecha_alta: a.fecha_alta || null,
      fecha_inicio: a.fecha_inicio || null,
      fecha_fin: a.fecha_fin || null,
      resultado: a.resultado || null,
      estado: a.estado || null,
    }));
}

module.exports = {
  getAlumnos, addAlumno, deleteAlumno, updateAlumno,
  getAnotacionesAlumno,
  ESTADOS_ALUMNO_VALIDOS,
  RESULTADOS_ALUMNO_VALIDOS,
  PERMISOS_VALIDOS,
  getSiguienteNumInscripcion, asignarNumInscripcion, backfillNumInscripcion, getLibroRegistro,
};
