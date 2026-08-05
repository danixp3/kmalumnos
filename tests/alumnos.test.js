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

test('addAlumno/updateAlumno guardan y devuelven el email (opcional)', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);

  // addAlumno: con email
  const aid = db.addAlumno('Ana', 'B', vid, null, null, ' ana@correo.com ');
  let alumnos = db.getAlumnos();
  expect(alumnos.find(a => a.id === aid).email).toBe('ana@correo.com'); // trim

  // addAlumno: sin email (opcional, no revienta)
  const aid2 = db.addAlumno('Luis', 'B', vid);
  alumnos = db.getAlumnos();
  expect(alumnos.find(a => a.id === aid2).email).toBeNull();

  // updateAlumno: añade email a un alumno que no lo tenía
  db.updateAlumno(aid2, 'Luis', 'B', vid, null, 'luis@correo.com');
  alumnos = db.getAlumnos();
  expect(alumnos.find(a => a.id === aid2).email).toBe('luis@correo.com');

  // updateAlumno: quitar el email (vacío → null)
  db.updateAlumno(aid, 'Ana', 'B', vid, null, '');
  alumnos = db.getAlumnos();
  expect(alumnos.find(a => a.id === aid).email).toBeNull();
});

test('addAlumno/updateAlumno guardan y devuelven los 6 campos de ficha ampliada (opcionales)', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const datosCompletos = {
    telefono: ' 600123456 ',
    dni: ' 12345678A ',
    fecha_nacimiento: '2000-01-15',
    direccion: ' Calle Falsa 123 ',
    fecha_alta: '2026-01-01',
    observaciones: ' Alumno puntual '
  };

  // addAlumno: con los 6 campos (trim aplicado)
  const aid = db.addAlumno('Ana', 'B', vid, null, null, null, datosCompletos);
  let alumnos = db.getAlumnos();
  let a = alumnos.find(x => x.id === aid);
  expect(a.telefono).toBe('600123456');
  expect(a.dni).toBe('12345678A');
  expect(a.fecha_nacimiento).toBe('2000-01-15');
  expect(a.direccion).toBe('Calle Falsa 123');
  expect(a.fecha_alta).toBe('2026-01-01');
  expect(a.observaciones).toBe('Alumno puntual');

  // addAlumno: sin `datos` (opcional, no revienta, compat con llamadas antiguas)
  const aid2 = db.addAlumno('Luis', 'B', vid);
  alumnos = db.getAlumnos();
  const a2 = alumnos.find(x => x.id === aid2);
  expect(a2.telefono).toBeNull();
  expect(a2.dni).toBeNull();
  expect(a2.fecha_nacimiento).toBeNull();
  expect(a2.direccion).toBeNull();
  expect(a2.fecha_alta).toBeNull();
  expect(a2.observaciones).toBeNull();

  // updateAlumno: añade los campos a un alumno que no los tenía
  db.updateAlumno(aid2, 'Luis', 'B', vid, null, null, { telefono: '699000111', dni: '', fecha_nacimiento: '', direccion: '', fecha_alta: '', observaciones: '' });
  alumnos = db.getAlumnos();
  expect(alumnos.find(x => x.id === aid2).telefono).toBe('699000111');

  // updateAlumno: vacío → null (quitar un campo)
  db.updateAlumno(aid, 'Ana', 'B', vid, null, null, { ...datosCompletos, telefono: '' });
  alumnos = db.getAlumnos();
  expect(alumnos.find(x => x.id === aid).telefono).toBeNull();
  expect(alumnos.find(x => x.id === aid).dni).toBe('12345678A'); // el resto se conserva

  // updateAlumno: sin `datos` (opcional, no toca los campos ya guardados)
  db.updateAlumno(aid, 'Ana', 'B', vid);
  alumnos = db.getAlumnos();
  expect(alumnos.find(x => x.id === aid).dni).toBe('12345678A');
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
