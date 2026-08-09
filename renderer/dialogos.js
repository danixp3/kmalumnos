// ─── DIÁLOGOS PROPIOS DE LA APP ───────────────────────────────────────────────
// Sustituyen a los diálogos NATIVOS de Windows (confirm/alert/prompt), que
// abrían una ventana del sistema fuera de la app, bloqueaban todo hasta
// cerrarla a mano y no seguían el diseño. Estos son modales propios, con el
// tema de la app, y basados en promesas:
//
//   if (await confirmar('¿Borrar esto?')) { ... }
//   await avisar('Operación completada.');
//   const nombre = await pedirTexto('Nuevo nombre:', { valor: actual });
//
// Se apoyan en las mismas clases CSS que el resto de modales (.overlay/.modal/
// .btn...). El overlay se crea una sola vez y se reutiliza.

let _dlgOverlay = null;
let _dlgResolver = null;   // resolve de la promesa en curso
let _dlgOnKey = null;      // manejador de teclado activo (para poder quitarlo)

function _dlgAsegurarDom() {
  if (_dlgOverlay) return;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = 'modal-dialogo';
  ov.innerHTML =
    '<div class="modal" style="max-width:440px" role="dialog" aria-modal="true">' +
      '<div class="modal-header">' +
        '<div class="modal-header-icon" id="dlg-icono"></div>' +
        '<h3 id="dlg-titulo"></h3>' +
      '</div>' +
      '<p id="dlg-mensaje" style="margin:6px 0 4px;line-height:1.5;white-space:pre-line"></p>' +
      '<div class="form-group" id="dlg-input-wrap" style="margin-top:12px;display:none">' +
        '<input type="text" id="dlg-input" style="width:100%">' +
      '</div>' +
      '<div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">' +
        '<button class="btn btn-gray" id="dlg-cancelar" type="button"></button>' +
        '<button class="btn btn-primary" id="dlg-aceptar" type="button"></button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  _dlgOverlay = ov;

  // Cerrar por clic en el fondo = cancelar (mismo criterio que el resto de
  // modales: solo si el clic empieza y termina en el propio overlay).
  let bajaEnFondo = false;
  ov.addEventListener('mousedown', e => { bajaEnFondo = (e.target === ov); });
  ov.addEventListener('click', e => {
    if (e.target === ov && bajaEnFondo) _dlgCerrar(false);
    bajaEnFondo = false;
  });
}

function _dlgCerrar(valor) {
  if (!_dlgOverlay) return;
  _dlgOverlay.classList.remove('open');
  if (_dlgOnKey) { document.removeEventListener('keydown', _dlgOnKey, true); _dlgOnKey = null; }
  const r = _dlgResolver;
  _dlgResolver = null;
  if (r) r(valor);
}

// Núcleo compartido. tipo: 'confirmar' | 'avisar' | 'texto'.
function _dlgAbrir(tipo, mensaje, opts = {}) {
  _dlgAsegurarDom();
  // Si ya había un diálogo abierto, se cancela antes de abrir el nuevo.
  if (_dlgResolver) _dlgCerrar(tipo === 'texto' ? null : false);

  const esConfirm = tipo === 'confirmar';
  const esTexto = tipo === 'texto';
  const peligro = !!opts.peligro;

  const titulo = opts.titulo || (esConfirm ? 'Confirmar' : esTexto ? 'Introduce un valor' : 'Aviso');
  _dlgOverlay.querySelector('#dlg-titulo').textContent = titulo;
  _dlgOverlay.querySelector('#dlg-mensaje').textContent = mensaje || '';

  // Icono según el tono (interrogación para confirmar, aviso para el resto).
  const icono = _dlgOverlay.querySelector('#dlg-icono');
  icono.innerHTML = peligro
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  const inputWrap = _dlgOverlay.querySelector('#dlg-input-wrap');
  const input = _dlgOverlay.querySelector('#dlg-input');
  inputWrap.style.display = esTexto ? '' : 'none';
  if (esTexto) {
    input.value = opts.valor != null ? String(opts.valor) : '';
    input.placeholder = opts.placeholder || '';
  }

  const btnCancelar = _dlgOverlay.querySelector('#dlg-cancelar');
  const btnAceptar = _dlgOverlay.querySelector('#dlg-aceptar');
  // 'avisar' solo tiene un botón (Aceptar).
  btnCancelar.style.display = esConfirm || esTexto ? '' : 'none';
  btnCancelar.textContent = opts.textoCancelar || 'Cancelar';
  btnAceptar.textContent = opts.textoAceptar || (esConfirm ? 'Aceptar' : esTexto ? 'Aceptar' : 'Aceptar');
  btnAceptar.className = 'btn ' + (peligro ? 'btn-danger' : 'btn-primary');

  const aceptar = () => _dlgCerrar(esTexto ? input.value : true);
  const cancelar = () => _dlgCerrar(esTexto ? null : false);
  btnAceptar.onclick = aceptar;
  btnCancelar.onclick = cancelar;

  _dlgOnKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancelar(); }
    else if (e.key === 'Enter' && (esConfirm || esTexto || tipo === 'avisar')) { e.preventDefault(); aceptar(); }
  };
  document.addEventListener('keydown', _dlgOnKey, true);

  _dlgOverlay.classList.add('open');
  setTimeout(() => { (esTexto ? input : btnAceptar).focus(); }, 30);

  return new Promise(resolve => { _dlgResolver = resolve; });
}

// API pública (global, como el resto de helpers del renderer).
function confirmar(mensaje, opts) { return _dlgAbrir('confirmar', mensaje, opts); }
function avisar(mensaje, opts)    { return _dlgAbrir('avisar', mensaje, opts); }
function pedirTexto(mensaje, opts) { return _dlgAbrir('texto', mensaje, opts); }

// Red de seguridad para NO abrir NUNCA un diálogo nativo de Windows:
// - alert(): se redirige al aviso propio (asíncrono, sin valor de retorno → ok).
// - confirm()/prompt(): son síncronos y no se pueden convertir en asíncronos de
//   forma transparente; ya se migraron todos los usos a confirmar()/pedirTexto()
//   con await. Aquí se neutralizan por si quedara alguna llamada suelta: en vez
//   de abrir la ventana nativa (que bloquea todo Windows) devuelven el valor
//   "cancelar" y avisan por consola, sin bloquear.
try { window.alert = (m) => { avisar(m == null ? '' : String(m)); }; } catch (e) {}
try { window.confirm = (m) => { console.warn('confirm() nativo desactivado; usa confirmar(). Mensaje:', m); return false; }; } catch (e) {}
try { window.prompt = (m) => { console.warn('prompt() nativo desactivado; usa pedirTexto(). Mensaje:', m); return null; }; } catch (e) {}
