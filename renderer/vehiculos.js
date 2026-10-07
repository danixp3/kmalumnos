// ─── VEHÍCULOS ───────────────────────────────────────────────────────────────
// CRUD de vehículos, relleno masivo de km y contador de prácticas sin km.

// ─── VEHÍCULOS ───────────────────────────────────────────────────────────────
// Tarjetas por vehículo (odómetro, km del mes, ITV), línea de continuidad del
// cuentakilómetros de hoy y resumen del mes. Datos: db.getPanelVehiculos.
// Los coches retirados (activo = false) salen aparte, abajo: conservan su
// historial pero no se ofrecen para dar clase ni cuentan en las estadísticas.
let panelVehiculosCache = null;

async function loadVehiculos() {
  vehiculosCache = await window.api.getVehiculos(getSucursalActual());

  // Actualizar select de relleno masivo
  const sel = document.getElementById('relleno-vehiculo');
  if (sel) {
    const actual = sel.value;
    sel.innerHTML = vehiculosCache.map(v => `<option value="${v.id}">${esc(v.nombre)}</option>`).join('');
    if ([...sel.options].some(o => o.value === actual)) sel.value = actual;
    actualizarContadorSinKm();
  }

  const cont = document.getElementById('veh-tarjetas');
  if (!vehiculosCache.length) {
    cont.innerHTML = '<div class="card vacio-panel" style="grid-column:1/-1">No hay vehículos registrados. Añade el primero con «Añadir vehículo».</div>';
    document.getElementById('veh-continuidad').style.display = 'none';
    document.getElementById('veh-resumen').style.display = 'none';
    loadAnalisisVehiculos();
    return;
  }
  document.getElementById('veh-continuidad').style.display = '';
  document.getElementById('veh-resumen').style.display = '';

  const panel = await window.api.getPanelVehiculos(undefined, getSucursalActual(), getDuracionClaseMin());
  panelVehiculosCache = panel;
  pintarTarjetasVehiculos(panel);
  pintarRetiradosVehiculos();
  pintarContinuidadVehiculos(panel);
  pintarResumenVehiculos(panel);
  loadAnalisisVehiculos();
}

