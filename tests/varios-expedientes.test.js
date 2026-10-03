// Una misma persona con varios expedientes (2026-10-04): en el programa
// anterior cada permiso o curso que saca un alumno es una ficha con su propio
// nº de registro (B, luego C y C+E; A2 y luego A; el CAP…). Al importar, cada
// ficha es un expediente aparte; la misma ficha copiada en otra sección se
// junta; al alumno que ya estaba en la app le toca la ficha de su permiso
// actual; y dos personas distintas que se llaman igual no se mezclan.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resetData, userDataDir } = require('./helpers');
const { elegirExpediente } = require('../db/migracion')._interno;

const HOY = '2026-10-04';
const dataFile = path.join(userDataDir, 'data.json');
const leer = () => { db._clearCache(); return JSON.parse(fs.readFileSync(dataFile, 'utf-8')); };
const escribir = d => { fs.writeFileSync(dataFile, JSON.stringify({ vehiculos: [], profesores: [], practicas: [], tarifas: [], pagos: [], logs: [], sucursales: [], _seq: { v: 1, pf: 1, a: 10, p: 1, t: 1, pg: 1, suc: 1 }, ...d }), 'utf-8'); db._clearCache(); };

beforeEach(() => resetData(db));

const ficha = (seccion, n, nombre, a1, a2, dni, permiso, alta, extra = {}) => ({
  'Nº ALUMNO': n, SECCION: seccion, NOMBREALUMNO: nombre, 'PRIMER APELLIDO': a1, 'SEGUNDO APELLIDO': a2,
  'DNI DEL ALUMNO': dni ? dni.slice(0, -1) : null, 'NIF DEL ALUMNO': dni ? dni.slice(-1) : null, 'FECHA DE ALTA': alta, PERMISO: permiso, Teorico_Apto: true, ...extra
});
function tablas() {
  return {
    ALUMNOS: [
      // Pedro: B (aprobado), C (aprobado; copiado en la sección de cursos) y C+E en curso
      ficha(1, '3001', 'PEDRO', 'RIOS', 'VAL', '11111111H', 4, '2015-03-01', { motivo_archivado: 'APTO', 'FECHA APROBADO': '2015-07-01' }),
      ficha(1, '4500', 'PEDRO', 'RIOS', 'VAL', '11111111H', 7, '2024-02-01', { motivo_archivado: 'APTO', 'FECHA APROBADO': '2024-06-01' }),
      ficha(11, '4500', 'PEDRO', 'RIOS', 'VAL', '11111111H', 7, '2024-02-01'),
      ficha(1, '4900', 'PEDRO', 'RIOS', 'VAL', '11111111H', 8, '2026-06-01'),
      // Dos personas distintas que se llaman igual (otro DNI), las dos en curso
      ficha(1, '4901', 'ANA', 'LOPEZ', 'GIL', '22222222J', 4, '2026-07-01'),
      ficha(1, '4902', 'ANA', 'LOPEZ', 'GIL', '33333333P', 4, '2026-08-01')
    ],
    PERMISOS: [{ 'NUMERO PERMISO': 4, 'NOMBRE PERMISO': 'B' }, { 'NUMERO PERMISO': 7, 'NOMBRE PERMISO': 'C' }, { 'NUMERO PERMISO': 8, 'NOMBRE PERMISO': 'EC' }],
    PROFESORES: [], VEHICULOS: [], PRACTICAS: [], Tasas_Alumnos: [],
    'GASTOS E INGRESOS': [],
    'FECHA DE EXAMEN': [
      { 'Nº ALUMNO': '3001', SECCIONEX: 1, 'F EXAMEN': '2015-06-20', 'TIPO DE EXAMEN': 5, 'RESULTADO DE EXAMEN': 1, 'PERMISO EXAMEN': 4, CONVOCATORIA: 1 },
      { 'Nº ALUMNO': '4500', SECCIONEX: 1, 'F EXAMEN': '2024-05-30', 'TIPO DE EXAMEN': 5, 'RESULTADO DE EXAMEN': 1, 'PERMISO EXAMEN': 7, CONVOCATORIA: 1 }
    ],
    'DATOS DE AUTOESCUELA': [{ SECCION: 1, 'NUMERO DE AUTOESCUELA': 'OR0028', 'NOMBRE DE SECCION': 'XINZO', 'SECCION POR DEFECTO': true }, { SECCION: 11, 'NOMBRE DE SECCION': 'XINZO CAP' }]
  };
}

