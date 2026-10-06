// ─── CUADRAR KM ──────────────────────────────────────────────────────────────
// Pestaña «Cuadrar» de Cuadrar y generar km: ordena las clases de un coche por
// fecha y hora, arregla las que tienen km imposibles, reparte los km entre las
// clases en blanco y enseña los tramos donde faltan clases. Todo se previsualiza
// y se guarda EXACTAMENTE lo mostrado (db/cuadre-km.js). El aviso de la lista de
// Prácticas (cuadreAvisoPracticas) usa el mismo motor.

let cuadrePlan = null;   // { vid, cambios } de la vista previa que se está viendo
const cuadreOpc = { rellenarAntes: false, rellenarDespues: false, cerrarHuecosPequenos: false, rellenarHuecosGrandes: false };

const CUADRE_TIPOS = {
  repartir: { txt: 'Reparte km', cls: 'pill-ok' },
  corregir: { txt: 'Corrige km', cls: 'pill-warn' },
  recorte:  { txt: 'Recorta solape', cls: 'pill-line' },
  cerrar:   { txt: 'Cierra hueco', cls: 'pill-line' },
  vaciar:   { txt: 'Deja sin km', cls: 'pill-warn' }
};

function cuadreVehiculoId() {
  return parseInt(document.getElementById('gk-vehiculo')?.value) || 0;
}

function cuadreLimpiar() {
  cuadrePlan = null;
  const el = document.getElementById('cuadre-cuerpo');
  if (el) el.innerHTML = '<div class="card"><p class="empty">Elige un vehículo…</p></div>';
}

function cuadreCambiarOpcion(clave, valor) {
  cuadreOpc[clave] = !!valor;
  cuadreCargar();
}

