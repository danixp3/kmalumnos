// ─── CAMBIO DE PROFESOR DE UN ALUMNO (2026-10-09) ────────────────────────────
// «David empezó conmigo y ahora da clase con otra profesora y otro coche»: las clases ya dadas
// se quedan con quien las dio y, desde el día del cambio, son del nuevo profesor. Después se
// puede sacar una ficha DGT de cada profesor, con sus datos y su firma
// (db/alumnos.js → cambiarProfesorAlumno; db/practicas.js → getFichasDGTAlumno).

let cpDeshacer = null;   // lo que había antes del último cambio (para «Deshacer»)
let cpAlumno = null;     // alumno que se está cambiando

async function abrirCambioProfesor(alumnoId) {
  let ficha, profesores, vehiculos;
  try { [ficha, profesores, vehiculos] = await Promise.all([window.api.getFichaAlumno(alumnoId), window.api.getProfesores(), window.api.getVehiculos()]); }
  catch (e) { await avisar('No se pudo preparar el cambio de profesor.'); return; }
  if (!ficha) return;
  const a = ficha.alumno;
  const otros = profesores.filter(p => p.id !== a.profesor_id);
  if (!otros.length) { await avisar('No hay otro profesor al que pasarlo. Añade antes al profesor nuevo en Profesores.'); return; }
  cpAlumno = { id: a.id, permiso: a.permiso, permisos: a.permisos || [], profesor_id: a.profesor_id || null, vehiculo_id: a.vehiculo_id || null, vehiculos };
  const nombre = nombrePropio([a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' '));
  const actual = profesores.find(p => p.id === a.profesor_id);
  const suyos = ficha.profesores.find(x => x.id === a.profesor_id);
  const sinProf = ficha.profesores.find(x => x.id == null);
  const hechas = ficha.practicas.filter(p => !p.enCurso).length;
  pmModal('modal-cambio-profesor', `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 style="margin:0">Cambiar de profesor</h3>
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-cambio-profesor')">Cerrar</button>
    </div>
    <p class="cp-quien"><b>${esc(nombre)}</b> · ahora con <b>${actual ? esc(nombrePropio(actual.nombre)) : 'ningún profesor'}</b>${a.vehiculo_nombre ? ` · coche ${esc(a.vehiculo_nombre)}` : ''}</p>
    <div class="cp-form fd-form">
      <div class="form-group"><label for="cp-profesor">Profesor nuevo</label>
        <select id="cp-profesor" onchange="cpProfesorElegido()">${otros.map(p => `<option value="${p.id}">${esc(nombrePropio(p.nombre))}</option>`).join('')}</select></div>
      <div class="form-group"><label for="cp-fecha" title="Las clases anteriores a este día se quedan con el profesor de ahora; desde este día, con el nuevo">Primer día con el nuevo profesor</label>
        <input type="date" id="cp-fecha" value="${hoyISO()}" onchange="cpResumen()"></div>
      <div class="form-group fd-campo-ancho"><label for="cp-coche">Coche</label>
        <select id="cp-coche"></select></div>
    </div>
    <div id="cp-resumen" class="cp-resumen"></div>
    <div id="cp-msg" class="hidden" style="margin-top:10px"></div>
    <div class="ar-pie">
      <button class="btn btn-gray" onclick="closeModal('modal-cambio-profesor')">Cancelar</button>
      <button class="btn btn-primary" id="cp-aplicar" onclick="aplicarCambioProfesorUI()">Cambiar de profesor</button>
    </div>`);
  cpAlumno.hechas = hechas; cpAlumno.conProfesor = suyos ? suyos.clases : 0; cpAlumno.sinProf = !!sinProf;
  cpAlumno.actualNombre = actual ? nombrePropio(actual.nombre) : '';
  await cpProfesorElegido();
}

