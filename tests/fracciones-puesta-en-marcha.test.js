// ¼ ½ ¾ de clase en la Puesta en marcha y al importar (2026-10-06): «clases
// ya hechas» con fracción, clases anteriores de 1 ½ o ½ en un día, el archivo
// de la IA con 0.5 / 1,5 / ½, el asistente «Traer de otro programa» y el CSV
// de prácticas. Una fracción es una práctica con `fraccion` (0.25/0.5/0.75).
const db = require('../db');
const core = require('../db/core');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); jest.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => jest.restoreAllMocks());

const delAlumno = id => db.getPracticasByAlumno(id).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio || '').localeCompare(b.hora_inicio || '') || a.id - b.id);
const alumnoDe = id => db.getAlumnos().find(a => a.id === id);

describe('leer cantidades de clases', () => {
  test('de ¼ en ¼, escritas de cualquier forma', () => {
    const casos = { '2': 2, '1,5': 1.5, '1.5': 1.5, '0.25': 0.25, '0,75': 0.75, '½': 0.5, '1 ½': 1.5, '1½': 1.5, '1/2': 0.5, '1 1/2': 1.5, '3 clases': 3, '¾ clase': 0.75, '12,5': 12.5 };
    for (const [t, v] of Object.entries(casos)) expect([t, core.leerCantidadClases(t)]).toEqual([t, v]);
    for (const t of ['', '0', '1,3', '0.1', 'abc', '-1']) expect([t, core.leerCantidadClases(t)]).toEqual([t, null]);
    expect(core.trozosDeClases(2.75)).toEqual([1, 1, 0.75]);
    expect(core.trozosDeClases(0.5)).toEqual([0.5]);
    expect(core.kmPorPesos(30, [1, 0.5])).toEqual([20, 10]);
  });
});

describe('Puesta en marcha: clases ya hechas con fracción', () => {
  test('el punto de partida admite 12,5 y la numeración sigue (la siguiente es la 14.ª)', () => {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 1000);
    const id = db.addAlumno('Ana', 'B', vid, null);
    db.setPuntoDePartidaAlumno(id, '12,5', 0);
    expect(alumnoDe(id).clases_previas).toBe(12.5);
    db.addPractica(id, vid, '2026-10-01', 1000, 1040);
    const ficha = db.getFichaAlumno(id, '2026-10-06');
    expect(ficha.practicas.map(p => p.n)).toEqual([14]);
    db.setPuntoDePartidaAlumno(id, '12 ¾', 0);
    expect(alumnoDe(id).clases_previas).toBe(12.75);
  });

  test('la tabla guarda «12 ½» y avisa si el número no va de ¼ en ¼', () => {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 1000);
    let r = db.guardarPuestaEnMarcha({ vehiculos: [], profesores: [], alumnos: [{ id: null, nombre: 'Luis', primer_apellido: 'Gil', permiso: 'B', vehiculo_id: vid, clases_previas: '12 ½', km_previos: '' }] });
    expect(r.ok).toBe(true);
    const luis = db.getAlumnos().find(a => a.nombre === 'Luis');
    expect(luis.clases_previas).toBe(12.5);
    r = db.guardarPuestaEnMarcha({ vehiculos: [], profesores: [], alumnos: [{ id: luis.id, nombre: 'Luis', primer_apellido: 'Gil', permiso: 'B', vehiculo_id: vid, clases_previas: '12,3', km_previos: '' }] });
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toMatch(/de ¼ en ¼/);
    expect(alumnoDe(luis.id).clases_previas).toBe(12.5);
  });
});

