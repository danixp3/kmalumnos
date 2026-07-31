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

