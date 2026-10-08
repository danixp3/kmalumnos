// Registra una clase COMPLETA de una vez: la que el profesor dio sin cobertura (la
// tablet la guarda y la envía cuando vuelve a haber red). Hace lo que harían
// iniciar → finalizar → firmar seguidos: crea la clase (o las N de la sesión)
// con sus km, horas, zonas, lo trabajado, la observación y la firma del alumno.
//
// Se puede enviar más de una vez sin duplicar (la respuesta pudo perderse con
// mala cobertura): si ya hay una clase cerrada del mismo alumno, coche, día y
// hora (o km inicial) devuelve esa en vez de crear otra, y solo le pone la
// firma si aún no la tenía. Una clase que quedó abierta con esa misma clave (el
// «iniciar» sí llegó pero no su respuesta) se retira: la completa la sustituye.
//
// A diferencia de «anotar clase pasada», los km NO se rechazan aunque pisen a
// otra clase del coche: la clase ya se dio, hay que guardarla; luego «Cuadrar km»
// del escritorio deja el cuentakilómetros coherente.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError,
  hhmmValido, kmEntero, limpiarZonas, partirEnClases, insertarPractica, cantidadClases, minutosValidos,
  clasesPorMinutos, leerDuracionClase, leerMinutosAlumno, guardarMinutosAlumno, fmtClases,
  sesionDePractica, MARCA_KM_AUTO
} from '../../api/_utils.js';
import { MARCA_ANOTADA } from './anotar-practica.js';

