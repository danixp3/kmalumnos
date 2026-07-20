// Tests de la sincronización bidireccional (sync.js) contra un Supabase simulado.
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
const localEmpresaFile = path.join(userDataDir, 'local_empresa.json');

function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
  db._clearCache();
}

function readData() {
  return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
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
  sync.setCredentials(null, null); // limpiar credenciales y cliente cacheado entre tests
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.lastLogin = null;
  mockRemote.tables = {
    meta: [{ key: 'ping' }],
    vehiculos: [],
    alumnos: [],
    practicas: [],
    tarifas: [],
    pagos: []
  };
});

test('sin internet: sync no falla, avisa, y los cambios quedan encolados para más tarde', async () => {
  mockRemote.online = false;
  const vid = db.addVehiculo('Coche 1', '', 0); // esto marca el cambio como pendiente

  const res = await sync.sync();

  expect(res.ok).toBe(false);
  expect(sync.getStatus()).toBe('offline');
  const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
  expect(pending.vehiculos).toContain(vid);

  // Al volver la conexión, el cambio encolado se sube solo
  mockRemote.online = true;
  const res2 = await sync.sync();
  expect(res2.ok).toBe(true);
  expect(mockRemote.tables.vehiculos).toHaveLength(1);
  expect(mockRemote.tables.vehiculos[0]).toMatchObject({ id: vid, nombre: 'Coche 1' });
});

test('sube a la nube los cambios hechos en el escritorio y vacía la cola de pendientes', async () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 100);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addPractica(aid, vid, '2026-07-01', 100, 140);

  const res = await sync.sync();

  expect(res.ok).toBe(true);
  expect(mockRemote.tables.vehiculos).toHaveLength(1);
  expect(mockRemote.tables.alumnos).toHaveLength(1);
  expect(mockRemote.tables.practicas[0]).toMatchObject({
    id: pid, alumno_id: aid, vehiculo_id: vid, km_inicial: 100, km_final: 140, deleted: false
  });
  const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
  expect(pending.vehiculos).toHaveLength(0);
  expect(pending.alumnos).toHaveLength(0);
  expect(pending.practicas).toHaveLength(0);
});

test('sube el profesor_id de un alumno y descarga el de un alumno nuevo llegado del móvil', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const pid = db.addProfesor('Juan', '');
  const aid = db.addAlumno('Ana', 'B', vid, pid);

  const res = await sync.sync();

  expect(res.ok).toBe(true);
  expect(mockRemote.tables.alumnos[0]).toMatchObject({ id: aid, profesor_id: pid });

  // Simular un alumno nuevo registrado desde el móvil, ya con profesor asignado
  mockRemote.tables.alumnos.push({
    id: 500, nombre: 'Luis', permiso: 'B', vehiculo_id: vid, profesor_id: pid,
    deleted: false, updated_at: new Date(Date.now() + 1000).toISOString()
  });

  const res2 = await sync.sync();

  expect(res2.ok).toBe(true);
  const nuevo = db.getAlumnos().find(a => a.id === 500);
  expect(nuevo.profesor_id).toBe(pid);
  expect(nuevo.profesor_nombre).toBe('Juan');
});

test('baja una práctica registrada desde el móvil y ajusta el contador de IDs', async () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  await sync.sync(); // primera sincronización: fija el punto de partida

  // Simular que el móvil registró una práctica después
  mockRemote.tables.practicas.push({
    id: 500, alumno_id: aid, vehiculo_id: vid, fecha: '2026-07-10',
    km_inicial: '0', km_final: '0', nota: '', deleted: false,
    updated_at: new Date(Date.now() + 1000).toISOString()
  });

  const res = await sync.sync();

  expect(res.ok).toBe(true);
  expect(res.pulled).toBe(1);
  const practicas = db.getPracticasByAlumno(aid);
  expect(practicas).toHaveLength(1);
  expect(practicas[0]).toMatchObject({ id: 500, km_inicial: 0, km_final: 0 });
  // El siguiente ID local no debe chocar con el que asignó la nube
  expect(readData()._seq.p).toBe(501);
});

test('ignora prácticas remotas de alumnos o vehículos que no existen en local', async () => {
  writeData(baseData());
  mockRemote.tables.practicas.push({
    id: 7, alumno_id: 999, vehiculo_id: 1, fecha: '2026-07-10',
    km_inicial: '0', km_final: '0', deleted: false,
    updated_at: new Date().toISOString()
  });

  const res = await sync.sync();

  expect(res.ok).toBe(true);
  expect(res.pulled).toBe(0);
  expect(readData().practicas).toHaveLength(0);
});

test('conflicto: si la edición local es más reciente, NO se machaca con la versión de la nube', async () => {
  const ahora = Date.now();
  const tsLocal = new Date(ahora).toISOString();          // editado en local hace nada
  const tsRemoto = new Date(ahora - 60000).toISOString(); // versión de la nube, más vieja
  writeData(baseData({
    practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01', km_inicial: 100, km_final: 145, updated_at: tsLocal }]
  }));
  mockRemote.tables.practicas.push({
    id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01',
    km_inicial: '100', km_final: '140', deleted: false, updated_at: tsRemoto
  });

  await sync.sync();

  expect(readData().practicas[0].km_final).toBe(145); // se conserva la edición local
});

test('conflicto: si la versión de la nube es más reciente, sí actualiza la copia local', async () => {
  const ahora = Date.now();
  const tsLocal = new Date(ahora - 60000).toISOString();
  const tsRemoto = new Date(ahora).toISOString();
  writeData(baseData({
    practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01', km_inicial: 100, km_final: 145, updated_at: tsLocal }]
  }));
  mockRemote.tables.practicas.push({
    id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01',
    km_inicial: '100', km_final: '140', deleted: false, updated_at: tsRemoto
  });

  await sync.sync();

  expect(readData().practicas[0].km_final).toBe(140); // gana la versión más reciente
});

test('un borrado hecho desde el móvil (soft delete) elimina la práctica en local', async () => {
  writeData(baseData({
    practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01', km_inicial: 100, km_final: 140 }]
  }));
  mockRemote.tables.practicas.push({
    id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01',
    km_inicial: '100', km_final: '140', deleted: true,
    updated_at: new Date().toISOString()
  });

  const res = await sync.sync();

  expect(res.ok).toBe(true);
  expect(readData().practicas).toHaveLength(0);
});

