import { setCorsHeaders, requireAuth, getSupabase, handleSupabaseError } from './_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  // Obtener prácticas recientes creadas desde web-remote (últimas 24h)
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('practicas')
    .select(`
      id,
      fecha,
      alumno_id,
      vehiculo_id,
      hora_inicio,
      km_inicial,
      km_final,
      alumnos(nombre),
      vehiculos(nombre, matricula)
    `)
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId)
    .eq('source', 'web-remote')
    .gte('updated_at', hace24h)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (handleSupabaseError(error, res, 'Error al obtener historial')) return;

  // Formatear respuesta
  const practicas = (data || []).map(p => ({
    id: p.id,
    fecha: p.fecha,
    alumno_nombre: p.alumnos?.nombre || '?',
    vehiculo_nombre: p.vehiculos?.nombre || '?',
    matricula: p.vehiculos?.matricula || null,
    hora_inicio: p.hora_inicio || null,
    km_inicial: p.km_inicial,
    km_final: p.km_final,
    en_curso: p.km_inicial > 0 && !p.km_final
  }));

  res.json(practicas);
}
