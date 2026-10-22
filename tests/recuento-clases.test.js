// Recuento de clases coherente en toda la app (2026-10-22). Caso real: una
// alumna con 50 ½ clases en su lista salía con 51 ½ porque al anotar 42 de las
// 43 clases «ya hechas» la que faltaba se quedó sumando sin estar en ninguna
// lista. Además el semáforo, el Panel y las estadísticas de profesores
// contaban filas (½ clase = 1) en vez de clases. Y «hoy» en hora local.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resetData, userDataDir } = require('./helpers');

beforeEach(() => { resetData(db); });
afterEach(() => { jest.useRealTimers(); });

const leer = () => JSON.parse(fs.readFileSync(path.join(userDataDir, 'data.json'), 'utf-8'));
const fechas = n => Array.from({ length: n }, (_, i) => {
  const d = new Date(2026, 5, 1 + i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});
function hoyMenos(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('clases anotadas de menos (Puesta en marcha)', () => {
  function preparar() {
    const vid = db.addVehiculo('Kia', '1111AAA', 290000);
    const pid = db.addProfesor('Prof Prueba');
    const aid = db.addAlumno('Alumna', 'B', vid, pid);
    db.setPuntoDePartidaAlumno(aid, 43, 0);
    return { vid, pid, aid };
  }

  test('sin decir nada, la que falta queda «por crear» y suma al total (como antes)', () => {
    const { aid } = preparar();
    const r = db.guardarClasesAnteriores(aid, fechas(42).map(f => ({ fecha: f })));
    expect(r).toMatchObject({ ok: true, anotadas: 42, pendientes: 1 });
    const a = db.getAlumnosLista().find(x => x.id === aid);
    expect(a.num_practicas).toBe(43);
    expect(a.clases_previas).toBe(1);
  });

  test('«no hay más»: el total pasa a ser lo anotado y no queda nada sin fecha', () => {
    const { aid, vid, pid } = preparar();
    const r = db.guardarClasesAnteriores(aid, fechas(42).map(f => ({ fecha: f })), { sinMas: true });
    expect(r).toMatchObject({ ok: true, anotadas: 42, pendientes: 0 });
    // + 8 clases del móvil y una de ½ = 50 ½, no 51 ½
    for (let i = 0; i < 8; i++) db.addPractica(aid, vid, '2026-10-09', 0, 0, pid);
    const media = db.addPractica(aid, vid, '2026-08-03', 0, 0, pid);
    db.updatePractica(media, '2026-08-03', 0, 0, pid, 'circulacion', null, 0.5);
    const a = db.getAlumnosLista().find(x => x.id === aid);
    expect(a.num_practicas).toBe(50.5);
    expect(db.getFichaAlumno(aid).metricas).toMatchObject({ clases: 50.5, clases_previas: 0 });
    expect(leer().logs.some(l => /no hay más \(antes ponía 43\)/.test(l.descripcion))).toBe(true);
  });

  test('anotar más de las apuntadas sube el total (con o sin «no hay más»)', () => {
    const { aid } = preparar();
    expect(db.guardarClasesAnteriores(aid, fechas(45).map(f => ({ fecha: f })), { sinMas: true })).toMatchObject({ ok: true, pendientes: 0 });
    expect(db.getAlumnosLista().find(x => x.id === aid).num_practicas).toBe(45);
  });

  test('cambiar las clases sin fecha desde la ficha queda en el Historial', () => {
    const { aid } = preparar();
    db.setPuntoDePartidaAlumno(aid, 0, 0);
    const log = leer().logs.find(l => /Clases sin fecha \(antes de la app\)/.test(l.descripcion));
    expect(log.descripcion).toMatch(/43 → 0/);
    // sin cambios, no se anota nada
    const n = leer().logs.length;
    db.setPuntoDePartidaAlumno(aid, 0, 0);
    expect(leer().logs.length).toBe(n);
  });
});

describe('las estadísticas cuentan clases, no filas', () => {
  test('semáforo: ½ clase suma ½, las de antes de la app suman y la que está en curso no', () => {
    const vid = db.addVehiculo('Coche', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.setPuntoDePartidaAlumno(aid, 10, 0);
    for (let i = 0; i < 9; i++) db.addPractica(aid, vid, hoyMenos(3), 0, 0);
    const media = db.addPractica(aid, vid, hoyMenos(2), 0, 0);
    db.updatePractica(media, hoyMenos(2), 0, 0, null, 'circulacion', null, 0.5);
    db.addPractica(aid, vid, hoyMenos(0), 1000, 0); // en curso (km inicial, sin final)
    const s = db.getSemaforoAlumno(aid);
    expect(s.nPracticas).toBe(19.5);
    expect(s.motivo).toMatch(/^19 ½ prácticas/);
    expect(s.nivel).toBe('ambar');
  });

  test('profesores: ½ clase cuenta ½ en sus estadísticas y en la lista', () => {
    const vid = db.addVehiculo('Coche', '', 0);
    const pid = db.addProfesor('Juan', '');
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 0, 40, pid, 'circulacion');
    const media = db.addPractica(aid, vid, '2026-07-02', 40, 60, pid, 'pista');
    db.updatePractica(media, '2026-07-02', 40, 60, pid, 'pista', null, 0.5);
    const juan = db.getStatsProfesores().find(s => s.id === pid);
    expect(juan).toMatchObject({ num_practicas: 1.5, practicas_pista: 0.5, practicas_circulacion: 1 });
    expect(db.getProfesores().find(p => p.id === pid).num_practicas).toBe(1.5);
  });

  test('Panel: próximos exámenes con las clases que valen y las de antes de la app', () => {
    const vid = db.addVehiculo('Coche', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.setPuntoDePartidaAlumno(aid, 4, 0);
    db.addPractica(aid, vid, '2026-10-01', 0, 0);
    const media = db.addPractica(aid, vid, '2026-10-02', 0, 0);
    db.updatePractica(media, '2026-10-02', 0, 0, null, 'circulacion', null, 0.5);
    db.addPresentacion({ alumno_id: aid, tipo: 'circulacion', fecha: '2026-10-30', resultado: 'pendiente' });
    const panel = db.getPanel('2026-10-22');
    expect(panel.proximosExamenes[0].clases).toBe(5.5);
  });
});

describe('«hoy» en hora local, no en UTC', () => {
  test('un fichaje a las 00:30 queda en ese día', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date(2026, 9, 22, 0, 30)); // 22/10/2026 00:30 hora local
    const r = db.ficharEntrada({ empleado: 'Prueba' });
    const j = db.getJornadas().find(x => x.id === (r.id || r));
    expect(j.fecha).toBe('2026-10-22');
    expect(j.entrada).toBe('00:30');
  });

  test('el filtro por fecha del Historial usa el día local', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date(2026, 9, 22, 0, 30));
    db.addLog('prueba', 'cambio de madrugada', []);
    expect(db.getLogs({ tipo: 'prueba', desde: '2026-10-22', hasta: '2026-10-22' })).toHaveLength(1);
  });
});
