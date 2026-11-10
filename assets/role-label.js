// Nombre legible del rol para encabezados y fichas de cuenta. Sólo presentación: la clave interna que informa el
// servidor (p. ej. PLATFORM_OWNER_OPERATIVO_INTEGRAL) no cambia ni decide permisos; simplemente no se le muestra
// cruda a la persona. Un rol sin nombre cargado se muestra con sus palabras, nunca vacío.
(function (global) {
  'use strict';
  var LABELS = {
    PLATFORM_OWNER: 'Responsable de la plataforma',
    PLATFORM_OWNER_OPERATIVO_INTEGRAL: 'Responsable de la plataforma · operación completa',
    HUGO_APROBADOR_INTEGRAL: 'Aprobación institucional',
    CONSULTA_INTEGRAL: 'Consulta institucional',
    TENANT_RRHH_ADMIN_OPERATIVO: 'Administración de Recursos Humanos',
    TENANT_ADMIN: 'Administración del municipio',
    ADMIN_INTERNO: 'Administración interna',
    INTERNAL_ADMIN: 'Administración interna'
  };
  function roleLabel(value, fallback) {
    var raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return fallback || 'Acceso interno';
    var key = raw.toUpperCase();
    if (LABELS[key]) return LABELS[key];
    // Texto que ya viene escrito para personas (con minúsculas o espacios) se respeta tal cual.
    if (/[a-záéíóúñ]/.test(raw) || /\s/.test(raw)) return raw;
    var words = key.toLowerCase().replace(/[._-]+/g, ' ').replace(/\brrhh\b/g, 'RR. HH.').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  global.MuniControlRoleLabel = roleLabel;
})(typeof window === 'undefined' ? globalThis : window);
