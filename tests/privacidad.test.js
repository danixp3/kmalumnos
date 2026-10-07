// Conservación y supresión (RGPD): alumnos fuera de plazo y anonimización,
// también en la nube (firma y datos borrados por el sync).
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
function writeData(data) { fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8'); db._clearCache(); }
const FIRMA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

beforeEach(() => {
  resetData(db);
  sync.setCredentials(null, null);
  Object.assign(mockRemote, { online: true, authOk: true, authUserId: 'uid-jefe', tablasInexistentes: [], columnasInexistentes: {}, rpcHandlers: {}, rpcErrores: {} });
  mockRemote.tables = { meta: [{ key: 'ping' }], vehiculos: [], alumnos: [], practicas: [], profesores: [], tarifas: [], pagos: [] };
});

function datos() {
  return {
    vehiculos: [{ id: 1, nombre: 'Kia', matricula: '1234 BCD', km_actual: 1000 }],
    profesores: [], tarifas: [], pagos: [{ id: 1, alumno_id: 1, fecha: '2018-03-01', cantidad: 60, nota: 'Pago de Ana López' }], logs: [{ id: 1, fecha: '2018-01-01T10:00:00Z', tipo: 'alumno', descripcion: 'Añadido alumno Ana López Pérez', detalles: ['DNI 12345678Z'] }], sucursales: [],
    alumnos: [
      { id: 1, nombre: 'Ana', primer_apellido: 'López', segundo_apellido: 'Pérez', dni: '12345678Z', email: 'ana@x.com', telefono: '600123456', direccion: 'Calle 1', fecha_nacimiento: '2000-01-01', permiso: 'B', estado: 'aprobado', fecha_alta: '2017-09-01', n_registro: '15', tutor_nombre: 'Padre', observaciones: 'Nerviosa' },
      { id: 2, nombre: 'Luis', permiso: 'B', estado: 'en_practicas', fecha_alta: '2017-09-01' },
      { id: 3, nombre: 'Eva', permiso: 'B', estado: 'baja', fecha_alta: '2024-01-01' }
    ],
    practicas: [
      { id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2018-02-01', km_inicial: 1000, km_final: 1030, nota: 'Rotondas con Ana', firma: FIRMA },
      { id: 2, alumno_id: 2, vehiculo_id: 1, fecha: '2018-02-02', km_inicial: 1030, km_final: 1060, firma: FIRMA }
    ],
    _seq: { v: 2, a: 4, p: 3, pf: 1, t: 1, pg: 2, suc: 1 }
  };
}

test('propone anonimizar solo a los que terminaron y llevan más del plazo sin actividad', () => {
  writeData(datos());
  const lista = db.getAlumnosParaSuprimir(6, '2026-10-07');
  expect(lista.map(x => x.id)).toEqual([1]); // Luis sigue en prácticas; Eva es reciente
  expect(lista[0]).toMatchObject({ nombre: 'Ana López Pérez', ultima_actividad: '2018-03-01' });
  expect(db.getAlumnosParaSuprimir(10, '2026-10-07')).toEqual([]);
});

test('anonimizar quita lo que identifica y conserva clases, km e importes', () => {
  writeData(datos());
  const r = db.anonimizarAlumnos([1]);
  expect(r).toMatchObject({ anonimizados: 1, practicas: 1 });
  const d = require('../db/core').load();
  const a = d.alumnos.find(x => x.id === 1);
  expect(a.nombre).toBe('Alumno anonimizado nº 15');
  for (const c of ['primer_apellido', 'dni', 'email', 'telefono', 'direccion', 'fecha_nacimiento', 'tutor_nombre', 'observaciones']) expect(a[c]).toBeNull();
  expect(a).toMatchObject({ permiso: 'B', estado: 'aprobado', n_registro: '15' });
  const p = d.practicas.find(x => x.id === 1);
  expect(p).toMatchObject({ km_inicial: 1000, km_final: 1030, firma: null, nota: '', firma_borrar: true });
  expect(d.practicas.find(x => x.id === 2).firma).toBe(FIRMA); // las de otros no se tocan
  expect(d.pagos[0]).toMatchObject({ cantidad: 60, nota: '' });
  // El historial ya no lo nombra
  expect(JSON.stringify(d.logs)).not.toMatch(/Ana López|12345678Z/);
  // No se anonimiza dos veces y desaparece de la lista
  expect(db.anonimizarAlumnos([1]).anonimizados).toBe(0);
  expect(db.getAlumnosParaSuprimir(6, '2026-10-07')).toEqual([]);
});

test('en la nube también se borran sus datos y la firma de sus clases', async () => {
  writeData(datos());
  sync.setCredentials('jefe@test.com', 'password123');
  for (const t of ['vehiculos', 'alumnos', 'practicas']) sync.markDirtyVarios(t, t === 'vehiculos' ? [1] : [1, 2]);
  expect((await sync.sync()).ok).toBe(true);
  expect(mockRemote.tables.practicas.find(p => p.id === 1).firma).toBe(FIRMA);
  db._clearCache();
  db.anonimizarAlumnos([1]);
  expect((await sync.sync()).ok).toBe(true);
  const remA = mockRemote.tables.alumnos.find(a => a.id === 1);
  expect(remA).toMatchObject({ nombre: 'Alumno anonimizado nº 15', dni: null, telefono: null, primer_apellido: null });
  const remP = mockRemote.tables.practicas.find(p => p.id === 1);
  expect(remP.firma).toBeNull();
  expect(remP.nota).toBe('');
  expect(mockRemote.tables.practicas.find(p => p.id === 2).firma).toBe(FIRMA);
});
