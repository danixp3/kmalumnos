// ─── SUCURSALES (selector de sede + gestión en Ajustes) ────────────────────
// Mismo patrón exacto que renderer/roles.js (del que depende `perfilActual`,
// cargado justo antes en index.html): mientras la migración de Supabase no
// esté aplicada (perfilActual.disponible === false) o no haya ninguna
// sucursal dada de alta, el selector de la barra de título se queda oculto,
// la gestión de Ajustes también, y toda la app funciona exactamente igual
// que hoy — ver CLAUDE.md.

const SUCURSAL_ACTUAL_KEY = 'kmalumnos_sucursal_actual';
let sucursalesCache = [];

// null = "Todas las sucursales" (comportamiento de siempre, sin filtrar).
function getSucursalActual() {
  const v = localStorage.getItem(SUCURSAL_ACTUAL_KEY);
  return v ? parseInt(v) : null;
}

function guardarSucursalActual(id) {
  if (id) localStorage.setItem(SUCURSAL_ACTUAL_KEY, String(id));
  else localStorage.removeItem(SUCURSAL_ACTUAL_KEY);
}

// ─── SELECTOR DE LA BARRA DE TÍTULO ─────────────────────────────────────────
// Se llama desde aplicarPermisosPorRol() (renderer/roles.js) — arranque,
// login, registro de empresa y logout — y tras cualquier cambio en la lista
// de sucursales desde Ajustes.
async function aplicarSelectorSucursales() {
  const wrap = document.getElementById('tb-sucursal-wrap');
  const select = document.getElementById('tb-sucursal');
  if (!wrap || !select) return;

  if (!perfilActual.disponible) {
    wrap.classList.add('hidden');
    guardarSucursalActual(null);
    return;
  }

  sucursalesCache = await window.api.getSucursales(true); // solo activas
  if (!sucursalesCache.length) {
    wrap.classList.add('hidden');
    return;
  }

  let actual = getSucursalActual();
  // Si la sucursal guardada ya no existe o se desactivó, volver a "Todas".
  if (actual && !sucursalesCache.some(s => s.id === actual)) {
    actual = null;
    guardarSucursalActual(null);
  }

  select.innerHTML = '<option value="">Todas las sucursales</option>' +
    sucursalesCache.map(s => `<option value="${s.id}" ${s.id === actual ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('');
  wrap.classList.remove('hidden');
}

function cambiarSucursalActual(valor) {
  guardarSucursalActual(valor ? parseInt(valor) : null);
  recargarPorCambioDeSucursal();
}

// Refresca la pantalla activa (y el dashboard) con el nuevo filtro. Sigue el
// mismo despacho por página que la navegación del sidebar (renderer/estado.js).
function recargarPorCambioDeSucursal() {
  loadDashboard();
  const pagina = document.querySelector('#sidebar nav a.active')?.dataset.page;
  if (pagina === 'vehiculos') loadVehiculos();
  if (pagina === 'alumnos') loadAlumnos();
  if (pagina === 'profesores') { loadProfesores(); loadStatsProfesores(); }
  if (pagina === 'practicas-global') loadPracticasGlobal();
  if (pagina === 'pagos') {
    const tab = document.querySelector('#page-pagos .page-tab.active')?.dataset.tab || 'deudas';
    cambiarTabPagos(tab);
  }
}

// ─── GESTIÓN DE SUCURSALES (Ajustes, solo jefe) ─────────────────────────────
// Igual que el bloque de empleados (roles.js): la tarjeta se oculta con
// classList.toggle desde aplicarPermisosPorRol; aquí solo se pinta la tabla.
async function loadSucursalesAjustes() {
  const tbody = document.querySelector('#tabla-sucursales tbody');
  if (!tbody) return;
  sucursalesCache = await window.api.getSucursales(false); // todas, activas e inactivas
  if (!sucursalesCache.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">Todavía no hay sucursales dadas de alta</td></tr>';
    return;
  }
  tbody.innerHTML = sucursalesCache.map(s => `<tr>
      <td><strong>${esc(s.nombre)}</strong></td>
      <td>${s.activa !== false
        ? '<span class="alert alert-ok" style="display:inline-block;padding:2px 8px">Activa</span>'
        : '<span class="alert alert-warn" style="display:inline-block;padding:2px 8px">Desactivada</span>'}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="renombrarSucursalUI(${s.id},'${esc(s.nombre)}')">Renombrar</button>
        <button class="btn btn-gray btn-sm" onclick="activarSucursalUI(${s.id}, ${s.activa === false})">${s.activa === false ? 'Activar' : 'Desactivar'}</button>
      </td>
    </tr>`).join('');
}

async function addSucursalUI() {
  const input = document.getElementById('nueva-sucursal-nombre');
  const nombre = input.value.trim();
  if (!nombre) { alert('Introduce un nombre para la sucursal.'); return; }
  await window.api.addSucursal(nombre);
  input.value = '';
  await loadSucursalesAjustes();
  await aplicarSelectorSucursales();
}

async function renombrarSucursalUI(id, nombreActual) {
  const nombre = prompt('Nuevo nombre de la sucursal:', nombreActual);
  if (!nombre || !nombre.trim()) return;
  await window.api.renombrarSucursal(id, nombre.trim());
  await loadSucursalesAjustes();
  await aplicarSelectorSucursales();
}

async function activarSucursalUI(id, activar) {
  if (!activar && !confirm('¿Desactivar esta sucursal? Sus datos no se borran, solo dejará de ofrecerse en el selector.')) return;
  await window.api.activarSucursal(id, activar);
  await loadSucursalesAjustes();
  await aplicarSelectorSucursales();
}
