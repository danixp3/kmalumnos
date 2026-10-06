// Cuadrar km · modo avanzado: «compañeros sin registrar» (alumnos que también
// usaban el coche y no están en la app). Ocupan km entre clase y clase en su
// rango de fechas; no crean alumnos ni clases. Math.random fijo a 0,5.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => {
  resetData(db);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => jest.restoreAllMocks());

function clase(aid, vid, fecha, hora, ki, kf, extra = {}) {
  const id = db.addPractica(aid, vid, fecha, ki, kf);
  const p = require('../db/core').load().practicas.find(x => x.id === id);
  p.hora_inicio = hora;
  Object.assign(p, extra);
  return id;
}
const COMP = { nombre: 'Los que aprobaron', desde: '2026-06-01', hasta: '2026-07-01', clases: 1, kmMin: 20, kmMax: 30 };

function escenario() {
  const vid = db.addVehiculo('Kia', '6643LSC', 1000);
  const erika = db.addAlumno('Erika', 'B', vid);
  const otro = db.addAlumno('Marco', 'B', vid);
  return { vid, erika, otro };
}

test('hacia atrás: los compañeros dejan su hueco entre días, nunca dentro de una sesión del mismo alumno', () => {
  const { vid, erika } = escenario();
  const c1 = clase(erika, vid, '2026-06-01', '10:00', 0, 0);
  const c2 = clase(erika, vid, '2026-06-01', '11:00', 0, 0);
  const c3 = clase(erika, vid, '2026-06-02', '10:00', 0, 0);
  const c4 = clase(erika, vid, '2026-06-02', '11:00', 0, 0);
  clase(erika, vid, '2026-07-01', '10:00', 2000, 2024);

  const sin = db.proponerCuadreKm(vid, { rellenarAntes: true });
  const kmSin = Object.fromEntries(sin.cambios.map(c => [c.practica_id, [c.despues.km_inicial, c.despues.km_final]]));
  expect(kmSin[c4]).toEqual([1976, 2000]);
  expect(kmSin[c1]).toEqual([1904, 1928]); // ella sola: todo seguido

  const con = db.proponerCuadreKm(vid, { rellenarAntes: true, companeros: [COMP] });
  const km = Object.fromEntries(con.cambios.map(c => [c.practica_id, [c.despues.km_inicial, c.despues.km_final]]));
  // 25 km de compañeros antes de la clase del 1/7 y otros 25 entre el día 1 y el 2
  expect(km[c4]).toEqual([1951, 1975]);
  expect(km[c3]).toEqual([1927, 1951]);
  expect(km[c2]).toEqual([1878, 1902]);
  expect(km[c1]).toEqual([1854, 1878]);
  expect(con.fantasmas.map(f => f.km)).toEqual([25, 25]);
  expect(con.resumen).toMatchObject({ companeros: 1, km_companeros: 50, clases_companeros: 2 });
  // No se crea nada: mismas prácticas y mismos alumnos
  expect(db.getAlumnos()).toHaveLength(2);
  expect(require('../db/core').load().practicas).toHaveLength(5);
});

test('entre dos clases conocidas: los km se reparten entre las clases y los compañeros', () => {
  const { vid, erika, otro } = escenario();
  clase(otro, vid, '2026-06-01', '09:00', 1000, 1024);
  const e1 = clase(erika, vid, '2026-06-02', '10:00', 0, 0);
  const e2 = clase(erika, vid, '2026-06-03', '10:00', 0, 0);
  clase(otro, vid, '2026-06-04', '09:00', 1124, 1150);

  const sin = db.proponerCuadreKm(vid);
  expect(sin.cambios.map(c => c.despues.km_final - c.despues.km_inicial)).toEqual([50, 50]);

  const con = db.proponerCuadreKm(vid, { companeros: [{ ...COMP, desde: '2026-06-01', hasta: '2026-06-04' }] });
  const kmClases = con.cambios.map(c => c.despues.km_final - c.despues.km_inicial);
  const kmFant = con.fantasmas.reduce((s, f) => s + f.km, 0);
  expect(con.fantasmas).toHaveLength(3); // antes de e1, entre e1 y e2, y antes de la del día 4
  expect(kmClases.reduce((a, b) => a + b, 0) + kmFant).toBe(100);
  for (const k of kmClases) expect(k).toBeLessThan(30);
  expect(con.cambios[0].despues.km_inicial).toBeGreaterThan(1024);
  expect(con.cambios[1].despues.km_final).toBeLessThan(1124);
  expect(con.huecos).toHaveLength(0);
  // Se aplica exactamente lo previsto
  expect(db.aplicarCuadreKm(vid, con.cambios)).toMatchObject({ aplicados: 2 });
  expect(e1).toBeDefined(); expect(e2).toBeDefined();
});

