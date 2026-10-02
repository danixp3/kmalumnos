// Varias cuentas en el mismo PC (sync.js, «DATOS LOCALES POR CUENTA»): al
// entrar con otra cuenta, sus datos locales se cambian por los de esa cuenta
// y los de la anterior quedan guardados en cuentas/<id>/, sin vaciar nada.
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
const ownerFile = path.join(userDataDir, 'local_empresa.json');
const leer = f => JSON.parse(fs.readFileSync(f, 'utf-8'));
const ahora = () => new Date().toISOString();

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.authUserId = undefined;
  mockRemote.rpcHandlers = undefined;
  mockRemote.tables = { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], tarifas: [], pagos: [] };
});

async function entrar(empresaId, email) {
  mockRemote.authUserId = empresaId;
  sync.setCredentials(email, 'buena');
  return sync.sync();
}

test('ir y volver entre dos cuentas: cada una recupera sus datos, lo que no se subió y lo que solo vive en el PC', async () => {
  // Cuenta de prueba trabajando sin conexión: un alumno sin subir y una jornada (solo local)
  await entrar('empresa-prueba', 'prueba@x.es');
  mockRemote.online = false;
  const aid = db.addAlumno('Alumno sin subir', 'B', null);
  db.ficharEntrada({ empleado: 'Dani' });
  expect(sync.contarPendientes()).toBeGreaterThan(0);
  mockRemote.online = true;
  sync.setCredentials(null, null); // cerrar sesión sin haber podido subirlo

  // La autoescuela tiene sus datos en la nube
  mockRemote.tables.alumnos.push({ id: 900, nombre: 'Alumna real', permiso: 'B', deleted: false, empresa_id: 'empresa-real', updated_at: ahora() });
  const r1 = await entrar('empresa-real', 'real@x.es');
  expect(r1.ok).toBe(true);
  expect(sync.getEstadoCuenta().conflictoEmpresa).toEqual({ emailAnterior: 'prueba@x.es', empresaAnterior: 'empresa-prueba' });

  const c1 = await sync.cambiarDatosDeCuenta({ km_centro_datos: '{"nombre":"Centro de prueba"}' });
  expect(c1).toMatchObject({ ok: true, nueva: true, email: 'real@x.es', emailAnterior: 'prueba@x.es', ajustesLocales: null });
  expect(sync.getEstadoCuenta().conflictoEmpresa).toBeNull();
  expect(leer(ownerFile)).toEqual({ empresaId: 'empresa-real', email: 'real@x.es' });
  let d = leer(dataFile);
  expect(d.alumnos.map(a => a.nombre)).toEqual(['Alumna real']); // nada de la cuenta de prueba
  expect(d.jornadas || []).toHaveLength(0);
  // Nada de la cuenta de prueba ha subido a la nube con la cuenta real
  expect(mockRemote.tables.alumnos.filter(a => a.empresa_id === 'empresa-real').map(a => a.id)).toEqual([900]);
  expect(sync.getCuentasGuardadas().map(c => [c.email, c.activa])).toEqual([['real@x.es', true], ['prueba@x.es', false]]);

  // Algo nuevo en la cuenta real
  db.addAlumno('Otra alumna real', 'B', null);
  await sync.sync();

  // Volver a la cuenta de prueba
  sync.setCredentials(null, null);
  await entrar('empresa-prueba', 'prueba@x.es');
  expect(sync.getEstadoCuenta().conflictoEmpresa).toEqual({ emailAnterior: 'real@x.es', empresaAnterior: 'empresa-real' });
  const c2 = await sync.cambiarDatosDeCuenta({});
  expect(c2).toMatchObject({ ok: true, nueva: false, ajustesLocales: { km_centro_datos: '{"nombre":"Centro de prueba"}' } });
  d = leer(dataFile);
  expect(d.alumnos.map(a => a.nombre)).toEqual(['Alumno sin subir']);
  expect(d.jornadas).toHaveLength(1);
  // Y lo que se quedó sin subir ya está en la nube, con su cuenta
  const subido = mockRemote.tables.alumnos.find(a => a.id === aid);
  expect(subido).toMatchObject({ nombre: 'Alumno sin subir', empresa_id: 'empresa-prueba' });
  expect(sync.contarPendientes()).toBe(0);

  // Y otra vez a la real: vuelve con su alumna nueva
  sync.setCredentials(null, null);
  await entrar('empresa-real', 'real@x.es');
  await sync.cambiarDatosDeCuenta({});
  expect(leer(dataFile).alumnos.map(a => a.nombre).sort()).toEqual(['Alumna real', 'Otra alumna real']);
});

