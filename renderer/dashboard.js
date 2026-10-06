// ─── DASHBOARD ───────────────────────────────────────────────────────────────
// Tarjetas de estadísticas y alertas del panel principal, y la navegación entre
// pestañas internas de las páginas de Kilómetros y Datos.

// ─── PANEL (pantalla de inicio) ──────────────────────────────────────────────
// Cifras del día y del mes, prácticas por día, coches en ruta, avisos y próximos
// exámenes. Los datos salen de db.getPanel (una sola llamada); los avisos suman
// además agenda, caducidades y alumnos en riesgo. Las tarjetas históricas
// (agenda, semáforo, riesgo, caducidades, gráficos configurables) siguen debajo.

const PANEL_ICONOS = {
  aviso: '<path d="M10.3 4.2L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
  bono: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  coche: '<path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M6 17v2M18 17v2"/>',
  llave: '<path d="M14.7 6.3a4 4 0 1 0 3 3L21 6l-3-3-3.3 3.3z"/><path d="M14 10l-9 9v2h2l1-1v-2h2v-2h2l3-3"/>',
  agenda: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  usuario: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.6 3.3-6 7-6s6.4 2.4 7 6"/>',
  ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.27"/>',
  flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>'
};
const panelIcono = (k, w) => `<svg width="${w || 18}" height="${w || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PANEL_ICONOS[k]}</svg>`;

let panelCache = null;
let panelVistaActual = 'grafico';


function pintarCabeceraPanel() {
  const el = document.getElementById('panel-fecha');
  if (!el) return;
  const ahora = new Date();
  const f = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ahora);
  const h = String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
  el.textContent = f.charAt(0).toUpperCase() + f.slice(1) + ' · ' + h;
}
// La hora de la cabecera se mantiene al día mientras el Panel está a la vista.
setInterval(() => {
  const pg = document.getElementById('page-dashboard');
  if (pg && pg.classList.contains('active')) pintarCabeceraPanel();
}, 30000);

async function loadDashboard() {
  const suc = getSucursalActual();
  const [r, panel] = await Promise.all([window.api.getResumen(suc), window.api.getPanel(undefined, suc)]);
  panelCache = panel;
  pintarCabeceraPanel();
  pintarKpisPanel(panel);

  // Tarjetas personalizables (Ajustes → Preferencias): siguen disponibles, ahora como "Resumen personalizado".
  animarContador(document.getElementById('stat-vehiculos'), r.vehiculos);
  animarContador(document.getElementById('stat-alumnos'), r.alumnos);
  animarContador(document.getElementById('stat-practicas'), r.practicas);
  const pref = getDashboardPref();
  const flags = {
    'stat-card-vehiculos': pref.vehiculos, 'stat-card-alumnos': pref.alumnos, 'stat-card-practicas': pref.practicas,
    'stat-card-practicas-hoy': pref.practicasHoy, 'stat-card-km-mes': pref.kmMes,
    'stat-card-total-adeudado': pref.totalAdeudado, 'stat-card-alumnos-deuda': pref.alumnosConDeuda
  };
  Object.entries(flags).forEach(([id, on]) => document.getElementById(id).classList.toggle('hidden', !on));
  const algunaExtra = Object.values(flags).some(Boolean);
  document.getElementById('dash-stats-extra').classList.toggle('hidden', !algunaExtra);
  document.getElementById('dash-stats-extra-label').classList.toggle('hidden', !algunaExtra);

  if (pref.practicasHoy || pref.kmMes || pref.totalAdeudado || pref.alumnosConDeuda) {
    const stats = await window.api.getStatsDashboard(undefined, suc);
    animarContador(document.getElementById('stat-practicas-hoy'), stats.practicasHoy);
    animarContador(document.getElementById('stat-km-mes'), stats.kmMes, v => v + ' km');
    animarContador(document.getElementById('stat-total-adeudado'), stats.totalAdeudado, v => fmt(v) + ' €');
    animarContador(document.getElementById('stat-alumnos-deuda'), stats.alumnosConDeuda);
  }

  pintarDiasPanel(panel);
  pintarRutaPanel(panel);
  pintarExamenesPanel(panel);

  loadGraficos();
  loadAgendaDashboard();
  loadSemaforoDashboard();
  loadRiesgoAbandonoDashboard();
  loadVencimientosDashboard();

  await pintarAvisosPanel(panel);
}

