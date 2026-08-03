// ─── GRÁFICOS DEL DASHBOARD ───────────────────────────────────────────────────
// Sistema de gráficos configurables del panel principal: SVG dibujado a mano
// (sin librerías, sin CDN) con tooltip compartido — mismo espíritu que el
// mapa del vehículo de renderer/timeline.js. Un único generador reutilizable
// (renderGraficoBarras) sirve tanto para barras verticales (series por mes)
// como horizontales (rankings de profesor/vehículo); loadGraficos() pinta
// solo los gráficos activados en las preferencias del dashboard.

const MESES_CORTOS_GRAFICO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function graficoEtiquetaMes(mes) {
  const [y, m] = mes.split('-');
  return `${MESES_CORTOS_GRAFICO[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

function graficoTruncar(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// Redondea un máximo hacia arriba a un número "bonito" (1/2/5 × 10^n) para
// que los pasos del eje sean legibles (0 / 25 / 50... en vez de 0 / 23.4 / ...).
function graficoTecho(max) {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = Math.pow(10, exp);
  const norm = max / base;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return niceNorm * base;
}

// Tooltip compartido por todos los gráficos (misma técnica que #km-chart-tooltip
// de renderer/timeline.js, pero con las variables de tema para verse bien en
// los tres temas).
function graficoTooltipEl() {
  let t = document.getElementById('grafico-tooltip');
  if (!t) {
    t = document.createElement('div');
    t.id = 'grafico-tooltip';
    t.className = 'grafico-tooltip';
    document.body.appendChild(t);
  }
  return t;
}

function graficoMostrarTooltip(e, categoria) {
  const t = graficoTooltipEl();
  // Labels y valores son datos del usuario (nombres de profesor/vehículo) →
  // se insertan escapados, nunca con innerHTML sin pasar por esc().
  const filas = categoria.tooltipLineas.map(l =>
    `<div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${l.colorVar};margin-right:6px;vertical-align:middle"></span><span class="lbl">${esc(l.label)}:</span> <strong>${esc(String(l.value))}</strong></div>`
  ).join('');
  t.innerHTML = `<div style="margin-bottom:4px"><strong>${esc(categoria.tituloTooltip)}</strong></div>${filas}`;
  t.style.opacity = '1';
  graficoMoverTooltip(e);
}

function graficoMoverTooltip(e) {
  const t = graficoTooltipEl();
  t.style.left = (e.clientX + 12) + 'px';
  t.style.top = (e.clientY - 10) + 'px';
}

function graficoOcultarTooltip() {
  graficoTooltipEl().style.opacity = '0';
}

// Ruta SVG de una barra con la esquina redondeada solo en el extremo del
// dato; el extremo de la línea base queda cuadrado (norma de la casa para
// marcas de barra: 4px, redondeado arriba/al final, recto en la base).
function graficoPathBarra(orientacion, x, y, w, h, r) {
  if (w <= 0 || h <= 0) return '';
  const rr = Math.max(0, Math.min(r, orientacion === 'vertical' ? w / 2 : h / 2));
  if (rr < 0.5) return `M${x},${y} h${w} v${h} h${-w} Z`;
  if (orientacion === 'vertical') {
    // Crece hacia arriba desde la línea base (y + h); extremo redondeado arriba.
    return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
  }
  // Crece hacia la derecha desde x=marginLeft; extremo redondeado a la derecha.
  return `M${x},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} L${x},${y + h} Z`;
}

/**
 * Generador reutilizable de gráfico de barras — vertical (series por mes) u
 * horizontal (rankings) — en SVG a mano, sin librerías. opts:
 *   contenedorId: id del div donde pintar el SVG
 *   legendId: id del div para la leyenda (opcional; solo con 2+ series)
 *   orientacion: 'vertical' | 'horizontal'
 *   series: [{ nombre, colorVar }]  (2+ series ⇒ siempre lleva leyenda)
 *   categorias: [{ etiqueta, valores:[n,...], tituloTooltip, tooltipLineas:[{label,value,colorVar}] }]
 *   formatoEje(v) -> string para las marcas del eje numérico
 */
