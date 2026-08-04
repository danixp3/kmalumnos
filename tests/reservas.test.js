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
