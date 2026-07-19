// Tests de getDesglosePagosAlumno: desglose práctica a práctica de lo generado/cubierto
// por los pagos (reparto FIFO en céntimos), consistente con getDeudas.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('sin pagos: todas las prácticas quedan pendiente y el saldo iguala al generado', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 20);

  db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-02', 40, 80, null, 'circulacion');

  const desglose = db.getDesglosePagosAlumno(aid);
  expect(desglose.alumno_nombre).toBe('Ana');
  expect(desglose.permiso).toBe('B');
  expect(desglose.practicas).toHaveLength(2);
  expect(desglose.practicas.every(p => p.estado === 'pendiente')).toBe(true);
  expect(desglose.practicas.every(p => p.cubierto === 0)).toBe(true);
  expect(desglose.total_generado).toBe(40);
  expect(desglose.total_pagado).toBe(0);
  expect(desglose.saldo).toBe(40);
});

test('un pago cubre la 1ª práctica entera y parte de la 2ª (FIFO)', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 20);

  db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-02', 40, 80, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-03', 80, 120, null, 'circulacion');
  db.addPago(aid, '2026-07-04', 25, '');

  const desglose = db.getDesglosePagosAlumno(aid);
  expect(desglose.practicas.map(p => p.estado)).toEqual(['pagada', 'parcial', 'pendiente']);
  expect(desglose.practicas[0].cubierto).toBe(20);
  expect(desglose.practicas[1].cubierto).toBe(5);
  expect(desglose.practicas[2].cubierto).toBe(0);
});

test('los pagos cubren todo con sobrante: todas pagada y saldo negativo', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 20);

  db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-02', 40, 80, null, 'circulacion');
  db.addPago(aid, '2026-07-03', 50, '');

  const desglose = db.getDesglosePagosAlumno(aid);
  expect(desglose.practicas.every(p => p.estado === 'pagada')).toBe(true);
  expect(desglose.practicas[0].cubierto).toBe(20);
  expect(desglose.practicas[1].cubierto).toBe(20);
  expect(desglose.saldo).toBe(-10);
});

test('práctica sin tarifa intercalada no consume saldo y las siguientes sí se cubren', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 20);
  // No hay tarifa para B/pista

  db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-02', 40, 80, null, 'pista'); // sin tarifa
  db.addPractica(aid, vid, '2026-07-03', 80, 120, null, 'circulacion');
  db.addPago(aid, '2026-07-04', 20, '');

  const desglose = db.getDesglosePagosAlumno(aid);
  expect(desglose.practicas.map(p => p.estado)).toEqual(['pagada', 'sin_tarifa', 'pendiente']);
  expect(desglose.practicas[1].precio).toBeNull();
  expect(desglose.practicas[1].cubierto).toBe(0);
  expect(desglose.practicas[0].cubierto).toBe(20);
  expect(desglose.practicas[2].cubierto).toBe(0);
});

test('reparto en céntimos sin residuo float: tarifa 33.33 x3 y pago 66.66', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 33.33);

  db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-02', 40, 80, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-03', 80, 120, null, 'circulacion');
  db.addPago(aid, '2026-07-04', 66.66, '');

  const desglose = db.getDesglosePagosAlumno(aid);
  expect(desglose.practicas.map(p => p.estado)).toEqual(['pagada', 'pagada', 'pendiente']);
  expect(desglose.practicas[0].cubierto).toBe(33.33);
  expect(desglose.practicas[1].cubierto).toBe(33.33);
  expect(desglose.practicas[2].cubierto).toBe(0);
});

test('el FIFO respeta el orden cronológico aunque las prácticas se inserten desordenadas', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setTarifa('B', 'circulacion', 20);

  // Se insertan fuera de orden cronológico a propósito
  db.addPractica(aid, vid, '2026-07-03', 80, 120, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPractica(aid, vid, '2026-07-02', 40, 80, null, 'circulacion');
  db.addPago(aid, '2026-07-04', 20, '');

  const desglose = db.getDesglosePagosAlumno(aid);
  expect(desglose.practicas.map(p => p.fecha)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  expect(desglose.practicas.map(p => p.estado)).toEqual(['pagada', 'pendiente', 'pendiente']);
});
