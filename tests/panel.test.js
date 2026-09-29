// Tests de getPanel: datos de la pantalla "Panel" del rediseño.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

// 2026-09-29 es martes.
const HOY = '2026-09-29';

test('cifras del día y del mes: prácticas, km, media y programadas (reservas)', () => {
  const vid = db.addVehiculo('Ibiza', '4821 LKM', 0);
  const aid = db.addAlumno('Lucía Martín', 'B', vid);
  db.addPractica(aid, vid, '2026-09-01', 0, 20);
  db.addPractica(aid, vid, HOY, 20, 40);
  db.addPractica(aid, vid, HOY, 40, 70);
  db.addPractica(aid, vid, '2026-08-20', 70, 200); // otro mes: no cuenta
  db.addReserva({ alumno_id: aid, fecha: HOY, hora_inicio: '10:00' });
  db.addReserva({ alumno_id: aid, fecha: HOY, hora_inicio: '11:00' });
  db.addReserva({ alumno_id: aid, fecha: HOY, hora_inicio: '12:00', estado: 'cancelada' });
  db.addReserva({ alumno_id: aid, fecha: HOY, hora_inicio: '13:00' });
  db.addReserva({ alumno_id: aid, fecha: HOY, hora_inicio: '14:00' });

  const p = db.getPanel(HOY);
  expect(p.practicasHoy).toBe(2);
  expect(p.programadasHoy).toBe(4);           // 4 reservas no canceladas > 2 prácticas
  expect(p.kmMes).toBe(70);                   // 20 (1 sep) + 20 + 30 (hoy); agosto no cuenta
  expect(p.practicasMes).toBe(3);
  expect(p.mediaKmPractica).toBeCloseTo(23.3, 1);
});

test('programadasHoy nunca es menor que las prácticas ya hechas', () => {
  const vid = db.addVehiculo('Ibiza', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, HOY, 0, 10);
  db.addPractica(aid, vid, HOY, 10, 20);
  expect(db.getPanel(HOY).programadasHoy).toBe(2);
});

test('prácticas por día: solo hasta hoy, fines de semana solo con actividad, hoy marcado y media laborable', () => {
  const vid = db.addVehiculo('Ibiza', '', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-09-01', 0, 10);   // martes
  db.addPractica(aid, vid, '2026-09-01', 10, 20);
  db.addPractica(aid, vid, '2026-09-02', 20, 30);  // miércoles
  db.addPractica(aid, vid, '2026-09-05', 30, 40);  // sábado con actividad
  db.addPractica(aid, vid, HOY, 40, 50);

  const p = db.getPanel(HOY);
  const dias = p.porDia.map(x => x.dia);
  expect(dias[0]).toBe(1);
  expect(dias).toContain(5);                       // sábado con actividad
  expect(dias).not.toContain(6);                   // domingo sin actividad
  expect(dias[dias.length - 1]).toBe(29);
  expect(p.porDia.find(x => x.dia === 29).hoy).toBe(true);
  expect(p.porDia.find(x => x.dia === 1).n).toBe(2);
  // media sobre laborables ANTERIORES a hoy: (2 + 1) / laborables con 0 incluidos
  expect(p.mediaPorDia).toBeGreaterThan(0);
  expect(p.porDia.every(x => x.dia <= 29)).toBe(true);
});

test('en curso: solo prácticas de hoy con km inicial y sin km final, con matrícula y profesor', () => {
  const vid = db.addVehiculo('Ibiza', '4821 LKM', 0);
  const pid = db.addProfesor('Javier Ruiz', 8);
  const aid = db.addAlumno('Pablo Ortega', 'B', vid, pid);
  const id = db.addPractica(aid, vid, HOY, 48204, 0, pid, 'circulacion', null, '10:03');
  db.addPractica(aid, vid, HOY, 48180, 48198, pid);   // termina 6 km antes de donde empieza la de curso

  const p = db.getPanel(HOY);
  expect(p.enCursoAhora).toBe(1);
  expect(p.enCurso[0]).toMatchObject({ alumno: 'Pablo Ortega', matricula: '4821 LKM', profesor: 'Javier Ruiz', hora_inicio: '10:03', km_inicial: 48204, hueco_km: 6 });
  // una práctica en curso no suma km al mes
  expect(p.kmMes).toBe(18);
});

test('alumnos activos excluye baja/aprobado y alumnosConExamen cuenta presentaciones pendientes futuras', () => {
  const vid = db.addVehiculo('Ibiza', '', 0);
  const a1 = db.addAlumno('Uno', 'B', vid);
  const a2 = db.addAlumno('Dos', 'B', vid, null, null, null, { estado: 'baja' });
  const a3 = db.addAlumno('Tres', 'B', vid, null, null, null, { estado: 'en_practicas' });
  db.addPresentacion({ alumno_id: a1, tipo: 'circulacion', fecha: '2026-10-14' });
  db.addPresentacion({ alumno_id: a1, tipo: 'maniobras', fecha: '2026-10-20' });   // mismo alumno: cuenta 1
  db.addPresentacion({ alumno_id: a3, tipo: 'circulacion', fecha: '2026-09-01' });  // pasada: no cuenta
  const p = db.getPanel(HOY);
  expect(p.alumnosActivos).toBe(2);
  expect(p.alumnosConExamen).toBe(1);
  expect(p.proximosExamenes.map(x => x.fecha)).toEqual(['2026-10-14', '2026-10-20']);
  expect(p.proximosExamenes[0].alumno).toBe('Uno');
  void a2;
});

test('bonos casi agotados: quedan 2 o menos, activos y no caducados', () => {
  const vid = db.addVehiculo('Ibiza', '', 0);
  const aid = db.addAlumno('Irene', 'B', vid);
  const otro = db.addAlumno('Otro', 'B', vid);
  const b1 = db.addBono({ alumno_id: aid, nombre: 'Bono 24', n_clases: 24, precio: 500, fecha_compra: '2026-07-01' }).id;
  db.consumirBono(b1, 22);
  db.addBono({ alumno_id: otro, nombre: 'Bono 10', n_clases: 10, precio: 200, fecha_compra: '2026-07-01' });
  db.addPresentacion({ alumno_id: aid, tipo: 'circulacion', fecha: '2026-10-14' });
  const p = db.getPanel(HOY);
  expect(p.bonosCasiAgotados).toHaveLength(1);
  expect(p.bonosCasiAgotados[0]).toMatchObject({ alumno: 'Irene', usadas: 22, total: 24, saldo: 2, examen: '2026-10-14' });
});