async function cuadreCargar(mensaje) {
  const el = document.getElementById('cuadre-cuerpo');
  if (!el) return;
  const vid = cuadreVehiculoId();
  if (!vid) { cuadreLimpiar(); return; }
  const [r, hechos] = await Promise.all([window.api.proponerCuadreKm(vid, { ...cuadreOpc }), window.api.getCuadresKm()]);
  if (cuadreVehiculoId() !== vid) return; // se cambió de coche mientras se calculaba
  if (r.errores && r.errores.length) { el.innerHTML = `<div class="alert alert-err">${esc(r.errores.join(' '))}</div>`; return; }
  cuadrePlan = { vid, cambios: r.cambios };
  const ultimo = (hechos || []).find(c => c.vehiculo_id === vid);
  const s = r.resumen;
  const nada = !r.cambios.length && !s.huecos;

  const chip = (n, txt, aviso) => `<div class="cuadre-chip${aviso && n ? ' aviso' : ''}"><b>${fmtMiles(n)}</b><span>${txt}</span></div>`;
  let html = mensaje ? `<div class="alert alert-ok" style="margin-bottom:14px">${mensaje}</div>` : '';

  html += `<div class="card">
    <div class="cuadre-chips">
      ${chip(s.clases, 'clases en total')}
      ${chip(s.sin_km, 'sin km', true)}
      ${chip(s.incoherentes, 'con km que no encajan', true)}
      ${chip(s.huecos, `hueco${s.huecos === 1 ? '' : 's'} sin explicar${s.km_en_huecos ? ' · ' + fmtMiles(s.km_en_huecos) + ' km' : ''}`, true)}
    </div>
    <p class="cuadre-estado">${nada
      ? '<b style="color:var(--success-fg)">✓ El cuentakilómetros de este coche está cuadrado.</b> Las clases con km siguen un orden coherente y no hay tramos sin explicar.'
      : `Cada clase se coloca por su <b>fecha y hora</b>; los km solo pueden subir. Una clase con ${fmtMiles(s.km_tipico_clase)} km de media es lo normal en esta autoescuela.`}</p>
  </div>`;

  html += `<div class="card">
    <div class="cuadre-opciones">
      <label><input type="checkbox" ${cuadreOpc.rellenarAntes ? 'checked' : ''} onchange="cuadreCambiarOpcion('rellenarAntes', this.checked)"><span>Rellenar también las clases sin km <b>anteriores</b> a la primera con km conocidos (hacia atrás)</span></label>
      <label><input type="checkbox" ${cuadreOpc.rellenarDespues ? 'checked' : ''} onchange="cuadreCambiarOpcion('rellenarDespues', this.checked)"><span>Rellenar también las clases sin km <b>posteriores</b> a la última con km conocidos (hacia delante)</span></label>
      <label><input type="checkbox" ${cuadreOpc.cerrarHuecosPequenos ? 'checked' : ''} onchange="cuadreCambiarOpcion('cerrarHuecosPequenos', this.checked)"><span>Cerrar los huecos pequeños (hasta ${TOLERANCIA_HUECO_UI} km) alargando la clase anterior</span></label>
      <label><input type="checkbox" ${cuadreOpc.rellenarHuecosGrandes ? 'checked' : ''} onchange="cuadreCambiarOpcion('rellenarHuecosGrandes', this.checked)"><span>Poner km típicos a las clases sin km aunque sobren muchos km (faltan clases en medio)</span></label>
    </div>
  </div>`;

  if (r.cambios.length) {
    const MAX = 400;
    const filas = r.cambios.slice(0, MAX).map(c => {
      const t = CUADRE_TIPOS[c.tipo] || { txt: c.tipo, cls: 'pill-line' };
      const antes = c.antes.km_inicial === 0 && c.antes.km_final === 0 ? '<span style="color:var(--text-faint)">sin km</span>' : `${fmtMiles(c.antes.km_inicial)} → ${fmtMiles(c.antes.km_final)}`;
      const despues = c.despues.km_inicial === 0 && c.despues.km_final === 0 ? '<span style="color:var(--text-faint)">sin km</span>' : `<b>${fmtMiles(c.despues.km_inicial)} → ${fmtMiles(c.despues.km_final)}</b> <span class="cuadre-km">${fmtMiles(c.despues.km_final - c.despues.km_inicial)} km</span>`;
      return `<tr><td>${fmtFecha(c.fecha)}</td><td class="num-mono">${c.hora_inicio ? esc(c.hora_inicio) : '—'}</td><td>${esc(c.alumno)}</td>
        <td class="num-mono">${antes}</td><td class="num-mono">${despues}</td>
        <td><span class="pill ${t.cls}">${t.txt}</span><div class="al-sub" style="white-space:normal;max-width:360px">${esc(c.motivo)}</div></td></tr>`;
    }).join('');
    const vaciar = r.cambios.filter(c => c.tipo === 'vaciar').length;
    html += `<div class="card">
      <div class="card-title">Lo que se va a cambiar · ${r.cambios.length} ${r.cambios.length === 1 ? 'clase' : 'clases'}</div>
      <p class="cuadre-nota">Revisa los km y pulsa <b>Aplicar</b>: se guardan tal como se muestran. Se puede <b>deshacer</b> después.${vaciar ? ` <b>${vaciar}</b> ${vaciar === 1 ? 'clase tiene' : 'clases tienen'} km imposibles y no hay sitio donde colocarlas: se dejan sin km para repartirlos cuando lleguen las clases que faltan.` : ''}</p>
      <div class="cuadre-tabla"><table><thead><tr><th>Fecha</th><th>Hora</th><th>Alumno</th><th>Ahora</th><th>Quedaría</th><th>Qué se hace</th></tr></thead><tbody>${filas}</tbody></table></div>
      ${r.cambios.length > MAX ? `<p class="cuadre-nota">… y ${r.cambios.length - MAX} más (se aplican igual).</p>` : ''}
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-success" onclick="cuadreAplicar()">Aplicar ${r.cambios.length} ${r.cambios.length === 1 ? 'cambio' : 'cambios'}</button>
      </div>
    </div>`;
  }

  const abiertos = r.huecos.filter(h => !h.revisado), cerrados = r.huecos.filter(h => h.revisado);
  if (abiertos.length || r.avisos.length) {
    const avisos = r.avisos.filter(a => a.tipo !== 'faltan_clases'); // los «faltan clases» salen como hueco
    html += `<div class="card">
      <div class="card-title">Tramos sin explicar</div>
      <p class="cuadre-nota">Son kilómetros que el coche hizo y que no corresponden a ninguna clase de la app: <b>faltan clases por traer o anotar</b> (importa los alumnos que quedan) o fueron otro uso del coche. No se inventan clases. Si es otro uso, márcalo como revisado y deja de avisar.</p>
      ${abiertos.map(h => cuadreHuecoHTML(h, false)).join('')}
      ${avisos.map(a => `<div class="cuadre-hueco"><div>${esc(a.texto)}</div></div>`).join('')}
    </div>`;
  }
  if (cerrados.length) {
    html += `<div class="card"><div class="card-title">Revisados (${cerrados.length})</div>${cerrados.map(h => cuadreHuecoHTML(h, true)).join('')}</div>`;
  }

  if (ultimo) {
    html += `<div class="card"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="flex:1;min-width:220px;font-size:13px;color:var(--text-muted)">Último cuadre de este coche: ${new Date(ultimo.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })} · ${ultimo.clases} ${ultimo.clases === 1 ? 'clase' : 'clases'}.</span>
      <button class="btn btn-outline btn-sm" onclick="cuadreDeshacer(${ultimo.id})">Deshacer el último cuadre</button></div></div>`;
  }
  el.innerHTML = html;
}

