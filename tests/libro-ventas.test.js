// Tests del libro de ventas / IVA (tarea D5, exportación contable). Solo
// lectura sobre los pagos ya registrados: reutiliza el patrón de
// tests/informes.test.js.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('getLibroVentas desglosa base+cuota=total con IVA 21% por defecto', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPago(aid, '2026-07-15', 121, 'Clase suelta');

  const libro = db.getLibroVentas(null, null);
  expect(libro.iva_porcentaje).toBe(21);
  expect(libro.lineas).toHaveLength(1);
  const l = libro.lineas[0];
  expect(l.base).toBe(100);
  expect(l.cuota_iva).toBe(21);
  expect(l.total).toBe(121);
  expect(Math.round((l.base + l.cuota_iva) * 100) / 100).toBe(l.total);
  expect(l.alumno_nombre).toBe('Ana');
  expect(l.concepto).toBe('Clase suelta');
});

test('getLibroVentas respeta el filtro de fechas', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPago(aid, '2026-07-15', 121, 'dentro del rango');
  db.addPago(aid, '2026-08-20', 50, 'fuera del rango');

  const libro = db.getLibroVentas('2026-07-01', '2026-07-31');
  expect(libro.lineas).toHaveLength(1);
  expect(libro.lineas[0].concepto).toBe('dentro del rango');
  expect(libro.totales.nLineas).toBe(1);
  expect(libro.totales.total).toBe(121);
});

test('getLibroVentas con IVA 0 devuelve base=total y cuota=0', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPago(aid, '2026-07-15', 100, 'exento');

  const libro = db.getLibroVentas(null, null, null, 0);
  expect(libro.iva_porcentaje).toBe(0);
  expect(libro.lineas[0].base).toBe(100);
  expect(libro.lineas[0].cuota_iva).toBe(0);
  expect(libro.lineas[0].total).toBe(100);
});

test('getLibroVentas sin pagos devuelve lineas vacías y totales a 0', () => {
  const libro = db.getLibroVentas(null, null);
  expect(libro.lineas).toEqual([]);
  expect(libro.totales).toEqual({ base: 0, cuota_iva: 0, total: 0, nLineas: 0 });
});

test('getLibroVentas suma totales correctamente con varias líneas', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  const bid = db.addAlumno('Bea', 'B', vid);
  db.addPago(aid, '2026-07-01', 121, 'Pago 1');
  db.addPago(bid, '2026-07-10', 60.5, 'Pago 2');

  const libro = db.getLibroVentas('2026-07-01', '2026-07-31');
  expect(libro.totales.nLineas).toBe(2);
  expect(libro.totales.total).toBe(181.5);
  expect(Math.round((libro.totales.base + libro.totales.cuota_iva) * 100) / 100).toBe(libro.totales.total);
});

test('getLibroVentas filtra por sucursal', () => {
  const vid1 = db.addVehiculo('Coche 1', '1234ABC', 1000, 1);
  const vid2 = db.addVehiculo('Coche 2', '5678DEF', 1000, 2);
  const aid1 = db.addAlumno('Ana', 'B', vid1, null, 1);
  const aid2 = db.addAlumno('Bea', 'B', vid2, null, 2);
  db.addPago(aid1, '2026-07-15', 121, '', 1);
  db.addPago(aid2, '2026-07-16', 60.5, '', 2);

  const libroSede1 = db.getLibroVentas('2026-07-01', '2026-07-31', 1);
  expect(libroSede1.lineas).toHaveLength(1);
  expect(libroSede1.lineas[0].alumno_nombre).toBe('Ana');
});
