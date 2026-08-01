// Tests de sucursales (sedes de la autoescuela, fase 2 multi-empresa junto con
// roles.test.js). La migración migraciones/2026-08-01_roles_y_sucursales.sql
// TODAVÍA NO está aplicada en producción: estos tests comprueban que, sin
// ella, la app funciona EXACTAMENTE como hoy (modo clásico: todo visible,
// sin filtrar, el sync no falla), y que con datos locales el CRUD y el
// filtrado por sucursal funcionan bien capa por capa (db/, sync.js).
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

// getDatosGraficos()/getStatsDashboard() trabajan sobre el mes actual real
// (no una fecha fija): las prácticas de estos tests se registran "hoy" para
// que caigan siempre dentro de la ventana de meses consultada.
function hoy() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.lastLogin = null;
  mockRemote.authUserId = undefined;
  mockRemote.tablasInexistentes = [];
  mockRemote.rpcHandlers = {};
  mockRemote.rpcErrores = {};
  mockRemote.tables = {
    meta: [{ key: 'ping' }],
    vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [],
    sucursales: []
  };
});

describe('CRUD local de sucursales', () => {
  test('alta, listado y renombrado', () => {
    const id = db.addSucursal('Sede Centro');
    expect(db.getSucursales()).toEqual([{ id, nombre: 'Sede Centro', activa: true }]);

    db.renombrarSucursal(id, 'Sede Centro (renombrada)');
    expect(db.getSucursales()[0].nombre).toBe('Sede Centro (renombrada)');
  });

  test('activar/desactivar: no borra nada, solo deja de listarse con soloActivas=true', () => {
    const id = db.addSucursal('Sede Norte');
    expect(db.getSucursales(true)).toHaveLength(1);

    db.activarSucursal(id, false);
    expect(db.getSucursales(true)).toHaveLength(0);
    expect(db.getSucursales(false)).toHaveLength(1); // sigue existiendo
    expect(db.getSucursales(false)[0].activa).toBe(false);

    db.activarSucursal(id, true);
    expect(db.getSucursales(true)).toHaveLength(1);
  });

  test('sin ninguna sucursal dada de alta, getSucursales() devuelve []', () => {
    expect(db.getSucursales()).toEqual([]);
  });
});

describe('Modo clásico: sin filtro de sucursal, todo se ve igual que hoy', () => {
  test('getVehiculos/getAlumnos/getTodasPracticas sin sucursalId devuelven todo', () => {
    const v1 = db.addVehiculo('Coche 1', '', 100);
    const v2 = db.addVehiculo('Coche 2', '', 200);
    const a1 = db.addAlumno('Ana', 'B', v1);
    const a2 = db.addAlumno('Bea', 'B', v2);
    db.addPractica(a1, v1, '2026-07-01', 0, 40);
    db.addPractica(a2, v2, '2026-07-02', 0, 40);

    expect(db.getVehiculos()).toHaveLength(2);
    expect(db.getAlumnos()).toHaveLength(2);
    expect(db.getTodasPracticas()).toHaveLength(2);
  });

  test('getResumen/getStatsDashboard/getDatosGraficos sin sucursalId cuentan todo', () => {
    const v1 = db.addVehiculo('Coche 1', '', 100);
    const a1 = db.addAlumno('Ana', 'B', v1);
    db.addPractica(a1, v1, hoy(), 0, 40);

    expect(db.getResumen().vehiculos).toBe(1);
    expect(db.getResumen().alumnos).toBe(1);
    expect(db.getResumen().practicas).toBe(1);
    expect(db.getStatsDashboard(hoy()).practicasHoy).toBe(1);
    expect(db.getDatosGraficos(1).practicasPorMes[0].total).toBe(1);
  });
});

