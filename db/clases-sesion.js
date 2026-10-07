/**
 * db/clases-sesion.js  –  Añadir y editar clases con facilidad.
 *
 * Una «sesión» es lo que el alumno hizo seguido en un coche un día: 1 clase, 1 ½,
 * 2 ¾… Se guarda como varias prácticas (una por clase entera y una última con la
 * fracción: 1 ½ = [1, ½]), igual que hace el móvil. Este módulo trabaja con la
 * sesión entera para que el usuario no tenga que pensar en filas:
 *
 *  · proponerClase(op) → vista previa (no guarda nada) de crear una clase nueva o de
 *    cambiar una existente: cuántas clases vale (de ¼ en ¼), fecha, hora, coche,
 *    profesor, tipo y los km (los que había, los que escribe el usuario, ninguno o
 *    «automáticos»: la clase se encaja en el hueco del cuentakilómetros que le toca
 *    por fecha y hora, o desplaza las siguientes si no cabe).
 *  · aplicarClase(vistaPrevia) → guarda EXACTAMENTE lo previsualizado.
 *  · Cambiar el número de clases de una sesión BORRA la firma del alumno (para que
 *    la autoescuela no pueda cambiar a su antojo lo que el alumno firmó): el
 *    profesor la recoge de nuevo en el móvil la próxima vez que vea al alumno.
 *
 * Las «clases temporales» de la vista previa viven en una copia de los datos
 * (core.simular): nada se escribe hasta aplicarClase.
 */

const core = require('./core');
const {
  load, save, nextId, _sync, addLog, simular, clasesDePractica, fmtClases, aCuartos, trozosDeClases, kmPorPesos,
  esPracticaEnCurso, esPracticaSinCerrar, hoyLocalISO, fmtFechaLog, nombreCorto, leerCantidadClases
} = core;
const cuadre = require('./cuadre-km');
const { getAjusteEmpresa, getDuracionClase, getRangoKm } = require('./ajustes-empresa');

const MAX_CANTIDAD = 8;            // clases en una sola sesión
const DURACION_CLASE_DEFECTO = 45; // minutos de una clase si no se ha configurado
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_TEMPORAL = 3e9;           // ids de las clases que aún no existen (solo en la copia)

// ─── utilidades ─────────────────────────────────────────────────────────────
const tieneKm = p => p.km_inicial > 0 && p.km_final > p.km_inicial;
const aMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const deMin = m => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const ordenFila = (a, b) => (a.hora_inicio || '99:99').localeCompare(b.hora_inicio || '99:99') || ((a.km_inicial || 0) - (b.km_inicial || 0)) || a.id - b.id;
const fraccionDe = peso => (peso > 0 && peso < 1 ? peso : null);
const fraccionNorm = p => { const f = Number(p.fraccion); return f > 0 && f < 1 ? Math.round(f * 4) / 4 : null; };
const duracionClase = () => getDuracionClase() || DURACION_CLASE_DEFECTO;
const textoCantidad = n => `${fmtClases(n)} ${n > 1 ? 'clases' : 'clase'}`;

// ¿La práctica b es la continuación de a (misma sesión)? Con km, tiene que empezar donde
// terminó la otra; sin km se mira la hora (como mucho 3 h entre una y otra).
function sigueA(a, b) {
  if (tieneKm(a) && tieneKm(b)) return b.km_inicial === a.km_final;
  if (a.hora_inicio && b.hora_inicio) return Math.abs(aMin(b.hora_inicio) - aMin(a.hora_inicio)) <= 180;
  return true;
}

/** Las prácticas que forman la sesión de `p` (mismo alumno, coche y día, seguidas), en orden. */
function sesionDe(d, p) {
  const dia = d.practicas
    .filter(x => !x.deleted && x.alumno_id === p.alumno_id && x.vehiculo_id === p.vehiculo_id && x.fecha === p.fecha)
    .sort(ordenFila);
  const i = dia.findIndex(x => x.id === p.id);
  if (i < 0) return [p];
  let a = i, b = i;
  while (a > 0 && sigueA(dia[a - 1], dia[a])) a--;
  while (b < dia.length - 1 && sigueA(dia[b], dia[b + 1])) b++;
  return dia.slice(a, b + 1);
}

function estadoFila(p) {
  return { fecha: p.fecha, hora_inicio: p.hora_inicio || null, vehiculo_id: p.vehiculo_id, profesor_id: p.profesor_id || null, tipo: p.tipo || 'circulacion',
    fraccion: fraccionNorm(p), km_inicial: p.km_inicial || 0, km_final: p.km_final || 0, tiene_firma: !!p.firma };
}

/**
 * La sesión de una clase tal como la ve el editor: cantidad total, fecha, hora, coche,
 * profesor, tipo, km del principio al final, cuántas firmas tiene y si se puede editar.
 */
