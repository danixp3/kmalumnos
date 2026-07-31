// ─── TARIFAS ─────────────────────────────────────────────────────────────────
// CRUD de tarifas (precio por permiso + tipo de práctica).

const { load, save, nextId, _sync } = require('./core');

function getTarifas() {
  const d = load();
  return d.tarifas
    .slice()
    .sort((a, b) => a.permiso.localeCompare(b.permiso) || a.tipo.localeCompare(b.tipo));
}

function setTarifa(permiso, tipo, precio) {
  const d = load();
  const t = d.tarifas.find(x => x.permiso === permiso && x.tipo === tipo);
  if (t) {
    t.precio = parseFloat(precio) || 0;
    save();
    const s = _sync(); if (s) s.markDirty('tarifas', t.id);
    return t.id;
  }
  const id = nextId('t');
  d.tarifas.push({ id, permiso, tipo, precio: parseFloat(precio) || 0 });
  save();
  const s = _sync(); if (s) s.markDirty('tarifas', id);
  return id;
}

function deleteTarifa(id) {
  const d = load();
  d.tarifas = d.tarifas.filter(x => x.id !== id);
  save();
  const s = _sync(); if (s) s.markDeleted('tarifas', id);
}

module.exports = {
  getTarifas, setTarifa, deleteTarifa,
};
