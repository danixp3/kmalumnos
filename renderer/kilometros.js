// ─── KILÓMETROS ──────────────────────────────────────────────────────────────
// Una sola pantalla para analizar y generar los km de un coche (antes había que
// elegir entre Cuadrar, Encadenado, Hasta un máximo, Por rango, Conflictos…):
//
//  · ASISTENTE: mira el coche y propone LO MÁS LÓGICO (db/plan-km.js:
//    recomendarPlanKm) con el motivo. Ese plan son pasos que se pueden quitar,
//    reordenar, cambiar y COMBINAR con cualquiera de las otras opciones
//    («Otras formas de hacerlo»). Cada cambio recalcula UNA vista previa de todo
//    junto (proponerPlanKm, sin guardar nada); «Aplicar» guarda exactamente lo
//    mostrado en un solo registro que se puede deshacer.
//  · MAPA DEL VEHÍCULO (renderer/timeline.js) y SOLAPES (solapamientos.js).
//
// «Ocultar huecos»: esconde los tramos de km sin explicar (no avisa de ellos y en
// el mapa junta las clases sin el espacio vacío de en medio).

const KM_OCULTAR_KEY = 'km_ocultar_huecos';
let kmVehiculoPreferido = null;   // coche que debe quedar elegido al llegar (desde un aviso)
let kmPasoInicial = null;         // paso que se añade al plan al llegar (p. ej. encajar una clase concreta)
const KM = { tab: 'asistente', rec: null, plan: [], planDe: null, vista: null, turno: 0, turnoVista: 0, temporizador: null, clases: [], hechos: [], seq: 1, mensaje: '' };

function kmOcultarHuecos() {
  try { return localStorage.getItem(KM_OCULTAR_KEY) === '1'; } catch (e) { return false; }
}
function kmOcultarHuecosCambiar(v) {
  try { localStorage.setItem(KM_OCULTAR_KEY, v ? '1' : '0'); } catch (e) {}
  kmSincronizarSwitch();
  if (typeof cuadreAvisoPracticas === 'function') cuadreAvisoPracticas();
  kmChips();
  kmRefrescarTab();
}
function kmSincronizarSwitch() {
  const sw = document.getElementById('km-ocultar-huecos');
  if (sw) sw.checked = kmOcultarHuecos();
}

function kmVid() { return parseInt(document.getElementById('km-vehiculo')?.value) || 0; }

// ─── NAVEGACIÓN ENTRE PESTAÑAS ───────────────────────────────────────────────
function cambiarTabKilometros(tab) {
  if (tab === 'generar' || tab === 'cuadrar' || tab === 'encadenado' || tab === 'maximo' || tab === 'rango') tab = 'asistente';
  KM.tab = tab;
  document.querySelectorAll('#page-kilometros .page-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#page-kilometros .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-kilometros-' + tab));
  kmSincronizarSwitch();
  kmCargarVehiculos().then(() => { kmChips(); return kmRefrescarTab(); });
}

async function kmCargarVehiculos() {
  const vehiculos = await window.api.getVehiculos(getSucursalActual());
  const sel = document.getElementById('km-vehiculo');
  if (!sel) return;
  const previo = kmVehiculoPreferido != null ? String(kmVehiculoPreferido) : sel.value;
  kmVehiculoPreferido = null;
  sel.innerHTML = vehiculos.length
    ? vehiculos.map(v => `<option value="${v.id}">${esc(v.nombre)}${v.matricula ? ' (' + esc(v.matricula) + ')' : ''}${v.activo === false ? ' · retirado' : ''}</option>`).join('')
    : '<option value="">Sin vehículos</option>';
  if (previo && vehiculos.some(v => String(v.id) === previo)) sel.value = previo;
}

async function kmRefrescarTab() {
  if (KM.tab === 'asistente') await kmCargar();
  else if (KM.tab === 'mapa') await loadTimeline();
  else if (KM.tab === 'conflictos') { aplicarRangoPref('solap-min', 'solap-max'); loadSolapamientos(); }
}

// Otra pantalla ha cambiado clases: se vuelve a pintar lo que se ve
function kmRecargar() { KM.planDe = null; kmRefrescarTab(); }

