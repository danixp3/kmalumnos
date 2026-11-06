// Los recuentos de clases (Panel, gráficos, vehículos, resumen) suman lo que vale
// cada clase: ½ clase cuenta ½, no una entera. Contar filas es contar sesiones.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

const HOY = '2026-09-29';

// Alumno con: 1 clase entera, 1 media clase y 1 cuarto el mismo día (= 1 ¾) y otra entera otro día
function escenario() {
  const vid = db.addVehiculo('Ibiza', '4821 LKM', 0);
  const aid = db.addAlumno('Lucía Martín', 'B', vid);
  const a = db.addPractica(aid, vid, HOY, 100, 130);
  const b = db.addPractica(aid, vid, HOY, 130, 145);
  const c = db.addPractica(aid, vid, HOY, 145, 152);
  db.updatePractica(b, HOY, 130, 145, null, 'circulacion', null, 0.5);
  db.updatePractica(c, HOY, 145, 152, null, 'circulacion', null, 0.25);
  db.addPractica(aid, vid, '2026-09-01', 70, 100);
  return { vid, aid, ids: [a, b, c] };
}

test('Panel: clases de hoy y del mes suman fracciones, y la media de km es por clase', () => {
  escenario();
  const p = db.getPanel(HOY);
  expect(p.practicasHoy).toBe(1.75);
  expect(p.practicasMes).toBe(2.75);
  expect(p.kmMes).toBe(82); // 30 + 15 + 7 + 30
  expect(p.mediaKmPractica).toBeCloseTo(29.8, 1); // 82 km / 2,75 clases
  expect(p.porDia.find(d => d.fecha === HOY).n).toBe(1.75);
  // programadas hoy nunca baja de las clases ya hechas (también con fracciones)
  expect(p.programadasHoy).toBe(1.75);
});

test('Panel: una clase sin km no baja la media de km por clase', () => {
  const vid = db.addVehiculo('Ibiza', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, HOY, 100, 140);
  db.addPractica(aid, vid, HOY, 0, 0); // en blanco: falta anotarla
  expect(db.getPanel(HOY).mediaKmPractica).toBe(40);
});

test('Dashboard y resumen: practicasHoy y total de prácticas son clases, no filas', () => {
  escenario();
  expect(db.getStatsDashboard(HOY).practicasHoy).toBe(1.75);
  expect(db.getResumen().practicas).toBe(2.75);
});

test('Gráficos: prácticas por mes (total, circulación, pista) y por vehículo suman fracciones', () => {
  const { vid, ids } = escenario();
  // la media clase pasa a ser de pista
  db.updatePractica(ids[1], HOY, 130, 145, null, 'pista', null, 0.5);
  const g = db.getDatosGraficos(60); // los meses cuentan hacia atrás desde el real; septiembre de 2026 queda dentro
  const mes = g.practicasPorMes.find(m => m.mes === '2026-09');
  expect(mes.pista).toBe(0.5);
  expect(mes.circulacion).toBe(2.25);
  expect(mes.total).toBe(2.75);
  expect(g.porVehiculo.find(v => v.nombre === 'Ibiza').num_practicas).toBe(2.75);
  expect(vid).toBeDefined();
});

test('Panel de vehículos: clases del mes con fracciones y km por clase solo entre las que tienen km', () => {
  const { vid } = escenario();
  db.addPractica(db.getAlumnos()[0].id, vid, HOY, 0, 0); // una en blanco más
  const pv = db.getPanelVehiculos(HOY);
  const v = pv.vehiculos.find(x => x.id === vid);
  expect(v.practicas_mes).toBe(3.75);
  expect(v.km_por_practica).toBeCloseTo(29.8, 1);
  expect(pv.total.practicas_mes).toBe(3.75);
  expect(pv.total.km_por_practica).toBeCloseTo(29.8, 1);
});

test('Panel de vehículos: una clase de pista sin km no cuenta como «sin km»', () => {
  const vid = db.addVehiculo('Moto', '', 0);
  const aid = db.addAlumno('Pau', 'A2', vid);
  const p = db.addPractica(aid, vid, HOY, 0, 0);
  db.updatePractica(p, HOY, 0, 0, null, 'pista');
  const v = db.getPanelVehiculos(HOY).vehiculos.find(x => x.id === vid);
  expect(v.sin_km).toBe(0);
});
