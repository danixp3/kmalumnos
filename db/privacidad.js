// ─── PRIVACIDAD: CONSERVACIÓN Y SUPRESIÓN (RGPD) ────────────────────────────
// Derecho de supresión y plazos de conservación. Anonimizar a un alumno quita
// todo lo que lo identifica (nombre, apellidos, DNI, contacto, domicilio,
// nacimiento, tutor, facturación, observaciones, firmas de sus clases, notas)
// y conserva lo que no identifica a nadie y la autoescuela necesita para sus
// números (clases, km, fechas, permiso, importes). Se sincroniza: en la nube y
// en los demás PCs queda igual de anonimizado.
//
// Plazos de referencia (los decide la autoescuela, responsable del tratamiento):
//   libro de alumnos 4 años (art. 39 RD 1295/2003), fichas de formación al
//   menos 2 años (art. 40), documentación contable y facturas 6 años (art. 30
//   Código de Comercio). Por eso se proponen 6 años sin actividad.

const { load, save, addLog, _sync, hoyLocalISO } = require('./core');

const ESTADOS_TERMINADO = ['baja', 'aprobado', 'apto', 'no_apto', 'inactivo'];
const PREFIJO_ANONIMO = 'Alumno anonimizado';
const ANIOS_CONSERVACION_DEFECTO = 6;

// Campos del alumno que lo identifican (se vacían). n_registro se conserva:
// no identifica por sí solo y mantiene la numeración del libro de registro.
const CAMPOS_IDENTIFICATIVOS = [
  'primer_apellido', 'segundo_apellido', 'dni', 'email', 'telefono', 'telefono2', 'direccion', 'codigo_postal',
  'poblacion', 'municipio', 'provincia', 'fecha_nacimiento', 'lugar_nacimiento', 'nacionalidad', 'sexo',
  'dni_caducidad', 'tutor_nombre', 'tutor_dni', 'factura_nombre', 'factura_nif', 'factura_direccion',
  'observaciones', 'restricciones', 'centro_medico', 'n_solicitud', 'permisos_posee'
];

