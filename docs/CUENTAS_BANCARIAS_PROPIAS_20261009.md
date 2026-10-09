# Cuentas bancarias propias — Módulo 2

Nómina → Cuentas bancarias permite preparar el registro completo, revisar sus cambios con otra identidad habilitada y consultar cada propuesta o decisión anterior. La fuente son los contratos incorporados al padrón propio de MuniControl. Un contrato creado aquí puede registrar su cuenta sin existir en GRH.

Cada cuenta conserva una referencia estable, contrato, banco declarado, CBU, tipo y número de cuenta opcionales, moneda explícita, vigencia civil, estado y referencia de la constancia de titularidad. Los ceros iniciales y los nulos se conservan. La moneda y el tipo no se deducen del CBU. Los controles de sus dos bloques verifican sintaxis, según el [esquema de CBU del BCRA](https://www.argentina.gob.ar/normativa/nacional/comunicaci%C3%B3n-2622-1997-47564/texto); no certifican titularidad ni habilitan un pago.

Dos cuentas habilitadas para un contrato no pueden tener vigencias superpuestas, con fechas inclusivas. Compartir un CBU entre contratos no se prohíbe sin una regla municipal que lo respalde. Las correcciones y retiros crean otra versión revisada: no borran las anteriores ni reasignan una referencia a otro contrato. Una identidad que desaparece de la fuente sólo puede conservar su cuenta intacta o retirarla expresamente.

La búsqueda y las páginas afectan únicamente la presentación. Se prepara y decide el conjunto completo, con versión de la base, fuente y huella de la propuesta. Una fuente o configuración nueva bloquea la aprobación; sigue siendo posible rechazar con fundamento la propuesta anterior. Preparar o revisar exige confirmar primero la vista completa. La misma persona, aunque use otra membresía o correo, no puede revisar su propia propuesta.

Se reutilizan las capacidades vigentes `workforce.employee.read` y `payroll.parameter.read`; preparar requiere `payroll.parameter.prepare` y decidir `payroll.parameter.approve`. No se asignan roles ni se cambia IAM. El actor y el ámbito provienen de la sesión autenticada. SQL149 añade una tabla de eventos inmutable, 14 funciones privadas y cuatro fachadas de runtime. El runtime no puede leer o escribir directamente la tabla. Los límites rechazan el conjunto completo; nunca se trunca una población.

Un envío incierto conserva cuerpo y clave originales. Consultar el intento es una lectura; no genera otro guardado. La revisión posterior de un intento inexistente sólo se habilita después de comprobar su ausencia y recuperar la fuente actual. Ocultar la página, cambiar de tarea, cuenta o permisos retira los datos y la confirmación; una respuesta tardía no los repone. No se guarda la cuenta ni la vista en almacenamiento del navegador.

## Alcance comprobable

Este incremento registra y revisa metadatos bancarios. No incorpora cuentas reales por una orden de desarrollar, genera un archivo para enviar al banco, ejecuta transferencias, calcula haberes ni certifica titularidad. No modifica la liquidación o los recibos aprobados. La salida bancaria nativa desde liquidaciones propias cerradas y su aceptación bancaria son el incremento posterior; Módulo 2 no se declara completo con este registro.

El [diseño oficial GT de Banco Nación](https://www.bna.com.ar/Downloads/InstructivoDisenoDeArchivoPagosGT.pdf) ya está identificado para esa salida. No se habilitan los perfiles históricos observados ni se deducen campos a partir de TXT nominales. La fecha de compensación, convenio del pagador y clasificación del envío deben declararse y validarse; no se inventan. Los importes deberán provenir del neto cerrado, con centavos exactos y rechazo de una precisión incompatible, sin redondeo implícito.

Las pruebas usan exclusivamente identidades y CBUs sintéticos. Se verifican modelo, API, permisos, instalación conservadora, SQL17/18, HTTP real, revisión independiente, recuperación después del COMMIT, páginas completas, filtro, correcciones, revocación, ocultamiento y móvil 320/390. Las pruebas de autenticación son fixtures declarados; no equivalen a la aceptación real de Noelia o del banco.
