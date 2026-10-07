/**
 * db/cuadre-km.js  –  «Cuadrar km»: deja coherente el cuentakilómetros de un
 * coche cuando los datos llegan desordenados (los profesores empezaron a usar
 * la app antes de traer las clases del otro programa, alguien tecleó un km mal,
 * una clase quedó con inicial 0...).
 *
 * Idea: el ORDEN EN EL TIEMPO (fecha, hora) manda; los km solo pueden subir.
 *  1. Se ordenan las clases del coche por fecha y hora.
 *  2. Los solapes pequeños (unos pocos km) se recortan en la clase menos fiable.
 *  3. De las clases con km se elige la cadena más fiable que nunca baja
 *     (peso: lectura del cuentakm > anotada > traída de otro programa > km
 *     automáticos). Lo que no encaja (inicial 0, final menor que inicial, km que
 *     pisan a otras...) y las clases sin km se tratan como «por cuadrar».
 *  4. Entre dos clases conocidas, las clases por cuadrar se reparten los km que
 *     hay (con variación y respetando las fracciones de clase) SI el reparto es
 *     creíble (km por clase razonables). Si sobran muchos km es que faltan
 *     clases por traer/anotar: no se inventa nada, queda como «hueco» (que el
 *     usuario puede dar por revisado: no son errores, es otro uso del coche).
 *  5. Opcional: rellenar las clases sin km anteriores a la primera conocida
 *     (hacia atrás) o posteriores a la última (hacia delante).
 *  6. «Encajar desde aquí» (proponerEncajeKm): cuando una clase se empezó con un km
 *     antiguo y todas las siguientes se encadenaron mal, se coloca a continuación de
 *     la clase anterior y se recalculan las siguientes con el baremo de km por clase.
 *  7. Modo avanzado: «compañeros sin registrar». Alumnos que también usaban el coche
 *     y no están en la app (p. ej. los que ya aprobaron) ocupan km del cuentakm entre
 *     las clases del coche, dentro de su rango de fechas. NO crean alumnos ni clases:
 *     solo hacen que el reparto deje el hueco que de verdad hubo entre una clase y la
 *     siguiente (sin ellos, un alumno que sigue en la app parece haber usado el coche
 *     él solo durante semanas). Se guardan por coche en ajustes_empresa.companeros_km
 *     y explican los huecos que caen en su rango (no salen como «sin explicar»).
 *
 * Todo se PREVISUALIZA (proponerCuadreKm) y se guarda EXACTAMENTE lo mostrado
 * (aplicarCuadreKm), con registro para poder deshacerlo (deshacerCuadreKm).
 * Las claves de huecos revisados viajan en ajustes_empresa (sincronizan solas).
 */

const { load, save, addLog, _sync, hoyLocalISO, esPracticaEnCurso, esPracticaSinCerrar, clasesDePractica, fmtFechaLog, nombreCorto } = require('./core');
const { getAjusteEmpresa, setAjusteEmpresa } = require('./ajustes-empresa');

const TOLERANCIA_HUECO = 15;     // km entre dos clases que son «normales» (el coche vuelve a la autoescuela, etc.)
const MAX_CUADRES = 20;          // registros de cuadres guardados para deshacer
const MAX_REVISADOS = 400;       // huecos dados por revisados que se recuerdan
const KM_CLASE_DEFECTO = 24;     // km de una clase si aún no hay datos con los que medirlo
const RECORTE_MAX = 0.4;         // un solape solo se recorta si quita como mucho el 40 % de los km de la clase
const MAX_COMPANEROS = 8;        // compañeros sin registrar por coche
const HOLGURA_COMPANEROS = 1.25; // un hueco lo explican los compañeros si no pasa de sus km máximos con un 25 % de margen

// ─── utilidades ─────────────────────────────────────────────────────────────
const sinKm = p => !(p.km_inicial > 0) && !(p.km_final > 0);
const ordenTiempo = (a, b) => (a.fecha || '').localeCompare(b.fecha || '') ||
  (a.hora_inicio || '99:99').localeCompare(b.hora_inicio || '99:99') || a.id - b.id;
const nombreDe = a => a ? nombreCorto(a) : '?';
const mediana = xs => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Cuánto nos fiamos de los km de una clase (para decidir cuál ceder si chocan)
function confianza(p) {
  switch (p.tipo_detalle) {
    case 'km_auto': return 1;     // los puso la app
    case 'anterior': return 2;    // traída de otro programa o generada
    case 'anotada': return 3;     // anotada a mano después
    default: return p.source === 'web-remote' ? 4 : 3; // lectura del cuentakm al empezar la clase (móvil) / escrita en el escritorio
  }
}

// Km típicos de una clase de la autoescuela (mediana de las clases con km razonables)
function kmTipicoClase(d) {
  const xs = [];
  for (const p of d.practicas) {
    if (p.deleted || !(p.km_final > p.km_inicial) || !(p.km_inicial > 0)) continue;
    if (confianza(p) < 3) continue; // los km repartidos o automáticos no miden lo que hace una clase de verdad
    const km = (p.km_final - p.km_inicial) / clasesDePractica(p);
    if (km >= 3 && km <= 120) xs.push(km);
  }
  return xs.length >= 5 ? Math.round(mediana(xs)) : KM_CLASE_DEFECTO;
}

function limitesCredibles(med) {
  return { lo: Math.max(4, Math.round(med * 0.4)), hi: Math.round(med * 2.4), max: Math.max(150, Math.round(med * 6)) };
}

// Km de una clase «típica» con una pequeña variación (±15 %) para que no salgan todas idénticas
const kmTipicoVariado = (med, peso) => Math.max(1, Math.round(med * peso * (1 + (Math.random() * 2 - 1) * 0.15)));

// Reparte `total` km en trozos ENTEROS proporcionales a `pesos`, con una variación
// aleatoria del ± `variacion` (fracción de la media), sumando EXACTAMENTE `total`
// y con al menos 1 km cada uno.
function repartirKm(total, pesos, variacion = 0.12) {
  const n = pesos.length;
  if (!n) return [];
  const W = pesos.reduce((a, b) => a + b, 0);
  const sueltos = pesos.map(w => Math.max(1, (total * w / W) * (1 + (Math.random() * 2 - 1) * variacion)));
  const suma = sueltos.reduce((a, b) => a + b, 0);
  const trozos = sueltos.map(x => Math.max(1, Math.round(x * total / suma)));
  let dif = total - trozos.reduce((a, b) => a + b, 0);
  let guardia = 0;
  while (dif !== 0 && guardia++ < 100000) {
    for (let i = 0; i < n && dif !== 0; i++) {
      // el ajuste se carga en los trozos más grandes, sin bajar de 1 km
      const k = dif > 0 ? 1 : (trozos[i] > 1 ? -1 : 0);
      if (!k) continue;
      trozos[i] += k; dif -= k;
    }
  }
  return trozos;
}

