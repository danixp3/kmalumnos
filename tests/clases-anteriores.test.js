// Clases anteriores a la app (Puesta en marcha, 2026-10-01): anotarlas a mano
// y crear el resto con fecha y km sin solapes ni incoherencias.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resetData, userDataDir } = require('./helpers');

const HOY = '2026-10-01';
const OPC = { kmMin: 40, kmMax: 45, duracion: 45, hoy: HOY };

beforeEach(() => { resetData(db); jest.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => jest.restoreAllMocks());

const leer = () => JSON.parse(fs.readFileSync(path.join(userDataDir, 'data.json'), 'utf-8'));
const pend = () => JSON.parse(fs.readFileSync(path.join(userDataDir, 'pending_sync.json'), 'utf-8'));
const aMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const dow = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };

function alumno(nombre, vid, pid, clases_previas, km_previos = 0) {
  const id = db.addAlumno(nombre, 'B', vid, pid);
  db.setPuntoDePartidaAlumno(id, clases_previas, km_previos);
  return id;
}

// Comprueba sobre TODAS las prácticas: sin solapes de km por coche, km que
// crecen con el tiempo, sin dos clases a la vez en un coche o un profesor, y
// los topes por día (2 alumno, 12 profesor, 12 coche) en las creadas.
function comprobarCoherencia(practicas, dur = 45) {
  const porCoche = new Map();
  for (const p of practicas) { if (!porCoche.has(p.vehiculo_id)) porCoche.set(p.vehiculo_id, []); porCoche.get(p.vehiculo_id).push(p); }
  for (const lista of porCoche.values()) {
    const conKm = lista.filter(p => p.km_final > 0).sort((a, b) => a.km_inicial - b.km_inicial);
    for (let i = 1; i < conKm.length; i++) expect(conKm[i].km_inicial).toBeGreaterThanOrEqual(conKm[i - 1].km_final);
    const tiempo = conKm.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio || '99').localeCompare(b.hora_inicio || '99'));
    for (let i = 1; i < tiempo.length; i++) if (tiempo[i].fecha > tiempo[i - 1].fecha) expect(tiempo[i].km_inicial).toBeGreaterThanOrEqual(tiempo[i - 1].km_final);
  }
  const franjas = new Map();
  for (const p of practicas.filter(p => p.hora_inicio)) {
    for (const k of [`v${p.vehiculo_id}|${p.fecha}`, p.profesor_id ? `p${p.profesor_id}|${p.fecha}` : null].filter(Boolean)) {
      const ini = aMin(p.hora_inicio);
      const otras = franjas.get(k) || [];
      for (const [a, b] of otras) expect(ini < b && a < ini + dur).toBe(false);
      otras.push([ini, ini + dur]); franjas.set(k, otras);
    }
  }
  const nuevas = practicas.filter(p => p.tipo_detalle === 'anterior');
  const cuenta = new Map();
  for (const p of nuevas) for (const k of [`a${p.alumno_id}|${p.fecha}`, `v${p.vehiculo_id}|${p.fecha}`, p.profesor_id ? `p${p.profesor_id}|${p.fecha}` : null].filter(Boolean)) cuenta.set(k, (cuenta.get(k) || 0) + 1);
  for (const [k, n] of cuenta) expect(n).toBeLessThanOrEqual(k[0] === 'a' ? 2 : 12);
}

test('sin anotar nada: crea las clases que faltan hacia atrás (laborables, 2 por día), con km encadenados que acaban en el km del coche', () => {
  const vid = db.addVehiculo('Kia', '1954LYT', 208000);
  const pid = db.addProfesor('Daniel');
  const a1 = alumno('David', vid, pid, 40);
  const a2 = alumno('Manuel', vid, pid, 30);
  const plan = db.planificarClasesAnteriores(OPC);
  expect(plan.ok).toBe(true);
  expect(plan.errores).toEqual([]);
  expect(plan.altas.filter(c => c.alumno_id === a1)).toHaveLength(40);
  expect(plan.altas.filter(c => c.alumno_id === a2)).toHaveLength(30);
  expect(plan.altas.every(c => c.fecha < HOY && dow(c.fecha) !== 0 && dow(c.fecha) !== 6)).toBe(true);
  // la última clase (la más reciente) termina justo en el km de hoy del coche
  expect(Math.max(...plan.altas.map(c => c.km_final))).toBe(208000);
  // con random=0.5 cada clase son 42-43 km (rango 40-45)
  expect(plan.altas.every(c => c.km_final - c.km_inicial >= 40 && c.km_final - c.km_inicial <= 45)).toBe(true);
  // encadenadas: sin huecos ni solapes
  const orden = plan.altas.slice().sort((x, y) => x.km_inicial - y.km_inicial);
  for (let i = 1; i < orden.length; i++) expect(orden[i].km_inicial).toBe(orden[i - 1].km_final);
  comprobarCoherencia(plan.altas.map(c => ({ ...c, tipo_detalle: 'anterior' })));
  const resumen = plan.alumnos.find(x => x.alumno_id === a1);
  expect(resumen).toMatchObject({ nuevas: 40, dias: 20 });
});

