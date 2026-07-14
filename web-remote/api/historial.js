import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, requireAuth } from './_utils.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  // Verificar autenticación
  if (!requireAuth(req, res)) return;

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
