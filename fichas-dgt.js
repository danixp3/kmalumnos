// fichas-dgt.js — Generación de la "Ficha alumno – formación práctica" oficial
// de la DGT (MOD 12/2016-01-ES) rellenando los CAMPOS DE FORMULARIO reales de
// los impresos oficiales (como si se rellenaran a mano), no texto superpuesto.
//
// Se usa desde el proceso principal (main.js) vía IPC. Reglas de negocio fijadas:
//   - "Ejercicio" siempre "2 CLASES" (máximo de clases/sesión que admite la DGT).
//   - Observaciones y firmas se dejan en blanco.
//   - Página 1 lleva cabecera (escuela + alumno) + 11 clases; el resto de clases
//     van en tantas páginas de "continuación" (32 clases/pág) como haga falta.
//   - La casilla DESTREZA/CIRCULACIÓN se marca con una "X" (su estado /Yes_xxx no
//     se aplana de forma fiable con pdf-lib).
//
// Requiere las plantillas y el mapa nombre→casilla en assets/fichas/ (empaquetados
// vía build.files: "assets/**/*").

const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const DIR = path.join(__dirname, 'assets', 'fichas');
const RUTA_PLANTILLA_1 = path.join(DIR, 'ficha_practicas_dgt.pdf');
const RUTA_PLANTILLA_CONT = path.join(DIR, 'ficha_practicas_dgt_cont.pdf');
const RUTA_MAPA = path.join(DIR, 'mapa-campos-fichas.json');

// rect del checkbox (yTop desde arriba, puntos PDF) para marcar la X como a mano
const CHECKBOX_RECT = {
  destreza:    { x: 127, yTop: 96, lado: 11 },
  circulacion: { x: 396, yTop: 97, lado: 11 },
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

  form.flatten();

  // Marca de la casilla elegida (X), imitando el tick manual
  const tipo = datos.tipo === 'destreza' ? 'destreza' : 'circulacion';
  const r = CHECKBOX_RECT[tipo];
  const font = await tpl.embedFont(StandardFonts.Helvetica);
  const page0 = tpl.getPage(0);
  const H = page0.getSize().height;
  page0.drawText('X', { x: r.x + 1.5, y: H - (r.yTop + r.lado - 1), size: 11, font, color: rgb(0, 0, 0) });

  const [pg] = await out.copyPages(tpl, [0]);
  out.addPage(pg);
}

async function _rellenarContinuacion(out, mapa, filas) {
  const bytes = fs.readFileSync(RUTA_PLANTILLA_CONT);
  const tpl = await PDFDocument.load(bytes);
  const form = tpl.getForm();
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
  const [pg] = await out.copyPages(tpl, [0]);
  out.addPage(pg);
}

/**
 * Genera el PDF de la ficha DGT. Devuelve un Uint8Array con el PDF.
 * datos = {
 *   tipo: 'destreza' | 'circulacion',
 *   centro: { numero, seccion, digito_control, denominacion, direccion, codigo_postal, poblacion },
 *   alumno: { dni, permiso, nombre, primer_apellido, segundo_apellido, direccion, codigo_postal, poblacion },
 *   profesor: { nombre, dni },
 *   practicas: [ { fecha, hora, km_inicial, km_final } ],  // ya ordenadas y formateadas
 *   lugar?, dia?, mes?, anio?   // pie; por defecto la fecha de hoy y la población del centro
 * }
 */
async function generarFichaDGT(datos) {
  const mapa = cargarMapa();
  const hoy = new Date();
  const d = {
    ...datos,
    dia: datos.dia || String(hoy.getDate()),
    mes: datos.mes || MESES[hoy.getMonth()],
    anio: datos.anio || String(hoy.getFullYear()),
  };
  // "Ejercicio" siempre "2 CLASES" (máximo de clases/sesión que admite la DGT)
  const practicas = (datos.practicas || []).map(p => ({
    fecha: p.fecha, hora: p.hora, ejercicio: '2 CLASES',
    km_inicial: p.km_inicial, km_final: p.km_final,
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
