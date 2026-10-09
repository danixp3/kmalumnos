// ─── SYNC UI Y CUENTA DE EMPRESA ────────────────────────────────────────────
// Barra de estado de sincronización, subida manual de todos los datos y gestión
// de la cuenta de empresa (login, registro, cierre de sesión).

// ─── SYNC UI ──────────────────────────────────────────────────────────────────
const SYNC_LABELS = {
  ok:      '✓ Sincronizado',
  syncing: '↻ Sincronizando...',
  pending: '● Cambios pendientes',
  offline: 'Sin conexión',
  error:   '✕ Error de sync'
};

const AJUSTES_SYNC_COLORS = { ok: '#2E9E6B', syncing: '#FFB81C', pending: '#E09A00', offline: '#8C8F97', error: '#D0392B' };

let syncUltimoOk = null;
function updateSyncBar(status, reason) {
  const bar   = document.getElementById('sync-bar');
  const label = document.getElementById('sync-label');
  if (bar && label) {
    bar.dataset.status = status;
    label.textContent  = SYNC_LABELS[status] || status;
    // Al pasar el ratón por encima se ve el motivo exacto del error (o cuándo se actualizó por última vez)
    if (status === 'ok') syncUltimoOk = new Date();
    bar.title = (status === 'error' && reason) ? 'Motivo: ' + reason
      : (status === 'ok' && syncUltimoOk ? 'Al día · última comprobación a las ' + syncUltimoOk.toTimeString().slice(0, 5) : '');
  }

  // Segundo indicador, grande y legible, en Ajustes
  const ajLabel = document.getElementById('ajustes-sync-label');
  const ajDot   = document.getElementById('ajustes-sync-dot');
  if (ajLabel) ajLabel.textContent = SYNC_LABELS[status] || status;
  if (ajDot) ajDot.style.background = AJUSTES_SYNC_COLORS[status] || '#64748b';
}

async function pushAllToCloud() {
  const bar = document.getElementById('push-all-bar');
  if (!await confirmar('¿Subir TODOS los datos (vehículos, alumnos y prácticas) a Supabase ahora?\n\nHaz esto la primera vez para que la web del móvil tenga acceso a los datos.')) return;
  if (bar) bar.style.color = 'rgba(99,102,241,.7)';
  updateSyncBar('syncing');
  const res = await window.api.syncPushAll();
  if (res && res.ok) {
    updateSyncBar('ok');
    if (bar) { bar.style.color = 'rgba(16,185,129,.6)'; bar.innerHTML = bar.innerHTML.replace('Subir todo a la nube', '✓ Datos subidos'); }
  } else {
    updateSyncBar('error');
    alert('Error al subir: ' + (res?.reason || 'Sin conexión'));
    if (bar) bar.style.color = 'rgba(239,68,68,.6)';
  }
}

async function syncNow() {
  updateSyncBar('syncing');
  const res = await window.api.syncNow();
  if (res && res.ok) {
    updateSyncBar('ok');
    // Si se bajaron datos nuevos, repintar la pantalla abierta (main.js lo avisa también por
    // 'datos-actualizados'; aquí se hace ya, sin esperar, porque el usuario acaba de pedirlo)
    if (res.pulled > 0) refrescarPantallaActual({ pulled: res.pulled }, { avisar: false, ya: true });
  } else {
    updateSyncBar(res && res.reason === 'Sin conexión a internet' ? 'offline' : 'error', res?.reason);
  }
}

// Escuchar cambios de estado desde main.js
window.api.onSyncStatus((status, reason) => {
  updateSyncBar(status, reason);
  // Con el Panel a la vista se mantiene al día tras cada sync correcto (es barato);
  // el resto de pantallas se repintan solo cuando llegan datos nuevos (abajo).
  if (status === 'ok' && document.getElementById('page-dashboard')?.classList.contains('active')) loadDashboard();
});

