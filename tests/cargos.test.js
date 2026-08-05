// Tests de cargos y descuentos (tarea D2 del PLAN-MAESTRO): CRUD, validación,
// y su integración ADITIVA en getDeudas/getDesglosePagosAlumno.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('addCargo: cargo positivo y descuento negativo se guardan tal cual (con signo)', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);

  const cargo = db.addCargo({ alumno_id: aid, concepto: 'Matrícula', tipo: 'matricula', importe: 50, fecha: '2026-08-01' });
  expect(cargo).toMatchObject({ alumno_id: aid, concepto: 'Matrícula', tipo: 'matricula', importe: 50, fecha: '2026-08-01', deleted: false });
  expect(typeof cargo.id).toBe('number');

  const descuento = db.addCargo({ alumno_id: aid, concepto: 'Promo verano', tipo: 'descuento', importe: -20, fecha: '2026-08-02' });
  expect(descuento.importe).toBe(-20);
});

test('addCargo: importe no numérico lanza Error', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  expect(() => db.addCargo({ alumno_id: aid, tipo: 'cargo', importe: 'no-es-un-numero', fecha: '2026-08-01' })).toThrow();
  expect(() => db.addCargo({ alumno_id: aid, tipo: 'cargo', importe: NaN, fecha: '2026-08-01' })).toThrow();
});

test('addCargo: tipo no válido lanza Error', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  expect(() => db.addCargo({ alumno_id: aid, tipo: 'no-existe', importe: 10, fecha: '2026-08-01' })).toThrow();
});

test('getTotalCargosAlumno suma con signo', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addCargo({ alumno_id: aid, concepto: 'Matrícula', tipo: 'matricula', importe: 50, fecha: '2026-08-01' });
  db.addCargo({ alumno_id: aid, concepto: 'Tasa', tipo: 'tasa', importe: 10, fecha: '2026-08-01' });
  db.addCargo({ alumno_id: aid, concepto: 'Descuento', tipo: 'descuento', importe: -20, fecha: '2026-08-02' });
  expect(db.getTotalCargosAlumno(aid)).toBe(40); // 50 + 10 - 20
});

test('getCargosAlumno filtra por alumno y excluye borrados', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const a1 = db.addAlumno('Ana', 'B', vid);
  const a2 = db.addAlumno('Beto', 'B', vid);
  const c1 = db.addCargo({ alumno_id: a1, tipo: 'cargo', importe: 10, fecha: '2026-08-01' });
  db.addCargo({ alumno_id: a2, tipo: 'cargo', importe: 15, fecha: '2026-08-01' });

  expect(db.getCargosAlumno(a1)).toHaveLength(1);
  expect(db.getCargosAlumno(a2)).toHaveLength(1);

  db.deleteCargo(c1.id);
  expect(db.getCargosAlumno(a1)).toHaveLength(0);
  expect(db.getTotalCargosAlumno(a1)).toBe(0);
  // No afecta al otro alumno
  expect(db.getCargosAlumno(a2)).toHaveLength(1);
});

test('deleteCargo hace soft delete: no aparece en getCargos ni cuenta en el total', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const c = db.addCargo({ alumno_id: aid, tipo: 'cargo', importe: 30, fecha: '2026-08-01' });
  expect(db.getCargos().find(x => x.id === c.id)).toBeTruthy();

  db.deleteCargo(c.id);
  expect(db.getCargos().find(x => x.id === c.id)).toBeFalsy();
  expect(db.getTotalCargosAlumno(aid)).toBe(0);
});

test('integración: sin cargos, getDeudas y getDesglosePagosAlumno son idénticos al cálculo previo (aditivo)', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 20);
  db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPago(aid, '2026-07-02', 10, '');

  const deuda = db.getDeudas().find(d => d.alumno_id === aid);
  expect(deuda.total_generado).toBe(20);
  expect(deuda.total_cargos).toBe(0);
  expect(deuda.saldo).toBe(10);

  const desglose = db.getDesglosePagosAlumno(aid);
  expect(desglose.total_generado).toBe(20);
  expect(desglose.cargos).toEqual([]);
  expect(desglose.saldo).toBe(10);
});

test('integración: +50 de cargo y -20 de descuento suben total_generado y saldo en +30 respecto a sin cargos', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 20);
  db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPago(aid, '2026-07-02', 10, '');

  const deudaAntes = db.getDeudas().find(d => d.alumno_id === aid);
  const desgloseAntes = db.getDesglosePagosAlumno(aid);

  db.addCargo({ alumno_id: aid, concepto: 'Matrícula', tipo: 'matricula', importe: 50, fecha: '2026-07-03' });
  db.addCargo({ alumno_id: aid, concepto: 'Promo', tipo: 'descuento', importe: -20, fecha: '2026-07-04' });

  const deudaDespues = db.getDeudas().find(d => d.alumno_id === aid);
  expect(deudaDespues.total_generado).toBe(deudaAntes.total_generado + 30);
  expect(deudaDespues.total_cargos).toBe(30);
  expect(deudaDespues.saldo).toBe(deudaAntes.saldo + 30);

  const desgloseDespues = db.getDesglosePagosAlumno(aid);
  expect(desgloseDespues.total_generado).toBe(desgloseAntes.total_generado + 30);
  expect(desgloseDespues.saldo).toBe(desgloseAntes.saldo + 30);
  expect(desgloseDespues.cargos).toHaveLength(2);
  // El FIFO de prácticas no cambia: mismas prácticas, mismos estados
  expect(desgloseDespues.practicas).toEqual(desgloseAntes.practicas);
});
