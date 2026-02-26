(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem('theme');
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.setAttribute('data-theme', theme);

  function initInteractiveUi() {
    const toggles = document.querySelectorAll('[data-theme-toggle]');
    const body = document.body;
    const isAuthenticated = body?.dataset.authenticated === '1';
    const loginUrl = body?.dataset.loginUrl || '/login';
    const secretSequence = ['l', 'o', 'g', 'i', 'n'];
    let secretIndex = 0;
    let lastSecretAt = 0;

    function syncLabels() {
      const current = root.getAttribute('data-theme') || 'light';
      const label = current === 'dark' ? 'Light' : 'Dark';
      toggles.forEach((toggle) => {
        toggle.textContent = label;
      });
    }

    toggles.forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const current = root.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        syncLabels();
      });
    });

    syncLabels();

    document.addEventListener('keydown', (event) => {
      if (isAuthenticated) return;
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      const now = Date.now();
      if (now - lastSecretAt > 1400) secretIndex = 0;
      lastSecretAt = now;

      if (key === secretSequence[secretIndex]) {
        secretIndex += 1;
        if (secretIndex === secretSequence.length) {
          secretIndex = 0;
          window.location.href = loginUrl;
        }
      } else {
        secretIndex = key === secretSequence[0] ? 1 : 0;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInteractiveUi, { once: true });
  } else {
    initInteractiveUi();
  }
})();