function pintarTarjetasVehiculos(panel) {
  const [y, m] = panel.hoy.split('-').map(Number);
  const mesTxt = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' }).toUpperCase();
  const porId = new Map(vehiculosCache.map(v => [v.id, v]));
  const enUso = panel.vehiculos.filter(v => (porId.get(v.id) || {}).activo !== false);
  document.getElementById('veh-tarjetas').innerHTML = (enUso.length ? '' : '<div class="card vacio-panel" style="grid-column:1/-1">Todos los vehículos están retirados. Vuelve a poner en uso alguno desde «Retirados».</div>') + enUso.map(v => {
    const datos = porId.get(v.id) || {};
    const estado = v.en_practica
      ? '<span class="pill pill-dark"><span class="pill-dot"></span>En práctica</span>'
      : '<span class="pill pill-line">Libre</span>';
    let itv = '<span class="veh-itv">Sin ITV registrada en Caducidades</span>';
    if (v.itv) {
      itv = v.itv.vencida
        ? `<span class="veh-itv veh-itv-aviso">${panelIcono('aviso', 14)} ITV vencida el ${fmtFecha(v.itv.fecha)}</span>`
        : (v.itv.dias <= 30
          ? `<span class="veh-itv veh-itv-aviso">${panelIcono('aviso', 14)} ITV el ${diaMes(v.itv.fecha)} ${parteFecha(v.itv.fecha).y}, dentro de ${v.itv.dias} días</span>`
          : `<span class="veh-itv">ITV en vigor hasta el ${diaMes(v.itv.fecha)} ${parteFecha(v.itv.fecha).y}</span>`);
    }
    const sinKm = v.sin_km > 0
      ? `<button type="button" class="pill pill-warn" style="border:none;cursor:pointer" onclick="seleccionarRellenoVehiculo(${v.id})" title="Ir al relleno masivo de este vehículo">${v.sin_km} sin km · Rellenar</button>` : '';
    const nombreArg = esc(v.nombre), matArg = esc(v.matricula || '');
    return `<article class="card veh-card">
      <div class="veh-top">
        ${v.matricula ? placaHTML(v.matricula, true) : '<span class="pill">Sin matrícula</span>'}
        <div class="veh-top-der">${estado}
          <details class="menu-fila">
            <summary class="btn btn-gray btn-sm btn-icon" title="Más acciones" aria-label="Más acciones de ${nombreArg}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></summary>
            <div class="menu-fila-lista">
              <button type="button" onclick="openEditVehiculo(${v.id})">${svgMini('editar')} Editar datos</button>
              <button type="button" onclick="retirarVehiculo(${v.id}, false)" title="Deja de salir para dar clase (registro rápido, móvil, estadísticas); su historial se conserva">${svgMini('retirar')} Retirar</button>
              <button type="button" class="menu-fila-borrar" onclick="deleteVehiculo(${v.id},'${nombreArg}')">${svgMini('borrar')} Borrar</button>
            </div>
          </details>
        </div>
      </div>
      <h3 class="veh-nombre">${esc(v.nombre)}</h3>
      <div class="veh-sub">${[[datos.marca, datos.modelo].filter(Boolean).map(esc).join(' '), datos.cambio === 'automatico' ? 'automático' : '', v.profesor_habitual ? esc(v.profesor_habitual) + ' · profesor habitual' : 'Sin profesor habitual'].filter(Boolean).join(' · ')}</div>
      <div class="veh-odo"><span class="num-mono">${fmtMiles(v.km_actual)}</span><span class="veh-odo-u">km</span>${v.registro_hora ? `<span class="veh-odo-r">registro de las ${esc(v.registro_hora)}</span>` : ''}</div>
      <div class="veh-kpis">
        <div><span class="eyebrow">${mesTxt}</span><b class="num-mono">${fmtMiles(v.recorridos_mes)} km</b></div>
        <div><span class="eyebrow">Prácticas</span><b class="num-mono">${fmtMiles(v.practicas_mes)}</b></div>
        <div><span class="eyebrow">Sin asignar</span><b class="num-mono${v.sin_asignar_mes > 0 ? ' rojo' : ''}">${v.sin_asignar_mes > 0 ? panelIcono('aviso', 13) + ' ' : ''}${fmtMiles(v.sin_asignar_mes)} km</b></div>
      </div>
      <div class="veh-pie">${itv}${sinKm}</div>
    </article>`;
  }).join('');
}

