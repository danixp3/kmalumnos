// Traer datos de otro programa (db/migracion.js + db/lector-tablas.js), 2026-10-02.
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const db = require('../db');
const { resetData } = require('./helpers');
const N = db._norm;

beforeEach(() => resetData(db));

const HOY = '2026-10-02';
const tabla = texto => db.leerTextoTabla(texto);
// Prepara la entrada como lo hace la pantalla: detectar y usar la propuesta
function entrada(texto, tipo = 'alumnos', opciones = {}) {
  const h = tabla(texto);
  const det = db.detectarTablaMigracion(h, tipo);
  return { tipo, filas: h.filas, numFila: h.numFila, filaCabecera: det.filaCabecera, mapeo: det.mapeo, opciones: { hoy: HOY, ordenNombre: det.ordenNombre, ...opciones }, archivo: 'prueba.csv' };
}

describe('limpieza de datos', () => {
  test('nombres: mayúsculas, «APELLIDOS, NOMBRE», partículas y orden', () => {
    expect(N.capitalizarNombre('MARÍA DE LA O GARCÍA-PELAYO')).toBe('María de la O García-Pelayo');
    expect(N.capitalizarNombre('Ana McDonald')).toBe('Ana McDonald'); // lo que ya viene bien no se toca
    expect(N.partirNombreCompleto('GARCIA LOPEZ, JUAN JOSE')).toEqual({ nombre: 'JUAN JOSE', primer_apellido: 'GARCIA', segundo_apellido: 'LOPEZ' });
    expect(N.partirNombreCompleto('José Luis de la Fuente Ruiz')).toEqual({ nombre: 'José Luis', primer_apellido: 'de la Fuente', segundo_apellido: 'Ruiz' });
    expect(N.partirNombreCompleto('María del Carmen López')).toEqual({ nombre: 'María del Carmen', primer_apellido: 'López', segundo_apellido: '' });
    expect(N.partirNombreCompleto('Pérez Gil Ana', 'apellidos_nombre')).toEqual({ nombre: 'Ana', primer_apellido: 'Pérez', segundo_apellido: 'Gil' });
    expect(N.claveNombre('Martín Gómez, Lucía')).toBe(N.claveNombre('LUCIA MARTIN GOMEZ'));
  });

  test('DNI/NIE: ceros que quita Excel, letra que falta, guiones', () => {
    expect(N.limpiarDni('1234567-l')).toMatchObject({ valor: '01234567L', valido: true });
    expect(N.limpiarDni('12345678')).toMatchObject({ valor: '12345678Z', valido: true, letraAnadida: true });
    expect(N.limpiarDni('x 1234567 l')).toMatchObject({ valor: 'X1234567L', valido: true });
    expect(N.limpiarDni('12345678A').valido).toBe(false);
  });

  test('teléfonos, emails, códigos postales, importes', () => {
    expect(N.limpiarTelefono('91 555 12 12 / 600-111-222')).toBe('600111222');
    expect(N.limpiarTelefono('0034 612 345 678')).toBe('+34612345678');
    expect(N.limpiarEmail(' Ana.Perez@Gmail.COM; otro@x.es')).toBe('ana.perez@gmail.com');
    expect(N.limpiarEmail('sin correo')).toBeNull();
    expect(N.limpiarCP('8001')).toBe('08001');
    expect(N.leerImporte('1.234,56 €')).toBe(1234.56);
    expect(N.leerImporte('(30)')).toBe(-30);
    expect(N.leerImporte('12.5')).toBe(12.5);
  });

  test('fechas en cualquier formato (y horas)', () => {
    expect(N.leerFechaFlexible('03/04/2025')).toBe('2025-04-03');
    expect(N.leerFechaFlexible('3-4-25')).toBe('2025-04-03');
    expect(N.leerFechaFlexible('12/25/2024')).toBe('2024-12-25'); // formato de EE. UU.
    expect(N.leerFechaFlexible('12 de marzo de 2024')).toBe('2024-03-12');
    expect(N.leerFechaFlexible('12-MAR-24')).toBe('2024-03-12');
    expect(N.leerFechaFlexible('2024-03-12 10:30:00')).toBe('2024-03-12');
    expect(N.leerFechaFlexible('45000')).toBe('2023-03-15'); // número de serie de Excel
    expect(N.leerFechaFlexible('15/08/98', { pasado: true })).toBe('1998-08-15');
    expect(N.leerFechaFlexible('31/02/2024')).toBeNull();
    expect(N.leerHoraFlexible('9.30')).toBe('09:30');
    expect(N.leerHoraFlexible('17h')).toBe('17:00');
    expect(N.leerHoraFlexible('0.4375')).toBe('10:30'); // hora de Excel
    expect(N.leerHoraFlexible('mañana')).toBeNull();
  });

  test('permisos y estados escritos de mil maneras', () => {
    expect(N.leerPermiso('Permiso B')).toMatchObject({ principal: 'B', otros: [] });
    expect(N.leerPermiso('C+E, A2')).toMatchObject({ principal: 'CE', otros: ['A2'] });
    expect(N.leerPermiso('Turismo').principal).toBe('B');
    expect(N.leerPermiso('xyz').reconocido).toBe(false);
    expect(N.leerEstado('Inactivo')).toBe('baja');
    expect(N.leerEstado('APROBADO')).toBe('apto');
    expect(N.leerEstado('En prácticas')).toBe('en_practicas');
    expect(N.leerEstado('Sí')).toBe('activo');
    expect(N.leerEstado('xyz raro')).toBeUndefined();
    expect(N.leerEstado('')).toBeNull();
  });
});