function getSesionClase(practica_id) {
  const d = load();
  const p = d.practicas.find(x => x.id === parseInt(practica_id) && !x.deleted);
  if (!p) return null;
  const filas = sesionDe(d, p);
  const hoy = hoyLocalISO();
  const abierta = filas.some(x => esPracticaEnCurso(x, hoy) || esPracticaSinCerrar(x, hoy));
  const conKm = filas.filter(tieneKm);
  const a = d.alumnos.find(x => x.id === p.alumno_id);
  const primera = filas[0];
  return {
    practica_id: p.id, practica_ids: filas.map(x => x.id),
    alumno_id: p.alumno_id, alumno: a ? nombreCorto(a) : '—',
    vehiculo_id: p.vehiculo_id, fecha: p.fecha, hora_inicio: primera.hora_inicio || null,
    profesor_id: primera.profesor_id || null, tipo: primera.tipo || 'circulacion',
    cantidad: aCuartos(filas.reduce((s, x) => s + clasesDePractica(x), 0)),
    km_inicial: conKm.length ? Math.min(...conKm.map(x => x.km_inicial)) : 0,
    km_final: conKm.length ? Math.max(...conKm.map(x => x.km_final)) : 0,
    sin_km: !conKm.length, con_firma: filas.filter(x => x.firma).length,
    abierta, origen: primera.source || null
  };
}

// ─── validación ─────────────────────────────────────────────────────────────
function normalizar(d, op) {
  const errores = [];
  const o = op || {};
  let base = null, alumnoId = parseInt(o.alumno_id);
  if (o.practica_id != null && o.practica_id !== '') {
    base = d.practicas.find(x => x.id === parseInt(o.practica_id) && !x.deleted);
    if (!base) errores.push('No se encuentra esa clase.');
    else alumnoId = base.alumno_id;
  }
  const alumno = d.alumnos.find(a => a.id === alumnoId && !a.deleted);
  if (!alumno && !errores.length) errores.push('Elige el alumno.');
  const vehiculoId = parseInt(o.vehiculo_id != null && o.vehiculo_id !== '' ? o.vehiculo_id : (base ? base.vehiculo_id : NaN));
  const vehiculo = d.vehiculos.find(v => v.id === vehiculoId && !v.deleted);
  if (!vehiculo) errores.push('Elige el coche.');
  const fecha = String(o.fecha || (base ? base.fecha : ''));
  if (!FECHA_RE.test(fecha) || isNaN(new Date(fecha + 'T00:00:00Z').getTime())) errores.push('La fecha no es válida.');
  const cantidad = leerCantidadClases(o.cantidad != null ? o.cantidad : (base ? clasesDePractica(base) : 1));
  if (cantidad == null) errores.push('Las clases van de ¼ en ¼ (¼, ½, ¾, 1, 1 ¼, 1 ½…).');
  else if (cantidad < 0.25 || cantidad > MAX_CANTIDAD) errores.push(`Una sesión puede tener entre ¼ y ${MAX_CANTIDAD} clases.`);
  let hora = o.hora_inicio === undefined ? undefined : (o.hora_inicio ? String(o.hora_inicio).trim() : null);
  if (hora && !HORA_RE.test(hora)) { errores.push('La hora tiene que ser como 17:30.'); hora = undefined; }
  const profesorId = o.profesor_id === undefined ? undefined : (o.profesor_id ? parseInt(o.profesor_id) : null);
  const tipo = o.tipo === undefined ? undefined : (o.tipo === 'pista' ? 'pista' : 'circulacion');
  const km = { modo: base ? 'mantener' : 'auto', desplazar: false, ...(o.km || {}) };
  if (!['mantener', 'conservar', 'auto', 'escribo', 'sin'].includes(km.modo)) km.modo = base ? 'mantener' : 'auto';
  if (!base && (km.modo === 'mantener' || km.modo === 'conservar')) km.modo = 'sin';
  if (km.modo === 'escribo') {
    km.km_inicial = Math.round(Number(km.km_inicial)); km.km_final = Math.round(Number(km.km_final));
    if (!(km.km_inicial > 0) || !(km.km_final > km.km_inicial)) errores.push('Escribe los km: el final tiene que ser mayor que el inicial.');
  }
  return { errores, base, alumno, vehiculo, fecha, cantidad, hora, profesorId, tipo, km, sucursalId: o.sucursal_id != null && o.sucursal_id !== '' ? parseInt(o.sucursal_id) : undefined };
}

// ─── estructura: qué filas quedan ───────────────────────────────────────────
/**
 * Reparte la cantidad en piezas (1, 1, ½…) y las asigna a las filas existentes de la
 * sesión por orden; las que sobran se borran y las que faltan se crean.
 */
function planificarEstructura(n, sesion) {
  const piezas = trozosDeClases(n.cantidad);
  const filas = piezas.map((peso, i) => ({ p: sesion[i] || null, nueva: !sesion[i], peso, fraccion: fraccionDe(peso) }));
  const sobran = sesion.slice(piezas.length);
  const totalAntes = aCuartos(sesion.reduce((s, x) => s + clasesDePractica(x), 0));
  const mismaEstructura = sesion.length === piezas.length && sesion.every((x, i) => clasesDePractica(x) === piezas[i]);
  return { filas, sobran, totalAntes, totalDespues: n.cantidad, cambiaCantidad: sesion.length > 0 && totalAntes !== n.cantidad, mismaEstructura };
}