function pintarKpisPanel(p) {
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const html = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };

  set('kpi-hoy-num', p.practicasHoy);
  set('kpi-hoy-unit', `de ${p.programadasHoy} programadas`);
  html('kpi-hoy-sub', p.enCursoAhora > 0
    ? `<span class="pill-dot"></span>${p.enCursoAhora} en curso ahora mismo`
    : 'Ninguna en curso ahora mismo');

  const [y, m] = p.hoy.split('-').map(Number);
  const mes = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
  set('kpi-km-lbl', `Km en ${mes}`);
  set('kpi-km-num', fmtMiles(p.kmMes));
  set('kpi-km-sub', `${fmtMiles(p.practicasMes)} prácticas · ${fmtDec(p.mediaKmPractica)} km de media`);

  set('kpi-alumnos-num', p.alumnosActivos);
  set('kpi-alumnos-sub', p.alumnosConExamen === 1 ? '1 con examen programado' : `${p.alumnosConExamen} con examen programado`);

  const inc = p.sinKm + p.solapamientos;
  set('kpi-revisar-num', inc);
  set('kpi-revisar-unit', inc === 1 ? 'incidencia' : 'incidencias');
  document.getElementById('kpi-revisar-flag').classList.toggle('hidden', inc === 0);
  const enlace = document.getElementById('kpi-revisar-link');
  enlace.classList.toggle('hidden', inc === 0);
  enlace.onclick = () => (p.sinKm > 0 ? navegarA('generar-km') : navegarA('kilometros', 'conflictos'));
  set('kpi-revisar-sub', inc === 0
    ? 'Sin km en blanco ni solapamientos'
    : `${p.sinKm} sin km · ${p.solapamientos} solapamiento${p.solapamientos === 1 ? '' : 's'}`);
}

// ── Prácticas por día ────────────────────────────────────────────────────────
function panelVista(v) {
  panelVistaActual = v;
  document.getElementById('panel-vista-grafico').setAttribute('aria-pressed', v === 'grafico' ? 'true' : 'false');
  document.getElementById('panel-vista-tabla').setAttribute('aria-pressed', v === 'tabla' ? 'true' : 'false');
  if (panelCache) pintarDiasPanel(panelCache);
}