// ─── análisis de un coche ───────────────────────────────────────────────────
/**
 * Clasifica y ordena las clases del coche y busca la cadena fiable de km.
 * Solo lectura. Devuelve la «radiografía» que usan el diagnóstico y la propuesta.
 */
function analizarCoche(d, vid, hoy = hoyLocalISO(), rehacer = null) {
  const med = kmTipicoClase(d);
  const lim = limitesCredibles(med);
  const vivas = d.practicas.filter(p => !p.deleted && p.vehiculo_id === vid).sort(ordenTiempo);

  // Copias de trabajo (no se toca nada de los datos)
  const items = vivas.map(p => ({
    id: p.id, p, fecha: p.fecha, hora: p.hora_inicio || null,
    ki: Number(p.km_inicial) || 0, kf: Number(p.km_final) || 0,
    ki0: Number(p.km_inicial) || 0, kf0: Number(p.km_final) || 0,
    peso: clasesDePractica(p), conf: confianza(p), estado: null, motivo: null, recorte: null
  }));

  for (const it of items) {
    const p = it.p;
    if (esPracticaEnCurso(p, hoy) || esPracticaSinCerrar(p, hoy)) it.estado = 'abierta';
    else if (sinKm(p)) it.estado = 'sin_km';
    else if (rehacer && rehacer(it)) { it.estado = 'sin_km'; it.rehacer = true; }
    else if (it.ki > 0 && it.kf > it.ki) {
      it.estado = (it.kf - it.ki) / it.peso > lim.max ? 'enorme' : 'valida';
      if (it.estado === 'enorme') it.motivo = `${Math.round(it.kf - it.ki)} km en una sola clase`;
    } else {
      it.estado = 'rota';
      it.motivo = it.ki === 0 ? 'km inicial a 0' : it.kf <= it.ki ? 'km final menor o igual que el inicial' : 'km incoherentes';
    }
  }

  // Candidatas a cadena: válidas y las abiertas (su km inicial es una lectura real)
  const cand = items.filter(it => it.estado === 'valida' || (it.estado === 'abierta' && it.ki > 0));
  for (const it of cand) if (it.estado === 'abierta') it.kf = it.ki; // sin km final: solo ancla su inicio

  // Pequeños solapes entre vecinas: se recorta la clase menos fiable
  let ant = null;
  for (const it of cand) {
    if (ant && ant.kf > it.ki) {
      const solape = ant.kf - it.ki;
      const spanA = ant.kf - ant.ki, spanB = it.kf - it.ki;
      const puedeRecortarA = ant.estado === 'valida' && solape <= spanA * RECORTE_MAX && ant.kf - solape > ant.ki;
      const puedeRecortarB = it.estado === 'valida' && solape <= spanB * RECORTE_MAX && it.ki + solape < it.kf;
      if (puedeRecortarA && (ant.conf <= it.conf || !puedeRecortarB)) { ant.kf = it.ki; ant.recorte = { solape, lado: 'final' }; }
      else if (puedeRecortarB) { it.ki = ant.kf; it.recorte = { solape, lado: 'inicial' }; }
    }
    ant = it;
  }

  // Cadena más fiable que nunca baja (peso = confianza; a igualdad, más clases).
  // Árbol de Fenwick sobre los km finales: para cada clase, el mejor encadenado que termina en un km <= su km inicial.
  const n = cand.length;
  const mejor = new Array(n).fill(0), previo = new Array(n).fill(-1);
  const finales = [...new Set(cand.map(c => c.kf))].sort((a, b) => a - b);
  const pos = new Map(finales.map((v, i) => [v, i + 1]));
  const arbol = new Array(finales.length + 1).fill(null); // [mejor, índice] por tramo
  const mayor = (a, b) => (!b || (a && a[0] >= b[0])) ? a : b;
  const consulta = i => { let r = null; for (; i > 0; i -= i & -i) r = mayor(r, arbol[i]); return r; };
  const anota = (i, v) => { for (; i <= finales.length; i += i & -i) arbol[i] = mayor(v, arbol[i]); };
  // cuántos km finales son <= x (búsqueda binaria)
  const hasta = x => { let a = 0, b = finales.length; while (a < b) { const m = (a + b) >> 1; if (finales[m] <= x) a = m + 1; else b = m; } return a; };
  for (let j = 0; j < n; j++) {
    const base = consulta(hasta(cand[j].ki));
    mejor[j] = (base ? base[0] : 0) + cand[j].conf + 0.001;
    previo[j] = base ? base[1] : -1;
    anota(pos.get(cand[j].kf), [mejor[j], j]);
  }
  let fin = -1;
  for (let j = 0; j < n; j++) if (fin < 0 || mejor[j] > mejor[fin]) fin = j;
  const enCadena = new Set();
  for (let j = fin; j >= 0; j = previo[j]) enCadena.add(cand[j].id);
  for (const it of cand) {
    it.enCadena = enCadena.has(it.id);
    if (!it.enCadena && it.estado === 'valida') { it.estado = 'fuera'; it.motivo = 'sus km no encajan con las clases de alrededor'; }
  }
  const cadena = cand.filter(it => it.enCadena);
  return { med, lim, items, cadena, hoy };
}

