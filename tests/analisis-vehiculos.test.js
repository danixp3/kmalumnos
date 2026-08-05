// Tests del análisis de uso y coste de combustible por vehículo (heurística
// v1, ver db/estadisticas.js: getAnalisisVehiculos). kmUltimos30 se calcula
// contra "hoy", así que las fechas se generan relativas a la fecha real de
// ejecución del test (evita depender de una fecha fija).
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

// Devuelve 'YYYY-MM-DD' de hoy menos n días.
function fechaHaceNDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test('kmTotales suma correctamente, excluyendo prácticas 0/0 y borradas', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, fechaHaceNDias(1), 100, 140); // 40 km válidos
  db.addPractica(aid, vid, fechaHaceNDias(2), 0, 0); // sin km, no suma
  const pidBorrada = db.addPractica(aid, vid, fechaHaceNDias(1), 200, 260); // 60 km, se borrará
  db.deletePractica(pidBorrada);

  const [v] = db.getAnalisisVehiculos();
  expect(v.vehiculo_id).toBe(vid);
  expect(v.nombre).toBe('Coche 1');
  expect(v.matricula).toBe('1234ABC');
  expect(v.nPracticas).toBe(2); // la borrada no cuenta
  expect(v.kmTotales).toBe(40);
});

test('mediaKmPractica es kmTotales/nPracticas redondeada a 1 decimal', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Bea', 'B', vid);
  db.addPractica(aid, vid, fechaHaceNDias(1), 0, 40);
  db.addPractica(aid, vid, fechaHaceNDias(2), 0, 43);
  db.addPractica(aid, vid, fechaHaceNDias(3), 0, 0); // sin km, cuenta para nPracticas pero no para km

  const [v] = db.getAnalisisVehiculos();
  expect(v.nPracticas).toBe(3);
  expect(v.kmTotales).toBe(83);
  expect(v.mediaKmPractica).toBe(Math.round((83 / 3) * 10) / 10);
});

test('kmUltimos30 solo cuenta prácticas de los últimos 30 días', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Carlos', 'B', vid);
  db.addPractica(aid, vid, fechaHaceNDias(5), 0, 40); // dentro de 30 días
  db.addPractica(aid, vid, fechaHaceNDias(45), 0, 40); // fuera de rango

  const [v] = db.getAnalisisVehiculos();
  expect(v.kmTotales).toBe(80);
  expect(v.kmUltimos30).toBe(40);
});

test('vehículo borrado no aparece en el análisis', () => {
  const vid = db.addVehiculo('Coche a borrar', '', 0);
  db.deleteVehiculo(vid);

  const resultado = db.getAnalisisVehiculos();
  expect(resultado.find(v => v.vehiculo_id === vid)).toBeUndefined();
});

test('el resultado está ordenado por kmTotales descendente', () => {
  const v1 = db.addVehiculo('Coche bajo', '', 0);
  const a1 = db.addAlumno('Dani', 'B', v1);
  db.addPractica(a1, v1, fechaHaceNDias(1), 0, 20); // 20 km

  const v2 = db.addVehiculo('Coche alto', '', 0);
  const a2 = db.addAlumno('Elena', 'B', v2);
  db.addPractica(a2, v2, fechaHaceNDias(1), 0, 100); // 100 km

  const resultado = db.getAnalisisVehiculos();
  expect(resultado[0].vehiculo_id).toBe(v2);
  expect(resultado[0].kmTotales).toBe(100);
  expect(resultado[1].vehiculo_id).toBe(v1);
  expect(resultado[1].kmTotales).toBe(20);
});

test('vehículo sin prácticas devuelve todo a 0', () => {
  db.addVehiculo('Coche nuevo', '', 0);

  const [v] = db.getAnalisisVehiculos();
  expect(v.nPracticas).toBe(0);
  expect(v.kmTotales).toBe(0);
  expect(v.kmUltimos30).toBe(0);
  expect(v.mediaKmPractica).toBe(0);
});
