// ─── PROFESORES ──────────────────────────────────────────────────────────────
// CRUD de profesores; getProfesores añade el nº de prácticas impartidas.

const { load, save, nextId, _sync, filtrarPorSucursal, firmaValida, addLog } = require('./core');
const { extraerCamposExtra, camposExtraVacios } = require('./campos-extra');

// sucursalId opcional: sin argumento devuelve todos los profesores (modo
// clásico o "Todas las sucursales") — ver filtrarPorSucursal en core.js.
function getProfesores(sucursalId) {
  const d = load();
  const coches = new Map(d.vehiculos.filter(v => !v.deleted).map(v => [v.id, v]));
  return filtrarPorSucursal(d.profesores, sucursalId)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    // La imagen de la firma no viaja en la lista (pesa): solo si la tiene.
    .map(({ firma, firma_pendiente, ...p }) => {
      const coche = p.vehiculo_id ? coches.get(p.vehiculo_id) : null;
      const sugerido = coche ? null : coches.get(sugerirCocheProfesor(d, p.id));
      return {
        ...p, tiene_firma: firmaValida(firma), num_practicas: d.practicas.filter(x => x.profesor_id === p.id).length,
        // Coche habitual (null si no tiene o si ese coche ya no existe)
        vehiculo_nombre: coche ? coche.nombre : null, vehiculo_matricula: coche ? coche.matricula || null : null,
        vehiculo_retirado: coche ? coche.activo === false : false,
        // Sin coche habitual: el que más usa según la app (para ponerlo de un clic)
        vehiculo_sugerido: sugerido ? { id: sugerido.id, nombre: sugerido.nombre, matricula: sugerido.matricula || null } : null
      };
    });
}

// Coche que más usa un profesor según la app: el de sus clases de los últimos
// 90 días (o, si no tiene, el de sus alumnos asignados), solo si es claro
// (al menos 3 clases o 2 alumnos y 6 de cada 10). id del coche o null.
function sugerirCocheProfesor(d, profesorId, hoy = new Date()) {
  const pid = parseInt(profesorId);
  const enUso = new Set(d.vehiculos.filter(v => !v.deleted && v.activo !== false).map(v => v.id));
  const desde = new Date(hoy.getTime() - 90 * 864e5).toISOString().slice(0, 10);
  const elegir = (ids, minimo) => {
    const n = new Map();
    for (const id of ids) if (enUso.has(id)) n.set(id, (n.get(id) || 0) + 1);
    const total = [...n.values()].reduce((s, x) => s + x, 0);
    const [mejor, veces] = [...n.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    return mejor && veces >= minimo && veces / total >= 0.6 ? mejor : null;
  };
  return elegir(d.practicas.filter(p => !p.deleted && p.profesor_id === pid && (p.fecha || '') >= desde).map(p => p.vehiculo_id), 3)
    || elegir(d.alumnos.filter(a => !a.deleted && a.profesor_id === pid).map(a => a.vehiculo_id), 2);
}

// Pone (o quita, con null) el coche habitual de un profesor
function setCocheProfesor(profesorId, vehiculoId) {
  const d = load();
  const p = d.profesores.find(x => x.id === parseInt(profesorId) && !x.deleted);
  if (!p) return { ok: false, error: 'Profesor no encontrado.' };
  const vid = vehiculoId ? parseInt(vehiculoId) : null;
  if (vid && !d.vehiculos.some(v => v.id === vid && !v.deleted)) return { ok: false, error: 'Ese coche no existe.' };
  p.vehiculo_id = vid;
  save();
  const s = _sync(); if (s) s.markDirty('profesores', p.id);
  return { ok: true };
}

// Coche habitual de un profesor (id) si sigue en uso; null si no tiene.
function getVehiculoDeProfesor(profesorId, d = load()) {
  const p = d.profesores.find(x => x.id === parseInt(profesorId) && !x.deleted);
  if (!p || !p.vehiculo_id) return null;
  const v = d.vehiculos.find(x => x.id === p.vehiculo_id && !x.deleted);
  return v && v.activo !== false ? v.id : null;
}

// dni (tarea "Ficha alumno – formación práctica" DGT): string opcional,
// nullable, al final para no romper llamadas existentes. datos (opcional):
// teléfono, email, dirección, fechas, nº de certificado... (db/campos-extra.js).
function addProfesor(nombre, nota, sucursal_id = null, dni = null, datos = null) {
  const d = load();
  const id = nextId('pf');
  d.profesores.push({
    id, nombre, nota: nota || '', sucursal_id: sucursal_id ? parseInt(sucursal_id) : null, dni: dni ? String(dni).trim() : null,
    ...camposExtraVacios('profesores'), ...extraerCamposExtra('profesores', datos)
  });
  save();
  const s = _sync(); if (s) s.markDirty('profesores', id);
  return id;
}

function updateProfesor(id, nombre, nota, dni = null, datos = null) {
  const d = load();
  const p = d.profesores.find(x => x.id === id);
  if (p) {
    p.nombre = nombre;
    p.nota = nota || '';
    p.dni = dni ? String(dni).trim() : null;
    Object.assign(p, extraerCamposExtra('profesores', datos));
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

// ─── FIRMA DEL PROFESOR ──────────────────────────────────────────────────────
// Se dibuja una vez (escritorio o móvil) y firma todas sus clases en la ficha
// DGT. `firma` = PNG en data URL (null = sin firma). `firma_pendiente` marca que
// se cambió en este PC: solo entonces la sube el sync (así editar el nombre del
// profesor en otro PC nunca pisa una firma hecha en el móvil).
function getFirmaProfesor(id) {
  const p = load().profesores.find(x => x.id === parseInt(id));
  return p && firmaValida(p.firma) ? p.firma : null;
}

function setFirmaProfesor(id, firma) {
  const d = load();
  const p = d.profesores.find(x => x.id === parseInt(id));
  if (!p) return { ok: false, error: 'Profesor no encontrado.' };
  if (firma && !firmaValida(firma)) return { ok: false, error: 'La firma no es una imagen válida o es demasiado grande.' };
  p.firma = firma || null;
  p.firma_pendiente = true;
  addLog('profesor', `${firma ? 'Firma guardada' : 'Firma borrada'}: ${p.nombre}`, []);
  save();
  const s = _sync(); if (s) s.markDirty('profesores', p.id);
  return { ok: true };
}

module.exports = {
  getProfesores, addProfesor, updateProfesor, deleteProfesor,
  getFirmaProfesor, setFirmaProfesor, getVehiculoDeProfesor, sugerirCocheProfesor, setCocheProfesor,
};
