// Tests de db.getDatosFichaDGT (datos para el impreso oficial DGT de
// formación práctica) y del round-trip de los campos nuevos: hora_inicio de
// práctica, primer_apellido/segundo_apellido/codigo_postal/poblacion del
// alumno, y dni del profesor. Registro LOCAL: no toca sync.js.
const db = require('../db');
const { resetData } = require('./helpers');
// Filas sin las firmas (se comprueban aparte, más abajo)
const sinFirmas = filas => filas.map(({ firma_alumno, firma_profesor, ...r }) => r);

beforeEach(() => { resetData(db); });

test('getDatosFichaDGT con alumno inexistente devuelve null', () => {
  expect(db.getDatosFichaDGT(999, 'circulacion')).toBeNull();
});

test('getDatosFichaDGT filtra por tipo (destreza -> pista, circulacion -> circulacion), formatea fecha y devuelve alumno/profesor/practicas', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const pid = db.addProfesor('Juan', '', null, '11111111A');
  const aid = db.addAlumno('Ana', 'B', vid, pid, null, null, {
    dni: '22222222B',
    primer_apellido: 'García',
    segundo_apellido: 'López',
    direccion: 'Calle Mayor 1',
    codigo_postal: '28001',
    poblacion: 'Madrid',
  });

  // Sembradas fuera de orden a propósito, para comprobar el ordenado por fecha.
  db.addPractica(aid, vid, '2026-07-10', 100, 150, pid, 'pista', null, '10:30');
  db.addPractica(aid, vid, '2026-07-01', 0, 40, pid, 'circulacion', null, '09:00');
  db.addPractica(aid, vid, '2026-07-05', 40, 80, pid, 'pista', null, null);

  const destreza = db.getDatosFichaDGT(aid, 'destreza');
  expect(destreza.alumno).toMatchObject({
    dni: '22222222B', permiso: 'B', nombre: 'Ana',
    primer_apellido: 'García', segundo_apellido: 'López',
    direccion: 'Calle Mayor 1', codigo_postal: '28001', poblacion: 'Madrid',
  });
  expect(destreza.profesor).toEqual({ nombre: 'Juan', dni: '11111111A' });
  // Solo las 2 prácticas de tipo 'pista', ordenadas por fecha ascendente.
  expect(sinFirmas(destreza.practicas)).toEqual([
    { fecha: '05/07/2026', hora: '', km_inicial: '40', km_final: '80', clases: 1, ejercicio: '1 CLASE' },
    { fecha: '10/07/2026', hora: '10:30', km_inicial: '100', km_final: '150', clases: 1, ejercicio: '1 CLASE' },
  ]);

  const circulacion = db.getDatosFichaDGT(aid, 'circulacion');
  expect(sinFirmas(circulacion.practicas)).toEqual([
    { fecha: '01/07/2026', hora: '09:00', km_inicial: '0', km_final: '40', clases: 1, ejercicio: '1 CLASE' },
  ]);
});

test('getDatosFichaDGT agrupa las clases del mismo día en una fila: "1 CLASE" si fue una, "2 CLASES" si fueron 2 o más', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  // Día 1: dos clases seguidas (sembradas al revés para comprobar el orden por hora)
  db.addPractica(aid, vid, '2026-09-08', 207955, 208000, null, 'circulacion', null, '10:45');
  db.addPractica(aid, vid, '2026-09-08', 207908, 207955, null, 'circulacion', null, '10:00');
  // Día 2: una sola clase
  db.addPractica(aid, vid, '2026-09-09', 208000, 208040, null, 'circulacion', null, '09:00');
  // Día 3: tres clases (el impreso admite como mucho "2 CLASES")
  db.addPractica(aid, vid, '2026-09-10', 208040, 208080, null, 'circulacion', null, '09:00');
  db.addPractica(aid, vid, '2026-09-10', 208080, 208120, null, 'circulacion', null, '09:45');
  db.addPractica(aid, vid, '2026-09-10', 208120, 208160, null, 'circulacion', null, '10:30');

  expect(sinFirmas(db.getDatosFichaDGT(aid, 'circulacion').practicas)).toEqual([
    { fecha: '08/09/2026', hora: '10:00', km_inicial: '207908', km_final: '208000', clases: 2, ejercicio: '2 CLASES' },
    { fecha: '09/09/2026', hora: '09:00', km_inicial: '208000', km_final: '208040', clases: 1, ejercicio: '1 CLASE' },
    { fecha: '10/09/2026', hora: '09:00', km_inicial: '208040', km_final: '208160', clases: 3, ejercicio: '2 CLASES' },
  ]);
});