// Línea de tiempo de HOY por vehículo: bloques a escala horaria + línea de "ahora".
// Las marcas horarias se espacian según el ancho real (con la ventana pequeña o
// un día largo, p. ej. una práctica a las 00:30, iban todas pegadas y se
// pisaban) y se vuelve a pintar al cambiar el tamaño de la ventana.
let contUltimoPanel = null;
function pintarContinuidadVehiculos(panel) {
  contUltimoPanel = panel;
  const cuerpo = document.getElementById('veh-continuidad-cuerpo');
  if (!cuerpo.dataset.vigilado && window.ResizeObserver) {
    cuerpo.dataset.vigilado = '1';
    let ancho = 0, raf = 0;
    new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (!w || w === ancho) return;
      ancho = w; cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (contUltimoPanel) pintarContinuidadVehiculos(contUltimoPanel); });
    }).observe(cuerpo);
  }
  const aMin = t => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi; };
  const bloques = panel.vehiculos.flatMap(v => v.bloques_hoy.filter(b => b.inicio));
  let h0 = 8, h1 = 19;
  bloques.forEach(b => { h0 = Math.min(h0, Math.floor(aMin(b.inicio) / 60)); h1 = Math.max(h1, Math.ceil(aMin(b.fin || b.inicio) / 60), Math.ceil((aMin(b.inicio) + 45) / 60)); });
  h1 = Math.min(24, h1);
  // Ancho útil de la pista: el de la tarjeta menos la columna de etiquetas (200 + 12)
  const anchoPista = Math.max(120, (cuerpo.clientWidth || 900) - 212);
  const paso = [1, 2, 3, 4, 6].find(p => anchoPista / ((h1 - h0) / p) >= 54) || 6;
  h0 = Math.floor(h0 / paso) * paso; h1 = Math.min(24, Math.ceil(h1 / paso) * paso);
  const t0 = h0 * 60, t1 = h1 * 60, span = t1 - t0;
  const pos = min => Math.max(0, Math.min(100, ((min - t0) / span) * 100));
  const horas = [];
  for (let h = h0; h <= h1; h += paso) horas.push(h);
  const ahora = new Date();
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const lineaAhora = (minAhora >= t0 && minAhora <= t1) ? `<span class="cont-ahora" style="left:${pos(minAhora)}%"><em>${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}</em></span>` : '';
  const px = pct => (pct / 100) * anchoPista;

  // La hora de «ahora» solo se rotula en la primera fila (en las demás, la línea)
  const lineaSinHora = lineaAhora.replace(/<em>.*<\/em>/, '');
  const filas = panel.vehiculos.map((v, iv) => {
    // Una clase sin hora de fin real (fin estimado: inicio + minutos por clase)
    // se acorta hasta donde empezó la siguiente, para que no se monten.
    const conHora = v.bloques_hoy.filter(b => b.inicio).sort((x, y) => aMin(x.inicio) - aMin(y.inicio));
    const finDe = (b, i) => {
      const ini = aMin(b.inicio);
      let fin = b.fin ? aMin(b.fin) : ini + 45;
      if (fin < ini) fin = Math.min(24 * 60, ini + 45); // pasa de medianoche
      const sig = b.tipo === 'hueco' ? null : conHora.slice(i + 1).find(x => x.tipo !== 'hueco');
      if ((b.fin_estimado || !b.fin) && sig && aMin(sig.inicio) < fin) fin = Math.max(ini + 5, aMin(sig.inicio));
      return fin;
    };
    const huecos = [], clases = [];
    conHora.forEach((b, i) => {
      const ini = aMin(b.inicio), fin = finDe(b, i);
      const l = pos(ini), w = Math.max(1.2, pos(fin) - l);
      (b.tipo === 'hueco' ? huecos : clases).push({ b, l, w, ini, fin });
    });
    // Clases que aun así se pisan en la pantalla (clases de segundos, anotadas a
    // la misma hora, horas que se solapan): un solo bloque «2 clases · 50 km»
    const grupos = [];
    for (const c of clases) {
      const g = grupos[grupos.length - 1];
      if (g && c.l < g.der - 0.05) { g.items.push(c); g.der = Math.max(g.der, c.l + c.w); } else grupos.push({ items: [c], izq: c.l, der: c.l + c.w });
    }
    const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const detalle = ({ b, ini, fin }) => `${b.alumno || '—'}${b.km ? ' · ' + b.km + ' km' : ''} · ${hhmm(ini)}–${hhmm(fin)}`;
    const bl = grupos.map(g => {
      const w = g.der - g.izq;
      // Si el bloque es más estrecho que su texto, el dato queda en el tooltip
      const cabe = t => px(w) >= String(t).length * 7.5 + 8;
      if (g.items.length === 1) {
        const { b } = g.items[0];
        const txt = b.tipo === 'hecha' ? `${b.km} km` : esc((b.alumno || '').split(' ')[0]);
        return `<span class="bl-el bl-${b.tipo}-el" style="left:${g.izq}%;width:${w}%" title="${esc(detalle(g.items[0]))}">${cabe(txt) ? txt : ''}</span>`;
      }
      const tipos = g.items.map(x => x.b.tipo);
      const tipo = tipos.includes('curso') ? 'curso' : tipos.every(t => t === 'prog') ? 'prog' : 'hecha';
      const km = g.items.reduce((s, x) => s + (x.b.tipo === 'hecha' ? x.b.km : 0), 0);
      const n = g.items.length;
      const txt = [km ? `${n} clases · ${km} km` : `${n} clases`, km ? `${km} km` : `${n}`].find(cabe) || '';
      return `<span class="bl-el bl-${tipo}-el bl-grupo-el" style="left:${g.izq}%;width:${w}%" title="${esc(`${n} clases juntas:\n` + g.items.map(detalle).join('\n'))}">${txt}</span>`;
    }).join('') + huecos.map(({ b, l, w }) => `<span class="bl-el bl-hueco-el" style="left:${l}%;width:${Math.max(w, 1.8)}%" title="${b.km} km sin asignar"><em>+${b.km} km</em></span>`).join('');
    const sub = `${v.profesor_habitual ? esc(v.profesor_habitual) + ' · ' : ''}${v.km_hoy} km hoy${v.hueco_hoy ? ' + ' + v.hueco_hoy : ''}`;
    return `<div class="cont-fila"><div class="cont-etq">${placaHTML(v.matricula) || esc(v.nombre)}<span>${sub}</span></div><div class="cont-pista" style="background-size:calc(100% / ${horas.length - 1}) 100%">${bl}${iv === 0 ? lineaAhora : lineaSinHora}</div></div>`;
  }).join('');
  cuerpo.innerHTML = `<div class="cont-cab"><span class="cont-etq"></span><div class="cont-horas">${horas.map(h => `<span style="left:${pos(h * 60)}%">${String(h).padStart(2, '0')}:00</span>`).join('')}</div></div>${filas}`;
}