function pintarDiasPanel(p) {
  const body = document.getElementById('panel-dias-body');
  const nota = document.getElementById('panel-dias-nota');
  if (!body) return;
  const [y, m] = p.hoy.split('-').map(Number);
  const mes = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
  nota.textContent = `Días laborables de ${mes}` + (p.mediaPorDia ? ` · media de ${fmtDec(p.mediaPorDia)} por día` : '');

  if (!p.porDia.some(d => d.n > 0) && p.programadasHoy === 0) {
    body.innerHTML = '<div class="vacio-panel">Todavía no hay prácticas este mes.</div>';
    return;
  }
  if (panelVistaActual === 'tabla') { body.innerHTML = tablaSemanasPanel(p); return; }

  const AL = 200;
  const valores = p.porDia.map(d => d.hoy ? Math.max(d.n, p.programadasHoy) : d.n);
  const tope = Math.max(5, ...valores);
  const paso = [1, 2, 5, 10, 20, 50, 100].find(s => tope / s <= 4) || 100;
  const yMax = Math.ceil(tope / paso) * paso;
  const px = v => Math.round((v / yMax) * AL);
  let ticks = '', lineas = '';
  for (let v = 0; v <= yMax; v += paso) {
    ticks += `<span style="bottom:${px(v)}px">${v}</span>`;
    if (v > 0) lineas += `<span class="dia-grid" style="bottom:${px(v)}px"></span>`;
  }

  let barras = '', etiquetas = '', prev = null;
  p.porDia.forEach(d => {
    if (prev !== null && d.dia - prev > 1) { barras += '<span class="dia-bar dia-gap"></span>'; etiquetas += '<span class="dia-gap"></span>'; }
    prev = d.dia;
    const tip = `${fechaCorta(d.fecha)} · ${d.n} ${d.n === 1 ? 'práctica' : 'prácticas'}`;
    let barra;
    if (d.hoy) {
      const pendientes = Math.max(0, p.programadasHoy - d.n);
      const hecho = px(d.n), prog = px(d.n + pendientes) - hecho;
      barra = (p.programadasHoy > 0 ? `<span class="dia-hoy-lbl" style="bottom:${px(d.n + pendientes) + 2}px">${d.n} / ${p.programadasHoy}</span>` : '') +
        (prog > 0 ? `<span class="dia-prog" style="height:${prog}px"></span>` : '') +
        (d.n > 0 ? `<span class="dia-hoy" style="height:${Math.max(hecho, 3)}px"></span>` : '');
    } else {
      barra = d.n > 0 ? `<span class="dia-fill" style="height:${Math.max(px(d.n), 2)}px"></span>` : '';
    }
    barras += `<button type="button" class="dia-bar" aria-label="${esc(tip)}" style="padding:0;border:none;background:transparent;cursor:default">${barra}<span class="dia-tip" style="bottom:${px(d.hoy ? Math.max(d.n, p.programadasHoy) : d.n) + 26}px" role="tooltip">${esc(tip)}</span></button>`;
    etiquetas += `<span class="${d.hoy ? 'dia-hoy-n' : ''}">${d.dia}</span>`;
  });

  body.innerHTML = `<div class="dia-chart">
    <div class="dia-y" aria-hidden="true">${ticks}</div>
    <div class="dia-main">
      <div class="dia-plot">${lineas}${barras}</div>
      <div class="dia-x" aria-hidden="true">${etiquetas}</div>
    </div>
  </div>`;
}

