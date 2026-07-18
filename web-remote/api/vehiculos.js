import { setCorsHeaders, requireAuth, getSupabase, withRetry, getEmpresaId } from './_utils.js';

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

  const { data, error } = await withRetry(() => supabase
    .from('vehiculos')
    .select('id, nombre, matricula, km_actual')
    .eq('deleted', false)
    .eq('empresa_id', empresaId)
    .order('nombre'));

  if (error) {
    console.error('Error obteniendo vehículos:', error);
    return res.status(500).json({ error: 'Error al obtener vehículos: ' + error.message });
  }

  res.json(data || []);
}
