import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { nombre, permiso, vehiculo_id } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  // Obtener el ID máximo actual para generar uno nuevo
  const { data: maxRow } = await supabase
    .from('alumnos')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .single();

  const newId = (maxRow?.id ?? 0) + 1;

  const { error: errInsert } = await supabase
    .from('alumnos')
    .insert({
      id: newId,
      nombre: nombre.trim(),
      permiso: permiso || 'B',
      vehiculo_id: vehiculo_id || null,
      updated_at: new Date().toISOString()
    });

  if (errInsert) {
    return res.status(500).json({ error: errInsert.message });
  }

  return res.status(200).json({
    ok: true,
    mensaje: `Alumno "${nombre.trim()}" creado correctamente`,
    alumno_id: newId
  });
}
