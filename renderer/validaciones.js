// ─── VALIDACIÓN DE CAMPOS (DNI, CP, teléfono, email, matrícula) ──────────────
// Comprobaciones puras (también las usan los tests con require) + un enganche
// automático en la interfaz: cualquier campo cuyo id (o data-campo) acabe en
// dni / nif / cp / codigo_postal / telefono / email / matricula se revisa al
// escribir y al salir, sin tocar cada formulario. Se fuerza con data-valida.
//   · DNI/NIE/NIF: letra de control (y propone la buena); CIF: dígito de control.
//   · Código postal: provincia por los dos primeros dígitos y poblaciones de la
//     lista de GeoNames (IPC buscar-codigo-postal); rellena provincia, municipio
//     y población cuando no hay duda y ofrece las posibles cuando hay varias.
//   · Teléfono, email (con «¿quisiste decir gmail.com?») y matrícula.
// Nunca bloquea: marca el campo y explica qué falla; al guardar, las pantallas
// preguntan si el documento está mal (documentoDudoso).

const VAL_LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
const VAL_PROVINCIAS = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz',
  '07': 'Illes Balears', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón',
  '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca', '17': 'Girona', '18': 'Granada',
  '19': 'Guadalajara', '20': 'Gipuzkoa', '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
  '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
  '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia', '41': 'Sevilla',
  '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid',
  '48': 'Bizkaia', '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla'
};

function valLimpiarDocumento(s) {
  return String(s || '').toUpperCase().replace(/[\s.\-_/]/g, '');
}

// → { tipo: 'vacio'|'dni'|'nie'|'nif'|'cif'|'otro', valido, normalizado, mensaje, sugerido }
function validarDocumento(texto) {
  const d = valLimpiarDocumento(texto);
  if (!d) return { tipo: 'vacio', valido: true, normalizado: '', mensaje: '' };
  let r = d.match(/^(\d{1,8})([A-Z])$/);
  if (r) {
    const num = r[1].padStart(8, '0');
    const letra = VAL_LETRAS_DNI[parseInt(num, 10) % 23];
    const normalizado = num + r[2];
    if (letra === r[2]) return { tipo: 'dni', valido: true, normalizado, mensaje: 'DNI correcto' };
    return { tipo: 'dni', valido: false, normalizado, sugerido: num + letra, mensaje: `La letra no corresponde: con ese número sería ${num}${letra}` };
  }
  r = d.match(/^(\d{8})$/);
  if (r) {
    const letra = VAL_LETRAS_DNI[parseInt(r[1], 10) % 23];
    return { tipo: 'dni', valido: false, normalizado: d, sugerido: r[1] + letra, mensaje: `Falta la letra: sería ${r[1]}${letra}` };
  }
  r = d.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (r) {
    const letra = VAL_LETRAS_DNI[parseInt('XYZ'.indexOf(r[1]) + r[2], 10) % 23];
    if (letra === r[3]) return { tipo: 'nie', valido: true, normalizado: d, mensaje: 'NIE correcto' };
    return { tipo: 'nie', valido: false, normalizado: d, sugerido: r[1] + r[2] + letra, mensaje: `La letra no corresponde: sería ${r[1]}${r[2]}${letra}` };
  }
  r = d.match(/^([KLM])(\d{7})([A-Z])$/); // NIF de menores sin DNI, extranjeros sin NIE…
  if (r) {
    const letra = VAL_LETRAS_DNI[parseInt(r[2], 10) % 23];
    if (letra === r[3]) return { tipo: 'nif', valido: true, normalizado: d, mensaje: 'NIF correcto' };
    return { tipo: 'nif', valido: false, normalizado: d, sugerido: r[1] + r[2] + letra, mensaje: `La letra no corresponde: sería ${r[1]}${r[2]}${letra}` };
  }
  r = d.match(/^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/);
  if (r) {
    const cifras = r[2].split('').map(Number);
    let suma = 0;
    cifras.forEach((c, i) => {
      if (i % 2 === 0) { const x = c * 2; suma += Math.floor(x / 10) + (x % 10); } else suma += c;
    });
    const control = (10 - (suma % 10)) % 10;
    const letraCtl = 'JABCDEFGHI'[control];
    const soloLetra = 'KPQRSNW'.includes(r[1]);
    const soloNum = 'ABEH'.includes(r[1]);
    const ok = soloLetra ? r[3] === letraCtl : soloNum ? r[3] === String(control) : (r[3] === String(control) || r[3] === letraCtl);
    if (ok) return { tipo: 'cif', valido: true, normalizado: d, mensaje: 'CIF correcto' };
    return { tipo: 'cif', valido: false, normalizado: d, sugerido: r[1] + r[2] + (soloLetra ? letraCtl : String(control)), mensaje: 'El dígito de control del CIF no cuadra' };
  }
  if (/^[A-Z0-9]{5,15}$/.test(d)) return { tipo: 'otro', valido: true, normalizado: d, mensaje: 'No es un DNI/NIE español (¿pasaporte?)', neutro: true };
  return { tipo: 'otro', valido: false, normalizado: d, mensaje: 'Revisa el documento: ni DNI, ni NIE, ni pasaporte' };
}

