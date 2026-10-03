// Avisos de la práctica en el móvil (Web Push). El teléfono guarda aquí su
// suscripción y programa sus avisos («quedan 5 min», «hora de terminar», «sigue
// abierta»); Supabase (pg_cron, cada 30 s) llama a /api/avisos-enviar cuando
// hay alguno vencido y este endpoint los manda con web-push. Así llegan con la
// pantalla apagada o la app cerrada: los temporizadores de una web no corren
// en segundo plano. Migración: migraciones/2026-10-03_avisos_push.sql.
//
// POST /api/avisos (con sesión):
//   { accion: 'suscribir', suscripcion: {endpoint, keys:{p256dh, auth}}, profesor_id }
//   { accion: 'programar', endpoint, practica_id, avisos: [{tipo, enviar_en, titulo, cuerpo, etiqueta}] }
//      (sustituye los pendientes de esa práctica en ese teléfono; [] = quitarlos)
//   { accion: 'probar', endpoint }   → aviso inmediato a este teléfono
//   { accion: 'baja', endpoint }     → deja de recibir avisos
// POST /api/avisos-enviar (cabecera x-avisos-secreto = AVISOS_SECRETO): envía los vencidos.
import webpush from 'web-push';
import { setCorsHeaders, requireAuth, getSupabase, getSupabaseAnon, handleSupabaseError, validators } from '../../api/_utils.js';

const MAX_AVISOS = 6;
const HORIZONTE_MS = 12 * 3600 * 1000;
const TIPOS = ['antes', 'fin', 'recordatorio', 'prueba'];
const txt = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

function configurarVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://aulamovil.vercel.app', pub, priv);
  return true;
}

function endpointValido(e) {
  if (typeof e !== 'string' || e.length > 1000) return false;
  try { return new URL(e).protocol === 'https:'; } catch { return false; }
}

// Manda un aviso. Devuelve { ok } o { caducada: true } si el servicio de push
// dice que esa suscripción ya no existe (app desinstalada, permiso quitado).
async function enviar(sub, datos) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(datos), { TTL: 900, urgency: 'high' });
    return { ok: true };
  } catch (e) {
    const st = e && e.statusCode;
    return st === 404 || st === 410 ? { ok: false, caducada: true } : { ok: false, error: (e && e.message) || 'error' };
  }
}

