// Tests de sync de la ficha ampliada del alumno (teléfono, DNI, fecha de
// nacimiento, dirección, fecha de alta, observaciones). La migración
// migraciones/2026-08-06_alumno_datos.sql TODAVÍA NO está aplicada en
// producción: estos tests comprueban que, sin ella, el push de alumnos NO
// incluye ninguna de las 6 claves en el payload (columnas inexistentes en
// el servidor romperían el upsert de TODOS los alumnos si se colaran), y
// que con las columnas disponibles sí se suben y se bajan con normalidad.
// Mismo patrón que tests/alumno-email-sync.test.js para email.
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

const CAMPOS = ['telefono', 'dni', 'fecha_nacimiento', 'direccion', 'fecha_alta', 'observaciones'];

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.lastLogin = null;
  mockRemote.authUserId = undefined;
  mockRemote.tablasInexistentes = [];
  mockRemote.columnasInexistentes = {};
  mockRemote.rpcHandlers = {};
  mockRemote.rpcErrores = {};
  mockRemote.tables = {
    meta: [{ key: 'ping' }],
    vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: []
  };
});

test('sync(): sin las columnas de ficha ampliada disponibles, el payload de alumnos NO las incluye', async () => {
  mockRemote.authUserId = 'uid-jefe';
  mockRemote.columnasInexistentes = { alumnos: ['telefono'] }; // simula migración no aplicada (basta 1 columna: las 6 se comprueban juntas)
  sync.setCredentials('jefe@test.com', 'password123');

  writeData({
    vehiculos: [], profesores: [], tarifas: [], pagos: [], logs: [],
    alumnos: [{
      id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: null, profesor_id: null,
      telefono: '600123456', dni: '12345678A', fecha_nacimiento: '2000-01-15',
      direccion: 'Calle Falsa 123', fecha_alta: '2026-01-01', observaciones: 'Puntual'
    }],
    practicas: [],
    _seq: { v: 1, a: 2, p: 1, pf: 1, t: 1, pg: 1 }
  });
  sync.markDirty('alumnos', 1);

  const res = await sync.sync();
  expect(res.ok).toBe(true);
  expect(mockRemote.tables.alumnos).toHaveLength(1);
  for (const campo of CAMPOS) {
    expect(mockRemote.tables.alumnos[0]).not.toHaveProperty(campo);
  }

  // Reintento: tampoco falla ni deja nada atascado
  const res2 = await sync.sync();
  expect(res2.ok).toBe(true);
});

test('sync(): con las columnas disponibles, sube y baja los 6 campos del alumno', async () => {
  mockRemote.authUserId = 'uid-jefe';
  sync.setCredentials('jefe@test.com', 'password123');

  writeData({
    vehiculos: [], profesores: [], tarifas: [], pagos: [], logs: [],
    alumnos: [{
      id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: null, profesor_id: null,
      telefono: '600123456', dni: '12345678A', fecha_nacimiento: '2000-01-15',
      direccion: 'Calle Falsa 123', fecha_alta: '2026-01-01', observaciones: 'Puntual'
    }],
    practicas: [],
    _seq: { v: 1, a: 2, p: 1, pf: 1, t: 1, pg: 1 }
  });
  sync.markDirty('alumnos', 1);

  const res = await sync.sync();
  expect(res.ok).toBe(true);
  expect(mockRemote.tables.alumnos[0].telefono).toBe('600123456');
  expect(mockRemote.tables.alumnos[0].dni).toBe('12345678A');

  // Bajada: otro PC edita el teléfono en la nube directamente
  mockRemote.tables.alumnos[0] = {
    ...mockRemote.tables.alumnos[0], telefono: '699999999',
    updated_at: new Date(Date.now() + 1000).toISOString()
  };
  const res2 = await sync.sync();
  expect(res2.ok).toBe(true);
  const alumnosLocal = db.getAlumnos();
  expect(alumnosLocal.find(a => a.id === 1).telefono).toBe('699999999');
});

test('pushAll(): sin las columnas disponibles, tampoco las incluye en el payload', async () => {
  mockRemote.authUserId = 'uid-jefe';
  mockRemote.columnasInexistentes = { alumnos: ['telefono'] };
  sync.setCredentials('jefe@test.com', 'password123');

  writeData({
    vehiculos: [], profesores: [], tarifas: [], pagos: [], logs: [],
    alumnos: [{
      id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: null, profesor_id: null,
      telefono: '600123456', dni: '12345678A'
    }],
    practicas: [],
    sucursales: [],
    _seq: { v: 1, a: 2, p: 1, pf: 1, t: 1, pg: 1, suc: 1 }
  });

  const res = await sync.pushAll();
  expect(res.ok).toBe(true);
  for (const campo of CAMPOS) {
    expect(mockRemote.tables.alumnos[0]).not.toHaveProperty(campo);
  }
});

test('pushAll(): con las columnas disponibles, sí las incluye en el payload', async () => {
  mockRemote.authUserId = 'uid-jefe';
  sync.setCredentials('jefe@test.com', 'password123');

  writeData({
    vehiculos: [], profesores: [], tarifas: [], pagos: [], logs: [],
    alumnos: [{
      id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: null, profesor_id: null,
      telefono: '600123456', dni: '12345678A'
    }],
    practicas: [],
    sucursales: [],
    _seq: { v: 1, a: 2, p: 1, pf: 1, t: 1, pg: 1, suc: 1 }
  });

  const res = await sync.pushAll();
  expect(res.ok).toBe(true);
  expect(mockRemote.tables.alumnos[0].telefono).toBe('600123456');
  expect(mockRemote.tables.alumnos[0].dni).toBe('12345678A');
});
