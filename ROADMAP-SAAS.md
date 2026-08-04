# Roadmap SaaS — AulaMovil

_Decidido el 2026-08-04 con el propietario, a partir de la investigación de mercado (`ANALISISPROGRAMAS.md`, Downloads). Este documento es la fuente de verdad del rumbo del producto; el estado fino de cada tarea vive en CLAUDE.md → Estado actual._

## Visión

AulaMovil pasa de "app de una autoescuela" a **SaaS modular para autoescuelas españolas**: un núcleo de gestión (lo ya construido) y módulos contratables por empresa, con precio transparente y sin permanencia (horquilla objetivo 39–79 €/mes, por debajo de Drovify en el plan base).

**Decisiones tomadas (2026-08-04):**
1. **Empezar por los cimientos multi-empresa** (migración pendiente + sistema de módulos contratables).
2. **Modelo híbrido:** la app de escritorio sigue siendo el centro de gestión; todo lo nuevo orientado al alumno/cliente nace en web. La web crece con el tiempo sin romper el escritorio.
3. **Comercial:** perfeccionar con la autoescuela propia como piloto; salir a vender cuando la Fase 0 esté redonda.

## Ventaja competitiva (por qué nos elegirían)

1. Inteligencia real de prácticas (km, anti-solapamiento, y en el futuro GPS + predicción de aptitud) — nadie lo combina hoy.
2. Cumplimiento normativo llave en mano (VeriFactu + RGPD; AUES si resulta viable).
3. Precio transparente + migración fácil desde el competidor.

## Módulos previstos

| Módulo | Fase | Notas |
|---|---|---|
| Núcleo (gestión, prácticas/km, multi-sucursal, sync, web móvil) | Hecho | Incluido siempre |
| Multi-empresa + contratación de módulos (entitlements) | 0 | Cimiento de todo el SaaS |
| Portal del alumno (reserva, pago online, firma digital) | 0 | PWA sobre web-remote ampliada |
| Facturación VeriFactu | 0 | Vía API certificada de terceros como "colaborador social" (cliente sin certificado propio); no construir desde cero. Candidatos: VerifactuAPI.es, Facturware. Obligación fabricante desde jul-2025, clientes 2027 |
| Conexión DGT (AUES) | 0* | *Viable vía Web Service oficial (requiere certificado @firma + alta en `soportecau@dgt.es` + homologación). Ver `INVESTIGACION-AUES-VERIFACTU.md`. Módulo contratable con onboarding asistido |
| Telemetría GPS + consumo por vehículo | 1 | Apalanca la fortaleza en km |
| Semáforo de examen (predicción de aptitud con IA) | 1 | Diferenciador único en España |
| Relleno automático de cancelaciones | 1 | Recupera ingresos perdidos |
| Comunicaciones automáticas (WhatsApp/SMS/email) | 1 | Recordatorios, cobros, caducidades |
| Migración 1-clic desde competidores | 2 | Gancho de captación |
| Analítica predictiva de negocio | 2 | Ingresos, ocupación, riesgo de abandono |
| Marketing integrado / web comercial | 2 | Estilo Drovify |
| CAP / ADR (permisos profesionales) | 2 | Upsell premium |

## Fase 0 — Producto vendible

- **Bloque 1 · Cimientos multi-empresa (APLICADO 2026-08-05):** migración roles/sucursales + módulos contratados aplicadas y verificadas en Supabase (datos intactos). App activa/desactiva funciones vía `moduloActivo`. Módulo `portal_alumno` activado para la empresa principal.
- **Bloque 2 · Portal del alumno v1 (APLICADO 2026-08-05, capa "Ver"):** login por email + código OTP, ver prácticas en solo lectura, gateado por módulo. Migraciones aplicadas. Falta config Supabase Auth (email OTP + plantilla) para que llegue el código.
- **Bloque 2 · Agenda/reservas v1 (2026-08-05):** modelo "solicitudes de práctica" (reserva = cita con estado solicitada/confirmada/cancelada/realizada). Tabla `reservas` APLICADA en Supabase (RLS por empresa). Capa de datos+sync+IPC y pantalla de Agenda en la app (crear/confirmar/cancelar/realizar/editar/borrar) hechas. Pendiente: que el alumno SOLICITE reservas desde el portal (necesita el portal Auth activo), y avisos. Después: pago online (Stripe), firma (OTP).
- **Bloque 3 · Facturación VeriFactu:** comparar proveedores de API certificada españoles, integrar emisión de facturas con QR y encadenado desde Pagos.
- **Bloque 4 · Investigación AUES/VeriFactu (HECHO, 2026-08-04):** informe completo en `INVESTIGACION-AUES-VERIFACTU.md`. Conclusiones: AUES viable por Web Service (certificado + alta DGT + homologación); VeriFactu vía colaborador social; firma OTP y pagos Stripe/Redsys por API. Próximo paso material: escribir a `soportecau@dgt.es` para pedir specs del Web Service (gratis, no compromete).

## Reglas permanentes

- **INVARIANTE:** todo debe seguir funcionando en modo clásico (sin migración aplicada) hasta que se decida lo contrario. Detección en runtime.
- Soft delete siempre en remoto; nunca borrar filas en Supabase.
- Cualquier cambio en Supabase de producción, releases o borrado de datos → confirmación explícita del propietario antes.
- Fechas normativas (VeriFactu 2027, etc.) reconfirmar con asesor fiscal antes de comunicarlas a clientes.