// ─── compañeros sin registrar (modo avanzado) ───────────────────────────────
const fechaISO = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
function normalizarCompanero(c, i = 0) {
  const x = c && typeof c === 'object' ? c : {};
  let kmMin = Math.round(Number(x.kmMin)), kmMax = Math.round(Number(x.kmMax));
  if (!(kmMin >= 1)) kmMin = 20;
  kmMin = Math.min(kmMin, 300);
  if (!(kmMax >= kmMin)) kmMax = Math.max(kmMin, 30);
  kmMax = Math.min(kmMax, 300);
  let desde = fechaISO(x.desde), hasta = fechaISO(x.hasta);
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  const nombre = String(x.nombre == null ? '' : x.nombre).replace(/\s+/g, ' ').trim().slice(0, 40) || `Compañero ${i + 1}`;
  return {
    id: String(x.id || `c${i + 1}`).replace(/[^\w-]/g, '').slice(0, 24) || `c${i + 1}`, nombre, desde, hasta,
    clases: Math.min(6, Math.max(1, Math.round(Number(x.clases) || 1))), kmMin, kmMax,
    mismoDia: x.mismoDia !== false, activo: x.activo !== false
  };
}
function _todosCompaneros() {
  const t = getAjusteEmpresa('companeros_km');
  return t && typeof t === 'object' && !Array.isArray(t) ? t : {};
}
/** Compañeros sin registrar guardados para un coche */
function getCompanerosKm(vehiculo_id) {
  const l = _todosCompaneros()[String(parseInt(vehiculo_id))];
  return Array.isArray(l) ? l.slice(0, MAX_COMPANEROS).map(normalizarCompanero) : [];
}
/** Guarda (sustituye) los compañeros de un coche. Se sincroniza con los demás PCs. */
function setCompanerosKm(vehiculo_id, lista) {
  const vid = String(parseInt(vehiculo_id));
  if (!/^\d+$/.test(vid)) return [];
  const limpios = (Array.isArray(lista) ? lista : []).slice(0, MAX_COMPANEROS).map(normalizarCompanero);
  const vistos = new Set();
  for (const c of limpios) { while (vistos.has(c.id)) c.id = c.id + 'x'; vistos.add(c.id); }
  const todos = { ..._todosCompaneros() };
  if (limpios.length) todos[vid] = limpios; else delete todos[vid];
  setAjusteEmpresa('companeros_km', todos);
  return limpios;
}
const enRangoCompanero = (c, fecha) => (!c.desde || fecha >= c.desde) && (!c.hasta || fecha <= c.hasta);
// Clases de los compañeros entre dos clases seguidas del coche (x antes que y): las dos
// dentro de su rango; nunca entre dos clases seguidas del mismo alumno el mismo día (una sesión).
function companerosEntre(companeros, x, y) {
  if (!x || !y || !companeros.length) return [];
  if (x.alumno_id === y.alumno_id && x.fecha === y.fecha) return [];
  const out = [];
  for (const c of companeros) {
    if (!c.activo || !enRangoCompanero(c, x.fecha) || !enRangoCompanero(c, y.fecha)) continue;
    if (!c.mismoDia && x.fecha === y.fecha) continue;
    for (let k = 0; k < c.clases; k++) out.push(c);
  }
  return out;
}
/** ¿Un hueco de `km` entre dos clases (prácticas) del coche lo explican sus compañeros sin registrar? */
function huecoDeCompaneros(vehiculo_id, a, b, km, companeros) {
  const lista = companeros || getCompanerosKm(vehiculo_id);
  const fz = companerosEntre(lista, a, b);
  if (!fz.length || !(km > 0)) return false;
  return km <= fz.reduce((s, c) => s + c.kmMax, 0) * HOLGURA_COMPANEROS + TOLERANCIA_HUECO;
}

// ─── propuesta ──────────────────────────────────────────────────────────────
/**
 * Calcula (sin guardar) cómo dejar el coche cuadrado.
 * opciones: { rellenarAntes, rellenarDespues, cerrarHuecosPequenos, rellenarHuecosGrandes,
 *            companeros (lista; sin ella, los guardados del coche), rehacerCalculados }
 *   rehacerCalculados: las clases con km que puso la app (km_auto) dentro del rango de algún
 *   compañero se vuelven a calcular (para repartir de nuevo con los compañeros).
 * Devuelve { cambios, huecos, avisos, resumen, vehiculo, fantasmas, planificacion }.
 */