function renderGraficoBarras(opts) {
  const cont = document.getElementById(opts.contenedorId);
  if (!cont) return;
  const { categorias, series, orientacion } = opts;
  const formatoEje = opts.formatoEje || (v => fmt(v));

  const hayDatos = categorias && categorias.length > 0 && categorias.some(c => c.valores.some(v => v > 0));
  if (!hayDatos) {
    cont.innerHTML = '<p class="empty">Todavía no hay datos suficientes para este gráfico.</p>';
    if (opts.legendId) { const l = document.getElementById(opts.legendId); if (l) l.innerHTML = ''; }
    return;
  }

  const maxRaw = Math.max(0, ...categorias.flatMap(c => c.valores));
  const ejeMax = graficoTecho(maxRaw || 1);

  const partes = [];  // <rect>/<path> de las barras (con listeners a añadir después)
  const ejeSvg = [];  // rejilla, línea base, marcas y etiquetas
  let viewW, viewH, marginTop = 10, marginBottom = 26;

  if (orientacion === 'vertical') {
    const marginLeft = 42, marginRight = 12;
    viewW = Math.max(420, categorias.length * 58);
    viewH = 220;
    const plotW = viewW - marginLeft - marginRight;
    const plotH = viewH - marginTop - marginBottom;
    const groupWidth = plotW / categorias.length;

    // Rejilla horizontal + marcas del eje Y (5 niveles, igual que el timeline)
    for (let i = 0; i <= 4; i++) {
      const val = ejeMax * i / 4;
      const y = marginTop + plotH - (plotH * i / 4);
      ejeSvg.push(`<line class="grafico-rejilla" x1="${marginLeft}" y1="${y}" x2="${viewW - marginRight}" y2="${y}"/>`);
      ejeSvg.push(`<text class="grafico-eje-texto" x="${marginLeft - 6}" y="${y + 3}" text-anchor="end">${esc(formatoEje(val))}</text>`);
    }
    ejeSvg.push(`<line class="grafico-eje-linea" x1="${marginLeft}" y1="${marginTop + plotH}" x2="${viewW - marginRight}" y2="${marginTop + plotH}"/>`);

    categorias.forEach((c, i) => {
      const groupX = marginLeft + i * groupWidth;
      const barCount = series.length;
      const gap = 2;
      const disponible = groupWidth - 6;
      const barW = Math.max(3, Math.min(24, (disponible - gap * (barCount - 1)) / barCount));
      const totalW = barW * barCount + gap * (barCount - 1);
      const startX = groupX + (groupWidth - totalW) / 2;

      c.valores.forEach((valor, j) => {
        const x = startX + j * (barW + gap);
        const h = ejeMax > 0 ? (valor / ejeMax) * plotH : 0;
        const y = marginTop + plotH - h;
        const d = graficoPathBarra('vertical', x, y, barW, h, 4);
        if (d) partes.push(`<path class="grafico-barra grafico-barra-v" style="animation-delay:${(i * 0.05).toFixed(2)}s" data-idx="${i}" fill="${series[j].colorVar}" d="${d}"/>`);
      });

      // Etiqueta de categoría (mes) bajo el grupo
      const cx = groupX + groupWidth / 2;
      ejeSvg.push(`<text class="grafico-eje-texto" x="${cx}" y="${marginTop + plotH + 18}" text-anchor="middle">${esc(c.etiqueta)}</text>`);
    });
  } else {
    // Horizontal: nombre a la izquierda, barra creciendo a la derecha, valor al final.
    const marginLeft = 104, marginRight = 44;
    marginTop = 8; marginBottom = 8;
    const filaAlto = 30;
    viewW = 460;
    viewH = marginTop + marginBottom + categorias.length * filaAlto;
    const plotW = viewW - marginLeft - marginRight;
    const plotH = viewH - marginTop - marginBottom;

    ejeSvg.push(`<line class="grafico-eje-linea" x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + plotH}"/>`);

    categorias.forEach((c, i) => {
      const rowY = marginTop + i * filaAlto;
      const barH = Math.min(24, filaAlto - 8);
      const y = rowY + (filaAlto - barH) / 2;
      const valor = c.valores[0];
      const w = ejeMax > 0 ? (valor / ejeMax) * plotW : 0;
      const d = graficoPathBarra('horizontal', marginLeft, y, w, barH, 4);
      if (d) partes.push(`<path class="grafico-barra grafico-barra-h" style="animation-delay:${(i * 0.05).toFixed(2)}s" data-idx="${i}" fill="${series[0].colorVar}" d="${d}"/>`);

      ejeSvg.push(`<text class="grafico-eje-texto" x="${marginLeft - 8}" y="${y + barH / 2 + 3}" text-anchor="end">${esc(graficoTruncar(c.etiqueta, 15))}</text>`);
      ejeSvg.push(`<text class="grafico-eje-texto" x="${marginLeft + w + 6}" y="${y + barH / 2 + 3}" text-anchor="start">${esc(formatoEje(valor))}</text>`);
    });
  }

  cont.innerHTML = `<svg viewBox="0 0 ${viewW} ${viewH}" xmlns="http://www.w3.org/2000/svg">${ejeSvg.join('')}${partes.join('')}</svg>`;

  // Tooltip: un listener por barra (igual patrón que renderTimelineChart).
  cont.querySelectorAll('.grafico-barra').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    const categoria = categorias[idx];
    el.addEventListener('mouseenter', e => graficoMostrarTooltip(e, categoria));
    el.addEventListener('mousemove', graficoMoverTooltip);
    el.addEventListener('mouseleave', graficoOcultarTooltip);
    el.addEventListener('focus', e => graficoMostrarTooltip(e, categoria));
    el.addEventListener('blur', graficoOcultarTooltip);
  });

  // Leyenda (siempre presente con 2+ series; con 1 sola el título del card ya dice qué se pinta).
  if (opts.legendId) {
    const l = document.getElementById(opts.legendId);
    if (l) {
      l.innerHTML = series.length > 1
        ? series.map(s => `<span class="grafico-legend-item"><span class="grafico-legend-swatch" style="background:${s.colorVar}"></span>${esc(s.nombre)}</span>`).join('')
        : '';
    }
  }
}

