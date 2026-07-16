// Tests de detección y corrección de solapamientos de km entre prácticas.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => resetData(db));

describe('validarSolapamiento', () => {
  test('detecta cuando una práctica nueva pisa los km de otra existente', () => {
    const vid = db.addVehiculo('Coche 1', '1234ABC', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 100, 140);

    const conflictos = db.validarSolapamiento(vid, '2026-07-02', 130, 150);

    expect(conflictos).toHaveLength(1);
    expect(conflictos[0]).toMatchObject({ alumno: 'Ana', km_inicial: 100, km_final: 140 });
  });

  test('no marca conflicto si una práctica empieza justo donde acaba la anterior', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 100, 140);

    expect(db.validarSolapamiento(vid, '2026-07-02', 140, 180)).toHaveLength(0);
  });

  test('ignora las prácticas sin km (0,0) y la propia práctica que se está editando', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 0, 0); // pendiente de rellenar
    const pid = db.addPractica(aid, vid, '2026-07-02', 100, 140);

    // Editar una práctica no debe chocar consigo misma ni con las 0,0
    expect(db.validarSolapamiento(vid, '2026-07-02', 100, 140, pid)).toHaveLength(0);
  });

  test('no mezcla prácticas de vehículos distintos', () => {
    const v1 = db.addVehiculo('Coche 1', '', 0);
    const v2 = db.addVehiculo('Coche 2', '', 0);
    const aid = db.addAlumno('Ana', 'B', v1);
    db.addPractica(aid, v1, '2026-07-01', 100, 140);

    expect(db.validarSolapamiento(v2, '2026-07-01', 100, 140)).toHaveLength(0);
  });
});

describe('getSolapamientos', () => {
  test('lista los pares de prácticas en conflicto con vehículo y alumnos', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const ana = db.addAlumno('Ana', 'B', vid);
    const luis = db.addAlumno('Luis', 'B', vid);
    db.addPractica(ana, vid, '2026-07-01', 100, 142);
    db.addPractica(luis, vid, '2026-07-01', 120, 160);

    const conflictos = db.getSolapamientos();

    expect(conflictos).toHaveLength(1);
    expect(conflictos[0].vehiculo).toBe('Coche 1');
    expect(conflictos[0].practica_a.alumno).toBe('Ana');
    expect(conflictos[0].practica_b.alumno).toBe('Luis');
  });

  test('devuelve lista vacía cuando las prácticas encajan sin pisarse', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-07-01', 100, 140);
    db.addPractica(aid, vid, '2026-07-02', 140, 180);

    expect(db.getSolapamientos()).toHaveLength(0);
  });
});

describe('corregirSolapamientos', () => {
  test('recoloca la práctica solapada conservando su duración y elimina el conflicto', () => {
    const vid = db.addVehiculo('Coche 1', '', 0);
    const ana = db.addAlumno('Ana', 'B', vid);
    const luis = db.addAlumno('Luis', 'B', vid);
    db.addPractica(ana, vid, '2026-07-01', 100, 142);
    db.addPractica(luis, vid, '2026-07-01', 120, 160); // pisa a la de Ana

    const res = db.corregirSolapamientos(vid);

    expect(res.corregidas).toBe(1);
    expect(db.getSolapamientos()).toHaveLength(0);
    const deLuis = db.getPracticasByAlumno(luis);
    expect(deLuis[0].km_inicial).toBe(142); // arranca donde acaba la de Ana
    expect(deLuis[0].km_final).toBe(182);   // conserva sus 40 km de duración
  });

  test('con un vehículo inexistente no corrige nada', () => {
    expect(db.corregirSolapamientos(999)).toEqual({ corregidas: 0 });
  });
});