// ─── DATOS NUEVOS DE LA NUBE: la pantalla abierta se actualiza sola ───────────
// main.js avisa ('datos-actualizados') cada vez que un sync TRAE algo: clases que
// un profesor acaba de guardar en el móvil, un alumno dado de alta en la web,
// cambios del otro ordenador. Antes solo se repintaban el Panel y la ficha
// abierta, así que en Prácticas, Registro rápido o Agenda había que pulsar
// «Sincronizar» y entrar otra vez para ver lo nuevo. Ahora se repinta la pantalla
// que se está mirando, salvo que justo se esté escribiendo o haya una ventana
// abierta: en ese caso espera a que se cierre (sin pisar lo que se está haciendo).
const REFRESCO_PANTALLAS = {
  'dashboard': () => loadDashboard(),
  'practicas-global': () => loadPracticasGlobal(),
  'registro-rapido': () => loadRegistroRapido(),
  'reservas': () => loadReservas(),
  'agenda-visual': () => loadAgendaVisual(),
  'profesores': () => { loadProfesores(); loadStatsProfesores(); },
  'alumnos': () => { if (currentAlumnoId) return loadPracticas(); return loadAlumnos(); }
};

let refrescoPendiente = null;   // { pulled, practicas } acumulado mientras no era buen momento
let refrescoTimer = null;
let refrescoDesde = 0;

function paginaActivaId() {
  const el = document.querySelector('.page.active');
  return el ? el.id.replace(/^page-/, '') : '';
}

// Última tecla pulsada: un campo con el cursor dentro no cuenta como «escribiendo» si hace rato que no se teclea
let refrescoUltimaTecla = 0;
document.addEventListener('keydown', () => { refrescoUltimaTecla = Date.now(); }, true);

