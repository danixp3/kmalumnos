// ─── REGISTRO RÁPIDO ─────────────────────────────────────────────────────────
// Registro de clases de todos los alumnos de un vehículo en un día, de un clic:
// cada clic suma ¼, ½ o 1 clase (se elige arriba), con notas por alumno y el
// editor completo (✎) para hora, km y cantidad exacta.
//
// 2026-10-07: el día, el coche, el profesor y el tipo se LEEN SIEMPRE de los
// campos en el momento de actuar. Antes el día se guardaba al cargar la lista y
// elegir otra fecha (calendario o escribiéndola) ni la recargaba ni cambiaba el
// día en que se apuntaban las clases: se seguía viendo —y registrando en— el día
// con el que se había abierto la pestaña.

const RR_PASO_KEY = 'km_rr_paso';
const RR_KMAUTO_KEY = 'km_rr_km_auto';
// Recuerda la última selección de profesor/tipo mientras la app está abierta
// (no se persiste en disco: al reabrir la app vuelve a "Sin profesor" / "Circulación").
let rrProfesorActual = null;
let rrTipoActual = 'circulacion';
let rrPaso = 1;            // cuánto suma cada clic: 0.25 | 0.5 | 1
let rrKmAuto = false;      // poner los km solos al sumar una clase
let rrTurno = 0;           // descarta respuestas de cargas anteriores (se cambió de día o de coche mientras llegaban)
let rrCola = Promise.resolve();   // las acciones se hacen una detrás de otra (clics seguidos no se pisan)
let rrAlumnos = [];

function rrLeerPrefs() {
  try {
    const p = parseFloat(localStorage.getItem(RR_PASO_KEY));
    if ([0.25, 0.5, 1].includes(p)) rrPaso = p;
    rrKmAuto = localStorage.getItem(RR_KMAUTO_KEY) === '1';
  } catch (e) { /* sin almacenamiento: valores por defecto */ }
}
function rrElegirPaso(p) {
  rrPaso = p;
  try { localStorage.setItem(RR_PASO_KEY, String(p)); } catch (e) {}
  rrMarcarPaso();
}
function rrMarcarPaso() {
  document.querySelectorAll('#rr-paso button').forEach(b => b.classList.toggle('on', parseFloat(b.dataset.p) === rrPaso));
}
function rrCambiarKmAuto(v) {
  rrKmAuto = !!v;
  try { localStorage.setItem(RR_KMAUTO_KEY, v ? '1' : '0'); } catch (e) {}
}

// Día y coche tal como están en pantalla AHORA
function rrCtx() {
  const vid = parseInt(document.getElementById('rr-vehiculo').value) || 0;
  const fecha = document.getElementById('rr-fecha').value || '';
  return { vid, fecha };
}

async function loadRegistroRapidoInit() {
  rrLeerPrefs();
  // Cargar vehículos en el selector (los retirados no se usan para dar clase)
  const vehiculos = (await window.api.getVehiculos()).filter(v => v.activo !== false);
  const sel = document.getElementById('rr-vehiculo');
  const previo = sel.value;
  sel.innerHTML = vehiculos.length
    ? vehiculos.map(v => `<option value="${v.id}">${esc(v.nombre)}${v.matricula ? ' (' + esc(v.matricula) + ')' : ''}</option>`).join('')
    : '<option value="">— No hay vehículos —</option>';
  if (previo && vehiculos.some(v => String(v.id) === previo)) sel.value = previo;

  // Cargar profesores en el selector, conservando la última selección de la sesión
  await llenarSelectProfesores('rr-profesor', rrProfesorActual);
  document.getElementById('rr-tipo').value = rrTipoActual;
  document.getElementById('rr-km-auto').checked = rrKmAuto;
  rrMarcarPaso();

  // Hoy por defecto (en hora local: toISOString daba la fecha de Greenwich)
  document.getElementById('rr-fecha').value = hoyISO();

  // Limpiar estado previo
  document.getElementById('rr-alumnos-wrap').style.display = 'none';
  document.getElementById('rr-empty').style.display = 'none';
  document.getElementById('rr-alert').classList.add('hidden');

  if (vehiculos.length) loadRegistroRapido();
}

async function loadRegistroRapido() {
  const { vid, fecha } = rrCtx();
  if (!vid) { showRRAlert('Selecciona un vehículo.', 'warn'); return; }
  if (!fecha) { showRRAlert('Selecciona un día.', 'warn'); return; }

  hideRRAlert();
  const turno = ++rrTurno;
  const alumnos = await window.api.getAlumnosPorVehiculo(vid, fecha);
  if (turno !== rrTurno) return;   // mientras llegaba, se cambió de día o de coche
  rrAlumnos = alumnos;

  if (!alumnos.length) {
    document.getElementById('rr-alumnos-wrap').style.display = 'none';
    document.getElementById('rr-empty').style.display = 'block';
    document.getElementById('rr-sinkm').classList.add('hidden');
    return;
  }

  document.getElementById('rr-empty').style.display = 'none';
  document.getElementById('rr-alumnos-wrap').style.display = 'block';

  renderRRAlumnos(alumnos);
  updateRRContador(alumnos);
}

