/**
 * db/ariauto.js  –  traer los datos de Ariauto (programa de gestión de
 * autoescuelas que guarda todo en una base de datos Access .accdb/.mdb).
 *
 * Qué hay en Ariauto (investigado con la base real de una autoescuela):
 *  - ALUMNOS (clave = SECCION + «Nº ALUMNO»): datos personales completos, DNI
 *    con la letra aparte, domicilio en trozos, permiso y profesor por código,
 *    estado en «motivo_archivado» (BAJA, APTO…) y «FECHA APROBADO».
 *  - GASTOS E INGRESOS: la cuenta de cada alumno hasta hoy. TIPOAPUNTE 3 =
 *    cargo (EURODEBE; las clases se cargan en bloque: «14-CLASES PRÁCTICAS»),
 *    TIPOAPUNTE 1 = pago (EUROHABER).
 *  - PRACTICAS: clases con fecha, pero sin km ni hora y solo hasta 2012.
 *  - FECHA DE EXAMEN (tipo 1/2/3/6 teórico, 4 pista, 5 circulación; resultado
 *    1 apto, 2 no apto, 4 no presentado), Tasas_Alumnos, PROFESORES, VEHICULOS
 *    (ITV, seguro), PERMISOS (código → letras) y DATOS DE AUTOESCUELA (centro).
 *
 * Cómo entra en la app (vista previa → importar → deshacer, como el resto de
 * «Traer de otro programa», ver db/migracion.js):
 *  - Alumnos en curso (por defecto) o también los terminados; por secciones.
 *  - Sus clases ya hechas = las cobradas en Ariauto (o las de PRACTICAS si
 *    son más): «clases ya hechas» de la app, no se vuelven a cobrar.
 *  - Cada cargo y cada pago, tal cual → el saldo es el mismo que en Ariauto.
 *  - Exámenes, tasas, caducidad del DNI, ITV y seguro de los coches.
 *  - Lo que la app no tiene como campo (sexo, nacionalidad, lugar de
 *    nacimiento, provincia, tutor, nº de expediente) va a las observaciones.
 *  - Alumno que ya está en la app (por DNI o nombre): se completan sus datos;
 *    su economía solo si aún no tiene cobros en la app (no se duplica nada).
 *
 * leerAriauto (Electron: lee el archivo, async porque mdb-reader es ESM) y
 * planAriauto/aplicarAriauto (síncronos, probados con tablas sintéticas).
 */

const fs = require('fs');
const path = require('path');
const { load, save, nextId, _sync, addLog, crearBackup, hoyLocalISO } = require('./core');
const mig = require('./migracion');
const { normTexto, claveNombre, capitalizarNombre, limpiarDni, limpiarTelefono, limpiarEmail, limpiarCP } = mig._norm;
const { indices, buscarAlumno, nombreDe, limpiarMatricula, registrarImportacion } = mig._interno;

const NOTA_ARIAUTO = 'Importado de Ariauto';
const MAX_PREVIA = 400;

