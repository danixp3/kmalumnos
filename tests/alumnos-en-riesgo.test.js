// Tests de "Alumnos en riesgo de abandono" (heurística v1, ver
// db/estadisticas.js:getAlumnosEnRiesgo). diasSinPractica se calcula contra
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

test('alumno con última práctica hace 40 días -> en riesgo', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, fechaHaceNDias(40), 0, 0);

  const riesgo = db.getAlumnosEnRiesgo();
  const r = riesgo.find(x => x.alumno_id === aid);
  expect(r).toBeDefined();
  expect(r.diasSinPractica).toBe(40);
  expect(r.nPracticas).toBe(1);
});

test('alumno con última práctica hace 10 días -> no está en riesgo', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Bea', 'B', vid);
  db.addPractica(aid, vid, fechaHaceNDias(10), 0, 0);

  const riesgo = db.getAlumnosEnRiesgo();
  expect(riesgo.find(x => x.alumno_id === aid)).toBeUndefined();
});

test('alumno con 0 prácticas -> no cuenta como riesgo', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Carlos', 'B', vid);

  const riesgo = db.getAlumnosEnRiesgo();
  expect(riesgo.find(x => x.alumno_id === aid)).toBeUndefined();
});

test('ordena por diasSinPractica descendente', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid1 = db.addAlumno('Diego', 'B', vid);
  db.addPractica(aid1, vid, fechaHaceNDias(35), 0, 0);
  const aid2 = db.addAlumno('Elena', 'B', vid);
  db.addPractica(aid2, vid, fechaHaceNDias(90), 0, 0);
  const aid3 = db.addAlumno('Fede', 'B', vid);
  db.addPractica(aid3, vid, fechaHaceNDias(31), 0, 0);

  const riesgo = db.getAlumnosEnRiesgo();
  const ids = riesgo.map(r => r.alumno_id);
  expect(ids).toEqual([aid2, aid1, aid3]);
});

test('prácticas borradas no cuentan para calcular el riesgo', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Gema', 'B', vid);
  const pid = db.addPractica(aid, vid, fechaHaceNDias(40), 0, 0);
  db.deletePractica(pid);

  const riesgo = db.getAlumnosEnRiesgo();
  expect(riesgo.find(x => x.alumno_id === aid)).toBeUndefined();
});

test('alumno borrado no aparece aunque tenga prácticas antiguas', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Hugo', 'B', vid);
  db.addPractica(aid, vid, fechaHaceNDias(60), 0, 0);
  db.deleteAlumno(aid);

  const riesgo = db.getAlumnosEnRiesgo();
  expect(riesgo.find(x => x.alumno_id === aid)).toBeUndefined();
});
