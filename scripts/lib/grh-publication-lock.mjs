// One transaction acquires the existing writer locks in this fixed order.
// The keys also exclude previous CLI versions that only know their own lock.
export const GRH_PUBLICATION_LOCKS = Object.freeze([
  'municipio-junin-friendly:rrhh-curated-import:v1',
  'municipio-junin-friendly:canonical-grh-promotion',
  'municipio-junin-friendly:canonical-grh-core:v2',
  'municipio-junin-friendly:canonical-personas-crosswalk:v2',
]);

export async function acquireGrhPublicationLocks(client) {
  await client.query('SAVEPOINT grh_publication_lock_scope');
  for (const key of GRH_PUBLICATION_LOCKS) {
    const result = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired', [key]);
    if (!Array.isArray(result?.rows) || result.rows.length !== 1 || result.rows[0]?.acquired !== true) {
      throw Object.assign(new Error('Otra operación está utilizando la fuente GRH. Volvé a intentar cuando termine.'), { code: 'GRH_PUBLICATION_BUSY' });
    }
  }
  await client.query('RELEASE SAVEPOINT grh_publication_lock_scope');
}
