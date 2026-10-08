// Procedencia de los datos traídos de otro programa (db/procedencia.js,
// 2026-10-08): todo lo que entra al importar queda marcado con el nombre del
// programa; filtros, grupos, renombrar/quitar la etiqueta y sincronización.
const fs = require('fs');
const path = require('path');

const mockRemote = { online: true, tables: {} };
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./mocks/fake-supabase')(mockRemote)
}));

const db = require('../db');
const sync = require('../sync');
const core = require('../db/core');
const { resetData, userDataDir } = require('./helpers');

const dataFile = path.join(userDataDir, 'data.json');
const pendingFile = path.join(userDataDir, 'pending_sync.json');
const leerLocal = () => { db._clearCache(); return JSON.parse(fs.readFileSync(dataFile, 'utf-8')); };
const pendientes = () => (fs.existsSync(pendingFile) ? JSON.parse(fs.readFileSync(pendingFile, 'utf-8')) : {});
const futuro = (s = 1) => new Date(Date.now() + s * 1000).toISOString();

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  Object.assign(mockRemote, {
    online: true, authOk: true, authUserId: 'uid-jefe', tablasInexistentes: [], columnasInexistentes: {}, rpcHandlers: {}, rpcErrores: {},
    tables: { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [], cargos: [] }
  });
});

const HOY = '2026-10-08';
function entrada(texto, tipo, opciones = {}, procedencia) {
  const h = db.leerTextoTabla(texto);
  const det = db.detectarTablaMigracion(h, tipo);
  return { tipo, filas: h.filas, numFila: h.numFila, filaCabecera: det.filaCabecera, mapeo: det.mapeo, opciones: { hoy: HOY, ordenNombre: det.ordenNombre, ...opciones }, archivo: 'listado.csv', procedencia };
}
const ALUMNOS = 'Nombre;Apellidos;DNI;Teléfono;Permiso;Profesor;Coche;Saldo\n' +
  'Ana;García López;12345678Z;600111222;B;Javier Ruiz;Ibiza 1234 BCD;100\n' +
  'Eva;Sanz;X1234567L;611222333;B;;;\n';
const CLASES = 'Alumno;DNI;Fecha;Hora;Duración\n' +
  'Ana García;12345678Z;01/09/2026;10:00;45\n' +
  'Ana García;12345678Z;03/09/2026;10:00;45\n';

describe('nombres y filtro', () => {
  test('el nombre se limpia; vacío o «AulaMovil» = creado aquí', () => {
    expect(db.normalizarProcedencia('  Gesauto   2000 ')).toBe('Gesauto 2000');
    expect(db.normalizarProcedencia('')).toBeNull();
    expect(db.normalizarProcedencia(null)).toBeNull();
    expect(db.normalizarProcedencia('AulaMovil')).toBeNull();
    expect(db.normalizarProcedencia('x'.repeat(80))).toHaveLength(40);
  });
  test('filtro: todo, creados aquí, traídos de cualquiera o de uno (sin mayúsculas)', () => {
    expect(db.coincideProcedencia(null, '')).toBe(true);
    expect(db.coincideProcedencia(null, '__app')).toBe(true);
    expect(db.coincideProcedencia('Ariauto', '__app')).toBe(false);
    expect(db.coincideProcedencia('Ariauto', '__otros')).toBe(true);
    expect(db.coincideProcedencia(null, '__otros')).toBe(false);
    expect(db.coincideProcedencia('Ariauto', 'ARIAUTO')).toBe(true);
    expect(db.coincideProcedencia('Gesauto', 'Ariauto')).toBe(false);
  });
});

