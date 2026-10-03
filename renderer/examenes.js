// ─── EXÁMENES: BUSCADOR DE EXÁMENES Y TASAS ────────────────────────────────
// UI de la página "Exámenes": buscador de los exámenes de todos los alumnos
// con filtros (texto, fechas, tipo, resultado, permiso, profesor, examinador)
// y el resumen de aprobados de lo filtrado (db.buscarExamenes), tasas
// administrativas y estadísticas de aprobados. Registro LOCAL — igual que
// vencimientos/jornada, no sincroniza con la nube (ver db/convocatorias.js).
// Todo pasa por los IPC homónimos.

let presentacionesCache = []; // filas del buscador (con el nombre del alumno ya puesto)
let tasasCache = [];
let examenesAlumnosCache = [];
let examenesProfesoresCache = [];
let examenesAlumnosPorId = new Map();
let examenesTab = 'todos';

const TIPO_EXAMEN_LABEL = { teorico: 'Teórico', maniobras: 'Maniobras', circulacion: 'Circulación' };
const RESULTADO_LABEL = { pendiente: 'Pendiente', apto: 'Apto', no_apto: 'No apto', aplazado: 'Aplazado', no_presentado: 'No presentado' };
const ESTADO_TASA_LABEL = { vigente: 'Vigente', usada: 'Usada', caducada: 'Caducada' };

async function loadExamenes() {
  const [tasas, stats, alumnos, profesores] = await Promise.all([
    window.api.getTasas(getSucursalActual()),
    window.api.getEstadisticasAprobados(getSucursalActual()),
    window.api.getAlumnos(),
    window.api.getProfesores()
  ]);
  tasasCache = tasas;
  examenesAlumnosCache = alumnos;
  examenesAlumnosPorId = new Map(alumnos.map(a => [a.id, a]));
  examenesProfesoresCache = profesores;
  renderEstadisticasAprobados(stats);
  await buscarExamenesUI();
  renderTasasLista();
}

function _nombreAlumnoExamen(id) {
  const al = examenesAlumnosPorId.get(id);
  return al ? [al.nombre, al.primer_apellido, al.segundo_apellido].filter(Boolean).join(' ') : '—';
}

function _nombreProfesorExamen(id) {
  if (id == null) return '—';
  const prof = examenesProfesoresCache.find(x => x.id === id);
  return prof ? prof.nombre : '—';
}

function _badgeEstadoTasa(estado) {
  if (estado === 'vigente') return `<span class="badge-pagada">${ESTADO_TASA_LABEL[estado]}</span>`;
  if (estado === 'caducada') return `<span class="badge-pendiente-pago">${ESTADO_TASA_LABEL[estado]}</span>`;
  return `<span class="badge-sin-tarifa">${ESTADO_TASA_LABEL[estado] || estado}</span>`;
}

function _fmtPct(ratio) {
  return `${Math.round(ratio * 100)}%`;
}

