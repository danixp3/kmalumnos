// ─── CUADRAR KM · MODO AVANZADO (compañeros sin registrar) ──────────────────
// Otra pantalla (#page-cuadre-avanzado) a la que se llega desde Cuadrar km con
// el botón «Modo avanzado». Enseña el planning entero del coche tal como
// quedaría y deja añadir «compañeros sin registrar»: alumnos que también usaban
// el coche y no están en la app (p. ej. los que ya aprobaron). No crean alumnos
// ni clases: solo ocupan km del cuentakilómetros entre las clases del coche,
// dentro de su rango de fechas, para que un alumno que sigue en la app no
// parezca haber usado el coche él solo durante semanas.
// Rango de cada compañero: fechas desde/hasta, «Desde aquí ↓ / Hasta aquí ↑» en
// cada fila o arrastrando su barra (carril de colores a la izquierda).
// Motor: db/cuadre-km.js (proponerCuadreKm con `companeros`); se guarda
// EXACTAMENTE lo mostrado (aplicarCuadreKm) y los compañeros quedan en el coche
// (setCompanerosKm, sincroniza con los demás PCs).

const CAV_COLORES = ['--chart-series-4', '--chart-series-3', '--chart-series-5', '--chart-series-6', '--chart-series-7', '--chart-series-2', '--chart-series-8', '--chart-series-1'];
const CAV_MAX = 8;
const CAV_MAX_FILAS = 2500;
const cav = {
  vid: null, nombre: '', companeros: [], sel: 0, plan: null, opc: { rehacerCalculados: true, rellenarAntes: true, rellenarDespues: false },
  resaltar: '', turno: 0, arrastre: null, temporizador: null
};

// Desde Cuadrar km: abre el modo avanzado con el coche elegido y sus opciones
async function abrirCuadreAvanzado() {
  const vid = cuadreVehiculoId();
  if (!vid) return;
  cav.vid = vid;
  const coche = (vehiculosCache || []).find(v => v.id === vid);
  const sel = document.getElementById('gk-vehiculo');
  cav.nombre = coche ? coche.nombre : (sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : 'coche');
  cav.opc = { rehacerCalculados: true, rellenarAntes: true, rellenarDespues: !!cuadreOpc.rellenarDespues, cerrarHuecosPequenos: !!cuadreOpc.cerrarHuecosPequenos, rellenarHuecosGrandes: !!cuadreOpc.rellenarHuecosGrandes };
  cav.resaltar = '';
  cav.plan = null;
  navegarA('cuadre-avanzado');
}

async function loadCuadreAvanzado() {
  if (!cav.vid) { navegarA('generar-km', 'cuadrar'); return; }
  document.getElementById('cav-titulo').textContent = `Modo avanzado · ${cav.nombre}`;
  try { cav.companeros = await window.api.getCompanerosKm(cav.vid); } catch (e) { cav.companeros = []; }
  cav.sel = Math.min(cav.sel, Math.max(0, cav.companeros.length - 1));
  cavPintarPanel();
  await cavCalcular();
}

function cavVolver() {
  if (typeof gkVehiculoPreferido !== 'undefined') gkVehiculoPreferido = cav.vid;
  navegarA('generar-km', 'cuadrar');
}

const cavColor = i => `var(${CAV_COLORES[i % CAV_COLORES.length]})`;