describe('importar marca todo lo que entra', () => {
  test('alumnos nuevos, su profesor, su coche y su saldo llevan la etiqueta; el que ya estaba, no', () => {
    const vid = db.addVehiculo('Mío', '9999 ZZZ', 0);
    const yaEstaba = db.addAlumno('Eva Sanz', 'B', vid);
    const r = db.aplicarImportacion(entrada(ALUMNOS, 'alumnos', {}, 'Gesauto'));
    expect(r.ok).toBe(true);
    expect(r.resumen.procedencia).toBe('Gesauto');
    const ana = db.getAlumnos().find(a => a.dni === '12345678Z');
    expect(ana.procedencia).toBe('Gesauto');
    // Eva ya estaba en la app (se completa): sigue siendo de AulaMovil
    expect(db.getAlumnos().find(a => a.id === yaEstaba).procedencia).toBeFalsy();
    expect(db.getProfesores().find(p => p.id === ana.profesor_id).procedencia).toBe('Gesauto');
    expect(db.getVehiculos().find(v => v.id === ana.vehiculo_id).procedencia).toBe('Gesauto');
    expect(db.getVehiculos().find(v => v.id === vid).procedencia).toBeFalsy();
    expect(db.getCargosAlumno(ana.id)[0].procedencia).toBe('Gesauto');
    expect(db.getImportaciones()[0].procedencia).toBe('Gesauto');
    // Registro compartido con la fecha en que se trajeron
    const info = db.getProcedencias();
    expect(info.programas).toEqual([expect.objectContaining({ nombre: 'Gesauto', desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), total: 4 })]);
    expect(info.programas[0].cuenta).toMatchObject({ alumnos: 1, profesores: 1, vehiculos: 1, cargos: 1 });
    expect(info.app.alumnos).toBe(1);
    expect(pendientes().ajustes_empresa).toContain('procedencias');
  });

  test('sin nombre, «Programa anterior»; las clases traídas llevan la etiqueta', () => {
    const vid = db.addVehiculo('Ibiza', '1234 BCD', 900);
    const ana = db.addAlumno('Ana', 'B', vid, null, null, null, { primer_apellido: 'García', dni: '12345678Z' });
    db.addPractica(ana, vid, '2026-10-01', 1000, 1040);
    db.aplicarImportacion(entrada(CLASES, 'clases', { duracion: 45 }));
    const suyas = db.getFichaAlumno(ana, HOY).practicas;
    expect(suyas.map(p => [p.fecha, p.procedencia])).toEqual([
      ['2026-09-01', 'Programa anterior'], ['2026-09-03', 'Programa anterior'], ['2026-10-01', null]
    ]);
    // La lista de prácticas filtra por procedencia
    expect(db.getTodasPracticas({ procedencia: '__otros', hoy: HOY })).toHaveLength(2);
    expect(db.getTodasPracticas({ procedencia: '__app', hoy: HOY })).toHaveLength(1);
    expect(db.getTodasPracticas({ procedencia: 'programa ANTERIOR', hoy: HOY }).every(p => p.procedencia === 'Programa anterior')).toBe(true);
  });

  test('deshacer la importación quita lo marcado y lo que queda sigue igual', () => {
    const r = db.aplicarImportacion(entrada(ALUMNOS, 'alumnos', {}, 'Gesauto'));
    db.deshacerImportacion(r.id);
    expect(db.getAlumnos().filter(a => a.procedencia)).toHaveLength(0);
    expect(db.getProcedencias().programas).toHaveLength(0);
  });
});

