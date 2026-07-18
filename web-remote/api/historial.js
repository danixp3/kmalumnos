import { setCorsHeaders, requireAuth, getSupabase, getEmpresaId } from './_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  // Verificar autenticación
  if (!requireAuth(req, res)) return;

  let supabase;
  try { supabase = await getSupabase(); }
  catch (e) { return res.status(500).json({ error: e.message }); }

  const empresaId = await getEmpresaId();

  // Obtener prácticas recientes creadas desde web-remote (últimas 24h)
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('practicas')
    .select(`
      id,
      fecha,
      alumno_id,
      vehiculo_id,
      alumnos(nombre),
      vehiculos(nombre)
    `)
    .eq('deleted', false)
    .eq('empresa_id', empresaId)
    .eq('source', 'web-remote')
    .gte('updated_at', hace24h)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error obteniendo historial:', error);
    return res.status(500).json({ error: 'Error al obtener historial: ' + error.message });
  }

  // Formatear respuesta
  const practicas = (data || []).map(p => ({
    id: p.id,
    fecha: p.fecha,
    alumno_nombre: p.alumnos?.nombre || '?',
    vehiculo_nombre: p.vehiculos?.nombre || '?'
  }));

  res.json(practicas);
}
