// ─── TIMELINE DEL VEHÍCULO ───────────────────────────────────────────────────
// Vista de línea de tiempo de kilómetros de un vehículo, con tabla y gráfico
// horizontal de barras por alumno.

// ─── TIMELINE DEL VEHÍCULO ───────────────────────────────────────────────────
async function loadTimelineSelect() {
  const vehiculos = await window.api.getVehiculos();
  const sel = document.getElementById('timeline-vehiculo');
  if (!sel) return;
  sel.innerHTML = vehiculos.length
    ? vehiculos.map(v => `<option value="${v.id}">${esc(v.nombre)}${v.matricula ? ' (' + v.matricula + ')' : ''}${v.activo === false ? ' · retirado' : ''}</option>`).join('')
    : '<option value="">Sin vehículos</option>';
  loadTimeline();
}

async function loadTimeline() {
  const sel = document.getElementById('timeline-vehiculo');
  const result = document.getElementById('timeline-result');
  const resumen = document.getElementById('timeline-resumen');
  if (!sel || !result) return;
  const vid = parseInt(sel.value);
  if (!vid) { result.innerHTML = ''; resumen.textContent = ''; return; }

  const practicas = await window.api.getTimelineVehiculo(vid);
  if (!practicas.length) {
    result.innerHTML = '<div class="card"><p class="empty">Este vehículo no tiene prácticas registradas.</p></div>';
    resumen.textContent = '';
    document.getElementById('timeline-chart-wrap').style.display = 'none';
    return;
  }

  const conKm = practicas.filter(p => !p.sin_km);
  const sinKm = practicas.filter(p => p.sin_km);
  resumen.textContent = `${practicas.length} prácticas · ${conKm.length} con km · ${sinKm.length} sin km`;

  let html = '<div class="table-wrap"><table><thead><tr>'
    + '<th>#</th><th>Alumno</th><th>Fecha</th><th>Km inicial</th><th>Km final</th><th>Recorrido</th><th>Estado</th>'
    + '</tr></thead><tbody>';

  practicas.forEach((p, i) => {
    const diff = p.sin_km ? null : Math.round((p.km_final - p.km_inicial) * 10) / 10;

    // Color de fila según estado
    let rowStyle = '';
    let estadoCell = '<span style="color:var(--success-fg);font-size:12px">✓ OK</span>';

    if (p.sin_km) {
      rowStyle = ' style="background:var(--warn-bg-soft)"';
      estadoCell = '<span style="color:var(--warn-fg-soft);font-size:12px;font-weight:600">⏳ Sin km</span>';
    } else if (p.gap !== null && p.gap < 0) {
      rowStyle = ' style="background:var(--danger-bg-soft)"';
      estadoCell = `<span style="color:var(--danger-fg-soft);font-size:12px;font-weight:600">Solapa ${fmt(p.gap)} km</span>`;
    } else if (p.gap !== null && p.gap > 0) {
      rowStyle = ' style="background:var(--warn-bg-soft)"';
      estadoCell = `<span style="color:var(--warn-fg-soft);font-size:12px;font-weight:600">Hueco +${fmt(p.gap)} km</span>`;
    }

    const kmI = p.sin_km ? '<span style="color:var(--warn-fg-soft);font-style:italic">—</span>' : `<strong>${fmt(p.km_inicial)}</strong>`;
    const kmF = p.sin_km ? '<span style="color:var(--warn-fg-soft);font-style:italic">—</span>' : fmt(p.km_final);
    const rec = p.sin_km ? '—' : `<span class="km-badge">+${diff} km</span>`;

    html += `<tr${rowStyle}>
      <td style="color:var(--text-faint);font-size:12px">${i + 1}</td>
      <td><strong>${esc(p.alumno_nombre)}</strong></td>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${kmI}</td>
      <td>${kmF}</td>
      <td>${rec}</td>
      <td>${estadoCell}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  result.innerHTML = html;

  // ── GRÁFICO HORIZONTAL DE KM ──────────────────────────────────────────────
  renderTimelineChart(practicas, vid);
}

// Paleta de colores para alumnos
const CHART_PALETTE = [
  '#1E4FB8','#2E9E6B','#E09A00','#B42318','#5A5E68','#6B4FB8',
  '#0E8A8A','#F97316','#84CC16','#C2487D','#14B8A6','#A855F7'
];

// ─── MAPA VISUAL DE KM CON ZOOM ──────────────────────────────────────────────
// Toda la vida del cuentakilómetros en una barra. Cuando un alumno hizo dos
// clases hace miles de km y lo dejó, la barra casi entera es hueco: por eso el
// mapa se puede ampliar (rueda, doble clic, botones, teclado), mover
// (arrastrar) y enfocar de un clic cada «tramo» con prácticas. La tira de
// abajo (minimapa) enseña siempre el conjunto y qué parte se está viendo.
const TL = { datos: null, vista: null, barras: [], arrastre: null };
const TL_ANCHO_MIN_KM = 20;   // zoom máximo: unos 20 km de ancho de barra

function renderTimelineChart(practicas, vid) {
  const wrap = document.getElementById('timeline-chart-wrap');
  const barsEl = document.getElementById('timeline-chart-bars');
  const legendEl = document.getElementById('timeline-chart-legend');

  // Solo prácticas con km
  const conKm = practicas.filter(p => !p.sin_km);
  if (!conKm.length) { wrap.style.display = 'none'; TL.datos = null; return; }
  wrap.style.display = 'block';

  const kmMin = Math.min(...conKm.map(p => p.km_inicial));
  const kmMax = Math.max(...conKm.map(p => p.km_final));

  // Mapa alumno → color
  const alumnos = [...new Set(conKm.map(p => p.alumno_nombre))];
  const colorMap = {};
  alumnos.forEach((a, i) => { colorMap[a] = CHART_PALETTE[i % CHART_PALETTE.length]; });

  // Leyenda
  legendEl.innerHTML = alumnos.map(a =>
    `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:3px 9px">
      <span style="width:10px;height:10px;border-radius:3px;background:${colorMap[a]};flex-shrink:0"></span>
      ${esc(a)}
    </span>`
  ).join('');

  // Barras — reusar tooltip si ya existe
  let tooltip = document.getElementById('km-chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'km-chart-tooltip';
    tooltip.style.cssText = 'position:fixed;background:#0f172a;color:#fff;font-size:11px;padding:7px 11px;border-radius:8px;pointer-events:none;opacity:0;transition:opacity .15s;z-index:999;max-width:220px;line-height:1.6;white-space:pre-wrap;box-shadow:0 4px 16px rgba(0,0,0,.3)';
    document.body.appendChild(tooltip);
  }

  // Si se recarga el mismo coche se conserva el zoom; si cambia, se ve todo.
  const mismoCoche = TL.datos && TL.datos.vid === vid && TL.vista;
  TL.datos = { vid, conKm, kmMin, kmMax, colorMap, tramos: tlTramos(conKm, kmMin, kmMax) };
  if (!mismoCoche) TL.vista = tlVistaCompleta();

  barsEl.innerHTML = '';
  TL.barras = conKm.map((p, idx) => {
    const color = colorMap[p.alumno_nombre];
    const isSolap = p.gap !== null && p.gap < 0;
    const isHueco = p.gap !== null && p.gap > 0;

    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute;
      top:0; bottom:0;
      background:${color};
      border-radius:4px;
      opacity:${isSolap ? 1 : 0.82};
      cursor:pointer;
      transition:opacity .12s, transform .12s;
      border:${isSolap ? '2px solid #dc2626' : '1.5px solid rgba(255,255,255,.3)'};
      box-sizing:border-box;
    `;
    bar.className = 'tl-bar';
    bar.style.animationDelay = Math.min(idx * 0.02, 0.6) + 's';

    const diff = Math.round((p.km_final - p.km_inicial) * 10) / 10;
    const tooltipText = `${p.alumno_nombre}\n${fmtFecha(p.fecha)}\n${fmt(p.km_inicial)} → ${fmt(p.km_final)}\n+${diff} km${isSolap ? '\nSOLAPA ' + fmt(p.gap) + ' km' : ''}${isHueco ? '\nHueco +' + fmt(p.gap) + ' km' : ''}`;

    bar.addEventListener('mouseenter', () => {
      if (TL.arrastre) return;
      bar.style.opacity = '1';
      bar.style.transform = 'scaleY(1.1)';
      tooltip.textContent = tooltipText;
      tooltip.style.opacity = '1';
    });
    bar.addEventListener('mousemove', e => {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
    });
    bar.addEventListener('mouseleave', () => {
      bar.style.opacity = isSolap ? '1' : '0.82';
      bar.style.transform = '';
      tooltip.style.opacity = '0';
    });

    barsEl.appendChild(bar);
    return { el: bar, p };
  });

  // Minimapa: todas las prácticas a escala completa (no cambia con el zoom)
  const rangoTotal = (kmMax - kmMin) || 1;
  document.getElementById('tl-mini-barras').innerHTML = conKm.map(p =>
    `<i style="left:${((p.km_inicial - kmMin) / rangoTotal) * 100}%;width:${((p.km_final - p.km_inicial) / rangoTotal) * 100}%;background:${colorMap[p.alumno_nombre]}"></i>`).join('');

  tlEnganchar();
  tlPintar();
}

