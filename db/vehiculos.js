// ─── VEHÍCULOS ───────────────────────────────────────────────────────────────
// CRUD de vehículos (alta, edición, km actual y borrado con soft delete remoto).
// Cada coche puede estar en uso o retirado (activo = false, 2026-10-03): el
// retirado conserva su historial pero no se ofrece para dar clase (registro
// rápido, móvil, selectores) ni sale en las estadísticas por coche.

const { load, save, nextId, _sync, filtrarPorSucursal } = require('./core');
const { extraerCamposExtra, camposExtraVacios, permisosDeVehiculo, permisosDeAlumno, vehiculoSirveParaAlumno } = require('./campos-extra');

// sucursalId opcional: sin argumento (o null/'') devuelve todos los vehículos,
// igual que antes de sucursales — ver filtrarPorSucursal en core.js. Los
// retirados van al final (y llevan activo === false).
function getVehiculos(sucursalId) {
  return filtrarPorSucursal(load().vehiculos, sucursalId).slice()
    .sort((a, b) => (a.activo === false) - (b.activo === false) || a.nombre.localeCompare(b.nombre));
}

function addVehiculo(nombre, matricula, km_actual, sucursal_id = null, datos = null) {
  const d = load();
  const id = nextId('v');
  d.vehiculos.push({
    id, nombre, matricula: matricula || '', km_actual: parseFloat(km_actual) || 0,
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null,
    ...camposExtraVacios('vehiculos'),
    ...extraerCamposExtra('vehiculos', datos)
  });
  save();
  const s = _sync(); if (s) s.markDirty('vehiculos', id);
  return id;
}

function updateVehiculoKm(id, km) {
  const d = load();
  const v = d.vehiculos.find(x => x.id === id);
  if (v) { v.km_actual = parseFloat(km); save(); const s = _sync(); if (s) s.markDirty('vehiculos', id); }
}

// datos (opcional): marca, modelo, fechas, seguro, ITV, cambio, observaciones
// y activo — solo se tocan las claves que lleguen.
function updateVehiculo(id, nombre, matricula, datos = null) {
  const d = load();
  const v = d.vehiculos.find(x => x.id === id);
  if (v) {
    v.nombre = nombre;
    v.matricula = matricula || '';
    Object.assign(v, extraerCamposExtra('vehiculos', datos));
    save();
    const s = _sync(); if (s) s.markDirty('vehiculos', id);
  }
}

// En uso ↔ retirado. Al retirarlo se apunta la fecha de baja si no la tenía;
// al volver a ponerlo en uso se quita.
function setVehiculoActivo(id, activo) {
  const d = load();
  const v = d.vehiculos.find(x => x.id === parseInt(id));
  if (!v) return { ok: false, error: 'No se encuentra el vehículo.' };
  v.activo = !!activo;
  if (!v.activo && !v.fecha_baja) {
    const n = new Date();
    v.fecha_baja = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }
  if (v.activo) v.fecha_baja = null;
  save();
  const s = _sync(); if (s) s.markDirty('vehiculos', v.id);
  return { ok: true, activo: v.activo };
}

function deleteVehiculo(id) {
  const d = load();
  d.vehiculos = d.vehiculos.filter(x => x.id !== id);
  d.alumnos.forEach(a => { if (a.vehiculo_id === id) a.vehiculo_id = null; });
  save();
  const s = _sync(); if (s) s.markDeleted('vehiculos', id);
}

// ─── PERMISOS DE CADA COCHE ──────────────────────────────────────────────────
// Un coche puede tener puestos los permisos con los que se da clase («B»; «A2,A,A1,AM»).
// Así a un alumno de moto no se le propone (ni se le enseña) el coche de B del profesor.
// Sin permisos puestos, el coche vale para todos (como siempre).

/**
 * Permisos que parecen servir para un coche según cómo se ha usado: los de los
 * alumnos que han dado clase en él (con al menos 2 clases). Solo lectura. [] si no se puede saber.
 */