function proponerCuadreKm(vehiculo_id, opciones = {}) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return { cambios: [], huecos: [], avisos: [], errores: ['Vehículo no encontrado'], resumen: {} };
  const opt = { rellenarAntes: false, rellenarDespues: false, cerrarHuecosPequenos: false, rellenarHuecosGrandes: false, rehacerCalculados: false, ...opciones };
  const companeros = (Array.isArray(opt.companeros) ? opt.companeros.slice(0, MAX_COMPANEROS).map(normalizarCompanero) : getCompanerosKm(vid)).filter(c => c.activo);
  const rehacer = opt.rehacerCalculados && companeros.length
    ? it => it.p.tipo_detalle === 'km_auto' && companeros.some(c => enRangoCompanero(c, it.fecha))
    : null;
  const A = analizarCoche(d, vid, undefined, rehacer);
  const { med, lim, items, cadena } = A;
  const alumno = id => nombreDe(d.alumnos.find(a => a.id === id));
  const revisados = new Set(getRevisados());

  const cambios = [];     // { practica_id, antes, despues, motivo, tipo }
  const huecos = [];      // huecos que quedan entre clases conocidas
  const avisos = [];      // cosas que no se pueden arreglar solas
  const fantasmas = [];   // km de los compañeros sin registrar: { despues_de, antes_de, companero_id, nombre, clases, km, explica }
  const cambiada = new Set();
  // Compañeros entre dos items (clases del coche) y su apunte en la vista previa
  const fEntre = (x, y) => companerosEntre(companeros, x && { alumno_id: x.p.alumno_id, fecha: x.fecha }, y && { alumno_id: y.p.alumno_id, fecha: y.fecha });
  const medF = c => (c.kmMin + c.kmMax) / 2;
  const sortear = c => Math.round(c.kmMin + Math.random() * (c.kmMax - c.kmMin));
  const anotarFantasma = (x, y, c, km, explica = false) => {
    const prev = fantasmas.find(f => f.antes_de === y.id && f.companero_id === c.id);
    if (prev) { prev.km += km; prev.clases += 1; return; }
    fantasmas.push({ despues_de: x.id, antes_de: y.id, companero_id: c.id, nombre: c.nombre, clases: 1, km, explica });
  };
  const etq = it => `${alumno(it.p.alumno_id)} (${fmtFechaLog(it.fecha)}${it.hora ? ' ' + it.hora : ''})`;
  const fila = (it, ki, kf, tipo, motivo) => {
    if (cambiada.has(it.id)) return;
    if (ki === it.ki0 && kf === it.kf0) return;
    cambiada.add(it.id);
    cambios.push({
      practica_id: it.id, alumno: alumno(it.p.alumno_id), fecha: it.fecha, hora_inicio: it.hora,
      antes: { km_inicial: it.ki0, km_final: it.kf0 }, despues: { km_inicial: ki, km_final: kf }, tipo, motivo
    });
  };

  // Recortes de solapes pequeños
  for (const it of items) {
    if (it.recorte) fila(it, it.ki, it.kf, 'recorte', `Solapaba ${it.recorte.solape} km con la clase vecina: se ajusta el ${it.recorte.lado}`);
  }

  // Por cuadrar = sin km + rotas + enormes + fuera de la cadena (no abiertas)
  const porCuadrar = items.filter(it => ['sin_km', 'rota', 'enorme', 'fuera'].includes(it.estado));
  // Hueco al que pertenece cada una: índice de la primera clase de la cadena posterior en el tiempo
  const tramos = new Map(); // k = índice de la cadena que va DESPUÉS (0 = antes de la primera, cadena.length = después de la última)
  for (const it of porCuadrar) {
    let a = 0, b = cadena.length;   // la cadena está ordenada en el tiempo: primera clase posterior a `it`
    while (a < b) { const m = (a + b) >> 1; if (ordenTiempo(cadena[m].p, it.p) > 0) b = m; else a = m + 1; }
    const k = a;
    if (!tramos.has(k)) tramos.set(k, []);
    tramos.get(k).push(it);
  }

  // Una clase con km imposibles que no se puede colocar es mejor SIN km (se reparte cuando haya sitio) que con km falsos
  const vaciarIncoherentes = lista => {
    for (const it of lista) {
      if (it.estado !== 'sin_km') fila(it, 0, 0, 'vaciar', `${it.motivo}: no hay km libres donde colocarla, se deja sin km para repartirlos cuando haya sitio`);
    }
  };
  const tipoPara = it => it.estado === 'sin_km' ? 'repartir' : 'corregir';
  const motivoPara = (it, base) => it.estado === 'sin_km' ? base : `${it.motivo}: ${base.charAt(0).toLowerCase()}${base.slice(1)}`;

  if (!cadena.length && porCuadrar.length) {
    avisos.push({ tipo: 'sin_referencia', texto: 'Ninguna clase de este coche tiene km fiables, así que no hay de dónde partir. Usa «Generar km» o anota el km del cuentakilómetros en una clase.' });
  }

  for (const [k, lista] of [...tramos.entries()].sort((a, b) => a[0] - b[0])) {
    if (!cadena.length) break;
    const pesos = lista.map(it => it.peso);
    const W = pesos.reduce((a, b) => a + b, 0);
    const antes = k > 0 ? cadena[k - 1] : null;      // clase conocida anterior
    const despues = k < cadena.length ? cadena[k] : null; // clase conocida posterior

    if (antes && despues) {
      // ENTRE dos clases conocidas: hay G km para repartir
      const G = despues.ki - antes.kf;
      // Con compañeros sin registrar en el tramo, sus clases se reparten los km con las de la app
      const seq = [antes, ...lista, despues];
      const fant = seq.slice(0, -1).map((x, j) => fEntre(x, seq[j + 1]));
      if (fant.some(f => f.length)) {
        const Wf = fant.reduce((s, f) => s + f.reduce((a, c) => a + medF(c) / med, 0), 0);
        const porClaseF = G / (W + Wf);
        if (porClaseF >= lim.lo && porClaseF <= lim.hi) {
          const piezas = [];
          fant.forEach((f, j) => { for (const c of f) piezas.push({ c, x: seq[j], y: seq[j + 1] }); if (j < lista.length) piezas.push({ it: lista[j] }); });
          const trozos = repartirKm(G, piezas.map(pz => (pz.it ? pz.it.peso : medF(pz.c) / med)));
          let cursor = antes.kf;
          piezas.forEach((pz, i) => {
            if (pz.it) fila(pz.it, cursor, cursor + trozos[i], tipoPara(pz.it), motivoPara(pz.it, `Reparte los ${G} km entre las clases de la app y las de los compañeros sin registrar`));
            else anotarFantasma(pz.x, pz.y, pz.c, trozos[i]);
            cursor += trozos[i];
          });
          continue;
        }
        if (porClaseF > lim.hi) {
          // Sobran km aun contando con los compañeros: cada uno con sus km y lo demás queda como hueco
          let cursor = antes.kf;
          fant.forEach((f, j) => {
            for (const c of f) { const km = sortear(c); anotarFantasma(seq[j], seq[j + 1], c, km); cursor += km; }
            if (j < lista.length) {
              const it = lista[j];
              const km = kmTipicoVariado(med, it.peso);
              fila(it, cursor, cursor + km, tipoPara(it), motivoPara(it, 'Km típicos; los compañeros sin registrar ocupan su parte del tramo'));
              cursor += km;
            }
          });
          registrarHueco(antes, despues, cursor, despues.ki);
          continue;
        }
        avisos.push({ tipo: 'companeros_no_caben', texto: `Entre ${etq(antes)} y ${etq(despues)} solo hay ${G} km: no caben también las clases de los compañeros sin registrar, se reparten sin ellos.` });
      }
      const porClase = G / W;
      if (porClase >= lim.lo && porClase <= lim.hi) {
        const trozos = repartirKm(G, pesos);
        let cursor = antes.kf;
        lista.forEach((it, i) => {
          fila(it, cursor, cursor + trozos[i], tipoPara(it), motivoPara(it, `Reparte los ${G} km que hay entre la clase anterior y la siguiente`));
          cursor += trozos[i];
        });
      } else if (porClase > lim.hi) {
        if (opt.rellenarHuecosGrandes) {
          let cursor = antes.kf;
          lista.forEach(it => {
            const km = kmTipicoVariado(med, it.peso);
            fila(it, cursor, cursor + km, tipoPara(it), motivoPara(it, `Km típicos a continuación de la clase anterior (sobran ${G - Math.round(med * W)} km sin clases)`));
            cursor += km;
          });
          registrarHueco(antes, despues, cursor, despues.ki);
        } else {
          avisos.push({
            tipo: 'faltan_clases', desde: antes.id, hasta: despues.id, clases: lista.length, km: G,
            texto: `Entre ${etq(antes)} y ${etq(despues)} hay ${G} km y solo ${lista.length === 1 ? 'una clase' : lista.length + ' clases'} por cuadrar (≈ ${Math.round(porClase)} km cada una): faltan clases por traer o anotar.`
          });
          registrarHueco(antes, despues, antes.kf, despues.ki, lista.length);
          vaciarIncoherentes(lista);
        }
      } else {
        avisos.push({
          tipo: 'no_caben', desde: antes.id, hasta: despues.id, clases: lista.length, km: G,
          texto: `Entre ${etq(antes)} y ${etq(despues)} solo hay ${G} km para ${lista.length === 1 ? 'una clase' : lista.length + ' clases'}: no caben.`
        });
        vaciarIncoherentes(lista);
      }
    } else if (despues && !antes) {
      // ANTES de la primera conocida: hacia atrás
      const rotas = lista.filter(it => it.estado !== 'sin_km');
      const aTratar = opt.rellenarAntes ? lista : rotas;
      if (aTratar.length) {
        let cursor = despues.ki;
        for (let i = aTratar.length - 1; i >= 0; i--) {
          const it = aTratar[i];
          const sig = i + 1 < aTratar.length ? aTratar[i + 1] : despues;
          // Clases de los compañeros entre esta y la siguiente (hacia atrás: van antes de la siguiente)
          const fz = fEntre(it, sig).map(c => ({ c, km: sortear(c) }));
          const kmF = fz.reduce((s, z) => s + z.km, 0);
          const km = kmTipicoVariado(med, it.peso);
          if (cursor - kmF - km < 0) { avisos.push({ tipo: 'sin_sitio', texto: 'Hay más clases anteriores que km hacia atrás: el cuentakilómetros bajaría de 0.' }); break; }
          for (const z of fz) anotarFantasma(it, sig, z.c, z.km);
          cursor -= kmF;
          fila(it, cursor - km, cursor, tipoPara(it), motivoPara(it, fz.length ? 'Hacia atrás desde la primera clase con km conocidos, dejando sitio a los compañeros sin registrar' : 'Antes de la primera clase con km conocidos, hacia atrás'));
          cursor -= km;
        }
      }
      const pendientes = lista.length - aTratar.length;
      if (pendientes > 0) avisos.push({ tipo: 'sin_km_antes', clases: pendientes, texto: `${pendientes} clase(s) sin km anteriores a la primera con km conocidos (marca «Rellenar también las clases sin km anteriores» para ponérselos hacia atrás).` });
    } else if (antes && !despues) {
      // DESPUÉS de la última conocida: hacia delante
      const rotas = lista.filter(it => it.estado !== 'sin_km');
      const aTratar = opt.rellenarDespues ? lista : rotas;
      let cursor = antes.kf;
      aTratar.forEach((it, i) => {
        const prev = i > 0 ? aTratar[i - 1] : antes;
        const fz = fEntre(prev, it);
        for (const c of fz) { const kmF = sortear(c); anotarFantasma(prev, it, c, kmF); cursor += kmF; }
        const km = kmTipicoVariado(med, it.peso);
        fila(it, cursor, cursor + km, tipoPara(it), motivoPara(it, fz.length ? 'A continuación de la anterior, después de las clases de los compañeros sin registrar' : 'A continuación de la última clase con km conocidos'));
        cursor += km;
      });
      const pendientes = lista.length - aTratar.length;
      if (pendientes > 0) avisos.push({ tipo: 'sin_km_despues', clases: pendientes, texto: `${pendientes} clase(s) sin km posteriores a la última con km conocidos (marca «Rellenar también las clases sin km posteriores» para ponérselos hacia delante).` });
    }
  }

  // Huecos entre clases conocidas que ni hay clases por cuadrar
  function registrarHueco(a, b, desde, hasta, clasesSinKm = 0) {
    const km = hasta - desde;
    if (km <= TOLERANCIA_HUECO) return;
    huecos.push(huecoInfo(a, b, km, clasesSinKm));
  }
  function huecoInfo(a, b, km, clasesSinKm = 0) {
    const clave = `${a.id}-${b.id}`;
    return {
      clave, desde: { practica_id: a.id, fecha: a.fecha, hora_inicio: a.hora, alumno: alumno(a.p.alumno_id), km: a.kf },
      hasta: { practica_id: b.id, fecha: b.fecha, hora_inicio: b.hora, alumno: alumno(b.p.alumno_id), km: b.ki },
      km, clases_aprox: Math.max(1, Math.round(km / med)), clases_sin_km: clasesSinKm,
      sospechoso: km > Math.max(3000, med * 100), revisado: revisados.has(clave)
    };
  }
  const yaTienenHueco = new Set(huecos.map(h => h.clave));
  for (let i = 0; i + 1 < cadena.length; i++) {
    const a = cadena[i], b = cadena[i + 1];
    if (tramos.has(i + 1)) continue;               // hay clases por cuadrar entre las dos: ya tratado arriba
    const km = b.ki - a.kf;
    // Un hueco en el rango de los compañeros sin registrar es suyo (no sale como «sin explicar»)
    const fz = km > TOLERANCIA_HUECO ? fEntre(a, b) : [];
    if (fz.length && km <= fz.reduce((s, c) => s + c.kmMax, 0) * HOLGURA_COMPANEROS + TOLERANCIA_HUECO) {
      const partes = repartirKm(km, fz.map(c => medF(c)), 0);
      fz.forEach((c, j) => anotarFantasma(a, b, c, partes[j], true));
      continue;
    }
    if (km > TOLERANCIA_HUECO) { if (!yaTienenHueco.has(`${a.id}-${b.id}`)) huecos.push(huecoInfo(a, b, km)); }
    else if (km > 0 && opt.cerrarHuecosPequenos && a.estado === 'valida') {
      fila(a, a.ki, b.ki, 'cerrar', `Cierra los ${km} km que quedaban sin asignar con la clase siguiente`);
    }
  }
  // Los huecos con clases por cuadrar que sí se repartieron no son huecos. Los de «faltan clases» ya están.
  // Marca los que no caben/faltan como hueco aunque sean menores al ver el aviso
  const resumen = {
    clases: items.length,
    con_km_fiables: cadena.filter(c => c.estado !== 'abierta').length,
    sin_km: items.filter(it => it.estado === 'sin_km').length,
    incoherentes: items.filter(it => ['rota', 'enorme', 'fuera'].includes(it.estado)).length,
    a_cambiar: cambios.length,
    huecos: huecos.filter(h => !h.revisado).length,
    huecos_revisados: huecos.filter(h => h.revisado).length,
    km_en_huecos: huecos.filter(h => !h.revisado).reduce((s, h) => s + h.km, 0),
    abiertas: items.filter(it => it.estado === 'abierta').length,
    km_tipico_clase: med,
    companeros: companeros.length,
    km_companeros: fantasmas.reduce((s, f) => s + f.km, 0),
    clases_companeros: fantasmas.reduce((s, f) => s + f.clases, 0),
    rehechas: items.filter(it => it.rehacer).length
  };
  // El planning entero del coche tal como quedaría (modo avanzado)
  const finales = new Map(cambios.map(c => [c.practica_id, c]));
  const fantPor = new Map();
  for (const f of fantasmas) { if (!fantPor.has(f.antes_de)) fantPor.set(f.antes_de, []); fantPor.get(f.antes_de).push(f); }
  const planificacion = items.map(it => {
    const c = finales.get(it.id);
    return {
      practica_id: it.id, fecha: it.fecha, hora_inicio: it.hora, alumno_id: it.p.alumno_id, alumno: alumno(it.p.alumno_id),
      antes: { km_inicial: it.ki0, km_final: it.kf0 },
      km_inicial: c ? c.despues.km_inicial : it.ki0, km_final: c ? c.despues.km_final : it.kf0,
      cambia: !!c, tipo: c ? c.tipo : null, estado: it.estado, clases: it.peso,
      fantasmas: fantPor.get(it.id) || []
    };
  });
  return { vehiculo: { id: v.id, nombre: v.nombre, matricula: v.matricula || null }, cambios, huecos, avisos, resumen, errores: [], fantasmas, companeros, planificacion };
}

