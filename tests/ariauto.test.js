// Importar de Ariauto (db/ariauto.js) con tablas inventadas: misma forma que
// devuelve leerAccess() de la base real, pero sin datos de nadie.
const db = require('../db');
const { resetData } = require('./helpers');

const HOY = '2026-10-03';

function tablas() {
  return {
    ALUMNOS: [
      // En curso: alta reciente, DNI con la letra aparte, domicilio en trozos
      { 'Nº ALUMNO': '4001', SECCION: 1, NOMBREALUMNO: 'MARIA JOSE', 'PRIMER APELLIDO': 'GARCIA', 'SEGUNDO APELLIDO': 'DE LA FUENTE', 'DOMICILIO DEL ALUMNO': 'MAYOR', 'Nº': '5', PISO: '2º', LETRA: 'B', Tipo_de_Via: 'CALLE',
        'PUEBL0 DEL ALUMNO': 'XINZO DE LIMIA', 'C-P DEL ALUMNO': '32630', 'PROVINCIA DEL ALUMNO': 'OURENSE', TELEFONO: '677-993352', TELEFONO2: '988 111 222', 'DNI DEL ALUMNO': '12345678', 'NIF DEL ALUMNO': 'Z',
        'CADUCA DNI': '2028-05-01', SEXO: '2', 'FECHA NACIMIENTO': '2007-03-04', 'FECHA DE ALTA': '2026-06-01', PERMISO: 4, 'POSEE PERMISO': 16, PROFESOR: 7, OBSERVACIONES: 'Prefiere tardes', Teorico_Apto: true, Nacionalidad: 'ESPAÑOLA' },
      // En curso, NIE con la letra aparte
      { 'Nº ALUMNO': '4002', SECCION: 1, NOMBREALUMNO: 'IVAN', 'PRIMER APELLIDO': 'PETROV', 'DNI DEL ALUMNO': 'Y1234567', 'NIF DEL ALUMNO': 'X', 'FECHA DE ALTA': '2026-09-15', PERMISO: 4 },
      // Terminados: aprobado y de baja
      { 'Nº ALUMNO': '3001', SECCION: 1, NOMBREALUMNO: 'LUIS', 'PRIMER APELLIDO': 'SOTO', 'DNI DEL ALUMNO': '11111111', 'NIF DEL ALUMNO': 'H', 'FECHA DE ALTA': '2025-01-10', 'FECHA APROBADO': '2025-06-01', motivo_archivado: 'APTO', PERMISO: 4 },
      { 'Nº ALUMNO': '3002', SECCION: 1, NOMBREALUMNO: 'ANA', 'PRIMER APELLIDO': 'RIOS', 'FECHA DE ALTA': '2026-08-01', motivo_archivado: 'BAJA', PERMISO: 4 },
      // Curso de CAP (sección de cursos): fuera por defecto
      { 'Nº ALUMNO': '9001', SECCION: 11, NOMBREALUMNO: 'PEDRO', 'PRIMER APELLIDO': 'CAMION', 'FECHA DE ALTA': '2026-07-01', PERMISO: 18 }
    ],
    PERMISOS: [{ 'NUMERO PERMISO': 4, 'NOMBRE PERMISO': 'B' }, { 'NUMERO PERMISO': 16, 'NOMBRE PERMISO': 'AM' }, { 'NUMERO PERMISO': 18, 'NOMBRE PERMISO': 'MER' }],
    PROFESORES: [
      { 'NUMERO PROFESOR': 7, NOMBRE: 'JAVIER', 'PRIMER APELLIDO PRF': 'MORA', 'SEGUNDO APELLIDO PRF': 'GIL', DNI: '22222222J' },
      { 'NUMERO PROFESOR': 8, NOMBRE: 'VIEJO', 'PRIMER APELLIDO PRF': 'DE BAJA', DNI: '', 'FECHA DE BAJA': '2010-01-01' }
    ],
    VEHICULOS: [
      { 'NUMERO DE VEHICULO': 1, MATRICULA: '1234 KLM', MARCA: 'SEAT', MODELO: 'IBIZA', 'PROXIMA REVISION': '2027-02-01', 'VENCIMIENTO DEL SEGURO': '2026-12-31', 'NOMBRE CIA DE SEGURO': 'MAPFRE' },
      { 'NUMERO DE VEHICULO': 2, MATRICULA: '9999 AAA', MARCA: 'OPEL', MODELO: 'CORSA', 'FECHA DE BAJA': '2020-01-01' }
    ],
    'GASTOS E INGRESOS': [
      { 'Nº ALUMNO': '4001', 'SECCION IOG': 1, FECHA: '2026-06-01', CONCEPTO: 'MATRÍCULA', CANTIDAD: 1, EURODEBE: '300.0000', EUROHABER: '0.0000', TIPOAPUNTE: 3 },
      { 'Nº ALUMNO': '4001', 'SECCION IOG': 1, FECHA: '2026-06-01', CONCEPTO: 'MATRÍCULA BIZUM', CANTIDAD: 1, EURODEBE: '0.0000', EUROHABER: '300.0000', TIPOAPUNTE: 1 },
      { 'Nº ALUMNO': '4001', 'SECCION IOG': 1, FECHA: '2026-09-01', CONCEPTO: '14-CLASES PRÁCTICAS.', CANTIDAD: 14, EURODEBE: '392.0000', EUROHABER: '0.0000', TIPOAPUNTE: 3 },
      { 'Nº ALUMNO': '4001', 'SECCION IOG': 1, FECHA: '2026-09-02', CONCEPTO: 'CLASES-TEÓRICAS', CANTIDAD: 5, EURODEBE: '50.0000', EUROHABER: '0.0000', TIPOAPUNTE: 3 },
      { 'Nº ALUMNO': '4001', 'SECCION IOG': 1, FECHA: '2026-09-03', CONCEPTO: 'DERECHOS DE EXÁMEN (TASA)', CANTIDAD: 1, EURODEBE: '94.0500', EUROHABER: '0.0000', TIPOAPUNTE: 3 },
      // El aprobado «debe» en Ariauto (no se apuntan los cobros en efectivo)
      { 'Nº ALUMNO': '3001', 'SECCION IOG': 1, FECHA: '2025-03-01', CONCEPTO: 'MATRÍCULA', CANTIDAD: 1, EURODEBE: '250.0000', EUROHABER: '0.0000', TIPOAPUNTE: 3 }
    ],
    PRACTICAS: [],
    'FECHA DE EXAMEN': [
      { 'Nº ALUMNO': '4001', SECCIONEX: 1, 'F EXAMEN': '2026-07-10', 'TIPO DE EXAMEN': 1, 'RESULTADO DE EXAMEN': 1, PROFESOR: 7, 'PERMISO EXAMEN': 4, CONVOCATORIA: 1 },
      { 'Nº ALUMNO': '4001', SECCIONEX: 1, 'F EXAMEN': '2026-10-20', 'TIPO DE EXAMEN': 5, 'RESULTADO DE EXAMEN': null, PROFESOR: 7, 'PERMISO EXAMEN': 4, CONVOCATORIA: 1 }
    ],
    Tasas_Alumnos: [{ IdTasa: '123456789012', TipoTasa: '2.3', FechaCompra: '2026-07-01', Importe: '000094.05', 'Nº ALUMNO': '4001', SECCION: 1, 'F EXAMEN': '2026-07-10' }],
    'DATOS DE AUTOESCUELA': [
      { SECCION: 1, 'NUMERO DE AUTOESCUELA': 'OR0028', 'NOMBRE DE SECCION': 'XINZO', 'DIGITO DE SECCION': 9, 'SECCION POR DEFECTO': true, 'SECCION TRAFICO': '1',
        'DIRECCION DELA AUTOESCUELA': 'C/ VICENTE RISCO, 1 1º B', 'CODIGO POSTAL DE LA AUTOESCUELA': '32630', 'POBLACION DE LA AUTOESCUELA': 'XINZO DE LIMIA', encabezado1: 'AUTO-ESCUELA  " X I N Z O "' },
      { SECCION: 11, 'NUMERO DE AUTOESCUELA': 'OR0028', 'NOMBRE DE SECCION': 'XINZO CAP' }
    ]
  };
}