describe('autenticación de la cuenta de sincronización', () => {
  test('con credenciales configuradas, inicia sesión antes de sincronizar', async () => {
    sync.setCredentials('sync@kmalumnos.app', 'secreta');
    db.addVehiculo('Coche 1', '', 0);

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.lastLogin).toEqual({ email: 'sync@kmalumnos.app', password: 'secreta' });
  });

  test('credenciales inválidas: no sincroniza y avisa con estado de error', async () => {
    mockRemote.authOk = false;
    sync.setCredentials('sync@kmalumnos.app', 'mal');
    db.addVehiculo('Coche 1', '', 0);

    const res = await sync.sync();

    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/credenciales/i);
    expect(sync.getStatus()).toBe('error');
    expect(mockRemote.tables.vehiculos).toHaveLength(0); // no subió nada
  });

  test('sin credenciales configuradas, sigue funcionando (modo transición)', async () => {
    db.addVehiculo('Coche 1', '', 0);

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.lastLogin).toBeNull(); // no intentó iniciar sesión
    expect(sync.hasCredentials()).toBe(false);
  });
});

describe('recuperación cuando data.json falta o está dañado', () => {
  // Simula una nube con datos "antiguos" (subidos hace días desde el otro PC)
  function nubeConDatos() {
    mockRemote.tables.vehiculos.push({
      id: 1, nombre: 'Coche 1', matricula: '1234ABC', km_actual: 200,
      updated_at: '2026-07-01T10:00:00.000Z'
    });
    mockRemote.tables.alumnos.push({
      id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1,
      updated_at: '2026-07-01T10:00:00.000Z'
    });
    mockRemote.tables.practicas.push({
      id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01',
      km_inicial: '100', km_final: '140', nota: '', deleted: false,
      updated_at: '2026-07-01T10:00:00.000Z'
    });
  }

  test('PC recién instalado (sin data.json): la primera sync reconstruye TODO desde la nube en una pasada', async () => {
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
    nubeConDatos();

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(sync.getStatus()).toBe('ok');
    const d = readData(); // el archivo ahora existe
    expect(d.vehiculos).toHaveLength(1);
    expect(d.vehiculos[0]).toMatchObject({ id: 1, nombre: 'Coche 1', km_actual: 200 });
    expect(d.alumnos).toHaveLength(1);
    expect(d.practicas).toHaveLength(1); // la práctica entra porque vehículo y alumno se bajaron antes
  });

  test('data.json dañado: guarda una copia, lo regenera y re-descarga todo aunque lastSync fuese reciente', async () => {
    fs.writeFileSync(dataFile, '{"vehiculos": [{"id":', 'utf-8'); // JSON truncado
    fs.writeFileSync(pendingFile, JSON.stringify({
      vehiculos: [], alumnos: [], practicas: [],
      deleted: { practicas: [], alumnos: [], vehiculos: [] },
      lastSync: new Date().toISOString() // reciente: sin el arreglo, no bajaría nada
    }), 'utf-8');
    nubeConDatos();

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    const d = readData();
    expect(d.vehiculos).toHaveLength(1);
    expect(d.alumnos).toHaveLength(1);
    expect(d.practicas).toHaveLength(1);
    // El archivo dañado no se pierde: queda una copia para inspección
    const copias = fs.readdirSync(userDataDir).filter(f => f.startsWith('data.json.danado-'));
    expect(copias.length).toBeGreaterThan(0);
    for (const c of copias) fs.unlinkSync(path.join(userDataDir, c)); // limpieza
  });

  test('los cambios de km de un vehículo hechos en otro PC llegan a este', async () => {
    writeData(baseData());
    mockRemote.tables.vehiculos.push({
      id: 1, nombre: 'Coche 1', matricula: '', km_actual: 350,
      updated_at: new Date().toISOString()
    });

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(readData().vehiculos[0].km_actual).toBe(350);
  });

  test('"Subir todo a la nube" ya no impide descargar después los datos antiguos de la nube', async () => {
    writeData(baseData());
    nubeConDatos(); // la nube tiene una práctica antigua que este PC no tiene

    const res = await sync.pushAll();
    expect(res.ok).toBe(true);

    const res2 = await sync.sync();
    expect(res2.ok).toBe(true);
    expect(readData().practicas).toHaveLength(1); // la práctica antigua sí se descargó
  });
});

describe('los borrados del escritorio no dejan restos en la nube', () => {
  test('borrar un alumno borra también sus prácticas en la nube (no solo el alumno)', async () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pid1 = db.addPractica(aid, vid, '2026-07-01', 100, 140);
    const pid2 = db.addPractica(aid, vid, '2026-07-02', 140, 180);
    await sync.sync(); // todo subido a la nube

    db.deleteAlumno(aid);
    const res = await sync.sync();

    expect(res.ok).toBe(true);
    // El alumno queda marcado como borrado en la nube (borrarlo de verdad falla
    // por la clave foránea de sus prácticas, y sin marca los demás dispositivos
    // no se enterarían del borrado)
    expect(mockRemote.tables.alumnos).toHaveLength(1);
    expect(mockRemote.tables.alumnos[0].deleted).toBe(true);
    const practicasNube = mockRemote.tables.practicas.filter(p => [pid1, pid2].includes(p.id));
    expect(practicasNube).toHaveLength(2);
    expect(practicasNube.every(p => p.deleted === true)).toBe(true); // sus prácticas, marcadas borradas
  });

  test('un alumno borrado en el otro PC desaparece de este, con sus prácticas', async () => {
    writeData(baseData({
      practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01', km_inicial: 100, km_final: 140 }]
    }));
    mockRemote.tables.alumnos.push({
      id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1,
      deleted: true, updated_at: new Date().toISOString()
    });

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(readData().alumnos).toHaveLength(0);
    expect(readData().practicas).toHaveLength(0);
  });

  test('un vehículo borrado en el otro PC desaparece de este', async () => {
    writeData(baseData());
    mockRemote.tables.vehiculos.push({
      id: 1, nombre: 'Coche 1', matricula: '', km_actual: 200,
      deleted: true, updated_at: new Date().toISOString()
    });

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(readData().vehiculos).toHaveLength(0);
    expect(readData().alumnos[0].vehiculo_id).toBeNull(); // el alumno queda sin vehículo asignado
  });

  test('"Subir todo a la nube" ejecuta los borrados pendientes en vez de descartarlos', async () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pid = db.addPractica(aid, vid, '2026-07-01', 100, 140);
    await sync.sync(); // todo subido a la nube

    db.deletePractica(pid); // queda encolado como borrado pendiente
    const res = await sync.pushAll(); // antes: vaciaba la cola sin subir el borrado

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.practicas[0].deleted).toBe(true);
  });
});

