// Tests del CRUD local de reservas (agenda, "solicitudes de práctica" —
// Bloque 2 SaaS, ver ROADMAP-SAAS.md). Solo capa de datos: todavía no hay
// interfaz de usuario que use estas funciones.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('addReserva crea con estado "solicitada" por defecto y devuelve id', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addProfesor('Juan', '');

  const rid = db.addReserva({ alumno_id: aid, profesor_id: pid, vehiculo_id: vid, fecha: '2026-08-10', hora_inicio: '10:00' });
  expect(typeof rid).toBe('number');

  const reservas = db.getReservas();
  expect(reservas).toHaveLength(1);
  expect(reservas[0]).toMatchObject({ id: rid, estado: 'solicitada', origen: 'desktop', duracion_min: 45 });
});

test('getReservas devuelve la reserva con nombres resueltos de alumno/profesor/vehiculo', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addProfesor('Juan', '');

  const rid = db.addReserva({ alumno_id: aid, profesor_id: pid, vehiculo_id: vid, fecha: '2026-08-10', hora_inicio: '10:00' });
  const reserva = db.getReservas().find(r => r.id === rid);
  expect(reserva).toMatchObject({
    alumno_nombre: 'Ana',
    profesor_nombre: 'Juan',
    vehiculo_nombre: 'Coche 1'
  });
});

test('setEstadoReserva cambia el estado a uno válido', () => {
  const rid = db.addReserva({ fecha: '2026-08-10' });
  db.setEstadoReserva(rid, 'confirmada');
  expect(db.getReservas().find(r => r.id === rid).estado).toBe('confirmada');

  db.setEstadoReserva(rid, 'realizada');
  expect(db.getReservas().find(r => r.id === rid).estado).toBe('realizada');
});

test('setEstadoReserva rechaza un estado inválido', () => {
  const rid = db.addReserva({ fecha: '2026-08-10' });
  expect(() => db.setEstadoReserva(rid, 'inventado')).toThrow();
  // El estado no cambió
  expect(db.getReservas().find(r => r.id === rid).estado).toBe('solicitada');
});

test('deleteReserva quita la reserva de getReservas y encola el borrado para sync', () => {
  const rid = db.addReserva({ fecha: '2026-08-10' });
  expect(db.getReservas()).toHaveLength(1);

  db.deleteReserva(rid);
  expect(db.getReservas()).toHaveLength(0);

  // El borrado quedó encolado para subir a la nube (soft delete remoto)
  const fs = require('fs');
  const path = require('path');
  const { userDataDir } = require('./helpers');
  const pending = JSON.parse(fs.readFileSync(path.join(userDataDir, 'pending_sync.json'), 'utf-8'));
  expect(pending.deleted.reservas).toContain(rid);
});

// ─── n_practicas (mejora de agenda: nº de prácticas en vez de minutos) ────────

test('addReserva guarda n_practicas (default 1 si no se indica)', () => {
  const rid1 = db.addReserva({ fecha: '2026-08-10' });
  expect(db.getReservas().find(r => r.id === rid1).n_practicas).toBe(1);

  const rid2 = db.addReserva({ fecha: '2026-08-10', n_practicas: 3 });
  expect(db.getReservas().find(r => r.id === rid2).n_practicas).toBe(3);
});

test('updateReserva actualiza n_practicas', () => {
  const rid = db.addReserva({ fecha: '2026-08-10', n_practicas: 1 });
  db.updateReserva(rid, { n_practicas: 4 });
  expect(db.getReservas().find(r => r.id === rid).n_practicas).toBe(4);
});

// ─── completarReserva ──────────────────────────────────────────────────────

test('completarReserva crea n_practicas prácticas para el alumno y marca la reserva realizada', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addProfesor('Juan', '');
  const rid = db.addReserva({ alumno_id: aid, profesor_id: pid, vehiculo_id: vid, fecha: '2026-08-10', n_practicas: 2 });

  const res = db.completarReserva(rid);
  expect(res).toEqual({ ok: true, creadas: 2 });

  expect(db.getReservas().find(r => r.id === rid).estado).toBe('realizada');
  const practicas = db.getPracticasByAlumno(aid);
  expect(practicas).toHaveLength(2);
  practicas.forEach(p => {
    expect(p.vehiculo_id).toBe(vid);
    expect(p.profesor_id).toBe(pid);
    expect(p.fecha).toBe('2026-08-10');
    expect(p.km_inicial).toBe(0);
    expect(p.km_final).toBe(0);
  });
});

test('completarReserva no duplica prácticas si la reserva ya estaba realizada', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const rid = db.addReserva({ alumno_id: aid, vehiculo_id: vid, fecha: '2026-08-10', n_practicas: 2 });

  const primero = db.completarReserva(rid);
  expect(primero.creadas).toBe(2);

  const segundo = db.completarReserva(rid);
  expect(segundo).toEqual({ ok: true, yaRealizada: true, creadas: 0 });

  expect(db.getPracticasByAlumno(aid)).toHaveLength(2);
});

test('completarReserva falla si la reserva no tiene vehículo asignado', () => {
  const aid = db.addAlumno('Ana', 'B', null);
  const rid = db.addReserva({ alumno_id: aid, fecha: '2026-08-10', n_practicas: 1 });

  const res = db.completarReserva(rid);
  expect(res.ok).toBe(false);
  expect(res.msg).toMatch(/vehículo/i);

  // No cambió el estado ni creó prácticas
  expect(db.getReservas().find(r => r.id === rid).estado).toBe('solicitada');
  expect(db.getPracticasByAlumno(aid)).toHaveLength(0);
});
