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
    { fecha: '05/07/2026', hora: '', km_inicial: '40', km_final: '80' },
    { fecha: '10/07/2026', hora: '10:30', km_inicial: '100', km_final: '150' },
  ]);

  const circulacion = db.getDatosFichaDGT(aid, 'circulacion');
  expect(circulacion.practicas).toEqual([
    { fecha: '01/07/2026', hora: '09:00', km_inicial: '0', km_final: '40' },
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
