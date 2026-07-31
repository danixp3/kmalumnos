// ─── PRÁCTICAS ───────────────────────────────────────────────────────────────
// CRUD de prácticas individuales y registro rápido/masivo por vehículo+fecha
// (usado en la pantalla de registro rápido de km).

const { load, save, nextId, _sync, addLog } = require('./core');

function getPracticasByAlumno(alumno_id) {
  const d = load();
  return d.practicas
    .filter(p => p.alumno_id === alumno_id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
    .map(p => {
      const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
      const prof = d.profesores.find(x => x.id === p.profesor_id);
      return { ...p, vehiculo_nombre: v ? v.nombre : null, profesor_nombre: prof ? prof.nombre : null };
    });
}

function getUltimaPractica(alumno_id) {
  const practicas = getPracticasByAlumno(alumno_id);
  return practicas.length ? practicas[practicas.length - 1] : null;
}

function addPractica(alumno_id, vehiculo_id, fecha, km_inicial, km_final, profesor_id = null, tipo = 'circulacion') {
  const d = load();
  const id = nextId('p');
  const ki = parseFloat(km_inicial);
  const kf = parseFloat(km_final);
  d.practicas.push({
    id, alumno_id: parseInt(alumno_id), vehiculo_id: parseInt(vehiculo_id), fecha, km_inicial: ki, km_final: kf,
    profesor_id: profesor_id ? parseInt(profesor_id) : null,
    tipo: tipo || 'circulacion'
  });
  // Actualizar km vehículo si corresponde
  const v = d.vehiculos.find(x => x.id === parseInt(vehiculo_id));
  if (v && kf > v.km_actual) v.km_actual = kf;
  save();
  const s = _sync(); if (s) s.markDirty('practicas', id);
  return id;
}

function deletePractica(id) {
  const d = load();
  d.practicas = d.practicas.filter(x => x.id !== id);
  save();
  const s = _sync(); if (s) s.markDeleted('practicas', id);
}

function updatePractica(id, fecha, km_inicial, km_final, profesor_id = null, tipo = 'circulacion') {
  const d = load();
  const p = d.practicas.find(x => x.id === id);
  if (p) {
    p.fecha = fecha;
    p.km_inicial = parseFloat(km_inicial);
    p.km_final = parseFloat(km_final);
    p.profesor_id = profesor_id ? parseInt(profesor_id) : null;
    p.tipo = tipo || 'circulacion';
    save();
    const s = _sync(); if (s) s.markDirty('practicas', id);
  }
}

// ─── ALUMNOS POR VEHÍCULO (para registro rápido) ─────────────────────────────
/**
 * Devuelve todos los alumnos asignados a un vehículo específico,
 * junto con si ya tienen práctica registrada en la fecha indicada.
 */
function getAlumnosPorVehiculo(vehiculo_id, fecha) {
  const d = load();
  const vid = parseInt(vehiculo_id);

  const alumnos = d.alumnos
    .filter(a => a.vehiculo_id === vid)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return alumnos.map(a => {
    // Contar cuántas prácticas tiene ese día y obtener nota si existe
    const practicasHoy = d.practicas.filter(p =>
      p.alumno_id === a.id &&
      p.vehiculo_id === vid &&
      p.fecha === fecha
    );
    const nota = practicasHoy.length > 0 ? (practicasHoy[0].nota || '') : '';
    return {
      id: a.id,
      nombre: a.nombre,
      permiso: a.permiso,
      num_practicas: practicasHoy.length,
      nota: nota
    };
  });
}

/**
 * Registra prácticas masivas para varios alumnos en una fecha.
 * Añade práctica con km 0,0 (para rellenar después con relleno masivo).
 */
function registrarPracticasMasivas(vehiculo_id, fecha, alumno_ids) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  let registradas = 0;
  const detalles = [];

  for (const aid of alumno_ids) {
    const alumno_id = parseInt(aid);
    // Verificar que no exista ya práctica ese día para ese alumno/vehículo
    const existe = d.practicas.some(p =>
      p.alumno_id === alumno_id &&
      p.vehiculo_id === vid &&
      p.fecha === fecha
    );
    if (existe) continue;

    const alumno = d.alumnos.find(a => a.id === alumno_id);
    if (!alumno) continue;

    const pid = nextId('p');
    d.practicas.push({
      id: pid,
      alumno_id,
      vehiculo_id: vid,
      fecha,
      km_inicial: 0,
      km_final: 0
    });
    registradas++;
    detalles.push(`${alumno.nombre} (${fecha})`);
    const s = _sync(); if (s) s.markDirty('practicas', pid);
  }

  if (registradas > 0) {
    addLog('registro_rapido', `Registro rápido: ${registradas} práctica(s) añadidas`, detalles);
    save();
  }

  return { registradas };
}

