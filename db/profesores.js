// ─── PROFESORES ──────────────────────────────────────────────────────────────
// CRUD de profesores; getProfesores añade el nº de prácticas impartidas.

const { load, save, nextId, _sync, filtrarPorSucursal, firmaValida, addLog } = require('./core');
const { extraerCamposExtra, camposExtraVacios } = require('./campos-extra');

// sucursalId opcional: sin argumento devuelve todos los profesores (modo
// clásico o "Todas las sucursales") — ver filtrarPorSucursal en core.js.
function getProfesores(sucursalId) {
  const d = load();
  return filtrarPorSucursal(d.profesores, sucursalId)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    // La imagen de la firma no viaja en la lista (pesa): solo si la tiene.
    .map(({ firma, firma_pendiente, ...p }) => ({ ...p, tiene_firma: firmaValida(firma), num_practicas: d.practicas.filter(x => x.profesor_id === p.id).length }));
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
  getFirmaProfesor, setFirmaProfesor,
};