test('un hueco entre clases conocidas dentro del rango lo explican los compañeros', () => {
  const { vid, erika, otro } = escenario();
  const a = clase(erika, vid, '2026-06-02', '10:00', 1000, 1024);
  const b = clase(erika, vid, '2026-06-03', '10:00', 1050, 1074);
  clase(otro, vid, '2026-08-01', '10:00', 1200, 1224);
  expect(db.proponerCuadreKm(vid).huecos.map(h => h.clave)).toContain(`${a}-${b}`);
  db.setCompanerosKm(vid, [COMP]);
  const r = db.proponerCuadreKm(vid);
  expect(r.huecos.map(h => h.clave)).not.toContain(`${a}-${b}`);
  expect(r.fantasmas).toEqual([expect.objectContaining({ despues_de: a, antes_de: b, km: 26, explica: true })]);
  // El hueco con la clase de agosto (fuera del rango) sigue sin explicar
  expect(r.huecos).toHaveLength(1);
  // Y la lista de Prácticas lo da por explicado
  const lista = db.getTodasPracticas({});
  expect(lista.find(p => p.id === b).continuidad).toMatchObject({ diferencia: 26, companeros: true });
});

test('«volver a calcular» rehace los km que puso la app dentro del rango', () => {
  const { vid, erika } = escenario();
  const e1 = clase(erika, vid, '2026-06-02', '10:00', 1976, 2000, { tipo_detalle: 'km_auto' });
  const lectura = clase(erika, vid, '2026-06-01', '10:00', 1900, 1924);
  clase(erika, vid, '2026-06-03', '10:00', 2000, 2024);
  const r0 = db.proponerCuadreKm(vid, { companeros: [COMP] });
  expect(r0.cambios.find(c => c.practica_id === e1)).toBeUndefined(); // sin la opción no se toca
  const r = db.proponerCuadreKm(vid, { companeros: [COMP], rehacerCalculados: true });
  expect(r.resumen.rehechas).toBe(1);
  const c = r.cambios.find(x => x.practica_id === e1);
  expect(c).toBeDefined();
  expect(c.despues.km_inicial).toBeGreaterThan(1924); // deja sitio al compañero después de la clase del día 1
  expect(r.cambios.find(x => x.practica_id === lectura)).toBeUndefined(); // las lecturas reales no se tocan
});

test('los compañeros se guardan por coche, limpios', () => {
  const { vid } = escenario();
  const g = db.setCompanerosKm(vid, [{ nombre: '  Ana  y  Luis ', desde: '2026-07-10', hasta: '2026-06-01', clases: 9, kmMin: 40, kmMax: 10 }, {}]);
  expect(g[0]).toMatchObject({ nombre: 'Ana y Luis', desde: '2026-06-01', hasta: '2026-07-10', clases: 6, kmMin: 40, kmMax: 40, mismoDia: true });
  expect(g[1]).toMatchObject({ nombre: 'Compañero 2', desde: null, hasta: null, clases: 1 });
  expect(db.getCompanerosKm(vid)).toHaveLength(2);
  expect(db.getCompanerosKm(vid + 1)).toEqual([]);
  db.setCompanerosKm(vid, []);
  expect(db.getCompanerosKm(vid)).toEqual([]);
});

test('el planning entero trae todas las clases en orden con los km de los compañeros', () => {
  const { vid, erika } = escenario();
  clase(erika, vid, '2026-06-01', '10:00', 0, 0);
  clase(erika, vid, '2026-06-02', '10:00', 0, 0);
  clase(erika, vid, '2026-07-01', '10:00', 2000, 2024);
  const r = db.proponerCuadreKm(vid, { rellenarAntes: true, companeros: [COMP] });
  expect(r.planificacion.map(f => f.fecha)).toEqual(['2026-06-01', '2026-06-02', '2026-07-01']);
  expect(r.planificacion[1].fantasmas).toHaveLength(1);
  expect(r.planificacion[2].fantasmas).toHaveLength(1);
  expect(r.planificacion[0]).toMatchObject({ cambia: true, antes: { km_inicial: 0, km_final: 0 } });
  expect(r.planificacion[2]).toMatchObject({ cambia: false, km_inicial: 2000 });
});
