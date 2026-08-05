// ─── EXÁMENES: PRESENTACIONES A CONVOCATORIA Y TASAS ───────────────────────
// UI de la página "Exámenes" (presentaciones a convocatoria por tipo, tasas
// administrativas y estadísticas de aprobados). Registro LOCAL — igual que
// vencimientos/jornada, no sincroniza con la nube (ver db/convocatorias.js).
// Todo pasa por los IPC homónimos.

let presentacionesCache = [];
let tasasCache = [];
let examenesAlumnosCache = [];
let examenesProfesoresCache = [];

const TIPO_EXAMEN_LABEL = { teorico: 'Teórico', maniobras: 'Maniobras', circulacion: 'Circulación' };
const RESULTADO_LABEL = { pendiente: 'Pendiente', apto: 'Apto', no_apto: 'No apto', aplazado: 'Aplazado', no_presentado: 'No presentado' };
const ESTADO_TASA_LABEL = { vigente: 'Vigente', usada: 'Usada', caducada: 'Caducada' };

async function loadExamenes() {
  const [presentaciones, tasas, stats, alumnos, profesores] = await Promise.all([
    window.api.getPresentaciones(getSucursalActual()),
    window.api.getTasas(getSucursalActual()),
    window.api.getEstadisticasAprobados(getSucursalActual()),
    window.api.getAlumnos(),
    window.api.getProfesores()
  ]);
  presentacionesCache = presentaciones;
  tasasCache = tasas;
  examenesAlumnosCache = alumnos;
  examenesProfesoresCache = profesores;
  renderEstadisticasAprobados(stats);
  renderPresentacionesLista();
  renderTasasLista();
}

function _nombreAlumnoExamen(id) {
  const al = examenesAlumnosCache.find(x => x.id === id);
  return al ? al.nombre : '—';
}

function _nombreProfesorExamen(id) {
  if (id == null) return '—';
  const prof = examenesProfesoresCache.find(x => x.id === id);
  return prof ? prof.nombre : '—';
}

