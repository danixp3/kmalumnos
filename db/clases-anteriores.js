/**
 * db/clases-anteriores.js  –  clases que el alumno hizo ANTES de usar la app
 * (pantalla Puesta en marcha). Dos caminos que conviven sin pisarse:
 *
 *  1. Anotarlas a mano, desde el papel: fecha y, si se saben, hora y km. Una
 *     fila puede ser de varias clases el mismo día (columna «Clases»): se
 *     guardan seguidas, con la hora y los km repartidos. También se pueden
 *     importar de un archivo (p. ej. el que saca una IA de un vídeo de la
 *     ficha en papel): leerArchivoClasesAnteriores.
 *  2. Las que no se anoten se crean solas: se reparten hacia atrás en días
 *     laborables (como mucho 2 por alumno y día, 12 por profesor y día y 12 por
 *     coche y día, sin pisarse de horario) y se les ponen km encadenados en el
 *     coche del alumno que terminan donde empieza lo ya conocido (las clases con
 *     km o, si no hay, el km de hoy del cuentakilómetros). Nunca se solapan con
 *     km ya registrados: si entre dos clases conocidas no caben, se buscan
 *     otros días.
 *
 * Son prácticas normales (cuentan para clases, km, ficha DGT, semáforo y
 * cobros) con la marca tipo_detalle = 'anterior' para poder listarlas aquí.
 * `alumno.clases_previas` = las que aún faltan por crear: cada clase anotada o
 * generada la descuenta, así el total del alumno no cambia.
 *
 * La propuesta automática usa azar (km de cada clase dentro del rango): se
 * PREVISUALIZA con planificarClasesAnteriores y se guarda EXACTAMENTE lo
 * mostrado con aplicarClasesAnteriores (mismo patrón que Generar km).
 */

// ─── CLASES ANTERIORES ──────────────────────────────────────────────────────

const { load, save, nextId, _sync, addLog, crearBackup, hoyLocalISO, clasesDePractica, trozosDeClases, kmPorPesos, leerCantidadClases, aCuartos, fmtClases: fmtC } = require('./core');

const MARCA = 'anterior';
const MAX_CLASES_FILA = 4;   // clases seguidas el mismo día en una fila (de ¼ en ¼: 1 ½ = una entera y otra de ½)
const sumaClases = lista => aCuartos(lista.reduce((t, p) => t + clasesDePractica(p), 0));
const LIMITES = { porAlumnoDia: 2, porProfesorDia: 12, porVehiculoDia: 12, desde: 9 * 60, hasta: 21 * 60, diasAtras: 2000 };

const esAnterior = p => !!p && !p.deleted && p.tipo_detalle === MARCA;
const pad = n => String(n).padStart(2, '0');
const aMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const aHHMM = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const isoDe = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const sumarDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoDe(new Date(y, m - 1, d + n)); };
const diaSemana = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const fmtF = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const miles = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const nombreDe = a => a ? [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ') : '?';
// Km escritos a mano: admite «207908» y «207.908» (puntos de miles).
const kmEntero = v => {
  let t = String(v == null ? '' : v).trim().replace(/\s/g, '');
  t = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t.replace(',', '.');
  const n = Math.round(Number(t));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const tiene = (p) => p.km_final > 0;
// Orden en el tiempo: fecha, hora (sin hora = al final del día) e id.
const ordenTiempo = (x, y) => (x.fecha || '').localeCompare(y.fecha || '') ||
  (x.hora_inicio || '99:99').localeCompare(y.hora_inicio || '99:99') || (x._orden ?? x.id ?? 0) - (y._orden ?? y.id ?? 0);

// Acepta 2026-09-08, 8/9/2026, 08-09-26... Devuelve ISO o null.
function leerFecha(v) {
  const s = String(v == null ? '' : v).trim();
  let y, m, d;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) {
    [d, m, y] = [+r[1], +r[2], +r[3]];
    if (y < 100) y += 2000;
  } else return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d || y < 1990) return null;
  return isoDe(dt);
}
function leerHora(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const r = s.match(/^(\d{1,2})[:.h](\d{2})$/) || s.match(/^(\d{1,2})$/);
  if (!r) return null;
  const h = +r[1], m = r[2] ? +r[2] : 0;
  return h < 24 && m < 60 ? `${pad(h)}:${pad(m)}` : null;
}

// Lo que necesita el editor «Anotar» de un alumno. Solo lectura.
function getClasesAnteriores(alumno_id) {
  const d = load();
  const a = d.alumnos.find(x => x.id === parseInt(alumno_id));
  if (!a) return null;
  const clases = d.practicas.filter(p => p.alumno_id === a.id && esAnterior(p)).sort(ordenTiempo)
    .map(p => ({ id: p.id, fecha: p.fecha, hora_inicio: p.hora_inicio || '', km_inicial: p.km_inicial || 0, km_final: p.km_final || 0, vehiculo_id: p.vehiculo_id, profesor_id: p.profesor_id || null, clases: clasesDePractica(p) }));
  return {
    alumno: { id: a.id, nombre: nombreDe(a), vehiculo_id: a.vehiculo_id || null, profesor_id: a.profesor_id || null, clases_previas: a.clases_previas || 0, km_previos: a.km_previos || 0 },
    clases, total: aCuartos(sumaClases(clases.map(c => ({ fraccion: c.clases < 1 ? c.clases : null }))) + (a.clases_previas || 0))
  };
}

