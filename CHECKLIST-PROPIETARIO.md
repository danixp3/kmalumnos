# Checklist del propietario — cosas que solo puedes hacer tú

_Registro vivo de tareas que requieren tu cuenta, tus credenciales o una decisión tuya. Yo (el asistente) NO las hago solo. Al final revisamos esto junto. Última actualización: 2026-08-05._

## Ahora mismo (para que el portal del alumno funcione end-to-end)

Se eligió **enlace mágico** (el alumno pulsa un enlace en el correo, no teclea código) — funciona sin SMTP propio.

- [x] **Supabase → Authentication → Providers → Email:** proveedor de email activado (ya estaba). ✓
- [ ] **Supabase → Authentication → URL Configuration → Redirect URLs:** añadir `https://aulamovil.vercel.app/alumno.html` (o el comodín `https://aulamovil.vercel.app/**`). Sin esto, el enlace del correo no vuelve a la página correcta.
- [ ] **Poner email a los alumnos** que vayan a usar el portal (campo "Email" en el alta/edición del alumno en la app). Para la prueba, pon tu propio correo en un alumno.
- [ ] _(Opcional, futuro)_ **SMTP propio** en Supabase Auth: solo hace falta si algún día quieres el flujo de *código de 6 dígitos* en vez de enlace, o para volumen alto de correos (el SMTP por defecto tiene límite bajo).
- [ ] _(Opcional, recomendado)_ **Supabase → Authentication:** activar "Leaked Password Protection" (lo marca el linter de seguridad).

## Para revisar en la app cuando quieras (opcional, no bloquea nada)

- [x] **Agenda** revisada y mejorada con tus peticiones (2026-08-05): duración de clase configurable en Ajustes (45 min por defecto), la reserva se define por "nº de prácticas" (calcula la duración sola), y al marcar "realizada" se crean solas esas prácticas para el alumno (km a 0, para rellenar). ✓
- [ ] _(Cuando esté el correo del portal configurado)_ Probar el **portal del alumno** de punta a punta: poner tu email en un alumno, entrar en `aulamovil.vercel.app/alumno.html`, recibir el código y ver las prácticas.

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