// ─── encajar a continuación de la clase anterior ────────────────────────────
/**
 * Caso típico: una clase se empezó con un km ANTIGUO (el móvil no sabía aún lo que habían
 * hecho otros teléfonos, o se canceló una clase y otra siguió) y las clases de después se
 * encadenaron desde ahí. Resultado: dos clases «ocupan» los mismos km y todas las siguientes
 * quedan desplazadas.
 *
 * `proponerEncajeKm` coloca la clase elegida a continuación de la clase anterior del coche
 * (su km inicial = el km final de la anterior) y recalcula con el baremo de km por clase las
 * clases que vienen detrás, encadenadas. Solo cambia km: nunca fecha, hora, alumno ni profesor.
 * Se previsualiza y se guarda con aplicarCuadreKm (con vista previa exacta y deshacer).
 *
 * opciones: { kmMin, kmMax, kmInicio, hasta: 'dia' | 'todas', conservarPrimera }
 *   kmInicio  km donde empieza la clase elegida (por defecto, el final de la clase anterior)
 *   hasta     'dia' = solo ese día (por defecto) · 'todas' = también los días siguientes
 *   conservarPrimera  la clase elegida conserva lo que recorrió (por defecto sí)
 */
// Clase con km utilizables como referencia (aunque la cadena fiable la haya dejado fuera)
const claseConKm = it => it.estado === 'valida' || it.estado === 'enorme' || it.estado === 'fuera';

