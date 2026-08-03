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

const AJUSTES_SYNC_COLORS = { ok: '#10b981', syncing: '#6366f1', pending: '#f59e0b', offline: '#64748b', error: '#ef4444' };

function updateSyncBar(status, reason) {
  const bar   = document.getElementById('sync-bar');
  const label = document.getElementById('sync-label');
  if (bar && label) {
    bar.dataset.status = status;
    label.textContent  = SYNC_LABELS[status] || status;
    // Al pasar el ratón por encima se ve el motivo exacto del error
    bar.title = (status === 'error' && reason) ? 'Motivo: ' + reason : '';
  }

  // Segundo indicador, grande y legible, en Ajustes
  const ajLabel = document.getElementById('ajustes-sync-label');
  const ajDot   = document.getElementById('ajustes-sync-dot');
  if (ajLabel) ajLabel.textContent = SYNC_LABELS[status] || status;
  if (ajDot) ajDot.style.background = AJUSTES_SYNC_COLORS[status] || '#64748b';
}

async function pushAllToCloud() {
  const bar = document.getElementById('push-all-bar');
  if (!confirm('¿Subir TODOS los datos (vehículos, alumnos y prácticas) a Supabase ahora?\n\nHaz esto la primera vez para que la web del móvil tenga acceso a los datos.')) return;
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
    // Si se bajaron prácticas nuevas, recargar vista actual
    if (res.pulled > 0) {
      loadDashboard();
      if (currentAlumnoId) loadPracticas();
    }
  } else {
    updateSyncBar(res && res.reason === 'Sin conexión a internet' ? 'offline' : 'error', res?.reason);
  }
}

// Escuchar cambios de estado desde main.js
window.api.onSyncStatus((status, reason) => {
  updateSyncBar(status, reason);
  // Si llegaron datos nuevos (ok tras sync), refrescar
  if (status === 'ok') {
    loadDashboard();
    if (currentAlumnoId) loadPracticas();
  }
});

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
  } else {
    elEstado.textContent = '';
    elConectado.classList.add('hidden');
    elDesconectado.classList.remove('hidden');
  }
}

// ─── GATE DE CUENTA OBLIGATORIA (mostrar/ocultar #app) ─────────────────────────
// KM Alumnos es SaaS puro: mientras la cuenta no está conectada, modal-bienvenida
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
// sección CONFLICTO DE DATOS LOCALES). Si hay conflicto, interpone ese modal
// en vez de mostrar la app. Devuelve true si no hubo conflicto (para que el
// caller decida si toca mostrar su propio toast de éxito).
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
  openModal('modal-sync-creds');
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
  if (password.length < 8) {
    showToast('crear-empresa-alert', 'La contraseña debe tener al menos 8 caracteres.', 'err');
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

async function cerrarSesionEmpresa() {
  if (!confirm('¿Cerrar sesión de la cuenta de empresa? Necesitarás iniciar sesión o crear una cuenta para seguir usando la aplicación.')) return;
  await window.api.clearSyncCreds();
  refrescarEstadoCuenta();
  aplicarPermisosPorRol();
  comprobarBienvenida();
}

// ─── CONFLICTO DE DATOS LOCALES (otra cuenta ya usó este PC) ───────────────────
// Bug real que motivó esto: el dueño creó una cuenta de empresa de prueba en
// este PC (con alumnos/profesores de prueba) y luego, en el mismo PC, una
// segunda cuenta real — que veía los datos de prueba, porque data.json no
// está vinculado a ninguna cuenta (ver sync.js, sección "PROPIETARIO DE LOS
// DATOS LOCALES"). Este modal, bloqueante como el resto del gate (excluido
// del cierre por click-fuera, ver renderer/utils-ui.js), se interpone entre
// el login y la app cuando getEstadoCuenta().conflictoEmpresa no es null.
function abrirConflictoEmpresa(conflicto, emailActual) {
  ocultarAppPorGate();
  const msgEl = document.getElementById('conflicto-empresa-msg');
  if (msgEl) {
    msgEl.textContent = `Los datos de este ordenador pertenecen a otra cuenta (${(conflicto && conflicto.emailAnterior) || 'desconocida'}). Para usar la cuenta ${emailActual || ''} aquí, hay que empezar de cero con datos limpios.`;
  }
  hideToast('conflicto-empresa-toast');
  openModal('modal-conflicto-empresa');
}

// "Vaciar datos locales y empezar limpio": vacía data.json/pending_sync.json,
// adopta esta cuenta como dueña de los datos locales y descarga de la nube
// los datos reales de esta cuenta (sync.resolverConflictoEmpresa(), NUNCA
// pushAll — no hay que re-subir nada de la cuenta anterior). Tras esto, deja
// pasar a la app con normalidad.
async function vaciarYEmpezarLimpio() {
  const btn = document.getElementById('conflicto-empresa-vaciar-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Vaciando...'; }
  const res = await window.api.resolverConflictoEmpresa();
  if (btn) { btn.disabled = false; btn.textContent = 'Vaciar datos locales y empezar limpio'; }
  if (res && res.ok) {
    closeModal('modal-conflicto-empresa');
    mostrarAppPorGate();
    refrescarEstadoCuenta();
    aplicarPermisosPorRol();
    loadDashboard();
  } else {
    showToast('conflicto-empresa-toast', 'No se pudo limpiar y sincronizar (' + (res?.reason || 'sin conexión') + '). Inténtalo de nuevo.', 'err');
  }
}

// "Cancelar y volver a la otra cuenta": cierra esta sesión (igual que
// cerrarSesionEmpresa(), sin el confirm() adicional — el usuario ya está
// decidiendo esto de forma explícita en este modal) y vuelve al gate de
// login/registro para poder entrar con la cuenta correcta.
async function cancelarConflictoEmpresa() {
  await window.api.clearSyncCreds();
  closeModal('modal-conflicto-empresa');
  refrescarEstadoCuenta();
  aplicarPermisosPorRol();
  comprobarBienvenida();
}

refrescarEstadoCuenta();