const MAX_FIRMA = 200000;
const vacio = v => v === undefined || v === null || v === '';
const fechaCorta = iso => { const [, m, d] = iso.split('-'); return `${parseInt(d)}/${parseInt(m)}`; };
const firmaValida = f => typeof f === 'string' && f.length <= MAX_FIRMA && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(f);

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const {
    cid, alumno_id, vehiculo_id, fecha, hoy, hora_inicio, hora_fin, n_clases, minutos, km_inicial, km_final,
    km_calculado, anotada, zonas, trabajado, observacion, profesor_id, firma
  } = req.body || {};

  if (typeof cid !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(cid)) return res.status(400).json({ error: 'Falta el identificador de la clase (cid).' });
  const alumnoIdVal = validators.positiveInt(alumno_id, 'alumno_id');
  if (!alumnoIdVal.valid) return res.status(400).json({ error: alumnoIdVal.error });
  const vehiculoIdVal = validators.positiveInt(vehiculo_id, 'vehiculo_id');
  if (!vehiculoIdVal.valid) return res.status(400).json({ error: 'Elige el vehículo con el que se dio la clase.' });
  const fechaVal = validators.fecha(fecha);
  if (!fechaVal.valid) return res.status(400).json({ error: fechaVal.error });
  if (validators.fecha(hoy).valid && fecha > hoy) return res.status(400).json({ error: 'Solo se pueden registrar clases que ya se han dado.' });
  if (!vacio(hora_inicio) && !hhmmValido(hora_inicio)) return res.status(400).json({ error: 'Hora de inicio no válida (HH:MM)' });
  const horaIni = vacio(hora_inicio) ? null : hora_inicio;
  const horaFin = horaIni && hhmmValido(hora_fin) && hora_fin > horaIni ? hora_fin : null;
  if (!vacio(firma) && !firmaValida(firma)) return res.status(400).json({ error: 'La firma no es una imagen válida.' });

  let nClases = 1;
  if (!vacio(n_clases)) {
    const nv = cantidadClases(n_clases);
    if (!nv.valid) return res.status(400).json({ error: nv.error });
    nClases = nv.value;
  }
  const porMinutos = !vacio(minutos);
  let minVal = null;
  if (porMinutos) {
    minVal = minutosValidos(minutos);
    if (!minVal.valid) return res.status(400).json({ error: minVal.error });
  }

  // Km: los dos o ninguno
  let kmIni = 0, kmFin = 0;
  const conKm = !vacio(km_inicial) || !vacio(km_final);
  if (conKm) {
    const vi = kmEntero(km_inicial, 'El km inicial');
    const vf = kmEntero(km_final, 'El km final');
    if (!vi.valid || vi.value < 1 || !vf.valid || vf.value < 1) return res.status(400).json({ error: 'Pon el km inicial y el final, o deja los dos en blanco.' });
    kmIni = vi.value; kmFin = vf.value;
    if (kmFin <= kmIni) return res.status(400).json({ error: `El km final debe ser mayor que el inicial (${kmIni}).` });
    if (kmFin - kmIni > 1000) return res.status(400).json({ error: 'Más de 1.000 km en una práctica: revisa los números.' });
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

  // ¿Ya se registró (envío repetido)? Misma clave: alumno + coche + día + (hora | km inicial)
  const { data: delDia, error: errD } = await supabase
    .from('practicas').select('id, hora_inicio, km_inicial, km_final')
    .eq('alumno_id', alumno.id).eq('vehiculo_id', vehiculo.id).eq('fecha', fechaVal.value)
    .eq('deleted', false).eq('empresa_id', auth.empresaId);
  if (handleSupabaseError(errD, res, 'Error al comprobar las clases del día')) return;
  const coincide = p => (horaIni && p.hora_inicio === horaIni) || (conKm && p.km_inicial === kmIni) ||
    (!horaIni && !conKm && !(p.km_final > 0) && !(p.km_inicial > 0) && !p.hora_inicio);
  const iguales = (delDia || []).filter(coincide);
  const cerrada = iguales.find(p => p.km_final > 0 || (!(p.km_inicial > 0) && !(p.km_final > 0)));
  if (cerrada) {
    const sesion = await sesionDePractica(supabase, auth.empresaId, { ...cerrada, alumno_id: alumno.id, vehiculo_id: vehiculo.id, fecha: fechaVal.value }, 'id, km_inicial, km_final, hora_inicio, hora_fin, firmada, fraccion');
    const ids = sesion.map(x => x.id);
    let firmaGuardada = false;
    if (firma && ids.length && sesion.some(x => !x.firmada)) {
      const { error: errF } = await supabase.from('practicas').update({ firma, updated_at: new Date().toISOString() }).in('id', ids).eq('empresa_id', auth.empresaId);
      firmaGuardada = !errF;
    }
    return res.status(200).json({ ok: true, ya_registrada: true, practica_ids: ids, clases: sesion.length, con_km: conKm, firma_guardada: firmaGuardada, mensaje: 'Esta clase ya estaba registrada' });
  }
  // Una clase abierta con la misma clave es el «iniciar» cuya respuesta no llegó: la completa la sustituye
  const huerfanas = iguales.filter(p => p.km_inicial > 0 && !(p.km_final > 0)).map(p => p.id);
  if (huerfanas.length) {
    await supabase.from('practicas').update({ deleted: true, updated_at: new Date().toISOString() }).in('id', huerfanas).eq('empresa_id', auth.empresaId);
  }

  // Clases por minutos: lo acumulado del alumno + los minutos de esta clase
  let acumulado = null, calculo = null;
  if (porMinutos) {
    const duracion = await leerDuracionClase(supabase, auth.empresaId);
    acumulado = await leerMinutosAlumno(supabase, auth.empresaId, alumno.id);
    calculo = clasesPorMinutos(minVal.value, acumulado.minutos, duracion);
    if (calculo.cantidad < 0.25) {
      return res.status(400).json({ error: `${calculo.total} min no llegan a ¼ de clase (${duracion / 4} min).` });
    }
    nClases = calculo.cantidad;
  }

  const partes = conKm
    ? partirEnClases(kmIni, kmFin, horaIni, horaFin, nClases)
    : partirEnClases(0, 1000, horaIni, horaFin, nClases).map(p => ({ ...p, km_inicial: 0, km_final: 0 }));
  if (!partes) return res.status(400).json({ error: `Con ${kmFin - kmIni} km no se pueden guardar ${fmtClases(nClases)} clases.` });

  const tipoClase = req.body && req.body.tipo === 'pista' ? 'pista' : 'circulacion';   // pista = maniobras en circuito
  const obs = typeof observacion === 'string' ? observacion.trim().slice(0, 500) : '';
  const lista = Array.isArray(trabajado) ? trabajado.filter(t => typeof t === 'string').map(t => t.trim().slice(0, 40)).filter(Boolean).slice(0, 12) : [];
  const zonasLimpias = limpiarZonas(zonas);
  const marca = anotada ? MARCA_ANOTADA : (km_calculado ? MARCA_KM_AUTO : null);
  const ahora = new Date().toISOString();
  const creadas = [];
  let degradado = false;
  for (const parte of partes) {
    const fila = {
      alumno_id: alumno.id, vehiculo_id: vehiculo.id, fecha: fechaVal.value,
      km_inicial: parte.km_inicial, km_final: parte.km_final, tipo: tipoClase,
      hora_inicio: parte.hora_inicio, profesor_id: profesorIdFinal, nota: obs,
      deleted: false, source: 'web-remote', empresa_id: auth.empresaId, updated_at: ahora
    };
    if (marca) fila.tipo_detalle = marca;
    if (parte.hora_fin) fila.hora_fin = parte.hora_fin;
    if (parte.fraccion) fila.fraccion = parte.fraccion;
    if (lista.length) fila.trabajado = lista;
    if (zonasLimpias.length) fila.zonas = zonasLimpias;
    if (firma) fila.firma = firma;
    const { data, error, degradado: d } = await insertarPractica(supabase, fila);
    if (error || !data) {
      // No dejar media sesión: se retiran (borrado suave) las ya creadas
      if (creadas.length) {
        await supabase.from('practicas').update({ deleted: true, updated_at: new Date().toISOString() })
          .in('id', creadas).eq('empresa_id', auth.empresaId);
      }
      handleSupabaseError(error || { message: 'sin id' }, res, 'Error al registrar la clase');
      return;
    }
    if (d) degradado = true;
    creadas.push(data.id);
  }

  // El odómetro del vehículo solo sube
  if (conKm && kmFin > (vehiculo.km_actual || 0)) {
    await supabase.from('vehiculos').update({ km_actual: kmFin, updated_at: new Date().toISOString() }).eq('id', vehiculo.id);
  }

  // Minutos que no llegan a ¼ de clase: quedan acumulados para la próxima
  let errMinutos = null;
  if (porMinutos && acumulado.disponible) errMinutos = await guardarMinutosAlumno(supabase, auth.empresaId, alumno.id, calculo.sobran);

  return res.status(200).json({
    ok: true, practica_ids: creadas, clases: nClases, con_km: conKm, firma_guardada: !!firma && !degradado,
    recorridos: conKm ? kmFin - kmIni : 0, campos_guardados: !degradado,
    minutos_sobrantes: porMinutos && acumulado.disponible && !errMinutos ? calculo.sobran : undefined,
    mensaje: `${nClases === 1 ? 'Clase registrada' : (nClases < 1 ? fmtClases(nClases) + ' de clase registrado' : fmtClases(nClases) + ' clases registradas')} de ${alumno.nombre} el ${fechaCorta(fechaVal.value)}`
  });
}
