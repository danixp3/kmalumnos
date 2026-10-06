// Estado de UNA práctica (consulta ligera). Lo usa el móvil que tiene una clase en
// marcha para enterarse de si otro teléfono la canceló o la cerró, antes de seguir
// con un cronómetro de algo que ya no existe (causa de km mal registrados).
//   estado: 'en_curso' | 'cerrada' | 'cancelada' | 'no_existe'
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError, conFallbackColumnas
} from '../../api/_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const idVal = validators.positiveInt((req.query || {}).id, 'id');
  if (!idVal.valid) return res.status(400).json({ error: idVal.error });

  const { res: r } = await conFallbackColumnas(conOpc => supabase
    .from('practicas').select('id, deleted, km_inicial, km_final, profesor_id' + (conOpc ? ', firmada' : ''))
    .eq('id', idVal.value).eq('empresa_id', auth.empresaId).maybeSingle());
  if (r.error && isAuthError(r.error)) return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  if (handleSupabaseError(r.error, res, 'Error al consultar la práctica')) return;
  const p = r.data;
  if (!p) return res.status(200).json({ ok: true, estado: 'no_existe' });
  if (p.deleted) return res.status(200).json({ ok: true, estado: 'cancelada' });
  return res.status(200).json({
    ok: true, estado: p.km_final > 0 ? 'cerrada' : 'en_curso',
    km_inicial: p.km_inicial, km_final: p.km_final, firmada: !!p.firmada, profesor_id: p.profesor_id || null
  });
}
