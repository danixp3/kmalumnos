// Redirige '@supabase/supabase-js' al Supabase simulado para probar los endpoints
// sin red ni base de datos. Uso: npm run test:api (node --import ./web-remote/tests/register.mjs --test ...).
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
