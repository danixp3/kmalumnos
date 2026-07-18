// Tests del sistema Pagos y deudas en db.js: CRUD de tarifas, CRUD de pagos y
// el cálculo de deudas (prácticas × tarifa por permiso/tipo − pagos anotados).
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('CRUD de tarifas: setTarifa crea, actualiza (no duplica), getTarifas lista, deleteTarifa borra', () => {
  const id = db.setTarifa('B', 'circulacion', 20);
  let tarifas = db.getTarifas();
  expect(tarifas).toHaveLength(1);
  expect(tarifas[0]).toMatchObject({ id, permiso: 'B', tipo: 'circulacion', precio: 20 });

  // Mismo permiso+tipo actualiza, no duplica
  const id2 = db.setTarifa('B', 'circulacion', 25);
  expect(id2).toBe(id);
  tarifas = db.getTarifas();
  expect(tarifas).toHaveLength(1);
  expect(tarifas[0].precio).toBe(25);

  // Distinto tipo sí crea una fila nueva
  db.setTarifa('B', 'pista', 15);
  tarifas = db.getTarifas();
  expect(tarifas).toHaveLength(2);

  db.deleteTarifa(id);
  tarifas = db.getTarifas();
  expect(tarifas).toHaveLength(1);
  expect(tarifas[0].tipo).toBe('pista');
});

test('CRUD de pagos: addPago, getPagosByAlumno, updatePago, deletePago', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);

  const pid = db.addPago(aid, '2026-07-01', 50, 'Primer pago');
  let pagos = db.getPagosByAlumno(aid);
  expect(pagos).toHaveLength(1);
  expect(pagos[0]).toMatchObject({ id: pid, alumno_id: aid, fecha: '2026-07-01', cantidad: 50, nota: 'Primer pago' });

  db.updatePago(pid, '2026-07-02', 75, 'Pago corregido');
  pagos = db.getPagosByAlumno(aid);
  expect(pagos[0]).toMatchObject({ fecha: '2026-07-02', cantidad: 75, nota: 'Pago corregido' });

  db.deletePago(pid);
  expect(db.getPagosByAlumno(aid)).toHaveLength(0);
});

test('getDeudas: alumno con tarifa completa calcula el saldo correcto', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 20);
  db.setTarifa('B', 'pista', 15);

  db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-02', 40, 80, null, 'pista');
  db.addPago(aid, '2026-07-03', 10, '');

  const deudas = db.getDeudas();
  const deuda = deudas.find(d => d.alumno_id === aid);
  expect(deuda.total_generado).toBe(35); // 20 + 15
  expect(deuda.total_pagado).toBe(10);
  expect(deuda.saldo).toBe(25);
  expect(deuda.num_practicas).toBe(2);
  expect(deuda.sin_tarifa).toBe(false);
});

test('getDeudas: práctica cuyo tipo no tiene tarifa definida marca sin_tarifa y no suma al generado', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 20);
  // No hay tarifa para B/pista

  db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-02', 40, 80, null, 'pista');

  const deuda = db.getDeudas().find(d => d.alumno_id === aid);
  expect(deuda.total_generado).toBe(20); // solo la de circulación
  expect(deuda.sin_tarifa).toBe(true);
});

test('getDeudas: una práctica borrada no cuenta en el generado', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 20);

  const pid1 = db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-02', 40, 80, null, 'circulacion');
  db.deletePractica(pid1);

  const deuda = db.getDeudas().find(d => d.alumno_id === aid);
  expect(deuda.num_practicas).toBe(1);
  expect(deuda.total_generado).toBe(20);
});

test('getDeudas: una práctica sin tipo se trata como circulacion', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 20);

  // Práctica "vieja" simulada: sin parámetro tipo explícito -> por defecto 'circulacion'
  db.addPractica(aid, vid, '2026-07-01', 0, 40);

  const deuda = db.getDeudas().find(d => d.alumno_id === aid);
  expect(deuda.total_generado).toBe(20);
  expect(deuda.sin_tarifa).toBe(false);
});

test('getDeudas: escenario de morosos (deudor, al día, y pagó de más) y total adeudado', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const deudor = db.addAlumno('Carlos', 'B', vid);
  const alDia = db.addAlumno('Beatriz', 'A', vid);
  const pagoDeMas = db.addAlumno('David', 'C', vid);

  db.setTarifa('B', 'circulacion', 20);
  db.setTarifa('A', 'circulacion', 15);
  db.setTarifa('C', 'circulacion', 30);

  // Deudor: genera 40, paga 15 -> saldo 25 pendiente
  db.addPractica(deudor, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPractica(deudor, vid, '2026-07-02', 40, 80, null, 'circulacion');
  db.addPago(deudor, '2026-07-03', 15, 'Pago parcial');

  // Al día: genera 15, paga 15 -> saldo exactamente 0
  db.addPractica(alDia, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPago(alDia, '2026-07-02', 15, 'Pago justo');

  // Pagó de más: genera 30, paga 50 -> saldo negativo (a favor)
  db.addPractica(pagoDeMas, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPago(pagoDeMas, '2026-07-02', 50, 'Pago adelantado');

  const deudas = db.getDeudas();

  const dDeudor = deudas.find(d => d.alumno_id === deudor);
  expect(dDeudor.saldo).toBe(25);
  expect(dDeudor.saldo > 0).toBe(true);

  const dAlDia = deudas.find(d => d.alumno_id === alDia);
  expect(dAlDia.saldo).toBe(0);

  const dPagoDeMas = deudas.find(d => d.alumno_id === pagoDeMas);
  expect(dPagoDeMas.saldo).toBe(-20);
  expect(dPagoDeMas.saldo < 0).toBe(true);

  // Simula lo que hará el renderer: solo alumnos con saldo > 0 cuentan para "morosos" y el total adeudado
  const conDeuda = deudas.filter(d => d.saldo > 0);
  expect(conDeuda).toHaveLength(1);
  expect(conDeuda[0].alumno_id).toBe(deudor);
  const totalAdeudado = conDeuda.reduce((sum, d) => sum + d.saldo, 0);
  expect(totalAdeudado).toBe(25);
});
