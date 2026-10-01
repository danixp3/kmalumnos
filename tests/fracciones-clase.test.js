// Fracciones de clase (¼ ½ ¾) anotadas en el móvil (practica.fraccion): se
// cobran en proporción a la tarifa y suman lo que valen en los totales.
const db = require('../db');
const core = require('../db/core');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

function alumnoConClases() {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 30);
  db.addPractica(aid, vid, '2026-09-01', 1000, 1040, null, 'circulacion', null, '10:00');
  const media = db.addPractica(aid, vid, '2026-09-01', 1040, 1060, null, 'circulacion', null, '10:45');
  const cuarto = db.addPractica(aid, vid, '2026-09-02', 1060, 1070, null, 'circulacion', null, '10:00');
  const d = core.load();
  d.practicas.find(p => p.id === media).fraccion = 0.5;
  d.practicas.find(p => p.id === cuarto).fraccion = 0.25;
  return aid;
}

test('clasesDePractica y fmtClases', () => {
  expect([undefined, null, 1, 0.5, 0.25, 0.75, 0.3, 2].map(f => core.clasesDePractica({ fraccion: f }))).toEqual([1, 1, 1, 0.5, 0.25, 0.75, 0.25, 1]);
  expect([0.25, 0.5, 1, 1.5, 2.75, 3].map(core.fmtClases)).toEqual(['¼', '½', '1', '1 ½', '2 ¾', '3']);
});

test('getDeudas cobra ½ clase como media tarifa y ¼ como un cuarto', () => {
  const aid = alumnoConClases();
  const deuda = db.getDeudas().find(x => x.alumno_id === aid);
  expect(deuda.total_generado).toBe(30 + 15 + 7.5);
  expect(deuda.num_practicas).toBe(1.75);
});

test('getDesglosePagosAlumno reparte los pagos con el precio de cada fracción', () => {
  const aid = alumnoConClases();
  db.addPago(aid, '2026-09-03', 40, '');
  const des = db.getDesglosePagosAlumno(aid);
  expect(des.practicas.map(p => [p.precio, p.clases, p.estado, p.cubierto])).toEqual([
    [30, 1, 'pagada', 30], [15, 0.5, 'parcial', 10], [7.5, 0.25, 'pendiente', 0],
  ]);
});

test('la lista de alumnos suma las fracciones a las clases hechas', () => {
  const aid = alumnoConClases();
  const fila = db.getAlumnosLista(undefined, '2026-10-01').find(x => x.id === aid);
  expect(fila.num_practicas).toBe(1.75);
  expect(fila.num_practicas_app).toBe(1.75);
});

test('updatePractica guarda la fracción si se pasa y la deja como estaba si no', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addPractica(aid, vid, '2026-09-01', 1000, 1040);
  db.updatePractica(pid, '2026-09-01', 1000, 1040, null, 'circulacion', null, 0.5);
  expect(core.load().practicas[0].fraccion).toBe(0.5);
  db.updatePractica(pid, '2026-09-01', 1000, 1045);                 // llamada antigua: no toca la fracción
  expect(core.load().practicas[0].fraccion).toBe(0.5);
  db.updatePractica(pid, '2026-09-01', 1000, 1045, null, 'circulacion', null, null);
  expect(core.load().practicas[0].fraccion).toBeNull();
  db.updatePractica(pid, '2026-09-01', 1000, 1045, null, 'circulacion', null, 0.3); // no válida → entera
  expect(core.load().practicas[0].fraccion).toBeNull();
});
