// Genera las páginas legales públicas de AulaMovil en web-remote/legal/:
//   node scripts/paginas-legales.js
// Un solo sitio para los datos del titular y la versión de los textos (la app
// de escritorio pide aceptar las condiciones cuando cambia VERSION_LEGAL: ver
// renderer/legal.js). Textos redactados para España (RGPD, LOPDGDD, LSSI-CE,
// RD 1295/2003). Conviene que los revise un abogado antes de crecer.
const fs = require('fs');
const path = require('path');

const VERSION_LEGAL = '2026-10-07';
const FECHA_TEXTO = '7 de octubre de 2026';
const T = {
  nombre: 'Daniel Alexis Pérez Nicolás',
  nif: '76735508X',
  domicilio: 'Rúa Vicente Risco 1, 1.º B, 32630 Xinzo de Limia (Ourense), España',
  email: 'pzdani04@gmail.com',
  web: 'https://aulamovil.vercel.app',
  marca: 'AulaMovil'
};

const PAGINAS = [
  ['index', 'Información legal'],
  ['aviso-legal', 'Aviso legal'],
  ['privacidad', 'Privacidad'],
  ['cookies', 'Cookies'],
  ['condiciones', 'Condiciones de uso'],
  ['encargo-tratamiento', 'Encargo del tratamiento'],
  ['alumnos', 'Para alumnos'],
];

const mail = `<a href="mailto:${T.email}">${T.email}</a>`;

