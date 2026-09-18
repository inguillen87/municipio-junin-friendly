// A worktree may share node_modules through a Windows junction or Unix symlink.
// Resolve dependencies by their path in THIS checkout, not the physical sibling.
// No change to targets, minification, external modules, source maps or output budgets.
export const publicBuildResolution=Object.freeze({preserveSymlinks:true});
