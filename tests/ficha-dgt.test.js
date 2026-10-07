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
  expect(destreza.profesor).toEqual({ id: pid, nombre: 'Juan', dni: '11111111A', firma: null });
  // Solo las 2 prácticas de tipo 'pista', ordenadas por fecha ascendente.
  expect(sinFirmas(destreza.practicas)).toEqual([
    { fecha: '05/07/2026', hora: '', km_inicial: '40', km_final: '80', km_calculados: false, clases: 1, ejercicio: '1 CLASE' },
    { fecha: '10/07/2026', hora: '10:30', km_inicial: '100', km_final: '150', km_calculados: false, clases: 1, ejercicio: '1 CLASE' },
  ]);

  const circulacion = db.getDatosFichaDGT(aid, 'circulacion');
  expect(sinFirmas(circulacion.practicas)).toEqual([
    { fecha: '01/07/2026', hora: '09:00', km_inicial: '0', km_final: '40', km_calculados: false, clases: 1, ejercicio: '1 CLASE' },
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
    { fecha: '08/09/2026', hora: '10:00', km_inicial: '207908', km_final: '208000', km_calculados: false, clases: 2, ejercicio: '2 CLASES' },
    { fecha: '09/09/2026', hora: '09:00', km_inicial: '208000', km_final: '208040', km_calculados: false, clases: 1, ejercicio: '1 CLASE' },
    { fecha: '10/09/2026', hora: '09:00', km_inicial: '208040', km_final: '208160', km_calculados: false, clases: 3, ejercicio: '2 CLASES' },
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
  expect(datos.profesor).toEqual({ id: juan, nombre: 'Juan', dni: '11111111A', firma: PNG });
  expect(datos.practicas[0].firma_profesor).toBe(PNG);
  // Con dos profesores ya no se sabe quién fue: en blanco
  db.addProfesor('Eva', '');
  datos = db.getDatosFichaDGT(aid, 'circulacion');
  expect(datos.profesor.nombre).toBe('');
  expect(datos.practicas[0].firma_profesor).toBeNull();
});

// ─── PIE: FIRMAS DEL DIRECTOR Y DEL PROFESOR ────────────────────────────────

test('director del centro: otra persona con su propia firma (validada, sin la imagen en getDirector)', () => {
  expect(db.getDirector()).toEqual({ nombre: '', dni: '', profesor_id: null, tiene_firma: false, configurado: false });
  expect(db.setFirmaDirector(PNG).ok).toBe(false);          // sin perfil todavía
  expect(db.setDirector({ nombre: '  ' }).ok).toBe(false);  // sin nombre
  expect(db.setDirector({ nombre: ' Marta  Ruiz ', dni: '33333333c' })).toEqual({ ok: true });
  expect(db.setFirmaDirector('no-es-una-imagen').ok).toBe(false);
  expect(db.setFirmaDirector(PNG)).toEqual({ ok: true });
  expect(db.getDirector()).toEqual({ nombre: 'Marta Ruiz', dni: '33333333C', profesor_id: null, tiene_firma: true, configurado: true });
  expect(db.getFirmaDirector()).toBe(PNG);
  // Cambiar sus datos conserva la firma; se guarda como ajuste compartido (sube a la nube)
  db.setDirector({ nombre: 'Marta Ruiz Gil', dni: '' });
  expect(db.getFirmaDirector()).toBe(PNG);
  expect(core.load().ajustes_empresa.director.valor).toMatchObject({ nombre: 'Marta Ruiz Gil', profesor_id: null, firma: PNG });
  // Quitarla
  expect(db.setFirmaDirector(null)).toEqual({ ok: true });
  expect(db.getDirector().tiene_firma).toBe(false);
});

test('director del centro que también es profesor: usa los datos y la firma de ese profesor', () => {
  const juan = db.addProfesor('Juan', '', null, '11111111A');
  expect(db.setDirector({ profesor_id: 999 }).ok).toBe(false);
  db.setDirector({ nombre: 'Marta' });
  db.setFirmaDirector(PNG2);                       // firma propia de antes
  expect(db.setDirector({ profesor_id: juan })).toEqual({ ok: true });
  expect(db.getDirector()).toMatchObject({ nombre: 'Juan', dni: '11111111A', profesor_id: juan, tiene_firma: false });
  // Firmar como director = firmar como ese profesor (una sola firma)
  expect(db.setFirmaDirector(PNG)).toEqual({ ok: true });
  expect(db.getFirmaProfesor(juan)).toBe(PNG);
  expect(db.getFirmaDirector()).toBe(PNG);
  expect(db.getFirmaDirector(true)).toBe(PNG2);    // la propia sigue guardada
  // Si ese profesor se borra, vuelve a los datos propios
  db.deleteProfesor(juan);
  expect(db.getDirector()).toMatchObject({ profesor_id: null, nombre: 'Juan', tiene_firma: true });
  expect(db.getFirmaDirector()).toBe(PNG2);
});

test('getDatosFichaDGT trae la firma del profesor de la cabecera y la del director para el pie', () => {
  const vid = db.addVehiculo('Coche 1', '1234ABC', 1000);
  const juan = db.addProfesor('Juan', '');
  const aid = db.addAlumno('Ana', 'B', vid, juan);
  db.addPractica(aid, vid, '2026-09-01', 100, 140, juan, 'circulacion', null, '10:00');
  let datos = db.getDatosFichaDGT(aid, 'circulacion');
  expect(datos.profesor).toMatchObject({ id: juan, firma: null });
  expect(datos.director).toEqual({ nombre: '', firma: null, profesor_id: null });
  db.setFirmaProfesor(juan, PNG);
  db.setDirector({ nombre: 'Marta' });
  db.setFirmaDirector(PNG2);
  datos = db.getDatosFichaDGT(aid, 'circulacion');
  expect(datos.profesor.firma).toBe(PNG);
  expect(datos.director).toEqual({ nombre: 'Marta', firma: PNG2, profesor_id: null });
});