// Texto del aviso al guardar (null si el documento está bien o vacío)
function documentoDudoso(texto) {
  const v = validarDocumento(texto);
  if (v.valido || v.tipo === 'vacio') return null;
  return `«${String(texto).trim()}»: ${v.mensaje}.`;
}

function provinciaDeCP(cp) {
  const c = String(cp || '').trim();
  return /^\d{5}$/.test(c) ? (VAL_PROVINCIAS[c.slice(0, 2)] || null) : null;
}

// → { valido, normalizado, provincia, mensaje }
function validarCodigoPostal(texto) {
  let c = String(texto || '').replace(/\s/g, '');
  if (!c) return { valido: true, normalizado: '', mensaje: '' };
  if (/^\d{4}$/.test(c)) c = '0' + c; // Excel se come el 0 de delante (08001 → 8001)
  if (!/^\d{5}$/.test(c)) return { valido: false, normalizado: c, mensaje: 'El código postal tiene 5 números' };
  const provincia = provinciaDeCP(c);
  if (!provincia) return { valido: false, normalizado: c, mensaje: 'No existe ese código postal en España (empieza por 01–52)' };
  return { valido: true, normalizado: c, provincia, mensaje: provincia };
}

// → { valido, normalizado, mensaje }
function validarTelefono(texto) {
  const t = String(texto || '').trim();
  if (!t) return { valido: true, normalizado: '', mensaje: '' };
  let n = t.replace(/[\s.\-()]/g, '');
  if (!/^\+?\d+$/.test(n)) return { valido: false, normalizado: t, mensaje: 'Solo números (y + para el prefijo)' };
  if (n.startsWith('0034')) n = '+34' + n.slice(4);
  if (n.startsWith('+') && !n.startsWith('+34')) {
    return n.length >= 8 && n.length <= 16 ? { valido: true, normalizado: n, mensaje: 'Teléfono extranjero' } : { valido: false, normalizado: n, mensaje: 'Número extranjero incompleto' };
  }
  const nac = n.replace(/^\+34/, '');
  if (!/^\d{9}$/.test(nac)) return { valido: false, normalizado: t, mensaje: `Un teléfono español tiene 9 cifras (hay ${nac.length})` };
  if (!/^[6789]/.test(nac)) return { valido: false, normalizado: t, mensaje: 'Un teléfono español empieza por 6, 7, 8 o 9' };
  const bonito = /^[67]/.test(nac) ? `${nac.slice(0, 3)} ${nac.slice(3, 6)} ${nac.slice(6)}` : `${nac.slice(0, 3)} ${nac.slice(3, 5)} ${nac.slice(5, 7)} ${nac.slice(7)}`;
  return { valido: true, normalizado: n.startsWith('+34') ? '+34 ' + bonito : bonito, mensaje: /^[67]/.test(nac) ? 'Móvil' : 'Fijo' };
}