function kmCambioVehiculo() {
  KM.planDe = null; KM.vista = null;
  kmRefrescarTab();
}

function kmAnadirClase() {
  abrirEditorClase({ vehiculo_id: kmVid() || null, alTerminar: () => kmRecargar() });
}

// Llegada desde un aviso (Panel, Prácticas, Vehículos…): el coche ya elegido y, si se pide, un paso por delante
function cuadreIrA(vid, practicaId) {
  kmVehiculoPreferido = vid;
  kmPasoInicial = practicaId ? { tipo: 'encajar', practica_id: practicaId } : null;
  KM.planDe = null;
  navegarA('kilometros', 'asistente');
}

// ─── CABECERA: CHIPS DEL COCHE ───────────────────────────────────────────────
function kmChips() {
  const el = document.getElementById('km-chips');
  if (!el) return;
  const e = KM.rec && KM.rec.estado;
  if (!e || !kmVid()) { el.innerHTML = ''; return; }
  const chip = (n, txt, aviso) => `<div class="cuadre-chip${aviso && n ? ' aviso' : ''}"><b>${fmtMiles(n)}</b><span>${txt}</span></div>`;
  el.innerHTML = chip(e.clases, 'clases') + chip(e.sin_km, 'sin km', true) + chip(e.incoherentes, 'no encajan', true) + chip(e.solapes, e.solapes === 1 ? 'solape' : 'solapes', true) +
    (kmOcultarHuecos() ? '' : chip(e.huecos, e.huecos === 1 ? 'hueco' : 'huecos', true));
}

// ─── PASOS DEL PLAN ──────────────────────────────────────────────────────────
const KM_PASOS = {
  cuadrar:   { titulo: 'Cuadrar', desc: 'Ordena las clases por fecha y hora, arregla los km imposibles y reparte los huecos entre las clases sin km.' },
  encajar:   { titulo: 'Encajar a continuación de la anterior', desc: 'Una clase que empezó con un km antiguo pasa a empezar donde terminó la anterior y las siguientes se recalculan con el baremo.' },
  quitar:    { titulo: 'Quitar los km de una clase', desc: 'Para una lectura equivocada que descuadra el coche: la clase se queda sin km y se reparten los de alrededor.' },
  encadenar: { titulo: 'Encadenar desde el cuentakilómetros', desc: 'Las clases sin km se rellenan hacia delante desde el odómetro del coche (o desde el km que indiques).' },
  maximo:    { titulo: 'Generar hacia atrás hasta un km máximo', desc: 'La clase en blanco más reciente acaba en el km que indiques y las anteriores se calculan restando.' },
  rango:     { titulo: 'Repartir entre dos km', desc: 'Las clases en blanco ocupan el tramo entre un km y otro, con una pequeña variación.' },
  solapes:   { titulo: 'Corregir los solapes', desc: 'Si dos clases ocupan los mismos km, la segunda se desplaza a continuación de la primera.' }
};
const KM_UNICOS = ['cuadrar', 'encadenar', 'maximo', 'rango', 'solapes'];

function kmNuevoPaso(base) {
  const rango = getRangoPref();
  const defecto = {
    cuadrar: { opciones: { rellenarAntes: false, rellenarDespues: false, cerrarHuecosPequenos: false, rellenarHuecosGrandes: false } },
    encajar: { practica_id: (KM.clases[0] || {}).practica_id || null, opciones: { kmMin: rango.min, kmMax: rango.max, hasta: 'dia', conservarPrimera: true, kmInicio: null } },
    quitar: { practica_id: (KM.clases[0] || {}).practica_id || null },
    encadenar: { kmMin: rango.min, kmMax: rango.max, kmInicio: null, kmFinal: null },
    maximo: { kmMin: rango.min, kmMax: rango.max, kmMaximo: null },
    rango: { kmDesde: null, kmHasta: null, variacion: 5 },
    solapes: { kmMin: rango.min, kmMax: rango.max }
  }[base.tipo] || {};
  return { uid: KM.seq++, activo: true, ...defecto, ...base };
}

