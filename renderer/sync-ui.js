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

async function abrirCredsSync() {
  const res = await window.api.getSyncCredsStatus();
  document.getElementById('sync-creds-email').value = (res && res.email) || '';
  document.getElementById('sync-creds-password').value = '';
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
    closeModal('modal-sync-creds');
    closeModal('modal-bienvenida');
    refrescarEstadoCuenta();
    syncNow();
    loadDashboard();
  } else {
    showToast('sync-creds-alert', (res && res.msg) || 'No se pudo conectar con esas credenciales.', 'err');
  }
}

function abrirCrearEmpresa() {
  document.getElementById('crear-empresa-email').value = '';
  document.getElementById('crear-empresa-password').value = '';
  document.getElementById('crear-empresa-password2').value = '';
  hideToast('crear-empresa-alert');
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
    closeModal('modal-crear-empresa');
    closeModal('modal-bienvenida');
    refrescarEstadoCuenta();
    syncNow();
    loadDashboard();
    showToast('cuenta-empresa-toast', '✓ Cuenta de empresa creada y conectada.', 'ok');
  } else if (res && res.ok && res.estado === 'pendiente_confirmacion') {
    const el = document.getElementById('crear-empresa-alert');
    el.className = 'alert alert-ok';
    el.textContent = (res.msg || 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.') + ' Cuando la confirmes, usa "Iniciar sesión".';
    el.classList.remove('hidden');
  } else {
    showToast('crear-empresa-alert', (res && res.msg) || 'No se pudo crear la cuenta.', 'err');
  }
}

async function cerrarSesionEmpresa() {
  if (!confirm('¿Cerrar sesión de la cuenta de empresa? La app seguirá funcionando en modo local hasta que vuelvas a iniciar sesión.')) return;
  await window.api.clearSyncCreds();
  refrescarEstadoCuenta();
}

refrescarEstadoCuenta();

