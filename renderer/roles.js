// ─── ROLES (JEFE / EMPLEADO) ────────────────────────────────────────────────
// Puerta de acceso en el renderer para el sistema de roles (fase 2 multi-
// empresa, ver sync.js). Mientras la migración de Supabase no esté aplicada,
// window.api.getPerfilActual() siempre devuelve { disponible:false, rol:'jefe' }
// y aplicarPermisosPorRol() no oculta ni muestra nada nuevo: la app se
// comporta exactamente igual que antes de esta funcionalidad (modo clásico).

let perfilActual = { disponible: false, rol: 'jefe' };
let empleadosCache = [];

// Se llama al arrancar la app y tras cualquier cambio de sesión (login,
// registro, logout) — mismos puntos donde ya se llama a refrescarEstadoCuenta().
async function aplicarPermisosPorRol() {
  perfilActual = await window.api.getPerfilActual();
  const esEmpleado = perfilActual.disponible && perfilActual.rol === 'empleado';

  // Pagos: esto es solo comodidad de interfaz (ocultar el enlace). La barrera
  // REAL es el RLS del servidor (la migración restringe la tabla `pagos` a
  // rol jefe): aunque alguien manipulara el renderer para volver a mostrar el
  // enlace, Supabase le seguiría negando los datos.
  document.querySelectorAll('#sidebar a[data-page="pagos"]').forEach(a => a.classList.toggle('hidden', esEmpleado));
  if (esEmpleado && document.getElementById('page-pagos')?.classList.contains('active')) {
    navegarA('dashboard');
  }

  // Estadísticas de profesores: AL CONTRARIO que Pagos, esto es una barrera
  // BLANDA, no seguridad real. Un empleado sigue recibiendo por sync las
  // mismas prácticas que ve el jefe (practicas/alumnos/vehiculos no están
  // restringidos por rol, solo por empresa), así que técnicamente podría
  // recalcular estas mismas cifras a mano con lo que ya tiene en su
  // data.json local. Ocultar la tabla solo evita que la vea ya hecha en
  // pantalla — no protege el dato como el RLS de Pagos.
  const statsCard = document.getElementById('profesores-stats-card');
  if (statsCard) statsCard.classList.toggle('hidden', esEmpleado);

  // Bloque "acceso de jefe" y gestión de empleados (Ajustes): solo tienen
  // sentido con la migración aplicada. En modo clásico se quedan con la
  // clase "hidden" que ya traen en el HTML — aquí no se tocan.
  const bloqueAcceso = document.getElementById('card-acceso-jefe');
  const bloqueEmpleados = document.getElementById('card-empleados');
  const bloqueSucursales = document.getElementById('card-sucursales');
  if (bloqueAcceso) bloqueAcceso.classList.toggle('hidden', !perfilActual.disponible);
  if (bloqueEmpleados) bloqueEmpleados.classList.toggle('hidden', !(perfilActual.disponible && perfilActual.rol === 'jefe'));
  if (bloqueSucursales) bloqueSucursales.classList.toggle('hidden', !(perfilActual.disponible && perfilActual.rol === 'jefe'));

  if (perfilActual.disponible) {
    pintarAccesoJefe();
    if (perfilActual.rol === 'jefe') {
      loadEmpleados();
      if (typeof loadSucursalesAjustes === 'function') loadSucursalesAjustes();
    }
  }

  // Selector de sucursales (renderer/sucursales.js, cargado justo después de
  // este script): depende de perfilActual, así que se refresca en el mismo
  // punto que el resto de permisos por rol (arranque, login, registro, logout).
  if (typeof aplicarSelectorSucursales === 'function') await aplicarSelectorSucursales();
}