function proponerEncajeKm(vehiculo_id, practica_id, opciones = {}) {
  const vacio = errores => ({ cambios: [], errores, avisos: [], clases: 0, km_total: 0 });
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return vacio(['Vehículo no encontrado']);
  const pid = parseInt(practica_id);
  const opt = { kmMin: 40, kmMax: 45, kmInicio: null, hasta: 'dia', conservarPrimera: true, ...opciones };
  const kmMin = Math.round(Number(opt.kmMin)), kmMax = Math.round(Number(opt.kmMax));
  if (!(kmMin >= 1) || !(kmMax >= kmMin)) return vacio(['El baremo de km por clase no es válido: el máximo no puede ser menor que el mínimo.']);

  const A = analizarCoche(d, vid);
  const { items, lim } = A;
  const pos = items.findIndex(it => it.id === pid);
  if (pos < 0) return vacio(['No se encuentra esa clase en este coche.']);
  const primera = items[pos];
  if (primera.estado === 'abierta') return vacio(['Esa clase está en curso o sin cerrar: ciérrala antes de tocar sus km.']);

  // Clase anterior con km coherentes (la más cercana en el tiempo)
  let previa = null;
  for (let i = pos - 1; i >= 0; i--) {
    const it = items[i];
    if (claseConKm(it) && it.ki0 > 0 && it.kf0 > it.ki0) { previa = it; break; }
  }
  let kmInicio = opt.kmInicio === null || opt.kmInicio === '' || opt.kmInicio === undefined ? null : Math.round(Number(opt.kmInicio));
  if (kmInicio !== null && !(kmInicio > 0)) return vacio(['El km de partida no es válido.']);
  if (kmInicio === null) {
    if (!previa) return vacio(['Esta clase no tiene ninguna anterior con km en este coche: indica el km donde debe empezar.']);
    kmInicio = previa.kf0;
  }

  // Clases que se rehacen: la elegida y las que van detrás (ese día o todas), hasta una clase abierta
  const tramo = [];
  for (let i = pos; i < items.length; i++) {
    const it = items[i];
    if (it.estado === 'abierta') break;
    if (opt.hasta !== 'todas' && it.fecha !== primera.fecha) break;
    tramo.push(it);
  }

  const cambios = [];
  const alumno = id => nombreDe(d.alumnos.find(a => a.id === id));
  let cursor = kmInicio;
  tramo.forEach((it, i) => {
    let km;
    const propios = it.kf0 - it.ki0;
    if (i === 0 && opt.conservarPrimera && claseConKm(it) && it.ki0 > 0 && propios > 0 && propios / it.peso <= lim.max) km = propios;
    else km = Math.max(1, Math.round(Math.round(Math.random() * (kmMax - kmMin) + kmMin) * it.peso));
    const ki = cursor, kf = cursor + km;
    cursor = kf;
    if (ki === it.ki0 && kf === it.kf0) return;
    cambios.push({
      practica_id: it.id, alumno: alumno(it.p.alumno_id), fecha: it.fecha, hora_inicio: it.hora,
      antes: { km_inicial: it.ki0, km_final: it.kf0 }, despues: { km_inicial: ki, km_final: kf },
      tipo: 'encajar',
      motivo: i === 0
        ? `Empieza en el km ${kmInicio}${previa && kmInicio === previa.kf0 ? ', donde terminó la clase anterior' : ''}`
        : 'Sigue a la clase anterior con el baremo de km por clase'
    });
  });

  // ¿Se pasa del km donde empieza la clase conocida que viene después?
  const ultimaPos = pos + tramo.length - 1;
  const avisos = [];
  let siguiente = null;
  for (let i = ultimaPos + 1; i < items.length; i++) {
    const it = items[i];
    if ((claseConKm(it) || it.estado === 'abierta') && it.ki0 > 0) { siguiente = it; break; }
  }
  if (siguiente && cursor > siguiente.ki0) {
    avisos.push({
      tipo: 'pisa_siguiente', km: cursor - siguiente.ki0,
      texto: `Con el baremo, la última clase acabaría en el km ${cursor}, pero la siguiente clase del coche (${alumno(siguiente.p.alumno_id)}, ${fmtFechaLog(siguiente.fecha)}${siguiente.hora ? ' ' + siguiente.hora : ''}) empieza en el km ${siguiente.ki0}: se pisarían ${cursor - siguiente.ki0} km. `
        + (opt.hasta === 'todas' ? 'Revisa esa clase después.' : 'Puedes rehacer también los días siguientes o revisar esa clase después.')
    });
  }

  return {
    vehiculo: { id: v.id, nombre: v.nombre, matricula: v.matricula || null },
    cambios, avisos, errores: [],
    clases: tramo.length, km_total: cursor - kmInicio, km_inicio: kmInicio, km_fin: cursor,
    previa: previa ? { practica_id: previa.id, alumno: alumno(previa.p.alumno_id), fecha: previa.fecha, hora_inicio: previa.hora, km_final: previa.kf0 } : null,
    elegida: { practica_id: primera.id, alumno: alumno(primera.p.alumno_id), fecha: primera.fecha, hora_inicio: primera.hora, km_inicial: primera.ki0, km_final: primera.kf0 }
  };
}

/**
 * Clases que empiezan POR DEBAJO del km donde terminó la clase anterior del coche (en el tiempo):
 * lo habitual cuando una clase se empezó con un km antiguo. Son los candidatos a «Encajar desde aquí».
 * Solo lectura. [{ practica_id, alumno, fecha, hora_inicio, km_inicial, solape, previa:{...} }]
 */
