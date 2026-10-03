/**
 * db/migracion.js  –  «Traer datos de otro programa»: importar los alumnos (y,
 * si se quiere, su historial de clases) desde lo que exporte el programa de
 * gestión que la autoescuela usaba antes, sin volver a teclearlos.
 *
 * Problemas que resuelve (cada uno es un motivo real para no cambiarse):
 *  - Cada programa exporta con columnas y nombres distintos → se reconocen
 *    solas (por el título y, si no hay título, por lo que contienen) y se
 *    pueden corregir a mano. La elección se recuerda para la próxima vez.
 *  - Datos «sucios»: TODO EN MAYÚSCULAS, «APELLIDOS, NOMBRE» en una casilla,
 *    fechas en cualquier formato o como número de Excel, códigos postales sin
 *    el 0 inicial, DNI sin letra o con guiones, varios teléfonos en una
 *    casilla, permisos escritos de mil maneras → se normalizan, con avisos.
 *  - Alumnos antiguos (bajas, aprobados) → se pueden dejar fuera.
 *  - Duplicados: un alumno que ya está en la app (por DNI o por nombre y
 *    apellidos, en cualquier orden) se completa en vez de duplicarse; los
 *    repetidos dentro del archivo se importan una vez.
 *  - Seguir con el programa antiguo para la gestión y usar esta app solo para
 *    las prácticas → reimportar la lista cuando haya altas: solo entran los
 *    nuevos y se completa lo que falte, nunca se borra nada.
 *  - Alumnos a mitad de curso → «clases ya hechas»/«km ya hechos» y saldo
 *    pendiente; o el historial de clases con su fecha (ficha DGT), que entra
 *    como «clases anteriores» y descuenta de las clases ya hechas.
 *  - Profesores y coches → se emparejan con los existentes o se crean.
 *  - Miedo a estropear algo → vista previa sin guardar, copia de seguridad
 *    antes de importar y «Deshacer» de cada importación.
 *
 * Flujo: analizarImportacion (solo lectura, determinista: la vista previa) →
 * aplicarImportacion (repite el análisis y guarda exactamente eso) →
 * deshacerImportacion. El lector de archivos está en db/lector-tablas.js.
 */

const { load, save, nextId, _sync, addLog, crearBackup, hoyLocalISO } = require('./core');
const { PERMISOS_VALIDOS } = require('./alumnos');
const { normalizarCampoExtra, extraerCamposExtra, camposExtraVacios } = require('./campos-extra');

const MARCA_ANTERIOR = 'anterior';            // = db/clases-anteriores.js
const NOTA_IMPORTADO = 'Importado del programa anterior';
const MAX_CLASES_FILA = 6;
const MAX_IMPORTACIONES = 30;

// ─── NORMALIZACIÓN ──────────────────────────────────────────────────────────

const pad = n => String(n).padStart(2, '0');
const txt = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
// minúsculas, sin acentos, solo letras/números separados por un espacio
function normTexto(v) {
  return txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[º°]/g, '').replace(/ª/g, 'a').replace(/[^a-z0-9ñ]+/g, ' ').trim();
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'e', 'da', 'das', 'do', 'dos', 'van', 'von', 'der', 'di', 'san', 'santa']);
const NOMBRES_CON_PARTICULA = new Set(['maria', 'ma', 'jose', 'juan', 'ana', 'rosa', 'pilar', 'carmen', 'francisco', 'luis']);

// Clave para comparar nombres sin importar orden, acentos, mayúsculas ni partículas
function claveNombre(...partes) {
  return normTexto(partes.filter(Boolean).join(' ')).split(' ').filter(w => w && !PARTICULAS.has(w)).sort().join(' ');
}