function kmPasosActivos() {
  return KM.plan.filter(p => p.activo).map(p => { const { uid, activo, ...resto } = p; return JSON.parse(JSON.stringify(resto)); });
}

// ─── CARGA Y PINTADO ─────────────────────────────────────────────────────────
async function kmCargar(mensaje) {
  const el = document.getElementById('km-asistente');
  if (!el) return;
  const vid = kmVid();
  if (!vid) { el.innerHTML = '<div class="card"><p class="empty">Elige un vehículo…</p></div>'; KM.rec = null; kmChips(); return; }
  const turno = ++KM.turno;
  const [rec, hechos, clases] = await Promise.all([window.api.recomendarPlanKm(vid), window.api.getCuadresKm(), window.api.getClasesCocheKm(vid, 120)]);
  if (turno !== KM.turno || vid !== kmVid()) return;   // se cambió de coche mientras se calculaba
  if (rec.errores && rec.errores.length) { el.innerHTML = `<div class="alert alert-err">${esc(rec.errores.join(' '))}</div>`; return; }
  KM.rec = rec; KM.clases = clases || []; KM.hechos = hechos || []; KM.mensaje = mensaje || '';
  if (KM.planDe !== vid) {
    KM.plan = (rec.recomendado ? rec.recomendado.pasos : []).map(p => kmNuevoPaso(p));
    KM.planDe = vid;
    if (kmPasoInicial) {
      // Un paso pedido desde otra pantalla va el primero (y se quita uno igual del plan recomendado)
      KM.plan = KM.plan.filter(p => !(p.tipo === kmPasoInicial.tipo && p.practica_id === kmPasoInicial.practica_id));
      KM.plan.unshift(kmNuevoPaso(kmPasoInicial));
      kmPasoInicial = null;
    }
  }
  kmChips();
  kmPintar();
  kmCalcular();
}