/**
 * Guarda las clases anteriores anotadas a mano de un alumno (sustituye a las
 * que tuviera: las que no vengan se borran). Cada fila: { id?, fecha, hora_inicio?,
 * km_inicial?, km_final? }. Valida fechas, km y que no se solapen ni se
 * contradigan (fecha anterior con más km) con otras clases del mismo coche.
 * No guarda nada si hay errores. Devuelve { ok, errores[], anotadas, pendientes }.
 */
function guardarClasesAnteriores(alumno_id, filas = [], opciones = {}) {
  const d = load();
  const dur = Math.min(240, Math.max(10, Math.round(Number(opciones.duracion) || 45)));
  const a = d.alumnos.find(x => x.id === parseInt(alumno_id));
  if (!a) return { ok: false, errores: ['Alumno no encontrado.'] };
  const hoy = hoyLocalISO();
  const previas = d.practicas.filter(p => p.alumno_id === a.id && esAnterior(p));
  const idsPrevias = new Set(previas.map(p => p.id));
  const totalAntes = aCuartos(sumaClases(previas) + (a.clases_previas || 0));
  const errores = [];
  const limpias = [];

  (Array.isArray(filas) ? filas : []).forEach((f, i) => {
    const n = i + 1;
    if (![f.fecha, f.hora_inicio, f.km_inicial, f.km_final].some(v => String(v == null ? '' : v).trim())) return; // fila vacía
    const fecha = leerFecha(f.fecha);
    if (!fecha) { errores.push(`Fila ${n}: la fecha no es válida (escríbela como dd/mm/aaaa).`); return; }
    if (fecha > hoy) errores.push(`Fila ${n}: el ${fmtF(fecha)} todavía no ha llegado.`);
    const hora = leerHora(f.hora_inicio);
    if (hora === null) errores.push(`Fila ${n}: la hora no es válida (hh:mm).`);
    const ki = kmEntero(f.km_inicial), kf = kmEntero(f.km_final);
    const conKm = ki > 0 || kf > 0;
    if (conKm && !(kf > ki)) errores.push(`Fila ${n}: el km final debe ser mayor que el inicial.`);
    else if (conKm && kf - ki > 1000) errores.push(`Fila ${n}: más de 1.000 km en una clase; revisa los km.`);
    const vehiculo_id = parseInt(f.vehiculo_id) || a.vehiculo_id || null;
    if (!vehiculo_id || !d.vehiculos.some(v => v.id === vehiculo_id)) { errores.push(`Fila ${n}: ${nombreDe(a)} no tiene coche asignado; asígnaselo en la tabla de alumnos.`); return; }
    // Varias clases el mismo día en una fila: seguidas, cada una de `dur` min
    // (una fracción, su parte), con los km repartidos en proporción a lo que
    // vale cada una. Van de ¼ en ¼: 1,5 = una entera y otra de ½.
    const k = String(f.clases == null ? '' : f.clases).trim() === '' ? 1 : leerCantidadClases(f.clases);
    if (!k || k > MAX_CLASES_FILA) { errores.push(`Fila ${n}: las clases van de ¼ en ¼, de ¼ a ${MAX_CLASES_FILA} (¼, ½, ¾, 1, 1 ½…).`); return; }
    const pesos = trozosDeClases(k);
    if (conKm && kf - ki < pesos.length) { errores.push(`Fila ${n}: con ${kf - ki} km no caben ${fmtC(k)} clases.`); return; }
    if (hora && aMin(hora) + Math.round(k * dur) > 24 * 60) { errores.push(`Fila ${n}: ${fmtC(k)} clases desde las ${hora} pasan de medianoche.`); return; }
    const ids = [...(Array.isArray(f.ids) ? f.ids : []), f.id].map(x => parseInt(x)).filter(x => idsPrevias.has(x));
    const tramos = conKm ? kmPorPesos(kf - ki, pesos) : pesos.map(() => 0);
    let km = ki, acum = 0;
    pesos.forEach((w, j) => {
      limpias.push({
        n, id: ids[j] || null, fecha, hora_inicio: hora ? aHHMM(aMin(hora) + Math.round(acum * dur)) : null,
        km_inicial: conKm ? km : 0, km_final: conKm ? km + tramos[j] : 0, vehiculo_id,
        profesor_id: parseInt(f.profesor_id) || a.profesor_id || null, fraccion: w < 1 ? w : null
      });
      km += tramos[j]; acum += w;
    });
  });
  // La misma clase dos veces (misma fecha y hora): seguramente repetida al copiar
  const vistas = new Map();
  for (const f of limpias) {
    if (!f.hora_inicio) continue;
    const clave = `${f.fecha}|${f.hora_inicio}`;
    if (vistas.has(clave) && vistas.get(clave) !== f.n) errores.push(`Filas ${vistas.get(clave)} y ${f.n}: misma fecha y hora (${fmtF(f.fecha)} ${f.hora_inicio}); ¿está repetida?`);
    else vistas.set(clave, f.n);
  }

  // Coherencia con el resto de clases del mismo coche (las del propio alumno
  // que se van a sustituir no cuentan).
  if (!errores.length) {
    const ajenas = d.practicas.filter(p => !p.deleted && !idsPrevias.has(p.id) && tiene(p));
    const conKm = limpias.filter(tiene);
    for (const f of conKm) {
      const otra = ajenas.find(p => p.vehiculo_id === f.vehiculo_id && f.km_inicial < p.km_final && p.km_inicial < f.km_final);
      if (otra) {
        const al = d.alumnos.find(x => x.id === otra.alumno_id);
        errores.push(`Fila ${f.n}: los km ${miles(f.km_inicial)}–${miles(f.km_final)} se solapan con la clase de ${nombreDe(al)} del ${fmtF(otra.fecha)} (${miles(otra.km_inicial)}–${miles(otra.km_final)}).`);
        continue;
      }
      const gemela = conKm.find(g => g.n > f.n && g.vehiculo_id === f.vehiculo_id && f.km_inicial < g.km_final && g.km_inicial < f.km_final);
      if (gemela) errores.push(`Filas ${f.n} y ${gemela.n}: sus km se solapan.`);
    }
    // Una clase de fecha anterior no puede llevar más km que otra posterior.
    if (!errores.length) {
      const todas = [...ajenas.map(p => ({ ...p, ajena: true })), ...conKm];
      for (const f of conKm) {
        const contra = todas.find(p => p !== f && p.vehiculo_id === f.vehiculo_id && p.fecha !== f.fecha &&
          ((p.fecha < f.fecha && p.km_inicial > f.km_inicial) || (p.fecha > f.fecha && p.km_inicial < f.km_inicial)));
        if (contra) {
          const quien = contra.ajena ? `la clase de ${nombreDe(d.alumnos.find(x => x.id === contra.alumno_id))} del ${fmtF(contra.fecha)}` : `la fila ${contra.n} (${fmtF(contra.fecha)})`;
          errores.push(`Fila ${f.n} (${fmtF(f.fecha)}): sus km no encajan con ${quien}: una clase más antigua no puede tener más km.`);
        }
      }
    }
  }
  if (errores.length) return { ok: false, errores: [...new Set(errores)].slice(0, 12) };

  const s = _sync();
  const quedan = new Set();
  const tocadas = [];
  for (const f of limpias) {
    if (f.id) {
      const p = d.practicas.find(x => x.id === f.id);
      Object.assign(p, { fecha: f.fecha, hora_inicio: f.hora_inicio, km_inicial: f.km_inicial, km_final: f.km_final, vehiculo_id: f.vehiculo_id, profesor_id: f.profesor_id, fraccion: f.fraccion });
      quedan.add(f.id); tocadas.push(f.id);
    } else {
      const id = nextId('p');
      d.practicas.push({
        id, alumno_id: a.id, vehiculo_id: f.vehiculo_id, fecha: f.fecha, km_inicial: f.km_inicial, km_final: f.km_final,
        profesor_id: f.profesor_id, tipo: 'circulacion', sucursal_id: a.sucursal_id || null,
        hora_inicio: f.hora_inicio, tipo_detalle: MARCA, ...(f.fraccion ? { fraccion: f.fraccion } : {})
      });
      tocadas.push(id);
    }
    const v = d.vehiculos.find(x => x.id === f.vehiculo_id);
    if (v && f.km_final > (v.km_actual || 0)) v.km_actual = f.km_final;
  }
  const borradas = previas.filter(p => !quedan.has(p.id)).map(p => p.id);
  if (borradas.length) d.practicas = d.practicas.filter(p => !borradas.includes(p.id));
  const anotadas = sumaClases(limpias);
  a.clases_previas = Math.max(0, aCuartos(totalAntes - anotadas));
  addLog('puesta_en_marcha', `Clases anteriores de ${nombreDe(a)}: ${fmtC(anotadas)} anotadas (${limpias.filter(tiene).length} con km); faltan ${fmtC(a.clases_previas)} por crear`, []);
  save();
  if (s) {
    s.markDirtyVarios('practicas', tocadas);
    s.markDeletedVarios('practicas', borradas);
    s.markDirty('alumnos', a.id);
    s.markDirtyVarios('vehiculos', new Set(limpias.map(f => f.vehiculo_id)));
  }
  return { ok: true, errores: [], anotadas, pendientes: a.clases_previas };
}

