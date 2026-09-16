import { createRoot } from 'react-dom/client';
import LeaveRulesBrowser from './LeaveRulesBrowser.jsx';

// A separate owner protects legacy forms and permits a complete fallback.
export function mountLeaveRules(host, fallback, rules) {
  if (!host || !fallback || host.dataset.leaveRulesMounted) return null;
  const owner = document.createElement('div');
  host.appendChild(owner);
  let disposed = false;
  const recover = () => {
    host.hidden = true;
    fallback.hidden = false;
    host.dataset.leaveRulesMounted = 'failed';
  };
  const root = createRoot(owner, { onUncaughtError: recover });
  const onReady = () => {
    if (disposed) return;
    host.hidden = false;
    fallback.hidden = true;
    host.dataset.leaveRulesMounted = 'ready';
  };
  const update = next => {
    if (disposed) return;
    // Stable identity is scoped to this rendered catalogue. Duplicate source IDs
    // never combine rules or erase either entry.
    const occurrences = new Map();
    const entries = next.map(rule => {
      const id = JSON.stringify([rule.id, rule.code]);
      const occurrence = occurrences.get(id) || 0;
      occurrences.set(id, occurrence + 1);
      return { ...rule, key: `${id}:${occurrence}` };
    });
    root.render(<LeaveRulesBrowser rules={entries} onReady={onReady} />);
  };
  host.dataset.leaveRulesMounted = 'loading';
  update(rules);
  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.unmount(); owner.remove();
      host.hidden = true; fallback.hidden = false;
      delete host.dataset.leaveRulesMounted;
    },
  };
}
