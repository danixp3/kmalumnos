// Cierra una práctica en curso: fija el km final, la observación, lo trabajado
// y la hora de fin, y sube el odómetro del vehículo. Devuelve el resumen del
// alumno (clases y km) para la pantalla de km final.
// Con `n_clases` > 1 (p. ej. 90 min con clases de 45) la sesión se guarda como
// N clases consecutivas: la práctica abierta pasa a ser la primera y se crean
// las demás con los km y el horario repartidos a partes iguales.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError,
  hhmmValido, kmEntero, conFallbackColumnas, kmDePractica, limpiarZonas,
  partirEnClases, insertarPractica, sesionDePractica
} from '../../api/_utils.js';

const MAX_CLASES = 6;

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { practica_id, km_final, trabajado, observacion, hora_fin, zonas, n_clases } = req.body || {};
  const idVal = validators.positiveInt(practica_id, 'practica_id');
  if (!idVal.valid) return res.status(400).json({ error: idVal.error });
  const kmVal = kmEntero(km_final, 'El km final');
  if (!kmVal.valid) return res.status(400).json({ error: kmVal.error });
  let nClases = 1;
  if (n_clases !== undefined && n_clases !== null && n_clases !== '') {
    const nv = validators.positiveInt(n_clases, 'n_clases');
    if (!nv.valid || nv.value > MAX_CLASES) return res.status(400).json({ error: `El número de clases debe estar entre 1 y ${MAX_CLASES}.` });
    nClases = nv.value;
  }

  const { data: practica, error: errFind } = await supabase
    .from('practicas').select('id, alumno_id, vehiculo_id, fecha, km_inicial, km_final, nota, tipo, profesor_id, hora_inicio')
    .eq('id', idVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (errFind && isAuthError(errFind)) return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  if (errFind || !practica) return res.status(404).json({ error: 'Práctica no encontrada' });

  // Reintento de una sesión ya partida (la respuesta anterior no llegó al
  // móvil): no se vuelve a partir, se devuelven las clases que ya existen.
  if (nClases > 1 && practica.km_final > 0) {
    const sesion = await sesionDePractica(supabase, auth.empresaId, practica);
    if (sesion.length > 1) {
      return res.status(200).json({
        ok: true, ya_cerrada: true, practica_ids: sesion.map(x => x.id), clases: sesion.length,
        recorridos: sesion[sesion.length - 1].km_final - sesion[0].km_inicial,
        alumno: await resumenAlumno(supabase, auth.empresaId, practica.alumno_id), campos_guardados: true
      });
    }
  }

  if (kmVal.value <= practica.km_inicial) {
    return res.status(400).json({ error: `El km final debe ser mayor que el inicial (${practica.km_inicial}).` });
  }
  if (kmVal.value - practica.km_inicial > 1000) {
    return res.status(400).json({ error: 'Más de 1.000 km en una práctica: revisa el km final.' });
  }
  const partes = partirEnClases(practica.km_inicial, kmVal.value, practica.hora_inicio, hhmmValido(hora_fin) ? hora_fin : null, nClases);
  if (!partes) {
    return res.status(400).json({ error: `Con ${kmVal.value - practica.km_inicial} km no se pueden guardar ${nClases} clases.` });
  }

  const cambios = { km_final: kmVal.value, updated_at: new Date().toISOString() };
  const obs = typeof observacion === 'string' ? observacion.trim().slice(0, 500) : '';
  if (obs) cambios.nota = practica.nota ? `${practica.nota} ${obs}` : obs;
  const lista = Array.isArray(trabajado) ? trabajado.filter(t => typeof t === 'string').map(t => t.trim().slice(0, 40)).filter(Boolean).slice(0, 12) : [];
  if (lista.length) cambios.trabajado = lista;
  if (hhmmValido(hora_fin)) cambios.hora_fin = hora_fin;
  if (Array.isArray(zonas)) cambios.zonas = limpiarZonas(zonas); // [] = el profesor las desmarcó todas

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
  if (nClases > 1) {
    cambios.km_final = partes[0].km_final;
    if (partes[0].hora_fin) cambios.hora_fin = partes[0].hora_fin; else delete cambios.hora_fin;
  }

  const { res: rUp, degradado } = await conFallbackColumnas(conOpc => {
    const payload = { ...cambios };
    if (!conOpc) { delete payload.trabajado; delete payload.hora_fin; delete payload.zonas; }
    return supabase.from('practicas').update(payload).eq('id', practica.id).eq('empresa_id', auth.empresaId);
  });
  if (rUp.error) await retirar(supabase, auth.empresaId, nuevas);
  if (handleSupabaseError(rUp.error, res, 'Error al cerrar la práctica')) return;

  // El odómetro del vehículo solo sube
  const { data: veh } = await supabase.from('vehiculos').select('km_actual').eq('id', practica.vehiculo_id).maybeSingle();
  if (veh && kmVal.value > (veh.km_actual || 0)) {
    await supabase.from('vehiculos').update({ km_actual: kmVal.value, updated_at: new Date().toISOString() }).eq('id', practica.vehiculo_id);
  }

  return res.status(200).json({
    ok: true, recorridos: kmVal.value - practica.km_inicial,
    practica_ids: [practica.id, ...nuevas], clases: nClases,
    alumno: await resumenAlumno(supabase, auth.empresaId, practica.alumno_id),
    campos_guardados: !degradado && !degradadoNuevas
  });
}

// Resumen del alumno (clases y km de la app, incluidas las recién cerradas)
async function resumenAlumno(supabase, empresaId, alumnoId) {
  const { data: todas } = await supabase
    .from('practicas').select('id, km_inicial, km_final')
    .eq('alumno_id', alumnoId).eq('deleted', false).eq('empresa_id', empresaId);
  return { clases: (todas || []).length, km: (todas || []).reduce((s, p) => s + kmDePractica(p), 0) };
}

// Retira (borrado suave) las clases creadas si la operación no se completa.
async function retirar(supabase, empresaId, ids) {
  if (!ids.length) return;
  await supabase.from('practicas').update({ deleted: true, updated_at: new Date().toISOString() })
    .in('id', ids).eq('empresa_id', empresaId);
}