// Vista inicial: todo, con un pequeño margen a los lados.
function tlVistaCompleta() {
  const { kmMin, kmMax } = TL.datos;
  const margen = Math.max((kmMax - kmMin) * 0.01, 5);
  return { min: kmMin - margen, max: kmMax + margen };
}

// Tramos con prácticas separados por huecos grandes (alumnos que empezaron y
// lo dejaron, coches con historia antigua...). Solo si hay más de uno.
function tlTramos(conKm, kmMin, kmMax) {
  const orden = conKm.slice().sort((a, b) => a.km_inicial - b.km_inicial);
  const umbral = Math.max(300, (kmMax - kmMin) * 0.08);
  const tramos = [];
  let t = null;
  for (const p of orden) {
    if (t && p.km_inicial - t.max <= umbral) { t.max = Math.max(t.max, p.km_final); t.n++; continue; }
    t = { min: p.km_inicial, max: p.km_final, n: 1 };
    tramos.push(t);
  }
  return tramos.length > 1 ? tramos : [];
}

function tlFijarVista(min, max) {
  const d = TL.datos; if (!d) return;
  const completa = tlVistaCompleta();
  const totalAncho = completa.max - completa.min;
  let ancho = Math.min(Math.max(max - min, Math.min(TL_ANCHO_MIN_KM, totalAncho)), totalAncho);
  let ini = (min + max) / 2 - ancho / 2;
  ini = Math.max(completa.min, Math.min(ini, completa.max - ancho));
  TL.vista = { min: ini, max: ini + ancho };
  tlPintar();
}