// ─── CARGA DE LOS 5 GRÁFICOS DEL DASHBOARD ────────────────────────────────────
async function loadGraficos() {
  const pref = getDashboardPref();

  const tarjetas = {
    'grafico-card-km-mes': pref.graficoKmMes,
    'grafico-card-practicas-mes': pref.graficoPracticasMes,
    'grafico-card-por-profesor': pref.graficoPorProfesor,
    'grafico-card-por-vehiculo': pref.graficoPorVehiculo,
    'grafico-card-ingresos': pref.graficoIngresos,
  };
  Object.entries(tarjetas).forEach(([id, activo]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !activo);
  });

  const algunoActivo = Object.values(tarjetas).some(Boolean);
  if (!algunoActivo) return;

  const datos = await window.api.getDatosGraficos(12, getSucursalActual());

  if (pref.graficoKmMes) {
    renderGraficoBarras({
      contenedorId: 'grafico-km-mes',
      orientacion: 'vertical',
      series: [{ nombre: 'Km recorridos', colorVar: 'var(--chart-series-1)' }],
      formatoEje: v => fmt(v),
      categorias: datos.kmPorMes.map(m => ({
        etiqueta: graficoEtiquetaMes(m.mes),
        valores: [m.km],
        tituloTooltip: graficoEtiquetaMes(m.mes),
        tooltipLineas: [{ label: 'Km recorridos', value: fmt(m.km) + ' km', colorVar: 'var(--chart-series-1)' }]
      }))
    });
  }

  if (pref.graficoPracticasMes) {
    renderGraficoBarras({
      contenedorId: 'grafico-practicas-mes',
      legendId: 'grafico-practicas-mes-legend',
      orientacion: 'vertical',
      series: [
        { nombre: 'Circulación', colorVar: 'var(--chart-series-1)' },
        { nombre: 'Pista', colorVar: 'var(--chart-series-2)' }
      ],
      formatoEje: v => fmt(v),
      categorias: datos.practicasPorMes.map(m => ({
        etiqueta: graficoEtiquetaMes(m.mes),
        valores: [m.circulacion, m.pista],
        tituloTooltip: graficoEtiquetaMes(m.mes),
        tooltipLineas: [
          { label: 'Circulación', value: m.circulacion, colorVar: 'var(--chart-series-1)' },
          { label: 'Pista', value: m.pista, colorVar: 'var(--chart-series-2)' },
          { label: 'Total', value: m.total, colorVar: 'var(--text-faint)' }
        ]
      }))
    });
  }

  if (pref.graficoPorProfesor) {
    renderGraficoBarras({
      contenedorId: 'grafico-por-profesor',
      orientacion: 'horizontal',
      series: [{ nombre: 'Prácticas', colorVar: 'var(--chart-series-3)' }],
      formatoEje: v => fmt(v),
      categorias: datos.porProfesor.slice(0, 8).map(p => ({
        etiqueta: p.nombre,
        valores: [p.num_practicas],
        tituloTooltip: p.nombre,
        tooltipLineas: [
          { label: 'Prácticas', value: p.num_practicas, colorVar: 'var(--chart-series-3)' },
          { label: 'Km', value: fmt(p.km) + ' km', colorVar: 'var(--chart-series-3)' }
        ]
      }))
    });
  }

  if (pref.graficoPorVehiculo) {
    renderGraficoBarras({
      contenedorId: 'grafico-por-vehiculo',
      orientacion: 'horizontal',
      series: [{ nombre: 'Prácticas', colorVar: 'var(--chart-series-7)' }],
      formatoEje: v => fmt(v),
      categorias: datos.porVehiculo.slice(0, 8).map(v => ({
        etiqueta: v.nombre,
        valores: [v.num_practicas],
        tituloTooltip: v.nombre,
        tooltipLineas: [
          { label: 'Prácticas', value: v.num_practicas, colorVar: 'var(--chart-series-7)' },
          { label: 'Km', value: fmt(v.km) + ' km', colorVar: 'var(--chart-series-7)' }
        ]
      }))
    });
  }

  if (pref.graficoIngresos) {
    renderGraficoBarras({
      contenedorId: 'grafico-ingresos',
      orientacion: 'vertical',
      series: [{ nombre: 'Cobrado', colorVar: 'var(--chart-series-6)' }],
      formatoEje: v => fmt(v) + ' €',
      categorias: datos.ingresosPorMes.map(m => ({
        etiqueta: graficoEtiquetaMes(m.mes),
        valores: [m.cobrado],
        tituloTooltip: graficoEtiquetaMes(m.mes),
        tooltipLineas: [{ label: 'Cobrado', value: fmt(m.cobrado) + ' €', colorVar: 'var(--chart-series-6)' }]
      }))
    });
  }
}
