// Alumnos repetidos y nombres juntos (db/alumnos-repetidos.js, 2026-10-06) y
// decisiones a mano al traer la base de Ariauto: que la ficha de cada alumno
// sea una sola, con su nombre y apellidos en su sitio, sin perder nada.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resetData, userDataDir } = require('./helpers');

beforeEach(() => resetData(db));
const pend = () => JSON.parse(fs.readFileSync(path.join(userDataDir, 'pending_sync.json'), 'utf-8'));
const leer = () => JSON.parse(fs.readFileSync(path.join(userDataDir, 'data.json'), 'utf-8'));
const alumno = id => db.getAlumnos().find(a => a.id === id);

describe('separar nombre y apellidos', () => {
  test('propone separar los que tienen todo en «Nombre» y guarda solo lo confirmado (y se deshace)', () => {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 1000);
    const juan = db.addAlumno('Juan García López', 'B', vid, null);
    const mj = db.addAlumno('María José', 'B', vid, null);
    const ok = db.addAlumno('Ana', 'B', vid, null, null, null, { primer_apellido: 'Ruiz' });
    db.addAlumno('Pepe', 'B', vid, null);
    const pid = db.addPractica(juan, vid, '2026-10-01', 1000, 1040);
    const prop = db.proponerSepararNombres();
    expect(prop.map(x => [x.id, x.nombre, x.primer_apellido, x.segundo_apellido, x.seguro])).toEqual([
      [juan, 'Juan', 'García', 'López', true],
      [mj, 'María', 'José', '', false]   // ¿nombre compuesto? sale sin marcar
    ]);
    expect(prop.some(x => x.id === ok)).toBe(false);
    fs.unlinkSync(path.join(userDataDir, 'pending_sync.json'));
    const r = db.aplicarSepararNombres([{ id: juan, nombre: 'Juan', primer_apellido: 'García', segundo_apellido: 'López' }]);
    expect(r).toMatchObject({ ok: true, cambiados: 1 });
    expect(alumno(juan)).toMatchObject({ nombre: 'Juan', primer_apellido: 'García', segundo_apellido: 'López' });
    expect(alumno(mj).nombre).toBe('María José');
    expect(db.getPracticasByAlumno(juan).map(p => p.id)).toEqual([pid]);
    expect(pend().alumnos).toEqual([juan]);
    // Deshacer = volver a aplicar lo de antes
    db.aplicarSepararNombres(r.anteriores);
    expect(alumno(juan)).toMatchObject({ nombre: 'Juan García López', primer_apellido: null, segundo_apellido: null });
  });

  test('editar un alumno con datos parciales ya no borra el resto de su ficha', () => {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 1000);
    const id = db.addAlumno('Ana', 'B', vid, null, null, 'ana@x.es', { primer_apellido: 'Ruiz', dni: '12345678Z', telefono: '600111222' });
    db.updateAlumno(id, 'Ana', 'B', vid, null, 'ana@x.es', { telefono: '611222333' });
    expect(alumno(id)).toMatchObject({ telefono: '611222333', primer_apellido: 'Ruiz', dni: '12345678Z' });
  });
});