function tablaSemanasPanel(p) {
  // Semanas (lunes a domingo); los fines de semana solo suman en la última columna.
  const semanas = new Map();
  p.porDia.forEach(d => {
    const f = parteFecha(d.fecha);
    const lunes = new Date(f.y, f.m - 1, f.d - ((f.dow + 6) % 7));
    const clave = lunes.getFullYear() + '-' + (lunes.getMonth() + 1) + '-' + lunes.getDate();
    if (!semanas.has(clave)) semanas.set(clave, { lunes, dias: {}, finde: 0, total: 0, desde: d.dia, hasta: d.dia, mesIdx: f.m - 1 });
    const w = semanas.get(clave);
    if (f.dow === 0 || f.dow === 6) w.finde += d.n; else w.dias[f.dow] = d.n;
    w.total += d.n; w.hasta = d.dia;
  });
  const hayFinde = [...semanas.values()].some(w => w.finde > 0);
  const filas = [...semanas.values()].map(w => {
    const celdas = [1, 2, 3, 4, 5].map(dw => `<td>${w.dias[dw] !== undefined ? w.dias[dw] : '–'}</td>`).join('');
    return `<tr><td>${w.desde}–${w.hasta} ${MESES_CORTOS[w.mesIdx]}</td>${celdas}${hayFinde ? `<td>${w.finde || '–'}</td>` : ''}<td style="font-weight:600">${w.total}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="tabla-semanas"><thead><tr><th>Semana</th><th>Lun</th><th>Mar</th><th>Mié</th><th>Jue</th><th>Vie</th>${hayFinde ? '<th>Fin sem.</th>' : ''}<th>Total</th></tr></thead><tbody>${filas}</tbody></table></div>`;
}

// ── Ahora en ruta ────────────────────────────────────────────────────────────
function pintarRutaPanel(p) {
  const lista = document.getElementById('panel-ruta-lista');
  const nota = document.getElementById('panel-ruta-nota');
  nota.textContent = `${p.enCursoAhora} de ${p.vehiculos} ${p.vehiculos === 1 ? 'coche' : 'coches'}`;
  if (p.enCurso.length === 0) {
    lista.innerHTML = '<div class="vacio-panel">Ningún coche en ruta ahora mismo<small>Cuando un profesor empiece una práctica desde el móvil, aparecerá aquí en directo.</small></div>';
    return;
  }
  const ahora = new Date();
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  lista.innerHTML = p.enCurso.map(c => {
    const [hh, mm] = (c.hora_inicio || '').split(':').map(Number);
    const trans = c.hora_inicio ? Math.min(c.duracion_min, Math.max(0, minAhora - (hh * 60 + mm))) : 0;
    const arco = (94.25 * trans / c.duracion_min).toFixed(1);
    const aviso = c.hueco_km > 0
      ? `<span class="pill pill-err" style="align-self:flex-start;height:22px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PANEL_ICONOS.aviso}</svg>${c.hueco_km} km sin asignar antes de empezar</span>` : '';
    return `<div class="ruta-item">
      <div class="ruta-info">
        <div class="ruta-linea">${placaHTML(c.matricula)}<span class="ruta-nombre">${esc(c.alumno)}</span></div>
        <span class="ruta-meta">${esc(c.profesor || 'Sin profesor')}${c.hora_inicio ? ' · desde las ' + esc(c.hora_inicio) : ''} · km <b>${fmtMiles(c.km_inicial)}</b></span>
        ${aviso}
      </div>
      <div class="anillo"><svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true"><circle class="a-fondo" cx="18" cy="18" r="15"/><circle class="a-arco" cx="18" cy="18" r="15" stroke-dasharray="${arco} 94.25"/></svg><span>${trans}/${c.duracion_min}′</span></div>
    </div>`;
  }).join('');
}

// ── Próximos exámenes ────────────────────────────────────────────────────────
const TIPO_EXAMEN_TXT = { teorico: 'Teórico', maniobras: 'Maniobras', circulacion: 'Circulación' };
function pintarExamenesPanel(p) {
  const cont = document.getElementById('panel-examenes');
  const nota = document.getElementById('panel-examenes-nota');
  const n = p.proximosExamenes.length;
  nota.textContent = n ? `${p.alumnosConExamen} ${p.alumnosConExamen === 1 ? 'alumno' : 'alumnos'}` : '';
  if (n === 0) {
    cont.innerHTML = '<div class="vacio-panel">No hay exámenes programados<small>Añádelos en Exámenes para verlos aquí.</small></div>';
    return;
  }
  let html = '', ultima = null;
  p.proximosExamenes.forEach(x => {
    if (x.fecha !== ultima) {
      const f = parteFecha(x.fecha);
      const dia = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(new Date(f.y, f.m - 1, f.d));
      html += `<div class="exa-fecha">${esc(dia)} ${f.d} ${MESES_CORTOS[f.m - 1]}</div>`;
      ultima = x.fecha;
    }
    const sub = `${x.clases} ${x.clases === 1 ? 'clase' : 'clases'}${x.profesor ? ' · ' + esc(x.profesor) : ''}`;
    html += `<div class="exa-fila" style="cursor:pointer" onclick="navegarA('examenes')" title="Ir a Exámenes">
      <span class="exa-tipo">${esc(TIPO_EXAMEN_TXT[x.tipo] || x.tipo)}</span>
      <div><div class="exa-nombre">${esc(x.alumno)}</div><div class="exa-sub">${sub}</div></div></div>`;
  });
  cont.innerHTML = html;
}

// ── Avisos ───────────────────────────────────────────────────────────────────
async function pintarAvisosPanel(p) {
  const suc = getSucursalActual();
  const avisos = [];
  const btn = (txt, js) => `<button type="button" class="btn btn-outline" onclick="${js}">${txt}</button>`;

  if (p.sinKm > 0) avisos.push({ nivel: 'err', ic: 'aviso', orden: 0,
    tit: `${p.sinKm} ${p.sinKm === 1 ? 'práctica sin km' : 'prácticas sin km'}`,
    desc: 'Genera los kilómetros de las prácticas en blanco respetando el odómetro del vehículo.',
    btn: btn('Rellenar', "navegarA('generar-km')") });
  if (p.solapamientos > 0) avisos.push({ nivel: 'err', ic: 'aviso', orden: 0,
    tit: `${p.solapamientos} ${p.solapamientos === 1 ? 'solapamiento' : 'solapamientos'} de km`,
    desc: 'Hay prácticas cuyo tramo de kilómetros se pisa con otra del mismo vehículo.',
    btn: btn('Revisar', "navegarA('kilometros','conflictos')") });

  try {
    const cuadrar = (await window.api.getResumenCuadreKm()).filter(c => c.activo && c.problemas > 0);
    if (cuadrar.length) {
      const n = cuadrar.reduce((s, c) => s + c.problemas, 0);
      avisos.push({ nivel: 'err', ic: 'aviso', orden: 0,
        tit: `${n} ${n === 1 ? 'cosa' : 'cosas'} por cuadrar en los km de ${cuadrar.map(c => c.nombre).join(', ')}`,
        desc: 'Hay clases con km que no encajan, clases en blanco por repartir o tramos donde faltan clases.',
        btn: btn('Cuadrar km', `cuadreIrA(${cuadrar[0].vehiculo_id})`) });
    }
  } catch (e) {}

  let reservas = [], venc = [], riesgo = [];
  try { reservas = await window.api.getReservas(suc); } catch (e) {}
  try { venc = await window.api.getProximosVencimientos(30, null, suc); } catch (e) {}
  try { riesgo = await window.api.getAlumnosEnRiesgo(); } catch (e) {}

  const solic = (Array.isArray(reservas) ? reservas : []).filter(r => r.estado === 'solicitada').length;
  if (solic > 0) avisos.push({ nivel: 'warn', ic: 'agenda', orden: 1,
    tit: `${solic} ${solic === 1 ? 'solicitud de reserva pendiente' : 'solicitudes de reserva pendientes'}`,
    desc: 'Los alumnos han pedido clase desde el portal: confírmalas o recházalas.',
    btn: btn('Ver agenda', "navegarA('reservas')") });

  p.bonosCasiAgotados.forEach(b => avisos.push({ nivel: 'warn', ic: 'bono', orden: 1,
    tit: `Bono casi agotado · ${esc(b.alumno)}`,
    desc: `Ha usado ${b.usadas} de ${b.total} clases${b.examen ? ' y tiene el examen el ' + fmtFecha(b.examen) : ''}.`,
    btn: btn('Ver bonos', "navegarA('bonos')") }));

  (Array.isArray(riesgo) ? riesgo : []).slice(0, 2).forEach(r => avisos.push({ nivel: 'warn', ic: 'usuario', orden: 2,
    tit: `${esc(r.nombre)} lleva ${r.diasSinPractica} días sin clase`,
    desc: 'Alumno en riesgo de abandono: conviene contactarle.',
    btn: btn('Ver alumnos', "navegarA('alumnos')") }));

  (Array.isArray(venc) ? venc : []).slice(0, 3).forEach(v => {
    const cuando = v.vencido ? `Venció hace ${Math.abs(v.diasRestantes)} días` : `Quedan ${v.diasRestantes} días`;
    avisos.push({ nivel: v.vencido ? 'err' : 'info', ic: 'llave', orden: v.vencido ? 0 : 3,
      tit: `${esc(v.tipo)} · ${esc(v.nombreEntidad)}`,
      desc: `${cuando} (${fmtFecha(v.fecha_vencimiento)}).`,
      btn: btn('Ver caducidades', "navegarA('vencimientos')") });
  });

  avisos.sort((a, b) => a.orden - b.orden);
  const lista = document.getElementById('dash-alertas');
  const nota = document.getElementById('panel-avisos-nota');
  if (avisos.length === 0) {
    nota.textContent = '';
    lista.innerHTML = `<li class="aviso" style="border-top-color:var(--btn-gray-bg)"><span class="aviso-ic ok">${panelIcono('ok')}</span><div class="aviso-txt"><div class="aviso-tit">Todo en orden</div><div class="aviso-desc">No hay prácticas sin km, solapamientos, caducidades ni solicitudes pendientes.</div></div></li>`;
    return;
  }
  nota.textContent = `${avisos.length} por revisar`;
  lista.innerHTML = avisos.slice(0, 6).map(a =>
    `<li class="aviso"><span class="aviso-ic ${a.nivel}">${panelIcono(a.ic)}</span><div class="aviso-txt"><div class="aviso-tit">${a.tit}</div><div class="aviso-desc">${a.desc}</div></div>${a.btn}</li>`
  ).join('');
}

// Tarjeta "Agenda": solicitudes pendientes de confirmar y próximas reservas
// confirmadas. Módulo opcional (Bloque 2 SaaS) — si getReservas falla o no
// hay nada que mostrar, la tarjeta se oculta sin romper el resto del panel.
async function loadAgendaDashboard() {
  const card = document.getElementById('dash-agenda-card');
  if (!card) return;
  let reservas = [];
  try {
    reservas = await window.api.getReservas(getSucursalActual());
  } catch (e) {
    card.classList.add('hidden');
    return;
  }
  if (!Array.isArray(reservas) || reservas.length === 0) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  const solicitadas = reservas.filter(r => r.estado === 'solicitada');
  const contSolic = document.getElementById('dash-agenda-solicitudes');
  if (solicitadas.length > 0) {
    contSolic.innerHTML =
      `<div class="alert alert-warn" style="cursor:pointer" onclick="navegarA('reservas')" title="Ir a Agenda">` +
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><strong>${solicitadas.length} solicitud(es) pendiente(s).</strong> Ve a <u>Agenda</u> para confirmarlas o rechazarlas.</div>`;
  } else {
    contSolic.innerHTML = '';
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const proximas = reservas
    .filter(r => r.estado === 'confirmada' && r.fecha >= hoy)
    .sort((a, b) => (a.fecha + (a.hora_inicio || '')).localeCompare(b.fecha + (b.hora_inicio || '')))
    .slice(0, 5);

  const contProx = document.getElementById('dash-agenda-proximas');
  if (proximas.length === 0) {
    contProx.innerHTML = '<div style="color:var(--placeholder);font-size:13px">No hay próximas reservas confirmadas.</div>';
  } else {
    contProx.innerHTML = proximas.map(r => {
      const fechaHora = `${fmtFecha(r.fecha)}${r.hora_inicio ? ' · ' + esc(r.hora_inicio) : ''}`;
      const alumno = r.alumno_nombre ? esc(r.alumno_nombre) : '—';
      return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">` +
        `<span>${fechaHora}</span><span>${alumno}</span></div>`;
    }).join('');
  }
}

