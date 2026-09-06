import { useSyncExternalStore } from 'react';
import { REPORT_TASKS } from './report-workspace-navigation.js';

export default function ReportWorkspace({ controller }) {
  const mode = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  function navigate(event, target) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    controller.navigate(target);
  }
  return (
    <>
      <nav className="report-task-nav" aria-label="Tareas de reportes">
        {REPORT_TASKS.map((task, index) => (
          <a key={task.id} className="report-task-link" href={`#${task.target}`}
            aria-current={mode === task.id ? 'page' : undefined}
            onClick={event => navigate(event, task.target)}>
            <span className="report-task-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span><strong>{task.label}</strong><span className="report-task-detail">{task.detail}</span></span>
          </a>
        ))}
      </nav>
      <div className="report-task-extras">
        <a href="#descargas" onClick={event => navigate(event, 'descargas')}>Descargar informe RRHH <span aria-hidden="true">↓</span></a>
        <a href="#todas-las-herramientas" aria-current={mode === 'all' ? 'page' : undefined}
          onClick={event => navigate(event, 'todas-las-herramientas')}>Ver todas las herramientas</a>
      </div>
      <p className="report-task-hint">Podés cambiar de tarea sin perder los archivos seleccionados. Se conservan mientras esta página siga abierta.</p>
    </>
  );
}
