# Jurisdicción declarada en altas propias — 095

La jurisdicción se declara expresamente como `42` o `55`. No se deduce del convenio, sector, repartición o legajo. Este dato administrativo no certifica una clasificación fiscal ni F931 y no calcula o modifica haberes.

## Contrato y compatibilidad

- `jurisdictionCode` es una cadena exacta: `"42"` o `"55"`. Se rechazan números, `null`, texto vacío, espacios y valores diferentes.
- La nueva interfaz exige elegir un valor y no tiene uno seleccionado por defecto: `employeeDraft(input, today, {requireJurisdiction:true})`.
- La API conserva el formulario histórico de exactamente 13 campos cuando el dato está ausente. No agrega `null` ni un valor predeterminado al JSON que participa del hash. Esto permite recuperar o repetir intentos anteriores sin modificar su identidad.
- Un formulario nuevo puede tener exactamente los 14 campos. El hash original de la solicitud incluye el nuevo campo; cambiarlo o retirarlo al repetir la misma clave produce `NATIVE_EMPLOYEE_ATTEMPT_CONFLICT`.
- Los comprobantes declarados incluyen `jurisdictionCode`; los antiguos mantienen exactamente su forma anterior, sin esa propiedad. La API comprueba que el valor confirmado coincida con el enviado.
- Directorio y detalle proyectan `jurisdictionCode: string|null`. Un registro GRH devuelve `null`, y un alta propia histórica sin declaración también. No se agregan campos al selector mínimo de personas.

## Persistencia y permisos

095 agrega `employment_contract.jurisdiction_code text` nullable, sin default. El CHECK admite 42/55 sólo en contratos `MUNICONTROL`. No actualiza filas existentes. La regla067 que rechaza UPDATE/DELETE de contratos propios mantiene inmutable la declaración, y el registro067 conserva tenant, persona, contrato, vínculo certificado, actor, sesión, clave y hash original.

Sólo se reemplazan `native_employee_create_v1(jsonb,jsonb,text,uuid)` y `native_employee_receipt_v1(native_employee_registration)`. Las funciones existentes de contexto y guardas se verifican por huella completa; una reinstalación admite únicamente las huellas originales o instaladas. También verifica el guard nativo habilitado, RLS de procedencia, FK al ámbito certificado, tipo de columna y CHECK si existen. No se modifica067/093 ni se incorporan capacidades o concesiones IAM. El runtime usa la fachada autenticada y no recibe acceso directo a la columna o al helper de comprobantes.

093 mantiene su subject nativo de ocho campos. Su identidad ya incluye `native_employee_registration.request_sha256`, que ahora incorpora la jurisdicción cuando fue declarada. No se agrega una falsa fecha de corte GRH.

## Verificación y publicación

`node scripts/verify-native-jurisdiction-sql.mjs --ci --expected-major=17 --require-concurrency --write-sql=verification/native-jurisdiction.sql --write-lock-sql=verification/native-jurisdiction-lock.sql`

También admite `--expected-major=18`. Es un generador sin conexión de red. El SQL sólo se ejecuta en `fixed_novelties_qa`, una base local descartable, dentro de un esquema aleatorio y transacción con rollback. Usa las funciones reales067/007/026/092/093/095; el resolvedor IAM y la separación de funciones emplean fixtures sintéticos explícitos. Son 254 comprobaciones con segunda conexión:45 nuevas095,57 nativas093 y152 del registro092. La concurrencia de dos conexiones cubre el lock del registro092;095 conserva sin alterar los locks de intento, DNI y legajo de067.

Las comprobaciones incluyen alta13 anterior, hash/comprobante preservados, alta13 posterior sin inferencias, altas42/55 con rol runtime real, replay14, claves conflictivas, recuperación por ámbito, revocación, inmutabilidad, restricción GRH, ACL, reinstalación y cuerpos alterados. Incluyen proponer/aprobar una novedad fija real093 sobre un alta declarada. Los fixtures declarados se deshacen antes de las regresiones originales completas. La suite no prueba una sesión humana municipal ni certifica datos fiscales.

El workflow `payroll-fixed-novelties-release.yml` ejecuta PostgreSQL17/18 y conserva las regresiones de navegador. Antes de publicar el backend que proyecta la columna, instalar095 transaccionalmente luego de CI verde y comparar las cinco huellas de prerrequisitos con la base real. No ejecutar067 o093 nuevamente. La aplicación de095 y la aceptación humana se documentan por separado de las pruebas locales.
