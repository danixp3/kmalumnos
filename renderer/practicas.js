// ─── PRÁCTICAS ───────────────────────────────────────────────────────────────
// Prácticas de kilómetros de un alumno: listado, generación de km y CRUD.

// ─── PRÁCTICAS ───────────────────────────────────────────────────────────────
function verPracticas(alumnoId, vehiculoId, nombre) {
  currentAlumnoId = alumnoId;
  currentAlumnoVehiculoId = vehiculoId;
  document.getElementById('practicas-titulo').textContent = `Prácticas de ${nombre}`;
  document.getElementById('view-alumnos').style.display = 'none';
  document.getElementById('view-practicas').style.display = 'block';
  // Fecha de hoy por defecto
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('p-fecha').value = hoy;
  document.getElementById('p-ki').value = '';
  document.getElementById('p-kf').value = '';
  document.getElementById('km-preview').classList.add('hidden');
  aplicarRangoPref('p-min', 'p-max');
  loadPracticas();
}

function volverAlumnos() {
  currentAlumnoId = null;
  document.getElementById('view-alumnos').style.display = 'block';
  document.getElementById('view-practicas').style.display = 'none';
  loadAlumnos();
}

async function loadPracticas() {
  if (!currentAlumnoId) return;
  const practicas = await window.api.getPracticas(currentAlumnoId);
  const tbody = document.querySelector('#tabla-practicas tbody');
  if (!practicas.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay prácticas registradas para este alumno</td></tr>';
    return;
  }
  tbody.innerHTML = practicas.map((p, i) => {
    const sinKm = p.km_inicial === 0 && p.km_final === 0;
    const diff = Math.round((p.km_final - p.km_inicial) * 10) / 10;
    const kmICell = sinKm ? '<span style="color:var(--warn-fg-soft);font-style:italic">Sin km</span>' : fmt(p.km_inicial);
    const kmFCell = sinKm ? '<span style="color:var(--warn-fg-soft);font-style:italic">Sin km</span>' : fmt(p.km_final);
    const diffCell = sinKm ? '<span style="color:var(--warn-fg-soft);font-style:italic">—</span>' : `<span class="km-badge">+${diff} km</span>`;
    const profesorCell = p.profesor_nombre ? esc(p.profesor_nombre) : '<span style="color:var(--placeholder)">—</span>';
    const profesorIdArg = p.profesor_id != null ? p.profesor_id : 'null';
    const tipo = p.tipo || 'circulacion';
    const tipoCell = tipo === 'pista' ? 'Pista' : 'Circulación';
    return `<tr${sinKm ? ' style="background:var(--warn-bg-soft)"' : ''}>
      <td>${i + 1}</td>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${kmICell}</td>
      <td>${kmFCell}</td>
      <td>${diffCell}</td>
      <td>${profesorCell}</td>
      <td>${tipoCell}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="openEditPractica(${p.id},'${p.fecha}',${p.km_inicial},${p.km_final},${profesorIdArg},'${tipo}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
        <button class="btn btn-danger btn-sm" onclick="deletePractica(${p.id})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
      </td>
    </tr>`;
  }).join('');
}

async function generarKmPractica() {
  if (!currentAlumnoId) return;
  const min = parseFloat(document.getElementById('p-min').value) || 40;
  const max = parseFloat(document.getElementById('p-max').value) || 45;

  // Obtener km de partida: última práctica del alumno o km del vehículo
  let kmBase = 0;
  const ultima = await window.api.getUltimaPractica(currentAlumnoId);
  if (ultima) {
    kmBase = ultima.km_final;
  } else if (currentAlumnoVehiculoId) {
    const vehiculos = await window.api.getVehiculos();
    const v = vehiculos.find(x => x.id === currentAlumnoVehiculoId);
    if (v) kmBase = v.km_actual;
  }

  const result = await window.api.generarKm(kmBase, min, max);
  document.getElementById('p-ki').value = result.km_inicial;
  document.getElementById('p-kf').value = result.km_final;

  const preview = document.getElementById('km-preview');
  preview.textContent = `Generado: ${fmt(result.km_inicial)} → ${fmt(result.km_final)}  (+${result.diff} km)`;
  preview.classList.remove('hidden');
}