describe('profesores', () => {
  test('sube a la nube los profesores nuevos y vacía la cola de pendientes', async () => {
    const pid = db.addProfesor('Juan', 'Mañanas');

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.profesores).toHaveLength(1);
    expect(mockRemote.tables.profesores[0]).toMatchObject({ id: pid, nombre: 'Juan', nota: 'Mañanas', deleted: false });
    const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
    expect(pending.profesores).toHaveLength(0);
  });

  test('baja un profesor nuevo registrado desde otro dispositivo', async () => {
    writeData(baseData());
    mockRemote.tables.profesores = [{
      id: 1, nombre: 'Juan', nota: 'Mañanas', deleted: false,
      updated_at: new Date().toISOString()
    }];

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.pulled).toBe(1);
    expect(db.getProfesores()).toHaveLength(1);
    expect(db.getProfesores()[0]).toMatchObject({ id: 1, nombre: 'Juan', nota: 'Mañanas' });
  });

  test('borrar un profesor en el escritorio se propaga a la nube como soft delete, sin tocar sus prácticas', async () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pid = db.addProfesor('Juan', '');
    const practId = db.addPractica(aid, vid, '2026-07-01', 0, 40, pid);
    await sync.sync(); // todo subido

    db.deleteProfesor(pid);
    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.profesores).toHaveLength(1);
    expect(mockRemote.tables.profesores[0].deleted).toBe(true);
    // La práctica ya impartida no se toca ni se borra: conserva el profesor_id
    const practicaNube = mockRemote.tables.practicas.find(p => p.id === practId);
    expect(practicaNube.deleted).toBe(false);
    expect(practicaNube.profesor_id).toBe(pid);
  });

  test('un profesor borrado en otro PC desaparece de este', async () => {
    writeData(baseData({ profesores: [{ id: 1, nombre: 'Juan', nota: '' }] }));
    mockRemote.tables.profesores = [{
      id: 1, nombre: 'Juan', nota: '', deleted: true,
      updated_at: new Date().toISOString()
    }];

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(readData().profesores).toHaveLength(0);
  });

  test('las prácticas suben y bajan el profesor_id asignado', async () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pid = db.addProfesor('Juan', '');
    const practId = db.addPractica(aid, vid, '2026-07-01', 100, 140, pid);

    await sync.sync();

    const practicaNube = mockRemote.tables.practicas.find(p => p.id === practId);
    expect(practicaNube.profesor_id).toBe(pid);

    // Otro PC baja esa práctica y conserva el profesor_id
    resetData(db);
    writeData(baseData({ profesores: [{ id: pid, nombre: 'Juan', nota: '' }] }));
    const res = await sync.sync();
    expect(res.ok).toBe(true);
    expect(readData().practicas[0].profesor_id).toBe(pid);
  });

  test('"Subir todo a la nube" incluye a los profesores en el orden vehiculos → profesores → alumnos → practicas', async () => {
    db.addVehiculo('Coche 1', '', 0);
    db.addProfesor('Juan', '');

    const res = await sync.pushAll();

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.profesores).toHaveLength(1);
  });
});

describe('tarifas, pagos y el tipo de práctica', () => {
  test('sube a la nube las tarifas nuevas y vacía la cola de pendientes', async () => {
    const tid = db.setTarifa('B', 'circulacion', 20);

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.tarifas).toHaveLength(1);
    expect(mockRemote.tables.tarifas[0]).toMatchObject({ id: tid, permiso: 'B', tipo: 'circulacion', precio: 20, deleted: false });
    const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
    expect(pending.tarifas).toHaveLength(0);
  });

  test('baja una tarifa nueva registrada desde otro dispositivo', async () => {
    writeData(baseData());
    mockRemote.tables.tarifas = [{
      id: 1, permiso: 'B', tipo: 'circulacion', precio: 20, deleted: false,
      updated_at: new Date().toISOString()
    }];

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.pulled).toBe(1);
    expect(db.getTarifas()).toHaveLength(1);
    expect(db.getTarifas()[0]).toMatchObject({ id: 1, permiso: 'B', tipo: 'circulacion', precio: 20 });
  });

  test('borrar una tarifa en el escritorio se propaga a la nube como soft delete', async () => {
    const tid = db.setTarifa('B', 'circulacion', 20);
    await sync.sync();

    db.deleteTarifa(tid);
    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.tarifas).toHaveLength(1);
    expect(mockRemote.tables.tarifas[0].deleted).toBe(true);
  });

  test('una tarifa borrada en otro PC desaparece de este', async () => {
    writeData(baseData({ tarifas: [{ id: 1, permiso: 'B', tipo: 'circulacion', precio: 20 }] }));
    mockRemote.tables.tarifas = [{
      id: 1, permiso: 'B', tipo: 'circulacion', precio: 20, deleted: true,
      updated_at: new Date().toISOString()
    }];

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(readData().tarifas).toHaveLength(0);
  });

  test('sube a la nube los pagos nuevos y vacía la cola de pendientes', async () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pgid = db.addPago(aid, '2026-07-01', 50, 'Pago');

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.pagos).toHaveLength(1);
    expect(mockRemote.tables.pagos[0]).toMatchObject({ id: pgid, alumno_id: aid, fecha: '2026-07-01', cantidad: 50, deleted: false });
    const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
    expect(pending.pagos).toHaveLength(0);
  });

  test('baja un pago nuevo registrado desde otro dispositivo', async () => {
    writeData(baseData());
    mockRemote.tables.pagos = [{
      id: 1, alumno_id: 1, fecha: '2026-07-01', cantidad: 50, nota: '', deleted: false,
      updated_at: new Date().toISOString()
    }];

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.pulled).toBe(1);
    expect(db.getPagosByAlumno(1)).toHaveLength(1);
    expect(db.getPagosByAlumno(1)[0]).toMatchObject({ id: 1, cantidad: 50 });
  });

  test('borrar un pago en el escritorio se propaga a la nube como soft delete', async () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pgid = db.addPago(aid, '2026-07-01', 50, '');
    await sync.sync();

    db.deletePago(pgid);
    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.pagos).toHaveLength(1);
    expect(mockRemote.tables.pagos[0].deleted).toBe(true);
  });

  test('un pago borrado en otro PC desaparece de este', async () => {
    writeData(baseData({ pagos: [{ id: 1, alumno_id: 1, fecha: '2026-07-01', cantidad: 50, nota: '' }] }));
    mockRemote.tables.pagos = [{
      id: 1, alumno_id: 1, fecha: '2026-07-01', cantidad: 50, nota: '', deleted: true,
      updated_at: new Date().toISOString()
    }];

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(readData().pagos).toHaveLength(0);
  });

  test('el tipo de práctica sube y baja correctamente', async () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pid = db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'pista');

    await sync.sync();

    const practicaNube = mockRemote.tables.practicas.find(p => p.id === pid);
    expect(practicaNube.tipo).toBe('pista');

    // Otro PC baja esa práctica y conserva el tipo
    resetData(db);
    writeData(baseData());
    const res = await sync.sync();
    expect(res.ok).toBe(true);
    expect(readData().practicas[0].tipo).toBe('pista');
  });

  test('"Subir todo a la nube" incluye tarifas y pagos en el orden vehiculos → profesores → tarifas → alumnos → practicas → pagos', async () => {
    db.addVehiculo('Coche 1', '', 0);
    db.setTarifa('B', 'circulacion', 20);
    const vid = db.getVehiculos()[0].id;
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPago(aid, '2026-07-01', 30, '');

    const res = await sync.pushAll();

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.tarifas).toHaveLength(1);
    expect(mockRemote.tables.pagos).toHaveLength(1);
  });
});