const VAL_DOMINIOS_TIPICOS = {
  'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.es': 'gmail.com', 'gmail.cm': 'gmail.com',
  'hotmail.con': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'outlook.con': 'outlook.com', 'outlok.com': 'outlook.com', 'yahoo.con': 'yahoo.com', 'yaho.es': 'yahoo.es', 'icloud.con': 'icloud.com', 'telefonica.ne': 'telefonica.net'
};
// → { valido, normalizado, mensaje, sugerido }
function validarEmail(texto) {
  const e = String(texto || '').trim().toLowerCase();
  if (!e) return { valido: true, normalizado: '', mensaje: '' };
  if (/\s/.test(e)) return { valido: false, normalizado: e, mensaje: 'Un email no lleva espacios' };
  const r = e.match(/^[^@]+@([^@]+\.[a-z]{2,})$/);
  if (!r) return { valido: false, normalizado: e, mensaje: 'Formato: nombre@dominio.com' };
  const buena = VAL_DOMINIOS_TIPICOS[r[1]];
  if (buena) return { valido: false, normalizado: e, sugerido: e.replace(/@.+$/, '@' + buena), mensaje: `¿Quisiste decir ${e.replace(/@.+$/, '@' + buena)}?` };
  return { valido: true, normalizado: e, mensaje: '' };
}

// → { valido, normalizado, mensaje }
function validarMatricula(texto) {
  const m = String(texto || '').toUpperCase().replace(/[\s\-]/g, '');
  if (!m) return { valido: true, normalizado: '', mensaje: '' };
  let r = m.match(/^(\d{4})([BCDFGHJKLMNPRSTVWXYZ]{3})$/);
  if (r) return { valido: true, normalizado: `${r[1]} ${r[2]}`, mensaje: '' };
  r = m.match(/^([A-Z]{1,2})(\d{4})([A-Z]{1,2})$/); // provincial antigua (OR-1234-AB)
  if (r) return { valido: true, normalizado: `${r[1]}-${r[2]}-${r[3]}`, mensaje: 'Matrícula provincial antigua' };
  r = m.match(/^([ER])(\d{4})([BCDFGHJKLMNPRSTVWXYZ]{3})$/); // especial / remolque
  if (r) return { valido: true, normalizado: `${r[1]} ${r[2]} ${r[3]}`, mensaje: r[1] === 'R' ? 'Remolque' : 'Vehículo especial' };
  r = m.match(/^C(\d{4})([BCDFGHJKLMNPRSTVWXYZ]{3})$/); // ciclomotor
  if (r) return { valido: true, normalizado: `C ${r[1]} ${r[2]}`, mensaje: 'Ciclomotor' };
  if (/^\d{4}[A-Z]{3}$/.test(m)) return { valido: false, normalizado: m, mensaje: 'Las matrículas no llevan vocales, Ñ ni Q' };
  return { valido: false, normalizado: m, mensaje: 'Formato habitual: 1234 BCD' };
}

// Edad con una fecha de nacimiento ISO (null si no es fecha)
function edadDe(iso, hoy) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  const h = hoy || new Date().toISOString().slice(0, 10);
  let e = +h.slice(0, 4) - +iso.slice(0, 4);
  if (h.slice(5) < iso.slice(5)) e--;
  return e;
}

