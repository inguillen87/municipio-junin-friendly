# Centro de reportes por tarea · 15/09/2026

## Objetivo
Continuar la biblioteca de Noelia sin mezclar los reportes propios de MuniControl con herramientas que todavía controlan archivos externos. Referencia de requisitos: `docs/MATRIZ_ACEPTACION_NOELIA.md`, módulos 1–2 y reunión del 09/09/2026.

## Incremento
- Áreas: Personal, Nómina, Asistencia, Institucional y Controles externos; cada una muestra el número de coincidencias según búsqueda y formato.
- Filtros combinados por área y formato anunciado: PDF, Excel y CSV. No se inventan salidas TXT ni se anuncian formatos que la tarjeta original no ofrece.
- Búsqueda por todas las palabras, independiente de su orden, tildes o puntuación; vocabulario administrativo para mutuales/retenciones, recibos, bancarización, escolaridad, fichadas y F.931.
- Origen visible: datos agregados del corte, liquidaciones conservadas, consulta interna o controles externos. No implica actualización en tiempo real ni aprobación administrativa.
- Acciones nombradas por tarea, controles de 44 px, estado anunciado al lector de pantalla, foco recuperado al limpiar y disposición adaptable a 320/390 px.
- Limpiar búsqueda conserva el área y formato; Restablecer filtros reinicia los tres criterios. Ningún criterio se persiste en almacenamiento del navegador.

Se conservan los doce destinos y el orden original. React sigue limitado al catálogo público: no desmonta paneles, no lee datos privados, no guarda archivos, no llama APIs y no cambia permisos. La biblioteca anterior sigue siendo el respaldo cuando el bundle opcional no carga.

## Validación y publicación
Las 22 pruebas focales de `tests/report-catalog-model.test.js` fueron ejecutadas en el entorno local: 22 aprobadas, cero omitidas. La suite completa, el build y los recorridos del navegador se ejecutan sobre el commit exacto mediante `.github/workflows/noelia-report-workspace.yml`.

El verificador anterior cubre ciclo de montaje, fallback, archivos seleccionados y navegación existente. El nuevo verificador cubre combinaciones de filtros, vocabulario, teclado, historial del navegador, ausencia de resultados y móvil. Todas las APIs del navegador son sintéticas: no se declara una sesión municipal real.

Después de integrar a master, Vercel despliega mediante la integración Git existente. El job `production` compara el controlador público, el código ejecutable del catálogo y su licencia con el build del commit. Sólo se normaliza el nombre variable de la referencia de licencia de esbuild. La evidencia queda en `noelia-report-production.json`; un PR abierto o un build aprobado por sí solos no significan publicación comprobada.

## No incluido
No incorpora nuevas fórmulas, pagos, cierres, exportadores fiscales homologados, imputaciones GAF, lectura IA de certificados, migraciones SQL ni autonomía de relojes. Esos pendientes continúan en sus matrices y directivas. No modifica ni mezcla el PR del monitor PM-10.

## Reversión
Revertir exclusivamente el commit integrado de este incremento. No restaurar bases ni eliminar documentos: no hay cambios de datos ni de esquema. La base de trabajo fue `7c34bede713c7f3769a35252e8f0c836b1ba9c1f`.