const TOLERANCIA_HUECO_UI = 15;

function cuadreHuecoHTML(h, revisado) {
  const lado = (x) => `${fmtFecha(x.fecha)}${x.hora_inicio ? ' ' + esc(x.hora_inicio) : ''} · ${esc(x.alumno)} (km ${fmtMiles(x.km)})`;
  // Si una de las dos lecturas está mal (p. ej. un km traído del otro programa que es de otro coche), se quitan sus km
  const quitar = (x, texto) => `<button class="btn btn-outline btn-sm" onclick="cuadreQuitarKm(${x.practica_id}, '${String(x.alumno).replace(/[^\p{L}\p{N} .-]/gu, '')}', '${fmtFecha(x.fecha)}${x.hora_inicio ? ' ' + esc(x.hora_inicio) : ''}', ${x.km})" title="La clase se queda sin km (con su fecha y hora); se puede deshacer">${texto}</button>`;
  return `<div class="cuadre-hueco${h.sospechoso ? ' sospechoso' : ''}">
    <div style="flex:1;min-width:240px">
      <div><b class="num-mono">${fmtMiles(h.km)} km</b> ${h.sospechoso ? '<span class="pill pill-warn">¿error al teclear?</span>' : ''} <span class="al-sub" style="display:inline">≈ ${fmtMiles(h.clases_aprox)} ${h.clases_aprox === 1 ? 'clase' : 'clases'} de media${h.clases_sin_km ? ` · ${h.clases_sin_km} sin km en medio` : ''}</span></div>
      <div class="al-sub" style="white-space:normal">${lado(h.desde)}<br>→ ${lado(h.hasta)}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch">
      <button class="btn btn-outline btn-sm" onclick="cuadreRevisar('${h.clave}', ${revisado ? 'false' : 'true'})">${revisado ? 'Volver a avisar' : 'Dar por revisado'}</button>
      ${revisado ? '' : quitar(h.desde, 'Quitar los km de la 1.ª clase') + quitar(h.hasta, 'Quitar los km de la 2.ª clase')}
    </div>
  </div>`;
}

async function cuadreQuitarKm(id, alumno, cuando, km) {
  if (!await confirmar(`Se quitarán los km de la clase de ${alumno} del ${cuando} (km ${fmtMiles(km)}).\n\nLa clase se queda donde está, con su fecha y hora, solo que sin km. Después Cuadrar km podrá repartir los km de las clases de alrededor.\n\nSe puede deshacer con «Deshacer el último cuadre».\n\n¿Quitar los km?`)) return;
  const res = await window.api.quitarKmClase(id);
  if (res.errores && res.errores.length) {
    document.getElementById('cuadre-cuerpo').insertAdjacentHTML('afterbegin', `<div class="alert alert-err" style="margin-bottom:14px">${esc(res.errores.join(' '))}</div>`);
    return;
  }
  gkActualizarContador();
  cuadreCargar(`✓ Quitados los km de la clase de ${esc(alumno)} (${esc(cuando)}). Mira abajo cómo queda el coche; si hay clases sin km anteriores a la primera con km, marca «Rellenar también las clases sin km anteriores».`);
}

