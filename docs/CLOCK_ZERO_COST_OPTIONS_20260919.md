# Relojes: alternativas sin nuevo abono cloud - 19/09/2026

## Restriccion y recomendacion

El requerimiento se limita a marcaciones consultadas varias veces por dia, no video, plantillas biometricas ni acceso en tiempo real. No se autoriza contratar un VPS pago ni ampliar planes. Vercel conserva la aplicacion y Neon la recepcion existente; la conectividad OpenVPN hacia los relojes requiere un ejecutor adecuado.

La opcion gratuita concreta a evaluar es una VM Oracle Cloud Always Free, preferentemente VM.Standard.E2.1.Micro con Ubuntu elegible: 1 GB de memoria, disco persistente dentro de la cuota y direccion publica incluida. Es una instancia de partida para medir lectura por tandas, no una garantia de capacidad del conjunto de 13 relojes. No se migra la base municipal a Oracle: la VM solo aloja VPN/colector/cola.

La documentacion oficial vigente indica hasta dos instancias E2.1.Micro, 200 GB compartidos de volumen y 10 TB/mes de salida dentro de Always Free. El plan de esta etapa utiliza solo una VM pequena y volumen de arranque de 50 GB, sujeto a que esten disponibles y dentro de la cuota real de la cuenta. No usar una VM cubierta solo por los creditos de prueba de 30 dias ni recursos fuera de la region principal.

## Limites que impiden prometer gratuidad con continuidad garantizada

Oracle exige alta/identidad y tarjeta valida; puede realizar retenciones temporales de autorizacion, que no son un cargo de consumo. La capacidad Always Free puede no estar disponible en la region. Oracle puede recuperar instancias consideradas inactivas: observa CPU/red y, en A1, memoria, durante siete dias. Consultar poco no elimina ese riesgo. No se generara carga artificial para evadir esa politica.

El 19/09 se comprobo que el equipo conectado no tenia CLI OCI ni archivo .oci/config. No se creo cuenta, acepto una conversion a pago ni desplego una VM. Se requiere cuenta habilitada, cupo y prueba de conectividad antes de certificar la opcion. Mantener la cuenta en Free y seleccionar exclusivamente recursos Always Free elegibles; verificar por separado disco, IP, backups y salida, sin asumir que toda opcion del panel es gratuita.

## Por que no los otros ejecutores propuestos

Vercel Cron invoca Functions; no importa un perfil OpenVPN ni crea su interfaz TUN. En Hobby cada cron admite frecuencia diaria y precision por hora, no varias invocaciones por dia de ese mismo cron. No se distribuiran jobs para eludir esa restriccion ni se contratara Secure Compute Enterprise para este caso.

Render Free ofrece servicios web/datos limitados, no workers ni cron gratis. El cron tiene minimo USD 1/mes por servicio; el servicio web gratuito se suspende por inactividad y no conserva disco local. No se simulara trafico para mantenerlo despierto ni se presumiran capacidades NET_ADMIN/TUN no comprobadas.

GitHub Actions permite probar conectividad y ofrece minutos incluidos, pero sus terminos limitan el uso de runners al desarrollo/pruebas y al ciclo del software; no se lo ofrece como backend productivo gratuito de marcaciones. Se conserva para CI y pruebas con datos sinteticos. No se subieron certificados, VPN o marcaciones como artifacts de pruebas.

## Operacion propuesta por tandas, aun no activada

Una tarea agrupa todos los equipos habilitados por ronda, en vez de mantener 13 consultas continuas. Propuesta inicial: cuatro rondas diarias a acordar con Personal, usando el modo once ya presente en los lectores. La duracion real, los reintentos y la memoria se miden primero con uno y despues con los restantes; no se calculan minutos cloud como si cada reloj fuera un servidor separado.

VPN con rutas limitadas, validacion del servidor y credenciales privadas; captura sin borrar el reloj; cola durable antes de enviar; acuse de Vercel/Neon antes de marcar entregado; deduplicacion por dispositivo. Un reinicio, fallo de cron o caida de red no debe convertir la falta de lectura en ausencia de un empleado. El modulo registra ultima captura y ultimo acuse, no un estado online inventado. No se cambia el criterio de licencias, tardanzas o haberes por esta programacion.

La frecuencia por tandas es un cambio de operacion a verificar, no una solucion al ruteo faltante. Los 13 son el objetivo de cobertura: los puntos sin IP/ruta, serie validada, inscripcion o remitente siguen pendientes. Las delegaciones wifi quedan fuera hasta su relevamiento. La periodicidad se configura sin dos colectores simultaneos para la misma serie.

La alternativa sin nuevo abono y con recursos existentes sigue siendo VM/servidor/router municipal adecuado. No requiere otra PC de escritorio personal; si no hay recurso compatible, requiere aprovisionamiento o hardware. Las pruebas finales de independencia deben hacerse con la PC de Marcelo apagada. Nada de esto fue activado por publicar este documento.

## Fuentes oficiales consultadas

- OCI Always Free, formas/cuotas/recuperacion: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- OCI Free Tier, tarjeta y distincion Always Free/prueba: https://www.oracle.com/cloud/free/
- Vercel Cron: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Render gratuito: https://render.com/docs/free
- Render Cron: https://render.com/docs/cronjobs
- GitHub Actions, terminos vigentes 27/08/2026: https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features

Las cuotas y condiciones deben revisarse al aprovisionar; no se consideran invariantes del producto.
