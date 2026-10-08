// Datos ampliados (los mismos que guarda Ariauto: nº de registro, sexo,
// nacionalidad, tutor…), edición desde la ficha, coches retirados, buscador
// de exámenes, exportación y su sincronización (migración 2026-10-03).
const fs = require('fs');
const path = require('path');

const mockRemote = { online: true, tables: {} };
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./mocks/fake-supabase')(mockRemote)
}));

const db = require('../db');
const sync = require('../sync');
const { normalizarCampoExtra } = require('../db/campos-extra');
const { resetData, userDataDir } = require('./helpers');

const dataFile = path.join(userDataDir, 'data.json');
const leerLocal = () => { db._clearCache(); return JSON.parse(fs.readFileSync(dataFile, 'utf-8')); };
const futuro = (s = 1) => new Date(Date.now() + s * 1000).toISOString();

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  Object.assign(mockRemote, {
    online: true, authOk: true, authUserId: 'uid-jefe', tablasInexistentes: [], columnasInexistentes: {}, rpcHandlers: {}, rpcErrores: {},
    tables: { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [] }
  });
});

test('los campos ampliados se limpian: fechas, números, sexo, cambio y coche en uso', () => {
  expect(normalizarCampoExtra('sexo', '1')).toBe('H');
  expect(normalizarCampoExtra('sexo', 'Mujer')).toBe('M');
  expect(normalizarCampoExtra('sexo', 'x')).toBeNull();
  expect(normalizarCampoExtra('fecha', '2028-05-01T00:00:00Z')).toBe('2028-05-01');
  expect(normalizarCampoExtra('fecha', '01/05/2028')).toBeNull();
  expect(normalizarCampoExtra('entero', '2')).toBe(2);
  expect(normalizarCampoExtra('entero', '0')).toBeNull();
  expect(normalizarCampoExtra('cambio', 'Automático')).toBe('automatico');
  expect(normalizarCampoExtra('activo', undefined)).toBe(true);
  expect(normalizarCampoExtra('activo', false)).toBe(false);
  expect(normalizarCampoExtra('texto', '  ')).toBeNull();
});

test('alta con los datos ampliados y edición desde la ficha: solo cambia lo que llega', () => {
  const id = db.addAlumno('Lucía', 'B', null, null, null, null, { primer_apellido: 'Martín', n_registro: '4905', sexo: 'M', nacionalidad: 'España', dni_caducidad: '2030-01-01' });
  let a = db.getAlumnos().find(x => x.id === id);
  expect(a).toMatchObject({ n_registro: '4905', sexo: 'M', nacionalidad: 'España', dni_caducidad: '2030-01-01', tutor_nombre: null, telefono2: null });

  const r = db.updateAlumnoCampos(id, { telefono2: '988 111 222', provincia: 'Ourense', estado: 'inactivo', n_solicitud: '2', permisos: ['A2', 'xx'] });
  expect(r.ok).toBe(true);
  a = db.getAlumnos().find(x => x.id === id);
  expect(a).toMatchObject({ telefono2: '988 111 222', provincia: 'Ourense', estado: 'inactivo', n_solicitud: 2, permisos: ['A2'], n_registro: '4905', primer_apellido: 'Martín', nombre: 'Lucía' });

  expect(db.updateAlumnoCampos(id, { nombre: '  ' })).toMatchObject({ ok: false });
  expect(db.updateAlumnoCampos(999, { nombre: 'X' })).toMatchObject({ ok: false });
  // El libro de registro lleva el nº de registro y el nombre completo
  expect(db.getLibroRegistro()[0]).toMatchObject({ n_registro: '4905', nombre: 'Lucía Martín' });
});

