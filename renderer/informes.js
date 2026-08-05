// ─── INFORMES ────────────────────────────────────────────────────────────
// Pantalla "Informes": junta en un solo vistazo aprobados, ocupación de
// profesores/vehículos, ingresos y deudas de un periodo (getInformes en
// db/estadisticas.js). Exportación en PDF vía window.print() (reutiliza
// #ficha-print, el mismo elemento oculto que usa la ficha imprimible del
// alumno — ver renderer/alumnos.js) y en CSV vía Blob + <a download>.

let _ultimoInforme = null;

const TIPO_EXAMEN_LABEL_INF = { teorico: 'Teórico', maniobras: 'Maniobras', circulacion: 'Circulación' };

function _fmtPctInf(ratio) {
  return `${Math.round((ratio || 0) * 100)}%`;
}

async function loadInformes() {
  const desde = document.getElementById('inf-desde').value || null;
  const hasta = document.getElementById('inf-hasta').value || null;
  const informe = await window.api.getInformes(desde, hasta, getSucursalActual());
  _ultimoInforme = informe;
  renderInformes(informe);
}

function renderInformes(informe) {
  const cont = document.getElementById('informes-contenido');
  if (!cont) return;

  const filasTipo = ['teorico', 'maniobras', 'circulacion'].map(tipo => {
    const s = informe.aprobados.porTipo[tipo];
    return `<tr><td>${TIPO_EXAMEN_LABEL_INF[tipo]}</td><td>${s.aptos} / ${s.presentados}</td><td>${_fmtPctInf(s.ratio)}</td></tr>`;
  }).join('');

  const filasProfesorAprobados = informe.aprobados.porProfesor.length
    ? informe.aprobados.porProfesor.map(p => `<tr><td>${esc(p.nombre)}</td><td>${p.aptos} / ${p.presentados}</td><td>${_fmtPctInf(p.ratio)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">Sin datos por profesor</td></tr>';

  const filasOcupacionProfesores = informe.ocupacionProfesores.length
    ? informe.ocupacionProfesores.map(p => `<tr><td>${esc(p.nombre)}</td><td>${p.nPracticas}</td><td>${p.kmTotales} km</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">Sin prácticas en el periodo</td></tr>';

  const filasOcupacionVehiculos = informe.ocupacionVehiculos.length
    ? informe.ocupacionVehiculos.map(v => `<tr><td>${esc(v.nombre)}</td><td>${esc(v.matricula || '—')}</td><td>${v.nPracticas}</td><td>${v.kmTotales} km</td><td>${v.mediaKmPractica} km</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Sin prácticas en el periodo</td></tr>';

  const filasIngresosPorMes = informe.ingresos.porMes.length
    ? informe.ingresos.porMes.map(m => `<tr><td>${esc(m.mes)}</td><td>${fmt(m.total)} €</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">Sin ingresos en el periodo</td></tr>';

  const filasDeudas = informe.deudas.detalle.length
    ? informe.deudas.detalle.map(d => `<tr><td>${esc(d.nombre)}</td><td>${fmt(d.saldo)} €</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">Sin alumnos con deuda</td></tr>';

  cont.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Aprobados</div>
      <div class="stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">
        <div class="stat">
          <div class="stat-label">Ratio global de aprobados</div>
          <div class="stat-value">${_fmtPctInf(informe.aprobados.global.ratio)}</div>
          <div class="stat-sub">${informe.aprobados.global.aptos} de ${informe.aprobados.global.presentados} presentados</div>
        </div>
      </div>
      <div class="table-wrap" style="margin-bottom:16px">
        <table><thead><tr><th>Tipo</th><th>Aptos / Presentados</th><th>%</th></tr></thead><tbody>${filasTipo}</tbody></table>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Profesor</th><th>Aptos / Presentados</th><th>%</th></tr></thead><tbody>${filasProfesorAprobados}</tbody></table>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Ocupación de profesores</div>
      <div class="table-wrap">
        <table><thead><tr><th>Profesor</th><th>Nº prácticas</th><th>Km totales</th></tr></thead><tbody>${filasOcupacionProfesores}</tbody></table>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Ocupación de vehículos</div>
      <div class="table-wrap">
        <table><thead><tr><th>Vehículo</th><th>Matrícula</th><th>Nº prácticas</th><th>Km totales</th><th>Media km/práctica</th></tr></thead><tbody>${filasOcupacionVehiculos}</tbody></table>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Ingresos</div>
      <div class="stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">
        <div class="stat">
          <div class="stat-label">Total del periodo</div>
          <div class="stat-value">${fmt(informe.ingresos.total)} €</div>
          <div class="stat-sub">${informe.ingresos.nPagos} pago${informe.ingresos.nPagos === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Mes</th><th>Total</th></tr></thead><tbody>${filasIngresosPorMes}</tbody></table>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Deudas</div>
      <div class="stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">
        <div class="stat">
          <div class="stat-label">Total adeudado</div>
          <div class="stat-value">${fmt(informe.deudas.totalAdeudado)} €</div>
          <div class="stat-sub">${informe.deudas.nAlumnos} alumno${informe.deudas.nAlumnos === 1 ? '' : 's'} con deuda</div>
        </div>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Alumno</th><th>Saldo</th></tr></thead><tbody>${filasDeudas}</tbody></table>
      </div>
    </div>
  `;
}

// ─── IMPRIMIR / GUARDAR PDF ─────────────────────────────────────────────
// Mismo patrón que imprimirFichaAlumno/imprimirLibroRegistro (renderer/alumnos.js):
// rellena #ficha-print (oculto en pantalla, visible solo en @media print) y
// lanza window.print().
async function imprimirInforme() {
  if (!_ultimoInforme) { showToast('inf-toast', 'Genera el informe antes de imprimir.', 'warn'); return; }
  const informe = _ultimoInforme;

  const filasTipo = ['teorico', 'maniobras', 'circulacion'].map(tipo => {
    const s = informe.aprobados.porTipo[tipo];
    return `<tr><td>${TIPO_EXAMEN_LABEL_INF[tipo]}</td><td>${s.aptos} / ${s.presentados}</td><td>${_fmtPctInf(s.ratio)}</td></tr>`;
  }).join('');

  const filasOcupacionProfesores = informe.ocupacionProfesores.map(p =>
    `<tr><td>${esc(p.nombre)}</td><td>${p.nPracticas}</td><td>${p.kmTotales} km</td></tr>`).join('');

  const filasOcupacionVehiculos = informe.ocupacionVehiculos.map(v =>
    `<tr><td>${esc(v.nombre)}</td><td>${esc(v.matricula || '—')}</td><td>${v.nPracticas}</td><td>${v.kmTotales} km</td></tr>`).join('');

  const filasIngresos = informe.ingresos.porMes.map(m =>
    `<tr><td>${esc(m.mes)}</td><td>${fmt(m.total)} €</td></tr>`).join('');

  const filasDeudas = informe.deudas.detalle.map(d =>
    `<tr><td>${esc(d.nombre)}</td><td>${fmt(d.saldo)} €</td></tr>`).join('');

  const rango = `${informe.periodo.desde ? fmtFecha(informe.periodo.desde) : 'inicio'} — ${informe.periodo.hasta ? fmtFecha(informe.periodo.hasta) : 'hoy'}`;

  const ficha = document.getElementById('ficha-print');
  ficha.innerHTML = `
    <div class="ficha-cabecera">
      <img src="icon.png" alt="AulaMovil" class="ficha-logo">
      <div>
        <h1>AulaMovil — Informe (${esc(rango)})</h1>
        <div class="ficha-fecha">Generado el ${fmtFecha(new Date().toISOString().split('T')[0])}</div>
      </div>
    </div>

    <h2>Aprobados</h2>
    <div class="ficha-grid">
      <div class="ficha-campo"><span class="ficha-etiqueta">Ratio global</span><span class="ficha-valor">${_fmtPctInf(informe.aprobados.global.ratio)} (${informe.aprobados.global.aptos} de ${informe.aprobados.global.presentados})</span></div>
    </div>
    <table class="ficha-tabla">
      <thead><tr><th>Tipo</th><th>Aptos / Presentados</th><th>%</th></tr></thead>
      <tbody>${filasTipo}</tbody>
    </table>

    <h2>Ocupación de profesores</h2>
    <table class="ficha-tabla">
      <thead><tr><th>Profesor</th><th>Nº prácticas</th><th>Km totales</th></tr></thead>
      <tbody>${filasOcupacionProfesores || '<tr><td colspan="3">Sin datos</td></tr>'}</tbody>
    </table>

    <h2>Ocupación de vehículos</h2>
    <table class="ficha-tabla">
      <thead><tr><th>Vehículo</th><th>Matrícula</th><th>Nº prácticas</th><th>Km totales</th></tr></thead>
      <tbody>${filasOcupacionVehiculos || '<tr><td colspan="4">Sin datos</td></tr>'}</tbody>
    </table>

    <h2>Ingresos</h2>
    <div class="ficha-grid">
      <div class="ficha-campo"><span class="ficha-etiqueta">Total del periodo</span><span class="ficha-valor">${fmt(informe.ingresos.total)} €</span></div>
    </div>
    <table class="ficha-tabla">
      <thead><tr><th>Mes</th><th>Total</th></tr></thead>
      <tbody>${filasIngresos || '<tr><td colspan="2">Sin datos</td></tr>'}</tbody>
    </table>

    <h2>Deudas</h2>
    <div class="ficha-grid">
      <div class="ficha-campo"><span class="ficha-etiqueta">Total adeudado</span><span class="ficha-valor">${fmt(informe.deudas.totalAdeudado)} €</span></div>
    </div>
    <table class="ficha-tabla">
      <thead><tr><th>Alumno</th><th>Saldo</th></tr></thead>
      <tbody>${filasDeudas || '<tr><td colspan="2">Sin alumnos con deuda</td></tr>'}</tbody>
    </table>
  `;

  window.print();
}

// ─── EXPORTAR CSV ────────────────────────────────────────────────────────
// Una sección por bloque, con su propia fila de encabezados (patrón de
// "Excel" del proyecto: CSV plano, ver renderer/csv.js). BOM al principio
// para que Excel muestre bien los acentos.
function _csvLinea(campos) {
  return campos.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(';') + '\r\n';
}

function exportarInformeCSV() {
  if (!_ultimoInforme) { showToast('inf-toast', 'Genera el informe antes de exportar.', 'warn'); return; }
  const informe = _ultimoInforme;
  let csv = '﻿';

  csv += _csvLinea(['Informe', `${informe.periodo.desde || 'inicio'} a ${informe.periodo.hasta || 'hoy'}`]);
  csv += '\r\n';

  csv += _csvLinea(['Aprobados global', 'Aptos', 'Presentados', '%']);
  csv += _csvLinea(['', informe.aprobados.global.aptos, informe.aprobados.global.presentados, _fmtPctInf(informe.aprobados.global.ratio)]);
  csv += '\r\n';

  csv += _csvLinea(['Aprobados por tipo', 'Aptos', 'Presentados', '%']);
  for (const tipo of ['teorico', 'maniobras', 'circulacion']) {
    const s = informe.aprobados.porTipo[tipo];
    csv += _csvLinea([TIPO_EXAMEN_LABEL_INF[tipo], s.aptos, s.presentados, _fmtPctInf(s.ratio)]);
  }
  csv += '\r\n';

  csv += _csvLinea(['Ocupación profesores', 'Nº prácticas', 'Km totales']);
  for (const p of informe.ocupacionProfesores) csv += _csvLinea([p.nombre, p.nPracticas, p.kmTotales]);
  csv += '\r\n';

  csv += _csvLinea(['Ocupación vehículos', 'Matrícula', 'Nº prácticas', 'Km totales', 'Media km/práctica']);
  for (const v of informe.ocupacionVehiculos) csv += _csvLinea([v.nombre, v.matricula, v.nPracticas, v.kmTotales, v.mediaKmPractica]);
  csv += '\r\n';

  csv += _csvLinea(['Ingresos por mes', 'Total €']);
  for (const m of informe.ingresos.porMes) csv += _csvLinea([m.mes, m.total]);
  csv += _csvLinea(['Total ingresos', informe.ingresos.total]);
  csv += '\r\n';

  csv += _csvLinea(['Deudas', 'Saldo €']);
  for (const d of informe.deudas.detalle) csv += _csvLinea([d.nombre, d.saldo]);
  csv += _csvLinea(['Total adeudado', informe.deudas.totalAdeudado]);

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `informe_${informe.periodo.desde || 'inicio'}_${informe.periodo.hasta || 'hoy'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
