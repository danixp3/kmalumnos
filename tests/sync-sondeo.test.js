// Sondeo rápido: «casi en vivo». Cada pocos segundos se pregunta a la nube cuál
// es la última modificación de las tablas que escribe la web y solo si cambió
// algo se lanza el sync completo. Supabase simulado, sin red.
const mockRemote = { online: true, tables: {} };

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./mocks/fake-supabase')(mockRemote)
}));

const db = require('../db');
const sync = require('../sync');
const { resetData } = require('./helpers');

const ahoraMas = ms => new Date(Date.now() + ms).toISOString();

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.registro = null;
  mockRemote.tables = { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], tarifas: [], pagos: [], profesores: [], reservas: [] };
});

afterEach(() => { jest.restoreAllMocks(); });

// Tras subir sus propios cambios el ordenador ve «novedades» una vez más (son suyas): con otra vuelta queda quieto
async function sondearHastaQuieto() {
  for (let i = 0; i < 4; i++) { const r = await sync.sondearNube(); if (!r.novedades) return r; }
  throw new Error('el sondeo no se estabiliza');
}

function clasePorMovil(id, alumno_id, vehiculo_id, extra = {}) {
  return { id, alumno_id, vehiculo_id, fecha: '2026-10-07', km_inicial: '100', km_final: '130', nota: '', deleted: false, source: 'web-remote', updated_at: ahoraMas(1000), ...extra };
}

test('la primera vez no hay punto de comparación: baja y lo deja anotado', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  db.addAlumno('Ana', 'B', vid);
  const espia = jest.spyOn(sync, 'sync');

  const r = await sync.sondearNube();

  expect(r.ok).toBe(true);
  expect(r.novedades).toBe(true);
  expect(espia).toHaveBeenCalledTimes(1);
});

test('sin nada nuevo en la nube NO se lanza el sync completo (solo unas consultas ligeras)', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  await sondearHastaQuieto();             // fija el punto de partida
  const espia = jest.spyOn(sync, 'sync');
  mockRemote.registro = [];

  const r = await sync.sondearNube();

  expect(r).toMatchObject({ ok: true, novedades: false });
  expect(espia).not.toHaveBeenCalled();
  // Una consulta por tabla vigilada y ninguna escritura
  expect(mockRemote.registro.length).toBe(4);
  expect(mockRemote.registro.every(x => x.op === 'select')).toBe(true);
  expect(aid).toBeGreaterThan(0);
});

test('una clase guardada en el móvil se detecta y llega al ordenador sin pulsar Sincronizar', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  await sondearHastaQuieto();

  mockRemote.tables.practicas.push(clasePorMovil(900, aid, vid));
  const r = await sync.sondearNube();

  expect(r).toMatchObject({ ok: true, novedades: true });
  expect(db.getPracticasByAlumno(aid).some(p => p.id === 900)).toBe(true);
  // y la siguiente pregunta ya no encuentra nada nuevo
  const espia = jest.spyOn(sync, 'sync');
  expect(await sync.sondearNube()).toMatchObject({ novedades: false });
  expect(espia).not.toHaveBeenCalled();
});

test('un alumno dado de alta en la web también se detecta', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  db.addAlumno('Ana', 'B', vid);
  await sondearHastaQuieto();

  mockRemote.tables.alumnos.push({ id: 700, nombre: 'Luis', permiso: 'B', vehiculo_id: vid, deleted: false, updated_at: ahoraMas(1000) });
  const r = await sync.sondearNube();

  expect(r.novedades).toBe(true);
  expect(db.getAlumnos().some(a => a.id === 700)).toBe(true);
});

test('el aviso de datos nuevos dice cuántas clases llegaron', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  await sync.sync();
  const avisos = [];
  sync.onDatosNuevos(info => avisos.push(info));

  mockRemote.tables.practicas.push(clasePorMovil(901, aid, vid), clasePorMovil(902, aid, vid, { km_inicial: '130', km_final: '160' }));
  const res = await sync.sync();
  sync.onDatosNuevos(null);

  expect(res.pulled).toBe(2);
  expect(avisos).toEqual([{ pulled: 2, practicas: 2, firmas: 0 }]);
});

test('un sync que no trae nada no avisa a la pantalla', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  db.addAlumno('Ana', 'B', vid);
  await sync.sync();
  const avisos = [];
  sync.onDatosNuevos(info => avisos.push(info));

  await sync.sync();
  sync.onDatosNuevos(null);

  expect(avisos).toEqual([]);
});

test('sin internet el sondeo no falla ni da nada por visto: al volver la conexión recoge lo pendiente', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  await sondearHastaQuieto();

  mockRemote.tables.practicas.push(clasePorMovil(903, aid, vid));
  mockRemote.online = false;
  const caido = await sync.sondearNube();
  expect(caido.ok).toBe(false);
  expect(db.getPracticasByAlumno(aid).some(p => p.id === 903)).toBe(false);

  mockRemote.online = true;
  const r = await sync.sondearNube();
  expect(r.novedades).toBe(true);
  expect(db.getPracticasByAlumno(aid).some(p => p.id === 903)).toBe(true);
});

test('una tabla que aún no existe en la nube (sin migrar) no rompe el sondeo', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  delete mockRemote.tables.reservas;
  await sondearHastaQuieto();

  mockRemote.tables.practicas.push(clasePorMovil(904, aid, vid));
  const r = await sync.sondearNube();

  expect(r.ok).toBe(true);
  expect(db.getPracticasByAlumno(aid).some(p => p.id === 904)).toBe(true);
});

test('no se solapa con un sync que ya está en marcha', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  db.addAlumno('Ana', 'B', vid);
  const enMarcha = sync.sync();

  const r = await sync.sondearNube();
  await enMarcha;

  expect(r.ocupado).toBe(true);
});

test('sondearAhora no hace nada si el auto-sync no está en marcha (app aún sin arrancar, tests)', async () => {
  const r = await sync.sondearAhora();
  expect(r).toMatchObject({ ok: false, motivo: 'inactivo' });
});
