// ─── SUCURSALES ──────────────────────────────────────────────────────────────
// CRUD local de sucursales (sedes de la autoescuela). Solo tiene sentido una
// vez aplicada la migración migraciones/2026-08-01_roles_y_sucursales.sql y
// con sesión de empresa iniciada; hasta entonces d.sucursales está vacío y
// getSucursales() devuelve [] — el selector del renderer (renderer/sucursales.js)
// se queda oculto y toda la app sigue en modo clásico (ver CLAUDE.md).
// activa=false no borra nada: solo deja de ofrecerse en el selector, los
// registros que ya tenía esa sucursal_id conservan sus datos intactos.

const { load, save, nextId, _sync } = require('./core');

function getSucursales(soloActivas) {
  const d = load();
  const lista = (d.sucursales || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  return soloActivas ? lista.filter(s => s.activa !== false) : lista;
}

function addSucursal(nombre) {
  const d = load();
  if (!d.sucursales) d.sucursales = [];
  const id = nextId('suc');
  d.sucursales.push({ id, nombre, activa: true });
  save();
  const s = _sync(); if (s) s.markDirty('sucursales', id);
  return id;
}

function renombrarSucursal(id, nombre) {
  const d = load();
  const suc = (d.sucursales || []).find(x => x.id === id);
  if (suc) {
    suc.nombre = nombre;
    save();
    const s = _sync(); if (s) s.markDirty('sucursales', id);
  }
}

function activarSucursal(id, activa) {
  const d = load();
  const suc = (d.sucursales || []).find(x => x.id === id);
  if (suc) {
    suc.activa = !!activa;
    save();
    const s = _sync(); if (s) s.markDirty('sucursales', id);
  }
}

module.exports = {
  getSucursales, addSucursal, renombrarSucursal, activarSucursal,
};