test('getDatosFichaDGT excluye prácticas borradas', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  const pid = db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion');
  db.deletePractica(pid);

  const datos = db.getDatosFichaDGT(aid, 'circulacion');
  expect(datos.practicas).toEqual([]);
});

// ─── Round-trip de los campos nuevos ───────────────────────────────────────

test('addPractica/updatePractica guardan y devuelven hora_inicio', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);

  const pid = db.addPractica(aid, vid, '2026-07-01', 0, 40, null, 'circulacion', null, '09:15');
  let p = db.getPracticasByAlumno(aid)[0];
  expect(p.hora_inicio).toBe('09:15');

  db.updatePractica(pid, '2026-07-01', 0, 40, null, 'circulacion', '10:45');
  p = db.getPracticasByAlumno(aid)[0];
  expect(p.hora_inicio).toBe('10:45');

  // Omitir hora_inicio (compat con llamadas antiguas) -> null.
  db.updatePractica(pid, '2026-07-01', 0, 40);
  p = db.getPracticasByAlumno(aid)[0];
  expect(p.hora_inicio).toBeNull();
});

test('addAlumno/updateAlumno guardan y devuelven primer_apellido/segundo_apellido/codigo_postal/poblacion', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid, null, null, null, {
    primer_apellido: 'García', segundo_apellido: 'López',
    codigo_postal: '28001', poblacion: 'Madrid',
  });

  let a = db.getAlumnos().find(x => x.id === aid);
  expect(a.primer_apellido).toBe('García');
  expect(a.segundo_apellido).toBe('López');
  expect(a.codigo_postal).toBe('28001');
  expect(a.poblacion).toBe('Madrid');

  // updateAlumno normaliza TODO el grupo CAMPOS_DATOS_ALUMNO a la vez (igual
  // que hace el formulario real, que siempre manda los 4 campos): hay que
  // repetir los que no cambian o se pisan a null.
  db.updateAlumno(aid, 'Ana', 'B', vid, null, null, {
    primer_apellido: 'García', segundo_apellido: 'López',
    codigo_postal: '28001', poblacion: 'Barcelona',
  });
  a = db.getAlumnos().find(x => x.id === aid);
  expect(a.poblacion).toBe('Barcelona');
  expect(a.primer_apellido).toBe('García');
});

test('addProfesor/updateProfesor guardan y devuelven dni', () => {
  const pid = db.addProfesor('Juan', '', null, '11111111A');
  let p = db.getProfesores().find(x => x.id === pid);
  expect(p.dni).toBe('11111111A');

  db.updateProfesor(pid, 'Juan', '', '99999999Z');
  p = db.getProfesores().find(x => x.id === pid);
  expect(p.dni).toBe('99999999Z');
});

// ─── Firmas en la ficha DGT (2026-10-02) ───────────────────────────────────
const core = require('../db/core');
// PNG 1×1 válido (los tests de db no necesitan una firma «de verdad»)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG2 = PNG.replace('ggg==', 'ggA=');

