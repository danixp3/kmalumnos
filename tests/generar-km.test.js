// Tests de la sección unificada de generación de km:
// - generarKmHastaMaximo: encadena hacia atrás desde un km máximo.
// - generarKmPorRango: reparte entre dos km con media + variación.
// - aplicarPlanKm: persiste EXACTAMENTE un plan previsualizado.
// Se fija Math.random a 0.5: incremento del rango 40-45 => 43 km; jitter del
// modo rango => 0 (queda en la media), lo que hace los resultados comprobables.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => {
  resetData(db);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── HASTA UN MÁXIMO (HACIA ATRÁS) ────────────────────────────────────────────
describe('generarKmHastaMaximo', () => {
  test('previsualiza encadenando hacia atrás para acabar en el máximo (sin guardar)', () => {
    const vid = db.addVehiculo('Coche 1', '', 1000);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 0, 0);
    db.addPractica(aid, vid, '2026-07-02', 0, 0);
    db.addPractica(aid, vid, '2026-07-03', 0, 0);

    const res = db.generarKmHastaMaximo(vid, 40, 45, 1129, false);

    expect(res.errores).toEqual([]);
    expect(res.rellenadas).toBe(3);
    expect(res.solapamientos).toBe(0);
    // La más reciente acaba justo en el máximo; las anteriores restan 43 km
    expect(res.asignaciones.map(a => [a.km_inicial, a.km_final])).toEqual([
      [1000, 1043], [1043, 1086], [1086, 1129],
    ]);
    // Previsualizar NO debe tocar los datos
    expect(db.getPracticasSinKm(vid)).toBe(3);
  });

  test('aplicarPlanKm guarda exactamente lo previsualizado y avanza el odómetro', () => {
    const vid = db.addVehiculo('Coche 1', '', 1000);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 0, 0);
    db.addPractica(aid, vid, '2026-07-02', 0, 0);
    db.addPractica(aid, vid, '2026-07-03', 0, 0);

    const preview = db.generarKmHastaMaximo(vid, 40, 45, 1129, false);
    const res = db.aplicarPlanKm(vid, preview.asignaciones);

    expect(res).toEqual({ aplicadas: 3, errores: [] });
    const practicas = db.getPracticasByAlumno(aid);
    expect(practicas[0]).toMatchObject({ km_inicial: 1000, km_final: 1043 });
    expect(practicas[2]).toMatchObject({ km_inicial: 1086, km_final: 1129 });
    expect(db.getVehiculos()[0].km_actual).toBe(1129);
    expect(db.getPracticasSinKm(vid)).toBe(0);
    expect(db.getSolapamientos()).toHaveLength(0);
  });

  test('el parámetro aplicar=true persiste directamente', () => {
    const vid = db.addVehiculo('Coche 1', '', 500);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 0, 0);
    db.addPractica(aid, vid, '2026-07-02', 0, 0);

    const res = db.generarKmHastaMaximo(vid, 40, 45, 1000, true);
    expect(res.rellenadas).toBe(2);
    expect(db.getPracticasSinKm(vid)).toBe(0);
    const practicas = db.getPracticasByAlumno(aid);
    expect(practicas[1].km_final).toBe(1000); // la última acaba en el máximo
    expect(practicas[0].km_inicial).toBe(1000 - 43 - 43); // 914
  });

  test('falla si el máximo es demasiado bajo (el odómetro se iría por debajo de 0)', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 0, 0);
    db.addPractica(aid, vid, '2026-07-02', 0, 0);
    db.addPractica(aid, vid, '2026-07-03', 0, 0); // 3*43 = 129 km

    const res = db.generarKmHastaMaximo(vid, 40, 45, 100, false);
    expect(res.rellenadas).toBe(0);
    expect(res.asignaciones).toEqual([]);
    expect(res.errores.length).toBe(1);
    expect(db.getPracticasSinKm(vid)).toBe(3); // nada tocado
  });

  test('avisa de solapamientos con prácticas que ya tienen km reales', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    // Práctica real en [1000,1050]; el plan hacia atrás desde 1080 caerá encima
    db.addPractica(aid, vid, '2026-06-01', 1000, 1050);
    db.addPractica(aid, vid, '2026-07-01', 0, 0);
    db.addPractica(aid, vid, '2026-07-02', 0, 0);

    // 2 prácticas *43 = 86; desde 1080 => [994,1037] y [1037,1080] → solapan con [1000,1050]
    const res = db.generarKmHastaMaximo(vid, 40, 45, 1080, false);
    expect(res.rellenadas).toBe(2);
    expect(res.solapamientos).toBeGreaterThan(0);
  });

  test('sin prácticas en blanco devuelve error informativo', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 100, 140);
    const res = db.generarKmHastaMaximo(vid, 40, 45, 1000, false);
    expect(res.rellenadas).toBe(0);
    expect(res.errores.length).toBe(1);
  });

  test('máximo inválido devuelve error', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 0, 0);
    expect(db.generarKmHastaMaximo(vid, 40, 45, 0, false).errores.length).toBe(1);
    expect(db.generarKmHastaMaximo(vid, 40, 45, null, false).errores.length).toBe(1);
  });
});