beforeEach(() => resetData(db));

test('vista previa: solo los alumnos en curso de las secciones de autoescuela, con sus datos limpios', () => {
  const p = db.planAriauto(tablas(), { hoy: HOY });
  expect(p.secciones.map(s => [s.seccion, s.curso, s.elegida])).toEqual([[1, false, true], [11, true, false]]);
  expect(p.resumen).toMatchObject({ enCurso: 2, terminados: 2, alumnos: 2, nuevos: 2, clases: 14, examenes: 2, tasas: 1, profesoresNuevos: 1, vehiculosNuevos: 1 });
  const [maria, ivan] = p.filas;
  expect(maria.datos).toMatchObject({
    nombre: 'Maria Jose', primer_apellido: 'Garcia', segundo_apellido: 'de la Fuente', dni: '12345678Z', telefono: '677993352',
    direccion: 'Calle Mayor nº 5 2º B', poblacion: 'Xinzo de Limia', codigo_postal: '32630', permiso: 'B', permisos_posee: 'AM',
    fecha_alta: '2026-06-01', estado: 'en_practicas', clases_previas: 14
  });
  expect(maria.datos.observaciones).toMatch(/^Prefiere tardes\nDatos de Ariauto: Nº 4001 \(sección XINZO\) · Sexo: mujer · Nacionalidad: Española · Provincia: Ourense · Otro teléfono: 988111222/);
  expect(ivan.dni).toBe('Y1234567X'); // NIE con la letra que Ariauto guarda aparte
  expect(maria.avisos).toEqual([]);
  // Exámenes: teórico aprobado y circulación pendiente; tasa usada
  expect(maria.presentaciones.map(e => [e.tipo, e.resultado])).toEqual([['teorico', 'apto'], ['circulacion', 'pendiente']]);
  expect(maria.tasas[0]).toMatchObject({ importe: 94.05, estado: 'usada' });
  expect(maria.caducaDni).toBe('2028-05-01');
  // Coche de alta con ITV y seguro; el de baja no
  expect(p.vehiculos).toEqual([expect.objectContaining({ matricula: '1234KLM', nombre: 'Seat Ibiza', vencimientos: [expect.objectContaining({ tipo: 'ITV' }), expect.objectContaining({ tipo: 'Seguro' })] })]);
  expect(p.centro).toMatchObject({ numero: 'OR0028', seccion: '1', digito_control: '9', denominacion: 'Auto-Escuela Xinzo', codigo_postal: '32630', poblacion: 'Xinzo de Limia' });
});