// Columnas que se leen de cada tabla (el resto no se usa: la base pesa decenas de MB)
const COLUMNAS = {
  'ALUMNOS': ['Nº ALUMNO', 'SECCION', 'NOMBREALUMNO', 'PRIMER APELLIDO', 'SEGUNDO APELLIDO', 'DOMICILIO DEL ALUMNO', 'Nº', 'PISO', 'LETRA',
    'Tipo_de_Via', 'MUNICIPIO DEL ALUMNO', 'PUEBL0 DEL ALUMNO', 'nombre_nuevo_municipio_alm', 'C-P DEL ALUMNO', 'PROVINCIA DEL ALUMNO',
    'TELEFONO', 'TELEFONO2', 'DNI DEL ALUMNO', 'NIF DEL ALUMNO', 'CADUCA DNI', 'SEXO', 'FECHA NACIMIENTO', 'FECHA DE INGRESO', 'FECHA DE ALTA',
    'FECHA APROBADO', 'POSEE PERMISO', 'POSEE PERMISO2', 'POSEE PERMISO3', 'POSEE PERMISO4', 'PROFESOR', 'PERMISO', 'PERMISO2', 'OBSERVACIONES',
    'LUGAR DE NACIMIENTO', 'Nacionalidad', 'NOMBRE_PAIS', 'email_al', 'Nombre_tutor', 'Apellido1_tutor', 'Apellido2_tutor', 'DNI_tutor', 'NIF_tutor',
    'motivo_archivado', 'Teorico_Apto'],
  'PERMISOS': ['NUMERO PERMISO', 'NOMBRE PERMISO'],
  'PROFESORES': ['NUMERO PROFESOR', 'NOMBRE', 'PRIMER APELLIDO PRF', 'SEGUNDO APELLIDO PRF', 'DNI', 'FECHA DE BAJA'],
  'VEHICULOS': ['NUMERO DE VEHICULO', 'MATRICULA', 'MARCA', 'MODELO', 'FECHA DE BAJA', 'PROXIMA REVISION', 'VENCIMIENTO DEL SEGURO', 'NOMBRE CIA DE SEGURO', 'NUMERO DE POLIZA'],
  'GASTOS E INGRESOS': ['APUNTE', 'Nº ALUMNO', 'SECCION IOG', 'FECHA', 'CONCEPTO', 'CANTIDAD', 'EURODEBE', 'EUROHABER', 'TIPOAPUNTE'],
  'PRACTICAS': ['Nº ALUMNO', 'SECCIONPRAC', 'FECHA', 'CANTIDAD'],
  'FECHA DE EXAMEN': ['IDENTIFICADOR', 'F EXAMEN', 'Nº ALUMNO', 'SECCIONEX', 'TIPO DE EXAMEN', 'RESULTADO DE EXAMEN', 'PROFESOR', 'PERMISO EXAMEN', 'CONVOCATORIA', 'FALLOS'],
  'Tasas_Alumnos': ['IdTasa', 'TipoTasa', 'FechaCompra', 'Importe', 'Nº ALUMNO', 'SECCION', 'F EXAMEN'],
  'DATOS DE AUTOESCUELA': ['SECCION', 'NUMERO DE AUTOESCUELA', 'NOMBRE DE SECCION', 'DIGITO DE SECCION', 'SECCION POR DEFECTO', 'SECCION TRAFICO',
    'DIRECCION DELA AUTOESCUELA', 'CODIGO POSTAL DE LA AUTOESCUELA', 'POBLACION DE LA AUTOESCUELA', 'PROVINCIA DE LA AUTOESCUELA', 'TELEFONOAUTOESCUELA', 'encabezado1']
};
const TABLAS_CLAVE = ['ALUMNOS', 'GASTOS E INGRESOS', 'DATOS DE AUTOESCUELA'];

const pad = n => String(n).padStart(2, '0');
const txt = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
// Access guarda las fechas sin hora: mdb-reader las da a las 00:00 UTC
const fechaDe = v => (v instanceof Date && !isNaN(v) ? `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}` : null);
const num = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const euros = v => Math.round(num(v) * 100) / 100;
const clave = (seccion, n) => `${seccion}|${txt(n)}`;
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

const ESTADO_ARCHIVO = { BAJA: 'baja', INACTIVO: 'baja', INACTIVA: 'baja', 'NO ACTIVO': 'baja', 'NO ACTIVA': 'baja', APTO: 'apto' };
const TIPO_EXAMEN = { 1: 'teorico', 2: 'teorico', 3: 'teorico', 6: 'teorico', 4: 'maniobras', 5: 'circulacion' };
const RESULTADO_EXAMEN = { 1: 'apto', 2: 'no_apto', 3: 'aplazado', 4: 'no_presentado' };
const PERMISO_APP = { EC: 'CE', ED: 'DE', MER: 'CAP', VIA: 'CAP', LVA: 'B' };
const RE_CLASE = /CLASE|PR[AÁ]CTIC/i;
const RE_NO_CLASE = /TE[OÓ]RIC|EX[AÁ]MEN|PRUEBA|CURSO|TASA|MATR[IÍ]CULA|RENOVACI|DERECHOS|ABONO/i;
const esSeccionCurso = nombre => /\bCAP\b|M\.?\s?P\.?\s?0?\d|MERCANC/i.test(nombre || '');

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

