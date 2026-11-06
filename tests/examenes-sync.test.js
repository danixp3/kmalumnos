// Los exámenes (presentaciones) viajan a la nube: los profesores los anotan desde el móvil y
// llegan al escritorio, y los del escritorio se ven en el móvil. Migración 2026-11-06_examenes.sql.
const fs = require('fs');
const path = require('path');

const mockRemote = { online: true, tables: {} };

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./mocks/fake-supabase')(mockRemote)
}));

const db = require('../db');
const sync = require('../sync');
const { resetData, userDataDir } = require('./helpers');

const dataFile = path.join(userDataDir, 'data.json');
const pendingFile = path.join(userDataDir, 'pending_sync.json');
const leerData = () => JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
const leerPending = () => JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.authUserId = 'uid-jefe';
  mockRemote.tablasInexistentes = [];
  mockRemote.rpcHandlers = {};
  mockRemote.rpcErrores = {};
  mockRemote.peticionesUpsert = {};
  mockRemote.tables = { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [], sucursales: [], reservas: [], cargos: [], presentaciones: [] };
  sync.setCredentials('jefe@test.com', 'password123');
});

test('un examen anotado en el escritorio sube a la nube con todos sus datos', async () => {
  const vid = db.addVehiculo('Ibiza', '4821 LKM', 0);
  const aid = db.addAlumno('Lucía Martín', 'B', vid);
  const ex = db.addPresentacion({ alumno_id: aid, tipo: 'circulacion', fecha: '2026-11-20', resultado: 'apto', nota: 'Bien', examinador: 'J. Pérez', fallos: 2, permiso: 'B' });

  const res = await sync.sync();
  expect(res.ok).toBe(true);
  expect(mockRemote.tables.presentaciones).toHaveLength(1);
  expect(mockRemote.tables.presentaciones[0]).toMatchObject({
    id: ex.id, alumno_id: aid, tipo: 'circulacion', fecha: '2026-11-20', resultado: 'apto', nota: 'Bien',
    examinador: 'J. Pérez', fallos: 2, permiso: 'B', deleted: false, empresa_id: 'uid-jefe'
  });
  expect(leerPending().presentaciones).toEqual([]);
});

test('un examen que el profesor anota en el móvil llega al escritorio (sin tocar el contador de ids)', async () => {
  mockRemote.tables.presentaciones.push({
    id: 1000000007, alumno_id: 5, profesor_id: 2, tipo: 'circulacion', fecha: '2026-11-10', n_convocatoria: 2,
    resultado: 'no_apto', nota: 'Rotonda', permiso: 'B', examinador: null, vehiculo: null, fallos: 3, fallos_detalle: 'Eliminatoria',
    n_solicitud: null, origen: 'web-remote', empresa_id: 'uid-jefe', sucursal_id: null, deleted: false, updated_at: '2026-11-10T12:00:00.000Z'
  });

  const res = await sync.sync();
  expect(res.ok).toBe(true);
  db._clearCache();
  const lista = db.getPresentaciones();
  expect(lista).toHaveLength(1);
  expect(lista[0]).toMatchObject({ id: 1000000007, alumno_id: 5, resultado: 'no_apto', n_convocatoria: 2, fallos: 3, origen: 'web-remote' });
  // el rango de la web no arrastra el contador del escritorio
  expect(leerData()._seq.pres).toBeLessThan(1e9);
  // y no se vuelve a subir lo que acaba de bajar
  const subidasAntes = mockRemote.peticionesUpsert.presentaciones || 0;
  await sync.sync();
  expect(mockRemote.peticionesUpsert.presentaciones || 0).toBe(subidasAntes);
});

