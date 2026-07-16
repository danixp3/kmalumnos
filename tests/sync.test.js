// Tests de la sincronización bidireccional (sync.js) contra un Supabase simulado.
// Nunca se conectan a la base de datos real.
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

function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
  db._clearCache();
}

function readData() {
  return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
}

function baseData(extra = {}) {
  return {
    vehiculos: [{ id: 1, nombre: 'Coche 1', matricula: '', km_actual: 200 }],
    alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1 }],
    practicas: [],
    logs: [],
    _seq: { v: 2, a: 2, p: 2 },
    ...extra
  };
}

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null); // limpiar credenciales y cliente cacheado entre tests
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.lastLogin = null;
  mockRemote.tables = {
    meta: [{ key: 'ping' }],
    vehiculos: [],
    alumnos: [],
    practicas: []
  };
});

test('sin internet: sync no falla, avisa, y los cambios quedan encolados para más tarde', async () => {
  mockRemote.online = false;
  const vid = db.addVehiculo('Coche 1', '', 0); // esto marca el cambio como pendiente

  const res = await sync.sync();

  expect(res.ok).toBe(false);
  expect(sync.getStatus()).toBe('offline');
  const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
  expect(pending.vehiculos).toContain(vid);

  // Al volver la conexión, el cambio encolado se sube solo
  mockRemote.online = true;
  const res2 = await sync.sync();
  expect(res2.ok).toBe(true);
  expect(mockRemote.tables.vehiculos).toHaveLength(1);
  expect(mockRemote.tables.vehiculos[0]).toMatchObject({ id: vid, nombre: 'Coche 1' });
});

test('sube a la nube los cambios hechos en el escritorio y vacía la cola de pendientes', async () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 100);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addPractica(aid, vid, '2026-07-01', 100, 140);

  const res = await sync.sync();

  expect(res.ok).toBe(true);
  expect(mockRemote.tables.vehiculos).toHaveLength(1);
  expect(mockRemote.tables.alumnos).toHaveLength(1);
  expect(mockRemote.tables.practicas[0]).toMatchObject({
    id: pid, alumno_id: aid, vehiculo_id: vid, km_inicial: 100, km_final: 140, deleted: false
  });
  const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
  expect(pending.vehiculos).toHaveLength(0);
  expect(pending.alumnos).toHaveLength(0);
  expect(pending.practicas).toHaveLength(0);
});

test('baja una práctica registrada desde el móvil y ajusta el contador de IDs', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  await sync.sync(); // primera sincronización: fija el punto de partida

  // Simular que el móvil registró una práctica después
  mockRemote.tables.practicas.push({
    id: 500, alumno_id: aid, vehiculo_id: vid, fecha: '2026-07-10',
    km_inicial: '0', km_final: '0', nota: '', deleted: false,
    updated_at: new Date(Date.now() + 1000).toISOString()
  });

  const res = await sync.sync();

  expect(res.ok).toBe(true);
  expect(res.pulled).toBe(1);
  const practicas = db.getPracticasByAlumno(aid);
  expect(practicas).toHaveLength(1);
  expect(practicas[0]).toMatchObject({ id: 500, km_inicial: 0, km_final: 0 });
  // El siguiente ID local no debe chocar con el que asignó la nube
  expect(readData()._seq.p).toBe(501);
});

test('ignora prácticas remotas de alumnos o vehículos que no existen en local', async () => {
  writeData(baseData());
  mockRemote.tables.practicas.push({
    id: 7, alumno_id: 999, vehiculo_id: 1, fecha: '2026-07-10',
    km_inicial: '0', km_final: '0', deleted: false,
    updated_at: new Date().toISOString()
  });

  const res = await sync.sync();

  expect(res.ok).toBe(true);
  expect(res.pulled).toBe(0);
  expect(readData().practicas).toHaveLength(0);
});

test('conflicto: si la edición local es más reciente, NO se machaca con la versión de la nube', async () => {
  const ahora = Date.now();
  const tsLocal = new Date(ahora).toISOString();          // editado en local hace nada
  const tsRemoto = new Date(ahora - 60000).toISOString(); // versión de la nube, más vieja
  writeData(baseData({
    practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01', km_inicial: 100, km_final: 145, updated_at: tsLocal }]
  }));
  mockRemote.tables.practicas.push({
    id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01',
    km_inicial: '100', km_final: '140', deleted: false, updated_at: tsRemoto
  });

  await sync.sync();

  expect(readData().practicas[0].km_final).toBe(145); // se conserva la edición local
});

test('conflicto: si la versión de la nube es más reciente, sí actualiza la copia local', async () => {
  const ahora = Date.now();
  const tsLocal = new Date(ahora - 60000).toISOString();
  const tsRemoto = new Date(ahora).toISOString();
  writeData(baseData({
    practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01', km_inicial: 100, km_final: 145, updated_at: tsLocal }]
  }));
  mockRemote.tables.practicas.push({
    id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01',
    km_inicial: '100', km_final: '140', deleted: false, updated_at: tsRemoto
  });

  await sync.sync();

  expect(readData().practicas[0].km_final).toBe(140); // gana la versión más reciente
});

test('un borrado hecho desde el móvil (soft delete) elimina la práctica en local', async () => {
  writeData(baseData({
    practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01', km_inicial: 100, km_final: 140 }]
  }));
  mockRemote.tables.practicas.push({
    id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01',
    km_inicial: '100', km_final: '140', deleted: true,
    updated_at: new Date().toISOString()
  });

  const res = await sync.sync();

  expect(res.ok).toBe(true);
  expect(readData().practicas).toHaveLength(0);
});

describe('autenticación de la cuenta de sincronización', () => {
  test('con credenciales configuradas, inicia sesión antes de sincronizar', async () => {
    sync.setCredentials('sync@kmalumnos.app', 'secreta');
    db.addVehiculo('Coche 1', '', 0);

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.lastLogin).toEqual({ email: 'sync@kmalumnos.app', password: 'secreta' });
  });

  test('credenciales inválidas: no sincroniza y avisa con estado de error', async () => {
    mockRemote.authOk = false;
    sync.setCredentials('sync@kmalumnos.app', 'mal');
    db.addVehiculo('Coche 1', '', 0);

    const res = await sync.sync();

    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/credenciales/i);
    expect(sync.getStatus()).toBe('error');
    expect(mockRemote.tables.vehiculos).toHaveLength(0); // no subió nada
  });

  test('sin credenciales configuradas, sigue funcionando (modo transición)', async () => {
    db.addVehiculo('Coche 1', '', 0);

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.lastLogin).toBeNull(); // no intentó iniciar sesión
    expect(sync.hasCredentials()).toBe(false);
  });
});

test('un borrado hecho en el escritorio se propaga a la nube como soft delete', async () => {
  writeData(baseData());
  mockRemote.tables.practicas.push({
    id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01',
    km_inicial: '100', km_final: '140', deleted: false,
    updated_at: '2026-07-01T00:00:00.000Z'
  });
  sync.markDeleted('practicas', 1);

  const res = await sync.sync();

  expect(res.ok).toBe(true);
  expect(mockRemote.tables.practicas[0].deleted).toBe(true);
});
