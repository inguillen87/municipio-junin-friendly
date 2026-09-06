import { createRoot } from 'react-dom/client';
import ReportWorkspace from './ReportWorkspace.jsx';
import { createReportWorkspaceController } from './report-workspace-navigation.js';

const mountNode = document.getElementById('mc-report-workspace-root');
if (mountNode && document.querySelectorAll('[data-report-panel]').length === 4) {
  const controller = createReportWorkspaceController(window, document);
  const root = createRoot(mountNode);
  root.render(<ReportWorkspace controller={controller} />);
  controller.start();
}