function kmPintar() {
  const el = document.getElementById('km-asistente');
  const R = KM.rec;
  if (!el || !R) return;
  const e = R.estado;
  const oculta = kmOcultarHuecos();
  let html = KM.mensaje ? `<div class="alert alert-ok" style="margin-bottom:14px">${KM.mensaje}</div>` : '';

  // ── 1. Qué he visto ──
  const sinProblema = R.nada;
  html += `<div class="card km-recom${sinProblema ? ' km-ok' : ''}">
    <div class="km-recom-cab">
      <span class="km-recom-sello">${sinProblema ? '✓' : '✦'}</span>
      <div style="flex:1;min-width:0">
        <div class="km-recom-etq">${sinProblema ? 'Todo en orden' : 'Lo más lógico ahora'}</div>
        <h3 class="km-recom-tit">${esc(sinProblema ? (e.huecos > 0 && !oculta ? 'Las clases con km encajan; solo quedan tramos sin explicar' : 'El cuentakilómetros de este coche está cuadrado') : R.recomendado.titulo)}</h3>
        ${sinProblema ? '<p class="km-recom-motivo">Las clases con km siguen un orden coherente. Si hace falta, abajo tienes otras formas de generar o corregir km.</p>' : `<p class="km-recom-motivo">${esc(R.recomendado.motivo)}</p>`}
      </div>
    </div>
    ${R.opcionales.length ? `<div class="km-opcionales">${R.opcionales.map(o => `<label title="${esc(o.detalle)}"><input type="checkbox" ${kmOpcionalActivo(o.clave) ? 'checked' : ''} onchange="kmOpcional('${o.clave}', this.checked)"><span>${esc(o.titulo)}</span></label>`).join('')}</div>` : ''}
    ${R.consejos.filter(() => !oculta).map(c => `<p class="km-consejo">${esc(c)}</p>`).join('')}
    ${R.avisos.length ? R.avisos.map(a => `<p class="km-consejo">${esc(a)}</p>`).join('') : ''}
  </div>`;

  // ── 2. El plan: pasos combinables ──
  html += `<div class="card km-plan-card">
    <div class="card-title">Plan · ${KM.plan.filter(p => p.activo).length === 1 ? '1 paso' : KM.plan.filter(p => p.activo).length + ' pasos'}</div>
    <p class="cuadre-nota">Los pasos se hacen <b>por orden</b>, cada uno sobre lo que dejó el anterior. Puedes quitarlos, cambiarlos, reordenarlos o añadir otros de «Otras formas de hacerlo».</p>
    <div id="km-pasos">${KM.plan.length ? KM.plan.map((p, i) => kmPasoHTML(p, i)).join('') : '<p class="km-vacio">El plan está vacío. Añade un paso de abajo.</p>'}</div>
    <div id="km-vista" class="km-vista"></div>
  </div>`;

  // ── 3. Otras formas de hacerlo ──
  html += `<div class="card">
    <div class="card-title">Otras formas de hacerlo</div>
    <p class="cuadre-nota">Cada una se <b>añade al plan</b> y se combina con las demás: por ejemplo, quitar una lectura mal y luego cuadrar el resto.</p>
    <div class="km-otras">${Object.keys(KM_PASOS).map(t => {
      const hay = KM_UNICOS.includes(t) && KM.plan.some(p => p.tipo === t);
      return `<div class="km-otra"><div class="km-otra-tit">${esc(KM_PASOS[t].titulo)}</div><div class="km-otra-desc">${esc(KM_PASOS[t].desc)}</div>
        <button class="btn btn-outline btn-sm" onclick="kmAnadirPaso('${t}')" ${hay ? 'disabled' : ''}>${hay ? 'Ya está en el plan' : '+ Añadir al plan'}</button></div>`;
    }).join('')}
      <div class="km-otra"><div class="km-otra-tit">Compañeros sin registrar</div><div class="km-otra-desc">Modo avanzado: planning entero del coche y alumnos que también lo usaban y no están en la app.</div>
        <button class="btn btn-outline btn-sm" onclick="abrirCuadreAvanzado()">Abrir el modo avanzado</button></div>
    </div>
  </div>`;

  // ── 4. Tramos sin explicar ──
  const abiertos = (R.huecos || []).filter(h => !h.revisado), cerrados = (R.huecos || []).filter(h => h.revisado);
  if (oculta) {
    if (abiertos.length) html += `<p class="km-huecos-ocultos">${abiertos.length} ${abiertos.length === 1 ? 'tramo sin explicar oculto' : 'tramos sin explicar ocultos'} (${fmtMiles(abiertos.reduce((s, h) => s + h.km, 0))} km) · <a href="#" onclick="kmOcultarHuecosCambiar(false);document.getElementById('km-ocultar-huecos').checked=false;return false">Mostrarlos</a></p>`;
  } else {
    if (abiertos.length) {
      html += `<div class="card"><div class="card-title">Tramos sin explicar · ${abiertos.length}</div>
        <p class="cuadre-nota">Son kilómetros que el coche hizo y que no corresponden a ninguna clase de la app: <b>faltan clases por traer o anotar</b> (usa «+ Añadir clase»: se coloca sola) o fueron otro uso del coche. No se inventan clases. Si es otro uso, márcalo como revisado y deja de avisar.</p>
        ${abiertos.map(h => cuadreHuecoHTML(h, false)).join('')}</div>`;
    }
    if (cerrados.length) html += `<div class="card"><div class="card-title">Revisados (${cerrados.length})</div>${cerrados.map(h => cuadreHuecoHTML(h, true)).join('')}</div>`;
  }

  // ── 5. Deshacer ──
  const ultimo = KM.hechos.find(c => c.vehiculo_id === kmVid());
  if (ultimo) {
    html += `<div class="card"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="flex:1;min-width:220px;font-size:13px;color:var(--text-muted)">Último cambio de km de este coche: ${new Date(ultimo.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })} · ${ultimo.clases} ${ultimo.clases === 1 ? 'clase' : 'clases'}.</span>
      <button class="btn btn-outline btn-sm" onclick="kmDeshacer(${ultimo.id})">Deshacer el último cambio</button></div></div>`;
  }
  el.innerHTML = html;
}