// Hora de cada pieza: si se da la hora de inicio (o la estructura cambia) se encadenan
// con la duración de una clase; si no, cada fila conserva la suya.
function calcularHoras(n, plan, sesion) {
  const base = n.hora !== undefined ? n.hora : (sesion[0] ? sesion[0].hora_inicio || null : null);
  const recalcular = !!base && (n.hora !== undefined && n.hora !== (sesion[0] ? sesion[0].hora_inicio || null : null) || !plan.mismaEstructura || sesion.length === 0);
  const dur = duracionClase();
  let cursor = base ? aMin(base) : 0;
  return plan.filas.map(f => {
    if (n.hora === null) return { hora_inicio: null, hora_fin: null };
    if (!base) return { hora_inicio: f.p ? f.p.hora_inicio || null : null, hora_fin: f.p ? f.p.hora_fin || null : null };
    if (!recalcular && f.p) return { hora_inicio: f.p.hora_inicio || base, hora_fin: f.p.hora_fin || null };
    const ini = cursor, fin = cursor + Math.round(f.peso * dur);
    cursor = fin;
    return { hora_inicio: deMin(ini), hora_fin: deMin(fin) };
  });
}

// ─── km ─────────────────────────────────────────────────────────────────────
function repartirTotal(ki, kf, pesos) {
  const km = kmPorPesos(kf - ki, pesos);
  let cursor = ki;
  return km.map(k => { const r = { ki: cursor, kf: cursor + k }; cursor += k; return r; });
}

function infoClase(d, it) {
  if (!it) return null;
  const a = d.alumnos.find(x => x.id === it.p.alumno_id);
  return { practica_id: it.id, alumno_id: it.p.alumno_id, alumno: a ? nombreCorto(a) : '?', fecha: it.fecha, hora_inicio: it.hora || null, km_inicial: it.ki, km_final: it.kf };
}

/**
 * Km «automáticos»: las clases temporales ya están en la copia `d` del coche, sin km. Se
 * buscan la clase con km fiables justo ANTES y justo DESPUÉS en el tiempo y:
 *  · caben en el hueco que hay → se reparte ese hueco entre ellas;
 *  · sobra mucho hueco → km típicos a continuación de la anterior (el resto sigue como hueco);
 *  · no caben → con `desplazar`, se les dan km típicos y las clases siguientes del coche
 *    suben lo que haga falta (el cuentakilómetros siempre sube); sin él, quedan sin km;
 *  · es la última o la primera del coche → a continuación de la última / hacia atrás.
 */