const esAnonimo = a => !!a && (!!a.anonimizado_en || String(a.nombre || '').startsWith(PREFIJO_ANONIMO));
const nombreCompletoDe = a => [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ').trim();

// Última fecha con algo de ese alumno (clases, pagos, cargos, exámenes, fin de la enseñanza o alta)
function ultimaActividad(d, a) {
  let ult = [a.fecha_fin, a.fecha_alta].filter(Boolean).sort().pop() || '';
  const mirar = (lista, campo) => { for (const x of lista || []) if (!x.deleted && x.alumno_id === a.id && x[campo] && x[campo] > ult) ult = x[campo]; };
  mirar(d.practicas, 'fecha'); mirar(d.pagos, 'fecha'); mirar(d.cargos, 'fecha'); mirar(d.presentaciones, 'fecha'); mirar(d.reservas, 'fecha');
  return ult ? String(ult).slice(0, 10) : '';
}

function restarAnios(iso, anios) {
  const [y, m, dd] = iso.split('-').map(Number);
  const f = new Date(y - anios, m - 1, dd);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

/**
 * Alumnos que han terminado y llevan más de `anios` sin actividad: candidatos a
 * anonimizar porque ya pasó el plazo de conservación. Solo lectura.
 */
function getAlumnosParaSuprimir(anios = ANIOS_CONSERVACION_DEFECTO, hoy = hoyLocalISO()) {
  const d = load();
  const n = Math.max(1, Math.min(30, parseInt(anios) || ANIOS_CONSERVACION_DEFECTO));
  const limite = restarAnios(hoy, n);
  return (d.alumnos || [])
    .filter(a => !a.deleted && !esAnonimo(a))
    .map(a => ({ a, ult: ultimaActividad(d, a) }))
    .filter(({ a, ult }) => (ESTADOS_TERMINADO.includes(a.estado) || a.resultado) && ult && ult < limite)
    .sort((x, y) => x.ult.localeCompare(y.ult))
    .map(({ a, ult }) => ({ id: a.id, nombre: nombreCompletoDe(a), n_registro: a.n_registro || null, estado: a.estado || null, ultima_actividad: ult }));
}

/**
 * Anonimiza alumnos (derecho de supresión o fin del plazo de conservación).
 * No se puede deshacer. Devuelve { anonimizados, practicas, ids }.
 */
function anonimizarAlumnos(ids, motivo = 'supresion') {
  const d = load();
  const lista = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Number.isInteger);
  const s = _sync();
  const hechos = [];
  const tocadas = { practicas: [], pagos: [], cargos: [], reservas: [] };
  const nombresViejos = [];
  const ahora = new Date().toISOString();
  for (const id of lista) {
    const a = (d.alumnos || []).find(x => x.id === id && !x.deleted);
    if (!a || esAnonimo(a)) continue;
    const viejo = nombreCompletoDe(a);
    if (viejo) nombresViejos.push(viejo);
    if (a.dni) nombresViejos.push(a.dni);
    a.nombre = `${PREFIJO_ANONIMO} ${a.n_registro ? 'nº ' + a.n_registro : a.id}`;
    for (const c of CAMPOS_IDENTIFICATIVOS) if (c in a) a[c] = c === 'permisos_posee' ? '' : null;
    a.anonimizado_en = ahora;
    a.updated_at = ahora;
    hechos.push(a.id);
    // Sus clases: sin firma ni observaciones (las firmas también se borran en la nube)
    for (const p of d.practicas || []) {
      if (p.alumno_id !== id || p.deleted) continue;
      if (p.firma || p.nota) { p.firma = null; p.firma_borrar = true; p.nota = ''; p.updated_at = ahora; tocadas.practicas.push(p.id); }
    }
    for (const [tabla, campo] of [['pagos', 'nota'], ['cargos', 'nota'], ['reservas', 'nota']]) {
      for (const x of d[tabla] || []) {
        if (x.alumno_id === id && !x.deleted && x[campo]) { x[campo] = ''; x.updated_at = ahora; tocadas[tabla].push(x.id); }
      }
    }
    // Solo locales (no viajan a la nube)
    for (const tabla of ['bonos', 'presentaciones', 'tasas']) {
      for (const x of d[tabla] || []) if (x.alumno_id === id && x.nota) x.nota = '';
    }
    for (const v of d.vencimientos || []) if (v.entidad_tipo === 'alumno' && v.entidad_id === id) { v.descripcion = ''; v.nota = ''; }
    for (const l of d.leads || []) if (l.alumno_id === id) { l.nombre = a.nombre; l.telefono = ''; l.email = ''; l.notas = ''; }
  }
  if (!hechos.length) return { anonimizados: 0, practicas: 0, ids: [] };
  // El historial de cambios no debe seguir nombrándolos
  const escapar = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quitar = nombresViejos.filter(t => t && t.length >= 3).map(t => new RegExp(escapar(t), 'gi'));
  const limpiar = t => quitar.reduce((x, re) => x.replace(re, '[alumno anonimizado]'), String(t));
  for (const l of d.logs || []) {
    if (typeof l.descripcion === 'string') l.descripcion = limpiar(l.descripcion);
    if (Array.isArray(l.detalles)) l.detalles = l.detalles.map(x => (typeof x === 'string' ? limpiar(x) : x));
  }
  addLog('privacidad', `${hechos.length} ${hechos.length === 1 ? 'alumno anonimizado' : 'alumnos anonimizados'} (${motivo === 'plazo' ? 'fin del plazo de conservación' : 'derecho de supresión'})`, hechos.map(id => `Alumno ${id}`));
  save();
  if (s) {
    s.markDirtyVarios('alumnos', hechos);
    for (const [tabla, idsT] of Object.entries(tocadas)) if (idsT.length) s.markDirtyVarios(tabla, idsT);
  }
  return { anonimizados: hechos.length, practicas: tocadas.practicas.length, ids: hechos };
}

module.exports = { getAlumnosParaSuprimir, anonimizarAlumnos, ANIOS_CONSERVACION_DEFECTO, esAlumnoAnonimizado: esAnonimo };