function pintarAccesoJefe() {
  const texto = document.getElementById('acceso-jefe-texto');
  const btnCambiar = document.getElementById('btn-cambiar-a-jefe');
  if (!texto) return;
  if (perfilActual.rol === 'jefe') {
    texto.textContent = 'Tienes acceso de jefe: ves y gestionas todo, incluidos Pagos y las estadísticas de profesores.';
    texto.className = 'alert alert-ok';
    if (btnCambiar) btnCambiar.classList.add('hidden');
  } else {
    texto.textContent = 'Esta es una cuenta de empleado: no ves Pagos ni las estadísticas de profesores.';
    texto.className = 'alert alert-warn';
    if (btnCambiar) btnCambiar.classList.remove('hidden');
  }
}

// Cambiar de la sesión de empleado actual a la del jefe: cierra sesión y abre
// el modal de login habitual con otras credenciales.
async function cambiarAJefe() {
  if (!confirm('Vas a cerrar la sesión de empleado y a iniciar sesión con la cuenta de jefe (con otro email y contraseña). ¿Continuar?')) return;
  await window.api.clearSyncCreds();
  refrescarEstadoCuenta();
  abrirCredsSync();
}

// ─── EMPLEADOS (gestión, solo jefe) ─────────────────────────────────────────
async function loadEmpleados() {
  const tbody = document.querySelector('#tabla-empleados tbody');
  if (!tbody) return;
  const res = await window.api.listarEmpleados();
  if (!res || !res.ok) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">${esc((res && res.msg) || 'No se pudo cargar la lista de empleados.')}</td></tr>`;
    return;
  }
  empleadosCache = res.empleados || [];
  if (!empleadosCache.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">Todavía no hay empleados dados de alta</td></tr>';
    return;
  }
  tbody.innerHTML = empleadosCache.map(e => `<tr>
      <td>${esc(e.nombre || '— sin nombre —')}</td>
      <td>
        <select onchange="cambiarRolEmpleadoUI('${esc(e.user_id)}', this.value)">
          <option value="empleado" ${e.rol === 'empleado' ? 'selected' : ''}>Empleado</option>
          <option value="jefe" ${e.rol === 'jefe' ? 'selected' : ''}>Jefe</option>
        </select>
      </td>
      <td>${e.sucursal_id != null ? esc(String(e.sucursal_id)) : '<span style="color:var(--placeholder)">— sede principal —</span>'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="quitarEmpleadoUI('${esc(e.user_id)}')">Quitar</button></td>
    </tr>`).join('');
}

function abrirInvitarEmpleado() {
  document.getElementById('invitar-empleado-email').value = '';
  document.getElementById('invitar-empleado-rol').value = 'empleado';
  hideToast('invitar-empleado-alert');
  openModal('modal-invitar-empleado');
}

async function invitarEmpleadoUI() {
  const email = document.getElementById('invitar-empleado-email').value.trim();
  const rol = document.getElementById('invitar-empleado-rol').value;
  if (!email) { showToast('invitar-empleado-alert', 'Introduce el email del empleado.', 'err'); return; }
  const btn = document.getElementById('invitar-empleado-btn');
  btn.disabled = true;
  btn.textContent = 'Invitando...';
  const res = await window.api.invitarEmpleado(email, rol, null);
  btn.disabled = false;
  btn.textContent = 'Invitar';
  if (res && res.ok) {
    closeModal('modal-invitar-empleado');
    loadEmpleados();
  } else {
    showToast('invitar-empleado-alert', (res && res.msg) || 'No se pudo invitar al empleado.', 'err');
  }
}

async function cambiarRolEmpleadoUI(userId, rol) {
  const res = await window.api.cambiarRolEmpleado(userId, rol);
  if (!res || !res.ok) alert((res && res.msg) || 'No se pudo cambiar el rol.');
  loadEmpleados();
}

async function quitarEmpleadoUI(userId) {
  if (!confirm('¿Quitar a este empleado de la empresa? Perderá el acceso a los datos.')) return;
  const res = await window.api.quitarEmpleado(userId);
  if (!res || !res.ok) alert((res && res.msg) || 'No se pudo quitar al empleado.');
  loadEmpleados();
}