describe('renombrar y quitar la etiqueta', () => {
  test('renombrar cambia todo lo de ese programa y avisa a la nube; juntar con otro existente', () => {
    db.aplicarImportacion(entrada(ALUMNOS, 'alumnos', {}, 'Programa anterior'));
    fs.writeFileSync(pendingFile, '{}');
    const r = db.renombrarProcedencia('programa anterior', 'Gesauto');
    expect(r).toMatchObject({ ok: true, total: 5 });
    expect(db.getAlumnos().filter(a => a.procedencia === 'Gesauto')).toHaveLength(2);
    expect(db.getProcedencias().programas.map(p => p.nombre)).toEqual(['Gesauto']);
    const p = pendientes();
    expect(p.alumnos).toHaveLength(2);
    expect(p.ajustes_empresa).toContain('procedencias');
    // «Ariauto» pasa a llamarse como uno que ya existe: se juntan
    const ana = db.getAlumnos().find(a => a.nombre === 'Ana');
    db.updateAlumnoCampos(ana.id, { procedencia: 'Ariauto' });
    db.renombrarProcedencia('Ariauto', 'gesauto');
    expect(new Set(db.getAlumnos().map(a => a.procedencia.toLowerCase()))).toEqual(new Set(['gesauto']));
  });

  test('quitar la etiqueta: pasan a contar como creados en AulaMovil, sin borrar nada', () => {
    db.aplicarImportacion(entrada(ALUMNOS, 'alumnos', {}, 'Gesauto'));
    const antes = db.getAlumnos().length;
    const r = db.renombrarProcedencia('Gesauto', '');
    expect(r.ok).toBe(true);
    expect(db.getAlumnos()).toHaveLength(antes);
    expect(db.getAlumnos().every(a => !a.procedencia)).toBe(true);
    expect(db.getProcedencias().programas).toHaveLength(0);
    expect(db.renombrarProcedencia('', 'X').ok).toBe(false);
  });

  test('a mano desde la ficha (vacío = creado aquí)', () => {
    const id = db.addAlumno('Luis', 'B', null);
    expect(db.updateAlumnoCampos(id, { procedencia: '  Autoescuela   Pro ' }).alumno.procedencia).toBe('Autoescuela Pro');
    expect(db.updateAlumnoCampos(id, { procedencia: '' }).alumno.procedencia).toBeNull();
  });
});

test('importaciones hechas con una versión anterior se marcan una sola vez al arrancar', () => {
  const vid = db.addVehiculo('Ibiza', '', 0);
  const a1 = db.addAlumno('Uno', 'B', vid), a2 = db.addAlumno('Dos', 'B', vid), a3 = db.addAlumno('Tres', 'B', vid);
  const p1 = db.addPractica(a1, vid, '2026-09-01', 0, 0);
  const d = core.load();
  d.importaciones = [
    { id: 'imp-1', fecha: '2026-10-03T10:00:00.000Z', tipo: 'ariauto', archivo: 'Datos.accdb', creados: { alumnos: [a1], practicas: [p1] }, actualizados: [], deshecha: null },
    { id: 'imp-2', fecha: '2026-10-04T10:00:00.000Z', tipo: 'alumnos', archivo: 'lista.xlsx', creados: { alumnos: [a2] }, actualizados: [], deshecha: null },
    { id: 'imp-3', fecha: '2026-10-05T10:00:00.000Z', tipo: 'alumnos', archivo: 'otra.xlsx', creados: { alumnos: [a3] }, actualizados: [], deshecha: '2026-10-05T11:00:00.000Z' }
  ];
  core.save();
  fs.writeFileSync(pendingFile, '{}');
  expect(db.etiquetarImportacionesAnteriores()).toMatchObject({ importaciones: 2, marcados: 3 });
  const al = id => db.getAlumnos().find(a => a.id === id);
  expect(al(a1).procedencia).toBe('Ariauto');
  expect(al(a2).procedencia).toBe('Programa anterior');
  expect(al(a3).procedencia).toBeFalsy(); // esa se deshizo
  expect(db.getPracticasByAlumno(a1)[0].procedencia).toBe('Ariauto');
  expect(db.getProcedencias().programas.find(p => p.nombre === 'Ariauto').desde).toBe('2026-10-03');
  expect(pendientes().alumnos.sort()).toEqual([a1, a2].sort());
  // Segunda vez: nada que hacer
  expect(db.etiquetarImportacionesAnteriores()).toMatchObject({ importaciones: 0, marcados: 0 });
});

