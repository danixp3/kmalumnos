// ─── VEHÍCULOS ───────────────────────────────────────────────────────────────
// CRUD de vehículos (alta, edición, km actual y borrado con soft delete remoto).
// Cada coche puede estar en uso o retirado (activo = false, 2026-10-03): el
// retirado conserva su historial pero no se ofrece para dar clase (registro
// rápido, móvil, selectores) ni sale en las estadísticas por coche.

const { load, save, nextId, _sync, filtrarPorSucursal } = require('./core');
const { extraerCamposExtra, camposExtraVacios } = require('./campos-extra');

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

module.exports = {
  getVehiculos, addVehiculo, updateVehiculoKm, updateVehiculo, setVehiculoActivo, deleteVehiculo,
};
