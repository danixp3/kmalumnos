// ─── PRÁCTICAS ───────────────────────────────────────────────────────────────
// CRUD de prácticas individuales y registro rápido/masivo por vehículo+fecha
// (usado en la pantalla de registro rápido de km).

const { load, save, nextId, _sync, addLog, filtrarPorSucursal, esPracticaEnCurso, esPracticaSinCerrar, hoyLocalISO,
  clasesDePractica, fmtClases, firmaValida } = require('./core');
const { directorResuelto } = require('./ajustes-empresa');

// Profesor que firma una clase: el que la dio; si no consta, el del alumno; y
// si tampoco, el profesor de la autoescuela cuando solo hay uno.
function profesorDeClase(d, p, alumno) {
  const pid = (p && p.profesor_id) || (alumno && alumno.profesor_id) || null;
  if (pid) return d.profesores.find(x => x.id === pid) || null;
  const activos = d.profesores.filter(x => !x.deleted);
  return activos.length === 1 ? activos[0] : null;
}

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

// hora_inicio (tarea "Ficha alumno – formación práctica" DGT): string
// "HH:MM" opcional, nullable. Va al final para no romper llamadas existentes
// (mismo criterio que profesor_id/tipo/sucursal_id).
function addPractica(alumno_id, vehiculo_id, fecha, km_inicial, km_final, profesor_id = null, tipo = 'circulacion', sucursal_id = null, hora_inicio = null) {
  const d = load();
  const id = nextId('p');
  const ki = Math.round(parseFloat(km_inicial));
  const kf = Math.round(parseFloat(km_final));
  d.practicas.push({
    id, alumno_id: parseInt(alumno_id), vehiculo_id: parseInt(vehiculo_id), fecha, km_inicial: ki, km_final: kf,
    profesor_id: profesor_id ? parseInt(profesor_id) : null,
    tipo: tipo || 'circulacion',
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null,
    hora_inicio: hora_inicio || null
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

// fraccion (opcional): 0.25 / 0.5 / 0.75 = fracción de clase; null = entera;
// sin pasarla (undefined) se deja como estaba (llamadas antiguas).
function updatePractica(id, fecha, km_inicial, km_final, profesor_id = null, tipo = 'circulacion', hora_inicio = null, fraccion) {
  const d = load();
  const p = d.practicas.find(x => x.id === id);
  if (p) {
    p.fecha = fecha;
    p.km_inicial = Math.round(parseFloat(km_inicial));
    p.km_final = Math.round(parseFloat(km_final));
    p.profesor_id = profesor_id ? parseInt(profesor_id) : null;
    p.tipo = tipo || 'circulacion';
    p.hora_inicio = hora_inicio || null;
    if (fraccion !== undefined) p.fraccion = [0.25, 0.5, 0.75].includes(Number(fraccion)) ? Number(fraccion) : null;
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

  const previas = a.clases_previas > 0 ? a.clases_previas : 0;
  let llevadas = previas;
  const practicas = d.practicas
    .filter(p => p.alumno_id === aid && !p.deleted)
    .sort((a2, b2) => a2.fecha.localeCompare(b2.fecha) || (a2.hora_inicio || '').localeCompare(b2.hora_inicio || '') || a2.id - b2.id)
    .map(p => {
      const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
      const prof = d.profesores.find(x => x.id === p.profesor_id);
      const firmante = profesorDeClase(d, p, a);
      const ki = p.km_inicial || 0;
      const kf = p.km_final || 0;
      const clases = clasesDePractica(p);
      llevadas += clases;
      return {
        id: p.id,
        n: Math.ceil(llevadas),
        clases,
        clases_txt: clases < 1 ? fmtClases(clases) : '',
        fecha: p.fecha,
        hora_inicio: p.hora_inicio || null,
        // Firma del alumno hecha en el móvil y la del profesor (guardada una vez)
        firma: firmaValida(p.firma) ? p.firma : null,
        firma_profesor: firmante && firmaValida(firmante.firma) ? firmante.firma : null,
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
    nClases: practicas.reduce((sum, p) => sum + p.clases, 0),
    kmTotales: practicas.reduce((sum, p) => sum + p.km_recorridos, 0),
    clasesPrevias: previas,
    kmPrevios: a.km_previos > 0 ? a.km_previos : 0,
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
// Detalle de una práctica con la FIRMA del alumno (imagen PNG que llega desde
// el móvil) para enseñarla como prueba de que recibió la clase. Solo lectura.
function getPracticaDetalle(id) {
  const d = load();
  const p = d.practicas.find(x => x.id === parseInt(id) && !x.deleted);
  if (!p) return null;
  const a = d.alumnos.find(x => x.id === p.alumno_id);
  const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
  const prof = p.profesor_id != null ? d.profesores.find(x => x.id === p.profesor_id) : null;
  const orden = (x, y) => (x.fecha || '').localeCompare(y.fecha || '') || (x.hora_inicio || '').localeCompare(y.hora_inicio || '') || x.id - y.id;
  const delAlumno = d.practicas.filter(x => x.alumno_id === p.alumno_id && !x.deleted).sort(orden);
  const previas = a && a.clases_previas > 0 ? a.clases_previas : 0;
  const firmaValida = typeof p.firma === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.firma);
  return {
    id: p.id, fecha: p.fecha, hora_inicio: p.hora_inicio || null, hora_fin: p.hora_fin || null,
    clase_n: previas + delAlumno.findIndex(x => x.id === p.id) + 1,
    alumno_id: p.alumno_id,
    alumno_nombre: a ? [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ') : '—',
    alumno_dni: a ? a.dni || null : null,
    vehiculo_nombre: v ? v.nombre : null, matricula: v ? v.matricula || null : null,
    profesor_nombre: prof ? prof.nombre : null,
    km_inicial: p.km_inicial, km_final: p.km_final,
    km: p.km_final > 0 ? Math.max(0, p.km_final - p.km_inicial) : 0,
    tipo: p.tipo || 'circulacion',
    zonas: Array.isArray(p.zonas) ? p.zonas : [],
    trabajado: Array.isArray(p.trabajado) ? p.trabajado : [],
    nota: p.nota || '',
    firma: firmaValida ? p.firma : null,
    origen: p.source || null
  };
}

function getTodasPracticas(filtros = {}) {
  const d = load();
  const { desde, hasta, alumno_id, vehiculo_id, profesor_id, tipo, sucursal_id } = filtros || {};
  const hoy = (filtros && filtros.hoy) || hoyLocalISO();

  const vivas = d.practicas.filter(p => !p.deleted);
  const orden = (a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.hora_inicio || '').localeCompare(b.hora_inicio || '') || a.id - b.id;
  // Nº de clase de cada práctica dentro del historial completo de su alumno.
  const claseN = new Map();
  const porAlumno = new Map();
  for (const p of vivas) { if (!porAlumno.has(p.alumno_id)) porAlumno.set(p.alumno_id, []); porAlumno.get(p.alumno_id).push(p); }
  // La numeración continúa tras las clases hechas antes de usar la app (punto de partida).
  const previasDe = id => { const a = d.alumnos.find(x => x.id === id); return a && a.clases_previas > 0 ? a.clases_previas : 0; };
  for (const [aid, lista] of porAlumno.entries()) { const pr = previasDe(aid); lista.sort(orden).forEach((p, i) => claseN.set(p.id, pr + i + 1)); }
  // Práctica anterior del mismo vehículo (con km) para comprobar la continuidad del cuentakilómetros.
  const previa = new Map();
  const porVehiculo = new Map();
  for (const p of vivas) { if (!porVehiculo.has(p.vehiculo_id)) porVehiculo.set(p.vehiculo_id, []); porVehiculo.get(p.vehiculo_id).push(p); }
  for (const lista of porVehiculo.values()) {
    lista.sort(orden);
    let ant = null;
    for (const p of lista) {
      previa.set(p.id, ant);
      if (!(p.km_inicial === 0 && p.km_final === 0) && !esPracticaEnCurso(p, hoy) && !esPracticaSinCerrar(p, hoy)) ant = p;
    }
  }

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
      const enCurso = esPracticaEnCurso(p, hoy);
      const sinCerrar = esPracticaSinCerrar(p, hoy);
      const pv = previa.get(p.id);
      const pvAlumno = pv ? d.alumnos.find(x => x.id === pv.alumno_id) : null;
      return {
        id: p.id,
        fecha: p.fecha,
        alumno_id: p.alumno_id,
        alumno_nombre: a ? a.nombre : '—',
        vehiculo_id: p.vehiculo_id,
        vehiculo_nombre: v ? v.nombre : '—',
        vehiculo_matricula: v ? v.matricula || null : null,
        profesor_id: p.profesor_id,
        profesor_nombre: prof ? prof.nombre : '—',
        km_inicial: p.km_inicial,
        km_final: p.km_final,
        fraccion: clasesDePractica(p) < 1 ? clasesDePractica(p) : null,
        km_recorridos: (sinKm || enCurso || sinCerrar) ? 0 : p.km_final - p.km_inicial,
        tipo: p.tipo || 'circulacion',
        hora_inicio: p.hora_inicio || null,
        sin_km: sinKm,
        en_curso: enCurso,
        sin_cerrar: sinCerrar,
        clase_n: claseN.get(p.id) || null,
        nota: p.nota || '',
        firmada: !!p.firma,
        zonas: Array.isArray(p.zonas) ? p.zonas : [],
        trabajado: Array.isArray(p.trabajado) ? p.trabajado : [],
        hora_fin: p.hora_fin || null,
        origen: p.source || null,
        // Continuidad con la práctica anterior del mismo coche (null si es la primera o no hay km).
        continuidad: (pv && !sinKm && !sinCerrar) ? {
          alumno: pvAlumno ? pvAlumno.nombre : '—',
          fecha: pv.fecha, hora_inicio: pv.hora_inicio || null,
          km_final_anterior: pv.km_final,
          diferencia: p.km_inicial - pv.km_final
        } : null
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

  // Los que ya terminaron (aprobados, bajas, inactivos) no llenan la lista,
  // salvo que tengan clase ese día
  const TERMINADOS = ['baja', 'aprobado', 'apto', 'no_apto', 'inactivo'];
  const conClase = new Set(d.practicas.filter(p => p.fecha === fecha && p.vehiculo_id === vid && !p.deleted).map(p => p.alumno_id));
  const alumnos = d.alumnos
    .filter(a => a.vehiculo_id === vid && !a.deleted && (!TERMINADOS.includes(a.estado) || conClase.has(a.id)))
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
 * Fija (o borra, con texto vacío) la nota/observación del profesor de UNA
 * práctica concreta. A diferencia de guardarNotaAlumno no crea prácticas.
 * Marca sync. Devuelve { ok } (false si la práctica no existe).
 */
function setNotaPractica(id, nota) {
  const d = load();
  const p = d.practicas.find(x => x.id === parseInt(id) && !x.deleted);
  if (!p) return { ok: false };
  p.nota = String(nota == null ? '' : nota).trim();
  save();
  const s = _sync(); if (s) s.markDirty('practicas', p.id);
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

// ─── DATOS PARA LA FICHA DGT (impreso oficial de formación práctica) ─────────
/**
 * Prepara los datos de un alumno para generar la ficha oficial DGT, ya
 * ordenados y formateados. `tipo` es 'destreza' | 'circulacion' y filtra las
 * prácticas: 'destreza' → prácticas de pista (tipo 'pista'); 'circulacion' →
 * prácticas de circulación. Fechas a dd/mm/aaaa; km como enteros. No incluye
 * datos del centro (esos vienen de Ajustes, en el proceso principal). Alumno
 * inexistente → null. Solo lectura, no marca sync.
 */
function getDatosFichaDGT(alumno_id, tipo) {
  const d = load();
  const aid = parseInt(alumno_id);
  const a = d.alumnos.find(x => x.id === aid);
  if (!a) return null;

  const prof = profesorDeClase(d, null, a);
  const tipoPractica = tipo === 'destreza' ? 'pista' : 'circulacion';
  const fmt = (f) => { if (!f) return ''; const [y, m, dd] = String(f).split('-'); return (y && m && dd) ? `${dd}/${m}/${y}` : String(f); };
  const km = (n) => (n == null ? '' : String(Number.isInteger(n) ? n : n));

  // Una fila por día (y coche): las clases del mismo día se agrupan en una sola
  // fila con el km inicial de la primera y el final de la última. "Ejercicio":
  // "1 CLASE" si ese día hubo una sola; si hubo 2 o más, "2 CLASES" (el máximo
  // por día que admite el impreso). Las fracciones (¼, ½, ¾) suman lo que valen:
  // "½ CLASE", "1 ½ CLASES".
  const delTipo = d.practicas
    .filter(p => p.alumno_id === aid && !p.deleted && (p.tipo || 'circulacion') === tipoPractica)
    .sort((x, y) => x.fecha.localeCompare(y.fecha) || (x.hora_inicio || '99').localeCompare(y.hora_inicio || '99') ||
      (x.km_inicial || 0) - (y.km_inicial || 0) || x.id - y.id);
  const grupos = new Map();
  for (const p of delTipo) {
    const clave = `${p.fecha}|${p.vehiculo_id}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(p);
  }
  // Firmas: la del alumno es la que hizo en el móvil al terminar (una sesión de
  // varias clases lleva la misma en todas); la del profesor, la que tiene
  // guardada el profesor que dio la clase (o el del alumno si no consta).
  const sinFirma = new Map();
  const practicas = [...grupos.values()].map(g => {
    const conKm = g.filter(p => p.km_final > 0);
    const primera = conKm[0] || g[0], ultima = conKm[conKm.length - 1] || g[g.length - 1];
    const hora = (g.find(p => p.hora_inicio) || {}).hora_inicio || '';
    const clases = g.reduce((s, p) => s + clasesDePractica(p), 0);
    const conFirma = g.find(p => firmaValida(p.firma));
    const firmante = g.map(p => profesorDeClase(d, p, a)).find(Boolean) || null;
    if (firmante && !firmaValida(firmante.firma)) sinFirma.set(firmante.id, firmante.nombre);
    return {
      fecha: fmt(g[0].fecha), hora, km_inicial: km(primera.km_inicial), km_final: km(ultima.km_final),
      clases, ejercicio: clases >= 2 ? '2 CLASES' : `${fmtClases(clases)} ${clases > 1 ? 'CLASES' : 'CLASE'}`,
      firma_alumno: conFirma ? conFirma.firma : null,
      firma_profesor: firmante && firmaValida(firmante.firma) ? firmante.firma : null,
    };
  });

  return {
    alumno: {
      dni: a.dni || '', permiso: a.permiso || '', nombre: a.nombre || '',
      primer_apellido: a.primer_apellido || '', segundo_apellido: a.segundo_apellido || '',
      direccion: a.direccion || '', codigo_postal: a.codigo_postal || '', poblacion: a.poblacion || '',
    },
    // Profesor de la cabecera; su firma va también en el pie («Firma del profesor»)
    profesor: {
      id: prof ? prof.id : null, nombre: prof ? prof.nombre : '', dni: prof ? (prof.dni || '') : '',
      firma: prof && firmaValida(prof.firma) ? prof.firma : null,
    },
    // Director del centro (Profesores → Director del centro): firma el certificado del pie
    director: (({ nombre, firma, profesor_id }) => ({ nombre, firma, profesor_id }))(directorResuelto(d)),
    practicas,
    // Profesores de estas clases que aún no han guardado su firma (la app se la pide)
    profesores_sin_firma: [...sinFirma].map(([id, nombre]) => ({ id, nombre })),
  };
}

// ─── DUPLICADOS ──────────────────────────────────────────────────────────────
/**
 * Detecta prácticas duplicadas de un alumno: mismas fecha + km_inicial + km_final
 * (repeticiones idénticas). Devuelve solo los grupos con 2+ prácticas; cada grupo
 * lleva su lista ordenada por id ascendente (la más antigua primero → la que se
 * conserva por defecto), con vehículo/profesor resueltos. Solo prácticas no
 * borradas. Solo lectura, no marca sync.
 */
function getPracticasDuplicadas(alumno_id) {
  const d = load();
  const aid = parseInt(alumno_id);
  const grupos = new Map();
  d.practicas
    .filter(p => p.alumno_id === aid && !p.deleted)
    .forEach(p => {
      const key = `${p.fecha}|${p.km_inicial}|${p.km_final}`;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(p);
    });
  const out = [];
  for (const arr of grupos.values()) {
    if (arr.length < 2) continue;
    const practicas = arr.slice().sort((a, b) => a.id - b.id).map(p => {
      const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
      const prof = d.profesores.find(x => x.id === p.profesor_id);
      return {
        id: p.id, fecha: p.fecha, km_inicial: p.km_inicial, km_final: p.km_final,
        hora_inicio: p.hora_inicio || null, tipo: p.tipo || 'circulacion',
        vehiculo_nombre: v ? v.nombre : null, profesor_nombre: prof ? prof.nombre : null,
      };
    });
    out.push({ fecha: arr[0].fecha, km_inicial: arr[0].km_inicial, km_final: arr[0].km_final, practicas });
  }
  out.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return out;
}

/**
 * Borra en bloque varias prácticas por id (mismo criterio que deletePractica:
 * borra local + soft-delete remoto vía markDeleted). Devuelve nº borradas.
 */
function deletePracticasBulk(ids) {
  const d = load();
  const set = new Set((ids || []).map(x => parseInt(x)));
  if (!set.size) return 0;
  const borradas = d.practicas.filter(p => set.has(p.id)).map(p => p.id);
  d.practicas = d.practicas.filter(p => !set.has(p.id));
  save();
  const s = _sync();
  if (s) borradas.forEach(id => s.markDeleted('practicas', id));
  return borradas.length;
}

module.exports = {
  getPracticasByAlumno, getUltimaPractica, addPractica, deletePractica, updatePractica, getTodasPracticas, getPracticaDetalle,
  getAlumnosPorVehiculo, registrarPracticasMasivas, eliminarPracticaPorFecha, ajustarPracticasAlumno, guardarNotaAlumno, setNotaPractica,
  getFichaPracticasAlumno, getDatosFichaDGT, getPracticasDuplicadas, deletePracticasBulk,
};
