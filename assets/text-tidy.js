// Fundamentos, constancias y referencias se rechazan si empiezan o terminan con un espacio o un Enter, y ese
// sobrante no se ve. Al salir de un campo de texto de una tarea, se quita. El contenido no se toca: un salto de
// línea en el medio queda como está y lo sigue decidiendo cada pantalla.
export const tidyEdges = value => typeof value === 'string' ? value.replace(/^[\s\u0000-\u001f\u007f]+|[\s\u0000-\u001f\u007f]+$/g, '') : value;
const FIELDS = 'textarea, input[type="text"], input:not([type])';
export function tidyOnLeave(event) {
  const field = event?.target;
  if (!field?.matches?.(FIELDS) || field.readOnly || field.disabled || !field.closest?.('.task-panel')) return false;
  const value = tidyEdges(field.value);
  if (value === field.value) return false;
  field.value = value;
  // Las pantallas que guardan el valor al escribir se enteran del cambio como si la persona lo hubiera corregido.
  for (const type of ['input', 'change']) field.dispatchEvent(new Event(type, {bubbles: true}));
  return true;
}
if (typeof document !== 'undefined' && !document.documentElement.dataset.mcTextTidy) {
  document.documentElement.dataset.mcTextTidy = 'true';
  document.addEventListener('focusout', tidyOnLeave, true);
}