describe('lectura de archivos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kmalumnos-mig-'));

  test('CSV con ; comillas y acentos de Windows (no UTF-8)', () => {
    const ruta = path.join(dir, 'alumnos.csv');
    const texto = 'Nombre;Población;Notas\r\n"PEÑA, IÑIGO";Logroño;"Dice ""hola""; y adiós"\r\n';
    fs.writeFileSync(ruta, Buffer.from(texto, 'latin1'));
    const r = db.leerArchivoTabla(ruta);
    expect(r.ok).toBe(true);
    expect(r.hojas[0].filas).toEqual([['Nombre', 'Población', 'Notas'], ['PEÑA, IÑIGO', 'Logroño', 'Dice "hola"; y adiós']]);
  });

  test('Excel: fechas sin zona horaria, DNI y teléfonos numéricos sin notación científica', () => {
    const ruta = path.join(dir, 'alumnos.xlsx');
    const ws = XLSX.utils.aoa_to_sheet([['LISTADO DE ALUMNOS'], [], ['Nombre', 'DNI', 'Móvil', 'F. Nacimiento'], ['Ana', 1234567, 600111222, new Date(2000, 0, 15)]], { cellDates: true });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Alumnos');
    XLSX.writeFile(wb, ruta);
    const r = db.leerArchivoTabla(ruta);
    expect(r.ok).toBe(true);
    const h = r.hojas[0];
    expect(h.filas[2]).toEqual(['Ana', '1234567', '600111222', '2000-01-15']);
    expect(h.numFila[2]).toBe(4); // la fila vacía no cuenta, pero se guarda su nº real
  });

  test('un PDF o un Access dan un mensaje que explica qué hacer', () => {
    const ruta = path.join(dir, 'listado.pdf');
    fs.writeFileSync(ruta, '%PDF-1.4');
    expect(db.leerArchivoTabla(ruta).error).toMatch(/Exportar/);
  });
});

describe('reconocimiento de columnas', () => {
  test('salta los títulos del listado y reconoce las columnas típicas', () => {
    const det = db.detectarTablaMigracion(tabla(
      'AUTOESCUELA LA RUEDA - LISTADO\n\nCód.;Apellidos y nombre;D.N.I.;Tlf. móvil;E-mail;F. Nac.;C.P.;Localidad;Tipo de permiso;F. Alta;Situación;Profesor;Prácticas realizadas;Saldo\n' +
      '1;GARCIA LOPEZ, ANA;12345678Z;600111222;ana@x.es;01/02/2001;8001;Barcelona;B;01/09/2026;Activo;Javier;5;120,50\n'), 'alumnos');
    expect(det.filaCabecera).toBe(1);
    expect(det.mapeo).toEqual(['', 'nombre_completo', 'dni', 'telefono', 'email', 'fecha_nacimiento', 'codigo_postal', 'poblacion', 'permiso', 'fecha_alta', 'estado', 'profesor', 'clases_previas', 'saldo']);
    expect(det.ordenNombre).toBe('apellidos_nombre');
  });

  test('sin fila de títulos: reconoce por lo que contienen las columnas', () => {
    const det = db.detectarTablaMigracion(tabla('Ana García López\t12345678Z\tana@x.es\t612345678\nLuis Pérez\tX1234567L\tluis@x.es\t699999999\n'), 'alumnos');
    expect(det.filaCabecera).toBe(-1);
    expect(det.mapeo).toEqual(['nombre_completo', 'dni', 'email', 'telefono']);
  });

  test('avisa si el archivo parece un historial de clases', () => {
    const det = db.detectarTablaMigracion(tabla('Alumno,Fecha,Hora,Matrícula\nAna,01/09/2026,10:00,1234ABC\n'), 'alumnos');
    expect(det.tipoSugerido).toBe('clases');
  });
});

