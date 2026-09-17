// Display a municipal point identifier; a vendor device number is never a PM code.
export function attendancePointCode(key) {
  if (typeof key !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,95}$/i.test(key)) throw Error('POINT_LABEL_INVALID');
  return key.toUpperCase();
}
export function attendancePointLabel(key, name) {
  const code = attendancePointCode(key);
  if (typeof name !== 'string' || !name.trim() || name.length > 180 || /[\x00-\x1f\x7f]/.test(name)) throw Error('POINT_LABEL_INVALID');
  const prefix = code + ' · ';
  return name.startsWith(prefix) ? name : prefix + name;
}
