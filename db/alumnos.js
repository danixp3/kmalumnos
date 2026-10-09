// ─── ALUMNOS ─────────────────────────────────────────────────────────────────
// CRUD de alumnos y anotaciones de alumno (notas guardadas en sus prácticas).

const { load, save, nextId, _sync, filtrarPorSucursal, esPracticaEnCurso, esPracticaSinCerrar, clasesDePractica, alumnoTerminado, hoyLocalISO, addLog, nombreCorto } = require('./core');
const { extraerCamposExtra, camposExtraVacios, siguienteNRegistro, alumnoConNRegistro, vehiculoSirveParaAlumno } = require('./campos-extra');
const { normalizarProcedencia } = require('./procedencia');

// sucursalId opcional: sin argumento devuelve todos los alumnos (modo clásico
// o "Todas las sucursales") — ver filtrarPorSucursal en core.js.
function getAlumnos(sucursalId) {
  const d = load();
  return filtrarPorSucursal(d.alumnos, sucursalId)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map(a => {
      const v = d.vehiculos.find(x => x.id === a.vehiculo_id);
      const prof = d.profesores.find(x => x.id === a.profesor_id);
      // Un coche que no sirve para su permiso (p. ej. el de B con un alumno de moto) no se enseña como suyo
      const incompatible = !!v && vehiculoSirveParaAlumno(v, a) === 'no';
      return { ...a, vehiculo_nombre: v && !incompatible ? v.nombre : null, vehiculo_incompatible: incompatible, vehiculo_retirado: !!v && v.activo === false, profesor_nombre: prof ? prof.nombre : null };
    });
}