test('setFirmaProfesor guarda la firma (validada), getProfesores solo dice si la tiene y la marca para subir', () => {
  const pid = db.addProfesor('Juan', '');
  expect(db.getProfesores()[0].tiene_firma).toBe(false);
  expect(db.setFirmaProfesor(pid, 'no-es-una-imagen').ok).toBe(false);
  expect(db.setFirmaProfesor(pid, 'data:image/png;base64,' + 'A'.repeat(core.FIRMA_MAX)).ok).toBe(false);
  expect(db.setFirmaProfesor(999, PNG).ok).toBe(false);

  expect(db.setFirmaProfesor(pid, PNG)).toEqual({ ok: true });
  const p = db.getProfesores()[0];
  expect(p.tiene_firma).toBe(true);
  expect(p.firma).toBeUndefined();          // la imagen no viaja en la lista
  expect(p.firma_pendiente).toBeUndefined();
  expect(db.getFirmaProfesor(pid)).toBe(PNG);
  expect(core.load().profesores[0].firma_pendiente).toBe(true);

  // Quitarla
  expect(db.setFirmaProfesor(pid, null)).toEqual({ ok: true });
  expect(db.getFirmaProfesor(pid)).toBeNull();
  expect(db.getProfesores()[0].tiene_firma).toBe(false);
});

test('getDatosFichaDGT pone en cada fila la firma del alumno de esa clase y la del profesor que la dio', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const juan = db.addProfesor('Juan', '');
  const eva = db.addProfesor('Eva', '');
  const aid = db.addAlumno('Ana', 'B', vid, juan);
  db.setFirmaProfesor(juan, PNG);
  db.setFirmaProfesor(eva, PNG2);
  const p1 = db.addPractica(aid, vid, '2026-09-01', 100, 140, juan, 'circulacion', null, '10:00');
  const p2 = db.addPractica(aid, vid, '2026-09-02', 140, 180, eva, 'circulacion', null, '10:00');
  db.addPractica(aid, vid, '2026-09-03', 180, 220, null, 'circulacion', null, '10:00'); // sin profesor → el del alumno
  const d = core.load();
  d.practicas.find(p => p.id === p1).firma = PNG;
  d.practicas.find(p => p.id === p2).firma = 'basura';  // firma inválida → casilla en blanco

  const filas = db.getDatosFichaDGT(aid, 'circulacion').practicas;
  expect(filas.map(f => [f.firma_alumno, f.firma_profesor])).toEqual([
    [PNG, PNG], [null, PNG2], [null, PNG],
  ]);
  expect(db.getDatosFichaDGT(aid, 'circulacion').profesores_sin_firma).toEqual([]);
});

test('getDatosFichaDGT: un día de varias clases usa la firma que haya; avisa de los profesores sin firma guardada', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const juan = db.addProfesor('Juan', '');
  const aid = db.addAlumno('Ana', 'B', vid, juan);
  db.addPractica(aid, vid, '2026-09-01', 100, 140, juan, 'circulacion', null, '10:00');
  const p2 = db.addPractica(aid, vid, '2026-09-01', 140, 180, juan, 'circulacion', null, '10:45');
  core.load().practicas.find(p => p.id === p2).firma = PNG;

  const datos = db.getDatosFichaDGT(aid, 'circulacion');
  expect(datos.practicas).toHaveLength(1);
  expect(datos.practicas[0].firma_alumno).toBe(PNG);
  expect(datos.practicas[0].firma_profesor).toBeNull();
  expect(datos.profesores_sin_firma).toEqual([{ id: juan, nombre: 'Juan' }]);
});

test('getDatosFichaDGT suma las fracciones de clase del día («½ CLASE», «1 ½ CLASES»)', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  const a = db.addPractica(aid, vid, '2026-09-01', 100, 120, null, 'circulacion', null, '10:00');
  db.addPractica(aid, vid, '2026-09-02', 120, 160, null, 'circulacion', null, '10:00');
  const c = db.addPractica(aid, vid, '2026-09-02', 160, 180, null, 'circulacion', null, '10:45');
  const d = core.load();
  d.practicas.find(p => p.id === a).fraccion = 0.5;
  d.practicas.find(p => p.id === c).fraccion = 0.5;
  expect(db.getDatosFichaDGT(aid, 'circulacion').practicas.map(f => [f.clases, f.ejercicio])).toEqual([
    [0.5, '½ CLASE'], [1.5, '1 ½ CLASES'],
  ]);
});

