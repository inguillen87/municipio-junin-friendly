export function normalizeDigits(value) {
  if (value === null || value === undefined) return null;
  return String(value).replace(/\D/g, '');
}

export function isValidCuil(value) {
  const normalized = normalizeDigits(value);
  if (!normalized || !/^\d{11}$/.test(normalized) || normalized === '00000000000') return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const weightedSum = weights.reduce(
    (sum, weight, index) => sum + Number(normalized[index]) * weight,
    0,
  );
  const remainder = 11 - (weightedSum % 11);
  const expectedDigit = remainder === 11 ? 0 : remainder === 10 ? 9 : remainder;
  return Number(normalized[10]) === expectedDigit;
}
