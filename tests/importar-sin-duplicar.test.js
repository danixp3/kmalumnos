// «Puesta en marcha» y «Traer de otro programa» sin chocar (2026-10-03): los
// alumnos metidos a mano para ir anotando sus clases no se duplican al traer
// la copia de Ariauto (aunque su nombre tenga una errata), sus clases anotadas
// no se cuentan dos veces, las de Ariauto entran con su día, la fecha de alta
// y el nombre pasan a ser los reales, y cada profesor recibe su coche habitual.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resetData, userDataDir } = require('./helpers');
const { repartirClases, trocearClases } = require('../db/ariauto')._ariauto;
const { personaParecida } = require('../db/migracion')._interno;

const HOY = '2026-10-03';
const dataFile = path.join(userDataDir, 'data.json');
const leer = () => { db._clearCache(); return JSON.parse(fs.readFileSync(dataFile, 'utf-8')); };
const nombre = a => [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ');

beforeEach(() => resetData(db));

// Lo que había en la app tras la Puesta en marcha: alumnos escritos a mano
// (mayúsculas, una errata, sin número ni DNI, con la fecha de ese día) y sus
// clases anteriores anotadas con su fecha y sin km.
function datosApp() {
  const anterior = (id, alumno_id, fecha) => ({ id, alumno_id, vehiculo_id: 14, profesor_id: 20, fecha, km_inicial: 0, km_final: 0, tipo: 'circulacion', hora_inicio: null, tipo_detalle: 'anterior' });
  const alumno = (id, nombre, a1, a2, extra = {}) => ({ id, nombre, primer_apellido: a1, segundo_apellido: a2, permiso: 'B', vehiculo_id: 14, profesor_id: 20, estado: 'en_practicas', fecha_alta: HOY, clases_previas: 0, km_previos: 0, n_registro: null, dni: null, ...extra });
  return {
    vehiculos: [{ id: 13, nombre: 'KIA AZUL', matricula: '6643LSC', km_actual: 100 }, { id: 14, nombre: 'TAIGO', matricula: '6664NNM', km_actual: 100 }],
    profesores: [{ id: 19, nombre: 'JAVIER PÉREZ ALONSO', nota: '' }, { id: 20, nombre: 'DANIEL ALEXIS PÉREZ NICOLÁS', nota: '' }],
    alumnos: [
      alumno(1, 'GASTON', 'EMANUEL', 'FARIA'),
      alumno(2, 'Kole', 'Bardechi', null),
      alumno(3, 'MARICELY', 'AMIGO', 'ARIAS'),
      alumno(4, 'Erika', 'Souto', 'Satour', { clases_previas: 43 }),
      alumno(5, 'María', 'García', 'López')
    ],
    practicas: [
      anterior(1, 1, '2026-08-17'), anterior(2, 1, '2026-08-17'), anterior(3, 1, '2026-08-18'), anterior(4, 1, '2026-08-18'), anterior(5, 1, '2026-09-30'), anterior(6, 1, '2026-09-30'),
      anterior(7, 2, '2026-09-21'), anterior(8, 2, '2026-09-21'),
      anterior(9, 3, '2026-09-11'), anterior(10, 3, '2026-09-11'), anterior(11, 3, '2026-09-21')
    ],
    tarifas: [], pagos: [], logs: [], sucursales: [],
    _seq: { v: 15, pf: 21, a: 6, p: 12, t: 1, pg: 1, suc: 1 }
  };
}

const apunte = (n, fecha, concepto, cantidad, debe) => ({ 'Nº ALUMNO': n, 'SECCION IOG': 1, FECHA: fecha, CONCEPTO: concepto, CANTIDAD: cantidad, EURODEBE: String(debe), EUROHABER: '0', TIPOAPUNTE: 3 });
function tablas() {
  return {
    ALUMNOS: [
      { 'Nº ALUMNO': '4888', SECCION: 1, NOMBREALUMNO: 'GASTON EMANUEL', 'PRIMER APELLIDO': 'FARIA', 'DNI DEL ALUMNO': 'Z3129645', 'NIF DEL ALUMNO': 'V', 'FECHA DE ALTA': '2026-08-12', PERMISO: 4, PROFESOR: 13, Teorico_Apto: true },
      { 'Nº ALUMNO': '4512', SECCION: 1, NOMBREALUMNO: 'KOLË', 'PRIMER APELLIDO': 'BARDHECI', 'FECHA DE ALTA': '2023-09-25', PERMISO: 4, PROFESOR: 13, Teorico_Apto: true },
      { 'Nº ALUMNO': '4846', SECCION: 1, NOMBREALUMNO: 'MARICELY', 'PRIMER APELLIDO': 'AMIGO', 'SEGUNDO APELLIDO': 'ARIAS', 'FECHA DE ALTA': '2026-06-22', PERMISO: 4, PROFESOR: 13 },
      { 'Nº ALUMNO': '4733', SECCION: 1, NOMBREALUMNO: 'ERIKA', 'PRIMER APELLIDO': 'SOUTO', 'SEGUNDO APELLIDO': 'SATOUR', 'FECHA DE ALTA': '2025-07-09', PERMISO: 4 },
      // Su hermano: mismos apellidos, otro nombre → otro alumno
      { 'Nº ALUMNO': '4901', SECCION: 1, NOMBREALUMNO: 'MARIO', 'PRIMER APELLIDO': 'GARCIA', 'SEGUNDO APELLIDO': 'LOPEZ', 'FECHA DE ALTA': '2026-09-01', PERMISO: 4 },
      // Uno que no se metió en la Puesta en marcha
      { 'Nº ALUMNO': '4905', SECCION: 1, NOMBREALUMNO: 'NUEVA', 'PRIMER APELLIDO': 'PEREZ', 'FECHA DE ALTA': '2026-07-01', PERMISO: 4, PROFESOR: 7 }
    ],
    PERMISOS: [{ 'NUMERO PERMISO': 4, 'NOMBRE PERMISO': 'B' }],
    PROFESORES: [
      { 'NUMERO PROFESOR': 7, NOMBRE: 'JAVIER', 'PRIMER APELLIDO PRF': 'PEREZ', 'SEGUNDO APELLIDO PRF': 'ALONSO' },
      { 'NUMERO PROFESOR': 13, NOMBRE: 'DANIEL ALEXIS', 'PRIMER APELLIDO PRF': 'PEREZ', 'SEGUNDO APELLIDO PRF': 'NICOLAS' }
    ],
    VEHICULOS: [
      { 'NUMERO DE VEHICULO': 24, MATRICULA: '6643LSC', MARCA: 'KIA', MODELO: 'XCEED' },
      { 'NUMERO DE VEHICULO': 29, MATRICULA: '6664NNM', MARCA: 'VOLKSWAGEN', MODELO: 'TAIGO' }
    ],
    'GASTOS E INGRESOS': [
      // GASTON: las mismas clases que ya están anotadas en la app
      apunte('4888', '2026-08-17', '2-CLASES', 2, 60), apunte('4888', '2026-08-18', '2-CLASES', 2, 60),
      // Kole: un bono de hace casi un año (otras clases) y la renovación
      apunte('4512', '2025-11-20', 'Clases Prácticas de Permiso "B"', 10, 280), apunte('4512', '2026-08-11', 'RENOVACIÓN', 1, 250),
      // MARICELY: un bono justo antes de sus clases anotadas (pueden ser las mismas) y esas clases
      apunte('4846', '2026-09-05', '10-CLASES PRÁCTICAS', 10, 280), apunte('4846', '2026-09-11', '2-CLASES', 3, 90), apunte('4846', '2026-09-21', '2-CLASES', 2, 60),
      // Erika (ya tiene sus 43 «clases ya hechas»)
      apunte('4733', '2026-09-01', '2-CLASES', 2, 60),
      // La nueva: clases sueltas con su día y un bono anterior
      apunte('4905', '2026-07-02', '12-CLASES PRÁCTICAS', 12, 336), apunte('4905', '2026-09-17', '2-CLASES', 2, 60), apunte('4905', '2026-09-20', '2,5-CLASES', 2.5, 75)
    ],
    PRACTICAS: [],
    'FECHA DE EXAMEN': [
      // Javier presenta a sus alumnos de coche con el Kia
      ...['2026-03-01', '2026-05-01', '2026-07-01'].map(f => ({ 'Nº ALUMNO': '4000', SECCIONEX: 1, 'F EXAMEN': f, 'TIPO DE EXAMEN': 5, 'RESULTADO DE EXAMEN': 1, PROFESOR: 7, 'PERMISO EXAMEN': 4, VEHICULO: 24 })),
      { 'Nº ALUMNO': '4000', SECCIONEX: 1, 'F EXAMEN': '2026-08-01', 'TIPO DE EXAMEN': 5, 'RESULTADO DE EXAMEN': 1, PROFESOR: 7, 'PERMISO EXAMEN': 4, VEHICULO: 29 }
    ],
    Tasas_Alumnos: [],
    'DATOS DE AUTOESCUELA': [{ SECCION: 1, 'NUMERO DE AUTOESCUELA': 'OR0028', 'NOMBRE DE SECCION': 'XINZO', 'SECCION POR DEFECTO': true }]
  };
}

test('reparto de las clases de Ariauto: con su día, bonos y las que ya están en la app', () => {
  const e = [{ fecha: '2026-07-02', n: 12 }, { fecha: '2026-09-17', n: 2 }, { fecha: '2026-09-20', n: 2.5 }, { fecha: '2026-09-20', n: 1 }];
  expect(repartirClases(e)).toEqual({ conFecha: [{ fecha: '2026-09-17', n: 2 }, { fecha: '2026-09-20', n: 3.5 }], sinFecha: 12, omitidas: 0, bonoDudoso: 0, total: 17.5 });
  // Con clases en la app desde el 18/09: lo de ese día en adelante no entra
  expect(repartirClases(e, '2026-09-18')).toMatchObject({ conFecha: [{ fecha: '2026-09-17', n: 2 }], sinFecha: 12, omitidas: 3.5 });
  // Un bono cobrado poco antes de la primera clase en la app: dudoso, no se suma
  expect(repartirClases([{ fecha: '2026-09-05', n: 10 }], '2026-09-11')).toMatchObject({ sinFecha: 0, omitidas: 10, bonoDudoso: 10 });
  expect(trocearClases(2.5)).toEqual([1, 1, 0.5]);
  expect(trocearClases(0.75)).toEqual([0.75]);
});

test('parecidos: una errata o un apellido de menos es el mismo; otro nombre de pila, no (hermanos)', () => {
  const p = (nombre, a1, a2, dni) => ({ nombre, primer_apellido: a1, segundo_apellido: a2, dni });
  expect(personaParecida(p('Kole', 'Bardechi'), p('Kolë', 'Bardheci'))).toBe(true);
  expect(personaParecida(p('Saul', 'Gómez'), p('Saul', 'Gomez', 'Dacal'))).toBe(true);
  expect(personaParecida(p('María', 'García', 'López'), p('Mario', 'García', 'López'))).toBe(false);
  expect(personaParecida(p('Ana', 'Ruiz'), p('Ana', 'Ríos'))).toBe(false);          // palabras cortas: sin erratas
  expect(personaParecida(p('Kole'), p('Kolë', 'Bardheci'))).toBe(false);            // solo el nombre no basta
  expect(personaParecida(p('Kole', 'Bardechi', null, '12345678Z'), p('Kolë', 'Bardheci', null, '87654321X'))).toBe(false); // otro DNI
});

test('Ariauto tras la Puesta en marcha: no duplica, no repite clases, corrige alta y nombre, coche de cada profesor', () => {
  fs.writeFileSync(dataFile, JSON.stringify(datosApp()), 'utf-8'); db._clearCache();
  const plan = db.planAriauto(tablas(), { hoy: HOY });
  const fila = n => plan.filas.find(f => f.n_registro === n);

  // GASTON: es el mismo; sus 4 clases de Ariauto ya están anotadas → no entra ninguna
  expect(fila('4888')).toMatchObject({ accion: 'actualizar', id: 1 });
  expect(fila('4888').reparto).toMatchObject({ conFecha: [], sinFecha: 0, omitidas: 4 });
  expect(fila('4888').cambios).toMatchObject({
    nombre: { despues: 'Gaston Emanuel' }, primer_apellido: { despues: 'Faria' }, segundo_apellido: { despues: null },
    fecha_alta: { antes: HOY, despues: '2026-08-12' }, n_registro: { despues: '4888' }, dni: { despues: 'Z3129645V' }
  });
  // Kole: con una errata en el nombre; es el mismo (no se duplica) y su bono de 2025 son otras clases
  expect(fila('4512')).toMatchObject({ accion: 'actualizar', id: 2, parecido: true });
  expect(fila('4512').cambios).toMatchObject({ nombre: { despues: 'Kolë' }, primer_apellido: { despues: 'Bardheci' }, clases_previas: { despues: 10 }, fecha_alta: { despues: '2023-09-25' } });
  // MARICELY: el bono de justo antes puede ser el de sus clases: no se suma y se avisa
  expect(fila('4846').reparto).toMatchObject({ conFecha: [], sinFecha: 0, bonoDudoso: 10 });
  expect(fila('4846').avisos.join(' ')).toMatch(/bono de 10 clases poco antes/);
  expect(fila('4846').cambios).not.toHaveProperty('clases_previas');
  // Erika ya tenía sus «clases ya hechas»: nada
  expect(fila('4733').reparto.total).toBe(0);
  expect(fila('4733').cambios).not.toHaveProperty('nombre'); // ya bien escrito
  // El hermano de María es otro alumno
  expect(fila('4901')).toMatchObject({ accion: 'nuevo' });
  // La nueva: sus clases con su día y el bono como «clases ya hechas»
  expect(fila('4905')).toMatchObject({ accion: 'nuevo' });
  expect(fila('4905').reparto).toMatchObject({ conFecha: [{ fecha: '2026-09-17', n: 2 }, { fecha: '2026-09-20', n: 2.5 }], sinFecha: 12 });
  // Coche de cada profesor: Daniel, el que más usa en la app; Javier, el de sus exámenes
  expect(plan.cochesProfesor).toEqual(expect.arrayContaining([
    expect.objectContaining({ profesor: { id: 20, nombre: 'DANIEL ALEXIS PÉREZ NICOLÁS' }, vehiculo_id: 14, fuente: 'app' }),
    expect.objectContaining({ profesor: { id: 19, nombre: 'JAVIER PÉREZ ALONSO' }, vehiculo_id: 13, fuente: 'examenes' })
  ]));
  expect(plan.resumen).toMatchObject({ nuevos: 2, completar: 4, revisar: 0, parecidos: 1, clasesConFecha: 4.5, clasesYaEnApp: 21, altasCorregidas: 4 });
  // La vista previa enseña primero los que ya están, con lo que les pasa
  const previa = db.previaAriauto(plan);
  expect(previa.filas[0].accion).toBe('actualizar');
  expect(previa.filas.find(f => f.n_registro === '4888')).toMatchObject({ nombreApp: 'GASTON EMANUEL FARIA', clasesYaEnApp: 4, clases: 0, altaNueva: '2026-08-12', registroNuevo: '4888' });

  // Importar
  const res = db.aplicarAriauto(tablas(), { hoy: HOY }, 'Datos Ariauto.accdb');
  expect(res.ok).toBe(true);
  let d = leer();
  expect(d.alumnos).toHaveLength(7); // 5 que estaban + 2 nuevos, ninguno repetido
  expect(d.practicas.filter(p => p.alumno_id === 1)).toHaveLength(6); // las de GASTON, sin repetir
  expect(d.alumnos.find(a => a.id === 2)).toMatchObject({ nombre: 'Kolë', primer_apellido: 'Bardheci', n_registro: '4512', clases_previas: 10, fecha_alta: '2023-09-25' });
  expect(d.profesores.find(p => p.id === 20).vehiculo_id).toBe(14);
  expect(d.profesores.find(p => p.id === 19).vehiculo_id).toBe(13);
  const nueva = d.alumnos.find(a => a.n_registro === '4905');
  expect(nueva).toMatchObject({ profesor_id: 19, vehiculo_id: 13, clases_previas: 12 });
  const susClases = d.practicas.filter(p => p.alumno_id === nueva.id);
  expect(susClases.map(p => [p.fecha, p.fraccion || 1, p.tipo_detalle, p.vehiculo_id, p.km_final])).toEqual([
    ['2026-09-17', 1, 'anterior', 13, 0], ['2026-09-17', 1, 'anterior', 13, 0],
    ['2026-09-20', 1, 'anterior', 13, 0], ['2026-09-20', 1, 'anterior', 13, 0], ['2026-09-20', 0.5, 'anterior', 13, 0]
  ]);
  // Los alumnos nuevos que se den de alta siguen la numeración de Ariauto
  expect(db.getSiguienteNRegistro()).toBe('4906');

  // Volver a abrir el archivo: nada nuevo
  const otra = db.planAriauto(tablas(), { hoy: HOY });
  expect(otra.resumen).toMatchObject({ nuevos: 0, conCambios: 0, clases: 0, cochesProfesor: 0 });

  // Deshacer: todo como estaba
  expect(db.deshacerImportacion(res.id).ok).toBe(true);
  d = leer();
  expect(d.alumnos).toHaveLength(5);
  expect(d.practicas).toHaveLength(11);
  expect(d.alumnos.find(a => a.id === 1)).toMatchObject({ nombre: 'GASTON', fecha_alta: HOY, n_registro: null });
  expect(d.alumnos.find(a => a.id === 2)).toMatchObject({ nombre: 'Kole', primer_apellido: 'Bardechi', clases_previas: 0 });
  expect(d.profesores.map(p => p.vehiculo_id || null)).toEqual([null, null]);
});

test('parecido dudoso (dos fichas de Ariauto se parecen al mismo alumno): no se toca ninguna', () => {
  const app = datosApp();
  app.alumnos = [{ id: 1, nombre: 'Saul', primer_apellido: 'Gómez', segundo_apellido: null, permiso: 'B', estado: 'en_practicas', fecha_alta: HOY, clases_previas: 0 }];
  app.practicas = [];
  fs.writeFileSync(dataFile, JSON.stringify(app), 'utf-8'); db._clearCache();
  const t = tablas();
  t.ALUMNOS = [
    { 'Nº ALUMNO': '10', SECCION: 1, NOMBREALUMNO: 'SAUL', 'PRIMER APELLIDO': 'GOMEZ', 'SEGUNDO APELLIDO': 'DACAL', 'FECHA DE ALTA': '2026-07-01', PERMISO: 4 },
    { 'Nº ALUMNO': '11', SECCION: 1, NOMBREALUMNO: 'SAUL', 'PRIMER APELLIDO': 'GOMEZ', 'SEGUNDO APELLIDO': 'PEREZ', 'FECHA DE ALTA': '2026-07-02', PERMISO: 4 }
  ];
  const plan = db.planAriauto(t, { hoy: HOY });
  expect(plan.filas.map(f => f.accion)).toEqual(['revisar', 'revisar']);
  expect(plan.filas[0].avisos.join(' ')).toMatch(/Se parece a «Saul Gómez» de la app/);
});

test('importación desde Excel/CSV: el alumno con una errata se completa en vez de duplicarse', () => {
  fs.writeFileSync(dataFile, JSON.stringify(datosApp()), 'utf-8'); db._clearCache();
  const h = db.leerTextoTabla('Nombre;Apellidos;DNI;Nº expediente\nKolë;Bardheci;;4512\nMario;García López;;4901\n');
  const det = db.detectarTablaMigracion(h, 'alumnos');
  const plan = db.analizarImportacion({ tipo: 'alumnos', filas: h.filas, numFila: h.numFila, filaCabecera: det.filaCabecera, mapeo: det.mapeo, opciones: { hoy: HOY } });
  expect(plan.ok).toBe(true);
  const [kole, mario] = plan.filas;
  expect(kole).toMatchObject({ accion: 'actualizar', id: 2 });
  expect(kole.avisos.join(' ')).toMatch(/nombre parecido/);
  expect(kole.cambios.n_registro).toEqual([null, '4512']);
  expect(mario).toMatchObject({ accion: 'nuevo' });
});
