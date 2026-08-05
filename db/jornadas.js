// ─── JORNADAS (REGISTRO DE JORNADA LABORAL) ───────────────────────────────────
// Fichaje de entrada/salida por empleado (art. 34.9 del Estatuto de los
// Trabajadores: obligación de registro diario de jornada, conservación 4
// años). Es un registro LOCAL por puesto — NO sincroniza con Supabase en
// esta v1 (no toca sync.js ni _sync()); cada PC lleva el suyo propio en su
// data.json. El registro es inalterable salvo corrección manual, y cada
// corrección queda anotada en `correcciones` para dejar rastro auditable
// (nunca se sobrescribe en silencio entrada/salida/nota).

const { load, save, nextId } = require('./core');

function _hoy() {
  return new Date().toISOString().slice(0, 10);
}

function _horaActual() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getJornadas({ sucursalId, desde, hasta, empleado } = {}) {
  const d = load();
  if (!d.jornadas) d.jornadas = [];
  let lista = d.jornadas.slice();
  if (sucursalId !== undefined && sucursalId !== null && sucursalId !== '') {
    const sid = parseInt(sucursalId);
    lista = lista.filter(j => j.sucursal_id === sid);
  }
  if (desde) lista = lista.filter(j => (j.fecha || '') >= desde);
  if (hasta) lista = lista.filter(j => (j.fecha || '') <= hasta);
  if (empleado) {
    const q = empleado.toLowerCase();
    lista = lista.filter(j => (j.empleado || '').toLowerCase().includes(q));
  }
  return lista
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.entrada || '').localeCompare(a.entrada || ''))
    .map(j => {
      const suc = d.sucursales && j.sucursal_id ? d.sucursales.find(x => x.id === j.sucursal_id) : null;
      return { ...j, sucursal_nombre: suc ? suc.nombre : '' };
    });
}

function ficharEntrada({ empleado, sucursal_id, nota } = {}) {
  if (!empleado || !String(empleado).trim()) {
    throw new Error('El nombre del empleado no puede estar vacío.');
  }
  const d = load();
  if (!d.jornadas) d.jornadas = [];
  const id = nextId('j');
  d.jornadas.push({
    id,
    empleado: String(empleado).trim(),
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null,
    fecha: _hoy(),
    entrada: _horaActual(),
    salida: null,
    correcciones: [],
    nota: nota || ''
  });
  save();
  return id;
}

function ficharSalida(id) {
  const d = load();
  if (!d.jornadas) d.jornadas = [];
  const j = d.jornadas.find(x => x.id === id);
  if (!j) return { ok: false, msg: 'Jornada no encontrada.' };
  if (j.salida) return { ok: false, msg: 'Ya tiene salida registrada.' };
  j.salida = _horaActual();
  save();
  return { ok: true };
}

function jornadaAbiertaDe(empleado, sucursal_id) {
  const d = load();
  if (!d.jornadas) d.jornadas = [];
  const hoy = _hoy();
  const sid = (sucursal_id !== undefined && sucursal_id !== null && sucursal_id !== '') ? parseInt(sucursal_id) : null;
  const nombre = (empleado || '').trim().toLowerCase();
  const abierta = d.jornadas.find(j =>
    (j.empleado || '').trim().toLowerCase() === nombre &&
    j.fecha === hoy &&
    j.entrada != null &&
    j.salida == null &&
    (sid == null || j.sucursal_id === sid)
  );
  return abierta || null;
}

// Corrección manual de entrada/salida/nota, registrando cada cambio en
// `correcciones` (rastro inalterable) en vez de sobrescribir en silencio.
function corregirJornada(id, campos = {}) {
  const d = load();
  if (!d.jornadas) d.jornadas = [];
  const j = d.jornadas.find(x => x.id === id);
  if (!j) return;
  if (!j.correcciones) j.correcciones = [];
  const CAMPOS_EDITABLES = ['entrada', 'salida', 'nota'];
  for (const campo of CAMPOS_EDITABLES) {
    if (campo in campos && campos[campo] !== j[campo]) {
      j.correcciones.push({ ts: new Date().toISOString(), campo, antes: j[campo], despues: campos[campo] });
      j[campo] = campos[campo];
    }
  }
  save();
}

function borrarJornada(id) {
  const d = load();
  if (!d.jornadas) d.jornadas = [];
  d.jornadas = d.jornadas.filter(x => x.id !== id);
  save();
}

module.exports = {
  getJornadas, ficharEntrada, ficharSalida, jornadaAbiertaDe, corregirJornada, borrarJornada,
};
