// Tests de la entidad Profesores en db.js: CRUD, soft-delete (las prácticas ya
// impartidas conservan su profesor_id aunque se borre el profesor) y el
// profesor_id opcional en las funciones de prácticas.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('CRUD de profesores', () => {
  const id = db.addProfesor('Juan', 'Mañanas');
  let profesores = db.getProfesores();
  expect(profesores).toHaveLength(1);
  expect(profesores[0]).toMatchObject({ id, nombre: 'Juan', nota: 'Mañanas', num_practicas: 0 });

  db.updateProfesor(id, 'Juan Pérez', 'Tardes');
  profesores = db.getProfesores();
  expect(profesores[0]).toMatchObject({ nombre: 'Juan Pérez', nota: 'Tardes' });

  db.deleteProfesor(id);
  expect(db.getProfesores()).toHaveLength(0);
});

test('borrar un profesor no borra ni desasigna sus prácticas: conservan el profesor_id', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addProfesor('Juan', '');
  db.addPractica(aid, vid, '2026-07-01', 0, 40, pid);

  db.deleteProfesor(pid);

  expect(db.getProfesores()).toHaveLength(0);
  const practicas = db.getPracticasByAlumno(aid);
  expect(practicas).toHaveLength(1);
  expect(practicas[0].profesor_id).toBe(pid); // conserva el id aunque el profesor ya no exista
  expect(practicas[0].profesor_nombre).toBeNull(); // ya no se puede resolver el nombre
});

test('addPractica y updatePractica aceptan profesor_id opcional', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addProfesor('Juan', '');

  const practId = db.addPractica(aid, vid, '2026-07-01', 0, 40, pid);
  let practicas = db.getPracticasByAlumno(aid);
  expect(practicas.find(p => p.id === practId).profesor_id).toBe(pid);
  expect(practicas.find(p => p.id === practId).profesor_nombre).toBe('Juan');
  expect(db.getProfesores()[0].num_practicas).toBe(1);

  // Sin profesor_id: queda sin asignar (null), no revienta
  const practId2 = db.addPractica(aid, vid, '2026-07-02', 40, 80);
  practicas = db.getPracticasByAlumno(aid);
  expect(practicas.find(p => p.id === practId2).profesor_id).toBeNull();

  // Editar cambia el profesor asignado
  const pid2 = db.addProfesor('María', '');
  db.updatePractica(practId, '2026-07-01', 0, 40, pid2);
  practicas = db.getPracticasByAlumno(aid);
  expect(practicas.find(p => p.id === practId).profesor_id).toBe(pid2);

  // Quitar el profesor ("Sin profesor" en el selector = valor vacío)
  db.updatePractica(practId, '2026-07-01', 0, 40, '');
  practicas = db.getPracticasByAlumno(aid);
  expect(practicas.find(p => p.id === practId).profesor_id).toBeNull();
});

test('ajustarPracticasAlumno (registro rápido) asigna el profesor seleccionado a las prácticas nuevas', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addProfesor('Juan', '');

  const res = db.ajustarPracticasAlumno(vid, '2026-07-01', aid, 1, pid);

  expect(res.num_practicas).toBe(1);
  const practicas = db.getPracticasByAlumno(aid);
  expect(practicas[0].profesor_id).toBe(pid);
});

test('guardarNotaAlumno asigna el profesor seleccionado cuando crea una práctica nueva', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addProfesor('Juan', '');

  const res = db.guardarNotaAlumno(vid, '2026-07-01', aid, 'Buena práctica', pid);

  expect(res.created).toBe(true);
  const practicas = db.getPracticasByAlumno(aid);
  expect(practicas[0].profesor_id).toBe(pid);
  expect(practicas[0].nota).toBe('Buena práctica');
});
