// ─── CUADRAR KM (apoyos del asistente de Kilómetros) ─────────────────────────
// La pantalla de Kilómetros (renderer/kilometros.js) propone y combina los pasos;
// aquí quedan las piezas que comparten: etiquetas de tipo de cambio, el aviso de
// la lista de Prácticas, los tramos sin explicar (dar por revisado / quitar los km
// de una clase) y cuadreIrA (en kilometros.js).

const CUADRE_TIPOS = {
  repartir: { txt: 'Reparte km', cls: 'pill-ok' },
  corregir: { txt: 'Corrige km', cls: 'pill-warn' },
  recorte:  { txt: 'Recorta solape', cls: 'pill-line' },
  cerrar:   { txt: 'Cierra hueco', cls: 'pill-line' },
  vaciar:   { txt: 'Deja sin km', cls: 'pill-warn' }
};

function cuadreVehiculoId() {
  return parseInt(document.getElementById('km-vehiculo')?.value) || 0;
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
    document.getElementById('km-asistente').insertAdjacentHTML('afterbegin', `<div class="alert alert-err" style="margin-bottom:14px">${esc(res.errores.join(' '))}</div>`);
    return;
  }
  KM.planDe = null;
  kmCargar(`✓ Quitados los km de la clase de ${esc(alumno)} (${esc(cuando)}). Mira abajo cómo queda el coche; si hay clases sin km anteriores a la primera con km, marca «Rellenar hacia atrás».`);
}

async function cuadreRevisar(clave, revisado) {
  await window.api.marcarHuecoKmRevisado(clave, revisado);
  KM.planDe = null;
  kmCargar();
}

// ─── AVISO EN LA LISTA DE PRÁCTICAS ──────────────────────────────────────────
// Una línea por encima de la tabla cuando algún coche tiene km por cuadrar.
async function cuadreAvisoPracticas() {
  const el = document.getElementById('pg-cuadre-aviso');
  if (!el) return;
  let lista = [];
  try { lista = await window.api.getResumenCuadreKm(); } catch { lista = []; }
  const oculta = typeof kmOcultarHuecos === 'function' && kmOcultarHuecos();
  const con = (lista || []).filter(c => c.activo && (oculta ? c.a_cambiar > 0 : c.problemas > 0));
  if (!con.length) { el.innerHTML = ''; return; }
  const filas = con.map(c => {
    const partes = [];
    if (c.incoherentes) partes.push(`${c.incoherentes} con km que no encajan`);
    if (c.a_cambiar - c.incoherentes > 0) partes.push(`${c.a_cambiar - c.incoherentes} por repartir`);
    if (c.huecos && !oculta) partes.push(`${c.huecos} ${c.huecos === 1 ? 'tramo' : 'tramos'} sin explicar (${fmtMiles(c.km_en_huecos)} km)`);
    return `<div class="cuadre-aviso-fila"><span><b>${esc(c.nombre)}</b>${c.matricula ? ' · ' + esc(c.matricula) : ''}: ${partes.join(' · ')}</span>
      <button class="btn btn-outline btn-sm" onclick="cuadreIrA(${c.vehiculo_id})">Cuadrar</button></div>`;
  }).join('');
  el.innerHTML = `<div class="alert alert-warn cuadre-aviso"><div><b>Hay km por cuadrar.</b> Las clases se ordenan por fecha y hora y los km no siempre encajan.</div>${filas}</div>`;
}