function _badgeResultado(resultado) {
  if (resultado === 'apto') return `<span class="badge-pagada">${RESULTADO_LABEL[resultado]}</span>`;
  if (resultado === 'no_apto') return `<span class="badge-pendiente-pago">${RESULTADO_LABEL[resultado]}</span>`;
  return `<span class="badge-sin-tarifa">${RESULTADO_LABEL[resultado] || resultado}</span>`;
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
    <div class="page-title" style="font-size:15px;margin-bottom:10px">Estadísticas de aprobados</div>
    <div class="stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">
      <div class="stat">
        <div class="stat-label">Ratio global de aprobados</div>
        <div class="stat-value">${_fmtPct(stats.global.ratio)}</div>
        <div class="stat-sub">${stats.global.aptos} de ${stats.global.presentados} presentados</div>
      </div>
    </div>
    <div class="table-wrap" style="margin-bottom:16px">
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
    </div>`;
}

function renderPresentacionesLista() {
  const cont = document.getElementById('presentaciones-lista');
  if (!cont) return;

  if (!presentacionesCache.length) {
    cont.innerHTML = '<div class="card"><div class="empty">No hay presentaciones registradas</div></div>';
    return;
  }

  const filas = presentacionesCache.map(p => `<tr>
    <td>${esc(_nombreAlumnoExamen(p.alumno_id))}</td>
    <td>${TIPO_EXAMEN_LABEL[p.tipo] || p.tipo}</td>
    <td>${fmtFecha(p.fecha)}</td>
    <td>${esc(_nombreProfesorExamen(p.profesor_id))}</td>
    <td>${p.n_convocatoria}ª</td>
    <td>${_badgeResultado(p.resultado)}</td>
    <td>
      <select class="btn-sm" onchange="cambiarResultadoPresentacionUI(${p.id}, this.value)" style="margin-right:4px">
        ${Object.keys(RESULTADO_LABEL).map(r => `<option value="${r}" ${r === p.resultado ? 'selected' : ''}>${RESULTADO_LABEL[r]}</option>`).join('')}
      </select>
      <button class="btn btn-warn btn-sm" onclick="abrirEditarPresentacion(${p.id})">Editar</button>
      <button class="btn btn-danger btn-sm" onclick="borrarPresentacionUI(${p.id})">Borrar</button>
    </td>
  </tr>`).join('');

  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Alumno</th><th>Tipo</th><th>Fecha</th><th>Profesor</th><th>Conv.</th><th>Resultado</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}

function renderTasasLista() {
  const cont = document.getElementById('tasas-lista');
  if (!cont) return;

  if (!tasasCache.length) {
    cont.innerHTML = '<div class="card"><div class="empty">No hay tasas registradas</div></div>';
    return;
  }

  const filas = tasasCache.map(t => `<tr>
    <td>${esc(_nombreAlumnoExamen(t.alumno_id))}</td>
    <td>${esc(t.concepto || '—')}</td>
    <td>${t.fecha_compra ? fmtFecha(t.fecha_compra) : '—'}</td>
    <td>${t.fecha_caducidad ? fmtFecha(t.fecha_caducidad) : '—'}</td>
    <td>${t.importe != null ? fmt(t.importe) + ' €' : '—'}</td>
    <td>${_badgeEstadoTasa(t.estado)}</td>
    <td>
      <button class="btn btn-warn btn-sm" onclick="abrirEditarTasa(${t.id})">Editar</button>
      <button class="btn btn-danger btn-sm" onclick="borrarTasaUI(${t.id})">Borrar</button>
    </td>
  </tr>`).join('');

  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Alumno</th><th>Concepto</th><th>Compra</th><th>Caducidad</th><th>Importe</th><th>Estado</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}

// ─── MODAL PRESENTACIÓN ─────────────────────────────────────────────────────

function _llenarSelectAlumnosExamen(selectId, selectedId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = examenesAlumnosCache.map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('');
  if (selectedId != null) sel.value = String(selectedId);
}

function abrirNuevaPresentacion() {
  document.getElementById('pres-modal-titulo').textContent = 'Registrar presentación';
  document.getElementById('pres-edit-id').value = '';
  _llenarSelectAlumnosExamen('pres-alumno');
  document.getElementById('pres-tipo').value = 'teorico';
  document.getElementById('pres-fecha').value = '';
  llenarSelectProfesores('pres-profesor');
  document.getElementById('pres-n-convocatoria').value = 1;
  document.getElementById('pres-resultado').value = 'pendiente';
  document.getElementById('pres-nota').value = '';
  document.getElementById('presentacion-alert').classList.add('hidden');
  openModal('modal-presentacion');
}

async function abrirEditarPresentacion(id) {
  const p = presentacionesCache.find(x => x.id === id);
  if (!p) return;
  document.getElementById('pres-modal-titulo').textContent = 'Editar presentación';
  document.getElementById('pres-edit-id').value = p.id;
  _llenarSelectAlumnosExamen('pres-alumno', p.alumno_id);
  document.getElementById('pres-tipo').value = p.tipo;
  document.getElementById('pres-fecha').value = p.fecha || '';
  await llenarSelectProfesores('pres-profesor', p.profesor_id);
  document.getElementById('pres-n-convocatoria').value = p.n_convocatoria || 1;
  document.getElementById('pres-resultado').value = p.resultado;
  document.getElementById('pres-nota').value = p.nota || '';
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

  if (!datos.fecha) {
    alert.textContent = 'Indica la fecha de la presentación.';
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
    alert.textContent = e.message || 'No se pudo guardar la presentación.';
    alert.className = 'alert alert-err';
    return;
  }

  closeModal('modal-presentacion');
  loadExamenes();
}

async function cambiarResultadoPresentacionUI(id, resultado) {
  await window.api.setResultadoPresentacion(id, resultado);
  loadExamenes();
}

async function borrarPresentacionUI(id) {
  if (!confirm('¿Borrar esta presentación?')) return;
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
  if (!confirm('¿Borrar esta tasa?')) return;
  await window.api.deleteTasa(id);
  loadExamenes();
}