test('los km generados con "Relleno masivo" se suben a la nube (antes se quedaban solo en el PC)', async () => {
  const vid = db.addVehiculo('Coche 1', '', 100);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid1 = db.addPractica(aid, vid, '2026-07-01', 0, 0); // prácticas sin km (como las del móvil)
  const pid2 = db.addPractica(aid, vid, '2026-07-02', 0, 0);
  await sync.sync(); // en la nube quedan con km 0,0

  const res = db.rellenarKmMasivo(vid, 40, 45);
  expect(res.rellenadas).toBe(2);
  await sync.sync();

  const nube = mockRemote.tables.practicas.filter(p => [pid1, pid2].includes(p.id));
  expect(nube.every(p => p.km_final > 0)).toBe(true); // los km rellenados llegaron a la nube
  const vNube = mockRemote.tables.vehiculos.find(v => v.id === vid);
  expect(vNube.km_actual).toBeGreaterThan(100); // y el odómetro del vehículo también
});

test('un borrado hecho en el escritorio se propaga a la nube como soft delete', async () => {
  writeData(baseData());
  mockRemote.tables.practicas.push({
    id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01',
    km_inicial: '100', km_final: '140', deleted: false,
    updated_at: '2026-07-01T00:00:00.000Z'
  });
  sync.markDeleted('practicas', 1);

  const res = await sync.sync();

  expect(res.ok).toBe(true);
  expect(mockRemote.tables.practicas[0].deleted).toBe(true);
});

describe('sync inmediato tras cambios (debounce)', () => {
  afterEach(() => {
    // Desactivar el mecanismo y restaurar el debounce real para no dejar
    // temporizadores ni activarlo por accidente en otros tests del archivo.
    sync._configurarSyncInmediatoParaTests({ activo: false, debounceMs: 5000 });
    jest.restoreAllMocks();
  });

  test('una ráfaga de cambios seguidos dispara un solo sync, no uno por cambio', async () => {
    sync._configurarSyncInmediatoParaTests({ activo: true, debounceMs: 30 });
    const syncSpy = jest.spyOn(sync, 'sync');

    // Ráfaga (como un relleno masivo o una importación CSV): cada mutación
    // marca dirty y reprograma el debounce, no dispara un sync por cambio.
    db.addVehiculo('Coche 1', '', 0);
    db.addVehiculo('Coche 2', '', 0);
    db.addVehiculo('Coche 3', '', 0);

    expect(syncSpy).not.toHaveBeenCalled(); // aún no ha pasado el debounce

    await new Promise(r => setTimeout(r, 200)); // pasar el debounce y dejar terminar el sync

    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(mockRemote.tables.vehiculos).toHaveLength(3); // el único sync subió los 3 cambios
  });

  test('markDeleted también dispara el debounce', async () => {
    writeData(baseData());
    mockRemote.tables.practicas.push({
      id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01',
      km_inicial: '100', km_final: '140', deleted: false,
      updated_at: '2026-07-01T00:00:00.000Z'
    });
    sync._configurarSyncInmediatoParaTests({ activo: true, debounceMs: 30 });
    const syncSpy = jest.spyOn(sync, 'sync');

    sync.markDeleted('practicas', 1);

    await new Promise(r => setTimeout(r, 200));

    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(mockRemote.tables.practicas[0].deleted).toBe(true);
  });

  test('sin activar el mecanismo (auto-sync no arrancado), markDirty no programa ningún sync', async () => {
    const syncSpy = jest.spyOn(sync, 'sync');

    db.addVehiculo('Coche 1', '', 0); // fuera de la app real, sin startAutoSync/activación

    await new Promise(r => setTimeout(r, 100));

    expect(syncSpy).not.toHaveBeenCalled();
  });
});

describe('empresa_id (fase 1 multi-empresa)', () => {
  afterEach(() => {
    mockRemote.authUserId = undefined; // no dejar fijado el uid para otros tests
  });

  test('con sesión autenticada, la subida estampa empresa_id con el uid de la sesión', async () => {
    mockRemote.authUserId = 'empresa-aaa';
    sync.setCredentials('sync@kmalumnos.app', 'secreta');
    const vid = db.addVehiculo('Coche 1', '', 0);

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.vehiculos[0]).toMatchObject({ id: vid, empresa_id: 'empresa-aaa' });
  });

  test('con sesión autenticada, "Subir todo a la nube" también estampa empresa_id', async () => {
    mockRemote.authUserId = 'empresa-aaa';
    sync.setCredentials('sync@kmalumnos.app', 'secreta');
    db.addVehiculo('Coche 1', '', 0);

    const res = await sync.pushAll();

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.vehiculos[0].empresa_id).toBe('empresa-aaa');
  });

  test('con sesión autenticada, la bajada filtra por empresa_id: un registro de otra empresa no baja', async () => {
    mockRemote.authUserId = 'empresa-aaa';
    sync.setCredentials('sync@kmalumnos.app', 'secreta');
    mockRemote.tables.vehiculos.push(
      { id: 1, nombre: 'Coche empresa A', matricula: '', km_actual: 100, empresa_id: 'empresa-aaa', deleted: false, updated_at: new Date().toISOString() },
      { id: 2, nombre: 'Coche empresa B', matricula: '', km_actual: 200, empresa_id: 'empresa-bbb', deleted: false, updated_at: new Date().toISOString() }
    );

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    const d = readData();
    expect(d.vehiculos).toHaveLength(1);
    expect(d.vehiculos[0].id).toBe(1);
  });

  test('sin sesión (modo legado), la subida NO estampa empresa_id y la bajada no filtra', async () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    mockRemote.tables.vehiculos.push({
      id: 999, nombre: 'De otra empresa (o sin empresa)', matricula: '', km_actual: 50,
      deleted: false, updated_at: new Date().toISOString()
    });

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(mockRemote.tables.vehiculos.find(v => v.id === vid).empresa_id).toBeUndefined();
    // sin sesión no hay filtro: el otro vehículo también baja (comportamiento igual que hoy)
    expect(readData().vehiculos.find(v => v.id === 999)).toBeTruthy();
  });

  test('empresa_id no se guarda en los datos locales (data.json)', async () => {
    mockRemote.authUserId = 'empresa-aaa';
    sync.setCredentials('sync@kmalumnos.app', 'secreta');
    mockRemote.tables.vehiculos.push({
      id: 1, nombre: 'Coche 1', matricula: '', km_actual: 100, empresa_id: 'empresa-aaa',
      deleted: false, updated_at: new Date().toISOString()
    });

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(readData().vehiculos[0]).not.toHaveProperty('empresa_id');
  });

  test('getEmpresaId() expone el uid de la sesión activa, y null en modo legado', async () => {
    expect(sync.getEmpresaId()).toBeNull();

    mockRemote.authUserId = 'empresa-aaa';
    sync.setCredentials('sync@kmalumnos.app', 'secreta');
    await sync.sync();
    expect(sync.getEmpresaId()).toBe('empresa-aaa');

    sync.setCredentials(null, null); // vuelve a modo legado
    expect(sync.getEmpresaId()).toBeNull();
    await sync.sync();
    expect(sync.getEmpresaId()).toBeNull();
  });
});