function getEncajesKm(vehiculo_id) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  if (!d.vehiculos.some(x => x.id === vid)) return [];
  const { items } = analizarCoche(d, vid);
  const alumno = id => nombreDe(d.alumnos.find(a => a.id === id));
  const out = [];
  let ant = null;
  for (const it of items) {
    if (!(claseConKm(it) && it.ki0 > 0 && it.kf0 > it.ki0)) continue;
    // Los solapes pequeños los recorta el cuadre normal; aquí solo los que no se arreglan recortando
    if (ant && it.ki0 < ant.kf0 && ant.kf0 - it.ki0 > RECORTE_MAX * Math.min(ant.kf0 - ant.ki0, it.kf0 - it.ki0)) {
      out.push({
        practica_id: it.id, alumno: alumno(it.p.alumno_id), fecha: it.fecha, hora_inicio: it.hora, km_inicial: it.ki0, km_final: it.kf0,
        solape: ant.kf0 - it.ki0,
        previa: { practica_id: ant.id, alumno: alumno(ant.p.alumno_id), fecha: ant.fecha, hora_inicio: ant.hora, km_final: ant.kf0 }
      });
    }
    ant = it;
  }
  return out;
}

/** Últimas clases del coche (para elegir a mano desde cuál encajar). Más recientes primero. */
function getClasesCocheKm(vehiculo_id, limite = 80) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  if (!d.vehiculos.some(x => x.id === vid)) return [];
  const hoy = hoyLocalISO();
  return d.practicas.filter(p => !p.deleted && p.vehiculo_id === vid && !esPracticaEnCurso(p, hoy) && !esPracticaSinCerrar(p, hoy))
    .sort((a, b) => ordenTiempo(b, a)).slice(0, Math.max(1, limite))
    .map(p => ({ practica_id: p.id, alumno: nombreDe(d.alumnos.find(a => a.id === p.alumno_id)), fecha: p.fecha, hora_inicio: p.hora_inicio || null, km_inicial: p.km_inicial || 0, km_final: p.km_final || 0 }));
}

// ─── aplicar / deshacer ─────────────────────────────────────────────────────
/**
 * Guarda EXACTAMENTE los cambios previsualizados. Solo toca las clases que
 * siguen como estaban en la vista previa (protege si algo cambió entre medias).
 * cambios: [{ practica_id, antes:{km_inicial,km_final}, despues:{km_inicial,km_final} }]
 */
function aplicarCuadreKm(vehiculo_id, cambios) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return { aplicados: 0, omitidos: 0, errores: ['Vehículo no encontrado'] };
  if (!Array.isArray(cambios) || !cambios.length) return { aplicados: 0, omitidos: 0, errores: ['No hay nada que aplicar.'] };

  const hechos = [];
  let omitidos = 0;
  for (const c of cambios) {
    const p = d.practicas.find(x => x.id === c.practica_id && x.vehiculo_id === vid && !x.deleted);
    const ki = Math.round(Number(c.despues && c.despues.km_inicial)), kf = Math.round(Number(c.despues && c.despues.km_final));
    const vacia = c.tipo === 'vaciar' && ki === 0 && kf === 0;
    if (!p || !c.antes || p.km_inicial !== c.antes.km_inicial || p.km_final !== c.antes.km_final || (!vacia && (!(ki > 0) || !(kf > ki)))) { omitidos++; continue; }
    hechos.push({ p, tipo: c.tipo, antes: { km_inicial: p.km_inicial, km_final: p.km_final }, despues: { km_inicial: ki, km_final: kf }, alumno_id: p.alumno_id, fecha: p.fecha });
  }
  if (!hechos.length) return { aplicados: 0, omitidos, errores: ['Las clases ya no están como en la vista previa. Vuelve a calcular el cuadre.'] };

  const s = _sync();
  for (const h of hechos) {
    h.p.km_inicial = h.despues.km_inicial;
    h.p.km_final = h.despues.km_final;
    // Los km repartidos son una estimación: sin otra marca, se señalan como calculados
    // (así, si luego llega una lectura real que choca, es la estimada la que cede).
    if (!h.p.tipo_detalle && h.tipo !== 'recorte' && h.tipo !== 'vaciar') { h.p.tipo_detalle = 'km_auto'; h.marcada = true; }
  }
  if (s) s.markDirtyVarios('practicas', hechos.map(h => h.p.id));
  const maxKm = Math.max(v.km_actual || 0, ...d.practicas.filter(p => p.vehiculo_id === vid && !p.deleted).map(p => p.km_final || 0));
  if (maxKm !== v.km_actual) { v.km_actual = maxKm; if (s) s.markDirty('vehiculos', vid); }

  const id = Date.now();
  if (!d.cuadres_km) d.cuadres_km = [];
  d.cuadres_km.unshift({
    id, fecha: new Date().toISOString(), vehiculo_id: vid, vehiculo: v.nombre,
    cambios: hechos.map(h => ({ practica_id: h.p.id, antes: h.antes, despues: h.despues, marcada: !!h.marcada }))
  });
  d.cuadres_km = d.cuadres_km.slice(0, MAX_CUADRES);
  addLog('correccion', `Cuadrar km ${v.nombre}: ${hechos.length} clase(s) ajustadas`, hechos.slice(0, 200).map(h => {
    const a = d.alumnos.find(x => x.id === h.alumno_id);
    return `${a ? a.nombre : '?'} / ${fmtFechaLog(h.fecha)}: ${h.antes.km_inicial}→${h.antes.km_final}  ➜  ${h.despues.km_inicial}→${h.despues.km_final} km`;
  }));
  save();
  return { aplicados: hechos.length, omitidos, errores: [], cuadre_id: id };
}

/**
 * Quita los km de UNA clase (se queda sin km, con su fecha, hora, alumno y profesor). Sirve cuando
 * una lectura está mal (p. ej. un km traído del otro programa que es de otro coche) y descuadra el
 * cuentakilómetros: sin ella, «Cuadrar» puede repartir las clases de alrededor. Queda registrado
 * como un cuadre, así que «Deshacer el último cuadre» devuelve los km.
 */