async function cuadreRevisar(clave, revisado) {
  await window.api.marcarHuecoKmRevisado(clave, revisado);
  cuadreCargar();
}

async function cuadreAplicar() {
  if (!cuadrePlan || !cuadrePlan.cambios.length) return;
  const n = cuadrePlan.cambios.length;
  if (!await confirmar(`Se van a guardar los km de ${n} ${n === 1 ? 'clase' : 'clases'} tal como se muestran.\n\nSe puede deshacer después desde esta misma pantalla.\n\n¿Aplicar?`)) return;
  const res = await window.api.aplicarCuadreKm(cuadrePlan.vid, cuadrePlan.cambios);
  if (res.errores && res.errores.length) {
    const el = document.getElementById('cuadre-cuerpo');
    el.insertAdjacentHTML('afterbegin', `<div class="alert alert-err" style="margin-bottom:14px">${esc(res.errores.join(' '))}</div>`);
    return;
  }
  gkActualizarContador();
  cuadreCargar(`✓ ${res.aplicados} ${res.aplicados === 1 ? 'clase cuadrada' : 'clases cuadradas'}${res.omitidos ? ` (${res.omitidos} ya no estaban como en la vista previa)` : ''}. Puedes deshacerlo más abajo.`);
}

async function cuadreDeshacer(id) {
  if (!await confirmar('Se devolverán las clases a como estaban antes del último cuadre de este coche (las que se hayan editado después no se tocan).\n\n¿Deshacer?')) return;
  const res = await window.api.deshacerCuadreKm(id);
  if (res.errores && res.errores.length) { cuadreCargar(); return; }
  gkActualizarContador();
  cuadreCargar(`↶ Cuadre deshecho: ${res.deshechos} ${res.deshechos === 1 ? 'clase devuelta' : 'clases devueltas'} a como estaban${res.omitidos ? ` (${res.omitidos} se habían editado después y no se tocaron)` : ''}.`);
}

// ─── AVISO EN LA LISTA DE PRÁCTICAS ──────────────────────────────────────────
// Una línea por encima de la tabla cuando algún coche tiene km por cuadrar.
async function cuadreAvisoPracticas() {
  const el = document.getElementById('pg-cuadre-aviso');
  if (!el) return;
  let lista = [];
  try { lista = await window.api.getResumenCuadreKm(); } catch { lista = []; }
  const con = (lista || []).filter(c => c.activo && c.problemas > 0);
  if (!con.length) { el.innerHTML = ''; return; }
  const filas = con.map(c => {
    const partes = [];
    if (c.incoherentes) partes.push(`${c.incoherentes} con km que no encajan`);
    if (c.a_cambiar - c.incoherentes > 0) partes.push(`${c.a_cambiar - c.incoherentes} por repartir`);
    if (c.huecos) partes.push(`${c.huecos} ${c.huecos === 1 ? 'tramo' : 'tramos'} sin explicar (${fmtMiles(c.km_en_huecos)} km)`);
    return `<div class="cuadre-aviso-fila"><span><b>${esc(c.nombre)}</b>${c.matricula ? ' · ' + esc(c.matricula) : ''}: ${partes.join(' · ')}</span>
      <button class="btn btn-outline btn-sm" onclick="cuadreIrA(${c.vehiculo_id})">Cuadrar</button></div>`;
  }).join('');
  el.innerHTML = `<div class="alert alert-warn cuadre-aviso"><div><b>Hay km por cuadrar.</b> Las clases se ordenan por fecha y hora y los km no siempre encajan.</div>${filas}</div>`;
}

function cuadreIrA(vid) {
  gkVehiculoPreferido = vid;   // loadGenerarKm lo respeta al rellenar el selector
  navegarA('generar-km', 'cuadrar');
}
