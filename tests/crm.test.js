// Tests del módulo CRM de captación (leads, origen, presupuestos, embudo).
// Registro LOCAL: no toca sync.js, solo la capa de datos db/crm.js.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('addLead crea el registro y getLeads lo devuelve', () => {
  const l = db.addLead({ nombre: 'Ana Pérez', telefono: '600111222', origen: 'Google' });
  expect(l).toMatchObject({ nombre: 'Ana Pérez', telefono: '600111222', origen: 'Google', estado: 'nuevo' });
  expect(l.alumno_id).toBeNull();
  expect(l.fecha_conversion).toBeNull();

  const lista = db.getLeads();
  expect(lista).toHaveLength(1);
  expect(lista[0].id).toBe(l.id);
});

test('addLead con nombre vacío lanza Error', () => {
  expect(() => db.addLead({ nombre: '', origen: 'Google' })).toThrow();
  expect(() => db.addLead({ origen: 'Google' })).toThrow();
});

test('addLead con estado inválido lanza Error', () => {
  expect(() => db.addLead({ nombre: 'Ana', estado: 'inventado' })).toThrow();
});

test('updateLead a estado ganado fija fecha_conversion', () => {
  const l = db.addLead({ nombre: 'Luis', origen: 'Recomendación' });
  expect(l.fecha_conversion).toBeNull();

  db.updateLead(l.id, { estado: 'ganado' });
  const actualizado = db.getLeads().find(x => x.id === l.id);
  expect(actualizado.estado).toBe('ganado');
  expect(actualizado.fecha_conversion).not.toBeNull();
});

test('setEstadoLead valida y fija fecha_conversion al pasar a ganado', () => {
  const l = db.addLead({ nombre: 'Marta', origen: 'Redes' });
  expect(() => db.setEstadoLead(l.id, 'no-existe')).toThrow();

  db.setEstadoLead(l.id, 'contactado');
  expect(db.getLeads().find(x => x.id === l.id).estado).toBe('contactado');
  expect(db.getLeads().find(x => x.id === l.id).fecha_conversion).toBeNull();

  db.setEstadoLead(l.id, 'ganado');
  expect(db.getLeads().find(x => x.id === l.id).fecha_conversion).not.toBeNull();
});

test('getEstadisticasCrm calcula porEstado, porOrigen y ratioConversion', () => {
  const l1 = db.addLead({ nombre: 'A', origen: 'Google' });
  const l2 = db.addLead({ nombre: 'B', origen: 'Google' });
  const l3 = db.addLead({ nombre: 'C', origen: 'Recomendación' });
  db.addLead({ nombre: 'D', origen: 'Recomendación' });

  db.setEstadoLead(l1.id, 'ganado');
  db.setEstadoLead(l2.id, 'perdido');
  db.setEstadoLead(l3.id, 'contactado');

  const stats = db.getEstadisticasCrm();
  expect(stats.total).toBe(4);
  expect(stats.porEstado.ganado).toBe(1);
  expect(stats.porEstado.perdido).toBe(1);
  expect(stats.porEstado.contactado).toBe(1);
  expect(stats.porEstado.nuevo).toBe(1);
  expect(stats.ratioConversion).toBe(0.25);

  const google = stats.porOrigen.find(o => o.origen === 'Google');
  expect(google.total).toBe(2);
  expect(google.ganados).toBe(1);
  expect(google.ratio).toBe(0.5);

  const recomendacion = stats.porOrigen.find(o => o.origen === 'Recomendación');
  expect(recomendacion.total).toBe(2);
  expect(recomendacion.ganados).toBe(0);
  expect(recomendacion.ratio).toBe(0);
});

test('convertirLeadEnAlumno crea un alumno y marca el lead ganado', () => {
  const l = db.addLead({ nombre: 'Carlos Ruiz', telefono: '600999888', email: 'carlos@test.com', permiso_interes: 'B' });

  const res = db.convertirLeadEnAlumno(l.id);
  expect(res.ok).toBe(true);
  expect(res.alumno_id).toBeDefined();

  const alumnos = db.getAlumnos();
  expect(alumnos.find(a => a.id === res.alumno_id)).toBeDefined();
  expect(alumnos.find(a => a.id === res.alumno_id).nombre).toBe('Carlos Ruiz');

  const leadActualizado = db.getLeads().find(x => x.id === l.id);
  expect(leadActualizado.estado).toBe('ganado');
  expect(leadActualizado.alumno_id).toBe(res.alumno_id);
  expect(leadActualizado.fecha_conversion).not.toBeNull();
});

test('convertirLeadEnAlumno dos veces devuelve ok:false la segunda vez', () => {
  const l = db.addLead({ nombre: 'Sara' });
  const res1 = db.convertirLeadEnAlumno(l.id);
  expect(res1.ok).toBe(true);

  const res2 = db.convertirLeadEnAlumno(l.id);
  expect(res2.ok).toBe(false);
  expect(res2.msg).toBe('Ya convertido');
});

test('deleteLead lo quita de getLeads', () => {
  const l = db.addLead({ nombre: 'Pedro' });
  expect(db.getLeads()).toHaveLength(1);

  db.deleteLead(l.id);
  expect(db.getLeads()).toHaveLength(0);
});
