// Rapidez de la sincronización con miles de registros (2026-10-03): traer
// datos de otro programa y deshacerlo dejaba la app congelada (la cola se
// reescribía por cada registro), los borrados iban a la nube de uno en uno y
// lo recién subido se volvía a descargar entero en cada sync de los 10 minutos
// siguientes. Siempre contra un Supabase simulado.
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
const EMPRESA = 'uid-empresa';
const ANTES = '2026-09-01T00:00:00.000Z';

function writeData(data) { fs.writeFileSync(dataFile, JSON.stringify({ logs: [], ...data }, null, 2), 'utf-8'); db._clearCache(); }
const readData = () => JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
const readPending = () => JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
const conEmpresa = filas => filas.map(f => ({ empresa_id: EMPRESA, deleted: false, updated_at: ANTES, ...f }));
const rango = (desde, n) => Array.from({ length: n }, (_, i) => desde + i);
const peticiones = (op, tabla) => mockRemote.registro.filter(r => r.op === op && r.tabla === tabla);
const filasCompletasBajadas = tabla => peticiones('select', tabla).filter(r => r.cols === '*').reduce((s, r) => s + r.filas, 0);

// Cola ya vinculada a la cuenta (la primera vinculación no es lo que se prueba)
function escribirCola(extra = {}) {
  fs.writeFileSync(pendingFile, JSON.stringify({
    vehiculos: [], profesores: [], alumnos: [], practicas: [], tarifas: [], pagos: [], cargos: [],
    deleted: {}, lastSync: '2026-09-02T00:00:00.000Z', colisionesResueltas: { [EMPRESA]: true },
    ultimaVerificacion: new Date().toISOString(), ...extra
  }));
}

function conSesion() {
  mockRemote.authUserId = EMPRESA;
  sync.setCredentials('jefe@test.com', 'password123');
}

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  Object.assign(mockRemote, { online: true, authOk: true, maxRows: undefined, upsertErrores: undefined, updateErrores: undefined, _onUpsert: undefined, authUserId: undefined, columnasInexistentes: undefined, tablasInexistentes: undefined });
  mockRemote.tables = { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], tarifas: [], pagos: [] };
  mockRemote.registro = [];
});

afterEach(() => jest.restoreAllMocks());

test('marcar miles de registros de una vez escribe la cola una sola vez y sin repetidos', () => {
  const real = fs.writeFileSync;
  let escrituras = 0;
  jest.spyOn(fs, 'writeFileSync').mockImplementation((ruta, ...resto) => {
    if (ruta === pendingFile) escrituras++;
    return real(ruta, ...resto);
  });
  sync.markDirtyVarios('alumnos', rango(1, 3000));
  sync.markDirtyVarios('alumnos', [5, 6, 3001]);
  expect(escrituras).toBe(2);
  const cola = readPending();
  expect(cola.alumnos).toHaveLength(3001);
  expect(new Set(cola.alumnos).size).toBe(3001);

  // Borrar: pasan a la lista de borrados y dejan de estar pendientes de subir.
  sync.markDeletedVarios('alumnos', rango(1, 10));
  const despues = readPending();
  expect(despues.deleted.alumnos).toEqual(rango(1, 10));
  expect(despues.alumnos).toHaveLength(2991);
  expect(despues.alumnos).not.toContain(1);
  expect(escrituras).toBe(3);
});

test('deshacer una importación de miles de alumnos es rápido y escribe la cola una vez por tabla', () => {
  const alumnos = rango(1, 3000).map(id => ({ id, nombre: 'Alumno ' + id, permiso: 'B', vehiculo_id: 1 }));
  const practicas = rango(1, 3000).map(id => ({ id, alumno_id: id, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 0, km_final: 0 }));
  writeData({
    vehiculos: [{ id: 1, nombre: 'C', matricula: '', km_actual: 0 }], alumnos, practicas, profesores: [], cargos: [], pagos: [],
    _seq: { v: 2, a: 3001, p: 3001 },
    importaciones: [{
      id: 'imp1', fecha: ANTES, tipo: 'ariauto', archivo: 'prueba.accdb',
      creados: { alumnos: rango(1, 3000), practicas: rango(1, 2999), cargos: [], pagos: [], profesores: [], vehiculos: [] },
      actualizados: [], previasRestadas: []
    }]
  });
  const real = fs.writeFileSync;
  let escrituras = 0;
  jest.spyOn(fs, 'writeFileSync').mockImplementation((ruta, ...resto) => {
    if (ruta === pendingFile) escrituras++;
    return real(ruta, ...resto);
  });
  const t0 = Date.now();
  const res = db.deshacerImportacion('imp1');
  expect(Date.now() - t0).toBeLessThan(3000);
  expect(res.ok).toBe(true);
  expect(res.practicas).toBe(2999);
  expect(res.alumnos).toBe(2999);               // el 3000 conserva una clase que no venía en la importación
  expect(res.conservados).toEqual(['Alumno 3000']);
  expect(escrituras).toBeLessThanOrEqual(3);
  const cola = readPending();
  expect(cola.deleted.alumnos).toHaveLength(2999);
  expect(cola.deleted.practicas).toHaveLength(2999);
});