const CUERPOS = {
  index: `
<h1>Información legal de ${T.marca}</h1>
<p class="version">Versión de los textos: ${FECHA_TEXTO}</p>
<p>${T.marca} es un programa de gestión para autoescuelas (aplicación de escritorio y web para los móviles de los profesores). Aquí están todos sus textos legales:</p>
<ul>
  <li><a href="aviso-legal.html">Aviso legal</a>: quién está detrás de ${T.marca} y cómo contactar.</li>
  <li><a href="privacidad.html">Política de privacidad</a>: los datos que trata ${T.marca} por su cuenta y los que trata por encargo de cada autoescuela.</li>
  <li><a href="cookies.html">Política de cookies y almacenamiento local</a>: lo que la web guarda en el teléfono.</li>
  <li><a href="condiciones.html">Condiciones de uso y contratación</a> del servicio y de la licencia del programa.</li>
  <li><a href="encargo-tratamiento.html">Contrato de encargo del tratamiento</a> (art. 28 RGPD) entre cada autoescuela y ${T.marca}.</li>
  <li><a href="alumnos.html">Información para alumnos</a>: cómo se tratan los datos de los alumnos que usan una autoescuela con ${T.marca}.</li>
</ul>
<p>Contacto para cualquier cuestión legal o de privacidad: ${mail}.</p>`,

  'aviso-legal': `
<h1>Aviso legal</h1>
<p class="version">Última actualización: ${FECHA_TEXTO}</p>
<h2>1. Titular</h2>
<p>En cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE):</p>
<div class="tabla"><table>
<tr><th>Titular</th><td>${T.nombre} (empresario individual)</td></tr>
<tr><th>NIF</th><td>${T.nif}</td></tr>
<tr><th>Domicilio</th><td>${T.domicilio}</td></tr>
<tr><th>Correo electrónico</th><td>${mail}</td></tr>
<tr><th>Sitio web</th><td>${T.web}</td></tr>
<tr><th>Actividad</th><td>Desarrollo y prestación de un servicio de software de gestión para autoescuelas («${T.marca}»).</td></tr>
</table></div>
<p><b>Punto único de contacto</b> (artículos 11 y 12 del Reglamento (UE) 2022/2065, de Servicios Digitales) para autoridades y usuarios: ${mail}, en español.</p>
<h2>2. Objeto</h2>
<p>Este sitio aloja la web de ${T.marca} que usan los profesores de las autoescuelas clientes desde el móvil, el portal del alumno y la información legal del servicio. El acceso a la web de la autoescuela requiere una cuenta facilitada por la autoescuela; su uso se rige por las <a href="condiciones.html">Condiciones de uso y contratación</a>.</p>
<h2>3. Uso del sitio</h2>
<p>Quien accede se compromete a usarlo conforme a la ley y a estos textos, a no intentar acceder a datos de otras autoescuelas, a no introducir programas dañinos y a no sobrecargar el servicio. El titular puede suspender el acceso a quien incumpla estas normas.</p>
<h2>4. Propiedad intelectual e industrial</h2>
<p>El programa ${T.marca}, su código, diseño, textos y marca pertenecen a su titular o se usan con licencia. No se permite copiarlos, distribuirlos ni transformarlos sin autorización, salvo lo permitido por la ley o por las licencias de código abierto de los componentes de terceros (indicados en el propio programa: Ajustes → Legal y privacidad → Licencias de terceros).</p>
<h2>5. Responsabilidad</h2>
<p>El titular procura que el sitio funcione sin interrupciones y sin errores, pero no puede garantizarlo en todo momento (mantenimiento, fallos de proveedores o de las redes). Los datos que cada autoescuela introduce son responsabilidad suya. El titular no responde de los contenidos de sitios de terceros enlazados.</p>
<h2>6. Datos personales y cookies</h2>
<p>Ver la <a href="privacidad.html">Política de privacidad</a> y la <a href="cookies.html">Política de cookies</a>.</p>
<h2>7. Ley aplicable y jurisdicción</h2>
<p>Se aplica la ley española. Para las relaciones con profesionales y empresas, las partes se someten a los juzgados y tribunales de Ourense. Si el usuario fuese consumidor, serán competentes los de su domicilio.</p>`,

  privacidad: `
<h1>Política de privacidad</h1>
<p class="version">Última actualización: ${FECHA_TEXTO}</p>
<div class="nota"><b>Resumen.</b> ${T.marca} trata por su cuenta solo los datos de sus clientes (las autoescuelas) y de las personas que usan sus cuentas. Los datos de los <b>alumnos</b>, profesores y demás personas que cada autoescuela guarda en el programa son de esa autoescuela: ella es la responsable y ${T.marca} los trata solo por encargo suyo (art. 28 RGPD). No vendemos datos, no hay publicidad ni analítica de terceros y los datos se guardan en la Unión Europea.</div>

<h2>1. Responsable</h2>
<p>${T.nombre}, NIF ${T.nif}, ${T.domicilio}. Contacto: ${mail}.</p>

<h2>2. Dos papeles distintos</h2>
<h3>2.1. Como responsable</h3>
<p>Datos de las autoescuelas clientes y de quienes usan sus cuentas: correo electrónico de acceso, contraseña (guardada cifrada mediante una función resumen; nadie puede leerla), datos de facturación del cliente (nombre o razón social, NIF, dirección, correo), mensajes de soporte y datos técnicos (dirección IP, fecha y hora de acceso, registros de errores de los servidores y la suscripción a avisos del navegador del teléfono).</p>
<h3>2.2. Como encargado del tratamiento</h3>
<p>Todo lo que la autoescuela introduce en ${T.marca}: alumnos (identificación, contacto, formación, clases, kilómetros, firmas, exámenes, pagos…), tutores, profesores y personal (incluido su registro de jornada) e interesados. Para estos datos la autoescuela decide para qué y cómo se usan; ${T.marca} solo los guarda y los trata siguiendo sus instrucciones, según el <a href="encargo-tratamiento.html">Contrato de encargo del tratamiento</a>. Si eres alumno, consulta la <a href="alumnos.html">Información para alumnos</a> y dirige tus solicitudes a tu autoescuela.</p>

<h2>3. Finalidades y base jurídica (datos de los que somos responsables)</h2>
<div class="tabla"><table>
<tr><th>Para qué</th><th>Base jurídica (RGPD)</th></tr>
<tr><td>Dar de alta la cuenta, prestar el servicio, soporte y comunicaciones sobre el servicio (cambios, incidencias, avisos de seguridad).</td><td>Ejecución del contrato (art. 6.1.b).</td></tr>
<tr><td>Facturación y obligaciones contables y fiscales.</td><td>Obligación legal (art. 6.1.c).</td></tr>
<tr><td>Seguridad del servicio: proteger las cuentas, detectar accesos indebidos y abusos, mantener registros técnicos.</td><td>Interés legítimo en un servicio seguro (art. 6.1.f).</td></tr>
</table></div>
<p>No se toman decisiones automatizadas con efectos jurídicos ni se elaboran perfiles. No se envían comunicaciones comerciales sin consentimiento.</p>

<h2>4. Conservación</h2>
<p>Mientras se preste el servicio. Al terminar, la autoescuela puede descargar todos sus datos durante 30 días; después se borran de los sistemas activos en un máximo de 90 días, salvo los datos de facturación, que se conservan bloqueados los plazos legales (6 años según el art. 30 del Código de Comercio y 4 años de prescripción tributaria). Los registros técnicos se conservan el tiempo que los guardan los proveedores, como máximo 12 meses.</p>

<h2>5. Proveedores (encargados y subencargados)</h2>
<div class="tabla"><table>
<tr><th>Proveedor</th><th>Para qué</th><th>Dónde / garantías</th></tr>
<tr><td>Supabase Pte. Ltd. (y su infraestructura en Amazon Web Services)</td><td>Base de datos en la nube e inicio de sesión.</td><td>Servidores en Irlanda (UE). Contrato de tratamiento con cláusulas contractuales tipo de la Comisión Europea (Decisión 2021/914) para cualquier acceso desde fuera de la UE.</td></tr>
<tr><td>Vercel Inc.</td><td>Alojamiento de la web y de sus funciones de servidor.</td><td>Funciones ejecutadas en Dublín (Irlanda, UE); archivos estáticos sin datos personales servidos desde su red global. Adherida al Marco de Privacidad de Datos UE-EE. UU. y cláusulas contractuales tipo.</td></tr>
<tr><td>GitHub Inc.</td><td>Descarga de las actualizaciones del programa de escritorio.</td><td>No recibe datos de alumnos; solo datos técnicos de la descarga (IP). Adherida al Marco de Privacidad de Datos UE-EE. UU.</td></tr>
<tr><td>Servicio de notificaciones del navegador del teléfono (Google, Apple o Mozilla, según el dispositivo)</td><td>Entregar los avisos de la clase en curso, si el profesor los activa.</td><td>El contenido del aviso va cifrado de extremo a extremo: el servicio no puede leerlo.</td></tr>
</table></div>
<p>También se comunicarán datos a autoridades y administraciones cuando lo exija una ley.</p>

<h2>6. Transferencias internacionales</h2>
<p>Los datos se guardan en la Unión Europea. Algunos proveedores son empresas de fuera de la UE (EE. UU., Singapur) que podrían acceder técnicamente a ellos; esos accesos están cubiertos por cláusulas contractuales tipo de la Comisión Europea y, en su caso, por el Marco de Privacidad de Datos UE-EE. UU.</p>

<h2>7. Derechos</h2>
<p>Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad escribiendo a ${mail}. Si hace falta comprobar tu identidad, te lo pediremos. Responderemos en el plazo de un mes. También puedes reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" rel="noopener">www.aepd.es</a>, C/ Jorge Juan 6, 28001 Madrid).</p>
<p>Si tus datos están en ${T.marca} porque eres alumno o trabajas en una autoescuela, ejerce tus derechos ante esa autoescuela; si nos llega tu solicitud, se la haremos llegar.</p>

<h2>8. Seguridad</h2>
<p>Conexiones cifradas (HTTPS con HSTS), separación de los datos de cada autoescuela en la propia base de datos (seguridad a nivel de fila), contraseñas guardadas con función resumen, sesiones que se renuevan y se pueden cerrar en todos los dispositivos, credenciales del programa de escritorio cifradas con el sistema operativo, bloqueo opcional del programa con PIN, interfaz aislada del sistema, políticas de seguridad de contenido, historial de cambios, copias de seguridad y actualizaciones automáticas. Detalle en el anexo del <a href="encargo-tratamiento.html#medidas">contrato de encargo</a>.</p>

<h2>9. Menores</h2>
<p>El servicio se dirige a autoescuelas y profesionales. Los datos de alumnos menores de edad los trata la autoescuela, que es quien debe informarles y, cuando proceda, recabar el consentimiento de sus padres o tutores (art. 7 LOPDGDD: los menores de 14 años necesitan el consentimiento de sus padres o tutores).</p>

<h2>10. Cambios</h2>
<p>Si esta política cambia de forma relevante, se avisará en el programa y en esta página con antelación razonable.</p>`,

  cookies: `
<h1>Cookies y almacenamiento local</h1>
<p class="version">Última actualización: ${FECHA_TEXTO}</p>
<div class="nota"><b>${T.marca} no usa cookies.</b> No hay analítica, publicidad ni seguimiento. La web solo guarda en el propio teléfono lo imprescindible para funcionar (la sesión, la clase en marcha y la copia para trabajar sin cobertura) y las preferencias que elige quien la usa. Por eso no aparece ningún aviso de cookies: este almacenamiento está exento de consentimiento (art. 22.2 LSSI-CE y Guía sobre el uso de las cookies de la AEPD).</div>
<h2>Qué se guarda en el teléfono</h2>
<div class="tabla"><table>
<tr><th>Elemento</th><th>Para qué</th><th>Cuánto dura</th></tr>
<tr><td><code>km_sesion</code></td><td>Mantener iniciada la sesión de la cuenta de la autoescuela (claves de acceso firmadas).</td><td>Hasta cerrar sesión.</td></tr>
<tr><td><code>kmalumnos_profesor:…</code></td><td>Recordar qué profesor usa ese teléfono.</td><td>Hasta cambiar de perfil.</td></tr>
<tr><td><code>km_flujo:…</code></td><td>No perder la clase en marcha si se cierra la web o se queda sin batería.</td><td>Hasta terminar la clase.</td></tr>
<tr><td><code>km_vehiculo</code>, <code>km_vehiculo_hoy</code></td><td>Proponer el coche habitual.</td><td>Hasta que se elija otro.</td></tr>
<tr><td><code>km_tema</code>, <code>km_modo_km</code>, <code>km_modo_km_anotar</code>, <code>km_modo_clases</code>, <code>km_n_clases</code>, <code>km_avisos</code>, <code>km_avisos_activos</code></td><td>Preferencias elegidas (tema, cómo se anotan los km y las clases, avisos).</td><td>Hasta cambiarlas o borrar los datos del navegador.</td></tr>
<tr><td><code>km_ultima_cuenta</code>, <code>km_ultimo_email</code></td><td>Saber si entra otra cuenta en ese teléfono (para no mezclar datos) y proponer el correo al iniciar sesión.</td><td>Hasta borrar los datos del navegador.</td></tr>
<tr><td><code>km_instalar_visto</code>, <code>km_avisos_visto</code>, <code>km_mifirma_visto</code></td><td>No repetir avisos ya vistos.</td><td>Hasta borrar los datos del navegador.</td></tr>
<tr><td>Base de datos local <code>aulamovil-offline</code></td><td>Copia de alumnos, coches y jornada para trabajar sin cobertura, y clases pendientes de enviar.</td><td>La copia se borra al cerrar sesión; las clases pendientes, al enviarse.</td></tr>
<tr><td>Caché del «service worker»</td><td>Archivos de la propia web para abrirla sin conexión.</td><td>Hasta la siguiente versión de la web.</td></tr>
<tr><td>Portal del alumno: sesión de inicio de sesión</td><td>Mantener la sesión del alumno si marca «Recordar».</td><td>Hasta cerrar sesión.</td></tr>
</table></div>
<p>Puedes borrar todo esto cerrando sesión y desde los ajustes de tu navegador (borrar datos de sitios). La web no usa recursos de terceros: fuentes, iconos y librerías se sirven desde el propio sitio.</p>`,

  condiciones: `
<h1>Condiciones de uso y contratación</h1>
<p class="version">Versión ${VERSION_LEGAL} · Última actualización: ${FECHA_TEXTO}</p>
<p>Estas condiciones regulan el uso de ${T.marca} (programa de escritorio, web para móviles, portal del alumno y servicio en la nube), prestado por ${T.nombre}, NIF ${T.nif} («el Prestador»), a la autoescuela, centro o profesional que lo contrata («el Cliente»). Al aceptarlas en el programa, el Cliente declara tener capacidad para contratar en nombre de su empresa. El servicio se dirige a profesionales; no se contrata como consumidor.</p>

<h2>1. El servicio</h2>
<p>${T.marca} ayuda a gestionar alumnos, profesores, vehículos, clases y sus kilómetros, cobros, exámenes, agenda, registro de jornada y documentos de la autoescuela, y sincroniza esos datos entre los ordenadores y los móviles del Cliente. Las funciones disponibles y el precio son los de la oferta aceptada por el Cliente.</p>

<h2>2. Cuentas y acceso</h2>
<ul>
<li>El Cliente crea su cuenta de empresa y es responsable de quién la usa y de custodiar la contraseña. Debe usar una contraseña segura (al menos 10 caracteres) y no compartirla fuera de la autoescuela.</li>
<li>Si pierde un dispositivo o una persona deja la autoescuela, debe cerrar la sesión en los demás dispositivos (Ajustes → Cuenta) y, si procede, cambiar la contraseña.</li>
<li>Avisará al Prestador de cualquier uso no autorizado en cuanto lo detecte.</li>
</ul>

<h2>3. Obligaciones del Cliente</h2>
<ul>
<li>Usar ${T.marca} conforme a la ley, en especial el Reglamento de escuelas particulares de conductores (RD 1295/2003), la normativa de tráfico, la de protección de datos y la laboral.</li>
<li>Introducir datos veraces. El Cliente es el único responsable del contenido de los documentos que genere o conserve con el programa: libro de registro de alumnos (art. 39 RD 1295/2003), fichas de formación teórica y práctica (art. 40), contrato de enseñanza (art. 42), registro de jornada, cobros, etc.</li>
<li><b>Kilómetros calculados.</b> Las herramientas que proponen o reparten kilómetros (Cuadrar y generar km, «Los pone la app», compañeros sin registrar) son ayudas para completar datos que faltan a partir del cuentakilómetros real del vehículo. El programa marca esos kilómetros como calculados y la ficha DGT puede señalarlos. El Cliente no las usará para falsear registros y responde de que los documentos oficiales reflejen la realidad.</li>
<li>Informar a sus alumnos, profesores y empleados del tratamiento de sus datos (el programa genera una hoja informativa y un modelo de contrato de enseñanza) y atender sus derechos.</li>
<li>No intentar acceder a datos de otros clientes, eludir las medidas de seguridad, descompilar el programa salvo lo permitido por la ley ni revender el servicio.</li>
</ul>

<h2>4. Datos personales</h2>
<p>El Cliente es responsable del tratamiento de los datos que introduce y el Prestador actúa como encargado según el <a href="encargo-tratamiento.html">Contrato de encargo del tratamiento</a>, que forma parte de estas condiciones. Los datos del propio Cliente se tratan según la <a href="privacidad.html">Política de privacidad</a>.</p>

<h2>5. Disponibilidad, soporte y copias</h2>
<p>El Prestador hará lo razonable para que el servicio esté disponible y corregirá los fallos que se detecten. El programa de escritorio funciona sin conexión y guarda los datos en el propio ordenador; el Cliente debe mantener copias de seguridad (Ajustes → Copias de seguridad) y proteger sus equipos (usuario de Windows con contraseña, cifrado del disco y antivirus). Puede haber paradas por mantenimiento o por fallos de proveedores. Soporte: ${mail}.</p>

<h2>6. Precio y pago</h2>
<p>El precio, la forma de pago y la duración son los indicados en la oferta o factura aceptada por el Cliente, con los impuestos que correspondan. Si no se paga, el Prestador podrá suspender el servicio tras avisar con al menos 15 días, sin perjuicio de que el Cliente pueda descargar sus datos.</p>

<h2>7. Licencia del programa</h2>
<p>Mientras dure el contrato, el Cliente recibe una licencia de uso no exclusiva e intransferible del programa para su autoescuela. El programa se actualiza solo; algunas versiones pueden exigir actualizar para seguir sincronizando. Los componentes de código abierto de terceros mantienen sus propias licencias.</p>

<h2>8. Responsabilidad</h2>
<p>El Prestador responde de los daños que cause por incumplir estas condiciones con dolo o culpa grave. En los demás casos, su responsabilidad se limita al importe pagado por el Cliente en los 12 meses anteriores al hecho. No responde de los daños derivados de datos introducidos por el Cliente, del uso contrario a la ley o a estas condiciones, de la falta de copias de seguridad del Cliente ni de causas ajenas a su control (fallos generales de internet, de la electricidad o de proveedores esenciales).</p>

<h2>9. Duración y baja</h2>
<p>El contrato dura lo indicado en la oferta y se puede dar de baja en cualquier momento escribiendo a ${mail}. Al terminar, el Cliente dispone de 30 días para exportar sus datos (Importar y exportar → Exportar, en Excel, CSV o copia completa); después se borrarán de la nube en un máximo de 90 días. Los datos que estén en los ordenadores del Cliente siguen siendo suyos.</p>

<h2>10. Cambios en las condiciones</h2>
<p>Si estas condiciones cambian, el programa lo avisará y pedirá aceptarlas. Si el Cliente no está de acuerdo, puede darse de baja y exportar sus datos.</p>

<h2>11. Ley y jurisdicción</h2>
<p>Ley española. Juzgados y tribunales de Ourense.</p>`,

  'encargo-tratamiento': `
<h1>Contrato de encargo del tratamiento</h1>
<p class="version">Versión ${VERSION_LEGAL} · Artículo 28 del Reglamento (UE) 2016/679 (RGPD) y artículo 33 de la Ley Orgánica 3/2018 (LOPDGDD)</p>
<p><b>Partes.</b> De una parte, la autoescuela o profesional que usa ${T.marca} («el Responsable»), identificada con los datos de su cuenta y de su centro en el programa. De otra, ${T.nombre}, NIF ${T.nif}, ${T.domicilio} («el Encargado»). Este contrato se acepta en el programa y forma parte de las <a href="condiciones.html">Condiciones de uso y contratación</a>.</p>

<h2>1. Objeto</h2>
<p>El Encargado tratará por cuenta del Responsable los datos personales necesarios para prestar el servicio ${T.marca}: almacenarlos, sincronizarlos entre sus dispositivos, mostrarlos en el programa y en la web, hacer copias técnicas, generar los documentos que el Responsable pida y exportarlos o borrarlos cuando lo indique.</p>

<h2>2. Duración</h2>
<p>La del servicio. Al terminar se aplica la cláusula 11.</p>

<h2>3. Datos e interesados</h2>
<div class="tabla"><table>
<tr><th>Interesados</th><th>Datos</th></tr>
<tr><td>Alumnos (pueden ser menores de edad) y sus tutores</td><td>Identificación (nombre, apellidos, DNI/NIE, fecha y lugar de nacimiento, nacionalidad, sexo, foto si se añade), contacto, domicilio, nº de registro, permisos que tiene y que estudia, estado y fechas de la formación, clases (fecha, hora, coche, profesor, kilómetros, zonas, lo trabajado, observaciones), firma manuscrita digitalizada (solo la imagen: no se guardan datos biométricos de velocidad ni presión), exámenes y tasas, centro médico y restricciones del permiso (pueden ser datos de salud), cobros, pagos y datos de facturación.</td></tr>
<tr><td>Profesores, director y empleados</td><td>Identificación, contacto, DNI, nº y fecha del certificado de profesor, coche habitual, firma digitalizada, clases impartidas y registro de jornada (entradas, salidas y correcciones).</td></tr>
<tr><td>Interesados (posibles alumnos)</td><td>Nombre, contacto, permiso que les interesa, presupuesto y notas.</td></tr>
</table></div>

<h2>4. Instrucciones</h2>
<p>El Encargado tratará los datos solo siguiendo las instrucciones documentadas del Responsable, que son las de este contrato y las que el Responsable da al usar el programa. No los usará para fines propios ni los comunicará a terceros salvo a los subencargados de la cláusula 7 o por obligación legal (en ese caso, avisará antes al Responsable si la ley lo permite). Si considera que una instrucción infringe la ley, lo dirá inmediatamente.</p>

<h2>5. Confidencialidad</h2>
<p>El Encargado guarda secreto sobre los datos, también después de terminar el contrato, y garantiza que las personas autorizadas a tratarlos se han comprometido a la confidencialidad.</p>

<h2 id="medidas">6. Medidas de seguridad (art. 32 RGPD)</h2>
<ul>
<li><b>Cifrado en tránsito:</b> todas las conexiones van por HTTPS/TLS; la web exige HTTPS (HSTS) y aplica políticas de seguridad de contenido.</li>
<li><b>Separación entre clientes:</b> cada autoescuela solo puede leer y escribir sus propios datos; lo impone la base de datos (seguridad a nivel de fila) y no solo el programa.</li>
<li><b>Ubicación:</b> base de datos en Irlanda (UE) y funciones de la web en Dublín (UE).</li>
<li><b>Accesos:</b> contraseñas guardadas con función resumen; sesiones con claves que caducan cada hora y se renuevan con rotación; el Responsable puede cerrar la sesión en todos los demás dispositivos; los datos guardados para trabajar sin cobertura se borran del teléfono al cerrar sesión.</li>
<li><b>Programa de escritorio:</b> interfaz aislada del sistema (sandbox), sin carga de contenido externo, credenciales cifradas con el sistema operativo, bloqueo opcional con PIN y bloqueo tras inactividad, documentos adjuntos sin programas ejecutables.</li>
<li><b>Disponibilidad y recuperación:</b> copias de seguridad locales que el Responsable puede guardar y restaurar, sincronización con la nube y borrados «lógicos» que permiten recuperar errores.</li>
<li><b>Trazabilidad:</b> historial de cambios en el programa, que también anota cada exportación de datos.</li>
<li><b>Derechos:</b> exportación de los datos de un alumno (acceso y portabilidad) y anonimización (supresión) desde el propio programa.</li>
<li><b>Mantenimiento:</b> actualizaciones automáticas, componentes mantenidos y revisión periódica de la seguridad.</li>
</ul>
<p>El Responsable debe proteger sus propios equipos (usuario de Windows con contraseña, cifrado del disco —BitLocker o «Cifrado del dispositivo»—, antivirus y copias) y los móviles de sus profesores (bloqueo de pantalla).</p>

<h2>7. Subencargados</h2>
<p>El Responsable autoriza a los siguientes subencargados, con los que el Encargado tiene contratos con las mismas obligaciones de protección de datos:</p>
<div class="tabla"><table>
<tr><th>Subencargado</th><th>Servicio</th><th>Ubicación y garantías</th></tr>
<tr><td>Supabase Pte. Ltd. (infraestructura de Amazon Web Services)</td><td>Base de datos y autenticación</td><td>Irlanda (UE). Cláusulas contractuales tipo (Decisión (UE) 2021/914) para accesos desde fuera de la UE.</td></tr>
<tr><td>Vercel Inc.</td><td>Alojamiento de la web y funciones de servidor</td><td>Dublín (UE). Marco de Privacidad de Datos UE-EE. UU. y cláusulas contractuales tipo.</td></tr>
</table></div>
<p>El Encargado avisará por correo electrónico con al menos 30 días de antelación de cualquier cambio de subencargados; el Responsable podrá oponerse y, si no hay alternativa, dar por terminado el contrato y exportar sus datos.</p>

<h2>8. Derechos de los interesados</h2>
<p>El Encargado ayudará al Responsable a atender los derechos de los interesados. El programa permite exportar todos los datos de un alumno, corregirlos y anonimizarlos. Si un interesado se dirige al Encargado, este trasladará la solicitud al Responsable en un máximo de 5 días hábiles.</p>

<h2>9. Violaciones de seguridad</h2>
<p>El Encargado notificará al Responsable, sin dilación indebida y como máximo en 48 horas desde que tenga conocimiento, cualquier violación de seguridad de los datos, con la información disponible para que el Responsable pueda, en su caso, notificarla a la AEPD en 72 horas y comunicarla a los interesados.</p>

<h2>10. Otras ayudas</h2>
<p>El Encargado ayudará al Responsable, en la medida de lo posible, con las evaluaciones de impacto y consultas previas, y pondrá a su disposición la información necesaria para demostrar el cumplimiento de este contrato, permitiendo auditorías razonables con aviso previo.</p>

<h2>11. Fin del encargo</h2>
<p>Al terminar, el Responsable puede exportar sus datos durante 30 días. Después, el Encargado los suprimirá de la nube en un máximo de 90 días, incluidas las copias técnicas de los proveedores según sus ciclos, salvo que una ley obligue a conservarlos. Los datos guardados en los equipos del Responsable quedan bajo su control.</p>

<h2>12. Registro y responsabilidad</h2>
<p>El Encargado mantiene el registro de actividades de tratamiento que realiza por cuenta de sus clientes (art. 30.2 RGPD). Cada parte responde de sus propios incumplimientos conforme al artículo 82 RGPD.</p>`,

  alumnos: `
<h1>Información para alumnos</h1>
<p class="version">Última actualización: ${FECHA_TEXTO}</p>
<p>Tu autoescuela usa ${T.marca} para gestionar tu formación: tus datos, tus clases y sus kilómetros, tus exámenes, tus pagos y tu firma de cada clase.</p>
<h2>¿Quién trata tus datos?</h2>
<p><b>Tu autoescuela es la responsable</b>: decide qué datos se recogen y para qué, y es quien te tiene que informar (con la hoja de protección de datos y el contrato de enseñanza que te entrega) y atender tus derechos. ${T.marca} (${T.nombre}, NIF ${T.nif}) solo guarda y trata esos datos por encargo de tu autoescuela, con las medidas de seguridad de su <a href="encargo-tratamiento.html">contrato de encargo</a>.</p>
<h2>¿Para qué?</h2>
<p>Para tu matrícula y tu formación, para cumplir las obligaciones de las autoescuelas (libro de alumnos, fichas de formación y contrato de enseñanza del Reglamento de escuelas de conductores; trámites con Tráfico), para cobrar y facturar y, si das tu permiso, para otras cosas que tu autoescuela te pregunte.</p>
<h2>Tu firma</h2>
<p>Al terminar cada clase firmas en el móvil del profesor. Se guarda solo la imagen de la firma, para acreditar que diste la clase en tu ficha de formación. No se guardan datos biométricos.</p>
<h2>¿Dónde están?</h2>
<p>En los ordenadores de tu autoescuela y en servidores de la Unión Europea (Irlanda).</p>
<h2>¿Cuánto tiempo?</h2>
<p>Lo que dure tu formación y, después, lo que obligan las normas: el libro de alumnos se conserva 4 años y las fichas de formación al menos 2 años (RD 1295/2003); los datos de pagos y facturas, hasta 6 años. Pasado ese tiempo, tu autoescuela puede anonimizarlos.</p>
<h2>Tus derechos</h2>
<p>Puedes pedir a tu autoescuela ver tus datos, corregirlos, borrarlos cuando ya no sean necesarios, limitar u oponerte a algún uso y llevártelos (el programa permite exportarlos). Si no te atienden, puedes reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" rel="noopener">www.aepd.es</a>). Si eres menor de 14 años, tus padres o tutores ejercen estos derechos por ti.</p>`
};

