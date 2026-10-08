// Anota una clase que ya se dio y no se registró en su momento (el profesor se
// olvidó, no tenía el móvil...). Hasta 30 días atrás, nunca en el futuro. Los
// km son opcionales: si no se saben, la clase queda «sin km» y se rellenan
// luego desde el escritorio (Generar km). Con `n_clases` > 1 se guardan N
// clases seguidas con los km y el horario repartidos, igual que al cerrar una
// sesión. Las clases llevan tipo_detalle = 'anotada' para distinguirlas.
// `n_clases` va de ¼ en ¼ (1.5 = una entera y otra de ½); con `minutos` se
// cuentan como al cerrar una clase por minutos (con lo acumulado del alumno).
// Con `km_auto: true` los km los pone el servidor: empieza donde acabó la clase
// anterior de ese coche (ese día a esa hora) y recorre lo normal (Ajustes →
// km por cada 2 clases) sin pasar del km en que empezó la siguiente.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError,
  hhmmValido, kmEntero, limpiarZonas, partirEnClases, insertarPractica, cantidadClases, minutosValidos,
  clasesPorMinutos, leerDuracionClase, leerMinutosAlumno, guardarMinutosAlumno, fmtClases,
  kmAlrededor, leerKmAuto, kmFinalAutomatico, esErrorColumnaInexistente, nombreCompleto
} from '../../api/_utils.js';

export const MARCA_ANOTADA = 'anotada';

