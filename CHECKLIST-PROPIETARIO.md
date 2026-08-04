# Checklist del propietario — cosas que solo puedes hacer tú

_Registro vivo de tareas que requieren tu cuenta, tus credenciales o una decisión tuya. Yo (el asistente) NO las hago solo. Al final revisamos esto junto. Última actualización: 2026-08-05._

## Ahora mismo (para que el portal del alumno funcione end-to-end)

- [ ] **Supabase → Authentication → Providers → Email:** activar el inicio de sesión con **código de un solo uso (OTP)**.
- [ ] **Supabase → Authentication → Email Templates:** en la plantilla de *Magic Link / OTP*, incluir el placeholder **`{{ .Token }}`** para que al alumno le llegue el código de 6 dígitos.
- [ ] **Poner email a los alumnos** que vayan a usar el portal (campo "Email" ya disponible en el alta/edición del alumno en la app). Para la prueba, basta con poner tu propio correo en un alumno.
- [ ] _(Opcional, producción)_ **SMTP propio** en Supabase Auth: el SMTP por defecto tiene un límite bajo; para volumen real de alumnos hace falta configurar uno propio (SendGrid, Resend, etc.).
- [ ] _(Opcional, recomendado)_ **Supabase → Authentication:** activar "Leaked Password Protection" (lo marca el linter de seguridad).

## Decisiones de negocio pendientes

- [ ] **Precios y planes** del SaaS (horquilla objetivo 39–79 €/mes por módulos; ver `ROADMAP-SAAS.md`).
- [ ] **Qué módulos** ofrecer en el plan base vs. premium.

## Futuro (cuando lleguen esas funciones)

- [ ] **VeriFactu:** contratar una API certificada (p.ej. VerifactuAPI.es o Facturware) y darme las credenciales para integrarla. Ver `INVESTIGACION-AUES-VERIFACTU.md`.
- [ ] **Pagos online:** cuenta de Stripe (rápido) y/o alta de TPV Virtual Redsys con tu banco (comisiones más bajas).
- [ ] **AUES (DGT):** certificado electrónico de la autoescuela + escribir a `soportecau@dgt.es` para el alta en el Web Service. Ver `INVESTIGACION-AUES-VERIFACTU.md`.
- [ ] **Firma digital:** elegir proveedor OTP (Signaturit/Viafirma) si se quiere firma del contrato.

## Hecho ✔

- [x] Aplicar las 4 migraciones del SaaS en Supabase (roles/sucursales, módulos, email alumno, portal). — hecho 2026-08-05, datos verificados intactos.
- [x] Activar el módulo `portal_alumno` para la autoescuela principal. — hecho 2026-08-05.
