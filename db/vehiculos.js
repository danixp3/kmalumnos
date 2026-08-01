// ─── VEHÍCULOS ───────────────────────────────────────────────────────────────
// CRUD de vehículos (alta, edición, km actual y borrado con soft delete remoto).

const { load, save, nextId, _sync, filtrarPorSucursal } = require('./core');

// sucursalId opcional: sin argumento (o null/'') devuelve todos los vehículos,
// igual que antes de sucursales — ver filtrarPorSucursal en core.js.
function getVehiculos(sucursalId) {
  return filtrarPorSucursal(load().vehiculos, sucursalId).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function addVehiculo(nombre, matricula, km_actual, sucursal_id = null) {
  const d = load();
  const id = nextId('v');
  d.vehiculos.push({
    id, nombre, matricula: matricula || '', km_actual: parseFloat(km_actual) || 0,
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null
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

function updateVehiculo(id, nombre, matricula) {
  const d = load();
  const v = d.vehiculos.find(x => x.id === id);
  if (v) {
    v.nombre = nombre;
    v.matricula = matricula || '';
    save();
    const s = _sync(); if (s) s.markDirty('vehiculos', id);
  }
}

function deleteVehiculo(id) {
  const d = load();
  d.vehiculos = d.vehiculos.filter(x => x.id !== id);
  d.alumnos.forEach(a => { if (a.vehiculo_id === id) a.vehiculo_id = null; });
  save();
  const s = _sync(); if (s) s.markDeleted('vehiculos', id);
}

module.exports = {
  getVehiculos, addVehiculo, updateVehiculoKm, updateVehiculo, deleteVehiculo,
};