test('los borrados van a la nube en bloques de ids, no uno a uno', async () => {
  conSesion();
  writeData({ vehiculos: [{ id: 1, nombre: 'C', matricula: '', km_actual: 0 }], alumnos: [], practicas: [], _seq: { v: 2, a: 451, p: 1 } });
  mockRemote.tables.vehiculos = conEmpresa([{ id: 1, nombre: 'C' }]);
  mockRemote.tables.alumnos = conEmpresa(rango(1, 450).map(id => ({ id, nombre: 'A' + id, permiso: 'B', vehiculo_id: 1 })));
  escribirCola({ deleted: { alumnos: rango(1, 450) } });

  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.alumnos.every(a => a.deleted === true)).toBe(true);
  expect(peticiones('update', 'alumnos').length).toBeLessThanOrEqual(3); // antes: 450
  expect(readPending().deleted.alumnos).toEqual([]);
});

test('si un bloque de borrado falla, se repite uno a uno y solo se queda en la cola el que falla', async () => {
  conSesion();
  writeData({ vehiculos: [{ id: 1, nombre: 'C', matricula: '', km_actual: 0 }], alumnos: [], practicas: [], _seq: { v: 2, a: 11, p: 1 } });
  mockRemote.tables.vehiculos = conEmpresa([{ id: 1, nombre: 'C' }]);
  mockRemote.tables.alumnos = conEmpresa(rango(1, 10).map(id => ({ id, nombre: 'A' + id, permiso: 'B', vehiculo_id: 1 })));
  mockRemote.updateErrores = { alumnos: [7] };
  escribirCola({ deleted: { alumnos: rango(1, 10) } });

  const res = await sync.sync();
  expect(res.ok).toBe(false);
  expect(res.reason).toMatch(/no se pudieron subir/);
  expect(mockRemote.tables.alumnos.filter(a => a.deleted).map(a => a.id)).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10]);
  expect(readPending().deleted.alumnos).toEqual([7]);

  mockRemote.updateErrores = undefined;
  expect((await sync.sync()).ok).toBe(true);
  expect(readPending().deleted.alumnos).toEqual([]);
});

test('lo que acaba de subir este PC no se vuelve a descargar entero ni cuenta como cambio recibido', async () => {
  conSesion();
  const alumnos = rango(1, 300).map(id => ({ id, nombre: 'Alumno ' + id, permiso: 'B', vehiculo_id: 1 }));
  writeData({ vehiculos: [{ id: 1, nombre: 'C', matricula: '', km_actual: 0 }], alumnos, practicas: [], _seq: { v: 2, a: 301, p: 1 } });
  mockRemote.tables.vehiculos = conEmpresa([{ id: 1, nombre: 'C' }]);
  escribirCola({ alumnos: rango(1, 300) });

  const primero = await sync.sync();
  expect(primero.ok).toBe(true);
  expect(mockRemote.tables.alumnos).toHaveLength(300);
  expect(peticiones('upsert', 'alumnos').length).toBe(2); // por lotes de 200
  expect(filasCompletasBajadas('alumnos')).toBe(0);
  expect(primero.pulled).toBe(0);
  // El registro local se queda con la misma marca de tiempo que la nube.
  const remotoPorId = new Map(mockRemote.tables.alumnos.map(a => [a.id, a.updated_at]));
  expect(readData().alumnos.every(a => a.updated_at === remotoPorId.get(a.id))).toBe(true);

  // Los syncs siguientes (dentro del margen de 10 minutos) tampoco lo bajan.
  mockRemote.registro = [];
  const segundo = await sync.sync();
  expect(segundo.ok).toBe(true);
  expect(segundo.pulled).toBe(0);
  expect(filasCompletasBajadas('alumnos')).toBe(0);
});

