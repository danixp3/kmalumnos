// Tests de sync del email de alumno (prerequisito del portal del alumno,
// ROADMAP-SAAS.md → Fase 0 · Bloque 2). La migración
// migraciones/2026-08-05_alumno_email.sql TODAVÍA NO está aplicada en
// producción: estos tests comprueban que, sin ella, el push de alumnos NO
// incluye la clave `email` en el payload (columna inexistente en el
// servidor rompería el upsert de TODOS los alumnos si se colara), y que con
// la columna disponible sí se sube y se baja con normalidad. Mismo patrón
// que tests/sucursales.test.js para sucursal_id.
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
  mockRemote.columnasInexistentes = {};
  mockRemote.rpcHandlers = {};
  mockRemote.rpcErrores = {};
  mockRemote.tables = {
    meta: [{ key: 'ping' }],
    vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: []
  };
});

test('sync(): sin la columna email disponible, el payload de alumnos NO incluye la clave email', async () => {
  mockRemote.authUserId = 'uid-jefe';
  mockRemote.columnasInexistentes = { alumnos: ['email'] }; // simula migración no aplicada
  sync.setCredentials('jefe@test.com', 'password123');

  writeData({
    vehiculos: [], profesores: [], tarifas: [], pagos: [], logs: [],
    alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: null, profesor_id: null, email: 'ana@correo.com' }],
    practicas: [],
    _seq: { v: 1, a: 2, p: 1, pf: 1, t: 1, pg: 1 }
  });
  sync.markDirty('alumnos', 1);

  const res = await sync.sync();
  expect(res.ok).toBe(true);
  expect(mockRemote.tables.alumnos).toHaveLength(1);
  expect(mockRemote.tables.alumnos[0]).not.toHaveProperty('email');

  // Reintento: tampoco falla ni deja nada atascado
  const res2 = await sync.sync();
  expect(res2.ok).toBe(true);
});

test('sync(): con la columna email disponible, sube y baja el email del alumno', async () => {
  mockRemote.authUserId = 'uid-jefe';
  sync.setCredentials('jefe@test.com', 'password123');

  writeData({
    vehiculos: [], profesores: [], tarifas: [], pagos: [], logs: [],
    alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: null, profesor_id: null, email: 'ana@correo.com' }],
    practicas: [],
    _seq: { v: 1, a: 2, p: 1, pf: 1, t: 1, pg: 1 }
  });
  sync.markDirty('alumnos', 1);

  const res = await sync.sync();
  expect(res.ok).toBe(true);
  expect(mockRemote.tables.alumnos[0].email).toBe('ana@correo.com');

  // Bajada: otro PC edita el email en la nube directamente
  mockRemote.tables.alumnos[0] = {
    ...mockRemote.tables.alumnos[0], email: 'ana.nueva@correo.com',
    updated_at: new Date(Date.now() + 1000).toISOString()
  };
  const res2 = await sync.sync();
  expect(res2.ok).toBe(true);
  const alumnosLocal = db.getAlumnos();
  expect(alumnosLocal.find(a => a.id === 1).email).toBe('ana.nueva@correo.com');
});

test('pushAll(): sin la columna email disponible, tampoco la incluye en el payload', async () => {
  mockRemote.authUserId = 'uid-jefe';
  mockRemote.columnasInexistentes = { alumnos: ['email'] };
  sync.setCredentials('jefe@test.com', 'password123');

  writeData({
    vehiculos: [], profesores: [], tarifas: [], pagos: [], logs: [],
    alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: null, profesor_id: null, email: 'ana@correo.com' }],
    practicas: [],
    sucursales: [],
    _seq: { v: 1, a: 2, p: 1, pf: 1, t: 1, pg: 1, suc: 1 }
  });

  const res = await sync.pushAll();
  expect(res.ok).toBe(true);
  expect(mockRemote.tables.alumnos[0]).not.toHaveProperty('email');
});
