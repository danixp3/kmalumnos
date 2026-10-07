// ─── BLOQUEO DE LA APP CON PIN ───────────────────────────────────────────────
// Opcional (Ajustes → Seguridad de este PC). Con PIN puesto, la app se abre
// bloqueada y se vuelve a bloquear tras X minutos sin tocarla, para que nadie
// vea los datos de los alumnos en un PC de la oficina que se queda encendido.
// El PIN se comprueba en main.js (solo se guarda su huella; tras 5 fallos hay
// que esperar). «¿Has olvidado el PIN?» lo quita con la contraseña de la cuenta.

const bloqueo = { activo: false, minutos: 15, bloqueada: false, ultimo: Date.now() };

async function iniciarBloqueo() {
  try { Object.assign(bloqueo, await window.api.bloqueoEstado()); } catch (e) { return; }
  if (bloqueo.activo) mostrarBloqueo();
  ['pointerdown', 'keydown', 'wheel', 'mousemove'].forEach(ev => document.addEventListener(ev, () => { if (!bloqueo.bloqueada) bloqueo.ultimo = Date.now(); }, { passive: true, capture: true }));
  setInterval(() => {
    if (bloqueo.activo && !bloqueo.bloqueada && bloqueo.minutos > 0 && Date.now() - bloqueo.ultimo > bloqueo.minutos * 60000) mostrarBloqueo();
  }, 20000);
}

// Mientras está bloqueada, ninguna tecla llega a la app (atajos, buscador…)
function _bloqueoTeclas(e) {
  if (!bloqueo.bloqueada) return;
  if (e.target && e.target.closest && e.target.closest('#bloqueo, #modal-dialogo')) return;
  e.stopPropagation(); e.preventDefault();
}