// Lista de avisos de unos datos antes de guardar: [[etiqueta, valor, tipo]]
// tipo = documento | telefono | cp | matricula | email | nacimiento
function avisosDatosDudosos(lista, hoy) {
  const avisos = [];
  for (const [etiqueta, valor, tipo] of lista) {
    if (valor == null || String(valor).trim() === '') continue;
    if (tipo === 'nacimiento') {
      const e = edadDe(valor, hoy);
      if (e == null) continue;
      if (e < 0) avisos.push(`${etiqueta}: es una fecha futura`);
      else if (e < 14) avisos.push(`${etiqueta}: tendría ${e} años`);
      else if (e > 100) avisos.push(`${etiqueta}: tendría ${e} años`);
      continue;
    }
    const v = tipo === 'documento' ? validarDocumento(valor) : tipo === 'telefono' ? validarTelefono(valor)
      : tipo === 'cp' ? validarCodigoPostal(valor) : tipo === 'matricula' ? validarMatricula(valor) : tipo === 'email' ? validarEmail(valor) : null;
    if (v && !v.valido) avisos.push(`${etiqueta} «${String(valor).trim()}»: ${v.mensaje}`);
  }
  return avisos;
}

// Al guardar: si algo parece mal escrito, se pregunta (true = guardar)
async function confirmarDatosDudosos(lista) {
  const avisos = avisosDatosDudosos(lista);
  if (!avisos.length) return true;
  return confirmar('Hay datos que parecen mal escritos:\n\n• ' + avisos.join('\n• ') + '\n\n¿Guardar igualmente?',
    { titulo: 'Revisa los datos', textoAceptar: 'Guardar igualmente', textoCancelar: 'Corregir' });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validarDocumento, documentoDudoso, validarCodigoPostal, provinciaDeCP, validarTelefono, validarEmail, validarMatricula, edadDe, avisosDatosDudosos, VAL_PROVINCIAS };
}

