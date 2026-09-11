# Sprint 048 · detalle de haberes y retenciones

## Cierre de integración
Se integra el detalle sobre el directorio con activos por defecto. La vista histórica permanece accesible y el grupo de nómina depende del período, no del número de activos. Las descripciones, cantidades, categorías y centavos se conservan del respaldo. Los resúmenes anteriores no se sobrescriben.

## Traslado privado
El extractor separa las corridas. Cada JSON se cifra localmente con OpenPGP/AES256; solamente los archivos cifrados se transfieren al almacenamiento privado. Los enlaces de lectura de duración limitada y las claves se registran en tablas privadas de Neon por un operador propietario. El ejecutor público sólo conoce los identificadores de trabajos expresamente autorizados y obtiene contadores; no recibe datos, URLs firmadas ni claves. La API obtiene la ubicación desde Neon, impone HTTPS y un host exacto, prohíbe redirecciones y limita tiempo/tamaño. Comprueba longitud y SHA-256 del cifrado antes de enviarlo al receptor que valida hash, conteos y origen del JSON descifrado. Un reenvío devuelve el comprobante anterior, sin duplicar ni editar importes. Las claves se eliminan del trabajo al aplicarlo. GET no ejecuta importaciones.

Este mecanismo es un traslado inicial controlado del respaldo, no el colector de relojes ni una tarea periódica de nómina. Una descarga temporal no queda en el código, las capturas de CI, ni los archivos públicos del sitio.

## Documentos
PDF y Excel del mismo detalle, descuentos primero, contribuciones patronales separadas, control de centavos explícito y fuente/corte visibles. No firma de Noelia ni certificación oficial; ese paso requiere el circuito DOC-01. No tasas o entidades inventadas. No se altera la nómina municipal ni el GRH original.

## Evidencia exigida
Pruebas globales, browser sintético, controles negativos de traslado y privilegios, origen/hash/conteos de cada corrida, consultas agregadas de conciliación. La prueba pública de rechazo sin sesión no equivale al ingreso real de un funcionario.
