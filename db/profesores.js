// ─── PROFESORES ──────────────────────────────────────────────────────────────
// CRUD de profesores; getProfesores añade el nº de prácticas impartidas.

const { load, save, nextId, _sync, filtrarPorSucursal } = require('./core');

// sucursalId opcional: sin argumento devuelve todos los profesores (modo
// clásico o "Todas las sucursales") — ver filtrarPorSucursal en core.js.
function getProfesores(sucursalId) {
  const d = load();
  return filtrarPorSucursal(d.profesores, sucursalId)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map(p => ({ ...p, num_practicas: d.practicas.filter(x => x.profesor_id === p.id).length }));
}

function addProfesor(nombre, nota, sucursal_id = null) {
  const d = load();
  const id = nextId('pf');
  d.profesores.push({ id, nombre, nota: nota || '', sucursal_id: sucursal_id ? parseInt(sucursal_id) : null });
  save();
  const s = _sync(); if (s) s.markDirty('profesores', id);
  return id;
}

function updateProfesor(id, nombre, nota) {
  const d = load();
  const p = d.profesores.find(x => x.id === id);
  if (p) {
    p.nombre = nombre;
    p.nota = nota || '';
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

module.exports = {
  getProfesores, addProfesor, updateProfesor, deleteProfesor,
};