describe('conflictos de sincronización (dos PCs editan el mismo registro entre syncs)', () => {
  afterEach(() => {
    delete mockRemote._onUpsert; // no dejar el hook de "otro dispositivo" activo para otros tests
  });

  test('dos ediciones a la vez, remoto más reciente: el remoto gana Y queda registrado el conflicto con los valores descartados', async () => {
    const viejo = new Date(Date.now() - 60000).toISOString();
    writeData(baseData({
      vehiculos: [{ id: 1, nombre: 'Coche 1', matricula: '', km_actual: 250, updated_at: viejo }]
    }));
    sync.markDirty('vehiculos', 1); // este PC editó km_actual a 250 y aún no lo ha subido

    // "Mientras tanto" el otro dispositivo escribe su propio cambio justo
    // después de que este PC suba el suyo (misma fila, contenido distinto).
    mockRemote._onUpsert = (table, item) => {
      if (table === 'vehiculos' && item.id === 1) {
        mockRemote.tables.vehiculos[0] = {
          id: 1, nombre: 'Coche 1', matricula: '', km_actual: 300,
          deleted: false, updated_at: new Date(Date.now() + 5000).toISOString()
        };
      }
    };

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.conflictos).toBe(1);
    expect(readData().vehiculos[0].km_actual).toBe(300); // gana la edición más reciente (regla sin cambios)

    const logConflicto = readData().logs.find(l => l.tipo === 'conflicto_sync');
    expect(logConflicto).toBeTruthy();
    expect(logConflicto.descripcion).toMatch(/vehiculos/);
    expect(logConflicto.descripcion).toMatch(/#1/);
    expect(logConflicto.detalles.join(' ')).toMatch(/250/); // el valor descartado de este PC queda anotado
    expect(logConflicto.detalles.join(' ')).toMatch(/300/); // y el que ganó, para poder comparar
  });

  test('conflicto en una práctica: se detecta y quedan anotados los km descartados', async () => {
    const viejo = new Date(Date.now() - 60000).toISOString();
    writeData(baseData({
      practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01', km_inicial: 100, km_final: 145, updated_at: viejo }]
    }));
    sync.markDirty('practicas', 1); // este PC ajustó los km y aún no los ha subido

    mockRemote._onUpsert = (table, item) => {
      if (table === 'practicas' && item.id === 1) {
        mockRemote.tables.practicas[0] = {
          id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-07-01',
          km_inicial: '100', km_final: '160', nota: '', deleted: false,
          updated_at: new Date(Date.now() + 5000).toISOString()
        };
      }
    };

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.conflictos).toBe(1);
    expect(readData().practicas[0].km_final).toBe(160);

    const logConflicto = readData().logs.find(l => l.tipo === 'conflicto_sync');
    expect(logConflicto).toBeTruthy();
    expect(logConflicto.descripcion).toMatch(/practicas/);
    expect(logConflicto.detalles.join(' ')).toMatch(/145/);
  });

  test('alumno renombrado en la nube (updated_at más reciente): la bajada aplica el nuevo nombre en local', async () => {
    const viejo = new Date(Date.now() - 60000).toISOString();
    writeData(baseData({
      alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1, updated_at: viejo }]
    }));
    mockRemote.tables.alumnos.push({
      id: 1, nombre: 'Ana García', permiso: 'B', vehiculo_id: 1,
      deleted: false, updated_at: new Date().toISOString()
    });
    // Sin sync.markDirty: este PC no tocó el alumno, solo baja el cambio ajeno

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.conflictos).toBe(0);
    expect(readData().alumnos[0].nombre).toBe('Ana García');
  });

  test('conflicto en un alumno: edición local pendiente y versión remota distinta más reciente, el remoto gana Y queda registrado el conflicto', async () => {
    const viejo = new Date(Date.now() - 60000).toISOString();
    writeData(baseData({
      alumnos: [{ id: 1, nombre: 'Ana Local', permiso: 'B', vehiculo_id: 1, updated_at: viejo }]
    }));
    sync.markDirty('alumnos', 1); // este PC renombró y aún no lo ha subido

    mockRemote._onUpsert = (table, item) => {
      if (table === 'alumnos' && item.id === 1) {
        mockRemote.tables.alumnos[0] = {
          id: 1, nombre: 'Ana Remota', permiso: 'B', vehiculo_id: 1,
          deleted: false, updated_at: new Date(Date.now() + 5000).toISOString()
        };
      }
    };

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.conflictos).toBe(1);
    expect(readData().alumnos[0].nombre).toBe('Ana Remota');

    const logConflicto = readData().logs.find(l => l.tipo === 'conflicto_sync');
    expect(logConflicto).toBeTruthy();
    expect(logConflicto.descripcion).toMatch(/alumnos/);
    expect(logConflicto.descripcion).toMatch(/#1/);
    expect(logConflicto.detalles.join(' ')).toMatch(/Ana Local/);
    expect(logConflicto.detalles.join(' ')).toMatch(/Ana Remota/);
  });

  test('alumno editado solo localmente (sin cambio real del otro dispositivo): no se pisa ni se registra conflicto', async () => {
    const viejo = new Date(Date.now() - 60000).toISOString();
    writeData(baseData({
      alumnos: [{ id: 1, nombre: 'Ana Editada', permiso: 'B', vehiculo_id: 1, updated_at: viejo }]
    }));
    sync.markDirty('alumnos', 1); // edición de este PC, nadie más tocó el registro

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.conflictos).toBe(0);
    expect(readData().alumnos[0].nombre).toBe('Ana Editada');
    expect(readData().logs.find(l => l.tipo === 'conflicto_sync')).toBeUndefined();
  });

  test('edición solo local (sin cambio real del otro dispositivo): no se registra ningún conflicto', async () => {
    const viejo = new Date(Date.now() - 60000).toISOString();
    writeData(baseData({
      vehiculos: [{ id: 1, nombre: 'Coche 1', matricula: '', km_actual: 250, updated_at: viejo }]
    }));
    sync.markDirty('vehiculos', 1); // edición de este PC, nadie más tocó el registro

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.conflictos).toBe(0);
    expect(readData().vehiculos[0].km_actual).toBe(250);
    expect(readData().logs.find(l => l.tipo === 'conflicto_sync')).toBeUndefined();
  });

  test('edición solo remota (sin edición local pendiente): no se registra ningún conflicto', async () => {
    writeData(baseData());
    mockRemote.tables.vehiculos.push({
      id: 1, nombre: 'Coche 1', matricula: '', km_actual: 350,
      deleted: false, updated_at: new Date().toISOString()
    });
    // Sin sync.markDirty: este PC no tocó el vehículo, solo baja el cambio ajeno

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.conflictos).toBe(0);
    expect(readData().vehiculos[0].km_actual).toBe(350);
    expect(readData().logs.find(l => l.tipo === 'conflicto_sync')).toBeUndefined();
  });

  test('un sync normal sin colisiones sigue funcionando igual (sube, baja y no marca conflictos)', async () => {
    const vid = db.addVehiculo('Coche 1', '1234ABC', 100);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pid = db.addPractica(aid, vid, '2026-07-01', 100, 140);

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(res.conflictos).toBe(0);
    expect(mockRemote.tables.practicas.find(p => p.id === pid)).toMatchObject({ km_inicial: 100, km_final: 140 });
    expect(readData().logs.find(l => l.tipo === 'conflicto_sync')).toBeUndefined();
  });
});

