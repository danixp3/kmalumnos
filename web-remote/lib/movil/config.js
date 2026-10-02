// Ajustes de la empresa que la web necesita: las zonas de prácticas, los
// minutos que dura una clase y los km automáticos (km por cada 2 clases);
// todo se configura en el escritorio. Solo lectura. Sin la tabla ajustes_empresa
// (migración 2026-10-01 sin aplicar) responde con la lista vacía y la web
// simplemente no muestra "Zonas recorridas".
import { setCorsHeaders, requireAuth, getSupabase, withRetry, limpiarZonas, duracionClaseValida, kmAutoValido } from '../../api/_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { data, error } = await withRetry(() => supabase
    .from('ajustes_empresa').select('clave, valor')
    .eq('empresa_id', auth.empresaId));
  const ajustes = error ? [] : (data || []);
  const zonas = ajustes.find(a => a.clave === 'zonas');
  const duracion = ajustes.find(a => a.clave === 'duracion_clase_min');
  const kmAuto = ajustes.find(a => a.clave === 'km_auto_movil');

  return res.status(200).json({
    ok: true, zonas: limpiarZonas(zonas ? zonas.valor : []),
    duracion_clase_min: duracionClaseValida(duracion ? duracion.valor : 45),
    km_auto: kmAutoValido(kmAuto ? kmAuto.valor : null)
  });
}