test('exámenes: filtro por procedencia y opciones del desplegable', () => {
  const aid = db.addAlumno('Ana', 'B', null);
  db.addPresentacion({ alumno_id: aid, tipo: 'teorico', fecha: '2026-05-01', resultado: 'apto' });
  db.addPresentacion({ alumno_id: aid, tipo: 'circulacion', fecha: '2026-10-01', resultado: 'pendiente' });
  const d = core.load();
  d.presentaciones[0].procedencia = 'Ariauto';
  core.save();
  const r = db.buscarExamenes({ procedencia: 'Ariauto' });
  expect(r.filas).toHaveLength(1);
  expect(r.filas[0].procedencia).toBe('Ariauto');
  expect(db.buscarExamenes({ procedencia: '__app' }).filas).toHaveLength(1);
  expect(db.buscarExamenes({}).opciones.procedencias).toEqual(['Ariauto']);
});

test('exportar: columna «Procedencia» (lo de aquí, «AulaMovil»)', () => {
  db.aplicarImportacion(entrada(ALUMNOS, 'alumnos', {}, 'Gesauto'));
  db.addAlumno('Luis', 'B', null);
  const [tabla] = db.datosExportacion({ conjuntos: ['alumnos'] });
  const col = tabla.cabecera.indexOf('Procedencia');
  expect(col).toBeGreaterThan(-1);
  expect(tabla.filas.map(f => f[col]).sort()).toEqual(['AulaMovil', 'Gesauto', 'Gesauto']);
  const clases = db.datosExportacion({ conjuntos: ['practicas', 'profesores', 'examenes'] });
  for (const t of clases) expect(t.cabecera[t.cabecera.length - 1]).toBe('Procedencia');
});

