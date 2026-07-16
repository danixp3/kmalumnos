// Tests de la importación de prácticas desde CSV.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => resetData(db));

test('importa filas válidas y crea alumnos y vehículos que no existían', () => {
  const res = db.importarCSV([
    { alumno: 'Ana', vehiculo: 'Coche 1', fecha: '2026-07-01', km_inicial: '100', km_final: '140' },
    { alumno: 'Luis', vehiculo: 'Coche 1', fecha: '2026-07-02', km_inicial: '140', km_final: '181.5' }
  ]);

  expect(res.insertados).toBe(2);
  expect(res.errores).toBe(0);
  expect(db.getVehiculos()).toHaveLength(1);
  expect(db.getAlumnos()).toHaveLength(2);
});

test('reutiliza alumnos y vehículos existentes aunque cambien mayúsculas/minúsculas', () => {
  const res = db.importarCSV([
    { alumno: 'Ana', vehiculo: 'Coche 1', fecha: '2026-07-01', km_inicial: '100', km_final: '140' },
    { alumno: 'ANA', vehiculo: 'coche 1', fecha: '2026-07-02', km_inicial: '140', km_final: '180' }
  ]);

  expect(res.insertados).toBe(2);
  expect(db.getVehiculos()).toHaveLength(1);
  expect(db.getAlumnos()).toHaveLength(1);
});

test('rechaza las filas defectuosas indicando fila y motivo, sin frenar las válidas', () => {
  const res = db.importarCSV([
    { alumno: 'Ana', vehiculo: 'Coche 1', fecha: '2026-07-01', km_inicial: '100', km_final: '140' },
    { alumno: '', vehiculo: 'Coche 1', fecha: '2026-07-02', km_inicial: '1', km_final: '2' },
    { alumno: 'Luis', vehiculo: 'Coche 1', fecha: '01/07/2026', km_inicial: '1', km_final: '2' },
    { alumno: 'Eva', vehiculo: 'Coche 1', fecha: '2026-07-03', km_inicial: '200', km_final: '150' }
  ]);

  expect(res.insertados).toBe(1);
  expect(res.errores).toBe(3);
  // Las filas se numeran contando la cabecera del CSV (la primera fila de datos es la 2)
  expect(res.erroresDetalle.map(e => e.fila)).toEqual([3, 4, 5]);
  expect(res.erroresDetalle[0].motivo).toMatch(/alumno/i);
  expect(res.erroresDetalle[1].motivo).toMatch(/fecha/i);
  expect(res.erroresDetalle[2].motivo).toMatch(/km/i);
});

test('si las filas no traen km, los genera encadenados dentro del rango configurado', () => {
  jest.spyOn(Math, 'random').mockReturnValue(0.5); // incremento fijo de 42.5 km (rango 40-45)

  const res = db.importarCSV([
    { alumno: 'Ana', vehiculo: 'Coche 1', fecha: '2026-07-01' },
    { alumno: 'Ana', vehiculo: 'Coche 1', fecha: '2026-07-02' }
  ], 40, 45);

  jest.restoreAllMocks();

  expect(res.insertados).toBe(2);
  const ana = db.getAlumnos()[0];
  const practicas = db.getPracticasByAlumno(ana.id);
  expect(practicas[0]).toMatchObject({ km_inicial: 0, km_final: 42.5 });
  expect(practicas[1]).toMatchObject({ km_inicial: 42.5, km_final: 85 });
});

test('la exportación devuelve un CSV con cabecera y una línea por práctica', () => {
  db.importarCSV([
    { alumno: 'Ana', vehiculo: 'Coche 1', fecha: '2026-07-01', km_inicial: '100', km_final: '140' }
  ]);

  const res = db.exportarCSV();

  expect(res.total).toBe(1);
  const lineas = res.csv.split('\n');
  expect(lineas[0]).toBe('alumno,vehiculo,fecha,km_inicial,km_final');
  expect(lineas[1]).toBe('Ana,Coche 1,2026-07-01,100,140');
});