// factor > 1 acerca; `kmCentro` = punto que queda fijo (el del ratón)
function tlZoom(factor, kmCentro) {
  const v = TL.vista; if (!v) return;
  const c = kmCentro != null ? kmCentro : (v.min + v.max) / 2;
  const ancho = (v.max - v.min) / factor;
  const fr = (c - v.min) / (v.max - v.min);
  tlFijarVista(c - ancho * fr, c - ancho * fr + ancho);
}

function tlVerTodo() { if (!TL.datos) return; TL.vista = tlVistaCompleta(); tlPintar(); }

function tlEnfocarTramo(i) {
  const t = TL.datos && TL.datos.tramos[i]; if (!t) return;
  const margen = Math.max((t.max - t.min) * 0.04, 10);
  tlFijarVista(t.min - margen, t.max + margen);
}

// Marcas del eje en números redondos (1, 2 o 5 × 10^n) que no se pisan.
function tlMarcas(min, max, anchoPx) {
  const maxMarcas = Math.max(2, Math.floor(anchoPx / 110));
  const bruto = (max - min) / maxMarcas;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
  const paso = [1, 2, 5, 10].map(m => m * pot).find(x => x >= bruto) || 10 * pot;
  const marcas = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max; v += paso) marcas.push(Math.round(v));
  return marcas;
}