function kmOpcionalActivo(clave) {
  const c = KM.plan.find(p => p.tipo === 'cuadrar');
  if (!c) return false;
  return clave === 'rellenar_antes' ? !!c.opciones.rellenarAntes : !!c.opciones.rellenarHuecosGrandes;
}
function kmOpcional(clave, v) {
  let c = KM.plan.find(p => p.tipo === 'cuadrar');
  if (!c) { c = kmNuevoPaso({ tipo: 'cuadrar' }); KM.plan.unshift(c); }
  if (clave === 'rellenar_antes') c.opciones.rellenarAntes = !!v; else c.opciones.rellenarHuecosGrandes = !!v;
  c.activo = true;
  kmPintar(); kmCalcular();
}

// ─── UN PASO ─────────────────────────────────────────────────────────────────
const kmNum = v => (v === null || v === undefined || v === '' ? '' : String(v));
function kmOpcionesClases(sel) {
  return KM.clases.map(c => `<option value="${c.practica_id}"${c.practica_id === sel ? ' selected' : ''}>${fmtFecha(c.fecha)}${c.hora_inicio ? ' ' + esc(c.hora_inicio) : ''} · ${esc(c.alumno)} · ${c.km_final > 0 ? fmtMiles(c.km_inicial) + ' → ' + fmtMiles(c.km_final) : 'sin km'}</option>`).join('') || '<option value="">Este coche no tiene clases</option>';
}
function kmCampo(i, etq, clave, valor, extra = '', sub = null) {
  const ref = sub ? `'${sub}','${clave}'` : `null,'${clave}'`;
  return `<div class="form-group"><label>${etq}</label><input type="number" value="${esc(kmNum(valor))}" ${extra} oninput="kmParam(${i}, ${ref}, this.value)"></div>`;
}
function kmPasoHTML(p, i) {
  const n = KM.plan.length;
  const d = KM_PASOS[p.tipo];
  let cuerpo = '';
  if (p.tipo === 'cuadrar') {
    const o = p.opciones;
    const cb = (clave, txt) => `<label><input type="checkbox" ${o[clave] ? 'checked' : ''} onchange="kmParam(${i}, 'opciones', '${clave}', this.checked)"><span>${txt}</span></label>`;
    cuerpo = `<div class="cuadre-opciones">${cb('rellenarAntes', 'Rellenar también las clases sin km <b>anteriores</b> a la primera con km conocidos (hacia atrás)')}${cb('rellenarDespues', 'Rellenar también las clases sin km <b>posteriores</b> a la última con km conocidos (hacia delante)')}${cb('cerrarHuecosPequenos', `Cerrar los huecos pequeños (hasta ${TOLERANCIA_HUECO_UI} km) alargando la clase anterior`)}${cb('rellenarHuecosGrandes', 'Poner km típicos a las clases sin km aunque sobren muchos km (faltan clases en medio)')}</div>`;
  } else if (p.tipo === 'encajar') {
    const o = p.opciones;
    cuerpo = `<div class="km-campos">
      <div class="form-group km-ancho"><label>Primera clase mal</label><select onchange="kmParam(${i}, null, 'practica_id', parseInt(this.value))">${kmOpcionesClases(p.practica_id)}</select></div>
      ${kmCampo(i, 'Empieza en el km (vacío = donde acabó la anterior)', 'kmInicio', o.kmInicio, 'min="1"', 'opciones')}
      ${kmCampo(i, 'Km por clase · mín', 'kmMin', o.kmMin, 'min="1" max="999"', 'opciones')}
      ${kmCampo(i, 'máx', 'kmMax', o.kmMax, 'min="1" max="999"', 'opciones')}
      <div class="form-group"><label>Rehacer</label><select onchange="kmParam(${i}, 'opciones', 'hasta', this.value)"><option value="dia"${o.hasta === 'dia' ? ' selected' : ''}>Solo ese día</option><option value="todas"${o.hasta === 'todas' ? ' selected' : ''}>Ese día y los siguientes</option></select></div>
    </div><label class="km-chk"><input type="checkbox" ${o.conservarPrimera ? 'checked' : ''} onchange="kmParam(${i}, 'opciones', 'conservarPrimera', this.checked)"><span>La clase elegida conserva los km que recorrió; solo cambia dónde empieza</span></label>`;
  } else if (p.tipo === 'quitar') {
    cuerpo = `<div class="km-campos"><div class="form-group km-ancho"><label>Clase</label><select onchange="kmParam(${i}, null, 'practica_id', parseInt(this.value))">${kmOpcionesClases(p.practica_id)}</select></div></div>`;
  } else if (p.tipo === 'encadenar') {
    cuerpo = `<div class="km-campos">${kmCampo(i, 'Km por clase · mín', 'kmMin', p.kmMin, 'min="1" max="999"')}${kmCampo(i, 'máx', 'kmMax', p.kmMax, 'min="1" max="999"')}${kmCampo(i, 'Desde el km (vacío = el del coche)', 'kmInicio', p.kmInicio, 'min="0"')}${kmCampo(i, 'Hasta el km (vacío = sin tope)', 'kmFinal', p.kmFinal, 'min="0"')}</div>`;
  } else if (p.tipo === 'maximo') {
    cuerpo = `<div class="km-campos">${kmCampo(i, 'Km máximo (donde acaba el cuentakilómetros)', 'kmMaximo', p.kmMaximo, 'min="1" placeholder="Ej. 189000"')}${kmCampo(i, 'Km por clase · mín', 'kmMin', p.kmMin, 'min="1" max="999"')}${kmCampo(i, 'máx', 'kmMax', p.kmMax, 'min="1" max="999"')}</div>`;
  } else if (p.tipo === 'rango') {
    cuerpo = `<div class="km-campos">${kmCampo(i, 'Desde el km', 'kmDesde', p.kmDesde, 'min="0"')}${kmCampo(i, 'Hasta el km', 'kmHasta', p.kmHasta, 'min="0"')}${kmCampo(i, 'Variación ± km', 'variacion', p.variacion, 'min="0" max="999"')}</div>`;
  } else if (p.tipo === 'solapes') {
    cuerpo = `<div class="km-campos">${kmCampo(i, 'Km por clase en blanco · mín', 'kmMin', p.kmMin, 'min="1" max="999"')}${kmCampo(i, 'máx', 'kmMax', p.kmMax, 'min="1" max="999"')}</div>`;
  }
  return `<div class="km-paso${p.activo ? '' : ' off'}" data-i="${i}">
    <div class="km-paso-cab">
      <label class="km-paso-chk" title="${p.activo ? 'Quitar este paso del cálculo' : 'Volver a usar este paso'}"><input type="checkbox" ${p.activo ? 'checked' : ''} onchange="kmPasoActivo(${i}, this.checked)"><span class="km-paso-num">${i + 1}</span></label>
      <div class="km-paso-tit"><b>${esc(d.titulo)}</b><small>${esc(d.desc)}</small></div>
      <div class="km-paso-acc">
        <button class="btn btn-gray btn-sm btn-icon" onclick="kmMoverPaso(${i}, -1)" ${i === 0 ? 'disabled' : ''} aria-label="Subir" title="Hacerlo antes">↑</button>
        <button class="btn btn-gray btn-sm btn-icon" onclick="kmMoverPaso(${i}, 1)" ${i === n - 1 ? 'disabled' : ''} aria-label="Bajar" title="Hacerlo después">↓</button>
        <button class="btn btn-gray btn-sm btn-icon" onclick="kmQuitarPaso(${i})" aria-label="Quitar del plan" title="Quitar del plan">×</button>
      </div>
    </div>
    ${cuerpo ? `<div class="km-paso-cuerpo">${cuerpo}</div>` : ''}
  </div>`;
}

