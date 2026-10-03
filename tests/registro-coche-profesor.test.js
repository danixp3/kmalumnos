// Nº de registro del alumno (como en el programa anterior: el siguiente sale
// solo) y coche habitual de cada profesor (el que la web propone al empezar
// sus clases), con su paso por Puesta en marcha y su sincronización
// (migración 2026-10-03_profesor_vehiculo).
const fs = require('fs');
const path = require('path');

const mockRemote = { online: true, tables: {} };
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./mocks/fake-supabase')(mockRemote)
}));

const db = require('../db');
const sync = require('../sync');
const { siguienteNRegistro, alumnoConNRegistro } = require('../db/campos-extra');
const { resetData, userDataDir } = require('./helpers');

const dataFile = path.join(userDataDir, 'data.json');
const leerLocal = () => { db._clearCache(); return JSON.parse(fs.readFileSync(dataFile, 'utf-8')); };
const futuro = (s = 1) => new Date(Date.now() + s * 1000).toISOString();
const hace = dias => new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  Object.assign(mockRemote, {
    online: true, authOk: true, authUserId: 'uid-jefe', tablasInexistentes: [], columnasInexistentes: {}, rpcHandlers: {}, rpcErrores: {},
    tables: { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [] }
  });
});

// ─── Nº de registro ─────────────────────────────────────────────────────────

test('siguiente nº de registro: sigue la correlativa; la del año delante solo si es la única; sin números, ninguno', () => {
  expect(siguienteNRegistro([])).toBe(null);
  expect(siguienteNRegistro([{ n_registro: '4904' }, { n_registro: '4905' }, { n_registro: '2026082' }, { n_registro: '23/2012' }, { n_registro: null }])).toBe('4906');
  expect(siguienteNRegistro([{ n_registro: '2026081' }, { n_registro: '2026082' }], 2026)).toBe('2026083');
  expect(siguienteNRegistro([{ n_registro: '2025140' }], 2026)).toBe('2026001');
  expect(siguienteNRegistro([{ n_registro: '200804' }, { n_registro: '58' }])).toBe('59'); // sección antigua de Ariauto
  expect(siguienteNRegistro([{ n_registro: '9', deleted: true }, { n_registro: '3' }])).toBe('4');
  expect(alumnoConNRegistro([{ id: 1, n_registro: ' 4905 ' }, { id: 2, n_registro: '4906' }], '4905')).toMatchObject({ id: 1 });
  expect(alumnoConNRegistro([{ id: 1, n_registro: '4905' }], '4905', 1)).toBe(null);
});

test('alta: el alumno nuevo recibe el siguiente nº (si ya hay numeración); vacío a propósito, sin número', () => {
  const a1 = db.addAlumno('Ana', 'B', null);
  expect(leerLocal().alumnos.find(a => a.id === a1).n_registro).toBe(null); // aún no hay numeración
  db.updateAlumnoCampos(a1, { n_registro: '4905' });
  expect(db.getSiguienteNRegistro()).toBe('4906');
  const a2 = db.addAlumno('Luis', 'B', null);
  const a3 = db.addAlumno('Eva', 'B', null, null, null, null, { n_registro: '' });
  const a4 = db.addAlumno('Rosa', 'B', null, null, null, null, { n_registro: '5000' });
  const l = leerLocal().alumnos;
  expect(l.find(a => a.id === a2).n_registro).toBe('4906');
  expect(l.find(a => a.id === a3).n_registro).toBe(null);
  expect(l.find(a => a.id === a4).n_registro).toBe('5000');
  expect(db.getSiguienteNRegistro()).toBe('5001');
  expect(db.getAlumnoConNRegistro('4906')).toMatchObject({ id: a2, nombre: 'Luis' });
  expect(db.getAlumnoConNRegistro('4906', a2)).toBe(null);
  expect(db.buscarAlumnosRapido('4906')[0]).toMatchObject({ id: a2 });
});

// ─── Coche habitual del profesor ────────────────────────────────────────────