describe('Filtrado por sucursal', () => {
  function seed() {
    const sucA = db.addSucursal('Sede A');
    const sucB = db.addSucursal('Sede B');
    const vA = db.addVehiculo('Coche A', '', 100, sucA);
    const vB = db.addVehiculo('Coche B', '', 100, sucB);
    const vSinSede = db.addVehiculo('Coche sin sede', '', 100); // sucursal_id NULL
    const aA = db.addAlumno('Alumno A', 'B', vA, null, sucA);
    const aB = db.addAlumno('Alumno B', 'B', vB, null, sucB);
    const aSinSede = db.addAlumno('Alumno sin sede', 'B', vSinSede);
    // Las tres prácticas se registran "hoy" para caer en el mismo día (test de
    // getStatsDashboard) y en el mismo mes (test de getDatosGraficos).
    const pA = db.addPractica(aA, vA, hoy(), 0, 40, null, 'circulacion', sucA);
    const pB = db.addPractica(aB, vB, hoy(), 0, 40, null, 'circulacion', sucB);
    const pSinSede = db.addPractica(aSinSede, vSinSede, hoy(), 0, 40);
    return { sucA, sucB, vA, vB, vSinSede, aA, aB, aSinSede, pA, pB, pSinSede };
  }

  test('vehículos: cada sucursal ve solo los suyos, "Todas" los ve todos', () => {
    const { sucA } = seed();
    expect(db.getVehiculos().map(v => v.nombre).sort()).toEqual(['Coche A', 'Coche B', 'Coche sin sede'].sort());
    expect(db.getVehiculos(sucA).map(v => v.nombre)).toEqual(['Coche A']);
  });

  test('alumnos: filtrado igual que vehículos', () => {
    const { sucB } = seed();
    expect(db.getAlumnos(sucB).map(a => a.nombre)).toEqual(['Alumno B']);
  });

  test('prácticas (getTodasPracticas con filtros.sucursal_id)', () => {
    const { sucA } = seed();
    const res = db.getTodasPracticas({ sucursal_id: sucA });
    expect(res).toHaveLength(1);
    expect(res[0].alumno_nombre).toBe('Alumno A');
  });

  test('los registros con sucursal_id NULL aparecen siempre en "Todas" y en ninguna sucursal concreta', () => {
    const { sucA, sucB } = seed();
    // "Todas" (sin argumento) incluye el vehículo/alumno sin sede
    expect(db.getVehiculos().some(v => v.nombre === 'Coche sin sede')).toBe(true);
    expect(db.getAlumnos().some(a => a.nombre === 'Alumno sin sede')).toBe(true);
    // Ninguna sucursal concreta lo incluye
    expect(db.getVehiculos(sucA).some(v => v.nombre === 'Coche sin sede')).toBe(false);
    expect(db.getVehiculos(sucB).some(v => v.nombre === 'Coche sin sede')).toBe(false);
    expect(db.getAlumnos(sucA).some(a => a.nombre === 'Alumno sin sede')).toBe(false);
  });

  test('dashboard (getResumen/getStatsDashboard) respeta el filtro', () => {
    const { sucA } = seed();
    expect(db.getResumen(sucA)).toMatchObject({ vehiculos: 1, alumnos: 1, practicas: 1 });
    expect(db.getResumen()).toMatchObject({ vehiculos: 3, alumnos: 3, practicas: 3 });
    expect(db.getStatsDashboard(hoy(), sucA).practicasHoy).toBe(1);
    expect(db.getStatsDashboard(hoy()).practicasHoy).toBe(3); // las tres son "hoy"
  });

  test('gráficos (getDatosGraficos) respeta el filtro', () => {
    const { sucA } = seed();
    const todas = db.getDatosGraficos(1);
    const filtrado = db.getDatosGraficos(1, sucA);
    const totalTodas = todas.practicasPorMes.reduce((s, m) => s + m.total, 0);
    const totalFiltrado = filtrado.practicasPorMes.reduce((s, m) => s + m.total, 0);
    expect(totalTodas).toBe(3);
    expect(totalFiltrado).toBe(1);
  });

  test('deudas (getDeudas) filtra por sucursal del alumno', () => {
    const { sucA } = seed();
    expect(db.getDeudas(sucA)).toHaveLength(1);
    expect(db.getDeudas(sucA)[0].alumno_nombre).toBe('Alumno A');
    expect(db.getDeudas()).toHaveLength(3);
  });
});

describe('Sync: sucursales y sucursal_id no rompen nada sin la migración aplicada', () => {
  test('sync() con la tabla sucursales inexistente: no falla, no estampa sucursal_id, cola no queda atascada', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tablasInexistentes = ['sucursales']; // simula migración no aplicada
    sync.setCredentials('jefe@test.com', 'password123');

    writeData({
      vehiculos: [{ id: 1, nombre: 'Coche 1', matricula: '', km_actual: 100, sucursal_id: 5 }],
      alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [], sucursales: [], logs: [],
      _seq: { v: 2, a: 1, p: 1, pf: 1, t: 1, pg: 1, suc: 1 }
    });
    sync.markDirty('vehiculos', 1);

    const res = await sync.sync();
    expect(res.ok).toBe(true);
    // El vehículo se subió, pero sin sucursal_id (la columna no existe en el servidor)
    expect(mockRemote.tables.vehiculos).toHaveLength(1);
    expect(mockRemote.tables.vehiculos[0]).not.toHaveProperty('sucursal_id');

    // Un segundo sync (reintento) tampoco falla ni deja nada atascado
    const res2 = await sync.sync();
    expect(res2.ok).toBe(true);
  });

  test('sync() con la migración aplicada: sube y baja sucursal_id y la tabla sucursales', async () => {
    mockRemote.authUserId = 'uid-jefe';
    sync.setCredentials('jefe@test.com', 'password123');

    writeData({
      vehiculos: [{ id: 1, nombre: 'Coche 1', matricula: '', km_actual: 100, sucursal_id: 7 }],
      alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [],
      sucursales: [{ id: 7, nombre: 'Sede Centro', activa: true }],
      logs: [],
      _seq: { v: 2, a: 1, p: 1, pf: 1, t: 1, pg: 1, suc: 8 }
    });
    sync.markDirty('vehiculos', 1);
    sync.markDirty('sucursales', 7);

    const res = await sync.sync();
    expect(res.ok).toBe(true);
    expect(mockRemote.tables.vehiculos[0].sucursal_id).toBe(7);
    expect(mockRemote.tables.sucursales).toHaveLength(1);
    expect(mockRemote.tables.sucursales[0].nombre).toBe('Sede Centro');
  });

  test('pushAll() tampoco falla si el servidor no tiene la tabla/columna de sucursales', async () => {
    mockRemote.authUserId = 'uid-jefe';
    mockRemote.tablasInexistentes = ['sucursales'];
    sync.setCredentials('jefe@test.com', 'password123');

    writeData({
      vehiculos: [{ id: 1, nombre: 'Coche 1', matricula: '', km_actual: 100, sucursal_id: 3 }],
      alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [], sucursales: [], logs: [],
      _seq: { v: 2, a: 1, p: 1, pf: 1, t: 1, pg: 1, suc: 1 }
    });

    const res = await sync.pushAll();
    expect(res.ok).toBe(true);
    expect(mockRemote.tables.vehiculos[0]).not.toHaveProperty('sucursal_id');
  });
});
