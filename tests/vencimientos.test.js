// Tests del módulo de vencimientos/caducidades (ITV, seguros, psicotécnicos...).
// Registro LOCAL: no toca sync.js, solo la capa de datos db/vencimientos.js.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('addVencimiento crea el registro y getVencimientos lo devuelve', () => {
  const v = db.addVencimiento({ entidad_tipo: 'general', tipo: 'ITV', descripcion: 'ITV furgoneta', fecha_vencimiento: '2026-09-01' });
  expect(v).toMatchObject({ entidad_tipo: 'general', tipo: 'ITV', fecha_vencimiento: '2026-09-01', completado: false });

  const lista = db.getVencimientos();
  expect(lista).toHaveLength(1);
  expect(lista[0].id).toBe(v.id);
});

test('addVencimiento con fecha inválida lanza Error', () => {
  expect(() => db.addVencimiento({ entidad_tipo: 'general', tipo: 'ITV', fecha_vencimiento: '01-09-2026' })).toThrow();
  expect(() => db.addVencimiento({ entidad_tipo: 'general', tipo: 'ITV', fecha_vencimiento: '' })).toThrow();
});

test('addVencimiento con entidad_tipo inválido lanza Error', () => {
  expect(() => db.addVencimiento({ entidad_tipo: 'coche', tipo: 'ITV', fecha_vencimiento: '2026-09-01' })).toThrow();
});

test('getProximosVencimientos incluye vencidos y próximos dentro del rango, excluye lejanos y completados', () => {
  const hoy = '2026-08-05';
  const vVencido = db.addVencimiento({ entidad_tipo: 'general', tipo: 'ITV', fecha_vencimiento: '2026-07-20' }); // -16 días
  const vProximo = db.addVencimiento({ entidad_tipo: 'general', tipo: 'Seguro', fecha_vencimiento: '2026-08-20' }); // +15 días
  const vLejano = db.addVencimiento({ entidad_tipo: 'general', tipo: 'Psicotécnico', fecha_vencimiento: '2026-12-01' }); // muy lejos
  const vCompletado = db.addVencimiento({ entidad_tipo: 'general', tipo: 'DNI', fecha_vencimiento: '2026-08-10' });
  db.setCompletadoVencimiento(vCompletado.id, true);

  const proximos = db.getProximosVencimientos(30, hoy);
  const ids = proximos.map(x => x.id);
  expect(ids).toContain(vVencido.id);
  expect(ids).toContain(vProximo.id);
  expect(ids).not.toContain(vLejano.id);
  expect(ids).not.toContain(vCompletado.id);

  const vencidoRes = proximos.find(x => x.id === vVencido.id);
  expect(vencidoRes.vencido).toBe(true);
  expect(vencidoRes.diasRestantes).toBe(-16);

  const proximoRes = proximos.find(x => x.id === vProximo.id);
  expect(proximoRes.vencido).toBe(false);
  expect(proximoRes.diasRestantes).toBe(15);
});

test('getProximosVencimientos resuelve nombreEntidad para vehiculo/profesor/alumno', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const pid = db.addProfesor('Juan');
  const aid = db.addAlumno('Ana', 'B', vid);
  const hoy = '2026-08-05';

  const vVeh = db.addVencimiento({ entidad_tipo: 'vehiculo', entidad_id: vid, tipo: 'ITV', fecha_vencimiento: '2026-08-10' });
  const vProf = db.addVencimiento({ entidad_tipo: 'profesor', entidad_id: pid, tipo: 'Psicotécnico', fecha_vencimiento: '2026-08-10' });
  const vAl = db.addVencimiento({ entidad_tipo: 'alumno', entidad_id: aid, tipo: 'Convocatoria', fecha_vencimiento: '2026-08-10' });

  const proximos = db.getProximosVencimientos(30, hoy);
  expect(proximos.find(x => x.id === vVeh.id).nombreEntidad).toBe('1234ABC');
  expect(proximos.find(x => x.id === vProf.id).nombreEntidad).toBe('Juan');
  expect(proximos.find(x => x.id === vAl.id).nombreEntidad).toBe('Ana');
});

test('setCompletadoVencimiento saca el vencimiento de getProximosVencimientos', () => {
  const v = db.addVencimiento({ entidad_tipo: 'general', tipo: 'ITV', fecha_vencimiento: '2026-08-10' });
  expect(db.getProximosVencimientos(30, '2026-08-05').map(x => x.id)).toContain(v.id);

  db.setCompletadoVencimiento(v.id, true);
  expect(db.getProximosVencimientos(30, '2026-08-05').map(x => x.id)).not.toContain(v.id);

  db.setCompletadoVencimiento(v.id, false);
  expect(db.getProximosVencimientos(30, '2026-08-05').map(x => x.id)).toContain(v.id);
});

test('updateVencimiento modifica los campos permitidos', () => {
  const v = db.addVencimiento({ entidad_tipo: 'general', tipo: 'ITV', fecha_vencimiento: '2026-08-10' });
  db.updateVencimiento(v.id, { tipo: 'Seguro', fecha_vencimiento: '2026-09-01', nota: 'renovar' });

  const actualizado = db.getVencimientos().find(x => x.id === v.id);
  expect(actualizado.tipo).toBe('Seguro');
  expect(actualizado.fecha_vencimiento).toBe('2026-09-01');
  expect(actualizado.nota).toBe('renovar');
});

test('updateVencimiento con fecha inválida lanza Error', () => {
  const v = db.addVencimiento({ entidad_tipo: 'general', tipo: 'ITV', fecha_vencimiento: '2026-08-10' });
  expect(() => db.updateVencimiento(v.id, { fecha_vencimiento: 'no-es-fecha' })).toThrow();
});

test('deleteVencimiento lo quita de getVencimientos', () => {
  const v = db.addVencimiento({ entidad_tipo: 'general', tipo: 'ITV', fecha_vencimiento: '2026-08-10' });
  expect(db.getVencimientos()).toHaveLength(1);

  db.deleteVencimiento(v.id);
  expect(db.getVencimientos()).toHaveLength(0);
});

test('getVencimientos filtra por sucursal', () => {
  db.addVencimiento({ entidad_tipo: 'general', tipo: 'ITV', fecha_vencimiento: '2026-08-10', sucursal_id: 1 });
  db.addVencimiento({ entidad_tipo: 'general', tipo: 'Seguro', fecha_vencimiento: '2026-08-11', sucursal_id: 2 });

  expect(db.getVencimientos(1)).toHaveLength(1);
  expect(db.getVencimientos(1)[0].tipo).toBe('ITV');
  expect(db.getVencimientos()).toHaveLength(2);
});