function rrTextoClases(a) {
  return a.clases > 0 ? fmtClases(a.clases) : '0';
}

function renderRRAlumnos(alumnos) {
  const lista = document.getElementById('rr-lista');
  lista.innerHTML = alumnos.map(a => `
    <div class="rr-item${a.clases > 0 ? ' has-practicas' : ''}" data-id="${a.id}" onclick="ajustarRR(${a.id}, 1)" oncontextmenu="descontarRR(event, ${a.id})">
      <div class="rr-item-info">
        <div class="rr-item-name">${esc(a.nombre)}</div>
        <div class="rr-item-permiso" data-sub="${a.id}">${rrSubtitulo(a)}</div>
      </div>
      <div class="rr-counter" onclick="event.stopPropagation()" oncontextmenu="event.stopPropagation()">
        <button class="rr-nota-btn${a.nota ? ' has-nota' : ''}" onclick="abrirNotaRR(${a.id})" data-nota="${esc(a.nota || '')}" title="${a.nota ? esc(a.nota) : 'Añadir nota'}" aria-label="Nota"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
        <button class="rr-nota-btn" onclick="detalleRR(${a.id})" title="Cuántas clases fueron, hora y km con todo detalle" aria-label="Editar con detalle"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg></button>
        <button class="rr-counter-btn minus" onclick="ajustarRR(${a.id}, -1)" aria-label="Quitar">−</button>
        <span class="rr-counter-num" data-count="${a.id}">${rrTextoClases(a)}</span>
        <button class="rr-counter-btn plus" onclick="ajustarRR(${a.id}, 1)" aria-label="Sumar">+</button>
      </div>
    </div>
  `).join('');
}

function rrSubtitulo(a) {
  const extra = [];
  if (a.clases > 0 && a.hora_inicio) extra.push(esc(a.hora_inicio));
  if (a.clases > 0 && a.sin_km > 0) extra.push('<span class="rr-sinkm-tag">sin km</span>');
  return `Permiso ${esc(a.permiso)}${extra.length ? ' · ' + extra.join(' · ') : ''}`;
}

let _notaAlumnoId = null;

async function abrirNotaRR(alumnoId) {
  _notaAlumnoId = alumnoId;
  const btn = document.querySelector(`.rr-item[data-id="${alumnoId}"] .rr-nota-btn`);
  const notaActual = btn ? (btn.dataset.nota || '') : '';
  const nombre = document.querySelector(`.rr-item[data-id="${alumnoId}"] .rr-item-name`);

  document.getElementById('modal-nota-titulo').textContent = nombre ? nombre.textContent : 'Nota';
  document.getElementById('modal-nota-texto').value = notaActual;
  document.getElementById('modal-nota-rr').classList.add('open');
  document.getElementById('modal-nota-texto').focus();
}

function cerrarNotaRR() {
  document.getElementById('modal-nota-rr').classList.remove('open');
  _notaAlumnoId = null;
}

async function guardarNotaRR() {
  if (_notaAlumnoId === null) return;
  const { vid, fecha } = rrCtx();
  if (!vid || !fecha) return;
  const nota = document.getElementById('modal-nota-texto').value.trim();

  const res = await window.api.guardarNotaAlumno(vid, fecha, _notaAlumnoId, nota, rrProfesorActual, rrTipoActual);

  // Si se creó una práctica nueva, refrescar la lista completa
  if (res && res.created) {
    cerrarNotaRR();
    loadRegistroRapido();
    return;
  }

  // Actualizar botón
  const btn = document.querySelector(`.rr-item[data-id="${_notaAlumnoId}"] .rr-nota-btn`);
  if (btn) {
    btn.dataset.nota = nota;
    if (nota) {
      btn.classList.add('has-nota');
      btn.title = nota;
    } else {
      btn.classList.remove('has-nota');
      btn.title = 'Añadir nota';
    }
  }
  cerrarNotaRR();
}

// Suma (o resta) clases al alumno en el día y coche que se ven. Las acciones van en
// cola: tres clics seguidos hacen tres cambios en orden, sin pisarse.
function ajustarRR(alumnoId, signo) {
  const { vid, fecha } = rrCtx();
  if (!vid || !fecha) return;
  const delta = signo * rrPaso;
  rrCola = rrCola.then(() => rrAplicarDelta(vid, fecha, alumnoId, delta)).catch(e => { console.error(e); });
  return rrCola;
}