describe('sincronización', () => {
  function datosSync() {
    return {
      vehiculos: [{ id: 1, nombre: 'Ibiza', matricula: '4821 LKM', km_actual: 100, procedencia: 'Ariauto' }],
      profesores: [{ id: 1, nombre: 'Juan', nota: '', procedencia: 'Ariauto' }],
      tarifas: [], logs: [], sucursales: [],
      pagos: [{ id: 1, alumno_id: 1, fecha: '2026-09-01', cantidad: 50, nota: '', procedencia: 'Ariauto' }],
      cargos: [{ id: 1, alumno_id: 1, concepto: 'Saldo', tipo: 'cargo', importe: 100, fecha: '2026-09-01', nota: '', procedencia: 'Ariauto' }],
      alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1, profesor_id: 1, procedencia: 'Ariauto' },
                { id: 2, nombre: 'Luis', permiso: 'B', vehiculo_id: 1, profesor_id: 1 }],
      practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 0, km_final: 0, nota: '', procedencia: 'Ariauto', tipo_detalle: 'anterior' }],
      _seq: { v: 2, a: 3, p: 2, pf: 2, t: 1, pg: 2, suc: 1, cargo: 2 }
    };
  }

  test('sube y baja la procedencia de cada tabla; lo creado aquí va vacío', async () => {
    sync.setCredentials('jefe@test.com', 'password123');
    fs.writeFileSync(dataFile, JSON.stringify(datosSync()), 'utf-8'); db._clearCache();
    ['vehiculos', 'profesores', 'pagos', 'cargos', 'practicas'].forEach(t => sync.markDirty(t, 1));
    sync.markDirtyVarios('alumnos', [1, 2]);
    expect((await sync.sync()).ok).toBe(true);
    for (const t of ['vehiculos', 'profesores', 'pagos', 'cargos', 'practicas']) expect(mockRemote.tables[t][0].procedencia).toBe('Ariauto');
    expect(mockRemote.tables.alumnos.find(a => a.id === 1).procedencia).toBe('Ariauto');
    expect(mockRemote.tables.alumnos.find(a => a.id === 2).procedencia).toBeNull();

    // Otro PC le quita la etiqueta a Ana y marca a Luis
    Object.assign(mockRemote.tables.alumnos.find(a => a.id === 1), { procedencia: null, updated_at: futuro(5) });
    Object.assign(mockRemote.tables.alumnos.find(a => a.id === 2), { procedencia: 'Gesauto', updated_at: futuro(5) });
    Object.assign(mockRemote.tables.practicas[0], { nota: 'cambiada', updated_at: futuro(5) });
    expect((await sync.sync()).ok).toBe(true);
    const local = leerLocal();
    expect(local.alumnos.find(a => a.id === 1).procedencia).toBeNull();
    expect(local.alumnos.find(a => a.id === 2).procedencia).toBe('Gesauto');
    expect(local.practicas[0]).toMatchObject({ nota: 'cambiada', procedencia: 'Ariauto' });
  });

  test('sin la migración en la nube: no se manda (ni en la subida completa) y se conserva en este PC', async () => {
    mockRemote.columnasInexistentes = { alumnos: ['procedencia'], practicas: ['procedencia'], vehiculos: ['procedencia'], profesores: ['procedencia'], pagos: ['procedencia'], cargos: ['procedencia'] };
    sync.setCredentials('jefe@test.com', 'password123');
    fs.writeFileSync(dataFile, JSON.stringify(datosSync()), 'utf-8'); db._clearCache();
    ['vehiculos', 'profesores', 'alumnos', 'practicas'].forEach(t => sync.markDirty(t, 1));
    expect((await sync.sync()).ok).toBe(true);
    expect(mockRemote.tables.alumnos[0]).not.toHaveProperty('procedencia');
    expect(mockRemote.tables.practicas[0]).not.toHaveProperty('procedencia');
    // Llega un cambio del móvil (sin la columna): la etiqueta de este PC no se pierde
    Object.assign(mockRemote.tables.alumnos[0], { nombre: 'Ana María', updated_at: futuro(5) });
    Object.assign(mockRemote.tables.practicas[0], { nota: 'del móvil', updated_at: futuro(5) });
    expect((await sync.sync()).ok).toBe(true);
    const local = leerLocal();
    expect(local.alumnos.find(a => a.id === 1)).toMatchObject({ nombre: 'Ana María', procedencia: 'Ariauto' });
    expect(local.practicas[0]).toMatchObject({ nota: 'del móvil', procedencia: 'Ariauto' });
    const res = await sync.pushAll();
    expect(res.ok).toBe(true);
    for (const t of ['alumnos', 'practicas', 'vehiculos', 'profesores', 'pagos', 'cargos']) {
      for (const fila of mockRemote.tables[t] || []) expect(fila).not.toHaveProperty('procedencia');
    }
  });
});

describe('pantalla (renderer/procedencia.js)', () => {
  global.esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ui = require('../renderer/procedencia.js');

  test('grupos: primero lo creado aquí y luego cada programa', () => {
    const items = [{ id: 1, procedencia: 'Ariauto' }, { id: 2 }, { id: 3, procedencia: 'ariauto' }, { id: 4, procedencia: 'Gesauto' }];
    const g = ui.gruposProcedencia(items);
    expect(g.map(x => [x.clave, x.items.map(i => i.id)])).toEqual([[ui.PROC_APP, [2]], ['Ariauto', [1, 3]], ['Gesauto', [4]]]);
  });

  test('filtro y desplegable', () => {
    expect(ui.coincideProcedenciaUI('Ariauto', ui.PROC_OTROS)).toBe(true);
    expect(ui.coincideProcedenciaUI(null, ui.PROC_APP)).toBe(true);
    expect(ui.coincideProcedenciaUI('Ariauto', 'gesauto')).toBe(false);
    const solo = ui.opcionesFiltroProcedencia(['Ariauto', null, 'Ariauto'], 'Ariauto');
    expect(solo).toContain('<option value="Ariauto" selected>Traídos de Ariauto</option>');
    expect(solo).not.toContain('__otros'); // con un solo programa sobra «de cualquier programa»
    expect(ui.opcionesFiltroProcedencia(['Ariauto', 'Gesauto'], '')).toContain('__otros');
  });
});
