// Public Google Chrome for Testing build whose declared source revision
// contains upstream fix 62473ad0f747e245e514c93e741bb8e168a2a207.
// Diagnostic only: no rolling channel, global installation or app dependency.
export const patchedChromiumDiagnostic = Object.freeze({
  version: '157.0.8098.0', sourceRevision: 'b4fa1b3baec04505d5a58e8cd1e7927b03cec74b',
  upstreamFix: '62473ad0f747e245e514c93e741bb8e168a2a207', sdkVersion: '1.63.0',
  platforms: Object.freeze({
    win32: Object.freeze({ archivePrefix: 'chrome-headless-shell-win64', binary: 'chrome-headless-shell.exe',
      url: 'https://storage.googleapis.com/chrome-for-testing-public/157.0.8098.0/win64/chrome-headless-shell-win64.zip',
      archiveSha256: '069f49987dd2f3c9d0ef04dd6e48b0f0ffb9a5a25e7b23b1f8b43a4739ff321e',
      binarySha256: 'd5c9c24dc783b39770563cf1e124d22f5bd62c1a7c9f14335de485e89a3ccb8f' }),
    linux: Object.freeze({ archivePrefix: 'chrome-headless-shell-linux64', binary: 'chrome-headless-shell',
      url: 'https://storage.googleapis.com/chrome-for-testing-public/157.0.8098.0/linux64/chrome-headless-shell-linux64.zip',
      archiveSha256: '74fd3eb7927798d68bad59a09f38ecb37b144f518ac6db984a8ace08018ca252',
      binarySha256: '60973add691f13654e5f3e5ddcd4602b25118a092c64687b3e0c87d5a1ef8b39' }),
  }),
});
