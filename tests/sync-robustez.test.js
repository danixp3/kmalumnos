// Robustez de la sincronización (2026-10-01): lo que la nube rechaza no se
// pierde, la bajada pagina, lo que se toca durante un sync se respeta, los ids
// de la web no arrastran el contador local y la autorreparación reencola lo
// que falte en la nube. Siempre contra un Supabase simulado.
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

function writeData(data) { fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8'); db._clearCache(); }
const readData = () => JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
const readPending = () => JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
const conEmpresa = filas => filas.map(f => ({ empresa_id: EMPRESA, deleted: false, updated_at: '2026-09-01T00:00:00.000Z', ...f }));

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  Object.assign(mockRemote, { online: true, authOk: true, maxRows: undefined, upsertErrores: undefined, _onUpsert: undefined, authUserId: undefined, columnasInexistentes: undefined, tablasInexistentes: undefined });
  mockRemote.tables = { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], tarifas: [], pagos: [] };
});

test('si la nube rechaza un registro, se queda en la cola y el sync avisa; el resto sí sube', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const a1 = db.addAlumno('Ana', 'B', vid);
  const a2 = db.addAlumno('Luis', 'B', vid);
  mockRemote.upsertErrores = { alumnos: [a2] };

  const res = await sync.sync();
  expect(res.ok).toBe(false);
  expect(res.reason).toMatch(/no se pudieron subir/);
  expect(mockRemote.tables.alumnos.map(a => a.id)).toEqual([a1]);
  expect(readPending().alumnos).toEqual([a2]);

  // Cuando la nube lo acepta, sale de la cola.
  mockRemote.upsertErrores = undefined;
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.alumnos.map(a => a.id).sort()).toEqual([a1, a2]);
  expect(readPending().alumnos).toEqual([]);
});

test('la bajada pagina: con un límite de filas por respuesta baja todo igualmente', async () => {
  writeData({ vehiculos: [{ id: 1, nombre: 'C', matricula: '', km_actual: 0 }], alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1 }], practicas: [], logs: [], _seq: { v: 2, a: 2, p: 1 } });
  mockRemote.maxRows = 1000; // como max-rows de PostgREST en Supabase
  for (let i = 1; i <= 2500; i++) {
    mockRemote.tables.practicas.push({ id: i, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: i, km_final: i + 1, deleted: false, updated_at: '2026-09-01T00:00:00.000Z' });
  }
  const res = await sync.sync();
  expect(res.ok).toBe(true);
  expect(readData().practicas).toHaveLength(2500);
});

test('lo que se edita en local mientras corre el sync no se pierde ni deja de subirse', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  // Algo que bajar, para que el sync guarde data.json al terminar.
  mockRemote.tables.profesores = [{ id: 5, nombre: 'Profe remoto', deleted: false, updated_at: '2026-09-01T00:00:00.000Z' }];
  let editado = false;
  mockRemote._onUpsert = (tabla) => {
    if (tabla === 'alumnos' && !editado) {
      editado = true;
      db.updateAlumno(aid, 'Ana María', 'B', vid); // el usuario sigue trabajando
    }
  };
  expect((await sync.sync()).ok).toBe(true);
  const d = readData();
  expect(d.alumnos.find(a => a.id === aid).nombre).toBe('Ana María'); // no la pisa la copia del sync
  expect(d.profesores.map(p => p.id)).toContain(5);                    // y lo bajado también está
  expect(readPending().alumnos).toContain(aid);                        // la edición sigue pendiente de subir
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.alumnos.find(a => a.id === aid).nombre).toBe('Ana María');
});

test('los ids de la web (>= 1.000.000.000) no arrastran el contador local', async () => {
  writeData({ vehiculos: [{ id: 1, nombre: 'C', matricula: '', km_actual: 0 }], alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1 }], practicas: [], logs: [], _seq: { v: 2, a: 2, p: 10 } });
  mockRemote.tables.alumnos.push({ id: 1000000003, nombre: 'Web', permiso: 'B', vehiculo_id: 1, deleted: false, updated_at: '2026-09-01T00:00:00.000Z' });
  mockRemote.tables.practicas.push({ id: 1000000007, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 10, km_final: 50, deleted: false, updated_at: '2026-09-01T00:00:00.000Z' });
  expect((await sync.sync()).ok).toBe(true);
  const d = readData();
  expect(d.practicas.map(p => p.id)).toContain(1000000007);
  expect(d._seq.p).toBe(10);
  expect(d._seq.a).toBe(2);
});

test('un contador local que ya saltó al rango de la web se repara', async () => {
  writeData({ vehiculos: [], alumnos: [{ id: 4, nombre: 'Ana', permiso: 'B', vehiculo_id: null }], practicas: [{ id: 7, alumno_id: 4, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 0, km_final: 0 }, { id: 1000000001, alumno_id: 4, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 0, km_final: 0 }], logs: [], _seq: { v: 1, a: 5, p: 1000000002 } });
  mockRemote.tables.meta = [{ key: 'ping' }];
  mockRemote.tables.profesores = [{ id: 2, nombre: 'P', deleted: false, updated_at: '2026-09-01T00:00:00.000Z' }];
  await sync.sync();
  expect(readData()._seq.p).toBe(8);
});