// ¿Se está escribiendo o hay algo a medias? Entonces no se toca la pantalla.
function hayAlgoEditandose() {
  if (document.querySelector('.overlay.open:not(.cerrando), .dp-pop.dp-visible')) return true;
  const a = document.activeElement;
  if (Date.now() - refrescoUltimaTecla < 8000 && a && a.closest && a.closest('.page.active') &&
      a.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select')) return true;
  if (typeof pmSucio !== 'undefined' && pmSucio) return true;
  if (typeof fdEditando !== 'undefined' && fdEditando) return true;
  if (typeof tutorialEnCurso === 'function' && tutorialEnCurso()) return true;
  return false;
}

// Para main.js (instalar una versión nueva sola solo si nadie está a medias de nada)
function appOcupada() {
  if (document.querySelector('.overlay.open:not(.cerrando):not(#modal-actualizacion)')) return true;
  if (typeof pmSucio !== 'undefined' && pmSucio) return true;
  if (typeof fdEditando !== 'undefined' && fdEditando) return true;
  if (typeof tutorialEnCurso === 'function' && tutorialEnCurso()) return true;
  return false;
}

function textoClasesNuevas(n) {
  return n === 1 ? 'Se ha recibido 1 clase nueva' : `Se han recibido ${n} clases nuevas`;
}

// opciones.avisar: enseñar el aviso «Se han recibido N clases nuevas» (por defecto sí)
// opciones.ya: repintar sin esperar al pequeño margen que agrupa avisos seguidos
function refrescarPantallaActual(info, opciones = {}) {
  const acumulado = refrescoPendiente || { pulled: 0, practicas: 0 };
  refrescoPendiente = { pulled: acumulado.pulled + ((info && info.pulled) || 0), practicas: acumulado.practicas + ((info && info.practicas) || 0), firmas: (acumulado.firmas || 0) + ((info && info.firmas) || 0), avisar: opciones.avisar !== false };
  refrescoDesde = refrescoDesde || Date.now();
  clearTimeout(refrescoTimer);
  refrescoTimer = setTimeout(intentarRefresco, opciones.ya ? 0 : 400);
}

function intentarRefresco() {
  refrescoTimer = null;
  if (!refrescoPendiente) return;
  // Si no es buen momento se reintenta cada 2 s (hasta 2 min: después, lo recoge la próxima navegación)
  if (hayAlgoEditandose()) {
    if (Date.now() - refrescoDesde > 120000) { refrescoPendiente = null; refrescoDesde = 0; return; }
    refrescoTimer = setTimeout(intentarRefresco, 2000);
    return;
  }
  const info = refrescoPendiente;
  refrescoPendiente = null; refrescoDesde = 0;
  const repintar = REFRESCO_PANTALLAS[paginaActivaId()];
  try { if (repintar) Promise.resolve(repintar()).catch(() => {}); } catch (e) { /* una pantalla que falla no debe romper las demás */ }
  if (info.avisar && typeof toastApp === 'function') {
    const partes = [];
    if (info.practicas > 0) partes.push(textoClasesNuevas(info.practicas));
    if (info.firmas > 0) partes.push(info.firmas === 1 ? '1 clase firmada por el alumno' : `${info.firmas} clases firmadas por el alumno`);
    if (partes.length) toastApp(partes.join(' · '));
  }
}

window.api.onDatosActualizados((info) => refrescarPantallaActual(info));
// Al recuperar internet, preguntar a la nube enseguida (sin esperar al siguiente turno)
window.addEventListener('online', () => { window.api.sondearNube().catch(() => {}); });

// Obtener estado inicial
window.api.getSyncStatus().then(s => updateSyncBar(s || 'offline'));

// Conflictos de sync: dos dispositivos editaron el mismo registro entre syncs.
// La resolución (gana el más reciente) no cambia; esto solo hace visible que
// pasó, y apunta a Historial para ver qué se descartó. Se muestra en el
// indicador del sidebar (visible en cualquier página) y se refuerza en Ajustes;
// visitar Historial lo da por visto.
function mostrarConflictosSync(n) {
  if (!n) return;
  const badge = document.getElementById('sync-conflictos-badge');
  if (badge) {
    badge.textContent = n === 1 ? '1 conflicto' : `${n} conflictos`;
    badge.classList.remove('hidden');
  }
  const ajAlert = document.getElementById('ajustes-sync-conflictos');
  if (ajAlert) {
    ajAlert.textContent = (n === 1
      ? 'Se detectó 1 conflicto de sincronización (dos ediciones a la vez del mismo dato).'
      : `Se detectaron ${n} conflictos de sincronización (dos ediciones a la vez del mismo dato).`)
      + ' Gana la edición más reciente; pulsa aquí para ver el detalle en Historial.';
    ajAlert.classList.remove('hidden');
  }
}

function ocultarConflictosSync() {
  const badge = document.getElementById('sync-conflictos-badge');
  if (badge) badge.classList.add('hidden');
  const ajAlert = document.getElementById('ajustes-sync-conflictos');
  if (ajAlert) ajAlert.classList.add('hidden');
}

window.api.onSyncConflictos((n) => mostrarConflictosSync(n));

// ─── MOSTRAR/OCULTAR CONTRASEÑA (login y registro de cuenta de empresa) ────────
// Alterna el type del input entre password/text y el icono del botón
// .pw-toggle entre ojo abierto (oculta, "pulsa para ver") y ojo tachado
// (visible, "pulsa para ocultar"). btn recibe el propio <button> vía this en
// el onclick del HTML.
const ICONO_OJO_ABIERTO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICONO_OJO_CERRADO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function toggleVerPassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const vaAMostrar = input.type === 'password';
  input.type = vaAMostrar ? 'text' : 'password';
  btn.innerHTML = vaAMostrar ? ICONO_OJO_CERRADO : ICONO_OJO_ABIERTO;
  btn.title = vaAMostrar ? 'Ocultar contraseña' : 'Mostrar contraseña';
}

// Al reabrir un modal de login/registro, vuelve el campo a oculto (por si
// quedó en texto plano de una apertura anterior de la misma sesión).
function resetVerPassword(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = 'password';
  const btn = input.parentElement?.querySelector('.pw-toggle');
  if (btn) { btn.innerHTML = ICONO_OJO_ABIERTO; btn.title = 'Mostrar contraseña'; }
}

// ─── CUENTA DE EMPRESA (antes CREDENCIALES DE SINCRONIZACIÓN) ─────────────────
// getSyncCredsStatus() (fase 1) sigue vigente para el login (abrirCredsSync);
// refrescarEstadoCuenta() es la única fuente de verdad para pintar el estado
// conectado/desconectado en Ajustes, sobre getEstadoCuenta() (fase 2).
async function refrescarEstadoCuenta() {
  const estado = await window.api.getEstadoCuenta();
  const elConectado = document.getElementById('cuenta-empresa-conectado');
  const elDesconectado = document.getElementById('cuenta-empresa-desconectado');
  const elEstado = document.getElementById('cuenta-empresa-estado');
  if (!elEstado || !elConectado || !elDesconectado) return;
  if (estado && estado.conectado) {
    elEstado.textContent = '✓ Conectado como ' + esc(estado.email || '');
    elEstado.style.color = 'var(--success, #10b981)';
    elConectado.classList.remove('hidden');
    elDesconectado.classList.add('hidden');
    if (typeof comprobarAceptacionLegal === 'function') comprobarAceptacionLegal();
  } else {
    elEstado.textContent = '';
    elConectado.classList.add('hidden');
    elDesconectado.classList.remove('hidden');
  }
}

