// Tests de getTodasPracticas: vista global de prácticas de todos los alumnos.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('devuelve todas las prácticas de todos los alumnos sin filtros', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const a1 = db.addAlumno('Ana', 'B', vid);
  const a2 = db.addAlumno('Luis', 'B', vid);
  db.addPractica(a1, vid, '2026-07-01', 0, 40);
  db.addPractica(a2, vid, '2026-07-02', 0, 30);

  const todas = db.getTodasPracticas();
  expect(todas.length).toBe(2);
});

test('filtra por desde/hasta por separado y combinados', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-06-30', 0, 10);
  db.addPractica(aid, vid, '2026-07-01', 0, 10);
  db.addPractica(aid, vid, '2026-07-15', 0, 10);
  db.addPractica(aid, vid, '2026-07-16', 0, 10);

  expect(db.getTodasPracticas({ desde: '2026-07-01' }).length).toBe(3);
  expect(db.getTodasPracticas({ hasta: '2026-07-01' }).length).toBe(2);
  expect(db.getTodasPracticas({ desde: '2026-07-01', hasta: '2026-07-15' }).length).toBe(2);
});

test('filtra por alumno_id', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const a1 = db.addAlumno('Ana', 'B', vid);
  const a2 = db.addAlumno('Luis', 'B', vid);
  db.addPractica(a1, vid, '2026-07-01', 0, 10);
  db.addPractica(a2, vid, '2026-07-02', 0, 10);

  const filtradas = db.getTodasPracticas({ alumno_id: a1 });
  expect(filtradas.length).toBe(1);
  expect(filtradas[0].alumno_id).toBe(a1);
});

test('filtra por vehiculo_id', () => {
  const v1 = db.addVehiculo('Coche 1', '', 0);
  const v2 = db.addVehiculo('Coche 2', '', 0);
  const a1 = db.addAlumno('Ana', 'B', v1);
  const a2 = db.addAlumno('Luis', 'B', v2);
  db.addPractica(a1, v1, '2026-07-01', 0, 10);
  db.addPractica(a2, v2, '2026-07-02', 0, 10);

  const filtradas = db.getTodasPracticas({ vehiculo_id: v2 });
  expect(filtradas.length).toBe(1);
  expect(filtradas[0].vehiculo_id).toBe(v2);
});

test('filtra por profesor_id', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const p1 = db.addProfesor('Juan', '');
  const p2 = db.addProfesor('Marta', '');
  db.addPractica(aid, vid, '2026-07-01', 0, 10, p1);
  db.addPractica(aid, vid, '2026-07-02', 0, 10, p2);

  const filtradas = db.getTodasPracticas({ profesor_id: p2 });
  expect(filtradas.length).toBe(1);
  expect(filtradas[0].profesor_id).toBe(p2);
});

test('filtra por tipo', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-07-01', 0, 10, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-02', 0, 10, null, 'pista');

  expect(db.getTodasPracticas({ tipo: 'pista' }).length).toBe(1);
  expect(db.getTodasPracticas({ tipo: 'circulacion' }).length).toBe(1);
});

test('combina varios filtros a la vez', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const a1 = db.addAlumno('Ana', 'B', vid);
  const a2 = db.addAlumno('Luis', 'B', vid);
  const pid = db.addProfesor('Juan', '');
  db.addPractica(a1, vid, '2026-07-10', 0, 10, pid, 'pista');
  db.addPractica(a1, vid, '2026-07-11', 0, 10, pid, 'circulacion');
  db.addPractica(a2, vid, '2026-07-10', 0, 10, pid, 'pista');

  const filtradas = db.getTodasPracticas({ alumno_id: a1, tipo: 'pista', desde: '2026-07-01', hasta: '2026-07-31' });
  expect(filtradas.length).toBe(1);
  expect(filtradas[0].alumno_id).toBe(a1);
  expect(filtradas[0].tipo).toBe('pista');
});

test('excluye prácticas borradas (deleted:true)', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const p1 = db.addPractica(aid, vid, '2026-07-01', 0, 10);
  db.addPractica(aid, vid, '2026-07-02', 0, 10);
  db.deletePractica(p1);

  const todas = db.getTodasPracticas();
  expect(todas.length).toBe(1);
});

test('mantiene la práctica de un profesor borrado, mostrando "—" en vez de ocultarla', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addProfesor('Juan', '');
  db.addPractica(aid, vid, '2026-07-01', 0, 10, pid);
  db.deleteProfesor(pid);

  const todas = db.getTodasPracticas();
  expect(todas.length).toBe(1);
  expect(todas[0].profesor_nombre).toBe('—');
});

test('calcula km_recorridos correctamente', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-07-01', 100, 145);

  const [p] = db.getTodasPracticas();
  expect(p.km_recorridos).toBe(45);
});

test('marca sin_km correctamente (true solo si km_inicial=0 y km_final=0)', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-07-01', 0, 0);
  db.addPractica(aid, vid, '2026-07-02', 0, 10);

  const todas = db.getTodasPracticas();
  const sinKm = todas.find(p => p.fecha === '2026-07-01');
  const conKm = todas.find(p => p.fecha === '2026-07-02');
  expect(sinKm.sin_km).toBe(true);
  expect(sinKm.km_recorridos).toBe(0);
  expect(conKm.sin_km).toBe(false);
});

test('ordena por fecha descendente y, a igualdad de fecha, por id descendente', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const p1 = db.addPractica(aid, vid, '2026-07-01', 0, 10);
  const p2 = db.addPractica(aid, vid, '2026-07-03', 0, 10);
  const p3 = db.addPractica(aid, vid, '2026-07-01', 0, 10); // misma fecha que p1, id mayor

  const todas = db.getTodasPracticas();
  expect(todas.map(p => p.id)).toEqual([p2, p3, p1]);
});