function ubicarAuto(d, vid, ids, pesos, km, avisos) {
  const hoy = hoyLocalISO();
  const A = cuadre._analizarCoche(d, vid, hoy);
  const { med, lim, items, cadena } = A;
  const orden = cuadre._ordenTiempo;
  const mios = ids.map(id => items.find(it => it.id === id)).filter(Boolean);
  const sinKm = () => ids.map(() => ({ ki: 0, kf: 0 }));
  if (mios.length !== ids.length) return { filas: sinKm(), otras: [], contexto: null };
  mios.sort((a, b) => orden(a.p, b.p));
  const W = pesos.reduce((a, b) => a + b, 0);
  const primero = mios[0], ultimo = mios[mios.length - 1];
  let antes = null, despues = null;
  const posteriores = [];
  for (const c of cadena) {
    if (ids.includes(c.id)) continue;
    if (orden(c.p, primero.p) < 0) antes = c;
    else if (orden(c.p, ultimo.p) > 0) { if (!despues) despues = c; posteriores.push(c); }
  }
  const contexto = { anterior: infoClase(d, antes), siguiente: infoClase(d, despues), hueco: antes && despues ? despues.ki - antes.kf : null, metodo: null, km_clase: med };
  const baremo = km.kmMin >= 1 && km.kmMax >= km.kmMin ? { min: Math.round(km.kmMin), max: Math.round(km.kmMax) } : getRangoKm();
  const unaClase = peso => baremo
    ? Math.max(1, Math.round((baremo.min + Math.random() * (baremo.max - baremo.min)) * peso))
    : cuadre._kmTipicoVariado(med, peso);
  const encadenar = (desde, kmPorFila) => { let c = desde; return kmPorFila.map(k => { const r = { ki: c, kf: c + k }; c += k; return r; }); };
  const nombre = it => (d.alumnos.find(a => a.id === it.p.alumno_id) || {}).nombre || '?';
  const etq = it => `${nombre(it)} (${fmtFechaLog(it.fecha)}${it.hora ? ' ' + it.hora : ''})`;

  const ordenadas = mios.map(it => ids.indexOf(it.id));          // posición original de cada una
  const colocar = (rangos) => { const out = new Array(ids.length); rangos.forEach((r, i) => { out[ordenadas[i]] = r; }); return out; };
  const pesosOrden = mios.map(it => pesos[ids.indexOf(it.id)]);

  if (antes && despues) {
    const G = despues.ki - antes.kf;
    const porClase = G / W;
    if (G > 0 && porClase >= lim.lo && porClase <= lim.hi) {
      contexto.metodo = 'hueco';
      return { filas: colocar(repartirTotal(antes.kf, despues.ki, pesosOrden)), otras: [], contexto };
    }
    if (porClase > lim.hi) {
      contexto.metodo = 'hueco_grande';
      avisos.push({ tipo: 'hueco_grande', texto: `Entre ${etq(antes)} y ${etq(despues)} hay ${G} km: se ponen km típicos a continuación de la anterior y el resto sigue siendo un hueco (otras clases por anotar u otro uso del coche).` });
      return { filas: colocar(encadenar(antes.kf, pesosOrden.map(unaClase))), otras: [], contexto };
    }
    // no caben
    if (!km.desplazar) {
      contexto.metodo = 'no_cabe';
      avisos.push({ tipo: 'no_cabe', texto: `Entre ${etq(antes)} y ${etq(despues)} ${G > 0 ? `solo hay ${G} km` : 'no queda hueco'}: no cabe la clase. Puedes desplazar las clases siguientes para hacerle sitio o dejarla sin km.`, desplazable: true });
      return { filas: sinKm(), otras: [], contexto };
    }
    if (posteriores.some(c => c.estado === 'abierta')) {
      contexto.metodo = 'no_cabe';
      avisos.push({ tipo: 'abierta_despues', texto: 'Hay una clase en curso (o sin cerrar) más adelante en este coche: ciérrala antes de desplazar los km. La clase se queda sin km.' });
      return { filas: sinKm(), otras: [], contexto };
    }
    const kms = pesosOrden.map(unaClase);
    const X = kms.reduce((a, b) => a + b, 0);
    const delta = Math.max(0, antes.kf + X - despues.ki);
    contexto.metodo = 'desplazar';
    const otras = delta > 0 ? posteriores.filter(c => c.p.km_inicial > 0 && c.p.km_final > 0).map(c => ({
      practica_id: c.id, alumno_id: c.p.alumno_id, fecha: c.fecha, hora_inicio: c.hora || null,
      antes: { km_inicial: c.ki0, km_final: c.kf0 }, despues: { km_inicial: c.ki0 + delta, km_final: c.kf0 + delta },
      motivo: `Sube ${delta} km para dejar sitio a la clase nueva`
    })) : [];
    contexto.desplazamiento = delta;
    return { filas: colocar(encadenar(antes.kf, kms)), otras, contexto };
  }
  if (antes) {
    contexto.metodo = 'despues';
    const rangos = encadenar(antes.kf, pesosOrden.map(unaClase));
    return { filas: colocar(rangos), otras: [], contexto };
  }
  if (despues) {
    contexto.metodo = 'antes';
    const kms = pesosOrden.map(unaClase);
    const total = kms.reduce((a, b) => a + b, 0);
    if (despues.ki - total < 1) {
      avisos.push({ tipo: 'sin_sitio', texto: 'No hay km suficientes hacia atrás desde la primera clase del coche: la clase se queda sin km.' });
      return { filas: sinKm(), otras: [], contexto };
    }
    return { filas: colocar(encadenar(despues.ki - total, kms)), otras: [], contexto };
  }
  // El coche no tiene ninguna clase con km: se parte del cuentakilómetros del coche
  const v = d.vehiculos.find(x => x.id === vid);
  if (v && v.km_actual > 0) {
    contexto.metodo = 'odometro';
    avisos.push({ tipo: 'odometro', texto: `Este coche no tiene clases con km: se parte de su cuentakilómetros actual (${v.km_actual} km).` });
    return { filas: colocar(encadenar(v.km_actual, pesosOrden.map(unaClase))), otras: [], contexto };
  }
  avisos.push({ tipo: 'sin_referencia', texto: 'Este coche no tiene ninguna clase con km: escríbelos tú o déjala sin km.' });
  return { filas: sinKm(), otras: [], contexto };
}

// Avisos de km que se pisan con otras clases del coche (no bloquean: el usuario decide)
function avisosDeSolape(d, vid, ids, rangos, avisos) {
  const resto = d.practicas.filter(p => !p.deleted && p.vehiculo_id === vid && !ids.includes(p.id) && tieneKm(p));
  const tocadas = [];
  rangos.forEach((r, i) => {
    if (!(r.ki > 0 && r.kf > r.ki)) return;
    for (const p of resto) {
      if (r.ki < p.km_final && p.km_inicial < r.kf) {
        const a = d.alumnos.find(x => x.id === p.alumno_id);
        tocadas.push(`${a ? nombreCorto(a) : '?'} (${fmtFechaLog(p.fecha)}, km ${p.km_inicial} → ${p.km_final})`);
        break;
      }
    }
  });
  if (tocadas.length) avisos.push({ tipo: 'solape', texto: `Estos km se pisan con ${[...new Set(tocadas)].slice(0, 3).join('; ')}${tocadas.length > 3 ? '…' : ''}. Puedes guardarla igual y arreglarlo luego en Kilómetros.` });
}