// ─── GATE DE CUENTA OBLIGATORIA (mostrar/ocultar #app) ─────────────────────────
// AulaMovil es SaaS puro: mientras la cuenta no está conectada, modal-bienvenida
// y sus hijos (login/registro) deben quedar delante de un dashboard totalmente
// oculto (no solo difuminado por .overlay) para no filtrar datos reales detrás
// del modal. Único punto de entrada para tocar #app.gate-hidden — no hacerlo
// en otro sitio. La única fuente de verdad de cuándo llamarlas es
// comprobarBienvenida() (renderer/arranque.js).
function ocultarAppPorGate() {
  document.getElementById('app')?.classList.add('gate-hidden');
}

function mostrarAppPorGate() {
  document.getElementById('app')?.classList.remove('gate-hidden');
}

// Punto único de salida tras un login/registro con éxito (guardarCredsSync,
// crearCuentaEmpresa, el reintento en segundo plano de iniciarReintentoLogin):
// antes de dejar pasar a la app hay que comprobar si los datos locales de
// este PC pertenecen a otra cuenta (ver getEstadoCuenta().conflictoEmpresa,
// sección VARIAS CUENTAS EN ESTE PC). Si es así, se cambian a los de esta
// cuenta (y la app se recarga). Devuelve true si no hubo cambio de cuenta
// (para que el caller decida si toca mostrar su propio toast de éxito).
async function finalizarLoginConCuenta() {
  refrescarEstadoCuenta();
  aplicarPermisosPorRol();
  const estado = await window.api.getEstadoCuenta();
  if (estado && estado.conectado && estado.conflictoEmpresa) {
    abrirConflictoEmpresa(estado.conflictoEmpresa, estado.email);
    return false;
  }
  mostrarAppPorGate();
  syncNow();
  loadDashboard();
  return true;
}

async function abrirCredsSync() {
  // Entrada "limpia" al login (desde bienvenida o Ajustes): si quedara un
  // reintento de fondo de una pantalla de registro pendiente anterior, no
  // debe seguir corriendo sobre estos campos recién reseteados.
  detenerReintentoLogin();
  const res = await window.api.getSyncCredsStatus();
  document.getElementById('sync-creds-email').value = (res && res.email) || '';
  document.getElementById('sync-creds-password').value = '';
  resetVerPassword('sync-creds-password');
  hideToast('sync-creds-alert');
  pintarCuentasGuardadas();
  openModal('modal-sync-creds');
}

// Cuentas que ya tienen datos en este PC: un clic rellena el email.
async function pintarCuentasGuardadas() {
  const cont = document.getElementById('sync-creds-cuentas');
  if (!cont) return;
  let lista = [];
  try { lista = (await window.api.getCuentasGuardadas()) || []; } catch (e) {}
  lista = lista.filter(c => c && c.email);
  cont.classList.toggle('hidden', !lista.length);
  cont.innerHTML = lista.length
    ? `<div class="cuentas-pc-tit">Cuentas con datos en este PC</div><div class="cuentas-pc">${lista.map(c =>
        `<button type="button" class="btn btn-outline btn-sm" data-email="${esc(c.email)}" onclick="elegirCuentaGuardada(this.dataset.email)">${esc(c.email)}</button>`).join('')}</div>`
    : '';
}

function elegirCuentaGuardada(email) {
  document.getElementById('sync-creds-email').value = email || '';
  document.getElementById('sync-creds-password').focus();
}

