// Clases sin coche (traídas de otro programa o de Ariauto sin decir el coche):
// la bajada las descartaba porque exigía que el coche existiera aquí, así que
// no llegaban nunca a los demás PCs ni a un PC nuevo (2026-10-09).
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
const EMPRESA = 'uid-jefe';
const leer = f => JSON.parse(fs.readFileSync(f, 'utf-8'));
function writeData(data) { fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8'); db._clearCache(); }

const base = () => ({
  vehiculos: [{ id: 1, nombre: 'Ibiza', matricula: '4821LKM', km_actual: 100 }],
  profesores: [], tarifas: [], pagos: [], logs: [], sucursales: [],
  alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1, profesor_id: null }],
  practicas: [],
  _seq: { v: 2, a: 2, p: 2, pf: 1, t: 1, pg: 1, suc: 1 }
});
const remota = (id, extra = {}) => ({
  id, alumno_id: 1, vehiculo_id: null, fecha: '2025-03-01', km_inicial: 0, km_final: 0, deleted: false, empresa_id: EMPRESA,
  tipo_detalle: 'anterior', procedencia: 'Ariauto', updated_at: new Date(Date.now() + 1000).toISOString(), ...extra
});

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  Object.assign(mockRemote, { online: true, authOk: true, authUserId: EMPRESA, tablasInexistentes: [], columnasInexistentes: {}, rpcHandlers: {}, rpcErrores: {}, _onUpsert: undefined });
  mockRemote.tables = { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [] };
  sync.setCredentials('jefe@test.com', 'password123');
});

test('una clase sin coche que llega de la nube se guarda aquí (antes se descartaba)', async () => {
  writeData(base());
  sync.markDirty('vehiculos', 1); sync.markDirty('alumnos', 1);
  expect((await sync.sync()).ok).toBe(true);
  mockRemote.tables.practicas.push(remota(500), remota(501, { vehiculo_id: 99 }));   // la de un coche que no existe sigue esperando
  expect((await sync.sync()).ok).toBe(true);
  const ids = leer(dataFile).practicas.map(p => p.id);
  expect(ids).toContain(500);
  expect(ids).not.toContain(501);
});

test('una vez por PC se recuperan las clases sin coche que ya se habían descartado', async () => {
  writeData(base());
  sync.markDirty('vehiculos', 1); sync.markDirty('alumnos', 1);
  // Clase vieja (anterior al último sync): con la versión anterior este PC ya la «vio» y la descartó
  mockRemote.tables.practicas.push(remota(600, { updated_at: '2026-01-01T00:00:00.000Z' }));
  const pend = fs.existsSync(pendingFile) ? leer(pendingFile) : {};
  pend.lastSync = '2026-06-01T00:00:00.000Z';
  fs.writeFileSync(pendingFile, JSON.stringify(pend), 'utf-8');
  expect((await sync.sync()).ok).toBe(true);
  expect(leer(dataFile).practicas.map(x => x.id)).toContain(600);
  expect(leer(pendingFile).repasoClasesSinCoche).toBeTruthy();
});