test('cobros: no se traen por defecto (Ariauto no apunta casi ningún cobro); con la opción, cargos y pagos tal cual', () => {
  const sin = db.planAriauto(tablas(), { hoy: HOY });
  expect(sin.filas[0].cargos).toEqual([]);
  expect(sin.fiabilidadCobros).toEqual({ aptosRecientes: 1, aptosConDeuda: 1, fiable: false });
  const con = db.planAriauto(tablas(), { hoy: HOY, economia: true });
  const maria = con.filas[0];
  expect(maria.cargos.map(c => [c.tipo, c.importe])).toEqual([['matricula', 300], ['cargo', 392], ['cargo', 50], ['tasa', 94.05]]);
  expect(maria.pagos).toEqual([expect.objectContaining({ cantidad: 300, forma_pago: 'bizum' })]);
  expect(maria.saldo).toBe(536.05);
});

test('«También los terminados» y otras secciones', () => {
  const p = db.planAriauto(tablas(), { hoy: HOY, alcance: 'todos', secciones: [1, 11] });
  expect(p.filas.map(f => [f.datos.nombre, f.estado])).toEqual([['Maria Jose', 'en_practicas'], ['Ivan', 'matriculado'], ['Luis', 'apto'], ['Ana', 'baja'], ['Pedro', 'matriculado']]);
  const luis = p.filas.find(f => f.datos.nombre === 'Luis');
  expect(luis.presentaciones).toEqual([]); // de los terminados, solo sus datos
  expect(p.filas.find(f => f.datos.nombre === 'Pedro').permiso).toBe('CAP');
});

