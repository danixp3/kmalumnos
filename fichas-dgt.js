// fichas-dgt.js — Generación de la "Ficha alumno – formación práctica" oficial
// de la DGT (MOD 12/2016-01-ES) rellenando los CAMPOS DE FORMULARIO reales de
// los impresos oficiales (como si se rellenaran a mano), no texto superpuesto.
//
// Se usa desde el proceso principal (main.js) vía IPC. Reglas de negocio fijadas:
//   - Una fila por día: las clases del mismo día van juntas (db.getDatosFichaDGT).
//     "Ejercicio": "1 CLASE" si ese día hubo una; "2 CLASES" si hubo 2 o más
//     (máximo de clases/día que admite la DGT).
//   - Observaciones en blanco. Firmas: en cada fila, la del alumno (la que hizo
//     en el móvil al terminar la clase) en «Firma del alumno» y la guardada del
//     profesor que dio la clase en «Firma del profesor». Sin firma → en blanco.
//   - Pie (certificado): «Firma del Director» con la del director del centro y
//     «Firma del profesor» con la del profesor de la cabecera, salvo que se pida
//     dejarlo para firmar a mano (firmarPie: false).
//   - Página 1 lleva cabecera (escuela + alumno) + 11 clases; el resto de clases
//     van en tantas páginas de "continuación" (32 clases/pág) como haga falta.
//   - La casilla DESTREZA/CIRCULACIÓN se marca con una "X" (su estado /Yes_xxx no
//     se aplana de forma fiable con pdf-lib).
//
// Requiere las plantillas y el mapa nombre→casilla en assets/fichas/ (empaquetados
// vía build.files: "assets/**/*").

const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFDict, PDFCheckBox, StandardFonts, rgb } = require('pdf-lib');

const DIR = path.join(__dirname, 'assets', 'fichas');
const RUTA_PLANTILLA_1 = path.join(DIR, 'ficha_practicas_dgt.pdf');
const RUTA_PLANTILLA_CONT = path.join(DIR, 'ficha_practicas_dgt_cont.pdf');
const RUTA_MAPA = path.join(DIR, 'mapa-campos-fichas.json');

// rect del checkbox (yTop desde arriba, puntos PDF) para marcar la X como a mano
const CHECKBOX_RECT = {
  destreza:    { x: 127, yTop: 96, lado: 11 },
  circulacion: { x: 396, yTop: 97, lado: 11 },
};

// Columnas de firma de la página 1 (el impreso no trae campos ahí): medidas
// sobre la plantilla, en puntos desde arriba. `filas` = líneas horizontales de
// las 11 filas de clases (12 bordes).
const FIRMAS_P1 = {
  alumno: { x0: 454.5, x1: 516 },
  profesor: { x0: 516, x1: 577.25 },
  filas: [369, 388.4, 407.9, 427.4, 446.9, 466.4, 485.75, 505.25, 524.6, 544.1, 563.5, 583],
};
const MARGEN_FIRMA = 1.6;

// Pie de la página 1 (certificado): hueco entre los rótulos «Firma del
// Director» / «Firma del profesor» (acaban en y≈716,5, centrados en x≈91 y
// x≈440) y el texto de protección de datos (empieza en y≈749).
const FIRMAS_PIE = {
  director: { x0: 21, x1: 161, yTop: 718.5, yBot: 748 },
  profesor: { x0: 370, x1: 510, yTop: 718.5, yBot: 748 },
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

let _mapaCache = null;
function cargarMapa() {
  if (!_mapaCache) _mapaCache = JSON.parse(fs.readFileSync(RUTA_MAPA, 'utf8'));
  return _mapaCache;
}

function setText(form, name, value) {
  if (!name || value == null || value === '') return;
  try { form.getTextField(name).setText(String(value)); } catch (_) { /* campo ausente: ignorar */ }
}

// Imágenes de firma ya incrustadas en el documento de salida (una sesión de
// varias clases y el profesor repiten la misma imagen: se incrusta una vez).
function _cacheFirmas(doc) {
  const cache = new Map();
  return async (dataUrl) => {
    if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,/.test(dataUrl)) return null;
    if (!cache.has(dataUrl)) {
      let img = null;
      try { img = await doc.embedPng(Buffer.from(dataUrl.split(',')[1], 'base64')); } catch (_) { /* imagen dañada: casilla en blanco */ }
      cache.set(dataUrl, img);
    }
    return cache.get(dataUrl);
  };
}