export default async function avisos(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);
  const b = req.body || {};

  if (b.accion === 'suscribir') {
    const s = b.suscripcion || {}, k = s.keys || {};
    if (!endpointValido(s.endpoint) || typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100) {
      return res.status(400).json({ error: 'Suscripción no válida' });
    }
    const prof = b.profesor_id == null ? { valid: true, value: null } : validators.positiveInt(b.profesor_id, 'profesor_id');
    const { error } = await supabase.from('push_suscripciones').upsert({
      empresa_id: auth.empresaId, endpoint: s.endpoint, p256dh: k.p256dh, auth: k.auth,
      profesor_id: prof.valid ? prof.value : null, user_agent: txt(req.headers['user-agent'], 200), actualizada: new Date().toISOString()
    }, { onConflict: 'empresa_id,endpoint' });
    if (error && /push_suscripciones|does not exist|PGRST205/i.test(`${error.message} ${error.code}`)) return res.status(501).json({ error: 'Los avisos aún no están disponibles', codigo: 'avisos_no_disponibles' });
    if (handleSupabaseError(error, res, 'Error al activar los avisos')) return;
    return res.status(200).json({ ok: true });
  }

  if (!endpointValido(b.endpoint)) return res.status(400).json({ error: 'Falta el teléfono (endpoint)' });

  if (b.accion === 'programar') {
    const pid = validators.positiveInt(b.practica_id, 'practica_id');
    if (!pid.valid) return res.status(400).json({ error: pid.error });
    const lista = Array.isArray(b.avisos) ? b.avisos : [];
    if (lista.length > MAX_AVISOS) return res.status(400).json({ error: `Como mucho ${MAX_AVISOS} avisos por práctica` });
    const ahora = Date.now();
    const filas = [];
    for (const a of lista) {
      const t = Date.parse(a && a.enviar_en);
      if (!TIPOS.includes(a && a.tipo) || !Number.isFinite(t) || t < ahora - 60000 || t > ahora + HORIZONTE_MS) {
        return res.status(400).json({ error: 'Aviso no válido' });
      }
      filas.push({
        empresa_id: auth.empresaId, endpoint: b.endpoint, practica_id: pid.value, tipo: a.tipo,
        enviar_en: new Date(t).toISOString(), titulo: txt(a.titulo, 80) || 'AulaMovil', cuerpo: txt(a.cuerpo, 200), etiqueta: txt(a.etiqueta, 60) || null
      });
    }
    const { error: errDel } = await supabase.from('avisos_push').delete()
      .eq('empresa_id', auth.empresaId).eq('endpoint', b.endpoint).eq('practica_id', pid.value).is('enviado_en', null);
    if (handleSupabaseError(errDel, res, 'Error al programar los avisos')) return;
    if (filas.length) {
      const { error } = await supabase.from('avisos_push').insert(filas);
      if (handleSupabaseError(error, res, 'Error al programar los avisos')) return;
    }
    return res.status(200).json({ ok: true, programados: filas.length });
  }

  if (b.accion === 'probar') {
    if (!configurarVapid()) return res.status(503).json({ error: 'Los avisos no están configurados en el servidor', codigo: 'avisos_no_configurados' });
    const { data: sub, error } = await supabase.from('push_suscripciones').select('endpoint, p256dh, auth')
      .eq('empresa_id', auth.empresaId).eq('endpoint', b.endpoint).maybeSingle();
    if (handleSupabaseError(error, res, 'Error al probar los avisos')) return;
    if (!sub) return res.status(404).json({ error: 'Este teléfono no tiene los avisos activados', codigo: 'sin_suscripcion' });
    const r = await enviar(sub, { titulo: 'Avisos activados', cuerpo: 'Así te avisará AulaMovil durante las prácticas.', etiqueta: 'prueba', tipo: 'prueba' });
    if (r.caducada) {
      await supabase.from('push_suscripciones').delete().eq('empresa_id', auth.empresaId).eq('endpoint', b.endpoint);
      return res.status(410).json({ error: 'El teléfono ya no acepta avisos: vuelve a activarlos', codigo: 'sin_suscripcion' });
    }
    if (!r.ok) return res.status(502).json({ error: 'No se pudo enviar el aviso de prueba' });
    return res.status(200).json({ ok: true });
  }

  if (b.accion === 'baja') {
    await supabase.from('avisos_push').delete().eq('empresa_id', auth.empresaId).eq('endpoint', b.endpoint).is('enviado_en', null);
    const { error } = await supabase.from('push_suscripciones').delete().eq('empresa_id', auth.empresaId).eq('endpoint', b.endpoint);
    if (handleSupabaseError(error, res, 'Error al desactivar los avisos')) return;
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Acción no válida' });
}

// Lo llama la tarea de pg_cron de Supabase. Sin sesión de usuario: las
// funciones SECURITY DEFINER comprueban el mismo secreto (guardado en Vault).
export async function enviarAvisos(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const secreto = process.env.AVISOS_SECRETO;
  if (!secreto || req.headers['x-avisos-secreto'] !== secreto) return res.status(401).json({ error: 'No autorizado' });
  if (!configurarVapid()) return res.status(503).json({ error: 'Faltan las claves VAPID' });
  const supabase = getSupabaseAnon();
  const { data, error } = await supabase.rpc('tomar_avisos_vencidos', { p_secreto: secreto });
  if (error) { console.error('avisos-enviar:', error.message); return res.status(500).json({ error: 'No se pudieron leer los avisos' }); }
  let enviados = 0, fallidos = 0, caducadas = 0;
  for (const a of data || []) {
    const r = await enviar(a, { titulo: a.titulo, cuerpo: a.cuerpo, etiqueta: a.etiqueta || 'practica-en-curso', tipo: a.tipo, practica_id: a.practica_id });
    if (r.ok) enviados++;
    else if (r.caducada) { caducadas++; await supabase.rpc('quitar_suscripcion', { p_secreto: secreto, p_endpoint: a.endpoint }); }
    else fallidos++;
  }
  return res.status(200).json({ ok: true, enviados, fallidos, caducadas });
}