// Al elegir al profesor nuevo se propone su coche (el que sirve para el permiso del alumno)
async function cpProfesorElegido() {
  const sel = document.getElementById('cp-profesor'); const coche = document.getElementById('cp-coche');
  if (!sel || !coche || !cpAlumno) return;
  let sugerido = null;
  try { sugerido = await window.api.sugerirCocheAlumno({ permiso: cpAlumno.permiso, permisos: cpAlumno.permisos, profesor_id: parseInt(sel.value) }); } catch (e) { sugerido = null; }
  const suyos = [cpAlumno.permiso, ...cpAlumno.permisos];
  const lista = cpAlumno.vehiculos.filter(v => v.id === cpAlumno.vehiculo_id || (v.activo !== false && cocheSirveParaPermisos(v, suyos)));
  coche.innerHTML = `<option value="">— Sin coche asignado —</option>` + lista.map(v =>
    `<option value="${v.id}">${esc(v.nombre)}${v.matricula ? ' (' + esc(v.matricula) + ')' : ''}${v.id === cpAlumno.vehiculo_id ? ' · el de ahora' : ''}</option>`).join('');
  coche.value = String(sugerido || cpAlumno.vehiculo_id || '');
  cpResumen();
}

function cpResumen() {
  const cont = document.getElementById('cp-resumen'); const prof = document.getElementById('cp-profesor');
  if (!cont || !prof || !cpAlumno) return;
  const nuevo = nombrePropio(prof.options[prof.selectedIndex].textContent);
  const fecha = document.getElementById('cp-fecha').value;
  cont.innerHTML = `<ul>
    <li>Sus clases anteriores ${fecha ? `al <b>${esc(fmtFecha(fecha))}</b> ` : ''}se quedan con <b>${esc(cpAlumno.actualNombre || 'el profesor de ahora')}</b>: saldrán en su ficha DGT con sus datos y su firma.</li>
    <li>Desde ${fecha ? `ese día` : 'el día del cambio'}, las clases serán de <b>${esc(nuevo)}</b>, con su propia ficha DGT.</li>
    <li>Nada se borra y se puede deshacer.</li></ul>
    ${cpAlumno.actualNombre ? '' : '<div class="alert alert-warn" style="margin-top:8px">Este alumno no tenía profesor puesto: sus clases anteriores quedan sin profesor.</div>'}`;
}

async function aplicarCambioProfesorUI() {
  const profesorId = parseInt(document.getElementById('cp-profesor').value);
  const fecha = document.getElementById('cp-fecha').value;
  if (!fecha) { showToast('cp-msg', 'Indica desde qué día.', 'err'); return; }
  const r = await window.api.cambiarProfesorAlumno(cpAlumno.id, profesorId, { fecha, vehiculo_id: document.getElementById('cp-coche').value || null });
  if (!r || !r.ok) { showToast('cp-msg', (r && r.error) || 'No se pudo cambiar de profesor.', 'err'); return; }
  cpDeshacer = r.anterior;
  closeModal('modal-cambio-profesor');
  await refrescarTrasRevisarAlumnos();
  avisoConDeshacer(`Cambio de profesor hecho: ${r.conservadas} ${r.conservadas === 1 ? 'clase queda' : 'clases quedan'} con ${cpAlumno.actualNombre || 'el profesor anterior'} y ${r.nuevas} ${r.nuevas === 1 ? 'pasa' : 'pasan'} al nuevo.`, 'deshacerCambioProfesorUI()');
}

async function deshacerCambioProfesorUI() {
  if (!cpDeshacer) return;
  const r = await window.api.deshacerCambioProfesorAlumno(cpDeshacer);
  cpDeshacer = null;
  if (!r || !r.ok) { await avisar((r && r.error) || 'No se pudo deshacer.'); return; }
  await refrescarTrasRevisarAlumnos();
  showToast('alumnos-alta-toast', 'Deshecho: el alumno vuelve a tener a su profesor de antes.', 'ok');
}