// Tarjeta "Semáforo de examen": recuento listos/casi/lejos de todos los
// alumnos (heurística v1, ver db/estadisticas.js:getSemaforoExamen). Si
// falla, se oculta sin romper el resto del dashboard.
async function loadSemaforoDashboard() {
  const card = document.getElementById('dash-semaforo-card');
  if (!card) return;
  let semaforo = [];
  try {
    semaforo = await window.api.getSemaforoExamen();
  } catch (e) {
    card.classList.add('hidden');
    return;
  }
  if (!Array.isArray(semaforo) || semaforo.length === 0) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  document.getElementById('dash-semaforo-verde').textContent = semaforo.filter(s => s.nivel === 'verde').length;
  document.getElementById('dash-semaforo-ambar').textContent = semaforo.filter(s => s.nivel === 'ambar').length;
  document.getElementById('dash-semaforo-rojo').textContent = semaforo.filter(s => s.nivel === 'rojo').length;
}

// Tarjeta "Alumnos en riesgo de abandono": alumnos que llevan tiempo sin
// venir a clase (heurística v1, ver db/estadisticas.js:getAlumnosEnRiesgo).
// Si falla, se oculta sin romper el resto del dashboard.
async function loadRiesgoAbandonoDashboard() {
  const card = document.getElementById('dash-riesgo-card');
  if (!card) return;
  let riesgo = [];
  try {
    riesgo = await window.api.getAlumnosEnRiesgo();
  } catch (e) {
    card.classList.add('hidden');
    return;
  }
  if (!Array.isArray(riesgo)) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  const resumen = document.getElementById('dash-riesgo-resumen');
  const lista = document.getElementById('dash-riesgo-lista');

  if (riesgo.length === 0) {
    resumen.innerHTML = '<div class="alert alert-ok"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.27"/></svg>Ningún alumno en riesgo de abandono. Todos siguen dando clases con regularidad.</div>';
    lista.innerHTML = '';
    return;
  }

  resumen.innerHTML =
    `<div class="alert alert-warn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><strong>${riesgo.length} alumno(s) en riesgo.</strong> Llevan más de un mes sin dar clase.</div>`;

  lista.innerHTML = riesgo.slice(0, 5).map(r => {
    return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="navegarA('alumnos')" title="Ir a Alumnos">` +
      `<span>${esc(r.nombre)}</span><span>${r.diasSinPractica} días sin práctica</span></div>`;
  }).join('');
}

// Tarjeta "Caducidades próximas": ITV, seguros, psicotécnicos... a menos de
// 30 días o ya vencidos (heurística v1, ver db/vencimientos.js:getProximosVencimientos).
// Si falla, se oculta sin romper el resto del dashboard.
async function loadVencimientosDashboard() {
  const card = document.getElementById('dash-venc-card');
  if (!card) return;
  let venc = [];
  try {
    venc = await window.api.getProximosVencimientos(30, null, getSucursalActual());
  } catch (e) {
    card.classList.add('hidden');
    return;
  }
  if (!Array.isArray(venc) || venc.length === 0) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  const resumen = document.getElementById('dash-venc-resumen');
  const lista = document.getElementById('dash-venc-lista');

  resumen.innerHTML =
    `<div class="alert alert-warn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><strong>${venc.length} caducidad(es) requieren atención.</strong></div>`;

  lista.innerHTML = venc.slice(0, 5).map(v => {
    const cuando = v.vencido
      ? `vencido hace ${Math.abs(v.diasRestantes)} día(s)`
      : `en ${v.diasRestantes} día(s)`;
    return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="navegarA('vencimientos')" title="Ir a Caducidades">` +
      `<span>${esc(v.tipo)} · ${esc(v.nombreEntidad)}</span><span>${fmtFecha(v.fecha_vencimiento)} — ${cuando}</span></div>`;
  }).join('');
}

function navegarA(page, tab) {
  const link = document.querySelector(`#sidebar nav a[data-page="${page}"]`);
  if (link) link.click();
  if (tab) {
    if (page === 'kilometros') cambiarTabKilometros(tab);
    if (page === 'datos') cambiarTabDatos(tab);
    if (page === 'generar-km') cambiarTabGenerarKm(tab);
  }
}

// ─── PESTAÑAS DE PÁGINA (Kilómetros / Datos) ──────────────────────────────────
function cambiarTabKilometros(tab) {
  document.querySelectorAll('#page-kilometros .page-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#page-kilometros .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-kilometros-' + tab));
  if (tab === 'mapa') loadTimelineSelect();
  if (tab === 'conflictos') { aplicarRangoPref('solap-min', 'solap-max'); loadSolapamientos(); }
}

function cambiarTabDatos(tab) {
  document.querySelectorAll('#page-datos .page-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#page-datos .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-datos-' + tab));
  if (tab === 'importar') aplicarRangoPref('imp-min', 'imp-max');
}