// Dibuja la firma dentro de la casilla (x0..x1, yTop..yBot desde arriba),
// centrada y sin deformar.
function _dibujarFirma(page, img, caja) {
  if (!img || !caja) return;
  const H = page.getSize().height;
  const anchoMax = caja.x1 - caja.x0 - 2 * MARGEN_FIRMA;
  const altoMax = caja.yBot - caja.yTop - 2 * MARGEN_FIRMA;
  if (anchoMax <= 0 || altoMax <= 0) return;
  const k = Math.min(anchoMax / img.width, altoMax / img.height);
  const w = img.width * k, h = img.height * k;
  page.drawImage(img, {
    x: caja.x0 + (caja.x1 - caja.x0 - w) / 2,
    y: H - (caja.yTop + (caja.yBot - caja.yTop + h) / 2),
    width: w, height: h,
  });
}

// Firmas de las filas de una página (cajas = [{ alumno, profesor }] por fila).
async function _firmarFilas(page, filas, cajas, imagen) {
  for (let i = 0; i < filas.length && i < cajas.length; i++) {
    _dibujarFirma(page, await imagen(filas[i].firma_alumno), cajas[i].alumno);
    _dibujarFirma(page, await imagen(filas[i].firma_profesor), cajas[i].profesor);
  }
}

// form.flatten() de pdf-lib borra los campos pero deja sus referencias en la
// lista de anotaciones de la página: el PDF quedaba con cientos de referencias
// rotas (los visores lo toleran, pero avisan). Se quitan las que ya no existen.
function _limpiarAnotaciones(doc, page) {
  const annots = page.node.lookup(PDFName.of('Annots'));
  if (!annots || typeof annots.size !== 'function') return;
  for (let i = annots.size() - 1; i >= 0; i--) {
    if (!doc.context.lookup(annots.get(i))) annots.remove(i);
  }
  if (!annots.size()) page.node.delete(PDFName.of('Annots'));
}

// Las casillas DESTREZA/CIRCULACIÓN guardan su dibujo por estados (/Off y
// /Yes_xxx) y flatten() de pdf-lib las aplana mal (un XObject sin tipo que el
// visor rechaza). Se deja solo el dibujo de la casilla vacía: la X se pinta a mano.
function _casillasSinEstados(form) {
  for (const campo of form.getFields()) {
    if (!(campo instanceof PDFCheckBox)) continue;
    for (const w of campo.acroField.getWidgets()) {
      const ap = w.dict.lookup(PDFName.of('AP'));
      const n = ap instanceof PDFDict ? ap.lookup(PDFName.of('N')) : null;
      if (n instanceof PDFDict && n.get(PDFName.of('Off'))) ap.set(PDFName.of('N'), n.get(PDFName.of('Off')));
    }
  }
}

// Caja de un campo de formulario (desde arriba) — la página de continuación sí
// trae campos en las columnas de firma.
function _cajaCampo(form, nombre, H) {
  try {
    const r = form.getTextField(nombre).acroField.getWidgets()[0].getRectangle();
    return { x0: r.x, x1: r.x + r.width, yTop: H - r.y - r.height, yBot: H - r.y };
  } catch (_) { return null; }
}

