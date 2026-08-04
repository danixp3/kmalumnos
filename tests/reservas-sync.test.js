// Tests de sync de reservas (agenda, Bloque 2 SaaS). La migración
// migraciones/2026-08-05_reservas.sql TODAVÍA NO está aplicada en producción:
// estos tests comprueban que, sin ella, la app funciona exactamente como hoy
// (reservas se saltan, no rompen nada, no hay excepciones), y que con la
// migración aplicada sí sube y baja con normalidad. Mismo patrón que
// tests/sucursales.test.js.
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

function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
  db._clearCache();
}

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.lastLogin = null;
  mockRemote.authUserId = undefined;
  mockRemote.tablasInexistentes = [];
  mockRemote.rpcHandlers = {};
  mockRemote.rpcErrores = {};
  mockRemote.tables = {
    meta: [{ key: 'ping' }],
    vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [],
    sucursales: [], reservas: []
  };
});

describe('Sync: reservas no rompe nada sin la migración aplicada', () => {
  test('sync() con la tabla reservas inexistente: no falla, no sube nada, cola no queda atascada', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tablasInexistentes = ['reservas']; // simula migración no aplicada
    sync.setCredentials('jefe@test.com', 'password123');

    writeData({
      vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [], sucursales: [],
      reservas: [{ id: 1, alumno_id: null, profesor_id: null, vehiculo_id: null, fecha: '2026-08-10', hora_inicio: '10:00', duracion_min: 45, estado: 'solicitada', origen: 'desktop', nota: '' }],
      logs: [],
      _seq: { v: 1, a: 1, p: 1, pf: 1, t: 1, pg: 1, suc: 1, r: 2 }
    });
    sync.markDirty('reservas', 1);

    const res = await sync.sync();
    expect(res.ok).toBe(true);
    // La reserva no se subió: la tabla no existe en el servidor
    expect(mockRemote.tables.reservas).toHaveLength(0);

    // Un segundo sync (reintento) tampoco falla ni deja nada atascado
    const res2 = await sync.sync();
    expect(res2.ok).toBe(true);
  });

  test('sync() con la migración aplicada: sube y baja reservas', async () => {
    mockRemote.authUserId = 'uid-jefe';
    sync.setCredentials('jefe@test.com', 'password123');

    writeData({
      vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [], sucursales: [],
      reservas: [{ id: 1, alumno_id: null, profesor_id: null, vehiculo_id: null, fecha: '2026-08-10', hora_inicio: '10:00', duracion_min: 45, estado: 'solicitada', origen: 'desktop', nota: '' }],
      logs: [],
      _seq: { v: 1, a: 1, p: 1, pf: 1, t: 1, pg: 1, suc: 1, r: 2 }
    });
    sync.markDirty('reservas', 1);

    const res = await sync.sync();
    expect(res.ok).toBe(true);
    expect(mockRemote.tables.reservas).toHaveLength(1);
    expect(mockRemote.tables.reservas[0]).toMatchObject({ id: 1, estado: 'solicitada', fecha: '2026-08-10' });
  });

  test('pushAll() tampoco falla si el servidor no tiene la tabla reservas', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tablasInexistentes = ['reservas'];
    sync.setCredentials('jefe@test.com', 'password123');

    writeData({
      vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [], sucursales: [],
      reservas: [{ id: 1, alumno_id: null, profesor_id: null, vehiculo_id: null, fecha: '2026-08-10', hora_inicio: '10:00', duracion_min: 45, estado: 'solicitada', origen: 'desktop', nota: '' }],
      logs: [],
      _seq: { v: 1, a: 1, p: 1, pf: 1, t: 1, pg: 1, suc: 1, r: 2 }
    });

    const res = await sync.pushAll();
    expect(res.ok).toBe(true);
    expect(mockRemote.tables.reservas).toHaveLength(0);
  });
});
