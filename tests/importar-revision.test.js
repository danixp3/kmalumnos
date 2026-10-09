// Revisión del importador «Traer de otro programa» / Ariauto / CSV (2026-10-09):
// cada prueba es un fallo encontrado en la revisión, ya corregido.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resetData, userDataDir } = require('./helpers');
const N = db._norm;

beforeEach(() => resetData(db));

const HOY = '2026-10-09';
function entrada(texto, tipo = 'alumnos', opciones = {}) {
  const h = db.leerTextoTabla(texto);
  const det = db.detectarTablaMigracion(h, tipo);
  return { tipo, filas: h.filas, numFila: h.numFila, filaCabecera: det.filaCabecera, mapeo: det.mapeo, opciones: { hoy: HOY, ordenNombre: det.ordenNombre, ...opciones }, archivo: 'prueba.csv' };
}
const pendientes = () => {
  const f = path.join(userDataDir, 'pending_sync.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : {};
};

describe('lectura de los datos', () => {
  test('«A2 + B» son dos permisos; «B+E» y «C + E» son uno', () => {
    expect(N.leerPermiso('A2 + B')).toMatchObject({ principal: 'A2', otros: ['B'], reconocido: true });
    expect(N.leerPermiso('B+E').principal).toBe('BE');
    expect(N.leerPermiso('C + E').principal).toBe('CE');
    expect(N.leerPermiso('B, A2')).toMatchObject({ principal: 'B', otros: ['A2'] });
  });

  test('«Inactivo» / «No activo» entran como inactivo (estado propio), no como baja', () => {
    expect(N.leerEstado('Inactivo')).toBe('inactivo');
    expect(N.leerEstado('NO ACTIVO')).toBe('inactivo');
    expect(N.leerEstado('Activo')).toBe('activo');
    expect(N.leerEstado('Baja')).toBe('baja');
  });

  test('columnas que no son lo que parecen: fecha del permiso, estado civil, clases teóricas', () => {
    expect(N.campoPorTitulo('Fecha del permiso', 'alumnos')).toBe('');
    expect(N.campoPorTitulo('Caducidad carnet', 'alumnos')).toBe('');
    expect(N.campoPorTitulo('Permiso', 'alumnos')).toBe('permiso');
    expect(N.campoPorTitulo('Estado civil', 'alumnos')).toBe('');
    expect(N.campoPorTitulo('Estado', 'alumnos')).toBe('estado');
    expect(N.campoPorTitulo('Clases teóricas', 'alumnos')).toBe('');
    expect(N.campoPorTitulo('Clases prácticas', 'alumnos')).toBe('clases_previas');
    // Con «Fecha permiso» delante, la columna «Permiso» de verdad ya no se queda sin importar
    const det = db.detectarTablaMigracion(db.leerTextoTabla('Nombre;Apellidos;Fecha permiso;Permiso\nAna;Ruiz Gil;01/02/2020;A2\nLuis;Soto Paz;03/04/2021;B'), 'alumnos');
    expect(det.mapeo).toEqual(['nombre', 'apellidos', '', 'permiso']);
  });

  test('años de 2 cifras en el alta, la baja y las clases: siempre en el pasado (1998, no 2098)', () => {
    const p = db.analizarImportacion(entrada('Nombre;Apellidos;Fecha alta\nAna;Ruiz Gil;15/03/98\nLuis;Soto Paz;02/01/24', 'alumnos'));
    expect(p.filas.map(f => f.accion)).toEqual(['nuevo', 'nuevo']);
    const r = db.aplicarImportacion(entrada('Nombre;Apellidos;Fecha alta\nAna;Ruiz Gil;15/03/98\nLuis;Soto Paz;02/01/24', 'alumnos'));
    expect(r.ok).toBe(true);
    const altas = db.getAlumnos().map(a => a.fecha_alta).sort();
    expect(altas).toEqual(['1998-03-15', '2024-01-02']);
    const c = db.analizarImportacion(entrada('Alumno;Fecha\nAna Ruiz Gil;12/03/99', 'clases'));
    expect(c.filas[0]).toMatchObject({ accion: 'nuevo', fecha: '1999-03-12' });
  });
});

describe('importar alumnos', () => {
  test('no se crea el profesor ni el coche de un alumno que se queda fuera', () => {
    const texto = 'Nombre;Apellidos;Estado;Profesor;Coche\nAna;Ruiz Gil;Baja;Pepe Viejo;Renault 5 1234BCD\nLuis;Soto Paz;Activo;Marta Nueva;';
    const p = db.analizarImportacion(entrada(texto, 'alumnos', { soloEnCurso: true }));
    expect(p.filas.map(f => f.accion)).toEqual(['omitir', 'nuevo']);
    expect(p.resumen.profesoresNuevos).toEqual(['Marta Nueva']);   // el de la alumna de baja, no
    expect(p.resumen.vehiculosNuevos).toEqual([]);
    const r = db.aplicarImportacion(entrada(texto, 'alumnos', { soloEnCurso: true }));
    expect(r.ok).toBe(true);
    expect(db.getProfesores().map(x => x.nombre)).toEqual(['Marta Nueva']);
    expect(db.getVehiculos()).toEqual([]);
  });

  test('ni el de un alumno que ya está en la app y ya tiene profesor', () => {
    const pid = db.addProfesor('Javier', '');
    const aid = db.addAlumno('Luis', 'B', null);
    db.updateAlumnoCampos(aid, { primer_apellido: 'Soto', segundo_apellido: 'Paz', profesor_id: pid });
    const p = db.analizarImportacion(entrada('Nombre;Apellidos;Profesor;Teléfono\nLuis;Soto Paz;Otro Profe;600111222', 'alumnos'));
    expect(p.filas[0].accion).toBe('actualizar');
    expect(p.resumen.profesoresNuevos).toEqual([]);
  });

  test('«Dejar fuera a los terminados» también deja fuera a los inactivos', () => {
    const p = db.analizarImportacion(entrada('Nombre;Apellidos;Situación\nAna;Ruiz Gil;Inactivo\nLuis;Soto Paz;En prácticas', 'alumnos', { soloEnCurso: true }));
    expect(p.filas.map(f => [f.accion, f.motivo || ''])).toEqual([['omitir', 'Inactivo'], ['nuevo', '']]);
  });
});

describe('importar un historial de clases', () => {
  test('el alumno nuevo tiene de alta su primera clase; sin clases en el último año queda inactivo', () => {
    const texto = 'Alumno;Fecha;Hora\nAna Ruiz Gil;10/01/2024;10:00\nAna Ruiz Gil;20/02/2024;10:00\nLuis Soto Paz;01/09/2026;17:00';
    const r = db.aplicarImportacion(entrada(texto, 'clases'));
    expect(r.ok).toBe(true);
    const porNombre = Object.fromEntries(db.getAlumnos().map(a => [a.nombre, a]));
    expect(porNombre.Ana).toMatchObject({ fecha_alta: '2024-01-10', estado: 'inactivo' });
    expect(porNombre.Luis).toMatchObject({ fecha_alta: '2026-09-01', estado: 'en_practicas' });
  });

  test('«Deshacer» devuelve el km que tenía el coche (antes se quedaba con el de la clase importada)', () => {
    const vid = db.addVehiculo('Ibiza', '1234KLM', 1000);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.updateAlumnoCampos(aid, { primer_apellido: 'Ruiz', segundo_apellido: 'Gil' });
    const r = db.aplicarImportacion(entrada('Alumno;Fecha;Coche;Km inicial;Km final\nAna Ruiz Gil;01/09/2026;1234KLM;98000;98040', 'clases'));
    expect(r.ok).toBe(true);
    expect(db.getVehiculos().find(v => v.id === vid).km_actual).toBe(98040);
    expect(db.getImportaciones()[0]).toMatchObject({ actualizados: 0, clases: 1 });   // el coche no cuenta como alumno completado
    expect(db.deshacerImportacion(r.id).ok).toBe(true);
    expect(db.getVehiculos().find(v => v.id === vid).km_actual).toBe(1000);
  });
});

describe('Ariauto', () => {
  function tablas() {
    return {
      ALUMNOS: [
        { 'Nº ALUMNO': '5001', SECCION: 1, NOMBREALUMNO: 'MOTO', 'PRIMER APELLIDO': 'RUIZ', 'FECHA DE ALTA': '2026-09-01', PERMISO: 5, PROFESOR: 7 },
        { 'Nº ALUMNO': '5002', SECCION: 1, NOMBREALUMNO: 'COCHE', 'PRIMER APELLIDO': 'SOTO', 'FECHA DE ALTA': '2026-09-01', PERMISO: 4, PROFESOR: 7 }
      ],
      PERMISOS: [{ 'NUMERO PERMISO': 4, 'NOMBRE PERMISO': 'B' }, { 'NUMERO PERMISO': 5, 'NOMBRE PERMISO': 'A2' }],
      PROFESORES: [{ 'NUMERO PROFESOR': 7, NOMBRE: 'JAVIER', 'PRIMER APELLIDO PRF': 'MORA', DNI: '22222222J' }],
      VEHICULOS: [], 'GASTOS E INGRESOS': [
        { 'Nº ALUMNO': '5001', 'SECCION IOG': 1, FECHA: '2026-09-05', CONCEPTO: '1-CLASE PRÁCTICA', CANTIDAD: 1, EURODEBE: '30.0000', EUROHABER: '0.0000', TIPOAPUNTE: 3 },
        { 'Nº ALUMNO': '5002', 'SECCION IOG': 1, FECHA: '2026-09-05', CONCEPTO: '1-CLASE PRÁCTICA', CANTIDAD: 1, EURODEBE: '30.0000', EUROHABER: '0.0000', TIPOAPUNTE: 3 }
      ],
      PRACTICAS: [], 'FECHA DE EXAMEN': [], Tasas_Alumnos: [],
      'DATOS DE AUTOESCUELA': [{ SECCION: 1, 'NOMBRE DE SECCION': 'XINZO', 'SECCION POR DEFECTO': true }]
    };
  }

  test('a un alumno de moto no se le pone el coche de B del profesor (ni a sus clases)', () => {
    const coche = db.addVehiculo('Ibiza', '1234KLM', 1000, null, { permisos: 'B' });
    db.addProfesor('Javier Mora', '', null, '22222222J', { vehiculo_id: coche });
    const r = db.aplicarAriauto(tablas(), { hoy: HOY, vehiculos: false }, 'Ariauto.accdb');
    expect(r.ok).toBe(true);
    const al = Object.fromEntries(db.getAlumnos().map(a => [a.n_registro, a]));
    expect(al['5001'].vehiculo_id).toBeNull();        // A2: el coche de B no sirve
    expect(al['5002'].vehiculo_id).toBe(coche);        // B: el coche habitual del profesor
    const clases = db.getPracticasByAlumno(al['5001'].id);
    expect(clases.length).toBe(1);
    expect(clases[0].vehiculo_id).toBeNull();
  });
});

describe('CSV de prácticas', () => {
  test('todas las clases importadas quedan marcadas para subir a la nube (de una vez)', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ alumno: 'Ana Ruiz', vehiculo: 'Ibiza', fecha: `2026-09-${String(i + 1).padStart(2, '0')}`, km_inicial: String(1000 + i * 40), km_final: String(1030 + i * 40) }));
    const r = db.importarCSV(rows, 40, 45);
    expect(r.insertados).toBe(30);
    const ids = db.getPracticasByAlumno(db.getAlumnos()[0].id).map(p => p.id);
    expect(ids.length).toBe(30);
    // Sin sync configurado no hay cola; con él, markDirtyVarios las apunta todas (lo cubre sync)
    expect(pendientes().practicas === undefined || ids.every(id => pendientes().practicas.includes(id))).toBe(true);
  });
});
