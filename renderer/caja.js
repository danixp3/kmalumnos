// ─── CAJA ────────────────────────────────────────────────────────────────────
// Arqueo de caja (por forma de pago, empleado y sede) y lista de morosidad.
// Tarea D1 del PLAN-MAESTRO.

const FORMA_LABEL_CAJA = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', bizum: 'Bizum', otro: 'Otro', sin_especificar: 'Sin especificar' };

async function loadCaja() {
  const desdeEl = document.getElementById('caja-desde');
  const hastaEl = document.getElementById('caja-hasta');
  const hoy = new Date().toISOString().split('T')[0];
  if (!desdeEl.value) desdeEl.value = hoy;
  if (!hastaEl.value) hastaEl.value = hoy;

  const [arqueo, morosos] = await Promise.all([
    window.api.getArqueo(desdeEl.value || null, hastaEl.value || null, getSucursalActual()),
    window.api.getMorosos(getSucursalActual())
  ]);

  renderArqueo(arqueo);
  renderMorosos(morosos);
}

function renderArqueo(arqueo) {
  const cont = document.getElementById('caja-arqueo');
  const filasForma = Object.entries(arqueo.porForma)
    .filter(([, total]) => total !== 0)
    .map(([forma, total]) => `<tr><td>${esc(FORMA_LABEL_CAJA[forma] || forma)}</td><td>${fmt(total)} €</td></tr>`)
    .join('') || '<tr><td colspan="2" class="empty">Sin pagos en el rango</td></tr>';

  const filasEmpleado = arqueo.porEmpleado.length
    ? arqueo.porEmpleado.map(e => `<tr><td>${esc(e.empleado)}</td><td>${e.nPagos}</td><td>${fmt(e.total)} €</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">Sin pagos en el rango</td></tr>';

  const filasSucursal = arqueo.porSucursal.length
    ? arqueo.porSucursal.map(s => `<tr><td>${esc(s.nombre)}</td><td>${fmt(s.total)} €</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">Sin pagos en el rango</td></tr>';

  cont.innerHTML = `
    <div class="stats" style="grid-template-columns:repeat(2,1fr)">
      <div class="stat">
        <div class="stat-head"><span class="lbl">Pagos anotados</span></div>
        <div class="num">${arqueo.nPagos}</div>
      </div>
      <div class="stat">
        <div class="stat-head"><span class="lbl">Total cobrado</span></div>
        <div class="num">${fmt(arqueo.total)} €</div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Por forma de pago</div>
      <div class="table-wrap"><table><thead><tr><th>Forma</th><th>Total</th></tr></thead><tbody>${filasForma}</tbody></table></div>
    </div>
    <div class="card">
      <div class="card-title">Por empleado</div>
      <div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Pagos</th><th>Total</th></tr></thead><tbody>${filasEmpleado}</tbody></table></div>
    </div>
    <div class="card">
      <div class="card-title">Por sede</div>
      <div class="table-wrap"><table><thead><tr><th>Sede</th><th>Total</th></tr></thead><tbody>${filasSucursal}</tbody></table></div>
    </div>
  `;
}

function renderMorosos(morosos) {
  const cont = document.getElementById('caja-morosos');
  const filas = morosos.length
    ? morosos.map(m => `<tr>
        <td>${esc(m.alumno_nombre)}</td>
        <td>${tagPermiso(m.permiso)}</td>
        <td>${m.num_practicas}</td>
        <td>${fmt(m.total_generado)} €</td>
        <td>${fmt(m.total_pagado)} €</td>
        <td><span class="saldo-pendiente">${fmt(m.saldo)} €</span></td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="empty">No hay alumnos morosos</td></tr>';

  cont.innerHTML = `
    <div class="card">
      <div class="card-title">Morosidad (saldo pendiente)</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Alumno</th><th>Permiso</th><th>Prácticas</th><th>Generado</th><th>Pagado</th><th>Saldo pendiente</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    </div>
  `;
}
