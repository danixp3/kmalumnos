// web-push simulado: guarda lo que se «envía» y permite fingir suscripciones caducadas.
export const PUSH = { enviados: [], caducadas: new Set(), vapid: null };
export function reiniciarPush() { PUSH.enviados = []; PUSH.caducadas = new Set(); PUSH.vapid = null; }
const webpush = {
  setVapidDetails(sujeto, pub, priv) { PUSH.vapid = { sujeto, pub, priv }; },
  async sendNotification(sub, cuerpo) {
    if (PUSH.caducadas.has(sub.endpoint)) { const e = new Error('Gone'); e.statusCode = 410; throw e; }
    PUSH.enviados.push({ endpoint: sub.endpoint, datos: JSON.parse(cuerpo) });
    return { statusCode: 201 };
  }
};
export default webpush;