describe('juntar dos fichas de la misma persona', () => {
  function dosFichas() {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 1000);
    const pc = db.addAlumno('Lucía', 'B', vid, null, null, null, { primer_apellido: 'Martín', n_registro: '4900', fecha_alta: '2026-09-01' });
    const movil = db.addAlumno('Lucia Martin', 'B', vid, null, null, null, { dni: '12345678Z', telefono: '600111222', fecha_alta: '2026-08-20', n_registro: '' });
    const p1 = db.addPractica(pc, vid, '2026-09-10', 1000, 1040);
    const p2 = db.addPractica(movil, vid, '2026-09-12', 1040, 1080);
    const pago = db.addPago(movil, '2026-09-12', 50, 'Clase');
    const d = leer();
    d.presentaciones = [{ id: 1, alumno_id: movil, tipo: 'teorico', fecha: '2026-09-20', resultado: 'apto' }];
    d.vencimientos = [{ id: 1, entidad_tipo: 'alumno', entidad_id: movil, tipo: 'DNI', fecha_vencimiento: '2030-01-01' }];
    fs.writeFileSync(path.join(userDataDir, 'data.json'), JSON.stringify(d));
    db._clearCache();
    return { vid, pc, movil, p1, p2, pago };
  }

  test('las encuentra (mismo nombre y permiso) pero no junta otro permiso, otro DNI ni otro nº de registro', () => {
    const { pc, movil, vid } = dosFichas();
    db.addAlumno('Lucía', 'A2', vid, null, null, null, { primer_apellido: 'Martín' });                        // otro permiso: otro expediente
    db.addAlumno('Pedro Gil', 'B', vid, null, null, null, { dni: '11111111H' });
    db.addAlumno('Pedro', 'B', vid, null, null, null, { primer_apellido: 'Gil', dni: '22222222J' });          // otro DNI: otra persona
    const rep = db.buscarAlumnosRepetidos();
    expect(rep.length).toBe(1);
    // Se propone quedarse con la que tiene más datos (la del nº de registro)
    expect([rep[0].queda, rep[0].seVa]).toEqual([pc, movil]);
  });

  test('todo pasa a la que se queda, que completa sus datos vacíos; la otra se borra y se puede deshacer', () => {
    const { pc, movil, p1, p2, pago } = dosFichas();
    const prev = db.previaFusionAlumnos(pc, movil);
    expect(prev.ok).toBe(true);
    expect(prev.mover).toEqual(expect.arrayContaining([{ tabla: 'practicas', nombre: 'clases', n: 1 }, { tabla: 'pagos', nombre: 'cobros', n: 1 }, { tabla: 'presentaciones', nombre: 'exámenes', n: 1 }, { tabla: 'vencimientos', nombre: 'caducidades', n: 1 }]));
    expect(prev.completar.map(c => c.campo)).toEqual(expect.arrayContaining(['dni', 'telefono', 'fecha_alta']));
    fs.unlinkSync(path.join(userDataDir, 'pending_sync.json'));

    const r = db.fusionarAlumnos(pc, movil);
    expect(r).toMatchObject({ ok: true, movidos: 4 });
    expect(alumno(movil)).toBeUndefined();
    expect(alumno(pc)).toMatchObject({ nombre: 'Lucía', primer_apellido: 'Martín', n_registro: '4900', dni: '12345678Z', telefono: '600111222', fecha_alta: '2026-08-20' });
    expect(db.getPracticasByAlumno(pc).map(p => p.id).sort()).toEqual([p1, p2].sort());
    const d = leer();
    expect(d.pagos.find(x => x.id === pago).alumno_id).toBe(pc);
    expect(d.presentaciones[0].alumno_id).toBe(pc);
    expect(d.vencimientos[0].entidad_id).toBe(pc);
    // En la nube: las clases y cobros se suben con su nuevo alumno; la otra ficha, borrado suave
    const p = pend();
    expect(p.practicas).toEqual([p2]); expect(p.pagos).toEqual([pago]);
    expect(p.alumnos).toContain(pc); expect(p.deleted.alumnos).toEqual([movil]);
    expect(db.getFusionesAlumnos()[0]).toMatchObject({ queda: 'Lucía Martín', seVa: 'Lucia Martin', movidos: 4, deshecha: null });

    // Deshacer: vuelve la ficha con lo suyo y la otra queda como estaba
    expect(db.deshacerFusionAlumnos(r.id)).toEqual({ ok: true });
    expect(alumno(movil)).toMatchObject({ nombre: 'Lucia Martin', dni: '12345678Z' });
    expect(alumno(pc)).toMatchObject({ dni: null, telefono: null, fecha_alta: '2026-09-01' });
    expect(db.getPracticasByAlumno(movil).map(p => p.id)).toEqual([p2]);
    expect(leer().vencimientos[0].entidad_id).toBe(movil);
    expect(pend().deleted.alumnos).toEqual([]);
    expect(db.deshacerFusionAlumnos(r.id).ok).toBe(false);
  });

  test('no junta una ficha consigo misma ni una que no existe', () => {
    const { pc } = dosFichas();
    expect(db.fusionarAlumnos(pc, pc).ok).toBe(false);
    expect(db.previaFusionAlumnos(pc, 999).ok).toBe(false);
  });
});

