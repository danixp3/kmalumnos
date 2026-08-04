# Propuesta — Fase 0 · Bloque 2: Portal del alumno

_Borrador para revisar cuando vuelvas. Nada de esto está implementado; son decisiones de producto que necesito que tomes antes de trocear el trabajo. Redactado el 2026-08-04._

## Idea

Ampliar la web del móvil (`web-remote`, ya desplegada en Vercel) para que **el alumno tenga su propia cuenta** y, desde el teléfono, vea su progreso y gestione sus prácticas. Es el módulo más "vendible" del catálogo y el que el mercado español ya da por obligatorio.

Hoy `web-remote` es una web de **registro rápido para el profesor/autoescuela** (login por PIN). El portal del alumno es una **cara nueva** de esa misma web: login por alumno, no por PIN de empresa.

## Lo que propongo construir, por capas (de menos a más riesgo)

1. **Ver (solo lectura).** El alumno entra y ve: sus prácticas hechas, kilómetros, próximas clases agendadas, saldo de horas y de dinero. Cero riesgo, mucho valor percibido, y reutiliza datos que ya tenemos.
2. **Reservar / cancelar.** El alumno pide o anula una práctica contra la disponibilidad real del profesor. Aquí aparece la agenda (que aún no existe como tal) — es la pieza más grande.
3. **Pagar.** Compra de packs de prácticas online (Stripe primero, Redsys después). Requiere el módulo de pagos y afecta a facturación (enlaza con VeriFactu).
4. **Firmar.** Firma del contrato de matrícula por OTP. Independiente, se puede añadir al final.

Mi recomendación: **empezar por la capa 1 (Ver)** como primer entregable real del portal — es rápido, seguro, se puede enseñar a autoescuelas como demo, y no bloquea nada. Las capas 2-4 se planifican después con su propio bloque.

## Decisiones que necesito de ti (a la vuelta)

1. **¿Alcance del primer entregable?** Mi recomendación: solo "Ver". Alternativa: "Ver + Reservar" de una (más potente pero bastante más trabajo, porque hay que construir la agenda del profesor primero).
2. **¿Cómo entra el alumno?** Opciones: (a) el alumno se registra con su email y la autoescuela lo vincula a su ficha; (b) la autoescuela le genera un acceso (código/enlace) y el alumno solo pone una contraseña. La (b) es más simple y más segura para empezar.
3. **¿La agenda del profesor la construimos ahora o después?** Reservar prácticas exige que exista una agenda con disponibilidad. Hoy no la hay como tal. Es un módulo en sí mismo. Decidir si entra en Fase 0 o se pospone.

## Dependencias técnicas ya identificadas

- Se apoya en los **cimientos multi-empresa** (Bloque 1): cada alumno pertenece a una empresa; el portal debe filtrar por empresa igual que el resto.
- **Seguridad:** el portal del alumno es acceso público a datos personales → hay que definir RLS específico para el rol "alumno" en Supabase (hoy solo existen jefe/empleado). Esto es diseño nuevo, lo detallaré cuando elijas el alcance.
- Pagos y firma son **módulos contratables aparte** (un cliente podría querer el portal sin cobro online).

## Siguiente paso propuesto

Cuando me digas el alcance del primer entregable (recomiendo "Ver") y cómo entra el alumno (recomiendo acceso generado por la autoescuela), monto el plan atómico y lo ejecuto. Mientras, el Bloque 1 sigue pendiente solo del **ensayo en Supabase**, que haré en cuanto me confirmes que puedo aplicar las migraciones en una rama de prueba.
