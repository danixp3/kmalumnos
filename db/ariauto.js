/**
 * db/ariauto.js  –  traer los datos de Ariauto (programa de gestión de
 * autoescuelas que guarda todo en una base de datos Access .accdb/.mdb).
 *
 * Qué hay en Ariauto (investigado con la base real de una autoescuela):
 *  - ALUMNOS (clave = SECCION + «Nº ALUMNO»): datos personales completos, DNI
 *    con la letra aparte, domicilio en trozos, permiso y profesor por código,
 *    estado en «motivo_archivado» (BAJA, APTO, INACTIVO…) y «FECHA APROBADO».
 *  - GASTOS E INGRESOS: la cuenta de cada alumno hasta hoy. TIPOAPUNTE 3 =
 *    cargo (EURODEBE; las clases se cargan en bloque: «14-CLASES PRÁCTICAS»),
 *    TIPOAPUNTE 1 = pago (EUROHABER).
 *  - PRACTICAS: clases con fecha, pero sin km ni hora y solo hasta 2012.
 *  - FECHA DE EXAMEN (tipo 1/2/3/6 teórico, 4 pista, 5 circulación; resultado
 *    1 apto, 2 no apto, 3 aplazado, 4 no presentado; examinador, coche y
 *    fallos codificados, que se traducen con Errores_Examen_Circulacion/Pista),
 *    Tasas_Alumnos, PROFESORES, VEHICULOS (ITV, seguro), PERMISOS (código →
 *    letras), EXAMINADORES, DATOS DE AUTOESCUELA y DATOS DEL TITULAR (centro).
 *
 * Cómo entra en la app (vista previa → importar → deshacer, como el resto de
 * «Traer de otro programa», ver db/migracion.js):
 *  - Alumnos en curso (por defecto) o también los terminados; por secciones.
 *    Los antiguos sin actividad que Ariauto no archivó entran como «inactivo».
 *  - Cada dato en su campo (nº de registro, sexo, nacionalidad, provincia,
 *    tutor, centro médico, facturar a…: db/campos-extra.js); en las
 *    observaciones solo las observaciones de Ariauto.
 *  - Sus clases ya hechas = las cobradas en Ariauto (o las de PRACTICAS si
 *    son más): «clases ya hechas» de la app, no se vuelven a cobrar.
 *  - Cobros y pagos solo si se pide (en Ariauto casi no se apuntan).
 *  - Exámenes (con examinador, coche y fallos), tasas, caducidad del DNI, ITV
 *    y seguro de los coches, profesores con sus datos y los datos del centro.
 *  - Alumno que ya está en la app (por su nº de Ariauto, DNI o nombre): se
 *    completa lo que tenga vacío. Los traídos con la versión 1.25 además
 *    pierden el bloque «Datos de Ariauto: …» de las observaciones (cada dato
 *    pasa a su campo) y corrigen el estado (antiguos → inactivo).
 *
 * leerAccess (Electron: lee el archivo, async porque mdb-reader es ESM) y
 * planAriauto/aplicarAriauto (síncronos, probados con tablas sintéticas).
 */

const fs = require('fs');
const path = require('path');
const { load, save, nextId, _sync, addLog, crearBackup, hoyLocalISO, clasesDePractica } = require('./core');
const mig = require('./migracion');
const { normTexto, claveNombre, capitalizarNombre, limpiarDni, limpiarTelefono, limpiarEmail, limpiarCP } = mig._norm;
const { nombreDe, limpiarMatricula, registrarImportacion, buscadorParecidos } = mig._interno;
const { CAMPOS_EXTRA, extraerCamposExtra, camposExtraVacios } = require('./campos-extra');
const { sugerirCocheProfesor } = require('./profesores');

const NOTA_ARIAUTO = 'Importado de Ariauto';
const MAX_PREVIA = 400;
// Clases traídas con su fecha: como las anotadas en Puesta en marcha
// (db/clases-anteriores.js), sin km. Un apunte de más de 4 clases es un bono
// cobrado de una vez: no dice qué días fueron y cuenta como «clases ya hechas».
const MARCA_ANTERIOR = 'anterior';
const NOTA_CLASE = 'Ariauto';
const MAX_CLASES_APUNTE = 4;
const MAX_CLASES_DIA = 6;

// Columnas que se leen de cada tabla (el resto no se usa: la base pesa decenas de MB)
const COLUMNAS = {
  'ALUMNOS': ['Nº ALUMNO', 'SECCION', 'NOMBREALUMNO', 'PRIMER APELLIDO', 'SEGUNDO APELLIDO', 'DOMICILIO DEL ALUMNO', 'Nº', 'PISO', 'LETRA',
    'Tipo_de_Via', 'Bloque', 'Portal', 'MUNICIPIO DEL ALUMNO', 'PUEBL0 DEL ALUMNO', 'nombre_nuevo_municipio_alm', 'C-P DEL ALUMNO', 'PROVINCIA DEL ALUMNO',
    'TELEFONO', 'TELEFONO2', 'DNI DEL ALUMNO', 'NIF DEL ALUMNO', 'CADUCA DNI', 'SEXO', 'FECHA NACIMIENTO', 'FECHA DE INGRESO', 'FECHA DE ALTA',
    'FECHA APROBADO', 'POSEE PERMISO', 'POSEE PERMISO2', 'POSEE PERMISO3', 'POSEE PERMISO4', 'PROFESOR', 'PERMISO', 'PERMISO2', 'OBSERVACIONES',
    'LUGAR DE NACIMIENTO', 'Nacionalidad', 'NOMBRE_PAIS', 'ID_PAIS', 'email_al', 'Nombre_tutor', 'Apellido1_tutor', 'Apellido2_tutor', 'DNI_tutor', 'NIF_tutor',
    'motivo_archivado', 'Teorico_Apto', 'Fecha_teorico_apto', 'CENTRO MEDICO', 'LENTES', 'CONDICIONES RESTRICTIVAS', 'VALIDEZ LIMITADA',
    'Nº DE SOLICITUD', 'CONVOCATORIA', 'Facturaempresa', 'Factura_nombre', 'Factura_domicilio', 'Factura_poblacion', 'Factura_cp', 'Factura_provincia',
    'Factura_cif', 'Nombre_padre', 'Nombre_madre'],
  'PERMISOS': ['NUMERO PERMISO', 'NOMBRE PERMISO'],
  'PROFESORES': ['NUMERO PROFESOR', 'NOMBRE', 'PRIMER APELLIDO PRF', 'SEGUNDO APELLIDO PRF', 'DNI', 'FECHA DE BAJA', 'FECHA DE ALTA', 'FECHA DE NACIMIENTO',
    'NUMERO DE CERTIFICADO', 'f_expedicion_certificado', 'DOMICILIO', 'CODIGO POSTAL', 'POBLACION', 'TELEFONO', 'email_prof'],
  'VEHICULOS': ['NUMERO DE VEHICULO', 'MATRICULA', 'MARCA', 'MODELO', 'FECHA DE ALTA', 'FECHA DE BAJA', 'ULTIMA INSPECCION', 'PROXIMA REVISION',
    'VENCIMIENTO DEL SEGURO', 'NOMBRE CIA DE SEGURO', 'NUMERO DE POLIZA', 'OBSERVACIONES'],
  'GASTOS E INGRESOS': ['APUNTE', 'Nº ALUMNO', 'SECCION IOG', 'FECHA', 'CONCEPTO', 'CANTIDAD', 'EURODEBE', 'EUROHABER', 'TIPOAPUNTE'],
  'PRACTICAS': ['Nº ALUMNO', 'SECCIONPRAC', 'FECHA', 'CANTIDAD'],
  'FECHA DE EXAMEN': ['IDENTIFICADOR', 'F EXAMEN', 'Nº ALUMNO', 'SECCIONEX', 'TIPO DE EXAMEN', 'RESULTADO DE EXAMEN', 'PROFESOR', 'PERMISO EXAMEN', 'CONVOCATORIA',
    'FALLOS', 'FALLOS_PRACTICO', 'EXAMINADOR', 'VEHICULO', 'Nº DE SOLICITUD'],
  'EXAMINADORES': ['Nº EXAMINADOR', 'NOMBRE EXAMINADOR', 'PRIMER APELLIDO EXAM', 'SEGUNDO APELLIDO EXAM'],
  'Errores_Examen_Circulacion': ['Id_error', 'Mensaje_Error'],
  'Errores_Examen_Pista': ['Permiso', 'Letra', 'Mensaje'],
  'Tasas_Alumnos': ['IdTasa', 'TipoTasa', 'FechaCompra', 'Importe', 'Nº ALUMNO', 'SECCION', 'F EXAMEN'],
  'DATOS DE AUTOESCUELA': ['SECCION', 'NUMERO DE AUTOESCUELA', 'NOMBRE DE SECCION', 'DIGITO DE SECCION', 'SECCION POR DEFECTO', 'SECCION TRAFICO',
    'DIRECCION DELA AUTOESCUELA', 'CODIGO POSTAL DE LA AUTOESCUELA', 'POBLACION DE LA AUTOESCUELA', 'PROVINCIA DE LA AUTOESCUELA', 'TELEFONOAUTOESCUELA',
    'encabezado1', 'CENTRO DE EXAMEN', 'email_sec'],
  'DATOS DEL TITULAR': ['TITULAR', 'DNI TITULAR', 'JEFATURA', 'CIF AUTOESCUELA', 'NOMBRESOCIEDAD', 'EMAIL_AUTOESCUELA']
};
const TABLAS_CLAVE = ['ALUMNOS', 'GASTOS E INGRESOS', 'DATOS DE AUTOESCUELA'];

const pad = n => String(n).padStart(2, '0');
const txt = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
// Access guarda las fechas sin hora: mdb-reader las da a las 00:00 UTC
const fechaDe = v => (v instanceof Date && !isNaN(v) ? `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}` : null);
const num = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const euros = v => Math.round(num(v) * 100) / 100;
const clave = (seccion, n) => `${seccion}|${txt(n)}`;
const vacio = v => v == null || v === '' || (Array.isArray(v) && !v.length);
const cuarto = n => Math.round(n * 4) / 4;

// Clases de Ariauto (apuntes { fecha, n }) → con fecha, una o varias por día,
// o sin fecha (bonos). hasta: solo las de antes de ese día (las demás ya están
// en la app: el alumno las tiene anotadas). Un bono cobrado en los 60 días de
// antes de su primera clase en la app puede ser el de esas mismas clases: no
// se suma (bonoDudoso). { conFecha:[{fecha,n}], sinFecha, omitidas, bonoDudoso, total }
const DIAS_BONO_DUDOSO = 60;
function repartirClases(entradas, hasta = null) {
  const porDia = new Map();
  let sinFecha = 0, omitidas = 0, bonoDudoso = 0;
  const desdeDudoso = hasta ? restarDias(hasta, DIAS_BONO_DUDOSO) : null;
  for (const e of entradas || []) {
    const n = cuarto(e.n);
    if (!(n > 0)) continue;
    if (hasta && e.fecha && e.fecha >= hasta) { omitidas += n; continue; }
    const bono = n > MAX_CLASES_APUNTE || !e.fecha;
    if (bono && hasta && (!e.fecha || e.fecha >= desdeDudoso)) { omitidas += n; bonoDudoso += n; continue; }
    if (bono) { sinFecha += n; continue; }
    porDia.set(e.fecha, (porDia.get(e.fecha) || 0) + n);
  }
  const conFecha = [];
  for (const [fecha, n] of [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dia = Math.min(n, MAX_CLASES_DIA);
    sinFecha += n - dia;
    conFecha.push({ fecha, n: dia });
  }
  const conFechaN = conFecha.reduce((s, x) => s + x.n, 0);
  return { conFecha, sinFecha: cuarto(sinFecha), omitidas: cuarto(omitidas), bonoDudoso: cuarto(bonoDudoso), total: cuarto(conFechaN + sinFecha) };
}
// 2,5 clases → [1, 1, 0.5] (lo que vale cada práctica: entera o ¼ ½ ¾)
function trocearClases(n) {
  const out = [];
  let resto = cuarto(n);
  while (resto >= 1) { out.push(1); resto = cuarto(resto - 1); }
  if (resto > 0) out.push(resto);
  return out;
}
function restarDias(iso, dias) {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d - dias));
  return `${f.getUTCFullYear()}-${pad(f.getUTCMonth() + 1)}-${pad(f.getUTCDate())}`;
}
function restarMeses(iso, meses) {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1 - meses, d));
  return `${f.getUTCFullYear()}-${pad(f.getUTCMonth() + 1)}-${pad(f.getUTCDate())}`;
}