const vacio = v => v === undefined || v === null || v === '';
const fechaCorta = iso => { const [, m, d] = iso.split('-'); return `${parseInt(d)}/${parseInt(m)}`; };

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { alumno_id, vehiculo_id, fecha, hoy, hora_inicio, hora_fin, n_clases, minutos, km_inicial, km_final, km_auto, zonas, trabajado, observacion, profesor_id, forzar } = req.body || {};

  const alumnoIdVal = validators.positiveInt(alumno_id, 'alumno_id');
  if (!alumnoIdVal.valid) return res.status(400).json({ error: alumnoIdVal.error });
  const vehiculoIdVal = validators.positiveInt(vehiculo_id, 'vehiculo_id');
  if (!vehiculoIdVal.valid) return res.status(400).json({ error: 'Elige el vehículo con el que se dio la clase.' });
  const fechaVal = validators.fecha(fecha);
  if (!fechaVal.valid) return res.status(400).json({ error: fechaVal.error });
  if (validators.fecha(hoy).valid && fecha > hoy) return res.status(400).json({ error: 'Solo se pueden anotar clases que ya se han dado.' });
  if (!vacio(hora_inicio) && !hhmmValido(hora_inicio)) return res.status(400).json({ error: 'Hora de inicio no válida (HH:MM)' });
  const horaIni = vacio(hora_inicio) ? null : hora_inicio;
  const horaFin = horaIni && hhmmValido(hora_fin) && hora_fin > horaIni ? hora_fin : null;

  let nClases = 1;
  if (!vacio(n_clases)) {
    const nv = cantidadClases(n_clases);
    if (!nv.valid) return res.status(400).json({ error: nv.error });
    nClases = nv.value;
  }
  const porMinutos = !vacio(minutos);
  let minVal = null;
  if (porMinutos) {
    minVal = minutosValidos(minutos);
    if (!minVal.valid) return res.status(400).json({ error: minVal.error });
  }

  // Km: los dos, ninguno o que los ponga la app
  let kmIni = 0, kmFin = 0;
  const kmAuto = km_auto === true;
  let conKm = !kmAuto && (!vacio(km_inicial) || !vacio(km_final));
  if (conKm) {
    const vi = kmEntero(km_inicial, 'El km inicial');
    if (!vi.valid || vi.value < 1) return res.status(400).json({ error: 'Pon el km inicial y el final, o deja los dos en blanco.' });
    const vf = kmEntero(km_final, 'El km final');
    if (!vf.valid || vf.value < 1) return res.status(400).json({ error: 'Pon el km inicial y el final, o deja los dos en blanco.' });
    kmIni = vi.value; kmFin = vf.value;
    if (kmFin <= kmIni) return res.status(400).json({ error: `El km final debe ser mayor que el inicial (${kmIni}).` });
    if (kmFin - kmIni > 1000) return res.status(400).json({ error: 'Más de 1.000 km en una práctica: revisa los números.' });
  }

  let profesorIdFinal = null;
  if (!vacio(profesor_id)) {
    const pv = validators.positiveInt(profesor_id, 'profesor_id');
    if (!pv.valid) return res.status(400).json({ error: pv.error });
    profesorIdFinal = pv.value;
  }

  const leerAlumno = cols => supabase
    .from('alumnos').select(cols).eq('id', alumnoIdVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  let { data: alumno, error: errA } = await leerAlumno('id, nombre, primer_apellido, segundo_apellido');
  if (errA && esErrorColumnaInexistente(errA)) ({ data: alumno, error: errA } = await leerAlumno('id, nombre'));
  if (errA && isAuthError(errA)) return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  if (errA || !alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
  alumno.nombre = nombreCompleto(alumno);

  const { data: vehiculo, error: errV } = await supabase
    .from('vehiculos').select('id, nombre, km_actual').eq('id', vehiculoIdVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (handleSupabaseError(errV, res, 'Error al obtener el vehículo')) return;
  if (!vehiculo) return res.status(404).json({ error: 'Vehículo no encontrado' });

  // Clases por minutos: lo acumulado del alumno + los minutos de esta clase
  let acumulado = null, calculo = null;
  if (porMinutos) {
    const duracion = await leerDuracionClase(supabase, auth.empresaId);
    acumulado = await leerMinutosAlumno(supabase, auth.empresaId, alumno.id);
    calculo = clasesPorMinutos(minVal.value, acumulado.minutos, duracion);
    if (calculo.cantidad < 0.25) {
      return res.status(400).json({ error: `${calculo.total} min no llegan a ¼ de clase (${duracion / 4} min). Elige la cantidad de clases a mano.` });
    }
    nClases = calculo.cantidad;
  }

  // Km que pone la app: desde el final de la clase anterior del coche
  if (kmAuto) {
    const alrededor = await kmAlrededor(supabase, auth.empresaId, vehiculo.id, fechaVal.value, horaIni);
    if (handleSupabaseError(alrededor.error, res, 'Error al buscar los km del coche')) return;
    if (!alrededor.anterior) {
      return res.status(409).json({ codigo: 'sin_km_anterior', error: 'Este coche no tiene ninguna clase anterior con km: escribe los km o déjalos en blanco.' });
    }
    const rango = await leerKmAuto(supabase, auth.empresaId);
    const tope = alrededor.siguiente ? alrededor.siguiente.km : null;
    const fin = kmFinalAutomatico(alrededor.anterior.km, nClases, rango, tope);
    if (fin == null) {
      return res.status(409).json({ codigo: 'km_no_caben', error: `Entre el km ${alrededor.anterior.km} (fin de la clase anterior del coche) y el ${tope} (la siguiente) no caben ${fmtClases(nClases)} ${nClases > 1 ? 'clases' : 'clase'}. Escribe los km o déjalos en blanco.` });
    }
    kmIni = alrededor.anterior.km; kmFin = fin; conKm = true;
  }

  // ¿Ya está anotada? (misma hora o mismo km inicial ese día; sin hora ni km,
  // otra clase en blanco). Se puede forzar si de verdad son dos clases.
  if (!forzar) {
    const { data: delDia, error: errD } = await supabase
      .from('practicas').select('id, hora_inicio, km_inicial, km_final')
      .eq('alumno_id', alumno.id).eq('fecha', fechaVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId);
    if (handleSupabaseError(errD, res, 'Error al comprobar las clases del día')) return;
    const repetida = (delDia || []).find(p =>
      (horaIni && p.hora_inicio === horaIni) || (conKm && p.km_inicial === kmIni) ||
      (!horaIni && !conKm && !(p.km_final > 0) && !(p.km_inicial > 0) && !p.hora_inicio));
    if (repetida) {
      return res.status(409).json({
        duplicada: true, practica_id: repetida.id,
        error: `${alumno.nombre} ya tiene una clase anotada el ${fechaCorta(fechaVal.value)}${repetida.hora_inicio ? ' a las ' + repetida.hora_inicio : ''}.`
      });
    }
  }

  // Los km no pueden pisar los de otra clase del mismo coche (cerrada, o en
  // curso: su km inicial no puede quedar dentro de los de esta)
  if (conKm) {
    const [rC, rE] = await Promise.all([
      supabase.from('practicas').select('id, fecha, km_inicial, km_final, alumno_id')
        .eq('vehiculo_id', vehiculo.id).eq('deleted', false).eq('empresa_id', auth.empresaId)
        .gt('km_final', 0).lt('km_inicial', kmFin).gt('km_final', kmIni).limit(1),
      supabase.from('practicas').select('id, fecha, km_inicial, km_final, alumno_id')
        .eq('vehiculo_id', vehiculo.id).eq('deleted', false).eq('empresa_id', auth.empresaId)
        .eq('km_final', 0).gt('km_inicial', kmIni).lt('km_inicial', kmFin).limit(1)
    ]);
    if (handleSupabaseError(rC.error || rE.error, res, 'Error al comprobar los km')) return;
    const c = (rC.data || [])[0], e = (rE.data || [])[0];
    if (c || e) {
      return res.status(409).json({
        solape: true,
        error: c ? `Esos km se pisan con otra clase de este coche (${fechaCorta(c.fecha)}, km ${c.km_inicial} → ${c.km_final}). Revisa los números o déjalos en blanco.`
          : `Esos km se pisan con una clase sin cerrar de este coche (${fechaCorta(e.fecha)}, empezó en el km ${e.km_inicial}). Revisa los números o déjalos en blanco.`
      });
    }
  }

  // Clases: con km se reparten; sin km se reparte solo el horario.
  const partes = conKm
    ? partirEnClases(kmIni, kmFin, horaIni, horaFin, nClases)
    : partirEnClases(0, 1000, horaIni, horaFin, nClases).map(p => ({ ...p, km_inicial: 0, km_final: 0 }));
  if (!partes) return res.status(400).json({ error: `Con ${kmFin - kmIni} km no se pueden guardar ${fmtClases(nClases)} clases.` });

  const tipoClase = req.body && req.body.tipo === 'pista' ? 'pista' : 'circulacion';   // pista = maniobras en circuito
  const obs = typeof observacion === 'string' ? observacion.trim().slice(0, 500) : '';
  const lista = Array.isArray(trabajado) ? trabajado.filter(t => typeof t === 'string').map(t => t.trim().slice(0, 40)).filter(Boolean).slice(0, 12) : [];
  const zonasLimpias = limpiarZonas(zonas);
  const ahora = new Date().toISOString();
  const creadas = [];
  let degradado = false;
  for (const parte of partes) {
    const fila = {
      alumno_id: alumno.id, vehiculo_id: vehiculo.id, fecha: fechaVal.value,
      km_inicial: parte.km_inicial, km_final: parte.km_final, tipo: tipoClase,
      hora_inicio: parte.hora_inicio, profesor_id: profesorIdFinal, nota: obs,
      tipo_detalle: MARCA_ANOTADA, deleted: false, source: 'web-remote', empresa_id: auth.empresaId, updated_at: ahora
    };
    if (parte.hora_fin) fila.hora_fin = parte.hora_fin;
    if (parte.fraccion) fila.fraccion = parte.fraccion;
    if (lista.length) fila.trabajado = lista;
    if (zonasLimpias.length) fila.zonas = zonasLimpias;
    const { data, error, degradado: d } = await insertarPractica(supabase, fila);
    if (error || !data) {
      // No dejar media sesión: se retiran (borrado suave) las ya creadas
      if (creadas.length) {
        await supabase.from('practicas').update({ deleted: true, updated_at: new Date().toISOString() })
          .in('id', creadas).eq('empresa_id', auth.empresaId);
      }
      handleSupabaseError(error || { message: 'sin id' }, res, 'Error al anotar la clase');
      return;
    }
    if (d) degradado = true;
    creadas.push(data.id);
  }

  // El odómetro del vehículo solo sube
  if (conKm && kmFin > (vehiculo.km_actual || 0)) {
    await supabase.from('vehiculos').update({ km_actual: kmFin, updated_at: new Date().toISOString() }).eq('id', vehiculo.id);
  }

  // Minutos que no llegan a ¼ de clase: quedan acumulados para la próxima
  let errMinutos = null;
  if (porMinutos && acumulado.disponible) errMinutos = await guardarMinutosAlumno(supabase, auth.empresaId, alumno.id, calculo.sobran);

  return res.status(200).json({
    ok: true, practica_ids: creadas, clases: nClases, con_km: conKm,
    recorridos: conKm ? kmFin - kmIni : 0, campos_guardados: !degradado,
    ...(kmAuto ? { km_auto: true, km_inicial: kmIni, km_final: kmFin } : {}),
    minutos_sobrantes: porMinutos && acumulado.disponible && !errMinutos ? calculo.sobran : undefined,
    mensaje: `${nClases === 1 ? 'Clase anotada' : (nClases < 1 ? fmtClases(nClases) + ' de clase anotado' : fmtClases(nClases) + ' clases anotadas')} a ${alumno.nombre} el ${fechaCorta(fechaVal.value)}`
  });
}
