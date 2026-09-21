# Documentos de expediente - Fase 2A - 20/09/2026

PDF privado e inmutable vinculado a expediente. Cada archivo conserva SHA-256, páginas, procedencia, tipo, motivo, actor y fecha. Una corrección crea otra versión por supersedes_document_id; nunca sobreescribe bytes.

Tipos: original, antecedente, respuesta, informe y otro. Una serie mantiene su tipo.

Límites iniciales: 2 MiB y 30 páginas por PDF, 100 documentos por expediente, 500 por municipio y 16 MiB totales por municipio. El límite protege Neon y se amplía sólo con métricas reales.

Lectura requiere legal.norm.read; carga/versionado legal.norm.register, sesión gestionada y MFA/recovery. No hay UPDATE/DELETE/TRUNCATE ni acceso directo del rol aplicativo.

No se incorpora OCR, firma digital, vigencia jurídica o efectos de nómina en esta fase.