function pintarResumenVehiculos(panel) {
  const [y, m] = panel.hoy.split('-').map(Number);
  const mesTxt = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
  document.getElementById('h-resumen-veh').textContent = `Resumen de ${mesTxt}`;
  document.getElementById('veh-resumen-nota').textContent = `Del 1 al ${parteFecha(panel.hoy).d} de ${mesTxt}`;
  const dash = '<span style="color:var(--text-faint)">—</span>';
  const fila = v => `<tr>
    <td><b>${esc(v.matricula || '')}${v.matricula ? ' · ' : ''}${esc(v.nombre)}</b></td>
    <td class="col-num num-mono">${v.km_inicio_mes != null ? fmtMiles(v.km_inicio_mes) : dash}</td>
    <td class="col-num num-mono">${fmtMiles(v.km_actual)}</td>
    <td class="col-num num-mono">${fmtMiles(v.recorridos_mes)}</td>
    <td class="col-num num-mono">${fmtMiles(v.km_en_practicas_mes)}</td>
    <td class="col-num num-mono${v.sin_asignar_mes > 0 ? ' rojo' : ''}">${v.sin_asignar_mes > 0 ? panelIcono('aviso', 13) + ' ' : ''}${fmtMiles(v.sin_asignar_mes)}</td>
    <td class="col-num num-mono">${fmtMiles(v.practicas_mes)}</td>
    <td class="col-num num-mono">${fmtDec(v.km_por_practica)}</td>
  </tr>`;
  const t = panel.total;
  document.querySelector('#tabla-vehiculos tbody').innerHTML = panel.vehiculos.map(fila).join('') +
    `<tr class="fila-total"><td><b>Total flota</b></td><td class="col-num">${dash}</td><td class="col-num">${dash}</td>
      <td class="col-num num-mono"><b>${fmtMiles(t.recorridos_mes)}</b></td><td class="col-num num-mono"><b>${fmtMiles(t.km_en_practicas_mes)}</b></td>
      <td class="col-num num-mono${t.sin_asignar_mes > 0 ? ' rojo' : ''}"><b>${fmtMiles(t.sin_asignar_mes)}</b></td>
      <td class="col-num num-mono"><b>${fmtMiles(t.practicas_mes)}</b></td><td class="col-num num-mono"><b>${fmtDec(t.km_por_practica)}</b></td></tr>`;
}

// El relleno de km vive en Kilómetros (asistente): se abre con este vehículo ya elegido.
function seleccionarRellenoVehiculo(id) {
  cuadreIrA(id);
}

// Coches retirados: lista aparte, con «Volver a usar»
function pintarRetiradosVehiculos() {
  const cont = document.getElementById('veh-retirados');
  if (!cont) return;
  const retirados = vehiculosCache.filter(v => v.activo === false);
  if (!retirados.length) { cont.hidden = true; cont.innerHTML = ''; return; }
  cont.hidden = false;
  cont.innerHTML = `<div class="card-head"><h2>Retirados <span class="card-note">· ${retirados.length}</span></h2>
      <span class="card-note">No salen para dar clase ni en las estadísticas; sus prácticas siguen en el historial.</span></div>
    <div class="veh-retirados-lista">${retirados.map(v => `<div class="veh-retirado">
      ${v.matricula ? placaHTML(v.matricula) : '<span class="pill">Sin matrícula</span>'}
      <div class="veh-retirado-txt"><b>${esc(v.nombre)}</b><small>${[[v.marca, v.modelo].filter(Boolean).map(esc).join(' '), v.fecha_baja ? 'retirado el ' + fmtFecha(v.fecha_baja) : 'retirado', fmtMiles(v.km_actual) + ' km'].filter(Boolean).join(' · ')}</small></div>
      <div class="fd-acciones"><button type="button" class="btn btn-outline btn-sm" onclick="retirarVehiculo(${v.id}, true)">Volver a usar</button>
        <button type="button" class="btn btn-gray btn-sm" onclick="openEditVehiculo(${v.id})">Editar</button>
        <button type="button" class="btn btn-gray btn-sm btn-borrar" onclick="deleteVehiculo(${v.id},'${esc(v.nombre)}')">Borrar</button></div>
    </div>`).join('')}</div>`;
}

