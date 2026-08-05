// Tests de la ficha de clases prácticas firmable (RD 1295/2003 art. 40).
// Registro LOCAL: no toca sync.js, solo db/practicas.js:getFichaPracticasAlumno.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('getFichaPracticasAlumno devuelve alumno inexistente como null', () => {
  expect(db.getFichaPracticasAlumno(999)).toBeNull();
});

test('getFichaPracticasAlumno con alumno sin prácticas devuelve array vacío y totales en 0', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);

  const ficha = db.getFichaPracticasAlumno(aid);
  expect(ficha.alumno).toMatchObject({ id: aid, nombre: 'Ana', permiso: 'B' });
  expect(ficha.practicas).toEqual([]);
  expect(ficha.totales).toEqual({ nClases: 0, kmTotales: 0 });
});

test('getFichaPracticasAlumno ordena por fecha, calcula km_recorridos y resuelve nombres', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const pid = db.addProfesor('Juan');
  const aid = db.addAlumno('Ana', 'B', vid);

  // Sembradas fuera de orden a propósito, para comprobar el ordenado por fecha.
  const p2 = db.addPractica(aid, vid, '2026-07-10', 100, 150, pid, 'pista');
  const p1 = db.addPractica(aid, vid, '2026-07-01', 0, 40, pid, 'circulacion');

  const ficha = db.getFichaPracticasAlumno(aid);
  expect(ficha.practicas.map(p => p.id)).toEqual([p1, p2]);

  const primera = ficha.practicas[0];
  expect(primera.fecha).toBe('2026-07-01');
  expect(primera.vehiculo_nombre).toBe('Coche 1');
  expect(primera.matricula).toBe('1234ABC');
  expect(primera.profesor_nombre).toBe('Juan');
  expect(primera.tipo).toBe('circulacion');
  expect(primera.km_recorridos).toBe(40);

  const segunda = ficha.practicas[1];
  expect(segunda.km_recorridos).toBe(50);

  expect(ficha.totales).toEqual({ nClases: 2, kmTotales: 90 });
});