test('los cambios de otro dispositivo se siguen bajando: solo las filas que hacen falta', async () => {
  conSesion();
  writeData({
    vehiculos: [{ id: 1, nombre: 'C', matricula: '', km_actual: 0 }],
    alumnos: [
      { id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1, updated_at: ANTES },
      { id: 2, nombre: 'Luis', permiso: 'B', vehiculo_id: 1, updated_at: ANTES },
      { id: 4, nombre: 'Igual', permiso: 'B', vehiculo_id: 1, updated_at: '2026-09-10T00:00:00.000Z' }
    ],
    practicas: [
      { id: 10, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 0, km_final: 10, updated_at: ANTES },
      { id: 12, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-02', km_inicial: 10, km_final: 20, updated_at: ANTES },
      { id: 20, alumno_id: 2, vehiculo_id: 1, fecha: '2026-09-03', km_inicial: 20, km_final: 30, updated_at: ANTES }
    ],
    _seq: { v: 2, a: 5, p: 21 }
  });
  const nuevo = '2026-09-10T00:00:00.000Z';
  mockRemote.tables.vehiculos = conEmpresa([{ id: 1, nombre: 'C' }]);
  mockRemote.tables.alumnos = conEmpresa([
    { id: 1, nombre: 'Ana María', permiso: 'B', vehiculo_id: 1, updated_at: nuevo },  // editado en el otro PC
    { id: 2, nombre: 'Luis', permiso: 'B', vehiculo_id: 1, deleted: true, updated_at: nuevo }, // borrado allí
    { id: 3, nombre: 'Nuevo', permiso: 'B', vehiculo_id: 1, updated_at: nuevo },      // creado allí
    { id: 4, nombre: 'Igual', permiso: 'B', vehiculo_id: 1, updated_at: nuevo }       // ya lo tenemos igual
  ]);
  mockRemote.tables.practicas = conEmpresa([
    { id: 10, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 0, km_final: 15, updated_at: nuevo },
    { id: 11, alumno_id: 3, vehiculo_id: 1, fecha: '2026-09-04', km_inicial: 30, km_final: 40, updated_at: nuevo },
    { id: 12, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-02', km_inicial: 10, km_final: 20, deleted: true, updated_at: nuevo }
  ]);
  escribirCola();

  const res = await sync.sync();
  expect(res.ok).toBe(true);
  const d = readData();
  expect(d.alumnos.map(a => [a.id, a.nombre]).sort()).toEqual([[1, 'Ana María'], [3, 'Nuevo'], [4, 'Igual']]);
  expect(d.practicas.map(p => [p.id, p.km_final]).sort((a, b) => a[0] - b[0])).toEqual([[10, 15], [11, 40]]); // la 20 se va con su alumno, la 12 borrada
  // De alumnos solo se descargan enteros el editado y el nuevo (no el borrado ni el que ya estaba igual).
  expect(filasCompletasBajadas('alumnos')).toBe(2);
  expect(filasCompletasBajadas('practicas')).toBe(2);
});

test('si hay mucho que bajar (importación hecha en otro PC) se baja todo por páginas', async () => {
  conSesion();
  writeData({ vehiculos: [{ id: 1, nombre: 'C', matricula: '', km_actual: 0 }], alumnos: [], practicas: [], _seq: { v: 2, a: 1, p: 1 } });
  mockRemote.maxRows = 1000;
  mockRemote.tables.vehiculos = conEmpresa([{ id: 1, nombre: 'C' }]);
  mockRemote.tables.alumnos = conEmpresa(rango(1, 2500).map(id => ({ id, nombre: 'A' + id, permiso: 'B', vehiculo_id: 1, updated_at: '2026-09-10T00:00:00.000Z' })));
  escribirCola();

  const res = await sync.sync();
  expect(res.ok).toBe(true);
  expect(readData().alumnos).toHaveLength(2500);
  expect(res.pulled).toBe(2500);
  // Por páginas de 1.000 (3 peticiones), no 13 de 200 ids.
  expect(peticiones('select', 'alumnos').filter(r => r.cols === '*').length).toBeLessThanOrEqual(3);
});

test('«Subir todo» sube en trozos y borra en bloques', async () => {
  conSesion();
  const alumnos = rango(1, 450).map(id => ({ id, nombre: 'A' + id, permiso: 'B', vehiculo_id: 1 }));
  writeData({ vehiculos: [{ id: 1, nombre: 'C', matricula: '', km_actual: 0 }], alumnos, practicas: [], _seq: { v: 2, a: 1001, p: 1 } });
  mockRemote.tables.alumnos = conEmpresa(rango(501, 450).map(id => ({ id, nombre: 'Viejo ' + id, permiso: 'B', vehiculo_id: 1 })));
  escribirCola({ deleted: { alumnos: rango(501, 450) } });

  const res = await sync.pushAll();
  expect(res.ok).toBe(true);
  expect(peticiones('upsert', 'alumnos').length).toBe(3);
  expect(peticiones('update', 'alumnos').length).toBeLessThanOrEqual(3);
  expect(mockRemote.tables.alumnos.filter(a => !a.deleted)).toHaveLength(450);
  expect(mockRemote.tables.alumnos.filter(a => a.deleted)).toHaveLength(450);
  expect(readPending().deleted.alumnos).toEqual([]);
});
