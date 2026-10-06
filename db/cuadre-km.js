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
 *
 * Todo se PREVISUALIZA (proponerCuadreKm) y se guarda EXACTAMENTE lo mostrado
 * (aplicarCuadreKm), con registro para poder deshacerlo (deshacerCuadreKm).
 * Las claves de huecos revisados viajan en ajustes_empresa (sincronizan solas).
 */

const { load, save, addLog, _sync, hoyLocalISO, esPracticaEnCurso, esPracticaSinCerrar, clasesDePractica, fmtFechaLog } = require('./core');
const { getAjusteEmpresa, setAjusteEmpresa } = require('./ajustes-empresa');

const TOLERANCIA_HUECO = 15;     // km entre dos clases que son «normales» (el coche vuelve a la autoescuela, etc.)
const MAX_CUADRES = 20;          // registros de cuadres guardados para deshacer
const MAX_REVISADOS = 400;       // huecos dados por revisados que se recuerdan
const KM_CLASE_DEFECTO = 24;     // km de una clase si aún no hay datos con los que medirlo
const RECORTE_MAX = 0.4;         // un solape solo se recorta si quita como mucho el 40 % de los km de la clase

// ─── utilidades ─────────────────────────────────────────────────────────────
const sinKm = p => !(p.km_inicial > 0) && !(p.km_final > 0);
const ordenTiempo = (a, b) => (a.fecha || '').localeCompare(b.fecha || '') ||
  (a.hora_inicio || '99:99').localeCompare(b.hora_inicio || '99:99') || a.id - b.id;
const nombreDe = a => a ? [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ') : '?';
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
function analizarCoche(d, vid, hoy = hoyLocalISO()) {
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

// ─── propuesta ──────────────────────────────────────────────────────────────
/**
 * Calcula (sin guardar) cómo dejar el coche cuadrado.
 * opciones: { rellenarAntes, rellenarDespues, cerrarHuecosPequenos, rellenarHuecosGrandes }
 * Devuelve { cambios, huecos, avisos, resumen, vehiculo }.
 */
function proponerCuadreKm(vehiculo_id, opciones = {}) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return { cambios: [], huecos: [], avisos: [], errores: ['Vehículo no encontrado'], resumen: {} };
  const opt = { rellenarAntes: false, rellenarDespues: false, cerrarHuecosPequenos: false, rellenarHuecosGrandes: false, ...opciones };
  const A = analizarCoche(d, vid);
  const { med, lim, items, cadena } = A;
  const alumno = id => nombreDe(d.alumnos.find(a => a.id === id));
  const revisados = new Set(getRevisados());

  const cambios = [];     // { practica_id, antes, despues, motivo, tipo }
  const huecos = [];      // huecos que quedan entre clases conocidas
  const avisos = [];      // cosas que no se pueden arreglar solas
  const cambiada = new Set();
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
            const km = Math.max(1, Math.round(med * it.peso));
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
          const km = Math.max(1, Math.round(med * it.peso));
          if (cursor - km < 0) { avisos.push({ tipo: 'sin_sitio', texto: 'Hay más clases anteriores que km hacia atrás: el cuentakilómetros bajaría de 0.' }); break; }
          fila(it, cursor - km, cursor, tipoPara(it), motivoPara(it, 'Antes de la primera clase con km conocidos, hacia atrás'));
          cursor -= km;
        }
      }
      const pendientes = lista.length - aTratar.length;
      if (pendientes > 0) avisos.push({ tipo: 'sin_km_antes', clases: pendientes, texto: `${pendientes} clase(s) sin km anteriores a la primera con km conocidos.` });
    } else if (antes && !despues) {
      // DESPUÉS de la última conocida: hacia delante
      const rotas = lista.filter(it => it.estado !== 'sin_km');
      const aTratar = opt.rellenarDespues ? lista : rotas;
      let cursor = antes.kf;
      for (const it of aTratar) {
        const km = Math.max(1, Math.round(med * it.peso));
        fila(it, cursor, cursor + km, tipoPara(it), motivoPara(it, 'A continuación de la última clase con km conocidos'));
        cursor += km;
      }
      const pendientes = lista.length - aTratar.length;
      if (pendientes > 0) avisos.push({ tipo: 'sin_km_despues', clases: pendientes, texto: `${pendientes} clase(s) sin km posteriores a la última con km conocidos.` });
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
    km_tipico_clase: med
  };
  return { vehiculo: { id: v.id, nombre: v.nombre, matricula: v.matricula || null }, cambios, huecos, avisos, resumen, errores: [] };
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
  d.cuadres_km = lista.filter(c => c !== reg);
  addLog('correccion', `Cuadrar km ${reg.vehiculo}: deshecho (${tocados.length} clase(s) devueltas a como estaban)`, []);
  save();
  return { deshechos: tocados.length, omitidos, errores: [] };
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
  proponerCuadreKm, aplicarCuadreKm, deshacerCuadreKm, getCuadresKm,
  marcarHuecoRevisado, getHuecosRevisados: getRevisados, getResumenCuadreKm,
  mapaContinuidad, TOLERANCIA_HUECO,
  _analizarCoche: analizarCoche, _repartirKm: repartirKm,
};