// ─── LISTA DE ALUMNOS ENRIQUECIDA (pantalla Alumnos del rediseño) ───────────
// Una sola pasada por prácticas/reservas/presentaciones/bonos para pintar la
// tabla completa sin llamadas por alumno: nº de prácticas, km totales, última
// práctica, próxima clase (reserva futura), próximo examen (presentación
// pendiente), estado del bono activo y si está en clase ahora mismo (práctica
// de hoy empezada y sin cerrar, ver esPracticaEnCurso). Es un superconjunto de getAlumnos. Solo
// lectura, no marca sync.
function getAlumnosLista(sucursalId, hoy) {
  const d = load();
  const pad = n => String(n).padStart(2, '0');
  if (!hoy) {
    const now = new Date();
    hoy = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  const veh = new Map(d.vehiculos.map(v => [v.id, v]));
  const porAlumno = new Map();
  for (const p of d.practicas) {
    if (p.deleted) continue;
    if (!porAlumno.has(p.alumno_id)) porAlumno.set(p.alumno_id, []);
    porAlumno.get(p.alumno_id).push(p);
  }
  const reservasPorAlumno = new Map();
  for (const r of (d.reservas || [])) {
    if (r.deleted || !['solicitada', 'confirmada'].includes(r.estado) || !r.fecha || r.fecha < hoy) continue;
    if (!reservasPorAlumno.has(r.alumno_id)) reservasPorAlumno.set(r.alumno_id, []);
    reservasPorAlumno.get(r.alumno_id).push(r);
  }
  const examenPorAlumno = new Map();
  for (const x of (d.presentaciones || [])) {
    if (x.deleted || x.resultado !== 'pendiente' || !x.fecha || x.fecha < hoy) continue;
    const prev = examenPorAlumno.get(x.alumno_id);
    if (!prev || x.fecha < prev.fecha) examenPorAlumno.set(x.alumno_id, x);
  }
  const bonoPorAlumno = new Map();
  for (const b of (d.bonos || [])) {
    if (b.deleted || b.estado !== 'activo') continue;
    if (b.fecha_caducidad && b.fecha_caducidad < hoy) continue;
    if (!bonoPorAlumno.has(b.alumno_id)) bonoPorAlumno.set(b.alumno_id, b);
  }

  return getAlumnos(sucursalId).map(a => {
    const prs = porAlumno.get(a.id) || [];
    const hechas = prs.filter(p => !esPracticaEnCurso(p, hoy));
    const km = hechas.reduce((s, p) => s + (p.km_inicial === 0 && p.km_final === 0 ? 0 : Math.max(0, (p.km_final || 0) - (p.km_inicial || 0))), 0);
    const ultima = hechas.slice().sort((x, y) => (y.fecha || '').localeCompare(x.fecha || '') || (y.hora_inicio || '').localeCompare(x.hora_inicio || '') || y.id - x.id)[0];
    const prox = (reservasPorAlumno.get(a.id) || []).slice().sort((x, y) => (x.fecha + (x.hora_inicio || '')).localeCompare(y.fecha + (y.hora_inicio || '')))[0];
    const ex = examenPorAlumno.get(a.id);
    const bono = bonoPorAlumno.get(a.id);
    const v = veh.get(a.vehiculo_id);
    // Punto de partida: lo hecho antes de usar la app suma a los totales.
    const previas = a.clases_previas > 0 ? a.clases_previas : 0;
    const kmPrevios = a.km_previos > 0 ? a.km_previos : 0;
    // Las fracciones de clase (¼ ½ ¾, del móvil) suman lo que valen
    const clasesApp = hechas.reduce((n, p) => n + clasesDePractica(p), 0);
    return {
      ...a,
      vehiculo_matricula: v && !a.vehiculo_incompatible ? v.matricula || null : null,
      num_practicas: clasesApp + previas,
      km_total: Math.round(km) + kmPrevios,
      num_practicas_app: clasesApp,
      km_app: Math.round(km),
      clases_previas: previas,
      km_previos: kmPrevios,
      ultima_fecha: ultima ? ultima.fecha : null,
      ultima_hora: ultima ? ultima.hora_inicio || null : null,
      proxima_clase: prox ? { fecha: prox.fecha, hora_inicio: prox.hora_inicio || null } : null,
      proximo_examen: ex ? { fecha: ex.fecha, tipo: ex.tipo } : null,
      bono: bono ? { usadas: bono.n_usadas, total: bono.n_clases, saldo: bono.n_clases - bono.n_usadas, nombre: bono.nombre || '' } : null,
      en_clase_ahora: prs.some(p => esPracticaEnCurso(p, hoy))
    };
  });
}

// ─── FICHA DEL ALUMNO (pantalla de detalle del rediseño) ────────────────────
// Todo lo que pinta la ficha en UNA llamada: los datos de la fila de la lista
// (getAlumnosLista) + historial de prácticas numerado, días con clase (hechas,
// programadas y exámenes), próximas clases, observaciones del profesor (las
// notas de las prácticas) y lo que se ha trabajado (si las prácticas lo
// registran). Solo lectura, no marca sync. Devuelve null si el alumno no existe.
function getFichaAlumno(alumno_id, hoy) {
  const d = load();
  const aid = parseInt(alumno_id);
  const pad = n => String(n).padStart(2, '0');
  if (!hoy) {
    const now = new Date();
    hoy = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  const base = getAlumnosLista(undefined, hoy).find(a => a.id === aid);
  if (!base) return null;
  const veh = new Map(d.vehiculos.map(v => [v.id, v]));
  const prof = new Map(d.profesores.map(x => [x.id, x]));

  const propias = d.practicas
    .filter(p => p.alumno_id === aid && !p.deleted)
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.hora_inicio || '').localeCompare(b.hora_inicio || '') || a.id - b.id);
  // La numeración continúa tras las clases hechas antes de usar la app.
  // Las fracciones (¼ ½ ¾) y unas «clases antes de la app» con fracción suman lo
  // que valen: tras 12 ½ + 1 la siguiente es la 14.ª (igual que el móvil)
  const previas = base.clases_previas || 0;
  let llevadas = previas;
  const practicas = propias.map((p, i) => {
    llevadas += clasesDePractica(p);
    const v = veh.get(p.vehiculo_id);
    const sinKm = p.km_inicial === 0 && p.km_final === 0;
    const enCurso = esPracticaEnCurso(p, hoy);
    const sinCerrar = esPracticaSinCerrar(p, hoy);
    return {
      id: p.id, n: Math.ceil(llevadas - 1e-9), fecha: p.fecha, hora_inicio: p.hora_inicio || null,
      vehiculo_id: p.vehiculo_id, vehiculo_nombre: v ? v.nombre : null, matricula: v ? v.matricula || null : null,
      km_inicial: p.km_inicial, km_final: p.km_final,
      km: (sinKm || enCurso || sinCerrar) ? 0 : Math.max(0, p.km_final - p.km_inicial),
      sinKm, enCurso, sinCerrar,
      tipo: p.tipo || 'circulacion',
      profesor_id: p.profesor_id != null ? p.profesor_id : null,
      profesor_nombre: p.profesor_id != null && prof.get(p.profesor_id) ? prof.get(p.profesor_id).nombre : null,
      nota: p.nota || '',
      firmada: !!p.firma,
      zonas: Array.isArray(p.zonas) ? p.zonas : [],
      hora_fin: p.hora_fin || null,
      fraccion: p.fraccion > 0 && p.fraccion < 1 ? p.fraccion : null,
      procedencia: p.procedencia || null,
      tipo_detalle: p.tipo_detalle || null
    };
  });
  const hechas = practicas.filter(p => !p.enCurso);

  const reservasFuturas = (d.reservas || [])
    .filter(r => !r.deleted && r.alumno_id === aid && ['solicitada', 'confirmada'].includes(r.estado) && r.fecha && r.fecha >= hoy)
    .sort((a, b) => (a.fecha + (a.hora_inicio || '')).localeCompare(b.fecha + (b.hora_inicio || '')));
  const examenes = (d.presentaciones || [])
    .filter(x => !x.deleted && x.alumno_id === aid && x.resultado === 'pendiente' && x.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const trabajado = new Map();
  let practicasConTrabajado = 0;
  for (const p of propias) {
    if (Array.isArray(p.trabajado) && p.trabajado.length) {
      practicasConTrabajado++;
      for (const t of p.trabajado) trabajado.set(t, (trabajado.get(t) || 0) + 1);
    }
  }

  // Sus otros expedientes: la misma persona con otro permiso o curso, cada uno
  // con su nº (como en el programa anterior). Por DNI; sin DNI, por el nombre
  // completo si ninguno tiene otro DNI.
  const dniDe = x => String(x.dni || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const claveDe = x => sinTildes([x.nombre, x.primer_apellido, x.segundo_apellido].filter(Boolean).join(' ')).replace(/[^a-z0-9ñ]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
  const miDni = dniDe(base), miClave = claveDe(base);
  const otros_expedientes = d.alumnos
    .filter(x => !x.deleted && x.id !== aid && (miDni ? dniDe(x) === miDni : (!dniDe(x) && miClave && claveDe(x) === miClave)))
    .sort((x, y) => String(y.fecha_alta || '').localeCompare(String(x.fecha_alta || '')))
    .map(x => ({ id: x.id, nombre: x.nombre, n_registro: x.n_registro || null, permiso: x.permiso, estado: x.estado || null, fecha_alta: x.fecha_alta || null, vehiculo_id: x.vehiculo_id || null }));

  // Profesores que le han dado clase (y desde/hasta cuándo): sale en su ficha cuando ha tenido más de uno
  const porProfesor = new Map();
  for (const p of propias) {
    const pid = p.profesor_id != null ? p.profesor_id : (base.profesor_id || null);
    if (!porProfesor.has(pid)) porProfesor.set(pid, { id: pid, clases: 0, desde: p.fecha, hasta: p.fecha });
    const g = porProfesor.get(pid);
    g.clases += clasesDePractica(p);
    if (p.fecha < g.desde) g.desde = p.fecha;
    if (p.fecha > g.hasta) g.hasta = p.fecha;
  }
  const profesores = [...porProfesor.values()]
    .map(g => ({ ...g, nombre: g.id != null && prof.get(g.id) ? prof.get(g.id).nombre : null, actual: g.id != null && g.id === base.profesor_id }))
    .sort((x, y) => (x.desde || '').localeCompare(y.desde || ''));

  return {
    alumno: base,
    profesores,
    otros_expedientes,
    metricas: {
      clases: hechas.reduce((n, p) => n + clasesDePractica(p), 0) + previas,
      km: Math.round(hechas.reduce((s, p) => s + p.km, 0)) + (base.km_previos || 0),
      clases_previas: previas,
      km_previos: base.km_previos || 0,
      mediaKm: hechas.filter(p => p.km > 0).length
        ? Math.round((hechas.reduce((s, p) => s + p.km, 0) / hechas.filter(p => p.km > 0).length) * 10) / 10 : 0
    },
    practicas,
    dias: {
      hechas: [...new Set(hechas.map(p => p.fecha))],
      programadas: [...new Set(reservasFuturas.map(r => r.fecha))],
      examenes: examenes.map(x => x.fecha)
    },
    proximasClases: reservasFuturas.slice(0, 5).map(r => ({
      id: r.id, fecha: r.fecha, hora_inicio: r.hora_inicio || null, duracion_min: r.duracion_min || null,
      estado: r.estado, nota: r.nota || ''
    })),
    proximoExamen: examenes.length ? {
      id: examenes[0].id, fecha: examenes[0].fecha, tipo: examenes[0].tipo,
      profesor: examenes[0].profesor_id != null && prof.get(examenes[0].profesor_id) ? prof.get(examenes[0].profesor_id).nombre : null
    } : null,
    observaciones: practicas.filter(p => p.nota.trim() !== '').slice(-4).reverse()
      .map(p => ({ practica_id: p.id, n: p.n, fecha: p.fecha, nota: p.nota })),
    trabajado: [...trabajado.entries()].map(([nombre, veces]) => ({ nombre, veces })).sort((a, b) => b.veces - a.veces),
    practicasConTrabajado
  };
}

// Campos "de ficha" ampliados (todos opcionales, texto libre salvo las dos
// fechas): teléfono, DNI/NIE, fecha de nacimiento, dirección, fecha de alta y
// observaciones. Se agrupan en un objeto `datos` como ÚLTIMO parámetro para no
// alargar más la firma posicional — igual criterio que el resto de campos ya
// opcionales de esta función. Si no se pasa `datos`, no cambia nada (compat).
// `estado` sigue el mismo patrón pero con valores cerrados (ver
// ESTADOS_ALUMNO_VALIDOS): cualquier otro valor (u omitido) se guarda como
// null y la UI lo trata como 'activo' por defecto.
// primer_apellido/segundo_apellido/codigo_postal/poblacion (tarea "Ficha
// alumno – formación práctica" DGT): añadidos al MISMO grupo y mecanismo que
// el resto de campos de ficha de arriba (normalización, sync gateado en
// db/alumnos.js). La sincronización, sin embargo, los trata como un grupo
// APARTE con su propia caché de disponibilidad en sync.js (ver comentario
// junto a _alumnosFichaDgtDisponible) porque las columnas de telefono/dni ya
// están aplicadas en producción y estas 4 aún no.
const CAMPOS_DATOS_ALUMNO = ['telefono', 'dni', 'fecha_nacimiento', 'direccion', 'fecha_alta', 'observaciones', 'estado', 'primer_apellido', 'segundo_apellido', 'codigo_postal', 'poblacion'];
// Ciclo de estados ampliado (tarea B1 del PLAN-MAESTRO): matriculado → en
// teórica → apto teórico → en prácticas → presentado a examen → apto/no apto,
// más 'baja' en cualquier punto. 'activo'/'aprobado' se conservan al final por
// retrocompatibilidad con alumnos ya guardados con esos valores (sync de
// `estado` no cambia: sigue siendo la misma columna gateada de siempre).
// 'inactivo' (2026-10-03): alumno antiguo que dejó de venir sin darse de baja
// (los «archivados» de Ariauto); no cuenta como en prácticas.
const ESTADOS_ALUMNO_VALIDOS = ['matriculado', 'en_teorica', 'apto_teorico', 'en_practicas', 'presentado', 'apto', 'no_apto', 'baja', 'inactivo', 'activo', 'aprobado'];

// Normaliza el objeto `datos`: trim de cada campo y vacío → null; `estado`
// además se valida contra ESTADOS_ALUMNO_VALIDOS (cualquier otro valor → null).
function _normalizarDatosAlumno(datos) {
  const out = {};
  for (const campo of CAMPOS_DATOS_ALUMNO) {
    const v = datos && datos[campo] != null ? String(datos[campo]).trim() : '';
    if (campo === 'estado') {
      out[campo] = ESTADOS_ALUMNO_VALIDOS.includes(v) ? v : null;
    } else {
      out[campo] = v || null;
    }
  }
  return out;
}

// Campos del "libro de registro de alumnos" (RD 1295/2003 art. 39): permisos
// que YA posee, fechas de inicio/fin de la enseñanza y resultado final.
// Grupo APARTE de CAMPOS_DATOS_ALUMNO para que su detección de migración en
// sync.js sea independiente (mismo criterio que separó "email" de "datos").
// n_inscripcion NO va aquí: se asigna con asignarNumInscripcion/backfillNumInscripcion,
// nunca a mano desde la ficha.
const CAMPOS_LIBRO_ALUMNO = ['permisos_posee', 'fecha_inicio', 'fecha_fin', 'resultado'];
const RESULTADOS_ALUMNO_VALIDOS = ['apto', 'no_apto', 'baja'];

// Normaliza el objeto `libro`: solo devuelve las claves PRESENTES en `libro`
// (para no pisar con null lo no enviado en updates parciales); trim→null para
// los 3 de texto/fecha, y `resultado` se valida contra RESULTADOS_ALUMNO_VALIDOS
// (cualquier otro valor → null). Mismo criterio que _normalizarDatosAlumno.
function _normalizarLibroAlumno(datos) {
  const out = {};
  if (!datos) return out;
  for (const campo of CAMPOS_LIBRO_ALUMNO) {
    if (!(campo in datos)) continue;
    const v = datos[campo] != null ? String(datos[campo]).trim() : '';
    if (campo === 'resultado') {
      out[campo] = RESULTADOS_ALUMNO_VALIDOS.includes(v) ? v : null;
    } else {
      out[campo] = v || null;
    }
  }
  return out;
}

// Permisos múltiples (tarea B1 del PLAN-MAESTRO): campo NUEVO `permisos`
// (array) para los DEMÁS permisos que cursa el alumno, aparte del `permiso`
// principal (string, intacto, sigue rigiendo tarifas/pagos en db/pagos.js).
const PERMISOS_VALIDOS = ['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C1', 'C', 'D1', 'D', 'CAP', 'ADR'];

// Acepta array o null/undefined → array de códigos válidos: filtra contra el
// catálogo, quita duplicados, en mayúsculas y recortados. null/undefined → [].
function _normalizarPermisos(permisos) {
  if (!Array.isArray(permisos)) return [];
  const set = new Set();
  for (const p of permisos) {
    const codigo = String(p || '').trim().toUpperCase();
    if (PERMISOS_VALIDOS.includes(codigo)) set.add(codigo);
  }
  return [...set];
}

function addAlumno(nombre, permiso, vehiculo_id, profesor_id = null, sucursal_id = null, email = null, datos = null, libro = null, permisos = null) {
  const d = load();
  // Nº de registro: si no viene (ni vacío a propósito), el siguiente de la
  // numeración que ya haya (db/campos-extra.js → siguienteNRegistro)
  if (!datos || !('n_registro' in datos)) {
    const n = siguienteNRegistro(d.alumnos);
    if (n) datos = { ...(datos || {}), n_registro: n };
  }
  const id = nextId('a');
  d.alumnos.push({
    id, nombre, permiso: permiso || 'B', vehiculo_id: vehiculo_id ? parseInt(vehiculo_id) : null,
    profesor_id: profesor_id ? parseInt(profesor_id) : null,
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null,
    email: email ? String(email).trim() : null,
    n_inscripcion: null,
    ..._normalizarDatosAlumno(datos),
    // Campos ampliados (nº de registro, sexo, nacionalidad...): db/campos-extra.js
    ...camposExtraVacios('alumnos'),
    ...extraerCamposExtra('alumnos', datos),
    // En el alta se normalizan las 4 claves del libro siempre (aunque vengan
    // vacías/undefined), a diferencia de update donde solo se tocan las
    // claves presentes: así un alumno nuevo siempre arranca con las 4 en null.
    ..._normalizarLibroAlumno({ permisos_posee: null, fecha_inicio: null, fecha_fin: null, resultado: null, ...(libro || {}) }),
    permisos: _normalizarPermisos(permisos)
  });
  save();
  const s = _sync(); if (s) s.markDirty('alumnos', id);
  return id;
}

function deleteAlumno(id) {
  const d = load();
  // Encolar también el borrado de sus prácticas en la nube: si no, quedan
  // "vivas" en Supabase y reaparecen al reconstruir otro PC.
  const practicasDelAlumno = d.practicas.filter(x => x.alumno_id === id).map(x => x.id);
  d.alumnos   = d.alumnos.filter(x => x.id !== id);
  d.practicas = d.practicas.filter(x => x.alumno_id !== id);
  save();
  const s = _sync();
  if (s) {
    s.markDeletedVarios('practicas', practicasDelAlumno);
    s.markDeleted('alumnos', id);
  }
}

function updateAlumno(id, nombre, permiso, vehiculo_id, profesor_id = null, email = null, datos = null, libro = null, permisos = null) {
  const d = load();
  const a = d.alumnos.find(x => x.id === id);
  if (a) {
    a.nombre = nombre;
    a.permiso = permiso;
    a.vehiculo_id = vehiculo_id ? parseInt(vehiculo_id) : null;
    a.profesor_id = profesor_id ? parseInt(profesor_id) : null;
    a.email = email ? String(email).trim() : null;
    // Solo los campos que llegan: un `datos` parcial ya no deja en blanco el
    // resto de la ficha (DNI, apellidos, teléfono…), que antes se borraba
    if (datos) {
      const norm = _normalizarDatosAlumno(datos);
      for (const c of CAMPOS_DATOS_ALUMNO) if (c in datos) a[c] = norm[c];
      Object.assign(a, extraerCamposExtra('alumnos', datos));
    }
    if (libro) Object.assign(a, _normalizarLibroAlumno(libro));
    if (permisos !== null) a.permisos = _normalizarPermisos(permisos);
    save();
    const s = _sync(); if (s) s.markDirty('alumnos', id);
  }
}

// ─── Nº DE REGISTRO ─────────────────────────────────────────────────────────
// El siguiente número libre (para proponerlo en el alta) y quién tiene ya un
// número (para avisar de repetidos al guardar). Solo lectura.
function getSiguienteNRegistro() {
  return siguienteNRegistro(load().alumnos);
}
function getAlumnoConNRegistro(n, exceptoId = null) {
  const a = alumnoConNRegistro(load().alumnos, n, exceptoId != null ? parseInt(exceptoId) : null);
  return a ? { id: a.id, nombre: [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' '), estado: a.estado || null } : null;
}

// ─── BUSCADOR DE LA BARRA SUPERIOR ──────────────────────────────────────────
// Alumnos por nombre y apellidos, DNI, nº de registro o teléfono (todas las
// palabras, sin tildes). Primero los que están en curso y los que empiezan
// por lo escrito. Pocos resultados: es para saltar a una ficha.
const sinTildes = t => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const ESTADOS_TERMINADO = ['baja', 'aprobado', 'apto', 'no_apto', 'inactivo'];
function buscarAlumnosRapido(texto, limite = 6) {
  const q = sinTildes(texto).trim();
  if (q.length < 2) return [];
  const palabras = q.split(/\s+/);
  const digitos = q.replace(/\D/g, '');
  const res = [];
  for (const a of load().alumnos) {
    if (a.deleted) continue;
    const nombre = [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ');
    const pajar = sinTildes([nombre, a.dni, a.n_registro, a.telefono, a.telefono2].filter(Boolean).join(' '));
    const telefonos = [a.telefono, a.telefono2].filter(Boolean).join(' ').replace(/\D/g, '');
    if (!palabras.every(w => pajar.includes(w)) && !(digitos.length >= 6 && telefonos.includes(digitos))) continue;
    const enCurso = !ESTADOS_TERMINADO.includes(a.estado);
    const exacto = String(a.n_registro || '') === texto.trim() || sinTildes(a.dni) === q;
    res.push({ a, nombre, puntos: (exacto ? 4 : 0) + (enCurso ? 2 : 0) + (sinTildes(nombre).startsWith(q) ? 1 : 0) });
  }
  return res.sort((x, y) => y.puntos - x.puntos || x.nombre.localeCompare(y.nombre, 'es')).slice(0, limite)
    .map(({ a, nombre }) => ({ id: a.id, nombre, n_registro: a.n_registro || null, dni: a.dni || null, estado: a.estado || null, vehiculo_id: a.vehiculo_id || null, permiso: a.permiso }));
}

// ─── EDICIÓN DESDE LA FICHA ─────────────────────────────────────────────────
// Cambia solo los campos que llegan (la ficha edita en el sitio, sin el modal
// que pedía todos los datos). Devuelve { ok, alumno } o { ok:false, error }.
const CAMPOS_BASE_EDITABLES = ['nombre', 'permiso', 'vehiculo_id', 'profesor_id', 'email'];
function updateAlumnoCampos(id, campos = {}) {
  const d = load();
  const a = d.alumnos.find(x => x.id === parseInt(id));
  if (!a) return { ok: false, error: 'No se encuentra el alumno.' };
  if ('nombre' in campos && !String(campos.nombre || '').trim()) return { ok: false, error: 'El nombre no puede quedar vacío.' };
  const cambios = {};
  for (const c of CAMPOS_BASE_EDITABLES) {
    if (!(c in campos)) continue;
    const v = campos[c];
    if (c === 'vehiculo_id' || c === 'profesor_id') cambios[c] = v ? parseInt(v) || null : null;
    else if (c === 'permiso') cambios[c] = String(v || '').trim().toUpperCase() || a.permiso || 'B';
    else cambios[c] = String(v == null ? '' : v).trim() || (c === 'nombre' ? a.nombre : null);
  }
  const datos = {};
  for (const c of CAMPOS_DATOS_ALUMNO) if (c in campos) datos[c] = campos[c];
  if (Object.keys(datos).length) {
    const norm = _normalizarDatosAlumno(datos);
    for (const c of Object.keys(datos)) cambios[c] = norm[c];
  }
  Object.assign(cambios, _normalizarLibroAlumno(campos), extraerCamposExtra('alumnos', campos));
  if ('permisos' in campos) cambios.permisos = _normalizarPermisos(campos.permisos);
  // Procedencia (programa del que se trajo; vacío = creado en AulaMovil), a mano desde la ficha
  if ('procedencia' in campos) cambios.procedencia = normalizarProcedencia(campos.procedencia);
  Object.assign(a, cambios);
  save();
  const s = _sync(); if (s) s.markDirty('alumnos', a.id);
  return { ok: true, alumno: { ...a } };
}

/**
 * Devuelve todas las anotaciones de un alumno (prácticas que tienen nota).
 * Cada entrada incluye fecha, vehículo y texto de la nota.
 */
function getAnotacionesAlumno(alumno_id) {
  const d = load();
  const aid = parseInt(alumno_id);
  return d.practicas
    .filter(p => p.alumno_id === aid && p.nota && p.nota.trim() !== '')
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    .map(p => {
      const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
      return {
        id: p.id,
        fecha: p.fecha,
        vehiculo_nombre: v ? v.nombre : '?',
        nota: p.nota
      };
    });
}

// ─── LIBRO DE REGISTRO DE ALUMNOS (RD 1295/2003 art. 39) ──────────────────
// Siguiente nº de inscripción a asignar: max(n_inscripcion) + 1 de TODOS los
// alumnos (sin filtrar por sucursal — el libro es único para toda la
// autoescuela), o 1 si ninguno tiene número todavía.
function getSiguienteNumInscripcion() {
  const d = load();
  const max = d.alumnos.reduce((m, a) => a.n_inscripcion != null && a.n_inscripcion > m ? a.n_inscripcion : m, 0);
  return max + 1;
}

// Idempotente: si el alumno ya tiene n_inscripcion, lo devuelve tal cual sin
// tocar nada; si no, le asigna el siguiente número disponible y guarda.
function asignarNumInscripcion(id) {
  const d = load();
  const a = d.alumnos.find(x => x.id === id);
  if (!a) return null;
  if (a.n_inscripcion != null) return a.n_inscripcion;
  const n = getSiguienteNumInscripcion();
  a.n_inscripcion = n;
  save();
  const s = _sync(); if (s) s.markDirty('alumnos', id);
  return n;
}

// Numera de una vez a todos los alumnos que aún no tienen n_inscripcion,
// ordenados por (fecha_alta || fecha_inicio || '9999-99-99') asc y luego id
// asc, empezando en getSiguienteNumInscripcion(). Una sola save() al final
// (operación masiva) pero markDirty por cada alumno tocado (misma trampa nº 1
// del proyecto: toda mutación marca sync, también las masivas).
function backfillNumInscripcion() {
  const d = load();
  const pendientes = d.alumnos
    .filter(a => a.n_inscripcion == null)
    .sort((a, b) => {
      const fa = a.fecha_alta || a.fecha_inicio || '9999-99-99';
      const fb = b.fecha_alta || b.fecha_inicio || '9999-99-99';
      return fa.localeCompare(fb) || a.id - b.id;
    });
  if (!pendientes.length) return 0;
  let n = getSiguienteNumInscripcion();
  const s = _sync();
  for (const a of pendientes) {
    a.n_inscripcion = n++;
    if (s) s.markDirty('alumnos', a.id);
  }
  save();
  return pendientes.length;
}

// Devuelve el libro de registro: alumnos filtrados por sucursal (igual que
// getAlumnos) ordenados por n_inscripcion asc (los que no tienen número van
// al final, ordenados por nombre), en el formato plano que exige la tabla
// imprimible del art. 39.
function getLibroRegistro(sucursalId) {
  const d = load();
  return filtrarPorSucursal(d.alumnos, sucursalId)
    .slice()
    .sort((a, b) => {
      if (a.n_inscripcion == null && b.n_inscripcion == null) return a.nombre.localeCompare(b.nombre);
      if (a.n_inscripcion == null) return 1;
      if (b.n_inscripcion == null) return -1;
      return a.n_inscripcion - b.n_inscripcion;
    })
    .map(a => ({
      n_inscripcion: a.n_inscripcion,
      n_registro: a.n_registro || null,
      nombre: [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' '),
      dni: a.dni || null,
      fecha_nacimiento: a.fecha_nacimiento || null,
      permisos_posee: a.permisos_posee || null,
      permiso: a.permiso,
      fecha_alta: a.fecha_alta || null,
      fecha_inicio: a.fecha_inicio || null,
      fecha_fin: a.fecha_fin || null,
      resultado: a.resultado || null,
      estado: a.estado || null,
    }));
}

// ─── ESTADO DE LOS ALUMNOS (en bloque) Y ALUMNOS ANTIGUOS ──────────────────
// Un alumno que dejó de venir sin terminar el permiso (o que ya terminó) pasa a
// «inactivo»/«baja»/«apto»…: desde entonces no sale en avisos, semáforos,
// caducidades ni en la lista de quién viene hoy (core.alumnoTerminado).

// Cambia el estado de varios alumnos de una vez (una sola escritura y un solo
// aviso a la nube). Devuelve lo que había antes para poder deshacerlo.
function setEstadoAlumnos(ids, estado) {
  const nuevo = String(estado || '').trim();
  if (!ESTADOS_ALUMNO_VALIDOS.includes(nuevo)) return { ok: false, error: 'Estado no válido.' };
  const d = load();
  const quiero = new Set((ids || []).map(x => parseInt(x)).filter(Number.isFinite));
  const anteriores = [];
  for (const a of d.alumnos) {
    if (!quiero.has(a.id) || a.deleted || (a.estado || null) === nuevo) continue;
    anteriores.push({ id: a.id, estado: a.estado || null });
    a.estado = nuevo;
  }
  if (!anteriores.length) return { ok: true, cambiados: 0, anteriores };
  addLog('alumnos', `Estado «${nuevo}» para ${anteriores.length} ${anteriores.length === 1 ? 'alumno' : 'alumnos'}`,
    anteriores.slice(0, 30).map(x => { const a = d.alumnos.find(y => y.id === x.id); return `${a ? nombreCorto(a) : x.id}: ${x.estado || 'sin estado'} → ${nuevo}`; }));
  save();
  const s = _sync(); if (s) s.markDirtyVarios('alumnos', anteriores.map(x => x.id));
  return { ok: true, cambiados: anteriores.length, anteriores };
}

// Deshace setEstadoAlumnos con lo que devolvió (`anteriores`).
function restaurarEstadosAlumnos(anteriores) {
  const d = load();
  const porId = new Map((anteriores || []).map(x => [parseInt(x.id), x.estado || null]));
  const tocados = [];
  for (const a of d.alumnos) {
    if (!porId.has(a.id)) continue;
    a.estado = porId.get(a.id);
    tocados.push(a.id);
  }
  if (!tocados.length) return { ok: true, cambiados: 0 };
  addLog('alumnos', `Estado deshecho en ${tocados.length} ${tocados.length === 1 ? 'alumno' : 'alumnos'}`, []);
  save();
  const s = _sync(); if (s) s.markDirtyVarios('alumnos', tocados);
  return { ok: true, cambiados: tocados.length };
}

function _restarMeses(iso, n) {
  const [y, m, dd] = String(iso).split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1 - n, 1));
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
  f.setUTCDate(Math.min(dd, ultimo));
  return f.toISOString().slice(0, 10);
}

/**
 * Alumnos «antiguos» que siguen figurando en curso: llevan más de `meses` meses
 * sin dar una clase (o, si nunca dieron, desde que se dieron de alta) y no tienen
 * una clase reservada ni un examen por delante. Son los que conviene pasar a
 * «inactivo». Solo lectura. `debe` = lo que deben todavía (no se tocan por
 * defecto en la pantalla).
 */
function proponerAlumnosInactivos({ meses = 6, hoy } = {}, sucursalId) {
  const d = load();
  const hoyIso = hoy || hoyLocalISO();
  const m = Math.max(1, parseInt(meses) || 6);
  const limite = _restarMeses(hoyIso, m);
  const ultimaDe = new Map(), clasesDe = new Map();
  for (const p of d.practicas) {
    if (p.deleted) continue;
    clasesDe.set(p.alumno_id, (clasesDe.get(p.alumno_id) || 0) + clasesDePractica(p));
    if (p.fecha && (!ultimaDe.get(p.alumno_id) || p.fecha > ultimaDe.get(p.alumno_id))) ultimaDe.set(p.alumno_id, p.fecha);
  }
  const conFuturo = new Set();
  for (const r of (d.reservas || [])) if (!r.deleted && ['solicitada', 'confirmada'].includes(r.estado) && r.fecha >= hoyIso) conFuturo.add(r.alumno_id);
  for (const x of (d.presentaciones || [])) if (!x.deleted && x.resultado === 'pendiente' && x.fecha >= hoyIso) conFuturo.add(x.alumno_id);
  const saldos = new Map();
  try { for (const f of require('./pagos').getDeudas(sucursalId)) saldos.set(f.alumno_id, f.saldo); } catch (e) { /* sin deudas: no se avisa de ellas */ }

  const filas = [];
  for (const a of filtrarPorSucursal(d.alumnos, sucursalId)) {
    if (a.deleted || alumnoTerminado(a) || conFuturo.has(a.id)) continue;
    const ultima = ultimaDe.get(a.id) || null;
    const referencia = ultima || a.fecha_alta || a.fecha_inicio || null;
    if (!referencia || referencia >= limite) continue; // sin ninguna fecha no se puede saber cuánto hace
    const clases = (clasesDe.get(a.id) || 0) + (a.clases_previas > 0 ? a.clases_previas : 0);
    filas.push({
      id: a.id, nombre: nombreCorto(a), permiso: a.permiso || 'B', n_registro: a.n_registro || null, estado: a.estado || null,
      ultima_fecha: ultima, fecha_alta: a.fecha_alta || null, clases,
      motivo: ultima ? 'ultima' : 'sin_clases',
      debe: Math.max(0, Math.round((saldos.get(a.id) || 0) * 100) / 100)
    });
  }
  // Los que más tiempo llevan sin venir, primero
  filas.sort((x, y) => (x.ultima_fecha || x.fecha_alta || '').localeCompare(y.ultima_fecha || y.fecha_alta || '') || x.nombre.localeCompare(y.nombre, 'es'));
  return { meses: m, desde: limite, total: filas.length, alumnos: filas };
}

// ─── CAMBIO DE PROFESOR ─────────────────────────────────────────────────────
// Un alumno que empezó con un profesor y sigue con otro (otro coche, otro turno…): lo ya dado
// se queda con quien lo dio y lo que viene es del nuevo. Cada clase guarda su profesor
// (`practica.profesor_id`); las que no lo tenían se atan ahora al profesor que había hasta la
// fecha del cambio (o al nuevo desde esa fecha), así un cambio posterior no las mueve. Con eso, la
// ficha oficial DGT sale una por profesor, cada una con los datos y la firma de quien dio esas clases.

/**
 * Pasa al alumno a `nuevo_profesor_id`. `fecha` (YYYY-MM-DD, por defecto hoy) = primer día con el nuevo
 * profesor; `vehiculo_id` (opcional) = su nuevo coche (null = sin asignar; sin pasarlo no se toca).
 * Devuelve { ok, anterior (para deshacer), antes, despues, conservadas, nuevas }.
 */
function cambiarProfesorAlumno(alumno_id, nuevo_profesor_id, { fecha, vehiculo_id } = {}) {
  const d = load();
  const a = d.alumnos.find(x => x.id === parseInt(alumno_id) && !x.deleted);
  if (!a) return { ok: false, error: 'No se encuentra el alumno.' };
  const nuevo = parseInt(nuevo_profesor_id) || null;
  if (!nuevo || !d.profesores.some(p => p.id === nuevo && !p.deleted)) return { ok: false, error: 'Elige el profesor nuevo.' };
  const antes = a.profesor_id || null;
  if (antes === nuevo) return { ok: false, error: 'Ese ya es su profesor.' };
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(fecha || '') ? fecha : hoyLocalISO();

  const tocadas = [];
  let conservadas = 0, nuevas = 0;
  for (const p of d.practicas) {
    if (p.alumno_id !== a.id || p.deleted || p.profesor_id) continue;
    const quien = (p.fecha || '') < desde ? antes : nuevo;
    if (!quien) continue; // sin profesor antes: no hay a quién atribuírselas
    p.profesor_id = quien; tocadas.push(p.id);
    if (quien === antes) conservadas++; else nuevas++;
  }
  const anterior = { alumno_id: a.id, profesor_id: antes, vehiculo_id: a.vehiculo_id || null, practicas: tocadas };
  a.profesor_id = nuevo;
  if (vehiculo_id !== undefined) a.vehiculo_id = vehiculo_id ? parseInt(vehiculo_id) : null;
  const nombreProf = id => { const p = d.profesores.find(x => x.id === id); return p ? p.nombre : 'sin profesor'; };
  addLog('alumnos', `Cambio de profesor: ${nombreCorto(a)} pasa de ${nombreProf(antes)} a ${nombreProf(nuevo)} desde ${desde}`,
    [`${conservadas} ${conservadas === 1 ? 'clase queda' : 'clases quedan'} con ${nombreProf(antes)}`, `${nuevas} ${nuevas === 1 ? 'clase pasa' : 'clases pasan'} a ${nombreProf(nuevo)}`]);
  save();
  const s = _sync();
  if (s) { s.markDirty('alumnos', a.id); if (tocadas.length) s.markDirtyVarios('practicas', tocadas); }
  return { ok: true, anterior, antes, despues: nuevo, desde, conservadas, nuevas };
}

// Deshace un cambio de profesor con lo que devolvió (`anterior`): vuelve el profesor (y el coche) del
// alumno y las clases atadas en el cambio quedan sin profesor propio otra vez.
function deshacerCambioProfesorAlumno(anterior) {
  const d = load();
  const a = anterior && d.alumnos.find(x => x.id === parseInt(anterior.alumno_id));
  if (!a) return { ok: false, error: 'No se encuentra el alumno.' };
  a.profesor_id = anterior.profesor_id || null;
  a.vehiculo_id = anterior.vehiculo_id || null;
  const ids = new Set((anterior.practicas || []).map(Number));
  const tocadas = [];
  for (const p of d.practicas) if (ids.has(p.id)) { p.profesor_id = null; tocadas.push(p.id); }
  addLog('alumnos', `Cambio de profesor deshecho: ${nombreCorto(a)}`, []);
  save();
  const s = _sync();
  if (s) { s.markDirty('alumnos', a.id); if (tocadas.length) s.markDirtyVarios('practicas', tocadas); }
  return { ok: true };
}

// ─── CLASES SIN FIRMA (enlace para que el alumno firme desde su móvil) ──────
// Las clases cerradas del alumno a las que falta su firma, para elegir cuáles
// van en el enlace de firma (sync.crearEnlaceFirma). `firmable`: con km final,
// o de pista sin km (la nube aplica la misma regla). `sugerida`: marcada por
// defecto; no lo están las «anteriores a la app» ni las traídas de otro
// programa (normalmente se firmaron en papel). Solo lectura.
function getClasesSinFirma(alumno_id, hoy) {
  const f = getFichaAlumno(alumno_id, hoy);
  if (!f) return null;
  const a = f.alumno;
  const clases = f.practicas
    .filter(p => !p.firmada && !p.enCurso && !p.sinCerrar)
    .map(p => {
      const firmable = p.km_final > 0 || (p.tipo === 'pista' && !(p.km_inicial > 0));
      const traida = p.tipo_detalle === 'anterior' || !!p.procedencia;
      return {
        id: p.id, n: p.n, fecha: p.fecha, hora_inicio: p.hora_inicio, hora_fin: p.hora_fin,
        km_inicial: p.km_inicial, km_final: p.km_final, km: p.km, tipo: p.tipo, fraccion: p.fraccion,
        matricula: p.matricula, vehiculo_nombre: p.vehiculo_nombre, profesor_nombre: p.profesor_nombre,
        procedencia: p.procedencia, anterior: p.tipo_detalle === 'anterior',
        firmable, sugerida: firmable && !traida
      };
    })
    .sort((x, y) => (y.fecha || '').localeCompare(x.fecha || '') || (y.hora_inicio || '').localeCompare(x.hora_inicio || '') || y.id - x.id);
  return {
    alumno: { id: a.id, nombre: a.nombre, primer_apellido: a.primer_apellido || '', telefono: a.telefono || '' },
    clases
  };
}

module.exports = {
  getClasesSinFirma,
  cambiarProfesorAlumno, deshacerCambioProfesorAlumno,
  setEstadoAlumnos, restaurarEstadosAlumnos, proponerAlumnosInactivos,
  getAlumnos, getAlumnosLista, getFichaAlumno, addAlumno, deleteAlumno, updateAlumno, updateAlumnoCampos, buscarAlumnosRapido,
  getAnotacionesAlumno,
  ESTADOS_ALUMNO_VALIDOS,
  RESULTADOS_ALUMNO_VALIDOS,
  PERMISOS_VALIDOS,
  getSiguienteNumInscripcion, asignarNumInscripcion, backfillNumInscripcion, getLibroRegistro,
  getSiguienteNRegistro, getAlumnoConNRegistro,
};
