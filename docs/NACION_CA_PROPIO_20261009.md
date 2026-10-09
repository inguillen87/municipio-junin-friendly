# Nación: caja de ahorro y control de la emisión completa

En Nómina → Salida bancaria, Banco Nación permite elegir expresamente **Caja de ahorro Banco Nación** o **Todos los destinos del convenio GT**, además de J42/J55. La primera selección atiende REP-03 y el criterio de caja de ahorro de la matriz de Noelia. La segunda conserva el alcance general del exportador anterior y debe declararse como tal. No hay una opción Nación cuenta corriente presentada como equivalente al pedido.

La selección Nación usa la entidad 011 del CBU aprobado y el tipo CA de la cuenta aprobada vigente en la fecha elegida. El rótulo libre del banco no decide destinos. El tipo, número de cuenta, moneda y vigencia no se deducen del CBU. La jurisdicción continúa tomada de cada participación original del cierre propio.

Una cuenta ausente en cualquier recibo o un tipo Nación no informado —también en otra página o jurisdicción— impide garantizar un TXT completo. Las otras entidades y cuentas corrientes conservan su fila y motivo de selección. Sus observaciones siguen visibles; no se las confunde con pagos del subconjunto elegido. Los CBU compartidos entre tipos o jurisdicciones requieren la decisión expresa de conservar cada recibo por separado. No se consolidan contratos.

El TXT conserva el [diseño BNA GT de 200 posiciones](https://www.bna.com.ar/Downloads/InstructivoDisenoDeArchivoPagosGT.pdf), con centavos exactos y sin redondeo. Sólo incluye todas las filas seleccionadas, con cantidad y total conciliados. El nombre declara jurisdicción y destinos; búsqueda y páginas no afectan los bytes.

El Excel agrega la selección y su motivo a las 34 columnas del control propio: 38 columnas y tres hojas, con toda la emisión, grupos completos por repartición/banco/tipo/jurisdicción y procedencia. El CSV conserva toda la emisión, perfil y trazabilidad, además de entidad, tipo, motivo y metadatos aprobados. Identificadores, ceros y netos se preservan como texto literal; no hay fórmulas de planilla. Los controles permiten descargar observaciones de una fuente aprobada vigente, aunque éstas impidan el TXT; una fuente no autorizada, retirada o con identidad cambiada no habilita el Excel.

Cada descarga sigue siendo voluntaria y vuelve a consultar sesión, emisión, todos los cierres originales y cuentas antes y después de preparar bytes. Cambiar destinos, perfil, decisión de revisión, cuentas o fuentes invalida la revisión. Se retiran vista, consentimiento y datos al ocultar la página, cambiar tarea, sesión o permisos. No hay otro guardado, API, tabla, migración o almacenamiento del navegador.

Fuentes pertinentes: módulo original Datos municipales/Reportes, páginas 1–2, y `MATRIZ_ACEPTACION_NOELIA.md`. Las muestras privadas GT_PAGOS de agosto observadas tienen destino 011; no se reproducen datos ni se renombra ese diseño como Santander. El perfil Santander tiene otra estructura y requiere su propio cierre de conformidad. No se activa una remesa o pago por generar un archivo.

Este incremento completa la selección y control Nación propio. La aceptación por Noelia y el banco, las otras salidas fiscales/bancarias y el objetivo integral de autonomía municipal siguen pendientes.
