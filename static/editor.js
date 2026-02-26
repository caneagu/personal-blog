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
  const uploadUrl = form.dataset.uploadUrl || '';
  const csrfToken = form.dataset.csrfToken || '';
  const imageSizes = ['25', '50', '75', '100'];
  const editorDebugEnabled =
    new URLSearchParams(window.location.search).get('editorDebug') === '1' ||
    window.localStorage.getItem('editorDebug') === '1';
  let savedRange = null;
  let toolbarTimer = null;
  let transformTimer = null;
  let isTransforming = false;
  let activeImage = null;

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

  function toMarkdownFromHtml(value) {
    let out = value;
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
    out = out.replace(/<a[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, '[$3]($2)');
    out = out.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
    out = out.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
    out = out.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
    out = out.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
    out = out.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n\n> $1\n\n');
    out = out.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n\n```\n$1\n```\n\n');
    out = out.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
      return '\n' + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n') + '\n';
    });
    out = out.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
      let idx = 0;
      return '\n' + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, item) => `${++idx}. ${item}\n`) + '\n';
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
    return markdownText;
  }

  function syncBody() {
    normalizeCanvasImages();
    bodyHtml.value = canvas.innerHTML.trim();
    bodyMd.value = toMarkdownFromHtml(canvas.innerHTML);
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

  async function handleImageDrop(event) {
    const files = Array.from(event.dataTransfer?.files || []).filter(isImageFile);
    if (!files.length) return;

    event.preventDefault();
    event.stopPropagation();
    canvas.classList.remove('is-drag-over');

    const range = getRangeFromPoint(event.clientX, event.clientY);
    if (range) setSelectionRange(range);
    canvas.focus();

    for (const file of files) {
      try {
        const uploadedUrl = await uploadImageFile(file);
        const baseName = file.name.replace(/\.[^.]+$/, '');
        insertUploadedImage(uploadedUrl, baseName || 'Image');
      } catch (error) {
        window.alert(error.message || 'Image upload failed');
      }
    }
    syncBody();
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

  function isCaretAtEndOfBlock(block, range) {
    const afterRange = document.createRange();
    afterRange.selectNodeContents(block);
    afterRange.setStart(range.startContainer, range.startOffset);
    return afterRange.toString().length === 0;
  }

  function handleEnterInFormattedBlock(event) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !canvas.contains(sel.anchorNode)) return;

    const block = ensureCurrentBlock();
    if (!block) return;
    if (!['H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE'].includes(block.tagName)) return;

    debugLog('enter-formatted:prevent-default', { blockTag: block.tagName });
    event.preventDefault();
    insertParagraphAfter(block);
    syncBody();
    scheduleToolbar();
  }

  function handleEnterInParagraphBlock(event) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !canvas.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    const block = ensureCurrentBlock();
    if (!block) return;
    if (!['DIV', 'P'].includes(block.tagName)) return;
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

    if (/^#{1,3}\s+$/.test(rawText)) {
      isTransforming = true;
      const level = rawText.trim().length;
      block.textContent = '';
      placeCaretAtEnd(block);
      document.execCommand('formatBlock', false, `h${level}`);
      debugLog('transform:heading-token', { level });
      isTransforming = false;
      syncBody();
      return;
    }

    let headingMatch = rawText.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      isTransforming = true;
      const level = headingMatch[1].length;
      const contentHtml = applyInlineMarkdown(headingMatch[2]);
      block.innerHTML = contentHtml;
      placeCaretAtEnd(block);
      document.execCommand('formatBlock', false, `h${level}`);
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
    if (ulTokenMatch) {
      isTransforming = true;
      block.textContent = '';
      placeCaretAtEnd(block);
      document.execCommand('insertUnorderedList');
      debugLog('transform:ul-token');
      isTransforming = false;
      syncBody();
      return;
    }

    let ulMatch = rawText.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      isTransforming = true;
      block.textContent = ulMatch[1];
      placeCaretAtEnd(block);
      document.execCommand('insertUnorderedList');
      debugLog('transform:ul', { content: ulMatch[1] });
      isTransforming = false;
      syncBody();
      return;
    }

    let olTokenMatch = rawText.match(/^1\.\s+$/);
    if (olTokenMatch) {
      isTransforming = true;
      block.textContent = '';
      placeCaretAtEnd(block);
      document.execCommand('insertOrderedList');
      debugLog('transform:ol-token');
      isTransforming = false;
      syncBody();
      return;
    }

    let olMatch = rawText.match(/^1\.\s+(.+)$/);
    if (olMatch) {
      isTransforming = true;
      block.textContent = olMatch[1];
      placeCaretAtEnd(block);
      document.execCommand('insertOrderedList');
      debugLog('transform:ol', { content: olMatch[1] });
      isTransforming = false;
      syncBody();
      return;
    }

    if (rawTrim === '```') {
      isTransforming = true;
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      pre.appendChild(code);
      block.replaceWith(pre);
      placeCaretAtEnd(code);
      debugLog('transform:code-fence');
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

  draftsToggle.addEventListener('click', toggleDraftsPanel);
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
    if (!draftsPanel.hidden && !draftsPanel.contains(event.target) && event.target !== draftsToggle) {
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

  canvas.addEventListener('input', () => {
    syncBody();
    scheduleTransform();
  });
  form.addEventListener('submit', syncBody);
  normalizeCanvasImages();
  syncBody();
})();