// ─── vista previa ───────────────────────────────────────────────────────────
/**
 * Calcula (sin guardar nada) cómo quedaría una clase nueva o una existente.
 * op: { practica_id?, alumno_id?, vehiculo_id, fecha, hora_inicio?, profesor_id?, tipo?, cantidad,
 *       sucursal_id?, km: { modo, km_inicial, km_final, desplazar, kmMin, kmMax } }
 */
function proponerClase(op) {
  const d = load();
  const n = normalizar(d, op);
  const vacio = errores => ({ ok: false, errores, avisos: [], filas: [], otras: [], borrar: [], firma: { borrar: 0 }, contexto: null });
  if (n.errores.length) return vacio(n.errores);
  const hoy = hoyLocalISO();
  const sesion = n.base ? sesionDe(d, n.base) : [];
  if (sesion.some(p => esPracticaEnCurso(p, hoy) || esPracticaSinCerrar(p, hoy))) {
    return vacio(['Esa clase está en curso o sin cerrar: ciérrala desde el móvil antes de cambiarla.']);
  }
  const plan = planificarEstructura(n, sesion);
  const horas = calcularHoras(n, plan, sesion);
  const avisos = [];
  const pesos = plan.filas.map(f => f.peso);
  const idsTemp = plan.filas.map((f, i) => f.p ? f.p.id : ID_TEMPORAL + i);

  // ── km de cada pieza ──
  const kmActuales = plan.filas.map(f => (f.p && tieneKm(f.p)) ? { ki: f.p.km_inicial, kf: f.p.km_final } : { ki: 0, kf: 0 });
  const modo = n.km.modo;
  const colocar = [];    // piezas cuyos km hay que encajar solos en el hueco del coche
  let rangos, otras = [], contexto = null;
  if (modo === 'sin') {
    rangos = plan.filas.map(() => ({ ki: 0, kf: 0 }));
  } else if (modo === 'escribo') {
    if (n.km.km_final - n.km.km_inicial < plan.filas.length) return vacio([`El recorrido es demasiado corto para ${plan.filas.length} clases (1 km como mínimo cada una).`]);
    rangos = repartirTotal(n.km.km_inicial, n.km.km_final, pesos);
  } else if (modo === 'conservar') {
    // Cada clase que ya existía conserva sus km; las nuevas, sin km o encajadas solas
    rangos = plan.filas.map((f, i) => (f.nueva ? { ki: 0, kf: 0 } : { ...kmActuales[i] }));
    if (n.km.nuevas === 'auto') plan.filas.forEach((f, i) => { if (f.nueva) colocar.push(i); });
  } else if (modo === 'mantener') {
    const conKm = sesion.filter(tieneKm);
    if (plan.mismaEstructura || !conKm.length) rangos = kmActuales.map(r => ({ ...r }));
    else {
      const K0 = Math.min(...conKm.map(p => p.km_inicial)), K1 = Math.max(...conKm.map(p => p.km_final));
      if (K1 - K0 < plan.filas.length) return vacio([`Los ${K1 - K0} km de esta sesión no llegan para ${plan.filas.length} clases (1 km cada una como mínimo). Escribe los km a mano.`]);
      rangos = repartirTotal(K0, K1, pesos);
      avisos.push({ tipo: 'reparto', texto: `Los ${K1 - K0} km de la sesión (del ${K0} al ${K1}) se reparten entre ${plan.filas.length === 1 ? 'la clase' : 'las ' + plan.filas.length + ' clases'}. Si la parte añadida recorrió más o menos, edita sus km.` });
    }
  } else { // auto
    rangos = plan.filas.map(() => ({ ki: 0, kf: 0 }));
    plan.filas.forEach((f, i) => colocar.push(i));
  }
  if (colocar.length) {
    const res = simular(copia => {
      const vid = n.vehiculo.id;
      for (const i of colocar) {
        const f = plan.filas[i];
        let p = f.p ? copia.practicas.find(x => x.id === f.p.id) : null;
        if (!p) { p = { id: idsTemp[i], alumno_id: n.alumno.id, deleted: false }; copia.practicas.push(p); }
        Object.assign(p, { vehiculo_id: vid, fecha: n.fecha, hora_inicio: horas[i].hora_inicio, km_inicial: 0, km_final: 0, fraccion: f.fraccion, tipo_detalle: null });
      }
      // Las clases que la edición borra no cuentan para encajar
      for (const sb of plan.sobran) { const q = copia.practicas.find(x => x.id === sb.id); if (q) q.deleted = true; }
      return ubicarAuto(copia, vid, colocar.map(i => idsTemp[i]), colocar.map(i => pesos[i]), n.km, avisos);
    });
    colocar.forEach((i, j) => { rangos[i] = res.filas[j]; });
    otras = res.otras;
    contexto = res.contexto;
  }

  // ── filas del resultado ──
  const kmCambian = (f, r) => !f.p || (f.p.km_inicial || 0) !== r.ki || (f.p.km_final || 0) !== r.kf;
  const filas = plan.filas.map((f, i) => {
    const r = rangos[i];
    const marcaAuto = colocar.includes(i) && r.kf > 0 && kmCambian(f, r);
    return {
      practica_id: f.p ? f.p.id : null, nueva: f.nueva,
      alumno_id: n.alumno.id, vehiculo_id: n.vehiculo.id, fecha: n.fecha,
      hora_inicio: horas[i].hora_inicio, hora_fin: horas[i].hora_fin,
      profesor_id: n.profesorId !== undefined ? n.profesorId : (f.p ? f.p.profesor_id || null : (n.base ? n.base.profesor_id || null : null)),
      tipo: n.tipo !== undefined ? n.tipo : (f.p ? f.p.tipo || 'circulacion' : (n.base ? n.base.tipo || 'circulacion' : 'circulacion')),
      sucursal_id: n.sucursalId !== undefined ? n.sucursalId : (f.p ? f.p.sucursal_id || null : (n.base ? n.base.sucursal_id || null : null)),
      fraccion: f.fraccion, peso: f.peso,
      km_inicial: r.ki, km_final: r.kf, marca_auto: marcaAuto,
      antes: f.p ? estadoFila(f.p) : null
    };
  });

  // ── firmas: cambiar el nº de clases borra la firma del alumno ──
  const conFirma = sesion.filter(p => p.firma);
  const firmaBorrar = plan.cambiaCantidad ? conFirma.map(p => p.id) : [];
  const borrar = plan.sobran.map(p => ({ practica_id: p.id, antes: estadoFila(p) }));

  // ── avisos de orden/solape y resumen ──
  const idsAfectadas = [...filas.filter(f => f.practica_id).map(f => f.practica_id), ...borrar.map(b => b.practica_id)];
  avisosDeSolape(d, n.vehiculo.id, idsAfectadas, filas.map(f => ({ ki: f.km_inicial, kf: f.km_final })), avisos);
  if (modo === 'escribo' || modo === 'mantener') {
    // las clases siguientes de sus alrededores
    if (!contexto) contexto = contextoDe(d, n.vehiculo.id, n.fecha, filas, idsAfectadas);
  }
  if (firmaBorrar.length) avisos.push({ tipo: 'firma', texto: `Al cambiar de ${fmtClases(plan.totalAntes)} a ${fmtClases(plan.totalDespues)} clases se borra la firma del alumno: tendrá que volver a firmar en el móvil la próxima vez que lo vea el profesor.` });

  const resumen = n.base
    ? (plan.cambiaCantidad ? `${n.alumno.nombre}: de ${textoCantidad(plan.totalAntes)} a ${textoCantidad(plan.totalDespues)}` : `${n.alumno.nombre}: ${textoCantidad(plan.totalDespues)}`)
    : `${n.alumno.nombre}: ${textoCantidad(plan.totalDespues)} nuevas`.replace(/^(.*): 1 clase nuevas$/, '$1: 1 clase nueva');
  return {
    ok: true, errores: [], avisos, modo: n.base ? 'editar' : 'nueva', resumen,
    alumno: nombreCorto(n.alumno), alumno_id: n.alumno.id, vehiculo_id: n.vehiculo.id, fecha: n.fecha,
    cantidad: plan.totalDespues, cantidad_antes: n.base ? plan.totalAntes : null,
    km_modo: modo, filas, otras: otras.map(o => ({ ...o, alumno: (d.alumnos.find(a => a.id === o.alumno_id) ? nombreCorto(d.alumnos.find(a => a.id === o.alumno_id)) : '?') })),
    borrar, firma: { borrar: firmaBorrar.length, ids: firmaBorrar }, contexto,
    km_total: filas.reduce((s, f) => s + (f.km_final > f.km_inicial ? f.km_final - f.km_inicial : 0), 0)
  };
}