test('Ariauto: cada permiso es un expediente con su nº; la copia en otra sección se junta; el de la app se queda con el actual', () => {
  // Pedro metido a mano en la Puesta en marcha (sin nº ni DNI), sacándose el C+E
  escribir({ alumnos: [{ id: 1, nombre: 'Pedro', primer_apellido: 'Ríos', segundo_apellido: 'Val', permiso: 'CE', estado: 'en_practicas', fecha_alta: HOY, clases_previas: 0 }] });
  const plan = db.planAriauto(tablas(), { hoy: HOY, alcance: 'todos', secciones: [1, 11] });
  const pedro = plan.filas.filter(f => f.dni === '11111111H');
  expect(pedro.map(f => [f.n_registro, f.permiso, f.accion])).toEqual([['3001', 'B', 'nuevo'], ['4500', 'C', 'nuevo'], ['4900', 'CE', 'actualizar']]);
  expect(pedro.find(f => f.n_registro === '4900')).toMatchObject({ id: 1 });
  expect(pedro.find(f => f.n_registro === '4500').avisos.join(' ')).toMatch(/Otro permiso o curso de «Pedro Ríos Val», que ya está en la app \(nº 4900, permiso CE\)/);
  expect(pedro.find(f => f.n_registro === '3001').otrosExpedientes.map(o => o.n_registro).sort()).toEqual(['4500', '4900']);
  // Las dos Ana López (otro DNI) son personas distintas: entran las dos, sin avisos de «otro permiso»
  const anas = plan.filas.filter(f => /^Ana/.test(f.nombre));
  expect(anas.map(f => [f.n_registro, f.accion])).toEqual([['4901', 'nuevo'], ['4902', 'nuevo']]);
  expect(anas.every(f => !f.otrosExpedientes && !f.avisos.length)).toBe(true);
  expect(plan.resumen).toMatchObject({ expedientesAparte: 2, personasVariosExpedientes: 1 });

  const res = db.aplicarAriauto(tablas(), { hoy: HOY, alcance: 'todos', secciones: [1, 11] }, 'Datos Ariauto.accdb');
  expect(res.ok).toBe(true);
  let d = leer();
  const exp = d.alumnos.filter(a => a.dni === '11111111H').map(a => [a.id === 1, a.n_registro, a.permiso, a.estado]).sort((x, y) => x[1].localeCompare(y[1]));
  expect(exp).toEqual([[false, '3001', 'B', 'apto'], [false, '4500', 'C', 'apto'], [true, '4900', 'CE', 'en_practicas']]);
  // Cada examen, en su expediente
  const idDe = n => d.alumnos.find(a => a.n_registro === n).id;
  expect(d.presentaciones.map(p => [p.alumno_id === idDe('3001') ? '3001' : p.alumno_id === idDe('4500') ? '4500' : '?', p.permiso])).toEqual([['3001', 'B'], ['4500', 'C']]);
  // La ficha de cada uno enseña los otros
  const otros = db.getFichaAlumno(1, HOY).otros_expedientes;
  expect(otros.map(x => [x.n_registro, x.permiso])).toEqual([['4500', 'C'], ['3001', 'B']]);
  expect(db.getFichaAlumno(idDe('4901'), HOY).otros_expedientes).toEqual([]); // la otra Ana es otra persona

  // Volver a abrir la copia: cada ficha encuentra su expediente
  const otra = db.planAriauto(tablas(), { hoy: HOY, alcance: 'todos', secciones: [1, 11] });
  expect(otra.resumen).toMatchObject({ nuevos: 0, revisar: 0, completar: 5, conCambios: 0 });
});

test('Ariauto: dos personas que se llaman igual frente a un alumno de la app sin DNI → no se toca (no se mezclan)', () => {
  escribir({ alumnos: [{ id: 1, nombre: 'Ana', primer_apellido: 'López', segundo_apellido: 'Gil', permiso: 'B', estado: 'en_practicas', fecha_alta: HOY }] });
  const plan = db.planAriauto(tablas(), { hoy: HOY });
  const anas = plan.filas.filter(f => /^Ana/.test(f.nombre));
  expect(anas.map(f => f.accion)).toEqual(['revisar', 'revisar']);
  expect(anas[0].avisos.join(' ')).toMatch(/más de una persona que se llama así/);
  // Con su DNI en la app ya se sabe cuál es
  escribir({ alumnos: [{ id: 1, nombre: 'Ana', primer_apellido: 'López', segundo_apellido: 'Gil', dni: '33333333P', permiso: 'B', estado: 'en_practicas', fecha_alta: HOY }] });
  const plan2 = db.planAriauto(tablas(), { hoy: HOY });
  expect(plan2.filas.filter(f => /^Ana/.test(f.nombre)).map(f => [f.n_registro, f.accion])).toEqual([['4901', 'revisar'], ['4902', 'actualizar']]);
});

