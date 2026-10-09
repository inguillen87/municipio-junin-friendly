# M7 · Fecha declarada de liquidación

El operador declara período, fecha y tipo antes de guardar un nuevo cálculo propio. Puede elegir expresamente el último día del período; no se presupone una fecha. La fecha identifica ese cálculo, se conserva en su captura inmutable y aparece en el historial, el resultado, el resumen individual y el CSV completo. La continuación después de anular vuelve a consultar el comprobante y prepara los contratos afectados con la fecha original, sin enviar otro cálculo automáticamente.

La fecha no es la fecha técnica de guardado ni una fecha de pago. Las reglas aprobadas del motor siguen aplicándose al período; este incremento no agrega fórmulas diarias, prorrateos ni normas salariales. Los importes y su precisión conservan su representación original.

El cuerpo nuevo es `own-payroll-run-command.v2`, con `liquidationDate` civil ISO exacta y obligatoria; la captura es `own-payroll-run.v2`. Las capturas e intentos v1 conservan cuerpo, clave, fuentes y resultados sin cambios. Sus vistas indican fecha no declarada. La compatibilidad admite completar un intento v1 pendiente con su contenido original; no puede distinguirse de un cliente antiguo que aún use v1. El formulario actual crea exclusivamente v2.

SQL145 agrega una fachada de metadatos v2 y adapta tres cuerpos de funciones existentes mediante composición de fuentes verificadas: captura, serialización y comprobación de disponibilidad de la adopción. Conserva las firmas y ACL existentes, todas las tablas y filas, el bootstrap v1 y el hash del motor. La nueva fachada usa los mismos controles de sesión y ámbito; no devuelve personas ni importes. Se instala antes de publicar la aplicación para conservar la compatibilidad de los clientes existentes. Los clientes antiguos deben recargar para consultar capturas nuevas v2.

Las verificaciones usan PostgreSQL 17 y 18 sintéticos con contratos propios y adoptados, transacciones confirmadas y conexiones independientes. Comprueban reversión ante fallas, conservación, repetición sin efectos, fechas imposibles, reintentos inmutables, anulación, cierre y revocación. El navegador comprueba escritorio y móvil, datos retirados al ocultar la página y respuesta perdida. No se ejecutan decisiones salariales municipales en estas pruebas.

Queda pendiente la anulación consolidada de varias corridas del mismo período/tipo. La fecha declarada no completa todo M7, no adopta el padrón real y no acredita homologación salarial ni aceptación de Noelia.