// ── Panel de compañeros y opciones ───────────────────────────────────────────
function cavPintarPanel() {
  const el = document.getElementById('cav-companeros');
  if (!el) return;
  const R = cav.plan ? cav.plan.resumen : null;
  const porComp = new Map();
  for (const f of (cav.plan ? cav.plan.fantasmas : [])) {
    const x = porComp.get(f.companero_id) || { huecos: 0, clases: 0, km: 0 };
    x.huecos++; x.clases += f.clases; x.km += f.km; porComp.set(f.companero_id, x);
  }
  el.innerHTML = cav.companeros.map((c, i) => {
    const uso = porComp.get(c.id);
    return `<div class="cav-comp${i === cav.sel ? ' sel' : ''}" style="--cav-color:${cavColor(i)}" onclick="cavElegir(${i}, event)">
      <div class="cav-comp-cab">
        <span class="cav-punto" aria-hidden="true"></span>
        <input type="text" value="${esc(c.nombre)}" maxlength="40" aria-label="Nombre del compañero" onchange="cavCambiar(${i}, 'nombre', this.value)">
        <button type="button" class="btn btn-ghost btn-sm" title="Quitar este compañero" onclick="cavQuitar(${i})">×</button>
      </div>
      <div class="cav-comp-fechas">
        <label>Desde <input type="date" value="${c.desde || ''}" onchange="cavCambiar(${i}, 'desde', this.value)"></label>
        <label>Hasta <input type="date" value="${c.hasta || ''}" onchange="cavCambiar(${i}, 'hasta', this.value)"></label>
      </div>
      <div class="cav-comp-fila">
        <span>Clases suyas entre dos clases del coche</span>
        <span class="cav-paso"><button type="button" onclick="cavCambiar(${i}, 'clases', ${c.clases - 1})" ${c.clases <= 1 ? 'disabled' : ''} aria-label="Menos">−</button><b class="num-mono">${c.clases}</b><button type="button" onclick="cavCambiar(${i}, 'clases', ${c.clases + 1})" ${c.clases >= 6 ? 'disabled' : ''} aria-label="Más">+</button></span>
      </div>
      <div class="cav-comp-fila">
        <span>Km por clase</span>
        <span class="range-group"><input type="number" min="1" max="300" value="${c.kmMin}" onchange="cavCambiar(${i}, 'kmMin', this.value)" aria-label="Km mínimos"><span class="range-sep">—</span><input type="number" min="1" max="300" value="${c.kmMax}" onchange="cavCambiar(${i}, 'kmMax', this.value)" aria-label="Km máximos"></span>
      </div>
      <label class="cav-comp-check"><input type="checkbox" ${c.mismoDia ? 'checked' : ''} onchange="cavCambiar(${i}, 'mismoDia', this.checked)"> También entre clases del mismo día</label>
      <div class="cav-comp-uso">${uso ? `Ocupa <b>${fmtMiles(uso.km)} km</b> en ${uso.huecos} ${uso.huecos === 1 ? 'hueco' : 'huecos'} (${fmtClases(uso.clases)} ${uso.clases === 1 ? 'clase' : 'clases'})` : (cav.plan ? 'Aún no ocupa ningún hueco: revisa su rango de fechas' : '')}</div>
    </div>`;
  }).join('') || '<p class="cav-vacio">Todavía no hay compañeros. Añade uno y elige desde cuándo y hasta cuándo usaba el coche.</p>';
  const btn = document.getElementById('cav-anadir');
  if (btn) btn.disabled = cav.companeros.length >= CAV_MAX;
  const o = cav.opc;
  document.getElementById('cav-opc-rehacer').checked = !!o.rehacerCalculados;
  document.getElementById('cav-opc-antes').checked = !!o.rellenarAntes;
  document.getElementById('cav-opc-despues').checked = !!o.rellenarDespues;
  const res = document.getElementById('cav-resumen');
  if (res && R) {
    res.innerHTML = `<div><b class="num-mono">${fmtMiles(R.a_cambiar)}</b> ${R.a_cambiar === 1 ? 'clase cambia' : 'clases cambian'}</div>
      <div><b class="num-mono">${fmtMiles(R.km_companeros || 0)}</b> km de compañeros (${fmtClases(R.clases_companeros || 0)} clases)</div>
      <div${R.huecos ? ' class="cav-aviso"' : ''}><b class="num-mono">${fmtMiles(R.huecos)}</b> ${R.huecos === 1 ? 'tramo' : 'tramos'} sin explicar${R.km_en_huecos ? ` · ${fmtMiles(R.km_en_huecos)} km` : ''}</div>`;
  }
  const ap = document.getElementById('cav-aplicar');
  if (ap) { const n = cav.plan ? cav.plan.cambios.length : 0; ap.disabled = !n; ap.textContent = n ? `Aplicar ${fmtMiles(n)} ${n === 1 ? 'cambio' : 'cambios'}` : 'Nada que aplicar'; }
}