function tlPintar() {
  const d = TL.datos, v = TL.vista; if (!d || !v) return;
  const track = document.getElementById('timeline-chart-track');
  const anchoPx = track.clientWidth || 1;
  const ancho = v.max - v.min;
  const aPct = km => ((km - v.min) / ancho) * 100;
  const minPct = (3 / anchoPx) * 100;   // que hasta la práctica más corta se vea (3 px)
  for (const { el, p } of TL.barras) {
    const fuera = p.km_final < v.min || p.km_inicial > v.max;
    el.style.display = fuera ? 'none' : '';
    if (fuera) continue;
    el.style.left = aPct(p.km_inicial) + '%';
    el.style.width = Math.max(((p.km_final - p.km_inicial) / ancho) * 100, minPct) + '%';
  }

  const eje = document.getElementById('timeline-chart-axis');
  eje.innerHTML = tlMarcas(v.min, v.max, anchoPx)
    .map(km => ({ km, x: aPct(km) }))
    .filter(m => m.x >= 4 && m.x <= 96)
    .map(m => `<span style="left:${m.x}%">${fmt(m.km)} km</span>`).join('');

  const completa = tlVistaCompleta();
  const total = completa.max - completa.min;
  const enZoom = ancho < total * 0.999;
  const ventana = document.getElementById('tl-mini-ventana');
  ventana.classList.toggle('oculta', !enZoom);
  const rangoDatos = (d.kmMax - d.kmMin) || 1;
  ventana.style.left = Math.max(0, ((v.min - d.kmMin) / rangoDatos) * 100) + '%';
  ventana.style.width = Math.max(1.2, Math.min(100, (ancho / rangoDatos) * 100)) + '%';

  document.getElementById('tl-zoom-info').textContent = enZoom
    ? `${fmt(Math.round(Math.max(v.min, d.kmMin)))} – ${fmt(Math.round(Math.min(v.max, d.kmMax)))} km · ×${fmt(Math.round(total / ancho * 10) / 10)}`
    : `${fmt(Math.round(d.kmMax - d.kmMin))} km de historia`;
  document.getElementById('tl-ver-todo').disabled = !enZoom;

  const tramosEl = document.getElementById('tl-tramos');
  tramosEl.innerHTML = d.tramos.length
    ? '<span>Tramos con prácticas:</span>' + d.tramos.map((t, i) => {
        const on = enZoom && v.min <= t.min + 1 && v.max >= t.max - 1 && ancho < (t.max - t.min) * 1.5 + 40;
        return `<button type="button" class="tl-tramo${on ? ' on' : ''}" onclick="tlEnfocarTramo(${i})" title="Ver de cerca este tramo">${fmt(t.min)} – ${fmt(t.max)} km · ${t.n} ${t.n === 1 ? 'práctica' : 'prácticas'}</button>`;
      }).join('')
    : '';
}

