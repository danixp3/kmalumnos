/**
 * db/plan-km.js  –  Un solo sitio para analizar y generar los km de un coche.
 *
 * Antes había métodos sueltos (Cuadrar, Encajar, Quitar km, Encadenado, Hasta un máximo, Por
 * rango, Corregir solapamientos) y había que elegir UNO. Aquí se pueden COMBINAR:
 *
 *  · recomendarPlanKm(vid)       → mira el coche y propone los pasos más lógicos (y por qué), más
 *                                  lo que se puede hacer aparte.
 *  · proponerPlanKm(vid, pasos)  → vista previa de una cadena de pasos: cada paso trabaja sobre lo
 *                                  que dejó el anterior (en una copia de los datos, core.simular),
 *                                  y devuelve los cambios NETOS por clase, lo que hizo cada paso y
 *                                  cómo queda el coche después.
 *  · Para guardarlo se usa aplicarCuadreKm(vid, cambios) con la vista previa tal cual (se guarda
 *    EXACTAMENTE lo mostrado, en un solo registro que se puede deshacer con deshacerCuadreKm).
 *
 * Pasos: { tipo: 'cuadrar', opciones } · { tipo: 'encajar', practica_id, opciones } ·
 *        { tipo: 'quitar', practica_id } · { tipo: 'encadenar', kmMin, kmMax, kmInicio, kmFinal } ·
 *        { tipo: 'maximo', kmMin, kmMax, kmMaximo } · { tipo: 'rango', kmDesde, kmHasta, variacion } ·
 *        { tipo: 'solapes', kmMin, kmMax }
 */

const core = require('./core');
const { load, simular, fmtFechaLog, nombreCorto, hoyLocalISO } = core;
const cuadre = require('./cuadre-km');
const alg = require('./km-algoritmos');
const { getRangoKm } = require('./ajustes-empresa');

const TIPOS = ['cuadrar', 'encajar', 'quitar', 'encadenar', 'maximo', 'rango', 'solapes'];
const MAX_PASOS = 12;

const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
const kmBaremo = p => {
  const r = getRangoKm() || { min: 40, max: 45 };
  const min = Math.round(num(p && p.kmMin)) || r.min, max = Math.round(num(p && p.kmMax)) || r.max;
  return { min, max: Math.max(min, max) };
};

function instantanea(d, vid) {
  const m = new Map();
  for (const p of d.practicas) if (!p.deleted && p.vehiculo_id === vid) m.set(p.id, { ki: p.km_inicial || 0, kf: p.km_final || 0 });
  return m;
}
function diferencias(a, b) {
  const out = [];
  for (const [id, y] of b) {
    const x = a.get(id);
    if (!x) continue;
    if (x.ki !== y.ki || x.kf !== y.kf) out.push({ id, antes: x, despues: y });
  }
  return out;
}

function nombreClase(d, id) {
  const p = d.practicas.find(x => x.id === id);
  if (!p) return '?';
  const a = d.alumnos.find(x => x.id === p.alumno_id);
  return `${a ? nombreCorto(a) : '?'} (${fmtFechaLog(p.fecha)}${p.hora_inicio ? ' ' + p.hora_inicio : ''})`;
}

function tituloPaso(d, paso) {
  switch (paso.tipo) {
    case 'cuadrar': {
      const o = paso.opciones || {};
      const extras = [o.rellenarAntes && 'rellenando hacia atrás', o.rellenarDespues && 'rellenando hacia delante', o.cerrarHuecosPequenos && 'cerrando huecos pequeños', o.rellenarHuecosGrandes && 'con km típicos en los huecos grandes'].filter(Boolean);
      return 'Cuadrar: arreglar los km que no encajan y repartir los huecos' + (extras.length ? ` (${extras.join(', ')})` : '');
    }
    case 'encajar': return `Encajar a continuación de la anterior: ${nombreClase(d, paso.practica_id)}`;
    case 'quitar': return `Quitar los km de ${nombreClase(d, paso.practica_id)}`;
    case 'encadenar': return `Encadenar las clases sin km desde el cuentakilómetros${paso.kmInicio ? ` (${paso.kmInicio} km)` : ' del coche'}`;
    case 'maximo': return `Generar hacia atrás hasta el km ${paso.kmMaximo}`;
    case 'rango': return `Repartir entre el km ${paso.kmDesde} y el ${paso.kmHasta}`;
    case 'solapes': return 'Corregir los solapes que queden';
    default: return paso.tipo;
  }
}

