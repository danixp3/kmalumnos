/**
 * db/lector-tablas.js  –  lee una tabla de cualquier archivo que saque otro
 * programa de gestión (o de un texto pegado) y la devuelve como filas de
 * texto, sin interpretar nada todavía (eso lo hace db/migracion.js).
 *
 *  - Excel (.xlsx, .xlsm, .xls), LibreOffice (.ods), dBase/FoxPro (.dbf),
 *    tablas HTML guardadas como .xls/.html y similares: con SheetJS.
 *  - CSV/TXT: lector propio, para acertar con la codificación (UTF-8 o la de
 *    Windows, en la que salen rotos los acentos y las eñes) y el separador
 *    (; , tabulador o |), con comillas y saltos de línea dentro de comillas.
 *  - Texto pegado (copiado de Excel o de la lista del otro programa): igual.
 *
 * Las fechas de Excel salen como AAAA-MM-DD (sin zona horaria) y los números
 * sin notación científica, para que los DNI y teléfonos no se estropeen.
 */

const fs = require('fs');
const path = require('path');

const MAX_FILAS = 50000;
const MAX_COLUMNAS = 80;
const EXT_TEXTO = ['.csv', '.txt', '.tsv', '.tab', '.prn'];
const EXT_HOJA = ['.xlsx', '.xlsm', '.xlsb', '.xls', '.ods', '.fods', '.dbf', '.htm', '.html', '.xml', '.sylk', '.slk', '.dif', '.numbers'];

let _xlsx = null;
function xlsx() {
  if (!_xlsx) {
    _xlsx = require('xlsx');
    // Tablas de codificación para .dbf y .xls antiguos (acentos de Windows/DOS)
    try { _xlsx.set_cptable(require('xlsx/dist/cpexcel.js')); } catch (e) { /* sin ellas, solo UTF-8/latin1 */ }
  }
  return _xlsx;
}

const pad = n => String(n).padStart(2, '0');
const limpiarCelda = v => String(v == null ? '' : v).replace(/ /g, ' ').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

// ─── Texto: codificación ────────────────────────────────────────────────────
function decodificar(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.slice(3).toString('utf8');
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf.slice(2));
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf.slice(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { /* no es UTF-8 */ }
  try { return new TextDecoder('windows-1252').decode(buf); } catch (e) { return buf.toString('latin1'); }
}

// ─── Texto: separador y troceado (comillas al estilo CSV) ──────────────────
function elegirSeparador(texto) {
  const lineas = texto.split(/\r?\n/).filter(l => l.trim()).slice(0, 30);
  if (!lineas.length) return ',';
  let mejor = null;
  for (const sep of ['\t', ';', ',', '|']) {
    const cuentas = lineas.map(l => l.split(sep).length - 1);
    const frec = new Map();
    for (const c of cuentas) if (c > 0) frec.set(c, (frec.get(c) || 0) + 1);
    if (!frec.size) continue;
    const [moda, veces] = [...frec.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const punt = veces * 10 + Math.min(moda, 9);
    if (!mejor || punt > mejor.punt) mejor = { sep, punt };
  }
  return mejor ? mejor.sep : ',';
}

function trocearTexto(texto, sep) {
  const filas = [];
  let fila = [], celda = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false;
      } else celda += ch;
    } else if (ch === '"' && celda.trim() === '') { comillas = true; celda = ''; }
    else if (ch === sep) { fila.push(celda); celda = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
      if (filas.length > MAX_FILAS) break;
    } else celda += ch;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

// Quita filas vacías (guardando su nº real) y recorta columnas vacías al final.
function compactar(filas) {
  const out = [], numFila = [];
  let ancho = 0;
  filas.forEach((f, i) => {
    const celdas = f.slice(0, MAX_COLUMNAS).map(limpiarCelda);
    if (!celdas.some(Boolean)) return;
    let fin = celdas.length; while (fin > 0 && !celdas[fin - 1]) fin--;
    ancho = Math.max(ancho, fin);
    out.push(celdas.slice(0, fin)); numFila.push(i + 1);
  });
  return { filas: out.slice(0, MAX_FILAS).map(f => f.concat(Array(Math.max(0, ancho - f.length)).fill(''))), numFila: numFila.slice(0, MAX_FILAS), columnas: ancho };
}

