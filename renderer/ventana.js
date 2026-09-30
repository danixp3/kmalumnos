// ─── BARRA DE TÍTULO / CONTROLES DE VENTANA ─────────────────────────────────
// Minimizar, maximizar/restaurar y cerrar la ventana desde la barra de título
// integrada.

// ─── BARRA DE TÍTULO ────────────────────────────────────────────────────────────
const ICONO_TB_MAXIMIZAR = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="0.5" y="0.5" width="9" height="9"/></svg>';
const ICONO_TB_RESTAURAR = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2.5" y="0.5" width="7" height="7"/><rect x="0.5" y="2.5" width="7" height="7" fill="var(--sidebar-bg)"/></svg>';

function actualizarIconoMaximizar(max) {
  const btn = document.getElementById('tb-max');
  if (!btn) return;
  if (max) {
    btn.innerHTML = ICONO_TB_RESTAURAR;
    btn.title = 'Restaurar';
  } else {
    btn.innerHTML = ICONO_TB_MAXIMIZAR;
    btn.title = 'Maximizar';
  }
}

document.getElementById('tb-min')?.addEventListener('click', () => window.api.minimizarVentana());
document.getElementById('tb-max')?.addEventListener('click', () => window.api.maximizarVentana());
document.getElementById('tb-close')?.addEventListener('click', () => window.api.cerrarVentana());
window.api.onVentanaMaximizada(actualizarIconoMaximizar);


// ─── CAJÓN DE LA BARRA DE TÍTULO ─────────────────────────────────────────────
// Al dejar el ratón un momento sobre la barra de título se despliega debajo un
// cajón con la fecha, el resumen del día, el estado de la sincronización y
// accesos rápidos. Para no molestar: solo tras ~0,45 s de ratón quieto (pasar
// de largo no lo abre), nunca sobre los botones de ventana ni el buscador, ni
// con un diálogo abierto, el tutorial en marcha o mientras se arrastra la
// ventana; se cierra solo al salir de la barra y del cajón. Se puede desactivar
// en Ajustes → Menú lateral. La posición del ratón sobre la barra la vigila el
// proceso principal (main.js: iniciarSensorBarra), porque la zona de arrastre
// de la ventana no entrega eventos de ratón en Windows.
const CAJON_PREF_KEY = 'kmalumnos_cajon_barra';
function cajonActivado() { try { return localStorage.getItem(CAJON_PREF_KEY) !== 'no'; } catch (e) { return true; } }
function setCajonActivado(si) { try { localStorage.setItem(CAJON_PREF_KEY, si ? 'si' : 'no'); } catch (e) {} if (!si) cerrarCajon(); }

let cajonAbierto = false, cajonTAbrir = null, cajonTCerrar = null, cajonSobre = false, cajonEnBarra = false;
const cajonEl = document.getElementById('tb-cajon');

function zonaInteractivaBarra(x) {
  return [...document.querySelectorAll('#titlebar #tb-search-wrap, #titlebar #tb-sucursal-wrap, #titlebar .tb-btn')].some(el => {
    if (el.classList.contains('hidden')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && x >= r.left - 8 && x <= r.right + 8;
  });
}
function cajonBloqueado() {
  const resultados = document.getElementById('cir-search-results');
  const temaMenu = document.getElementById('tema-menu');
  return !cajonActivado() || !cajonEl
    || !!document.querySelector('.overlay.open')
    || document.activeElement === document.getElementById('cir-search-input')
    || (resultados && !resultados.classList.contains('hidden'))
    || (temaMenu && !temaMenu.classList.contains('hidden'))
    || (typeof tutorialEnCurso === 'function' && tutorialEnCurso());
}
function programarCierreCajon() { clearTimeout(cajonTCerrar); cajonTCerrar = setTimeout(cerrarCajon, 240); }
function cerrarCajon() {
  clearTimeout(cajonTAbrir); clearTimeout(cajonTCerrar);
  if (!cajonEl || !cajonAbierto) return;
  cajonAbierto = false;
  cajonEl.classList.remove('abierto');
  cajonEl.setAttribute('aria-hidden', 'true');
}

async function abrirCajon() {
  if (cajonBloqueado() || !cajonEnBarra) return;
  const vis = p => typeof paginaVisibleEnMenu !== 'function' || paginaVisibleEnMenu(p);
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const syncBar = document.getElementById('sync-bar');
  const ico = d => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  cajonEl.innerHTML = `
    <div class="tb-cajon-fecha">${ico('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>')}${esc(fecha.charAt(0).toUpperCase() + fecha.slice(1))}</div>
    <span class="tb-cajon-dato" id="tb-cajon-dia"></span>
    <span class="tb-cajon-sync" data-status="${esc(syncBar ? syncBar.dataset.status || '' : '')}"><i></i>${esc(document.getElementById('sync-label')?.textContent || '')}</span>
    <div class="tb-cajon-acc">
      ${vis('registro-rapido') ? `<button type="button" class="pri" data-acc="rr">${ico('<path d="M12 5v14M5 12h14"/>')}Registrar prácticas</button>` : ''}
      <button type="button" data-acc="alumno">${ico('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>')}Nuevo alumno</button>
      ${vis('reservas') ? `<button type="button" data-acc="cita">${ico('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M12 14v4M10 16h4"/>')}Nueva cita</button>` : ''}
      <button type="button" data-acc="sync">${ico('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>')}Sincronizar</button>
    </div>`;
  cajonAbierto = true;
  cajonEl.classList.add('abierto');
  cajonEl.setAttribute('aria-hidden', 'false');
  try {
    const s = await window.api.getStatsDashboard();
    const el = document.getElementById('tb-cajon-dia');
    if (el && s) el.textContent = `${s.practicasHoy} ${s.practicasHoy === 1 ? 'práctica' : 'prácticas'} hoy · ${fmtMiles(s.kmMes || 0)} km este mes`;
  } catch (e) { /* el resumen es opcional */ }
}

if (cajonEl && window.api.onBarraSensor) {
  window.api.onBarraSensor(({ dentro, x }) => {
    cajonEnBarra = dentro;
    if (dentro) {
      clearTimeout(cajonTCerrar);
      if (cajonAbierto) return;
      clearTimeout(cajonTAbrir);                 // cada movimiento reinicia la espera
      if (zonaInteractivaBarra(x) || cajonBloqueado()) return;
      cajonTAbrir = setTimeout(abrirCajon, 450);
    } else {
      clearTimeout(cajonTAbrir);
      if (cajonAbierto && !cajonSobre) programarCierreCajon();
    }
  });
  cajonEl.addEventListener('mouseenter', () => { cajonSobre = true; clearTimeout(cajonTCerrar); });
  cajonEl.addEventListener('mouseleave', () => { cajonSobre = false; if (!cajonEnBarra) programarCierreCajon(); });
  cajonEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-acc]'); if (!b) return;
    const acc = b.dataset.acc;
    cerrarCajon();
    if (acc === 'rr') navegarA('registro-rapido');
    else if (acc === 'alumno') { navegarA('alumnos'); abrirNuevoAlumno(); }
    else if (acc === 'cita') { navegarA('reservas'); abrirNuevaReserva(); }
    else if (acc === 'sync') syncNow();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarCajon(); });
  window.addEventListener('blur', cerrarCajon);
}