function quitarKmClase(practica_id) {
  const d = load();
  const p = d.practicas.find(x => x.id === parseInt(practica_id) && !x.deleted);
  if (!p) return { quitados: 0, errores: ['No se encuentra la clase.'] };
  if (!(p.km_inicial > 0) && !(p.km_final > 0)) return { quitados: 0, errores: ['Esa clase ya está sin km.'] };
  const hoy = hoyLocalISO();
  if (esPracticaEnCurso(p, hoy) || esPracticaSinCerrar(p, hoy)) return { quitados: 0, errores: ['Esa clase está en curso o sin cerrar: ciérrala antes de tocar sus km.'] };
  const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
  const a = d.alumnos.find(x => x.id === p.alumno_id);
  const antes = { km_inicial: p.km_inicial, km_final: p.km_final };
  p.km_inicial = 0; p.km_final = 0;
  const s = _sync(); if (s) s.markDirty('practicas', p.id);
  const id = Date.now();
  if (!d.cuadres_km) d.cuadres_km = [];
  d.cuadres_km.unshift({ id, fecha: new Date().toISOString(), vehiculo_id: p.vehiculo_id, vehiculo: v ? v.nombre : '?',
    cambios: [{ practica_id: p.id, antes, despues: { km_inicial: 0, km_final: 0 }, marcada: false }] });
  d.cuadres_km = d.cuadres_km.slice(0, MAX_CUADRES);
  addLog('correccion', `Quitar km ${v ? v.nombre : '?'}: ${a ? a.nombre : '?'} / ${fmtFechaLog(p.fecha)}`, [`${antes.km_inicial}→${antes.km_final}  ➜  sin km`]);
  save();
  return { quitados: 1, errores: [], cuadre_id: id };
}

function getCuadresKm() {
  return (load().cuadres_km || []).map(c => ({ id: c.id, fecha: c.fecha, vehiculo_id: c.vehiculo_id, vehiculo: c.vehiculo, clases: c.cambios.length }));
}

function deshacerCuadreKm(id) {
  const d = load();
  const lista = d.cuadres_km || [];
  const reg = id == null ? lista[0] : lista.find(c => c.id === id);
  if (!reg) return { deshechos: 0, omitidos: 0, errores: ['No hay ningún cuadre que deshacer.'] };
  const s = _sync();
  const tocados = [];
  let omitidos = 0;
  for (const c of reg.cambios) {
    const p = d.practicas.find(x => x.id === c.practica_id && !x.deleted);
    // solo si la clase sigue como la dejó el cuadre (si alguien la tocó después, se respeta)
    if (!p || p.km_inicial !== c.despues.km_inicial || p.km_final !== c.despues.km_final) { omitidos++; continue; }
    p.km_inicial = c.antes.km_inicial; p.km_final = c.antes.km_final;
    if (c.marcada && p.tipo_detalle === 'km_auto') delete p.tipo_detalle;
    tocados.push(p.id);
  }
  if (s && tocados.length) s.markDirtyVarios('practicas', tocados);
  // Las clases que creó una inserción con «desplazar las siguientes» también se quitan (si siguen como las dejó)
  const quitadas = [];
  for (const c of reg.creadas || []) {
    const p = d.practicas.find(x => x.id === c.id && !x.deleted);
    if (p && p.km_inicial === c.km_inicial && p.km_final === c.km_final) quitadas.push(p.id);
  }
  if (quitadas.length) {
    d.practicas = d.practicas.filter(p => !quitadas.includes(p.id));
    if (s) s.markDeletedVarios('practicas', quitadas);
  }
  d.cuadres_km = lista.filter(c => c !== reg);
  addLog('correccion', `Cuadrar km ${reg.vehiculo}: deshecho (${tocados.length} clase(s) devueltas a como estaban${quitadas.length ? `, ${quitadas.length} clase(s) nuevas quitadas` : ''})`, []);
  save();
  return { deshechos: tocados.length, quitadas: quitadas.length, omitidos, errores: [] };
}

// ─── huecos revisados ───────────────────────────────────────────────────────
function getRevisados() {
  const v = getAjusteEmpresa('huecos_km_revisados');
  return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
}

/** Da por revisado (o vuelve a abrir) un hueco: «es otro uso del coche, no un error». */
function marcarHuecoRevisado(clave, revisado = true) {
  if (typeof clave !== 'string' || !/^\d+-\d+$/.test(clave)) return getRevisados();
  const set = new Set(getRevisados());
  if (revisado) set.add(clave); else set.delete(clave);
  const lista = [...set].slice(-MAX_REVISADOS);
  setAjusteEmpresa('huecos_km_revisados', lista);
  return lista;
}

// ─── continuidad para la lista de Prácticas ─────────────────────────────────
/**
 * Para cada clase viva: con qué clase anterior del mismo coche enlaza (la
 * anterior de la cadena fiable) o por qué sus km no son coherentes. Así una
 * clase con km rotos se señala a sí misma en vez de culpar a la siguiente.
 * Devuelve Map(id → { previa: práctica | null, incoherente: texto | null }).
 */
function mapaContinuidad(d, hoy = hoyLocalISO()) {
  const salida = new Map();
  const ids = new Set();
  for (const p of d.practicas) if (!p.deleted) ids.add(p.vehiculo_id);
  for (const vid of ids) {
    const A = analizarCoche(d, vid, hoy);
    let ultima = null;
    for (const it of A.items) {
      if (it.estado === 'sin_km') salida.set(it.id, { previa: null, incoherente: null });
      else if (it.estado === 'abierta') salida.set(it.id, { previa: it.ki > 0 && it.p.fecha === hoy ? ultima : null, incoherente: null });
      else if (it.estado === 'valida' && it.enCadena) { salida.set(it.id, { previa: ultima, incoherente: null }); ultima = it.p; }
      else salida.set(it.id, { previa: null, incoherente: it.motivo || 'km incoherentes' });
    }
  }
  return salida;
}

// ─── diagnóstico de todos los coches ────────────────────────────────────────
/**
 * Resumen por coche para avisar (Prácticas, Kilómetros): cuántas clases sin km,
 * incoherentes y huecos de verdad (sin los revisados ni los pequeños).
 */
function getResumenCuadreKm() {
  const d = load();
  const out = [];
  for (const v of d.vehiculos) {
    if (v.deleted) continue;
    if (!d.practicas.some(p => !p.deleted && p.vehiculo_id === v.id)) continue;
    const r = proponerCuadreKm(v.id);
    const res = r.resumen;
    const problemas = res.a_cambiar + res.huecos;
    out.push({
      vehiculo_id: v.id, nombre: v.nombre, matricula: v.matricula || null, activo: v.activo !== false,
      clases: res.clases, sin_km: res.sin_km, incoherentes: res.incoherentes,
      huecos: res.huecos, km_en_huecos: res.km_en_huecos, a_cambiar: res.a_cambiar, problemas
    });
  }
  return out;
}

module.exports = {
  proponerCuadreKm, aplicarCuadreKm, deshacerCuadreKm, getCuadresKm, quitarKmClase,
  proponerEncajeKm, getEncajesKm, getClasesCocheKm,
  marcarHuecoRevisado, getHuecosRevisados: getRevisados, getResumenCuadreKm,
  mapaContinuidad, TOLERANCIA_HUECO,
  getCompanerosKm, setCompanerosKm, huecoDeCompaneros, normalizarCompanero,
  _analizarCoche: analizarCoche, _repartirKm: repartirKm,
  _ordenTiempo: ordenTiempo, _kmTipicoVariado: kmTipicoVariado, _confianza: confianza,
};