describe('registrarEmpresa / getEstadoCuenta (fase 2 multi-empresa)', () => {
  afterEach(() => {
    delete mockRemote.signUpError;
    delete mockRemote.signUpExists;
    delete mockRemote.signUpPending;
    delete mockRemote.lastSignUpRedirectTo;
    mockRemote.authUserId = undefined;
  });

  test('alta con sesión directa: queda logueada y devuelve estado "activa"', async () => {
    mockRemote.authUserId = 'uid-nueva-empresa';

    const res = await sync.registrarEmpresa('nueva@empresa.com', 'contraseña123');

    expect(res.ok).toBe(true);
    expect(res.estado).toBe('activa');
    expect(res.email).toBe('nueva@empresa.com');
    expect(res.empresaId).toBe('uid-nueva-empresa');
    expect(sync.hasCredentials()).toBe(true);
    expect(sync.getEmpresaId()).toBe('uid-nueva-empresa');
    expect(sync.getEstadoCuenta().conectado).toBe(true); // sesión directa ya es una autenticación confirmada
  });

  test('el email de confirmación del alta apunta a la página que avisa de volver a la app, no a la web logueada', async () => {
    mockRemote.authUserId = 'uid-nueva-empresa';

    await sync.registrarEmpresa('nueva@empresa.com', 'contraseña123');

    expect(mockRemote.lastSignUpRedirectTo).toBe('https://kmalumnos-remote.vercel.app/email-confirmado.html');
  });

  test('alta pendiente de confirmación por email: no queda logueada', async () => {
    mockRemote.signUpPending = true;

    const res = await sync.registrarEmpresa('pendiente@empresa.com', 'contraseña123');

    expect(res.ok).toBe(true);
    expect(res.estado).toBe('pendiente_confirmacion');
    expect(sync.hasCredentials()).toBe(false);
    expect(sync.getEmpresaId()).toBeNull();
  });

  test('email ya registrado (identities vacío, sin error): mensaje en español pidiendo iniciar sesión', async () => {
    mockRemote.signUpExists = true;

    const res = await sync.registrarEmpresa('existe@empresa.com', 'contraseña123');

    expect(res.ok).toBe(false);
    expect(res.msg).toMatch(/ya tiene una cuenta|inicia sesión/i);
    expect(sync.hasCredentials()).toBe(false);
  });

  test('contraseña corta: falla sin llamar a la red', async () => {
    const res = await sync.registrarEmpresa('a@b.com', '123');

    expect(res.ok).toBe(false);
    expect(mockRemote.lastLogin).toBeNull();
  });

  test('getEstadoCuenta(): sin credenciales, y luego con sesión activa', async () => {
    expect(sync.getEstadoCuenta()).toEqual({ conectado: false, email: null, empresaId: null, conflictoEmpresa: null });

    mockRemote.authUserId = 'empresa-aaa';
    sync.setCredentials('sync@kmalumnos.app', 'secreta');
    const res = await sync.sync();
    expect(res.ok).toBe(true);

    expect(sync.getEstadoCuenta()).toEqual({
      conectado: true,
      email: 'sync@kmalumnos.app',
      empresaId: 'empresa-aaa',
      conflictoEmpresa: null
    });
  });

  // Bug real: antes getEstadoCuenta().conectado se basaba solo en
  // hasCredentials() (¿hay credenciales guardadas en memoria?), así que daba
  // true aunque el login nunca hubiera funcionado (contraseña incorrecta,
  // email sin confirmar...) y el gate podía no reabrirse cuando debía.
  test('login con credenciales que fallan: las credenciales quedan guardadas pero "conectado" es false, no solo "hay credenciales"', async () => {
    mockRemote.authOk = false;
    sync.setCredentials('sync@kmalumnos.app', 'mal');

    const res = await sync.sync();

    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/credenciales/i);
    // Las credenciales SÍ deben quedar en memoria: el reintento de fondo
    // (ensureClient/auto-sync) tiene que poder seguir probando más tarde.
    expect(sync.hasCredentials()).toBe(true);
    // Pero no se considera una sesión válida: el gate no debe dejar pasar.
    expect(sync.getEstadoCuenta().conectado).toBe(false);
  });

  test('login que tiene éxito: "conectado" pasa a true', async () => {
    mockRemote.authUserId = 'empresa-ok';
    sync.setCredentials('sync@kmalumnos.app', 'buena');

    expect(sync.getEstadoCuenta().conectado).toBe(false); // aún no se ha probado

    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(sync.getEstadoCuenta().conectado).toBe(true);
  });

  test('tras un login fallido, uno posterior que sí funciona corrige "conectado" a true (reintento de fondo)', async () => {
    mockRemote.authOk = false;
    sync.setCredentials('sync@kmalumnos.app', 'mal-de-momento');
    await sync.sync();
    expect(sync.getEstadoCuenta().conectado).toBe(false);

    // El email se confirma / la contraseña se corrige: el siguiente intento
    // (el auto-sync de fondo cada 2 min, en la app real) ya funciona.
    mockRemote.authOk = true;
    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(sync.getEstadoCuenta().conectado).toBe(true);
  });
});

