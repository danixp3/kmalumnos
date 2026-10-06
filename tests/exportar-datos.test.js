// Exportar todos los datos: catálogo, filtros de fechas y de alumno, Excel y JSON.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

function sembrar() {
  const vid = db.addVehiculo('Kia', '1234BCD', 1000);
  const pid = db.addProfesor('Javier', '', null, '76735508X');
  const ana = db.addAlumno('Ana', 'B', vid, pid, null, 'ana@x.com', { dni: '12345678Z', fecha_nacimiento: '2005-03-02', primer_apellido: 'Pérez' });
  const luis = db.addAlumno('Luis', 'B', vid, pid);
  db.addPractica(ana, vid, '2026-05-01', 1000, 1025, 'Rotondas', pid);
  db.addPractica(ana, vid, '2026-06-10', 1025, 1050, '', pid);
  db.addPractica(luis, vid, '2026-06-11', 1050, 1080, '', pid);
  db.addPago(ana, '2026-05-02', 60, 'Bono', null, 'bizum');
  return { vid, pid, ana, luis };
}

test('catálogo con el número de filas de cada tipo', () => {
  sembrar();
  const cat = db.catalogoExportacion();
  const de = k => cat.find(c => c.clave === k);
  expect(de('alumnos').total).toBe(2);
  expect(de('practicas').total).toBe(3);
  expect(de('pagos').total).toBe(1);
  expect(de('vehiculos').total).toBe(1);
  expect(cat.map(c => c.clave)).toEqual(expect.arrayContaining(['examenes', 'tasas', 'jornadas', 'vencimientos', 'interesados', 'historial', 'cargos', 'bonos', 'reservas']));
});

test('tablas con títulos y valores; las fechas acotan clases y pagos', () => {
  sembrar();
  const [practicas, pagos] = db.datosExportacion({ conjuntos: ['practicas', 'pagos'], desde: '2026-06-01', hasta: '2026-06-30' });
  expect(practicas.titulo).toBe('Clases prácticas');
  expect(practicas.filas).toHaveLength(2);
  const col = t => practicas.cabecera.indexOf(t);
  expect(practicas.filas[0][col('Fecha')]).toBe('2026-06-10');
  expect(practicas.filas[0][col('Km')]).toBe(25);
  expect(practicas.filas[0][col('Alumno')]).toBe('Ana Pérez');
  expect(pagos.filas).toHaveLength(0);
});

test('solo lo de un alumno (derecho de acceso)', () => {
  const { ana } = sembrar();
  const tablas = db.datosExportacion({ alumnoId: ana });
  const claves = tablas.map(t => t.clave);
  expect(claves).toEqual(expect.arrayContaining(['alumnos', 'practicas', 'pagos']));
  expect(claves).not.toContain('vehiculos');
  expect(tablas.find(t => t.clave === 'alumnos').filas).toHaveLength(1);
  expect(tablas.find(t => t.clave === 'practicas').filas).toHaveLength(2);
  const json = db.copiaJSON({ alumnoId: ana });
  expect(json.tablas.alumnos).toHaveLength(1);
  expect(json.tablas.practicas).toHaveLength(2);
  expect(json.tablas.vehiculos).toBeUndefined();
});

test('CSV con fechas dd/mm/aaaa y Excel con una hoja por tipo', () => {
  sembrar();
  const tablas = db.datosExportacion({ conjuntos: ['alumnos', 'practicas', 'pagos'] });
  const csv = db.tablaACSV(tablas.find(t => t.clave === 'pagos'));
  expect(csv).toMatch(/02\/05\/2026;Ana Pérez;60;Bizum/);
  const XLSX = require('xlsx');
  const libro = XLSX.read(db.libroExcel(tablas), { type: 'buffer', cellNF: true });
  expect(libro.SheetNames).toEqual(['Alumnos', 'Clases prácticas', 'Pagos']);
  const hoja = libro.Sheets['Clases prácticas'];
  expect(hoja.B2.t).toBe('n'); // la fecha es una fecha de Excel, no texto
  expect(XLSX.SSF.format(hoja.B2.z, hoja.B2.v)).toBe('01/05/2026');
});

test('la copia JSON no lleva las firmas salvo que se pidan', () => {
  const { ana, vid } = sembrar();
  const id = db.addPractica(ana, vid, '2026-06-12', 1080, 1100);
  const d = require('../db/core').load();
  d.practicas.find(p => p.id === id).firma = 'data:image/png;base64,AAAA';
  const sin = db.copiaJSON({});
  expect(sin.tablas.practicas.find(p => p.id === id)).toMatchObject({ tiene_firma: true });
  expect(sin.tablas.practicas.find(p => p.id === id).firma).toBeUndefined();
  expect(db.copiaJSON({ conFirmas: true }).tablas.practicas.find(p => p.id === id).firma).toMatch(/^data:image/);
});

test('la exportación queda en el historial', () => {
  sembrar();
  db.registrarExportacion('Exportación a Excel', ['datos.xlsx', 'Alumnos: 2']);
  expect(db.getLogs()[0]).toMatchObject({ tipo: 'exportacion', descripcion: 'Exportación a Excel' });
});
