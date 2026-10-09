// Enlace para que el alumno firme desde su móvil las clases que se quedaron sin
// firmar (2026-10-09): qué clases se ofrecen (db.getClasesSinFirma), cómo se
// crea el enlace (sync.crearEnlaceFirma: sube antes lo pendiente y solo manda a
// la nube la huella del código) y que la firma llega a este PC aunque la clase
// se cambiara aquí justo antes de subirla (antes se perdía).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const leerData = () => JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
const EMPRESA = 'uid-jefe';
const FIRMA = 'data:image/png;base64,FIRMADA';

function datos() {
  const p = (id, fecha, ki, kf, extra = {}) => ({ id, alumno_id: 1, vehiculo_id: 1, fecha, hora_inicio: '10:00', km_inicial: ki, km_final: kf, profesor_id: 1, ...extra });
  return {
    vehiculos: [{ id: 1, nombre: 'Ibiza', matricula: '4821LKM', km_actual: 1200 }],
    profesores: [{ id: 1, nombre: 'Javier' }], tarifas: [], pagos: [], logs: [], sucursales: [],
    alumnos: [{ id: 1, nombre: 'Lucía', primer_apellido: 'Martín', permiso: 'B', vehiculo_id: 1, profesor_id: 1, telefono: '600111222' }],
    practicas: [
      p(1, '2026-09-01', 0, 0, { tipo_detalle: 'anterior' }),            // anterior a la app, sin km
      p(2, '2026-09-02', 1000, 1030, { procedencia: 'Ariauto' }),        // traída de otro programa
      p(3, '2026-10-01', 1030, 1060),                                     // olvidada: se ofrece y va marcada
      p(4, '2026-10-02', 1060, 1090, { firma: FIRMA }),                   // ya firmada: no sale
      p(5, '2026-10-03', 0, 0),                                           // circulación sin km: sale, sin poder marcarla
      p(6, '2026-10-04', 0, 0, { tipo: 'pista' }),                        // pista sin km: se puede firmar
      p(7, '2026-10-05', 1090, 0)                                         // sin cerrar (km final pendiente): no sale
    ],
    _seq: { v: 2, a: 2, p: 8, pf: 2, t: 1, pg: 1, suc: 1 }
  };
}

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  Object.assign(mockRemote, { online: true, authOk: true, authUserId: undefined, tablasInexistentes: [], columnasInexistentes: {}, rpcHandlers: {}, rpcErrores: {}, _onUpsert: undefined });
  mockRemote.tables = { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [] };
});

test('getClasesSinFirma: ofrece las cerradas sin firma; marca las olvidadas y no las anteriores ni las traídas', () => {
  writeData(datos());
  const r = db.getClasesSinFirma(1, '2026-10-09');
  expect(r.alumno).toMatchObject({ id: 1, nombre: 'Lucía', telefono: '600111222' });
  const porId = Object.fromEntries(r.clases.map(c => [c.id, c]));
  expect(Object.keys(porId).map(Number).sort()).toEqual([1, 2, 3, 5, 6]);   // ni la firmada (4) ni la sin cerrar (7)
  expect(porId[3]).toMatchObject({ firmable: true, sugerida: true, n: 3 });
  expect(porId[6]).toMatchObject({ firmable: true, sugerida: true });       // pista sin km
  expect(porId[5]).toMatchObject({ firmable: false, sugerida: false });     // circulación sin km
  expect(porId[1]).toMatchObject({ anterior: true, sugerida: false });
  expect(porId[2]).toMatchObject({ procedencia: 'Ariauto', firmable: true, sugerida: false });
  expect(r.clases[0].id).toBe(6);                                            // la más reciente primero
  expect(db.getClasesSinFirma(99)).toBeNull();
});

test('crearEnlaceFirma: sin cuenta de la autoescuela no crea nada', async () => {
  writeData(datos());
  const r = await sync.crearEnlaceFirma({ alumno_id: 1, practica_ids: [3] });
  expect(r.ok).toBe(false);
  expect(r.msg).toMatch(/cuenta/i);
});

test('crearEnlaceFirma: sube antes las clases pendientes y a la nube solo va la huella del código', async () => {
  mockRemote.authUserId = EMPRESA;
  sync.setCredentials('jefe@test.com', 'password123');
  writeData(datos());
  sync.markDirty('vehiculos', 1); sync.markDirty('alumnos', 1); sync.markDirty('practicas', 3);
  let recibido = null, practicasEnNube = null;
  mockRemote.rpcHandlers.crear_enlace_firma = p => {
    recibido = p;
    practicasEnNube = mockRemote.tables.practicas.map(x => x.id);
    return { ok: true, id: 1, n: 1, practica_ids: [3], caduca: '2026-10-16T10:00:00Z', faltan: [] };
  };
  const r = await sync.crearEnlaceFirma({ alumno_id: 1, practica_ids: [3, 3, 'x'], dias: 50 });
  expect(r.ok).toBe(true);
  expect(practicasEnNube).toContain(3);                 // la clase ya estaba en la nube al crear el enlace
  const codigo = r.url.split('/f/')[1];
  expect(r.url).toMatch(/^https:\/\/aulamovil\.vercel\.app\/f\/[A-Za-z0-9_-]{24}$/);
  expect(recibido.p_token_hash).toBe(crypto.createHash('sha256').update(codigo).digest('hex'));
  expect(JSON.stringify(recibido)).not.toContain(codigo);
  expect(recibido).toMatchObject({ p_alumno_id: 1, p_practica_ids: [3], p_dias: 30 });
});