async function guardarCredsSync() {
  const email = document.getElementById('sync-creds-email').value.trim();
  const password = document.getElementById('sync-creds-password').value;
  if (!email || !password) {
    showToast('sync-creds-alert', 'Introduce email y contraseña.', 'err');
    return;
  }
  const btn = document.getElementById('sync-creds-guardar');
  btn.disabled = true;
  btn.textContent = 'Probando...';
  const res = await window.api.saveSyncCreds(email, password);
  btn.disabled = false;
  btn.textContent = 'Guardar y probar';
  if (res && res.ok) {
    detenerReintentoLogin();
    closeModal('modal-sync-creds');
    closeModal('modal-bienvenida');
    await finalizarLoginConCuenta();
  } else {
    showToast('sync-creds-alert', (res && res.msg) || 'No se pudo conectar con esas credenciales.', 'err');
  }
}

// "¿Olvidaste tu contraseña?" (dentro del modal de login, reutiliza el campo
// de email ya visible ahí). Mensaje siempre genérico tanto en éxito como en
// error real de Supabase (nunca revela si el email existe o no; ese
// comportamiento ya lo da Supabase, ver sync.solicitarResetPassword).
async function solicitarResetPasswordUI() {
  const email = document.getElementById('sync-creds-email').value.trim();
  if (!email) {
    showToast('sync-creds-alert', 'Escribe primero tu email arriba.', 'err');
    return;
  }
  const link = document.getElementById('link-reset-password');
  const textoOriginal = link.textContent;
  link.textContent = 'Enviando...';
  const res = await window.api.solicitarResetPassword(email);
  link.textContent = textoOriginal;
  if (res && res.ok) {
    showToast('sync-creds-alert', 'Si el email existe, te hemos enviado un correo para restablecer la contraseña. Sigue el enlace desde el móvil o el navegador para fijar una nueva.', 'ok');
  } else {
    showToast('sync-creds-alert', (res && res.msg) || 'No se pudo enviar el correo de recuperación.', 'err');
  }
}

function abrirCrearEmpresa() {
  document.getElementById('crear-empresa-email').value = '';
  document.getElementById('crear-empresa-password').value = '';
  document.getElementById('crear-empresa-password2').value = '';
  resetVerPassword('crear-empresa-password');
  resetVerPassword('crear-empresa-password2');
  hideToast('crear-empresa-alert');
  // Por si se reabre tras un registro anterior que se quedó en la pantalla de
  // "revisa tu correo": volver siempre al formulario.
  detenerReintentoLogin();
  document.getElementById('crear-empresa-form').classList.remove('hidden');
  document.getElementById('crear-empresa-pendiente').classList.add('hidden');
  openModal('modal-crear-empresa');
}

async function crearCuentaEmpresa() {
  const email = document.getElementById('crear-empresa-email').value.trim();
  const password = document.getElementById('crear-empresa-password').value;
  const password2 = document.getElementById('crear-empresa-password2').value;
  if (!email || !password) {
    showToast('crear-empresa-alert', 'Introduce email y contraseña.', 'err');
    return;
  }
  if (password.length < 10) {
    showToast('crear-empresa-alert', 'La contraseña debe tener al menos 10 caracteres (mejor una frase que no uses en otra web).', 'err');
    return;
  }
  if (password !== password2) {
    showToast('crear-empresa-alert', 'Las contraseñas no coinciden.', 'err');
    return;
  }
  const btn = document.getElementById('crear-empresa-btn');
  btn.disabled = true;
  btn.textContent = 'Creando...';
  const res = await window.api.registrarEmpresa(email, password);
  btn.disabled = false;
  btn.textContent = 'Crear cuenta';
  if (res && res.ok && res.estado === 'activa') {
    detenerReintentoLogin();
    closeModal('modal-crear-empresa');
    closeModal('modal-bienvenida');
    if (await finalizarLoginConCuenta()) {
      showToast('cuenta-empresa-toast', '✓ Cuenta de empresa creada y conectada.', 'ok');
    }
  } else if (res && res.ok && res.estado === 'pendiente_confirmacion') {
    // Sustituir el formulario por un mensaje de acción claro: no hay nada más
    // que rellenar aquí, solo confirmar el correo e iniciar sesión.
    document.getElementById('crear-empresa-form').classList.add('hidden');
    document.getElementById('crear-empresa-pendiente-msg').innerHTML =
      `Te hemos enviado un correo a <strong>${esc(email)}</strong> para verificar tu cuenta. Confírmalo y después inicia sesión aquí.`;
    document.getElementById('crear-empresa-pendiente').classList.remove('hidden');
    // Mientras esta pantalla siga abierta, reintentar el login solo en segundo
    // plano: en cuanto el usuario confirme el correo desde su email, la app
    // entra sola sin que tenga que volver a escribir nada.
    iniciarReintentoLogin(email, password);
  } else {
    showToast('crear-empresa-alert', (res && res.msg) || 'No se pudo crear la cuenta.', 'err');
  }
}

