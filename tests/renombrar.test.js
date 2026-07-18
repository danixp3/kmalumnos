// Tests de "renombrar con seguridad": vehículos, profesores y alumnos.
// Cubren las 3 invariantes que pide la tarea: el id nunca cambia, las
// prácticas siguen apuntando al mismo id (las relaciones no se rompen y los
// nombres se re-derivan por id) y el rename queda marcado para sync (y viaja
// de verdad si se ejecuta un sync real contra un Supabase simulado).
const fs = require('fs');
const path = require('path');

const mockRemote = { online: true, tables: {} };
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./mocks/fake-supabase')(mockRemote)
}));

const db = require('../db');
const sync = require('../sync');
const { resetData, userDataDir } = require('./helpers');

const pendingFile = path.join(userDataDir, 'pending_sync.json');

function pending() {
  return JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
}

beforeEach(() => {
  resetData(db);
  mockRemote.tables = {};
});

describe('renombrar vehículo', () => {
  test('updateVehiculo cambia nombre y matrícula, conserva el id y las prácticas/alumnos siguen apuntando a él', () => {
    const vid = db.addVehiculo('Coche 1', '1234ABC', 100);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pid = db.addPractica(aid, vid, '2026-07-01', 100, 140);

    db.updateVehiculo(vid, 'Coche Azul', '9999XYZ');

    const vehiculos = db.getVehiculos();
    expect(vehiculos).toHaveLength(1);
    // addPractica adelanta el odómetro a km_final (140) porque supera el km_actual inicial (100)
    expect(vehiculos[0]).toMatchObject({ id: vid, nombre: 'Coche Azul', matricula: '9999XYZ', km_actual: 140 });

    // La práctica conserva el mismo vehiculo_id y re-deriva el nombre nuevo (no lo cachea)
    const practica = db.getPracticasByAlumno(aid).find(p => p.id === pid);
    expect(practica.vehiculo_id).toBe(vid);
    expect(practica.vehiculo_nombre).toBe('Coche Azul');

    // El alumno asignado también re-deriva el nombre nuevo del vehículo
    expect(db.getAlumnos().find(a => a.id === aid).vehiculo_nombre).toBe('Coche Azul');
  });

  test('updateVehiculo no toca el km_actual (edición independiente de "Editar km")', () => {
    const vid = db.addVehiculo('Coche 1', '', 200);
    db.updateVehiculo(vid, 'Coche Azul', '');
    expect(db.getVehiculos()[0].km_actual).toBe(200);
  });

  test('updateVehiculo marca el vehículo para sync aunque ya estuviera sincronizado', () => {
    const vid = db.addVehiculo('Coche 1', '', 100);
    fs.unlinkSync(pendingFile); // simula que ya se sincronizó y la cola está vacía

    db.updateVehiculo(vid, 'Coche Azul', '9999XYZ');

    expect(pending().vehiculos).toContain(vid);
  });

  test('el rename de un vehículo viaja de verdad: sync() sube el nuevo nombre y matrícula', async () => {
    const vid = db.addVehiculo('Coche 1', '1234ABC', 100);
    await sync.sync(); // primera sincronización: sube el vehículo tal cual

    db.updateVehiculo(vid, 'Coche Azul', '9999XYZ');
    const res = await sync.sync();

    expect(res.ok).toBe(true);
    const remoto = mockRemote.tables.vehiculos.find(v => v.id === vid);
    expect(remoto).toMatchObject({ nombre: 'Coche Azul', matricula: '9999XYZ' });
    expect(pending().vehiculos).toHaveLength(0); // la cola vuelve a quedar vacía
  });
});

describe('renombrar profesor', () => {
  test('updateProfesor conserva el id y las prácticas ya asignadas siguen apuntando a él', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pid = db.addProfesor('Juan', 'Mañanas');
    const practId = db.addPractica(aid, vid, '2026-07-01', 0, 40, pid);

    db.updateProfesor(pid, 'Juan Pérez', 'Tardes');

    expect(db.getProfesores()).toHaveLength(1);
    expect(db.getProfesores()[0]).toMatchObject({ id: pid, nombre: 'Juan Pérez', nota: 'Tardes' });

    const practica = db.getPracticasByAlumno(aid).find(p => p.id === practId);
    expect(practica.profesor_id).toBe(pid);
    expect(practica.profesor_nombre).toBe('Juan Pérez'); // re-derivado, no cacheado
  });

  test('updateProfesor marca el profesor para sync aunque ya estuviera sincronizado', () => {
    const pid = db.addProfesor('Juan', '');
    fs.unlinkSync(pendingFile);

    db.updateProfesor(pid, 'Juan Pérez', 'Tardes');

    expect(pending().profesores).toContain(pid);
  });
});

describe('renombrar alumno', () => {
  test('updateAlumno conserva el id y sus prácticas siguen apuntando a él', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pid = db.addPractica(aid, vid, '2026-07-01', 0, 40);

    db.updateAlumno(aid, 'Ana García', 'A', vid);

    expect(db.getAlumnos()).toHaveLength(1);
    expect(db.getAlumnos()[0]).toMatchObject({ id: aid, nombre: 'Ana García', permiso: 'A', vehiculo_id: vid });

    const practica = db.getPracticasByAlumno(aid).find(p => p.id === pid);
    expect(practica.alumno_id).toBe(aid);
  });

  test('updateAlumno marca el alumno para sync aunque ya estuviera sincronizado', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    fs.unlinkSync(pendingFile);

    db.updateAlumno(aid, 'Ana García', 'A', vid);

    expect(pending().alumnos).toContain(aid);
  });
});