function sugerirPermisosVehiculo(vehiculoId) {
  const d = load();
  const vid = parseInt(vehiculoId);
  const alumnos = new Map(d.alumnos.filter(a => !a.deleted).map(a => [a.id, a]));
  const cuenta = new Map();
  for (const p of d.practicas) {
    if (p.deleted || p.vehiculo_id !== vid) continue;
    const a = alumnos.get(p.alumno_id);
    if (a && a.permiso) cuenta.set(a.permiso, (cuenta.get(a.permiso) || 0) + 1);
  }
  // Solo lo que cuentan las clases dadas (los alumnos «asignados» al coche no son fiables: se asignaron sin mirar el permiso)
  const permisos = [...cuenta.entries()].filter(([, n]) => n >= 2).map(([p]) => p);
  const limpio = extraerCamposExtra('vehiculos', { permisos }).permisos; // en orden y solo permisos conocidos
  return limpio ? permisosDeVehiculo({ permisos: limpio }) : [];
}

/**
 * El coche que conviene proponer a un alumno de este permiso con este profesor:
 *   · uno que sirva para su permiso (permiso marcado en el coche; los coches sin
 *     permisos puestos valen pero puntúan menos),
 *   · mejor si es el coche habitual del profesor, y si es el que él ha usado
 *     últimamente con alumnos de ese permiso.
 * Sin una señal clara (nada marcado y sin coche habitual que sirva) devuelve null:
 * mejor no proponer ninguno que enseñar el coche de otro permiso. Solo lectura.
 * `alumno` = { permiso, permisos?, profesor_id? }. Devuelve el id del coche o null.
 */
function sugerirCocheAlumno(alumno = {}) {
  const d = load();
  const al = { permiso: alumno.permiso || 'B', permisos: alumno.permisos || [] };
  const permisosAl = new Set(permisosDeAlumno(al));
  const pid = alumno.profesor_id ? parseInt(alumno.profesor_id) : null;
  const prof = pid ? d.profesores.find(x => x.id === pid && !x.deleted) : null;
  const candidatos = d.vehiculos.filter(v => !v.deleted && v.activo !== false && vehiculoSirveParaAlumno(v, al) !== 'no');
  if (!candidatos.length) return null;
  // Lo que ha usado el profesor (últimos 180 días) con alumnos de este permiso
  const alumnos = new Map(d.alumnos.map(a => [a.id, a]));
  const desde = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
  const usos = new Map(), usosTodos = new Map();
  for (const p of d.practicas) {
    if (p.deleted || (p.fecha || '') < desde) continue;
    const a = alumnos.get(p.alumno_id);
    if (!a || !permisosDeAlumno(a).some(x => permisosAl.has(x))) continue;
    usosTodos.set(p.vehiculo_id, (usosTodos.get(p.vehiculo_id) || 0) + 1);
    if (pid && p.profesor_id === pid) usos.set(p.vehiculo_id, (usos.get(p.vehiculo_id) || 0) + 1);
  }
  const maxProf = Math.max(0, ...usos.values()), maxTodos = Math.max(0, ...usosTodos.values());
  const puntos = v => (vehiculoSirveParaAlumno(v, al) === 'si' ? 4 : 0)
    + (prof && prof.vehiculo_id === v.id ? 3 : 0)
    + (maxProf && usos.get(v.id) === maxProf ? 2 : 0)
    + (maxTodos ? (usosTodos.get(v.id) || 0) / maxTodos : 0);
  const mejor = candidatos.map(v => ({ v, p: puntos(v) })).sort((a, b) => b.p - a.p || a.v.nombre.localeCompare(b.v.nombre))[0];
  return mejor && mejor.p >= 3 ? mejor.v.id : null;
}

module.exports = {
  getVehiculos, addVehiculo, updateVehiculoKm, updateVehiculo, setVehiculoActivo, deleteVehiculo,
  sugerirPermisosVehiculo, sugerirCocheAlumno,
};
