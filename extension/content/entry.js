(() => {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.getURL) return;

  const moduleUrl = runtime.getURL('content/index.js');
  import(moduleUrl).catch(() => {
    // Fail closed: unsupported or blocked module loading must not affect the host page.
  });
})();