// ─── LECTURA ────────────────────────────────────────────────────────────────

function esAriauto(nombresTablas) {
  const n = new Set(nombresTablas);
  return TABLAS_CLAVE.every(t => n.has(t));
}

function filaPlana(fila) {
  const o = {};
  for (const [k, v] of Object.entries(fila)) o[k] = v instanceof Date ? fechaDe(v) : (Buffer.isBuffer(v) ? null : v);
  return o;
}

/**
 * Lee una base de Access. Si es de Ariauto devuelve { ok, ariauto: true,
 * archivo, tablas } (solo las columnas que se usan); si no, { ok, ariauto:
 * false, archivo, hojas } con cada tabla como una hoja para el asistente.
 */
async function leerAccess(ruta) {
  const archivo = path.basename(String(ruta || ''));
  let MDBReader;
  try { ({ default: MDBReader } = await import('mdb-reader')); } catch (e) { return { ok: false, error: 'No se pudo cargar el lector de Access: ' + e.message }; }
  let r;
  try { r = new MDBReader(fs.readFileSync(ruta)); } catch (e) {
    return { ok: false, error: /password|encrypt/i.test(e.message) ? `«${archivo}» tiene contraseña: quítasela en Access o exporta las tablas a Excel.` : `No se pudo leer «${archivo}»: ${e.message}` };
  }
  const nombres = r.getTableNames();
  if (esAriauto(nombres)) {
    const tablas = {};
    for (const [t, cols] of Object.entries(COLUMNAS)) {
      if (!nombres.includes(t)) { tablas[t] = []; continue; }
      const tab = r.getTable(t);
      const existen = new Set(tab.getColumnNames());
      tablas[t] = tab.getData({ columns: cols.filter(c => existen.has(c)) }).map(filaPlana);
    }
    return { ok: true, ariauto: true, archivo, tablas };
  }
  // Access de otro programa: cada tabla, como una hoja más (las 40 más grandes)
  const { MAX_FILAS } = require('./lector-tablas');
  const hojas = [];
  const conFilas = nombres.map(n => ({ n, t: r.getTable(n) })).filter(x => x.t.rowCount > 0)
    .sort((a, b) => b.t.rowCount - a.t.rowCount).slice(0, 40);
  for (const { n, t } of conFilas) {
    const cols = t.getColumnNames().slice(0, 80);
    const datos = t.getData({ columns: cols, rowLimit: MAX_FILAS });
    const filas = [cols, ...datos.map(f => cols.map(c => { const v = f[c]; return v == null ? '' : v instanceof Date ? fechaDe(v) : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : Buffer.isBuffer(v) ? '' : String(v); }))];
    hojas.push({ nombre: n, filas, numFila: filas.map((_, i) => i + 1), columnas: cols.length });
  }
  if (!hojas.length) return { ok: false, error: `No se ha encontrado ninguna tabla con datos en «${archivo}».` };
  return { ok: true, ariauto: false, archivo, hojas };
}

// ─── ANÁLISIS ───────────────────────────────────────────────────────────────

const ESTADO_ARCHIVO = { BAJA: 'baja', INACTIVO: 'inactivo', INACTIVA: 'inactivo', 'NO ACTIVO': 'inactivo', 'NO ACTIVA': 'inactivo', APTO: 'apto' };
// Lo que puso la versión 1.25 (antes de existir «inactivo»): para saber si un
// alumno ya traído conserva el estado de la importación o lo cambió alguien.
const ESTADO_ARCHIVO_V125 = { BAJA: 'baja', INACTIVO: 'baja', INACTIVA: 'baja', 'NO ACTIVO': 'baja', 'NO ACTIVA': 'baja', APTO: 'apto' };
const TIPO_EXAMEN = { 1: 'teorico', 2: 'teorico', 3: 'teorico', 6: 'teorico', 4: 'maniobras', 5: 'circulacion' };
const RESULTADO_EXAMEN = { 1: 'apto', 2: 'no_apto', 3: 'aplazado', 4: 'no_presentado' };
const PERMISO_APP = { EC: 'CE', ED: 'DE', MER: 'CAP', VIA: 'CAP', LVA: 'B' };
const RE_CLASE = /CLASE|PR[AÁ]CTIC/i;
const RE_NO_CLASE = /TE[OÓ]RIC|EX[AÁ]MEN|PRUEBA|CURSO|TASA|MATR[IÍ]CULA|RENOVACI|DERECHOS|ABONO/i;
const esSeccionCurso = nombre => /\bCAP\b|M\.?\s?P\.?\s?0?\d|MERCANC/i.test(nombre || '');
// Bloque que la versión 1.25 dejaba en las observaciones
const RE_BLOQUE_V125 = /(^|\n)Datos de Ariauto: [^\n]*/;
const RE_CLAVE_V125 = /Datos de Ariauto: Nº (\S+) \(sección ([^)]*)\)/;

// Nacionalidad escrita a mano («ESPAÑOLA», «VENEZOLANO»…) → país
const PAISES = [
  [/^ESPA[ÑN]/, 'España'], [/^VENEZ/, 'Venezuela'], [/^PORTUG/, 'Portugal'], [/^RUMAN/, 'Rumanía'], [/^MARR(OQU|UEC)/, 'Marruecos'],
  [/^COLOMB/, 'Colombia'], [/^CUBA/, 'Cuba'], [/^PERU|^PERÚ/, 'Perú'], [/^ARGENT/, 'Argentina'], [/^BRASIL/, 'Brasil'], [/^FRANC/, 'Francia'],
  [/^SUIZ/, 'Suiza'], [/^ALEM/, 'Alemania'], [/^BRIT|^INGL|^REINO UNIDO/, 'Reino Unido'], [/^DOMINIC/, 'República Dominicana'],
  [/^ECUAT|^ECUADOR/, 'Ecuador'], [/^BOLIV/, 'Bolivia'], [/^URUGU/, 'Uruguay'], [/^PARAGU/, 'Paraguay'], [/^CHIN/, 'China'], [/^UCRAN/, 'Ucrania'],
  [/^B[UÚ]LGAR/, 'Bulgaria'], [/^ITALI/, 'Italia'], [/^SENEGAL/, 'Senegal'], [/^ARGEL/, 'Argelia'], [/^PAKIST/, 'Pakistán'], [/^MEXIC|^MÉXIC/, 'México'],
  [/^HONDUR/, 'Honduras'], [/^NICARAG/, 'Nicaragua'], [/^CHILE/, 'Chile'], [/^RUS/, 'Rusia'], [/^POLA|^POLON/, 'Polonia'], [/^BELG/, 'Bélgica'],
  [/^HOLAND|^PA[IÍ]SES BAJOS/, 'Países Bajos'], [/^ANDORR/, 'Andorra'], [/^GUINE/, 'Guinea'], [/^NIGERI/, 'Nigeria'], [/^GEORGIA/, 'Georgia']
];
function paisDe(v) {
  const t = txt(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Ñ/g, 'N');
  if (!t) return null;
  const tN = txt(v).toUpperCase();
  for (const [re, nombre] of PAISES) if (re.test(tN) || re.test(t)) return nombre;
  return capitalizarNombre(txt(v));
}

function tipoCargo(concepto, importe) {
  if (importe < 0) return 'descuento';
  if (/MATR[IÍ]CULA/i.test(concepto)) return 'matricula';
  if (/TASA|DERECHOS DE EX/i.test(concepto)) return 'tasa';
  return 'cargo';
}
function formaPago(concepto) {
  if (/BIZUM/i.test(concepto)) return 'bizum';
  if (/TARJETA|TPV|DATAF/i.test(concepto)) return 'tarjeta';
  if (/TRANSF|BANCO|INGRESO EN CUENTA/i.test(concepto)) return 'transferencia';
  if (/EFECTIVO|MET[AÁ]LICO|CONTADO/i.test(concepto)) return 'efectivo';
  return null;
}
const titulo = s => capitalizarNombre(txt(s));

function agrupar(filas, campoSeccion, campoNum = 'Nº ALUMNO') {
  const m = new Map();
  for (const f of filas || []) {
    const k = clave(f[campoSeccion], f[campoNum]);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  }
  return m;
}

function secciones(tablas) {
  const al = tablas['ALUMNOS'] || [];
  const datos = tablas['DATOS DE AUTOESCUELA'] || [];
  const n = new Map();
  for (const a of al) n.set(a.SECCION, (n.get(a.SECCION) || 0) + 1);
  return [...n.entries()].sort((a, b) => a[0] - b[0]).map(([s, total]) => {
    const dsec = datos.find(x => x.SECCION === s) || {};
    const nombre = txt(dsec['NOMBRE DE SECCION']) || `Sección ${s}`;
    return { seccion: s, nombre, alumnos: total, curso: esSeccionCurso(nombre) };
  });
}

// «OBEDIENCIA DE LAS SEÑALES: Verticales.» → «Obediencia de las señales: verticales»
function textoFallo(m) {
  const t = txt(m).replace(/\.$/, '');
  const [a, ...b] = t.split(':');
  const cap = s => { const x = s.trim().toLowerCase(); return x.charAt(0).toUpperCase() + x.slice(1); };
  return b.length ? `${cap(a)}: ${b.join(':').trim().toLowerCase()}` : cap(a);
}

// Fallos del examen práctico de Ariauto → texto legible.
//  Circulación: «eliminatorias;deficientes;leves», cada grupo «0» o códigos
//  separados por « - » (11.4;7.6;13.1.5 - 13.2.2).
//  Pista: «A#e;d;l#B#e;d;l#» (por maniobra: eliminatorias;deficientes;leves).
function detalleFallos(codigo, tipo, permiso, catalogos) {
  const s = txt(codigo);
  if (!s) return { detalle: null, n: 0 };
  if (tipo === 'maniobras' || s.includes('#')) {
    const partes = s.split('#').filter(Boolean);
    const out = []; let n = 0;
    for (let i = 0; i + 1 < partes.length; i += 2) {
      const letra = partes[i].trim();
      const [e, d, l] = partes[i + 1].split(';').map(x => num(x));
      if (!e && !d && !l) continue;
      n += e + d + l;
      const grupoPista = /^A[12]?$/.test(permiso || '') ? 'A1A2' : (permiso || '');
      const nombre = catalogos.pista.get(`${grupoPista}|${letra}`) || catalogos.pista.get(`${permiso}|${letra}`) || null;
      const cuenta = [e && `${e} eliminatoria${e > 1 ? 's' : ''}`, d && `${d} deficiente${d > 1 ? 's' : ''}`, l && `${l} leve${l > 1 ? 's' : ''}`].filter(Boolean).join(', ');
      out.push(`Maniobra ${letra}${nombre ? ` (${nombre.replace(/\.$/, '')})` : ''}: ${cuenta}`);
    }
    return { detalle: out.length ? out.join(' · ') : null, n };
  }
  const grupos = s.split(';');
  const nombres = ['Eliminatoria', 'Deficiente', 'Leve'];
  const out = []; let n = 0;
  grupos.slice(0, 3).forEach((g, i) => {
    const codigos = g.split(/\s+-\s+|,/).map(c => c.trim()).filter(c => c && c !== '0');
    if (!codigos.length) return;
    const veces = new Map();
    for (const c of codigos) veces.set(c, (veces.get(c) || 0) + 1);
    const items = [...veces.entries()].map(([c, k]) => {
      if (!/^\d/.test(c)) return c;
      n += k;
      let m = catalogos.circulacion.get(c);
      if (!m) { const padre = c.split('.').slice(0, 2).join('.'); m = catalogos.circulacion.get(padre); }
      return `${c}${m ? ' ' + textoFallo(m) : ''}${k > 1 ? ` (×${k})` : ''}`;
    });
    out.push(`${nombres[i]}${items.length > 1 ? 's' : ''}: ${items.join(', ')}`);
  });
  return { detalle: out.length ? out.join(' · ').slice(0, 2000) : null, n };
}

