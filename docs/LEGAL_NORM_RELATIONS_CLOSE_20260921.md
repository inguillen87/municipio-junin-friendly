# Relaciones normativas: cierre de verificación local

La cancelación no llegaba a la pantalla de confirmación porque la preparación
agregaba campos de creación a un comando de cambio de estado. El validador
estricto lo rechazaba. La revisión ahora normaliza cada comando con sus campos
exactos, tanto para declarar como para cancelar o reabrir una relación.

## Comportamiento verificado

- La persona revisa tipo, fundamento, motivo, normas y artículos antes de guardar.
  Fuente y destino quedan vinculados a las versiones documentales elegidas,
  aunque después aparezca una versión más reciente.
- Una confirmación concurrente no abre dos intentos. Una respuesta perdida se
  consulta o reenvía con la misma clave. Un rechazo definitivo vuelve al
  formulario y conserva el motivo.
- Un cambio de secuencia exige una nueva revisión; una pérdida de permisos
  descarta los datos privados y cancela las consultas en curso.
- Limpiar o fallar al consultar el destino deshabilita la revisión y conserva el
  resto de los datos; nunca reutiliza un destino anterior oculto.
- La API comprueba identidad y versión de cada respuesta, y exige historial
  consecutivo completo y comprobantes compatibles con el comando revisado.

## Correcciones de la migración 090

La variable local de relación usa un nombre distinto de las columnas SQL para
evitar errores de ambigüedad en historial y cambios de estado. Una reapertura
aplica la misma prohibición de duplicados activos que una creación, dentro del
bloqueo transaccional existente. La comparación de artículos coincide con la
búsqueda de artículos, incluyendo mayúsculas y espacios.

Los comandos nulos se rechazan. Los límites de entrada y salida de cada norma
impiden guardar relaciones que luego excederían la capacidad de su lista.
Los eventos siguen siendo inmutables; cancelación y reapertura agregan revisiones.

## Evidencia local al 21 de septiembre de 2026

- `npm run build` con el cierre de Alertas integrado: 3.961 pruebas aprobadas, controles de plataforma y aislamiento
  aprobados, compilación estática aprobada.
- `node --test tests/legal-norm-relations.test.js`: 14 pruebas aprobadas.
- `node scripts/verify-legal-norm-relations-browser.mjs`: 13 escenarios aprobados,
  incluida la revisión a 1.440, 390 y 320 píxeles.
- Regresión integrada: 12 recorridos de Alertas y 17 del historial de acciones.
  La espera de publicación del historial ahora comprueba también el archivo
  compartido de permisos, y conserva la causa original si un recurso falla.
- El navegador intercepta todas las API y mantiene sus casos sintéticos sólo en
  memoria. No crea registros municipales persistentes.
- Se generaron sin conexión los ensayos SQL de PostgreSQL 17 y 18: 64 controles
  previstos por versión, incluida la concurrencia entre dos conexiones. El flujo
  de CI los ejecuta en servicios descartables y exige la reversión del esquema
  de ensayo. La generación local no equivale a su ejecución.

Estos resultados acreditan código local. La ejecución SQL real, CI y publicación
se deben registrar con su evidencia propia antes de atribuirles el mismo estado.

“Modifica”, “deroga” y los demás tipos son declaraciones humanas expresas.
Este circuito no calcula vigencia jurídica, no infiere derogaciones, no modifica
liquidaciones ni acredita firma, validez o notificación de una norma.