test('buscador de la barra superior: alumnos por nombre sin tildes, DNI, nº de registro o teléfono; primero los que están en curso', () => {
  const a = db.addAlumno('Lucía', 'B', null, null, null, null, { primer_apellido: 'Martín', n_registro: '4905', dni: '12345678Z', telefono: '600 111 222' });
  const b = db.addAlumno('Lucía', 'B', null, null, null, null, { primer_apellido: 'Antigua', estado: 'inactivo' });
  expect(db.buscarAlumnosRapido('l')).toEqual([]);
  expect(db.buscarAlumnosRapido('lucia').map(x => x.id)).toEqual([a, b]);
  expect(db.buscarAlumnosRapido('martin lucia')[0]).toMatchObject({ id: a, nombre: 'Lucía Martín', n_registro: '4905' });
  expect(db.buscarAlumnosRapido('4905').map(x => x.id)).toEqual([a]);
  expect(db.buscarAlumnosRapido('600111222').map(x => x.id)).toEqual([a]);
  expect(db.buscarAlumnosRapido('12345678z').map(x => x.id)).toEqual([a]);
});

test('coche retirado: fecha de baja, al final de la lista, fuera de las estadísticas y del registro rápido', () => {
  const v1 = db.addVehiculo('Ibiza', '1111AAA', 1000);
  const v2 = db.addVehiculo('Corsa viejo', '2222BBB', 300000, null, { marca: 'Opel', modelo: 'Corsa', cambio: 'manual' });
  const al = db.addAlumno('Ana', 'B', v1);
  const apto = db.addAlumno('Bea', 'B', v1, null, null, null, { estado: 'apto' });
  expect(db.setVehiculoActivo(v2, false)).toEqual({ ok: true, activo: false });
  const lista = db.getVehiculos();
  expect(lista.map(v => v.id)).toEqual([v1, v2]);
  expect(lista[1]).toMatchObject({ activo: false, marca: 'Opel', cambio: 'manual' });
  expect(lista[1].fecha_baja).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(db.getResumen().vehiculos).toBe(1);
  expect(db.getPanelVehiculos('2026-10-03').vehiculos.map(v => v.id)).toEqual([v1]);
  // Registro rápido: los aprobados/bajas/inactivos no llenan la lista
  expect(db.getAlumnosPorVehiculo(v1, '2026-10-03').map(a => a.id)).toEqual([al]);
  expect(apto).toBeTruthy();
  // Vuelve a estar en uso
  db.setVehiculoActivo(v2, true);
  expect(db.getVehiculos().find(v => v.id === v2)).toMatchObject({ activo: true, fecha_baja: null });
  expect(db.getResumen().vehiculos).toBe(2);
});

test('buscador de exámenes: filtros, texto sin tildes, próximos y resumen de aprobados', () => {
  const lucia = db.addAlumno('Lucía', 'B', null, null, null, null, { primer_apellido: 'Martín', n_registro: '4905', dni: '12345678Z' });
  const pablo = db.addAlumno('Pablo', 'A2');
  db.addPresentacion({ alumno_id: lucia, tipo: 'circulacion', fecha: '2026-05-10', resultado: 'no_apto', examinador: 'Pedro', fallos: 3, fallos_detalle: 'Eliminatoria: 11.4' });
  db.addPresentacion({ alumno_id: lucia, tipo: 'circulacion', fecha: '2026-06-10', resultado: 'apto', examinador: 'Santi' });
  db.addPresentacion({ alumno_id: pablo, tipo: 'maniobras', fecha: '2999-01-01', resultado: 'pendiente', permiso: 'A2' });
  const hoy = '2026-10-03';
  let r = db.buscarExamenes({ hoy });
  expect(r.filas.map(f => f.fecha)).toEqual(['2999-01-01', '2026-06-10', '2026-05-10']);
  expect(r.resumen).toMatchObject({ total: 3, aptos: 1, no_aptos: 1, pendientes: 1, ratio: 0.5 });
  expect(r.opciones).toMatchObject({ permisos: ['A2', 'B'], examinadores: ['Pedro', 'Santi'] });
  expect(db.buscarExamenes({ texto: 'lucia martin', hoy }).filas).toHaveLength(2);
  expect(db.buscarExamenes({ texto: '4905', hoy }).filas).toHaveLength(2);
  expect(db.buscarExamenes({ examinador: 'Pedro', hoy }).filas[0]).toMatchObject({ alumno_nombre: 'Lucía Martín', alumno_n_registro: '4905', fallos: 3 });
  expect(db.buscarExamenes({ cuando: 'proximos', hoy }).filas.map(f => f.alumno_id)).toEqual([pablo]);
  expect(db.buscarExamenes({ cuando: 'hechos', resultado: 'apto', hoy }).filas).toHaveLength(1);
  expect(db.buscarExamenes({ desde: '2026-06-01', hasta: '2026-12-31', hoy }).filas).toHaveLength(1);
  expect(db.buscarExamenes({ permiso: 'B', hoy }).filas).toHaveLength(2); // el permiso del alumno si el examen no lo trae
  // Editar los datos nuevos del examen
  const id = r.filas[2].id;
  db.updatePresentacion(id, { examinador: '  Manuel ', fallos: '', n_solicitud: '2' });
  expect(db.getPresentaciones().find(p => p.id === id)).toMatchObject({ examinador: 'Manuel', fallos: null, n_solicitud: 2 });
});

