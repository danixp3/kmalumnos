// Borrar alumnos por fechas contra una nube simulada: se borran (borrado suave) y, al deshacer, vuelven a vivir en la nube.
const mockRemote = { online: true, tables: {} };

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./mocks/fake-supabase')(mockRemote)
}));

const db = require('../db');
const sync = require('../sync');
const { resetData } = require('./helpers');

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.authUserId = 'uid-jefe';
  mockRemote.tablasInexistentes = [];
  mockRemote.tables = { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [], sucursales: [], reservas: [], cargos: [], presentaciones: [] };
  sync.setCredentials('jefe@test.com', 'password123');
});

test('borrar por fechas: en la nube quedan con deleted:true (nunca DELETE real); al deshacer vuelven con deleted:false', async () => {
  const vid = db.addVehiculo('Ibiza', '4821 LKM', 0);
  const a1 = db.addAlumno('Ana Pérez', 'B', vid);
  const a2 = db.addAlumno('Bruno Ruiz', 'B', vid);
  db.updateAlumnoCampos(a1, { fecha_alta: '2026-09-05' });
  db.updateAlumnoCampos(a2, { fecha_alta: '2026-10-10' });
  const p1 = db.addPractica(a1, vid, '2026-09-06', 100, 140);
  db.addPractica(a2, vid, '2026-10-12', 140, 180);
  db.addPresentacion({ alumno_id: a1, tipo: 'teorico', fecha: '2026-09-30', resultado: 'apto' });
  db.addPago(a1, '2026-09-07', 50, 'cobro');
  await sync.sync();
  expect(mockRemote.tables.alumnos.filter(x => !x.deleted)).toHaveLength(2);

  const res = db.aplicarBorradoAlumnos({ criterio: 'alta', desde: '2026-09-01', hasta: '2026-09-30' });
  expect(res.ok).toBe(true);
  await sync.sync();
  const alumno = id => mockRemote.tables.alumnos.find(x => x.id === id);
  expect(alumno(a1).deleted).toBe(true);
  expect(alumno(a2).deleted).toBeFalsy();
  expect(mockRemote.tables.practicas.find(x => x.id === p1).deleted).toBe(true);
  expect(mockRemote.tables.presentaciones.every(x => x.deleted)).toBe(true);
  expect(mockRemote.tables.pagos).toHaveLength(1);              // el cobro se conserva
  expect(mockRemote.tables.pagos[0].deleted).toBeFalsy();
  expect(mockRemote.tables.alumnos).toHaveLength(2);            // ninguna fila desaparece de verdad

  expect(db.deshacerBorradoAlumnos(res.id).ok).toBe(true);
  await sync.sync();
  expect(alumno(a1).deleted).toBe(false);
  expect(mockRemote.tables.practicas.find(x => x.id === p1).deleted).toBe(false);
  expect(mockRemote.tables.presentaciones.every(x => !x.deleted)).toBe(true);
});