describe('restaurarCredenciales() — arranque de la app con credenciales guardadas en disco', () => {
  test('sin ningún login confirmado antes, restaurarCredenciales() no da conectado=true solo por tener credenciales', () => {
    sync.restaurarCredenciales('nuevo@empresa.com', 'algo');

    expect(sync.hasCredentials()).toBe(true);
    expect(sync.getEstadoCuenta().conectado).toBe(false);
  });

  test('tras un login exitoso, restaurarCredenciales() (como al reabrir la app) recupera conectado=true sin tocar la red', async () => {
    mockRemote.authUserId = 'empresa-aaa';
    sync.setCredentials('sync@kmalumnos.app', 'secreta');
    await sync.sync(); // login exitoso: queda persistido en auth_status.json

    // Simula un reinicio de la app: nuevas credenciales cargadas desde disco
    sync.restaurarCredenciales('sync@kmalumnos.app', 'secreta');

    expect(sync.getEstadoCuenta().conectado).toBe(true);
  });

  test('un rechazo real de credenciales invalida el estado persistido: restaurarCredenciales() ya no da conectado=true', async () => {
    mockRemote.authUserId = 'empresa-bbb';
    sync.setCredentials('otra@empresa.com', 'buena');
    await sync.sync();
    expect(sync.getEstadoCuenta().conectado).toBe(true);

    // La contraseña deja de valer (se cambió en otro sitio, etc.) y se vuelve
    // a intentar el login — como hace el reintento de fondo tras "revisa tu
    // correo", que llama a setCredentials()+sync() en cada intento (por eso se
    // repite aquí: un client ya cacheado no repetiría el login por sí solo).
    mockRemote.authOk = false;
    sync.setCredentials('otra@empresa.com', 'ya-no-vale');
    await sync.sync();
    expect(sync.getEstadoCuenta().conectado).toBe(false);

    sync.restaurarCredenciales('otra@empresa.com', 'ya-no-vale');
    expect(sync.getEstadoCuenta().conectado).toBe(false);
  });

  test('un fallo de red (sin internet) no borra el estado de autenticación ya confirmado', async () => {
    mockRemote.authUserId = 'empresa-ccc';
    sync.setCredentials('ok@empresa.com', 'buena');
    await sync.sync();
    expect(sync.getEstadoCuenta().conectado).toBe(true);

    mockRemote.online = false;
    const res = await sync.sync(); // sin conexión: no es un rechazo de credenciales
    expect(res.ok).toBe(false);
    expect(sync.getEstadoCuenta().conectado).toBe(true); // la sesión ya confirmada no se invalida por estar offline

    mockRemote.online = true;
    sync.restaurarCredenciales('ok@empresa.com', 'buena'); // como al reabrir la app sin internet
    expect(sync.getEstadoCuenta().conectado).toBe(true);
  });
});