function cavElegir(i) {
  if (cav.sel === i) return;
  cav.sel = i;
  document.querySelectorAll('#cav-companeros .cav-comp').forEach((x, j) => x.classList.toggle('sel', j === i));
  cavPintarCarriles();
}

function cavAnadir() {
  if (cav.companeros.length >= CAV_MAX) return;
  const rango = getRangoPref();
  // Por defecto: todo el periodo del coche que se ve, con km de una clase normal
  const filas = cav.plan ? cav.plan.planificacion : [];
  const med = cav.plan && cav.plan.resumen.km_tipico_clase ? cav.plan.resumen.km_tipico_clase : Math.round((rango.min + rango.max) / 4);
  const n = cav.companeros.length + 1;
  cav.companeros.push({
    id: 'c' + Date.now().toString(36), nombre: `Compañero ${n}`,
    desde: cav.resaltar ? (filas.find(f => String(f.alumno_id) === cav.resaltar) || {}).fecha || null : null,
    hasta: cav.resaltar ? ([...filas].reverse().find(f => String(f.alumno_id) === cav.resaltar) || {}).fecha || null : null,
    clases: 1, kmMin: Math.max(1, Math.round(med * 0.85)), kmMax: Math.round(med * 1.15), mismoDia: true, activo: true
  });
  cav.sel = cav.companeros.length - 1;
  cavGuardarYCalcular();
}

async function cavQuitar(i) {
  const c = cav.companeros[i];
  if (!c || !await confirmar(`¿Quitar a «${c.nombre}»? Sus km dejarán de contar al cuadrar este coche (las clases ya guardadas no cambian hasta que vuelvas a aplicar).`, { textoAceptar: 'Quitar' })) return;
  cav.companeros.splice(i, 1);
  cav.sel = Math.max(0, Math.min(cav.sel, cav.companeros.length - 1));
  cavGuardarYCalcular();
}

function cavCambiar(i, campo, valor) {
  const c = cav.companeros[i];
  if (!c) return;
  if (campo === 'clases') valor = Math.max(1, Math.min(6, parseInt(valor) || 1));
  if (campo === 'kmMin' || campo === 'kmMax') valor = Math.max(1, Math.min(300, parseInt(valor) || 1));
  if (campo === 'desde' || campo === 'hasta') valor = valor || null;
  c[campo] = valor;
  if (c.kmMax < c.kmMin) { if (campo === 'kmMin') c.kmMax = c.kmMin; else c.kmMin = c.kmMax; }
  if (c.desde && c.hasta && c.desde > c.hasta) { if (campo === 'desde') c.hasta = c.desde; else c.desde = c.hasta; }
  cav.sel = i;
  cavGuardarYCalcular();
}

function cavOpcion(clave, valor) {
  cav.opc[clave] = !!valor;
  cavCalcular();
}

// Rango desde una fila del planning: «Desde aquí» (hacia abajo) / «Hasta aquí» (hacia arriba)
function cavRangoDesdeFila(fecha, lado) {
  if (!cav.companeros.length) { cavAnadir(); }
  const c = cav.companeros[cav.sel];
  if (!c) return;
  if (lado === 'desde') { c.desde = fecha; if (c.hasta && c.hasta < fecha) c.hasta = null; }
  else { c.hasta = fecha; if (c.desde && c.desde > fecha) c.desde = null; }
  cavGuardarYCalcular();
}

// Guarda los compañeros del coche (normalizados por la app) y recalcula
function cavGuardarYCalcular() {
  clearTimeout(cav.temporizador);
  cavPintarPanel();
  cavPintarCarriles();
  cav.temporizador = setTimeout(async () => {
    try { cav.companeros = await window.api.setCompanerosKm(cav.vid, cav.companeros); } catch (e) { /* se queda en pantalla */ }
    cavCalcular();
  }, 250);
}

async function cavCalcular() {
  const turno = ++cav.turno;
  const plan = await window.api.proponerCuadreKm(cav.vid, { ...cav.opc, companeros: cav.companeros });
  if (turno !== cav.turno) return; // llegó otra petición después
  cav.plan = plan;
  cavPintarPanel();
  cavPintarPlan();
}

