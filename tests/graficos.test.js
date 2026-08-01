// Tests de getDatosGraficos: datos agregados para los 5 gráficos del dashboard.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

// Los datos son relativos al mes actual (últimos N meses), así que los tests
// construyen las fechas a partir de la fecha real en vez de fijarlas a mano.
function mesOffset(offset) {
  const d = new Date();
  d.setDate(1); // evita desbordar de mes al restar en meses con menos días
  d.setMonth(d.getMonth() + offset);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

test('agrega km, prácticas (pista/circulación) e ingresos por mes correctamente', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const mesActual = mesOffset(0);

  db.addPractica(aid, vid, `${mesActual}-05`, 0, 40, null, 'circulacion'); // 40 km
  db.addPractica(aid, vid, `${mesActual}-10`, 40, 70, null, 'pista'); // 30 km
  db.addPago(aid, `${mesActual}-06`, 25.5, '');
  db.addPago(aid, `${mesActual}-11`, 10, '');

  const datos = db.getDatosGraficos(1);
  expect(datos.kmPorMes).toEqual([{ mes: mesActual, km: 70 }]);
  expect(datos.practicasPorMes).toEqual([{ mes: mesActual, total: 2, pista: 1, circulacion: 1 }]);
  expect(datos.ingresosPorMes).toEqual([{ mes: mesActual, cobrado: 35.5 }]);
});

test('los meses sin actividad aparecen igualmente, con los valores a 0', () => {
  const datos = db.getDatosGraficos(6);
  expect(datos.kmPorMes.length).toBe(6);
  expect(datos.practicasPorMes.length).toBe(6);
  expect(datos.ingresosPorMes.length).toBe(6);
  datos.kmPorMes.forEach(m => expect(m.km).toBe(0));
  datos.practicasPorMes.forEach(m => expect(m).toMatchObject({ total: 0, pista: 0, circulacion: 0 }));
  datos.ingresosPorMes.forEach(m => expect(m.cobrado).toBe(0));
  // El último mes de la lista debe ser el mes actual.
  expect(datos.kmPorMes[5].mes).toBe(mesOffset(0));
});

test('excluye prácticas, pagos, profesores y vehículos borrados', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const vidBorrado = db.addVehiculo('Coche 2', '', 0);
  const pid = db.addProfesor('Juan', '');
  const pidBorrado = db.addProfesor('Pedro', '');
  const aid = db.addAlumno('Ana', 'B', vid);
  const mesActual = mesOffset(0);

  const practicaBorrada = db.addPractica(aid, vid, `${mesActual}-05`, 0, 50, pid, 'circulacion');
  db.deletePractica(practicaBorrada);
  const pagoBorrado = db.addPago(aid, `${mesActual}-05`, 100, '');
  db.deletePago(pagoBorrado);
  db.deleteVehiculo(vidBorrado);
  db.deleteProfesor(pidBorrado);

  const datos = db.getDatosGraficos(1);
  expect(datos.kmPorMes[0].km).toBe(0);
  expect(datos.practicasPorMes[0].total).toBe(0);
  expect(datos.ingresosPorMes[0].cobrado).toBe(0);
  expect(datos.porVehiculo.find(v => v.nombre === 'Coche 2')).toBeUndefined();
  expect(datos.porProfesor.find(p => p.nombre === 'Pedro')).toBeUndefined();
});

test('las prácticas sin km (km_inicial y km_final a 0) no suman kilómetros', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const mesActual = mesOffset(0);

  db.addPractica(aid, vid, `${mesActual}-05`, 0, 0, null, 'circulacion'); // sin km
  db.addPractica(aid, vid, `${mesActual}-06`, 0, 20, null, 'circulacion'); // 20 km

  const datos = db.getDatosGraficos(1);
  expect(datos.kmPorMes[0].km).toBe(20);
  // Ambas prácticas sí cuentan en el total de prácticas del mes.
  expect(datos.practicasPorMes[0].total).toBe(2);
});

test('respeta el límite de N meses (por defecto 12)', () => {
  expect(db.getDatosGraficos().kmPorMes.length).toBe(12);
  expect(db.getDatosGraficos(3).kmPorMes.length).toBe(3);
  expect(db.getDatosGraficos(3).practicasPorMes.length).toBe(3);
  expect(db.getDatosGraficos(3).ingresosPorMes.length).toBe(3);
});

test('porProfesor y porVehiculo van ordenados por num_practicas descendente', () => {
  const v1 = db.addVehiculo('Coche 1', '', 0);
  const v2 = db.addVehiculo('Coche 2', '', 0);
  const menos = db.addProfesor('Menos prácticas', '');
  const mas = db.addProfesor('Más prácticas', '');
  const aid = db.addAlumno('Ana', 'B', v1);
  const mesActual = mesOffset(0);

  db.addPractica(aid, v1, `${mesActual}-01`, 0, 10, menos, 'circulacion');
  db.addPractica(aid, v2, `${mesActual}-02`, 0, 10, mas, 'circulacion');
  db.addPractica(aid, v2, `${mesActual}-03`, 10, 20, mas, 'circulacion');

  const datos = db.getDatosGraficos(1);
  expect(datos.porProfesor[0].nombre).toBe('Más prácticas');
  expect(datos.porProfesor[0].num_practicas).toBe(2);
  expect(datos.porProfesor[1].nombre).toBe('Menos prácticas');
  expect(datos.porVehiculo[0].nombre).toBe('Coche 2');
  expect(datos.porVehiculo[0].num_practicas).toBe(2);
  expect(datos.porVehiculo[0].km).toBe(20);
  expect(datos.porVehiculo[1].nombre).toBe('Coche 1');
});
