// Tests del semáforo de examen (heurística v1, ver db/estadisticas.js:
// getSemaforoExamen/getSemaforoAlumno). diasDesdeUltima se calcula contra
// "hoy", así que las fechas de las prácticas se generan relativas a la
// fecha real de ejecución del test (evita depender de una fecha fija).
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

// Devuelve 'YYYY-MM-DD' de hoy menos n días.
function fechaHaceNDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addPracticasRecientes(aid, vid, n, diasAtras) {
  for (let i = 0; i < n; i++) {
    db.addPractica(aid, vid, fechaHaceNDias(diasAtras), 0, 0);
  }
}

test('alumno con >= 20 prácticas recientes -> verde', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  addPracticasRecientes(aid, vid, 20, 5);

  const s = db.getSemaforoAlumno(aid);
  expect(s.nivel).toBe('verde');
  expect(s.nPracticas).toBe(20);
  expect(s.diasDesdeUltima).toBe(5);
});

test('alumno con 8 prácticas -> rojo', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Bea', 'B', vid);
  addPracticasRecientes(aid, vid, 8, 2);

  const s = db.getSemaforoAlumno(aid);
  expect(s.nivel).toBe('rojo');
  expect(s.motivo).toMatch(/8 prácticas/);
});

test('alumno con 15 prácticas -> ambar', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Carlos', 'B', vid);
  addPracticasRecientes(aid, vid, 15, 3);

  const s = db.getSemaforoAlumno(aid);
  expect(s.nivel).toBe('ambar');
});

test('alumno con >= 20 prácticas pero última hace 40 días -> ambar', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Diego', 'B', vid);
  addPracticasRecientes(aid, vid, 20, 40);

  const s = db.getSemaforoAlumno(aid);
  expect(s.nivel).toBe('ambar');
  expect(s.diasDesdeUltima).toBe(40);
});

test('alumno sin prácticas -> rojo, motivo "sin prácticas"', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Elena', 'B', vid);

  const s = db.getSemaforoAlumno(aid);
  expect(s.nivel).toBe('rojo');
  expect(s.motivo).toBe('sin prácticas');
  expect(s.nPracticas).toBe(0);
  expect(s.diasDesdeUltima).toBeNull();
});

test('getSemaforoAlumno devuelve null si el alumno no existe o está borrado', () => {
  expect(db.getSemaforoAlumno(9999)).toBeNull();

  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Fede', 'B', vid);
  db.deleteAlumno(aid);
  expect(db.getSemaforoAlumno(aid)).toBeNull();
});

test('getSemaforoExamen calcula kmTotales solo con prácticas con km válido y devuelve todos los alumnos no borrados', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Gema', 'B', vid);
  db.addPractica(aid, vid, fechaHaceNDias(1), 100, 140); // 40 km válidos (ambos > 0)
  db.addPractica(aid, vid, fechaHaceNDias(2), 0, 0); // sin km, no suma

  const borradoId = db.addAlumno('Borrado', 'B', vid);
  db.deleteAlumno(borradoId);

  const todos = db.getSemaforoExamen();
  expect(todos.find(s => s.alumno_id === borradoId)).toBeUndefined();

  const g = todos.find(s => s.alumno_id === aid);
  expect(g.kmTotales).toBe(40);
  expect(g.nPracticas).toBe(2);
});

test('práctica borrada no cuenta en el semáforo', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Hugo', 'B', vid);
  const pid = db.addPractica(aid, vid, fechaHaceNDias(1), 100, 140);
  db.deletePractica(pid);

  const s = db.getSemaforoAlumno(aid);
  expect(s.nPracticas).toBe(0);
  expect(s.nivel).toBe('rojo');
});