describe('traer Ariauto con alumnos ya dados de alta: se avisa y se decide antes', () => {
  const HOY = '2026-10-03';
  const tablas = () => ({
    ALUMNOS: [
      { 'Nº ALUMNO': '4001', SECCION: 1, NOMBREALUMNO: 'MARIA JOSE', 'PRIMER APELLIDO': 'GARCIA', 'SEGUNDO APELLIDO': 'DE LA FUENTE', 'DNI DEL ALUMNO': '12345678', 'NIF DEL ALUMNO': 'Z', 'FECHA DE ALTA': '2026-06-01', PERMISO: 4 },
      { 'Nº ALUMNO': '4002', SECCION: 1, NOMBREALUMNO: 'IVAN', 'PRIMER APELLIDO': 'PETROV', 'FECHA DE ALTA': '2026-09-15', PERMISO: 4 }
    ],
    PERMISOS: [{ 'NUMERO PERMISO': 4, 'NOMBRE PERMISO': 'B' }],
    PROFESORES: [], VEHICULOS: [], 'GASTOS E INGRESOS': [], PRACTICAS: [], 'FECHA DE EXAMEN': [], Tasas_Alumnos: [],
    'DATOS DE AUTOESCUELA': [{ SECCION: 1, 'NUMERO DE AUTOESCUELA': 'OR0028', 'NOMBRE DE SECCION': 'XINZO', 'SECCION POR DEFECTO': true }]
  });
  const fila = (p, n) => p.filas.find(f => f.n_registro === n);

  test('el alumno dado de alta en el móvil con el nombre junto se reconoce y sus clases se conservan', () => {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 1000);
    const movil = db.addAlumno('Maria Jose Garcia de la Fuente', 'B', vid, null, null, null, { n_registro: '' });
    const pid = db.addPractica(movil, vid, '2026-10-01', 1000, 1040);
    const p = db.previaAriauto(db.planAriauto(tablas(), { hoy: HOY }));
    const maria = fila(p, '4001');
    expect(maria).toMatchObject({ accion: 'actualizar', id: movil });
    expect(maria.candidatos[0]).toMatchObject({ id: movil, clasesApp: 1 });
    db.aplicarAriauto(tablas(), { hoy: HOY });
    expect(db.getAlumnos().filter(a => /maria/i.test(a.nombre)).length).toBe(1);
    expect(alumno(movil)).toMatchObject({ dni: '12345678Z', n_registro: '4001' });
    expect(db.getPracticasByAlumno(movil).map(p => p.id)).toContain(pid);
  });

  test('editar el alumno en el escritorio (separar nombre y apellidos, cambiar el teléfono) no impide reconocerlo después', () => {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 1000);
    const movil = db.addAlumno('maria jose garcia de la fuente', 'B', vid, null, null, null, { n_registro: '' });
    const pid = db.addPractica(movil, vid, '2026-10-01', 1000, 1040);
    db.aplicarSepararNombres([{ id: movil, nombre: 'María José', primer_apellido: 'García', segundo_apellido: 'de la Fuente' }]);
    db.updateAlumnoCampos(movil, { telefono: '600111222' });
    db.aplicarAriauto(tablas(), { hoy: HOY });
    expect(db.getAlumnos().filter(a => /mar[ií]a/i.test(a.nombre)).length).toBe(1);
    expect(alumno(movil)).toMatchObject({ nombre: 'María José', telefono: '600111222', dni: '12345678Z', n_registro: '4001' });
    expect(db.getPracticasByAlumno(movil).map(p => p.id)).toContain(pid);
  });

  test('se puede juntar a mano con un alumno de nombre muy distinto, no traer una ficha o hacer que entre aparte', () => {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 1000);
    const mari = db.addAlumno('Mari', 'B', vid, null, null, null, { primer_apellido: 'Fuente', n_registro: '' });
    const ivan = db.addAlumno('Ivan', 'B', vid, null, null, null, { primer_apellido: 'Petrov', n_registro: '' });
    db.addPractica(mari, vid, '2026-10-01', 1000, 1040);
    let p = db.previaAriauto(db.planAriauto(tablas(), { hoy: HOY }));
    expect(fila(p, '4001').accion).toBe('nuevo');            // nombre muy distinto: no se reconoce solo
    expect(fila(p, '4002')).toMatchObject({ accion: 'actualizar', id: ivan });
    const decisiones = { [fila(p, '4001').clave]: mari, [fila(p, '4002').clave]: 'omitir' };
    p = db.previaAriauto(db.planAriauto(tablas(), { hoy: HOY, decisiones }));
    expect(fila(p, '4001')).toMatchObject({ accion: 'actualizar', id: mari, manual: true });
    expect(fila(p, '4002')).toMatchObject({ accion: 'omitir', manual: true });
    expect(p.resumen).toMatchObject({ nuevos: 0, completar: 1, omitidos: 1, decididas: 2 });
    const antes = db.getAlumnos().length;
    db.aplicarAriauto(tablas(), { hoy: HOY, decisiones });
    expect(db.getAlumnos().length).toBe(antes);
    expect(alumno(mari)).toMatchObject({ dni: '12345678Z', n_registro: '4001' });
    expect(alumno(ivan).n_registro || null).toBeNull();      // no se trajo

    // «Es otra persona»: entra aparte aunque se llame igual
    resetData(db);
    const vid2 = db.addVehiculo('Ibiza', '1111AAA', 1000);
    const ivan2 = db.addAlumno('Ivan', 'B', vid2, null, null, null, { primer_apellido: 'Petrov', n_registro: '' });
    const p2 = db.previaAriauto(db.planAriauto(tablas(), { hoy: HOY }));
    db.aplicarAriauto(tablas(), { hoy: HOY, decisiones: { [fila(p2, '4002').clave]: 'nuevo' } });
    expect(db.getAlumnos().filter(a => a.nombre === 'Ivan').length).toBe(2);
    expect(alumno(ivan2).n_registro || null).toBeNull();
  });
});