function renderEstadisticasAprobados(stats) {
  const cont = document.getElementById('examenes-stats');
  if (!cont) return;

  const filasTipo = ['teorico', 'maniobras', 'circulacion'].map(tipo => {
    const s = stats.porTipo[tipo];
    return `<tr>
      <td>${TIPO_EXAMEN_LABEL[tipo]}</td>
      <td>${s.aptos} / ${s.presentados}</td>
      <td>${_fmtPct(s.ratio)}</td>
    </tr>`;
  }).join('');

  const filasProfesor = stats.porProfesor.length
    ? stats.porProfesor.map(p => `<tr>
        <td>${esc(p.nombre)}</td>
        <td>${p.aptos} / ${p.presentados}</td>
        <td>${_fmtPct(p.ratio)}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="empty">Sin datos por profesor</td></tr>';

  cont.innerHTML = `
    <div class="card-head"><h2>Estadísticas de aprobados</h2><span class="card-note">De todos los exámenes registrados (aptos sobre presentados)</span></div>
    <div class="stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">
      <div class="stat">
        <div class="stat-label">Ratio global de aprobados</div>
        <div class="stat-value">${_fmtPct(stats.global.ratio)}</div>
        <div class="stat-sub">${stats.global.aptos} de ${stats.global.presentados} presentados</div>
      </div>
    </div>
    <div class="ex-stats-tablas">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tipo</th><th>Aptos / Presentados</th><th>%</th></tr></thead>
          <tbody>${filasTipo}</tbody>
        </table>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Profesor</th><th>Aptos / Presentados</th><th>%</th></tr></thead>
          <tbody>${filasProfesor}</tbody>
        </table>
      </div>
    </div>`;
}

// ─── BUSCADOR DE EXÁMENES ───────────────────────────────────────────────────
function filtrosExamenes() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  return {
    texto: v('ex-buscar'), desde: v('ex-desde'), hasta: v('ex-hasta'), tipo: v('ex-tipo'), resultado: v('ex-resultado'),
    permiso: v('ex-permiso'), profesor_id: v('ex-profesor'), examinador: v('ex-examinador'),
    cuando: examenesTab === 'todos' ? '' : examenesTab
  };
}

const buscarExamenesPronto = retrasar(() => buscarExamenesUI(), 150);

function cambiarTabExamenes(tab) {
  examenesTab = tab;
  document.querySelectorAll('#ex-tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === tab ? 'true' : 'false'));
  buscarExamenesUI();
}

function limpiarFiltrosExamenes() {
  ['ex-buscar', 'ex-desde', 'ex-hasta', 'ex-tipo', 'ex-resultado', 'ex-permiso', 'ex-profesor', 'ex-examinador'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  buscarExamenesUI();
}

// Desplegables con lo que hay en los exámenes (conservando lo elegido)
function _pintarOpcionesExamenes(opciones) {
  const rellenar = (id, primera, lista) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const actual = sel.value;
    sel.innerHTML = `<option value="">${primera}</option>` + lista.map(([v, t]) => `<option value="${esc(String(v))}">${esc(t)}</option>`).join('');
    if ([...sel.options].some(o => o.value === actual)) sel.value = actual;
  };
  rellenar('ex-permiso', 'Todos', opciones.permisos.map(p => [p, p]));
  rellenar('ex-profesor', 'Todos', opciones.profesores.map(p => [p.id, p.nombre]));
  rellenar('ex-examinador', 'Todos', opciones.examinadores.map(e => [e, e]));
  const dl = document.getElementById('ex-examinadores-lista');
  if (dl) dl.innerHTML = opciones.examinadores.map(e => `<option value="${esc(e)}">`).join('');
}

async function buscarExamenesUI() {
  const tbody = document.querySelector('#tabla-examenes tbody');
  if (!tbody) return;
  const r = await window.api.buscarExamenes(filtrosExamenes(), getSucursalActual());
  presentacionesCache = r.filas;
  _pintarOpcionesExamenes(r.opciones);
  const s = r.resumen;
  const resumen = document.getElementById('ex-resumen');
  if (resumen) {
    resumen.innerHTML = s.total
      ? [`<b>${fmtMiles(s.total)}</b> ${s.total === 1 ? 'examen' : 'exámenes'}`,
        s.aptos ? `<span class="ex-r-ok">${fmtMiles(s.aptos)} aptos</span>` : '',
        s.no_aptos ? `<span class="ex-r-mal">${fmtMiles(s.no_aptos)} no aptos</span>` : '',
        s.ratio != null ? `<b>${_fmtPct(s.ratio)}</b> de aprobados` : '',
        s.pendientes ? `${fmtMiles(s.pendientes)} pendientes` : '',
        s.otros ? `${fmtMiles(s.otros)} aplazados o no presentados` : ''].filter(Boolean).join(' · ')
      : '';
  }
  const pie = document.getElementById('ex-pie');
  if (pie) pie.innerHTML = `<span>Mostrando ${fmtMiles(s.total)} de ${fmtMiles(r.totalExamenes)} exámenes</span><span>${examenesTab === 'proximos' ? 'Los más cercanos primero' : 'Los más recientes primero'}</span>`;
  if (!s.total) {
    pintarPorTandas(tbody, [], () => '');
    tbody.innerHTML = `<tr><td colspan="9" class="empty">${r.totalExamenes ? 'Ningún examen coincide con la búsqueda' : 'No hay exámenes registrados. Usa «Registrar examen» o tráelos de tu programa anterior.'}</td></tr>`;
    return;
  }
  pintarPorTandas(tbody, presentacionesCache, filaExamenHTML, { tanda: 80, columnas: 9 });
}

function filaExamenHTML(p) {
  const guion = '<span style="color:var(--text-faint)">—</span>';
  const f = parteFecha(p.fecha);
  const hoy = hoyISO();
  const sub = [p.alumno_n_registro ? 'Nº ' + esc(p.alumno_n_registro) : '', p.alumno_dni ? esc(p.alumno_dni) : ''].filter(Boolean).join(' · ');
  const nombreArg = esc(p.alumno_nombre);
  const resultado = `<select class="ex-resultado ex-res-${p.resultado}" onchange="cambiarResultadoPresentacionUI(${p.id}, this.value)" aria-label="Resultado">
      ${Object.keys(RESULTADO_LABEL).map(r => `<option value="${r}" ${r === p.resultado ? 'selected' : ''}>${RESULTADO_LABEL[r]}</option>`).join('')}</select>`;
  const fallos = p.fallos_detalle
    ? `<button type="button" class="pill pill-line ex-fallos" onclick="verFallosExamen(${p.id})" title="${esc(p.fallos_detalle)}">${p.fallos != null ? p.fallos : 'Ver'} ${p.fallos === 1 ? 'fallo' : 'fallos'}</button>`
    : (p.fallos != null ? `<span class="num-mono">${p.fallos}</span>` : guion);
  return `<tr${p.fecha >= hoy && p.resultado === 'pendiente' ? ' class="ex-proximo"' : ''}>
    <td class="num-mono" style="white-space:nowrap">${esc(fechaCorta(p.fecha).replace(/^./, c => c.toUpperCase()))} ${f.y}</td>
    <td><a class="lnk" onclick="verFichaDesdePracticas(${p.alumno_id},${p.alumno_vehiculo_id || 'null'},'${nombreArg}')" title="Abrir la ficha del alumno">${esc(p.alumno_nombre)}</a>${sub ? `<div class="al-sub">${sub}</div>` : ''}</td>
    <td>${TIPO_EXAMEN_LABEL[p.tipo] || esc(p.tipo)}${p.permiso ? ' ' + tagPermiso(p.permiso) : ''}</td>
    <td class="num-mono">${p.n_convocatoria ? p.n_convocatoria + 'ª' : guion}</td>
    <td>${p.profesor_nombre ? esc(p.profesor_nombre) : guion}</td>
    <td>${p.examinador ? esc(p.examinador) : guion}${p.vehiculo ? `<div class="al-sub">${placaHTML(p.vehiculo)}</div>` : ''}</td>
    <td>${resultado}</td>
    <td>${fallos}</td>
    <td class="acciones-fila">
      <details class="menu-fila">
        <summary class="btn btn-gray btn-sm btn-icon" title="Más acciones" aria-label="Más acciones"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></summary>
        <div class="menu-fila-lista">
          <button type="button" onclick="abrirEditarPresentacion(${p.id})">${svgMini('editar')} Editar</button>
          <button type="button" class="menu-fila-borrar" onclick="borrarPresentacionUI(${p.id})">${svgMini('borrar')} Borrar</button>
        </div>
      </details>
    </td>
  </tr>`;
}

function verFallosExamen(id) {
  const p = presentacionesCache.find(x => x.id === id);
  if (!p) return;
  avisar(`${p.alumno_nombre} · ${TIPO_EXAMEN_LABEL[p.tipo] || p.tipo} del ${fmtFecha(p.fecha)}${p.examinador ? ' · examinador: ' + p.examinador : ''}\n\n${(p.fallos_detalle || '').split(' · ').join('\n')}`);
}

async function exportarExamenesUI() {
  const r = await window.api.exportarTabla('examenes', { filtros: filtrosExamenes(), sucursalId: getSucursalActual() });
  if (r && r.ok) avisar(`Exportados ${fmtMiles(r.total)} exámenes en ${r.path}`);
  else if (r && !r.canceled) avisar('No se pudo exportar: ' + (r.msg || 'error desconocido'));
}

// ─── TASAS ───────────────────────────────────────────────────────────────────
const filtrarTasasPronto = retrasar(() => renderTasasLista(), 150);

function renderTasasLista() {
  const cont = document.getElementById('tasas-lista');
  if (!cont) return;

  if (!tasasCache.length) {
    cont.innerHTML = '<div class="card"><div class="empty">No hay tasas registradas</div></div>';
    return;
  }
  const texto = sinTildes(document.getElementById('tasas-buscar')?.value || '').trim();
  const palabras = texto ? texto.split(/\s+/) : [];
  const filas = tasasCache.filter(t => !palabras.length || palabras.every(w =>
    sinTildes([_nombreAlumnoExamen(t.alumno_id), t.concepto, t.n_justificante, t.tipo_tasa, t.nota].filter(Boolean).join(' ')).includes(w)));

  if (!cont.querySelector('#tabla-tasas')) {
    cont.innerHTML = `<div class="table-wrap con-menus"><table id="tabla-tasas">
      <thead><tr><th>Alumno</th><th>Concepto</th><th>Nº justificante</th><th>Compra</th><th>Caducidad</th><th>Importe</th><th>Estado</th><th></th></tr></thead>
      <tbody></tbody></table></div><div class="tabla-pie" id="tasas-pie"></div>`;
  }
  const tbody = cont.querySelector('#tabla-tasas tbody');
  const pie = document.getElementById('tasas-pie');
  if (pie) pie.innerHTML = `<span>Mostrando ${fmtMiles(filas.length)} de ${fmtMiles(tasasCache.length)} tasas</span>`;
  if (!filas.length) { pintarPorTandas(tbody, [], () => ''); tbody.innerHTML = '<tr><td colspan="8" class="empty">Ninguna tasa coincide con la búsqueda</td></tr>'; return; }
  pintarPorTandas(tbody, filas, t => `<tr>
    <td>${esc(_nombreAlumnoExamen(t.alumno_id))}</td>
    <td>${esc(t.concepto || '—')}${t.tipo_tasa ? `<div class="al-sub">Tipo ${esc(t.tipo_tasa)}</div>` : ''}</td>
    <td class="num-mono">${t.n_justificante ? esc(t.n_justificante) : '—'}</td>
    <td>${t.fecha_compra ? fmtFecha(t.fecha_compra) : '—'}</td>
    <td>${t.fecha_caducidad ? fmtFecha(t.fecha_caducidad) : '—'}</td>
    <td>${t.importe != null ? fmt(t.importe) + ' €' : '—'}</td>
    <td>${_badgeEstadoTasa(t.estado)}</td>
    <td class="acciones-fila">
      <button class="btn btn-gray btn-sm" onclick="abrirEditarTasa(${t.id})">Editar</button>
      <button class="btn btn-gray btn-sm btn-borrar" onclick="borrarTasaUI(${t.id})">Borrar</button>
    </td>
  </tr>`, { tanda: 80, columnas: 8 });
}

// ─── MODAL PRESENTACIÓN ─────────────────────────────────────────────────────

function _llenarSelectAlumnosExamen(selectId, selectedId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = opcionesAlumnosHTML(examenesAlumnosCache);
  if (selectedId != null) sel.value = String(selectedId);
}

const CAMPOS_EXAMEN_MODAL = ['permiso', 'examinador', 'vehiculo', 'fallos', 'fallos_detalle', 'n_solicitud'];

async function abrirNuevaPresentacion() {
  document.getElementById('pres-modal-titulo').textContent = 'Registrar examen';
  document.getElementById('pres-edit-id').value = '';
  _llenarSelectAlumnosExamen('pres-alumno');
  document.getElementById('pres-tipo').value = 'teorico';
  document.getElementById('pres-fecha').value = '';
  await llenarSelectProfesores('pres-profesor');
  document.getElementById('pres-n-convocatoria').value = 1;
  document.getElementById('pres-resultado').value = 'pendiente';
  document.getElementById('pres-nota').value = '';
  for (const c of CAMPOS_EXAMEN_MODAL) { const el = document.getElementById('pres-' + c); if (el) el.value = ''; }
  document.getElementById('presentacion-alert').classList.add('hidden');
  openModal('modal-presentacion');
}

async function abrirEditarPresentacion(id) {
  const p = presentacionesCache.find(x => x.id === id);
  if (!p) return;
  document.getElementById('pres-modal-titulo').textContent = 'Editar examen';
  document.getElementById('pres-edit-id').value = p.id;
  _llenarSelectAlumnosExamen('pres-alumno', p.alumno_id);
  document.getElementById('pres-tipo').value = p.tipo;
  document.getElementById('pres-fecha').value = p.fecha || '';
  await llenarSelectProfesores('pres-profesor', p.profesor_id);
  document.getElementById('pres-n-convocatoria').value = p.n_convocatoria || 1;
  document.getElementById('pres-resultado').value = p.resultado;
  document.getElementById('pres-nota').value = p.nota || '';
  for (const c of CAMPOS_EXAMEN_MODAL) { const el = document.getElementById('pres-' + c); if (el) el.value = p[c] != null ? p[c] : ''; }
  document.getElementById('presentacion-alert').classList.add('hidden');
  openModal('modal-presentacion');
}

async function guardarPresentacion() {
  const idStr = document.getElementById('pres-edit-id').value;
  const alert = document.getElementById('presentacion-alert');
  const datos = {
    alumno_id: document.getElementById('pres-alumno').value || null,
    tipo: document.getElementById('pres-tipo').value,
    fecha: document.getElementById('pres-fecha').value,
    profesor_id: document.getElementById('pres-profesor').value || null,
    n_convocatoria: document.getElementById('pres-n-convocatoria').value || 1,
    resultado: document.getElementById('pres-resultado').value,
    nota: document.getElementById('pres-nota').value.trim(),
    sucursal_id: getSucursalActual()
  };
  for (const c of CAMPOS_EXAMEN_MODAL) { const el = document.getElementById('pres-' + c); if (el) datos[c] = el.value.trim(); }

  if (!datos.fecha) {
    alert.textContent = 'Indica la fecha del examen.';
    alert.className = 'alert alert-err';
    return;
  }

  try {
    if (idStr) {
      await window.api.updatePresentacion(parseInt(idStr), datos);
    } else {
      await window.api.addPresentacion(datos);
    }
  } catch (e) {
    alert.textContent = e.message || 'No se pudo guardar el examen.';
    alert.className = 'alert alert-err';
    return;
  }

  closeModal('modal-presentacion');
  loadExamenes();
}

async function cambiarResultadoPresentacionUI(id, resultado) {
  await window.api.setResultadoPresentacion(id, resultado);
  const [stats] = await Promise.all([window.api.getEstadisticasAprobados(getSucursalActual())]);
  renderEstadisticasAprobados(stats);
  buscarExamenesUI();
}

async function borrarPresentacionUI(id) {
  if (!await confirmar('¿Borrar este examen?', { peligro: true, textoAceptar: 'Borrar' })) return;
  await window.api.deletePresentacion(id);
  loadExamenes();
}

// ─── MODAL TASA ──────────────────────────────────────────────────────────────

function abrirNuevaTasa() {
  document.getElementById('tasa-modal-titulo').textContent = 'Añadir tasa';
  document.getElementById('tasa-edit-id').value = '';
  _llenarSelectAlumnosExamen('tasa-alumno');
  document.getElementById('tasa-concepto').value = '';
  document.getElementById('tasa-fecha-compra').value = '';
  document.getElementById('tasa-fecha-caducidad').value = '';
  document.getElementById('tasa-importe').value = '';
  document.getElementById('tasa-estado').value = 'vigente';
  document.getElementById('tasa-nota').value = '';
  document.getElementById('tasa-n-justificante').value = '';
  document.getElementById('tasa-tipo').value = '';
  document.getElementById('tasa-alert').classList.add('hidden');
  openModal('modal-tasa');
}

function abrirEditarTasa(id) {
  const t = tasasCache.find(x => x.id === id);
  if (!t) return;
  document.getElementById('tasa-modal-titulo').textContent = 'Editar tasa';
  document.getElementById('tasa-edit-id').value = t.id;
  _llenarSelectAlumnosExamen('tasa-alumno', t.alumno_id);
  document.getElementById('tasa-concepto').value = t.concepto || '';
  document.getElementById('tasa-fecha-compra').value = t.fecha_compra || '';
  document.getElementById('tasa-fecha-caducidad').value = t.fecha_caducidad || '';
  document.getElementById('tasa-importe').value = t.importe != null ? t.importe : '';
  document.getElementById('tasa-estado').value = t.estado;
  document.getElementById('tasa-nota').value = t.nota || '';
  document.getElementById('tasa-n-justificante').value = t.n_justificante || '';
  document.getElementById('tasa-tipo').value = t.tipo_tasa || '';
  document.getElementById('tasa-alert').classList.add('hidden');
  openModal('modal-tasa');
}

async function guardarTasa() {
  const idStr = document.getElementById('tasa-edit-id').value;
  const alert = document.getElementById('tasa-alert');
  const importeStr = document.getElementById('tasa-importe').value;
  const datos = {
    alumno_id: document.getElementById('tasa-alumno').value || null,
    concepto: document.getElementById('tasa-concepto').value.trim(),
    fecha_compra: document.getElementById('tasa-fecha-compra').value || null,
    fecha_caducidad: document.getElementById('tasa-fecha-caducidad').value || null,
    importe: importeStr !== '' ? importeStr : null,
    estado: document.getElementById('tasa-estado').value,
    nota: document.getElementById('tasa-nota').value.trim(),
    n_justificante: document.getElementById('tasa-n-justificante').value.trim(),
    tipo_tasa: document.getElementById('tasa-tipo').value.trim(),
    sucursal_id: getSucursalActual()
  };

  try {
    if (idStr) {
      await window.api.updateTasa(parseInt(idStr), datos);
    } else {
      await window.api.addTasa(datos);
    }
  } catch (e) {
    alert.textContent = e.message || 'No se pudo guardar la tasa.';
    alert.className = 'alert alert-err';
    return;
  }

  closeModal('modal-tasa');
  loadExamenes();
}

async function borrarTasaUI(id) {
  if (!await confirmar('¿Borrar esta tasa?', { peligro: true, textoAceptar: 'Borrar' })) return;
  await window.api.deleteTasa(id);
  loadExamenes();
}