async function _rellenarPagina1(out, mapa, datos, filas) {
  const bytes = fs.readFileSync(RUTA_PLANTILLA_1);
  const tpl = await PDFDocument.load(bytes);
  const form = tpl.getForm();
  const m = mapa.ficha1;
  const c = m.cabecera;
  const centro = datos.centro || {};
  const alumno = datos.alumno || {};
  const profesor = datos.profesor || {};

  // Datos de la escuela / sección
  setText(form, c.esc_numero, centro.numero);
  setText(form, c.esc_seccion, centro.seccion);
  setText(form, c.esc_digito, centro.digito_control);
  setText(form, c.esc_denominacion, centro.denominacion);
  setText(form, c.esc_direccion, centro.direccion);
  setText(form, c.esc_cp, centro.codigo_postal);
  setText(form, c.esc_poblacion, centro.poblacion);
  setText(form, c.esc_profesor, profesor.nombre);
  setText(form, c.esc_profesor_dni, profesor.dni);

  // Datos del alumno
  setText(form, c.al_dni, alumno.dni);
  setText(form, c.al_permiso, alumno.permiso);
  setText(form, c.al_nombre, alumno.nombre);
  setText(form, c.al_primer_apellido, alumno.primer_apellido);
  setText(form, c.al_segundo_apellido, alumno.segundo_apellido);
  setText(form, c.al_direccion, alumno.direccion);
  setText(form, c.al_cp, alumno.codigo_postal);
  setText(form, c.al_poblacion, alumno.poblacion);

  // Tabla de clases (hasta 11 en la página 1)
  m.filas.forEach((fila, i) => {
    const pr = filas[i];
    if (!pr) return;
    setText(form, fila.fecha, pr.fecha);
    setText(form, fila.hora, pr.hora);
    setText(form, fila.ejercicio, pr.ejercicio);
    setText(form, fila.km_inicial, pr.km_inicial);
    setText(form, fila.km_final, pr.km_final);
  });

  // Pie: "En <lugar>, a <día> de <mes> de <año>"
  setText(form, c.foot_lugar, datos.lugar || centro.poblacion);
  setText(form, c.foot_dia, datos.dia);
  setText(form, c.foot_mes, datos.mes);
  setText(form, c.foot_anio, datos.anio);

  _casillasSinEstados(form);
  form.flatten();
  _limpiarAnotaciones(tpl, tpl.getPage(0));

  // Marca de la casilla elegida (X), imitando el tick manual
  const tipo = datos.tipo === 'destreza' ? 'destreza' : 'circulacion';
  const r = CHECKBOX_RECT[tipo];
  const font = await tpl.embedFont(StandardFonts.Helvetica);
  const page0 = tpl.getPage(0);
  const H = page0.getSize().height;
  page0.drawText('X', { x: r.x + 1.5, y: H - (r.yTop + r.lado - 1), size: 11, font, color: rgb(0, 0, 0) });

  const cajas = FIRMAS_P1.filas.slice(0, -1).map((yTop, i) => ({
    alumno: { ...FIRMAS_P1.alumno, yTop, yBot: FIRMAS_P1.filas[i + 1] },
    profesor: { ...FIRMAS_P1.profesor, yTop, yBot: FIRMAS_P1.filas[i + 1] },
  }));
  const imagen = _cacheFirmas(tpl);
  await _firmarFilas(page0, filas, cajas, imagen);

  // Pie: firmas del director y del profesor que certifican la formación
  if (datos.firmarPie !== false) {
    _dibujarFirma(page0, await imagen((datos.director || {}).firma), FIRMAS_PIE.director);
    _dibujarFirma(page0, await imagen(profesor.firma), FIRMAS_PIE.profesor);
  }

  const [pg] = await out.copyPages(tpl, [0]);
  out.addPage(pg);
}

