// ─── RESERVAS ────────────────────────────────────────────────────────────────
// CRUD local de reservas (agenda, "solicitudes de práctica" — modelo v1 del
// Bloque 2 SaaS, ROADMAP-SAAS.md). Una reserva es una cita alumno/profesor/
// vehículo/fecha/hora con un estado que la autoescuela confirma o cancela.
// Solo tiene sentido subir/bajar de la nube una vez aplicada la migración
// migraciones/2026-08-05_reservas.sql; hasta entonces d.reservas se guarda y
// lee igual en local, simplemente no sincroniza (ver sync.js/_reservasDisponible).

const { load, save, nextId, _sync, filtrarPorSucursal } = require('./core');

const ESTADOS_VALIDOS = ['solicitada', 'confirmada', 'cancelada', 'realizada'];

// sucursalId opcional: sin argumento devuelve todas las reservas (modo
// clásico o "Todas las sucursales") — ver filtrarPorSucursal en core.js.
function getReservas(sucursalId) {
  const d = load();
  if (!d.reservas) d.reservas = [];
  return filtrarPorSucursal(d.reservas, sucursalId)
    .slice()
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.hora_inicio || '').localeCompare(b.hora_inicio || ''))
    .map(r => {
      const al = d.alumnos.find(x => x.id === r.alumno_id);
      const prof = d.profesores.find(x => x.id === r.profesor_id);
      const v = d.vehiculos.find(x => x.id === r.vehiculo_id);
      return {
        ...r,
        alumno_nombre: al ? al.nombre : '',
        profesor_nombre: prof ? prof.nombre : '',
        vehiculo_nombre: v ? v.nombre : ''
      };
    });
}

function addReserva({ alumno_id, profesor_id, vehiculo_id, fecha, hora_inicio, duracion_min, estado, origen, nota, sucursal_id } = {}) {
  const d = load();
  if (!d.reservas) d.reservas = [];
  const id = nextId('r');
  d.reservas.push({
    id,
    alumno_id: alumno_id ? parseInt(alumno_id) : null,
    profesor_id: profesor_id ? parseInt(profesor_id) : null,
    vehiculo_id: vehiculo_id ? parseInt(vehiculo_id) : null,
    fecha: fecha || null,
    hora_inicio: hora_inicio || null,
    duracion_min: duracion_min != null ? parseInt(duracion_min) : 45,
    estado: estado || 'solicitada',
    origen: origen || 'desktop',
    nota: nota || '',
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null
  });
  save();
  const s = _sync(); if (s) s.markDirty('reservas', id);
  return id;
}

function updateReserva(id, campos = {}) {
  const d = load();
  if (!d.reservas) d.reservas = [];
  const r = d.reservas.find(x => x.id === id);
  if (!r) return;
  if ('alumno_id' in campos) r.alumno_id = campos.alumno_id ? parseInt(campos.alumno_id) : null;
  if ('profesor_id' in campos) r.profesor_id = campos.profesor_id ? parseInt(campos.profesor_id) : null;
  if ('vehiculo_id' in campos) r.vehiculo_id = campos.vehiculo_id ? parseInt(campos.vehiculo_id) : null;
  if ('fecha' in campos) r.fecha = campos.fecha || null;
  if ('hora_inicio' in campos) r.hora_inicio = campos.hora_inicio || null;
  if ('duracion_min' in campos) r.duracion_min = campos.duracion_min != null ? parseInt(campos.duracion_min) : 45;
  if ('nota' in campos) r.nota = campos.nota || '';
  if ('sucursal_id' in campos) r.sucursal_id = campos.sucursal_id ? parseInt(campos.sucursal_id) : null;
  save();
  const s = _sync(); if (s) s.markDirty('reservas', id);
}

function setEstadoReserva(id, estado) {
  if (!ESTADOS_VALIDOS.includes(estado)) {
    throw new Error(`Estado de reserva no válido: "${estado}". Debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}.`);
  }
  const d = load();
  if (!d.reservas) d.reservas = [];
  const r = d.reservas.find(x => x.id === id);
  if (!r) return;
  r.estado = estado;
  save();
  const s = _sync(); if (s) s.markDirty('reservas', id);
}

function deleteReserva(id) {
  const d = load();
  if (!d.reservas) d.reservas = [];
  d.reservas = d.reservas.filter(x => x.id !== id);
  save();
  const s = _sync(); if (s) s.markDeleted('reservas', id);
}

module.exports = {
  getReservas, addReserva, updateReserva, setEstadoReserva, deleteReserva,
};