test('la firma hecha en el móvil no se borra al subir una edición del escritorio que no la tiene', async () => {
  mockRemote.authUserId = EMPRESA;
  sync.setCredentials('jefe@test.com', 'password123');
  writeData({ vehiculos: [{ id: 1, nombre: 'C', matricula: '', km_actual: 0 }], alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1 }], practicas: [{ id: 3, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 10, km_final: 50, nota: 'vieja' }], logs: [], _seq: { v: 2, a: 2, p: 4 } });
  mockRemote.tables.vehiculos = conEmpresa([{ id: 1, nombre: 'C' }]);
  mockRemote.tables.alumnos = conEmpresa([{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1 }]);
  mockRemote.tables.practicas = conEmpresa([{ id: 3, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 10, km_final: 50, firma: 'data:image/png;base64,FIRMA' }]);
  // Primera vinculación ya hecha (no es lo que se prueba aquí).
  fs.writeFileSync(pendingFile, JSON.stringify({ vehiculos: [], profesores: [], alumnos: [], practicas: [3], tarifas: [], pagos: [], deleted: {}, lastSync: '2026-09-02T00:00:00.000Z', colisionesResueltas: { [EMPRESA]: true }, ultimaVerificacion: new Date().toISOString() }));
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.practicas[0].firma).toBe('data:image/png;base64,FIRMA');
});

test('autorreparación: lo que existe en local y falta en la nube vuelve a subirse', async () => {
  mockRemote.authUserId = EMPRESA;
  sync.setCredentials('jefe@test.com', 'password123');
  writeData({
    vehiculos: [{ id: 1, nombre: 'C', matricula: '', km_actual: 0 }],
    alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1 }, { id: 2, nombre: 'Perdido', permiso: 'B', vehiculo_id: 1 }],
    practicas: [{ id: 9, alumno_id: 2, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 0, km_final: 0 }],
    logs: [], _seq: { v: 2, a: 3, p: 10 }
  });
  mockRemote.tables.vehiculos = conEmpresa([{ id: 1, nombre: 'C' }]);
  mockRemote.tables.alumnos = conEmpresa([{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1 }]);
  fs.writeFileSync(pendingFile, JSON.stringify({ vehiculos: [], profesores: [], alumnos: [], practicas: [], tarifas: [], pagos: [], deleted: {}, lastSync: '2026-09-02T00:00:00.000Z', colisionesResueltas: { [EMPRESA]: true } }));

  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.alumnos.map(a => a.id).sort()).toEqual([1, 2]);
  expect(mockRemote.tables.practicas.map(p => p.id)).toEqual([9]);
  expect(readPending().ultimaVerificacion).toBeTruthy();
});

test('ajustes compartidos (zonas): se suben al guardarlos y se bajan si la nube tiene uno más nuevo', async () => {
  mockRemote.authUserId = EMPRESA;
  sync.setCredentials('jefe@test.com', 'password123');
  mockRemote.tables.ajustes_empresa = [];
  db.setZonasPractica(['Centro', 'Polígono']);
  const p = readPending();
  p.colisionesResueltas = { [EMPRESA]: true };
  fs.writeFileSync(pendingFile, JSON.stringify(p));
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.ajustes_empresa).toEqual([expect.objectContaining({ empresa_id: EMPRESA, clave: 'zonas', valor: ['Centro', 'Polígono'] })]);

  mockRemote.tables.ajustes_empresa[0] = { ...mockRemote.tables.ajustes_empresa[0], valor: ['Centro', 'Autovía'], updated_at: new Date(Date.now() + 60000).toISOString() };
  expect((await sync.sync()).ok).toBe(true);
  db._clearCache();
  expect(db.getZonasPractica()).toEqual(['Centro', 'Autovía']);
});

test('tras importar muchos datos, alumnos y prácticas suben por lotes (pocas peticiones) sin perder columnas', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const filas = ['Nombre;Apellidos;DNI'];
  for (let i = 0; i < 450; i++) filas.push(`Alumno${i};Prueba;`);
  const h = db.leerTextoTabla(filas.join('\n'));
  const det = db.detectarTablaMigracion(h, 'alumnos');
  expect(db.aplicarImportacion({ tipo: 'alumnos', filas: h.filas, numFila: h.numFila, filaCabecera: det.filaCabecera, mapeo: det.mapeo, opciones: { hoy: '2026-10-02' } }).ok).toBe(true);
  const ids = db.getAlumnos().map(a => a.id);
  ids.forEach((aid, i) => {
    db.addPractica(aid, vid, '2026-09-01', 1000 + i * 100, 1040 + i * 100);
    db.addPractica(aid, vid, '2026-09-02', 0, 0);
  });
  // Una práctica con un dato que nace en el móvil: va en su propio grupo
  const d = readData();
  const conDetalle = d.practicas[0];
  conDetalle.tipo_detalle = 'km_auto';
  writeData(d);
  mockRemote.peticionesUpsert = {};

  const res = await sync.sync();
  expect(res.ok).toBe(true);
  expect(mockRemote.tables.alumnos).toHaveLength(450);
  expect(mockRemote.tables.practicas).toHaveLength(900);
  expect(mockRemote.peticionesUpsert.alumnos).toBeLessThanOrEqual(3);
  expect(mockRemote.peticionesUpsert.practicas).toBeLessThanOrEqual(7);
  expect(mockRemote.tables.practicas.find(p => p.id === conDetalle.id).tipo_detalle).toBe('km_auto');
  expect(readPending().alumnos).toEqual([]);
  expect(readPending().practicas).toEqual([]);
});