async function addPractica() {
  if (!currentAlumnoId) return;
  const fecha = document.getElementById('p-fecha').value;
  const kiRaw = document.getElementById('p-ki').value;
  const kfRaw = document.getElementById('p-kf').value;

  if (!fecha) { alert('Selecciona una fecha.'); return; }

  const vid = currentAlumnoVehiculoId;
  if (!vid) { alert('El alumno no tiene un vehículo asignado. Asígnale uno primero.'); return; }

  // Si los km están vacíos se guardan como 0,0 para rellenar luego
  let ki = parseFloat(kiRaw);
  let kf = parseFloat(kfRaw);
  const sinKm = isNaN(ki) || isNaN(kf);

  if (!sinKm && kf <= ki) { alert('El km final debe ser mayor que el km inicial.'); return; }

  if (sinKm) { ki = 0; kf = 0; }

  const tipo = document.getElementById('p-tipo')?.value || 'circulacion';
  await window.api.addPractica(currentAlumnoId, vid, fecha, ki, kf, null, tipo);
  document.getElementById('p-ki').value = '';
  document.getElementById('p-kf').value = '';
  document.getElementById('km-preview').classList.add('hidden');
  loadPracticas();
}

async function deletePractica(id) {
  if (!confirm('¿Borrar esta práctica?')) return;
  await window.api.deletePractica(id);
  loadPracticas();
}

async function openEditPractica(id, fecha, ki, kf, profesorId, tipo) {
  document.getElementById('edit-p-id').value = id;
  document.getElementById('edit-p-fecha').value = fecha;
  document.getElementById('edit-p-ki').value = ki;
  document.getElementById('edit-p-kf').value = kf;
  document.getElementById('edit-p-tipo').value = tipo || 'circulacion';
  await llenarSelectProfesores('edit-p-profesor', profesorId);
  openModal('modal-practica');
}

async function savePractica() {
  const id = parseInt(document.getElementById('edit-p-id').value);
  const fecha = document.getElementById('edit-p-fecha').value;
  const ki = parseFloat(document.getElementById('edit-p-ki').value);
  const kf = parseFloat(document.getElementById('edit-p-kf').value);
  const profesorId = document.getElementById('edit-p-profesor').value;
  const tipo = document.getElementById('edit-p-tipo').value || 'circulacion';
  if (!fecha || isNaN(ki) || isNaN(kf)) { alert('Rellena todos los campos.'); return; }
  if (kf <= ki) { alert('El km final debe ser mayor que el inicial.'); return; }

  // Validación cruzada: comprobar solapamiento con otras prácticas del mismo vehículo
  const vid = currentAlumnoVehiculoId;
  if (vid) {
    const conflictos = await window.api.validarSolapamiento(vid, fecha, ki, kf, id);
    if (conflictos.length) {
      const detalle = conflictos.map(c =>
        `• ${c.alumno} — ${fmtFecha(c.fecha)}: ${fmt(c.km_inicial)} → ${fmt(c.km_final)}`
      ).join('\n');
      const continuar = confirm(
        `Estos km se solapan con ${conflictos.length} práctica(s) del mismo vehículo:\n\n${detalle}\n\n¿Guardar igualmente?`
      );
      if (!continuar) return;
    }
  }

  await window.api.updatePractica(id, fecha, ki, kf, profesorId, tipo);
  closeModal('modal-practica');
  // Si venimos de la pestaña Conflictos (Kilómetros), recargar esa vista; si no, las prácticas del alumno
  const kilometrosPage = document.getElementById('page-kilometros');
  const conflictosTab = document.getElementById('tab-kilometros-conflictos');
  if (kilometrosPage && kilometrosPage.classList.contains('active') && conflictosTab && conflictosTab.classList.contains('active')) {
    loadSolapamientos();
  } else {
    loadPracticas();
  }
}

