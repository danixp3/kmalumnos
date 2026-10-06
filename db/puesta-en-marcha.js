/**
 * db/puesta-en-marcha.js  –  arranque con datos reales: una sola pantalla para
 * dejar bien puestos los vehículos (km real del cuentakilómetros), los
 * profesores y los alumnos con su PUNTO DE PARTIDA (clases y km que ya hicieron
 * antes de usar la app), más el borrado opcional de los datos de prueba.
 *
 * El punto de partida (alumno.clases_previas / alumno.km_previos) por sí solo
 * no crea prácticas: desplaza la numeración de clases y suma a los totales
 * (ficha, lista, semáforo de examen y la web del móvil). Si además se quieren
 * esas clases con fecha y km (ficha DGT), se anotan o se crean con
 * db/clases-anteriores.js, que va descontando de clases_previas.
 * En esta pantalla «Clases ya hechas» = clases_previas + las ya creadas.
 */

// ─── PUESTA EN MARCHA ────────────────────────────────────────────────────────

const { load, save, nextId, _sync, addLog, crearBackup } = require('./core');
const { contarClasesAnteriores } = require('./clases-anteriores');
const { leerCantidadClases, aCuartos, fmtClases } = require('./core');
const { siguienteNRegistro, alumnoConNRegistro } = require('./campos-extra');

