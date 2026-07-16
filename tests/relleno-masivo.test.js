// Tests del relleno masivo de km en prácticas pendientes (km 0,0).
// Se fija Math.random a 0.5 para que el incremento sea siempre 42.5 km
// (punto medio del rango 40-45) y los resultados sean comprobables.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => {
  resetData(db);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('rellena las prácticas pendientes de forma encadenada desde el odómetro del vehículo', () => {
  const vid = db.addVehiculo('Coche 1', '', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-07-01', 0, 0);
  db.addPractica(aid, vid, '2026-07-01', 0, 0);
  db.addPractica(aid, vid, '2026-07-02', 0, 0);

  const res = db.rellenarKmMasivo(vid, 40, 45);

  expect(res).toEqual({ rellenadas: 3, saltadas: 0 });
  const practicas = db.getPracticasByAlumno(aid);
  expect(practicas[0]).toMatchObject({ km_inicial: 1000, km_final: 1042.5 });
  expect(practicas[1]).toMatchObject({ km_inicial: 1042.5, km_final: 1085 });
  expect(practicas[2]).toMatchObject({ km_inicial: 1085, km_final: 1127.5 });
  // El odómetro del vehículo avanza hasta el último km generado
  expect(db.getVehiculos()[0].km_actual).toBe(1127.5);
  // Y no queda ninguna práctica pendiente ni solapada
  expect(db.getPracticasSinKm(vid)).toBe(0);
  expect(db.getSolapamientos()).toHaveLength(0);
});

test('continúa a partir del último km ya registrado en el vehículo', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-07-01', 100, 140); // práctica ya con km
  db.addPractica(aid, vid, '2026-07-02', 0, 0);     // pendiente

  const res = db.rellenarKmMasivo(vid, 40, 45);

  expect(res).toEqual({ rellenadas: 1, saltadas: 0 });
  const practicas = db.getPracticasByAlumno(aid);
  expect(practicas[1]).toMatchObject({ km_inicial: 140, km_final: 182.5 });
});

test('respeta el tope de odómetro: salta las prácticas que lo superarían', () => {
  const vid = db.addVehiculo('Coche 1', '', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-07-01', 0, 0);
  db.addPractica(aid, vid, '2026-07-01', 0, 0);

  // Relleno desde km 1000 con tope en 1050: solo cabe una práctica de ~42.5 km
  const res = db.rellenarKmMasivo(vid, 40, 45, 1000, 1050);

  expect(res).toEqual({ rellenadas: 1, saltadas: 1 });
  expect(db.getPracticasSinKm(vid)).toBe(1); // la saltada sigue pendiente
});

test('con un vehículo inexistente devuelve error y no rellena nada', () => {
  expect(db.rellenarKmMasivo(999, 40, 45)).toEqual({
    rellenadas: 0,
    errores: ['Vehículo no encontrado']
  });
});

test('si no hay prácticas pendientes no cambia nada', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-07-01', 100, 140);

  expect(db.rellenarKmMasivo(vid, 40, 45)).toEqual({ rellenadas: 0, errores: [] });
  expect(db.getPracticasByAlumno(aid)[0]).toMatchObject({ km_inicial: 100, km_final: 140 });
});