// ─── POR RANGO (media + variación) ────────────────────────────────────────────
describe('generarKmPorRango', () => {
  test('reparte exactamente entre desde y hasta (variación 0 => media)', () => {
    const vid = db.addVehiculo('Coche 1', '', 1000);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 0, 0);
    db.addPractica(aid, vid, '2026-07-02', 0, 0);
    db.addPractica(aid, vid, '2026-07-03', 0, 0);
    db.addPractica(aid, vid, '2026-07-04', 0, 0);

    const res = db.generarKmPorRango(vid, 1000, 1400, 0, false);
    expect(res.errores).toEqual([]);
    expect(res.rellenadas).toBe(4);
    // Media 100 km por práctica, encadenadas de 1000 a 1400
    expect(res.asignaciones.map(a => [a.km_inicial, a.km_final])).toEqual([
      [1000, 1100], [1100, 1200], [1200, 1300], [1300, 1400],
    ]);
    expect(db.getPracticasSinKm(vid)).toBe(4); // preview no guarda
  });

  test('el total siempre cuadra: la última práctica acaba justo en "hasta"', () => {
    jest.restoreAllMocks(); // usar aleatoriedad real para probar el ajuste fino
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    for (let i = 0; i < 7; i++) db.addPractica(aid, vid, `2026-07-0${i + 1}`, 0, 0);

    const desde = 1000, hasta = 1333, variacion = 8;
    const res = db.generarKmPorRango(vid, desde, hasta, variacion, false);
    expect(res.rellenadas).toBe(7);
    const asigs = res.asignaciones;
    // Encadenado y contiguo
    expect(asigs[0].km_inicial).toBe(desde);
    expect(asigs[asigs.length - 1].km_final).toBe(hasta);
    for (let i = 1; i < asigs.length; i++) {
      expect(asigs[i].km_inicial).toBe(asigs[i - 1].km_final);
      expect(asigs[i].km_final).toBeGreaterThan(asigs[i].km_inicial); // cada tramo > 0
    }
    // La suma de los recorridos es exactamente el rango pedido
    const suma = asigs.reduce((s, a) => s + (a.km_final - a.km_inicial), 0);
    expect(suma).toBe(hasta - desde);
  });

  test('aplicarPlanKm guarda el reparto y actualiza el odómetro', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 0, 0);
    db.addPractica(aid, vid, '2026-07-02', 0, 0);

    const preview = db.generarKmPorRango(vid, 2000, 2200, 0, false);
    const res = db.aplicarPlanKm(vid, preview.asignaciones);
    expect(res.aplicadas).toBe(2);
    expect(db.getVehiculos()[0].km_actual).toBe(2200);
    expect(db.getPracticasSinKm(vid)).toBe(0);
  });

  test('falla si el rango es demasiado pequeño para tantas prácticas', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    for (let i = 0; i < 5; i++) db.addPractica(aid, vid, `2026-07-0${i + 1}`, 0, 0);
    // 5 prácticas en un rango de 3 km => no llega ni a 1 km cada una
    const res = db.generarKmPorRango(vid, 1000, 1003, 0, false);
    expect(res.rellenadas).toBe(0);
    expect(res.errores.length).toBe(1);
    expect(db.getPracticasSinKm(vid)).toBe(5);
  });

  test('rango inválido (hasta <= desde) devuelve error', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 0, 0);
    expect(db.generarKmPorRango(vid, 1000, 1000, 0, false).errores.length).toBe(1);
    expect(db.generarKmPorRango(vid, 1000, 900, 0, false).errores.length).toBe(1);
  });
});

// ─── aplicarPlanKm (protecciones) ─────────────────────────────────────────────
describe('aplicarPlanKm', () => {
  test('ignora prácticas que ya dejaron de estar en blanco (no las pisa)', () => {
    const vid = db.addVehiculo('Coche 1', '', 1000);
    const aid = db.addAlumno('Ana', 'B', vid);
    const p1 = db.addPractica(aid, vid, '2026-07-01', 0, 0);
    const p2 = db.addPractica(aid, vid, '2026-07-02', 0, 0);

    const plan = [
      { practica_id: p1, km_inicial: 1000, km_final: 1050 },
      { practica_id: p2, km_inicial: 1050, km_final: 1100 },
    ];
    // p1 se rellena por otra vía antes de aplicar
    db.updatePractica(p1, '2026-07-01', 500, 560);

    const res = db.aplicarPlanKm(vid, plan);
    expect(res.aplicadas).toBe(1); // solo p2, que seguía en blanco
    expect(db.getPracticasByAlumno(aid)[0]).toMatchObject({ km_inicial: 500, km_final: 560 });
    expect(db.getPracticasByAlumno(aid)[1]).toMatchObject({ km_inicial: 1050, km_final: 1100 });
  });

  test('plan vacío o vehículo inexistente devuelve error', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    expect(db.aplicarPlanKm(vid, []).errores.length).toBe(1);
    expect(db.aplicarPlanKm(999, [{ practica_id: 1, km_inicial: 0, km_final: 10 }]).errores.length).toBe(1);
  });
});