/** Ejecuta UN paso sobre los datos activos (que en la práctica son la copia de la simulación). */
function ejecutarPaso(vid, paso, avisos) {
  switch (paso.tipo) {
    case 'cuadrar': {
      const r = cuadre.proponerCuadreKm(vid, paso.opciones || {});
      if (r.errores && r.errores.length) return r.errores;
      for (const a of r.avisos) if (a.tipo !== 'faltan_clases') avisos.push(a.texto);
      if (r.cambios.length) {
        const ap = cuadre.aplicarCuadreKm(vid, r.cambios);
        if (ap.errores && ap.errores.length) return ap.errores;
      }
      return [];
    }
    case 'encajar': {
      const o = paso.opciones || {};
      const b = kmBaremo(o);
      const r = cuadre.proponerEncajeKm(vid, paso.practica_id, { ...o, kmMin: b.min, kmMax: b.max });
      if (r.errores && r.errores.length) return r.errores;
      for (const a of r.avisos || []) avisos.push(a.texto);
      if (r.cambios.length) {
        const ap = cuadre.aplicarCuadreKm(vid, r.cambios);
        if (ap.errores && ap.errores.length) return ap.errores;
      }
      return [];
    }
    case 'quitar': {
      const r = cuadre.quitarKmClase(paso.practica_id);
      return r.errores || [];
    }
    case 'encadenar': {
      const b = kmBaremo(paso);
      const r = alg.rellenarKmMasivo(vid, b.min, b.max, num(paso.kmInicio), num(paso.kmFinal));
      if (r.errores && r.errores.length) return r.errores;
      if (r.saltadas) avisos.push(`${r.saltadas} clase(s) no caben antes del tope y se quedan sin km.`);
      return [];
    }
    case 'maximo': {
      const b = kmBaremo(paso);
      const r = alg.generarKmHastaMaximo(vid, b.min, b.max, num(paso.kmMaximo), false);
      if (r.errores && r.errores.length) return r.errores;
      if (r.solapamientos) avisos.push(`${r.solapamientos} clase(s) generadas se solapan con otras que ya tienen km.`);
      const ap = alg.aplicarPlanKm(vid, r.asignaciones);
      return ap.errores || [];
    }
    case 'rango': {
      const r = alg.generarKmPorRango(vid, num(paso.kmDesde), num(paso.kmHasta), num(paso.variacion) || 0, false);
      if (r.errores && r.errores.length) return r.errores;
      if (r.solapamientos) avisos.push(`${r.solapamientos} clase(s) generadas se solapan con otras que ya tienen km.`);
      const ap = alg.aplicarPlanKm(vid, r.asignaciones);
      return ap.errores || [];
    }
    case 'solapes': {
      const b = kmBaremo(paso);
      alg.corregirSolapamientos(vid, b.min, b.max);
      return [];
    }
    default: return [`Paso desconocido: ${paso.tipo}`];
  }
}

const solapesDe = vid => alg.getSolapamientos().filter(c => c.vehiculo_id === vid).length;

function estadoDelCoche(vid) {
  const r = cuadre.proponerCuadreKm(vid);
  const s = r.resumen;
  return { clases: s.clases, sin_km: s.sin_km, incoherentes: s.incoherentes, a_cambiar: s.a_cambiar, huecos: s.huecos, km_en_huecos: s.km_en_huecos, huecos_revisados: s.huecos_revisados, solapes: solapesDe(vid), con_km_fiables: s.con_km_fiables, companeros: s.companeros };
}

/**
 * Vista previa de una cadena de pasos. Devuelve:
 * { vehiculo, cambios[], pasos[{tipo,titulo,cambios,avisos,errores}], antes, despues, avisos[], errores[] }
 * `cambios` es lo que hay que pasar a aplicarCuadreKm(vid, cambios).
 */
