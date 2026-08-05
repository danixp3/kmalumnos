# Checklist del propietario — cosas que solo puedes hacer tú

_Registro vivo de tareas que requieren tu cuenta, tus credenciales o una decisión tuya. Yo (el asistente) NO las hago solo. Al final revisamos esto junto. Última actualización: 2026-08-05._

## Ahora mismo (para que el portal del alumno funcione end-to-end)

Se eligió **enlace mágico** (el alumno pulsa un enlace en el correo, no teclea código) — funciona sin SMTP propio.

- [x] **Supabase → Authentication → Providers → Email:** proveedor de email activado (ya estaba). ✓
- [x] **Supabase → Authentication → URL Configuration → Redirect URLs:** `https://aulamovil.vercel.app/alumno.html` añadida. ✓ (hecho por el propietario, 2026-08-05)
- [x] **Poner email a los alumnos:** hecho (al menos un alumno con email para la prueba). ✓ (hecho por el propietario, 2026-08-05)
_(Nada más obligatorio aquí: la parte "para que funcione" está completa.)_

## Para revisar en la app cuando quieras (opcional, no bloquea nada)

- [x] **Agenda** revisada y mejorada con tus peticiones (2026-08-05): duración de clase configurable en Ajustes (45 min por defecto), la reserva se define por "nº de prácticas" (calcula la duración sola), y al marcar "realizada" se crean solas esas prácticas para el alumno (km a 0, para rellenar). ✓
- [x] **Portal del alumno probado de punta a punta y funcionando** ✓ (2026-08-05): correo → enlace → ver prácticas. Confirmado por el propietario.

## Decisiones de negocio pendientes

- [ ] **Precios y planes** del SaaS (horquilla objetivo 39–79 €/mes por módulos; ver `ROADMAP-SAAS.md`).
- [ ] **Qué módulos** ofrecer en el plan base vs. premium.

## Futuro (cuando lleguen esas funciones)

- [ ] _(Aplazado por el propietario, posible plan de pago de Supabase)_ **SMTP propio** (para código de 6 dígitos o alto volumen de correo) y **Leaked Password Protection**.
- [ ] **VeriFactu:** contratar una API certificada (p.ej. VerifactuAPI.es o Facturware) y darme las credenciales para integrarla. Ver `INVESTIGACION-AUES-VERIFACTU.md`.
- [ ] **Pagos online:** cuenta de Stripe (rápido) y/o alta de TPV Virtual Redsys con tu banco (comisiones más bajas).
- [ ] **AUES (DGT):** certificado electrónico de la autoescuela + escribir a `soportecau@dgt.es` para el alta en el Web Service. Ver `INVESTIGACION-AUES-VERIFACTU.md`.
- [ ] **Firma digital:** elegir proveedor OTP (Signaturit/Viafirma) si se quiere firma del contrato.

## Hecho ✔

- [x] Aplicar las 4 migraciones del SaaS en Supabase (roles/sucursales, módulos, email alumno, portal). — hecho 2026-08-05, datos verificados intactos.
- [x] Activar el módulo `portal_alumno` para la autoescuela principal. — hecho 2026-08-05.