describe('importar alumnos', () => {
  const CSV = 'Nombre;Apellidos;DNI;Teléfono;Permiso;Estado;Profesor;Coche;Clases;Saldo\n' +
    'ANA;GARCÍA LÓPEZ;12345678Z;600 111 222;B;Activo;Javier Ruiz;Ibiza 1234 BCD;4;100\n' +
    'Luis;Pérez;;;A2;Baja;;;;\n' +
    'Ana;García López;12345678-Z;;;;;;;\n' + // repetida en el archivo
    'Eva;Sanz;X1234567L;611222333;Permiso B;En prácticas;Javier;;;\n';

  test('vista previa sin guardar nada y luego importa exactamente eso', () => {
    db.addProfesor('Javier Ruiz', '');
    const e = entrada(CSV, 'alumnos', { soloEnCurso: true });
    const plan = db.analizarImportacion(e);
    expect(plan.ok).toBe(true);
    expect(plan.resumen).toMatchObject({ nuevos: 2, omitidos: 2, errores: 0 });
    expect(plan.filas.find(f => f.n === 3).motivo).toBe('De baja');
    expect(plan.filas.find(f => f.n === 4).motivo).toMatch(/Repetido/);
    expect(plan.resumen.vehiculosNuevos).toEqual(['Ibiza (1234BCD)']);
    expect(db.getAlumnos()).toHaveLength(0); // la vista previa no guarda

    const r = db.aplicarImportacion(e);
    expect(r.ok).toBe(true);
    const ana = db.getAlumnos().find(a => a.dni === '12345678Z');
    expect(ana).toMatchObject({ nombre: 'Ana', primer_apellido: 'García', segundo_apellido: 'López', telefono: '600111222', estado: 'activo', clases_previas: 4 });
    expect(db.getProfesores().find(p => p.id === ana.profesor_id).nombre).toBe('Javier Ruiz');
    expect(db.getVehiculos().find(v => v.id === ana.vehiculo_id)).toMatchObject({ nombre: 'Ibiza', matricula: '1234BCD' });
    expect(db.getCargosAlumno(ana.id)).toEqual([expect.objectContaining({ importe: 100, tipo: 'cargo' })]);
    expect(db.getProfesores()).toHaveLength(1); // «Javier» = Javier Ruiz, no se duplica
  });

  test('reimportar el mismo archivo no duplica nada; con altas nuevas solo entran esas', () => {
    db.aplicarImportacion(entrada(CSV, 'alumnos', { soloEnCurso: true }));
    const otra = db.analizarImportacion(entrada(CSV + 'Nuevo;Alumno;;;B;;;;;\n', 'alumnos', { soloEnCurso: true }));
    expect(otra.resumen).toMatchObject({ nuevos: 1, actualizar: 0 });
    expect(db.getCargos()).toHaveLength(1);
  });

  test('completa los datos que le faltan a un alumno que ya existe (sin tocar los que tiene)', () => {
    const vid = db.addVehiculo('Coche', '', 0);
    const id = db.addAlumno('Ana García López', 'B', vid, null, null, null, { telefono: '699000000' });
    const plan = db.analizarImportacion(entrada(CSV, 'alumnos'));
    const fila = plan.filas.find(f => f.id === id);
    expect(fila.accion).toBe('actualizar');
    expect(Object.keys(fila.cambios)).toEqual(expect.arrayContaining(['dni', 'estado', 'profesor_id']));
    expect(fila.cambios.telefono).toBeUndefined(); // ya tenía teléfono
    expect(fila.cambios.vehiculo_id).toBeUndefined(); // ya tenía coche
    db.aplicarImportacion(entrada(CSV, 'alumnos'));
    expect(db.getAlumnos().find(a => a.id === id)).toMatchObject({ dni: '12345678Z', telefono: '699000000', vehiculo_id: vid });
  });

  test('deshacer quita lo creado, devuelve lo completado y conserva lo que ya tiene clases', () => {
    const vid = db.addVehiculo('Coche', '', 0);
    const id = db.addAlumno('Ana García López', 'B', vid);
    const r = db.aplicarImportacion(entrada(CSV, 'alumnos'));
    const eva = db.getAlumnos().find(a => a.nombre === 'Eva');
    db.addPractica(eva.id, vid, '2026-10-01', 100, 140);
    const u = db.deshacerImportacion(r.id);
    expect(u.ok).toBe(true);
    expect(u.conservados).toEqual(['Eva Sanz']);
    expect(db.getAlumnos().map(a => a.nombre).sort()).toEqual(['Ana García López', 'Eva']);
    expect(db.getAlumnos().find(a => a.id === id).dni).toBeFalsy();
    expect(db.getCargos()).toHaveLength(0);
    expect(db.getImportaciones()[0].deshecha).toBeTruthy();
    expect(db.deshacerImportacion(r.id).ok).toBe(false);
  });

  test('sin columna de nombre no deja importar', () => {
    const h = tabla('a;b\n1;2\n');
    expect(db.analizarImportacion({ tipo: 'alumnos', filas: h.filas, filaCabecera: -1, mapeo: ['', ''] }).ok).toBe(false);
  });
});