test('generarFichaDGT dibuja las firmas en el PDF (página 1 y de continuación) sin referencias rotas', async () => {
  const { PDFDocument, PDFName, PDFRawStream } = require('pdf-lib');
  const { generarFichaDGT } = require('../fichas-dgt');
  const practicas = Array.from({ length: 13 }, (_, i) => ({
    fecha: `${String(i + 1).padStart(2, '0')}/09/2026`, hora: '10:00', km_inicial: String(1000 + i * 40), km_final: String(1040 + i * 40),
    clases: 1, ejercicio: '1 CLASE', firma_alumno: i === 0 ? null : PNG, firma_profesor: PNG2,
  }));
  const { PDFDict: Dict, decodePDFRawStream } = require('pdf-lib');
  // Imágenes pintadas en cada página (las plantillas ya traen las suyas: escudo, logo, escaneo)
  const contarImagenes = doc => doc.getPages().map(pg => {
    const xo = pg.node.Resources().lookup(PDFName.of('XObject'), Dict);
    const imagenes = xo.keys().filter(k => xo.lookup(k).dict.get(PDFName.of('Subtype')) === PDFName.of('Image')).map(k => k.asString());
    const contenido = pg.node.Contents();
    const flujos = contenido.asArray ? contenido.asArray().map(r => doc.context.lookup(r)) : [contenido];
    const texto = flujos.map(f => Buffer.from(f instanceof PDFRawStream ? decodePDFRawStream(f).decode() : f.getContents()).toString('latin1')).join(' ');
    return imagenes.reduce((n, nombre) => n + texto.split(`${nombre} Do`).length - 1, 0);
  });
  const doc = await PDFDocument.load(await generarFichaDGT({ tipo: 'circulacion', centro: {}, alumno: {}, profesor: {}, practicas }));
  const base = await PDFDocument.load(await generarFichaDGT({ tipo: 'circulacion', centro: {}, alumno: {}, profesor: {},
    practicas: practicas.map(p => ({ ...p, firma_alumno: null, firma_profesor: null })) }));
  expect(doc.getPageCount()).toBe(2);
  // Firmas por página: en la 1, 11 filas × 2 menos la que no tiene firma del
  // alumno = 21; en la de continuación, 2 filas × 2 = 4
  const conFirmas = contarImagenes(doc), sin = contarImagenes(base);
  expect(conFirmas.map((n, i) => n - sin[i])).toEqual([21, 4]);
  // Sin anotaciones que apunten a objetos que ya no existen
  for (const pg of doc.getPages()) {
    const annots = pg.node.lookup(PDFName.of('Annots'));
    if (annots) for (let i = 0; i < annots.size(); i++) expect(doc.context.lookup(annots.get(i))).toBeTruthy();
  }
}, 30000); // genera dos PDFs completos: con todos los tests en paralelo tarda más de 5 s

test('getDatosFichaDGT: sin profesor en la clase ni en el alumno, firma el único profesor de la autoescuela', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const juan = db.addProfesor('Juan', '', null, '11111111A');
  db.setFirmaProfesor(juan, PNG);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.addPractica(aid, vid, '2026-09-01', 100, 140, null, 'circulacion', null, '10:00');
  let datos = db.getDatosFichaDGT(aid, 'circulacion');
  expect(datos.profesor).toEqual({ nombre: 'Juan', dni: '11111111A' });
  expect(datos.practicas[0].firma_profesor).toBe(PNG);
  // Con dos profesores ya no se sabe quién fue: en blanco
  db.addProfesor('Eva', '');
  datos = db.getDatosFichaDGT(aid, 'circulacion');
  expect(datos.profesor.nombre).toBe('');
  expect(datos.practicas[0].firma_profesor).toBeNull();
});
