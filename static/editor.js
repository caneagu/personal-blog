(function () {
  const form = document.getElementById('writer-form');
  if (!form) return;
  const canvas = document.getElementById('editor-canvas');
  const bodyHtml = document.getElementById('body_html');
  const bodyMd = document.getElementById('body');
  const draftsToggle = document.getElementById('drafts-toggle');
  const draftsPanel = document.getElementById('drafts-panel');
  const draftDeleteButtons = document.querySelectorAll('.draft-delete-btn');
  const toolbar = document.getElementById('floating-toolbar');
  const buttons = toolbar.querySelectorAll('[data-cmd]');
  const imageToolbar = document.getElementById('image-toolbar');
  const imageButtons = imageToolbar.querySelectorAll('[data-size]');
  const titleInput = document.getElementById('title-input');
  const slugInput = document.getElementById('slug-input');
  const publishedAtInput = document.getElementById('published-at-input');
  const summaryInput = document.getElementById('summary-input');
  const saveDraftButton = document.getElementById('save-draft-btn');
  const previewButton = document.getElementById('preview-btn');
  const publishButton = document.getElementById('publish-btn');
  const editorStatus = document.getElementById('editor-status');
  const editorStats = document.getElementById('editor-stats');
  const restoreBanner = document.getElementById('restore-banner');
  const restoreDraftButton = document.getElementById('restore-draft-btn');
  const discardRestoreButton = document.getElementById('discard-restore-btn');
  const restoreDraftLabel = document.getElementById('restore-draft-label');
  const uploadUrl = form.dataset.uploadUrl || '';
  const csrfToken = form.dataset.csrfToken || '';
  const editorKey = form.dataset.editorKey || 'new';
  const autosaveKey = `blog-editor-autosave:${editorKey}`;
  const imageSizes = ['25', '50', '75', '100'];
  const editorDebugEnabled =
    new URLSearchParams(window.location.search).get('editorDebug') === '1' ||
    window.localStorage.getItem('editorDebug') === '1';
  let savedRange = null;
  let toolbarTimer = null;
  let transformTimer = null;
  let autosaveTimer = null;
  let statusTimer = null;
  let isTransforming = false;
  let activeImage = null;
  let pendingUploads = 0;
  let hasSubmitted = false;
  let initialSnapshot = null;
  let isDirty = false;
  let lastAutosaveNoticeAt = 0;
  let restoreCandidate = null;
  let slugTouched = Boolean((slugInput?.value || '').trim());

  function setStatus(message, tone = '', clearAfterMs = 0) {
    if (!editorStatus) return;
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
    editorStatus.textContent = message || '';
    if (tone) editorStatus.dataset.tone = tone;
    else delete editorStatus.dataset.tone;
    if (clearAfterMs > 0) {
      statusTimer = setTimeout(() => {
        editorStatus.textContent = '';
        delete editorStatus.dataset.tone;
      }, clearAfterMs);
    }
  }

  function countWords(text) {
    const normalized = (text || '')
      .replace(/<img\b[^>]*>/gi, ' image ')
      .replace(/[`*_#>\-|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return 0;
    return normalized.split(' ').filter(Boolean).length;
  }

  function updateEditorStats() {
    if (!editorStats) return;
    const markdownText = bodyMd.value || '';
    const wordCount = countWords(markdownText);
    const minutes = wordCount > 0 ? Math.max(1, Math.round(wordCount / 220)) : 0;
    const imageCount = (canvas.querySelectorAll('img') || []).length;
    if (!wordCount && !imageCount) {
      editorStats.textContent = 'No content yet.';
      return;
    }
    const imageLabel = imageCount ? ` \u2022 ${imageCount} image${imageCount === 1 ? '' : 's'}` : '';
    editorStats.textContent = `${wordCount} words \u2022 ${minutes} min read${imageLabel}`;
  }

  function setSubmissionButtonsDisabled(disabled) {
    if (saveDraftButton) saveDraftButton.disabled = disabled;
    if (publishButton) publishButton.disabled = disabled;
  }

  function refreshUploadState() {
    const uploading = pendingUploads > 0;
    form.classList.toggle('is-uploading', uploading);
    setSubmissionButtonsDisabled(uploading);
    if (uploading) {
      setStatus(`Uploading ${pendingUploads} image${pendingUploads === 1 ? '' : 's'}...`);
    }
  }

  function createSlug(text) {
    return (text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function maybeAutoUpdateSlug() {
    if (!titleInput || !slugInput || slugTouched) return;
    slugInput.value = createSlug(titleInput.value);
  }

  function snapshotState() {
    return JSON.stringify({
      title: titleInput ? titleInput.value : '',
      slug: slugInput ? slugInput.value : '',
      publishedAt: publishedAtInput ? publishedAtInput.value : '',
      summary: summaryInput ? summaryInput.value : '',
      bodyHtml: bodyHtml.value || '',
      body: bodyMd.value || '',
    });
  }

  function updateDirtyState() {
    if (initialSnapshot === null) return false;
    isDirty = snapshotState() !== initialSnapshot;
    form.dataset.dirty = isDirty ? '1' : '0';
    return isDirty;
  }

  function persistAutosave() {
    if (!isDirty || hasSubmitted) return;
    const payload = {
      title: titleInput ? titleInput.value : '',
      slug: slugInput ? slugInput.value : '',
      publishedAt: publishedAtInput ? publishedAtInput.value : '',
      summary: summaryInput ? summaryInput.value : '',
      bodyHtml: bodyHtml.value || '',
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(autosaveKey, JSON.stringify(payload));
      const now = Date.now();
      if (now - lastAutosaveNoticeAt > 12000) {
        setStatus('Local backup updated.', 'success', 1200);
        lastAutosaveNoticeAt = now;
      }
    } catch (_err) {
      setStatus('Could not save local backup.', 'error', 2500);
    }
  }

  function scheduleAutosave() {
    if (initialSnapshot === null || hasSubmitted) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      if (updateDirtyState()) persistAutosave();
    }, 900);
  }

  function clearAutosave() {
    try {
      localStorage.removeItem(autosaveKey);
    } catch (_err) {}
  }

  function loadAutosave() {
    try {
      const raw = localStorage.getItem(autosaveKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (_err) {
      return null;
    }
  }

  function autosaveSignature(payload) {
    return JSON.stringify({
      title: payload?.title || '',
      slug: payload?.slug || '',
      publishedAt: payload?.publishedAt || '',
      summary: payload?.summary || '',
      bodyHtml: payload?.bodyHtml || '',
    });
  }

  function applyAutosaveDraft(payload) {
    if (!payload) return;
    if (titleInput) titleInput.value = payload.title || '';
    if (slugInput) slugInput.value = payload.slug || '';
    if (publishedAtInput && payload.publishedAt) publishedAtInput.value = payload.publishedAt;
    if (summaryInput) summaryInput.value = payload.summary || '';
    canvas.innerHTML = payload.bodyHtml || '<p><br></p>';
    normalizeCanvasImages();
    normalizeCodeBlocksForEditing();
    syncBody({ autosave: false });
    updateDirtyState();
    slugTouched = Boolean((slugInput?.value || '').trim());
    setStatus('Local draft restored.', 'success', 2200);
  }

  function presentRestoreBanner(payload) {
    if (!restoreBanner || !restoreDraftLabel) return;
    const when = payload && payload.savedAt ? new Date(payload.savedAt) : null;
    if (when && Number.isFinite(when.getTime())) {
      restoreDraftLabel.textContent = `Local draft from ${when.toLocaleString()} available.`;
    } else {
      restoreDraftLabel.textContent = 'A local unsaved draft is available.';
    }
    restoreBanner.hidden = false;
  }

  function hideRestoreBanner() {
    if (restoreBanner) restoreBanner.hidden = true;
  }

  function hasMeaningfulContent(markdownText) {
    const source = (markdownText || '').trim();
    if (!source) return false;
    if (/<img\b[^>]*>/i.test(source)) return true;
    const cleaned = source
      .replace(/```[\s\S]*?```/g, ' code ')
      .replace(/`[^`]*`/g, ' code ')
      .replace(/\[[^\]]*\]\([^)]+\)/g, ' link ')
      .replace(/[#>*_\-\n\r]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length > 0;
  }

  function nodeLabel(node) {
    if (!node) return 'null';
    if (node.nodeType === Node.TEXT_NODE) {
      const preview = (node.textContent || '').replace(/\s+/g, ' ').slice(0, 40);
      return `#text("${preview}")`;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const id = node.id ? `#${node.id}` : '';
      const cls = node.className ? `.${String(node.className).trim().replace(/\s+/g, '.')}` : '';
      return `<${node.tagName.toLowerCase()}${id}${cls}>`;
    }
    return `nodeType:${node.nodeType}`;
  }

  function selectionSnapshot() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { hasSelection: false };
    const range = sel.getRangeAt(0);
    return {
      hasSelection: true,
      collapsed: sel.isCollapsed,
      anchor: nodeLabel(sel.anchorNode),
      focus: nodeLabel(sel.focusNode),
      start: { node: nodeLabel(range.startContainer), offset: range.startOffset },
      end: { node: nodeLabel(range.endContainer), offset: range.endOffset },
    };
  }

  function debugLog(label, payload) {
    if (!editorDebugEnabled) return;
    const snapshot = selectionSnapshot();
    const htmlPreview = canvas.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 220);
    console.debug(`[editor-debug] ${label}`, {
      ...payload,
      selection: snapshot,
      canvasPreview: htmlPreview,
    });
  }

  window.blogEditorDebug = {
    enable() {
      localStorage.setItem('editorDebug', '1');
      console.info('editorDebug enabled; refresh page');
    },
    disable() {
      localStorage.removeItem('editorDebug');
      console.info('editorDebug disabled; refresh page');
    },
    dump() {
      debugLog('manual-dump', {});
    },
  };

  function sanitizeAttr(value) {
    return (value || '').replace(/"/g, '&quot;');
  }

  function getImageSizePercent(img) {
    const explicit = img.getAttribute('data-size');
    if (explicit && imageSizes.includes(explicit)) return explicit;
    const style = img.getAttribute('style') || '';
    const match = style.match(/width:\s*(\d+)\s*%/i);
    if (match && imageSizes.includes(match[1])) return match[1];
    return '100';
  }

  function applyImageSize(img, size) {
    const normalized = imageSizes.includes(size) ? size : '100';
    imageSizes.forEach((candidate) => img.classList.remove(`img-size-${candidate}`));
    img.classList.add(`img-size-${normalized}`);
    img.setAttribute('data-size', normalized);
    img.removeAttribute('style');
  }

  function normalizeCanvasImages() {
    canvas.querySelectorAll('img').forEach((img) => {
      applyImageSize(img, getImageSizePercent(img));
    });
  }

  function unwrapSingleParagraph(htmlText) {
    return (htmlText || '')
      .replace(/^\s*<p[^>]*>/i, '')
      .replace(/<\/p>\s*$/i, '')
      .trim();
  }

  function wrapInlineWithDelimiter(content, delimiter) {
    const source = String(content || '');
    const leadingMatch = source.match(/^\s+/);
    const trailingMatch = source.match(/\s+$/);
    const leading = leadingMatch ? leadingMatch[0] : '';
    const trailing = trailingMatch ? trailingMatch[0] : '';
    const core = source.slice(leading.length, source.length - trailing.length);
    const textOnlyCore = core.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ').trim();
    if (!textOnlyCore) return leading + trailing;
    return `${leading}${delimiter}${core}${delimiter}${trailing}`;
  }

  function extractCodeText(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName;
    if (tag === 'BR') return '\n';

    let result = '';
    node.childNodes.forEach((child) => {
      result += extractCodeText(child);
    });

    if (['DIV', 'P'].includes(tag) && !result.endsWith('\n')) result += '\n';
    return result;
  }

  function toMarkdownFromHtml(value) {
    const codeTokens = [];
    const rootDoc = new DOMParser().parseFromString(`<div>${value || ''}</div>`, 'text/html');
    const root = rootDoc.body.firstElementChild;

    root.querySelectorAll('pre').forEach((pre) => {
      const code = pre.querySelector('code');
      if (!code) return;
      const classTokens = Array.from(code.classList || []);
      const languageToken = classTokens.find((token) => token.startsWith('language-')) || '';
      const language = languageToken ? languageToken.slice('language-'.length).toLowerCase() : '';
      const source = extractCodeText(code).replace(/\u00a0/g, ' ').replace(/\u200b/g, '').replace(/\n+$/, '');
      const fence = language ? `\n\n\`\`\`${language}\n${source}\n\`\`\`\n\n` : `\n\n\`\`\`\n${source}\n\`\`\`\n\n`;
      const token = rootDoc.createTextNode(`@@CODE_TOKEN_${codeTokens.length}@@`);
      codeTokens.push(fence);
      pre.replaceWith(token);
    });

    let out = root.innerHTML;
    out = out.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
    out = out.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
    out = out.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
    const imageTokens = [];
    out = out.replace(/<img\b[^>]*>/gi, (tag) => {
      const key = `@@IMG_TOKEN_${imageTokens.length}@@`;
      const doc = new DOMParser().parseFromString(tag, 'text/html');
      const img = doc.body.querySelector('img');
      if (!img) return key;
      const src = sanitizeAttr(img.getAttribute('src') || '');
      const alt = sanitizeAttr(img.getAttribute('alt') || '');
      const size = getImageSizePercent(img);
      imageTokens.push(`<img src="${src}" alt="${alt}" data-size="${size}" class="img-size-${size}" />`);
      return `\n\n${key}\n\n`;
    });
    const tableTokens = [];
    out = out.replace(/<table\b[\s\S]*?<\/table>/gi, (tableHtml) => {
      const key = `@@TABLE_TOKEN_${tableTokens.length}@@`;
      const doc = new DOMParser().parseFromString(tableHtml, 'text/html');
      const table = doc.body.querySelector('table');
      tableTokens.push(table ? table.outerHTML : tableHtml);
      return `\n\n${key}\n\n`;
    });
    out = out.replace(/<a[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, '[$3]($2)');
    out = out.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_m, inner) => wrapInlineWithDelimiter(inner, '**'));
    out = out.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_m, inner) => wrapInlineWithDelimiter(inner, '**'));
    out = out.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_m, inner) => wrapInlineWithDelimiter(inner, '*'));
    out = out.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, (_m, inner) => wrapInlineWithDelimiter(inner, '*'));
    out = out.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner) => {
      const normalized = unwrapSingleParagraph(inner);
      return `\n\n> ${normalized}\n\n`;
    });
    out = out.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
      return (
        '\n' +
        inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, item) => {
          return `- ${unwrapSingleParagraph(item)}\n`;
        }) +
        '\n'
      );
    });
    out = out.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
      let idx = 0;
      return (
        '\n' +
        inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, item) => `${++idx}. ${unwrapSingleParagraph(item)}\n`) +
        '\n'
      );
    });
    out = out.replace(/<br\s*\/?>/gi, '\n');
    out = out.replace(/<\/p>/gi, '\n\n');
    out = out.replace(/<[^>]+>/g, '');

    const doc = new DOMParser().parseFromString(out, 'text/html');
    let markdownText = doc.documentElement.textContent
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    imageTokens.forEach((token, index) => {
      markdownText = markdownText.replace(`@@IMG_TOKEN_${index}@@`, token);
    });
    tableTokens.forEach((token, index) => {
      markdownText = markdownText.replace(`@@TABLE_TOKEN_${index}@@`, `\n\n${token}\n\n`);
    });
    codeTokens.forEach((token, index) => {
      markdownText = markdownText.replace(`@@CODE_TOKEN_${index}@@`, token);
    });
    return markdownText;
  }

  function syncBody(options = {}) {
    const shouldTrack = options.trackChanges !== false;
    const shouldAutosave = options.autosave !== false;
    normalizeCanvasImages();
    bodyHtml.value = canvas.innerHTML.trim();
    bodyMd.value = toMarkdownFromHtml(canvas.innerHTML);
    updateEditorStats();
    if (shouldTrack) {
      updateDirtyState();
      if (shouldAutosave) scheduleAutosave();
    }
  }

  function getCodeLanguage(code) {
    const classTokens = Array.from(code?.classList || []);
    const token = classTokens.find((value) => value.startsWith('language-'));
    return token ? token.slice('language-'.length).toLowerCase() : '';
  }

  function normalizeCodeBlocksForEditing(root = canvas) {
    root.querySelectorAll('pre').forEach((pre) => {
      const code = pre.querySelector('code');
      if (!code) return;
      const language = getCodeLanguage(code);
      const source = extractCodeText(code).replace(/\u00a0/g, ' ').replace(/\u200b/g, '').replace(/\n$/, '');
      code.className = language ? `language-${language}` : '';
      code.textContent = source;
      pre.classList.remove('codehilite');
    });
  }

  function closeDraftsPanel() {
    draftsPanel.hidden = true;
    draftsToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleDraftsPanel() {
    const willOpen = draftsPanel.hidden;
    draftsPanel.hidden = !willOpen;
    draftsToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }

  function postRedirect(url, next) {
    const formEl = document.createElement('form');
    formEl.method = 'POST';
    formEl.action = url;
    const nextInput = document.createElement('input');
    nextInput.type = 'hidden';
    nextInput.name = 'next';
    nextInput.value = next || window.location.pathname;
    const csrfInput = document.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = 'csrf_token';
    csrfInput.value = csrfToken;
    formEl.appendChild(nextInput);
    formEl.appendChild(csrfInput);
    document.body.appendChild(formEl);
    formEl.submit();
  }

  function selectionInsideEditor() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    return canvas.contains(sel.anchorNode) && canvas.contains(sel.focusNode);
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    savedRange = sel.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  function hideToolbar() {
    if (toolbarTimer) clearTimeout(toolbarTimer);
    toolbar.classList.remove('visible');
    toolbar.setAttribute('aria-hidden', 'true');
  }

  function hideImageToolbar() {
    imageToolbar.classList.remove('visible');
    imageToolbar.setAttribute('aria-hidden', 'true');
    if (activeImage) activeImage.classList.remove('selected-image');
    activeImage = null;
  }

  function showImageToolbar(img) {
    if (!img || !canvas.contains(img)) {
      hideImageToolbar();
      return;
    }
    hideToolbar();
    if (activeImage) activeImage.classList.remove('selected-image');
    activeImage = img;
    activeImage.classList.add('selected-image');
    const rect = img.getBoundingClientRect();
    imageToolbar.classList.add('visible');
    const toolbarRect = imageToolbar.getBoundingClientRect();
    const top = Math.max(8, rect.top - toolbarRect.height - 10);
    const left = Math.min(
      document.documentElement.clientWidth - toolbarRect.width - 8,
      Math.max(8, rect.left + rect.width / 2 - toolbarRect.width / 2)
    );
    imageToolbar.style.top = `${top}px`;
    imageToolbar.style.left = `${left}px`;
    imageToolbar.setAttribute('aria-hidden', 'false');
  }

  function refreshImageToolbarPosition() {
    if (activeImage) showImageToolbar(activeImage);
  }

  function getSelectionRect(range) {
    let rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
      const rects = range.getClientRects();
      if (rects.length > 0) rect = rects[0];
    }
    return rect;
  }

  function showToolbarForSelection() {
    const sel = window.getSelection();
    if (!selectionInsideEditor() || !sel || sel.isCollapsed) {
      hideToolbar();
      return;
    }

    saveSelection();
    const rect = getSelectionRect(savedRange);
    if (!rect || (!rect.width && !rect.height)) {
      hideToolbar();
      return;
    }

    toolbar.classList.add('visible');
    const toolbarRect = toolbar.getBoundingClientRect();
    const top = Math.max(8, rect.top - toolbarRect.height - 10);
    const left = rect.left + (rect.width / 2) - (toolbarRect.width / 2);
    const boundedLeft = Math.min(
      document.documentElement.clientWidth - toolbarRect.width - 8,
      Math.max(8, left)
    );

    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${boundedLeft}px`;
    toolbar.setAttribute('aria-hidden', 'false');
  }

  function scheduleToolbar() {
    if (toolbarTimer) clearTimeout(toolbarTimer);
    toolbarTimer = setTimeout(showToolbarForSelection, 120);
  }

  function runCommand(cmd) {
    restoreSelection();
    canvas.focus();
    if (cmd === 'p') {
      document.execCommand('formatBlock', false, 'p');
      return;
    }
    if (cmd === 'link') {
      const selected = window.getSelection().toString().trim();
      const existingHref = document.queryCommandValue('createLink') || '';
      const raw = window.prompt('Enter URL', existingHref || 'https://');
      if (!raw) return;
      const normalized = /^(https?:\/\/|mailto:|tel:)/i.test(raw) ? raw : `https://${raw}`;
      if (selected) {
        document.execCommand('createLink', false, normalized);
      } else {
        document.execCommand('insertHTML', false, `<a href="${normalized}">${normalized}</a>`);
      }
      return;
    }
    if (cmd === 'h2') {
      document.execCommand('formatBlock', false, 'h2');
      return;
    }
    if (cmd === 'quote') {
      document.execCommand('formatBlock', false, 'blockquote');
      return;
    }
    if (cmd === 'ul') {
      document.execCommand('insertUnorderedList');
      return;
    }
    if (cmd === 'ol') {
      document.execCommand('insertOrderedList');
      return;
    }
    if (cmd === 'code') {
      const selected = window.getSelection().toString();
      const block = `<pre><code>${selected || 'code'}</code></pre>`;
      document.execCommand('insertHTML', false, block);
      return;
    }
    document.execCommand(cmd);
  }

  function getRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    }
    return null;
  }

  function setSelectionRange(range) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function isImageFile(file) {
    return /^image\//.test(file.type);
  }

  async function uploadImageFile(file) {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      headers: { 'X-CSRF-Token': csrfToken },
    });
    if (!response.ok) {
      let message = 'Image upload failed';
      try {
        const data = await response.json();
        if (data && data.error) message = data.error;
      } catch (_err) {
        try {
          const text = await response.text();
          if (text) message = text.slice(0, 180);
        } catch (_innerErr) {}
      }
      throw new Error(message);
    }
    const data = await response.json();
    return data.url;
  }

  function insertUploadedImage(url, altText) {
    const safeAlt = sanitizeAttr(altText || 'Image');
    const safeUrl = sanitizeAttr(url);
    document.execCommand(
      'insertHTML',
      false,
      `<p><img src="${safeUrl}" alt="${safeAlt}" data-size="100" class="img-size-100" /></p><p><br></p>`
    );
  }

  async function insertImageFiles(files) {
    if (!files.length) return;
    pendingUploads += files.length;
    refreshUploadState();
    let hadFailure = false;

    for (const file of files) {
      try {
        const uploadedUrl = await uploadImageFile(file);
        const baseName = file.name.replace(/\.[^.]+$/, '');
        insertUploadedImage(uploadedUrl, baseName || 'Image');
        syncBody();
      } catch (error) {
        hadFailure = true;
        setStatus(error.message || 'Image upload failed', 'error');
      } finally {
        pendingUploads = Math.max(0, pendingUploads - 1);
        refreshUploadState();
      }
    }
    syncBody();
    if (hadFailure) setStatus('Some images failed to upload.', 'error');
    else setStatus('Image upload complete.', 'success', 1800);
  }

  async function handleImageDrop(event) {
    const files = Array.from(event.dataTransfer?.files || []).filter(isImageFile);
    if (!files.length) return;

    event.preventDefault();
    event.stopPropagation();
    canvas.classList.remove('is-drag-over');

    const range = getRangeFromPoint(event.clientX, event.clientY);
    if (range) setSelectionRange(range);
    canvas.focus();
    await insertImageFiles(files);
  }

  async function handleImagePaste(event) {
    const files = Array.from(event.clipboardData?.files || []).filter(isImageFile);
    if (!files.length) return;
    event.preventDefault();
    canvas.focus();
    await insertImageFiles(files);
  }

  function getCurrentBlock(node) {
    let current = node;
    while (current && current !== canvas) {
      if (
        current.nodeType === Node.ELEMENT_NODE &&
        ['DIV', 'P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'PRE'].includes(current.tagName)
      ) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  }

  function normalizeMultilineBlockAtCaret(block, range) {
    if (!block || !['DIV', 'P'].includes(block.tagName)) return block;
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(block);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const beforeText = beforeRange.toString();
    if (!beforeText.includes('\n')) return block;

    const rawLines = (block.innerText || '').split('\n');
    if (rawLines.length < 2) return block;
    const lineIndex = Math.min(rawLines.length - 1, beforeText.split('\n').length - 1);

    const fragment = document.createDocumentFragment();
    const paragraphs = [];
    rawLines.forEach((line) => {
      const p = document.createElement('p');
      if (line.trim()) p.textContent = line;
      else p.innerHTML = '<br>';
      paragraphs.push(p);
      fragment.appendChild(p);
    });
    block.replaceWith(fragment);

    const target = paragraphs[lineIndex] || paragraphs[paragraphs.length - 1];
    placeCaretAtEnd(target);
    debugLog('normalize-multiline-block', {
      sourceTag: block.tagName,
      rawLines,
      lineIndex,
      targetTag: target.tagName,
    });
    return target;
  }

  function ensureCurrentBlock() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !canvas.contains(sel.anchorNode)) return null;

    const range = sel.getRangeAt(0);
    let block = getCurrentBlock(sel.anchorNode);
    if (block) {
      const normalized = normalizeMultilineBlockAtCaret(block, range);
      debugLog('ensure-current-block:existing', {
        blockTag: block.tagName,
        normalizedTag: normalized ? normalized.tagName : null,
      });
      return normalized;
    }

    const anchor = sel.anchorNode;
    const blockTags = ['DIV', 'P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'PRE'];

    // First-line typing can leave text directly under the root editor node.
    // Convert only that caret-hosting node into <p> to avoid cross-line transforms.
    if (anchor && anchor.nodeType === Node.TEXT_NODE && anchor.parentNode === canvas) {
      const p = document.createElement('p');
      p.textContent = anchor.textContent || '';
      const offset = Math.min(range.startOffset, (anchor.textContent || '').length);
      canvas.replaceChild(p, anchor);
      const textNode = p.firstChild;
      const newRange = document.createRange();
      if (textNode) newRange.setStart(textNode, offset);
      else newRange.setStart(p, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      const normalized = normalizeMultilineBlockAtCaret(p, newRange);
      debugLog('ensure-current-block:text-under-root', {
        createdTag: 'P',
        normalizedTag: normalized ? normalized.tagName : null,
      });
      return normalized;
    }

    if (anchor && anchor.nodeType === Node.ELEMENT_NODE && anchor.parentNode === canvas) {
      const element = anchor;
      if (blockTags.includes(element.tagName)) {
        debugLog('ensure-current-block:root-element-block', { blockTag: element.tagName });
        return element;
      }
      const p = document.createElement('p');
      if (element.tagName === 'BR') p.innerHTML = '<br>';
      else p.textContent = element.textContent || '';
      canvas.replaceChild(p, element);
      placeCaretAtEnd(p);
      const refreshedSel = window.getSelection();
      if (!refreshedSel || refreshedSel.rangeCount === 0) return p;
      const normalized = normalizeMultilineBlockAtCaret(p, refreshedSel.getRangeAt(0));
      debugLog('ensure-current-block:root-element-wrapped', {
        originalTag: element.tagName,
        normalizedTag: normalized ? normalized.tagName : null,
      });
      return normalized;
    }

    if (anchor === canvas) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      const insertAt = Math.min(range.startOffset, canvas.childNodes.length);
      const referenceNode = canvas.childNodes[insertAt] || null;
      canvas.insertBefore(p, referenceNode);
      placeCaretAtEnd(p);
      debugLog('ensure-current-block:anchor-is-canvas', { insertAt, createdTag: 'P' });
      return p;
    }

    let topLevel = anchor;
    while (topLevel && topLevel.parentNode && topLevel.parentNode !== canvas) {
      topLevel = topLevel.parentNode;
    }
    if (topLevel && topLevel.parentNode === canvas) {
      if (topLevel.nodeType === Node.ELEMENT_NODE && blockTags.includes(topLevel.tagName)) {
        debugLog('ensure-current-block:top-level-existing', { blockTag: topLevel.tagName });
        return topLevel;
      }
      const p = document.createElement('p');
      if (topLevel.nodeType === Node.TEXT_NODE) {
        p.textContent = topLevel.textContent || '';
      } else if (topLevel.nodeType === Node.ELEMENT_NODE && topLevel.tagName === 'BR') {
        p.innerHTML = '<br>';
      } else if (topLevel.nodeType === Node.ELEMENT_NODE) {
        p.innerHTML = topLevel.innerHTML || '<br>';
      } else {
        p.innerHTML = '<br>';
      }
      canvas.replaceChild(p, topLevel);
      placeCaretAtEnd(p);
      const refreshedSel = window.getSelection();
      if (!refreshedSel || refreshedSel.rangeCount === 0) return p;
      const normalized = normalizeMultilineBlockAtCaret(p, refreshedSel.getRangeAt(0));
      debugLog('ensure-current-block:top-level-wrapped', {
        topLevel: nodeLabel(topLevel),
        normalizedTag: normalized ? normalized.tagName : null,
      });
      return normalized;
    }

    // Final fallback for non-standard selection states.
    const fallback = document.createElement('p');
    fallback.innerHTML = '<br>';
    canvas.appendChild(fallback);
    placeCaretAtEnd(fallback);
    debugLog('ensure-current-block:fallback', { createdTag: 'P' });
    return fallback;
  }

  function placeCaretAtEnd(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function applyInlineMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return html;
  }

  function isCaretAtStartOfBlock(block, range) {
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(block);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    return beforeRange.toString().length === 0;
  }

  function insertParagraphAfter(block) {
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    if (block.nextSibling) block.parentNode.insertBefore(p, block.nextSibling);
    else block.parentNode.appendChild(p);
    placeCaretAtEnd(p);
  }

  function replaceBlockWithHeading(block, level, contentHtml = '') {
    const heading = document.createElement(`h${level}`);
    heading.innerHTML = contentHtml || '<br>';
    block.replaceWith(heading);
    placeCaretAtEnd(heading);
  }

  function replaceBlockWithList(block, ordered, contentHtml = '') {
    const list = document.createElement(ordered ? 'ol' : 'ul');
    const item = document.createElement('li');
    item.innerHTML = contentHtml || '<br>';
    list.appendChild(item);
    block.replaceWith(list);
    placeCaretAtEnd(item);
  }

  function isCaretAtEndOfBlock(block, range) {
    const afterRange = document.createRange();
    afterRange.selectNodeContents(block);
    afterRange.setStart(range.startContainer, range.startOffset);
    return afterRange.toString().length === 0;
  }

  function getCaretOffsetWithinNode(node) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !node || !node.contains(sel.anchorNode)) return null;
    const range = sel.getRangeAt(0);
    const targetNode = range.startContainer;
    const targetOffset = range.startOffset;
    let offset = 0;
    let found = false;

    function walk(current) {
      if (found || !current) return;
      if (current === targetNode) {
        if (current.nodeType === Node.TEXT_NODE) {
          offset += Math.min(targetOffset, (current.textContent || '').length);
        } else if (current.nodeType === Node.ELEMENT_NODE) {
          const limit = Math.min(targetOffset, current.childNodes.length);
          for (let index = 0; index < limit; index += 1) {
            offset += extractCodeText(current.childNodes[index]).length;
          }
        }
        found = true;
        return;
      }

      if (current.nodeType === Node.TEXT_NODE) {
        offset += (current.textContent || '').length;
        return;
      }
      if (current.nodeType !== Node.ELEMENT_NODE) return;
      if (current.tagName === 'BR') {
        offset += 1;
        return;
      }

      current.childNodes.forEach((child) => walk(child));
    }

    walk(node);
    return found ? offset : null;
  }

  function getCodeLineContext(pre) {
    const code = pre?.querySelector('code');
    if (!code) return null;
    const source = extractCodeText(code).replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
    const caretOffset = getCaretOffsetWithinNode(code);
    if (caretOffset === null) return null;
    const lineStart = source.lastIndexOf('\n', Math.max(0, caretOffset - 1)) + 1;
    const lineEndIndex = source.indexOf('\n', caretOffset);
    const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
    return {
      code,
      source,
      caretOffset,
      lineStart,
      lineEnd,
      lineText: source.slice(lineStart, lineEnd),
    };
  }

  function setCodeBlockSource(pre, source) {
    const code = pre?.querySelector('code');
    if (!code) return;
    code.textContent = source;
  }

  function insertTextAtSelection(text) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStart(node, node.textContent.length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertCodeLineBreak() {
    if (document.queryCommandSupported && document.queryCommandSupported('insertLineBreak')) {
      document.execCommand('insertLineBreak');
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const br = document.createElement('br');
    const spacer = document.createTextNode('\u200b');
    const fragment = document.createDocumentFragment();
    fragment.appendChild(br);
    fragment.appendChild(spacer);
    range.insertNode(fragment);
    range.setStart(spacer, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function exitCodeBlock(pre) {
    insertParagraphAfter(pre);
    syncBody();
    scheduleToolbar();
  }

  function handleEnterInFormattedBlock(event) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !canvas.contains(sel.anchorNode)) return;

    const block = ensureCurrentBlock();
    if (!block) return;
    if (!['H1', 'H2', 'H3', 'BLOCKQUOTE'].includes(block.tagName)) return;

    debugLog('enter-formatted:prevent-default', { blockTag: block.tagName });
    event.preventDefault();
    insertParagraphAfter(block);
    syncBody();
    scheduleToolbar();
  }

  function handleCodeBlockKeydown(event) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !canvas.contains(sel.anchorNode)) return;
    const pre = getCurrentBlock(sel.anchorNode);
    if (!pre || pre.tagName !== 'PRE') return;

    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      exitCodeBlock(pre);
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey) return;

    const line = getCodeLineContext(pre);
    if (!line) return;
    if (line.lineText.trim() === '```') {
      event.preventDefault();
      const before = line.source.slice(0, line.lineStart);
      const after = line.lineEnd < line.source.length ? line.source.slice(line.lineEnd + 1) : '';
      const nextSource = `${before}${after}`.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
      setCodeBlockSource(pre, nextSource);
      exitCodeBlock(pre);
      return;
    }

    if (!line.lineText.trim() && !line.source.slice(line.caretOffset).trim()) {
      event.preventDefault();
      exitCodeBlock(pre);
      return;
    }

    event.preventDefault();
    insertCodeLineBreak();
    syncBody();
  }

  function handleEnterInParagraphBlock(event) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !canvas.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    const block = ensureCurrentBlock();
    if (!block) return;
    if (!['DIV', 'P'].includes(block.tagName)) return;
    const fence = parseFenceDeclaration(block.textContent.replace(/\u00a0/g, ' '));
    if (fence && isCaretAtEndOfBlock(block, range)) {
      debugLog('enter-code-fence:prevent-default', { language: fence.language || '' });
      event.preventDefault();
      replaceBlockWithCodeFence(block, fence.language);
      syncBody();
      scheduleToolbar();
      return;
    }
    if (!isCaretAtEndOfBlock(block, range)) return;

    debugLog('enter-paragraph:prevent-default', { blockTag: block.tagName });
    event.preventDefault();
    insertParagraphAfter(block);
    syncBody();
    scheduleToolbar();
  }

  function unwrapPreToParagraph(pre) {
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    pre.replaceWith(p);
    placeCaretAtEnd(p);
  }

  function parseFenceDeclaration(text) {
    const match = (text || '').match(/^```([a-z0-9_+-]+)?\s*$/i);
    if (!match) return null;
    return { language: (match[1] || '').toLowerCase() };
  }

  function replaceBlockWithCodeFence(block, language = '') {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    if (language) code.className = `language-${language}`;
    pre.appendChild(code);
    block.replaceWith(pre);
    placeCaretAtEnd(code);
  }

  function handleReverseMarkdownShortcut(event) {
    if (event.key !== 'Backspace') return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !canvas.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    const block = ensureCurrentBlock();
    if (!block || !isCaretAtStartOfBlock(block, range)) return;

    const tag = block.tagName;
    if (tag === 'LI') {
      event.preventDefault();
      document.execCommand('outdent');
      syncBody();
      scheduleToolbar();
      return;
    }

    if (['H1', 'H2', 'H3', 'BLOCKQUOTE'].includes(tag)) {
      event.preventDefault();
      document.execCommand('formatBlock', false, 'p');
      syncBody();
      scheduleToolbar();
      return;
    }

    if (tag === 'PRE') {
      event.preventDefault();
      if (!block.textContent.trim()) {
        unwrapPreToParagraph(block);
      } else {
        document.execCommand('formatBlock', false, 'p');
      }
      syncBody();
      scheduleToolbar();
    }
  }

  function transformCurrentBlockFromMarkdown() {
    if (isTransforming) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !canvas.contains(sel.anchorNode)) return;
    const block = ensureCurrentBlock();
    if (!block) return;

    const rawText = block.textContent.replace(/\u00a0/g, ' ');
    const rawTrim = rawText.trim();
    debugLog('transform:start', { blockTag: block.tagName, rawText, rawTrim });

    if (/^#{1,3}\s+$/.test(rawText) && ['DIV', 'P'].includes(block.tagName)) {
      isTransforming = true;
      const level = rawText.trim().length;
      replaceBlockWithHeading(block, level);
      debugLog('transform:heading-token', { level });
      isTransforming = false;
      syncBody();
      return;
    }

    let headingMatch = rawText.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch && ['DIV', 'P'].includes(block.tagName)) {
      isTransforming = true;
      const level = headingMatch[1].length;
      const contentHtml = applyInlineMarkdown(headingMatch[2]);
      replaceBlockWithHeading(block, level, contentHtml);
      debugLog('transform:heading-content', { level, content: headingMatch[2] });
      isTransforming = false;
      syncBody();
      return;
    }

    let quoteTokenMatch = rawText.match(/^>\s+$/);
    if (quoteTokenMatch) {
      isTransforming = true;
      const quote = document.createElement('blockquote');
      quote.innerHTML = '<br>';
      block.replaceWith(quote);
      placeCaretAtEnd(quote);
      debugLog('transform:blockquote-token');
      isTransforming = false;
      syncBody();
      return;
    }

    let quoteMatch = rawText.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      isTransforming = true;
      const quote = document.createElement('blockquote');
      quote.innerHTML = applyInlineMarkdown(quoteMatch[1]);
      block.replaceWith(quote);
      placeCaretAtEnd(quote);
      debugLog('transform:blockquote', { content: quoteMatch[1] });
      isTransforming = false;
      syncBody();
      return;
    }

    let ulTokenMatch = rawText.match(/^[-*]\s+$/);
    if (ulTokenMatch && ['DIV', 'P'].includes(block.tagName)) {
      isTransforming = true;
      replaceBlockWithList(block, false);
      debugLog('transform:ul-token');
      isTransforming = false;
      syncBody();
      return;
    }

    let ulMatch = rawText.match(/^[-*]\s+(.+)$/);
    if (ulMatch && ['DIV', 'P'].includes(block.tagName)) {
      isTransforming = true;
      replaceBlockWithList(block, false, applyInlineMarkdown(ulMatch[1]));
      debugLog('transform:ul', { content: ulMatch[1] });
      isTransforming = false;
      syncBody();
      return;
    }

    let olTokenMatch = rawText.match(/^1\.\s+$/);
    if (olTokenMatch && ['DIV', 'P'].includes(block.tagName)) {
      isTransforming = true;
      replaceBlockWithList(block, true);
      debugLog('transform:ol-token');
      isTransforming = false;
      syncBody();
      return;
    }

    let olMatch = rawText.match(/^1\.\s+(.+)$/);
    if (olMatch && ['DIV', 'P'].includes(block.tagName)) {
      isTransforming = true;
      replaceBlockWithList(block, true, applyInlineMarkdown(olMatch[1]));
      debugLog('transform:ol', { content: olMatch[1] });
      isTransforming = false;
      syncBody();
      return;
    }

    if (rawText.includes('**') || rawText.includes('*') || rawText.includes('`') || rawText.includes('](')) {
      const hasTags = /<(a|strong|em|code)\b/i.test(block.innerHTML);
      if (!hasTags) {
        const converted = applyInlineMarkdown(rawText);
        if (converted !== escapeHtml(rawText)) {
          isTransforming = true;
          block.innerHTML = converted;
          placeCaretAtEnd(block);
          debugLog('transform:inline-markdown', { rawText });
          isTransforming = false;
          syncBody();
        }
      }
    }
  }

  function scheduleTransform() {
    if (transformTimer) clearTimeout(transformTimer);
    transformTimer = setTimeout(transformCurrentBlockFromMarkdown, 80);
  }

  buttons.forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      runCommand(button.dataset.cmd);
      syncBody();
      scheduleToolbar();
    });
  });

  draftsToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleDraftsPanel();
  });
  draftDeleteButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm('Delete this draft?')) return;
      postRedirect(button.dataset.deleteUrl, button.dataset.next);
    });
  });

  canvas.addEventListener('mouseup', scheduleToolbar);
  canvas.addEventListener('keyup', scheduleToolbar);
  canvas.addEventListener('touchend', scheduleToolbar);
  canvas.addEventListener('pointerup', scheduleToolbar);
  canvas.addEventListener('keydown', (event) => {
    debugLog('keydown', { key: event.key, shift: event.shiftKey, meta: event.metaKey, ctrl: event.ctrlKey });
    handleCodeBlockKeydown(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      document.execCommand('insertLineBreak');
      syncBody();
      scheduleToolbar();
      return;
    }
    handleEnterInFormattedBlock(event);
    if (event.defaultPrevented) return;
    handleEnterInParagraphBlock(event);
    if (event.defaultPrevented) return;
    if (event.key === ' ' || (event.key === 'Enter' && !event.shiftKey)) scheduleTransform();
  });
  canvas.addEventListener('keyup', (event) => {
    if (event.key === 'Enter' && event.shiftKey) return;
    if (
      event.key.length === 1 ||
      event.key === 'Backspace' ||
      event.key === 'Delete' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      scheduleTransform();
    }
  });
  canvas.addEventListener('keydown', (event) => {
    handleReverseMarkdownShortcut(event);
  });
  canvas.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      runCommand('link');
      syncBody();
      scheduleToolbar();
    }
  });
  canvas.addEventListener('blur', hideToolbar);
  canvas.addEventListener('click', (event) => {
    if (event.target && event.target.tagName === 'IMG') {
      showImageToolbar(event.target);
      return;
    }
    hideImageToolbar();
  });
  canvas.addEventListener('dragover', (event) => {
    const hasImage = Array.from(event.dataTransfer?.items || []).some((item) => item.type.startsWith('image/'));
    if (!hasImage) return;
    event.preventDefault();
    canvas.classList.add('is-drag-over');
  });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('is-drag-over'));
  canvas.addEventListener('drop', handleImageDrop);
  canvas.addEventListener('paste', handleImagePaste);
  document.addEventListener('selectionchange', () => {
    if (activeImage) hideImageToolbar();
    if (!selectionInsideEditor()) hideToolbar();
    else scheduleToolbar();
  });
  window.addEventListener('scroll', () => {
    if (toolbar.classList.contains('visible')) scheduleToolbar();
    refreshImageToolbarPosition();
  });
  window.addEventListener('resize', () => {
    if (toolbar.classList.contains('visible')) scheduleToolbar();
    refreshImageToolbarPosition();
  });
  document.addEventListener('click', (event) => {
    if (!draftsPanel.hidden && !draftsPanel.contains(event.target) && !draftsToggle.contains(event.target)) {
      closeDraftsPanel();
    }
    if (
      !toolbar.contains(event.target) &&
      !imageToolbar.contains(event.target) &&
      !canvas.contains(event.target)
    ) {
      hideToolbar();
      hideImageToolbar();
    }
  });

  imageButtons.forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      if (!activeImage) return;
      const size = button.dataset.size;
      applyImageSize(activeImage, size);
      showImageToolbar(activeImage);
      syncBody();
    });
  });

  if (titleInput) {
    titleInput.addEventListener('input', () => {
      maybeAutoUpdateSlug();
      syncBody();
    });
  }
  if (slugInput) {
    slugInput.addEventListener('input', () => {
      const typed = slugInput.value || '';
      slugTouched = typed.trim().length > 0;
      syncBody();
    });
    slugInput.addEventListener('blur', () => {
      const cleaned = createSlug(slugInput.value);
      if (cleaned !== slugInput.value) slugInput.value = cleaned;
      if (!cleaned && titleInput) {
        slugTouched = false;
        maybeAutoUpdateSlug();
      }
      syncBody();
    });
  }
  if (summaryInput) summaryInput.addEventListener('input', () => syncBody());
  if (publishedAtInput) publishedAtInput.addEventListener('input', () => syncBody());

  if (restoreDraftButton) {
    restoreDraftButton.addEventListener('click', () => {
      if (!restoreCandidate) return;
      applyAutosaveDraft(restoreCandidate);
      hideRestoreBanner();
    });
  }
  if (discardRestoreButton) {
    discardRestoreButton.addEventListener('click', () => {
      restoreCandidate = null;
      clearAutosave();
      hideRestoreBanner();
      setStatus('Local draft discarded.', 'success', 1800);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (!form.contains(document.activeElement)) return;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (saveDraftButton) form.requestSubmit(saveDraftButton);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (publishButton) form.requestSubmit(publishButton);
      return;
    }
    if (event.key === 'Escape') {
      hideToolbar();
      hideImageToolbar();
      if (!draftsPanel.hidden) closeDraftsPanel();
    }
  });

  canvas.addEventListener('input', () => {
    syncBody();
    scheduleTransform();
  });
  form.addEventListener('submit', (event) => {
    syncBody();
    const submitter = event.submitter;
    const isPreview = submitter === previewButton;
    const action = submitter && submitter.value ? submitter.value : 'publish';
    if (pendingUploads > 0) {
      event.preventDefault();
      setStatus('Please wait for image uploads to finish before saving.', 'error');
      return;
    }
    if (!isPreview && action !== 'draft' && !hasMeaningfulContent(bodyMd.value || '')) {
      event.preventDefault();
      setStatus('Add some content before publishing.', 'error');
      return;
    }
    if (isPreview) {
      setStatus('Preview opened in a new tab.', 'success', 1500);
      return;
    }
    hasSubmitted = true;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    clearAutosave();
    setStatus(action === 'draft' ? 'Saving draft...' : 'Publishing...');
  });

  window.addEventListener('beforeunload', (event) => {
    if (hasSubmitted) return;
    if (!isDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  normalizeCanvasImages();
  normalizeCodeBlocksForEditing();
  syncBody({ trackChanges: false, autosave: false });
  maybeAutoUpdateSlug();
  syncBody({ trackChanges: false, autosave: false });
  initialSnapshot = snapshotState();
  updateDirtyState();

  restoreCandidate = loadAutosave();
  const currentSignature = autosaveSignature({
    title: titleInput ? titleInput.value : '',
    slug: slugInput ? slugInput.value : '',
    publishedAt: publishedAtInput ? publishedAtInput.value : '',
    summary: summaryInput ? summaryInput.value : '',
    bodyHtml: bodyHtml.value || '',
  });
  if (restoreCandidate && autosaveSignature(restoreCandidate) !== currentSignature) {
    presentRestoreBanner(restoreCandidate);
  }
})();