test('cambiar el resultado y borrar un examen en el escritorio se refleja en la nube (borrado suave)', async () => {
  const aid = db.addAlumno('Ana', 'B', null);
  const ex = db.addPresentacion({ alumno_id: aid, tipo: 'teorico', fecha: '2026-11-03' });
  await sync.sync();
  expect(mockRemote.tables.presentaciones[0].resultado).toBe('pendiente');

  db.setResultadoPresentacion(ex.id, 'apto');
  await sync.sync();
  expect(mockRemote.tables.presentaciones[0].resultado).toBe('apto');

  db.deletePresentacion(ex.id);
  await sync.sync();
  expect(mockRemote.tables.presentaciones).toHaveLength(1);       // nunca DELETE real
  expect(mockRemote.tables.presentaciones[0].deleted).toBe(true);
  expect(db.getPresentaciones()).toHaveLength(0);
});

test('un examen borrado en otro dispositivo se quita también aquí', async () => {
  const aid = db.addAlumno('Ana', 'B', null);
  const ex = db.addPresentacion({ alumno_id: aid, tipo: 'teorico', fecha: '2026-11-03' });
  await sync.sync();
  mockRemote.tables.presentaciones[0] = { ...mockRemote.tables.presentaciones[0], deleted: true, updated_at: new Date(Date.now() + 60000).toISOString() };
  await sync.sync();
  db._clearCache();
  expect(db.getPresentaciones().find(x => x.id === ex.id)).toBeUndefined();
});

test('sin la migración aplicada no falla ni pierde nada: el examen se queda en este PC y en la cola', async () => {
  mockRemote.tablasInexistentes = ['presentaciones'];
  const aid = db.addAlumno('Ana', 'B', null);
  const ex = db.addPresentacion({ alumno_id: aid, tipo: 'teorico', fecha: '2026-11-03' });
  const res = await sync.sync();
  expect(res.ok).toBe(true);
  expect(db.getPresentaciones()).toHaveLength(1);
  expect(leerPending().presentaciones).toContain(ex.id);
  // al aplicarse la migración, sube solo
  mockRemote.tablasInexistentes = [];
  sync.setCredentials('jefe@test.com', 'password123');
  await sync.sync();
  expect(mockRemote.tables.presentaciones).toHaveLength(1);
});

test('red de seguridad: un examen que ya estaba en el PC (sin marcar) sube la primera vez, y un cambio sin marcar también', async () => {
  const aid = db.addAlumno('Ana', 'B', null);
  // simula un examen antiguo de una versión que no sincronizaba: está en data.json sin marca
  const d = leerData();
  d.presentaciones = [{ id: 40, alumno_id: aid, tipo: 'maniobras', fecha: '2026-09-01', profesor_id: null, n_convocatoria: 1, resultado: 'apto', sucursal_id: null, nota: '' }];
  d._seq.pres = 41;
  fs.writeFileSync(dataFile, JSON.stringify(d, null, 2), 'utf-8');
  db._clearCache();

  await sync.sync();
  expect(mockRemote.tables.presentaciones.map(x => x.id)).toEqual([40]);

  // sin cambios: no se vuelve a subir
  const n1 = mockRemote.peticionesUpsert.presentaciones;
  await sync.sync();
  expect(mockRemote.peticionesUpsert.presentaciones).toBe(n1);

  // cambio hecho sin pasar por db/convocatorias.js (p. ej. un importador): se detecta por la huella
  const d2 = leerData();
  d2.presentaciones[0].resultado = 'no_apto';
  fs.writeFileSync(dataFile, JSON.stringify(d2, null, 2), 'utf-8');
  db._clearCache();
  await sync.sync();
  expect(mockRemote.tables.presentaciones[0].resultado).toBe('no_apto');
});

test('juntar dos fichas de alumno mueve sus exámenes y suben a la nube con el alumno que se queda', async () => {
  const a1 = db.addAlumno('Lucía Martín', 'B', null);
  const a2 = db.addAlumno('Lucia Martin', 'B', null);
  const ex = db.addPresentacion({ alumno_id: a2, tipo: 'circulacion', fecha: '2026-11-20' });
  await sync.sync();
  expect(mockRemote.tables.presentaciones[0].alumno_id).toBe(a2);
  const r = db.fusionarAlumnos(a1, a2);
  expect(r.ok).toBe(true);
  await sync.sync();
  expect(mockRemote.tables.presentaciones.find(x => x.id === ex.id).alumno_id).toBe(a1);
});
