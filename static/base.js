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

    function slugifyHeading(text) {
      return String(text || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    function readCurrentHashId() {
      const hash = window.location.hash.slice(1);
      if (!hash) return '';
      try {
        return decodeURIComponent(hash);
      } catch (_error) {
        return hash;
      }
    }

    function initArticleToc() {
      const toc = document.querySelector('[data-article-toc]');
      const tocList = toc?.querySelector('[data-article-toc-list]');
      const articleBody = document.querySelector('[data-article-heading-scope]');
      if (!toc || !tocList || !articleBody) return;

      const headings = Array.from(articleBody.querySelectorAll('h1, h2, h3')).filter((heading) =>
        heading.textContent.trim(),
      );
      if (!headings.length) return;

      const headingElements = new Set(headings);
      const usedIds = new Set(
        Array.from(document.querySelectorAll('[id]'))
          .filter((element) => !headingElements.has(element) && element.id)
          .map((element) => element.id),
      );
      const tocLinks = [];

      headings.forEach((heading, index) => {
        const existingId = heading.id.trim();
        const baseId = existingId || slugifyHeading(heading.textContent) || `section-${index + 1}`;
        let nextId = baseId;
        let suffix = 2;
        while (usedIds.has(nextId)) {
          nextId = `${baseId}-${suffix}`;
          suffix += 1;
        }
        heading.id = nextId;
        usedIds.add(nextId);

        const item = document.createElement('li');
        const link = document.createElement('a');
        item.className = `article-toc-item article-toc-item-${heading.tagName.toLowerCase()}`;
        link.className = 'article-toc-link';
        link.href = `#${encodeURIComponent(heading.id)}`;
        link.dataset.headingId = heading.id;
        link.textContent = heading.textContent.trim();
        link.addEventListener('click', () => {
          tocLinks.forEach((tocLink) => tocLink.classList.remove('is-active'));
          link.classList.add('is-active');
        });
        tocLinks.push(link);
        item.appendChild(link);
        tocList.appendChild(item);
      });

      toc.hidden = false;
      const initialHashId = readCurrentHashId();
      const initialLink = tocLinks.find((link) => link.dataset.headingId === initialHashId) || tocLinks[0];
      initialLink?.classList.add('is-active');
      if (initialHashId) {
        const initialHeading = headings.find((heading) => heading.id === initialHashId);
        initialHeading?.scrollIntoView({ block: 'start' });
      }

      if (!('IntersectionObserver' in window)) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
          if (!visible) return;

          tocLinks.forEach((link) => {
            link.classList.toggle('is-active', link.dataset.headingId === visible.target.id);
          });
        },
        { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
      );

      headings.forEach((heading) => observer.observe(heading));
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
    initArticleToc();

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
