import { setCorsHeaders, requireAuth, getSupabase, withRetry, handleSupabaseError } from './_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  // Los coches retirados en el escritorio (activo = false) no se ofrecen para
  // dar clase. Si la base aún no tiene la columna, se piden todos como antes.
  const pedir = conActivo => withRetry(() => {
    let q = supabase.from('vehiculos').select('id, nombre, matricula, km_actual')
      .eq('deleted', false)
      .eq('empresa_id', auth.empresaId);
    if (conActivo) q = q.neq('activo', false);
    return q.order('nombre');
  });
  let { data, error } = await pedir(true);
  if (error && /activo/.test(`${error.message || ''} ${error.details || ''}`)) ({ data, error } = await pedir(false));

  if (handleSupabaseError(error, res, 'Error al obtener vehículos')) return;
  const vehiculos = data || [];

  // Última práctica cerrada de cada coche (para comprobar que el km inicial de la
  // siguiente encaja). Una sola consulta acotada; se reparte en memoria.
  let ultimoPorVehiculo = {};
  if (vehiculos.length) {
    const { data: recientes, error: errR } = await withRetry(() => supabase
      .from('practicas')
      .select('vehiculo_id, alumno_id, fecha, hora_inicio, km_final, alumnos(nombre)')
      .eq('deleted', false).eq('empresa_id', auth.empresaId)
      .gt('km_final', 0)
      .order('fecha', { ascending: false })
      .order('km_final', { ascending: false })
      .limit(400));
    const apuntar = p => {
      if (!ultimoPorVehiculo[p.vehiculo_id]) {
        ultimoPorVehiculo[p.vehiculo_id] = {
          km_final: p.km_final, fecha: p.fecha, hora: p.hora_inicio || null,
          alumno: p.alumnos ? p.alumnos.nombre : null
        };
      }
    };
    if (!errR) (recientes || []).forEach(apuntar);
    // Un coche que se usa poco puede no salir entre las 400 últimas clases de
    // toda la autoescuela: entonces se busca la suya (antes se quedaba sin
    // «último km» y el km inicial propuesto era el del odómetro, a veces 0)
    const faltan = vehiculos.filter(v => !ultimoPorVehiculo[v.id]);
    await Promise.all(faltan.map(async v => {
      const { data: una, error: errU } = await supabase.from('practicas')
        .select('vehiculo_id, alumno_id, fecha, hora_inicio, km_final, alumnos(nombre)')
        .eq('vehiculo_id', v.id).eq('deleted', false).eq('empresa_id', auth.empresaId).gt('km_final', 0)
        .order('fecha', { ascending: false }).order('km_final', { ascending: false }).limit(1);
      if (!errU && una && una[0]) apuntar(una[0]);
    }));
  }

  res.json(vehiculos.map(v => ({ ...v, ultimo: ultimoPorVehiculo[v.id] || null })));
}