test('importar: crea alumnos, profesor, coche, exámenes, tasas y caducidades; no duplica al que ya está; deshacer lo quita', () => {
  // Ya estaba en la app (se dio de alta a mano): se completa, no se duplica
  const yaId = db.addAlumno('Maria Jose', 'B', null, null, null, null, { dni: '12345678Z', primer_apellido: 'Garcia' });
  const p = db.planAriauto(tablas(), { hoy: HOY });
  expect(p.filas[0]).toMatchObject({ accion: 'actualizar', id: yaId });

  const res = db.aplicarAriauto(tablas(), { hoy: HOY }, 'Datos Ariauto.accdb');
  expect(res.ok).toBe(true);
  db._clearCache();
  const d = JSON.parse(require('fs').readFileSync(require('path').join(require('./helpers').userDataDir, 'data.json'), 'utf-8'));
  const alumnos = d.alumnos.filter(a => !a.deleted);
  expect(alumnos).toHaveLength(2);
  const maria = alumnos.find(a => a.id === yaId);
  expect(maria).toMatchObject({ telefono: '677993352', direccion: 'Calle Mayor nº 5 2º B', clases_previas: 14, segundo_apellido: 'de la Fuente' });
  expect(maria.primer_apellido).toBe('Garcia'); // lo que ya tenía no se toca
  const prof = d.profesores.find(x => x.nombre === 'Javier Mora Gil');
  expect(prof).toMatchObject({ dni: '22222222J' });
  expect(maria.profesor_id).toBe(prof.id);
  expect(d.vehiculos.map(v => v.matricula)).toEqual(['1234KLM']);
  expect(d.presentaciones).toHaveLength(2);
  expect(d.tasas).toHaveLength(1);
  expect(d.vencimientos.map(v => v.tipo).sort()).toEqual(['DNI', 'ITV', 'Seguro']);
  expect(d.cargos || []).toHaveLength(0);
  expect(db.getImportaciones()[0]).toMatchObject({ tipo: 'ariauto', alumnos: 1, actualizados: 1, examenes: 2, vehiculos: 1, profesores: 1 });

  // Reimportar el mismo archivo no duplica a nadie
  expect(db.planAriauto(tablas(), { hoy: HOY }).resumen).toMatchObject({ nuevos: 0, completar: 2 });

  const des = db.deshacerImportacion(res.id);
  expect(des).toMatchObject({ ok: true, alumnos: 1, examenes: 2, tasas: 1, vencimientos: 3, profesores: 1, vehiculos: 1 });
  db._clearCache();
  const d2 = JSON.parse(require('fs').readFileSync(require('path').join(require('./helpers').userDataDir, 'data.json'), 'utf-8'));
  expect(d2.alumnos.filter(a => !a.deleted).map(a => a.id)).toEqual([yaId]);
  expect(d2.alumnos.find(a => a.id === yaId).telefono == null).toBe(true); // vuelve a como estaba
});

test('importar con cobros: cargos y pagos con su saldo; deshacer los quita también', () => {
  const res = db.aplicarAriauto(tablas(), { hoy: HOY, economia: true }, 'Datos Ariauto.accdb');
  db._clearCache();
  const maria = db.getAlumnos().find(a => a.nombre === 'Maria Jose');
  const des = db.getDesglosePagosAlumno(maria.id);
  expect(des.total_generado).toBeCloseTo(836.05);
  expect(db.getPagosByAlumno(maria.id).reduce((s, p) => s + p.cantidad, 0)).toBe(300);
  const r = db.deshacerImportacion(res.id);
  expect(r).toMatchObject({ ok: true, pagos: 1, cargos: 4 });
});