async function _rellenarContinuacion(out, mapa, filas) {
  const bytes = fs.readFileSync(RUTA_PLANTILLA_CONT);
  const tpl = await PDFDocument.load(bytes);
  const form = tpl.getForm();
  const page = tpl.getPage(0);
  const H = page.getSize().height;
  // Cajas de firma leídas antes de aplanar (después los campos desaparecen)
  const cajas = mapa.ficha2.filas.map(f => ({ alumno: _cajaCampo(form, f.firma_alumno, H), profesor: _cajaCampo(form, f.firma_profesor, H) }));
  mapa.ficha2.filas.forEach((fila, i) => {
    const pr = filas[i];
    if (!pr) return;
    setText(form, fila.fecha, pr.fecha);
    setText(form, fila.hora, pr.hora);
    setText(form, fila.ejercicio, pr.ejercicio);
    setText(form, fila.km_inicial, pr.km_inicial);
    setText(form, fila.km_final, pr.km_final);
  });
  form.flatten();
  _limpiarAnotaciones(tpl, page);
  await _firmarFilas(page, filas, cajas, _cacheFirmas(tpl));
  const [pg] = await out.copyPages(tpl, [0]);
  out.addPage(pg);
}

/**
 * Genera el PDF de la ficha DGT. Devuelve un Uint8Array con el PDF.
 * datos = {
 *   tipo: 'destreza' | 'circulacion',
 *   centro: { numero, seccion, digito_control, denominacion, direccion, codigo_postal, poblacion },
 *   alumno: { dni, permiso, nombre, primer_apellido, segundo_apellido, direccion, codigo_postal, poblacion },
 *   profesor: { nombre, dni, firma? },          // cabecera; su firma va también en el pie
 *   director?: { firma? },                       // «Firma del Director» del pie
 *   firmarPie?: boolean,         // false = pie sin firmas (para firmarlo a mano); por defecto true
 *   practicas: [ { fecha, hora, km_inicial, km_final, clases, ejercicio, firma_alumno?, firma_profesor? } ],  // una fila por día; firmas = PNG en data URL
 *   rellenarFecha?: boolean,    // preferencia Ajustes; false = fecha del documento (pie) en blanco (por defecto true)
 *   lugar?, dia?, mes?, anio?   // pie; por defecto la fecha de hoy y la población del centro
 * }
 */
async function generarFichaDGT(datos) {
  const mapa = cargarMapa();
  const hoy = new Date();
  // rellenarFecha (preferencia de Ajustes, por defecto true): si es false, la
  // FECHA DEL DOCUMENTO (pie "a __ de __ de __") se deja en blanco para
  // rellenarla a mano. NO afecta a la columna "Fecha" de cada clase.
  const rellenarFecha = datos.rellenarFecha !== false;
  const d = {
    ...datos,
    dia: rellenarFecha ? (datos.dia || String(hoy.getDate())) : '',
    mes: rellenarFecha ? (datos.mes || MESES[hoy.getMonth()]) : '',
    anio: rellenarFecha ? (datos.anio || String(hoy.getFullYear())) : '',
  };
  // "Ejercicio": lo calcula getDatosFichaDGT por día ("1 CLASE" / "2 CLASES")
  const practicas = (datos.practicas || []).map(p => ({
    fecha: p.fecha, hora: p.hora, ejercicio: p.ejercicio || (p.clases === 1 ? '1 CLASE' : '2 CLASES'),
    km_inicial: p.km_inicial, km_final: p.km_final,
    firma_alumno: p.firma_alumno || null, firma_profesor: p.firma_profesor || null,
  }));

  const out = await PDFDocument.create();
  const nPag1 = mapa.ficha1.filas.length;      // 11
  const porCont = mapa.ficha2.filas.length;    // 32

  await _rellenarPagina1(out, mapa, d, practicas.slice(0, nPag1));
  let idx = nPag1;
  while (idx < practicas.length) {
    await _rellenarContinuacion(out, mapa, practicas.slice(idx, idx + porCont));
    idx += porCont;
  }

  // useObjectStreams:false → xref clásico, máxima compatibilidad con visores/impresoras
  return out.save({ useObjectStreams: false });
}

module.exports = { generarFichaDGT };