// Bug real que motivó esto: el dueño creó una cuenta de empresa de prueba en
// un PC (con alumnos/profesores de prueba) y luego, EN EL MISMO PC, una
// segunda cuenta real — que veía los datos de prueba, porque data.json no
// está vinculado a ninguna cuenta. local_empresa.json guarda a qué cuenta
// pertenecen los datos locales actuales; ver sync.js sección "PROPIETARIO DE
// LOS DATOS LOCALES".
describe('conflicto de datos locales con otra cuenta (local_empresa.json)', () => {
  afterEach(() => {
    mockRemote.authUserId = undefined;
  });

  test('instalación existente SIN marcador (el caso de todos los PCs reales hoy): el login no muestra ningún conflicto y adopta la cuenta en silencio', async () => {
    // Simula un PC ya en uso, con datos reales, que nunca tuvo local_empresa.json
    writeData(baseData());
    expect(fs.existsSync(localEmpresaFile)).toBe(false);

    mockRemote.authUserId = 'empresa-real';
    sync.setCredentials('real@empresa.com', 'buena');
    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(sync.getEstadoCuenta().conflictoEmpresa).toBeNull(); // ningún diálogo nuevo
    // Los datos locales NO se tocan: esto no es un vaciado, solo se adopta el marcador
    expect(readData().vehiculos).toHaveLength(1);
    expect(readData().alumnos).toHaveLength(1);
    // El marcador queda creado, adoptando esta cuenta como dueña de los datos
    const owner = JSON.parse(fs.readFileSync(localEmpresaFile, 'utf-8'));
    expect(owner).toEqual({ empresaId: 'empresa-real', email: 'real@empresa.com' });
  });

  test('marcador presente y coincide con la sesión: todo normal, sin conflicto', async () => {
    fs.writeFileSync(localEmpresaFile, JSON.stringify({ empresaId: 'empresa-real', email: 'real@empresa.com' }), 'utf-8');
    writeData(baseData());

    mockRemote.authUserId = 'empresa-real';
    sync.setCredentials('real@empresa.com', 'buena');
    const res = await sync.sync();

    expect(res.ok).toBe(true);
    expect(sync.getEstadoCuenta().conflictoEmpresa).toBeNull();
  });

  test('marcador presente y NO coincide: login con una cuenta distinta dispara un conflicto real', async () => {
    fs.writeFileSync(localEmpresaFile, JSON.stringify({ empresaId: 'empresa-prueba', email: 'prueba@empresa.com' }), 'utf-8');
    writeData(baseData()); // datos de prueba que quedaron en este PC

    mockRemote.authUserId = 'empresa-nueva';
    sync.setCredentials('nueva@empresa.com', 'buena');
    const res = await sync.sync();

    expect(res.ok).toBe(true); // el sync en sí no falla, solo se marca el conflicto
    expect(sync.getEstadoCuenta().conflictoEmpresa).toEqual({ emailAnterior: 'prueba@empresa.com' });
    // El marcador NO se sobrescribe hasta que se resuelva el conflicto
    expect(JSON.parse(fs.readFileSync(localEmpresaFile, 'utf-8')).empresaId).toBe('empresa-prueba');
  });

  test('registrarEmpresa() (crear una segunda cuenta en el mismo PC) también dispara el conflicto', async () => {
    fs.writeFileSync(localEmpresaFile, JSON.stringify({ empresaId: 'empresa-prueba', email: 'prueba@empresa.com' }), 'utf-8');
    writeData(baseData());
    mockRemote.authUserId = 'empresa-nueva-2';

    const res = await sync.registrarEmpresa('nueva2@empresa.com', 'contraseña123');

    expect(res.ok).toBe(true);
    expect(res.estado).toBe('activa');
    expect(sync.getEstadoCuenta().conflictoEmpresa).toEqual({ emailAnterior: 'prueba@empresa.com' });
  });

  test('cerrar sesión (setCredentials(null,null)) limpia el conflicto detectado, no lo deja colgado', async () => {
    fs.writeFileSync(localEmpresaFile, JSON.stringify({ empresaId: 'empresa-prueba', email: 'prueba@empresa.com' }), 'utf-8');
    mockRemote.authUserId = 'empresa-nueva';
    sync.setCredentials('nueva@empresa.com', 'buena');
    await sync.sync();
    expect(sync.getEstadoCuenta().conflictoEmpresa).toBeTruthy();

    sync.setCredentials(null, null);
    expect(sync.getEstadoCuenta().conflictoEmpresa).toBeNull();
  });

  test('mientras el conflicto está sin resolver, sync() no toca los datos locales (no mezcla las dos cuentas ni sube nada de la anterior)', async () => {
    fs.writeFileSync(localEmpresaFile, JSON.stringify({ empresaId: 'empresa-prueba', email: 'prueba@empresa.com' }), 'utf-8');
    writeData(baseData());
    mockRemote.authUserId = 'empresa-nueva';
    mockRemote.tables.vehiculos.push({
      id: 50, nombre: 'Coche real', matricula: '', km_actual: 500,
      empresa_id: 'empresa-nueva', deleted: false, updated_at: new Date().toISOString()
    });
    sync.setCredentials('nueva@empresa.com', 'buena');

    const res = await sync.sync(); // esto es lo que hace "Guardar y probar" (save-sync-creds)

    expect(res.ok).toBe(true); // las credenciales SÍ son válidas: no debe verse como fallo de login
    expect(sync.getEstadoCuenta().conflictoEmpresa).toBeTruthy();
    const d = readData();
    expect(d.vehiculos).toHaveLength(1);
    expect(d.vehiculos[0].id).toBe(1); // sigue siendo el de la cuenta de prueba, no se mezcló
    expect(mockRemote.tables.vehiculos.find(v => v.id === 1)).toBeUndefined(); // nada se subió a la nube
  });

  test('resolverConflictoEmpresa(): vacía data.json y pending_sync.json, adopta la cuenta actual y baja solo los datos reales de esta cuenta', async () => {
    // Datos de la cuenta de prueba, todavía en este PC
    fs.writeFileSync(localEmpresaFile, JSON.stringify({ empresaId: 'empresa-prueba', email: 'prueba@empresa.com' }), 'utf-8');
    writeData(baseData({ logs: [{ tipo: 'info', descripcion: 'Alumno de prueba creado' }] }));

    // La nube tiene datos reales de la cuenta nueva
    mockRemote.authUserId = 'empresa-nueva';
    mockRemote.tables.vehiculos.push({
      id: 50, nombre: 'Coche real', matricula: '', km_actual: 500,
      empresa_id: 'empresa-nueva', deleted: false, updated_at: new Date().toISOString()
    });
    mockRemote.tables.alumnos.push({
      id: 60, nombre: 'Alumno real', permiso: 'B', vehiculo_id: 50,
      empresa_id: 'empresa-nueva', deleted: false, updated_at: new Date().toISOString()
    });

    sync.setCredentials('nueva@empresa.com', 'buena');
    const loginRes = await sync.sync();
    expect(loginRes.ok).toBe(true);
    expect(sync.getEstadoCuenta().conflictoEmpresa).toBeTruthy(); // conflicto detectado, no se ha resuelto aún

    const res = await sync.resolverConflictoEmpresa();

    expect(res.ok).toBe(true);
    expect(sync.getEstadoCuenta().conflictoEmpresa).toBeNull();
    const d = readData();
    // Los datos de la cuenta de prueba ya no están; solo quedan los de la cuenta nueva, descargados de la nube
    expect(d.vehiculos).toHaveLength(1);
    expect(d.vehiculos[0]).toMatchObject({ id: 50, nombre: 'Coche real' });
    expect(d.alumnos).toHaveLength(1);
    expect(d.alumnos[0]).toMatchObject({ id: 60, nombre: 'Alumno real' });
    expect(d.logs.find(l => l.descripcion === 'Alumno de prueba creado')).toBeUndefined();
    // El marcador ahora es de la cuenta nueva
    const owner = JSON.parse(fs.readFileSync(localEmpresaFile, 'utf-8'));
    expect(owner.empresaId).toBe('empresa-nueva');
    // La cola de pendientes también quedó limpia
    const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
    expect(pending.vehiculos).toHaveLength(0);
    expect(pending.deleted.alumnos).toHaveLength(0);
  });

  test('pushAll() rechaza la operación mientras haya un conflicto de empresa sin resolver', async () => {
    fs.writeFileSync(localEmpresaFile, JSON.stringify({ empresaId: 'empresa-prueba', email: 'prueba@empresa.com' }), 'utf-8');
    writeData(baseData()); // datos de la cuenta de prueba, todavía locales
    mockRemote.authUserId = 'empresa-nueva';
    sync.setCredentials('nueva@empresa.com', 'buena');
    await sync.sync(); // detecta el conflicto
    expect(sync.getEstadoCuenta().conflictoEmpresa).toBeTruthy();

    const res = await sync.pushAll();

    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/otra cuenta/i);
    // Nada de los datos de prueba se subió a la nube con el empresa_id de la cuenta nueva
    expect(mockRemote.tables.vehiculos.find(v => v.empresa_id === 'empresa-nueva')).toBeUndefined();
  });

  test('tras resolverConflictoEmpresa(), "Subir todo a la nube" vuelve a funcionar con normalidad', async () => {
    fs.writeFileSync(localEmpresaFile, JSON.stringify({ empresaId: 'empresa-prueba', email: 'prueba@empresa.com' }), 'utf-8');
    writeData(baseData());
    mockRemote.authUserId = 'empresa-nueva';
    sync.setCredentials('nueva@empresa.com', 'buena');
    await sync.sync();
    await sync.resolverConflictoEmpresa();

    db.addVehiculo('Coche nuevo', '', 0);
    const res = await sync.pushAll();

    expect(res.ok).toBe(true);
  });
});

describe('solicitarResetPassword ("olvidé mi contraseña")', () => {
  afterEach(() => {
    delete mockRemote.resetPasswordError;
    delete mockRemote.lastResetPasswordEmail;
    delete mockRemote.lastResetPasswordRedirectTo;
  });

  test('sin credenciales previas: pide el reset y apunta al redirectTo de reset-password.html', async () => {
    const res = await sync.solicitarResetPassword('alumno@empresa.com');

    expect(res.ok).toBe(true);
    expect(mockRemote.lastResetPasswordEmail).toBe('alumno@empresa.com');
    expect(mockRemote.lastResetPasswordRedirectTo).toBe('https://kmalumnos-remote.vercel.app/reset-password.html');
  });

  test('no requiere sesión activa: funciona igual si no hay credenciales guardadas', async () => {
    expect(sync.hasCredentials()).toBe(false);
    const res = await sync.solicitarResetPassword('otra@empresa.com');
    expect(res.ok).toBe(true);
    expect(sync.hasCredentials()).toBe(false); // sigue sin dejar sesión abierta
  });

  test('email vacío: falla sin llamar a la red', async () => {
    const res = await sync.solicitarResetPassword('');
    expect(res.ok).toBe(false);
    expect(mockRemote.lastResetPasswordEmail).toBeUndefined();
  });

  test('error real de Supabase (red, rate limit...): mensaje genérico, no revela si el email existe', async () => {
    mockRemote.resetPasswordError = 'Email rate limit exceeded';
    const res = await sync.solicitarResetPassword('cualquiera@empresa.com');
    expect(res.ok).toBe(false);
    expect(res.msg).not.toMatch(/rate limit/i); // no se filtra el detalle interno de Supabase
  });
});