describe('«Traer de otro programa» (Excel/CSV): también se decide fila a fila', () => {
  test('una fila que iba a entrar como nueva se junta a mano con el alumno de la app (y otra no se trae)', () => {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 1000);
    const mari = db.addAlumno('Mari', 'B', vid, null, null, null, { primer_apellido: 'Fuente', n_registro: '' });
    const h = db.leerTextoTabla('Nombre;Apellidos;DNI;Teléfono\nMaria Jose;Garcia de la Fuente;12345678Z;600111222\nPepe;Gil;11111111H;\n');
    const det = db.detectarTablaMigracion(h, 'alumnos');
    const entrada = (decisiones = {}) => ({ tipo: 'alumnos', filas: h.filas, numFila: h.numFila, filaCabecera: det.filaCabecera, mapeo: det.mapeo, opciones: { hoy: '2026-10-06', ordenNombre: det.ordenNombre, decisiones }, archivo: 'x.csv' });
    let plan = db.analizarImportacion(entrada());
    const [fMaria, fPepe] = plan.filas;
    expect([fMaria.accion, fPepe.accion]).toEqual(['nuevo', 'nuevo']);
    plan = db.analizarImportacion(entrada({ [fMaria.n]: mari, [fPepe.n]: 'omitir' }));
    expect(plan.filas.map(f => [f.accion, f.manual])).toEqual([['actualizar', true], ['omitir', true]]);
    const antes = db.getAlumnos().length;
    db.aplicarImportacion(entrada({ [fMaria.n]: mari, [fPepe.n]: 'omitir' }));
    expect(db.getAlumnos().length).toBe(antes);
    expect(alumno(mari)).toMatchObject({ dni: '12345678Z', telefono: '600111222' });
  });
});
