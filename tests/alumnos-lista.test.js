// Tests de getAlumnosLista: la tabla de Alumnos del rediseño en una sola llamada.
const db = require('../db');
const core = require('../db/core');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

const HOY = '2026-09-29';

test('devuelve un superconjunto de getAlumnos con nº de prácticas, km totales, última práctica y matrícula', () => {
  const vid = db.addVehiculo('Ibiza', '4821 LKM', 0);
  const pid = db.addProfesor('Javier', 8);
  const aid = db.addAlumno('Lucía', 'B', vid, pid);
  db.addPractica(aid, vid, '2026-09-10', 100, 120, pid, 'circulacion', null, '09:15');
  db.addPractica(aid, vid, '2026-09-20', 120, 150, pid, 'circulacion', null, '16:00');
  const [l] = db.getAlumnosLista(undefined, HOY);
  expect(l).toMatchObject({ nombre: 'Lucía', vehiculo_nombre: 'Ibiza', profesor_nombre: 'Javier', vehiculo_matricula: '4821 LKM' });
  expect(l.num_practicas).toBe(2);
  expect(l.km_total).toBe(50);
  expect(l.ultima_fecha).toBe('2026-09-20');
  expect(l.ultima_hora).toBe('16:00');
});

test('próxima clase = reserva solicitada/confirmada más cercana de hoy en adelante; ignora canceladas y pasadas', () => {
  const vid = db.addVehiculo('Ibiza', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addReserva({ alumno_id: aid, fecha: '2026-09-25', hora_inicio: '10:00', estado: 'confirmada' }); // pasada
  db.addReserva({ alumno_id: aid, fecha: '2026-10-05', hora_inicio: '11:00', estado: 'confirmada' });
  db.addReserva({ alumno_id: aid, fecha: '2026-10-01', hora_inicio: '09:00', estado: 'cancelada' });  // cancelada
  db.addReserva({ alumno_id: aid, fecha: '2026-10-02', hora_inicio: '17:30', estado: 'solicitada' });
  const [l] = db.getAlumnosLista(undefined, HOY);
  expect(l.proxima_clase).toEqual({ fecha: '2026-10-02', hora_inicio: '17:30' });
});

test('próximo examen = presentación pendiente futura más cercana', () => {
  const vid = db.addVehiculo('Ibiza', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPresentacion({ alumno_id: aid, tipo: 'circulacion', fecha: '2026-10-21' });
  db.addPresentacion({ alumno_id: aid, tipo: 'maniobras', fecha: '2026-10-14' });
  db.addPresentacion({ alumno_id: aid, tipo: 'teorico', fecha: '2026-09-01' });                       // pasado
  const ex = db.addPresentacion({ alumno_id: aid, tipo: 'circulacion', fecha: '2026-10-07' });
  db.setResultadoPresentacion((ex && ex.id) || ex, 'apto');                                            // ya resuelto
  const [l] = db.getAlumnosLista(undefined, HOY);
  expect(l.proximo_examen).toEqual({ fecha: '2026-10-14', tipo: 'maniobras' });
});

test('bono activo no caducado: usadas/total/saldo; sin bono → null', () => {
  const vid = db.addVehiculo('Ibiza', '', 0);
  const a1 = db.addAlumno('Con bono', 'B', vid);
  db.addAlumno('Sin bono', 'B', vid);
  const b = db.addBono({ alumno_id: a1, nombre: 'Bono 20', n_clases: 20, precio: 400, fecha_compra: '2026-07-01' });
  db.consumirBono(b.id, 14);
  const lista = db.getAlumnosLista(undefined, HOY);
  expect(lista.find(x => x.nombre === 'Con bono').bono).toEqual({ usadas: 14, total: 20, saldo: 6, nombre: 'Bono 20' });
  expect(lista.find(x => x.nombre === 'Sin bono').bono).toBeNull();
});

test('en_clase_ahora: solo con práctica de hoy en curso; esa práctica no suma a prácticas ni km', () => {
  const vid = db.addVehiculo('Ibiza', '', 0);
  const aid = db.addAlumno('Pablo', 'B', vid);
  db.addPractica(aid, vid, '2026-09-20', 0, 20);
  const id = db.addPractica(aid, vid, HOY, 20, 0);
  const [l] = db.getAlumnosLista(undefined, HOY);
  expect(l.en_clase_ahora).toBe(true);
  expect(l.num_practicas).toBe(1);
  expect(l.km_total).toBe(20);
});

// ─── getFichaAlumno ────────────────────────────────────────────────────────
describe('getFichaAlumno', () => {
  test('devuelve null si el alumno no existe', () => {
    expect(db.getFichaAlumno(999, HOY)).toBeNull();
  });

  test('historial numerado por fecha, métricas, días con clase y observaciones', () => {
    const vid = db.addVehiculo('Ibiza', '4821 LKM', 0);
    const pid = db.addProfesor('Javier', 8);
    const aid = db.addAlumno('Lucía', 'B', vid, pid);
    const p2 = db.addPractica(aid, vid, '2026-09-20', 120, 150, pid, 'circulacion', null, '16:00');
    const p1 = db.addPractica(aid, vid, '2026-09-10', 100, 120, pid, 'pista', null, '09:15');
    db.addPractica(aid, vid, '2026-09-25', 0, 0, pid);                        // sin km
    const dd = core.load();
    dd.practicas.find(x => x.id === p2).nota = 'Buen estacionamiento';
    dd.practicas.find(x => x.id === p1).trabajado = ['Glorietas', 'Cambios de carril'];
    dd.practicas.find(x => x.id === p2).trabajado = ['Glorietas'];

    const f = db.getFichaAlumno(aid, HOY);
    expect(f.practicas.map(p => p.n)).toEqual([1, 2, 3]);
    expect(f.practicas.map(p => p.fecha)).toEqual(['2026-09-10', '2026-09-20', '2026-09-25']);
    expect(f.practicas[0]).toMatchObject({ matricula: '4821 LKM', profesor_nombre: 'Javier', tipo: 'pista', km: 20, hora_inicio: '09:15' });
    expect(f.practicas[2].sinKm).toBe(true);
    expect(f.metricas).toEqual({ clases: 3, km: 50, mediaKm: 25 });   // la media ignora la práctica sin km
    expect(f.dias.hechas).toEqual(['2026-09-10', '2026-09-20', '2026-09-25']);
    expect(f.observaciones).toEqual([{ practica_id: p2, n: 2, fecha: '2026-09-20', nota: 'Buen estacionamiento' }]);
    expect(f.trabajado).toEqual([{ nombre: 'Glorietas', veces: 2 }, { nombre: 'Cambios de carril', veces: 1 }]);
    expect(f.practicasConTrabajado).toBe(2);
  });

  test('próximas clases, días programados y próximo examen', () => {
    const vid = db.addVehiculo('Ibiza', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addReserva({ alumno_id: aid, fecha: '2026-10-05', hora_inicio: '16:00', estado: 'confirmada' });
    db.addReserva({ alumno_id: aid, fecha: '2026-10-01', hora_inicio: '09:15', estado: 'confirmada' });
    db.addReserva({ alumno_id: aid, fecha: '2026-10-03', hora_inicio: '09:15', estado: 'cancelada' });
    db.addPresentacion({ alumno_id: aid, tipo: 'circulacion', fecha: '2026-10-14' });
    const f = db.getFichaAlumno(aid, HOY);
    expect(f.proximasClases.map(c => c.fecha)).toEqual(['2026-10-01', '2026-10-05']);
    expect(f.dias.programadas).toEqual(['2026-10-01', '2026-10-05']);
    expect(f.dias.examenes).toEqual(['2026-10-14']);
    expect(f.proximoExamen).toMatchObject({ fecha: '2026-10-14', tipo: 'circulacion' });
  });

  test('una práctica en curso aparece en el historial pero no cuenta como clase ni km', () => {
    const vid = db.addVehiculo('Ibiza', '', 0);
    const aid = db.addAlumno('Pablo', 'B', vid);
    db.addPractica(aid, vid, '2026-09-20', 0, 20);
    const id = db.addPractica(aid, vid, HOY, 20, 0);
    const f = db.getFichaAlumno(aid, HOY);
    expect(f.practicas).toHaveLength(2);
    expect(f.practicas[1].enCurso).toBe(true);
    expect(f.metricas.clases).toBe(1);
    expect(f.metricas.km).toBe(20);
  });
});

test('setNotaPractica guarda la observación de una práctica concreta sin crear prácticas, y la borra con texto vacío', () => {
  const vid = db.addVehiculo('Ibiza', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const p1 = db.addPractica(aid, vid, '2026-09-20', 0, 20);
  expect(db.setNotaPractica(p1, '  Repasar rotondas  ')).toEqual({ ok: true });
  expect(db.getFichaAlumno(aid, HOY).observaciones[0].nota).toBe('Repasar rotondas');
  expect(db.getPracticasByAlumno(aid)).toHaveLength(1);
  db.setNotaPractica(p1, '');
  expect(db.getFichaAlumno(aid, HOY).observaciones).toHaveLength(0);
  expect(db.setNotaPractica(9999, 'x')).toEqual({ ok: false });
});