test('Excel/CSV: dos filas de la misma persona con otro nº y permiso son dos expedientes; el de la app, el de su permiso', () => {
  escribir({ alumnos: [{ id: 1, nombre: 'Luis', primer_apellido: 'Mora', dni: '44444444A', permiso: 'A', estado: 'en_practicas', fecha_alta: HOY }] });
  const texto = 'Nº;Nombre;Apellidos;DNI;Permiso\n4206;Luis;Mora;44444444A;A2\n4680;Luis;Mora;44444444A;A\n4680;Luis;Mora;44444444A;A\n';
  const h = db.leerTextoTabla(texto);
  const det = db.detectarTablaMigracion(h, 'alumnos');
  const e = { tipo: 'alumnos', filas: h.filas, numFila: h.numFila, filaCabecera: det.filaCabecera, mapeo: det.mapeo, opciones: { hoy: HOY } };
  const plan = db.analizarImportacion(e);
  expect(plan.filas.map(f => [f.accion, f.id || null])).toEqual([['nuevo', null], ['actualizar', 1], ['omitir', null]]);
  expect(plan.filas[0].avisos.join(' ')).toMatch(/Otro expediente de «Luis Mora»/);
  expect(plan.filas[2].motivo).toMatch(/Repetido \(fila 3\)/);
  expect(db.aplicarImportacion(e).ok).toBe(true);
  const d = leer();
  expect(d.alumnos.map(a => [a.n_registro, a.permiso]).sort()).toEqual([['4206', 'A2'], ['4680', 'A']]);
  // Otra vez: cada fila con su expediente (por su nº)
  const otra = db.analizarImportacion(e);
  expect(otra.filas.map(f => f.accion)).toEqual(['igual', 'igual', 'omitir']);
});

test('elegir expediente: por nº, por permiso o el único en curso; buscar por texto da el que sigue en curso', () => {
  const lista = [{ id: 1, n_registro: '3001', permiso: 'B', estado: 'apto' }, { id: 2, n_registro: '4900', permiso: 'CE', estado: 'en_practicas' }, { id: 3, n_registro: '4500', permiso: 'C', estado: 'apto' }];
  expect(elegirExpediente(lista, { n_registro: '4500' }).id).toBe(3);
  expect(elegirExpediente(lista, { permiso: 'B' }).id).toBe(1);
  expect(elegirExpediente(lista, {}).id).toBe(2);
  expect(elegirExpediente([{ id: 1, estado: 'en_practicas' }, { id: 2, estado: 'en_practicas' }], {})).toBe(null);
  escribir({ alumnos: lista.map(a => ({ ...a, nombre: 'Pedro', primer_apellido: 'Ríos', dni: '11111111H' })) });
  expect(db.buscarAlumnoPorTexto(require('../db/core').load(), 'Pedro Ríos', '11111111H').id).toBe(2);
  expect(db.buscarAlumnoPorTexto(require('../db/core').load(), 'Pedro Ríos', '').id).toBe(2);
});

test('Puesta en marcha: la misma persona con otro permiso se puede dar de alta (otro expediente)', () => {
  escribir({ alumnos: [{ id: 1, nombre: 'Kole', primer_apellido: 'Bardechi', permiso: 'B', estado: 'en_practicas', n_registro: '4906', fecha_alta: HOY }] });
  expect(db.guardarPuestaEnMarcha({ alumnos: [{ id: null, nombre: 'Kole', primer_apellido: 'Bardechi', permiso: 'B' }] }).ok).toBe(false);
  expect(db.guardarPuestaEnMarcha({ alumnos: [{ id: null, nombre: 'Kole', primer_apellido: 'Bardechi', permiso: 'A2' }] }).ok).toBe(true);
  expect(leer().alumnos.map(a => [a.permiso, a.n_registro])).toEqual([['B', '4906'], ['A2', '4907']]);
});