async function retirarVehiculo(id, enUso) {
  const v = vehiculosCache.find(x => x.id === id);
  if (!enUso && !await confirmar(`¿Retirar «${v ? v.nombre : 'el vehículo'}»? Dejará de salir para dar clase (registro rápido, móvil, estadísticas). Sus prácticas se conservan y puedes volver a ponerlo en uso cuando quieras.`, { textoAceptar: 'Retirar' })) return;
  const r = await window.api.setVehiculoActivo(id, enUso);
  if (!r || !r.ok) { avisar((r && r.error) || 'No se pudo cambiar.'); return; }
  loadVehiculos();
}

function abrirNuevoVehiculo() {
  ['v-nombre', 'v-matricula', 'v-km'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  openModal('modal-vehiculo-nuevo');
  setTimeout(() => document.getElementById('v-nombre')?.focus(), 60);
}

// ─── ANÁLISIS DE USO Y COSTE DE COMBUSTIBLE ───────────────────────────────
// Una sola llamada a getAnalisisVehiculos() (evita N+1); el coste se calcula
// aquí con el precio/consumo configurados en Ajustes (renderer/ajustes.js).
async function loadAnalisisVehiculos() {
  const tbody = document.querySelector('#tabla-analisis-vehiculos tbody');
  if (!tbody) return;

  const analisis = await window.api.getAnalisisVehiculos();
  if (!analisis.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay vehículos registrados</td></tr>';
    return;
  }

  const precio = getPrecioCombustible();
  const consumo = getConsumoMedio();

  tbody.innerHTML = analisis.map(v => {
    const coste = v.kmTotales * (consumo / 100) * precio;
    const costeTxt = coste.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<tr>
      <td><strong>${esc(v.nombre)}</strong></td>
      <td>${esc(v.matricula) || '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>${v.nPracticas}</td>
      <td>${fmt(v.kmTotales)} km</td>
      <td>${fmt(v.mediaKmPractica)} km</td>
      <td>${fmt(v.kmUltimos30)} km</td>
      <td>${costeTxt} €</td>
    </tr>`;
  }).join('');
}

async function actualizarContadorSinKm() {
  const sel = document.getElementById('relleno-vehiculo');
  const info = document.getElementById('relleno-sinKm');
  if (!sel || !info) return;
  const vid = parseInt(sel.value);
  if (!vid) { info.textContent = ''; return; }
  const n = await window.api.getPracticasSinKm(vid);
  info.textContent = n > 0 ? `${n} práctica(s) sin km` : '✓ Todo relleno';
  info.style.color = n > 0 ? 'var(--warn-fg-soft)' : 'var(--success-fg)';
}

async function rellenarMasivo() {
  const sel = document.getElementById('relleno-vehiculo');
  const vid = parseInt(sel.value);
  if (!vid) { alert('Selecciona un vehículo.'); return; }
  const min = parseFloat(document.getElementById('relleno-min').value) || 40;
  const max = parseFloat(document.getElementById('relleno-max').value) || 45;
  if (max <= min) { alert('El máximo debe ser mayor que el mínimo.'); return; }
  
  // Topes opcionales del odómetro
  const inicioVal = document.getElementById('relleno-inicio').value;
  const finalVal = document.getElementById('relleno-final').value;
  const inicio = inicioVal ? parseFloat(inicioVal) : null;
  const final = finalVal ? parseFloat(finalVal) : null;
  
  if (inicio !== null && final !== null && final <= inicio) {
    alert('El tope final debe ser mayor que el tope inicial.'); return;
  }

  const n = await window.api.getPracticasSinKm(vid);
  if (n === 0) {
    const el = document.getElementById('relleno-alert');
    el.className = 'alert alert-info'; el.textContent = 'Este vehículo no tiene prácticas con km en blanco.'; el.classList.remove('hidden');
    return;
  }

  const topeInfo = (inicio || final) ? `\n\nTope odómetro: ${inicio || '(auto)'} → ${final || '(sin límite)'}` : '';
  if (!await confirmar(`Se van a generar km para ${n} práctica(s) con km en blanco del vehículo seleccionado.\n\nRango por práctica: ${min}-${max} km${topeInfo}\n\n¿Continuar?`)) return;

  const result = await window.api.rellenarKmMasivo(vid, min, max, inicio, final);
  const el = document.getElementById('relleno-alert');
  el.className = 'alert alert-ok';
  const saltadasMsg = result.saltadas ? ` (${result.saltadas} saltadas por tope)` : '';
  el.innerHTML = `${result.rellenadas} práctica(s) rellenadas${saltadasMsg}. &nbsp;
    <button class="btn btn-warn btn-sm" style="margin-left:8px" onclick="navegarA('kilometros','conflictos')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Verificar solapamientos ahora
    </button>`;
  el.classList.remove('hidden');
  loadVehiculos();
}

async function addVehiculo() {
  const nombre = document.getElementById('v-nombre').value.trim();
  const matricula = document.getElementById('v-matricula').value.trim();
  const km = parseFloat(document.getElementById('v-km').value) || 0;
  if (!nombre) { alert('Introduce un nombre para el vehículo.'); return; }
  await window.api.addVehiculo(nombre, matricula, km, getSucursalActual());
  document.getElementById('v-nombre').value = '';
  document.getElementById('v-matricula').value = '';
  document.getElementById('v-km').value = '';
  closeModal('modal-vehiculo-nuevo');
  loadVehiculos();
}

async function deleteVehiculo(id, nombre) {
  if (!await confirmar(`¿Borrar el vehículo "${nombre}"? Se eliminará de todos los alumnos asignados.`, { peligro: true, textoAceptar: 'Borrar' })) return;
  await window.api.deleteVehiculo(id);
  loadVehiculos();
}

const CAMPOS_VEHICULO_MODAL = ['marca', 'modelo', 'cambio', 'fecha_alta', 'itv_ultima', 'aseguradora', 'poliza', 'observaciones'];
function openEditVehiculo(id) {
  const v = vehiculosCache.find(x => x.id === id);
  if (!v) return;
  document.getElementById('edit-v-id').value = id;
  document.getElementById('edit-v-nombre').value = v.nombre || '';
  document.getElementById('edit-v-matricula').value = v.matricula || '';
  document.getElementById('edit-v-km').value = v.km_actual || 0;
  for (const c of CAMPOS_VEHICULO_MODAL) { const el = document.getElementById('edit-v-' + c); if (el) el.value = v[c] || ''; }
  document.getElementById('edit-v-activo').checked = v.activo !== false;
  openModal('modal-vehiculo');
}

async function saveVehiculo() {
  const id = parseInt(document.getElementById('edit-v-id').value);
  const nombre = document.getElementById('edit-v-nombre').value.trim();
  const matricula = document.getElementById('edit-v-matricula').value.trim();
  const km = parseFloat(document.getElementById('edit-v-km').value);
  if (!nombre) { alert('Introduce un nombre para el vehículo.'); return; }
  if (isNaN(km)) { alert('Introduce un km válido.'); return; }
  const datos = { activo: document.getElementById('edit-v-activo').checked };
  for (const c of CAMPOS_VEHICULO_MODAL) { const el = document.getElementById('edit-v-' + c); if (el) datos[c] = el.value.trim(); }
  const antes = vehiculosCache.find(x => x.id === id) || {};
  await window.api.updateVehiculo(id, nombre, matricula, datos);
  if ((antes.activo !== false) !== datos.activo) await window.api.setVehiculoActivo(id, datos.activo);
  await window.api.updateVehiculoKm(id, km);
  closeModal('modal-vehiculo');
  loadVehiculos();
}