test('una cuenta nueva en el PC sigue numerando por encima: este PC no repite ids entre sus cuentas', async () => {
  await entrar('empresa-prueba', 'prueba@x.es');
  for (let i = 0; i < 3; i++) db.addAlumno('A' + i, 'B', null);
  await sync.sync();
  const seqPrueba = leer(dataFile)._seq.a;
  sync.setCredentials(null, null);
  await entrar('empresa-real', 'real@x.es');
  await sync.cambiarDatosDeCuenta({});
  const id = db.addAlumno('Nueva en la real', 'B', null);
  expect(id).toBeGreaterThanOrEqual(seqPrueba);
});

test('un cambio de cuenta a medias (cierre brusco) se termina sin guardar encima de la copia buena', async () => {
  await entrar('empresa-prueba', 'prueba@x.es');
  db.addAlumno('De prueba', 'B', null);
  await sync.sync();
  sync.setCredentials(null, null);
  await entrar('empresa-real', 'real@x.es');
  await sync.cambiarDatosDeCuenta({});
  // Simula que, volviendo a la de prueba, la app se cerró justo después de guardar la real
  sync.setCredentials(null, null);
  const dirReal = path.join(userDataDir, 'cuentas', 'empresa-real');
  fs.mkdirSync(dirReal, { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'cambio_cuenta.json'), JSON.stringify({ de: 'empresa-real', a: 'empresa-prueba' }));
  fs.copyFileSync(dataFile, path.join(dirReal, 'data.json'));
  // Lo activo quedó a medias: ya es de la de prueba, aunque la dueña siga siendo la real
  fs.copyFileSync(path.join(userDataDir, 'cuentas', 'empresa-prueba', 'data.json'), dataFile);
  db._clearCache();
  await entrar('empresa-prueba', 'prueba@x.es');
  const c = await sync.cambiarDatosDeCuenta({});
  expect(c.ok).toBe(true);
  expect(leer(dataFile).alumnos.map(a => a.nombre)).toEqual(['De prueba']);
  // La copia de la real no se ha machacado con los datos de la de prueba
  expect(leer(path.join(dirReal, 'data.json')).alumnos.map(a => a.nombre)).toEqual([]);
  expect(fs.existsSync(path.join(userDataDir, 'cambio_cuenta.json'))).toBe(false);
});

test('sin conflicto de cuenta, cambiarDatosDeCuenta no hace nada', async () => {
  await entrar('empresa-prueba', 'prueba@x.es');
  db.addAlumno('Sigue aquí', 'B', null);
  const r = await sync.cambiarDatosDeCuenta({});
  expect(r.ok).toBe(false);
  expect(leer(dataFile).alumnos).toHaveLength(1);
});

test('ids_maximos: el contador local se pone por encima del mayor id de la nube de TODAS las cuentas', async () => {
  mockRemote.rpcHandlers = { ids_maximos: () => ({ alumnos: 94, practicas: 1450, vehiculos: 14, profesores: 20, cargos: 0 }) };
  await entrar('empresa-prueba', 'prueba@x.es');
  const s = leer(dataFile)._seq;
  expect([s.a, s.p, s.v, s.pf]).toEqual([95, 1451, 15, 21]);
  expect(db.addAlumno('Sin chocar', 'B', null)).toBe(95);
});

test('ids_maximos sin la migración aplicada: el sync sigue funcionando igual', async () => {
  await entrar('empresa-prueba', 'prueba@x.es'); // el mock responde «función no configurada»
  const id = db.addAlumno('Normal', 'B', null);
  const r = await sync.sync();
  expect(r.ok).toBe(true);
  expect(mockRemote.tables.alumnos.find(a => a.id === id)).toBeTruthy();
});
