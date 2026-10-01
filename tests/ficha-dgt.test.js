// Tests de db.getDatosFichaDGT (datos para el impreso oficial DGT de
// formación práctica) y del round-trip de los campos nuevos: hora_inicio de
// práctica, primer_apellido/segundo_apellido/codigo_postal/poblacion del
// alumno, y dni del profesor. Registro LOCAL: no toca sync.js.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('getDatosFichaDGT con alumno inexistente devuelve null', () => {
  expect(db.getDatosFichaDGT(999, 'circulacion')).toBeNull();
});

test('getDatosFichaDGT filtra por tipo (destreza -> pista, circulacion -> circulacion), formatea fecha y devuelve alumno/profesor/practicas', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const pid = db.addProfesor('Juan', '', null, '11111111A');
  const aid = db.addAlumno('Ana', 'B', vid, pid, null, null, {
    dni: '22222222B',
    primer_apellido: 'García',
    segundo_apellido: 'López',
    direccion: 'Calle Mayor 1',
    codigo_postal: '28001',
    poblacion: 'Madrid',
  });

  // Sembradas fuera de orden a propósito, para comprobar el ordenado por fecha.
  db.addPractica(aid, vid, '2026-07-10', 100, 150, pid, 'pista', null, '10:30');
  db.addPractica(aid, vid, '2026-07-01', 0, 40, pid, 'circulacion', null, '09:00');
  db.addPractica(aid, vid, '2026-07-05', 40, 80, pid, 'pista', null, null);

  const destreza = db.getDatosFichaDGT(aid, 'destreza');
  expect(destreza.alumno).toMatchObject({
    dni: '22222222B', permiso: 'B', nombre: 'Ana',
    primer_apellido: 'García', segundo_apellido: 'López',
    direccion: 'Calle Mayor 1', codigo_postal: '28001', poblacion: 'Madrid',
  });
  expect(destreza.profesor).toEqual({ nombre: 'Juan', dni: '11111111A' });
  // Solo las 2 prácticas de tipo 'pista', ordenadas por fecha ascendente.
  expect(destreza.practicas).toEqual([
    { fecha: '05/07/2026', hora: '', km_inicial: '40', km_final: '80', clases: 1, ejercicio: '1 CLASE' },
    { fecha: '10/07/2026', hora: '10:30', km_inicial: '100', km_final: '150', clases: 1, ejercicio: '1 CLASE' },
  ]);

  const circulacion = db.getDatosFichaDGT(aid, 'circulacion');
  expect(circulacion.practicas).toEqual([
    { fecha: '01/07/2026', hora: '09:00', km_inicial: '0', km_final: '40', clases: 1, ejercicio: '1 CLASE' },
  ]);
});

test('getDatosFichaDGT agrupa las clases del mismo día en una fila: "1 CLASE" si fue una, "2 CLASES" si fueron 2 o más', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  // Día 1: dos clases seguidas (sembradas al revés para comprobar el orden por hora)
  db.addPractica(aid, vid, '2026-09-08', 207955, 208000, null, 'circulacion', null, '10:45');
  db.addPractica(aid, vid, '2026-09-08', 207908, 207955, null, 'circulacion', null, '10:00');
  // Día 2: una sola clase
  db.addPractica(aid, vid, '2026-09-09', 208000, 208040, null, 'circulacion', null, '09:00');
  // Día 3: tres clases (el impreso admite como mucho "2 CLASES")
  db.addPractica(aid, vid, '2026-09-10', 208040, 208080, null, 'circulacion', null, '09:00');
  db.addPractica(aid, vid, '2026-09-10', 208080, 208120, null, 'circulacion', null, '09:45');
  db.addPractica(aid, vid, '2026-09-10', 208120, 208160, null, 'circulacion', null, '10:30');

  expect(db.getDatosFichaDGT(aid, 'circulacion').practicas).toEqual([
    { fecha: '08/09/2026', hora: '10:00', km_inicial: '207908', km_final: '208000', clases: 2, ejercicio: '2 CLASES' },
    { fecha: '09/09/2026', hora: '09:00', km_inicial: '208000', km_final: '208040', clases: 1, ejercicio: '1 CLASE' },
    { fecha: '10/09/2026', hora: '09:00', km_inicial: '208040', km_final: '208160', clases: 3, ejercicio: '2 CLASES' },
  ]);
});

test('getDatosFichaDGT excluye prácticas borradas', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.deletePractica(pid);

  const datos = db.getDatosFichaDGT(aid, 'circulacion');
  expect(datos.practicas).toEqual([]);
});

// ─── Round-trip de los campos nuevos ───────────────────────────────────────

test('addPractica/updatePractica guardan y devuelven hora_inicio', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);

  const pid = db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion', null, '09:15');
  let p = db.getPracticasByAlumno(aid)[0];
  expect(p.hora_inicio).toBe('09:15');

  db.updatePractica(pid, '2026-07-01', 0, 40, null, 'circulacion', '10:45');
  p = db.getPracticasByAlumno(aid)[0];
  expect(p.hora_inicio).toBe('10:45');

  // Omitir hora_inicio (compat con llamadas antiguas) -> null.
  db.updatePractica(pid, '2026-07-01', 0, 40);
  p = db.getPracticasByAlumno(aid)[0];
  expect(p.hora_inicio).toBeNull();
});

test('addAlumno/updateAlumno guardan y devuelven primer_apellido/segundo_apellido/codigo_postal/poblacion', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid, null, null, null, {
    primer_apellido: 'García', segundo_apellido: 'López',
    codigo_postal: '28001', poblacion: 'Madrid',
  });

  let a = db.getAlumnos().find(x => x.id === aid);
  expect(a.primer_apellido).toBe('García');
  expect(a.segundo_apellido).toBe('López');
  expect(a.codigo_postal).toBe('28001');
  expect(a.poblacion).toBe('Madrid');

  // updateAlumno normaliza TODO el grupo CAMPOS_DATOS_ALUMNO a la vez (igual
  // que hace el formulario real, que siempre manda los 4 campos): hay que
  // repetir los que no cambian o se pisan a null.
  db.updateAlumno(aid, 'Ana', 'B', vid, null, null, {
    primer_apellido: 'García', segundo_apellido: 'López',
    codigo_postal: '28001', poblacion: 'Barcelona',
  });
  a = db.getAlumnos().find(x => x.id === aid);
  expect(a.poblacion).toBe('Barcelona');
  expect(a.primer_apellido).toBe('García');
});

test('addProfesor/updateProfesor guardan y devuelven dni', () => {
  const pid = db.addProfesor('Juan', '', null, '11111111A');
  let p = db.getProfesores().find(x => x.id === pid);
  expect(p.dni).toBe('11111111A');

  db.updateProfesor(pid, 'Juan', '', '99999999Z');
  p = db.getProfesores().find(x => x.id === pid);
  expect(p.dni).toBe('99999999Z');
});
