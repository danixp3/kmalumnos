// Tests del agregador de informes (pantalla "Informes"). Solo lectura, no
// toca sync.js: reutiliza funciones ya probadas en otros módulos, aquí solo
// se verifica que getInformes las junta y filtra bien por fecha.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('getInformes suma ingresos del periodo y respeta el filtro de fechas', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPago(aid, '2026-07-15', 100, 'dentro del rango');
  db.addPago(aid, '2026-08-20', 50, 'fuera del rango');

  const informe = db.getInformes('2026-07-01', '2026-07-31');
  expect(informe.periodo).toEqual({ desde: '2026-07-01', hasta: '2026-07-31' });
  expect(informe.ingresos.total).toBe(100);
  expect(informe.ingresos.nPagos).toBe(1);
  expect(informe.ingresos.porMes).toEqual([{ mes: '2026-07', total: 100 }]);
});

test('getInformes sin rango de fechas cuenta todos los pagos', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPago(aid, '2026-07-15', 100, '');
  db.addPago(aid, '2026-08-20', 50, '');

  const informe = db.getInformes(null, null);
  expect(informe.ingresos.total).toBe(150);
  expect(informe.ingresos.nPagos).toBe(2);
});

test('getInformes devuelve estructura vacía defensiva sin datos', () => {
  const informe = db.getInformes(null, null);
  expect(informe.aprobados).toEqual({
    global: { presentados: 0, aptos: 0, ratio: 0 },
    porTipo: {
      teorico: { presentados: 0, aptos: 0, ratio: 0 },
      maniobras: { presentados: 0, aptos: 0, ratio: 0 },
      circulacion: { presentados: 0, aptos: 0, ratio: 0 }
    },
    porProfesor: []
  });
  expect(informe.ocupacionProfesores).toEqual([]);
  expect(informe.ocupacionVehiculos).toEqual([]);
  expect(informe.ingresos).toEqual({ total: 0, nPagos: 0, porMes: [] });
  expect(informe.deudas).toEqual({ totalAdeudado: 0, nAlumnos: 0, detalle: [] });
});

test('getInformes calcula ocupación de profesor/vehículo y deudas con datos sembrados', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const pid = db.addProfesor('Juan');
  const aid = db.addAlumno('Ana', 'B', vid, pid);
  db.setTarifa('B', 'circulacion', 30);
  db.addPractica(aid, vid, '2026-07-10', 1000, 1020, pid);
  // Práctica fuera del rango: no debe contar en la ocupación del periodo.
  db.addPractica(aid, vid, '2026-09-01', 1020, 1040, pid);

  const informe = db.getInformes('2026-07-01', '2026-07-31');

  expect(informe.ocupacionProfesores).toEqual([
    { profesor_id: pid, nombre: 'Juan', nPracticas: 1, kmTotales: 20 }
  ]);
  expect(informe.ocupacionVehiculos).toEqual([
    { vehiculo_id: vid, nombre: 'Coche 1', matricula: '1234ABC', nPracticas: 1, kmTotales: 20, mediaKmPractica: 20 }
  ]);

  // Deudas es una foto del saldo actual (no filtrada por periodo): las dos
  // prácticas generan deuda, no solo la de julio.
  expect(informe.deudas.nAlumnos).toBe(1);
  expect(informe.deudas.totalAdeudado).toBe(60);
  expect(informe.deudas.detalle).toEqual([{ alumno_id: aid, nombre: 'Ana', saldo: 60 }]);
});

test('getInformes filtra por sucursal', () => {
  const vid1 = db.addVehiculo('Coche 1', '1234ABC', 1000, 1);
  const vid2 = db.addVehiculo('Coche 2', '5678DEF', 1000, 2);
  const aid1 = db.addAlumno('Ana', 'B', vid1, null, 1);
  const aid2 = db.addAlumno('Bea', 'B', vid2, null, 2);
  db.addPago(aid1, '2026-07-15', 100, '', 1);
  db.addPago(aid2, '2026-07-16', 40, '', 2);

  const informeSede1 = db.getInformes('2026-07-01', '2026-07-31', 1);
  expect(informeSede1.ingresos.total).toBe(100);
  expect(informeSede1.ocupacionVehiculos).toHaveLength(1);
  expect(informeSede1.ocupacionVehiculos[0].vehiculo_id).toBe(vid1);
});