test('coche habitual: se guarda con el profesor, la lista lo enseña y, si no tiene, sugiere el que más usa', () => {
  const kia = db.addVehiculo('Kia azul', '6643LSC', 1000);
  const taigo = db.addVehiculo('Taigo', '6664NNM', 2000);
  const javier = db.addProfesor('Javier', '', null, null, { vehiculo_id: taigo });
  const daniel = db.addProfesor('Daniel', '');
  expect(db.getVehiculoDeProfesor(javier)).toBe(taigo);
  expect(db.getVehiculoDeProfesor(daniel)).toBe(null);
  // Daniel da sus clases en el Kia: se le sugiere
  const al = db.addAlumno('Kole', 'B', kia, daniel);
  for (const d of [1, 2, 3]) db.addPractica(al, kia, hace(d), 1000 + d * 40, 1040 + d * 40, daniel);
  const lista = db.getProfesores();
  expect(lista.find(p => p.id === javier)).toMatchObject({ vehiculo_id: taigo, vehiculo_nombre: 'Taigo', vehiculo_matricula: '6664NNM', vehiculo_sugerido: null });
  expect(lista.find(p => p.id === daniel)).toMatchObject({ vehiculo_nombre: null, vehiculo_sugerido: { id: kia, nombre: 'Kia azul' } });
  expect(db.setCocheProfesor(daniel, kia)).toEqual({ ok: true });
  expect(db.getVehiculoDeProfesor(daniel)).toBe(kia);
  expect(db.setCocheProfesor(daniel, 999).ok).toBe(false);
  // Editar el profesor sin tocar el coche no lo pierde; con el selector vacío, se quita
  db.updateProfesor(daniel, 'Daniel Alexis', '', null, { telefono: '600' });
  expect(db.getVehiculoDeProfesor(daniel)).toBe(kia);
  db.updateProfesor(daniel, 'Daniel Alexis', '', null, { vehiculo_id: '' });
  expect(db.getVehiculoDeProfesor(daniel)).toBe(null);
  // Un coche retirado no cuenta como coche habitual
  db.setCocheProfesor(daniel, kia);
  db.updateVehiculo(kia, 'Kia azul', '6643LSC', { activo: false });
  expect(db.getVehiculoDeProfesor(daniel)).toBe(null);
});

test('sync: el coche habitual sube con el profesor y el elegido en el móvil baja al PC', async () => {
  sync.setCredentials('jefe@test.com', 'password123');
  fs.writeFileSync(dataFile, JSON.stringify({
    vehiculos: [{ id: 1, nombre: 'Kia', matricula: '6643LSC', km_actual: 100 }, { id: 2, nombre: 'Taigo', matricula: '6664NNM', km_actual: 50 }],
    profesores: [{ id: 1, nombre: 'Javier', nota: '', vehiculo_id: 2 }],
    tarifas: [], pagos: [], logs: [], sucursales: [], alumnos: [], practicas: [],
    _seq: { v: 3, a: 1, p: 1, pf: 2, t: 1, pg: 1, suc: 1 }
  }), 'utf-8'); db._clearCache();
  sync.markDirty('vehiculos', 1); sync.markDirty('vehiculos', 2); sync.markDirty('profesores', 1);
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.profesores[0]).toMatchObject({ vehiculo_id: 2 });
  // En el móvil (Perfil → Coche de cada profesor) le ponen el Kia
  Object.assign(mockRemote.tables.profesores[0], { vehiculo_id: 1, updated_at: futuro(5) });
  expect((await sync.sync()).ok).toBe(true);
  expect(leerLocal().profesores[0].vehiculo_id).toBe(1);
});

test('sync sin la columna en la nube: no se manda y se conserva en el PC', async () => {
  mockRemote.columnasInexistentes = { profesores: ['vehiculo_id'] };
  sync.setCredentials('jefe@test.com', 'password123');
  fs.writeFileSync(dataFile, JSON.stringify({
    vehiculos: [{ id: 1, nombre: 'Kia', matricula: '6643LSC', km_actual: 100 }],
    profesores: [{ id: 1, nombre: 'Javier', nota: '', vehiculo_id: 1 }],
    tarifas: [], pagos: [], logs: [], sucursales: [], alumnos: [], practicas: [],
    _seq: { v: 2, a: 1, p: 1, pf: 2, t: 1, pg: 1, suc: 1 }
  }), 'utf-8'); db._clearCache();
  sync.markDirty('vehiculos', 1); sync.markDirty('profesores', 1);
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.profesores[0]).not.toHaveProperty('vehiculo_id');
  expect(leerLocal().profesores[0].vehiculo_id).toBe(1);
});

