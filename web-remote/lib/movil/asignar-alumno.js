// Un profesor se queda con un alumno desde el móvil (ficha del alumno → «Asignármelo» o
// «Pasármelo»): para cuando en la oficina todavía no se le ha puesto profesor o el alumno se
// cambia de profesor. Hace lo mismo que el cambio de profesor del escritorio
// (db/alumnos.js: cambiarProfesorAlumno): lo ya dado se queda con quien lo dio y lo que viene es
// del nuevo. Las clases del alumno sin profesor propio se atan ahora (las de antes de hoy al
// profesor que tenía, si tenía; las de hoy en adelante al nuevo), así un cambio posterior no las
// mueve y la ficha DGT sale una por profesor, cada una con quien dio esas clases.
//   POST { alumno_id, profesor_id, profesor_antes, hoy }
// `profesor_antes` = el profesor que el teléfono cree que tiene el alumno (null = ninguno): el
// profesor confirmó sabiendo eso. Si en la nube es otro (lo cambió la oficina u otro teléfono
// mientras tanto) → 409 `profesor_cambiado` con el de verdad, para que vuelva a confirmar.
// Repetir la petición (doble toque, mala cobertura) → 200 `sin_cambios`.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, withRetry, handleSupabaseError, nombreCompleto
} from '../../api/_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const b = req.body || {};
  const aVal = validators.positiveInt(b.alumno_id, 'alumno_id');
  if (!aVal.valid) return res.status(400).json({ error: aVal.error });
  const pVal = validators.positiveInt(b.profesor_id, 'profesor_id');
  if (!pVal.valid) return res.status(400).json({ error: pVal.error });
  let esperado = null;
  if (b.profesor_antes != null && b.profesor_antes !== '') {
    const v = validators.positiveInt(b.profesor_antes, 'profesor_antes');
    if (!v.valid) return res.status(400).json({ error: v.error });
    esperado = v.value;
  }
  const hoy = /^\d{4}-\d{2}-\d{2}$/.test(b.hoy || '') ? b.hoy : new Date().toISOString().slice(0, 10);

  const [rA, rP] = await Promise.all([
    withRetry(() => supabase.from('alumnos').select('id, nombre, primer_apellido, segundo_apellido, profesor_id')
      .eq('id', aVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle()),
    withRetry(() => supabase.from('profesores').select('id, nombre')
      .eq('deleted', false).eq('empresa_id', auth.empresaId))
  ]);
  if (handleSupabaseError(rA.error, res, 'Error al leer el alumno')) return;
  if (handleSupabaseError(rP.error, res, 'Error al leer los profesores')) return;
  const alumno = rA.data;
  if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
  const profesores = rP.data || [];
  const nombreDe = id => { const p = profesores.find(x => x.id === id); return p ? p.nombre : null; };
  const nuevo = pVal.value;
  if (!nombreDe(nuevo)) return res.status(404).json({ error: 'Profesor no encontrado' });

  const antes = alumno.profesor_id || null;
  const respuesta = extra => ({
    ok: true, alumno_id: alumno.id, alumno_nombre: nombreCompleto(alumno),
    profesor_id: nuevo, profesor_nombre: nombreDe(nuevo), ...extra
  });
  if (antes === nuevo) return res.status(200).json(respuesta({ sin_cambios: true, conservadas: 0, nuevas: 0 }));
  const cambiado = actual => res.status(409).json({
    error: actual ? `Ahora ${nombreCompleto(alumno)} va con ${nombreDe(actual) || 'otro profesor'}.` : `${nombreCompleto(alumno)} ahora no tiene profesor.`,
    codigo: 'profesor_cambiado', profesor_id: actual, profesor_nombre: actual ? nombreDe(actual) : null
  });
  if (antes !== esperado) return cambiado(antes);

  const ahora = new Date().toISOString();
  // Clases sin profesor propio de un tramo de fechas → `quien`; devuelve cuántas.
  const atar = async (quien, desdeHoy) => {
    let q = supabase.from('practicas').update({ profesor_id: quien, updated_at: ahora })
      .eq('alumno_id', alumno.id).eq('empresa_id', auth.empresaId).eq('deleted', false).is('profesor_id', null);
    q = desdeHoy ? q.gte('fecha', hoy) : q.lt('fecha', hoy);
    const { data, error } = await q.select('id');
    return { n: (data || []).length, error };
  };

  // Orden pensado para que un fallo a medias nunca atribuya clases a quien no las dio:
  // 1) lo de antes de hoy, a quien lo dio (es a quien ya se le atribuía);
  let conservadas = 0;
  if (antes) {
    const r = await atar(antes, false);
    if (handleSupabaseError(r.error, res, 'Error al guardar las clases del profesor anterior')) return;
    conservadas = r.n;
  }
  // 2) el alumno, solo si sigue con el profesor que se vio (otro teléfono pudo cambiarlo a la vez);
  let upd = supabase.from('alumnos').update({ profesor_id: nuevo, updated_at: ahora })
    .eq('id', alumno.id).eq('empresa_id', auth.empresaId).eq('deleted', false);
  upd = antes ? upd.eq('profesor_id', antes) : upd.is('profesor_id', null);
  const { data: hechos, error: errU } = await upd.select('id');
  if (handleSupabaseError(errU, res, 'Error al asignar el alumno')) return;
  if (!hechos || !hechos.length) {
    const { data: ahoraEs } = await supabase.from('alumnos').select('profesor_id')
      .eq('id', alumno.id).eq('empresa_id', auth.empresaId).maybeSingle();
    if (ahoraEs && ahoraEs.profesor_id === nuevo) return res.status(200).json(respuesta({ sin_cambios: true, conservadas, nuevas: 0 }));
    return cambiado(ahoraEs ? ahoraEs.profesor_id || null : null);
  }
  // 3) lo de hoy en adelante, al nuevo (si esto fallara, igualmente se le atribuye por ser su profesor).
  const r3 = await atar(nuevo, true);
  return res.status(200).json(respuesta({
    profesor_antes: antes, profesor_antes_nombre: antes ? nombreDe(antes) : null,
    conservadas, nuevas: r3.error ? 0 : r3.n
  }));
}