// Qué clases tiene el coche antes y después (por fecha y hora) cuando los km los fija el usuario
function contextoDe(d, vid, fecha, filas, excluir) {
  const orden = cuadre._ordenTiempo;
  const ref = { fecha, hora_inicio: filas[0] && filas[0].hora_inicio, id: ID_TEMPORAL };
  const resto = d.practicas.filter(p => !p.deleted && p.vehiculo_id === vid && !excluir.includes(p.id) && tieneKm(p)).sort(orden);
  let antes = null, despues = null;
  for (const p of resto) { if (orden(p, ref) < 0) antes = p; else { despues = p; break; } }
  const info = p => { if (!p) return null; const a = d.alumnos.find(x => x.id === p.alumno_id); return { practica_id: p.id, alumno_id: p.alumno_id, alumno: a ? nombreCorto(a) : '?', fecha: p.fecha, hora_inicio: p.hora_inicio || null, km_inicial: p.km_inicial, km_final: p.km_final }; };
  return { anterior: info(antes), siguiente: info(despues), hueco: antes && despues ? despues.km_inicial - antes.km_final : null, metodo: null };
}

// ─── aplicar ────────────────────────────────────────────────────────────────
function cambiada(p, antes) {
  const e = estadoFila(p);
  return e.fecha !== antes.fecha || e.vehiculo_id !== antes.vehiculo_id || e.fraccion !== antes.fraccion ||
    e.km_inicial !== antes.km_inicial || e.km_final !== antes.km_final || e.hora_inicio !== antes.hora_inicio;
}

