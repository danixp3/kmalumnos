// Cierra una práctica en curso: fija el km final, la observación, lo trabajado
// y la hora de fin, y sube el odómetro del vehículo. Devuelve el resumen del
// alumno (clases y km) para la pantalla de km final.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError,
  hhmmValido, kmEntero, conFallbackColumnas, kmDePractica, limpiarZonas
} from '../../api/_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { practica_id, km_final, trabajado, observacion, hora_fin, zonas } = req.body || {};
  const idVal = validators.positiveInt(practica_id, 'practica_id');
  if (!idVal.valid) return res.status(400).json({ error: idVal.error });
  const kmVal = kmEntero(km_final, 'El km final');
  if (!kmVal.valid) return res.status(400).json({ error: kmVal.error });

  const { data: practica, error: errFind } = await supabase
    .from('practicas').select('id, alumno_id, vehiculo_id, fecha, km_inicial, km_final, nota')
    .eq('id', idVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (errFind && isAuthError(errFind)) return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  if (errFind || !practica) return res.status(404).json({ error: 'Práctica no encontrada' });

  if (kmVal.value <= practica.km_inicial) {
    return res.status(400).json({ error: `El km final debe ser mayor que el inicial (${practica.km_inicial}).` });
  }
  if (kmVal.value - practica.km_inicial > 1000) {
    return res.status(400).json({ error: 'Más de 1.000 km en una práctica: revisa el km final.' });
  }

  const cambios = { km_final: kmVal.value, updated_at: new Date().toISOString() };
  const obs = typeof observacion === 'string' ? observacion.trim().slice(0, 500) : '';
  if (obs) cambios.nota = practica.nota ? `${practica.nota} ${obs}` : obs;
  const lista = Array.isArray(trabajado) ? trabajado.filter(t => typeof t === 'string').map(t => t.trim().slice(0, 40)).filter(Boolean).slice(0, 12) : [];
  if (lista.length) cambios.trabajado = lista;
  if (hhmmValido(hora_fin)) cambios.hora_fin = hora_fin;
  if (Array.isArray(zonas)) cambios.zonas = limpiarZonas(zonas); // [] = el profesor las desmarcó todas

  const { res: rUp, degradado } = await conFallbackColumnas(conOpc => {
    const payload = { ...cambios };
    if (!conOpc) { delete payload.trabajado; delete payload.hora_fin; delete payload.zonas; }
    return supabase.from('practicas').update(payload).eq('id', practica.id).eq('empresa_id', auth.empresaId);
  });
  if (handleSupabaseError(rUp.error, res, 'Error al cerrar la práctica')) return;

  // El odómetro del vehículo solo sube
  const { data: veh } = await supabase.from('vehiculos').select('km_actual').eq('id', practica.vehiculo_id).maybeSingle();
  if (veh && kmVal.value > (veh.km_actual || 0)) {
    await supabase.from('vehiculos').update({ km_actual: kmVal.value, updated_at: new Date().toISOString() }).eq('id', practica.vehiculo_id);
  }

  // Resumen del alumno (clases y km, incluida esta)
  const { data: todas } = await supabase
    .from('practicas').select('id, km_inicial, km_final')
    .eq('alumno_id', practica.alumno_id).eq('deleted', false).eq('empresa_id', auth.empresaId);
  const clases = (todas || []).length;
  const km = (todas || []).reduce((s, p) => s + kmDePractica(p.id === practica.id ? { ...p, km_final: kmVal.value } : p), 0);

  return res.status(200).json({
    ok: true, recorridos: kmVal.value - practica.km_inicial,
    alumno: { clases, km },
    campos_guardados: !degradado
  });
}