test('exportar: alumnos con todos sus datos y exámenes filtrados, en CSV para Excel', () => {
  const a = db.addAlumno('Lucía', 'B', null, null, null, null, { primer_apellido: 'Martín', n_registro: '4905', sexo: 'M', fecha_nacimiento: '2007-03-04', observaciones: 'Prefiere tardes; sin prisa' });
  db.addAlumno('Otro', 'B');
  const r = db.exportarAlumnos({ ids: [a] });
  expect(r.total).toBe(1);
  const lineas = r.csv.replace(/^﻿/, '').split('\r\n');
  expect(lineas[0].split(';').slice(0, 4)).toEqual(['Nº registro', 'Nombre', 'Primer apellido', 'Segundo apellido']);
  expect(lineas[1]).toContain('4905;Lucía;Martín;');
  expect(lineas[1]).toContain(';Mujer;04/03/2007;');
  expect(lineas[1]).toContain('"Prefiere tardes; sin prisa"');
  db.addPresentacion({ alumno_id: a, tipo: 'teorico', fecha: '2026-07-10', resultado: 'apto' });
  const e = db.exportarExamenes({ resultado: 'apto' });
  expect(e.total).toBe(1);
  expect(e.csv).toContain('10/07/2026;Lucía Martín;');
});

function datosSync() {
  return {
    vehiculos: [{ id: 1, nombre: 'Ibiza', matricula: '4821 LKM', km_actual: 100, activo: false, marca: 'Seat', poliza: '123' }],
    profesores: [{ id: 1, nombre: 'Juan', nota: '', telefono: '600111222', n_certificado: '21266' }],
    tarifas: [], pagos: [], logs: [], sucursales: [],
    alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1, profesor_id: 1, n_registro: '4905', sexo: 'M', dni_caducidad: '2030-01-01', convocatoria: 2 }],
    practicas: [],
    _seq: { v: 2, a: 2, p: 1, pf: 2, t: 1, pg: 1, suc: 1 }
  };
}

test('sync: los datos ampliados suben y bajan; un coche retirado en otro PC llega retirado', async () => {
  sync.setCredentials('jefe@test.com', 'password123');
  fs.writeFileSync(dataFile, JSON.stringify(datosSync()), 'utf-8'); db._clearCache();
  ['vehiculos', 'profesores', 'alumnos'].forEach(t => sync.markDirty(t, 1));
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.vehiculos[0]).toMatchObject({ activo: false, marca: 'Seat', poliza: '123', modelo: null });
  expect(mockRemote.tables.profesores[0]).toMatchObject({ telefono: '600111222', n_certificado: '21266' });
  expect(mockRemote.tables.alumnos[0]).toMatchObject({ n_registro: '4905', sexo: 'M', dni_caducidad: '2030-01-01', convocatoria: 2, tutor_nombre: null });

  // Cambios hechos en otro PC
  Object.assign(mockRemote.tables.alumnos[0], { nacionalidad: 'Venezuela', updated_at: futuro(5) });
  Object.assign(mockRemote.tables.vehiculos[0], { activo: true, aseguradora: 'Mapfre', updated_at: futuro(5) });
  expect((await sync.sync()).ok).toBe(true);
  const local = leerLocal();
  expect(local.alumnos[0]).toMatchObject({ nacionalidad: 'Venezuela', n_registro: '4905', sexo: 'M' });
  expect(local.vehiculos[0]).toMatchObject({ activo: true, aseguradora: 'Mapfre', marca: 'Seat' });
});

