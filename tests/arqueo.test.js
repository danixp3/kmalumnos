// Tests del arqueo de caja (tarea D1 del PLAN-MAESTRO): getArqueo y getMorosos
// sobre db/pagos.js. Registro LOCAL: no toca sync.js.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('addPago guarda forma_pago y empleado; valores fuera de lista se guardan como null', () => {
  const vid = db.addVehiculo('Coche 1', '', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);

  const idBueno = db.addPago(aid, '2026-08-01', 50, '', null, 'efectivo', ' Laura ');
  const pagos = db.getPagosByAlumno(aid);
  const pBueno = pagos.find(p => p.id === idBueno);
  expect(pBueno.forma_pago).toBe('efectivo');
  expect(pBueno.empleado).toBe('Laura');

  const idMalo = db.addPago(aid, '2026-08-02', 30, '', null, 'bitcoin', '');
  const pMalo = db.getPagosByAlumno(aid).find(p => p.id === idMalo);
  expect(pMalo.forma_pago).toBeNull();
  expect(pMalo.empleado).toBeNull();
});

test('updatePago con forma_pago/empleado undefined no los toca; llamada antigua (4 args) sigue funcionando', () => {
  const vid = db.addVehiculo('Coche 1', '', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  const id = db.addPago(aid, '2026-08-01', 50, '', null, 'tarjeta', 'Laura');

  // Llamada "antigua": solo 4 args, forma_pago/empleado quedan undefined.
  db.updatePago(id, '2026-08-02', 60, 'nota nueva');
  const p1 = db.getPagosByAlumno(aid).find(x => x.id === id);
  expect(p1.fecha).toBe('2026-08-02');
  expect(p1.cantidad).toBe(60);
  expect(p1.forma_pago).toBe('tarjeta'); // no se tocó
  expect(p1.empleado).toBe('Laura'); // no se tocó

  // Llamada explícita: cambia forma_pago, no toca empleado.
  db.updatePago(id, '2026-08-02', 60, 'nota nueva', 'bizum', undefined);
  const p2 = db.getPagosByAlumno(aid).find(x => x.id === id);
  expect(p2.forma_pago).toBe('bizum');
  expect(p2.empleado).toBe('Laura');
});

test('getArqueo calcula total, nPagos y desglose por forma (incluye sin_especificar)', () => {
  const vid = db.addVehiculo('Coche 1', '', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);

  db.addPago(aid, '2026-08-01', 50, '', null, 'efectivo', 'Laura');
  db.addPago(aid, '2026-08-02', 30, '', null, 'tarjeta', 'Laura');
  db.addPago(aid, '2026-08-03', 20, '', null, null, null); // sin forma

  const arqueo = db.getArqueo('2026-08-01', '2026-08-03', null);
  expect(arqueo.nPagos).toBe(3);
  expect(arqueo.total).toBe(100);
  expect(arqueo.porForma.efectivo).toBe(50);
  expect(arqueo.porForma.tarjeta).toBe(30);
  expect(arqueo.porForma.sin_especificar).toBe(20);
  expect(arqueo.porForma.bizum).toBe(0);
});

test('getArqueo agrupa porEmpleado, con null/vacío como "Sin asignar"', () => {
  const vid = db.addVehiculo('Coche 1', '', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);

  db.addPago(aid, '2026-08-01', 50, '', null, 'efectivo', 'Laura');
  db.addPago(aid, '2026-08-02', 30, '', null, 'efectivo', 'Laura');
  db.addPago(aid, '2026-08-03', 20, '', null, 'efectivo', null);

  const arqueo = db.getArqueo('2026-08-01', '2026-08-03', null);
  const laura = arqueo.porEmpleado.find(e => e.empleado === 'Laura');
  const sinAsignar = arqueo.porEmpleado.find(e => e.empleado === 'Sin asignar');
  expect(laura).toMatchObject({ nPagos: 2, total: 80 });
  expect(sinAsignar).toMatchObject({ nPagos: 1, total: 20 });
});

test('getArqueo excluye pagos fuera del rango de fechas', () => {
  const vid = db.addVehiculo('Coche 1', '', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);

  db.addPago(aid, '2026-07-31', 50, '', null, 'efectivo', 'Laura'); // fuera (antes)
  db.addPago(aid, '2026-08-01', 30, '', null, 'efectivo', 'Laura'); // dentro
  db.addPago(aid, '2026-08-05', 20, '', null, 'efectivo', 'Laura'); // dentro
  db.addPago(aid, '2026-08-06', 15, '', null, 'efectivo', 'Laura'); // fuera (después)

  const arqueo = db.getArqueo('2026-08-01', '2026-08-05', null);
  expect(arqueo.nPagos).toBe(2);
  expect(arqueo.total).toBe(50);
});

test('getMorosos devuelve solo saldo>0, ordenados de mayor a menor deuda', () => {
  const vid = db.addVehiculo('Coche 1', '', 1000);
  const aid1 = db.addAlumno('Ana', 'B', vid);
  const aid2 = db.addAlumno('Beatriz', 'B', vid);
  const aid3 = db.addAlumno('Carla', 'B', vid);

  db.setTarifa('B', 'circulacion', 30);
  db.addPractica(aid1, vid, '2026-08-01', 0, 0); // genera 30, sin pagos -> saldo 30
  db.addPractica(aid2, vid, '2026-08-01', 0, 0);
  db.addPractica(aid2, vid, '2026-08-02', 0, 0); // genera 60, sin pagos -> saldo 60
  db.addPractica(aid3, vid, '2026-08-01', 0, 0);
  db.addPago(aid3, '2026-08-02', 30, '', null); // genera 30, pagado 30 -> saldo 0 (al día)

  const morosos = db.getMorosos(null);
  expect(morosos.every(m => m.saldo > 0)).toBe(true);
  expect(morosos.map(m => m.alumno_id)).toEqual([aid2, aid1]);
  expect(morosos.find(m => m.alumno_id === aid3)).toBeUndefined();
});
