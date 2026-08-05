// Tests de permisos múltiples del alumno (tarea B1 del PLAN-MAESTRO): campo
// NUEVO `permisos` (array de los DEMÁS permisos que cursa, aparte del
// `permiso` principal que NO se toca) + el ciclo de estados ampliado. Mismo
// patrón de mock que tests/alumnos-libro.test.js.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('addAlumno con permisos filtra inválidos y normaliza', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid, null, null, null, null, null, ['B', 'A2', 'basura']);
  const a = db.getAlumnos().find(x => x.id === aid);
  expect(a.permisos).toEqual(['B', 'A2']);
  expect(a.permiso).toBe('B'); // el principal no se toca
});

test('addAlumno sin permisos: permisos es [] y el permiso principal queda intacto', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Luis', 'B', vid);
  const a = db.getAlumnos().find(x => x.id === aid);
  expect(a.permisos).toEqual([]);
  expect(a.permiso).toBe('B');
});

test('updateAlumno cambia permisos correctamente', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid, null, null, null, null, null, ['A2']);
  db.updateAlumno(aid, 'Ana', 'B', vid, null, null, null, null, ['C', 'D1']);
  const a = db.getAlumnos().find(x => x.id === aid);
  expect(a.permisos).toEqual(['C', 'D1']);
  expect(a.permiso).toBe('B'); // el principal sigue intacto
});

test('duplicados y minúsculas se normalizan', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid, null, null, null, null, null, ['b', 'B']);
  const a = db.getAlumnos().find(x => x.id === aid);
  expect(a.permisos).toEqual(['B']);
});

test('un estado nuevo del ciclo ampliado se acepta; uno inválido se guarda como null', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid, null, null, null, { estado: 'en_practicas' });
  const a = db.getAlumnos().find(x => x.id === aid);
  expect(a.estado).toBe('en_practicas');

  db.updateAlumno(aid, 'Ana', 'B', vid, null, null, { estado: 'inventado' });
  const a2 = db.getAlumnos().find(x => x.id === aid);
  expect(a2.estado).toBeNull(); // mismo comportamiento que antes: inválido -> null
});
