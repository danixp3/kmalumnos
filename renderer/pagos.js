// ─── PAGOS ────────────────────────────────────────────────────────────────────
// Deudas, filtros/orden de la tabla de morosos, pagos, historial, desglose FIFO
// de prácticas pagadas/pendientes y tarifas por permiso.

// ─── PAGOS ────────────────────────────────────────────────────────────────────
function cambiarTabPagos(tab) {
  document.querySelectorAll('#page-pagos .page-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#page-pagos .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-pagos-' + tab));
  if (tab === 'deudas') loadDeudas();
  if (tab === 'tarifas') loadTarifas();
}

async function loadDeudas() {
  deudasCache = await window.api.getDeudas(getSucursalActual());
  const aviso = document.getElementById('pagos-aviso-sin-tarifa');
  aviso.classList.toggle('hidden', !deudasCache.some(d => d.sin_tarifa));

  // Las stat-cards se calculan siempre sobre el dataset completo, no el filtrado
  const conDeuda = deudasCache.filter(d => d.saldo > 0);
  animarContador(document.getElementById('deudas-resumen-num'), conDeuda.length);
  animarContador(document.getElementById('deudas-resumen-total'), conDeuda.reduce((sum, d) => sum + d.saldo, 0), v => fmt(v) + ' €');

  poblarFiltroPermisosDeudas();
  renderDeudasTabla();
}

