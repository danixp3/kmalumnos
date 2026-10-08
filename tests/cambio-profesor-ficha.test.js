// Cambio de profesor de un alumno y fichas DGT por tipo de clase y por profesor (2026-10-09).
const db = require('../db');
const { resetData } = require('./helpers');
const sinFirmas = filas => filas.map(({ firma_alumno, firma_profesor, ...r }) => r);

beforeEach(() => { resetData(db); });

// David empezó con Daniel (coche 1) y sigue con Marta (coche 2)
function escenario() {
  const v1 = db.addVehiculo('Coche 1', '1111AAA', 1000);
  const v2 = db.addVehiculo('Coche 2', '2222BBB', 5000);
  const daniel = db.addProfesor('Daniel', '', null, '11111111A');
  const marta = db.addProfesor('Marta', '', null, '22222222B');
  const aid = db.addAlumno('David', 'B', v1, daniel, null, null, { primer_apellido: 'Vila' });
  // Dos clases antiguas SIN profesor propio (como las de antes de existir el cambio) y una ya atada a Daniel
  db.addPractica(aid, v1, '2026-09-01', 1000, 1040, null, 'circulacion', null, '10:00');
  db.addPractica(aid, v1, '2026-09-08', 1040, 1080, null, 'circulacion', null, '10:00');
  db.addPractica(aid, v1, '2026-09-15', 1080, 1120, daniel, 'circulacion', null, '10:00');
  return { v1, v2, daniel, marta, aid };
}

test('cambiarProfesorAlumno: lo anterior se queda con quien lo dio y lo nuevo es del profesor nuevo', () => {
  const { v2, daniel, marta, aid } = escenario();
  // Una clase sin profesor posterior al cambio (anotada ya con el nuevo)
  db.addPractica(aid, v2, '2026-10-05', 5000, 5040, null, 'circulacion', null, '11:00');
  const r = db.cambiarProfesorAlumno(aid, marta, { fecha: '2026-10-01', vehiculo_id: v2 });
  expect(r).toMatchObject({ ok: true, antes: daniel, despues: marta, conservadas: 2, nuevas: 1 });
  const a = db.getAlumnos().find(x => x.id === aid);
  expect(a.profesor_id).toBe(marta);
  expect(a.vehiculo_id).toBe(v2);
  const porFecha = Object.fromEntries(db.getPracticasByAlumno(aid).map(p => [p.fecha, p.profesor_id]));
  expect(porFecha).toEqual({ '2026-09-01': daniel, '2026-09-08': daniel, '2026-09-15': daniel, '2026-10-05': marta });
});

test('cambiarProfesorAlumno: se puede deshacer y valida lo que llega', () => {
  const { daniel, marta, v1, aid } = escenario();
  expect(db.cambiarProfesorAlumno(aid, daniel).ok).toBe(false);          // ya es su profesor
  expect(db.cambiarProfesorAlumno(aid, 9999).ok).toBe(false);            // no existe
  expect(db.cambiarProfesorAlumno(999, marta).ok).toBe(false);           // alumno inexistente
  const r = db.cambiarProfesorAlumno(aid, marta, { fecha: '2026-10-01' });
  expect(db.deshacerCambioProfesorAlumno(r.anterior).ok).toBe(true);
  const a = db.getAlumnos().find(x => x.id === aid);
  expect(a.profesor_id).toBe(daniel);
  expect(a.vehiculo_id).toBe(v1);
  expect(db.getPracticasByAlumno(aid).map(p => p.profesor_id)).toEqual([null, null, daniel]);
});

test('cambiarProfesorAlumno marca para subir a la nube al alumno y a las clases que toca', () => {
  const { marta, aid } = escenario();
  const sync = require('../sync');
  const dirty = jest.spyOn(sync, 'markDirty'), varios = jest.spyOn(sync, 'markDirtyVarios');
  db.cambiarProfesorAlumno(aid, marta, { fecha: '2026-10-01' });
  expect(dirty).toHaveBeenCalledWith('alumnos', aid);
  expect(varios).toHaveBeenCalledWith('practicas', expect.arrayContaining([expect.any(Number), expect.any(Number)]));
  dirty.mockRestore(); varios.mockRestore();
});