function kmParam(i, sub, clave, valor) {
  const p = KM.plan[i]; if (!p) return;
  const dest = sub ? p[sub] : p;
  let v = valor;
  if (typeof valor === 'string' && clave !== 'hasta') { v = valor === '' ? null : parseFloat(valor); if (Number.isNaN(v)) v = null; }
  dest[clave] = v;
  kmProgramar();
}
function kmPasoActivo(i, v) { KM.plan[i].activo = !!v; kmPintarPlan(); kmProgramar(); }
function kmMoverPaso(i, d) {
  const j = i + d; if (j < 0 || j >= KM.plan.length) return;
  [KM.plan[i], KM.plan[j]] = [KM.plan[j], KM.plan[i]];
  kmPintarPlan(); kmProgramar();
}
function kmQuitarPaso(i) { KM.plan.splice(i, 1); kmPintar(); kmProgramar(); }
function kmAnadirPaso(tipo) {
  KM.plan.push(kmNuevoPaso({ tipo }));
  kmPintar();
  kmProgramar();
  const pasos = document.getElementById('km-pasos');
  if (pasos && pasos.lastElementChild) pasos.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
// Repinta solo la lista de pasos y el rótulo (no la vista previa ni el resto)
function kmPintarPlan() {
  const cont = document.getElementById('km-pasos');
  if (cont) cont.innerHTML = KM.plan.length ? KM.plan.map((p, i) => kmPasoHTML(p, i)).join('') : '<p class="km-vacio">El plan está vacío. Añade un paso de abajo.</p>';
  const tit = document.querySelector('.km-plan-card .card-title');
  const n = KM.plan.filter(p => p.activo).length;
  if (tit) tit.textContent = `Plan · ${n === 1 ? '1 paso' : n + ' pasos'}`;
}

// ─── VISTA PREVIA ────────────────────────────────────────────────────────────
function kmProgramar() {
  clearTimeout(KM.temporizador);
  const v = document.getElementById('km-vista');
  if (v) v.classList.add('calculando');
  KM.temporizador = setTimeout(kmCalcular, 280);
}

async function kmCalcular() {
  const vid = kmVid();
  const cont = document.getElementById('km-vista');
  if (!cont || !vid) return;
  const pasos = kmPasosActivos();
  KM.vista = null;
  if (!pasos.length) { cont.classList.remove('calculando'); cont.innerHTML = '<p class="km-vacio">Sin pasos activos no hay nada que calcular.</p>'; return; }
  const turno = ++KM.turnoVista;
  const r = await window.api.proponerPlanKm(vid, pasos);
  if (turno !== KM.turnoVista || vid !== kmVid()) return;
  KM.vista = r;
  cont.classList.remove('calculando');
  cont.innerHTML = kmVistaHTML(r);
}

function kmEstadoTxt(a, b) {
  const f = (clave, txt) => {
    const x = a[clave], y = b[clave];
    return `<span class="km-delta${y === 0 && x > 0 ? ' ok' : (y > x ? ' mal' : '')}"><b>${fmtMiles(x)}</b> → <b>${fmtMiles(y)}</b> ${txt}</span>`;
  };
  return f('sin_km', 'sin km') + f('incoherentes', 'no encajan') + f('solapes', 'solapes') + (kmOcultarHuecos() ? '' : f('huecos', 'huecos'));
}

function kmVistaHTML(r) {
  if (r.errores && r.errores.length && !r.cambios.length) {
    return `<div class="alert alert-err">${r.errores.map(esc).join('<br>')}</div>`;
  }
  const errores = r.errores.length ? `<div class="alert alert-warn" style="margin-bottom:10px">${r.errores.map(esc).join('<br>')}</div>` : '';
  const pasos = r.pasos.map((p, i) => `<li><b>${esc(p.titulo)}</b> · ${p.cambios ? `${p.cambios} ${p.cambios === 1 ? 'clase' : 'clases'}` : 'no cambia nada'}${p.avisos.map(a => `<div class="km-aviso-paso">${esc(a)}</div>`).join('')}</li>`).join('');
  const MAX = 400;
  const filas = r.cambios.slice(0, MAX).map(c => {
    const t = (typeof CUADRE_TIPOS !== 'undefined' && CUADRE_TIPOS[c.tipo]) || { txt: c.tipo, cls: 'pill-line' };
    const antes = c.antes.km_inicial === 0 && c.antes.km_final === 0 ? '<span style="color:var(--text-faint)">sin km</span>' : `${fmtMiles(c.antes.km_inicial)} → ${fmtMiles(c.antes.km_final)}`;
    const despues = c.despues.km_inicial === 0 && c.despues.km_final === 0 ? '<span style="color:var(--text-faint)">sin km</span>' : `<b>${fmtMiles(c.despues.km_inicial)} → ${fmtMiles(c.despues.km_final)}</b> <span class="cuadre-km">${fmtMiles(c.despues.km_final - c.despues.km_inicial)} km</span>`;
    return `<tr><td>${fmtFecha(c.fecha)}</td><td class="num-mono">${c.hora_inicio ? esc(c.hora_inicio) : '—'}</td><td>${esc(c.alumno)}</td>
      <td class="num-mono">${antes}</td><td class="num-mono">${despues}</td>
      <td><span class="pill ${t.cls}">${t.txt}</span><div class="al-sub" style="white-space:normal;max-width:340px">${esc(c.motivo)}</div></td></tr>`;
  }).join('');
  const n = r.cambios.length;
  return `<div class="km-vista-tit">Así quedaría</div>
    ${errores}
    <ol class="km-resumen-pasos">${pasos}</ol>
    ${r.antes && r.despues ? `<div class="km-deltas">${kmEstadoTxt(r.antes, r.despues)}</div>` : ''}
    ${n ? `<div class="cuadre-tabla"><table><thead><tr><th>Fecha</th><th>Hora</th><th>Alumno</th><th>Ahora</th><th>Quedaría</th><th>Qué se hace</th></tr></thead><tbody>${filas}</tbody></table></div>
      ${n > MAX ? `<p class="cuadre-nota">… y ${n - MAX} más (se aplican igual).</p>` : ''}
      <p class="cuadre-nota">Se guardan <b>exactamente</b> estos km. Cambiar fecha, hora, alumno o profesor no se toca nunca. Después se puede <b>deshacer</b>.</p>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-success" onclick="kmAplicar()">Aplicar ${n} ${n === 1 ? 'cambio' : 'cambios'}</button>
        <button class="btn btn-outline" onclick="kmCalcular()" title="Los km se reparten con una pequeña variación: vuelve a sortearlos">Volver a calcular</button>
      </div>`
      : '<p class="cuadre-nota">Con este plan no cambia ninguna clase.</p>'}`;
}

async function kmAplicar() {
  const r = KM.vista;
  if (!r || !r.cambios.length) return;
  const n = r.cambios.length;
  if (!await confirmar(`Se van a guardar los km de ${n} ${n === 1 ? 'clase' : 'clases'} tal como se muestran.\n\nSe puede deshacer después desde esta misma pantalla.\n\n¿Aplicar?`, { textoAceptar: 'Aplicar' })) return;
  const res = await window.api.aplicarCuadreKm(kmVid(), r.cambios);
  if (res.errores && res.errores.length) {
    document.getElementById('km-asistente').insertAdjacentHTML('afterbegin', `<div class="alert alert-err" style="margin-bottom:14px">${esc(res.errores.join(' '))}</div>`);
    return;
  }
  if (typeof toastApp === 'function') toastApp(`${res.aplicados} ${res.aplicados === 1 ? 'clase cuadrada' : 'clases cuadradas'}`);
  KM.planDe = null;
  kmCargar(`✓ ${res.aplicados} ${res.aplicados === 1 ? 'clase cuadrada' : 'clases cuadradas'}${res.omitidos ? ` (${res.omitidos} ya no estaban como en la vista previa)` : ''}. Puedes deshacerlo más abajo.`);
}

async function kmDeshacer(id) {
  if (!await confirmar('Se devolverán las clases a como estaban antes del último cambio de km de este coche (las que se hayan editado después no se tocan).\n\n¿Deshacer?', { textoAceptar: 'Deshacer' })) return;
  const res = await window.api.deshacerCuadreKm(id);
  KM.planDe = null;
  if (res.errores && res.errores.length) { kmCargar(); return; }
  kmCargar(`↶ Deshecho: ${res.deshechos} ${res.deshechos === 1 ? 'clase devuelta' : 'clases devueltas'} a como estaban${res.quitadas ? ` y ${res.quitadas} ${res.quitadas === 1 ? 'clase añadida quitada' : 'clases añadidas quitadas'}` : ''}${res.omitidos ? ` (${res.omitidos} se habían editado después y no se tocaron)` : ''}.`);
}
