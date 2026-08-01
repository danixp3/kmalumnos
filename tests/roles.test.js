// Tests del sistema de roles (jefe/empleado, fase 2 multi-empresa) en sync.js.
// La migración migraciones/2026-08-01_roles_y_sucursales.sql (tabla `perfiles`)
// TODAVÍA NO está aplicada en producción: estos tests comprueban, con un
// Supabase simulado, que:
//   - sin la migración aplicada la app se comporta EXACTAMENTE como hoy
//     ("modo clásico": rol efectivo siempre 'jefe', nada se oculta);
//   - con la migración aplicada, el rol real (jefe/empleado) se detecta bien;
//   - un empleado sin acceso a `pagos` (RLS) no rompe el resto del sync;
//   - invitarEmpleado da un mensaje claro si el email no tiene cuenta.
// Nunca se conecta a la base de datos real.
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

function baseData(extra = {}) {
  return {
    vehiculos: [{ id: 1, nombre: 'Coche 1', matricula: '', km_actual: 200 }],
    alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1 }],
    practicas: [],
    logs: [],
    _seq: { v: 2, a: 2, p: 2 },
    ...extra
  };
}

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null); // limpiar credenciales, cliente y perfil cacheados entre tests
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.lastLogin = null;
  mockRemote.authUserId = undefined;
  mockRemote.tablasInexistentes = [];
  mockRemote.rpcHandlers = {};
  mockRemote.rpcErrores = {};
  mockRemote.tables = {
    meta: [{ key: 'ping' }],
    vehiculos: [],
    alumnos: [],
    practicas: [],
    profesores: [],
    tarifas: [],
    pagos: [],
    perfiles: []
  };
});

describe('getPerfilActual() — detección de rol y compatibilidad hacia atrás', () => {
  test('modo clásico: sin credenciales, disponible=false y rol efectivo "jefe"', async () => {
    const perfil = await sync.getPerfilActual();
    expect(perfil).toEqual({ disponible: false, rol: 'jefe' });
  });

  test('modo clásico: migración no aplicada (tabla perfiles no existe) -> disponible=false, rol "jefe", nunca al revés', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tablasInexistentes = ['perfiles']; // simula que la migración aún no se ha aplicado
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync(); // fuerza el login y resuelve _empresaId (uid)

    const perfil = await sync.getPerfilActual();

    expect(perfil.disponible).toBe(false);
    expect(perfil.rol).toBe('jefe'); // nada se oculta en modo clásico
  });

  test('rol jefe: con la migración aplicada y una fila propia en perfiles, se detecta disponible=true y rol "jefe"', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' }
    ];
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();

    const perfil = await sync.getPerfilActual();

    expect(perfil).toMatchObject({ disponible: true, rol: 'jefe', empresa_id: 'uid-jefe' });
  });

  test('rol empleado: con la migración aplicada y perfil de empleado, se detecta disponible=true y rol "empleado"', async () => {
    mockRemote.authUserId = 'uid-empleado';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-empleado', empresa_id: 'uid-jefe', rol: 'empleado', sucursal_id: null, nombre: 'Un Empleado' }
    ];
    sync.setCredentials('empleado@empresa.com', 'secreta');
    await sync.sync();

    const perfil = await sync.getPerfilActual();

    expect(perfil).toMatchObject({ disponible: true, rol: 'empleado', empresa_id: 'uid-jefe' });
  });

  test('el perfil se cachea en memoria durante la sesión: una sola consulta a perfiles por sesión', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' }
    ];
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();

    await sync.getPerfilActual();
    // Borrar la fila remota no cambia el resultado: se sirve desde la caché
    mockRemote.tables.perfiles = [];
    const perfil2 = await sync.getPerfilActual();

    expect(perfil2.rol).toBe('jefe');
  });

  test('la caché se invalida al cambiar de credenciales (setCredentials)', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' }
    ];
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();
    await sync.getPerfilActual();

    sync.setCredentials(null, null); // logout: vuelve a modo legado

    const perfil = await sync.getPerfilActual();
    expect(perfil).toEqual({ disponible: false, rol: 'jefe' });
  });
});