/**
 * Plan determinista de la importación (la vista previa). `tablas` = lo que
 * devuelve leerAriauto; `opciones`: { alcance: 'curso'|'todos', secciones:[],
 * economia, examenes, tasas, profesores, vehiculos, sucursal_id, hoy }.
 */
function planAriauto(tablas, opciones = {}, d = load()) {
  const hoy = opciones.hoy || hoyLocalISO();
  const secs = secciones(tablas);
  const elegidas = new Set(Array.isArray(opciones.secciones) && opciones.secciones.length
    ? opciones.secciones.map(Number) : secs.filter(s => !s.curso).map(s => s.seccion));
  // economia: false por defecto. En Ariauto no se apuntan la mayoría de los
  // cobros (efectivo…): en la base real, 253 de 257 alumnos aprobados desde
  // 2024 salían «debiendo» (mediana 692 €). Traer su saldo llenaría la app de
  // falsos morosos; se deja como opción, con este aviso (fiabilidadCobros).
  const op = { economia: false, examenes: true, tasas: true, profesores: true, vehiculos: true, alcance: 'curso', ...opciones };
  const desdeAlta = restarMeses(hoy, 18), desdeActividad = restarMeses(hoy, 12);

  const permisos = new Map((tablas['PERMISOS'] || []).map(p => [p['NUMERO PERMISO'], txt(p['NOMBRE PERMISO']).toUpperCase()]));
  const letras = cod => { const p = permisos.get(cod); return p ? (PERMISO_APP[p] || p) : null; };
  const libro = agrupar(tablas['GASTOS E INGRESOS'], 'SECCION IOG');
  const practicas = agrupar(tablas['PRACTICAS'], 'SECCIONPRAC');
  const examenes = agrupar(tablas['FECHA DE EXAMEN'], 'SECCIONEX');
  const tasas = agrupar(tablas['Tasas_Alumnos'], 'SECCION');

  // Profesores de Ariauto → los de la app (por DNI o nombre) o nuevos
  const profApp = d.profesores.filter(p => !p.deleted);
  const profPorCodigo = new Map();
  const profesNuevos = [];
  for (const p of tablas['PROFESORES'] || []) {
    const nombre = [p.NOMBRE, p['PRIMER APELLIDO PRF'], p['SEGUNDO APELLIDO PRF']].map(titulo).filter(Boolean).join(' ');
    if (!nombre) continue;
    const dni = limpiarDni(p.DNI).valor;
    const k = claveNombre(nombre);
    const existe = profApp.find(x => (dni && limpiarDni(x.dni).valor === dni) || claveNombre(x.nombre) === k);
    profPorCodigo.set(p['NUMERO PROFESOR'], existe ? { id: existe.id, nombre: existe.nombre }
      : { nuevo: `ariauto-prof-${p['NUMERO PROFESOR']}`, nombre, dni, deBaja: !!p['FECHA DE BAJA'] });
  }

  const idx = indices(d);
  const filas = [];
  const vistos = new Set();
  const profUsados = new Set();
  let enCurso = 0, terminados = 0;
  for (const a of tablas['ALUMNOS'] || []) {
    if (!elegidas.has(a.SECCION)) continue;
    const k = clave(a.SECCION, a['Nº ALUMNO']);
    const movs = libro.get(k) || [], pracs = practicas.get(k) || [], exs = examenes.get(k) || [], tas = tasas.get(k) || [];
    const archivo = txt(a.motivo_archivado).toUpperCase();
    let estado = ESTADO_ARCHIVO[archivo] || (a['FECHA APROBADO'] ? 'apto' : a.Teorico_Apto ? 'en_practicas' : 'matriculado');
    const terminado = estado === 'baja' || estado === 'apto';
    const alta = a['FECHA DE ALTA'] || a['FECHA DE INGRESO'] || null;
    const ultima = [alta, ...movs.map(m => m.FECHA), ...exs.map(e => e['F EXAMEN']), ...pracs.map(p => p.FECHA)].filter(Boolean).sort().pop() || null;
    const activo = !terminado && ((alta && alta >= desdeAlta) || (ultima && ultima >= desdeActividad));
    if (activo) enCurso++; else terminados++;
    if (op.alcance !== 'todos' && !activo) continue;

    // Persona
    const nombre = titulo(a.NOMBREALUMNO), a1 = capitalizarNombre(txt(a['PRIMER APELLIDO']), { apellido: true }), a2 = capitalizarNombre(txt(a['SEGUNDO APELLIDO']), { apellido: true });
    if (!nombre && !a1) continue;
    // DNI o NIE sin la letra (Ariauto la guarda aparte, en «NIF DEL ALUMNO»)
    const docTxt = txt(a['DNI DEL ALUMNO']) + (/^[XYZ]?\d{6,8}$/i.test(txt(a['DNI DEL ALUMNO']).replace(/[\s.-]/g, '')) ? txt(a['NIF DEL ALUMNO']) : '');
    const dni = limpiarDni(docTxt);
    const kPersona = dni.valor || claveNombre(nombre, a1, a2);
    if (vistos.has(kPersona)) continue; // repetido en otra sección
    vistos.add(kPersona);

    const via = txt(a.Tipo_de_Via), dom = txt(a['DOMICILIO DEL ALUMNO']);
    const calle = capitalizarNombre([via && !dom.toUpperCase().startsWith(via.toUpperCase()) ? via : '', dom].filter(Boolean).join(' '));
    const direccion = [calle, txt(a['Nº']) && `nº ${txt(a['Nº'])}`, txt(a.PISO), txt(a.LETRA)].filter(Boolean).join(' ') || null;
    const poblacion = titulo(a['PUEBL0 DEL ALUMNO'] || a.nombre_nuevo_municipio_alm || a['MUNICIPIO DEL ALUMNO']) || null;
    const tels = [limpiarTelefono(a.TELEFONO), limpiarTelefono(a.TELEFONO2)].filter(Boolean);
    const permiso = letras(a.PERMISO) || 'B';
    const posee = [a['POSEE PERMISO'], a['POSEE PERMISO2'], a['POSEE PERMISO3'], a['POSEE PERMISO4']].map(letras).filter(Boolean);
    const otros = [letras(a.PERMISO2)].filter(p => p && p !== permiso);
    const tutor = [a.Nombre_tutor, a.Apellido1_tutor, a.Apellido2_tutor].map(titulo).filter(Boolean).join(' ');
    const extra = [
      `Nº ${txt(a['Nº ALUMNO'])} (sección ${(secs.find(s => s.seccion === a.SECCION) || {}).nombre || a.SECCION})`,
      a.SEXO === '1' || a.SEXO === 1 ? 'Sexo: hombre' : a.SEXO === '2' || a.SEXO === 2 ? 'Sexo: mujer' : '',
      txt(a.Nacionalidad || a.NOMBRE_PAIS) && `Nacionalidad: ${titulo(a.Nacionalidad || a.NOMBRE_PAIS)}`,
      txt(a['LUGAR DE NACIMIENTO']) && `Nació en ${titulo(a['LUGAR DE NACIMIENTO'])}`,
      txt(a['PROVINCIA DEL ALUMNO']) && `Provincia: ${titulo(a['PROVINCIA DEL ALUMNO'])}`,
      tels.length > 1 ? `Otro teléfono: ${tels[1]}` : '',
      tutor && `Tutor: ${tutor}${txt(a.DNI_tutor) ? ` (DNI ${limpiarDni(txt(a.DNI_tutor) + txt(a.NIF_tutor)).valor})` : ''}`,
      a['FECHA APROBADO'] && `Aprobó el ${a['FECHA APROBADO'].split('-').reverse().join('/')}`
    ].filter(Boolean).join(' · ');
    const observaciones = [txt(a.OBSERVACIONES), `Datos de Ariauto: ${extra}`].filter(Boolean).join('\n');
    const prof = profPorCodigo.get(a.PROFESOR) || null;
    if (prof && prof.nuevo) profUsados.add(prof.nuevo);

    // Clases ya hechas = las cargadas en su cuenta de Ariauto; y, si se pide,
    // los cargos y pagos (solo de los alumnos en curso)
    const cargos = [], pagos = [];
    let clasesCobradas = 0;
    for (const m of activo ? movs : []) {
      const concepto = txt(m.CONCEPTO) || 'Apunte de Ariauto';
      const debe = euros(m.EURODEBE), haber = euros(m.EUROHABER);
      const fecha = m.FECHA || alta || hoy;
      if (debe && RE_CLASE.test(concepto) && !RE_NO_CLASE.test(concepto)) clasesCobradas += num(m.CANTIDAD) || 0;
      if (!op.economia) continue;
      if (debe) cargos.push({ concepto: concepto.slice(0, 120), tipo: tipoCargo(concepto, debe), importe: debe, fecha });
      if (haber) pagos.push({ fecha, cantidad: haber, nota: concepto.slice(0, 120), forma_pago: formaPago(concepto) });
    }
    const clasesFicha = pracs.reduce((n, p) => n + (num(p.CANTIDAD) || 1), 0);
    const clases = Math.round(Math.max(clasesCobradas, clasesFicha) * 4) / 4;
    const saldo = Math.round((cargos.reduce((s, c) => s + c.importe, 0) - pagos.reduce((s, p) => s + p.cantidad, 0)) * 100) / 100;

    const presentaciones = activo && op.examenes ? exs.filter(e => e['F EXAMEN']).map(e => ({
      tipo: TIPO_EXAMEN[e['TIPO DE EXAMEN']] || 'teorico', fecha: e['F EXAMEN'],
      resultado: RESULTADO_EXAMEN[e['RESULTADO DE EXAMEN']] || 'pendiente',
      n_convocatoria: num(e.CONVOCATORIA) || 1, profesor: profPorCodigo.get(e.PROFESOR) || null,
      nota: [`Ariauto: ${letras(e['PERMISO EXAMEN']) || ''}`.trim(), num(e.FALLOS) ? `${num(e.FALLOS)} fallos` : ''].filter(Boolean).join(' · ')
    })) : [];
    const tasasAl = activo && op.tasas ? tas.map(t => ({
      concepto: `Tasa ${txt(t.TipoTasa)}${txt(t.IdTasa) ? ' · ' + txt(t.IdTasa) : ''}`.slice(0, 120), fecha_compra: t.FechaCompra || null,
      importe: euros(t.Importe) || null, estado: t['F EXAMEN'] && t['F EXAMEN'] < hoy ? 'usada' : 'vigente'
    })) : [];
    const caducaDni = activo && a['CADUCA DNI'] && a['CADUCA DNI'] >= hoy ? a['CADUCA DNI'] : null;

    const persona = { nombre: nombre || a1, primer_apellido: nombre ? a1 : '', segundo_apellido: a2, dni };
    const enApp = buscarAlumno(idx, persona);
    const datos = {
      nombre: persona.nombre, primer_apellido: persona.primer_apellido || null, segundo_apellido: persona.segundo_apellido || null,
      dni: dni.valor, telefono: tels[0] || null, email: limpiarEmail(a.email_al), fecha_nacimiento: a['FECHA NACIMIENTO'] || null,
      direccion, codigo_postal: limpiarCP(a['C-P DEL ALUMNO']), poblacion, permiso, permisos: otros, fecha_alta: alta,
      estado, observaciones, permisos_posee: posee.length ? [...new Set(posee)].join(', ') : null,
      resultado: estado === 'apto' ? 'apto' : estado === 'baja' ? 'baja' : null, fecha_fin: a['FECHA APROBADO'] || null,
      clases_previas: clases, profesor: prof
    };
    const fila = {
      clave: k, nombre: [datos.nombre, datos.primer_apellido, datos.segundo_apellido].filter(Boolean).join(' '), dni: dni.valor, permiso, estado, activo,
      clases, saldo, cargos, pagos, presentaciones, tasas: tasasAl, caducaDni, datos, avisos: []
    };
    if (dni.valor && !dni.valido) fila.avisos.push('DNI con letra que no cuadra');
    if (enApp.alumno) {
      const al = enApp.alumno;
      fila.accion = 'actualizar'; fila.id = al.id;
      const conCobros = (d.pagos || []).some(p => p.alumno_id === al.id && !p.deleted) || (d.cargos || []).some(c => c.alumno_id === al.id && !c.deleted);
      if (conCobros && (cargos.length || pagos.length)) { fila.sinEconomia = true; fila.avisos.push('Ya tiene cobros en la app: no se traen los de Ariauto'); }
    } else if (enApp.ambiguo || enApp.mismoNombre) {
      fila.accion = 'revisar'; fila.avisos.push(enApp.ambiguo ? 'Hay varios alumnos con este nombre en la app: no se toca' : 'En la app hay otro alumno con este nombre y otro DNI: no se toca');
    } else fila.accion = 'nuevo';
    filas.push(fila);
  }

  // Coches de alta en Ariauto → los de la app (por matrícula) o nuevos, con ITV y seguro
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
      vehiculos.push({ matricula: mat, nombre: [titulo(v.MARCA), titulo(v.MODELO)].filter(Boolean).join(' ').slice(0, 60) || `Coche ${mat}`, id: existe ? existe.id : null, vencimientos });
    }
  }
  // Profesores nuevos: los que siguen de alta y los que tienen alumnos importados
  const profesores = op.profesores
    ? [...profPorCodigo.values()].filter((p, i, arr) => p.nuevo && (!p.deBaja || profUsados.has(p.nuevo)) && arr.findIndex(x => x.nuevo === p.nuevo) === i)
    : [];

  // Datos del centro (los de la sección por defecto)
  const c = (tablas['DATOS DE AUTOESCUELA'] || []).find(x => x['SECCION POR DEFECTO']) || (tablas['DATOS DE AUTOESCUELA'] || [])[0];
  const centro = c ? {
    numero: txt(c['NUMERO DE AUTOESCUELA']), seccion: txt(c['SECCION TRAFICO']), digito_control: txt(c['DIGITO DE SECCION']),
    // «AUTO-ESCUELA " X I N Z O "» → «Auto-Escuela Xinzo»
    denominacion: titulo(txt(c.encabezado1).replace(/["«»]/g, ' ').replace(/\b(\w) (?=\w\b)/g, '$1')) || titulo(c['NOMBRE DE SECCION']),
    direccion: capitalizarNombre(txt(c['DIRECCION DELA AUTOESCUELA'])), codigo_postal: limpiarCP(c['CODIGO POSTAL DE LA AUTOESCUELA']) || '',
    poblacion: titulo(c['POBLACION DE LA AUTOESCUELA'])
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
  const resumen = {
    enCurso, terminados, alumnos: filas.length,
    nuevos: filas.filter(f => f.accion === 'nuevo').length, completar: filas.filter(f => f.accion === 'actualizar').length, revisar: filas.filter(f => f.accion === 'revisar').length,
    cargos: suma('cargos'), pagos: suma('pagos'),
    importeCargos: Math.round(filas.reduce((s, f) => s + (f.sinEconomia ? 0 : f.cargos.reduce((t, c) => t + c.importe, 0)), 0) * 100) / 100,
    importePagos: Math.round(filas.reduce((s, f) => s + (f.sinEconomia ? 0 : f.pagos.reduce((t, p) => t + p.cantidad, 0)), 0) * 100) / 100,
    clases: filas.reduce((n, f) => n + f.clases, 0), examenes: suma('presentaciones'), tasas: suma('tasas'),
    vencimientos: filas.filter(f => f.caducaDni).length + vehiculos.reduce((n, v) => n + v.vencimientos.length, 0),
    profesoresNuevos: profesores.length, vehiculosNuevos: vehiculos.filter(v => !v.id).length
  };
  return { ok: true, tipo: 'ariauto', hoy, secciones: secs.map(s => ({ ...s, elegida: elegidas.has(s.seccion) })), opciones: op, resumen, fiabilidadCobros, filas, profesores, vehiculos, centro };
}

// Lo que necesita la pantalla (sin los cargos/pagos de cada alumno)
function previaAriauto(plan) {
  if (!plan.ok) return plan;
  const { filas, ...resto } = plan;
  return {
    ...resto,
    filas: filas.slice(0, MAX_PREVIA).map(f => ({
      nombre: f.nombre, dni: f.dni, permiso: f.permiso, estado: f.estado, activo: f.activo, accion: f.accion, clases: f.clases,
      saldo: f.sinEconomia || !plan.opciones.economia ? null : f.saldo, cargos: f.cargos.length, pagos: f.pagos.length, examenes: f.presentaciones.length, avisos: f.avisos
    })),
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
    actualizados: [], previasRestadas: [], deshecha: null
  };
  const tocados = new Set();
  for (const k of ['pagos', 'cargos', 'presentaciones', 'tasas', 'vencimientos']) if (!d[k]) d[k] = [];

  // Profesores y coches
  const idProf = new Map();
  for (const p of plan.profesores) {
    const id = nextId('pf');
    d.profesores.push({ id, nombre: p.nombre, nota: NOTA_ARIAUTO, sucursal_id: sucursal, dni: p.dni || null });
    idProf.set(p.nuevo, id); registro.creados.profesores.push(id); if (s) s.markDirty('profesores', id);
  }
  const profId = p => (!p ? null : p.id || idProf.get(p.nuevo) || null);
  for (const v of plan.vehiculos) {
    let vid = v.id;
    if (!vid) {
      vid = nextId('v');
      d.vehiculos.push({ id: vid, nombre: v.nombre, matricula: v.matricula, km_actual: 0, sucursal_id: sucursal });
      registro.creados.vehiculos.push(vid); if (s) s.markDirty('vehiculos', vid);
    }
    for (const x of v.vencimientos) {
      const ya = d.vencimientos.some(y => !y.deleted && y.entidad_tipo === 'vehiculo' && y.entidad_id === vid && y.tipo === x.tipo && y.fecha_vencimiento === x.fecha);
      if (ya) continue;
      const id = nextId('venc');
      d.vencimientos.push({ id, entidad_tipo: 'vehiculo', entidad_id: vid, tipo: x.tipo, descripcion: x.descripcion, fecha_vencimiento: x.fecha, nota: NOTA_ARIAUTO, completado: false, sucursal_id: sucursal });
      registro.creados.vencimientos.push(id);
    }
  }

  // Alumnos
  for (const f of plan.filas) {
    if (f.accion === 'revisar') continue;
    const dt = f.datos;
    let a;
    if (f.accion === 'nuevo') {
      a = {
        id: nextId('a'), nombre: dt.nombre, primer_apellido: dt.primer_apellido, segundo_apellido: dt.segundo_apellido,
        permiso: dt.permiso, vehiculo_id: null, profesor_id: profId(dt.profesor), sucursal_id: sucursal, email: dt.email, n_inscripcion: null,
        telefono: dt.telefono, dni: dt.dni, fecha_nacimiento: dt.fecha_nacimiento, direccion: dt.direccion, fecha_alta: dt.fecha_alta || hoy,
        observaciones: dt.observaciones, estado: dt.estado, codigo_postal: dt.codigo_postal, poblacion: dt.poblacion,
        permisos_posee: dt.permisos_posee, fecha_inicio: dt.fecha_alta, fecha_fin: dt.fecha_fin, resultado: dt.resultado, permisos: dt.permisos,
        clases_previas: dt.clases_previas || 0, km_previos: 0
      };
      d.alumnos.push(a);
      registro.creados.alumnos.push(a.id);
    } else {
      a = d.alumnos.find(x => x.id === f.id);
      if (!a) continue;
      // Solo se completa lo que está vacío en la app
      const antes = {}, despues = {};
      const campos = { primer_apellido: dt.primer_apellido, segundo_apellido: dt.segundo_apellido, dni: dt.dni, telefono: dt.telefono, email: dt.email,
        fecha_nacimiento: dt.fecha_nacimiento, direccion: dt.direccion, codigo_postal: dt.codigo_postal, poblacion: dt.poblacion, fecha_alta: dt.fecha_alta,
        permisos_posee: dt.permisos_posee, observaciones: dt.observaciones, profesor_id: profId(dt.profesor), clases_previas: dt.clases_previas || null };
      for (const [campo, valor] of Object.entries(campos)) {
        if (valor == null || valor === '' || (a[campo] != null && a[campo] !== '' && a[campo] !== 0)) continue;
        antes[campo] = a[campo] ?? null; despues[campo] = valor; a[campo] = valor;
      }
      if (Object.keys(antes).length) registro.actualizados.push({ id: a.id, antes, despues });
    }
    tocados.add(a.id);
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
      d.presentaciones.push({ id, alumno_id: a.id, tipo: e.tipo, fecha: e.fecha, profesor_id: profId(e.profesor), n_convocatoria: e.n_convocatoria, resultado: e.resultado, sucursal_id: a.sucursal_id || null, nota: e.nota });
      registro.creados.presentaciones.push(id);
    }
    for (const t of f.tasas) {
      const id = nextId('tasa');
      d.tasas.push({ id, alumno_id: a.id, concepto: t.concepto, fecha_compra: t.fecha_compra, fecha_caducidad: null, importe: t.importe, estado: t.estado, sucursal_id: a.sucursal_id || null, nota: NOTA_ARIAUTO });
      registro.creados.tasas.push(id);
    }
    if (f.caducaDni) {
      const id = nextId('venc');
      d.vencimientos.push({ id, entidad_tipo: 'alumno', entidad_id: a.id, tipo: 'DNI', descripcion: `DNI de ${nombreDe(a)}`, fecha_vencimiento: f.caducaDni, nota: NOTA_ARIAUTO, completado: false, sucursal_id: a.sucursal_id || null });
      registro.creados.vencimientos.push(id);
    }
  }

  registro.resumen = { ...plan.resumen, creadosAlumnos: registro.creados.alumnos.length, actualizadosAlumnos: registro.actualizados.length };
  registrarImportacion(d, registro);
  addLog('importacion', `Datos traídos de Ariauto (${registro.archivo}): ${registro.creados.alumnos.length} alumnos nuevos, ${registro.actualizados.length} completados, ${registro.creados.cargos.length} cargos y ${registro.creados.pagos.length} pagos`, []);
  save();
  if (s) {
    for (const id of tocados) s.markDirty('alumnos', id);
    for (const id of registro.creados.cargos) s.markDirty('cargos', id);
    for (const id of registro.creados.pagos) s.markDirty('pagos', id);
  }
  return { ok: true, id: registro.id, resumen: registro.resumen, centro: plan.centro, copia: copia && copia.ok ? copia.file : null };
}

module.exports = { leerAccess, esAriauto, planAriauto, previaAriauto, aplicarAriauto, _ariauto: { secciones, fechaDe } };