// ─── Puesta en marcha ───────────────────────────────────────────────────────

test('Puesta en marcha: nº de registro, coche del profesor, alumnos repetidos y terminados', () => {
  const kia = db.addVehiculo('Kia', '6643LSC', 1000);
  const prof = db.addProfesor('Daniel', '');
  const ana = db.addAlumno('Ana', 'B', null, null, null, null, { primer_apellido: 'Ríos', n_registro: '4905' });
  const viejo = db.addAlumno('Luis', 'B', null, null, null, null, { primer_apellido: 'Soto', n_registro: '3001', estado: 'apto' });
  let pm = db.getPuestaEnMarcha();
  // Los terminados no se listan (pero se cuentan)
  expect(pm.alumnos.map(a => a.id)).toEqual([ana]);
  expect(pm.resumen.alumnos_terminados).toBe(1);
  expect(pm.siguiente_n_registro).toBe('4906');
  expect(pm.profesores[0]).toMatchObject({ id: prof, vehiculo_id: null });

  // Coche del profesor desde la tabla de profesores; alumno nuevo sin coche → el del profesor y el siguiente nº
  let r = db.guardarPuestaEnMarcha({
    profesores: [{ id: prof, nombre: 'Daniel', vehiculo_id: String(kia) }],
    alumnos: [{ id: ana, n_registro: '4905', nombre: 'Ana', primer_apellido: 'Ríos', permiso: 'B' },
              { id: null, n_registro: '', nombre: 'Kole', primer_apellido: 'Bardechi', permiso: 'B', profesor_id: String(prof), vehiculo_id: '' }]
  });
  expect(r.ok).toBe(true);
  const kole = leerLocal().alumnos.find(a => a.nombre === 'Kole');
  expect(kole).toMatchObject({ n_registro: '4906', vehiculo_id: kia, profesor_id: prof });
  expect(db.getVehiculoDeProfesor(prof)).toBe(kia);

  // Meter otra vez al mismo con el mismo permiso mientras sigue en curso: no se deja
  r = db.guardarPuestaEnMarcha({ alumnos: [{ id: null, nombre: 'KOLE', primer_apellido: 'bardechi', permiso: 'B' }] });
  expect(r.ok).toBe(false);
  expect(r.errores[0]).toMatch(/ya está en la app como «Kole Bardechi» \(nº 4906\), en curso con el permiso B/);
  // Otro permiso de la misma persona, o el mismo permiso cuando el anterior ya
  // terminó: es otro expediente, con su nº
  r = db.guardarPuestaEnMarcha({ alumnos: [{ id: null, nombre: 'Kole', primer_apellido: 'Bardechi', permiso: 'A2' }, { id: null, nombre: 'Luis', primer_apellido: 'Soto', permiso: 'B' }] });
  expect(r.ok).toBe(true);
  const expedientes = leerLocal().alumnos.filter(a => a.nombre === 'Kole' || a.nombre === 'Luis').map(a => [a.nombre, a.permiso, a.n_registro, a.estado]);
  expect(expedientes).toEqual([['Luis', 'B', '3001', 'apto'], ['Kole', 'B', '4906', 'en_practicas'], ['Kole', 'A2', '4907', 'en_practicas'], ['Luis', 'B', '4908', 'en_practicas']]);
  // Nº de registro repetido: no se deja
  r = db.guardarPuestaEnMarcha({ alumnos: [{ id: ana, n_registro: '3001', nombre: 'Ana', primer_apellido: 'Ríos' }] });
  expect(r.errores[0]).toMatch(/el nº de registro 3001 ya lo tiene Luis Soto/);
  // Un número escrito a mano se guarda
  expect(db.guardarPuestaEnMarcha({ alumnos: [{ id: ana, n_registro: '4800', nombre: 'Ana', primer_apellido: 'Ríos' }] }).ok).toBe(true);
  expect(leerLocal().alumnos.find(a => a.id === ana).n_registro).toBe('4800');
  // El terminado sigue intacto
  expect(leerLocal().alumnos.find(a => a.id === viejo)).toMatchObject({ estado: 'apto', n_registro: '3001' });
});