// Los que ya terminaron no se listan aquí (tras traer los de otro programa
// serían cientos): esta pantalla es para los que están dando clase.
const TERMINADOS = ['baja', 'apto', 'aprobado', 'inactivo'];
const sinAcentos = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const claveNombre = (...partes) => sinAcentos(partes.filter(Boolean).join(' ')).replace(/[^a-z0-9ñ]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
const nombreCompleto = a => [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ');

const entero = (v, max = 2000000) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};
// Clases (de ¼ en ¼: 12, 12,5, «12 ½»…); 0 si no se entiende
const cuartos = (v, max = 500) => { const n = leerCantidadClases(v); return n ? Math.min(n, max) : 0; };
const texto = (v, max = 80) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const idONull = v => (v == null || v === '' || isNaN(parseInt(v)) ? null : parseInt(v));
const kmDe = p => (p.km_final > 0 && p.km_inicial >= 0 ? Math.max(0, p.km_final - p.km_inicial) : 0);

// Clases y km hechos antes de usar la app (ficha del alumno).
function setPuntoDePartidaAlumno(id, clases_previas, km_previos) {
  const d = load();
  const a = d.alumnos.find(x => x.id === parseInt(id));
  if (!a) return false;
  a.clases_previas = cuartos(clases_previas, 500);
  a.km_previos = entero(km_previos, 100000);
  save();
  const s = _sync(); if (s) s.markDirty('alumnos', a.id);
  return true;
}

// Todo lo que necesita la pantalla, en una llamada. Solo lectura.
function getPuestaEnMarcha() {
  const d = load();
  const practicas = d.practicas.filter(p => !p.deleted);
  const porVehiculo = new Map(), porAlumno = new Map();
  for (const p of practicas) {
    const v = porVehiculo.get(p.vehiculo_id) || { n: 0, maxKm: 0 };
    v.n++; v.maxKm = Math.max(v.maxKm, p.km_final || 0, p.km_inicial || 0);
    porVehiculo.set(p.vehiculo_id, v);
    const a = porAlumno.get(p.alumno_id) || { n: 0, km: 0 };
    a.n++; a.km += kmDe(p);
    porAlumno.set(p.alumno_id, a);
  }
  const anteriores = contarClasesAnteriores(d);
  const vehiculos = d.vehiculos.filter(v => !v.deleted).map(v => ({
    id: v.id, nombre: v.nombre, matricula: v.matricula || '', km_actual: Math.round(v.km_actual || 0),
    practicas: (porVehiculo.get(v.id) || {}).n || 0, km_max_practicas: (porVehiculo.get(v.id) || {}).maxKm || 0
  })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const profesores = d.profesores.filter(p => !p.deleted).map(p => ({ id: p.id, nombre: p.nombre, vehiculo_id: p.vehiculo_id || null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const vivos = d.alumnos.filter(a => !a.deleted);
  const alumnos = vivos.filter(a => !TERMINADOS.includes(a.estado)).map(a => ({
    id: a.id, n_registro: a.n_registro || '', nombre: a.nombre || '', primer_apellido: a.primer_apellido || '', segundo_apellido: a.segundo_apellido || '',
    permiso: a.permiso || 'B', profesor_id: a.profesor_id || null, vehiculo_id: a.vehiculo_id || null,
    clases_previas: a.clases_previas || 0, km_previos: a.km_previos || 0,
    anteriores: anteriores.get(a.id) || 0,
    practicas: (porAlumno.get(a.id) || {}).n || 0, km_practicas: Math.round((porAlumno.get(a.id) || {}).km || 0)
  })).sort((a, b) => (a.nombre + ' ' + a.primer_apellido).localeCompare(b.nombre + ' ' + b.primer_apellido));
  // Clases anteriores que aún se pueden crear con fecha y km (sin «km ya hechos»)
  const porCrear = alumnos.filter(a => a.clases_previas > 0 && !(a.km_previos > 0));
  return {
    vehiculos, profesores, alumnos,
    // Siguiente nº de registro (para las filas nuevas; null si aún no hay numeración)
    siguiente_n_registro: siguienteNRegistro(d.alumnos),
    resumen: {
      vehiculos: vehiculos.length, profesores: profesores.length, alumnos: alumnos.length,
      alumnos_terminados: vivos.length - alumnos.length,
      practicas: practicas.length,
      alumnos_sin_profesor: alumnos.filter(a => !a.profesor_id).length,
      alumnos_sin_vehiculo: alumnos.filter(a => !a.vehiculo_id).length,
      clases_por_crear: porCrear.reduce((s, a) => s + a.clases_previas, 0),
      alumnos_por_crear: porCrear.length,
      clases_anteriores: alumnos.reduce((s, a) => s + a.anteriores, 0),
      anteriores_sin_km: practicas.filter(p => p.tipo_detalle === 'anterior' && !(p.km_final > 0)).length
    }
  };
}

/**
 * Guarda de una vez lo editado en la pantalla. Cada lista trae filas con `id`
 * (existentes: se actualizan) o sin él (nuevas: se crean si tienen nombre).
 * Devuelve { ok, creados, actualizados, errores[] } y no guarda nada si hay
 * errores de validación (matrículas repetidas, nombres vacíos con datos...).
 */
function guardarPuestaEnMarcha({ vehiculos = [], profesores = [], alumnos = [] } = {}) {
  const d = load();
  const errores = [];
  const creados = { vehiculos: 0, profesores: 0, alumnos: 0 };
  const actualizados = { vehiculos: 0, profesores: 0, alumnos: 0 };

  // Validación previa (nada se guarda si algo falla)
  const matriculas = new Map();
  for (const v of d.vehiculos) if (v.matricula) matriculas.set(v.matricula.replace(/\s/g, '').toUpperCase(), v.id);
  vehiculos.forEach((v, i) => {
    const nombre = texto(v.nombre, 60);
    const mat = texto(v.matricula, 15).replace(/\s/g, '').toUpperCase();
    if (!v.id && !nombre && !mat) return; // fila vacía
    if (!nombre) errores.push(`Vehículo ${i + 1}: falta el nombre.`);
    if (mat) {
      const otro = matriculas.get(mat);
      if (otro != null && otro !== v.id) errores.push(`Vehículo ${nombre || i + 1}: la matrícula ${mat} ya está en otro vehículo.`);
      matriculas.set(mat, v.id || `nuevo-${i}`);
    }
  });
  const anteriores = contarClasesAnteriores(d);
  // Alumnos ya en la app por su nombre completo (para no darlos de alta dos
  // veces). Una persona puede tener varios expedientes (uno por permiso o
  // curso, cada uno con su nº): solo se impide otro del MISMO permiso mientras
  // el que tiene sigue en curso; para otro permiso, o si el anterior ya
  // terminó (aprobado, baja), es un expediente nuevo y se deja.
  const porNombre = new Map();
  for (const x of d.alumnos) {
    if (x.deleted) continue;
    const k = claveNombre(x.nombre, x.primer_apellido, x.segundo_apellido);
    if (!k) continue;
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(x);
  }
  alumnos.forEach((a, i) => {
    const nombre = texto(a.nombre);
    const hayDatos = texto(a.primer_apellido) || cuartos(a.clases_previas) || entero(a.km_previos);
    if (!a.id && !nombre && hayDatos) errores.push(`Alumno de la fila ${i + 1}: falta el nombre.`);
    if (!a.id && nombre) {
      const k = claveNombre(nombre, texto(a.primer_apellido), texto(a.segundo_apellido));
      const permiso = texto(a.permiso, 6) || 'B';
      const ya = (porNombre.get(k) || []).find(x => (x.permiso || 'B') === permiso && !TERMINADOS.includes(x.estado));
      if (ya) {
        errores.push(`${nombre}: ya está en la app como «${nombreCompleto(ya)}»${ya.n_registro ? ` (nº ${ya.n_registro})` : ''}, en curso con el permiso ${permiso}. No lo añadas otra vez; si es otra persona con el mismo nombre, pon su segundo apellido, y si saca otro permiso, elige ese permiso.`);
      } else if (k) {
        if (!porNombre.has(k)) porNombre.set(k, []);
        porNombre.get(k).push({ nombre, primer_apellido: texto(a.primer_apellido), segundo_apellido: texto(a.segundo_apellido), permiso, estado: 'en_practicas' });
      }
    }
    const nReg = texto(a.n_registro, 40);
    const nRegAntes = a.id ? String((d.alumnos.find(x => x.id === a.id) || {}).n_registro || '') : '';
    if (nReg && nReg !== nRegAntes) {
      const otro = alumnoConNRegistro(d.alumnos, nReg, a.id || null);
      if (otro) errores.push(`${nombre || 'Alumno de la fila ' + (i + 1)}: el nº de registro ${nReg} ya lo tiene ${nombreCompleto(otro)}.`);
    }
    const previasTxt = texto(a.clases_previas, 20);
    if (previasTxt && previasTxt !== '0' && !leerCantidadClases(previasTxt)) {
      errores.push(`${nombre || 'Alumno de la fila ' + (i + 1)}: «${previasTxt}» clases ya hechas no vale; van de ¼ en ¼ (12 · 12,25 · 12,5 · 12,75 o 12 ½).`);
    }
    const creadas = a.id ? anteriores.get(a.id) || 0 : 0;
    if (creadas && cuartos(a.clases_previas, 500) < creadas) {
      errores.push(`${nombre || 'Alumno de la fila ' + (i + 1)}: ya tiene ${fmtClases(creadas)} clases anteriores creadas; para poner menos, borra antes algunas en «Anotar».`);
    }
  });
  if (errores.length) return { ok: false, errores, creados, actualizados };

  const dirty = { vehiculos: [], profesores: [], alumnos: [] };
  const idVehiculoNuevo = new Map(); // índice de fila nueva → id creado (por si un alumno lo usa)

  vehiculos.forEach((v, i) => {
    const nombre = texto(v.nombre, 60);
    const matricula = texto(v.matricula, 15).toUpperCase();
    const km = entero(v.km_actual);
    if (v.id) {
      const x = d.vehiculos.find(y => y.id === v.id);
      if (!x) return;
      if (x.nombre !== nombre || (x.matricula || '') !== matricula || Math.round(x.km_actual || 0) !== km) {
        x.nombre = nombre || x.nombre; x.matricula = matricula; x.km_actual = km;
        dirty.vehiculos.push(x.id); actualizados.vehiculos++;
      }
    } else if (nombre) {
      const id = nextId('v');
      d.vehiculos.push({ id, nombre, matricula, km_actual: km, sucursal_id: null });
      idVehiculoNuevo.set(`nuevo-${i}`, id);
      dirty.vehiculos.push(id); creados.vehiculos++;
    }
  });

  const vehiculoId = v => (typeof v === 'string' && idVehiculoNuevo.has(v) ? idVehiculoNuevo.get(v) : idONull(v));
  profesores.forEach(p => {
    const nombre = texto(p.nombre, 80);
    // Coche habitual: solo si la fila lo trae
    const conCoche = 'vehiculo_id' in p;
    const coche = conCoche ? vehiculoId(p.vehiculo_id) : null;
    if (p.id) {
      const x = d.profesores.find(y => y.id === p.id);
      if (!x) return;
      let cambia = false;
      if (nombre && x.nombre !== nombre) { x.nombre = nombre; cambia = true; }
      if (conCoche && (x.vehiculo_id || null) !== coche) { x.vehiculo_id = coche; cambia = true; }
      if (cambia) { dirty.profesores.push(x.id); actualizados.profesores++; }
    } else if (nombre) {
      const id = nextId('pf');
      d.profesores.push({ id, nombre, nota: '', sucursal_id: null, dni: null, vehiculo_id: coche });
      dirty.profesores.push(id); creados.profesores++;
    }
  });

  alumnos.forEach(a => {
    const nombre = texto(a.nombre);
    const campos = {
      primer_apellido: texto(a.primer_apellido) || null,
      segundo_apellido: texto(a.segundo_apellido) || null,
      permiso: texto(a.permiso, 6) || 'B',
      profesor_id: idONull(a.profesor_id),
      vehiculo_id: vehiculoId(a.vehiculo_id),
      clases_previas: Math.max(0, aCuartos(cuartos(a.clases_previas, 500) - (a.id ? anteriores.get(a.id) || 0 : 0))),
      km_previos: entero(a.km_previos, 100000)
    };
    // Nº de registro: solo si la fila lo trae; en las nuevas sin número, el siguiente
    const conNReg = 'n_registro' in a;
    const nReg = texto(a.n_registro, 40) || null;
    if (a.id) {
      const x = d.alumnos.find(y => y.id === a.id);
      if (!x) return;
      const antes = JSON.stringify([x.nombre, x.primer_apellido || null, x.segundo_apellido || null, x.permiso, x.profesor_id || null, x.vehiculo_id || null, x.clases_previas || 0, x.km_previos || 0, x.n_registro || null]);
      if (nombre) x.nombre = nombre;
      Object.assign(x, campos);
      if (conNReg) x.n_registro = nReg;
      const despues = JSON.stringify([x.nombre, x.primer_apellido, x.segundo_apellido, x.permiso, x.profesor_id, x.vehiculo_id, x.clases_previas, x.km_previos, x.n_registro || null]);
      if (antes !== despues) { dirty.alumnos.push(x.id); actualizados.alumnos++; }
    } else if (nombre) {
      const id = nextId('a');
      const hoy = new Date();
      const pad = n => String(n).padStart(2, '0');
      // Sin coche elegido: el coche habitual de su profesor
      if (!campos.vehiculo_id && campos.profesor_id) {
        const pr = d.profesores.find(y => y.id === campos.profesor_id);
        const v = pr && pr.vehiculo_id ? d.vehiculos.find(y => y.id === pr.vehiculo_id && !y.deleted && y.activo !== false) : null;
        if (v) campos.vehiculo_id = v.id;
      }
      d.alumnos.push({
        id, nombre, ...campos, n_registro: nReg || siguienteNRegistro(d.alumnos), sucursal_id: null, email: null, n_inscripcion: null,
        permisos_posee: null, fecha_inicio: null, fecha_fin: null, resultado: null, permisos: [],
        estado: 'en_practicas', fecha_alta: `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`
      });
      dirty.alumnos.push(id); creados.alumnos++;
    }
  });

  const total = Object.values(creados).reduce((s, n) => s + n, 0) + Object.values(actualizados).reduce((s, n) => s + n, 0);
  if (total) {
    addLog('puesta_en_marcha', `Puesta en marcha: ${creados.alumnos} alumnos nuevos, ${actualizados.alumnos} actualizados; ${creados.vehiculos + actualizados.vehiculos} vehículos; ${creados.profesores} profesores nuevos`, []);
    save();
    const s = _sync();
    if (s) for (const [tabla, ids] of Object.entries(dirty)) s.markDirtyVarios(tabla, ids);
  }
  return { ok: true, errores: [], creados, actualizados };
}

/**
 * Borra los datos de prueba para empezar con los reales. Siempre hace antes
 * una copia de seguridad completa. Quita alumnos y todo lo que cuelga de ellos
 * (prácticas, pagos, cargos, reservas, bonos, exámenes, tasas); opcionalmente
 * también vehículos y profesores. En la nube es borrado suave (se sincroniza a
 * los demás equipos y a la web). Para deshacer: restaurar la copia y, después,
 * Ajustes → Cuenta y sincronización → "Subir todo a la nube".
 */
function vaciarDatosDePrueba({ vehiculos = false, profesores = false } = {}) {
  const copia = crearBackup();
  if (!copia || !copia.ok) return { ok: false, error: 'No se pudo hacer la copia de seguridad previa; no se ha borrado nada.' };
  const d = load();
  const s = _sync();
  const marcar = (tabla, ids) => { if (s) s.markDeletedVarios(tabla, ids); };
  const idsAl = new Set(d.alumnos.map(a => a.id));
  const cuenta = {};
  const quitar = (tabla, filtro, sincronizada) => {
    const lista = d[tabla] || [];
    const fuera = lista.filter(filtro);
    d[tabla] = lista.filter(x => !filtro(x));
    cuenta[tabla] = fuera.length;
    if (sincronizada) marcar(tabla, fuera.map(x => x.id));
  };
  quitar('practicas', () => true, true);
  quitar('pagos', p => idsAl.has(p.alumno_id) || p.alumno_id == null, true);
  quitar('cargos', c => idsAl.has(c.alumno_id) || c.alumno_id == null, true);
  quitar('reservas', r => idsAl.has(r.alumno_id) || r.alumno_id == null, true);
  quitar('bonos', b => idsAl.has(b.alumno_id), false);
  quitar('presentaciones', x => idsAl.has(x.alumno_id), false);
  quitar('tasas', t => idsAl.has(t.alumno_id), false);
  quitar('alumnos', () => true, true);
  if (vehiculos) quitar('vehiculos', () => true, true);
  if (profesores) quitar('profesores', () => true, true);
  addLog('borrado_prueba', `Datos de prueba borrados: ${cuenta.alumnos || 0} alumnos, ${cuenta.practicas || 0} prácticas${vehiculos ? `, ${cuenta.vehiculos || 0} vehículos` : ''}${profesores ? `, ${cuenta.profesores || 0} profesores` : ''}. Copia previa: ${copia.file}`, []);
  save();
  return { ok: true, copia: copia.file, borrados: cuenta };
}

module.exports = { setPuntoDePartidaAlumno, getPuestaEnMarcha, guardarPuestaEnMarcha, vaciarDatosDePrueba };