/**
 * Lee las clases anteriores de un archivo de texto (CSV/TXT: el que saca una IA
 * de un vídeo de la ficha en papel, una hoja de cálculo guardada como CSV...) o
 * de un texto pegado. Solo lectura: devuelve las filas para el editor
 * «Anotar», que las enseña antes de guardar nada.
 *   - Separador: tabulador, punto y coma o coma (lo que use el texto).
 *   - Con cabecera (fecha, hora, clases, km inicial, km final), por nombre; sin
 *     ella, por lo que parece cada casilla: fecha, hora (10:00), nº de clases
 *     (1-4) y km (números grandes: inicial y final).
 *   - Una fecha con «?» (la IA no estaba segura) se importa marcada para revisar.
 * Devuelve { filas: [{ fecha: 'dd/mm/aaaa', hora_inicio, clases, km_inicial, km_final, revisar }],
 *            errores: ['Línea 4: …'], lineas }.
 */
// Una casilla que es un nº de clases (sin cabecera): 1–4, de ¼ en ¼ (½, 1,5, 0.75…)
const esCantidadCorta = c => { const v = leerCantidadClases(c); return v != null && v <= MAX_CLASES_FILA && !/^\d{1,2}[:h]\d{2}$/.test(c) && !/^\d+[.,]\d{3,}$/.test(c); };
function leerArchivoClasesAnteriores(texto) {
  // Cada línea con su nº real en el archivo (para los avisos)
  const lineas = String(texto == null ? '' : texto).replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n')
    .map((l, k) => ({ t: l.trim(), n: k + 1 })).filter(l => l.t && !/^```/.test(l.t));
  const filas = [], errores = [];
  if (!lineas.length) return { filas, errores: ['El archivo está vacío.'], lineas: 0 };
  const sep = lineas.some(l => l.t.includes('\t')) ? '\t' : lineas.some(l => l.t.includes(';')) ? ';' : ',';
  // Una línea con otro separador, o solo con espacios («9/9/2025 17:00 2»), también vale
  const partir = l => {
    const otro = [sep, '\t', ';', ','].find(x => l.includes(x));
    const limpiar = celdas => celdas.map(c => c.trim().replace(/^"(.*)"$/, '$1').trim());
    const celdas = limpiar(otro ? l.split(otro) : l.split(/\s+/));
    // «08/09/2025 10:00 1,5»: la coma es la de los decimales, no un separador
    if (otro === ',' && !celdas.some(c => leerFecha(c.replace(/\?$/, '')))) {
      const porEspacios = limpiar(l.split(/\s+/));
      if (porEspacios.some(c => leerFecha(c.replace(/\?$/, '')))) return porEspacios;
    }
    return celdas;
  };
  const norm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
  // ¿Cabecera? (primera línea sin ninguna fecha y con la palabra «fecha»)
  let cols = null, desde = 0;
  const primera = partir(lineas[0].t);
  if (primera.some(c => norm(c) === 'fecha' || norm(c) === 'dia') && !primera.some(c => leerFecha(c.replace(/\?$/, '')))) {
    cols = {};
    primera.forEach((c, i) => {
      const t = norm(c);
      if (t === 'fecha' || t === 'dia') cols.fecha = i;
      else if (t.startsWith('hora') || t === 'inicio') cols.hora = i;
      else if (t.includes('clase') || t === 'n' || t === 'numero' || t === 'num') cols.clases = i;
      else if (t.includes('km') && (t.includes('fin') || t.includes('final'))) cols.km_final = i;
      else if (t.includes('km')) cols.km_inicial = i;
    });
    desde = 1;
  }
  for (let i = desde; i < lineas.length; i++) {
    const celdas = partir(lineas[i].t);
    const n = lineas[i].n;
    let fechaTxt, horaTxt = '', clasesTxt = '', kms = [];
    if (cols) {
      fechaTxt = celdas[cols.fecha] || '';
      if (cols.hora != null) horaTxt = celdas[cols.hora] || '';
      if (cols.clases != null) clasesTxt = celdas[cols.clases] || '';
      if (cols.km_inicial != null) kms[0] = celdas[cols.km_inicial] || '';
      if (cols.km_final != null) kms[1] = celdas[cols.km_final] || '';
    } else {
      // Sin cabecera: la fecha es la primera casilla que lo parezca; el resto, por su forma
      const iF = celdas.findIndex(c => leerFecha(c.replace(/\?$/, '')));
      fechaTxt = iF >= 0 ? celdas[iF] : (celdas[0] || '');
      for (const c of celdas.filter((_, k) => k !== iF)) {
        if (!c) continue;
        // «1,5» / «0.25» / «½» = clases (antes que la hora: 0.25 no es las 00:25)
        if (!clasesTxt && esCantidadCorta(c)) clasesTxt = c;
        else if (!horaTxt && /^\d{1,2}[:.h]\d{2}$/.test(c)) horaTxt = c;
        else if (/^\d{1,3}(\.\d{3})+$|^\d{2,7}$/.test(c)) kms.push(c);
      }
    }
    const revisar = /\?\s*$/.test(fechaTxt);
    const fecha = leerFecha(fechaTxt.replace(/\?\s*$/, ''));
    if (!fecha) {
      if (i === 0 && !cols) continue; // una primera línea que no es una clase (título, cabecera rara)
      errores.push(`Línea ${n}: no se entiende la fecha «${fechaTxt.slice(0, 30)}».`);
      continue;
    }
    const hora = leerHora(horaTxt);
    if (hora === null) errores.push(`Línea ${n}: la hora «${horaTxt}» no se entiende; se deja en blanco.`);
    const leida = clasesTxt ? leerCantidadClases(clasesTxt) : 1;
    const clases = leida && leida <= MAX_CLASES_FILA ? leida : 1;
    if (clasesTxt && clases !== leida) errores.push(`Línea ${n}: «${clasesTxt}» clases no es válido (de ¼ a ${MAX_CLASES_FILA}, de ¼ en ¼: 1, 1.5, 0.25…); se pone 1.`);
    const [ki, kf] = [kmEntero(kms[0]), kmEntero(kms[1])];
    filas.push({
      fecha: fmtF(fecha), hora_inicio: hora || '', clases, revisar,
      km_inicial: ki && kf ? ki : '', km_final: ki && kf ? kf : ''
    });
    if (revisar) errores.push(`Línea ${n}: la fecha ${fmtF(fecha)} venía marcada como dudosa («?»): revísala.`);
  }
  if (!filas.length && !errores.length) errores.push('No se ha encontrado ninguna clase con fecha en el archivo.');
  return { filas, errores, lineas: lineas.length - desde };
}

// Plantilla para importar (la que se le pide a la IA)
const PLANTILLA_CLASES_ANTERIORES = 'fecha;hora;clases\n08/09/2025;10:00;1\n10/09/2025;17:30;2\n12/09/2025;;1\n15/09/2025;18:00;1.5\n17/09/2025;;0.5\n';

// Reparte `total` km entre `n` clases: cada una al azar dentro del rango y, si
// hay que encajarlas en un hueco concreto (`exacto`), escaladas para sumarlo justo.
function repartirKm(n, kmMin, kmMax, exacto) {
  const base = Array.from({ length: n }, () => kmMin + Math.random() * (kmMax - kmMin));
  if (exacto == null) return base.map(x => Math.max(1, Math.round(x)));
  const suma = base.reduce((s, x) => s + x, 0);
  const crudos = base.map(x => (x / suma) * exacto);
  const enteros = crudos.map(Math.floor);
  let resto = exacto - enteros.reduce((s, x) => s + x, 0);
  crudos.map((x, i) => [x - enteros[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (resto > 0) { enteros[i]++; resto--; } });
  return enteros;
}

/**
 * Propuesta para crear las clases anteriores que faltan (no guarda nada).
 * opciones: { kmMin, kmMax, duracion (min por clase), hoy }.
 * Devuelve { ok, vacio, altas[], km[], alumnos[], vehiculos[], avisos[], errores[] }:
 *   altas = clases nuevas { alumno_id, vehiculo_id, profesor_id, fecha, hora_inicio, km_inicial, km_final }
 *   km    = km para clases anotadas sin km { id, km_inicial, km_final }
 */
function planificarClasesAnteriores(opciones = {}) {
  const d = load();
  const kmMin = Math.max(1, Math.round(Number(opciones.kmMin) || 40));
  const kmMax = Math.max(kmMin, Math.round(Number(opciones.kmMax) || 45));
  const dur = Math.min(240, Math.max(10, Math.round(Number(opciones.duracion) || 45)));
  const hoy = opciones.hoy || hoyLocalISO();
  const avisos = [], errores = [];
  const practicas = d.practicas.filter(p => !p.deleted);
  const vehiculoDe = id => d.vehiculos.find(v => v.id === id && !v.deleted);

  // 1. Qué falta por crear
  const pendientes = [];
  for (const a of d.alumnos.filter(x => !x.deleted && x.clases_previas > 0)) {
    if (a.km_previos > 0) { avisos.push(`${nombreDe(a)}: tiene «km ya hechos» apuntados, así que sus ${fmtC(a.clases_previas)} clases se quedan como punto de partida (sin crear). Borra esos km si quieres que se creen.`); continue; }
    const v = vehiculoDe(a.vehiculo_id);
    if (!v) { avisos.push(`${nombreDe(a)}: sin coche asignado; asígnale uno para poder crear sus ${fmtC(a.clases_previas)} clases.`); continue; }
    if (!(v.km_actual > 0) && !practicas.some(p => p.vehiculo_id === v.id && tiene(p))) {
      errores.push(`${v.nombre}: falta el km de hoy de su cuentakilómetros (paso 1); sin él no se pueden poner km a las clases de ${nombreDe(a)}.`);
      continue;
    }
    // 12 ½ clases = 13 prácticas, la más antigua de ½
    pendientes.push({ a, quedan: Math.ceil(a.clases_previas - 1e-9), frac: aCuartos(a.clases_previas % 1), creadas: [] });
  }
  const blancas = practicas.filter(p => esAnterior(p) && !tiene(p) && vehiculoDe(p.vehiculo_id));
  if (!pendientes.length && !blancas.length) return { ok: !errores.length, vacio: !errores.length, altas: [], km: [], alumnos: [], vehiculos: [], avisos, errores };

  // 2. Ocupación de cada día (alumno, profesor, coche) y horas ya cogidas
  const cuenta = new Map();
  const ocup = new Map();
  const n = k => cuenta.get(k) || 0;
  const mas = k => cuenta.set(k, n(k) + 1);
  const tomar = (k, ini, fin) => { if (!ocup.has(k)) ocup.set(k, []); ocup.get(k).push([ini, fin]); };
  const libre = (k, ini, fin) => !(ocup.get(k) || []).some(([a, b]) => ini < b && a < fin);
  for (const p of practicas) {
    if (!p.fecha) continue;
    mas(`${p.fecha}|a|${p.alumno_id}`); mas(`${p.fecha}|v|${p.vehiculo_id}`);
    if (p.profesor_id) mas(`${p.fecha}|p|${p.profesor_id}`);
    if (p.hora_inicio) {
      const i = aMin(p.hora_inicio);
      tomar(`${p.fecha}|v|${p.vehiculo_id}`, i, i + dur);
      if (p.profesor_id) tomar(`${p.fecha}|p|${p.profesor_id}`, i, i + dur);
    }
  }

  // 3. Tramos de km de cada coche: entre dos clases con km conocidas (por fecha)
  //    solo caben las clases que quepan en los km que las separan.
  const tramos = new Map(); // vid -> { fechas, antes[i] (máx km previo), despues[i] (mín km siguiente), usados }
  const tramosDe = vid => {
    if (tramos.has(vid)) return tramos.get(vid);
    const fijas = practicas.filter(p => p.vehiculo_id === vid && tiene(p) && p.fecha).sort(ordenTiempo);
    const v = vehiculoDe(vid);
    const tope = Math.max(Math.round(v.km_actual || 0), 0, ...fijas.map(p => p.km_final));
    const antes = [0], despues = [];
    fijas.forEach((p, i) => { antes[i + 1] = Math.max(antes[i], p.km_final); });
    despues[fijas.length] = tope;
    for (let i = fijas.length - 1; i >= 0; i--) despues[i] = Math.min(despues[i + 1], fijas[i].km_inicial);
    const t = { fechas: fijas.map(p => p.fecha), antes, despues, tope, usados: new Map(), diasFijos: new Set(fijas.map(p => p.fecha)) };
    tramos.set(vid, t);
    for (const b of blancas.filter(p => p.vehiculo_id === vid)) { const k = tramoIdx(t, b.fecha); t.usados.set(k, (t.usados.get(k) || 0) + 1); }
    return t;
  };
  // Índice del tramo de una fecha = nº de clases con km de fechas anteriores
  function tramoIdx(t, fecha) {
    let lo = 0, hi = t.fechas.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (t.fechas[m] < fecha) lo = m + 1; else hi = m; }
    return lo;
  }
  const kmTope = vid => tramosDe(vid).tope;
  function caben(vid, fecha, k) {
    const t = tramosDe(vid);
    if (t.diasFijos.has(fecha)) return false; // ese día el coche ya tiene clases con km: no se mezcla
    const i = tramoIdx(t, fecha);
    return (t.usados.get(i) || 0) + k <= Math.floor((t.despues[i] - t.antes[i]) / kmMin);
  }
  const reservar = (vid, fecha, k) => { const t = tramosDe(vid); const i = tramoIdx(t, fecha); t.usados.set(i, (t.usados.get(i) || 0) + k); };

  // 4. Reparto hacia atrás, día a día (solo laborables). Cada alumno empieza el
  //    día antes de su primera clase registrada en la app (o ayer).
  const primeraApp = new Map();
  for (const p of practicas) if (!esAnterior(p) && p.fecha && (!primeraApp.has(p.alumno_id) || p.fecha < primeraApp.get(p.alumno_id))) primeraApp.set(p.alumno_id, p.fecha);
  for (const x of pendientes) {
    const f = primeraApp.get(x.a.id);
    x.desde = sumarDias(f && f <= hoy ? f : hoy, -1);
  }
  let dia = pendientes.reduce((m, x) => (x.desde > m ? x.desde : m), '0000-00-00');
  for (let paso = 0; pendientes.some(x => x.quedan > 0) && paso < LIMITES.diasAtras; paso++, dia = sumarDias(dia, -1)) {
    const dow = diaSemana(dia);
    if (dow === 0 || dow === 6) continue;
    const hoyToca = pendientes.filter(x => x.quedan > 0 && x.desde >= dia).sort((p, q) => q.quedan - p.quedan || p.a.id - q.a.id);
    for (const x of hoyToca) {
      const a = x.a, vid = a.vehiculo_id, pid = a.profesor_id || null;
      const kA = `${dia}|a|${a.id}`, kV = `${dia}|v|${vid}`, kP = pid ? `${dia}|p|${pid}` : null;
      let k = Math.min(x.quedan, LIMITES.porAlumnoDia - n(kA), LIMITES.porVehiculoDia - n(kV), kP ? LIMITES.porProfesorDia - n(kP) : Infinity);
      while (k > 0 && !caben(vid, dia, k)) k--;
      if (k <= 0) continue;
      // Primera hora libre (desde las 9) en la que caben las k clases seguidas
      let ini = null;
      for (let t = LIMITES.desde; t + k * dur <= LIMITES.hasta; t += 15) {
        if (libre(kV, t, t + k * dur) && (!kP || libre(kP, t, t + k * dur))) { ini = t; break; }
      }
      if (ini == null) continue;
      for (let j = 0; j < k; j++) {
        const h = ini + j * dur;
        x.creadas.push({ alumno_id: a.id, vehiculo_id: vid, profesor_id: pid, fecha: dia, hora_inicio: aHHMM(h), _orden: x.creadas.length });
        mas(kA); mas(kV); if (kP) mas(kP);
      }
      tomar(kV, ini, ini + k * dur); if (kP) tomar(kP, ini, ini + k * dur);
      reservar(vid, dia, k);
      x.quedan -= k;
    }
  }
  for (const x of pendientes) if (x.quedan > 0) errores.push(`${nombreDe(x.a)}: no se han podido colocar ${x.quedan} de sus clases (no quedan días con hueco en su coche o su profesor).`);
  // La fracción (¼ ½ ¾) va en la más antigua de las creadas
  for (const x of pendientes) if (x.frac > 0 && x.frac < 1 && x.creadas.length) x.creadas[x.creadas.length - 1].fraccion = x.frac;

  // 5. Km: por coche, en orden de fecha y hora, cada tanda de clases sin km
  //    entre dos clases conocidas se encaja en los km que las separan.
  const altas = pendientes.flatMap(x => x.creadas);
  const kmAnotadas = [];
  const porVehiculo = new Map();
  for (const c of altas) { if (!porVehiculo.has(c.vehiculo_id)) porVehiculo.set(c.vehiculo_id, []); porVehiculo.get(c.vehiculo_id).push({ c }); }
  for (const b of blancas) { if (!porVehiculo.has(b.vehiculo_id)) porVehiculo.set(b.vehiculo_id, []); porVehiculo.get(b.vehiculo_id).push({ b }); }
  let orden = 0;
  for (const [vid, blancos] of porVehiculo) {
    const fijas = practicas.filter(p => p.vehiculo_id === vid && tiene(p)).map(p => ({ fija: p, fecha: p.fecha, hora_inicio: p.hora_inicio, _orden: -1, id: p.id }));
    const items = [...fijas, ...blancos.map(x => {
      const r = x.c || x.b;
      return { ...x, fecha: r.fecha, hora_inicio: r.hora_inicio, _orden: orden++, id: r.id };
    })].sort(ordenTiempo);
    const v = vehiculoDe(vid);
    const tope = kmTope(vid);
    let previo = null; // km final de la última fija vista
    let tanda = [];
    const cerrarTanda = (siguiente) => {
      if (!tanda.length) return;
      const hasta = siguiente != null ? siguiente : tope;
      if (previo == null) {
        // Sin nada conocido antes: se encadenan hacia atrás desde `hasta`
        const kms = repartirKm(tanda.length, kmMin, kmMax);
        let fin = hasta;
        for (let i = tanda.length - 1; i >= 0; i--) { tanda[i].km_final = fin; tanda[i].km_inicial = fin - kms[i]; fin = tanda[i].km_inicial; }
        if (fin < 0) errores.push(hasta < kmMax ? `${v.nombre}: falta el km de hoy de su cuentakilómetros (paso 1); sin él no se pueden poner km a sus clases.` : `${v.nombre}: no caben ${tanda.length} clases por debajo del km ${miles(hasta)}.`);
      } else {
        const hueco = hasta - previo;
        if (hueco < tanda.length) {
          errores.push(`${v.nombre}: entre el km ${miles(previo)} y el ${miles(hasta)} no caben ${tanda.length} clases sin km.`);
        } else {
          const holgado = hueco >= tanda.length * kmMax;
          const kms = holgado ? repartirKm(tanda.length, kmMin, kmMax) : repartirKm(tanda.length, kmMin, kmMax, hueco);
          if (!holgado && hueco < tanda.length * kmMin) avisos.push(`${v.nombre}: entre el km ${miles(previo)} y el ${miles(hasta)} solo hay ${hueco} km para ${tanda.length} clases (≈ ${Math.round(hueco / tanda.length)} km cada una).`);
          // Holgado: la tanda termina pegada a lo siguiente conocido (continuidad)
          let ini = holgado ? hasta - kms.reduce((s, x) => s + x, 0) : previo;
          for (let i = 0; i < tanda.length; i++) { tanda[i].km_inicial = ini; tanda[i].km_final = ini + kms[i]; ini += kms[i]; }
        }
      }
      for (const t of tanda) {
        if (t.c) { t.c.km_inicial = t.km_inicial; t.c.km_final = t.km_final; }
        else kmAnotadas.push({ id: t.b.id, km_inicial: t.km_inicial, km_final: t.km_final });
      }
      tanda = [];
    };
    for (const it of items) {
      if (it.fija) { cerrarTanda(it.fija.km_inicial); previo = Math.max(previo || 0, it.fija.km_final); }
      else tanda.push(it);
    }
    cerrarTanda(null);
  }

  // 6. Resumen para la pantalla
  const alumnos = [];
  const tocados = new Set([...altas.map(c => c.alumno_id), ...blancas.map(b => b.alumno_id)]);
  for (const aid of tocados) {
    const a = d.alumnos.find(x => x.id === aid);
    const suyas = [...altas.filter(c => c.alumno_id === aid), ...blancas.filter(b => b.alumno_id === aid).map(b => ({ ...b, ...(kmAnotadas.find(k => k.id === b.id) || {}) }))]
      .sort(ordenTiempo);
    if (!suyas.length) continue;
    const v = vehiculoDe(a.vehiculo_id) || vehiculoDe(suyas[0].vehiculo_id);
    const dias = new Set(suyas.map(c => c.fecha)).size;
    alumnos.push({
      alumno_id: aid, nombre: nombreDe(a), vehiculo: v ? `${v.matricula || v.nombre}` : '—',
      nuevas: sumaClases(altas.filter(c => c.alumno_id === aid)), anotadas_sin_km: blancas.filter(b => b.alumno_id === aid).length,
      dias, desde: suyas[0].fecha, hasta: suyas[suyas.length - 1].fecha,
      km_desde: Math.min(...suyas.map(c => c.km_inicial ?? Infinity)), km_hasta: Math.max(...suyas.map(c => c.km_final ?? -Infinity)),
      clases: suyas.map(c => ({ fecha: c.fecha, hora_inicio: c.hora_inicio || '', km_inicial: c.km_inicial, km_final: c.km_final, anotada: !!c.tipo_detalle, fraccion: c.fraccion || null }))
    });
  }
  alumnos.sort((x, y) => x.nombre.localeCompare(y.nombre));
  const vehiculos = [...porVehiculo.keys()].map(vid => {
    const v = vehiculoDe(vid);
    const suyas = [...altas.filter(c => c.vehiculo_id === vid), ...kmAnotadas.filter(k => (blancas.find(b => b.id === k.id) || {}).vehiculo_id === vid)];
    return { id: vid, nombre: v.nombre, matricula: v.matricula || '', km_actual: Math.round(v.km_actual || 0), clases: suyas.length,
      km_desde: suyas.length ? Math.min(...suyas.map(c => c.km_inicial)) : null, km_hasta: suyas.length ? Math.max(...suyas.map(c => c.km_final)) : null };
  });
  return {
    ok: !errores.length, vacio: false, opciones: { kmMin, kmMax, duracion: dur },
    altas: altas.map(({ _orden, ...c }) => c), km: kmAnotadas, alumnos, vehiculos, avisos, errores
  };
}

/**
 * Guarda EXACTAMENTE la propuesta que se ha enseñado. Antes comprueba que los
 * datos no han cambiado desde entonces (alumnos, huecos sin km, solapes) y hace
 * una copia de seguridad completa. Devuelve { ok, creadas, km_rellenadas, copia } o { ok:false, error }.
 */
function aplicarClasesAnteriores(plan) {
  if (!plan || !Array.isArray(plan.altas) || !Array.isArray(plan.km)) return { ok: false, error: 'Propuesta vacía.' };
  if (plan.errores && plan.errores.length) return { ok: false, error: 'La propuesta tiene errores: corrígelos antes de crear las clases.' };
  const d = load();
  const cambiado = { ok: false, error: 'Los datos han cambiado desde que se hizo la propuesta. Vuelve a generarla.' };
  const porAlumno = new Map();
  for (const c of plan.altas) {
    const a = d.alumnos.find(x => x.id === c.alumno_id);
    if (!a || !d.vehiculos.some(v => v.id === c.vehiculo_id) || !leerFecha(c.fecha) ||
      !(Number.isInteger(c.km_inicial) && Number.isInteger(c.km_final) && c.km_final > c.km_inicial && c.km_inicial >= 0)) return cambiado;
    porAlumno.set(a.id, aCuartos((porAlumno.get(a.id) || 0) + clasesDePractica(c)));
  }
  for (const [aid, k] of porAlumno) if (k > (d.alumnos.find(x => x.id === aid).clases_previas || 0) + 1e-9) return cambiado;
  for (const k of plan.km) {
    const p = d.practicas.find(x => x.id === k.id);
    if (!esAnterior(p) || tiene(p) || !(Number.isInteger(k.km_inicial) && k.km_final > k.km_inicial && k.km_inicial >= 0)) return cambiado;
  }
  // Ningún km nuevo puede pisar otro del mismo coche (los conflictos antiguos
  // entre clases ya existentes no bloquean: no son de esta operación)
  const nuevosRangos = [
    ...plan.altas.map(c => ({ vid: c.vehiculo_id, ki: c.km_inicial, kf: c.km_final })),
    ...plan.km.map(k => ({ vid: d.practicas.find(x => x.id === k.id).vehiculo_id, ki: k.km_inicial, kf: k.km_final, id: k.id }))
  ];
  const existentes = d.practicas.filter(p => !p.deleted && tiene(p));
  for (const r of nuevosRangos) {
    if (existentes.some(p => p.vehiculo_id === r.vid && p.id !== r.id && r.ki < p.km_final && p.km_inicial < r.kf)) return cambiado;
    if (nuevosRangos.some(o => o !== r && o.vid === r.vid && r.ki < o.kf && o.ki < r.kf)) return cambiado;
  }

  const copia = crearBackup();
  if (!copia || !copia.ok) return { ok: false, error: 'No se pudo hacer la copia de seguridad previa; no se ha creado nada.' };

  const nuevas = [];
  for (const c of plan.altas) {
    const a = d.alumnos.find(x => x.id === c.alumno_id);
    const id = nextId('p');
    d.practicas.push({
      id, alumno_id: a.id, vehiculo_id: c.vehiculo_id, fecha: c.fecha, km_inicial: c.km_inicial, km_final: c.km_final,
      profesor_id: c.profesor_id || null, tipo: 'circulacion', sucursal_id: a.sucursal_id || null,
      hora_inicio: c.hora_inicio || null, tipo_detalle: MARCA, ...(clasesDePractica(c) < 1 ? { fraccion: clasesDePractica(c) } : {})
    });
    nuevas.push(id);
  }
  for (const [aid, k] of porAlumno) { const a = d.alumnos.find(x => x.id === aid); a.clases_previas = Math.max(0, aCuartos((a.clases_previas || 0) - k)); }
  for (const k of plan.km) Object.assign(d.practicas.find(x => x.id === k.id), { km_inicial: k.km_inicial, km_final: k.km_final });
  const vehiculosTocados = new Set([...plan.altas.map(c => c.vehiculo_id), ...plan.km.map(k => d.practicas.find(x => x.id === k.id).vehiculo_id)]);
  for (const vid of vehiculosTocados) {
    const v = d.vehiculos.find(x => x.id === vid);
    const max = Math.max(...d.practicas.filter(p => p.vehiculo_id === vid && !p.deleted).map(p => p.km_final || 0));
    if (v && max > (v.km_actual || 0)) v.km_actual = max;
  }
  addLog('puesta_en_marcha', `Clases anteriores creadas: ${nuevas.length} nuevas para ${porAlumno.size} alumnos y km puestos a ${plan.km.length} anotadas. Copia previa: ${copia.file}`, []);
  save();
  const s = _sync();
  if (s) {
    s.markDirtyVarios('practicas', [...nuevas, ...plan.km.map(k => k.id)]);
    s.markDirtyVarios('alumnos', porAlumno.keys());
    s.markDirtyVarios('vehiculos', vehiculosTocados);
  }
  return { ok: true, creadas: nuevas.length, km_rellenadas: plan.km.length, copia: copia.file };
}

// Clases anteriores ya creadas por alumno (para la tabla de Puesta en marcha).
function contarClasesAnteriores(d = load()) {
  const m = new Map();
  for (const p of d.practicas) if (esAnterior(p)) m.set(p.alumno_id, aCuartos((m.get(p.alumno_id) || 0) + clasesDePractica(p)));
  return m;
}

module.exports = {
  getClasesAnteriores, guardarClasesAnteriores, planificarClasesAnteriores, aplicarClasesAnteriores,
  contarClasesAnteriores, leerFechaClaseAnterior: leerFecha, leerArchivoClasesAnteriores, PLANTILLA_CLASES_ANTERIORES
};
