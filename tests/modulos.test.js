// Tests de getModulosActivos() (sync.js) — cimiento de "módulos contratados
// por empresa" (entitlements), fase 0 del pivote a SaaS (ver ROADMAP-SAAS.md
// → Fase 0 · Bloque 1). La migración migraciones/2026-08-04_modulos_empresa.sql
// (tabla `modulos_empresa`) TODAVÍA NO está aplicada en producción, ni
// tampoco la de roles de la que depende (migraciones/2026-08-01_roles_y_
// sucursales.sql): estos tests comprueban, con un Supabase simulado, que:
//   - sin la migración de roles aplicada (o sin sesión) se comporta como
//     "modo clásico" (disponible:false, modulos:{}), sin llegar a consultar
//     `modulos_empresa`;
//   - con la migración de roles aplicada pero SIN la de módulos, cualquier
//     error al consultar `modulos_empresa` también cae en modo clásico;
//   - con ambas migraciones aplicadas, las filas se parsean a un mapa
//     modulo -> activo;
//   - el resultado se cachea en memoria durante la sesión.
// Nunca se conecta a la base de datos real.
const mockRemote = { online: true, tables: {} };

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./mocks/fake-supabase')(mockRemote)
}));

const db = require('../db');
const sync = require('../sync');
const { resetData } = require('./helpers');

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null); // limpiar credenciales, cliente y cachés entre tests
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.lastLogin = null;
  mockRemote.authUserId = undefined;
  mockRemote.tablasInexistentes = [];
  mockRemote.tables = {
    meta: [{ key: 'ping' }],
    vehiculos: [],
    alumnos: [],
    practicas: [],
    profesores: [],
    tarifas: [],
    pagos: [],
    perfiles: [],
    modulos_empresa: []
  };
});

describe('getModulosActivos() — entitlements por empresa, compatibilidad hacia atrás', () => {
  test('modo clásico: sin credenciales, disponible=false y modulos vacío', async () => {
    const res = await sync.getModulosActivos();
    expect(res).toEqual({ disponible: false, modulos: {} });
  });

  test('modo clásico: migración de roles no aplicada (tabla perfiles no existe) -> disponible=false', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tablasInexistentes = ['perfiles']; // simula que ni siquiera la migración de roles está aplicada
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync(); // fuerza el login y resuelve _empresaId (uid)

    const res = await sync.getModulosActivos();

    expect(res).toEqual({ disponible: false, modulos: {} });
  });

  test('la consulta a modulos_empresa falla (migración de módulos no aplicada, aunque sí la de roles) -> disponible=false', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' }
    ];
    mockRemote.tablasInexistentes = ['modulos_empresa']; // hay perfiles, pero no la tabla nueva
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();

    const res = await sync.getModulosActivos();

    expect(res).toEqual({ disponible: false, modulos: {} });
  });

  test('con ambas migraciones aplicadas, parsea las filas a un mapa modulo -> activo', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' }
    ];
    mockRemote.tables.modulos_empresa = [
      { empresa_id: 'uid-jefe', modulo: 'portal_alumno', activo: true, activado_en: '2026-08-04T00:00:00Z' },
      { empresa_id: 'uid-jefe', modulo: 'verifactu', activo: false, activado_en: '2026-08-04T00:00:00Z' },
      { empresa_id: 'otra-empresa', modulo: 'portal_alumno', activo: true, activado_en: '2026-08-04T00:00:00Z' }
    ];
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();

    const res = await sync.getModulosActivos();

    expect(res).toEqual({
      disponible: true,
      modulos: { portal_alumno: true, verifactu: false }
    });
  });

  test('el resultado se cachea en memoria durante la sesión: una sola consulta a modulos_empresa por sesión', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' }
    ];
    mockRemote.tables.modulos_empresa = [
      { empresa_id: 'uid-jefe', modulo: 'portal_alumno', activo: true, activado_en: '2026-08-04T00:00:00Z' }
    ];
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();

    await sync.getModulosActivos();
    // Borrar la fila remota no cambia el resultado: se sirve desde la caché.
    mockRemote.tables.modulos_empresa = [];
    const res2 = await sync.getModulosActivos();

    expect(res2).toEqual({ disponible: true, modulos: { portal_alumno: true } });
  });

  test('la caché se invalida al cambiar de credenciales (setCredentials)', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tables.perfiles = [
      { user_id: 'uid-jefe', empresa_id: 'uid-jefe', rol: 'jefe', sucursal_id: null, nombre: 'El Jefe' }
    ];
    mockRemote.tables.modulos_empresa = [
      { empresa_id: 'uid-jefe', modulo: 'portal_alumno', activo: true, activado_en: '2026-08-04T00:00:00Z' }
    ];
    sync.setCredentials('jefe@empresa.com', 'secreta');
    await sync.sync();
    await sync.getModulosActivos();

    sync.setCredentials(null, null); // logout: vuelve a modo legado

    const res = await sync.getModulosActivos();
    expect(res).toEqual({ disponible: false, modulos: {} });
  });
});