// Clave de Ariauto que la versión 1.25 dejó en las observaciones
function claveV125(observaciones) {
  const m = RE_CLAVE_V125.exec(observaciones || '');
  return m ? `${m[2]}|${m[1]}` : null;
}

/**
 * Plan determinista de la importación (la vista previa). `tablas` = lo que
 * devuelve leerAccess; `opciones`: { alcance: 'curso'|'todos', secciones:[],
 * economia, examenes, tasas, profesores, vehiculos, sucursal_id, hoy }.
 */
function planAriauto(tablas, opciones = {}, d = load()) {
  const hoy = opciones.hoy || hoyLocalISO();
  const secs = secciones(tablas);
  // Alumnos ya traídos de Ariauto: por la clave que dejó la 1.25 en las
  // observaciones («Nº 4905 (sección XINZO)»)
  const porClaveV125 = new Map();
  for (const a of d.alumnos) { if (a.deleted) continue; const k = claveV125(a.observaciones); if (k && !porClaveV125.has(k)) porClaveV125.set(k, a); }
  const seccionesYaTraidas = new Set([...porClaveV125.keys()].map(k => k.slice(0, k.lastIndexOf('|'))));
  // Las secciones de importaciones anteriores (desde la 1.26 se apuntan)
  for (const imp of d.importaciones || []) {
    if (imp.tipo === 'ariauto' && !imp.deshecha) for (const n of imp.secciones || []) seccionesYaTraidas.add(n);
  }
  // Y por su nº de registro (el de Ariauto, ya en su campo)
  const porRegistro = new Map();
  for (const a of d.alumnos) {
    if (a.deleted || !a.n_registro) continue;
    const k = String(a.n_registro).trim();
    if (!porRegistro.has(k)) porRegistro.set(k, []);
    porRegistro.get(k).push(a);
  }
  // Por defecto: las de autoescuela y, al volver a abrir el archivo, también
  // las que ya se trajeron (para completar a todos los que están en la app)
  const elegidas = new Set(Array.isArray(opciones.secciones) && opciones.secciones.length
    ? opciones.secciones.map(Number) : secs.filter(s => !s.curso || seccionesYaTraidas.has(s.nombre)).map(s => s.seccion));
  // economia: false por defecto. En Ariauto no se apuntan la mayoría de los
  // cobros (efectivo…): en la base real, 253 de 257 alumnos aprobados desde
  // 2024 salían «debiendo» (mediana 692 €). Traer su saldo llenaría la app de
  // falsos morosos; se deja como opción, con este aviso (fiabilidadCobros).
  // Al volver a abrir el archivo se proponen los mismos alumnos que la vez anterior
  const previa = (d.importaciones || []).find(i => i.tipo === 'ariauto' && !i.deshecha);
  const alcanceAnterior = previa && (previa.alcance === 'todos' || (!previa.alcance && previa.resumen && previa.resumen.alumnos > previa.resumen.enCurso)) ? 'todos' : 'curso';
  const op = { economia: false, examenes: true, tasas: true, profesores: true, vehiculos: true, ...opciones, alcance: opciones.alcance || alcanceAnterior };
  const desdeAlta = restarMeses(hoy, 18), desdeActividad = restarMeses(hoy, 12);
  const nombreSeccion = s => (secs.find(x => x.seccion === s) || {}).nombre || String(s);

  const permisos = new Map((tablas['PERMISOS'] || []).map(p => [p['NUMERO PERMISO'], txt(p['NOMBRE PERMISO']).toUpperCase()]));
  const letras = cod => { const p = permisos.get(cod); return p ? (PERMISO_APP[p] || p) : null; };
  const libro = agrupar(tablas['GASTOS E INGRESOS'], 'SECCION IOG');
  const practicas = agrupar(tablas['PRACTICAS'], 'SECCIONPRAC');
  const examenes = agrupar(tablas['FECHA DE EXAMEN'], 'SECCIONEX');
  const tasas = agrupar(tablas['Tasas_Alumnos'], 'SECCION');
  const catalogos = {
    circulacion: new Map((tablas['Errores_Examen_Circulacion'] || []).map(e => [txt(e.Id_error), txt(e.Mensaje_Error)])),
    pista: new Map((tablas['Errores_Examen_Pista'] || []).map(e => [`${txt(e.Permiso).toUpperCase()}|${txt(e.Letra).toUpperCase()}`, txt(e.Mensaje)]))
  };
  const examinadores = new Map((tablas['EXAMINADORES'] || []).map(e => {
    const partes = [e['NOMBRE EXAMINADOR'], e['PRIMER APELLIDO EXAM'], e['SEGUNDO APELLIDO EXAM']].map(txt)
      .filter(x => x && !/^NO ACTIV[OA]$/i.test(x));
    return [e['Nº EXAMINADOR'], partes.length ? titulo(partes.join(' ')) : null];
  }));
  const matriculaVeh = new Map((tablas['VEHICULOS'] || []).map(v => [v['NUMERO DE VEHICULO'], limpiarMatricula(v.MATRICULA) || null]));
  // País por código (ID_PAIS): el nombre que más se repite con ese código
  const paisPorCodigo = new Map([['00042', 'España']]);
  const cuenta = new Map();
  for (const a of tablas['ALUMNOS'] || []) {
    const cod = txt(a.ID_PAIS), nom = txt(a.NOMBRE_PAIS);
    if (!cod || !nom) continue;
    const k = `${cod}|${paisDe(nom)}`;
    cuenta.set(k, (cuenta.get(k) || 0) + 1);
  }
  for (const [k, n] of [...cuenta.entries()].sort((a, b) => a[1] - b[1])) { const [cod, nom] = k.split('|'); if (cod !== '00042' || nom === 'España') paisPorCodigo.set(cod, nom); }

  // Profesores de Ariauto → los de la app (por DNI o nombre) o nuevos
  const profApp = d.profesores.filter(p => !p.deleted);
  const profPorCodigo = new Map();
  const profesCompletar = [];
  for (const p of tablas['PROFESORES'] || []) {
    const nombre = [p.NOMBRE, p['PRIMER APELLIDO PRF'], p['SEGUNDO APELLIDO PRF']].map(titulo).filter(Boolean).join(' ');
    if (!nombre) continue;
    const dni = limpiarDni(p.DNI).valor;
    const k = claveNombre(nombre);
    const extra = {
      telefono: limpiarTelefono(p.TELEFONO), email: limpiarEmail(p.email_prof), direccion: capitalizarNombre(txt(p.DOMICILIO)) || null,
      codigo_postal: limpiarCP(p['CODIGO POSTAL']), poblacion: titulo(p.POBLACION) || null, fecha_nacimiento: p['FECHA DE NACIMIENTO'] || null,
      fecha_alta: p['FECHA DE ALTA'] || null, fecha_baja: p['FECHA DE BAJA'] || null, n_certificado: txt(p['NUMERO DE CERTIFICADO']) || null,
      fecha_certificado: p.f_expedicion_certificado || null
    };
    const existe = profApp.find(x => (dni && limpiarDni(x.dni).valor === dni) || claveNombre(x.nombre) === k);
    if (existe) {
      const cambios = {};
      for (const [c, v] of Object.entries(extra)) if (!vacio(v) && vacio(existe[c])) cambios[c] = v;
      if (dni && vacio(existe.dni)) cambios.dni = dni;
      if (Object.keys(cambios).length && !profesCompletar.some(x => x.id === existe.id)) profesCompletar.push({ id: existe.id, nombre: existe.nombre, cambios });
    }
    profPorCodigo.set(p['NUMERO PROFESOR'], existe ? { id: existe.id, nombre: existe.nombre }
      : { nuevo: `ariauto-prof-${p['NUMERO PROFESOR']}`, nombre, dni, deBaja: !!p['FECHA DE BAJA'], extra });
  }

  // Lo que ya tiene cada alumno en la app (para no repetir nada)
  const porAlumno = tabla => {
    const m = new Map();
    for (const x of d[tabla] || []) { if (x.deleted) continue; if (!m.has(x.alumno_id)) m.set(x.alumno_id, []); m.get(x.alumno_id).push(x); }
    return m;
  };
  const examenesApp = porAlumno('presentaciones'), tasasApp = porAlumno('tasas'), pagosApp = porAlumno('pagos'), cargosApp = porAlumno('cargos');
  const dniVencido = new Set((d.vencimientos || []).filter(v => !v.deleted && v.entidad_tipo === 'alumno' && v.tipo === 'DNI').map(v => `${v.entidad_id}|${v.fecha_vencimiento}`));
  // Primera clase de cada alumno en la app (anotada a mano en Puesta en
  // marcha, del móvil…): lo que diga Ariauto desde ese día ya está en la app.
  const primeraApp = new Map();
  for (const p of d.practicas) {
    if (p.deleted || !p.fecha) continue;
    const f = primeraApp.get(p.alumno_id);
    if (!f || p.fecha < f) primeraApp.set(p.alumno_id, p.fecha);
  }
  const filas = [];
  const idsUsados = new Set();
  const expedientesVistos = new Set();
  const fichaDe = new Map(); // id del alumno de la app → la ficha de Ariauto que le ha tocado
  const profUsados = new Set();
  let enCurso = 0, terminados = 0;

  // Una ficha de Ariauto que es un alumno que ya está en la app: qué se
  // completa y qué no se repite (exámenes, tasas, cobros y CLASES: nunca se
  // cuentan dos veces las que el alumno ya tiene anotadas).
  const prepararActualizar = (fila, al, parecido) => {
    fila.accion = 'actualizar'; fila.id = al.id;
    fila.nombreApp = [al.nombre, al.primer_apellido, al.segundo_apellido].filter(Boolean).join(' ');
    if (parecido) { fila.parecido = true; fila.avisos.push(`En la app está como «${fila.nombreApp}»: es el mismo (nombre parecido)`); }
    // Clases: si ya tiene sus «clases ya hechas» puestas, ninguna; si tiene
    // clases en la app, solo las de Ariauto de antes de la primera
    const primera = primeraApp.get(al.id) || null;
    fila.primeraApp = primera;
    if (al.clases_previas > 0) fila.reparto = { conFecha: [], sinFecha: 0, omitidas: fila.clases, total: 0 };
    else if (!fila.activo) fila.reparto = primera ? { conFecha: [], sinFecha: 0, omitidas: fila.clases, total: 0 } : { conFecha: [], sinFecha: fila.clases, omitidas: 0, total: fila.clases };
    else fila.reparto = repartirClases(fila.entradasClase, primera);
    if (fila.reparto.bonoDudoso) fila.avisos.push(`Ariauto le cobró un bono de ${String(fila.reparto.bonoDudoso).replace('.', ',')} clases poco antes de su primera clase en la app (${primera.split('-').reverse().join('/')}): no se suma, pueden ser las mismas. Si son otras, añádelas en Puesta en marcha.`);
    fila.cambios = cambiosAlumno(al, fila);
    if (fila.datos.n_registro && !vacio(al.n_registro) && String(al.n_registro).trim() !== String(fila.datos.n_registro)) {
      fila.avisos.push(`En la app tiene el nº ${al.n_registro} y en Ariauto el ${fila.datos.n_registro}: se deja el de la app`);
    }
    const conCobros = (pagosApp.get(al.id) || []).length > 0 || (cargosApp.get(al.id) || []).length > 0;
    if (conCobros && (fila.cargos.length || fila.pagos.length)) { fila.sinEconomia = true; fila.avisos.push('Ya tiene cobros en la app: no se traen los de Ariauto'); }
    // Lo que ya está en la app no se repite
    const exApp = examenesApp.get(al.id) || [];
    fila.examenesCompletar = [];
    const exUsados = new Set();
    fila.presentaciones = fila.presentaciones.filter(e => {
      const ya = exApp.find(x => !exUsados.has(x.id) && x.fecha === e.fecha && x.tipo === e.tipo);
      if (!ya) return true;
      exUsados.add(ya.id);
      const c = {};
      for (const campo of ['permiso', 'examinador', 'vehiculo', 'fallos', 'fallos_detalle', 'n_solicitud']) if (!vacio(e[campo]) && vacio(ya[campo])) c[campo] = e[campo];
      if (Object.keys(c).length) fila.examenesCompletar.push({ id: ya.id, cambios: c });
      return false;
    });
    const tasasDe = tasasApp.get(al.id) || [];
    fila.tasasCompletar = [];
    fila.tasas = fila.tasas.filter(t => {
      const ya = tasasDe.find(x => x.concepto === t.concepto || (t.n_justificante && x.n_justificante === t.n_justificante));
      if (!ya) return true;
      const c = {};
      if (t.n_justificante && vacio(ya.n_justificante)) c.n_justificante = t.n_justificante;
      if (t.tipo_tasa && vacio(ya.tipo_tasa)) c.tipo_tasa = t.tipo_tasa;
      if (Object.keys(c).length) fila.tasasCompletar.push({ id: ya.id, cambios: c });
      return false;
    });
    if (fila.caducaDni && dniVencido.has(`${al.id}|${fila.caducaDni}`)) fila.caducaDni = null;
  };

  // Con quién se junta cada ficha se apunta primero (marcarActualizar); qué se
  // le completa se calcula al final (prepararActualizar), después de aplicar
  // lo que se haya decidido a mano en la vista previa (opciones.decisiones).
  const marcarActualizar = (fila, al, parecido) => { fila.accion = 'actualizar'; fila.id = al.id; fila._al = al; fila._parecido = !!parecido; };

  // Lo más reciente primero (y, a la misma fecha, la de la sección de
  // autoescuela antes que su copia en la de cursos)
  const esCurso = sec => !!(secs.find(x => x.seccion === sec) || {}).curso;
  const fichas = (tablas['ALUMNOS'] || []).map((a, orden) => ({ a, orden })).sort((x, y) =>
    String(y.a['FECHA DE ALTA'] || y.a['FECHA DE INGRESO'] || '').localeCompare(String(x.a['FECHA DE ALTA'] || x.a['FECHA DE INGRESO'] || '')) ||
    esCurso(x.a.SECCION) - esCurso(y.a.SECCION));
  for (const { a, orden } of fichas) {
    if (!elegidas.has(a.SECCION)) continue;
    const k = clave(a.SECCION, a['Nº ALUMNO']);
    const movs = libro.get(k) || [], pracs = practicas.get(k) || [], exs = examenes.get(k) || [], tas = tasas.get(k) || [];
    const archivo = txt(a.motivo_archivado).toUpperCase();
    let estado = ESTADO_ARCHIVO[archivo] || (a['FECHA APROBADO'] ? 'apto' : null);
    const terminado = !!estado;
    const alta = a['FECHA DE ALTA'] || a['FECHA DE INGRESO'] || null;
    const ultima = [alta, ...movs.map(m => m.FECHA), ...exs.map(e => e['F EXAMEN']), ...pracs.map(p => p.FECHA)].filter(Boolean).sort().pop() || null;
    const activo = !terminado && ((alta && alta >= desdeAlta) || (ultima && ultima >= desdeActividad));
    // Sin archivar en Ariauto pero sin actividad desde hace más de un año: inactivo
    if (!estado) estado = activo ? (a.Teorico_Apto ? 'en_practicas' : 'matriculado') : 'inactivo';
    const estadoV125 = ESTADO_ARCHIVO_V125[archivo] || (a['FECHA APROBADO'] ? 'apto' : a.Teorico_Apto ? 'en_practicas' : 'matriculado');
    if (activo) enCurso++; else terminados++;
    if (op.alcance !== 'todos' && !activo) continue;

    // Persona
    const nombre = titulo(a.NOMBREALUMNO), a1 = capitalizarNombre(txt(a['PRIMER APELLIDO']), { apellido: true }), a2 = capitalizarNombre(txt(a['SEGUNDO APELLIDO']), { apellido: true });
    if (!nombre && !a1) continue;
    // DNI o NIE sin la letra (Ariauto la guarda aparte, en «NIF DEL ALUMNO»)
    const docTxt = txt(a['DNI DEL ALUMNO']) + (/^[XYZ]?\d{6,8}$/i.test(txt(a['DNI DEL ALUMNO']).replace(/[\s.-]/g, '')) ? txt(a['NIF DEL ALUMNO']) : '');
    const dni = limpiarDni(docTxt);
    const kPersona = dni.valor || claveNombre(nombre, a1, a2);
    // Una persona puede tener varias fichas, cada una con su nº: los permisos o
    // cursos que ha ido sacando (B, luego C y EC; A2 y luego A; el CAP…). Cada
    // una es un expediente aparte. Solo se junta la MISMA ficha copiada en otra
    // sección (mismo nº y permiso: Ariauto copia la del alumno en la de cursos).
    const kExpediente = `${kPersona}|${txt(a['Nº ALUMNO'])}|${letras(a.PERMISO) || 'B'}`;
    if (expedientesVistos.has(kExpediente)) continue;
    expedientesVistos.add(kExpediente);

    const via = txt(a.Tipo_de_Via), dom = txt(a['DOMICILIO DEL ALUMNO']);
    const calle = capitalizarNombre([via && !dom.toUpperCase().startsWith(via.toUpperCase()) ? via : '', dom].filter(Boolean).join(' '));
    const direccion = [calle, txt(a['Nº']) && `nº ${txt(a['Nº'])}`, txt(a.Portal) && `portal ${txt(a.Portal)}`, txt(a.Bloque) && `bloque ${txt(a.Bloque)}`,
      txt(a.PISO), txt(a.LETRA)].filter(Boolean).join(' ') || null;
    const poblacion = titulo(a['PUEBL0 DEL ALUMNO'] || a.nombre_nuevo_municipio_alm || a['MUNICIPIO DEL ALUMNO']) || null;
    const municipio = titulo(a.nombre_nuevo_municipio_alm || a['MUNICIPIO DEL ALUMNO']) || null;
    const tels = [...new Set([limpiarTelefono(a.TELEFONO), limpiarTelefono(a.TELEFONO2)].filter(Boolean))];
    const permiso = letras(a.PERMISO) || 'B';
    const posee = [a['POSEE PERMISO'], a['POSEE PERMISO2'], a['POSEE PERMISO3'], a['POSEE PERMISO4']].map(letras).filter(Boolean);
    const otros = [letras(a.PERMISO2)].filter(p => p && p !== permiso);
    const tutor = [a.Nombre_tutor, a.Apellido1_tutor, a.Apellido2_tutor].map(titulo).filter(Boolean).join(' ');
    const nacionalidad = paisDe(a.Nacionalidad) || paisPorCodigo.get(txt(a.ID_PAIS)) || paisDe(a.NOMBRE_PAIS) || null;
    const paisNacimiento = paisDe(a.NOMBRE_PAIS);
    const restricciones = [a.LENTES && 'Lentes', a['CONDICIONES RESTRICTIVAS'] && 'Condiciones restrictivas', a['VALIDEZ LIMITADA'] && 'Validez limitada'].filter(Boolean).join(', ') || null;
    const centroMedico = txt(a['CENTRO MEDICO']).toUpperCase().replace(/\s+/g, '');
    const conFactura = a.Facturaempresa || txt(a.Factura_nombre) || txt(a.Factura_cif);
    const padres = [txt(a.Nombre_padre) && `Padre: ${titulo(a.Nombre_padre)}`, txt(a.Nombre_madre) && `Madre: ${titulo(a.Nombre_madre)}`].filter(Boolean).join(' · ');
    const extra = {
      n_registro: txt(a['Nº ALUMNO']) || null,
      sexo: a.SEXO, nacionalidad,
      lugar_nacimiento: titulo(a['LUGAR DE NACIMIENTO']) || (paisNacimiento && paisNacimiento !== nacionalidad ? paisNacimiento : null),
      provincia: titulo(a['PROVINCIA DEL ALUMNO']) || null,
      municipio: municipio && municipio !== poblacion ? municipio : null,
      telefono2: tels[1] || null,
      dni_caducidad: a['CADUCA DNI'] || null,
      tutor_nombre: tutor || null,
      tutor_dni: txt(a.DNI_tutor) ? limpiarDni(txt(a.DNI_tutor) + txt(a.NIF_tutor)).valor : null,
      fecha_teorico: a.Fecha_teorico_apto || null,
      centro_medico: centroMedico.length > 2 ? centroMedico : null,
      restricciones,
      n_solicitud: num(a['Nº DE SOLICITUD']) || null,
      convocatoria: num(a.CONVOCATORIA) || null,
      factura_nombre: conFactura ? titulo(a.Factura_nombre) || null : null,
      factura_nif: conFactura ? limpiarDni(a.Factura_cif).valor || txt(a.Factura_cif).toUpperCase() || null : null,
      factura_direccion: conFactura ? [capitalizarNombre(txt(a.Factura_domicilio)), limpiarCP(a.Factura_cp), titulo(a.Factura_poblacion), titulo(a.Factura_provincia)].filter(Boolean).join(', ') || null : null
    };
    const observaciones = [txt(a.OBSERVACIONES), padres].filter(Boolean).join('\n') || null;
    const prof = profPorCodigo.get(a.PROFESOR) || null;
    if (prof && prof.nuevo) profUsados.add(prof.nuevo);

    // Clases ya hechas = las cargadas en su cuenta de Ariauto, cada apunte con
    // su fecha («2-CLASES» del 17/08 = 2 clases ese día), o las de PRACTICAS
    // si son más (fichas antiguas); y, si se pide, los cargos y pagos (solo de
    // los alumnos en curso)
    const cargos = [], pagos = [];
    const deCobros = [];
    let clasesCobradas = 0;
    for (const m of activo ? movs : []) {
      const concepto = txt(m.CONCEPTO) || 'Apunte de Ariauto';
      const debe = euros(m.EURODEBE), haber = euros(m.EUROHABER);
      const fecha = m.FECHA || alta || hoy;
      if (debe && RE_CLASE.test(concepto) && !RE_NO_CLASE.test(concepto)) {
        const n = num(m.CANTIDAD) || 0;
        if (n > 0) { clasesCobradas += n; deCobros.push({ fecha, n }); }
      }
      if (!op.economia) continue;
      if (debe) cargos.push({ concepto: concepto.slice(0, 120), tipo: tipoCargo(concepto, debe), importe: debe, fecha });
      if (haber) pagos.push({ fecha, cantidad: haber, nota: concepto.slice(0, 120), forma_pago: formaPago(concepto) });
    }
    const deFicha = pracs.map(p => ({ fecha: p.FECHA || alta || hoy, n: num(p.CANTIDAD) || 1 }));
    const clasesFicha = deFicha.reduce((n, x) => n + x.n, 0);
    const clases = Math.round(Math.max(clasesCobradas, clasesFicha) * 4) / 4;
    const entradasClase = clasesCobradas >= clasesFicha ? deCobros : deFicha;
    const saldo = Math.round((cargos.reduce((s, c) => s + c.importe, 0) - pagos.reduce((s, p) => s + p.cantidad, 0)) * 100) / 100;

    // Exámenes (de todos los alumnos que se traen: el historial sirve para
    // el buscador y las estadísticas de aprobados), con sus fallos
    const presentaciones = op.examenes ? exs.filter(e => e['F EXAMEN']).map(e => {
      const tipo = TIPO_EXAMEN[e['TIPO DE EXAMEN']] || 'teorico';
      const permisoEx = letras(e['PERMISO EXAMEN']) || null;
      const fallos = tipo === 'teorico' ? { detalle: null, n: 0 } : detalleFallos(e.FALLOS_PRACTICO, tipo, permisoEx, catalogos);
      const nFallos = num(e.FALLOS) || fallos.n || null;
      return {
        tipo, fecha: e['F EXAMEN'],
        resultado: RESULTADO_EXAMEN[e['RESULTADO DE EXAMEN']] || 'pendiente',
        n_convocatoria: num(e.CONVOCATORIA) || 1, profesor: profPorCodigo.get(e.PROFESOR) || null,
        permiso: permisoEx, examinador: examinadores.get(e.EXAMINADOR) || null, vehiculo: matriculaVeh.get(e.VEHICULO) || null,
        fallos: tipo === 'teorico' ? (num(e.FALLOS) || null) : nFallos, fallos_detalle: fallos.detalle,
        n_solicitud: num(e['Nº DE SOLICITUD']) || null,
        nota: 'Ariauto'
      };
    }) : [];
    const tasasAl = op.tasas ? tas.map(t => ({
      concepto: `Tasa ${txt(t.TipoTasa)}${txt(t.IdTasa) ? ' · ' + txt(t.IdTasa) : ''}`.slice(0, 120), fecha_compra: t.FechaCompra || null,
      importe: euros(t.Importe) || null, estado: t['F EXAMEN'] && t['F EXAMEN'] < hoy ? 'usada' : 'vigente',
      n_justificante: txt(t.IdTasa) || null, tipo_tasa: txt(t.TipoTasa) && txt(t.TipoTasa) !== '.' ? txt(t.TipoTasa) : null
    })) : [];
    const caducaDni = activo && a['CADUCA DNI'] && a['CADUCA DNI'] >= hoy ? a['CADUCA DNI'] : null;

    const persona = { nombre: nombre || a1, primer_apellido: nombre ? a1 : '', segundo_apellido: a2, dni };
    const kAri = `${nombreSeccion(a.SECCION)}|${txt(a['Nº ALUMNO'])}`;
    // Por su nº de Ariauto (si es la misma persona: hay números repetidos) o
    // por DNI / nombre
    const mismaPersona = al => (dni.valor && limpiarDni(al.dni).valor === dni.valor) || claveNombre(al.nombre, al.primer_apellido, al.segundo_apellido) === claveNombre(persona.nombre, persona.primer_apellido, persona.segundo_apellido);
    const porClave = [porClaveV125.get(kAri), ...(porRegistro.get(txt(a['Nº ALUMNO'])) || [])].find(al => al && !idsUsados.has(al.id) && mismaPersona(al));
    if (porClave) idsUsados.add(porClave.id);
    const datos = {
      nombre: persona.nombre, primer_apellido: persona.primer_apellido || null, segundo_apellido: persona.segundo_apellido || null,
      dni: dni.valor, telefono: tels[0] || null, email: limpiarEmail(a.email_al), fecha_nacimiento: a['FECHA NACIMIENTO'] || null,
      direccion, codigo_postal: limpiarCP(a['C-P DEL ALUMNO']), poblacion, permiso, permisos: otros, fecha_alta: alta,
      estado, observaciones, permisos_posee: posee.length ? [...new Set(posee)].join(', ') : null,
      resultado: estado === 'apto' ? 'apto' : estado === 'baja' ? 'baja' : null, fecha_fin: a['FECHA APROBADO'] || null,
      profesor: prof,
      ...extraerCamposExtra('alumnos', extra)
    };
    const fila = {
      clave: k, nombre: [datos.nombre, datos.primer_apellido, datos.segundo_apellido].filter(Boolean).join(' '), dni: dni.valor, permiso, estado, activo,
      n_registro: datos.n_registro, clases, saldo, cargos, pagos, presentaciones, tasas: tasasAl, caducaDni, datos, estadoV125, avisos: [],
      persona, entradasClase, orden, kPersona,
      // Alumno nuevo: en curso, cada clase con su día; terminado, solo el número
      reparto: activo ? repartirClases(entradasClase) : { conFecha: [], sinFecha: clases, omitidas: 0, total: clases }
    };
    if (dni.valor && !dni.valido) fila.avisos.push('DNI con letra que no cuadra');
    // Por su nº ya está en la app; si no, se empareja después, con todas las
    // fichas a la vista (una persona puede tener varias)
    if (porClave) { marcarActualizar(fila, porClave, false); fichaDe.set(porClave.id, fila); } else fila.accion = null;
    filas.push(fila);
  }

  // ─── Emparejar por DNI o nombre con los alumnos de la app ─────────────────
  // Al alumno que ya está en la app (p. ej. el de la Puesta en marcha, sin nº)
  // le toca la ficha de su misma persona que más se le parece: mismo permiso,
  // en curso si él está en curso, y la más reciente. Las demás fichas de esa
  // persona (otros permisos o cursos) entran como expedientes aparte. Si dos
  // alumnos de la app empatan para la misma ficha, no se toca (se avisa).
  const nombreAl = al => [al.nombre, al.primer_apellido, al.segundo_apellido].filter(Boolean).join(' ');
  const terminadoApp = al => ['baja', 'apto', 'aprobado', 'inactivo'].includes(al.estado);
  const porDniApp = new Map(), porNombreApp = new Map();
  const meter = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const al of d.alumnos) {
    if (al.deleted) continue;
    const dv = limpiarDni(al.dni).valor;
    if (dv) meter(porDniApp, dv, al);
    const kn = claveNombre(al.nombre, al.primer_apellido, al.segundo_apellido);
    if (kn) meter(porNombreApp, kn, al);
  }
  const altaNum = f => (Number(String(f.datos.fecha_alta || '').replace(/-/g, '')) || 0) / 1e9;
  // Mismo permiso y mismo «en curso / terminado»; entre fichas de una misma
  // persona desempata la más reciente
  const puntosBase = (f, al) => (al.permiso === f.permiso ? 100 : 0) + (terminadoApp(al) === !f.activo ? 10 : 0);
  const puntos = (f, al) => puntosBase(f, al) + altaNum(f);
  const pendientes = filas.filter(f => f.accion === null);
  for (const f of pendientes) {
    const dniF = f.persona.dni.valor;
    const c = new Set(dniF ? porDniApp.get(dniF) || [] : []);
    for (const al of porNombreApp.get(claveNombre(f.persona.nombre, f.persona.primer_apellido, f.persona.segundo_apellido)) || []) {
      const dv = limpiarDni(al.dni).valor;
      if (dniF && dv && dv !== dniF) f.otroDni = true; else c.add(al);
    }
    f.cands = [...c];
  }
  const pares = [];
  for (const f of pendientes) for (const al of f.cands) pares.push([puntos(f, al), f, al]);
  pares.sort((x, y) => y[0] - x[0]);
  for (const [pt, f, al] of pares) {
    if (f.asignado || f.empate || idsUsados.has(al.id)) continue;
    if (f.cands.some(x => x !== al && !idsUsados.has(x.id) && puntos(f, x) === pt)) { f.empate = true; continue; }
    f.asignado = al; idsUsados.add(al.id); fichaDe.set(al.id, f);
  }
  // Personas DISTINTAS (otro DNI) que se disputan, empatadas, al mismo alumno
  // de la app (sin DNI): no se sabe cuál de ellas es
  for (const f of pendientes) {
    const al = f.asignado;
    if (!al) continue;
    const rivales = pendientes.filter(g => g !== f && g.kPersona !== f.kPersona && g.cands.includes(al) && puntosBase(g, al) === puntosBase(f, al));
    if (!rivales.length) continue;
    idsUsados.delete(al.id); fichaDe.delete(al.id);
    for (const g of [f, ...rivales]) { g.asignado = null; g.homonimo = true; }
  }
  for (const f of pendientes) {
    // El alumno de la app que es de esta misma persona (se lo llevó otra de sus fichas)
    const suyo = f.cands.find(al => fichaDe.has(al.id) && fichaDe.get(al.id).kPersona === f.kPersona);
    if (f.asignado) marcarActualizar(f, f.asignado, false);
    else if (f.homonimo) { f.accion = 'revisar'; f.avisos.push('En la app hay un alumno con este nombre y en Ariauto hay más de una persona que se llama así: no se toca (pon el DNI en la app para saber cuál es)'); }
    else if (f.empate) { f.accion = 'revisar'; f.avisos.push('Hay varios alumnos con este nombre en la app: no se toca'); }
    else if (suyo) { f.accion = 'nuevo'; f.otroExpedienteDe = suyo; }
    else if (f.cands.length) f.accion = 'nuevo'; // otra persona que se llama igual
    else if (f.otroDni) { f.accion = 'revisar'; f.avisos.push('En la app hay otro alumno con este nombre y otro DNI: no se toca'); }
    else f.accion = 'nuevo';
  }

  filas.sort((x, y) => x.orden - y.orden); // en el orden de Ariauto
  // Segunda vuelta: alumnos de la app sin pareja que se PARECEN a una ficha
  // que iba a entrar como nueva (una errata: «Kole Bardechi» / «Kolë Bardheci»,
  // o le falta un apellido). Si las fichas parecidas son de UNA persona, al
  // alumno le toca la que más se le parece (las demás son sus otros
  // expedientes); si son de personas distintas o varios alumnos de la app
  // quieren la misma, no se toca ninguna (mejor que duplicar o mezclar).
  const nuevas = filas.filter(f => f.accion === 'nuevo' && !f.otroExpedienteDe);
  if (nuevas.length) {
    const parecidosA = buscadorParecidos(d.alumnos.filter(al => !al.deleted && !idsUsados.has(al.id)));
    const porAlumno = new Map(); // id del alumno de la app → { al, filas parecidas }
    for (const f of nuevas) {
      for (const al of parecidosA(f.persona)) { if (!porAlumno.has(al.id)) porAlumno.set(al.id, { al, filas: [] }); porAlumno.get(al.id).filas.push(f); }
    }
    const elegidaPor = new Map(), dudosas = new Map(); // fila → alumnos de la app
    const anotar = (m, f, al) => m.set(f, [...(m.get(f) || []), al]);
    for (const { al, filas: fs } of porAlumno.values()) {
      if (new Set(fs.map(f => f.kPersona)).size > 1) { for (const f of fs) anotar(dudosas, f, al); continue; }
      const mejor = fs.slice().sort((x, y) => puntos(y, al) - puntos(x, al))[0];
      anotar(elegidaPor, mejor, al);
      for (const f of fs) if (f !== mejor) f.otroExpedienteDe = al;
    }
    for (const [f, als] of elegidaPor) {
      if (als.length === 1 && !dudosas.has(f)) { idsUsados.add(als[0].id); fichaDe.set(als[0].id, f); marcarActualizar(f, als[0], true); }
      else for (const al of als) anotar(dudosas, f, al);
    }
    for (const [f, als] of dudosas) {
      f.dudososCon = [...new Set([...(f.dudososCon || []), ...als])];
      if (f.accion !== 'nuevo') continue;
      f.accion = 'revisar'; delete f.otroExpedienteDe;
      f.avisos.push(`Se parece a ${[...new Set(als)].map(al => '«' + nombreAl(al) + '»').join(' y ')} de la app: no se toca (corrige el nombre en la app si es el mismo)`);
    }
  }
  // ─── Lo decidido a mano en la vista previa ────────────────────────────────
  // { [clave de la ficha]: id del alumno de la app con el que juntarla |
  //   'nuevo' (es otra persona: entra aparte) | 'omitir' (no se trae) }.
  // Así ninguna ficha de Ariauto se junta con un alumno de la app (ni se crea
  // aparte) sin que se haya podido ver y cambiar antes de importar.
  const decisiones = op.decisiones && typeof op.decisiones === 'object' ? op.decisiones : {};
  const soltar = f => {
    if (f.accion === 'actualizar' && f.id != null && fichaDe.get(f.id) === f) { fichaDe.delete(f.id); idsUsados.delete(f.id); }
    delete f.id; delete f._al; delete f._parecido;
  };
  for (const f of filas) {
    if (!Object.prototype.hasOwnProperty.call(decisiones, f.clave)) continue;
    const dec = decisiones[f.clave];
    if (dec === 'omitir' || dec === 'nuevo') {
      soltar(f); f.accion = dec; f.manual = true;
      if (dec === 'nuevo') delete f.otroExpedienteDe;
      f.avisos = f.avisos.filter(a => !/no se toca/.test(a));
      continue;
    }
    const al = d.alumnos.find(a => a.id === Number(dec) && !a.deleted);
    if (!al) continue;
    const otra = fichaDe.get(al.id);
    if (otra && otra !== f) {
      soltar(otra); otra.accion = 'revisar';
      otra.avisos.push(`«${nombreAl(al)}» se ha juntado a mano con otra ficha de Ariauto: esta no se toca`);
    }
    soltar(f);
    marcarActualizar(f, al, claveNombre(al.nombre, al.primer_apellido, al.segundo_apellido) !== claveNombre(f.persona.nombre, f.persona.primer_apellido, f.persona.segundo_apellido));
    f.manual = true; idsUsados.add(al.id); fichaDe.set(al.id, f);
    delete f.otroExpedienteDe;
    f.avisos = f.avisos.filter(a => !/no se toca/.test(a));
  }
  // Qué se completa en cada alumno que ya está (con lo ya decidido)
  for (const f of filas) if (f.accion === 'actualizar') prepararActualizar(f, f._al, f._parecido);
  // Alumnos de la app con los que se podría juntar cada ficha (para elegir en la vista previa)
  const clasesApp = new Map();
  for (const p of d.practicas) if (!p.deleted) clasesApp.set(p.alumno_id, (clasesApp.get(p.alumno_id) || 0) + clasesDePractica(p));
  const candidatoDe = al => ({ id: al.id, nombre: nombreAl(al), dni: al.dni || null, n_registro: al.n_registro || null, permiso: al.permiso || 'B', estado: al.estado || null,
    clasesApp: cuarto(clasesApp.get(al.id) || 0), movil: al.id >= 1e9 });
  for (const f of filas) {
    const m = new Map();
    const poner = al => { if (al && !al.deleted && !m.has(al.id)) m.set(al.id, al); };
    poner(f._al); (f.cands || []).forEach(poner); (f.dudososCon || []).forEach(poner);
    (porNombreApp.get(claveNombre(f.persona.nombre, f.persona.primer_apellido, f.persona.segundo_apellido)) || []).forEach(poner);
    if (f.persona.dni.valor) (porDniApp.get(f.persona.dni.valor) || []).forEach(poner);
    if (f.otroExpedienteDe) poner(f.otroExpedienteDe);
    f.candidatosApp = [...m.values()].slice(0, 6).map(candidatoDe);
  }

  // Varios expedientes de una misma persona: cada uno con su nº, y se avisa
  const porPersona = new Map();
  for (const f of filas) if (f.accion !== 'revisar') meter(porPersona, f.kPersona, f);
  const permisoTxt = f => `${f.n_registro ? 'nº ' + f.n_registro + ', ' : ''}permiso ${f.permiso}`;
  for (const f of filas) {
    const otras = (porPersona.get(f.kPersona) || []).filter(x => x !== f);
    if (otras.length) f.otrosExpedientes = otras.map(x => ({ n_registro: x.n_registro || null, permiso: x.permiso, estado: x.estado }));
    if (f.accion === 'nuevo' && f.otroExpedienteDe) {
      const suya = fichaDe.get(f.otroExpedienteDe.id);
      f.avisos.push(`Otro permiso o curso de «${nombreAl(f.otroExpedienteDe)}», que ya está en la app${suya ? ` (${permisoTxt(suya)})` : ` (permiso ${f.otroExpedienteDe.permiso})`}: entra como expediente aparte, con su nº`);
    }
  }
  // «Clases ya hechas» sin fecha: de ¼ en ¼ (un bono de 10 ½ clases son 10 ½)
  for (const f of filas) f.datos.clases_previas = cuarto(f.reparto.sinFecha);

  // Coches de alta en Ariauto → los de la app (por matrícula) o nuevos, con
  // sus datos (marca, modelo, seguro, ITV) y los vencimientos de ITV y seguro
  const vehiculos = [];
  if (op.vehiculos) {
    const cochesApp = d.vehiculos.filter(v => !v.deleted);
    for (const v of tablas['VEHICULOS'] || []) {
      if (v['FECHA DE BAJA']) continue;
      const mat = limpiarMatricula(v.MATRICULA);
      if (!mat) continue;
      const existe = cochesApp.find(x => limpiarMatricula(x.matricula) === mat);
      const vencimientos = [];
      if (v['PROXIMA REVISION'] && v['PROXIMA REVISION'] >= hoy) vencimientos.push({ tipo: 'ITV', descripcion: `ITV ${mat}`, fecha: v['PROXIMA REVISION'] });
      if (v['VENCIMIENTO DEL SEGURO'] && v['VENCIMIENTO DEL SEGURO'] >= hoy) vencimientos.push({ tipo: 'Seguro', descripcion: [`Seguro ${mat}`, titulo(v['NOMBRE CIA DE SEGURO']), txt(v['NUMERO DE POLIZA']) && `póliza ${txt(v['NUMERO DE POLIZA'])}`].filter(Boolean).join(' · '), fecha: v['VENCIMIENTO DEL SEGURO'] });
      const datosCoche = extraerCamposExtra('vehiculos', {
        marca: titulo(v.MARCA), modelo: titulo(v.MODELO), fecha_alta: v['FECHA DE ALTA'], aseguradora: titulo(v['NOMBRE CIA DE SEGURO']),
        poliza: txt(v['NUMERO DE POLIZA']), itv_ultima: v['ULTIMA INSPECCION'], observaciones: txt(v.OBSERVACIONES)
      });
      delete datosCoche.activo;
      const cambios = {};
      if (existe) {
        for (const ven of vencimientos) ven.ya = (d.vencimientos || []).some(y => !y.deleted && y.entidad_tipo === 'vehiculo' && y.entidad_id === existe.id && y.tipo === ven.tipo && y.fecha_vencimiento === ven.fecha);
        for (const [c, val] of Object.entries(datosCoche)) if (!vacio(val) && vacio(existe[c])) cambios[c] = val;
      }
      vehiculos.push({
        matricula: mat, nombre: [titulo(v.MARCA), titulo(v.MODELO)].filter(Boolean).join(' ').slice(0, 60) || `Coche ${mat}`,
        id: existe ? existe.id : null, vencimientos: vencimientos.filter(x => !x.ya), datos: datosCoche, cambios
      });
    }
  }
  // Profesores nuevos: los que siguen de alta y los que tienen alumnos importados
  const profesores = op.profesores
    ? [...profPorCodigo.values()].filter((p, i, arr) => p.nuevo && (!p.deBaja || profUsados.has(p.nuevo)) && arr.findIndex(x => x.nuevo === p.nuevo) === i)
    : [];

  // Coche habitual de cada profesor que aún no lo tiene (la web del móvil se lo
  // propone al empezar sus clases): el que más usa en la app y, si aún no tiene
  // clases en la app, el de sus exámenes de coche (permiso B) del último año.
  const cochesProfesor = [];
  const desdeExamenes = restarMeses(hoy, 12);
  const usosExamen = new Map(); // código de profesor de Ariauto → Map(matrícula → nº)
  for (const e of tablas['FECHA DE EXAMEN'] || []) {
    if (!e['F EXAMEN'] || e['F EXAMEN'] < desdeExamenes || e.PROFESOR == null) continue;
    if (letras(e['PERMISO EXAMEN']) !== 'B' || TIPO_EXAMEN[e['TIPO DE EXAMEN']] === 'teorico') continue;
    const mat = matriculaVeh.get(e.VEHICULO);
    if (!mat) continue;
    if (!usosExamen.has(e.PROFESOR)) usosExamen.set(e.PROFESOR, new Map());
    const m = usosExamen.get(e.PROFESOR);
    m.set(mat, (m.get(mat) || 0) + 1);
  }
  const cocheApp = id => d.vehiculos.find(v => v.id === id && !v.deleted);
  const yaVistos = new Set();
  for (const [codigo, pr] of profPorCodigo) {
    const clavePr = pr.id ? 'id:' + pr.id : pr.nuevo;
    if (yaVistos.has(clavePr)) continue;
    if (pr.nuevo && !profesores.some(x => x.nuevo === pr.nuevo)) continue; // no se crea
    const existente = pr.id ? d.profesores.find(x => x.id === pr.id) : null;
    if (existente && existente.vehiculo_id && cocheApp(existente.vehiculo_id)) continue; // ya tiene
    let sugerencia = null;
    const deApp = existente ? sugerirCocheProfesor(d, existente.id, new Date(hoy + 'T12:00:00')) : null;
    if (deApp) { const v = cocheApp(deApp); sugerencia = { vehiculo_id: v.id, matricula: limpiarMatricula(v.matricula) || null, coche: v.nombre, fuente: 'app' }; }
    else if (usosExamen.has(codigo)) {
      const [mat] = [...usosExamen.get(codigo).entries()].sort((a, b) => b[1] - a[1])[0];
      const enApp = d.vehiculos.find(v => !v.deleted && v.activo !== false && limpiarMatricula(v.matricula) === mat);
      const enPlan = vehiculos.find(v => v.matricula === mat);
      if (enApp) sugerencia = { vehiculo_id: enApp.id, matricula: mat, coche: enApp.nombre, fuente: 'examenes' };
      else if (enPlan) sugerencia = { vehiculo_id: null, matricula: mat, coche: enPlan.nombre, fuente: 'examenes' };
    }
    if (!sugerencia) continue;
    yaVistos.add(clavePr);
    cochesProfesor.push({ profesor: pr.id ? { id: pr.id, nombre: pr.nombre } : { nuevo: pr.nuevo, nombre: pr.nombre }, ...sugerencia });
  }

  // Datos del centro (los de la sección por defecto y los del titular)
  const c = (tablas['DATOS DE AUTOESCUELA'] || []).find(x => x['SECCION POR DEFECTO']) || (tablas['DATOS DE AUTOESCUELA'] || [])[0];
  const tit = (tablas['DATOS DEL TITULAR'] || [])[0] || {};
  const centro = c ? {
    numero: txt(c['NUMERO DE AUTOESCUELA']), seccion: txt(c['SECCION TRAFICO']), digito_control: txt(c['DIGITO DE SECCION']),
    // «AUTO-ESCUELA " X I N Z O "» → «Auto-Escuela Xinzo»
    denominacion: titulo(txt(c.encabezado1).replace(/["«»]/g, ' ').replace(/\b(\w) (?=\w\b)/g, '$1')) || titulo(c['NOMBRE DE SECCION']),
    direccion: capitalizarNombre(txt(c['DIRECCION DELA AUTOESCUELA'])), codigo_postal: limpiarCP(c['CODIGO POSTAL DE LA AUTOESCUELA']) || '',
    poblacion: titulo(c['POBLACION DE LA AUTOESCUELA']),
    provincia: titulo(c['PROVINCIA DE LA AUTOESCUELA']), telefono: limpiarTelefono(c.TELEFONOAUTOESCUELA) || '',
    email: limpiarEmail(tit.EMAIL_AUTOESCUELA) || limpiarEmail(c.email_sec) || '',
    titular: titulo(tit.TITULAR), cif: txt(tit['CIF AUTOESCUELA']).toUpperCase(), razon_social: titulo(tit.NOMBRESOCIEDAD),
    jefatura: titulo(tit.JEFATURA), centro_examen: titulo(c['CENTRO DE EXAMEN'])
  } : null;

  // ¿Apunta esta autoescuela los cobros en Ariauto? Alumnos aprobados en los
  // dos últimos años: si casi todos salen «debiendo», el saldo no sirve.
  const desdeAptos = restarMeses(hoy, 24);
  let aptosRecientes = 0, aptosConDeuda = 0;
  for (const a of tablas['ALUMNOS'] || []) {
    if (!a['FECHA APROBADO'] || a['FECHA APROBADO'] < desdeAptos) continue;
    const m = libro.get(clave(a.SECCION, a['Nº ALUMNO'])) || [];
    if (!m.length) continue;
    aptosRecientes++;
    if (m.reduce((t, x) => t + euros(x.EURODEBE) - euros(x.EUROHABER), 0) > 1) aptosConDeuda++;
  }
  const fiabilidadCobros = { aptosRecientes, aptosConDeuda, fiable: !aptosRecientes || aptosConDeuda / aptosRecientes < 0.3 };

  const suma = (k, f = x => x[k].length) => filas.reduce((n, x) => n + (x.sinEconomia && (k === 'cargos' || k === 'pagos') ? 0 : f(x)), 0);
  const actualizar = filas.filter(f => f.accion === 'actualizar');
  const resumen = {
    enCurso, terminados, alumnos: filas.length,
    nuevos: filas.filter(f => f.accion === 'nuevo').length, completar: actualizar.length, revisar: filas.filter(f => f.accion === 'revisar').length,
    omitidos: filas.filter(f => f.accion === 'omitir').length, decididas: filas.filter(f => f.manual).length,
    // De los que ya están: cuántos cambian de verdad y qué
    conCambios: actualizar.filter(f => Object.keys(f.cambios).length).length,
    limpiarObservaciones: actualizar.filter(f => 'observaciones' in f.cambios && RE_BLOQUE_V125.test(f.cambios.observaciones.antes || '')).length,
    pasanAInactivo: actualizar.filter(f => f.cambios.estado && f.cambios.estado.despues === 'inactivo').length,
    cargos: suma('cargos'), pagos: suma('pagos'),
    importeCargos: Math.round(filas.reduce((s, f) => s + (f.sinEconomia ? 0 : f.cargos.reduce((t, c) => t + c.importe, 0)), 0) * 100) / 100,
    importePagos: Math.round(filas.reduce((s, f) => s + (f.sinEconomia ? 0 : f.pagos.reduce((t, p) => t + p.cantidad, 0)), 0) * 100) / 100,
    // Clases ya hechas que entran: con su fecha (como las anotadas en Puesta en
    // marcha) o sin ella (bonos); y las que NO entran porque el alumno ya las
    // tiene anotadas en la app
    clases: filas.reduce((n, f) => n + (f.accion === 'nuevo' || f.accion === 'actualizar' ? f.reparto.conFecha.reduce((t, x) => t + x.n, 0) + (f.accion === 'nuevo' || (f.cambios && f.cambios.clases_previas) ? cuarto(f.reparto.sinFecha) : 0) : 0), 0),
    clasesConFecha: filas.reduce((n, f) => n + (f.accion === 'nuevo' || f.accion === 'actualizar' ? f.reparto.conFecha.reduce((t, x) => t + x.n, 0) : 0), 0),
    clasesYaEnApp: actualizar.reduce((n, f) => n + f.reparto.omitidas, 0),
    parecidos: actualizar.filter(f => f.parecido).length,
    // Expedientes de una persona que ya está en la app (otro permiso o curso)
    expedientesAparte: filas.filter(f => f.accion === 'nuevo' && f.otroExpedienteDe).length,
    personasVariosExpedientes: new Set(filas.filter(f => f.otrosExpedientes && f.accion !== 'revisar').map(f => f.kPersona)).size,
    nombresCorregidos: actualizar.filter(f => f.cambios.nombre || f.cambios.primer_apellido || f.cambios.segundo_apellido).length,
    altasCorregidas: actualizar.filter(f => f.cambios.fecha_alta && f.cambios.fecha_alta.antes).length,
    cochesProfesor: cochesProfesor.length,
    examenes: suma('presentaciones'), tasas: suma('tasas'),
    examenesCompletar: filas.reduce((n, f) => n + (f.examenesCompletar ? f.examenesCompletar.length : 0), 0),
    vencimientos: filas.filter(f => f.caducaDni).length + vehiculos.reduce((n, v) => n + v.vencimientos.length, 0),
    profesoresNuevos: profesores.length, profesoresCompletar: profesCompletar.length,
    vehiculosNuevos: vehiculos.filter(v => !v.id).length, vehiculosCompletar: vehiculos.filter(v => v.id && Object.keys(v.cambios).length).length
  };
  return { ok: true, tipo: 'ariauto', hoy, secciones: secs.map(s => ({ ...s, elegida: elegidas.has(s.seccion), yaTraida: seccionesYaTraidas.has(s.nombre) })), opciones: op, resumen, fiabilidadCobros, filas, profesores, profesCompletar, vehiculos, cochesProfesor, centro };
}

// Qué cambia en un alumno que ya está en la app: se completa lo que tiene
// vacío; si viene de la versión 1.25 (bloque «Datos de Ariauto» en las
// observaciones) además se quita ese bloque y se corrige el estado si nadie
// lo ha tocado desde la importación. { campo: { antes, despues } }
function cambiosAlumno(al, fila) {
  const dt = fila.datos;
  const cambios = {};
  const poner = (campo, valor) => { if (String(al[campo] ?? '') !== String(valor ?? '')) cambios[campo] = { antes: al[campo] ?? null, despues: valor ?? null }; };
  const deV125 = RE_BLOQUE_V125.test(al.observaciones || '');
  const campos = ['primer_apellido', 'segundo_apellido', 'dni', 'telefono', 'email', 'fecha_nacimiento', 'direccion', 'codigo_postal', 'poblacion', 'fecha_alta',
    'permisos_posee', 'fecha_fin', ...Object.keys(CAMPOS_EXTRA.alumnos)];
  for (const campo of campos) {
    const v = dt[campo];
    if (vacio(v) || !vacio(al[campo])) continue;
    poner(campo, v);
  }
  // Fecha de alta: la de Ariauto si es anterior (al meterlo a mano en la
  // Puesta en marcha se le puso la de ese día, no la de su matrícula)
  if (dt.fecha_alta && al.fecha_alta && dt.fecha_alta < al.fecha_alta) poner('fecha_alta', dt.fecha_alta);
  // Nombre: el de Ariauto (el del DNI) si en la app está escrito todo en
  // mayúsculas o minúsculas con las mismas palabras, o si es el mismo alumno
  // con una errata (y Ariauto no tiene menos apellidos)
  const textoApp = [al.nombre, al.primer_apellido, al.segundo_apellido].filter(Boolean).join(' ');
  const mismas = claveNombre(al.nombre, al.primer_apellido, al.segundo_apellido) === claveNombre(dt.nombre, dt.primer_apellido, dt.segundo_apellido);
  const enBloque = textoApp === textoApp.toUpperCase() || textoApp === textoApp.toLowerCase();
  const palabras = x => normTexto(x).split(' ').filter(Boolean).length;
  const errata = fila.parecido && palabras([dt.nombre, dt.primer_apellido, dt.segundo_apellido].join(' ')) >= palabras(textoApp);
  if (dt.nombre && ((mismas && enBloque) || errata)) {
    poner('nombre', dt.nombre);
    poner('primer_apellido', dt.primer_apellido || null);
    poner('segundo_apellido', dt.segundo_apellido || null);
  }
  // Clases ya hechas sin fecha (bonos de antes de su primera clase en la app)
  const sinFecha = fila.reparto ? fila.reparto.sinFecha : 0;
  if (sinFecha > 0 && !(al.clases_previas > 0)) poner('clases_previas', cuarto(sinFecha));
  if (deV125) {
    // Las observaciones vuelven a ser solo las suyas: fuera el bloque de la 1.25
    const limpias = (al.observaciones || '').replace(RE_BLOQUE_V125, '').replace(/^\n+|\n+$/g, '').trim();
    const finales = [limpias, dt.observaciones && !limpias.includes(dt.observaciones) ? dt.observaciones.replace(limpias, '').trim() : ''].filter(Boolean).join('\n') || null;
    poner('observaciones', finales);
    if (al.estado === fila.estadoV125 && dt.estado !== al.estado) {
      poner('estado', dt.estado);
      if (vacio(al.resultado) || al.resultado === 'baja') poner('resultado', dt.resultado);
    }
  } else if (vacio(al.observaciones) && dt.observaciones) poner('observaciones', dt.observaciones);
  return cambios;
}

// Lo que necesita la pantalla (sin los cargos/pagos de cada alumno): primero
// los que ya están en la app (lo que más interesa revisar), luego los dudosos
// y al final los nuevos
const ORDEN_PREVIA = { actualizar: 0, revisar: 1, nuevo: 2, omitir: 3 };
function previaAriauto(plan) {
  if (!plan.ok) return plan;
  const { filas, ...resto } = plan;
  return {
    ...resto,
    filas: filas.slice().sort((a, b) => ORDEN_PREVIA[a.accion] - ORDEN_PREVIA[b.accion]).slice(0, MAX_PREVIA).map(f => {
      const conFecha = f.reparto ? f.reparto.conFecha.reduce((t, x) => t + x.n, 0) : 0;
      const sinFecha = f.reparto ? (f.accion === 'nuevo' || (f.cambios && f.cambios.clases_previas) ? cuarto(f.reparto.sinFecha) : 0) : 0;
      return {
        nombre: f.nombre, dni: f.dni, n_registro: f.n_registro, permiso: f.permiso, estado: f.estado, activo: f.activo, accion: f.accion,
        clases: f.accion === 'revisar' ? f.clases : cuarto(conFecha + sinFecha), clasesConFecha: conFecha, clasesYaEnApp: f.reparto ? f.reparto.omitidas : 0,
        primeraApp: f.primeraApp || null, nombreApp: f.nombreApp || null, parecido: !!f.parecido,
        saldo: f.sinEconomia || !plan.opciones.economia ? null : f.saldo, cargos: f.cargos.length, pagos: f.pagos.length, examenes: f.presentaciones.length, avisos: f.avisos,
        cambios: f.cambios ? Object.keys(f.cambios).length : 0,
        // Lo que se le corrige a uno que ya está (para enseñarlo)
        nombreNuevo: f.cambios && (f.cambios.nombre || f.cambios.primer_apellido || f.cambios.segundo_apellido) ? f.nombre : null,
        altaNueva: f.cambios && f.cambios.fecha_alta && f.cambios.fecha_alta.antes ? f.cambios.fecha_alta.despues : null,
        registroNuevo: f.cambios && f.cambios.n_registro ? f.cambios.n_registro.despues : null,
        otrosExpedientes: f.otrosExpedientes || null,
        // Para decidir a mano con quién se junta (o si entra aparte o no se trae)
        clave: f.clave, id: f.id || null, manual: !!f.manual, candidatos: f.candidatosApp || [],
        detalleCambios: f.cambios ? Object.entries(f.cambios).slice(0, 14).map(([campo, v]) => ({ campo, antes: v.antes, despues: v.despues })) : []
      };
    }),
    masFilas: Math.max(0, filas.length - MAX_PREVIA)
  };
}

// ─── IMPORTAR ───────────────────────────────────────────────────────────────

function aplicarAriauto(tablas, opciones = {}, archivo = 'Ariauto') {
  const copia = crearBackup();
  const d = load();
  const plan = planAriauto(tablas, opciones, d);
  const hoy = plan.hoy;
  const s = _sync();
  const sucursal = opciones.sucursal_id ? parseInt(opciones.sucursal_id) : null;
  const ahora = new Date().toISOString();
  const registro = {
    id: `imp-${Date.now()}`, fecha: ahora, tipo: 'ariauto', archivo: String(archivo).slice(0, 120),
    creados: { alumnos: [], profesores: [], vehiculos: [], practicas: [], cargos: [], pagos: [], presentaciones: [], tasas: [], vencimientos: [] },
    actualizados: [], previasRestadas: [], deshecha: null,
    // Para que al volver a abrir el archivo salga lo mismo marcado
    secciones: plan.secciones.filter(x => x.elegida).map(x => x.nombre), alcance: plan.opciones.alcance
  };
  const tocados = new Set(), profTocados = new Set(), vehTocados = new Set();
  for (const k of ['pagos', 'cargos', 'presentaciones', 'tasas', 'vencimientos']) if (!d[k]) d[k] = [];
  // Completa un registro existente y lo apunta para poder deshacerlo
  const completar = (tabla, obj, cambios) => {
    const antes = {}, despues = {};
    for (const [campo, valor] of Object.entries(cambios)) { antes[campo] = obj[campo] ?? null; despues[campo] = valor; obj[campo] = valor; }
    if (Object.keys(antes).length) registro.actualizados.push(tabla === 'alumnos' ? { id: obj.id, antes, despues } : { tabla, id: obj.id, antes, despues });
    return Object.keys(antes).length > 0;
  };

  // Profesores y coches
  const idProf = new Map();
  for (const p of plan.profesores) {
    const id = nextId('pf');
    d.profesores.push({ id, nombre: p.nombre, nota: NOTA_ARIAUTO, sucursal_id: sucursal, dni: p.dni || null, ...camposExtraVacios('profesores'), ...extraerCamposExtra('profesores', p.extra) });
    idProf.set(p.nuevo, id); registro.creados.profesores.push(id); if (s) s.markDirty('profesores', id);
  }
  for (const pc of plan.profesCompletar || []) {
    const p = d.profesores.find(x => x.id === pc.id);
    if (p && completar('profesores', p, pc.cambios)) profTocados.add(p.id);
  }
  const profId = p => (!p ? null : p.id || idProf.get(p.nuevo) || null);
  const idPorMatricula = new Map();
  for (const v of plan.vehiculos) {
    let vid = v.id;
    if (!vid) {
      vid = nextId('v');
      d.vehiculos.push({ id: vid, nombre: v.nombre, matricula: v.matricula, km_actual: 0, sucursal_id: sucursal, ...camposExtraVacios('vehiculos'), ...v.datos });
      registro.creados.vehiculos.push(vid); if (s) s.markDirty('vehiculos', vid);
    } else {
      const coche = d.vehiculos.find(x => x.id === vid);
      if (coche && completar('vehiculos', coche, v.cambios)) vehTocados.add(vid);
    }
    idPorMatricula.set(v.matricula, vid);
    for (const x of v.vencimientos) {
      const ya = d.vencimientos.some(y => !y.deleted && y.entidad_tipo === 'vehiculo' && y.entidad_id === vid && y.tipo === x.tipo && y.fecha_vencimiento === x.fecha);
      if (ya) continue;
      const id = nextId('venc');
      d.vencimientos.push({ id, entidad_tipo: 'vehiculo', entidad_id: vid, tipo: x.tipo, descripcion: x.descripcion, fecha_vencimiento: x.fecha, nota: NOTA_ARIAUTO, completado: false, sucursal_id: sucursal });
      registro.creados.vencimientos.push(id);
    }
  }

  // Coche habitual de los profesores que no lo tenían (el que más usan en la
  // app o el de sus exámenes en Ariauto)
  for (const cp of plan.cochesProfesor || []) {
    const vid = cp.vehiculo_id || idPorMatricula.get(cp.matricula);
    const p = d.profesores.find(x => x.id === profId(cp.profesor));
    if (!vid || !p || p.vehiculo_id) continue;
    if (cp.profesor.nuevo) p.vehiculo_id = vid; // creado ahora: deshacer lo quita entero
    else if (completar('profesores', p, { vehiculo_id: vid })) profTocados.add(p.id);
  }
  const cocheDe = pid => {
    const p = pid ? d.profesores.find(x => x.id === pid) : null;
    const v = p && p.vehiculo_id ? d.vehiculos.find(x => x.id === p.vehiculo_id && !x.deleted && x.activo !== false) : null;
    return v ? v.id : null;
  };

  // Alumnos
  const extrasAlumno = Object.keys(CAMPOS_EXTRA.alumnos);
  for (const f of plan.filas) {
    if (f.accion === 'revisar' || f.accion === 'omitir') continue;
    const dt = f.datos;
    let a;
    if (f.accion === 'nuevo') {
      a = {
        id: nextId('a'), nombre: dt.nombre, primer_apellido: dt.primer_apellido, segundo_apellido: dt.segundo_apellido,
        permiso: dt.permiso, vehiculo_id: cocheDe(profId(dt.profesor)), profesor_id: profId(dt.profesor), sucursal_id: sucursal, email: dt.email, n_inscripcion: null,
        telefono: dt.telefono, dni: dt.dni, fecha_nacimiento: dt.fecha_nacimiento, direccion: dt.direccion, fecha_alta: dt.fecha_alta || hoy,
        observaciones: dt.observaciones, estado: dt.estado, codigo_postal: dt.codigo_postal, poblacion: dt.poblacion,
        permisos_posee: dt.permisos_posee, fecha_inicio: dt.fecha_alta, fecha_fin: dt.fecha_fin, resultado: dt.resultado, permisos: dt.permisos,
        clases_previas: dt.clases_previas || 0, km_previos: 0,
        ...Object.fromEntries(extrasAlumno.map(c => [c, dt[c] ?? null]))
      };
      d.alumnos.push(a);
      registro.creados.alumnos.push(a.id);
      tocados.add(a.id);
    } else {
      a = d.alumnos.find(x => x.id === f.id);
      if (!a) continue;
      const cambios = Object.fromEntries(Object.entries(f.cambios || {}).map(([c, v]) => [c, v.despues]));
      if (vacio(a.profesor_id) && profId(dt.profesor)) cambios.profesor_id = profId(dt.profesor);
      if (vacio(a.vehiculo_id) && cocheDe(cambios.profesor_id || a.profesor_id)) cambios.vehiculo_id = cocheDe(cambios.profesor_id || a.profesor_id);
      if (completar('alumnos', a, cambios)) tocados.add(a.id);
    }
    // Sus clases de Ariauto con su día (las que el alumno no tenga ya en la
    // app), como las anotadas en Puesta en marcha: sin km ni hora
    for (const { fecha, n } of f.reparto.conFecha) {
      for (const valor of trocearClases(n)) {
        const id = nextId('p');
        d.practicas.push({
          id, alumno_id: a.id, vehiculo_id: a.vehiculo_id || cocheDe(a.profesor_id) || null, fecha, km_inicial: 0, km_final: 0,
          profesor_id: a.profesor_id || null, tipo: 'circulacion', sucursal_id: a.sucursal_id || null, nota: NOTA_CLASE,
          hora_inicio: null, tipo_detalle: MARCA_ANTERIOR, ...(valor < 1 ? { fraccion: valor } : {}), updated_at: ahora
        });
        registro.creados.practicas.push(id);
      }
    }
    if (!f.sinEconomia) {
      for (const c of f.cargos) {
        const id = nextId('cargo');
        d.cargos.push({ id, alumno_id: a.id, concepto: c.concepto, tipo: c.tipo, importe: c.importe, fecha: c.fecha, sucursal_id: a.sucursal_id || null, nota: NOTA_ARIAUTO, deleted: false, updated_at: ahora });
        registro.creados.cargos.push(id);
      }
      for (const p of f.pagos) {
        const id = nextId('pg');
        d.pagos.push({ id, alumno_id: a.id, fecha: p.fecha, cantidad: p.cantidad, nota: `${p.nota} (${NOTA_ARIAUTO.toLowerCase()})`, sucursal_id: a.sucursal_id || null, forma_pago: p.forma_pago, empleado: null });
        registro.creados.pagos.push(id);
      }
    }
    for (const e of f.presentaciones) {
      const id = nextId('pres');
      d.presentaciones.push({
        id, alumno_id: a.id, tipo: e.tipo, fecha: e.fecha, profesor_id: profId(e.profesor), n_convocatoria: e.n_convocatoria, resultado: e.resultado,
        sucursal_id: a.sucursal_id || null, nota: e.nota, permiso: e.permiso, examinador: e.examinador, vehiculo: e.vehiculo,
        fallos: e.fallos, fallos_detalle: e.fallos_detalle, n_solicitud: e.n_solicitud
      });
      registro.creados.presentaciones.push(id);
    }
    for (const x of f.examenesCompletar || []) {
      const ex = d.presentaciones.find(y => y.id === x.id);
      if (ex) completar('presentaciones', ex, x.cambios);
    }
    for (const t of f.tasas) {
      const id = nextId('tasa');
      d.tasas.push({ id, alumno_id: a.id, concepto: t.concepto, fecha_compra: t.fecha_compra, fecha_caducidad: null, importe: t.importe, estado: t.estado, sucursal_id: a.sucursal_id || null, nota: NOTA_ARIAUTO, n_justificante: t.n_justificante, tipo_tasa: t.tipo_tasa });
      registro.creados.tasas.push(id);
    }
    for (const x of f.tasasCompletar || []) {
      const ta = d.tasas.find(y => y.id === x.id);
      if (ta) completar('tasas', ta, x.cambios);
    }
    if (f.caducaDni) {
      const id = nextId('venc');
      d.vencimientos.push({ id, entidad_tipo: 'alumno', entidad_id: a.id, tipo: 'DNI', descripcion: `DNI de ${nombreDe(a)}`, fecha_vencimiento: f.caducaDni, nota: NOTA_ARIAUTO, completado: false, sucursal_id: a.sucursal_id || null });
      registro.creados.vencimientos.push(id);
    }
  }

  const actualizadosAlumnos = registro.actualizados.filter(x => !x.tabla).length;
  registro.resumen = { ...plan.resumen, creadosAlumnos: registro.creados.alumnos.length, actualizadosAlumnos };
  registrarImportacion(d, registro);
  addLog('importacion', `Datos traídos de Ariauto (${registro.archivo}): ${registro.creados.alumnos.length} alumnos nuevos, ${actualizadosAlumnos} completados, ${registro.creados.practicas.length} clases con su fecha, ${registro.creados.presentaciones.length} exámenes, ${registro.creados.cargos.length} cargos y ${registro.creados.pagos.length} pagos`, []);
  save();
  if (s) {
    s.markDirtyVarios('alumnos', tocados);
    s.markDirtyVarios('practicas', registro.creados.practicas);
    s.markDirtyVarios('profesores', [...profTocados, ...registro.creados.profesores]);
    s.markDirtyVarios('vehiculos', vehTocados);
    s.markDirtyVarios('cargos', registro.creados.cargos);
    s.markDirtyVarios('pagos', registro.creados.pagos);
  }
  return { ok: true, id: registro.id, resumen: registro.resumen, centro: plan.centro, copia: copia && copia.ok ? copia.file : null };
}

module.exports = { leerAccess, esAriauto, planAriauto, previaAriauto, aplicarAriauto, _ariauto: { secciones, fechaDe, detalleFallos, paisDe, cambiosAlumno, repartirClases, trocearClases } };
