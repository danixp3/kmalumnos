// ─── TIMELINE DEL VEHÍCULO ───────────────────────────────────────────────────
// Vista de línea de tiempo de kilómetros de un vehículo, con tabla y gráfico
// horizontal de barras por alumno.

// ─── TIMELINE DEL VEHÍCULO ───────────────────────────────────────────────────
async function loadTimelineSelect() {
  const vehiculos = await window.api.getVehiculos();
  const sel = document.getElementById('timeline-vehiculo');
  if (!sel) return;
  sel.innerHTML = vehiculos.length
    ? vehiculos.map(v => `<option value="${v.id}">${esc(v.nombre)}${v.matricula ? ' (' + v.matricula + ')' : ''}</option>`).join('')
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
  renderTimelineChart(practicas);
}

// Paleta de colores para alumnos
const CHART_PALETTE = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6','#a855f7'
];

function renderTimelineChart(practicas) {
  const wrap = document.getElementById('timeline-chart-wrap');
  const barsEl = document.getElementById('timeline-chart-bars');
  const axisEl = document.getElementById('timeline-chart-axis');
  const legendEl = document.getElementById('timeline-chart-legend');

  // Solo prácticas con km
  const conKm = practicas.filter(p => !p.sin_km);
  if (!conKm.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  const kmMin = Math.min(...conKm.map(p => p.km_inicial));
  const kmMax = Math.max(...conKm.map(p => p.km_final));
  const rango = kmMax - kmMin || 1;

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

  barsEl.innerHTML = '';
  conKm.forEach((p, idx) => {
    const left  = ((p.km_inicial - kmMin) / rango) * 100;
    const width = Math.max(((p.km_final - p.km_inicial) / rango) * 100, 0.3);
    const color = colorMap[p.alumno_nombre];
    const isSolap = p.gap !== null && p.gap < 0;
    const isHueco = p.gap !== null && p.gap > 0;

    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute;
      left:${left}%;
      width:${width}%;
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
    bar.style.animationDelay = (idx * 0.02) + 's';

    const diff = Math.round((p.km_final - p.km_inicial) * 10) / 10;
    const tooltipText = `${p.alumno_nombre}\n${fmtFecha(p.fecha)}\n${fmt(p.km_inicial)} → ${fmt(p.km_final)}\n+${diff} km${isSolap ? '\nSOLAPA ' + fmt(p.gap) + ' km' : ''}${isHueco ? '\nHueco +' + fmt(p.gap) + ' km' : ''}`;

    bar.addEventListener('mouseenter', e => {
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
  });

  // Eje de km (5 marcas)
  axisEl.innerHTML = '';
  for (let i = 0; i <= 4; i++) {
    const val = kmMin + (rango * i / 4);
    const span = document.createElement('span');
    span.textContent = fmt(Math.round(val)) + ' km';
    axisEl.appendChild(span);
  }
}

