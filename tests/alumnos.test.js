// Tests del profesor_id opcional en Alumnos (db.js): addAlumno/updateAlumno lo
// conservan y getAlumnos deriva profesor_nombre, igual que hace con vehiculo_nombre.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('addAlumno acepta profesor_id opcional y getAlumnos deriva el nombre', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const pid = db.addProfesor('Juan', '');

  const aid = db.addAlumno('Ana', 'B', vid, pid);
  let alumnos = db.getAlumnos();
  expect(alumnos.find(a => a.id === aid)).toMatchObject({ profesor_id: pid, profesor_nombre: 'Juan' });

  // Sin profesor_id: queda sin asignar (null), no revienta
  const aid2 = db.addAlumno('Luis', 'B', vid);
  alumnos = db.getAlumnos();
  const a2 = alumnos.find(a => a.id === aid2);
  expect(a2.profesor_id).toBeNull();
  expect(a2.profesor_nombre).toBeNull();
});

test('updateAlumno conserva/cambia el profesor asignado', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const pid = db.addProfesor('Juan', '');
  const pid2 = db.addProfesor('María', '');
  const aid = db.addAlumno('Ana', 'B', vid);

  db.updateAlumno(aid, 'Ana', 'B', vid, pid);
  let alumnos = db.getAlumnos();
  expect(alumnos.find(a => a.id === aid)).toMatchObject({ profesor_id: pid, profesor_nombre: 'Juan' });

  // Cambiar el profesor asignado
  db.updateAlumno(aid, 'Ana', 'B', vid, pid2);
  alumnos = db.getAlumnos();
  expect(alumnos.find(a => a.id === aid)).toMatchObject({ profesor_id: pid2, profesor_nombre: 'María' });

  // Quitar el profesor ("Sin profesor" en el selector = valor vacío)
  db.updateAlumno(aid, 'Ana', 'B', vid, '');
  alumnos = db.getAlumnos();
  const a = alumnos.find(x => x.id === aid);
  expect(a.profesor_id).toBeNull();
  expect(a.profesor_nombre).toBeNull();
});

test('borrar un profesor no borra ni desasigna a sus alumnos: conservan el profesor_id', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const pid = db.addProfesor('Juan', '');
  const aid = db.addAlumno('Ana', 'B', vid, pid);

  db.deleteProfesor(pid);

  const alumnos = db.getAlumnos();
  const a = alumnos.find(x => x.id === aid);
  expect(a.profesor_id).toBe(pid); // conserva el id aunque el profesor ya no exista
  expect(a.profesor_nombre).toBeNull(); // ya no se puede resolver el nombre
});
