// Anota una clase que ya se dio y no se registró en su momento (el profesor se
// olvidó, no tenía el móvil...). Hasta 30 días atrás, nunca en el futuro. Los
// km son opcionales: si no se saben, la clase queda «sin km» y se rellenan
// luego desde el escritorio (Generar km). Con `n_clases` > 1 se guardan N
// clases seguidas con los km y el horario repartidos, igual que al cerrar una
// sesión. Las clases llevan tipo_detalle = 'anotada' para distinguirlas.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError,
  hhmmValido, kmEntero, limpiarZonas, partirEnClases, insertarPractica
} from '../../api/_utils.js';

const MAX_CLASES = 6;
export const MARCA_ANOTADA = 'anotada';

const vacio = v => v === undefined || v === null || v === '';
const fechaCorta = iso => { const [, m, d] = iso.split('-'); return `${parseInt(d)}/${parseInt(m)}`; };

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { alumno_id, vehiculo_id, fecha, hoy, hora_inicio, hora_fin, n_clases, km_inicial, km_final, zonas, trabajado, observacion, profesor_id, forzar } = req.body || {};

  const alumnoIdVal = validators.positiveInt(alumno_id, 'alumno_id');
  if (!alumnoIdVal.valid) return res.status(400).json({ error: alumnoIdVal.error });
  const vehiculoIdVal = validators.positiveInt(vehiculo_id, 'vehiculo_id');
  if (!vehiculoIdVal.valid) return res.status(400).json({ error: 'Elige el vehículo con el que se dio la clase.' });
  const fechaVal = validators.fecha(fecha);
  if (!fechaVal.valid) return res.status(400).json({ error: fechaVal.error });
  if (validators.fecha(hoy).valid && fecha > hoy) return res.status(400).json({ error: 'Solo se pueden anotar clases que ya se han dado.' });
  if (!vacio(hora_inicio) && !hhmmValido(hora_inicio)) return res.status(400).json({ error: 'Hora de inicio no válida (HH:MM)' });
  const horaIni = vacio(hora_inicio) ? null : hora_inicio;
  const horaFin = horaIni && hhmmValido(hora_fin) && hora_fin > horaIni ? hora_fin : null;

  let nClases = 1;
  if (!vacio(n_clases)) {
    const nv = validators.positiveInt(n_clases, 'n_clases');
    if (!nv.valid || nv.value > MAX_CLASES) return res.status(400).json({ error: `El número de clases debe estar entre 1 y ${MAX_CLASES}.` });
    nClases = nv.value;
  }

  // Km: los dos o ninguno
  let kmIni = 0, kmFin = 0;
  const conKm = !vacio(km_inicial) || !vacio(km_final);
  if (conKm) {
    const vi = kmEntero(km_inicial, 'El km inicial');
    if (!vi.valid || vi.value < 1) return res.status(400).json({ error: 'Pon el km inicial y el final, o deja los dos en blanco.' });
    const vf = kmEntero(km_final, 'El km final');
    if (!vf.valid || vf.value < 1) return res.status(400).json({ error: 'Pon el km inicial y el final, o deja los dos en blanco.' });
    kmIni = vi.value; kmFin = vf.value;
    if (kmFin <= kmIni) return res.status(400).json({ error: `El km final debe ser mayor que el inicial (${kmIni}).` });
    if (kmFin - kmIni > 1000) return res.status(400).json({ error: 'Más de 1.000 km en una práctica: revisa los números.' });
    if (kmFin - kmIni < nClases) return res.status(400).json({ error: `Con ${kmFin - kmIni} km no se pueden guardar ${nClases} clases.` });
  }

  let profesorIdFinal = null;
  if (!vacio(profesor_id)) {
    const pv = validators.positiveInt(profesor_id, 'profesor_id');
    if (!pv.valid) return res.status(400).json({ error: pv.error });
    profesorIdFinal = pv.value;
  }

  const { data: alumno, error: errA } = await supabase
    .from('alumnos').select('id, nombre').eq('id', alumnoIdVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (errA && isAuthError(errA)) return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  if (errA || !alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

  const { data: vehiculo, error: errV } = await supabase
    .from('vehiculos').select('id, nombre, km_actual').eq('id', vehiculoIdVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (handleSupabaseError(errV, res, 'Error al obtener el vehículo')) return;
  if (!vehiculo) return res.status(404).json({ error: 'Vehículo no encontrado' });

  // ¿Ya está anotada? (misma hora o mismo km inicial ese día; sin hora ni km,
  // otra clase en blanco). Se puede forzar si de verdad son dos clases.
  if (!forzar) {
    const { data: delDia, error: errD } = await supabase
      .from('practicas').select('id, hora_inicio, km_inicial, km_final')
      .eq('alumno_id', alumno.id).eq('fecha', fechaVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId);
    if (handleSupabaseError(errD, res, 'Error al comprobar las clases del día')) return;
    const repetida = (delDia || []).find(p =>
      (horaIni && p.hora_inicio === horaIni) || (conKm && p.km_inicial === kmIni) ||
      (!horaIni && !conKm && !(p.km_final > 0) && !(p.km_inicial > 0) && !p.hora_inicio));
    if (repetida) {
      return res.status(409).json({
        duplicada: true, practica_id: repetida.id,
        error: `${alumno.nombre} ya tiene una clase anotada el ${fechaCorta(fechaVal.value)}${repetida.hora_inicio ? ' a las ' + repetida.hora_inicio : ''}.`
      });
    }
  }

  // Los km no pueden pisar los de otra clase del mismo coche
  if (conKm) {
    const { data: choques, error: errS } = await supabase
      .from('practicas').select('id, fecha, km_inicial, km_final, alumno_id')
      .eq('vehiculo_id', vehiculo.id).eq('deleted', false).eq('empresa_id', auth.empresaId)
      .gt('km_final', 0).lt('km_inicial', kmFin).gt('km_final', kmIni).limit(1);
    if (handleSupabaseError(errS, res, 'Error al comprobar los km')) return;
    if (choques && choques.length) {
      const c = choques[0];
      return res.status(409).json({
        solape: true,
        error: `Esos km se pisan con otra clase de este coche (${fechaCorta(c.fecha)}, km ${c.km_inicial} → ${c.km_final}). Revisa los números o déjalos en blanco.`
      });
    }
  }

  // N clases: con km se reparten; sin km se reparte solo el horario.
  const partes = conKm
    ? partirEnClases(kmIni, kmFin, horaIni, horaFin, nClases)
    : partirEnClases(0, nClases, horaIni, horaFin, nClases).map(p => ({ ...p, km_inicial: 0, km_final: 0 }));

  const obs = typeof observacion === 'string' ? observacion.trim().slice(0, 500) : '';
  const lista = Array.isArray(trabajado) ? trabajado.filter(t => typeof t === 'string').map(t => t.trim().slice(0, 40)).filter(Boolean).slice(0, 12) : [];
  const zonasLimpias = limpiarZonas(zonas);
  const ahora = new Date().toISOString();
  const creadas = [];
  let degradado = false;
  for (const parte of partes) {
    const fila = {
      alumno_id: alumno.id, vehiculo_id: vehiculo.id, fecha: fechaVal.value,
      km_inicial: parte.km_inicial, km_final: parte.km_final, tipo: 'circulacion',
      hora_inicio: parte.hora_inicio, profesor_id: profesorIdFinal, nota: obs,
      tipo_detalle: MARCA_ANOTADA, deleted: false, source: 'web-remote', empresa_id: auth.empresaId, updated_at: ahora
    };
    if (parte.hora_fin) fila.hora_fin = parte.hora_fin;
    if (lista.length) fila.trabajado = lista;
    if (zonasLimpias.length) fila.zonas = zonasLimpias;
    const { data, error, degradado: d } = await insertarPractica(supabase, fila);
    if (error || !data) {
      // No dejar media sesión: se retiran (borrado suave) las ya creadas
      if (creadas.length) {
        await supabase.from('practicas').update({ deleted: true, updated_at: new Date().toISOString() })
          .in('id', creadas).eq('empresa_id', auth.empresaId);
      }
      handleSupabaseError(error || { message: 'sin id' }, res, 'Error al anotar la clase');
      return;
    }
    if (d) degradado = true;
    creadas.push(data.id);
  }

  // El odómetro del vehículo solo sube
  if (conKm && kmFin > (vehiculo.km_actual || 0)) {
    await supabase.from('vehiculos').update({ km_actual: kmFin, updated_at: new Date().toISOString() }).eq('id', vehiculo.id);
  }

  return res.status(200).json({
    ok: true, practica_ids: creadas, clases: creadas.length, con_km: conKm,
    recorridos: conKm ? kmFin - kmIni : 0, campos_guardados: !degradado,
    mensaje: `${creadas.length === 1 ? 'Clase anotada' : creadas.length + ' clases anotadas'} a ${alumno.nombre} el ${fechaCorta(fechaVal.value)}`
  });
}
