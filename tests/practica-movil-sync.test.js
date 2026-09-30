// Tests de sync de las columnas del flujo móvil de prácticas (firma, trabajado,
// tipo_detalle, hora_fin). La migración migraciones/2026-09-29_practica_movil.sql
// NO está aplicada por defecto: sin ella el push de prácticas NO debe incluir
// esas claves (columnas inexistentes romperían el upsert de TODAS las prácticas);
// con ella, se suben y se bajan con normalidad. Mismo patrón que
// tests/alumno-datos-sync.test.js.
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
const CAMPOS = ['firma', 'trabajado', 'tipo_detalle', 'hora_fin'];

function datos() {
  return {
    vehiculos: [{ id: 1, nombre: 'Ibiza', matricula: '4821 LKM', km_actual: 100 }],
    profesores: [], tarifas: [], pagos: [], logs: [],
    alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1, profesor_id: null }],
    practicas: [{
      id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-29', km_inicial: 100, km_final: 118,
      firma: 'data:image/png;base64,AAAA', trabajado: ['Glorietas'], tipo_detalle: 'Maniobras', hora_fin: '10:48'
    }],
    sucursales: [],
    _seq: { v: 2, a: 2, p: 2, pf: 1, t: 1, pg: 1, suc: 1 }
  };
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
  mockRemote.tables = { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [] };
});

test('sync(): sin las columnas del flujo móvil, el payload de prácticas NO las incluye', async () => {
  mockRemote.authUserId = 'uid-jefe';
  mockRemote.columnasInexistentes = { practicas: ['firma'] };
  sync.setCredentials('jefe@test.com', 'password123');
  writeData(datos());
  sync.markDirty('vehiculos', 1); sync.markDirty('alumnos', 1); sync.markDirty('practicas', 1);
  const res = await sync.sync();
  expect(res.ok).toBe(true);
  expect(mockRemote.tables.practicas).toHaveLength(1);
  for (const c of CAMPOS) expect(mockRemote.tables.practicas[0]).not.toHaveProperty(c);
});

test('sync(): con las columnas disponibles, sube los 4 campos y los baja desde la nube', async () => {
  mockRemote.authUserId = 'uid-jefe';
  sync.setCredentials('jefe@test.com', 'password123');
  writeData(datos());
  sync.markDirty('vehiculos', 1); sync.markDirty('alumnos', 1); sync.markDirty('practicas', 1);
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.practicas[0]).toMatchObject({ firma: 'data:image/png;base64,AAAA', tipo_detalle: 'Maniobras', hora_fin: '10:48' });
  expect(mockRemote.tables.practicas[0].trabajado).toEqual(['Glorietas']);

  // Bajada: el móvil firma una práctica nueva directamente en la nube
  mockRemote.tables.practicas.push({
    id: 2, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-29', km_inicial: 118, km_final: 140, deleted: false, empresa_id: 'uid-jefe',
    firma: 'data:image/png;base64,BBBB', trabajado: ['Rotondas', 'Cambios de carril'], tipo_detalle: 'Vía rápida', hora_fin: '11:40',
    updated_at: new Date(Date.now() + 1000).toISOString()
  });
  expect((await sync.sync()).ok).toBe(true);
  const p2 = db.getPracticasByAlumno(1).find(p => p.id === 2);
  expect(p2).toMatchObject({ firma: 'data:image/png;base64,BBBB', tipo_detalle: 'Vía rápida', hora_fin: '11:40' });
  expect(p2.trabajado).toEqual(['Rotondas', 'Cambios de carril']);
});

test('pushAll(): sin las columnas disponibles, tampoco las incluye', async () => {
  mockRemote.authUserId = 'uid-jefe';
  mockRemote.columnasInexistentes = { practicas: ['firma'] };
  sync.setCredentials('jefe@test.com', 'password123');
  writeData(datos());
  const res = await sync.pushAll();
  expect(res.ok).toBe(true);
  for (const c of CAMPOS) expect(mockRemote.tables.practicas[0]).not.toHaveProperty(c);
});

test('pushAll(): nunca manda los datos del móvil, así no borra en la nube una firma que este PC no tenga', async () => {
  mockRemote.authUserId = 'uid-jefe';
  sync.setCredentials('jefe@test.com', 'password123');
  const d = datos();
  delete d.practicas[0].firma;
  writeData(d);
  mockRemote.tables.practicas = [{ id: d.practicas[0].id, firma: 'data:image/png;base64,NUBE', hora_fin: '10:48', deleted: false, updated_at: '2026-01-01T00:00:00.000Z' }];
  expect((await sync.pushAll()).ok).toBe(true);
  expect(mockRemote.tables.practicas[0]).toMatchObject({ firma: 'data:image/png;base64,NUBE', hora_fin: '10:48' });
});