/** Guarda EXACTAMENTE la vista previa (la que devolvió proponerClase). */
function aplicarClase(prev) {
  if (!prev || !prev.ok || !Array.isArray(prev.filas) || !prev.filas.length) return { ok: false, errores: ['No hay nada que guardar.'] };
  const d = load();
  const vehiculo = d.vehiculos.find(v => v.id === prev.vehiculo_id && !v.deleted);
  if (!vehiculo) return { ok: false, errores: ['No se encuentra el coche.'] };
  // Lo que se va a tocar tiene que seguir como en la vista previa
  const existentes = new Map();
  for (const f of prev.filas) {
    if (!f.practica_id) continue;
    const p = d.practicas.find(x => x.id === f.practica_id && !x.deleted);
    if (!p || (f.antes && cambiada(p, f.antes))) return { ok: false, errores: ['La clase ha cambiado desde la vista previa. Vuelve a abrirla.'] };
    existentes.set(f.practica_id, p);
  }
  for (const b of prev.borrar || []) {
    const p = d.practicas.find(x => x.id === b.practica_id && !x.deleted);
    if (!p || cambiada(p, b.antes)) return { ok: false, errores: ['La clase ha cambiado desde la vista previa. Vuelve a abrirla.'] };
    existentes.set(b.practica_id, p);
  }
  const otras = [];
  for (const o of prev.otras || []) {
    const p = d.practicas.find(x => x.id === o.practica_id && !x.deleted);
    if (!p || p.km_inicial !== o.antes.km_inicial || p.km_final !== o.antes.km_final) return { ok: false, errores: ['Los km de otras clases han cambiado desde la vista previa. Vuelve a calcular.'] };
    otras.push({ p, o });
  }

  const s = _sync();
  const sucios = [], creadas = [], cambiosKm = [];
  const alumno = d.alumnos.find(a => a.id === prev.alumno_id);
  const firmaBorrar = new Set((prev.firma && prev.firma.ids) || []);

  for (const f of prev.filas) {
    let p = f.practica_id ? existentes.get(f.practica_id) : null;
    const kmCambia = p ? (p.km_inicial || 0) !== f.km_inicial || (p.km_final || 0) !== f.km_final : f.km_final > 0;
    if (!p) {
      p = { id: nextId('p'), alumno_id: f.alumno_id, vehiculo_id: f.vehiculo_id, fecha: f.fecha, km_inicial: 0, km_final: 0, nota: '' };
      d.practicas.push(p);
      creadas.push(p);
    } else if (kmCambia) {
      cambiosKm.push({ practica_id: p.id, antes: { km_inicial: p.km_inicial || 0, km_final: p.km_final || 0 }, despues: { km_inicial: f.km_inicial, km_final: f.km_final }, marcada: false });
    }
    p.vehiculo_id = f.vehiculo_id; p.fecha = f.fecha;
    p.hora_inicio = f.hora_inicio || null;
    if (f.hora_fin || p.hora_fin) p.hora_fin = f.hora_fin || null;
    p.profesor_id = f.profesor_id || null; p.tipo = f.tipo || 'circulacion';
    if (f.sucursal_id != null) p.sucursal_id = f.sucursal_id; else if (!('sucursal_id' in p)) p.sucursal_id = null;
    p.fraccion = f.fraccion || null;
    p.km_inicial = f.km_inicial; p.km_final = f.km_final;
    if (f.marca_auto && !p.tipo_detalle) { p.tipo_detalle = 'km_auto'; const c = cambiosKm.find(x => x.practica_id === p.id); if (c) c.marcada = true; }
    if (firmaBorrar.has(p.id)) { p.firma = null; p.firma_borrar = true; }
    sucios.push(p.id);
  }
  const borradas = [];
  for (const b of prev.borrar || []) {
    d.practicas = d.practicas.filter(x => x.id !== b.practica_id);
    borradas.push(b.practica_id);
  }
  for (const { p, o } of otras) {
    cambiosKm.push({ practica_id: p.id, antes: { ...o.antes }, despues: { ...o.despues }, marcada: false });
    p.km_inicial = o.despues.km_inicial; p.km_final = o.despues.km_final;
    sucios.push(p.id);
  }
  // El cuentakilómetros del coche solo sube
  const maxKm = Math.max(vehiculo.km_actual || 0, ...d.practicas.filter(x => x.vehiculo_id === vehiculo.id && !x.deleted).map(x => x.km_final || 0));
  let vehiculoCambia = false;
  if (maxKm !== vehiculo.km_actual) { vehiculo.km_actual = maxKm; vehiculoCambia = true; }

  // Si se desplazaron otras clases, queda registro para deshacerlo (también quita la clase creada)
  if (otras.length) {
    if (!d.cuadres_km) d.cuadres_km = [];
    d.cuadres_km.unshift({
      id: Date.now(), fecha: new Date().toISOString(), vehiculo_id: vehiculo.id, vehiculo: vehiculo.nombre,
      cambios: cambiosKm, creadas: creadas.map(p => ({ id: p.id, km_inicial: p.km_inicial, km_final: p.km_final }))
    });
    d.cuadres_km = d.cuadres_km.slice(0, 20);
  }
  const quien = alumno ? alumno.nombre : '?';
  const detalles = [
    `${quien} · ${fmtFechaLog(prev.fecha)} · ${textoCantidad(prev.cantidad)}${prev.cantidad_antes != null && prev.cantidad_antes !== prev.cantidad ? ` (antes ${fmtClases(prev.cantidad_antes)})` : ''}`,
    ...prev.filas.filter(f => f.km_final > 0).map(f => `km ${f.km_inicial} → ${f.km_final}`),
    ...(firmaBorrar.size ? [`Firma borrada en ${firmaBorrar.size} clase(s): el alumno debe volver a firmar`] : []),
    ...otras.map(({ o }) => `Desplazada: km ${o.antes.km_inicial}→${o.antes.km_final} ➜ ${o.despues.km_inicial}→${o.despues.km_final}`)
  ];
  addLog('clases', prev.modo === 'nueva' ? `Clase añadida: ${quien}` : `Clase editada: ${quien}`, detalles.slice(0, 200));
  save();
  if (s) {
    s.markDirtyVarios('practicas', [...new Set(sucios)]);
    if (borradas.length) s.markDeletedVarios('practicas', borradas);
    if (vehiculoCambia) s.markDirty('vehiculos', vehiculo.id);
  }
  const propias = new Set(otras.map(({ p }) => p.id));
  return { ok: true, errores: [], practica_ids: [...new Set(sucios)].filter(id => !propias.has(id)), creadas: creadas.map(p => p.id), borradas, firmas_borradas: firmaBorrar.size, otras: otras.length };
}

