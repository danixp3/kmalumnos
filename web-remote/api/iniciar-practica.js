// Empieza una práctica desde el móvil: crea la práctica de hoy con el km
// inicial REAL del cuentakilómetros y sin km final (queda "en curso" hasta que
// se cierre con /api/finalizar-practica). Avisa si el km inicial no encaja con
// el km final de la práctica anterior del mismo coche.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError,
  hhmmValido, kmEntero, insertarPractica
} from './_utils.js';

const TIPOS = ['pista', 'circulacion'];

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { alumno_id, vehiculo_id, km_inicial, tipo, tipo_detalle, fecha, hora_inicio, profesor_id } = req.body || {};

  const alumnoIdVal = validators.positiveInt(alumno_id, 'alumno_id');
  if (!alumnoIdVal.valid) return res.status(400).json({ error: alumnoIdVal.error });
  const vehiculoIdVal = validators.positiveInt(vehiculo_id, 'vehiculo_id');
  if (!vehiculoIdVal.valid) return res.status(400).json({ error: vehiculoIdVal.error });
  const kmVal = kmEntero(km_inicial, 'El km inicial');
  if (!kmVal.valid || kmVal.value < 1) return res.status(400).json({ error: 'Introduce el km inicial que marca el coche.' });
  const fechaVal = validators.fecha(fecha);
  if (!fechaVal.valid) return res.status(400).json({ error: fechaVal.error });
  if (!hhmmValido(hora_inicio)) return res.status(400).json({ error: 'Hora de inicio no válida (HH:MM)' });
  const tipoFinal = TIPOS.includes(tipo) ? tipo : 'circulacion';
  const detalle = typeof tipo_detalle === 'string' ? tipo_detalle.trim().slice(0, 40) : '';

  let profesorIdFinal = null;
  if (profesor_id !== null && profesor_id !== undefined && profesor_id !== '') {
    const pv = validators.positiveInt(profesor_id, 'profesor_id');
    if (!pv.valid) return res.status(400).json({ error: pv.error });
    profesorIdFinal = pv.value;
  }

  // Alumno y vehículo existen y son de la empresa
  const { data: alumno, error: errA } = await supabase
    .from('alumnos').select('id, nombre').eq('id', alumnoIdVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (errA && isAuthError(errA)) return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  if (errA || !alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

  const { data: vehiculo, error: errV } = await supabase
    .from('vehiculos').select('id, nombre, km_actual').eq('id', vehiculoIdVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (handleSupabaseError(errV, res, 'Error al obtener el vehículo')) return;
  if (!vehiculo) return res.status(404).json({ error: 'Vehículo no encontrado' });

  // Un coche solo puede tener una práctica en curso
  const { data: abiertas, error: errAb } = await supabase
    .from('practicas').select('id, alumno_id')
    .eq('vehiculo_id', vehiculo.id).eq('deleted', false).eq('empresa_id', auth.empresaId)
    .eq('km_final', 0).gt('km_inicial', 0).eq('fecha', fechaVal.value).limit(1);
  if (handleSupabaseError(errAb, res, 'Error al comprobar el vehículo')) return;
  if (abiertas && abiertas.length) {
    return res.status(409).json({ error: 'Este vehículo ya tiene una práctica en curso. Ciérrala antes de empezar otra.', practica_id: abiertas[0].id });
  }

  // Continuidad con la práctica anterior del mismo coche (por km final más alto conocido)
  const { data: previas, error: errP } = await supabase
    .from('practicas').select('km_final')
    .eq('vehiculo_id', vehiculo.id).eq('deleted', false).eq('empresa_id', auth.empresaId)
    .gt('km_final', 0).order('km_final', { ascending: false }).limit(1);
  if (handleSupabaseError(errP, res, 'Error al comprobar los km')) return;
  const kmAnterior = previas && previas.length ? previas[0].km_final : (vehiculo.km_actual || 0);

  const fila = {
    alumno_id: alumno.id, vehiculo_id: vehiculo.id, fecha: fechaVal.value,
    km_inicial: kmVal.value, km_final: 0, tipo: tipoFinal, hora_inicio,
    profesor_id: profesorIdFinal, deleted: false, source: 'web-remote',
    empresa_id: auth.empresaId, updated_at: new Date().toISOString()
  };
  if (detalle) fila.tipo_detalle = detalle;

  const { data, error, degradado } = await insertarPractica(supabase, fila);
  if (handleSupabaseError(error, res, 'Error al iniciar la práctica')) return;

  return res.status(200).json({
    ok: true,
    practica_id: data.id,
    tipo_detalle_guardado: !!detalle && !degradado,
    continuidad: { km_final_anterior: kmAnterior, diferencia: kmAnterior ? kmVal.value - kmAnterior : 0 }
  });
}