test('crearEnlaceFirma: dice qué pasa si la nube no tiene la función o no hay nada que firmar', async () => {
  mockRemote.authUserId = EMPRESA;
  sync.setCredentials('jefe@test.com', 'password123');
  writeData(datos());
  mockRemote.rpcHandlers.crear_enlace_firma = () => ({ ok: false, codigo: 'nada_que_firmar', faltan: [3] });
  const a = await sync.crearEnlaceFirma({ alumno_id: 1, practica_ids: [3] });
  expect(a).toMatchObject({ ok: false, codigo: 'nada_que_firmar' });
  mockRemote.rpcHandlers = {};
  mockRemote.rpcErrores = { crear_enlace_firma: 'Could not find the function public.crear_enlace_firma' };
  const b = await sync.crearEnlaceFirma({ alumno_id: 1, practica_ids: [3] });
  expect(b.ok).toBe(false);
  expect(b.msg).toMatch(/todavía no admite enlaces/);
});

test('sync: una firma hecha en la nube llega aunque la clase se cambiara aquí antes de subirla', async () => {
  mockRemote.authUserId = EMPRESA;
  sync.setCredentials('jefe@test.com', 'password123');
  writeData(datos());
  sync.markDirty('vehiculos', 1); sync.markDirty('alumnos', 1); sync.markDirty('practicas', 3);
  expect((await sync.sync()).ok).toBe(true);
  // El alumno firma con el enlace (la nube pone firma y updated_at)...
  const enNube = mockRemote.tables.practicas.find(p => p.id === 3);
  Object.assign(enNube, { firma: FIRMA, updated_at: new Date(Date.now() - 1000).toISOString() });
  // ...y a la vez la oficina cambia esa clase aquí (p. ej. cuadra los km): su subida gana el updated_at
  const d = leerData();
  Object.assign(d.practicas.find(p => p.id === 3), { km_final: 1061, updated_at: new Date().toISOString() });
  writeData(d);
  sync.markDirty('practicas', 3);
  const avisos = [];
  sync.onDatosNuevos(info => avisos.push(info));
  expect((await sync.sync()).ok).toBe(true);
  const local = leerData().practicas.find(p => p.id === 3);
  expect(local.firma).toBe(FIRMA);            // antes se quedaba sin firma para siempre en este PC
  expect(local.km_final).toBe(1061);          // y el cambio de aquí se mantiene
  expect(mockRemote.tables.practicas.find(p => p.id === 3).firma).toBe(FIRMA);
  expect(avisos.some(a => a.firmas === 1)).toBe(true);
  sync.onDatosNuevos(null);
  // El siguiente sync no la vuelve a traer
  const avisos2 = [];
  sync.onDatosNuevos(info => avisos2.push(info));
  expect((await sync.sync()).ok).toBe(true);
  expect(avisos2).toEqual([]);
  sync.onDatosNuevos(null);
});

test('sync: la firma que llega del móvil o del enlace a una clase que ya estaba aquí cuenta como firma, no como clase nueva', async () => {
  mockRemote.authUserId = EMPRESA;
  sync.setCredentials('jefe@test.com', 'password123');
  writeData(datos());
  sync.markDirty('vehiculos', 1); sync.markDirty('alumnos', 1); sync.markDirty('practicas', 3);
  expect((await sync.sync()).ok).toBe(true);
  Object.assign(mockRemote.tables.practicas.find(p => p.id === 3), { firma: FIRMA, updated_at: new Date(Date.now() + 5000).toISOString() });
  const avisos = [];
  sync.onDatosNuevos(info => avisos.push(info));
  expect((await sync.sync()).ok).toBe(true);
  sync.onDatosNuevos(null);
  expect(leerData().practicas.find(p => p.id === 3).firma).toBe(FIRMA);
  expect(avisos).toEqual([expect.objectContaining({ firmas: 1, practicas: 0 })]);
});

test('listarEnlacesFirma y anularEnlaceFirma: leen y anulan los enlaces de la empresa', async () => {
  mockRemote.authUserId = EMPRESA;
  sync.setCredentials('jefe@test.com', 'password123');
  writeData(datos());
  mockRemote.tables.enlaces_firma = [
    { id: 1, empresa_id: EMPRESA, alumno_id: 1, creado: '2026-10-08T10:00:00Z', caduca: '2026-10-15T10:00:00Z', practica_ids: [3], firmadas: [] },
    { id: 2, empresa_id: 'otra', alumno_id: 1, creado: '2026-10-08T10:00:00Z', caduca: '2026-10-15T10:00:00Z', practica_ids: [9], firmadas: [] }
  ];
  const l = await sync.listarEnlacesFirma(1);
  expect(l.ok).toBe(true);
  expect(l.enlaces.map(e => e.id)).toEqual([1]);
  expect((await sync.anularEnlaceFirma(1)).ok).toBe(true);
  expect(mockRemote.tables.enlaces_firma[0].anulado).toBeTruthy();
  expect(mockRemote.tables.enlaces_firma[1].anulado).toBeUndefined();
  mockRemote.tablasInexistentes = ['enlaces_firma'];
  const sinTabla = await sync.listarEnlacesFirma(1);
  expect(sinTabla.ok).toBe(false);
  expect(sinTabla.msg).toMatch(/todavía no admite enlaces/);
});
