// Portal del alumno (Fase 0 · Bloque 2 de ROADMAP-SAAS.md): paso 1 del
// login por email OTP. A diferencia del resto de endpoints de esta
// carpeta, este NO pasa por requireAuth/getSupabase(token) de _utils.js:
// el alumno todavía no tiene sesión, precisamente está pidiendo el
// código para conseguirla. Se usa un cliente Supabase "plano" con la
// anon key (ver getSupabaseAnon), igual que hacía el antiguo
// alumno-portal.js con el enfoque de portal_token (descartado, ver
// migraciones/2026-08-05_portal_alumno.sql para el porqué del cambio).
//
// SIMETRÍA DE RESPUESTA ANTI-ENUMERACIÓN: este endpoint responde
// SIEMPRE el mismo 200 con el mismo mensaje genérico, exista o no un
// alumno con ese email y haya ido bien o mal el envío del código. Así
// no se puede usar este formulario para averiguar qué correos están
// dados de alta como alumnos (mismo motivo por el que "¿olvidaste tu
// contraseña?" de cualquier web seria responde igual en ambos casos).
//
// POST /api/alumno-solicitar-codigo   body: { email }
//
// PRERREQUISITOS DE SUPABASE (pendientes de confirmación del
// propietario, nadie los aplica desde aquí — solo documentación):
//   (a) Authentication → Providers → Email: tener habilitado el inicio
//       de sesión por email OTP ("Enable Email OTP" o equivalente
//       vigente en la versión del panel).
//   (b) Authentication → Email Templates: que la plantilla de "Magic
//       Link"/OTP incluya el placeholder `{{ .Token }}` en el cuerpo,
//       para que al alumno le llegue el código de 6 dígitos (no solo
//       un enlace mágico).
//   (c) Authentication → Settings → SMTP Settings: revisar los límites
//       de envío del SMTP por defecto de Supabase (bajo, pensado para
//       pruebas) — para volumen real de alumnos hará falta SMTP propio.
//
// SIN TEST UNITARIO A PROPÓSITO: ninguno de los endpoints de web-remote/api
// tiene tests unitarios hoy (son funciones serverless de Vercel, ES modules,
// y la suite de Jest del proyecto solo corre en modo CommonJS sobre tests/ —
// forzar un transform de ESM para un único archivo no compensa). Cómo
// probar a mano tras desplegar y aplicar la migración + los 3
// prerrequisitos de arriba:
//   curl -X POST https://aulamovil.vercel.app/api/alumno-solicitar-codigo \
//     -H "Content-Type: application/json" \
//     -d '{"email":"alumno-real@ejemplo.com"}'
//   → 200 { ok:true, msg:'Si el correo corresponde a un alumno, te
//     hemos enviado un código.' } y, si el email es de un alumno real
//     y los prerrequisitos están aplicados, un correo con un código de
//     6 dígitos.
// Casos de error a probar a mano:
//   - email con formato inválido ("no-es-un-email") → 400.
//   - migración no aplicada (función RPC inexistente) → 503.
//   - email de alguien que no es alumno → mismo 200 genérico, sin correo.
import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders } from './_utils.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cliente con la anon key, sin token de usuario: el alumno todavía no
// tiene sesión. Las RPC/llamadas de Auth usadas aquí son accesibles con
// la anon key (alumno_email_existe está concedida a `anon`;
// signInWithOtp es la operación estándar de Supabase Auth para pedir un
// código, pensada para llamarse sin sesión previa).
function getSupabaseAnon() {
  return createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const email = req.body && req.body.email;
  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ ok: false, error: 'Email no válido' });
  }
  const emailNormalizado = email.trim();

  const RESPUESTA_GENERICA = { ok: true, msg: 'Si el correo corresponde a un alumno, te hemos enviado un código.' };

  try {
    const supabase = getSupabaseAnon();

    const { data, error } = await supabase.rpc('alumno_email_existe', { p_email: emailNormalizado });

    if (error) {
      // La función RPC todavía no existe (migración 2026-08-05 no aplicada):
      // degradación limpia, no un 500 feo. Código típico de Postgres para
      // "función inexistente" es 42883; PostgREST lo envuelve con PGRST202.
      if (error.code === '42883' || error.code === 'PGRST202' || /alumno_email_existe/i.test(error.message || '')) {
        return res.status(503).json({ ok: false, error: 'Portal no disponible' });
      }
      // Cualquier otro error real de RPC: se loguea pero NO se revela al
      // cliente (misma respuesta genérica que si todo hubiera ido bien,
      // para no filtrar si el email es o no de un alumno).
      console.error('Error en alumno_email_existe', error);
      return res.status(200).json(RESPUESTA_GENERICA);
    }

    if (data === true) {
      const { error: errorOtp } = await supabase.auth.signInWithOtp({
        email: emailNormalizado,
        options: { shouldCreateUser: true }
      });
      if (errorOtp) {
        // No cambiamos la respuesta al cliente ni con éxito ni con
        // fallo del envío: la simetría anti-enumeración es más
        // importante que informar de un fallo puntual de envío.
        console.error('Error en signInWithOtp', errorOtp);
      }
    }

    return res.status(200).json(RESPUESTA_GENERICA);
  } catch (err) {
    console.error('Error inesperado en alumno-solicitar-codigo', err);
    return res.status(200).json(RESPUESTA_GENERICA);
  }
}
