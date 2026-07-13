import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { data, error } = await supabase
    .from('alumnos')
    .select('id, nombre, permiso, vehiculo_id')
    .order('nombre');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}