// ── Planning ─────────────────────────────────────────────────────────────────
const cavEnRango = (c, f) => (!c.desde || f >= c.desde) && (!c.hasta || f <= c.hasta);

function cavPintarPlan() {
  const cont = document.getElementById('cav-plan');
  if (!cont || !cav.plan) return;
  if (cav.plan.errores && cav.plan.errores.length) { cont.innerHTML = `<div class="alert alert-err">${esc(cav.plan.errores.join(' '))}</div>`; return; }
  const filas = cav.plan.planificacion.slice(0, CAV_MAX_FILAS);
  // Selector «Resaltar alumno»
  const sel = document.getElementById('cav-resaltar');
  if (sel) {
    const alumnos = new Map();
    for (const f of cav.plan.planificacion) alumnos.set(String(f.alumno_id), (alumnos.get(String(f.alumno_id)) || { n: 0, nombre: f.alumno }));
    for (const f of cav.plan.planificacion) alumnos.get(String(f.alumno_id)).n++;
    sel.innerHTML = '<option value="">— Ninguno —</option>' + [...alumnos.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'))
      .map(([id, a]) => `<option value="${id}"${id === cav.resaltar ? ' selected' : ''}>${esc(a.nombre)} · ${a.n}</option>`).join('');
  }
  const carriles = '<span class="cav-carriles" aria-hidden="true">' + cav.companeros.map((c, i) => `<i data-c="${i}" style="--cav-color:${cavColor(i)}"></i>`).join('') + '</span>';
  const kmTxt = (ki, kf) => (ki === 0 && kf === 0 ? '<span class="cav-tenue">sin km</span>' : `${fmtMiles(ki)} → ${fmtMiles(kf)}`);
  let html = '';
  let prev = null;
  filas.forEach((f, idx) => {
    // Entre la clase anterior y esta: km de los compañeros y lo que queda sin explicar
    if (prev) {
      const kmF = f.fantasmas.reduce((s, x) => s + x.km, 0);
      const conKm = prev.km_final > 0 && f.km_inicial > 0;
      const hueco = conKm ? f.km_inicial - prev.km_final : 0;
      const resto = hueco - kmF;
      if (kmF || resto > 15 || resto < 0) {
        const partes = f.fantasmas.map(x => {
          const i = cav.companeros.findIndex(c => c.id === x.companero_id);
          return `<span class="cav-fant" style="--cav-color:${cavColor(Math.max(0, i))}">${esc(x.nombre)} · ${fmtClases(x.clases)} ${x.clases === 1 ? 'clase' : 'clases'} · <b>${fmtMiles(x.km)} km</b>${x.explica ? ' (ya estaban)' : ''}</span>`;
        });
        if (resto > 15) partes.push(`<span class="cav-sinexp">${fmtMiles(resto)} km sin explicar</span>`);
        if (resto < 0) partes.push(`<span class="cav-sinexp">se pisan ${fmtMiles(-resto)} km</span>`);
        html += `<div class="cav-fila cav-gap" data-ant="${prev.fecha}" data-sig="${f.fecha}">${carriles}<span class="cav-gap-txt">${partes.join('')}</span></div>`;
      }
    }
    const res = cav.resaltar && String(f.alumno_id) === cav.resaltar;
    const t = f.tipo ? (CUADRE_TIPOS[f.tipo] || { txt: f.tipo, cls: 'pill-line' }) : null;
    html += `<div class="cav-fila cav-clase${res ? ' resaltada' : ''}${f.cambia ? ' cambia' : ''}" data-fecha="${f.fecha}" data-i="${idx}">${carriles}
      <span class="cav-fecha">${fmtFecha(f.fecha)}</span><span class="cav-hora num-mono">${f.hora_inicio ? esc(f.hora_inicio) : '—'}</span>
      <span class="cav-alumno">${esc(f.alumno)}${f.clases && f.clases !== 1 ? ` <small>${fmtClases(f.clases)}</small>` : ''}</span>
      <span class="cav-antes num-mono">${f.cambia ? (f.antes.km_inicial === 0 && f.antes.km_final === 0 ? '<span class="cav-tenue">sin km</span>' : `<s>${fmtMiles(f.antes.km_inicial)} → ${fmtMiles(f.antes.km_final)}</s>`) : ''}</span>
      <span class="cav-km num-mono">${kmTxt(f.km_inicial, f.km_final)}${f.km_final > f.km_inicial && f.km_inicial > 0 ? ` <small>${fmtMiles(f.km_final - f.km_inicial)} km</small>` : ''}</span>
      <span class="cav-tipo">${t ? `<span class="pill ${t.cls}">${t.txt}</span>` : (f.estado === 'abierta' ? '<span class="pill pill-dark">Abierta</span>' : '')}</span>
      <span class="cav-acc"><button type="button" class="btn btn-sm btn-gray" title="El compañero elegido empieza aquí y sigue hacia abajo" onclick="cavRangoDesdeFila('${f.fecha}', 'desde')">Desde aquí ↓</button><button type="button" class="btn btn-sm btn-gray" title="El compañero elegido llega hasta aquí (hacia arriba)" onclick="cavRangoDesdeFila('${f.fecha}', 'hasta')">↑ Hasta aquí</button></span>
    </div>`;
    prev = f;
  });
  if (cav.plan.planificacion.length > CAV_MAX_FILAS) html += `<p class="cuadre-nota">… y ${fmtMiles(cav.plan.planificacion.length - CAV_MAX_FILAS)} clases más (se cuadran igual).</p>`;
  const avisos = (cav.plan.avisos || []).filter(a => a.tipo !== 'faltan_clases').map(a => `<div class="alert alert-warn" style="margin-bottom:8px">${esc(a.texto)}</div>`).join('');
  cont.innerHTML = avisos + (html || '<p class="empty">Este coche no tiene clases.</p>');
  cavPintarCarriles();
}

// Barras de colores: un carril por compañero, encendido en las filas de su rango.
// Solo cambia clases CSS (sirve también mientras se arrastra).
function cavPintarCarriles() {
  const cont = document.getElementById('cav-plan');
  if (!cont) return;
  const filas = [...cont.querySelectorAll('.cav-fila')];
  cav.companeros.forEach((c, i) => {
    let primera = null, ultima = null;
    for (const fila of filas) {
      const lane = fila.querySelector(`.cav-carriles i[data-c="${i}"]`);
      if (!lane) continue;
      const on = fila.classList.contains('cav-gap')
        ? cavEnRango(c, fila.dataset.ant) && cavEnRango(c, fila.dataset.sig)
        : cavEnRango(c, fila.dataset.fecha);
      lane.className = on ? 'on' : '';
      lane.classList.toggle('elegido', i === cav.sel);
      lane.innerHTML = '';
      if (on && fila.classList.contains('cav-clase')) { if (!primera) primera = lane; ultima = lane; }
    }
    if (primera) { primera.classList.add('ini'); primera.innerHTML = `<b class="cav-asa" data-c="${i}" data-lado="desde" title="Arrastra para cambiar desde cuándo"></b>`; }
    if (ultima) { ultima.classList.add('fin'); ultima.insertAdjacentHTML('beforeend', `<b class="cav-asa cav-asa-fin" data-c="${i}" data-lado="hasta" title="Arrastra para cambiar hasta cuándo"></b>`); }
  });
}

// ── Arrastrar la barra de un compañero ───────────────────────────────────────
// Asa de arriba = «desde», asa de abajo = «hasta». Pulsar en un carril vacío
// crea el rango desde esa fila y se arrastra el final.
function cavFechaBajo(x, y) {
  const el = document.elementFromPoint(x, y);
  const fila = el && el.closest ? el.closest('#cav-plan .cav-fila') : null;
  if (!fila) return null;
  if (fila.dataset.fecha) return fila.dataset.fecha;
  return cav.arrastre && cav.arrastre.lado === 'desde' ? fila.dataset.sig : fila.dataset.ant;
}

function cavInicioArrastre(e) {
  const asa = e.target.closest('.cav-asa');
  const lane = e.target.closest('.cav-carriles i');
  if (!asa && !lane) return;
  const i = parseInt((asa || lane).dataset.c);
  const c = cav.companeros[i];
  if (!c) return;
  e.preventDefault();
  let lado = asa ? asa.dataset.lado : 'hasta';
  if (!asa) {
    // Carril vacío: el rango empieza en esta fila
    const f = cavFechaBajo(e.clientX, e.clientY);
    if (!f) return;
    if (!lane.classList.contains('on')) { c.desde = f; c.hasta = f; }
    else {
      // Dentro de la barra: se mueve el extremo más cercano
      const ms = s => new Date(s + 'T00:00:00').getTime();
      const ini = c.desde ? ms(c.desde) : -Infinity, fin = c.hasta ? ms(c.hasta) : Infinity;
      lado = !isFinite(ini) ? 'desde' : !isFinite(fin) ? 'hasta' : (ms(f) - ini < fin - ms(f) ? 'desde' : 'hasta');
    }
  }
  cav.sel = i;
  document.querySelectorAll('#cav-companeros .cav-comp').forEach((x, j) => x.classList.toggle('sel', j === i));
  cav.arrastre = { i, lado, y: e.clientY };
  document.body.classList.add('cav-arrastrando');
  cavPintarCarriles();
}

function cavMoverArrastre(e) {
  const A = cav.arrastre;
  if (!A) return;
  A.y = e.clientY;
  const f = cavFechaBajo(e.clientX, e.clientY);
  const c = cav.companeros[A.i];
  if (!f || !c) return;
  if (A.lado === 'desde') { c.desde = c.hasta && f > c.hasta ? c.hasta : f; }
  else { c.hasta = c.desde && f < c.desde ? c.desde : f; }
  cavPintarCarriles();
  // Cerca del borde de la lista: se desplaza sola
  const caja = document.getElementById('cav-plan').getBoundingClientRect();
  if (e.clientY < caja.top + 40) window.scrollBy(0, -18);
  else if (e.clientY > Math.min(caja.bottom, window.innerHeight) - 40) window.scrollBy(0, 18);
}

function cavFinArrastre() {
  if (!cav.arrastre) return;
  cav.arrastre = null;
  document.body.classList.remove('cav-arrastrando');
  cavGuardarYCalcular();
}

document.addEventListener('pointerdown', e => { if (e.button === 0 && e.target.closest && e.target.closest('#cav-plan .cav-carriles')) cavInicioArrastre(e); });
document.addEventListener('pointermove', cavMoverArrastre);
document.addEventListener('pointerup', cavFinArrastre);
document.addEventListener('pointercancel', cavFinArrastre);

function cavResaltar(id) {
  cav.resaltar = id || '';
  document.querySelectorAll('#cav-plan .cav-clase').forEach(fila => {
    const f = cav.plan.planificacion[parseInt(fila.dataset.i)];
    fila.classList.toggle('resaltada', !!cav.resaltar && f && String(f.alumno_id) === cav.resaltar);
  });
  const primera = document.querySelector('#cav-plan .cav-clase.resaltada');
  if (primera) primera.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

async function cavAplicar() {
  if (!cav.plan || !cav.plan.cambios.length) return;
  const n = cav.plan.cambios.length;
  const R = cav.plan.resumen;
  if (!await confirmar(`Se van a guardar los km de ${n} ${n === 1 ? 'clase' : 'clases'} tal como se ven en el planning${R.km_companeros ? `, dejando ${fmtMiles(R.km_companeros)} km para los compañeros sin registrar` : ''}.\n\nNo se crean alumnos ni clases nuevas: solo cambian los km. Se puede deshacer desde Cuadrar km.\n\n¿Aplicar?`)) return;
  const res = await window.api.aplicarCuadreKm(cav.vid, cav.plan.cambios);
  if (res.errores && res.errores.length) { await avisar(res.errores.join(' ')); cavCalcular(); return; }
  if (typeof gkActualizarContador === 'function') gkActualizarContador();
  await cavCalcular();
  showToast('cav-mensaje', `✓ ${res.aplicados} ${res.aplicados === 1 ? 'clase cuadrada' : 'clases cuadradas'}${res.omitidos ? ` (${res.omitidos} ya no estaban como en la vista previa)` : ''}. Se puede deshacer en Cuadrar km.`, 'ok');
}