test('un profesor no da más de 12 clases al día (6 alumnos × 2) aunque tenga muchos alumnos; cada coche tampoco', () => {
  const pid = db.addProfesor('Laura');
  const coches = [db.addVehiculo('A', 'A1', 300000), db.addVehiculo('B', 'B1', 150000)];
  for (let i = 0; i < 9; i++) alumno('Alumno ' + i, coches[i % 2], pid, 10);
  const plan = db.planificarClasesAnteriores(OPC);
  expect(plan.ok).toBe(true);
  expect(plan.altas).toHaveLength(90);
  const porDia = new Map();
  for (const c of plan.altas) porDia.set(c.fecha, (porDia.get(c.fecha) || 0) + 1);
  expect(Math.max(...porDia.values())).toBe(12);
  comprobarCoherencia(plan.altas.map(c => ({ ...c, tipo_detalle: 'anterior' })));
});

test('mezcla: un alumno con sus clases anotadas a mano (con km) y otro sin datos en el mismo coche, sin solapes de km ni de horario', () => {
  const vid = db.addVehiculo('Kia', '1954LYT', 208000);
  const pid = db.addProfesor('Daniel');
  const ana = alumno('Ana', vid, pid, 4);
  const luis = alumno('Luis', vid, pid, 20);
  // Ana: 4 clases del papel, con km, en dos días seguidos
  const r = db.guardarClasesAnteriores(ana, [
    { fecha: '21/09/2026', hora_inicio: '10:00', km_inicial: '207.700', km_final: '207.745' },
    { fecha: '21/09/2026', hora_inicio: '10:45', km_inicial: '207745', km_final: '207790' },
    { fecha: '22/09/2026', hora_inicio: '10:00', km_inicial: '207790', km_final: '207830' },
    { fecha: '2026-09-22', hora_inicio: '10:45', km_inicial: '207830', km_final: '207875' }
  ]);
  expect(r).toMatchObject({ ok: true, anotadas: 4, pendientes: 0 });
  const plan = db.planificarClasesAnteriores(OPC);
  expect(plan.ok).toBe(true);
  expect(plan.altas.filter(c => c.alumno_id === luis)).toHaveLength(20);
  expect(plan.altas.some(c => c.alumno_id === ana)).toBe(false);
  // ningún día con clases de km conocidos en ese coche se mezcla
  expect(plan.altas.some(c => c.fecha === '2026-09-21' || c.fecha === '2026-09-22')).toBe(false);
  const todas = [...leer().practicas, ...plan.altas.map(c => ({ ...c, tipo_detalle: 'anterior' }))];
  comprobarCoherencia(todas);
  // las de Luis posteriores al 22/09 caben entre 207.875 y 208.000 (2 clases como mucho);
  // el resto va antes del 21/09, por debajo de 207.700
  for (const c of plan.altas) {
    if (c.fecha > '2026-09-22') { expect(c.km_inicial).toBeGreaterThanOrEqual(207875); expect(c.km_final).toBeLessThanOrEqual(208000); }
    else expect(c.km_final).toBeLessThanOrEqual(207700);
  }
});

test('las clases anotadas solo con fecha reciben km en la propuesta y al crear se guarda EXACTAMENTE lo previsualizado', () => {
  const vid = db.addVehiculo('Kia', '1954LYT', 208000);
  const pid = db.addProfesor('Daniel');
  const ana = alumno('Ana', vid, pid, 6);
  db.guardarClasesAnteriores(ana, [{ fecha: '08/09/2026' }, { fecha: '08/09/2026' }]);
  expect(db.getClasesAnteriores(ana)).toMatchObject({ total: 6, alumno: { clases_previas: 4 } });
  const plan = db.planificarClasesAnteriores(OPC);
  expect(plan.ok).toBe(true);
  expect(plan.km).toHaveLength(2);
  expect(plan.altas).toHaveLength(4);
  const r = db.aplicarClasesAnteriores(plan);
  expect(r).toMatchObject({ ok: true, creadas: 4, km_rellenadas: 2 });
  expect(fs.existsSync(r.copia)).toBe(true);
  const d = leer();
  const anteriores = d.practicas.filter(p => p.alumno_id === ana);
  expect(anteriores).toHaveLength(6);
  expect(anteriores.every(p => p.tipo_detalle === 'anterior' && p.km_final > p.km_inicial)).toBe(true);
  for (const c of plan.altas) expect(anteriores).toContainEqual(expect.objectContaining({ fecha: c.fecha, hora_inicio: c.hora_inicio, km_inicial: c.km_inicial, km_final: c.km_final }));
  for (const k of plan.km) expect(anteriores.find(p => p.id === k.id)).toMatchObject({ km_inicial: k.km_inicial, km_final: k.km_final });
  expect(d.alumnos.find(a => a.id === ana).clases_previas).toBe(0);
  comprobarCoherencia(d.practicas);
  // cuentan como clases del alumno (y en la ficha DGT, agrupadas por día)
  expect(db.getAlumnosLista().find(a => a.id === ana).num_practicas).toBe(6);
  expect(db.getDatosFichaDGT(ana, 'circulacion').practicas.find(p => p.fecha === '08/09/2026')).toMatchObject({ ejercicio: '2 CLASES' });
  // todo queda pendiente de subir a la nube
  expect(pend().practicas).toEqual(expect.arrayContaining(anteriores.map(p => p.id)));
  expect(pend().alumnos).toContain(ana);
  // la misma propuesta no se puede aplicar dos veces
  expect(db.aplicarClasesAnteriores(plan).ok).toBe(false);
});

