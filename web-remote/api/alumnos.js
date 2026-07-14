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

  const { data, error } = await supabase
    .from('alumnos')
    .select('id, nombre, permiso, vehiculo_id')
    .order('nombre');

  if (error) {
    console.error('Error obteniendo alumnos:', error);
    return res.status(500).json({ error: 'Error al obtener alumnos: ' + error.message });
  }

  res.json(data || []);
}