function proponerPlanKm(vehiculo_id, pasos) {
  const d0 = load();
  const vid = parseInt(vehiculo_id);
  const v = d0.vehiculos.find(x => x.id === vid && !x.deleted);
  const vacio = errores => ({ vehiculo: v ? { id: v.id, nombre: v.nombre, matricula: v.matricula || null } : null, cambios: [], pasos: [], antes: null, despues: null, avisos: [], errores });
  if (!v) return vacio(['Vehículo no encontrado']);
  if (!Array.isArray(pasos) || !pasos.length) return vacio(['El plan no tiene ningún paso.']);
  if (pasos.length > MAX_PASOS) return vacio([`Un plan puede tener como mucho ${MAX_PASOS} pasos.`]);
  for (const p of pasos) if (!p || !TIPOS.includes(p.tipo)) return vacio(['Hay un paso que no se reconoce.']);

  const antesEstado = estadoDelCoche(vid);
  const inicio = instantanea(d0, vid);
  const original = new Map();
  for (const p of d0.practicas) if (!p.deleted && p.vehiculo_id === vid) original.set(p.id, p);

  const res = simular(d => {
    const detalle = [];
    const toques = new Map();    // practica_id → [índices de pasos que la tocaron]
    let previa = instantanea(d, vid);
    pasos.forEach((paso, i) => {
      const avisos = [];
      const titulo = tituloPaso(d, paso);
      let errores = [];
      try { errores = ejecutarPaso(vid, paso, avisos); } catch (e) { errores = [`No se pudo calcular este paso: ${e.message}`]; }
      const ahora = instantanea(d, vid);
      const dif = diferencias(previa, ahora);
      for (const c of dif) { if (!toques.has(c.id)) toques.set(c.id, []); toques.get(c.id).push(i); }
      detalle.push({ tipo: paso.tipo, titulo, cambios: dif.length, avisos, errores });
      previa = ahora;
    });
    const final = instantanea(d, vid);
    const despuesEstado = estadoDelCoche(vid);
    const alumnoDe = id => { const p = d.practicas.find(x => x.id === id); return p ? nombreCorto(d.alumnos.find(a => a.id === p.alumno_id)) : '?'; };
    const neto = diferencias(inicio, final).map(c => {
      const p = original.get(c.id);
      const vacia = c.despues.ki === 0 && c.despues.kf === 0;
      const pasosQue = (toques.get(c.id) || []).map(i => detalle[i].titulo);
      return {
        practica_id: c.id, alumno: alumnoDe(c.id), fecha: p.fecha, hora_inicio: p.hora_inicio || null,
        antes: { km_inicial: c.antes.ki, km_final: c.antes.kf }, despues: { km_inicial: c.despues.ki, km_final: c.despues.kf },
        tipo: vacia ? 'vaciar' : (c.antes.ki === 0 && c.antes.kf === 0 ? 'repartir' : 'corregir'),
        motivo: pasosQue.length === 1 ? pasosQue[0] : `${pasosQue.length} pasos: ${pasosQue.join(' → ')}`.slice(0, 220),
        pasos: toques.get(c.id) || []
      };
    }).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio || '99').localeCompare(b.hora_inicio || '99') || a.practica_id - b.practica_id);
    return { detalle, neto, despuesEstado };
  });

  const errores = res.detalle.flatMap((p, i) => p.errores.map(e => `Paso ${i + 1}: ${e}`));
  return {
    vehiculo: { id: v.id, nombre: v.nombre, matricula: v.matricula || null },
    cambios: res.neto, pasos: res.detalle, antes: antesEstado, despues: res.despuesEstado,
    avisos: res.detalle.flatMap(p => p.avisos), errores,
    km_actual_despues: Math.max(v.km_actual || 0, ...res.neto.map(c => c.despues.km_final))
  };
}

/**
 * Mira el coche y propone qué hacer, por orden. Siempre devuelve algo que se puede aplicar o decir
 * que está todo cuadrado, más las «otras opciones» y los consejos para lo que no se arregla solo.
 */
