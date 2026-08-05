// ─── PRÁCTICAS ───────────────────────────────────────────────────────────────
// CRUD de prácticas individuales y registro rápido/masivo por vehículo+fecha
// (usado en la pantalla de registro rápido de km).

const { load, save, nextId, _sync, addLog, filtrarPorSucursal } = require('./core');

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

function addPractica(alumno_id, vehiculo_id, fecha, km_inicial, km_final, profesor_id = null, tipo = 'circulacion', sucursal_id = null) {
  const d = load();
  const id = nextId('p');
  const ki = parseFloat(km_inicial);
  const kf = parseFloat(km_final);
  d.practicas.push({
    id, alumno_id: parseInt(alumno_id), vehiculo_id: parseInt(vehiculo_id), fecha, km_inicial: ki, km_final: kf,
    profesor_id: profesor_id ? parseInt(profesor_id) : null,
    tipo: tipo || 'circulacion',
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null
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

// ─── FICHA DE CLASES PRÁCTICAS FIRMABLE (RD 1295/2003 art. 40) ──────────────
/**
 * Datos listos para la ficha imprimible de clases prácticas de un alumno:
 * cabecera del alumno + tabla de prácticas (ordenadas por fecha ascendente,
 * con nombre de vehículo/matrícula y profesor resueltos) + totales.
 * Solo lectura, no marca sync. Alumno inexistente → null.
 */
function getFichaPracticasAlumno(alumno_id) {
  const d = load();
  const aid = parseInt(alumno_id);
  const a = d.alumnos.find(x => x.id === aid);
  if (!a) return null;

  const practicas = d.practicas
    .filter(p => p.alumno_id === aid && !p.deleted)
    .sort((a2, b2) => a2.fecha.localeCompare(b2.fecha) || a2.id - b2.id)
    .map(p => {
      const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
      const prof = d.profesores.find(x => x.id === p.profesor_id);
      const ki = p.km_inicial || 0;
      const kf = p.km_final || 0;
      return {
        id: p.id,
        fecha: p.fecha,
        vehiculo_nombre: v ? v.nombre : null,
        matricula: v ? v.matricula : null,
        profesor_nombre: prof ? prof.nombre : null,
        tipo: p.tipo || 'circulacion',
        km_inicial: ki,
        km_final: kf,
        km_recorridos: Math.max(0, kf - ki),
      };
    });

  const totales = {
    nClases: practicas.length,
    kmTotales: practicas.reduce((sum, p) => sum + p.km_recorridos, 0),
  };

  return {
    alumno: { id: a.id, nombre: a.nombre, permiso: a.permiso, dni: a.dni || null },
    practicas,
    totales,
  };
}

// ─── TODAS LAS PRÁCTICAS (VISTA GLOBAL) ──────────────────────────────────────
/**
 * Devuelve TODAS las prácticas de todos los alumnos juntas, con nombres de
 * alumno/vehículo/profesor resueltos, para la vista global de la pantalla
 * Prácticas. `filtros` es opcional: { desde, hasta ('YYYY-MM-DD'), alumno_id,
 * vehiculo_id, profesor_id, tipo ('pista'|'circulacion'), sucursal_id },
 * todos opcionales.
 * Excluye solo prácticas con deleted:true (si el alumno/vehículo/profesor
 * está borrado o no existe, la práctica se sigue mostrando con nombre "—").
 * Ordena por fecha descendente y, a igualdad, por id descendente.
 * Solo lectura, no marca sync.
 */
function getTodasPracticas(filtros = {}) {
  const d = load();
  const { desde, hasta, alumno_id, vehiculo_id, profesor_id, tipo, sucursal_id } = filtros || {};

  return filtrarPorSucursal(d.practicas, sucursal_id)
    .filter(p => !p.deleted)
    .filter(p => !desde || p.fecha >= desde)
    .filter(p => !hasta || p.fecha <= hasta)
    .filter(p => alumno_id === undefined || alumno_id === null || alumno_id === '' || p.alumno_id === parseInt(alumno_id))
    .filter(p => vehiculo_id === undefined || vehiculo_id === null || vehiculo_id === '' || p.vehiculo_id === parseInt(vehiculo_id))
    .filter(p => profesor_id === undefined || profesor_id === null || profesor_id === '' || p.profesor_id === parseInt(profesor_id))
    .filter(p => !tipo || (p.tipo || 'circulacion') === tipo)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    .map(p => {
      const a = d.alumnos.find(x => x.id === p.alumno_id);
      const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
      const prof = d.profesores.find(x => x.id === p.profesor_id);
      const sinKm = p.km_inicial === 0 && p.km_final === 0;
      return {
        id: p.id,
        fecha: p.fecha,
        alumno_id: p.alumno_id,
        alumno_nombre: a ? a.nombre : '—',
        vehiculo_id: p.vehiculo_id,
        vehiculo_nombre: v ? v.nombre : '—',
        profesor_id: p.profesor_id,
        profesor_nombre: prof ? prof.nombre : '—',
        km_inicial: p.km_inicial,
        km_final: p.km_final,
        km_recorridos: sinKm ? 0 : p.km_final - p.km_inicial,
        tipo: p.tipo || 'circulacion',
        sin_km: sinKm,
      };
    });
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
  getPracticasByAlumno, getUltimaPractica, addPractica, deletePractica, updatePractica, getTodasPracticas,
  getAlumnosPorVehiculo, registrarPracticasMasivas, eliminarPracticaPorFecha, ajustarPracticasAlumno, guardarNotaAlumno,
  getFichaPracticasAlumno,
};
