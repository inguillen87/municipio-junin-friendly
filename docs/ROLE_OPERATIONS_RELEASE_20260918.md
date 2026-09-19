# Operacion por perfiles y exportacion juridica - 18/09/2026

## Cambios funcionales

El Registro normativo incorpora dos acciones nuevas, reutilizando la API municipal autenticada existente:

- Exportar pagina CSV: exporta exclusivamente la pagina visible, con sus filtros aplicados, total informado, version documental, referencia interna y fecha UTC. Vuelve a consultar antes de descargar. Si el conjunto cambio, presenta la pagina actualizada y exige revisarla. No usa un texto de busqueda escrito pero todavia sin aplicar ni descarga otras paginas silenciosamente.
- Exportar ficha HTML imprimible: vuelve a consultar la misma norma y version, comprueba que la ficha no cambio y prepara un documento imprimible con identificacion, procedencia, fechas declaradas, articulos, historial, responsable y SHA-256 del PDF original. Una version historica queda marcada. No es el original, una copia certificada, una firma digital ni un dictamen juridico.

La ficha exportada no contiene JavaScript ni dependencias remotas. Usa una politica restrictiva de contenido, escape de texto y estilos para impresion A4. El CSV delimita y entrecomilla celdas y neutraliza valores interpretables como formulas. El usuario elige exportar; no se envia documentacion a servicios externos.

## Inicio de trabajo y permisos

Se amplian los accesos de Mi trabajo hoy: preparar parametros, revisar parametros, comparar liquidaciones, consultar presupuesto aprobado y abrir superadministracion. Los destinos apuntan a los circuitos existentes, no a formularios nuevos incompletos.

Preparacion y revision de parametros exigen por separado su capacidad especifica, lectura del parametro y acceso a nomina. Comparacion exige payroll.read; presupuesto exige budget.approved.read. Superadministracion exige PLATFORM_OWNER y una capacidad administrativa de plataforma explicita; el nombre visible, correo o rol de etiqueta nunca los sustituyen.

La actualizacion de capacidades ahora conserva las capacidades y roles de plataforma informados por el evento y retira accesos cuando se revocan. Los enlaces desaparecen de la estructura del documento, no solo visualmente. No se concede ni altera ningun permiso municipal. El backend sigue decidiendo cada lectura o mutacion.

Esto beneficia a los perfiles de Mariano, Noelia, Hugo y al propietario segun sus capacidades efectivas. No se codificaron nombres de usuarios ni se dio por probado el acceso real de esas personas usando sesiones sinteticas.

## Verificacion local

Regresion de la aplicacion: 3.710 pruebas aprobadas, cero fallos u omisiones. Compilacion completa aprobada con la base Node 24 existente. El paquete juridico ocupa 97.881 bytes gzip, dentro del limite vigente de 100.000, sin aumentar el presupuesto ni agregar dependencias.

Navegador local: 22 comprobaciones del registro juridico (incluidas las nuevas exportaciones), 9 del inicio por capacidades, 8 de parametros salariales y 6 de licencias: 45 controles. Se comprobaron 320/390 px, foco y teclado, historicos, filtros aplicados, concurrencia, permisos de solo lectura y revocacion. Se reviso visualmente la ficha movil.

La interfaz y los parsers se ejecutaron realmente, pero las sesiones y respuestas de datos municipales de estos recorridos fueron sinteticas e interceptadas. No hubo escrituras reales de legajos, normas, liquidaciones o aprobaciones. Estos resultados no certifican una liquidacion ni sustituyen pruebas de negocio con usuarios autorizados.

Los ensayos y capturas quedan locales. El cambio de la expectativa de un test anterior consiste solo en incluir el nuevo acceso de consulta Comparacion; se conserva el control que prohibe acciones de mutacion en perfiles de lectura.

## Alcance del despliegue

Entrega agrupada de interfaz y pruebas, para publicar por GitHub/Vercel. El estado final se verifica por separado con SHA del commit, resultado del despliegue y comprobacion de los archivos publicados. Las pruebas posteriores sobre la interfaz publicada continuan interceptando toda API privada y no usan credenciales municipales.

No cambia conexiones, roles, esquemas de base, planes ni cuotas. No activa septiembre, no realiza el corte a PostgreSQL 18 ni separa todavia el historico. La aplicacion puede recibir estas mejoras sobre su base operativa actual. Tampoco incorpora un modulo nuevo de expedientes o contratos, ni una nueva mesa completa de tareas: se amplian los circuitos existentes y la exportacion documental.

Las consultas adicionales ocurren al exportar por accion explicita; no hay sondeo periodico ni solicitudes de datos por abrir los nuevos accesos. La nueva ficha se entrega como HTML imprimible para que no se confunda con el PDF fuente o una firma digital.
