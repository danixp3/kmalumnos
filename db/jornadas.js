// ─── JORNADAS (REGISTRO DE JORNADA LABORAL) ───────────────────────────────────
// Fichaje de entrada/salida por empleado (art. 34.9 del Estatuto de los
// Trabajadores: obligación de registro diario de jornada, conservación 4
// años). Es un registro LOCAL por puesto — NO sincroniza con Supabase en
// esta v1 (no toca sync.js ni _sync()); cada PC lleva el suyo propio en su
// data.json. El registro es inalterable salvo corrección manual, y cada
// corrección queda anotada en `correcciones` para dejar rastro auditable
// (nunca se sobrescribe en silencio entrada/salida/nota).

const { load, save, nextId, hoyLocalISO, addLog } = require('./core');

// Día de hoy en la hora de España (no en UTC: entre las 00:00 y las 02:00 la
// fecha UTC aún es la de ayer y el fichaje quedaba en el día anterior).
function _hoy() {
  return hoyLocalISO();
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
  if (j.anulada) return { ok: false, msg: 'Esa jornada está anulada.' };
  if (j.salida) return { ok: false, msg: 'Ya tiene salida registrada.' };
  j.salida = _horaActual();
  // Salida pasada la medianoche: queda el día en que se fichó
  const hoy = _hoy();
  if (j.fecha && j.fecha !== hoy) j.salida_fecha = hoy;
  save();
  return { ok: true };
}

// Día anterior a una fecha ISO (calendario local)
function _ayer(iso) {
  const [y, m, dd] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, dd - 1);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}
const MAX_JORNADA_ABIERTA_MIN = 16 * 60; // una jornada de ayer sigue abierta si empezó hace menos de 16 h

function jornadaAbiertaDe(empleado, sucursal_id) {
  const d = load();
  if (!d.jornadas) d.jornadas = [];
  const hoy = _hoy(), ayer = _ayer(hoy);
  const ahora = (() => { const [h, m] = _horaActual().split(':').map(Number); return h * 60 + m; })();
  const sid = (sucursal_id !== undefined && sucursal_id !== null && sucursal_id !== '') ? parseInt(sucursal_id) : null;
  const nombre = (empleado || '').trim().toLowerCase();
  // La de hoy, o la de ayer que cruza la medianoche (turno de tarde-noche); una
  // de ayer olvidada sin salida no se cierra hoy con 24 h: se corrige a mano.
  const reciente = j => {
    if (j.fecha === hoy) return true;
    if (j.fecha !== ayer || !/^\d{2}:\d{2}$/.test(j.entrada || '')) return false;
    const [h, m] = j.entrada.split(':').map(Number);
    return (24 * 60 - (h * 60 + m)) + ahora < MAX_JORNADA_ABIERTA_MIN;
  };
  const abierta = d.jornadas.find(j =>
    (j.empleado || '').trim().toLowerCase() === nombre &&
    !j.anulada &&
    reciente(j) &&
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
  if (!j || j.anulada) return;
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

// El registro de jornada se conserva 4 años y no se puede hacer desaparecer
// (art. 34.9 ET): una jornada equivocada se ANULA con su motivo, queda en la
// lista y en la exportación para Inspección, y se anota en el Historial.
function anularJornada(id, motivo) {
  const d = load();
  if (!d.jornadas) d.jornadas = [];
  const j = d.jornadas.find(x => x.id === id);
  if (!j) return { ok: false, msg: 'Jornada no encontrada.' };
  if (j.anulada) return { ok: false, msg: 'Ya está anulada.' };
  const m = String(motivo == null ? '' : motivo).trim().slice(0, 200);
  if (!m) return { ok: false, msg: 'Escribe el motivo de la anulación.' };
  const ts = new Date().toISOString();
  j.anulada = { ts, motivo: m };
  if (!j.correcciones) j.correcciones = [];
  j.correcciones.push({ ts, campo: 'anulada', antes: null, despues: m });
  addLog('jornada', `Jornada anulada: ${j.empleado} del ${j.fecha} (${j.entrada || '—'}–${j.salida || '—'}). Motivo: ${m}`, []);
  save();
  return { ok: true };
}
// Nombre antiguo: ya no borra, anula (sin motivo escrito, queda uno genérico)
function borrarJornada(id, motivo) {
  return anularJornada(id, motivo || 'Anulada (sin motivo indicado)');
}

module.exports = {
  getJornadas, ficharEntrada, ficharSalida, jornadaAbiertaDe, corregirJornada, anularJornada, borrarJornada,
};
