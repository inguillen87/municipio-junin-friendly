# Noelia · cierre funcional de los reportes 2026-09-26

## Perfil efectivo en producción
La membresía productiva de Noelia (noelia@junin.com) está activa bajo MUNICIPIO_ADMIN_OPERATIVO y publica 89 capacidades efectivas. No tiene denegaciones explícitas y el chequeo tenant_iam_assert_no_sod_conflict pasa sin conflicto.

Comparación observada:
- Noelia contiene todas las capacidades efectivas de Hugo.
- Frente a Marcelo sólo faltan attendance.connector.manage y attendance.ingest.
- Esas dos capacidades administran conectores físicos/credenciales e ingesta técnica de marcaciones. No son necesarias para Hijos, Legajos, Antigüedad, Estructura, Nómina ni 638 y no se agregan a un perfil de prueba funcional.

## Hijos y certificados
El backend requiere workforce.employee.read para consultar y employee.record.propose para declarar. Noelia posee ambas capacidades y employee_family_context_v2 deriva canDeclare de employee.record.propose.

Mejora de UX de esta entrega:
- Agregar hijo/a deja de ocultarse silenciosamente.
- El botón permanece visible y deshabilitado mientras se verifica acceso o cuando el contexto no autoriza la escritura.
- La pantalla muestra el motivo de la indisponibilidad.
- Cuando la sesión y el contexto confirman autoridad, el mismo botón se habilita.
- Se mantiene la revocación inmediata ante pérdida de permisos, cambio de identidad o sesión.

Validación:
- build completo: 5.384 pruebas aprobadas, 0 fallidas, 2 omitidas;
- family-schooling browser: 48 controles aprobados;
- native-family-schooling browser: 18 controles aprobados;
- 1440, 390 y 320 px cubiertos;
- las pruebas usan APIs/datos sintéticos y no escriben registros municipales.

## Antigüedad
El build público fue verificado contra municipio-junin-friendly.vercel.app.
El caso de aceptación confirma ingreso 01/07/2013 con corte 10/09/2026 como 13 años y 2 meses, manteniendo separado el valor histórico informado por la fuente. La pantalla no sustituye antigüedad de liquidación ni inventa meses.

## Estructura / Módulo 10
El cotejo nominal ya muestra cargo, ocupante, legajo y presencia en una corrida seleccionada. La prueba de navegador aprobó 10 controles:
- búsqueda nominal;
- modo sólo diferencias;
- detalle PDF/CSV;
- nombres provenientes del PDF local;
- no incorpora DNI/CUIL/importes desde nómina;
- fuente cambiada invalida el resultado;
- 390 px sin overflow.

Los assets publicados de Módulo 10 coinciden byte a byte con la build local verificada y los endpoints anónimos de catálogo/roster devuelven 401.

## TXT 638 AMARU
La UI publicada de novedades fijas pasó 33 controles.
Contrato vigente:
- archivo amaru.txt;
- 55 bytes por registro;
- DNI posición 5, longitud 8;
- importe posición 44, longitud 11;
- espacios fuera de esos campos;
- CRLF entre filas y sin terminador final en la convención actual de MuniControl.

La función payroll_fixed_registry_junin638_v1 está instalada en Neon. PUBLIC no puede ejecutarla y municontrol_actions_runtime_app sí. Las pruebas usan datos sintéticos; no se generó ni descargó un TXT con PII municipal en esta verificación.

## Pendiente de aceptación humana
Noelia debe volver a ingresar y validar con un legajo real:
1. Hijos y certificados → Agregar hijo/a.
2. Antigüedad → años y meses.
3. Estructura → detalle nominal / Módulo 10.
4. Novedades fijas → 638 AMARU.

La aceptación humana no reemplaza las pruebas, pero es la única forma de confirmar su caso concreto y las expectativas del área.
