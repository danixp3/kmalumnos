// ─── AGENDA VISUAL (REJILLA SEMANAL DRAG&DROP) ─────────────────────────────
// Vista alternativa y 100% aditiva de la agenda de reservas (renderer/reservas.js):
// una rejilla de 7 columnas (una por día de la semana) con tarjetas arrastrables
// para cambiar la fecha de una reserva. No sustituye a la pantalla "Agenda"
// clásica, solo la reutiliza (mismos datos, mismas acciones de estado). Toda la
// lógica de datos/estado de reservas sigue viviendo en reservas.js; aquí solo
// se pinta y se arrastra.

// ─── ESTADO DEL MÓDULO ──────────────────────────────────────────────────────
let avLunes = null;        // YYYY-MM-DD del lunes de la semana mostrada
let avReservasCache = [];  // últimas reservas cargadas (todas las de la sucursal)

const AV_DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

// ─── FECHAS (sin desfases de zona horaria) ─────────────────────────────────
// new Date('YYYY-MM-DD') interpreta la cadena en UTC medianoche, lo que puede
// desplazar un día según la zona horaria local. Aquí siempre se trabaja con
// componentes locales (año/mes/día) y se arma la cadena YYYY-MM-DD a mano.
function avFechaAYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function avYmdADate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function avSumarDias(ymd, dias) {
  const d = avYmdADate(ymd);
  d.setDate(d.getDate() + dias);
  return avFechaAYmd(d);
}

function avLunesDeHoy() {
  const hoy = new Date();
  const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const offset = (dia.getDay() + 6) % 7; // 0=lunes ... 6=domingo
  dia.setDate(dia.getDate() - offset);
  return avFechaAYmd(dia);
}

// ─── CARGA Y PINTADO ─────────────────────────────────────────────────────────
async function loadAgendaVisual() {
  if (!avLunes) avLunes = avLunesDeHoy();
  avReservasCache = await window.api.getReservas(getSucursalActual());
  renderAgendaVisual();
}

function renderAgendaVisual() {
  const grid = document.getElementById('av-grid');
  if (!grid) return;

  const fechas = [];
  for (let i = 0; i < 7; i++) fechas.push(avSumarDias(avLunes, i));
  const domingo = fechas[6];
  const hoyYmd = avFechaAYmd(new Date());

  const rango = document.getElementById('av-rango');
  if (rango) rango.textContent = `${fmtFecha(avLunes)} – ${fmtFecha(domingo)}`;

  grid.innerHTML = fechas.map((fecha, i) => {
    const reservasDia = avReservasCache
      .filter(r => r.fecha === fecha)
      .sort((a, b) => (a.hora_inicio || '99:99').localeCompare(b.hora_inicio || '99:99'));

    const d = avYmdADate(fecha);
    const fechaCorta = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const esHoy = fecha === hoyYmd;

    const tarjetas = reservasDia.map(r => avPintarTarjeta(r)).join('');

    return `<div class="av-col${esHoy ? ' av-col-hoy' : ''}" data-fecha="${fecha}"
        ondragover="avColDragOver(event)" ondragleave="avColDragLeave(event)" ondrop="avColDrop(event)">
      <div class="av-col-header">
        <span>${AV_DIAS_SEMANA[i]} ${fechaCorta}</span>
        <button class="btn btn-sm av-col-add" title="Nueva reserva este día" onclick="avNuevaReservaDia('${fecha}')">+</button>
      </div>
      <div class="av-col-body">${tarjetas || '<div class="av-col-vacio">Sin reservas</div>'}</div>
    </div>`;
  }).join('');
}

function avPintarTarjeta(r) {
  const cancelada = r.estado === 'cancelada';
  const hora = r.hora_inicio ? esc(r.hora_inicio) : '';
  const segundaLinea = [r.vehiculo_nombre, r.profesor_nombre].filter(Boolean).map(esc).join(' · ');

  let acciones = '';
  if (r.estado === 'solicitada') {
    acciones += `<button class="btn btn-sm" style="background:var(--success-light);color:var(--success-fg)" onclick="avConfirmar(event, ${r.id})">Confirmar</button>`;
  }
  if (r.estado === 'confirmada') {
    acciones += `<button class="btn btn-sm" style="background:var(--info-bg);color:var(--info-fg)" onclick="avRealizada(event, ${r.id})">Realizada</button>`;
  }
  if (r.estado !== 'cancelada' && r.estado !== 'realizada') {
    acciones += `<button class="btn btn-sm" style="background:var(--danger-light);color:var(--danger-fg)" onclick="avCancelar(event, ${r.id})">Cancelar</button>`;
  }
  acciones += `<button class="btn btn-sm" onclick="avEditar(event, ${r.id})">Editar</button>`;

  return `<div class="av-reserva av-reserva-${r.estado}" draggable="true" data-id="${r.id}"
      ondragstart="avCardDragStart(event)" title="${esc(RESERVA_ESTADO_LABEL[r.estado] || r.estado)}"${cancelada ? ' style="opacity:.55"' : ''}>
    <div class="av-reserva-linea1">${hora ? `<strong>${hora}</strong> ` : ''}${esc(r.alumno_nombre || 'Sin alumno')}</div>
    ${segundaLinea ? `<div class="av-reserva-linea2">${segundaLinea}</div>` : ''}
    <div class="av-reserva-acciones">${acciones}</div>
  </div>`;
}

// ─── NAVEGACIÓN DE SEMANA ────────────────────────────────────────────────────
function avSemana(delta) {
  avLunes = avSumarDias(avLunes || avLunesDeHoy(), delta * 7);
  loadAgendaVisual();
}

function avHoy() {
  avLunes = avLunesDeHoy();
  loadAgendaVisual();
}

// ─── ALTA RÁPIDA DESDE UNA COLUMNA ──────────────────────────────────────────
async function avNuevaReservaDia(fecha) {
  await abrirNuevaReserva();
  const campoFecha = document.getElementById('res-fecha');
  if (campoFecha) campoFecha.value = fecha;
}

// ─── ACCIONES RÁPIDAS DESDE LA TARJETA (reutilizan reservas.js) ────────────
async function avConfirmar(event, id) {
  event.stopPropagation();
  await confirmarReserva(id);
  loadAgendaVisual();
}

async function avCancelar(event, id) {
  event.stopPropagation();
  await cancelarReserva(id);
  loadAgendaVisual();
}

async function avRealizada(event, id) {
  event.stopPropagation();
  await marcarRealizadaReserva(id);
  loadAgendaVisual();
}

async function avEditar(event, id) {
  event.stopPropagation();
  await abrirEditarReserva(id);
}

// ─── DRAG & DROP NATIVO HTML5 ────────────────────────────────────────────────
function avCardDragStart(event) {
  const id = event.currentTarget.dataset.id;
  event.dataTransfer.setData('text/plain', id);
}

function avColDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add('drag-over');
}

function avColDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

async function avColDrop(event) {
  event.preventDefault();
  const col = event.currentTarget;
  col.classList.remove('drag-over');
  const id = event.dataTransfer.getData('text/plain');
  const fechaDestino = col.dataset.fecha;
  const reserva = avReservasCache.find(r => String(r.id) === String(id));
  if (!reserva || reserva.fecha === fechaDestino) return;

  try {
    await window.api.updateReserva(parseInt(id), { fecha: fechaDestino });
    showToast('av-toast', 'Reserva movida al ' + fmtFecha(fechaDestino) + '.', 'ok');
  } catch (e) {
    showToast('av-toast', 'No se pudo mover la reserva.', 'err');
  }
  loadAgendaVisual();
}
