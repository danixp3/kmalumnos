// Tests de getPanelVehiculos: tarjetas, resumen del mes y continuidad de hoy.
const db = require('../db');
const core = require('../db/core');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

const HOY = '2026-09-29';

function base() {
  const vid = db.addVehiculo('Ibiza', '4821 LKM', 1000);
  const pid = db.addProfesor('Javier', 8);
  const aid = db.addAlumno('Lucía', 'B', vid, pid);
  const bid = db.addAlumno('Pablo', 'B', vid, pid);
  return { vid, pid, aid, bid };
}

test('km del mes: recorridos, en prácticas y sin asignar (odómetro que avanzó sin práctica)', () => {
  const { vid, pid, aid } = base();
  db.addPractica(aid, vid, '2026-08-30', 900, 920, pid);        // mes anterior: fija el km de inicio (920)
  db.addPractica(aid, vid, '2026-09-10', 920, 940, pid);        // 20
  db.addPractica(aid, vid, '2026-09-20', 950, 990, pid);        // 40 (hueco de 10 antes)
  db.updateVehiculoKm(vid, 1000);                               // el coche marca 1000
  const v = db.getPanelVehiculos(HOY).vehiculos[0];
  expect(v.km_inicio_mes).toBe(920);
  expect(v.recorridos_mes).toBe(80);
  expect(v.km_en_practicas_mes).toBe(60);
  expect(v.sin_asignar_mes).toBe(20);
  expect(v.practicas_mes).toBe(2);
  expect(v.km_por_practica).toBe(30);
  expect(v.profesor_habitual).toBe('Javier');
});

test('total de flota suma los vehículos', () => {
  const { vid, pid, aid } = base();
  const v2 = db.addVehiculo('Polo', '7390 MBD', 500);
  db.addPractica(aid, vid, '2026-09-10', 980, 1000, pid);
  db.addPractica(aid, v2, '2026-09-11', 480, 500, pid);
  const r = db.getPanelVehiculos(HOY);
  expect(r.vehiculos).toHaveLength(2);
  expect(r.total.practicas_mes).toBe(2);
  expect(r.total.km_en_practicas_mes).toBe(40);
  expect(r.total.km_por_practica).toBe(20);
});

test('línea de hoy: hechas, en curso (con hueco de km) y programadas; estado en_practica', () => {
  const { vid, pid, aid, bid } = base();
  const cid = db.addAlumno('Sara', 'B', vid, pid);
  db.addPractica(aid, vid, HOY, 980, 1000, pid, 'circulacion', null, '08:30');
  const enc = db.addPractica(bid, vid, HOY, 1006, 0, pid, 'circulacion', null, '10:03');
  core.load().practicas.find(x => x.id === enc).estado = 'en_curso';
  db.addReserva({ alumno_id: cid, vehiculo_id: vid, profesor_id: pid, fecha: HOY, hora_inicio: '11:30', estado: 'confirmada' });
  const v = db.getPanelVehiculos(HOY, undefined, 45).vehiculos[0];
  expect(v.en_practica).toBe(true);
  expect(v.bloques_hoy.map(b => b.tipo)).toEqual(['hecha', 'hueco', 'curso', 'prog']);
  expect(v.bloques_hoy[0]).toMatchObject({ inicio: '08:30', fin: '09:15', km: 20, alumno: 'Lucía' });
  expect(v.bloques_hoy[1].km).toBe(6);
  expect(v.hueco_hoy).toBe(6);
  expect(v.km_hoy).toBe(20);
});

test('ITV: toma la más próxima no completada del vehículo, con días restantes', () => {
  const { vid } = base();
  db.addVencimiento({ entidad_tipo: 'vehiculo', entidad_id: vid, tipo: 'ITV', fecha_vencimiento: '2026-10-12' });
  db.addVencimiento({ entidad_tipo: 'vehiculo', entidad_id: vid, tipo: 'Seguro', fecha_vencimiento: '2026-10-01' });   // no es ITV
  const v = db.getPanelVehiculos(HOY).vehiculos[0];
  expect(v.itv).toEqual({ fecha: '2026-10-12', dias: 13, vencida: false });
});

test('sin_km cuenta las prácticas en blanco del vehículo', () => {
  const { vid, pid, aid } = base();
  db.addPractica(aid, vid, HOY, 0, 0, pid);
  db.addPractica(aid, vid, '2026-09-01', 0, 0, pid);
  expect(db.getPanelVehiculos(HOY).vehiculos[0].sin_km).toBe(2);
});