function plantilla(id, titulo, cuerpo) {
  const nav = PAGINAS.map(([p, t]) => `<a href="${p}.html"${p === id ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo} · ${T.marca}</title>
<meta name="description" content="${titulo} de ${T.marca}, programa de gestión para autoescuelas.">
<link rel="icon" href="/logo.png">
<link rel="stylesheet" href="legal.css">
</head>
<body>
<header class="cab"><div class="dentro"><img src="/logo.png" alt=""><a href="/legal/">${T.marca} · Información legal</a></div></header>
<nav class="legal" aria-label="Textos legales">${nav}</nav>
<main>${cuerpo}
</main>
<footer class="pie">${T.marca} · ${T.nombre} · NIF ${T.nif} · ${mail}</footer>
</body>
</html>
`;
}

const dir = path.join(__dirname, '..', 'web-remote', 'legal');
fs.mkdirSync(dir, { recursive: true });
for (const [id, titulo] of PAGINAS) {
  fs.writeFileSync(path.join(dir, id + '.html'), plantilla(id, titulo, CUERPOS[id]), 'utf8');
}
fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ version: VERSION_LEGAL, fecha: FECHA_TEXTO, titular: T }, null, 2) + '\n', 'utf8');
console.log('Páginas legales generadas en', dir);
module.exports = { VERSION_LEGAL, T };