async function rrAplicarDelta(vid, fecha, alumnoId, delta) {
  const rango = getRangoPref();
  const res = await window.api.sumarClasesDia({
    vehiculo_id: vid, fecha, alumno_id: alumnoId, delta,
    profesor_id: rrProfesorActual, tipo: rrTipoActual, sucursal_id: getSucursalActual(),
    km: rrKmAuto ? 'auto' : 'sin', kmMin: rango.min, kmMax: rango.max
  });
  // Si mientras tanto se cambió de día o de coche, esta respuesta ya no es de lo que se ve
  const ahora = rrCtx();
  if (ahora.vid !== vid || ahora.fecha !== fecha) return;
  if (!res || res.ok === false) {
    showToast('rr-alert', (res && res.errores && res.errores[0]) || 'No se pudo cambiar la clase.', 'err');
    return;
  }
  // Actualizar la tarjeta y los totales con lo que hay guardado de verdad
  const alumnos = await window.api.getAlumnosPorVehiculo(vid, fecha);
  if (rrCtx().vid !== vid || rrCtx().fecha !== fecha) return;
  rrAlumnos = alumnos;
  const a = alumnos.find(x => x.id === alumnoId);
  const numEl = document.querySelector(`.rr-counter-num[data-count="${alumnoId}"]`);
  const item = document.querySelector(`.rr-item[data-id="${alumnoId}"]`);
  if (a && numEl) {
    const nuevo = rrTextoClases(a);
    if (numEl.textContent !== nuevo) { numEl.textContent = nuevo; numEl.classList.remove('rr-num-pop'); void numEl.offsetWidth; numEl.classList.add('rr-num-pop'); }
  }
  if (a && item) {
    item.classList.toggle('has-practicas', a.clases > 0);
    const sub = item.querySelector('[data-sub]'); if (sub) sub.innerHTML = rrSubtitulo(a);
  }
  updateRRContador(alumnos);
  if (res.avisos && res.avisos.some(x => x.tipo === 'no_cabe')) showToast('rr-alert', 'La clase se ha apuntado sin km: no cabe en el hueco del coche. Usa ✎ para colocarla o cuádrala en Kilómetros.', 'warn');
}

// Click derecho sobre la tarjeta de un alumno: quita una porción (la misma que suma cada clic)
function descontarRR(event, alumnoId) {
  event.preventDefault();
  const a = rrAlumnos.find(x => x.id === alumnoId);
  if (!a || !(a.clases > 0)) { showToast('rr-alert', 'Este alumno no tiene clases registradas ese día.', 'warn'); return; }
  ajustarRR(alumnoId, -1);
}

// Editor completo (cuántas clases fueron, hora, km…) de la sesión del alumno ese día
async function detalleRR(alumnoId) {
  const { vid, fecha } = rrCtx();
  if (!vid || !fecha) return;
  const practicas = await window.api.getPracticas(alumnoId);
  const delDia = practicas.filter(p => p.vehiculo_id === vid && p.fecha === fecha);
  const alTerminar = () => loadRegistroRapido();
  if (delDia.length) abrirEditorClase({ practica_id: delDia[delDia.length - 1].id, alTerminar });
  else abrirEditorClase({ alumno_id: alumnoId, vehiculo_id: vid, fecha, profesor_id: rrProfesorActual, alTerminar });
}

function updateRRContador(alumnos) {
  const total = alumnos.length;
  const conPracticas = alumnos.filter(a => a.clases > 0).length;
  const totalClases = Math.round(alumnos.reduce((sum, a) => sum + a.clases, 0) * 4) / 4;
  const cont = document.getElementById('rr-contador');
  if (cont) {
    cont.innerHTML = `<strong>${fmtClases(totalClases)}</strong> ${totalClases === 1 ? 'clase' : 'clases'} · ${conPracticas} de ${total} alumnos`;
    cont.style.color = totalClases > 0 ? 'var(--success-fg)' : 'var(--text-muted)';
  }
  // Clases de ese día sin km: se cuadran en Kilómetros
  const aviso = document.getElementById('rr-sinkm');
  if (aviso) {
    const sinKm = alumnos.reduce((s, a) => s + (a.clases > 0 ? a.sin_km : 0), 0);
    if (sinKm > 0) {
      const vid = rrCtx().vid;
      aviso.className = 'alert alert-info rr-sinkm-aviso';
      aviso.innerHTML = `<span><b>${sinKm} ${sinKm === 1 ? 'práctica' : 'prácticas'} de este día ${sinKm === 1 ? 'está' : 'están'} sin km.</b> El asistente de Kilómetros las coloca por día y hora entre las demás del coche.</span><button class="btn btn-outline btn-sm" onclick="cuadreIrA(${vid})">Poner los km</button>`;
    } else {
      aviso.className = 'hidden';
      aviso.innerHTML = '';
    }
  }
}

function showRRAlert(msg, type = 'err') {
  const el = document.getElementById('rr-alert');
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideRRAlert() {
  document.getElementById('rr-alert').classList.add('hidden');
}

function cambiarFechaRR(delta) {
  const input = document.getElementById('rr-fecha');
  if (!input.value) input.value = hoyISO();
  input.value = sumarDiasFecha(input.value, delta);
  loadRegistroRapido();
}

function irHoyRR() {
  document.getElementById('rr-fecha').value = hoyISO();
  loadRegistroRapido();
}

// Los botones laterales del ratón ya no cambian aquí de día: en toda la app
// van a la pantalla anterior / siguiente (renderer/historial-pantallas.js).
// El día se cambia con las flechas de la propia pantalla.
