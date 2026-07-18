// Test de la función pura de suma/resta de días sobre fechas 'YYYY-MM-DD'
// usada por el Registro Rápido (flechas de fecha y botones laterales del ratón).
const { sumarDiasFecha } = require('../date-utils');

test('suma un día dentro del mismo mes', () => {
  expect(sumarDiasFecha('2026-07-17', 1)).toBe('2026-07-18');
});

test('resta un día dentro del mismo mes', () => {
  expect(sumarDiasFecha('2026-07-17', -1)).toBe('2026-07-16');
});

test('cruza el fin de mes hacia adelante', () => {
  expect(sumarDiasFecha('2026-07-31', 1)).toBe('2026-08-01');
});

test('cruza el fin de mes hacia atrás', () => {
  expect(sumarDiasFecha('2026-08-01', -1)).toBe('2026-07-31');
});

test('cruza el fin de año', () => {
  expect(sumarDiasFecha('2026-12-31', 1)).toBe('2027-01-01');
});

test('respeta un año bisiesto (29 de febrero)', () => {
  expect(sumarDiasFecha('2028-02-28', 1)).toBe('2028-02-29');
  expect(sumarDiasFecha('2028-03-01', -1)).toBe('2028-02-29');
});
