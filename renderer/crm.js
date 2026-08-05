// ─── CRM DE CAPTACIÓN (LEADS) ──────────────────────────────────────────────
// UI de la página "Captación" (leads, origen, presupuestos, embudo de
// conversión). Registro LOCAL — igual que vencimientos, no sincroniza con la
// nube (ver db/crm.js). Todo pasa por los IPC homónimos.

let leadsCache = [];

const CRM_ESTADO_LABEL = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  presupuesto: 'Presupuesto',
  ganado: 'Ganado',
  perdido: 'Perdido'
};

const CRM_ESTADO_BADGE = {
  nuevo: 'badge-parcial',
  contactado: 'badge-parcial',
  presupuesto: 'badge-parcial',
  ganado: 'badge-pagada',
  perdido: 'badge-pendiente-pago'
};

async function loadCrm() {
  const [leads, stats] = await Promise.all([
    window.api.getLeads(getSucursalActual()),
    window.api.getEstadisticasCrm(getSucursalActual())
  ]);
  leadsCache = leads;
  renderCrmStats(stats);
  renderLeadsLista();
}

function renderCrmStats(stats) {
  const cont = document.getElementById('crm-stats');
  if (!cont) return;

  const pe = stats.porEstado;
  const contadores = Object.keys(CRM_ESTADO_LABEL).map(k =>
    `<div class="stat-box"><div class="stat-label">${CRM_ESTADO_LABEL[k]}</div><div class="stat-value">${pe[k] || 0}</div></div>`
  ).join('');

  const filasOrigen = stats.porOrigen.length
    ? stats.porOrigen.map(o => `<tr>
        <td>${esc(o.origen)}</td>
        <td>${o.total}</td>
        <td>${o.ganados}</td>
        <td>${(o.ratio * 100).toFixed(0)}%</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="empty">Sin datos de origen</td></tr>';

  cont.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="stats-row" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        ${contadores}
        <div class="stat-box"><div class="stat-label">Total leads</div><div class="stat-value">${stats.total}</div></div>
        <div class="stat-box"><div class="stat-label">Conversión</div><div class="stat-value">${(stats.ratioConversion * 100).toFixed(0)}%</div></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Origen</th><th>Total</th><th>Ganados</th><th>Ratio</th></tr></thead>
        <tbody>${filasOrigen}</tbody>
      </table></div>
    </div>`;
}

function renderLeadsLista() {
  const cont = document.getElementById('leads-lista');
  if (!cont) return;

  if (!leadsCache.length) {
    cont.innerHTML = '<div class="card"><div class="empty">No hay leads registrados</div></div>';
    return;
  }

  const filas = leadsCache.map(l => {
    const badge = CRM_ESTADO_BADGE[l.estado] || 'badge-parcial';
    const contacto = [l.telefono, l.email].filter(Boolean).join(' · ') || '—';
    const presupuesto = l.presupuesto != null ? `${l.presupuesto} €` : '—';
    const btnConvertir = l.alumno_id
      ? '<span class="badge-pagada">Convertido</span>'
      : `<button class="btn btn-primary btn-sm" onclick="convertirLeadUI(${l.id})">Convertir en alumno</button>`;
    return `<tr>
      <td>${esc(l.nombre)}</td>
      <td>${esc(contacto)}</td>
      <td>${esc(l.origen || '—')}</td>
      <td>${esc(l.permiso_interes || '—')}</td>
      <td>${presupuesto}</td>
      <td><span class="${badge}">${CRM_ESTADO_LABEL[l.estado] || l.estado}</span></td>
      <td>${fmtFecha(l.fecha_alta)}</td>
      <td>
        ${btnConvertir}
        <button class="btn btn-warn btn-sm" onclick="abrirEditarLead(${l.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="borrarLeadUI(${l.id})">Borrar</button>
      </td>
    </tr>`;
  }).join('');

  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Nombre</th><th>Contacto</th><th>Origen</th><th>Permiso</th><th>Presupuesto</th><th>Estado</th><th>Alta</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}

function abrirNuevoLead() {
  document.getElementById('lead-modal-titulo').textContent = 'Nuevo lead';
  document.getElementById('lead-edit-id').value = '';
  document.getElementById('lead-nombre').value = '';
  document.getElementById('lead-telefono').value = '';
  document.getElementById('lead-email').value = '';
  document.getElementById('lead-origen').value = '';
  document.getElementById('lead-permiso-interes').value = '';
  document.getElementById('lead-presupuesto').value = '';
  document.getElementById('lead-estado').value = 'nuevo';
  document.getElementById('lead-fecha-alta').value = new Date().toISOString().slice(0, 10);
  document.getElementById('lead-notas').value = '';
  document.getElementById('lead-alert').classList.add('hidden');
  openModal('modal-lead');
}

function abrirEditarLead(id) {
  const l = leadsCache.find(x => x.id === id);
  if (!l) return;
  document.getElementById('lead-modal-titulo').textContent = 'Editar lead';
  document.getElementById('lead-edit-id').value = l.id;
  document.getElementById('lead-nombre').value = l.nombre || '';
  document.getElementById('lead-telefono').value = l.telefono || '';
  document.getElementById('lead-email').value = l.email || '';
  document.getElementById('lead-origen').value = l.origen || '';
  document.getElementById('lead-permiso-interes').value = l.permiso_interes || '';
  document.getElementById('lead-presupuesto').value = l.presupuesto != null ? l.presupuesto : '';
  document.getElementById('lead-estado').value = l.estado || 'nuevo';
  document.getElementById('lead-fecha-alta').value = l.fecha_alta || '';
  document.getElementById('lead-notas').value = l.notas || '';
  document.getElementById('lead-alert').classList.add('hidden');
  openModal('modal-lead');
}

async function guardarLead() {
  const idStr = document.getElementById('lead-edit-id').value;
  const nombre = document.getElementById('lead-nombre').value.trim();
  const telefono = document.getElementById('lead-telefono').value.trim();
  const email = document.getElementById('lead-email').value.trim();
  const origen = document.getElementById('lead-origen').value.trim();
  const permiso_interes = document.getElementById('lead-permiso-interes').value.trim();
  const presupuestoStr = document.getElementById('lead-presupuesto').value;
  const estado = document.getElementById('lead-estado').value;
  const fecha_alta = document.getElementById('lead-fecha-alta').value;
  const notas = document.getElementById('lead-notas').value.trim();
  const alert = document.getElementById('lead-alert');

  if (!nombre) {
    alert.textContent = 'Indica el nombre del lead.';
    alert.className = 'alert alert-err';
    return;
  }

  const datos = {
    nombre, telefono, email, origen, estado, permiso_interes,
    presupuesto: presupuestoStr !== '' ? Number(presupuestoStr) : null,
    notas, fecha_alta, sucursal_id: getSucursalActual()
  };

  try {
    if (idStr) {
      await window.api.updateLead(parseInt(idStr), datos);
    } else {
      await window.api.addLead(datos);
    }
  } catch (e) {
    alert.textContent = e.message || 'No se pudo guardar el lead.';
    alert.className = 'alert alert-err';
    return;
  }

  closeModal('modal-lead');
  loadCrm();
}

async function convertirLeadUI(id) {
  if (!confirm('¿Convertir este lead en alumno? Se creará una ficha de alumno nueva.')) return;
  const res = await window.api.convertirLead(id);
  if (!res || !res.ok) {
    alert(res && res.msg ? res.msg : 'No se pudo convertir el lead.');
    return;
  }
  alert('Lead convertido en alumno. Ya puedes verlo en la sección Alumnos.');
  loadCrm();
}

async function borrarLeadUI(id) {
  if (!confirm('¿Borrar este lead?')) return;
  await window.api.deleteLead(id);
  loadCrm();
}
