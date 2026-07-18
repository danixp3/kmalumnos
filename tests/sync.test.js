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
    expect(sync.getEstadoCuenta()).toEqual({ conectado: false, email: null, empresaId: null });

    mockRemote.authUserId = 'empresa-aaa';
    sync.setCredentials('sync@kmalumnos.app', 'secreta');
    const res = await sync.sync();
    expect(res.ok).toBe(true);

    expect(sync.getEstadoCuenta()).toEqual({
      conectado: true,
      email: 'sync@kmalumnos.app',
      empresaId: 'empresa-aaa'
    });
  });
});
