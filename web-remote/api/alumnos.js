import { setCorsHeaders, requireAuth, getSupabase, withRetry, handleSupabaseError } from './_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  const { data, error } = await withRetry(() => supabase
    .from('alumnos')
    .select('id, nombre, permiso, vehiculo_id')
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId)
    .order('nombre'));

  if (handleSupabaseError(error, res, 'Error al obtener alumnos')) return;

  res.json(data || []);
}
