// Tests de getStatsProfesores: estadísticas por profesor (pantalla Profesores).
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('calcula num_practicas, km_totales, num_alumnos, practicas_pista/circulacion por profesor', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const pid = db.addProfesor('Juan', '');
  const a1 = db.addAlumno('Ana', 'B', vid);
  const a2 = db.addAlumno('Luis', 'B', vid);

  db.addPractica(a1, vid, '2026-07-01', 0, 40, pid, 'circulacion'); // 40 km
  db.addPractica(a1, vid, '2026-07-02', 40, 70, pid, 'pista'); // 30 km
  db.addPractica(a2, vid, '2026-07-03', 0, 20, pid, 'circulacion'); // 20 km

  const stats = db.getStatsProfesores();
  const juan = stats.find(s => s.id === pid);
  expect(juan.num_practicas).toBe(3);
  expect(juan.km_totales).toBe(90);
  expect(juan.num_alumnos).toBe(2);
  expect(juan.practicas_pista).toBe(1);
  expect(juan.practicas_circulacion).toBe(2);
  expect(juan.ultima_practica).toBe('2026-07-03');
});

test('una práctica sin tipo cuenta como circulación', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const pid = db.addProfesor('Juan', '');
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-07-01', 0, 10, pid); // sin tipo -> circulacion

  const stats = db.getStatsProfesores();
  const juan = stats.find(s => s.id === pid);
  expect(juan.practicas_circulacion).toBe(1);
  expect(juan.practicas_pista).toBe(0);
});

test('excluye prácticas borradas y prácticas de alumnos borrados', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const pid = db.addProfesor('Juan', '');
  const a1 = db.addAlumno('Ana', 'B', vid);
  const a2 = db.addAlumno('Luis', 'B', vid);

  const p1 = db.addPractica(a1, vid, '2026-07-01', 0, 40, pid, 'circulacion');
  db.addPractica(a2, vid, '2026-07-02', 0, 30, pid, 'circulacion');
  db.deletePractica(p1);
  db.deleteAlumno(a2);

  const stats = db.getStatsProfesores();
  const juan = stats.find(s => s.id === pid);
  expect(juan.num_practicas).toBe(0);
  expect(juan.km_totales).toBe(0);
  expect(juan.num_alumnos).toBe(0);
  expect(juan.ultima_practica).toBeNull();
});

test('filtra por rango de fechas desde/hasta (inclusive)', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const pid = db.addProfesor('Juan', '');
  const aid = db.addAlumno('Ana', 'B', vid);

  db.addPractica(aid, vid, '2026-06-30', 0, 10, pid, 'circulacion');
  db.addPractica(aid, vid, '2026-07-01', 0, 10, pid, 'circulacion');
  db.addPractica(aid, vid, '2026-07-15', 0, 10, pid, 'circulacion');
  db.addPractica(aid, vid, '2026-07-16', 0, 10, pid, 'circulacion');

  const stats = db.getStatsProfesores('2026-07-01', '2026-07-15');
  const juan = stats.find(s => s.id === pid);
  expect(juan.num_practicas).toBe(2);
});

test('un profesor sin prácticas aparece en el resultado con todo a 0/null', () => {
  db.addProfesor('Sin prácticas', '');
  const stats = db.getStatsProfesores();
  expect(stats.length).toBe(1);
  expect(stats[0]).toMatchObject({
    num_practicas: 0,
    km_totales: 0,
    num_alumnos: 0,
    practicas_pista: 0,
    practicas_circulacion: 0,
    ultima_practica: null,
  });
});

test('una práctica con km_inicial=0 y km_final=0 no infla km_totales pero sí cuenta en num_practicas', () => {
  // Criterio (igual que el resto del proyecto, ver getResumen/getStatsDashboard):
  // una práctica "sin km registrado" (0,0) se considera pendiente de anotar,
  // no un trayecto real de 0 km, así que se excluye SOLO del sumatorio de
  // km_totales; sigue contando como práctica impartida (num_practicas).
  const vid = db.addVehiculo('Coche 1', '', 0);
  const pid = db.addProfesor('Juan', '');
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-07-01', 0, 0, pid, 'circulacion');

  const stats = db.getStatsProfesores();
  const juan = stats.find(s => s.id === pid);
  expect(juan.num_practicas).toBe(1);
  expect(juan.km_totales).toBe(0);
});

test('ordena el resultado por num_practicas descendente', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const menos = db.addProfesor('Menos prácticas', '');
  const mas = db.addProfesor('Más prácticas', '');
  const aid = db.addAlumno('Ana', 'B', vid);

  db.addPractica(aid, vid, '2026-07-01', 0, 10, menos, 'circulacion');
  db.addPractica(aid, vid, '2026-07-01', 0, 10, mas, 'circulacion');
  db.addPractica(aid, vid, '2026-07-02', 0, 10, mas, 'circulacion');

  const stats = db.getStatsProfesores();
  expect(stats[0].id).toBe(mas);
  expect(stats[1].id).toBe(menos);
});