describe('clases anteriores con fracción', () => {
  test('1 ½ en un día = una entera y otra de ½, con los km y la hora en proporción', () => {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 5000);
    const id = db.addAlumno('Ana', 'B', vid, null);
    db.setPuntoDePartidaAlumno(id, 4, 0);
    const r = db.guardarClasesAnteriores(id, [
      { fecha: '08/09/2025', hora_inicio: '10:00', clases: '1,5', km_inicial: 1000, km_final: 1030 },
      { fecha: '10/09/2025', clases: '½' }
    ], { duracion: 40 });
    expect(r).toMatchObject({ ok: true, anotadas: 2 });
    expect(delAlumno(id).map(p => [p.fecha, p.hora_inicio, p.km_inicial, p.km_final, p.fraccion || null])).toEqual([
      ['2025-09-08', '10:00', 1000, 1020, null],
      ['2025-09-08', '10:40', 1020, 1030, 0.5],
      ['2025-09-10', null, 0, 0, 0.5]
    ]);
    // Lo anotado sale de las «clases ya hechas»: 4 − 2 = 2
    expect(alumnoDe(id).clases_previas).toBe(2);
    const datos = db.getClasesAnteriores(id);
    expect(datos.total).toBe(4);
    // Volver a guardar lo mismo no cambia nada (reutiliza las prácticas)
    const ids = delAlumno(id).map(p => p.id);
    db.guardarClasesAnteriores(id, [
      { fecha: '08/09/2025', hora_inicio: '10:00', clases: 1.5, km_inicial: 1000, km_final: 1030, ids: ids.slice(0, 2) },
      { fecha: '10/09/2025', clases: 0.5, ids: [ids[2]] }
    ], { duracion: 40 });
    expect(delAlumno(id).map(p => p.id)).toEqual(ids);
    expect(alumnoDe(id).clases_previas).toBe(2);
  });

  test('cantidades que no van de ¼ en ¼ o de más de 4 no se guardan', () => {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 5000);
    const id = db.addAlumno('Ana', 'B', vid, null);
    for (const clases of ['1,3', 5, '0']) {
      const r = db.guardarClasesAnteriores(id, [{ fecha: '08/09/2025', clases }]);
      expect(r.ok).toBe(false);
    }
    expect(delAlumno(id)).toEqual([]);
  });

  test('el archivo de la IA (o lo pegado) admite 0.5, 1,5, ½ y 0.25 (no las confunde con horas)', () => {
    const conCabecera = db.leerArchivoClasesAnteriores('fecha;hora;clases\n08/09/2025;10:00;1.5\n09/09/2025;;0,5\n10/09/2025;17:00;½\n11/09/2025;;7\n');
    expect(conCabecera.filas.map(f => f.clases)).toEqual([1.5, 0.5, 0.5, 1]);
    expect(conCabecera.errores.join(' ')).toMatch(/«7» clases no es válido/);
    const sinCabecera = db.leerArchivoClasesAnteriores('08/09/2025 10:00 1,5\n09/09/2025 0.25\n10/09/2025 17:30 2\n');
    expect(sinCabecera.filas.map(f => [f.hora_inicio, f.clases])).toEqual([['10:00', 1.5], ['', 0.25], ['17:30', 2]]);
  });

  test('crear las que faltan: 2 ½ clases ya hechas = 3 prácticas, la más antigua de ½', () => {
    const vid = db.addVehiculo('Ibiza', '1111AAA', 20000);
    const id = db.addAlumno('Ana', 'B', vid, null);
    db.setPuntoDePartidaAlumno(id, 2.5, 0);
    const plan = db.planificarClasesAnteriores({ kmMin: 40, kmMax: 45, duracion: 45, hoy: '2026-10-01' });
    expect(plan.ok).toBe(true);
    expect(plan.altas.length).toBe(3);
    const masAntigua = plan.altas.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio))[0];
    expect(masAntigua.fraccion).toBe(0.5);
    expect(plan.alumnos[0].nuevas).toBe(2.5);
    const r = db.aplicarClasesAnteriores(plan);
    expect(r.ok).toBe(true);
    expect(alumnoDe(id).clases_previas).toBe(0);
    const creadas = delAlumno(id);
    expect(creadas.reduce((t, p) => t + core.clasesDePractica(p), 0)).toBe(2.5);
  });
});

describe('importar clases con fracción', () => {
  test('«Traer de otro programa»: una fila de 1,5 clases son dos prácticas (la 2.ª de ½)', () => {
    const vid = db.addVehiculo('Ibiza', '1234 BCD', 900);
    const ana = db.addAlumno('Ana', 'B', vid, null, null, null, { primer_apellido: 'García', dni: '12345678Z' });
    db.setPuntoDePartidaAlumno(ana, 3, 0);
    const h = db.leerTextoTabla('Alumno;DNI;Fecha;Hora;Clases;Matrícula;Km inicial;Km final\nAna García;12345678Z;01/09/2026;10:00;1,5;1234BCD;1000;1030\nAna García;12345678Z;03/09/2026;;0.25;1234BCD;;\n');
    const det = db.detectarTablaMigracion(h, 'clases');
    const e = { tipo: 'clases', filas: h.filas, numFila: h.numFila, filaCabecera: det.filaCabecera, mapeo: det.mapeo, opciones: { hoy: '2026-10-02', duracion: 40, ordenNombre: det.ordenNombre }, archivo: 'x.csv' };
    expect(db.analizarImportacion(e).ok).toBe(true);
    db.aplicarImportacion(e);
    expect(delAlumno(ana).map(p => [p.fecha, p.hora_inicio, p.km_inicial, p.km_final, p.fraccion || null])).toEqual([
      ['2026-09-01', '10:00', 1000, 1020, null],
      ['2026-09-01', '10:40', 1020, 1030, 0.5],
      ['2026-09-03', null, 0, 0, 0.25]
    ]);
    // 3 − 1,75 importadas
    expect(alumnoDe(ana).clases_previas).toBe(1.25);
  });

  test('CSV de prácticas: columna opcional «clases» (0.5 = media clase, 1.5 = una y media)', () => {
    const res = db.importarCSV([
      { alumno: 'Ana', vehiculo: 'Ibiza', fecha: '2026-09-01', km_inicial: '1000', km_final: '1030', clases: '1.5' },
      { alumno: 'Ana', vehiculo: 'Ibiza', fecha: '2026-09-02', km_inicial: '1030', km_final: '1045', clases: '0,5' },
      { alumno: 'Ana', vehiculo: 'Ibiza', fecha: '2026-09-03', km_inicial: '1045', km_final: '1080', clases: '' },
      { alumno: 'Ana', vehiculo: 'Ibiza', fecha: '2026-09-04', km_inicial: '1080', km_final: '1100', clases: '1,3' }
    ], 40, 45);
    expect(res.errores).toBe(1);
    const ana = db.getAlumnos().find(a => a.nombre === 'Ana');
    expect(delAlumno(ana.id).map(p => [p.fecha, p.km_inicial, p.km_final, p.fraccion || null])).toEqual([
      ['2026-09-01', 1000, 1020, null], ['2026-09-01', 1020, 1030, 0.5], ['2026-09-02', 1030, 1045, 0.5], ['2026-09-03', 1045, 1080, null]
    ]);
    // Al exportar, la columna «clases» lleva la fracción
    const csv = db.exportarCSV().csv.split('\n');
    expect(csv[0]).toMatch(/,clases$/);
    expect(csv[2]).toMatch(/,0\.5$/);
  });
});
