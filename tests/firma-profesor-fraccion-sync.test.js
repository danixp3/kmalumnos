// Sync de la migración 2026-10-02: firma del profesor (profesores.firma),
// fracción de clase (practicas.fraccion: ¼ ½ ¾) y minutos acumulados del
// alumno (alumnos.minutos_sobrantes, solo los escribe la web). Sin la
// migración aplicada, nada de eso viaja y el sync sigue funcionando.
const fs = require('fs');
const path = require('path');

const mockRemote = { online: true, tables: {} };

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./mocks/fake-supabase')(mockRemote)
}));

const db = require('../db');
const sync = require('../sync');
const { resetData, userDataDir } = require('./helpers');

const dataFile = path.join(userDataDir, 'data.json');
function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
  db._clearCache();
}
const leerLocal = () => { db._clearCache(); return JSON.parse(fs.readFileSync(dataFile, 'utf-8')); };
const FIRMA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const FIRMA_WEB = FIRMA.replace('ggg==', 'ggA=');
const futuro = (s = 1) => new Date(Date.now() + s * 1000).toISOString();

function datos() {
  return {
    vehiculos: [{ id: 1, nombre: 'Ibiza', matricula: '4821 LKM', km_actual: 100 }],
    profesores: [{ id: 1, nombre: 'Juan', nota: '' }],
    tarifas: [], pagos: [], logs: [], sucursales: [],
    alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1, profesor_id: 1 }],
    practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-29', km_inicial: 100, km_final: 110, profesor_id: 1, fraccion: 0.5 }],
    _seq: { v: 2, a: 2, p: 2, pf: 2, t: 1, pg: 1, suc: 1 }
  };
}

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  mockRemote.online = true;
  mockRemote.authOk = true;
  mockRemote.authUserId = 'uid-jefe';
  mockRemote.tablasInexistentes = [];
  mockRemote.columnasInexistentes = {};
  mockRemote.rpcHandlers = {};
  mockRemote.rpcErrores = {};
  mockRemote.tables = { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [] };
  sync.setCredentials('jefe@test.com', 'password123');
});

async function subirTodo() {
  sync.markDirty('vehiculos', 1); sync.markDirty('profesores', 1); sync.markDirty('alumnos', 1); sync.markDirty('practicas', 1);
  expect((await sync.sync()).ok).toBe(true);
}

test('la firma del profesor se sube solo cuando se cambia en este PC', async () => {
  writeData(datos());
  await subirTodo();
  expect(mockRemote.tables.profesores[0]).not.toHaveProperty('firma'); // nada que subir aún

  expect(db.setFirmaProfesor(1, FIRMA).ok).toBe(true);
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.profesores[0].firma).toBe(FIRMA);
  expect(leerLocal().profesores[0].firma_pendiente).toBeUndefined(); // ya subida

  // La firma se cambia en el móvil; aquí se edita el nombre antes de bajarla:
  // la subida del nombre no pisa la firma nueva, y luego se baja.
  mockRemote.tables.profesores[0].firma = FIRMA_WEB;
  db.updateProfesor(1, 'Juan Pérez', '', null);
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.profesores[0]).toMatchObject({ nombre: 'Juan Pérez', firma: FIRMA_WEB });
  mockRemote.tables.profesores[0].updated_at = futuro(5);
  expect((await sync.sync()).ok).toBe(true);
  expect(db.getFirmaProfesor(1)).toBe(FIRMA_WEB);

  // Quitarla aquí la quita también en la nube
  db.setFirmaProfesor(1, null);
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.profesores[0].firma).toBeNull();
});

test('sin la columna firma en la nube: el profesor se sube sin ella y la firma espera en local', async () => {
  mockRemote.columnasInexistentes = { profesores: ['firma'], practicas: ['fraccion'], alumnos: ['minutos_sobrantes'] };
  sync.setCredentials('jefe@test.com', 'password123');
  writeData(datos());
  db.setFirmaProfesor(1, FIRMA);
  await subirTodo();
  expect(mockRemote.tables.profesores[0]).not.toHaveProperty('firma');
  expect(mockRemote.tables.practicas[0]).not.toHaveProperty('fraccion');
  expect(leerLocal().profesores[0].firma_pendiente).toBe(true);
  expect(db.getFirmaProfesor(1)).toBe(FIRMA);
});

test('fracción de clase: sube y baja; minutos acumulados del alumno: solo se bajan', async () => {
  writeData(datos());
  await subirTodo();
  expect(mockRemote.tables.practicas[0].fraccion).toBe(0.5);
  expect(mockRemote.tables.alumnos[0]).not.toHaveProperty('minutos_sobrantes');

  // La web anota ¼ de clase y deja 7,5 minutos acumulados al alumno
  mockRemote.tables.practicas.push({ id: 2, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-30', km_inicial: 110, km_final: 115,
    fraccion: '0.25', deleted: false, empresa_id: 'uid-jefe', updated_at: futuro() });
  Object.assign(mockRemote.tables.alumnos[0], { minutos_sobrantes: '7.50', updated_at: futuro() });
  expect((await sync.sync()).ok).toBe(true);
  const local = leerLocal();
  expect(local.practicas.find(p => p.id === 2).fraccion).toBe(0.25);
  expect(local.alumnos[0].minutos_sobrantes).toBe(7.5);

  // Una edición del alumno en este PC no toca los minutos de la nube
  mockRemote.tables.alumnos[0].minutos_sobrantes = '3.75';
  sync.markDirty('alumnos', 1);
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.alumnos[0].minutos_sobrantes).toBe('3.75');
});

test('subida completa (pushAll): ni la firma, ni la fracción ni los minutos viajan en bloque', async () => {
  writeData({ ...datos(), profesores: [{ id: 1, nombre: 'Juan', nota: '', firma: FIRMA, firma_pendiente: true }],
    alumnos: [{ id: 1, nombre: 'Ana', permiso: 'B', vehiculo_id: 1, profesor_id: 1, minutos_sobrantes: 5 }] });
  const res = await sync.pushAll();
  expect(res.ok).toBe(true);
  expect(mockRemote.tables.profesores[0]).not.toHaveProperty('firma');
  expect(mockRemote.tables.profesores[0]).not.toHaveProperty('firma_pendiente');
  expect(mockRemote.tables.practicas[0]).not.toHaveProperty('fraccion');
  expect(mockRemote.tables.alumnos[0]).not.toHaveProperty('minutos_sobrantes');
});