// ─── Filtros y ordenación de la tabla de deudas (en memoria, sobre deudasCache) ───
function poblarFiltroPermisosDeudas() {
  const selPermiso = document.getElementById('f-deudas-permiso');
  if (!selPermiso) return;
  const permisoActual = selPermiso.value;
  const permisosOpts = [...new Set(deudasCache.map(d => d.permiso).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  selPermiso.innerHTML = '<option value="">Todos los permisos</option>' +
    permisosOpts.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  if ([...selPermiso.options].some(o => o.value === permisoActual)) selPermiso.value = permisoActual;
}

function limpiarFiltrosDeudas() {
  const nombre = document.getElementById('f-deudas-nombre');
  const estado = document.getElementById('f-deudas-estado');
  const permiso = document.getElementById('f-deudas-permiso');
  if (nombre) nombre.value = '';
  if (estado) estado.value = 'con-deuda';
  if (permiso) permiso.value = '';
  renderDeudasTabla();
}

function ordenarDeudas(col) {
  if (deudasSort.col === col) {
    deudasSort.dir *= -1;
  } else {
    deudasSort.col = col;
    deudasSort.dir = 1;
  }
  renderDeudasTabla();
}

function actualizarIndicadoresOrdenDeudas() {
  document.querySelectorAll('#tabla-deudas thead th[data-sort]').forEach(th => {
    const ind = th.querySelector('.sort-ind');
    if (!ind) return;
    if (th.dataset.sort === deudasSort.col) {
      ind.innerHTML = deudasSort.dir === 1 ? SVG_SORT_ASC : SVG_SORT_DESC;
      th.classList.add('sort-active');
    } else {
      ind.innerHTML = '';
      th.classList.remove('sort-active');
    }
  });
}

function renderDeudasTabla() {
  const tbody = document.querySelector('#tabla-deudas tbody');
  if (!deudasCache.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay alumnos registrados</td></tr>';
    actualizarIndicadoresOrdenDeudas();
    return;
  }

  const nombreFiltro = (document.getElementById('f-deudas-nombre')?.value || '').trim().toLowerCase();
  const estadoFiltro = document.getElementById('f-deudas-estado')?.value || '';
  const permisoFiltro = document.getElementById('f-deudas-permiso')?.value || '';

  let filtrados = deudasCache.filter(d => {
    if (nombreFiltro && !d.alumno_nombre.toLowerCase().includes(nombreFiltro)) return false;
    if (estadoFiltro === 'con-deuda' && !(d.saldo > 0)) return false;
    if (estadoFiltro === 'al-dia' && !(d.saldo <= 0)) return false;
    if (estadoFiltro === 'sin-tarifa' && !d.sin_tarifa) return false;
    if (permisoFiltro && d.permiso !== permisoFiltro) return false;
    return true;
  });

  const { col, dir } = deudasSort;
  if (col) {
    filtrados = [...filtrados].sort((a, b) => {
      if (col === 'practicas') return (a.num_practicas - b.num_practicas) * dir;
      if (col === 'generado') return (a.total_generado - b.total_generado) * dir;
      if (col === 'pagado') return (a.total_pagado - b.total_pagado) * dir;
      if (col === 'saldo') return (a.saldo - b.saldo) * dir;
      let va = '', vb = '';
      if (col === 'nombre') { va = a.alumno_nombre || ''; vb = b.alumno_nombre || ''; }
      else if (col === 'permiso') { va = a.permiso || ''; vb = b.permiso || ''; }
      return va.localeCompare(vb, 'es', { numeric: true }) * dir;
    });
  } else {
    // Sin columna activa: orden por defecto, saldo descendente
    filtrados = [...filtrados].sort((a, b) => b.saldo - a.saldo);
  }
  actualizarIndicadoresOrdenDeudas();

  if (!filtrados.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Ningún alumno coincide con los filtros</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(d => {
    const saldoClase = d.saldo > 0 ? 'saldo-pendiente' : 'saldo-ok';
    const avisoIcon = d.sin_tarifa
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--warn);vertical-align:-2px;margin-right:4px" title="Alguna práctica no tiene tarifa asignada"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
      : '';
    return `<tr>
      <td>${avisoIcon}<strong>${esc(d.alumno_nombre)}</strong></td>
      <td>${tagPermiso(d.permiso)}</td>
      <td>${d.num_practicas}</td>
      <td>${fmt(d.total_generado)} €</td>
      <td>${fmt(d.total_pagado)} €</td>
      <td><span class="${saldoClase}">${fmt(d.saldo)} €</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="abrirModalPago(${d.alumno_id},'${esc(d.alumno_nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Anotar pago</button>
        <button class="btn btn-gray btn-sm" onclick="abrirHistorialPagos(${d.alumno_id},'${esc(d.alumno_nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Historial</button>
        <button class="btn btn-gray btn-sm" onclick="abrirDesglosePagos(${d.alumno_id},'${esc(d.alumno_nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg> Desglose</button>
      </td>
    </tr>`;
  }).join('');
}

// ─── ANOTAR PAGO (por número de clases o por importe) ──────────────────────
// Lo más habitual es cobrar N clases: el importe sale solo de N × precio por
// clase del permiso del alumno (Pagos → Tarifas / Ajustes → Cobros). El modal
// se abre desde Pagos y desde la ficha económica del alumno.
let pagoCtx = null; // { alumnoId, alumnoNombre, permiso, saldo, precios: { circulacion, pista }, modo, editando }

async function abrirModalPago(alumnoId, alumnoNombre, opciones = {}) {
  const [desglose, tarifas] = await Promise.all([window.api.getDesglosePagosAlumno(alumnoId), window.api.getTarifas()]);
  const permiso = desglose ? desglose.permiso : null;
  const precio = tipo => { const t = tarifas.find(x => x.permiso === permiso && x.tipo === tipo); return t && t.precio > 0 ? t.precio : 0; };
  pagoCtx = {
    alumnoId, alumnoNombre, permiso, saldo: desglose ? desglose.saldo : 0,
    precios: { circulacion: precio('circulacion'), pista: precio('pista') },
    editando: !!opciones.editando
  };
  document.getElementById('edit-pago-id').value = opciones.id || '';
  document.getElementById('edit-pago-alumno-id').value = alumnoId;
  document.getElementById('edit-pago-cantidad').value = opciones.cantidad != null ? opciones.cantidad : '';
  document.getElementById('edit-pago-nota').value = opciones.nota || '';
  document.getElementById('edit-pago-forma').value = opciones.forma || '';
  document.getElementById('edit-pago-fecha').value = opciones.fecha || hoyISO();
  document.getElementById('edit-pago-nclases').value = 1;
  document.getElementById('edit-pago-tipo-clase').value = 'circulacion';
  document.getElementById('modal-pago-titulo').textContent = `${opciones.editando ? 'Editar pago' : 'Anotar pago'} — ${alumnoNombre}`;
  // Por clases salvo al editar (se respeta el importe guardado) o si el
  // permiso aún no tiene precio por clase.
  cambiarModoPago(!opciones.editando && pagoCtx.precios.circulacion + pagoCtx.precios.pista > 0 ? 'clases' : 'importe');
  openModal('modal-pago');
  setTimeout(() => document.getElementById(pagoCtx.modo === 'clases' ? 'edit-pago-nclases' : 'edit-pago-cantidad')?.select(), 60);
}

function openEditPago(id, alumnoId, alumnoNombre, fecha, cantidad, nota, formaPago) {
  abrirModalPago(alumnoId, alumnoNombre, { editando: true, id, fecha, cantidad, nota, forma: formaPago });
}

function cambiarModoPago(modo) {
  if (!pagoCtx) return;
  pagoCtx.modo = modo;
  document.querySelectorAll('#pago-modo button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modo === modo)));
  document.getElementById('pago-bloque-clases').hidden = modo !== 'clases';
  document.getElementById('pago-bloque-importe').hidden = modo !== 'importe';
  const { circulacion, pista } = pagoCtx.precios;
  const conPrecio = circulacion > 0 || pista > 0;
  document.getElementById('pago-sin-precio').hidden = conPrecio;
  document.getElementById('pago-clases-campos').hidden = !conPrecio;
  document.getElementById('pago-sin-precio-permiso').textContent = pagoCtx.permiso || 'su permiso';
  // Selector de tipo solo si hay precio de pista (la mayoría cobra solo circulación).
  document.getElementById('pago-tipo-wrap').hidden = !(pista > 0 && circulacion > 0);
  if (pista > 0 && !(circulacion > 0)) document.getElementById('edit-pago-tipo-clase').value = 'pista';
  const saldo = pagoCtx.saldo;
  const lin = document.getElementById('pago-saldo');
  lin.innerHTML = saldo > 0
    ? `Debe <b>${fmt(saldo)} €</b>${!pagoCtx.editando ? ` <button type="button" class="btn btn-gray btn-sm" onclick="cobrarSaldoPago()">Cobrar todo</button>` : ''}`
    : (saldo < 0 ? `Tiene <b>${fmt(-saldo)} €</b> a su favor` : 'Está al día');
  recalcularPagoClases();
}

function pasoClasesPago(delta) {
  const inp = document.getElementById('edit-pago-nclases');
  inp.value = Math.max(1, Math.min(200, (parseInt(inp.value) || 0) + delta));
  recalcularPagoClases();
}

function fijarClasesPago(n) {
  document.getElementById('edit-pago-nclases').value = n;
  recalcularPagoClases();
}

// Precio por clase del tipo elegido y total (en céntimos para no arrastrar decimales).
function calculoPagoClases() {
  if (!pagoCtx) return null;
  const n = parseInt(document.getElementById('edit-pago-nclases').value) || 0;
  const tipo = document.getElementById('edit-pago-tipo-clase').value === 'pista' ? 'pista' : 'circulacion';
  const precio = pagoCtx.precios[tipo] || 0;
  return { n, tipo, precio, total: Math.round(n * precio * 100) / 100 };
}

function recalcularPagoClases() {
  const c = calculoPagoClases();
  if (!c) return;
  document.querySelectorAll('#pago-chips-clases button').forEach(b => b.setAttribute('aria-pressed', String(parseInt(b.dataset.n) === c.n)));
  const out = document.getElementById('pago-calculo');
  if (!(c.precio > 0)) { out.innerHTML = ''; return; }
  out.innerHTML = c.n > 0
    ? `<span>${c.n} ${c.n === 1 ? 'clase' : 'clases'} × ${fmt(c.precio)} €</span><b>${fmt(c.total)} €</b>`
    : '<span>Indica cuántas clases paga</span><b>—</b>';
  const nota = document.getElementById('edit-pago-nota');
  nota.placeholder = c.n > 0 ? `Si lo dejas vacío: «${notaPagoClases(c)}»` : 'Ej: pago en efectivo, transferencia...';
}

function notaPagoClases(c) {
  return `${c.n} ${c.n === 1 ? 'clase' : 'clases'}${c.tipo === 'pista' ? ' de pista' : ''}`;
}

function cobrarSaldoPago() {
  if (!pagoCtx || !(pagoCtx.saldo > 0)) return;
  document.getElementById('edit-pago-cantidad').value = Math.round(pagoCtx.saldo * 100) / 100;
  cambiarModoPago('importe');
  document.getElementById('edit-pago-cantidad').focus();
}

async function savePago() {
  const id = document.getElementById('edit-pago-id').value;
  const alumnoId = parseInt(document.getElementById('edit-pago-alumno-id').value);
  const fecha = document.getElementById('edit-pago-fecha').value;
  let cantidad = parseFloat(document.getElementById('edit-pago-cantidad').value);
  let nota = document.getElementById('edit-pago-nota').value.trim();
  const formaPago = document.getElementById('edit-pago-forma').value || null;
  if (!fecha) { await avisar('Selecciona una fecha.'); return; }
  if (pagoCtx && pagoCtx.modo === 'clases') {
    const c = calculoPagoClases();
    if (!(c.precio > 0)) { await avisar(`El permiso ${pagoCtx.permiso || ''} no tiene precio por clase. Ponlo en Ajustes → Cobros o anota el importe.`); return; }
    if (!(c.n > 0)) { await avisar('Indica cuántas clases paga.'); return; }
    cantidad = c.total;
    if (!nota) nota = notaPagoClases(c);
  }
  if (isNaN(cantidad) || cantidad <= 0) { await avisar('Introduce una cantidad válida.'); return; }

  if (id) {
    // Edición: no se toca el empleado original (undefined = updatePago no lo modifica).
    await window.api.updatePago(parseInt(id), fecha, cantidad, nota, formaPago, undefined);
  } else {
    const empleado = (typeof perfilActual !== 'undefined' && perfilActual?.nombre) || null;
    await window.api.addPago(alumnoId, fecha, cantidad, nota, getSucursalActual(), formaPago, empleado);
  }
  closeModal('modal-pago');
  if (document.getElementById('page-pagos')?.classList.contains('active')) loadDeudas();

  // Si el historial o la ficha económica de este alumno están abiertos, refrescarlos también
  const modalHist = document.getElementById('modal-historial-pagos');
  if (modalHist.classList.contains('open') && parseInt(modalHist.dataset.alumnoId) === alumnoId) {
    abrirHistorialPagos(alumnoId, modalHist.dataset.alumnoNombre);
  }
  const modalEco = document.getElementById('modal-economia-alumno');
  if (modalEco && modalEco.classList.contains('open') && parseInt(modalEco.dataset.alumnoId) === alumnoId) {
    renderEconomiaAlumno();
  }
}

async function abrirHistorialPagos(alumnoId, alumnoNombre) {
  const pagos = await window.api.getPagosAlumno(alumnoId);
  const modal = document.getElementById('modal-historial-pagos');
  modal.dataset.alumnoId = alumnoId;
  modal.dataset.alumnoNombre = alumnoNombre;
  document.getElementById('modal-historial-pagos-titulo').textContent = `Historial de pagos — ${alumnoNombre}`;
  const tbody = document.querySelector('#tabla-historial-pagos tbody');
  if (!pagos.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No hay pagos registrados</td></tr>';
  } else {
    const FORMA_LABEL = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', bizum: 'Bizum', otro: 'Otro' };
    tbody.innerHTML = pagos.map(p => `<tr>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${fmt(p.cantidad)} €</td>
      <td>${p.forma_pago ? esc(FORMA_LABEL[p.forma_pago] || p.forma_pago) : '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>${p.nota ? esc(p.nota) : '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="openEditPago(${p.id},${alumnoId},'${esc(alumnoNombre)}','${p.fecha}',${p.cantidad},'${esc(p.nota || '')}','${esc(p.forma_pago || '')}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
        <button class="btn btn-danger btn-sm" onclick="deletePagoUI(${p.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
      </td>
    </tr>`).join('');
  }
  openModal('modal-historial-pagos');
}

async function deletePagoUI(id) {
  if (!await confirmar('¿Borrar este pago?', { peligro: true, textoAceptar: 'Borrar' })) return;
  await window.api.deletePago(id);
  const modal = document.getElementById('modal-historial-pagos');
  const alumnoId = parseInt(modal.dataset.alumnoId);
  const alumnoNombre = modal.dataset.alumnoNombre;
  await abrirHistorialPagos(alumnoId, alumnoNombre);
  loadDeudas();
}

async function abrirDesglosePagos(alumnoId, alumnoNombre) {
  const desglose = await window.api.getDesglosePagosAlumno(alumnoId);
  document.getElementById('modal-desglose-titulo').textContent = `Desglose de pagos — ${alumnoNombre}`;
  const tbody = document.querySelector('#tabla-desglose-pagos tbody');

  const ESTADO_BADGE = {
    pagada: () => '<span class="badge-pagada">Pagada</span>',
    parcial: (p) => `<span class="badge-parcial">${fmt(p.cubierto)} € de ${fmt(p.precio)} €</span>`,
    pendiente: () => '<span class="badge-pendiente-pago">Pendiente</span>',
    sin_tarifa: () => '<span class="badge-sin-tarifa">Sin tarifa</span>'
  };
  const TIPO_LABEL = { circulacion: 'Circulación', pista: 'Pista' };

  if (!desglose || !desglose.practicas.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No hay prácticas registradas</td></tr>';
  } else {
    tbody.innerHTML = desglose.practicas.map(p => `<tr>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${esc(TIPO_LABEL[p.tipo] || p.tipo)}</td>
      <td>${p.precio != null ? fmt(p.precio) + ' €' : '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>${ESTADO_BADGE[p.estado](p)}</td>
    </tr>`).join('');
  }

  const resumen = document.getElementById('desglose-resumen');
  if (desglose) {
    const saldoClase = desglose.saldo > 0 ? 'saldo-pendiente' : 'saldo-ok';
    resumen.innerHTML = `Generado: <strong>${fmt(desglose.total_generado)} €</strong> &nbsp;·&nbsp; Pagado: <strong>${fmt(desglose.total_pagado)} €</strong> &nbsp;·&nbsp; Saldo: <span class="${saldoClase}">${fmt(desglose.saldo)} €</span>`;
  } else {
    resumen.innerHTML = '';
  }

  openModal('modal-desglose-pagos');
}

function loadTarifas() {
  return pintarTarifas('#tabla-tarifas tbody', 'tarifa', 'pagos-tarifa-toast');
}

// Rejilla permiso × tipo de clase con un input por celda. La usan Pagos →
// Tarifas y Ajustes → Cobros (mismos datos, distinto prefijo de ids para que
// no choquen si las dos están en el DOM). `extra` = permisos que se quieren
// ver aunque aún no tengan alumnos ni precio (Ajustes → «Precio de otro permiso»).
async function pintarTarifas(tbodySel, prefijo, toastId, extra = []) {
  const [tarifas, alumnos] = await Promise.all([window.api.getTarifas(), window.api.getAlumnos()]);
  const permisos = Array.from(new Set([
    ...alumnos.map(a => a.permiso),
    ...tarifas.map(t => t.permiso),
    ...extra
  ].filter(Boolean))).sort();

  const tbody = document.querySelector(tbodySel);
  if (!tbody) return;
  if (!permisos.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">No hay permisos todavía — añade un alumno primero</td></tr>';
    return;
  }

  tbody.innerHTML = permisos.map(permiso => {
    const tCirc = tarifas.find(t => t.permiso === permiso && t.tipo === 'circulacion');
    const tPista = tarifas.find(t => t.permiso === permiso && t.tipo === 'pista');
    const idCirc = `${prefijo}-${permiso}-circulacion`;
    const idPista = `${prefijo}-${permiso}-pista`;
    return `<tr data-permiso="${esc(permiso)}">
      <td>${tagPermiso(permiso)}</td>
      <td><input type="number" id="${idCirc}" min="0" step="0.01" value="${tCirc ? tCirc.precio : ''}" placeholder="0,00" style="width:100px" onchange="guardarTarifaUI('${permiso}','circulacion','${idCirc}','${toastId}')"></td>
      <td><input type="number" id="${idPista}" min="0" step="0.01" value="${tPista ? tPista.precio : ''}" placeholder="0,00" style="width:100px" onchange="guardarTarifaUI('${permiso}','pista','${idPista}','${toastId}')"></td>
    </tr>`;
  }).join('');
}

async function guardarTarifaUI(permiso, tipo, valorInputId, toastId = 'pagos-tarifa-toast') {
  const input = document.getElementById(valorInputId);
  const valor = parseFloat(input.value);
  if (isNaN(valor) || valor < 0) { showToast(toastId, 'Introduce un precio válido (0 o más).', 'err'); return; }
  await window.api.setTarifa(permiso, tipo, valor);
  const tipoTxt = tipo === 'pista' ? 'Pista' : 'Circulación';
  showToast(toastId, `Precio de ${permiso} (${tipoTxt}) guardado: ${fmt(valor)} €`, 'ok');
}