// «GARCÍA LÓPEZ» / «garcía lópez» → «García López» (lo que ya viene bien escrito
// no se toca). En los apellidos las partículas van siempre en minúscula
// («Pablo Ruiz de la Fuente»); en el nombre, solo si no son la primera palabra.
function capitalizarNombre(v, { apellido = false } = {}) {
  const s = txt(v);
  if (!s || (s !== s.toUpperCase() && s !== s.toLowerCase())) return s;
  const palabras = s.toLowerCase().split(' ');
  return palabras.map((w, i) => ((i > 0 || (apellido && palabras.length > 1)) && PARTICULAS.has(w)) ? w
    : w.replace(/(^|[-'’.])(\p{L})/gu, (m, p, l) => p + l.toUpperCase())).join(' ');
}

// Junta las partículas con la palabra siguiente: «de la Fuente» es un apellido
function agruparParticulas(tokens) {
  const out = [];
  let pref = [];
  tokens.forEach((t, i) => {
    if (PARTICULAS.has(t.toLowerCase()) && i < tokens.length - 1) { pref.push(t); return; }
    out.push([...pref, t].join(' ')); pref = [];
  });
  return out;
}

// «García López» → ['García', 'López']; «de la Fuente Ruiz» → ['de la Fuente', 'Ruiz']
function partirApellidos(v) {
  const g = agruparParticulas(txt(v).split(' ').filter(Boolean));
  if (g.length <= 1) return [g[0] || '', ''];
  return [g[0], g.slice(1).join(' ')];
}

// Nombre completo en una casilla. Con coma siempre es «Apellidos, Nombre».
// orden: 'nombre_apellidos' (Juan García López) o 'apellidos_nombre' (García López Juan)
function partirNombreCompleto(v, orden = 'nombre_apellidos') {
  const s = txt(v);
  if (!s) return { nombre: '', primer_apellido: '', segundo_apellido: '' };
  const coma = s.indexOf(',');
  if (coma >= 0) {
    const [a1, a2] = partirApellidos(s.slice(0, coma));
    return { nombre: txt(s.slice(coma + 1)), primer_apellido: a1, segundo_apellido: a2 };
  }
  const g = agruparParticulas(s.split(' '));
  if (g.length === 1) return { nombre: g[0], primer_apellido: '', segundo_apellido: '' };
  if (orden === 'apellidos_nombre') {
    if (g.length === 2) return { nombre: g[1], primer_apellido: g[0], segundo_apellido: '' };
    return { nombre: g.slice(2).join(' '), primer_apellido: g[0], segundo_apellido: g[1] };
  }
  if (g.length === 2) return { nombre: g[0], primer_apellido: g[1], segundo_apellido: '' };
  // «María del Carmen López»: la partícula va con el nombre
  if (g.length === 3 && NOMBRES_CON_PARTICULA.has(normTexto(g[0])) && PARTICULAS.has(g[1].split(' ')[0].toLowerCase())) {
    return { nombre: `${g[0]} ${g[1]}`, primer_apellido: g[2], segundo_apellido: '' };
  }
  return { nombre: g.slice(0, -2).join(' '), primer_apellido: g[g.length - 2], segundo_apellido: g[g.length - 1] };
}

// DNI/NIE: sin espacios ni guiones, con los ceros que Excel quita y la letra
// calculada si falta. { valor, valido, letraAnadida }
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
function limpiarDni(v) {
  let t = txt(v).toUpperCase().replace(/[\s.\-_/]/g, '');
  if (!t) return { valor: null, valido: false };
  let letraAnadida = false;
  if (/^\d{6,8}$/.test(t)) { t = t.padStart(8, '0'); t += LETRAS_DNI[parseInt(t, 10) % 23]; letraAnadida = true; }
  if (/^\d{6,7}[A-Z]$/.test(t)) t = t.padStart(9, '0');
  if (/^[XYZ]\d{6}[A-Z]$/.test(t)) t = t[0] + '0' + t.slice(1);
  let valido = false;
  if (/^\d{8}[A-Z]$/.test(t)) valido = LETRAS_DNI[parseInt(t.slice(0, 8), 10) % 23] === t[8];
  else if (/^[XYZ]\d{7}[A-Z]$/.test(t)) valido = LETRAS_DNI[parseInt('XYZ'.indexOf(t[0]) + t.slice(1, 8), 10) % 23] === t[8];
  return { valor: t.slice(0, 20), valido, letraAnadida };
}

// Uno o varios teléfonos en la casilla → el primero (mejor un móvil), compacto
function limpiarTelefono(v) {
  const s = txt(v);
  if (!s) return null;
  const nums = s.split(/[\/;,|]|\s[-–]\s|\s(?:y|o|ó)\s/i)
    .map(p => p.replace(/[^\d+]/g, '').replace(/^00/, '+'))
    .map(p => (/^34\d{9}$/.test(p) ? '+' + p : p))
    .filter(p => p.replace(/\D/g, '').length >= 9);
  if (!nums.length) { const solo = s.replace(/[^\d+]/g, ''); return solo.replace(/\D/g, '').length >= 6 ? solo.slice(0, 20) : null; }
  const movil = nums.find(p => /^(\+34)?[67]\d{8}$/.test(p));
  return (movil || nums[0]).slice(0, 20);
}

function limpiarEmail(v) {
  const m = txt(v).toLowerCase().match(/[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  return m ? m[0] : null;
}

const MESES = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
function fechaIso(y, m, d) {
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d || y < 1900 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
function anio2(yy, pasado) {
  if (yy >= 100) return yy;
  const ahora = new Date().getFullYear() % 100;
  return pasado ? (yy > ahora ? 1900 + yy : 2000 + yy) : 2000 + yy;
}
// Cualquier fecha (dd/mm/aaaa, d-m-aa, aaaa-mm-dd, «12 de marzo de 2024»,
// «12-mar-24», aaaammdd, número de Excel) → 'AAAA-MM-DD' o null.
// pasado: años de 2 cifras siempre en el pasado (fechas de nacimiento).
function leerFechaFlexible(v, { pasado = false } = {}) {
  let s = txt(v).toLowerCase();
  if (!s) return null;
  s = s.replace(/[t\s]\d{1,2}[:.]\d{2}(:\d{2}(\.\d+)?)?\s*(h|hrs?|z)?$/, '').trim(); // sin la hora
  let r;
  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return fechaIso(+r[1], +r[2], +r[3]);
  if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    let [d, m, y] = [+r[1], +r[2], anio2(+r[3], pasado)];
    if (m > 12 && d <= 12) [d, m] = [m, d]; // exportación en formato de EE. UU.
    return fechaIso(y, m, d);
  }
  if ((r = s.match(/^(\d{1,2})(?:\s+de)?[\s\-/.]+([a-záéíóú]{3,})\.?(?:\s+de)?[\s\-/.]+(\d{2}|\d{4})$/))) {
    const m = MESES[r[2].normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3)];
    return m ? fechaIso(anio2(+r[3], pasado), m, +r[1]) : null;
  }
  if ((r = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return fechaIso(+r[1], +r[2], +r[3]);
  if ((r = s.match(/^(\d{5})(\.\d+)?$/))) { // número de serie de Excel
    const n = +r[1];
    if (n > 3000 && n < 80000) { const dt = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return fechaIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); }
  }
  return null;
}

// Hora → 'HH:MM', '' si no hay, null si no se entiende
function leerHoraFlexible(v) {
  const s = txt(v).toLowerCase();
  if (!s) return '';
  let r = s.match(/(\d{1,2})[:.h,](\d{2})(?::\d{2})?\s*(h|hrs?)?$/);
  if (r && +r[1] < 24 && +r[2] < 60) return `${pad(+r[1])}:${r[2]}`;
  if ((r = s.match(/^(\d{1,2})\s*(h|hrs?)?$/)) && +r[1] < 24) return `${pad(+r[1])}:00`;
  if ((r = s.match(/^(\d{1,2})(\d{2})$/)) && +r[1] < 24 && +r[2] < 60) return `${pad(+r[1])}:${r[2]}`;
  if ((r = s.match(/^0?[.,](\d+)$/))) { const m = Math.round(Number('0.' + r[1]) * 1440); if (m < 1440) return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
  return null;
}

// Código postal: Excel quita el 0 de Barcelona, Álava... («8001» → «08001»)
function limpiarCP(v) {
  const t = txt(v).replace(/\D/g, '');
  if (!t) return null;
  return t.length === 4 ? '0' + t : t.slice(0, 10);
}

// Permiso escrito de cualquier forma → { principal, otros[], reconocido }
const CODIGOS_PERMISO = ['C1E', 'D1E', 'CE', 'DE', 'BE', 'C1', 'D1', 'A1', 'A2', 'AM', 'B', 'C', 'D', 'A'];
const PALABRAS_PERMISO = [[/TURISMO|COCHE|AUTOMOVIL/, 'B'], [/CICLOMOTOR/, 'AM'], [/MOTO/, 'A2'], [/CAMION/, 'C'], [/AUTOBUS/, 'D'], [/REMOLQUE/, 'BE']];
function leerPermiso(v) {
  let t = txt(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return { principal: null, otros: [], reconocido: true };
  t = t.replace(/\s*\+\s*/g, '').replace(/\b(PERMISOS?|CLASES?|CARNET|CARNE|DE|DEL|TIPO|CONDUCIR|CONDUCCION|PRACTICAS?|CURSO)\b/g, ' ');
  const vistos = [];
  for (const tok of t.split(/[^A-Z0-9]+/).filter(Boolean)) if (CODIGOS_PERMISO.includes(tok) && !vistos.includes(tok)) vistos.push(tok);
  if (!vistos.length) for (const [re, cod] of PALABRAS_PERMISO) if (re.test(t)) { vistos.push(cod); break; }
  return { principal: vistos[0] || null, otros: vistos.slice(1), reconocido: vistos.length > 0 };
}

// Estado o situación del alumno → estado de la app (undefined = no se entiende)
function leerEstado(v) {
  const t = normTexto(v);
  if (!t) return null;
  if (/baja|inactiv|abandon|cancelad|anulad|desisti|^no$|^n$|^false$|^0$/.test(t)) return 'baja';
  if (/no apto|suspend/.test(t)) return 'no_apto';
  if (/apto teor|teorico aprob|aprobado teor|teorica aprob|teorico superado/.test(t)) return 'apto_teorico';
  if (/aprob|^apto|titulad|finaliz|terminad|obtenido|superado/.test(t)) return 'apto';
  if (/present|examen/.test(t)) return 'presentado';
  if (/teoric|teoria/.test(t)) return 'en_teorica';
  if (/practic|circulac|pista/.test(t)) return 'en_practicas';
  if (/matricul|inscrit|nuevo|pendiente/.test(t)) return 'matriculado';
  if (/activ|alta|^si$|^s$|^true$|^1$|vigente|en curso|cursando/.test(t)) return 'activo';
  return undefined;
}
const ESTADOS_TERMINADOS = ['baja', 'apto'];

// «12», «12,0», «1.234» → entero ≥ 0 (o null si no hay número)
function leerEntero(v, max = 1e7) {
  let t = txt(v).replace(/\s/g, '');
  if (!t) return null;
  t = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t.replace(',', '.');
  const n = Math.round(Number(t.replace(/[^\d.-]/g, '')));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
}

// «1.234,56 €», «-50», «(30)», «12.5» → número con 2 decimales (o null)
function leerImporte(v) {
  let t = txt(v).toLowerCase().replace(/€|eur(os)?|\s/g, '');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/-$/.test(t)) { neg = true; t = t.slice(0, -1); }
  if (/^-/.test(t)) { neg = !neg; t = t.slice(1); }
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round((neg ? -n : n) * 100) / 100 : null;
}

const limpiarMatricula = v => txt(v).toUpperCase().replace(/[\s\-.]/g, '');
// Matrícula española actual (1234ABC) o antigua provincial (M1234AB)
const RE_MATRICULA = /\b(\d{4}\s?-?[BCDFGHJKLMNPRSTVWXYZ]{3}|[A-Z]{1,2}\s?-?\d{4}\s?-?[A-Z]{1,2})\b/;
const pareceMatricula = v => RE_MATRICULA.test(txt(v).toUpperCase());

// ─── CAMPOS Y RECONOCIMIENTO DE COLUMNAS ────────────────────────────────────

const CAMPOS_NOMBRE = [
  { id: 'nombre_completo', nombre: 'Nombre y apellidos (juntos)' },
  { id: 'nombre', nombre: 'Nombre' },
  { id: 'apellidos', nombre: 'Apellidos (los dos juntos)' },
  { id: 'primer_apellido', nombre: '1er apellido' },
  { id: 'segundo_apellido', nombre: '2º apellido' },
  { id: 'dni', nombre: 'DNI / NIE' }
];
const CAMPOS = {
  alumnos: [
    ...CAMPOS_NOMBRE,
    { id: 'telefono', nombre: 'Teléfono', multiple: true },
    { id: 'email', nombre: 'Email' },
    { id: 'fecha_nacimiento', nombre: 'Fecha de nacimiento' },
    { id: 'direccion', nombre: 'Dirección', multiple: true },
    { id: 'codigo_postal', nombre: 'Código postal' },
    { id: 'poblacion', nombre: 'Población' },
    { id: 'permiso', nombre: 'Permiso' },
    { id: 'fecha_alta', nombre: 'Fecha de alta / matrícula' },
    { id: 'estado', nombre: 'Estado / situación' },
    { id: 'fecha_baja', nombre: 'Fecha de baja' },
    { id: 'profesor', nombre: 'Profesor' },
    { id: 'vehiculo', nombre: 'Coche (nombre o matrícula)' },
    { id: 'clases_previas', nombre: 'Clases prácticas ya hechas' },
    { id: 'km_previos', nombre: 'Km ya hechos' },
    { id: 'saldo', nombre: 'Saldo pendiente (€)' },
    { id: 'n_registro', nombre: 'Nº de registro / expediente' },
    { id: 'sexo', nombre: 'Sexo' },
    { id: 'nacionalidad', nombre: 'Nacionalidad' },
    { id: 'lugar_nacimiento', nombre: 'Lugar de nacimiento' },
    { id: 'provincia', nombre: 'Provincia' },
    { id: 'telefono2', nombre: 'Otro teléfono' },
    { id: 'dni_caducidad', nombre: 'Caducidad del DNI' },
    { id: 'tutor_nombre', nombre: 'Tutor' },
    { id: 'observaciones', nombre: 'Observaciones', multiple: true }
  ],
  clases: [
    ...CAMPOS_NOMBRE,
    { id: 'fecha', nombre: 'Fecha de la clase' },
    { id: 'hora', nombre: 'Hora de inicio' },
    { id: 'hora_fin', nombre: 'Hora de fin' },
    { id: 'clases', nombre: 'Nº de clases' },
    { id: 'duracion', nombre: 'Duración (minutos)' },
    { id: 'profesor', nombre: 'Profesor' },
    { id: 'vehiculo', nombre: 'Coche (nombre o matrícula)' },
    { id: 'km_inicial', nombre: 'Km inicial' },
    { id: 'km_final', nombre: 'Km final' },
    { id: 'observaciones', nombre: 'Observaciones', multiple: true }
  ]
};

const RE_IGNORAR = /^(id|cod|codigo|ref|referencia|sucursal|centro|seccion|foto|edad|seleccion|sel)$/;
// Nº de registro del alumno (el número que le daba el programa anterior)
const RE_REGISTRO = /^(n|no|num|numero|nro)( de)? (registro|expediente|alumno|matricula|inscripcion)$|^(expediente|registro|codigo alumno|cod alumno|id alumno)$|^(n|no|num|numero|nro)$/;

// Título de columna → campo ('' = no importar, undefined = no se sabe)
function campoPorTitulo(titulo, tipo) {
  const h = normTexto(titulo);
  if (!h) return undefined;
  if (RE_IGNORAR.test(h)) return '';
  if (tipo === 'alumnos') {
    if (RE_REGISTRO.test(h)) return 'n_registro';
    if (/^(sexo|genero|h m|v m)$/.test(h)) return 'sexo';
    if (/^(nacionalidad|pais|pais de nacionalidad|nacion)$/.test(h)) return 'nacionalidad';
    if (/lugar (de )?nacimiento|pais de nacimiento|naci(o|do) en/.test(h)) return 'lugar_nacimiento';
    if (/^provincia/.test(h)) return 'provincia';
    if (/(tel[eé]?f\w*|movil|tlf|tfno) ?(2|segundo|alternativo|fijo)|otro tel/.test(h)) return 'telefono2';
    if (/(cad|caducidad|vence|validez).*(dni|nie|documento)|(dni|nie|documento).*(cad|caduc|vence|validez)/.test(h)) return 'dni_caducidad';
    if (/^tutor|padre|madre|representante/.test(h)) return 'tutor_nombre';
  }
  const apellido = /apellido/.test(h);
  if (/\b(e ?mail|correo|mail)\b/.test(h)) return 'email';
  if (/nacim|\bnac\b|\bf ?nac|fnac|cumple/.test(h)) return tipo === 'alumnos' ? 'fecha_nacimiento' : '';
  if (/(tel[eé]?f|\btlf|\btfno|\btelf|\bmovil|\bcelular|^tel\b|^tfn)/.test(h)) return tipo === 'alumnos' ? 'telefono' : '';
  if (/\b(dni|nif|nie|d n i|n i f|n i e|documento|pasaporte|identificacion|doc)\b/.test(h)) return 'dni';
  if (apellido && /nombre/.test(h)) return 'nombre_completo';
  if (/^(alumno|alumna|alumnos|nombre completo|cliente|nombre del alumno|alumno nombre|nombre alumno|alumno a)$/.test(h)) return 'nombre_completo';
  if (apellido && /(apellido ?1|\b1 ?(er|o)? ?apellido|primer)/.test(h)) return 'primer_apellido';
  if (apellido && /(apellido ?2|\b2 ?o? ?apellido|segundo)/.test(h)) return 'segundo_apellido';
  if (/^apellidos?$/.test(h)) return 'apellidos';
  if (/^(nombre|nombres|nombre de pila|nom)$/.test(h)) return 'nombre';
  if (/profesor|instructor|monitor|docente|^prof$/.test(h)) return 'profesor';
  if (/vehiculo|coche|turismo|automovil|^matricula vehiculo$|^matricula coche$/.test(h)) return 'vehiculo';
  if (/^(observaciones|observacion|obs|notas?|comentarios?|anotaciones?)$/.test(h) || /observ/.test(h)) return 'observaciones';
  if (tipo === 'alumnos') {
    if (/\bbaja\b/.test(h)) return 'fecha_baja';
    if (/\b(alta|inscripcion|ingreso|matriculacion)\b/.test(h) || (/matricula/.test(h) && /\bfecha\b|\bf\b/.test(h))) return 'fecha_alta';
    if (/^(cp|c p|cod postal|codigo postal|cod post|c postal|postal|zip|distrito postal)$/.test(h) || /codigo postal/.test(h)) return 'codigo_postal';
    if (/poblacion|localidad|municipio|ciudad|pueblo/.test(h)) return 'poblacion';
    if (/direcc|domicilio|\bcalle\b|^via$|^dir$|^domic/.test(h)) return 'direccion';
    if (/permiso|carnet|carne|^clase$|^curso$|^categoria$/.test(h)) return 'permiso';
    if (/estado|situacion|^activo|^status|^estatus/.test(h)) return 'estado';
    if (/^(km|kms|kilometros|km totales|km realizados|total km|kilometros realizados)$/.test(h)) return 'km_previos';
    if (/\b(clases|practicas|sesiones)\b/.test(h)) return /fecha|precio|importe|pendiente|restante|quedan|bono|comprad|contratad|pagad/.test(h) ? '' : 'clases_previas';
    if (/saldo|deuda|\bdebe\b|por pagar|a pagar|importe pendiente|pendiente (de )?pago|^pendiente$/.test(h)) return 'saldo';
    if (/^matricula$/.test(h)) return undefined; // fecha de matrícula o matrícula del coche: lo dicen los datos
    return undefined;
  }
  // clases
  if (/km|kilomet/.test(h) && /(ini|sal|desde|comienzo|empiez|antes|origen)/.test(h)) return 'km_inicial';
  if (/km|kilomet/.test(h) && /(fin|lleg|hasta|despues|termin|destino)/.test(h)) return 'km_final';
  if (/hora/.test(h) && /(fin|final|hasta|termin|salida)/.test(h)) return 'hora_fin';
  if (/^(hora|horario|hora inicio|hora de inicio|h inicio|inicio|desde|h|hora comienzo|hora entrada)$/.test(h) || (/hora/.test(h) && /ini|comien|entrada/.test(h))) return 'hora';
  if (/^(fin|hasta)$/.test(h)) return 'hora_fin';
  if (/duracion|minutos|^min$|^mins$|^tiempo$/.test(h)) return 'duracion';
  if (/fecha|^dia$|^f$|^f practica$|^f clase$/.test(h)) return 'fecha';
  if (/^(n |num |numero )?(de )?(clases|practicas|sesiones|unidades)$|^cantidad$|^uds?$|^n clases$/.test(h)) return 'clases';
  if (/^matricula$/.test(h)) return 'vehiculo';
  return undefined;
}

// Lo que parecen los datos de una columna (para columnas sin título conocido)
function campoPorValores(valores, tipo, ocupados) {
  const v = valores.map(txt).filter(Boolean).slice(0, 40);
  if (v.length < 2) return undefined;
  const parte = re => v.filter(x => re instanceof RegExp ? re.test(x) : re(x)).length / v.length;
  const libre = c => !ocupados.has(c);
  if (libre('email') && parte(/@[^@\s]+\.[a-z]{2,}/i) >= 0.6) return 'email';
  if (libre('dni') && parte(x => { const d = limpiarDni(x); return d.valido && !d.letraAnadida; }) >= 0.6) return 'dni';
  if (pareceTel(v, parte) && libre('telefono') && tipo === 'alumnos') return 'telefono';
  if (libre('vehiculo') && parte(x => pareceMatricula(x)) >= 0.6) return 'vehiculo';
  if (tipo === 'clases' && libre('hora') && parte(x => /^\d{1,2}[:.h]\d{2}/.test(x) && leerHoraFlexible(x)) >= 0.7) return 'hora';
  const fechas = v.map(x => leerFechaFlexible(x, { pasado: true })).filter(Boolean);
  if (fechas.length / v.length >= 0.7 && v.some(x => /\D/.test(x))) {
    if (tipo === 'clases') return libre('fecha') ? 'fecha' : undefined;
    const anios = fechas.map(f => +f.slice(0, 4)).sort((a, b) => a - b);
    const mediana = anios[Math.floor(anios.length / 2)];
    if (mediana <= new Date().getFullYear() - 14 && libre('fecha_nacimiento')) return 'fecha_nacimiento';
    if (libre('fecha_alta')) return 'fecha_alta';
    return undefined;
  }
  if (tipo === 'alumnos' && libre('permiso') && parte(x => /^[A-Z0-9+ ,]{1,8}$/i.test(x) && leerPermiso(x).reconocido) >= 0.8) return 'permiso';
  return undefined;
}
function pareceTel(v, parte) { return parte(x => /^(\+?34|0034)?\s?[6789](\s?\d){8}/.test(x.replace(/[.\-]/g, ' ').trim())) >= 0.6; }

function pareceTitulo(c, tipo) {
  if (campoPorTitulo(c, tipo) !== undefined) return true;
  const h = normTexto(c);
  return !!h && !/^[\d\s.,:/-]+$/.test(txt(c)) && !limpiarDni(c).valido && !leerFechaFlexible(c) && !/@/.test(c);
}

// ¿En qué fila están los títulos? (-1 = no hay: los datos empiezan arriba)
function detectarFilaCabecera(filas, tipo) {
  let mejor = -1, punt = 0;
  // Un título cuenta si se reconoce para alumnos o para clases (así se detecta
  // también un historial de clases elegido como «Alumnos», para avisar).
  const reconocido = c => ['alumnos', 'clases'].map(t => campoPorTitulo(c, t)).find(k => k !== undefined);
  filas.slice(0, 15).forEach((f, i) => {
    const conocidas = f.filter(c => { const k = reconocido(c); return k !== undefined && k !== ''; }).length;
    const ignoradas = f.filter(c => reconocido(c) === '').length;
    const p = conocidas + ignoradas * 0.4;
    if (p > punt && conocidas >= 1 && f.filter(Boolean).every(c => pareceTitulo(c, tipo))) { punt = p; mejor = i; }
  });
  return punt >= 1.5 ? mejor : -1;
}

/**
 * Propuesta de lectura de una tabla: fila de títulos y campo de cada columna.
 * hoja = { filas, numFila }. Devuelve { filaCabecera, mapeo[], titulos[],
 * muestras[][], tipoSugerido, ordenNombre }.
 */
function detectarTabla(hoja, tipo = 'alumnos', forzarCabecera) {
  const filas = (hoja && hoja.filas) || [];
  // La pantalla puede fijar a mano la fila de títulos (-1 = no hay)
  const fc = Number.isInteger(forzarCabecera) && forzarCabecera >= -1 && forzarCabecera < filas.length ? forzarCabecera : detectarFilaCabecera(filas, tipo);
  const ancho = filas.reduce((m, f) => Math.max(m, f.length), 0);
  const titulos = Array.from({ length: ancho }, (_, c) => (fc >= 0 ? txt(filas[fc][c]) : ''));
  const datos = filas.slice(fc + 1);
  const muestras = Array.from({ length: ancho }, (_, c) => datos.map(f => txt(f[c])).filter(Boolean).slice(0, 40));
  const mapeo = Array(ancho).fill('');
  const ocupados = new Set();
  const multiples = new Set(CAMPOS[tipo].filter(c => c.multiple).map(c => c.id));
  // 1º por el título; si el título no dice nada claro, por los datos
  for (let c = 0; c < ancho; c++) {
    let k = campoPorTitulo(titulos[c], tipo);
    if (k === undefined) continue;
    if (k && ocupados.has(k) && !multiples.has(k)) k = '';
    mapeo[c] = k; if (k) ocupados.add(k);
  }
  for (let c = 0; c < ancho; c++) {
    if (mapeo[c] || campoPorTitulo(titulos[c], tipo) === '') continue;
    const k = campoPorValores(muestras[c], tipo, ocupados);
    if (k) { mapeo[c] = k; ocupados.add(k); }
  }
  // Sin columna de nombre reconocida: la primera columna de texto con varias palabras
  if (!['nombre_completo', 'nombre', 'primer_apellido', 'apellidos'].some(k => ocupados.has(k))) {
    const c = muestras.findIndex((m, i) => !mapeo[i] && m.length && m.filter(x => /^[\p{L}][\p{L} .,'’-]+$/u.test(x) && x.includes(' ')).length / m.length >= 0.6);
    if (c >= 0) { mapeo[c] = 'nombre_completo'; ocupados.add('nombre_completo'); }
  }
  const iNombre = mapeo.indexOf('nombre_completo');
  const ordenNombre = iNombre >= 0 && /^apellido/.test(normTexto(titulos[iNombre])) ? 'apellidos_nombre' : 'nombre_apellidos';
  // ¿Es más bien un historial de clases? (fecha + hora/km/duración y nombres repetidos)
  let tipoSugerido = tipo;
  if (tipo === 'alumnos') {
    const alt = Array.from({ length: ancho }, (_, c) => campoPorTitulo(titulos[c], 'clases'));
    const nombres = iNombre >= 0 ? muestras[iNombre] : [];
    const repetidos = nombres.length - new Set(nombres.map(x => claveNombre(x))).size;
    if (alt.includes('fecha') && (alt.some(k => ['hora', 'km_inicial', 'km_final', 'duracion', 'clases', 'hora_fin'].includes(k)) || repetidos > nombres.length / 4)) tipoSugerido = 'clases';
  } else {
    // ¿Y al revés? Títulos de ficha de alumno (teléfono, email, dirección…) y
    // nada propio de una clase (hora, km, duración) → es una lista de alumnos
    const deAlumno = ['telefono', 'email', 'fecha_nacimiento', 'direccion', 'codigo_postal', 'poblacion', 'permiso', 'estado', 'fecha_alta'];
    const alt = Array.from({ length: ancho }, (_, c) => campoPorTitulo(titulos[c], 'alumnos'));
    const deClase = mapeo.some(k => ['hora', 'hora_fin', 'km_inicial', 'km_final', 'duracion'].includes(k));
    if (!deClase && alt.filter(k => deAlumno.includes(k)).length >= 2) tipoSugerido = 'alumnos';
  }
  return {
    filaCabecera: fc, mapeo, titulos, muestras: muestras.map(m => m.slice(0, 3)), tipoSugerido, ordenNombre,
    campos: CAMPOS[tipo].map(({ id, nombre, multiple }) => ({ id, nombre, multiple: !!multiple })) // desplegables de la pantalla
  };
}

// ─── LECTURA DE CADA FILA SEGÚN EL MAPEO ────────────────────────────────────

const UNIR = { direccion: ', ', observaciones: ' · ', telefono: ' / ' };
function registrosDe(entrada) {
  const filas = entrada.filas || [];
  const numFila = entrada.numFila || filas.map((_, i) => i + 1);
  const desde = (entrada.filaCabecera >= 0 ? entrada.filaCabecera : -1) + 1;
  const mapeo = entrada.mapeo || [];
  const out = [];
  for (let i = desde; i < filas.length; i++) {
    const v = {};
    mapeo.forEach((campo, c) => {
      if (!campo) return;
      const x = txt(filas[i][c]);
      if (!x) return;
      if (v[campo] && UNIR[campo]) v[campo] += UNIR[campo] + x; else if (!v[campo]) v[campo] = x;
    });
    if (Object.keys(v).length) out.push({ n: numFila[i] || i + 1, v });
  }
  return out;
}

// Nombre, apellidos y DNI de un registro
function personaDe(v, opciones, titulos) {
  let nombre = v.nombre || '', a1 = v.primer_apellido || '', a2 = v.segundo_apellido || '';
  if (v.apellidos && !a1) [a1, a2] = partirApellidos(v.apellidos);
  if (v.nombre_completo && !nombre) {
    const p = partirNombreCompleto(v.nombre_completo, opciones.ordenNombre || 'nombre_apellidos');
    nombre = p.nombre; if (!a1) { a1 = p.primer_apellido; a2 = a2 || p.segundo_apellido; }
  }
  if (opciones.capitalizar !== false) { nombre = capitalizarNombre(nombre); a1 = capitalizarNombre(a1, { apellido: true }); a2 = capitalizarNombre(a2, { apellido: true }); }
  return { nombre: txt(nombre).slice(0, 80), primer_apellido: txt(a1).slice(0, 80), segundo_apellido: txt(a2).slice(0, 80), dni: limpiarDni(v.dni) };
}
const nombreDe = a => a ? [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ') : '';
const clavePersona = a => claveNombre(a.nombre, a.primer_apellido, a.segundo_apellido);

// Índices de lo que ya hay en la app
function indices(d) {
  const alumnos = d.alumnos.filter(a => !a.deleted);
  const porDni = new Map(), porNombre = new Map();
  for (const a of alumnos) {
    const dni = limpiarDni(a.dni).valor;
    if (dni && !porDni.has(dni)) porDni.set(dni, a);
    const k = clavePersona(a);
    if (k) porNombre.set(k, [...(porNombre.get(k) || []), a]);
  }
  return { alumnos, porDni, porNombre };
}

// Alumno de la app que es esta persona: por DNI y, si no, por nombre completo.
function buscarAlumno(idx, p) {
  const dni = p.dni && p.dni.valor;
  if (dni && idx.porDni.has(dni)) return { alumno: idx.porDni.get(dni) };
  const k = clavePersona(p);
  const cand = (k && idx.porNombre.get(k)) || [];
  if (!cand.length) return {};
  if (cand.length > 1) {
    const sinDni = cand.filter(a => !limpiarDni(a.dni).valor);
    if (dni && sinDni.length === 1) return { alumno: sinDni[0] };
    return { ambiguo: cand.length };
  }
  const otroDni = limpiarDni(cand[0].dni).valor;
  if (dni && otroDni && otroDni !== dni) return { mismoNombre: cand[0] };
  return { alumno: cand[0] };
}

// Profesores y coches: emparejar con los existentes o proponer crearlos
function resolverRelacionados(d, opciones) {
  const profes = d.profesores.filter(p => !p.deleted);
  const coches = d.vehiculos.filter(v => !v.deleted);
  const nuevosProf = new Map(), nuevosVeh = new Map();
  return {
    nuevosProf, nuevosVeh,
    profesor(valor) {
      const k = claveNombre(valor);
      if (!k) return { id: null };
      let p = profes.find(x => claveNombre(x.nombre) === k);
      if (!p && !k.includes(' ')) { const c = profes.filter(x => claveNombre(x.nombre).split(' ').includes(k)); if (c.length === 1) p = c[0]; }
      if (!p) { const c = profes.filter(x => { const kx = claveNombre(x.nombre); return kx && (kx.split(' ').every(w => k.split(' ').includes(w)) || k.split(' ').every(w => kx.split(' ').includes(w))); }); if (c.length === 1) p = c[0]; }
      if (p) return { id: p.id, nombre: p.nombre };
      if (opciones.crearRelacionados === false) return { id: null, aviso: `Profesor «${txt(valor)}» no encontrado: queda sin profesor.` };
      if (!nuevosProf.has(k)) nuevosProf.set(k, capitalizarNombre(valor).slice(0, 80));
      return { nuevo: k, nombre: nuevosProf.get(k) };
    },
    vehiculo(valor) {
      const s = txt(valor);
      if (!s) return { id: null };
      const m = s.toUpperCase().match(RE_MATRICULA);
      const mat = m ? limpiarMatricula(m[1]) : '';
      let v = mat && coches.find(x => limpiarMatricula(x.matricula) === mat);
      if (!v) v = coches.find(x => normTexto(x.nombre) === normTexto(s) || (normTexto(x.nombre) && normTexto(s).includes(normTexto(x.nombre)) && normTexto(x.nombre).length >= 3));
      if (v) return { id: v.id, nombre: v.nombre };
      if (opciones.crearRelacionados === false) return { id: null, aviso: `Coche «${s}» no encontrado: queda sin coche.` };
      const clave = mat || normTexto(s);
      if (!nuevosVeh.has(clave)) {
        const nombre = txt(m ? s.replace(m[0], '') : s).replace(/^[-–·,]+|[-–·,]+$/g, '').trim() || (mat ? `Coche ${mat}` : s);
        nuevosVeh.set(clave, { nombre: nombre.slice(0, 60), matricula: mat });
      }
      return { nuevo: clave, nombre: nuevosVeh.get(clave).nombre };
    }
  };
}

// ─── ANÁLISIS: ALUMNOS ──────────────────────────────────────────────────────

const CAMPOS_ACTUALIZABLES = ['primer_apellido', 'segundo_apellido', 'dni', 'telefono', 'email', 'fecha_nacimiento', 'direccion', 'codigo_postal', 'poblacion', 'permiso', 'fecha_alta', 'estado', 'observaciones', 'profesor_id', 'vehiculo_id',
  'n_registro', 'sexo', 'nacionalidad', 'lugar_nacimiento', 'provincia', 'telefono2', 'dni_caducidad', 'tutor_nombre'];
const vacio = x => x == null || x === '' || (Array.isArray(x) && !x.length);

function analizarAlumnos(d, entrada) {
  const opciones = entrada.opciones || {};
  const hoy = opciones.hoy || hoyLocalISO();
  const actualizar = ['vacios', 'todo', 'nada'].includes(opciones.actualizar) ? opciones.actualizar : 'vacios';
  const idx = indices(d);
  const rel = resolverRelacionados(d, opciones);
  const practicasPorAlumno = new Map();
  for (const p of d.practicas) if (!p.deleted) practicasPorAlumno.set(p.alumno_id, (practicasPorAlumno.get(p.alumno_id) || 0) + 1);
  const saldoImportado = new Set((d.cargos || []).filter(c => !c.deleted && c.nota === NOTA_IMPORTADO).map(c => c.alumno_id));
  const vistos = new Map(); // clave/dni → nº de fila
  const filas = [];

  for (const { n, v } of registrosDe(entrada)) {
    const avisos = [];
    const p = personaDe(v, opciones);
    const fila = { n, nombre: nombreDe(p), dni: p.dni.valor || '', avisos };
    if (!p.nombre && !p.primer_apellido) { filas.push({ ...fila, accion: 'error', motivo: 'Sin nombre' }); continue; }
    if (!p.nombre) avisos.push('Falta el nombre (solo hay apellidos).');
    if (p.dni.valor && !p.dni.valido) avisos.push(`DNI/NIE «${p.dni.valor}» con la letra o el formato raros: revísalo.`);
    if (p.dni.letraAnadida) avisos.push('DNI sin letra: se ha calculado.');

    // Datos
    const datos = {};
    if (v.telefono) { datos.telefono = limpiarTelefono(v.telefono); if (!datos.telefono) avisos.push(`Teléfono «${v.telefono}» no válido.`); }
    if (v.email) { datos.email = limpiarEmail(v.email); if (!datos.email) avisos.push(`Email «${v.email}» no válido: no se importa.`); }
    if (v.fecha_nacimiento) { datos.fecha_nacimiento = leerFechaFlexible(v.fecha_nacimiento, { pasado: true }); if (!datos.fecha_nacimiento) avisos.push(`Fecha de nacimiento «${v.fecha_nacimiento}» no se entiende.`); }
    if (v.direccion) datos.direccion = capitalizarNombre(v.direccion).slice(0, 200);
    if (v.codigo_postal) { datos.codigo_postal = limpiarCP(v.codigo_postal); if (datos.codigo_postal && datos.codigo_postal.length !== 5) avisos.push(`Código postal «${v.codigo_postal}» raro.`); }
    if (v.poblacion) datos.poblacion = capitalizarNombre(v.poblacion).slice(0, 80);
    let otrosPermisos = [];
    if (v.permiso) {
      const pr = leerPermiso(v.permiso);
      if (pr.principal) { datos.permiso = pr.principal; otrosPermisos = pr.otros.filter(x => PERMISOS_VALIDOS.includes(x)); } else avisos.push(`Permiso «${v.permiso}» no reconocido: se deja B.`);
    }
    if (v.fecha_alta) { datos.fecha_alta = leerFechaFlexible(v.fecha_alta); if (!datos.fecha_alta) avisos.push(`Fecha de alta «${v.fecha_alta}» no se entiende.`); }
    if (v.estado) { const e = leerEstado(v.estado); if (e === undefined) avisos.push(`Estado «${v.estado}» no reconocido.`); else datos.estado = e; }
    const fechaBaja = v.fecha_baja ? leerFechaFlexible(v.fecha_baja) : null;
    if (fechaBaja && fechaBaja <= hoy && !datos.estado) datos.estado = 'baja';
    if (v.observaciones) datos.observaciones = txt(v.observaciones).slice(0, 1000);
    // Datos que también guardan otros programas (Ariauto…): cada uno a su campo
    if (v.n_registro) datos.n_registro = txt(v.n_registro).slice(0, 40);
    if (v.sexo) { datos.sexo = normalizarCampoExtra('sexo', v.sexo); if (!datos.sexo) avisos.push(`Sexo «${v.sexo}» no reconocido.`); }
    if (v.nacionalidad) datos.nacionalidad = capitalizarNombre(v.nacionalidad).slice(0, 60);
    if (v.lugar_nacimiento) datos.lugar_nacimiento = capitalizarNombre(v.lugar_nacimiento).slice(0, 80);
    if (v.provincia) datos.provincia = capitalizarNombre(v.provincia).slice(0, 60);
    if (v.telefono2) datos.telefono2 = limpiarTelefono(v.telefono2);
    if (v.dni_caducidad) { datos.dni_caducidad = leerFechaFlexible(v.dni_caducidad); if (!datos.dni_caducidad) avisos.push(`Caducidad del DNI «${v.dni_caducidad}» no se entiende.`); }
    if (v.tutor_nombre) datos.tutor_nombre = capitalizarNombre(v.tutor_nombre).slice(0, 120);
    if (v.profesor) { const r = rel.profesor(v.profesor); if (r.aviso) avisos.push(r.aviso); else { datos.profesor_id = r.id ?? `nuevo:${r.nuevo}`; fila.profesor = r.nombre; } }
    if (v.vehiculo) { const r = rel.vehiculo(v.vehiculo); if (r.aviso) avisos.push(r.aviso); else { datos.vehiculo_id = r.id ?? `nuevo:${r.nuevo}`; fila.vehiculo = r.nombre; } }
    const previas = v.clases_previas ? leerEntero(v.clases_previas, 500) : null;
    const kmPrev = v.km_previos ? leerEntero(v.km_previos, 100000) : null;
    const saldo = v.saldo ? leerImporte(v.saldo) : null;
    if (v.saldo && saldo == null) avisos.push(`Saldo «${v.saldo}» no se entiende.`);
    for (const k of Object.keys(datos)) if (datos[k] == null) delete datos[k];
    Object.assign(fila, { permiso: datos.permiso || '', estado: datos.estado || '', telefono: datos.telefono || '' });

    // Alumnos que ya terminaron
    if (opciones.soloEnCurso && ESTADOS_TERMINADOS.includes(datos.estado)) {
      filas.push({ ...fila, accion: 'omitir', motivo: datos.estado === 'baja' ? 'De baja' : 'Ya aprobado' }); continue;
    }
    // Repetido dentro del archivo
    const k = clavePersona(p);
    const claves = [p.dni.valor && 'dni:' + p.dni.valor, k && 'n:' + k].filter(Boolean);
    const antes = claves.map(c => vistos.get(c)).find(Boolean);
    if (antes) { filas.push({ ...fila, accion: 'omitir', motivo: `Repetido (fila ${antes})` }); continue; }
    claves.forEach(c => vistos.set(c, n));

    const m = buscarAlumno(idx, p);
    if (m.ambiguo) { filas.push({ ...fila, accion: 'omitir', motivo: `Hay ${m.ambiguo} alumnos con este nombre en la app: añade el DNI para saber cuál es` }); continue; }
    if (m.mismoNombre) avisos.push(`Ya hay un alumno con este nombre y otro DNI (${m.mismoNombre.dni}): se crea aparte.`);
    const ex = m.alumno;
    if (!ex) {
      filas.push({
        ...fila, accion: 'nuevo',
        alumno: { nombre: p.nombre || p.primer_apellido, primer_apellido: p.nombre ? p.primer_apellido : p.segundo_apellido, segundo_apellido: p.nombre ? p.segundo_apellido : '', dni: p.dni.valor, ...datos, permisos: otrosPermisos, clases_previas: previas || 0, km_previos: kmPrev || 0 },
        saldo: saldo || 0
      });
      continue;
    }
    fila.id = ex.id; fila.nombre = nombreDe(ex);
    if (actualizar === 'nada') { filas.push({ ...fila, accion: 'igual', motivo: 'Ya está en la app' }); continue; }
    const nuevos = { primer_apellido: p.primer_apellido, segundo_apellido: p.segundo_apellido, dni: p.dni.valor, ...datos };
    const cambios = {};
    for (const campo of CAMPOS_ACTUALIZABLES) {
      const nv = nuevos[campo];
      if (vacio(nv)) continue;
      const av = ex[campo];
      if (campo === 'permiso' && actualizar === 'vacios') { if (vacio(av)) cambios[campo] = [av ?? null, nv]; continue; }
      if (String(av ?? '') === String(nv)) continue;
      if (actualizar === 'todo' || vacio(av)) cambios[campo] = [av ?? null, nv];
    }
    // Apellidos: solo si el alumno no los tiene (no se tocan los nombres ya puestos)
    if (!vacio(ex.primer_apellido)) { delete cambios.primer_apellido; delete cambios.segundo_apellido; }
    // Clases/km ya hechos: solo si aún no tiene nada (si no, se contarían dos veces)
    if (!practicasPorAlumno.get(ex.id) && !(ex.clases_previas > 0) && previas > 0) cambios.clases_previas = [ex.clases_previas || 0, previas];
    if (!practicasPorAlumno.get(ex.id) && !(ex.km_previos > 0) && kmPrev > 0) cambios.km_previos = [ex.km_previos || 0, kmPrev];
    let saldoFila = 0;
    if (saldo) { if (saldoImportado.has(ex.id)) avisos.push('Ya tenía un saldo importado: no se vuelve a cargar.'); else saldoFila = saldo; }
    const hay = Object.keys(cambios).length || saldoFila;
    filas.push({ ...fila, accion: hay ? 'actualizar' : 'igual', motivo: hay ? '' : 'Ya está en la app y no hay nada que completar', cambios, saldo: saldoFila });
  }
  return { filas, rel };
}

// ─── ANÁLISIS: HISTORIAL DE CLASES ──────────────────────────────────────────

const aMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const aHHMM = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

function analizarClases(d, entrada) {
  const opciones = entrada.opciones || {};
  const hoy = opciones.hoy || hoyLocalISO();
  const dur = Math.min(240, Math.max(10, Math.round(Number(opciones.duracion) || 45)));
  const idx = indices(d);
  const rel = resolverRelacionados(d, opciones);
  const existentes = new Map(); // alumno_id|fecha → [{ hora }]
  for (const p of d.practicas) {
    if (p.deleted) continue;
    const k = `${p.alumno_id}|${p.fecha}`;
    existentes.set(k, [...(existentes.get(k) || []), { hora: p.hora_inicio || '' }]);
  }
  const conKm = d.practicas.filter(p => !p.deleted && p.km_final > 0).map(p => ({ v: p.vehiculo_id, i: p.km_inicial, f: p.km_final }));
  const alumnosNuevos = new Map(); // clave → datos del alumno a crear
  const vistasArchivo = new Map();
  const filas = [];

  const regs = registrosDe(entrada).map(r => {
    const fechaTxt = r.v.fecha || '';
    const fecha = leerFechaFlexible(fechaTxt);
    let hora = leerHoraFlexible(r.v.hora);
    if (!r.v.hora && /\d[:.]\d{2}/.test(fechaTxt)) hora = leerHoraFlexible(fechaTxt.match(/\d{1,2}[:.]\d{2}/)[0]);
    return { ...r, fecha, hora };
  }).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.hora || '99').localeCompare(b.hora || '99') || a.n - b.n);

  for (const { n, v, fecha, hora } of regs) {
    const avisos = [];
    const p = personaDe(v, opciones);
    const fila = { n, nombre: nombreDe(p) || p.dni.valor || '', fecha: fecha || '', hora: hora || '', avisos };
    if (!p.nombre && !p.primer_apellido && !p.dni.valor) { filas.push({ ...fila, accion: 'error', motivo: 'Sin alumno' }); continue; }
    if (!fecha) { filas.push({ ...fila, accion: 'error', motivo: v.fecha ? `Fecha «${v.fecha}» no se entiende` : 'Sin fecha' }); continue; }
    if (fecha > hoy) { filas.push({ ...fila, accion: 'omitir', motivo: 'Fecha futura (es agenda, no una clase dada)' }); continue; }
    if (hora === null) avisos.push(`Hora «${v.hora}» no se entiende: se deja en blanco.`);

    // Alumno
    const m = buscarAlumno(idx, p);
    let alumno = m.alumno, claveNuevo = null;
    if (!alumno) {
      if (m.ambiguo) { filas.push({ ...fila, accion: 'omitir', motivo: `Hay ${m.ambiguo} alumnos con este nombre: añade el DNI` }); continue; }
      if (opciones.crearAlumnos === false) { filas.push({ ...fila, accion: 'omitir', motivo: 'El alumno no está en la app' }); continue; }
      if (!p.nombre && !p.primer_apellido) { filas.push({ ...fila, accion: 'omitir', motivo: `DNI ${p.dni.valor} no está en la app y no hay nombre` }); continue; }
      claveNuevo = (p.dni.valor && 'dni:' + p.dni.valor) || 'n:' + clavePersona(p);
      if (!alumnosNuevos.has(claveNuevo)) alumnosNuevos.set(claveNuevo, { nombre: p.nombre || p.primer_apellido, primer_apellido: p.nombre ? p.primer_apellido : p.segundo_apellido, segundo_apellido: p.nombre ? p.segundo_apellido : '', dni: p.dni.valor });
    } else fila.nombre = nombreDe(alumno);
    const claveAl = alumno ? alumno.id : claveNuevo;

    // Nº de clases: columna, o duración, o de la hora de fin
    let k = 1;
    if (v.clases) { const c = Number(String(v.clases).replace(',', '.')); if (Number.isFinite(c) && c > 0) k = Math.max(1, Math.round(c)); else avisos.push(`Nº de clases «${v.clases}» no válido: se cuenta 1.`); }
    else if (v.duracion) { const mins = leerEntero(v.duracion, 1000); if (mins) k = Math.max(1, Math.round(mins / dur)); }
    else if (v.hora_fin && hora) { const hf = leerHoraFlexible(v.hora_fin); if (hf && aMin(hf) > aMin(hora)) k = Math.max(1, Math.round((aMin(hf) - aMin(hora)) / dur)); }
    if (k > MAX_CLASES_FILA) { avisos.push(`${k} clases en un día: se cuentan ${MAX_CLASES_FILA}.`); k = MAX_CLASES_FILA; }

    // Repetida en el propio archivo (mismo alumno, fecha y hora)
    if (hora) {
      const kf = `${claveAl}|${fecha}|${hora}`;
      if (vistasArchivo.has(kf)) { filas.push({ ...fila, accion: 'omitir', motivo: `Repetida (fila ${vistasArchivo.get(kf)})` }); continue; }
      vistasArchivo.set(kf, n);
    }
    // ¿Ya estaba en la app? (misma fecha y hora, o misma fecha si no hay hora)
    const clave = `${claveAl}|${fecha}`;
    const lista = existentes.get(clave) || [];
    const i = lista.findIndex(x => (hora ? x.hora === hora || !x.hora : true));
    if (i >= 0) { lista.splice(i, 1); filas.push({ ...fila, accion: 'igual', motivo: 'Esta clase ya está en la app' }); continue; }

    // Profesor y coche (si no vienen, los del alumno)
    let profesor_id = alumno ? alumno.profesor_id || null : null, vehiculo_id = alumno ? alumno.vehiculo_id || null : null;
    if (v.profesor) { const r = rel.profesor(v.profesor); if (r.aviso) avisos.push(r.aviso); else { profesor_id = r.id ?? `nuevo:${r.nuevo}`; fila.profesor = r.nombre; } }
    if (v.vehiculo) { const r = rel.vehiculo(v.vehiculo); if (r.aviso) avisos.push(r.aviso); else { vehiculo_id = r.id ?? `nuevo:${r.nuevo}`; fila.vehiculo = r.nombre; } }

    // Km (solo si vienen los dos, encajan y no pisan otra clase del mismo coche)
    let ki = leerEntero(v.km_inicial) || 0, kf = leerEntero(v.km_final) || 0;
    if (ki || kf) {
      let motivo = '';
      if (!(ki > 0 && kf > ki)) motivo = 'los km no son válidos';
      else if (kf - ki > 1000 * k) motivo = 'demasiados km para una clase';
      else if (!vehiculo_id) motivo = 'no se sabe el coche';
      else if (conKm.some(x => x.v === vehiculo_id && ki < x.f && x.i < kf)) motivo = 'pisan los de otra clase del mismo coche';
      if (motivo) { avisos.push(`Km ${ki}–${kf}: ${motivo}; la clase queda sin km.`); ki = 0; kf = 0; } else conKm.push({ v: vehiculo_id, i: ki, f: kf });
      if (kf - ki < k && kf) { avisos.push(`Con ${kf - ki} km no caben ${k} clases: quedan sin km.`); ki = 0; kf = 0; }
    }
    filas.push({
      ...fila, accion: 'nuevo', clases: k, alumno_id: alumno ? alumno.id : null, alumno_nuevo: claveNuevo,
      practica: { fecha, hora_inicio: hora || null, km_inicial: ki, km_final: kf, profesor_id, vehiculo_id, nota: txt(v.observaciones).slice(0, 500) }
    });
  }
  return { filas, rel, alumnosNuevos };
}

// ─── ANÁLISIS (vista previa) ────────────────────────────────────────────────

function resumenDe(filas, extra) {
  const cuenta = a => filas.filter(f => f.accion === a).length;
  return {
    filas: filas.length, nuevos: cuenta('nuevo'), actualizar: cuenta('actualizar'), iguales: cuenta('igual'),
    omitidos: cuenta('omitir'), errores: cuenta('error'), conAvisos: filas.filter(f => f.avisos.length).length, ...extra
  };
}

/**
 * Vista previa de una importación (no guarda nada).
 * entrada = { tipo: 'alumnos'|'clases', filas[][], numFila[], filaCabecera, mapeo[], opciones }
 * opciones: actualizar ('vacios'|'todo'|'nada'), soloEnCurso, crearRelacionados,
 *           crearAlumnos, capitalizar, ordenNombre, duracion, hoy, sucursal_id
 */
function _plan(d, entrada) {
  const tipo = entrada.tipo === 'clases' ? 'clases' : 'alumnos';
  const mapeo = entrada.mapeo || [];
  const tiene = c => mapeo.includes(c);
  const errores = [];
  if (!['nombre_completo', 'nombre', 'primer_apellido', 'apellidos'].some(tiene) && !(tipo === 'clases' && tiene('dni'))) {
    errores.push('Indica qué columna tiene el nombre del alumno.');
  }
  if (tipo === 'clases' && !tiene('fecha')) errores.push('Indica qué columna tiene la fecha de la clase.');
  if (errores.length) return { ok: false, errores, tipo };
  const nuevosRel = rel => ({ profesoresNuevos: [...rel.nuevosProf.values()], vehiculosNuevos: [...rel.nuevosVeh.values()].map(v => v.nombre + (v.matricula ? ` (${v.matricula})` : '')) });
  if (tipo === 'alumnos') {
    const { filas, rel } = analizarAlumnos(d, entrada);
    return { ok: true, tipo, filas, rel, resumen: resumenDe(filas, nuevosRel(rel)) };
  }
  const { filas, rel, alumnosNuevos } = analizarClases(d, entrada);
  const nuevas = filas.filter(f => f.accion === 'nuevo');
  return {
    ok: true, tipo, filas, rel, alumnosNuevos,
    resumen: resumenDe(filas, {
      clases: nuevas.reduce((s, f) => s + f.clases, 0), alumnosNuevos: alumnosNuevos.size,
      sinKm: nuevas.filter(f => !(f.practica.km_final > 0)).length, ...nuevosRel(rel)
    })
  };
}
function analizarImportacion(entrada = {}) {
  const { rel, alumnosNuevos, ...plan } = _plan(load(), entrada);
  return plan;
}

// ─── APLICAR ────────────────────────────────────────────────────────────────

function crearRelacionados(d, rel, registro, s) {
  const ids = { prof: new Map(), veh: new Map() };
  for (const [k, nombre] of rel.nuevosProf) {
    const id = nextId('pf');
    d.profesores.push({ id, nombre, nota: '', sucursal_id: null, dni: null });
    ids.prof.set(k, id); registro.creados.profesores.push(id); if (s) s.markDirty('profesores', id);
  }
  for (const [k, v] of rel.nuevosVeh) {
    const id = nextId('v');
    d.vehiculos.push({ id, nombre: v.nombre, matricula: v.matricula || '', km_actual: 0, sucursal_id: null });
    ids.veh.set(k, id); registro.creados.vehiculos.push(id); if (s) s.markDirty('vehiculos', id);
  }
  const resolver = (val, mapa) => (typeof val === 'string' && val.startsWith('nuevo:') ? mapa.get(val.slice(6)) || null : val ?? null);
  return { profesor: v => resolver(v, ids.prof), vehiculo: v => resolver(v, ids.veh) };
}

function nuevoAlumno(d, datos, opciones, hoy) {
  const id = nextId('a');
  const a = {
    id, nombre: datos.nombre, primer_apellido: datos.primer_apellido || null, segundo_apellido: datos.segundo_apellido || null,
    permiso: datos.permiso || 'B', vehiculo_id: datos.vehiculo_id || null, profesor_id: datos.profesor_id || null,
    sucursal_id: opciones.sucursal_id ? parseInt(opciones.sucursal_id) : null, email: datos.email || null, n_inscripcion: null,
    telefono: datos.telefono || null, dni: datos.dni || null, fecha_nacimiento: datos.fecha_nacimiento || null,
    direccion: datos.direccion || null, fecha_alta: datos.fecha_alta || hoy, observaciones: datos.observaciones || null,
    estado: datos.estado || null, codigo_postal: datos.codigo_postal || null, poblacion: datos.poblacion || null,
    permisos_posee: null, fecha_inicio: null, fecha_fin: null, resultado: null, permisos: datos.permisos || [],
    clases_previas: datos.clases_previas || 0, km_previos: datos.km_previos || 0,
    ...camposExtraVacios('alumnos'), ...extraerCamposExtra('alumnos', datos)
  };
  d.alumnos.push(a);
  return a;
}

function cargoSaldo(d, alumno, importe, hoy) {
  if (!d.cargos) d.cargos = [];
  const id = nextId('cargo');
  d.cargos.push({
    id, alumno_id: alumno.id, concepto: importe > 0 ? 'Saldo pendiente (programa anterior)' : 'Saldo a favor (programa anterior)',
    tipo: importe > 0 ? 'cargo' : 'descuento', importe, fecha: hoy, sucursal_id: alumno.sucursal_id || null,
    nota: NOTA_IMPORTADO, deleted: false, updated_at: new Date().toISOString()
  });
  return id;
}

/**
 * Importa de verdad. Repite el análisis (determinista) y guarda exactamente lo
 * que enseñó la vista previa. Antes hace una copia de seguridad. Devuelve
 * { ok, id, resumen, copia } o { ok:false, errores }.
 */
function aplicarImportacion(entrada = {}) {
  const copia = crearBackup();
  const d = load();
  const plan = _plan(d, entrada);
  if (!plan.ok) return plan;
  const opciones = entrada.opciones || {};
  const hoy = opciones.hoy || hoyLocalISO();
  const s = _sync();
  const registro = {
    id: `imp-${Date.now()}`, fecha: new Date().toISOString(), tipo: plan.tipo, archivo: txt(entrada.archivo).slice(0, 120) || 'Tabla pegada',
    creados: { alumnos: [], profesores: [], vehiculos: [], practicas: [], cargos: [] }, actualizados: [], previasRestadas: [], deshecha: null
  };
  // Profesores y coches nuevos: los ids «nuevo:...» del análisis se resuelven aquí
  const r = crearRelacionados(d, plan.rel, registro, s);
  const tocados = new Set();

  if (plan.tipo === 'alumnos') {
    for (const f of plan.filas) {
      if (f.accion === 'nuevo') {
        const a = nuevoAlumno(d, { ...f.alumno, profesor_id: r.profesor(f.alumno.profesor_id), vehiculo_id: r.vehiculo(f.alumno.vehiculo_id) }, opciones, hoy);
        registro.creados.alumnos.push(a.id); tocados.add(a.id);
        if (f.saldo) registro.creados.cargos.push(cargoSaldo(d, a, f.saldo, hoy));
      } else if (f.accion === 'actualizar') {
        const a = d.alumnos.find(x => x.id === f.id);
        if (!a) continue;
        const antes = {}, despues = {};
        for (const [campo, [, nv]] of Object.entries(f.cambios || {})) {
          const valor = campo === 'profesor_id' ? r.profesor(nv) : campo === 'vehiculo_id' ? r.vehiculo(nv) : nv;
          antes[campo] = a[campo] ?? null; despues[campo] = valor; a[campo] = valor;
        }
        if (Object.keys(antes).length) { registro.actualizados.push({ id: a.id, antes, despues }); tocados.add(a.id); }
        if (f.saldo) registro.creados.cargos.push(cargoSaldo(d, a, f.saldo, hoy));
      }
    }
  } else {
    const dur = Math.min(240, Math.max(10, Math.round(Number(opciones.duracion) || 45)));
    const idNuevo = new Map();
    for (const [k, datos] of plan.alumnosNuevos) {
      const a = nuevoAlumno(d, { ...datos, estado: 'en_practicas' }, opciones, hoy);
      idNuevo.set(k, a.id); registro.creados.alumnos.push(a.id); tocados.add(a.id);
    }
    const porAlumno = new Map();
    for (const f of plan.filas.filter(x => x.accion === 'nuevo')) {
      const aid = f.alumno_id || idNuevo.get(f.alumno_nuevo);
      const a = d.alumnos.find(x => x.id === aid);
      if (!a) continue;
      const pr = f.practica, vid = r.vehiculo(pr.vehiculo_id), pid0 = r.profesor(pr.profesor_id);
      const total = pr.km_final > 0 ? pr.km_final - pr.km_inicial : 0, base = Math.floor(total / f.clases), resto = total % f.clases;
      let km = pr.km_inicial;
      for (let j = 0; j < f.clases; j++) {
        const tramo = total ? base + (j < resto ? 1 : 0) : 0;
        const id = nextId('p');
        d.practicas.push({
          id, alumno_id: a.id, vehiculo_id: vid, fecha: pr.fecha, km_inicial: total ? km : 0, km_final: total ? km + tramo : 0,
          profesor_id: pid0, tipo: 'circulacion', sucursal_id: a.sucursal_id || null, nota: j === 0 ? pr.nota : '',
          hora_inicio: pr.hora_inicio ? aHHMM(aMin(pr.hora_inicio) + j * dur) : null, tipo_detalle: MARCA_ANTERIOR
        });
        km += tramo;
        registro.creados.practicas.push(id);
      }
      const v = vid && d.vehiculos.find(x => x.id === vid);
      if (v && pr.km_final > (v.km_actual || 0)) { v.km_actual = pr.km_final; if (s) s.markDirty('vehiculos', v.id); }
      porAlumno.set(a.id, (porAlumno.get(a.id) || 0) + f.clases);
    }
    // Las clases importadas salen de las «clases ya hechas» (como las anotadas a mano)
    for (const [aid, nClases] of porAlumno) {
      const a = d.alumnos.find(x => x.id === aid);
      const resta = Math.min(a.clases_previas || 0, nClases);
      if (resta) { a.clases_previas -= resta; registro.previasRestadas.push({ alumno_id: aid, n: resta }); tocados.add(aid); }
    }
  }

  registro.resumen = { ...plan.resumen, creadosAlumnos: registro.creados.alumnos.length, actualizadosAlumnos: registro.actualizados.length, clasesCreadas: registro.creados.practicas.length };
  registrarImportacion(d, registro);
  const qué = plan.tipo === 'alumnos'
    ? `${registro.creados.alumnos.length} alumnos nuevos y ${registro.actualizados.length} completados`
    : `${registro.creados.practicas.length} clases anteriores y ${registro.creados.alumnos.length} alumnos nuevos`;
  addLog('importacion', `Datos traídos de otro programa (${registro.archivo}): ${qué}`, []);
  save();
  if (s) {
    s.markDirtyVarios('alumnos', tocados);
    s.markDirtyVarios('practicas', registro.creados.practicas);
    s.markDirtyVarios('cargos', registro.creados.cargos);
  }
  return { ok: true, id: registro.id, resumen: registro.resumen, copia: copia && copia.ok ? copia.file : null };
}

// ─── HISTORIAL Y DESHACER ───────────────────────────────────────────────────

// Guarda el registro de una importación (también la de Ariauto, db/ariauto.js)
function registrarImportacion(d, registro) {
  if (!d.importaciones) d.importaciones = [];
  d.importaciones.unshift(registro);
  d.importaciones = d.importaciones.slice(0, MAX_IMPORTACIONES);
}

function getImportaciones() {
  const d = load();
  const n = (i, k) => ((i.creados || {})[k] || []).length;
  return (d.importaciones || []).map(i => ({
    id: i.id, fecha: i.fecha, tipo: i.tipo, archivo: i.archivo, deshecha: i.deshecha,
    alumnos: n(i, 'alumnos'), actualizados: i.actualizados.filter(x => !x.tabla || x.tabla === 'alumnos').length, clases: n(i, 'practicas'),
    profesores: n(i, 'profesores'), vehiculos: n(i, 'vehiculos'),
    cargos: n(i, 'cargos'), pagos: n(i, 'pagos'), examenes: n(i, 'presentaciones')
  }));
}

/**
 * Deshace una importación: quita lo que creó (salvo los alumnos que ya tienen
 * clases, pagos o cargos nuevos desde entonces, que se conservan) y devuelve
 * a su valor anterior lo que completó (si nadie lo ha cambiado después).
 */
function deshacerImportacion(id) {
  const d = load();
  const imp = (d.importaciones || []).find(x => x.id === id);
  if (!imp) return { ok: false, error: 'No se encuentra esa importación.' };
  if (imp.deshecha) return { ok: false, error: 'Esa importación ya se deshizo.' };
  const s = _sync();
  const marcarBorrado = (t, ids) => { if (s) s.markDeletedVarios(t, ids); };
  const res = { practicas: 0, alumnos: 0, conservados: [], restaurados: 0, cargos: 0, profesores: 0, vehiculos: 0 };

  const pids = new Set(imp.creados.practicas);
  const quitadas = d.practicas.filter(p => pids.has(p.id)).map(p => p.id);
  d.practicas = d.practicas.filter(p => !pids.has(p.id));
  marcarBorrado('practicas', quitadas); res.practicas = quitadas.length;
  for (const { alumno_id, n } of imp.previasRestadas || []) {
    const a = d.alumnos.find(x => x.id === alumno_id);
    if (a) { a.clases_previas = (a.clases_previas || 0) + n; if (s) s.markDirty('alumnos', a.id); }
  }
  const cids = new Set(imp.creados.cargos);
  for (const c of d.cargos || []) if (cids.has(c.id) && !c.deleted) { c.deleted = true; c.updated_at = new Date().toISOString(); res.cargos++; marcarBorrado('cargos', [c.id]); }
  // Lo que trae la importación de Ariauto: pagos, exámenes, tasas y caducidades
  const quitar = (tabla, ids, sincronizada) => {
    const set = new Set(ids || []);
    if (!set.size || !Array.isArray(d[tabla])) return 0;
    const fuera = d[tabla].filter(x => set.has(x.id)).map(x => x.id);
    d[tabla] = d[tabla].filter(x => !set.has(x.id));
    if (sincronizada) marcarBorrado(tabla, fuera);
    return fuera.length;
  };
  res.pagos = quitar('pagos', imp.creados.pagos, true);
  res.examenes = quitar('presentaciones', imp.creados.presentaciones);
  res.tasas = quitar('tasas', imp.creados.tasas);
  res.vencimientos = quitar('vencimientos', imp.creados.vencimientos);

  // Alumnos con actividad, calculado una vez (con miles de alumnos, mirar todas
  // las clases por cada uno dejaba la app parada).
  const conActividad = new Set();
  for (const t of ['practicas', 'pagos', 'cargos', 'reservas']) {
    for (const r of d[t] || []) if (!r.deleted) conActividad.add(r.alumno_id);
  }
  const alumnosPorId = new Map(d.alumnos.map(a => [a.id, a]));
  const fuera = [];
  for (const aid of imp.creados.alumnos) {
    const a = alumnosPorId.get(aid);
    if (!a) continue;
    if (conActividad.has(aid)) res.conservados.push(nombreDe(a)); else fuera.push(aid);
  }
  const fueraSet = new Set(fuera);
  d.alumnos = d.alumnos.filter(a => !fueraSet.has(a.id));
  marcarBorrado('alumnos', fuera); res.alumnos = fuera.length;

  // Lo que se completó en registros que ya estaban (alumnos y, desde Ariauto,
  // también profesores, coches, exámenes y tasas): vuelve a como estaba si
  // nadie lo ha cambiado después.
  const SINCRONIZADAS = new Set(['alumnos', 'profesores', 'vehiculos']);
  for (const { tabla = 'alumnos', id: rid, antes, despues } of imp.actualizados) {
    const r = (d[tabla] || []).find(x => x.id === rid);
    if (!r) continue;
    let algo = false;
    for (const campo of Object.keys(antes)) {
      if (String(r[campo] ?? '') === String(despues[campo] ?? '')) { r[campo] = antes[campo]; algo = true; }
    }
    if (!algo) continue;
    if (tabla === 'alumnos') res.restaurados++;
    if (s && SINCRONIZADAS.has(tabla)) s.markDirty(tabla, r.id);
  }
  const profUsado = pid => d.alumnos.some(a => a.profesor_id === pid) || d.practicas.some(p => p.profesor_id === pid);
  const vehUsado = vid => d.alumnos.some(a => a.vehiculo_id === vid) || d.practicas.some(p => p.vehiculo_id === vid) ||
    (d.vencimientos || []).some(v => v.entidad_tipo === 'vehiculo' && v.entidad_id === vid && !v.deleted);
  const profFuera = imp.creados.profesores.filter(x => d.profesores.some(p => p.id === x) && !profUsado(x));
  const vehFuera = imp.creados.vehiculos.filter(x => d.vehiculos.some(v => v.id === x) && !vehUsado(x));
  d.profesores = d.profesores.filter(p => !profFuera.includes(p.id));
  d.vehiculos = d.vehiculos.filter(v => !vehFuera.includes(v.id));
  marcarBorrado('profesores', profFuera); marcarBorrado('vehiculos', vehFuera);
  res.profesores = profFuera.length; res.vehiculos = vehFuera.length;

  imp.deshecha = new Date().toISOString();
  addLog('importacion', `Importación deshecha (${imp.archivo}): ${res.alumnos} alumnos y ${res.practicas} clases quitados, ${res.restaurados} alumnos restaurados${res.conservados.length ? `; se conservan ${res.conservados.length} que ya tienen actividad` : ''}`, res.conservados);
  save();
  return { ok: true, ...res };
}

// ─── AYUDA PARA OTROS IMPORTADORES ──────────────────────────────────────────

/**
 * Alumno de `d` al que se refiere un texto («Lucía Martín», «MARTIN, LUCIA»)
 * y/o un DNI: por DNI, por el nombre tal cual (como se guardaba antes) o por
 * nombre y apellidos en cualquier orden. null si no hay o si hay varios.
 */
function buscarAlumnoPorTexto(d, nombre, dni) {
  const idx = indices(d);
  const doc = limpiarDni(dni);
  if (doc.valor && idx.porDni.has(doc.valor)) return idx.porDni.get(doc.valor);
  const t = txt(nombre).toLowerCase();
  if (!t) return null;
  const literal = idx.alumnos.filter(a => (a.nombre || '').toLowerCase() === t);
  if (literal.length === 1) return literal[0];
  const p = partirNombreCompleto(nombre);
  const k = claveNombre(p.nombre, p.primer_apellido, p.segundo_apellido);
  const cand = idx.porNombre.get(k) || [];
  return cand.length === 1 ? cand[0] : null;
}

module.exports = {
  CAMPOS_MIGRACION: CAMPOS,
  detectarTablaMigracion: detectarTabla,
  analizarImportacion, aplicarImportacion, getImportaciones, deshacerImportacion,
  buscarAlumnoPorTexto,
  // para db/ariauto.js (mismo emparejamiento, registro e historial)
  _interno: { indices, buscarAlumno, nombreDe, limpiarMatricula, registrarImportacion },
  // utilidades de normalización (también para pruebas)
  _norm: {
    normTexto, claveNombre, capitalizarNombre, partirApellidos, partirNombreCompleto, limpiarDni, limpiarTelefono, limpiarEmail,
    leerFechaFlexible, leerHoraFlexible, limpiarCP, leerPermiso, leerEstado, leerEntero, leerImporte, pareceMatricula, campoPorTitulo
  }
};
