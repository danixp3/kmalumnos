// Tests de getStatsDashboard: tarjetas opcionales del dashboard
// (prácticas de hoy, km del mes, total adeudado, alumnos con deuda).
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('practicasHoy y kmMes cuentan solo lo de hoy y lo del mes indicado, ignorando el mes anterior', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);

  // Hoy: 2 prácticas
  db.addPractica(aid, vid, '2026-07-15', 0, 40); // 40 km
  db.addPractica(aid, vid, '2026-07-15', 40, 70); // 30 km

  // Mismo mes, otro día
  db.addPractica(aid, vid, '2026-07-01', 0, 20); // 20 km

  // Mes anterior (no debe contar)
  db.addPractica(aid, vid, '2026-06-20', 0, 100); // 100 km

  const stats = db.getStatsDashboard('2026-07-15');
  expect(stats.practicasHoy).toBe(2);
  expect(stats.kmMes).toBe(90); // 40 + 30 + 20
});

test('totalAdeudado y alumnosConDeuda solo cuentan saldos positivos', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const deudor = db.addAlumno('Carlos', 'B', vid);
  const alDia = db.addAlumno('Beatriz', 'A', vid);

  db.setTarifa('B', 'circulacion', 20);
  db.setTarifa('A', 'circulacion', 15);

  // Deudor: genera 40, paga 15 -> saldo 25 pendiente
  db.addPractica(deudor, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPractica(deudor, vid, '2026-07-02', 40, 80, null, 'circulacion');
  db.addPago(deudor, '2026-07-03', 15, 'Pago parcial');

  // Al día: genera 15, paga 15 -> saldo 0 (no cuenta como deuda)
  db.addPractica(alDia, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.addPago(alDia, '2026-07-02', 15, 'Pago justo');

  const stats = db.getStatsDashboard('2026-07-15');
  expect(stats.alumnosConDeuda).toBe(1);
  expect(stats.totalAdeudado).toBe(25);
});

test('sin datos, todas las estadísticas son 0', () => {
  const stats = db.getStatsDashboard('2026-07-15');
  expect(stats).toEqual({
    practicasHoy: 0,
    kmMes: 0,
    totalAdeudado: 0,
    alumnosConDeuda: 0
  });
});

test('sin parámetro hoy, usa la fecha local de hoy por defecto', () => {
  const stats = db.getStatsDashboard();
  expect(typeof stats.practicasHoy).toBe('number');
  expect(typeof stats.kmMes).toBe('number');
});
