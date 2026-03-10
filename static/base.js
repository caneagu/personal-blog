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
    const aboutSummary = document.querySelector('[data-about-summary]');
    const aboutCopy = aboutSummary?.querySelector('[data-about-copy]');
    const aboutToggle = aboutSummary?.querySelector('[data-about-toggle]');
    const secretSequence = ['l', 'o', 'g', 'i', 'n'];
    let secretIndex = 0;
    let lastSecretAt = 0;

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

    function initAboutSummary() {
      if (!aboutSummary || !aboutCopy || !aboutToggle) return;
      const computed = window.getComputedStyle(aboutCopy);
      const fontSize = parseFloat(computed.fontSize) || 18;
      const measuredLineHeight = parseFloat(computed.lineHeight);
      const lineHeight = Number.isFinite(measuredLineHeight) && measuredLineHeight > 0 ? measuredLineHeight : fontSize * 1.68;
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;

      const collapsedHeight = Math.round(lineHeight * 2);
      aboutCopy.style.setProperty('--about-collapsed-height', `${collapsedHeight}px`);
      aboutCopy.style.setProperty('--about-expanded-height', `${aboutCopy.scrollHeight}px`);

      const hasOverflow = aboutCopy.scrollHeight > collapsedHeight + 8;
      aboutToggle.hidden = !hasOverflow;
      if (!hasOverflow) {
        aboutSummary.classList.add('is-expanded');
        aboutToggle.setAttribute('aria-expanded', 'true');
        return;
      }

      aboutSummary.classList.remove('is-expanded');
      aboutToggle.setAttribute('aria-expanded', 'false');
      aboutToggle.textContent = 'Learn more';
    }

    if (aboutToggle && aboutSummary && aboutCopy) {
      aboutToggle.addEventListener('click', () => {
        const expanded = aboutSummary.classList.toggle('is-expanded');
        aboutToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        aboutToggle.textContent = expanded ? 'Show less' : 'Learn more';
        if (!expanded) {
          aboutCopy.style.setProperty('--about-expanded-height', `${aboutCopy.scrollHeight}px`);
        }
      });
      initAboutSummary();
      window.addEventListener('resize', initAboutSummary);
    }

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
