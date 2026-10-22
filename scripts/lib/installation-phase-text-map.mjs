// The caller supplies a deterministic string transform after its context is fixed.
// Reuse immutable text only within one call; never retain fixtures or phase arrays.
export function mapInstallationPhaseText(batch, transform) {
 const text = new Map();
 const once = statement => {
  if (typeof statement !== 'string') return transform(statement);
  if (text.has(statement)) return text.get(statement);
  const value = transform(statement);
  if (typeof value === 'string') text.set(statement, value);
  return value;
 };
 return Object.fromEntries(
  ['rehearsal', 'installation', 'repetition', 'verification', ...(batch.rollback ? ['rollback'] : [])]
   .map(key => [key, batch[key].map(once)])
 );
}