/** Texto pegado o de un CSV/TXT → { filas, numFila, columnas, separador } */
function leerTextoTabla(texto) {
  const t = String(texto == null ? '' : texto).replace(/^﻿/, '');
  const sep = elegirSeparador(t);
  return { ...compactar(trocearTexto(t, sep)), separador: sep };
}

// ─── Hojas de cálculo y bases de datos (SheetJS) ────────────────────────────
function textoCelda(X, c) {
  if (!c || c.v == null) return '';
  if (c.t === 'd' && c.v instanceof Date) return `${c.v.getFullYear()}-${pad(c.v.getMonth() + 1)}-${pad(c.v.getDate())}`;
  if (c.t === 'n') {
    if (c.z && X.SSF.is_date(c.z)) {
      const p = X.SSF.parse_date_code(c.v);
      if (p) {
        const hora = `${pad(p.H)}:${pad(p.M)}`;
        if (c.v < 1) return hora; // celda solo con hora
        const fecha = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
        return c.v % 1 > 1e-6 && /h/i.test(c.z) ? `${fecha} ${hora}` : fecha;
      }
    }
    if (Number.isInteger(c.v)) return BigInt(c.v).toString();
    return String(Math.round(c.v * 1e6) / 1e6);
  }
  if (c.t === 'b') return c.v ? 'Sí' : 'No';
  if (c.t === 'e') return '';
  return String(c.v);
}

function hojasDeLibro(X, libro) {
  const hojas = [];
  for (const nombre of libro.SheetNames) {
    const ws = libro.Sheets[nombre];
    if (!ws || !ws['!ref']) continue;
    const r = X.utils.decode_range(ws['!ref']);
    const filas = [];
    for (let f = r.s.r; f <= Math.min(r.e.r, r.s.r + MAX_FILAS); f++) {
      const fila = [];
      for (let c = r.s.c; c <= Math.min(r.e.c, r.s.c + MAX_COLUMNAS - 1); c++) fila.push(textoCelda(X, ws[X.utils.encode_cell({ r: f, c })]));
      filas.push(fila);
    }
    const t = compactar(filas);
    if (t.filas.length) hojas.push({ nombre, ...t });
  }
  return hojas;
}

/**
 * Lee un archivo. Devuelve { ok, archivo, hojas: [{ nombre, filas, numFila, columnas }] }
 * o { ok: false, error } con un mensaje para el usuario.
 */
function leerArchivoTabla(ruta) {
  const archivo = path.basename(String(ruta || ''));
  const ext = path.extname(archivo).toLowerCase();
  let buf;
  try { buf = fs.readFileSync(ruta); } catch (e) { return { ok: false, error: `No se pudo abrir «${archivo}»: ${e.message}` }; }
  if (!buf.length) return { ok: false, error: `«${archivo}» está vacío.` };
  if (['.mdb', '.accdb'].includes(ext)) {
    return { ok: false, error: 'Es una base de datos de Access: ábrela con Access (o pide a tu programa un «Exportar a Excel») y guarda la tabla de alumnos como Excel o CSV.' };
  }
  if (ext === '.pdf') return { ok: false, error: 'Un PDF no sirve para importar: es un listado para imprimir. Busca en tu programa «Exportar» a Excel o CSV, o copia la tabla desde la pantalla y pégala aquí.' };
  try {
    // ¿Texto? (CSV/TXT, o un .xls que en realidad es texto separado por tabuladores)
    const pareceTexto = EXT_TEXTO.includes(ext) || (!EXT_HOJA.includes(ext) && !buf.slice(0, 2000).includes(0));
    if (pareceTexto) {
      const t = leerTextoTabla(decodificar(buf));
      return t.filas.length ? { ok: true, archivo, hojas: [{ nombre: archivo, ...t }] } : { ok: false, error: `No se ha encontrado ninguna tabla en «${archivo}».` };
    }
    const X = xlsx();
    const libro = X.read(buf, { type: 'buffer', cellNF: true, cellDates: false, cellHTML: false, cellFormula: false, sheetStubs: false });
    const hojas = hojasDeLibro(X, libro);
    if (!hojas.length) return { ok: false, error: `No se ha encontrado ninguna tabla en «${archivo}».` };
    return { ok: true, archivo, hojas };
  } catch (e) {
    return { ok: false, error: `No se pudo leer «${archivo}» (${e.message}). Prueba a abrirlo en Excel y guardarlo como .xlsx o .csv.` };
  }
}

module.exports = { leerArchivoTabla, leerTextoTabla, decodificar, elegirSeparador, MAX_FILAS };