test('getFichasDGTAlumno: una ficha por tipo de clase y por profesor, la del profesor antiguo primero', () => {
  const { v2, daniel, marta, aid } = escenario();
  db.addPractica(aid, v2, '2026-10-05', 5000, 5040, marta, 'circulacion', null, '11:00');
  db.addPractica(aid, v2, '2026-10-06', 0, 0, marta, 'pista', null, '12:00');
  db.cambiarProfesorAlumno(aid, marta, { fecha: '2026-10-01' });
  const r = db.getFichasDGTAlumno(aid);
  expect(r.profesores).toBe(2);
  expect(r.fichas.map(f => [f.tipo, f.profesor_id, f.clases, f.desde, f.hasta])).toEqual([
    ['circulacion', daniel, 3, '2026-09-01', '2026-09-15'],
    ['circulacion', marta, 1, '2026-10-05', '2026-10-05'],
    ['destreza', marta, 1, '2026-10-06', '2026-10-06'],
  ]);
  expect(db.getFichasDGTAlumno(999)).toBeNull();
});

test('getDatosFichaDGT con profesor: solo sus clases y su nombre/DNI en la cabecera', () => {
  const { v2, daniel, marta, aid } = escenario();
  db.addPractica(aid, v2, '2026-10-05', 5000, 5040, marta, 'circulacion', null, '11:00');
  db.cambiarProfesorAlumno(aid, marta, { fecha: '2026-10-01' });
  const deDaniel = db.getDatosFichaDGT(aid, 'circulacion', daniel);
  expect(deDaniel.profesor).toMatchObject({ id: daniel, nombre: 'Daniel', dni: '11111111A' });
  expect(sinFirmas(deDaniel.practicas).map(p => p.fecha)).toEqual(['01/09/2026', '08/09/2026', '15/09/2026']);
  const deMarta = db.getDatosFichaDGT(aid, 'circulacion', marta);
  expect(deMarta.profesor).toMatchObject({ id: marta, nombre: 'Marta', dni: '22222222B' });
  expect(sinFirmas(deMarta.practicas).map(p => p.fecha)).toEqual(['05/10/2026']);
  // Sin indicar profesor: todas las clases (como antes)
  expect(db.getDatosFichaDGT(aid, 'circulacion').practicas).toHaveLength(4);
});

test('la ficha de pista no inventa km: sin km las casillas salen en blanco', () => {
  const { v1, daniel, aid } = escenario();
  db.addPractica(aid, v1, '2026-09-20', 0, 0, daniel, 'pista', null, '09:00');
  const pista = db.getDatosFichaDGT(aid, 'destreza', daniel);
  expect(sinFirmas(pista.practicas)).toEqual([expect.objectContaining({ fecha: '20/09/2026', km_inicial: '', km_final: '' })]);
});

test('la ficha del alumno lista sus profesores con clases y fechas', () => {
  const { v2, daniel, marta, aid } = escenario();
  db.addPractica(aid, v2, '2026-10-05', 5000, 5040, null, 'circulacion', null, '11:00');
  db.cambiarProfesorAlumno(aid, marta, { fecha: '2026-10-01' });
  const f = db.getFichaAlumno(aid);
  expect(f.profesores.map(p => [p.id, p.clases, p.actual])).toEqual([[daniel, 3, false], [marta, 1, true]]);
});

test('las clases de pista sin km no cuentan como «sin km» ni se rellenan', () => {
  const v = db.addVehiculo('Moto', '3333CCC', 100);
  const aid = db.addAlumno('Luis', 'A2', v);
  db.addPractica(aid, v, '2026-09-01', 0, 0, null, 'pista');
  db.addPractica(aid, v, '2026-09-02', 0, 0, null, 'circulacion');
  expect(db.getPracticasSinKm(v)).toBe(1);
  expect(db.getResumen().sinKm).toBe(1);
  db.rellenarKmMasivo(v, 40, 45);
  const km = Object.fromEntries(db.getPracticasByAlumno(aid).map(p => [p.tipo, [p.km_inicial, p.km_final]]));
  expect(km.pista).toEqual([0, 0]);
  expect(km.circulacion[1]).toBeGreaterThan(0);
  expect(db.getTodasPracticas().find(p => p.tipo === 'pista')).toMatchObject({ sin_km: false, sin_km_pista: true });
});
