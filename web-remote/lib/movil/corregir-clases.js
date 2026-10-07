// Corrige cuántas clases fue una sesión ya cerrada (el profesor eligió «1 clase» y fue «1 clase y media»).
// La sesión (varias prácticas seguidas del mismo alumno y coche) se vuelve a partir con la cantidad nueva
// SIN cambiar los km totales ni la hora de inicio y fin: se reparten en proporción entre las clases
// (partirEnClases), se crean las que faltan y las que sobran se retiran (borrado suave).
// Cambiar el nº de clases BORRA la firma del alumno de toda la sesión: lo que firmó era otra cantidad. El
// profesor la recoge de nuevo en el momento («Firmar ahora») o la próxima vez que vea al alumno (aparece en
// «Firmas pendientes» de Hoy). Así nadie puede cambiar a su antojo lo que el alumno ya firmó.
// Solo clases hechas desde el móvil de los últimos 30 días.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError,
  conFallbackColumnas, cantidadClases, partirEnClases, insertarPractica, sesionDePractica, clasesDe, fmtClases,
  borrarAvisosPractica, kmDePractica
} from '../../api/_utils.js';

const DIAS_MAX = 30;

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { practica_id, n_clases, hoy } = req.body || {};
  const idVal = validators.positiveInt(practica_id, 'practica_id');
  if (!idVal.valid) return res.status(400).json({ error: idVal.error });
  const cant = cantidadClases(n_clases);
  if (!cant.valid) return res.status(400).json({ error: cant.error });

  const { data: practica, error: errFind } = await supabase
    .from('practicas').select('id, alumno_id, vehiculo_id, fecha, km_inicial, km_final, tipo, profesor_id, hora_inicio, hora_fin, nota, source, firma, tipo_detalle')
    .eq('id', idVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (errFind && isAuthError(errFind)) return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  if (errFind || !practica) return res.status(404).json({ error: 'Práctica no encontrada' });
  if (!(practica.km_final > 0)) return res.status(409).json({ error: 'Esa clase no está cerrada: ciérrala primero (km final).' });
  if (practica.source !== 'web-remote') return res.status(403).json({ error: 'Solo se pueden corregir desde el móvil las clases que se dieron con el móvil. Las del ordenador se cambian allí.' });
  const fechaHoy = validators.fecha(hoy).valid ? hoy : new Date().toISOString().slice(0, 10);
  const dias = Math.round((new Date(fechaHoy + 'T00:00:00Z') - new Date(practica.fecha + 'T00:00:00Z')) / 86400000);
  if (dias > DIAS_MAX) return res.status(403).json({ error: `Solo se puede corregir una clase de los últimos ${DIAS_MAX} días.` });

  // La sesión entera (las prácticas seguidas), por si ya está partida
  const sesion = await sesionDePractica(supabase, auth.empresaId, practica, 'id, km_inicial, km_final, hora_inicio, hora_fin, firmada, fraccion, profesor_id, tipo, source');
  const actual = sesion.reduce((n, x) => n + clasesDe(x), 0);
  if (actual === cant.value) return res.status(200).json({ ok: true, sin_cambios: true, practica_ids: sesion.map(x => x.id), clases: actual, firmas_borradas: 0 });

  const primera = sesion[0], ultima = sesion[sesion.length - 1];
  const partes = partirEnClases(primera.km_inicial, ultima.km_final, primera.hora_inicio, ultima.hora_fin, cant.value);
  if (!partes) return res.status(400).json({ error: `Los ${ultima.km_final - primera.km_inicial} km de la sesión no llegan para ${fmtClases(cant.value)} clases.` });

  const ahora = new Date().toISOString();
  const conFirma = sesion.filter(x => x.firmada).length;
  const sesionIds = sesion.map(x => x.id);
  const creadas = [];

  // Prácticas nuevas (si se añaden clases): se crean primero; si falla una se retiran todas y no se toca nada
  for (const parte of partes.slice(sesion.length)) {
    const fila = {
      alumno_id: practica.alumno_id, vehiculo_id: practica.vehiculo_id, fecha: practica.fecha,
      km_inicial: parte.km_inicial, km_final: parte.km_final, tipo: practica.tipo || 'circulacion',
      hora_inicio: parte.hora_inicio, profesor_id: practica.profesor_id ?? null, nota: '',
      deleted: false, source: 'web-remote', empresa_id: auth.empresaId, updated_at: ahora
    };
    if (parte.hora_fin) fila.hora_fin = parte.hora_fin;
    if (parte.fraccion) fila.fraccion = parte.fraccion;
    if (practica.tipo_detalle) fila.tipo_detalle = practica.tipo_detalle;
    const { data, error } = await insertarPractica(supabase, fila);
    if (error || !data) {
      if (creadas.length) await supabase.from('practicas').update({ deleted: true, updated_at: ahora }).in('id', creadas).eq('empresa_id', auth.empresaId);
      handleSupabaseError(error || { message: 'sin id' }, res, 'Error al añadir las clases');
      return;
    }
    creadas.push(data.id);
  }

  // Las prácticas que ya había: nueva fracción, km y horas, y sin firma
  for (let i = 0; i < Math.min(sesion.length, partes.length); i++) {
    const parte = partes[i];
    const cambios = { km_inicial: parte.km_inicial, km_final: parte.km_final, hora_inicio: parte.hora_inicio, hora_fin: parte.hora_fin, fraccion: parte.fraccion, firma: null, updated_at: ahora };
    const { res: rUp } = await conFallbackColumnas(conOpc => {
      const payload = { ...cambios };
      if (!conOpc) { delete payload.hora_fin; delete payload.fraccion; delete payload.firma; }
      return supabase.from('practicas').update(payload).eq('id', sesion[i].id).eq('empresa_id', auth.empresaId);
    });
    if (handleSupabaseError(rUp.error, res, 'Error al corregir las clases')) return;
  }
  // Las que sobran (si se quitan clases): borrado suave
  const sobran = sesion.slice(partes.length).map(x => x.id);
  if (sobran.length) {
    const { error } = await supabase.from('practicas').update({ deleted: true, firma: null, updated_at: ahora }).in('id', sobran).eq('empresa_id', auth.empresaId);
    if (handleSupabaseError(error, res, 'Error al quitar las clases que sobran')) return;
    await borrarAvisosPractica(supabase, auth.empresaId, sobran);
  }

  const ids = [...sesionIds.slice(0, partes.length), ...creadas];
  return res.status(200).json({
    ok: true, practica_ids: ids, clases: cant.value, antes: actual, firmas_borradas: conFirma,
    km: partes.reduce((s, p) => s + (p.km_final - p.km_inicial), 0), km_sesion: kmDePractica({ km_inicial: primera.km_inicial, km_final: ultima.km_final })
  });
}