// ─── Reintento automático de login (tras registro pendiente de confirmar) ──
// Mientras el usuario esté en la pantalla de "revisa tu correo" (o en el
// login pre-rellenado al que lleva "Ir a iniciar sesión"), se prueba el login
// en segundo plano cada pocos segundos con el mismo IPC de guardar/probar
// credenciales. En cuanto el email quede confirmado, el intento tiene éxito,
// getEstadoCuenta().conectado pasa a true y se cierra el gate solo, sin que
// el usuario tenga que pulsar nada. Se detiene si cancela/cierra la pantalla
// (cancelarCrearEmpresa/cancelarLoginCuenta, click fuera, o si ya conectó).
let _reintentoLoginTimer = null;
const REINTENTO_LOGIN_MS = 6000;

function detenerReintentoLogin() {
  if (_reintentoLoginTimer) { clearTimeout(_reintentoLoginTimer); _reintentoLoginTimer = null; }
}

function iniciarReintentoLogin(email, password) {
  detenerReintentoLogin();
  const intentar = async () => {
    const res = await window.api.saveSyncCreds(email, password);
    if (res && res.ok) {
      detenerReintentoLogin();
      closeModal('modal-crear-empresa');
      closeModal('modal-sync-creds');
      closeModal('modal-bienvenida');
      if (await finalizarLoginConCuenta()) {
        showToast('cuenta-empresa-toast', '✓ Cuenta verificada y conectada.', 'ok');
      }
      return;
    }
    _reintentoLoginTimer = setTimeout(intentar, REINTENTO_LOGIN_MS);
  };
  _reintentoLoginTimer = setTimeout(intentar, REINTENTO_LOGIN_MS);
}

// Desde la pantalla de "revisa tu correo": lleva al login con el email (y la
// contraseña, ya que el usuario acaba de escribirla y esta es una app de
// escritorio de un único negocio, no hay problema de seguridad relevante en
// precargarla) pre-rellenados, para que solo haga falta confirmar el correo y
// pulsar "Iniciar sesión". El reintento en segundo plano sigue activo.
function irAIniciarSesionDesdeRegistro() {
  const email = document.getElementById('crear-empresa-email').value.trim();
  const password = document.getElementById('crear-empresa-password').value;
  closeModal('modal-crear-empresa');
  document.getElementById('sync-creds-email').value = email;
  document.getElementById('sync-creds-password').value = password;
  resetVerPassword('sync-creds-password');
  hideToast('sync-creds-alert');
  openModal('modal-sync-creds');
}

// Cancelar el login/registro abierto desde el gate: si la cuenta sigue sin
// conectar, `comprobarBienvenida()` (renderer/arranque.js) vuelve a abrir el
// modal de bienvenida.
function cancelarLoginCuenta() {
  detenerReintentoLogin();
  closeModal('modal-sync-creds');
  comprobarBienvenida();
}

function cancelarCrearEmpresa() {
  detenerReintentoLogin();
  closeModal('modal-crear-empresa');
  comprobarBienvenida();
}

// Cerrar sesión (o «Cambiar de cuenta», despues = 'otra'): antes se sube a la
// nube lo pendiente. Los datos de esta cuenta se quedan en el PC y vuelven
// al entrar otra vez con ella; con otra cuenta se cambian solos.
async function cerrarOtrasSesionesUI() {
  if (!await confirmar('Se cerrará la sesión de la cuenta en TODOS los demás dispositivos: los móviles y tablets de los profesores y los otros ordenadores tendrán que volver a entrar con el email y la contraseña.\n\nEste PC sigue conectado.\n\n¿Cerrar las demás sesiones?', { titulo: 'Cerrar sesión en los demás dispositivos', textoAceptar: 'Cerrar las demás', peligro: true })) return;
  const r = await window.api.cerrarOtrasSesiones();
  const id = document.querySelector('[data-aj-seccion="seguridad"]:not([hidden])') ? 'cuenta-seguridad-toast2' : 'cuenta-seguridad-toast';
  if (r && r.ok) showToast(id, '✓ Listo: los demás dispositivos tendrán que volver a iniciar sesión. Si alguien pudo ver la contraseña, cámbiala ahora.', 'ok');
  else showToast(id, 'No se pudo: ' + ((r && r.msg) || 'sin conexión') + '.', 'err');
}