function mostrarBloqueo() {
  if (bloqueo.bloqueada) return;
  bloqueo.bloqueada = true;
  if (typeof cerrarDatepicker === 'function') cerrarDatepicker();
  let el = document.getElementById('bloqueo');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bloqueo';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'bloqueo-tit');
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="bloqueo-barra"><span>AulaMovil</span>
      <span class="bloqueo-ventana"><button type="button" onclick="window.api.minimizarVentana()" aria-label="Minimizar">—</button><button type="button" onclick="window.api.cerrarVentana()" aria-label="Cerrar">×</button></span></div>
    <form class="bloqueo-caja" onsubmit="event.preventDefault(); desbloquearUI()">
      <img src="icon.png" alt="" width="56" height="56">
      <h2 id="bloqueo-tit">AulaMovil está bloqueada</h2>
      <p>Escribe el PIN de este PC para seguir.</p>
      <input type="password" id="bloqueo-pin" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="PIN" placeholder="PIN">
      <div id="bloqueo-msg" class="bloqueo-msg" role="alert"></div>
      <button type="submit" class="btn btn-primary" style="width:100%">Desbloquear</button>
      <button type="button" class="lnk bloqueo-olvido" onclick="bloqueoOlvidadoUI()">¿Has olvidado el PIN?</button>
    </form>`;
  el.classList.add('abierto');
  document.body.classList.add('app-bloqueada');
  document.addEventListener('keydown', _bloqueoTeclas, true);
  setTimeout(() => document.getElementById('bloqueo-pin')?.focus(), 50);
}

function ocultarBloqueo() {
  bloqueo.bloqueada = false;
  bloqueo.ultimo = Date.now();
  document.removeEventListener('keydown', _bloqueoTeclas, true);
  document.body.classList.remove('app-bloqueada');
  const el = document.getElementById('bloqueo');
  if (el) { el.classList.remove('abierto'); el.innerHTML = ''; }
}

async function desbloquearUI() {
  const inp = document.getElementById('bloqueo-pin');
  const msg = document.getElementById('bloqueo-msg');
  const r = await window.api.bloqueoComprobar(inp.value);
  if (r.ok) { ocultarBloqueo(); return; }
  inp.value = '';
  inp.focus();
  msg.textContent = r.espera ? `Demasiados intentos. Espera ${r.espera} s y vuelve a probar.` : `PIN incorrecto${r.quedan != null && r.quedan < 5 ? ` (quedan ${r.quedan} intentos antes de tener que esperar)` : ''}.`;
}

async function bloqueoOlvidadoUI() {
  const pw = await pedirTexto('Escribe la contraseña de la cuenta de la autoescuela (la de iniciar sesión en la app). Se quitará el PIN de este PC y podrás poner otro en Ajustes.', { titulo: 'He olvidado el PIN', textoAceptar: 'Quitar el PIN', tipoCampo: 'password' });
  if (pw == null || pw === '') return;
  const r = await window.api.bloqueoOlvidado(pw);
  const msg = document.getElementById('bloqueo-msg');
  if (r.ok) { bloqueo.activo = false; ocultarBloqueo(); showToastGlobal('PIN quitado. Puedes poner otro en Ajustes → Seguridad de este PC.'); return; }
  if (msg) msg.textContent = r.msg + (r.espera ? ` Espera ${r.espera} s.` : '');
}

function showToastGlobal(texto) {
  if (typeof avisar === 'function') avisar(texto);
}

// ── Ajustes → Seguridad de este PC ───────────────────────────────────────────
async function renderSeguridadUI() {
  const cont = document.getElementById('aj-seguridad-bloqueo');
  if (!cont) return;
  try { Object.assign(bloqueo, await window.api.bloqueoEstado()); } catch (e) { /* sigue con lo que hay */ }
  const ops = [[5, '5 minutos'], [10, '10 minutos'], [15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [0, 'Solo al abrir la app']];
  cont.innerHTML = bloqueo.activo
    ? `<p class="aj-intro"><b style="color:var(--success-fg)">✓ La app pide PIN</b> al abrirla y tras un rato sin usarla.</p>
       <div class="form-row" style="gap:12px;align-items:flex-end;flex-wrap:wrap">
         <div class="form-group"><label for="bloqueo-minutos">Bloquear tras</label>
           <select id="bloqueo-minutos" onchange="bloqueoCambiarMinutos(this.value)">${ops.map(([m, t]) => `<option value="${m}"${m === bloqueo.minutos ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
         <button type="button" class="btn btn-outline" onclick="bloqueoPonerUI(true)">Cambiar el PIN</button>
         <button type="button" class="btn btn-outline" onclick="mostrarBloqueo()">Bloquear ahora</button>
         <button type="button" class="btn btn-gray" onclick="bloqueoQuitarUI()">Quitar el PIN</button>
       </div>`
    : `<p class="aj-intro">Si en la oficina el PC se queda encendido o lo usan varias personas, pon un PIN: la app lo pedirá al abrirse y tras unos minutos sin usarla, para que nadie vea los datos de los alumnos.</p>
       <button type="button" class="btn btn-primary" onclick="bloqueoPonerUI(false)">Poner un PIN</button>`;
  cont.insertAdjacentHTML('beforeend', '<div id="bloqueo-ajustes-toast" class="hidden" style="margin-top:10px"></div>');
}

async function bloqueoPonerUI(cambiar) {
  let actual = '';
  if (cambiar) {
    actual = await pedirTexto('Escribe el PIN actual:', { titulo: 'Cambiar el PIN', tipoCampo: 'password' });
    if (actual == null) return;
  }
  const nuevo = await pedirTexto('Escribe el PIN nuevo (de 4 a 8 números). No uses tu fecha de nacimiento ni 1234.', { titulo: cambiar ? 'Cambiar el PIN' : 'Poner un PIN', tipoCampo: 'password' });
  if (nuevo == null) return;
  if (!/^\d{4,8}$/.test(nuevo)) { await avisar('El PIN tiene que tener de 4 a 8 números.'); return; }
  if (/^(\d)\1+$/.test(nuevo) || '0123456789'.includes(nuevo) || '9876543210'.includes(nuevo)) { await avisar('Ese PIN es muy fácil de adivinar. Elige otro.'); return; }
  const otra = await pedirTexto('Repite el PIN nuevo:', { titulo: cambiar ? 'Cambiar el PIN' : 'Poner un PIN', tipoCampo: 'password' });
  if (otra == null) return;
  if (otra !== nuevo) { await avisar('Los dos PIN no coinciden.'); return; }
  const r = await window.api.bloqueoPoner(actual, nuevo, bloqueo.minutos || 15);
  if (!r.ok) { await avisar(r.msg || 'No se pudo guardar el PIN.'); return; }
  await renderSeguridadUI();
  showToast('bloqueo-ajustes-toast', cambiar ? '✓ PIN cambiado.' : '✓ PIN puesto. La app lo pedirá al abrirse y tras unos minutos sin usarla.', 'ok');
}

async function bloqueoCambiarMinutos(m) {
  await window.api.bloqueoMinutos(Number(m));
  bloqueo.minutos = Number(m);
}

async function bloqueoQuitarUI() {
  const pin = await pedirTexto('Escribe el PIN para quitarlo:', { titulo: 'Quitar el PIN', tipoCampo: 'password' });
  if (pin == null) return;
  const r = await window.api.bloqueoQuitar(pin);
  if (!r.ok) { await avisar(r.msg || 'No se pudo quitar.'); return; }
  bloqueo.activo = false;
  await renderSeguridadUI();
  showToast('bloqueo-ajustes-toast', 'PIN quitado.', 'ok');
}
