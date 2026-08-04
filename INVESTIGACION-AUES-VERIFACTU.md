# Informe de viabilidad — AUES (DGT), VeriFactu, firma y pagos

_Fase 0 · Bloque 4. Investigación sin código, realizada el 2026-08-04. Fuentes al final. Las fechas y requisitos legales deben reconfirmarse con un asesor antes de comunicarlos a clientes._

## Resumen para decidir

- **AUES (DGT): viable pero con fricción real.** La DGT expone un **Web Service** oficial para que software de terceros tramite las pruebas de aptitud. No es una API pública abierta: hay que solicitar el alta a la DGT (`soportecau@dgt.es`), pasar por su entorno de pruebas y luego a producción, y cada operación se firma con un **certificado electrónico** (admitido por @firma) a nombre de un usuario autorizado. Es una barrera de entrada — y por eso, una ventaja para quien la cruza. Dribo lo hizo. **Es alcanzable; requiere tiempo y trámite, no un imposible técnico.**
- **VeriFactu: resuelto vía proveedor, no construir desde cero.** Existen varias APIs españolas ya certificadas (VerifactuAPI.es, Facturhello, Binovo, ZeroComa, Facturware...). Varias actúan como **"colaborador social" de la AEAT**, lo que significa que nuestros clientes **no necesitan su propio certificado digital** — el proveedor se encarga de firmar, encadenar, poner el QR y enviar a Hacienda. Integración estimada por ellos en **≈15 días**. Esto es exactamente la vía recomendada: rápida, sin riesgo legal de implementarlo mal, y cubre también TicketBAI (País Vasco/Navarra) con la misma API.
- **Firma y pagos: estándar y baratos de integrar.** Firma OTP (código por SMS/email) es válida legalmente (eIDAS + Ley 6/2020) y suficiente para contratos de autoescuela; la biométrica añade peso probatorio si se prevén disputas. Para cobrar, **Redsys** (el TPV de los bancos españoles) tiene comisiones muy bajas (<0,5% frente al 1,4–2,9% de Stripe) pero integración más laboriosa; **Stripe** integra en horas. Recomendación: soportar ambos, Redsys como opción económica para el cliente.

## 1. AUES — conexión con la DGT

**Qué es.** La Aplicación Universal de Expedientes es la plataforma de la DGT para tramitar telemáticamente las pruebas de aptitud (exámenes) de los alumnos: consultar si un alumno es "tramitable" para un permiso, crear el expediente/solicitud, obtener justificante en PDF, etc.

**Tres vías de acceso** (según la Sede Electrónica de la DGT):
1. **Aplicación web** con certificado electrónico — manual, sin integración; sirve de plan B.
2. **Web Service** — la vía que nos interesa: la DGT expone un servicio web para integrar software de terceros por Internet.
3. **Registro Electrónico** con plantillas — el método más manual.

**Requisitos de la vía Web Service:**
- **Certificado electrónico** emitido por una CA admitida por @firma, **a nombre de un usuario previamente autorizado** en el sistema AUES.
- **Desarrollo propio** que hable con el servicio (previsiblemente SOAP/WSDL; hay que pedir las especificaciones a la DGT).
- **Alta y homologación:** contactar con `soportecau@dgt.es`, integrar contra el **entorno de pruebas** de la DGT y, superado, pasar a **producción**.
- Recomendable estar dado de alta en la **Dirección Electrónica Vial (DEV)**.

**Operaciones que ofrece:** consultar tramitabilidad (devuelve además filiación, domicilio, permisos que ya tiene el alumno — útil para autocompletar), y cursar la solicitud de prueba (crea expediente, requiere tasa 2.1 abonada previamente, devuelve justificante PDF).

**Encaje con nuestro SaaS multi-empresa (importante):** cada autoescuela tiene su propio certificado y usuario autorizado. Nuestra arquitectura debe **almacenar y usar el certificado de cada empresa de forma segura** (dato muy sensible) y firmar en su nombre. Esto refuerza que AUES sea un **módulo contratable** aparte, con onboarding asistido (ayudar al cliente a obtener el certificado y darse de alta).

**Siguiente paso concreto (cuando toque):** escribir a `soportecau@dgt.es` pidiendo la documentación técnica del Web Service (WSDL, esquemas, acceso al entorno de pruebas) y el procedimiento de autorización de usuario. Es gratis y no compromete a nada — solo así sabremos el esfuerzo real de desarrollo.

## 2. VeriFactu — facturación antifraude

**Marco:** Ley 11/2021 + RD 1007/2023 (modificado por RD 254/2025). Como **fabricantes de software** debemos cumplir ya; nuestros **clientes** tienen hasta 2027 (personas jurídicas 1-ene-2027, autónomos 1-jul-2027) — reconfirmar con asesor.

**Decisión clara: integrar una API certificada, no construirlo.** Hacerlo desde cero implicaría firma XAdES, hash encadenado, XML conforme al esquema oficial, SOAP con la AEAT, gestión de estados, almacenamiento inmutable y todos los tipos de factura (F1–F3, R1–R5) con sus reglas. Riesgo legal y meses de trabajo. Los proveedores lo resuelven: nuestra app manda los datos de la venta en JSON y ellos devuelven XML firmado + QR + estado.

