import { setCorsHeaders, requireAuth, getSupabase, withRetry, handleSupabaseError, esErrorColumnaInexistente } from './_utils.js';

// Profesores de la empresa con su coche habitual (vehiculo_id: el que la web
// propone al iniciar o anotar sus clases). Sin la columna (migración
// 2026-10-03_profesor_vehiculo sin aplicar) → vehiculo_id null.
export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  const consulta = cols => withRetry(() => supabase
    .from('profesores')
    .select(cols)
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId)
    .order('nombre'));

  let { data, error } = await consulta('id, nombre, vehiculo_id');
  let conCoche = true;
  if (error && esErrorColumnaInexistente(error)) { conCoche = false; ({ data, error } = await consulta('id, nombre')); }

  if (handleSupabaseError(error, res, 'Error al obtener profesores')) return;

  res.json((data || []).map(p => ({ ...p, vehiculo_id: conCoche ? p.vehiculo_id ?? null : null })));
}