test('las clases de un alumno que ya usa la app van ANTES de su primera clase y encadenan con su km', () => {
  const vid = db.addVehiculo('Kia', '1954LYT', 208000);
  const pid = db.addProfesor('Daniel');
  const ana = alumno('Ana', vid, pid, 10);
  db.addPractica(ana, vid, '2026-09-28', 207910, 207955, pid, 'circulacion', null, '10:00');
  db.addPractica(ana, vid, '2026-09-28', 207955, 208000, pid, 'circulacion', null, '10:45');
  const plan = db.planificarClasesAnteriores(OPC);
  expect(plan.ok).toBe(true);
  expect(plan.altas.every(c => c.fecha < '2026-09-28')).toBe(true);
  expect(Math.max(...plan.altas.map(c => c.km_final))).toBe(207910);
  comprobarCoherencia([...leer().practicas, ...plan.altas.map(c => ({ ...c, tipo_detalle: 'anterior' }))]);
});

test('alumnos con «km ya hechos» o sin coche no se crean (aviso); sin km en el coche, error claro', () => {
  const vid = db.addVehiculo('Kia', '1954LYT', 208000);
  const sinKm = db.addVehiculo('Nuevo', '0000AAA', 0);
  alumno('Con km', vid, null, 5, 300);
  alumno('Sin coche', null, null, 5);
  alumno('Coche sin km', sinKm, null, 3);
  const plan = db.planificarClasesAnteriores(OPC);
  expect(plan.avisos.join(' ')).toMatch(/Con km.*punto de partida/);
  expect(plan.avisos.join(' ')).toMatch(/Sin coche.*sin coche asignado/);
  expect(plan.ok).toBe(false);
  expect(plan.errores.join(' ')).toMatch(/Nuevo: falta el km de hoy/);
  expect(db.aplicarClasesAnteriores(plan).ok).toBe(false);
});

test('anotar a mano: valida fechas, km, solapes con otras clases del coche y el orden lógico (más antigua = menos km)', () => {
  const vid = db.addVehiculo('Kia', '1954LYT', 208000);
  const ana = alumno('Ana', vid, null, 5);
  const otro = db.addAlumno('Otro', 'B', vid);
  db.addPractica(otro, vid, '2026-09-10', 207000, 207045);
  const err = filas => db.guardarClasesAnteriores(ana, filas).errores.join(' | ');
  expect(err([{ fecha: '31/02/2026' }])).toMatch(/fecha no es válida/);
  expect(err([{ fecha: '01/12/2099' }])).toMatch(/todavía no ha llegado/);
  expect(err([{ fecha: '01/09/2026', km_inicial: 500, km_final: 400 }])).toMatch(/mayor que el inicial/);
  expect(err([{ fecha: '01/09/2026', km_inicial: 207020, km_final: 207060 }])).toMatch(/se solapan con la clase de Otro/);
  expect(err([{ fecha: '20/09/2026', km_inicial: 206000, km_final: 206040 }])).toMatch(/no encajan con la clase de Otro/);
  expect(err([{ fecha: '01/09/2026', km_inicial: 100, km_final: 140 }, { fecha: '02/09/2026', km_inicial: 120, km_final: 160 }])).toMatch(/Filas 1 y 2: sus km se solapan/);
  // nada se ha guardado con errores
  expect(db.getClasesAnteriores(ana).clases).toHaveLength(0);
  // bien: se guardan, y al quitar filas vuelven a contar como pendientes
  expect(db.guardarClasesAnteriores(ana, [{ fecha: '01/09/2026', hora_inicio: '9:30' }, { fecha: '02/09/2026' }, {}]).ok).toBe(true);
  expect(db.getClasesAnteriores(ana)).toMatchObject({ total: 5, alumno: { clases_previas: 3 } });
  expect(db.getClasesAnteriores(ana).clases[0]).toMatchObject({ fecha: '2026-09-01', hora_inicio: '09:30' });
  const [primera] = db.getClasesAnteriores(ana).clases;
  expect(db.guardarClasesAnteriores(ana, [{ id: primera.id, fecha: '01/09/2026', hora_inicio: '09:30' }]).ok).toBe(true);
  expect(db.getClasesAnteriores(ana)).toMatchObject({ total: 5, alumno: { clases_previas: 4 } });
  expect(pend().deleted.practicas.length).toBe(1);
});