describe('sync() tolera que "pagos" falle por permisos (RLS) para un empleado', () => {
  test('un error al SUBIR pagos no rompe el resto del sync ni deja la cola de pagos atascada', async () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPago(aid, '2026-07-01', 50, 'Pago'); // esto marca pagos como pendiente de subir
    db.addPractica(aid, vid, '2026-07-01', 0, 40); // esto sí debe subir con normalidad

    // Simula que Supabase deniega la tabla pagos a este usuario (RLS tras la
    // migración de roles) con un fallo real a mitad de la operación (no solo
    // un error controlado): el hook _onUpsert del mock lanza para esa tabla.
    mockRemote._onUpsert = (table) => {
      if (table === 'pagos') throw new Error('permission denied for table pagos');
    };

    const res = await sync.sync();

    expect(res.ok).toBe(true); // el sync global no falla
    expect(mockRemote.tables.vehiculos).toHaveLength(1); // el resto sí se subió
    expect(mockRemote.tables.practicas).toHaveLength(1);

    const pendingFile = path.join(userDataDir, 'pending_sync.json');
    const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
    expect(pending.pagos).toHaveLength(0); // la cola de pagos no se queda atascada reintentando
  });

  test('un error al BAJAR pagos no rompe el resto de la bajada', async () => {
    writeData(baseData());
    mockRemote.tables.vehiculos.push({
      id: 2, nombre: 'Coche 2', matricula: '', km_actual: 0,
      deleted: false, updated_at: new Date().toISOString()
    });

    // El mock devuelve error de permisos ante cualquier consulta a pagos,
    // simulando la tabla como "inexistente" (mismo mecanismo que usa "modo
    // clásico" para perfiles: cualquier error de PostgREST sobre esa tabla se
    // trata igual, venga de RLS o de una relación inexistente).
    mockRemote.tablasInexistentes = ['pagos'];

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.pulled).toBeGreaterThan(0); // el vehículo nuevo sí bajó
  });
});

describe('invitarEmpleado()', () => {
  test('con email no registrado, devuelve un error claro pidiendo crear la cuenta primero', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' }
    ];
    mockRemote.rpcHandlers.buscar_uid_por_email = () => null; // el email no tiene cuenta
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();

    const res = await sync.invitarEmpleado('nadie@empresa.com', 'empleado', null);

    expect(res.ok).toBe(false);
    expect(res.msg).toMatch(/no tiene todavía una cuenta|registre/i);
  });

  test('con email registrado, da de alta al empleado en perfiles', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' }
    ];
    mockRemote.rpcHandlers.buscar_uid_por_email = () => 'uid-nuevo-empleado';
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();

    const res = await sync.invitarEmpleado('nuevo@empresa.com', 'empleado', null);

    expect(res.ok).toBe(true);
    const fila = mockRemote.tables.perfiles.find(p => p.user_id === 'uid-nuevo-empleado');
    expect(fila).toMatchObject({ empresa_id: 'uid-jefe', rol: 'empleado' });
  });

  test('sin la migración aplicada, devuelve un mensaje claro en vez de intentar la llamada', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tablasInexistentes = ['perfiles'];
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();

    const res = await sync.invitarEmpleado('nuevo@empresa.com', 'empleado', null);

    expect(res.ok).toBe(false);
    expect(res.msg).toMatch(/no está disponible/i);
  });

  test('un empleado no puede invitar a otros', async () => {
    mockRemote.authUserId = 'uid-empleado';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-empleado', empresa_id: 'uid-jefe', rol: 'empleado', sucursal_id: null, nombre: 'Un Empleado' }
    ];
    sync.setCredentials('empleado@empresa.com', 'secreta');
    await sync.sync();

    const res = await sync.invitarEmpleado('otro@empresa.com', 'empleado', null);

    expect(res.ok).toBe(false);
    expect(res.msg).toMatch(/solo el jefe/i);
  });
});

describe('listarEmpleados() / cambiarRolEmpleado() / quitarEmpleado()', () => {
  test('listarEmpleados devuelve las filas de la empresa del jefe', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' },
      { user_id: 'uid-empleado', empresa_id: 'uid-jefe', rol: 'empleado', sucursal_id: null, nombre: 'Un Empleado' }
    ];
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();

    const res = await sync.listarEmpleados();

    expect(res.ok).toBe(true);
    expect(res.empleados).toHaveLength(2);
  });

  test('cambiarRolEmpleado actualiza el rol en perfiles', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' },
      { user_id: 'uid-empleado', empresa_id: 'uid-jefe', rol: 'empleado', sucursal_id: null, nombre: 'Un Empleado' }
    ];
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();

    const res = await sync.cambiarRolEmpleado('uid-empleado', 'jefe');

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.perfiles.find(p => p.user_id === 'uid-empleado').rol).toBe('jefe');
  });

  test('quitarEmpleado borra la fila de perfiles', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' },
      { user_id: 'uid-empleado', empresa_id: 'uid-jefe', rol: 'empleado', sucursal_id: null, nombre: 'Un Empleado' }
    ];
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();

    const res = await sync.quitarEmpleado('uid-empleado');

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.perfiles.find(p => p.user_id === 'uid-empleado')).toBeUndefined();
  });
});