**Candidatos a evaluar** (todos con API REST y sandbox):
- **VerifactuAPI.es (Binovo):** colaborador social AEAT, sandbox ilimitado sin tarjeta ni certificado, "listo en <15 días", cubre TicketBAI foral con la misma API.
- **Facturhello:** JSON→XML+firma+QR+envío; opción de usar su certificado como colaborador social; webhooks, reintentos, hosting UE (RGPD).
- **ZeroComa:** ISO 27001, gestiona los cambios normativos por nosotros.
- **Facturware (verifactu.one):** enterprise, multi-tenant (encaja con SaaS), SDK Java + API REST.

**Criterio de elección para nuestro caso:** que sea **colaborador social** (para que los clientes no necesiten certificado propio) y **multi-tenant / multi-empresa** (una integración, muchas autoescuelas). VerifactuAPI.es y Facturware puntúan alto en ambos. Falta comparar **precios** (ninguno publicado en esta investigación) — pedir presupuesto por volumen de facturas.

**Aviso recogido:** conectar la API no garantiza cumplir toda la ley (encadenamiento, trazabilidad, requisitos formales). Hay que validar el flujo completo, idealmente con el asesor fiscal.

## 3. Firma digital del contrato

- **OTP** (código por SMS/email): válida (eIDAS + Ley 6/2020), ágil, suficiente para contratos de consumo como la matrícula.
- **Biométrica** (trazo en pantalla táctil): mayor peso probatorio; la jurisprudencia la acepta si se demuestra el proceso y se conservan los datos biométricos.
- **Proveedores con API REST:** Signaturit, Viafirma, entre otros. Integrables en la web del alumno.
- **Recomendación:** empezar por **OTP** en el portal del alumno (barato, rápido, legal); ofrecer biométrica como opción más adelante.

## 4. Pagos online

- **Redsys:** TPV virtual de los bancos españoles (BBVA, Santander, CaixaBank, Sabadell...). **Comisiones <0,5%**, gran ahorro para el cliente. Contra: integración laboriosa (redirección + claves test/producción del banco), incluye SCA/3D Secure obligatorio.
- **Stripe:** integración en horas, ideal internacional/multidivisa, comisión mayor (~1,4%+).
- **Recomendación:** soportar ambos como pasarela configurable (igual que hace Drovify "en 1 minuto"); el cliente elige. Empezar por **Stripe** para el piloto (rapidez) y añadir **Redsys** como opción económica antes de vender.

## Implicaciones para el roadmap

1. **AUES y VeriFactu son módulos contratables independientes** — refuerza la decisión de arquitectura por módulos (Bloque 1 en curso).
2. **Ninguno se construye "desde cero" en su parte crítica:** VeriFactu vía colaborador social; firma y pago vía pasarelas/proveedores con API. AUES sí requiere desarrollo propio contra el Web Service de la DGT, pero es acotado (2 operaciones principales).
3. **Onboarding = producto:** obtener certificado (AUES), dar de alta el TPV (Redsys) y configurar el proveedor VeriFactu son fricciones del cliente que podemos convertir en servicio asistido (diferenciador "cumplimiento sin dolores de cabeza").
4. **Gestión segura de certificados por empresa** pasa a ser un requisito de seguridad de primer nivel del SaaS (afecta a AUES y, si el cliente usa el suyo, a VeriFactu).

## Fuentes

- [Sede Electrónica DGT — Solicitud de prueba de aptitud para autoescuelas](https://sede.dgt.gob.es/es/permisos-de-conducir/tramites-para-empresas/autoescuelas/solicitud-de-prueba-de-aptitud/)
- [Dribo — Conectar tu autoescuela al sistema AUES de la DGT](https://dribo.es/blog/ahorra-tiempo-conectando-tu-autoescuela-al-sistema-aues-de-la-dgt)
- [AUES, ¿qué es y para qué sirve? — Autopista](https://www.autopista.es/noticias-motor/aues-dgt-que-es-sirve-ecn_287707_102.html)
- [Practicavial — El programa AUES](https://practicavial.com/novedades-de-la-dgt-conoces-el-programa-aues/)
- [VerifactuAPI.es (Binovo)](https://www.apiverifactu.es/) · [Facturhello — API VeriFactu](https://facturhello.es/api-verifactu/) · [ZeroComa — VeriFactu para desarrolladores](https://www.zerocoma.com/soluciones-transformacion-digital/verifactu-para-desarrolladores/) · [Facturware](https://verifactu.one/)
- [Signaturit — Firma OTP vs biométrica](https://www.signaturit.com/es/blog/firmas-electronicas-otp-vs-firma-biometrica-2/) · [Viafirma](https://www.viafirma.com/en/digital-signatures/)
- [Redsys — Tipos de integración](https://pagosonline.redsys.es/desarrolladores-inicio/documentacion-tipos-de-integracion/modulos-pago/) · [Stripe vs Redsys — MantPress](https://mantpress.com/blog/stripe-redsys-diferencias/)