test('generarFichaDGT firma el pie (director y profesor) salvo con firmarPie: false', async () => {
  const { PDFDocument, PDFName, PDFDict: Dict, PDFRawStream, decodePDFRawStream } = require('pdf-lib');
  const { generarFichaDGT } = require('../fichas-dgt');
  // Posiciones (x, y desde abajo) de las imágenes pintadas en la página 1
  const posiciones = doc => {
    const pg = doc.getPage(0);
    const xo = pg.node.Resources().lookup(PDFName.of('XObject'), Dict);
    const nombres = new Set(xo.keys().filter(k => xo.lookup(k).dict.get(PDFName.of('Subtype')) === PDFName.of('Image')).map(k => k.asString()));
    const contenido = pg.node.Contents();
    const flujos = contenido.asArray ? contenido.asArray().map(r => doc.context.lookup(r)) : [contenido];
    const texto = flujos.map(f => Buffer.from(f instanceof PDFRawStream ? decodePDFRawStream(f).decode() : f.getContents()).toString('latin1')).join(' ');
    const out = [];
    // drawImage de pdf-lib: traslación, rotación, escala (ancho × alto), sesgo y Do
    const re = /1 0 0 1 ([-\d.]+) ([-\d.]+) cm\s+1 0 0 1 0 0 cm\s+([-\d.]+) 0 0 ([-\d.]+) 0 0 cm\s+1 0 0 1 0 0 cm\s+(\/\S+) Do/g;
    let m;
    while ((m = re.exec(texto))) if (nombres.has(m[5])) out.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] });
    return out;
  };
  const datos = {
    tipo: 'circulacion', centro: {}, alumno: {},
    profesor: { nombre: 'Juan', firma: PNG }, director: { firma: PNG2 },
    practicas: [{ fecha: '01/09/2026', hora: '10:00', km_inicial: '100', km_final: '140', clases: 1, ejercicio: '1 CLASE' }],
  };
  const H = 841.89;
  const pie = l => l.filter(p => H - p.y > 700); // por debajo de la tabla de clases
  const con = pie(posiciones(await PDFDocument.load(await generarFichaDGT(datos))));
  const sin = pie(posiciones(await PDFDocument.load(await generarFichaDGT({ ...datos, firmarPie: false }))));
  expect(con.length - sin.length).toBe(2);
  const nuevas = con.filter(p => !sin.some(q => q.x === p.x && q.y === p.y));
  // Director a la izquierda (bajo «Firma del Director», x≈91) y profesor a la
  // derecha (bajo «Firma del profesor», x≈440), entre el rótulo y el texto legal
  const [dir, prof] = nuevas.sort((a, b) => a.x - b.x);
  expect(Math.abs(dir.x + dir.w / 2 - 91)).toBeLessThan(2);
  expect(Math.abs(prof.x + prof.w / 2 - 440)).toBeLessThan(2);
  for (const p of nuevas) {
    expect(H - (p.y + p.h)).toBeGreaterThanOrEqual(718);  // no pisa el rótulo
    expect(H - p.y).toBeLessThanOrEqual(748.5);           // ni el texto de protección de datos
  }
}, 30000);

test('los km que calculó la app salen con * y nota al pie (se puede quitar)', async () => {
  const db = require('../db');
  const { resetData } = require('./helpers');
  resetData(db);
  const vid = db.addVehiculo('Kia', '1234BCD', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  const id = db.addPractica(aid, vid, '2026-09-01', 1000, 1030);
  db.addPractica(aid, vid, '2026-09-02', 1030, 1060);
  require('../db/core').load().practicas.find(p => p.id === id).tipo_detalle = 'km_auto';
  const datos = db.getDatosFichaDGT(aid, 'circulacion');
  expect(datos.practicas.map(p => p.km_calculados)).toEqual([true, false]);
  const { generarFichaDGT } = require('../fichas-dgt');
  const { PDFDocument } = require('pdf-lib');
  // La nota al pie es un trozo más de contenido en la página (el texto va comprimido)
  const trozos = async opc => {
    const bytes = await generarFichaDGT({ tipo: 'circulacion', centro: {}, alumno: datos.alumno, profesor: datos.profesor, director: datos.director, practicas: datos.practicas, ...opc });
    const pdf = await PDFDocument.load(bytes);
    const c = pdf.getPage(0).node.Contents();
    return c && typeof c.size === 'function' ? c.size() : 1;
  };
  const con = await trozos({});
  const sin = await trozos({ marcarCalculados: false });
  expect(con).toBeGreaterThan(sin);
  const sinCalculados = await generarFichaDGT({ tipo: 'circulacion', centro: {}, alumno: datos.alumno, profesor: datos.profesor, director: datos.director, practicas: datos.practicas.map(x => ({ ...x, km_calculados: false })) });
  const pdf2 = await PDFDocument.load(sinCalculados);
  const c2 = pdf2.getPage(0).node.Contents();
  expect(c2 && typeof c2.size === 'function' ? c2.size() : 1).toBe(sin);
  expect(PDFDocument).toBeDefined();
});
