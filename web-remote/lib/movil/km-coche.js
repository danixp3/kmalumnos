// Km del coche alrededor de un día y hora: en qué km acabó la clase anterior de
// ese coche y en cuál empezó la siguiente. Lo usa «Anotar clase pasada» para
// proponer el km inicial (antes salía en blanco y la clase se quedaba en 0) y
// avisar si los km pisan otra clase, y el cierre de una práctica que quedó sin
// cerrar otro día. Solo lectura.
//
// GET /api/km-coche?vehiculo_id=1&fecha=2026-10-04&hora=18:00&excluir=123
//   → { ok, anterior: {id, km, fecha, hora, alumno} | null, siguiente: {…} | null, km_actual }
import { setCorsHeaders, requireAuth, validators, getSupabase, handleSupabaseError, hhmmValido, kmAlrededor } from '../../api/_utils.js';

const fechaOk = f => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f).getTime());

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { vehiculo_id, fecha, hora, excluir } = req.query || {};
  const vid = validators.positiveInt(vehiculo_id, 'vehiculo_id');
  if (!vid.valid) return res.status(400).json({ error: vid.error });
  if (!fechaOk(fecha)) return res.status(400).json({ error: 'Formato de fecha inválido (usar YYYY-MM-DD)' });
  if (hora && !hhmmValido(hora)) return res.status(400).json({ error: 'Hora no válida (HH:MM)' });
  const fuera = String(excluir || '').split(',').map(x => parseInt(x)).filter(n => n > 0).slice(0, 10);

  const { data: coche, error: errV } = await supabase.from('vehiculos').select('id, km_actual')
    .eq('id', vid.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (handleSupabaseError(errV, res, 'Error al obtener el vehículo')) return;
  if (!coche) return res.status(404).json({ error: 'Vehículo no encontrado' });

  const r = await kmAlrededor(supabase, auth.empresaId, coche.id, fecha, hora || null, fuera);
  if (handleSupabaseError(r.error, res, 'Error al buscar los km del coche')) return;
  return res.status(200).json({ ok: true, anterior: r.anterior, siguiente: r.siguiente, km_actual: coche.km_actual || 0 });
}