// ── Enganche en la interfaz ───────────────────────────────────────────────────
if (typeof document !== 'undefined') {
  const TIPOS = [
    ['documento', /(^|[-_])(dni|nif|nie)$/i],
    ['cp', /(^|[-_])(cp|codigo_postal|codigo-postal)$/i],
    ['telefono', /(^|[-_])(telefono2?|tel|movil)$/i],
    ['email', /(^|[-_])email$/i],
    ['matricula', /(^|[-_])matricula$/i]
  ];
  const valTipo = el => {
    if (!el || el.tagName !== 'INPUT' || el.type === 'hidden' || el.type === 'password') return null;
    if (el.dataset.valida) return el.dataset.valida === 'no' ? null : el.dataset.valida;
    const clave = el.dataset.campo || el.dataset.c || el.id || el.name || '';
    for (const [t, re] of TIPOS) if (re.test(clave)) return t;
    return null;
  };

  // Mensaje bajo el campo: dentro de .form-group en línea; en tablas, flotante
  function valMensaje(el, estado, html) {
    el.classList.remove('val-ok', 'val-aviso', 'val-mal');
    if (estado) el.classList.add('val-' + estado);
    let m = el._valMsg;
    if (!html) { if (m) { m.remove(); el._valMsg = null; } return; }
    const enLinea = !!el.closest('.form-group, .fd-form, label');
    if (!m) {
      m = document.createElement('div');
      m.className = 'val-msg' + (enLinea ? '' : ' val-msg-flota');
      m.setAttribute('role', 'status');
      m.addEventListener('mousedown', e => e.preventDefault()); // los botones del mensaje no quitan el foco
      if (enLinea) el.insertAdjacentElement('afterend', m); else document.body.appendChild(m);
      el._valMsg = m;
    }
    m.dataset.estado = estado || '';
    m.innerHTML = html;
    if (!enLinea) {
      const r = el.getBoundingClientRect();
      m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 300)) + 'px';
      m.style.top = (r.bottom + 4) + 'px';
    }
  }
  const valEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Campo «hermano» (población, provincia…) en el mismo formulario, ficha o fila
  function valHermano(el, nombres) {
    const re = new RegExp(`(^|[-_])(${nombres.join('|')})$`, 'i');
    let cont = el.parentElement;
    for (let i = 0; cont && i < 6; i++, cont = cont.parentElement) {
      const c = [...cont.querySelectorAll('input:not([type=hidden]), select')].find(x => x !== el && re.test(x.dataset.campo || x.dataset.c || x.id || x.name || ''));
      if (c) return c;
      if (cont.matches('form, .modal, fieldset, tr, .card, .fd-grupos')) break;
    }
    return null;
  }
  function valPoner(campo, valor, siVacio) {
    if (!campo || (siVacio && campo.value.trim())) return false;
    if (campo.value === valor) return false;
    campo.value = valor;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  const cacheCP = new Map();
  async function valBuscarCP(cp) {
    if (cacheCP.has(cp)) return cacheCP.get(cp);
    let r = null;
    try { r = window.api && window.api.buscarCodigoPostal ? await window.api.buscarCodigoPostal(cp) : null; } catch (e) { r = null; }
    cacheCP.set(cp, r);
    return r;
  }

  async function valRevisarCP(el, alSalir) {
    const v = validarCodigoPostal(el.value);
    if (!el.value.trim()) return valMensaje(el, '', '');
    if (!v.valido) return valMensaje(el, alSalir ? 'mal' : '', alSalir ? valEsc(v.mensaje) : '');
    if (alSalir && v.normalizado !== el.value) el.value = v.normalizado;
    const info = await valBuscarCP(v.normalizado);
    if (validarCodigoPostal(el.value).normalizado !== v.normalizado) return; // ya escribieron otra cosa
    const provincia = valHermano(el, ['provincia']);
    const municipio = valHermano(el, ['municipio']);
    const poblacion = valHermano(el, ['poblacion', 'localidad']);
    valPoner(provincia, v.provincia, true);
    const munis = info ? info.municipios : [];
    const lugares = info ? [...munis, ...info.lugares] : [];
    if (munis.length === 1) valPoner(municipio, munis[0], true);
    // Datalist con las poblaciones de ese código en el campo población
    if (poblacion && lugares.length) {
      let dl = poblacion._valLista;
      if (!dl) { dl = document.createElement('datalist'); dl.id = 'val-dl-' + Math.random().toString(36).slice(2, 8); document.body.appendChild(dl); poblacion.setAttribute('list', dl.id); poblacion._valLista = dl; }
      dl.innerHTML = lugares.map(l => `<option value="${valEsc(l)}">`).join('');
    }
    if (poblacion && lugares.length === 1) valPoner(poblacion, lugares[0], true);
    if (!info) return valMensaje(el, 'aviso', `${valEsc(v.provincia)} · <span class="val-tenue">ese código no está en la lista de poblaciones</span>`);
    const elegir = poblacion && lugares.length > 1;
    const chips = elegir
      ? lugares.slice(0, 8).map(l => `<button type="button" class="val-chip" data-poblacion="${valEsc(l)}">${valEsc(l)}</button>`).join('') + (lugares.length > 8 ? `<span class="val-tenue">y ${lugares.length - 8} más al escribir la población</span>` : '')
      : '';
    valMensaje(el, 'ok', `${valEsc(munis.join(' / ') || lugares[0])} · ${valEsc(v.provincia)}${chips ? `<div class="val-chips">${chips}</div>` : ''}`);
    if (elegir && el._valMsg) {
      el._valMsg.querySelectorAll('[data-poblacion]').forEach(b => b.addEventListener('click', () => {
        valPoner(poblacion, b.dataset.poblacion, false);
        if (municipio && munis.length > 1 && munis.includes(b.dataset.poblacion)) valPoner(municipio, b.dataset.poblacion, false);
        valMensaje(el, 'ok', `${valEsc(b.dataset.poblacion)} · ${valEsc(v.provincia)}`);
      }));
    }
  }

  function valRevisar(el, alSalir) {
    const tipo = valTipo(el);
    if (!tipo) return;
    const texto = el.value;
    if (tipo === 'cp') return valRevisarCP(el, alSalir);
    let v;
    if (tipo === 'documento') v = validarDocumento(texto);
    else if (tipo === 'telefono') v = validarTelefono(texto);
    else if (tipo === 'email') v = validarEmail(texto);
    else if (tipo === 'matricula') v = validarMatricula(texto);
    else return;
    if (!String(texto).trim()) return valMensaje(el, '', '');
    // Mientras se escribe, solo se avisa cuando ya hay bastante para opinar
    const corto = tipo === 'documento' ? valLimpiarDocumento(texto).length < 8 : tipo === 'telefono' ? texto.replace(/\D/g, '').length < 9 : tipo === 'email' ? !texto.includes('.') : texto.length < 7;
    if (!alSalir && corto) return valMensaje(el, '', '');
    if (alSalir && v.normalizado && v.valido && v.normalizado !== texto && tipo !== 'email') { el.value = v.normalizado; el.dispatchEvent(new Event('change', { bubbles: true })); }
    if (alSalir && tipo === 'email' && v.normalizado !== texto.trim() && v.valido) el.value = v.normalizado;
    if (v.valido) {
      const msg = v.neutro ? v.mensaje : (tipo === 'documento' ? v.mensaje : '');
      return valMensaje(el, v.neutro ? 'aviso' : 'ok', msg ? valEsc(msg) : '');
    }
    const arreglo = v.sugerido ? ` <button type="button" class="val-chip" data-sugerido="${valEsc(v.sugerido)}">Poner ${valEsc(v.sugerido)}</button>` : '';
    valMensaje(el, alSalir ? 'mal' : 'aviso', valEsc(v.mensaje) + arreglo);
    const b = el._valMsg && el._valMsg.querySelector('[data-sugerido]');
    if (b) b.addEventListener('click', () => {
      el.value = b.dataset.sugerido;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      valRevisar(el, true);
    });
  }

  document.addEventListener('input', e => { if (valTipo(e.target)) valRevisar(e.target, false); }, true);

  // Campos de texto con fecha (data-mascara="fecha") u hora ("hora"): las
  // barras y los dos puntos se ponen solos (14042026 → 14/04/2026, 1630 → 16:30)
  function mascaraHora(raw) {
    const t = String(raw || '');
    if (/^\d{1}[:.h]/.test(t)) return '0' + t.replace(/[.h]/, ':').replace(/[^\d:]/g, '').slice(0, 4);
    const d = t.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2) : d;
  }
  document.addEventListener('input', e => {
    const el = e.target;
    const tipo = el && el.dataset && el.dataset.mascara;
    if (!tipo || (e.inputType || '').startsWith('delete')) return;
    const raw = el.value;
    if (raw.includes('?')) return; // «12/03/2026?» = fecha por revisar (Puesta en marcha)
    const nuevo = tipo === 'fecha' && typeof dpMascara === 'function' ? dpMascara(raw) : tipo === 'hora' ? mascaraHora(raw) : raw;
    if (nuevo === raw) return;
    const fin = (el.selectionStart ?? raw.length) >= raw.length;
    el.value = nuevo;
    if (fin) el.setSelectionRange(nuevo.length, nuevo.length);
  }, true);
  document.addEventListener('focusout', e => {
    const el = e.target;
    if (!valTipo(el)) return;
    valRevisar(el, true);
    // Los avisos flotantes (tablas) solo se ven mientras se edita ese campo
    setTimeout(() => { if (el._valMsg && el._valMsg.classList.contains('val-msg-flota') && !el.classList.contains('val-mal')) valMensaje(el, el.classList.contains('val-ok') ? 'ok' : '', ''); }, 4000);
  }, true);
  // Un campo que se vacía o se rellena desde el código (abrir otro alumno) pierde el aviso viejo
  document.addEventListener('focusin', e => { const el = e.target; if (valTipo(el) && el._valMsg && !el.value.trim()) valMensaje(el, '', ''); }, true);
  window.addEventListener('scroll', () => document.querySelectorAll('.val-msg-flota').forEach(m => m.remove()), true);

  // La rueda del ratón no debe cambiar el número de un campo al desplazar la página
  document.addEventListener('wheel', e => {
    const el = document.activeElement;
    if (el && el.type === 'number' && e.target === el) el.blur();
  }, { passive: true });
}