/**
 * Ajusta el número de prácticas de un alumno en una fecha.
 * Si delta > 0, añade prácticas. Si delta < 0, elimina.
 */
function ajustarPracticasAlumno(vehiculo_id, fecha, alumno_id, delta, profesor_id = null, tipo = 'circulacion') {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const aid = parseInt(alumno_id);

  const practicasExistentes = d.practicas.filter(p =>
    p.alumno_id === aid &&
    p.vehiculo_id === vid &&
    p.fecha === fecha
  );

  const actual = practicasExistentes.length;
  const nuevo = Math.max(0, actual + delta);
  const diff = nuevo - actual;

  if (diff > 0) {
    // Añadir prácticas
    for (let i = 0; i < diff; i++) {
      const pid = nextId('p');
      d.practicas.push({
        id: pid,
        alumno_id: aid,
        vehiculo_id: vid,
        fecha,
        km_inicial: 0,
        km_final: 0,
        profesor_id: profesor_id ? parseInt(profesor_id) : null,
        tipo: tipo || 'circulacion'
      });
      const s = _sync(); if (s) s.markDirty('practicas', pid);
    }
  } else if (diff < 0) {
    // Eliminar prácticas (las más recientes primero)
    const aEliminar = practicasExistentes.slice(diff); // últimas |diff|
    for (const p of aEliminar) {
      const idx = d.practicas.findIndex(x => x.id === p.id);
      if (idx !== -1) {
        d.practicas.splice(idx, 1);
        const s = _sync(); if (s) s.markDeleted('practicas', p.id);
      }
    }
  }

  if (diff !== 0) save();
  return { num_practicas: nuevo };
}

/**
 * Guarda una nota en las prácticas de un alumno para una fecha.
 * Si no tiene prácticas ese día, crea una con km=0 para poder guardar la nota.
 */
function guardarNotaAlumno(vehiculo_id, fecha, alumno_id, nota, profesor_id = null, tipo = 'circulacion') {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const aid = parseInt(alumno_id);

  let practicas = d.practicas.filter(p =>
    p.alumno_id === aid &&
    p.vehiculo_id === vid &&
    p.fecha === fecha
  );

  // Si no tiene prácticas ese día, crear una para poder guardar la nota
  if (practicas.length === 0 && nota) {
    const nuevaPractica = {
      id: d._seq.p++,
      alumno_id: aid,
      vehiculo_id: vid,
      fecha: fecha,
      km_inicial: 0,
      km_final: 0,
      nota: nota,
      profesor_id: profesor_id ? parseInt(profesor_id) : null,
      tipo: tipo || 'circulacion'
    };
    d.practicas.push(nuevaPractica);
    save();
    const s = _sync(); if (s) s.markDirty('practicas', nuevaPractica.id);
    return { ok: true, created: true };
  }

  if (practicas.length > 0) {
    practicas[0].nota = nota;
    save();
    const s = _sync(); if (s) s.markDirty('practicas', practicas[0].id);
  }

  return { ok: true };
}

/**
 * Elimina práctica de un alumno en una fecha específica para un vehículo.
 */
function eliminarPracticaPorFecha(vehiculo_id, fecha, alumno_id) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const aid = parseInt(alumno_id);

  const idx = d.practicas.findIndex(p =>
    p.alumno_id === aid &&
    p.vehiculo_id === vid &&
    p.fecha === fecha
  );

  if (idx !== -1) {
    const practica = d.practicas[idx];
    d.practicas.splice(idx, 1);
    save();
    const s = _sync(); if (s) s.markDeleted('practicas', practica.id);
    return { eliminada: true };
  }
  return { eliminada: false };
}

module.exports = {
  getPracticasByAlumno, getUltimaPractica, addPractica, deletePractica, updatePractica,
  getAlumnosPorVehiculo, registrarPracticasMasivas, eliminarPracticaPorFecha, ajustarPracticasAlumno, guardarNotaAlumno,
};
