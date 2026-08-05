// Tests del módulo de exámenes: presentaciones a convocatoria, tasas y
// estadísticas de aprobados. Registro LOCAL: no toca sync.js, solo la capa
// de datos db/convocatorias.js.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('addPresentacion crea el registro y getPresentaciones lo devuelve', () => {
  const p = db.addPresentacion({ alumno_id: 1, tipo: 'teorico', fecha: '2026-08-10' });
  expect(p).toMatchObject({ alumno_id: 1, tipo: 'teorico', fecha: '2026-08-10', resultado: 'pendiente', n_convocatoria: 1 });

  const lista = db.getPresentaciones();
  expect(lista).toHaveLength(1);
  expect(lista[0].id).toBe(p.id);
});

test('addPresentacion con tipo inválido lanza Error', () => {
  expect(() => db.addPresentacion({ alumno_id: 1, tipo: 'practico', fecha: '2026-08-10' })).toThrow();
});

test('addPresentacion con resultado inválido lanza Error', () => {
  expect(() => db.addPresentacion({ alumno_id: 1, tipo: 'teorico', fecha: '2026-08-10', resultado: 'suspenso' })).toThrow();
});

test('setResultadoPresentacion cambia el resultado; resultado inválido rechazado', () => {
  const p = db.addPresentacion({ alumno_id: 1, tipo: 'maniobras', fecha: '2026-08-10' });
  db.setResultadoPresentacion(p.id, 'apto');
  expect(db.getPresentaciones()[0].resultado).toBe('apto');

  expect(() => db.setResultadoPresentacion(p.id, 'raro')).toThrow();
});

test('addTasa + getTasasAlumno devuelve solo las de ese alumno', () => {
  db.addTasa({ alumno_id: 1, concepto: 'Tasa examen', fecha_compra: '2026-08-01', importe: 27.5 });
  db.addTasa({ alumno_id: 2, concepto: 'Tasa examen', fecha_compra: '2026-08-01', importe: 27.5 });

  const deAlumno1 = db.getTasasAlumno(1);
  expect(deAlumno1).toHaveLength(1);
  expect(deAlumno1[0].alumno_id).toBe(1);
});

test('addTasa con estado inválido lanza Error', () => {
  expect(() => db.addTasa({ alumno_id: 1, concepto: 'Tasa', estado: 'perdida' })).toThrow();
});

test('getEstadisticasAprobados calcula ratio global, por tipo y por profesor, ignorando pendiente/aplazado', () => {
  // 3 aptos, 1 no_apto, repartidos entre 2 profesores; más una pendiente y un aplazado que no deben contar.
  db.addPresentacion({ alumno_id: 1, tipo: 'teorico', fecha: '2026-08-01', profesor_id: 10, resultado: 'apto' });
  db.addPresentacion({ alumno_id: 2, tipo: 'teorico', fecha: '2026-08-02', profesor_id: 10, resultado: 'apto' });
  db.addPresentacion({ alumno_id: 3, tipo: 'circulacion', fecha: '2026-08-03', profesor_id: 20, resultado: 'apto' });
  db.addPresentacion({ alumno_id: 4, tipo: 'circulacion', fecha: '2026-08-04', profesor_id: 20, resultado: 'no_apto' });
  db.addPresentacion({ alumno_id: 5, tipo: 'maniobras', fecha: '2026-08-05', profesor_id: 10, resultado: 'pendiente' });
  db.addPresentacion({ alumno_id: 6, tipo: 'maniobras', fecha: '2026-08-06', profesor_id: 10, resultado: 'aplazado' });

  const stats = db.getEstadisticasAprobados();

  expect(stats.global).toEqual({ presentados: 4, aptos: 3, ratio: 0.75 });
  expect(stats.porTipo.teorico).toEqual({ presentados: 2, aptos: 2, ratio: 1 });
  expect(stats.porTipo.circulacion).toEqual({ presentados: 2, aptos: 1, ratio: 0.5 });
  expect(stats.porTipo.maniobras).toEqual({ presentados: 0, aptos: 0, ratio: 0 });

  const prof10 = stats.porProfesor.find(p => p.profesor_id === 10);
  const prof20 = stats.porProfesor.find(p => p.profesor_id === 20);
  expect(prof10).toMatchObject({ presentados: 2, aptos: 2, ratio: 1 });
  expect(prof20).toMatchObject({ presentados: 2, aptos: 1, ratio: 0.5 });
});

test('deletePresentacion y deleteTasa quitan de las listas', () => {
  const p = db.addPresentacion({ alumno_id: 1, tipo: 'teorico', fecha: '2026-08-10' });
  const t = db.addTasa({ alumno_id: 1, concepto: 'Tasa examen' });

  db.deletePresentacion(p.id);
  db.deleteTasa(t.id);

  expect(db.getPresentaciones()).toHaveLength(0);
  expect(db.getTasas()).toHaveLength(0);
});