function recomendarPlanKm(vehiculo_id) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid && !x.deleted);
  if (!v) return { vehiculo: null, estado: null, nada: true, recomendado: null, opcionales: [], consejos: [], errores: ['Vehículo no encontrado'] };

  const estado = estadoDelCoche(vid);
  const r = cuadre.proponerCuadreKm(vid);
  const encajes = cuadre.getEncajesKm(vid);
  const rango = getRangoKm() || { min: 40, max: 45 };
  const { cadena } = cuadre._analizarCoche(d, vid);
  const conReferencia = cadena.length > 0;
  const avisoDe = tipo => (r.avisos.find(a => a.tipo === tipo) || {}).clases || 0;
  const sinKmAntes = avisoDe('sin_km_antes'), sinKmDespues = avisoDe('sin_km_despues');

  const pasos = [];
  const razones = [];
  if (encajes.length) {
    for (const e of encajes.slice(0, 3)) pasos.push({ tipo: 'encajar', practica_id: e.practica_id, opciones: { kmMin: rango.min, kmMax: rango.max, hasta: 'dia', conservarPrimera: true, kmInicio: null } });
    razones.push(`${encajes.length === 1 ? 'Una clase empieza' : encajes.length + ' clases empiezan'} por debajo del final de la anterior (se pisan km): se encajan primero a continuación de la anterior, porque suele arreglar también las que parecían rotas.`);
  }
  if (!conReferencia && estado.sin_km > 0) {
    pasos.push({ tipo: 'encadenar', kmMin: rango.min, kmMax: rango.max, kmInicio: null, kmFinal: null });
    razones.push(`Ninguna clase de este coche tiene km fiables, así que se encadenan las ${estado.sin_km} clases sin km hacia delante desde el cuentakilómetros actual del coche (${v.km_actual || 0} km).`);
  } else if (r.cambios.length || sinKmAntes || sinKmDespues) {
    // Si solo quedan clases sin km ANTES de la primera con km, lo lógico es ponérselos hacia atrás
    const hayOtroTrabajo = r.cambios.length > 0 || sinKmDespues > 0;
    const rellenarAntes = sinKmAntes > 0 && !hayOtroTrabajo;
    pasos.push({ tipo: 'cuadrar', opciones: { rellenarDespues: sinKmDespues > 0, rellenarAntes, cerrarHuecosPequenos: false, rellenarHuecosGrandes: false } });
    razones.push(r.cambios.length
      ? `Se ordenan las clases por fecha y hora, se arreglan los km que no encajan y se reparten los huecos entre las clases sin km${sinKmDespues ? `; las ${sinKmDespues} que quedan después de la última con km siguen a continuación` : ''}.`
      : `Las clases con km encajan; las ${rellenarAntes ? sinKmAntes + ' anteriores a la primera' : sinKmDespues + ' posteriores a la última'} con km se rellenan ${rellenarAntes ? 'hacia atrás' : 'a continuación'} con km típicos.`);
  }

  // ¿Quedarían solapes después? Entonces se corrigen al final
  let simulado = null;
  if (pasos.length) {
    simulado = proponerPlanKm(vid, pasos);
    if (!simulado.errores.length && simulado.despues && simulado.despues.solapes > 0) {
      pasos.push({ tipo: 'solapes', kmMin: rango.min, kmMax: rango.max });
      razones.push('Todavía quedarían clases que se pisan: el último paso las desplaza una detrás de otra.');
    }
  } else if (estado.solapes > 0) {
    pasos.push({ tipo: 'solapes', kmMin: rango.min, kmMax: rango.max });
    razones.push(`Hay ${estado.solapes} ${estado.solapes === 1 ? 'solape' : 'solapes'} de km entre clases: se desplazan una detrás de otra.`);
  }

  const opcionales = [];
  const antesYaIncluido = pasos.some(p => p.tipo === 'cuadrar' && p.opciones && p.opciones.rellenarAntes);
  if (sinKmAntes > 0 && !antesYaIncluido) opcionales.push({ clave: 'rellenar_antes', titulo: `Rellenar hacia atrás las ${sinKmAntes} clases anteriores a la primera con km`, detalle: 'Se inventan km típicos hacia atrás desde la primera clase con km conocidos. Solo si esas clases de verdad se dieron con este coche.' });
  if (estado.huecos > 0) opcionales.push({ clave: 'rellenar_huecos', titulo: 'Poner km típicos a las clases sin km aunque sobren muchos km', detalle: 'En los tramos donde faltan clases en medio, las clases sin km toman km típicos y el resto sigue como hueco.' });

  const consejos = [];
  if (estado.huecos > 0) consejos.push(`Hay ${estado.huecos} ${estado.huecos === 1 ? 'tramo' : 'tramos'} con ${estado.km_en_huecos} km sin explicar: faltan clases por anotar (usa «Añadir clase»: se encaja sola donde le toca) o fueron otro uso del coche (márcalo como revisado, o añade «compañeros sin registrar» en el modo avanzado).`);
  const nada = !pasos.length;
  let titulo;
  if (nada) titulo = estado.huecos > 0 ? 'Las clases con km encajan; solo quedan tramos sin explicar' : 'El cuentakilómetros de este coche está cuadrado';
  else if (pasos.length === 1) titulo = tituloPaso(d, pasos[0]);
  else titulo = `${pasos.length} pasos, en este orden`;
  return {
    vehiculo: { id: v.id, nombre: v.nombre, matricula: v.matricula || null, km_actual: v.km_actual || 0 },
    estado, nada, errores: [],
    recomendado: nada ? null : { titulo, motivo: razones.join(' '), pasos, titulos: pasos.map(p => tituloPaso(d, p)) },
    opcionales, consejos, encajes: encajes.length,
    huecos: r.huecos, avisos: r.avisos.filter(a => !['faltan_clases', 'sin_km_antes', 'sin_km_despues'].includes(a.tipo)).map(a => a.texto)
  };
}

module.exports = { recomendarPlanKm, proponerPlanKm };
