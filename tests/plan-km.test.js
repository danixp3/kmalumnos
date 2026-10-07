// Tests del asistente de km: recomendar los pasos más lógicos, combinarlos en una sola vista previa
// (sin guardar nada) y aplicarlos de una vez con un único registro para deshacer.
const db = require('../db');
const core = require('../db/core');
const { resetData } = require('./helpers');

beforeEach(() => {
  resetData(db);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => jest.restoreAllMocks());

function clase(aid, vid, fecha, hora, ki, kf, extra = {}) {
  const id = db.addPractica(aid, vid, fecha, ki, kf);
  const p = core.load().practicas.find(x => x.id === id);
  p.hora_inicio = hora;
  Object.assign(p, extra);
  return id;
}
const kmDe = id => { const p = core.load().practicas.find(x => x.id === id); return [p.km_inicial, p.km_final]; };
function base() {
  const vid = db.addVehiculo('Taigo', '6664NNM', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  return { vid, aid };
}

describe('recomendarPlanKm', () => {
  test('un coche cuadrado no necesita nada', () => {
    const { vid, aid } = base();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    clase(aid, vid, '2026-09-22', '09:00', 1030, 1060);
    const r = db.recomendarPlanKm(vid);
    expect(r.nada).toBe(true);
    expect(r.recomendado).toBeNull();
    expect(r.titulo || '').toBe('');
  });

  test('con clases sin km entre otras con km recomienda cuadrar y la vista previa las reparte', () => {
    const { vid, aid } = base();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    const a = clase(aid, vid, '2026-09-22', '09:00', 0, 0);
    const b = clase(aid, vid, '2026-09-22', '10:00', 0, 0);
    clase(aid, vid, '2026-09-23', '09:00', 1090, 1120);
    const r = db.recomendarPlanKm(vid);
    expect(r.nada).toBe(false);
    expect(r.recomendado.pasos.map(p => p.tipo)).toEqual(['cuadrar']);
    const prev = db.proponerPlanKm(vid, r.recomendado.pasos);
    expect(prev.errores).toEqual([]);
    expect(prev.cambios.map(c => [c.practica_id, c.despues.km_inicial, c.despues.km_final])).toEqual([[a, 1030, 1060], [b, 1060, 1090]]);
    expect(prev.antes.sin_km).toBe(2);
    expect(prev.despues.sin_km).toBe(0);
    // Solo es una vista previa
    expect(kmDe(a)).toEqual([0, 0]);
    // …y se guarda exactamente lo mostrado, con un único registro para deshacer
    const ap = db.aplicarCuadreKm(vid, prev.cambios);
    expect(ap.aplicados).toBe(2);
    expect(kmDe(a)).toEqual([1030, 1060]);
    expect(db.getCuadresKm()).toHaveLength(1);
    db.deshacerCuadreKm();
    expect(kmDe(a)).toEqual([0, 0]);
  });

  test('una clase que empieza por debajo de la anterior se encaja primero y luego se cuadra el resto', () => {
    const { vid, aid } = base();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1040);
    const mala = clase(aid, vid, '2026-09-21', '10:00', 500, 540);          // km antiguo
    const sig = clase(aid, vid, '2026-09-21', '11:00', 540, 580);           // encadenada desde la mala
    const r = db.recomendarPlanKm(vid);
    expect(r.encajes).toBe(1);
    expect(r.recomendado.pasos[0]).toMatchObject({ tipo: 'encajar', practica_id: mala });
    const prev = db.proponerPlanKm(vid, r.recomendado.pasos);
    expect(prev.errores).toEqual([]);
    const final = id => { const c = prev.cambios.find(x => x.practica_id === id); return [c.despues.km_inicial, c.despues.km_final]; };
    expect(final(mala)).toEqual([1040, 1080]);
    expect(final(sig)).toEqual([1080, 1123]);
    expect(prev.despues.solapes).toBe(0);
  });

  test('si solo hay clases sin km antes de la primera con km, lo lógico es rellenar hacia atrás', () => {
    const { vid, aid } = base();
    const a = clase(aid, vid, '2026-09-01', '09:00', 0, 0);
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    const r = db.recomendarPlanKm(vid);
    expect(r.recomendado.pasos[0].opciones.rellenarAntes).toBe(true);
    const prev = db.proponerPlanKm(vid, r.recomendado.pasos);
    expect(prev.cambios.map(c => c.practica_id)).toEqual([a]);
    expect(prev.cambios[0].despues.km_final).toBe(1000);
  });

  test('sin ninguna clase con km: encadena desde el cuentakilómetros del coche', () => {
    const { vid, aid } = base();
    const a = clase(aid, vid, '2026-09-21', '09:00', 0, 0);
    const b = clase(aid, vid, '2026-09-22', '09:00', 0, 0);
    const r = db.recomendarPlanKm(vid);
    expect(r.recomendado.pasos[0].tipo).toBe('encadenar');
    const prev = db.proponerPlanKm(vid, r.recomendado.pasos);
    expect(prev.cambios.map(c => [c.practica_id, c.despues.km_inicial, c.despues.km_final])).toEqual([[a, 1000, 1043], [b, 1043, 1086]]);
  });

  test('los huecos sin explicar se aconsejan, no se inventan', () => {
    const { vid, aid } = base();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    clase(aid, vid, '2026-09-25', '09:00', 1630, 1660);
    const r = db.recomendarPlanKm(vid);
    expect(r.estado.huecos).toBe(1);
    expect(r.consejos[0]).toMatch(/Añadir clase/);
  });
});

describe('proponerPlanKm: combinar pasos', () => {
  test('quitar los km de una clase mal + cuadrar: cada paso trabaja sobre lo que dejó el anterior', () => {
    const { vid, aid } = base();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    const mala = clase(aid, vid, '2026-09-22', '09:00', 9262, 9290);        // lectura equivocada
    const x = clase(aid, vid, '2026-09-22', '10:00', 0, 0);
    clase(aid, vid, '2026-09-23', '09:00', 1100, 1130);
    const sinPaso = db.proponerPlanKm(vid, [{ tipo: 'cuadrar' }]);
    const con = db.proponerPlanKm(vid, [{ tipo: 'quitar', practica_id: mala }, { tipo: 'cuadrar' }]);
    expect(con.errores).toEqual([]);
    expect(con.pasos.map(p => p.cambios)).toEqual([1, 2]);
    expect(con.cambios.map(c => [c.practica_id, c.despues.km_inicial, c.despues.km_final])).toEqual([[mala, 1030, 1065], [x, 1065, 1100]]);
    expect(con.cambios.find(c => c.practica_id === mala).pasos).toEqual([0, 1]);
    expect(sinPaso.cambios).not.toEqual(con.cambios);
    // Nada se guardó
    expect(kmDe(mala)).toEqual([9262, 9290]);
    expect(kmDe(x)).toEqual([0, 0]);
  });

  test('hasta un máximo + cuadrar se pueden encadenar y aplicar de una vez', () => {
    const { vid, aid } = base();
    const a = clase(aid, vid, '2026-09-21', '09:00', 0, 0);
    const b = clase(aid, vid, '2026-09-22', '09:00', 0, 0);
    const prev = db.proponerPlanKm(vid, [{ tipo: 'maximo', kmMin: 40, kmMax: 42, kmMaximo: 2000 }, { tipo: 'cuadrar' }]);
    expect(prev.errores).toEqual([]);
    expect(prev.cambios.map(c => [c.practica_id, c.despues.km_inicial, c.despues.km_final])).toEqual([[a, 1918, 1959], [b, 1959, 2000]]);
    const ap = db.aplicarCuadreKm(vid, prev.cambios);
    expect(ap.aplicados).toBe(2);
    expect(core.load().vehiculos[0].km_actual).toBe(2000);
  });

  test('un paso con error lo cuenta y el resto sigue', () => {
    const { vid, aid } = base();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    const prev = db.proponerPlanKm(vid, [{ tipo: 'maximo', kmMaximo: 2000 }, { tipo: 'cuadrar' }]);
    expect(prev.errores[0]).toMatch(/Paso 1/);
    expect(prev.pasos).toHaveLength(2);
  });

  test('valida los pasos', () => {
    const { vid } = base();
    expect(db.proponerPlanKm(vid, []).errores).toHaveLength(1);
    expect(db.proponerPlanKm(vid, [{ tipo: 'inventado' }]).errores).toHaveLength(1);
    expect(db.proponerPlanKm(999, [{ tipo: 'cuadrar' }]).errores).toHaveLength(1);
  });
});