test('Puesta en marcha: «Clases ya hechas» incluye las ya creadas y no deja bajar de ese número', () => {
  const vid = db.addVehiculo('Kia', '1954LYT', 208000);
  const ana = alumno('Ana', vid, null, 5);
  db.guardarClasesAnteriores(ana, [{ fecha: '01/09/2026' }, { fecha: '02/09/2026' }]);
  const fila = db.getPuestaEnMarcha().alumnos.find(a => a.id === ana);
  expect(fila).toMatchObject({ clases_previas: 3, anteriores: 2 });
  expect(db.getPuestaEnMarcha().resumen).toMatchObject({ clases_por_crear: 3, alumnos_por_crear: 1, clases_anteriores: 2 });
  // la pantalla muestra 5 (3 + 2); si se escribe 8, quedan 6 por crear
  expect(db.guardarPuestaEnMarcha({ alumnos: [{ id: ana, nombre: 'Ana', permiso: 'B', vehiculo_id: vid, clases_previas: '8' }] }).ok).toBe(true);
  expect(db.getClasesAnteriores(ana).alumno.clases_previas).toBe(6);
  const r = db.guardarPuestaEnMarcha({ alumnos: [{ id: ana, nombre: 'Ana', permiso: 'B', vehiculo_id: vid, clases_previas: '1' }] });
  expect(r.ok).toBe(false);
  expect(r.errores[0]).toMatch(/ya tiene 2 clases anteriores creadas/);
});

test('estrés con azar real: varios coches y profesores, alumnos anotados (con y sin km), otros sin datos y clases ya en la app; todo coherente al crear', () => {
  jest.restoreAllMocks();
  for (let ronda = 0; ronda < 5; ronda++) {
    resetData(db);
    const profes = [db.addProfesor('P1'), db.addProfesor('P2'), db.addProfesor('P3')];
    const coches = [db.addVehiculo('C1', 'M1', 250000), db.addVehiculo('C2', 'M2', 120000), db.addVehiculo('C3', 'M3', 90000)];
    const alumnos = [];
    for (let i = 0; i < 14; i++) alumnos.push(alumno('Al' + i, coches[i % 3], profes[i % 3], 5 + ((i * 7) % 36)));
    // clases de la app recientes, encadenadas hasta el km de cada coche
    coches.forEach((vid, k) => {
      const tope = [250000, 120000, 90000][k];
      db.addPractica(alumnos[k], vid, '2026-09-29', tope - 90, tope - 45, profes[k], 'circulacion', null, '09:00');
      db.addPractica(alumnos[k], vid, '2026-09-29', tope - 45, tope, profes[k], 'circulacion', null, '09:45');
    });
    // alumno 3: anotadas con km (coche C1) muy atrás; alumno 4: solo fechas
    expect(db.guardarClasesAnteriores(alumnos[3], [
      { fecha: '02/03/2026', hora_inicio: '11:00', km_inicial: 240000, km_final: 240044 },
      { fecha: '02/03/2026', hora_inicio: '11:45', km_inicial: 240044, km_final: 240088 }
    ]).ok).toBe(true);
    expect(db.guardarClasesAnteriores(alumnos[4], [{ fecha: '15/09/2026' }, { fecha: '16/09/2026' }, { fecha: '16/09/2026' }]).ok).toBe(true);
    const plan = db.planificarClasesAnteriores({ ...OPC, kmMin: 38, kmMax: 47 });
    expect(plan.errores).toEqual([]);
    const esperadas = db.getPuestaEnMarcha().resumen.clases_por_crear;
    expect(plan.altas).toHaveLength(esperadas);
    expect(db.aplicarClasesAnteriores(plan).ok).toBe(true);
    const d = leer();
    comprobarCoherencia(d.practicas);
    expect(d.alumnos.every(a => !(a.clases_previas > 0))).toBe(true);
    expect(d.practicas.filter(p => p.tipo_detalle === 'anterior').every(p => p.km_final > p.km_inicial && p.km_inicial > 0)).toBe(true);
  }
});