// Eventos (una sola vez: los elementos son fijos en index.html)
function tlEnganchar() {
  const track = document.getElementById('timeline-chart-track');
  if (track.dataset.tlListo) return;
  track.dataset.tlListo = '1';
  const mini = document.getElementById('tl-mini');
  const tooltip = () => document.getElementById('km-chart-tooltip');
  const kmEn = (el, clientX, v) => {
    const r = el.getBoundingClientRect();
    return v.min + ((clientX - r.left) / (r.width || 1)) * (v.max - v.min);
  };

  track.addEventListener('wheel', e => {
    if (!TL.vista) return;
    e.preventDefault();
    tlZoom(e.deltaY < 0 ? 1.35 : 1 / 1.35, kmEn(track, e.clientX, TL.vista));
  }, { passive: false });
  track.addEventListener('dblclick', e => { if (TL.vista) tlZoom(2, kmEn(track, e.clientX, TL.vista)); });
  track.addEventListener('keydown', e => {
    if (!TL.vista) return;
    const paso = (TL.vista.max - TL.vista.min) * 0.15;
    if (e.key === '+' || e.key === '=') tlZoom(1.6);
    else if (e.key === '-') tlZoom(1 / 1.6);
    else if (e.key === 'ArrowLeft') tlFijarVista(TL.vista.min - paso, TL.vista.max - paso);
    else if (e.key === 'ArrowRight') tlFijarVista(TL.vista.min + paso, TL.vista.max + paso);
    else if (e.key === '0' || e.key === 'Home') tlVerTodo();
    else return;
    e.preventDefault();
  });

  // Arrastrar la barra grande = desplazarse por los km
  track.addEventListener('pointerdown', e => {
    if (!TL.vista || e.button !== 0) return;
    TL.arrastre = { modo: 'mover', x: e.clientX, vista: { ...TL.vista }, ancho: track.clientWidth || 1, movido: false };
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener('pointermove', e => {
    const a = TL.arrastre; if (!a || a.modo !== 'mover') return;
    const dx = e.clientX - a.x;
    if (Math.abs(dx) > 3 && !a.movido) { a.movido = true; track.classList.add('arrastrando'); const t = tooltip(); if (t) t.style.opacity = '0'; }
    if (!a.movido) return;
    const dkm = (dx / a.ancho) * (a.vista.max - a.vista.min);
    tlFijarVista(a.vista.min - dkm, a.vista.max - dkm);
  });
  const soltar = () => { TL.arrastre = null; track.classList.remove('arrastrando'); };
  track.addEventListener('pointerup', soltar);
  track.addEventListener('pointercancel', soltar);

  // Minimapa: arrastrar el recuadro lo mueve; arrastrar fuera marca una zona nueva
  const vistaMini = () => ({ min: TL.datos.kmMin, max: TL.datos.kmMax });
  mini.addEventListener('pointerdown', e => {
    if (!TL.datos || e.button !== 0) return;
    const km = kmEn(mini, e.clientX, vistaMini());
    const dentro = e.target.id === 'tl-mini-ventana';
    TL.arrastre = dentro
      ? { modo: 'ventana', km0: km, vista: { ...TL.vista } }
      : { modo: 'marcar', km0: km, x: e.clientX, movido: false };
    mini.setPointerCapture(e.pointerId);
  });
  mini.addEventListener('pointermove', e => {
    const a = TL.arrastre; if (!a || a.modo === 'mover') return;
    const km = kmEn(mini, e.clientX, vistaMini());
    if (a.modo === 'ventana') { tlFijarVista(a.vista.min + (km - a.km0), a.vista.max + (km - a.km0)); return; }
    if (Math.abs(e.clientX - a.x) > 3) a.movido = true;
    if (a.movido) tlFijarVista(Math.min(a.km0, km), Math.max(a.km0, km));
  });
  mini.addEventListener('pointerup', e => {
    const a = TL.arrastre;
    // Un clic sin arrastrar centra ahí la vista (si no había zoom, amplía a un 10 %)
    if (a && a.modo === 'marcar' && !a.movido && TL.vista) {
      const total = tlVistaCompleta();
      const ancho = TL.vista.max - TL.vista.min;
      const w = ancho < (total.max - total.min) * 0.999 ? ancho : (total.max - total.min) * 0.1;
      tlFijarVista(a.km0 - w / 2, a.km0 + w / 2);
    }
    soltar();
  });
  mini.addEventListener('pointercancel', soltar);

  // Al cambiar el tamaño de la ventana se recolocan eje y barras mínimas
  if (window.ResizeObserver) new ResizeObserver(() => tlPintar()).observe(track);
}