describe('importar el historial de clases', () => {
  const HIST = 'Alumno;DNI;Fecha;Hora;Duración;Matrícula;Km inicial;Km final\n' +
    'Ana García;12345678Z;01/09/2026;10:00;45;1234BCD;1000;1040\n' +
    'Ana García;12345678Z;03/09/2026;10:00;90;1234BCD;1040;1120\n' +
    'Ana García;12345678Z;05/09/2026;10:00;45;1234BCD;1100;1130\n' + // pisa la anterior → sin km
    'Pedro Ruiz;;04/09/2026;;;;;\n' +
    'Ana García;12345678Z;20/12/2026;10:00;45;;;\n'; // futura: agenda

  test('crea clases anteriores, descuenta de las ya hechas y no duplica al repetir', () => {
    const vid = db.addVehiculo('Ibiza', '1234 BCD', 900);
    const ana = db.addAlumno('Ana', 'B', vid, null, null, null, { primer_apellido: 'García', dni: '12345678Z' });
    db.setPuntoDePartidaAlumno(ana, 10, 0);
    const e = entrada(HIST, 'clases', { duracion: 45 });
    const plan = db.analizarImportacion(e);
    expect(plan.ok).toBe(true);
    expect(plan.resumen).toMatchObject({ clases: 5, alumnosNuevos: 1, omitidos: 1 });
    expect(plan.filas.find(f => f.n === 4).avisos.join(' ')).toMatch(/pisan/);
    db.aplicarImportacion(e);
    const suyas = db.getPracticasByAlumno(ana).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));
    expect(suyas.map(p => [p.fecha, p.hora_inicio, p.km_inicial, p.km_final, p.tipo_detalle])).toEqual([
      ['2026-09-01', '10:00', 1000, 1040, 'anterior'],
      ['2026-09-03', '10:00', 1040, 1080, 'anterior'],
      ['2026-09-03', '10:45', 1080, 1120, 'anterior'],
      ['2026-09-05', '10:00', 0, 0, 'anterior']
    ]);
    expect(db.getAlumnos().find(a => a.id === ana).clases_previas).toBe(6);
    expect(db.getAlumnos().find(a => a.nombre === 'Pedro')).toBeTruthy();
    expect(db.getVehiculos()[0].km_actual).toBe(1120);
    // Repetir la importación: todo «ya está en la app»
    expect(db.analizarImportacion(e).resumen).toMatchObject({ nuevos: 0, iguales: 4 });
  });

  test('sin columna de fecha no deja importar clases', () => {
    const h = tabla('Alumno\nAna\n');
    expect(db.analizarImportacion({ tipo: 'clases', filas: h.filas, filaCabecera: 0, mapeo: ['nombre_completo'] }).errores[0]).toMatch(/fecha/);
  });
});

describe('retoques', () => {
  test('partículas de los apellidos en minúscula y aviso de lista de alumnos elegida como clases', () => {
    expect(N.capitalizarNombre('DE LA FUENTE', { apellido: true })).toBe('de la Fuente');
    expect(N.capitalizarNombre('DE', { apellido: true })).toBe('De');
    const plan = db.analizarImportacion(entrada('Apellidos, Nombre;DNI\nRUIZ DE LA FUENTE, PABLO;12345678Z\n'));
    expect(plan.filas[0].nombre).toBe('Pablo Ruiz de la Fuente');
    const det = db.detectarTablaMigracion(tabla('Nombre;Teléfono;Email;F. Alta\nAna;600111222;a@x.es;01/09/2026\n'), 'clases');
    expect(det.tipoSugerido).toBe('alumnos');
    expect(det.campos.find(c => c.id === 'observaciones').multiple).toBe(true);
    // Fila de títulos fijada a mano
    expect(db.detectarTablaMigracion(tabla('Nombre;DNI\nAna;12345678Z\n'), 'alumnos', -1).filaCabecera).toBe(-1);
  });
});