async function cerrarSesionEmpresa(despues) {
  const estado = await window.api.getEstadoCuenta();
  const email = (estado && estado.email) || 'esta cuenta';
  const pregunta = despues === 'otra'
    ? `¿Salir de ${email} para entrar con otra cuenta? Sus datos se quedan guardados en este PC y vuelven en cuanto entres otra vez con ella.`
    : `¿Cerrar la sesión de ${email}? Sus datos se quedan guardados en este PC y vuelven en cuanto entres otra vez con ella.`;
  if (!await confirmar(pregunta, { titulo: despues === 'otra' ? 'Cambiar de cuenta' : 'Cerrar sesión' })) return;
  const botones = ['btn-cerrar-sesion-empresa', 'btn-cambiar-cuenta-empresa'].map(id => document.getElementById(id)).filter(Boolean);
  botones.forEach(b => { b.disabled = true; });
  let pendientes = 0;
  try {
    showToast('cuenta-empresa-toast', 'Subiendo a la nube los últimos cambios…', 'ok');
    await window.api.syncNow();
    pendientes = await window.api.contarPendientes();
  } catch (e) {}
  botones.forEach(b => { b.disabled = false; });
  hideToast('cuenta-empresa-toast');
  if (pendientes > 0 && !await confirmar(`Hay ${pendientes} cambio(s) que no se han podido subir a la nube (¿sin conexión?). No se pierden: se quedan en este PC y se subirán cuando vuelvas a entrar con ${email}. ¿Salir igualmente?`, { titulo: 'Cambios sin subir' })) return;
  await window.api.clearSyncCreds();
  refrescarEstadoCuenta();
  aplicarPermisosPorRol();
  if (despues === 'otra') { ocultarAppPorGate(); abrirCredsSync(); } else comprobarBienvenida();
}

// ─── VARIAS CUENTAS EN ESTE PC ─────────────────────────────────────────────────
// Cada cuenta que entra en este PC tiene sus propios datos (sync.js, «DATOS
// LOCALES POR CUENTA»). Al entrar con una cuenta distinta de la dueña de los
// datos actuales, se cambian solos: los de la anterior quedan guardados y
// vuelven al entrar otra vez con ella. Antes había que «Vaciar datos locales
// y empezar limpio» y se perdía lo que no estaba en la nube (cambios sin
// subir, jornadas, vencimientos, exámenes…). Con la cuenta viajan también
// estos ajustes del PC que son de la autoescuela y viven en localStorage.
const CLAVES_LOCALES_DE_CUENTA = [
  'km_centro_datos', 'km_ficha_firmar_pie', 'km_cancel_plazo_horas', 'km_cancel_devolucion',
  'km_consumo_medio', 'km_precio_combustible', 'km_iva_porcentaje', 'km_matricula_importe', 'km_tasa_importe',
  'km_secciones_ocultas_empleado', 'kmalumnos_sucursal_actual', 'kmalumnos_rango_km', 'km_duracion_clase_min'
];
const AVISO_CAMBIO_CUENTA_KEY = 'km_aviso_cambio_cuenta';

function leerAjustesLocalesDeCuenta() {
  const r = {};
  for (const k of CLAVES_LOCALES_DE_CUENTA) {
    try { const v = localStorage.getItem(k); if (v !== null) r[k] = v; } catch (e) {}
  }
  return r;
}

// Los que tenía guardados la cuenta que entra. Si nunca había entrado en este
// PC (null) se quedan los actuales: lo normal es que la cuenta de prueba y la
// real sean de la misma autoescuela.
function aplicarAjustesLocalesDeCuenta(guardados) {
  if (!guardados || typeof guardados !== 'object') return;
  for (const k of CLAVES_LOCALES_DE_CUENTA) {
    try { if (k in guardados) localStorage.setItem(k, guardados[k]); else localStorage.removeItem(k); } catch (e) {}
  }
}