/** Borra todas las clases de una sesión (la del botón «−» del Registro rápido llegando a 0, o «Borrar»). */
function quitarSesionClase(practica_id) {
  const d = load();
  const p = d.practicas.find(x => x.id === parseInt(practica_id) && !x.deleted);
  if (!p) return { ok: false, errores: ['No se encuentra la clase.'] };
  const sesion = sesionDe(d, p);
  const ids = sesion.map(x => x.id);
  const a = d.alumnos.find(x => x.id === p.alumno_id);
  d.practicas = d.practicas.filter(x => !ids.includes(x.id));
  addLog('clases', `Clase borrada: ${a ? a.nombre : '?'}`, [`${fmtFechaLog(p.fecha)} · ${ids.length} práctica(s)`]);
  save();
  const s = _sync(); if (s) s.markDeletedVarios('practicas', ids);
  return { ok: true, errores: [], borradas: ids };
}

/**
 * Registro rápido: suma o resta clases (en clases: 1, ½, ¼, −1…) a lo que el alumno hizo ese día en
 * ese coche, y lo guarda al momento. Las clases que ya tenían km los conservan; las nuevas
 * quedan sin km o con km automáticos que SOLO ocupan el hueco que les toca (nunca desplaza otras).
 */
function sumarClasesDia(opts) {
  const o = opts || {};
  const d = load();
  const vid = parseInt(o.vehiculo_id), aid = parseInt(o.alumno_id);
  const delta = aCuartos(Number(o.delta));
  if (!delta) return { ok: false, errores: ['No hay nada que sumar.'] };
  const dia = d.practicas.filter(p => !p.deleted && p.alumno_id === aid && p.vehiculo_id === vid && p.fecha === o.fecha).sort(ordenFila);
  const ultima = dia.length ? dia[dia.length - 1] : null;
  const sesion = ultima ? sesionDe(d, ultima) : [];
  const total = aCuartos(sesion.reduce((s, x) => s + clasesDePractica(x), 0));
  const nuevo = aCuartos(total + delta);
  if (nuevo <= 0) {
    if (!sesion.length) return { ok: true, errores: [], clases: 0 };
    const r = quitarSesionClase(sesion[0].id);
    return { ...r, clases: 0 };
  }
  const base = {
    vehiculo_id: vid, fecha: o.fecha, cantidad: nuevo,
    km: { modo: sesion.length ? 'conservar' : (o.km === 'auto' ? 'auto' : 'sin'), nuevas: o.km === 'auto' ? 'auto' : 'sin', desplazar: false, kmMin: o.kmMin, kmMax: o.kmMax }
  };
  if (o.profesor_id !== undefined) base.profesor_id = o.profesor_id;
  if (o.tipo !== undefined) base.tipo = o.tipo;
  if (o.hora_inicio !== undefined) base.hora_inicio = o.hora_inicio;
  if (o.sucursal_id !== undefined) base.sucursal_id = o.sucursal_id;
  const prev = proponerClase(sesion.length ? { ...base, practica_id: sesion[0].id } : { ...base, alumno_id: aid });
  if (!prev.ok) return { ok: false, errores: prev.errores };
  const r = aplicarClase(prev);
  return { ...r, clases: nuevo, avisos: prev.avisos };
}

module.exports = {
  proponerClase, aplicarClase, getSesionClase, quitarSesionClase, sumarClasesDia,
  _sesionDe: sesionDe, _sigueA: sigueA
};
