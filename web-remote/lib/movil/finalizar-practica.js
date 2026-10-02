// Cierra una práctica en curso: fija el km final, la observación, lo trabajado
// y la hora de fin, y sube el odómetro del vehículo. Devuelve el resumen del
// alumno (clases y km) para la pantalla de km final.
// Con `n_clases` > 1 (p. ej. 90 min con clases de 45) la sesión se guarda como
// N clases consecutivas: la práctica abierta pasa a ser la primera y se crean
// las demás con los km y el horario repartidos. `n_clases` va de ¼ en ¼
// (1.5 = una clase entera y otra de ½, con `fraccion` = 0.5).
// Con `minutos` (clases por minutos) se suman los minutos acumulados del
// alumno, se guardan los cuartos de clase completos y lo que sobra queda
// acumulado (alumnos.minutos_sobrantes) para la próxima.
// Con `km_auto` (el profesor no quiere escribir el km final) la app pone el km
// final: los km de cada clase al azar dentro del rango de Ajustes, sin pisar
// nunca la siguiente práctica del coche (kmFinalAutomatico). Esas clases
// llevan tipo_detalle = 'km_auto' para que se sepa que los km son calculados.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError,
  hhmmValido, kmEntero, conFallbackColumnas, kmDePractica, limpiarZonas,
  partirEnClases, insertarPractica, sesionDePractica, cantidadClases, minutosValidos,
  clasesPorMinutos, leerDuracionClase, leerMinutosAlumno, guardarMinutosAlumno, clasesDe, fmtClases,
  leerKmAuto, kmFinalAutomatico, topeKmSiguiente, MARCA_KM_AUTO
} from '../../api/_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { practica_id, km_final, trabajado, observacion, hora_fin, zonas, n_clases, minutos, km_auto } = req.body || {};
  const idVal = validators.positiveInt(practica_id, 'practica_id');
  if (!idVal.valid) return res.status(400).json({ error: idVal.error });
  const kmAuto = km_auto === true;
  const kmVal = kmAuto ? { valid: true, value: 0 } : kmEntero(km_final, 'El km final');
  if (!kmVal.valid) return res.status(400).json({ error: kmVal.error });
  let nClases = 1;
  if (n_clases !== undefined && n_clases !== null && n_clases !== '') {
    const nv = cantidadClases(n_clases);
    if (!nv.valid) return res.status(400).json({ error: nv.error });
    nClases = nv.value;
  }
  const porMinutos = minutos !== undefined && minutos !== null && minutos !== '';
  let minVal = null;
  if (porMinutos) {
    minVal = minutosValidos(minutos);
    if (!minVal.valid) return res.status(400).json({ error: minVal.error });
  }

  const { data: practica, error: errFind } = await supabase
    .from('practicas').select('id, alumno_id, vehiculo_id, fecha, km_inicial, km_final, nota, tipo, profesor_id, hora_inicio')
    .eq('id', idVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (errFind && isAuthError(errFind)) return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  if (errFind || !practica) return res.status(404).json({ error: 'Práctica no encontrada' });

  // Reintento de una sesión ya cerrada (la respuesta anterior no llegó al
  // móvil): no se vuelve a partir ni a contar minutos, se devuelven las clases
  // que ya existen.
  if ((nClases > 1 || porMinutos || kmAuto) && practica.km_final > 0) {
    const sesion = await sesionDePractica(supabase, auth.empresaId, practica, 'id, km_inicial, km_final, hora_inicio, hora_fin, firmada, fraccion');
    if (sesion.length > 1 || porMinutos || kmAuto) {
      const acumulado = porMinutos ? await leerMinutosAlumno(supabase, auth.empresaId, practica.alumno_id) : null;
      return res.status(200).json({
        ok: true, ya_cerrada: true, practica_ids: sesion.map(x => x.id), clases: sesion.reduce((n, x) => n + clasesDe(x), 0),
        recorridos: sesion[sesion.length - 1].km_final - sesion[0].km_inicial,
        km_final: sesion[sesion.length - 1].km_final, km_auto: kmAuto || undefined,
        minutos_sobrantes: acumulado ? acumulado.minutos : undefined,
        alumno: await resumenAlumno(supabase, auth.empresaId, practica.alumno_id), campos_guardados: true
      });
    }
  }

  // Clases por minutos: lo acumulado del alumno + los minutos de hoy
  let acumulado = null, calculo = null;
  if (porMinutos) {
    const duracion = await leerDuracionClase(supabase, auth.empresaId);
    acumulado = await leerMinutosAlumno(supabase, auth.empresaId, practica.alumno_id);
    calculo = clasesPorMinutos(minVal.value, acumulado.minutos, duracion);
    if (calculo.cantidad < 0.25) {
      return res.status(400).json({ error: `${calculo.total} min no llegan a ¼ de clase (${duracion / 4} min). Elige la cantidad de clases a mano.` });
    }
    nClases = calculo.cantidad;
  }

  // Km automáticos: dentro del rango de Ajustes y sin pasar del km en que
  // empieza la siguiente práctica conocida del coche.
  if (kmAuto) {
    if (!(practica.km_inicial > 0)) return res.status(400).json({ error: 'Esta práctica no tiene km inicial: escribe el km final.' });
    const [rango, sig] = await Promise.all([
      leerKmAuto(supabase, auth.empresaId),
      topeKmSiguiente(supabase, auth.empresaId, practica.vehiculo_id, practica.km_inicial, practica.id)
    ]);
    if (handleSupabaseError(sig.error, res, 'Error al calcular los km')) return;
    const kf = kmFinalAutomatico(practica.km_inicial, nClases, rango, sig.tope);
    if (kf == null) {
      return res.status(409).json({ error: `La siguiente práctica de este coche empieza en el km ${sig.tope}: no caben ${fmtClases(nClases)} clases desde el ${practica.km_inicial}. Escribe el km final.`, codigo: 'km_no_caben' });
    }
    kmVal.value = kf;
  }

  if (kmVal.value <= practica.km_inicial) {
    return res.status(400).json({ error: `El km final debe ser mayor que el inicial (${practica.km_inicial}).` });
  }
  if (kmVal.value - practica.km_inicial > 1000) {
    return res.status(400).json({ error: 'Más de 1.000 km en una práctica: revisa el km final.' });
  }
  const partes = partirEnClases(practica.km_inicial, kmVal.value, practica.hora_inicio, hhmmValido(hora_fin) ? hora_fin : null, nClases);
  if (!partes) {
    return res.status(400).json({ error: `Con ${kmVal.value - practica.km_inicial} km no se pueden guardar ${fmtClases(nClases)} clases.` });
  }

  const cambios = { km_final: kmVal.value, updated_at: new Date().toISOString() };
  const obs = typeof observacion === 'string' ? observacion.trim().slice(0, 500) : '';
  if (obs) cambios.nota = practica.nota ? `${practica.nota} ${obs}` : obs;
  const lista = Array.isArray(trabajado) ? trabajado.filter(t => typeof t === 'string').map(t => t.trim().slice(0, 40)).filter(Boolean).slice(0, 12) : [];
  if (lista.length) cambios.trabajado = lista;
  if (hhmmValido(hora_fin)) cambios.hora_fin = hora_fin;
  if (Array.isArray(zonas)) cambios.zonas = limpiarZonas(zonas); // [] = el profesor las desmarcó todas
  cambios.fraccion = partes[0].fraccion; // null = clase entera
  if (kmAuto) cambios.tipo_detalle = MARCA_KM_AUTO;

  // Clases 2..N de la sesión: se crean ANTES de tocar la abierta; si alguna
  // falla se retiran (borrado suave) y la práctica sigue abierta como estaba.
  const nuevas = [];
  let degradadoNuevas = false;
  let zonasOrig = [];
  if (nClases > 1 && !Array.isArray(zonas)) {
    const { res: rz } = await conFallbackColumnas(c => supabase.from('practicas').select(c ? 'id, zonas' : 'id').eq('id', practica.id).maybeSingle());
    zonasOrig = rz.data && Array.isArray(rz.data.zonas) ? rz.data.zonas : [];
  }
  for (const parte of partes.slice(1)) {
    const fila = {
      alumno_id: practica.alumno_id, vehiculo_id: practica.vehiculo_id, fecha: practica.fecha,
      km_inicial: parte.km_inicial, km_final: parte.km_final, tipo: practica.tipo || 'circulacion',
      hora_inicio: parte.hora_inicio, profesor_id: practica.profesor_id ?? null, nota: cambios.nota || '',
      deleted: false, source: 'web-remote', empresa_id: auth.empresaId, updated_at: cambios.updated_at
    };
    if (cambios.trabajado) fila.trabajado = cambios.trabajado;
    if (parte.hora_fin) fila.hora_fin = parte.hora_fin;
    if (parte.fraccion) fila.fraccion = parte.fraccion;
    if (kmAuto) fila.tipo_detalle = MARCA_KM_AUTO;
    const zonasFila = cambios.zonas || zonasOrig;
    if (zonasFila.length) fila.zonas = zonasFila;
    const { data, error, degradado } = await insertarPractica(supabase, fila);
    if (error || !data) {
      await retirar(supabase, auth.empresaId, nuevas);
      handleSupabaseError(error || { message: 'sin id' }, res, 'Error al guardar las clases de la sesión');
      return;
    }
    if (degradado) degradadoNuevas = true;
    nuevas.push(data.id);
  }
  if (partes.length > 1) {
    cambios.km_final = partes[0].km_final;
    if (partes[0].hora_fin) cambios.hora_fin = partes[0].hora_fin; else delete cambios.hora_fin;
  }

  const { res: rUp, degradado } = await conFallbackColumnas(conOpc => {
    const payload = { ...cambios };
    if (!conOpc) { delete payload.trabajado; delete payload.hora_fin; delete payload.zonas; delete payload.fraccion; delete payload.tipo_detalle; }
    return supabase.from('practicas').update(payload).eq('id', practica.id).eq('empresa_id', auth.empresaId);
  });
  if (rUp.error) await retirar(supabase, auth.empresaId, nuevas);
  if (handleSupabaseError(rUp.error, res, 'Error al cerrar la práctica')) return;

  // El odómetro del vehículo solo sube
  const { data: veh } = await supabase.from('vehiculos').select('km_actual').eq('id', practica.vehiculo_id).maybeSingle();
  if (veh && kmVal.value > (veh.km_actual || 0)) {
    await supabase.from('vehiculos').update({ km_actual: kmVal.value, updated_at: new Date().toISOString() }).eq('id', practica.vehiculo_id);
  }

  // Minutos que no llegan a ¼ de clase: quedan acumulados para la próxima
  let errMinutos = null;
  if (porMinutos && acumulado.disponible) errMinutos = await guardarMinutosAlumno(supabase, auth.empresaId, practica.alumno_id, calculo.sobran);

  return res.status(200).json({
    ok: true, recorridos: kmVal.value - practica.km_inicial,
    km_final: kmVal.value, km_auto: kmAuto || undefined,
    practica_ids: [practica.id, ...nuevas], clases: nClases,
    minutos_sobrantes: porMinutos && acumulado.disponible && !errMinutos ? calculo.sobran : undefined,
    alumno: await resumenAlumno(supabase, auth.empresaId, practica.alumno_id),
    campos_guardados: !degradado && !degradadoNuevas
  });
}

// Resumen del alumno (clases y km de la app, incluidas las recién cerradas)
async function resumenAlumno(supabase, empresaId, alumnoId) {
  const { res: r } = await conFallbackColumnas(conOpc => supabase
    .from('practicas').select('id, km_inicial, km_final' + (conOpc ? ', fraccion' : ''))
    .eq('alumno_id', alumnoId).eq('deleted', false).eq('empresa_id', empresaId));
  const todas = r.data || [];
  return { clases: todas.reduce((n, p) => n + clasesDe(p), 0), km: todas.reduce((s, p) => s + kmDePractica(p), 0) };
}

// Retira (borrado suave) las clases creadas si la operación no se completa.
async function retirar(supabase, empresaId, ids) {
  if (!ids.length) return;
  await supabase.from('practicas').update({ deleted: true, updated_at: new Date().toISOString() })
    .in('id', ids).eq('empresa_id', empresaId);
}