// Lo llaman finalizarLoginConCuenta() y comprobarBienvenida() (arranque.js)
// cuando getEstadoCuenta().conflictoEmpresa no es null. Modal bloqueante como
// el resto del gate mientras se cambian los datos; al terminar, la app se
// recarga ya con los de la cuenta nueva.
function abrirConflictoEmpresa(conflicto, emailActual) {
  cambiarACuenta(conflicto, emailActual);
}

async function cambiarACuenta(conflicto, emailActual) {
  ocultarAppPorGate();
  const titulo = document.getElementById('conflicto-empresa-titulo');
  const msgEl = document.getElementById('conflicto-empresa-msg');
  const error = document.getElementById('conflicto-empresa-toast');
  const botones = document.getElementById('conflicto-empresa-botones');
  if (titulo) titulo.textContent = 'Cambiando de cuenta…';
  if (msgEl) msgEl.textContent = `Se guardan en este PC los datos de ${(conflicto && conflicto.emailAnterior) || 'la cuenta anterior'} (vuelven al entrar con ella) y se preparan los de ${emailActual || 'esta cuenta'}. La primera vez se descargan de la nube y puede tardar un poco.`;
  if (error) error.classList.add('hidden');
  if (botones) botones.classList.add('hidden');
  openModal('modal-conflicto-empresa');
  let res = null;
  try { res = await window.api.cambiarDatosDeCuenta(leerAjustesLocalesDeCuenta()); } catch (e) { res = { ok: false, reason: e.message }; }
  if (!res || !res.ok) {
    if (titulo) titulo.textContent = 'No se pudo cambiar de cuenta';
    if (error) { error.className = 'alert alert-err'; error.textContent = (res && res.reason) || 'Error inesperado.'; }
    if (botones) botones.classList.remove('hidden');
    return;
  }
  aplicarAjustesLocalesDeCuenta(res.ajustesLocales);
  try { sessionStorage.setItem(AVISO_CAMBIO_CUENTA_KEY, JSON.stringify({ email: res.email, anterior: res.emailAnterior, nueva: res.nueva, sync: res.sync })); } catch (e) {}
  location.reload();
}

async function reintentarCambioCuenta() {
  const estado = await window.api.getEstadoCuenta();
  if (estado && estado.conectado && estado.conflictoEmpresa) cambiarACuenta(estado.conflictoEmpresa, estado.email);
  else { closeModal('modal-conflicto-empresa'); comprobarBienvenida(); }
}

// Tras recargar: qué ha pasado con cada cuenta.
function avisoCambioCuenta() {
  let a = null;
  try { a = JSON.parse(sessionStorage.getItem(AVISO_CAMBIO_CUENTA_KEY) || 'null'); sessionStorage.removeItem(AVISO_CAMBIO_CUENTA_KEY); } catch (e) {}
  if (!a) return;
  const partes = [`Ahora trabajas con ${a.email || 'la nueva cuenta'}.`];
  if (a.anterior) partes.push(`Los datos de ${a.anterior} siguen guardados en este PC y vuelven en cuanto entres otra vez con esa cuenta.`);
  if (a.sync && !a.sync.ok) partes.push(`${a.nueva ? 'Sus datos de la nube aún no se han podido descargar' : 'La sincronización no ha terminado'} (${a.sync.reason || 'sin conexión'}): se reintentará sola.`);
  avisar(partes.join(' '), { titulo: 'Cuenta cambiada' });
}

// «Volver a la otra cuenta»: cierra esta sesión (igual que
// cerrarSesionEmpresa(), sin preguntar — el usuario ya está decidiendo esto
// de forma explícita en este modal) y vuelve al gate de login/registro para
// poder entrar con la cuenta correcta.
async function cancelarConflictoEmpresa() {
  await window.api.clearSyncCreds();
  closeModal('modal-conflicto-empresa');
  refrescarEstadoCuenta();
  aplicarPermisosPorRol();
  comprobarBienvenida();
}

refrescarEstadoCuenta();