test('sync sin la migración en la nube: no se mandan (ni en la subida completa) y se conservan en este PC', async () => {
  mockRemote.columnasInexistentes = { alumnos: ['n_registro'], vehiculos: ['activo'], profesores: ['n_certificado'] };
  sync.setCredentials('jefe@test.com', 'password123');
  fs.writeFileSync(dataFile, JSON.stringify(datosSync()), 'utf-8'); db._clearCache();
  ['vehiculos', 'profesores', 'alumnos'].forEach(t => sync.markDirty(t, 1));
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.alumnos[0]).not.toHaveProperty('n_registro');
  expect(mockRemote.tables.alumnos[0]).not.toHaveProperty('sexo');
  expect(mockRemote.tables.vehiculos[0]).not.toHaveProperty('activo');
  // Llega un cambio del móvil (sin las columnas): lo de este PC no se pierde
  Object.assign(mockRemote.tables.alumnos[0], { nombre: 'Ana María', updated_at: futuro(5) });
  expect((await sync.sync()).ok).toBe(true);
  expect(leerLocal().alumnos[0]).toMatchObject({ nombre: 'Ana María', n_registro: '4905', sexo: 'M' });
  const res = await sync.pushAll();
  expect(res.ok).toBe(true);
  expect(mockRemote.tables.alumnos[0]).not.toHaveProperty('n_registro');
});

// ─── Permisos de cada coche (migración 2026-10-09): columna aparte ──────────────
test('sync: los permisos del coche suben y bajan; un permiso nuevo llega de otro PC', async () => {
  sync.setCredentials('jefe@test.com', 'password123');
  const datos = datosSync(); datos.vehiculos[0].activo = true; datos.vehiculos[0].permisos = 'A2,A';
  fs.writeFileSync(dataFile, JSON.stringify(datos), 'utf-8'); db._clearCache();
  sync.markDirty('vehiculos', 1);
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.vehiculos[0]).toMatchObject({ permisos: 'A2,A', marca: 'Seat' });
  Object.assign(mockRemote.tables.vehiculos[0], { permisos: 'B', updated_at: futuro(5) });
  expect((await sync.sync()).ok).toBe(true);
  expect(leerLocal().vehiculos[0].permisos).toBe('B');
});

test('sync sin la columna de permisos en la nube: el resto de datos del coche sigue sincronizando y los permisos se conservan aquí', async () => {
  mockRemote.columnasInexistentes = { vehiculos: ['permisos'] };
  sync.setCredentials('jefe@test.com', 'password123');
  const datos = datosSync(); datos.vehiculos[0].activo = false; datos.vehiculos[0].permisos = 'B';
  fs.writeFileSync(dataFile, JSON.stringify(datos), 'utf-8'); db._clearCache();
  sync.markDirty('vehiculos', 1);
  expect((await sync.sync()).ok).toBe(true);
  // Lo demás (retirado, marca…) llega a la nube; los permisos no, pero no se pierden
  expect(mockRemote.tables.vehiculos[0]).toMatchObject({ activo: false, marca: 'Seat', poliza: '123' });
  expect(mockRemote.tables.vehiculos[0]).not.toHaveProperty('permisos');
  Object.assign(mockRemote.tables.vehiculos[0], { marca: 'Opel', updated_at: futuro(5) });
  expect((await sync.sync()).ok).toBe(true);
  expect(leerLocal().vehiculos[0]).toMatchObject({ marca: 'Opel', permisos: 'B' });
  expect((await sync.pushAll()).ok).toBe(true);
  expect(mockRemote.tables.vehiculos[0]).not.toHaveProperty('permisos');
});
