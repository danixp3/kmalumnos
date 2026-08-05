// Tests del "libro de registro de alumnos" (RD 1295/2003 art. 39): campos
// permisos_posee/fecha_inicio/fecha_fin/resultado + numeración de inscripción
// (getSiguienteNumInscripcion/asignarNumInscripcion/backfillNumInscripcion) y
// getLibroRegistro. Mismo patrón de mock que tests/alumnos.test.js.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('addAlumno con libro guarda permisos_posee/fecha_inicio/fecha_fin/resultado', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const libro = {
    permisos_posee: ' B, A2 ',
    fecha_inicio: '2026-01-01',
    fecha_fin: '2026-06-01',
    resultado: 'apto'
  };
  const aid = db.addAlumno('Ana', 'B', vid, null, null, null, null, libro);
  const a = db.getAlumnos().find(x => x.id === aid);
  expect(a.permisos_posee).toBe('B, A2');
  expect(a.fecha_inicio).toBe('2026-01-01');
  expect(a.fecha_fin).toBe('2026-06-01');
  expect(a.resultado).toBe('apto');

  // Sin libro: no revienta, compat con llamadas antiguas
  const aid2 = db.addAlumno('Luis', 'B', vid);
  const a2 = db.getAlumnos().find(x => x.id === aid2);
  expect(a2.permisos_posee).toBeNull();
  expect(a2.fecha_inicio).toBeNull();
  expect(a2.fecha_fin).toBeNull();
  expect(a2.resultado).toBeNull();
});

test('updateAlumno con libro parcial no pisa las demás claves ya guardadas', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid, null, null, null, null, {
    permisos_posee: 'B',
    fecha_inicio: '2026-01-01',
    fecha_fin: '2026-06-01',
    resultado: 'apto'
  });

  // Update parcial: solo resultado
  db.updateAlumno(aid, 'Ana', 'B', vid, null, null, null, { resultado: 'no_apto' });
  const a = db.getAlumnos().find(x => x.id === aid);
  expect(a.resultado).toBe('no_apto');
  expect(a.permisos_posee).toBe('B'); // no se pisa
  expect(a.fecha_inicio).toBe('2026-01-01'); // no se pisa
  expect(a.fecha_fin).toBe('2026-06-01'); // no se pisa

  // Sin libro en el update: nada del libro cambia
  db.updateAlumno(aid, 'Ana', 'B', vid);
  const a2 = db.getAlumnos().find(x => x.id === aid);
  expect(a2.resultado).toBe('no_apto');
  expect(a2.permisos_posee).toBe('B');
});

test('resultado con valor inválido se guarda como null', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid, null, null, null, null, { resultado: 'pendiente' });
  const a = db.getAlumnos().find(x => x.id === aid);
  expect(a.resultado).toBeNull();

  db.updateAlumno(aid, 'Ana', 'B', vid, null, null, null, { resultado: 'inventado' });
  const a2 = db.getAlumnos().find(x => x.id === aid);
  expect(a2.resultado).toBeNull();
});

test('getSiguienteNumInscripcion incrementa correctamente', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  expect(db.getSiguienteNumInscripcion()).toBe(1);

  const aid = db.addAlumno('Ana', 'B', vid);
  db.asignarNumInscripcion(aid);
  expect(db.getSiguienteNumInscripcion()).toBe(2);

  const aid2 = db.addAlumno('Luis', 'B', vid);
  db.asignarNumInscripcion(aid2);
  expect(db.getSiguienteNumInscripcion()).toBe(3);
});

test('asignarNumInscripcion es idempotente', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);

  const n1 = db.asignarNumInscripcion(aid);
  const n2 = db.asignarNumInscripcion(aid);
  expect(n1).toBe(n2);
  expect(db.getAlumnos().find(x => x.id === aid).n_inscripcion).toBe(n1);
});

test('backfillNumInscripcion numera de forma secuencial y estable, respetando orden por fecha y no reasigna a los ya numerados', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  // Se crean en orden id ascendente pero con fechas de alta desordenadas.
  const aid1 = db.addAlumno('Alumno 1', 'B', vid, null, null, null, null); // sin fecha_alta
  const aid2 = db.addAlumno('Alumno 2', 'B', vid, null, null, null, { fecha_alta: '2026-01-01' });
  const aid3 = db.addAlumno('Alumno 3', 'B', vid, null, null, null, { fecha_alta: '2025-06-01' });

  // Un alumno ya numerado a mano: no debe tocarse ni contar para el orden.
  const aidYaNumerado = db.addAlumno('Ya numerado', 'B', vid, null, null, null, { fecha_alta: '2020-01-01' });
  db.asignarNumInscripcion(aidYaNumerado); // se lleva el nº 1

  const numerados = db.backfillNumInscripcion();
  expect(numerados).toBe(3);

  const alumnos = db.getAlumnos();
  const n = id => alumnos.find(x => x.id === id).n_inscripcion;

  expect(n(aidYaNumerado)).toBe(1); // no reasignado
  // Orden esperado por fecha_alta asc (sin fecha va al final = '9999-99-99'):
  // aid3 (2025-06-01) < aid2 (2026-01-01) < aid1 (sin fecha)
  expect(n(aid3)).toBe(2);
  expect(n(aid2)).toBe(3);
  expect(n(aid1)).toBe(4);

  // Llamar otra vez no reasigna nada (todos ya tienen número).
  expect(db.backfillNumInscripcion()).toBe(0);
});

test('getLibroRegistro devuelve los alumnos ordenados por n_inscripcion asc, sin número al final', () => {
  const vid = db.addVehiculo('Coche 1', '', 0);
  const aid1 = db.addAlumno('Zoe', 'B', vid); // sin número
  const aid2 = db.addAlumno('Ana', 'B', vid);
  const aid3 = db.addAlumno('Beto', 'B', vid);

  db.asignarNumInscripcion(aid3); // nº 1
  db.asignarNumInscripcion(aid2); // nº 2

  const libro = db.getLibroRegistro();
  expect(libro.map(a => a.nombre)).toEqual(['Beto', 'Ana', 'Zoe']);
  expect(libro[0].n_inscripcion).toBe(1);
  expect(libro[1].n_inscripcion).toBe(2);
  expect(libro[2].n_inscripcion).toBeNull();
  expect(aid1).toBeTruthy();
});
