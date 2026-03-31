(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem('theme');
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.setAttribute('data-theme', theme);

  function initInteractiveUi() {
    const toggles = document.querySelectorAll('[data-theme-toggle]');
    const amaForms = document.querySelectorAll('[data-ama-question-form], [data-ama-vote-form]');
    const body = document.body;
    const isAuthenticated = body?.dataset.authenticated === '1';
    const loginUrl = body?.dataset.loginUrl || '/login';
    const secretSequence = ['l', 'o', 'g', 'i', 'n'];
    let secretIndex = 0;
    let lastSecretAt = 0;
    const amaEmailStorageKey = 'amaEmail';

    function isValidEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
    }

    function storedAmaEmail() {
      const candidate = localStorage.getItem(amaEmailStorageKey) || '';
      return isValidEmail(candidate) ? candidate.trim().toLowerCase() : '';
    }

    function promptForAmaEmail(initialValue) {
      let candidate = initialValue || storedAmaEmail();
      while (true) {
        const response = window.prompt('Enter your email address', candidate);
        if (response === null) return null;
        candidate = response.trim().toLowerCase();
        if (isValidEmail(candidate)) {
          localStorage.setItem(amaEmailStorageKey, candidate);
          return candidate;
        }
        window.alert('Please enter a valid email address.');
      }
    }

    function syncLabels() {
      const current = root.getAttribute('data-theme') || 'light';
      const icon = current === 'dark' ? '☀' : '☾';
      const nextLabel = current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      toggles.forEach((toggle) => {
        toggle.textContent = icon;
        toggle.setAttribute('aria-label', nextLabel);
        toggle.setAttribute('title', nextLabel);
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

    amaForms.forEach((form) => {
      form.addEventListener('submit', (event) => {
        const emailInput = form.querySelector('[data-ama-email-input]');
        if (emailInput && isValidEmail(emailInput.value)) {
          return;
        }
        const email = promptForAmaEmail(emailInput?.value || '');
        if (!email) {
          event.preventDefault();
          return;
        }
        if (emailInput) {
          emailInput.value = email;
        }
      });
    });

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
