import React from 'react';
import { createRoot } from 'react-dom/client';
import InstallShare, { createInstallController } from './InstallShare.jsx';

const mountNode = document.getElementById('mc-install-share-root');

if (mountNode) {
  const installController = createInstallController(window);
  // Capture install availability immediately, including before the first React effect.
  installController.start();
  createRoot(mountNode).render(<InstallShare installController={installController} />);
}
