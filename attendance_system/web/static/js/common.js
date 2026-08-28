'use strict';

/* ==========================================================================
   CampusEye — shared frontend utilities
   ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------------- api */

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON error body */ }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

/* ----------------------------------------------------------------- icons */

const svg = (paths, width = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}"` +
  ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  info:    svg('<circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="11"/><line x1="12" y1="8" x2="12.01" y2="8"/>', 1.75),
  success: svg('<circle cx="12" cy="12" r="9"/><polyline points="8.5 12.5 11 15 15.5 9.5"/>', 1.75),
  check:   svg('<circle cx="12" cy="12" r="9"/><polyline points="8.5 12.5 11 15 15.5 9.5"/>', 1.75),
  error:   svg('<circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', 1.75),
  warn:    svg('<path d="M10.3 3.9 2 18.1A2 2 0 0 0 3.7 21h16.6a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9.5" x2="12" y2="13.5"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 1.75),
  close:   svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 2),
  empty:   svg('<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 1.75),
  camera:  svg('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.25"/>', 1.75),
  refresh: svg('<polyline points="21 4 21 10 15 10"/><path d="M20.5 14a8.5 8.5 0 1 1-2-8.9L21 7"/>', 1.75),
};

/* ---------------------------------------------------------------- toasts */

/* Toasts live in an aria-live region, carry an explicit close control and
   can be dismissed from the keyboard. Errors persist until acknowledged —
   auto-dismissing something the user needs to read is a bug, not a feature. */
function toast(message, type = 'info') {
  const host = $('#toasts');
  if (!host) return;

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML =
    `<span class="toast-icon">${ICONS[type] || ICONS.info}</span>` +
    `<span class="toast-msg"></span>` +
    `<button class="toast-close" type="button" aria-label="Dismiss">${ICONS.close}</button>`;
  el.querySelector('.toast-msg').textContent = message;

  let timer = null;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  };

  el.querySelector('.toast-close').addEventListener('click', dismiss);
  host.appendChild(el);

  if (type !== 'error') {
    timer = setTimeout(dismiss, type === 'warn' ? 7000 : 4500);
    // Reading takes longer than 4.5s if you are hovering to read it.
    el.addEventListener('mouseenter', () => { if (timer) clearTimeout(timer); });
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 2000); });
  }
  return dismiss;
}

/* --------------------------------------------------------- button states */

/* Toggles a class and aria-busy instead of replacing innerHTML, so child
   nodes, their listeners and the button's accessible name all survive. */
function setLoading(button, loading, busyLabel) {
  if (!button) return;
  if (loading) {
    button.dataset.prevDisabled = button.disabled ? '1' : '';
    button.setAttribute('aria-busy', 'true');
    button.disabled = true;
    if (busyLabel) {
      if (!button.dataset.prevLabel) {
        button.dataset.prevLabel = button.getAttribute('aria-label') || '';
      }
      button.setAttribute('aria-label', busyLabel);
    }
  } else {
    button.removeAttribute('aria-busy');
    button.disabled = button.dataset.prevDisabled === '1';
    if (button.dataset.prevLabel !== undefined) {
      if (button.dataset.prevLabel) {
        button.setAttribute('aria-label', button.dataset.prevLabel);
      } else {
        button.removeAttribute('aria-label');
      }
      delete button.dataset.prevLabel;
    }
    delete button.dataset.prevDisabled;
  }
}

/* ----------------------------------------------------------------- images */

function shrinkImage(dataUrl, maxSize = 1280, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Could not read the image file.'));
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

/* Calendar dates must be formed from LOCAL parts, never toISOString(), which
   converts to UTC first. East of Greenwich that silently rolls the date back
   a day, so "yesterday" lands two days back and "today" can resolve to
   yesterday before dawn. The server stamps records with local time, so the
   client has to agree with it. */
function toLocalISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatSize(bytes) {
  return bytes > 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/* ---------------------------------------------------------------- markup */

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/* Standard placeholders, so every panel loads and fails the same way. */
function skeletonRows(count = 4, withAvatar = true) {
  return Array.from({ length: count }, () => `
    <li class="skel-row">
      ${withAvatar ? '<span class="skel skel-circle"></span>' : ''}
      <span class="skel skel-line" style="flex:1;max-width:${120 + Math.round(Math.random() * 90)}px"></span>
      <span class="skel skel-line" style="width:44px"></span>
    </li>`).join('');
}

function skeletonCells(rows = 5, cols = 4) {
  return Array.from({ length: rows }, () => `
    <tr>${Array.from({ length: cols }, () =>
      '<td><span class="skel skel-line" style="display:block"></span></td>').join('')}</tr>`).join('');
}

/* Every failed fetch gets a retry affordance rather than a dead end. */
function retryState(message, onRetry) {
  const wrap = document.createElement('div');
  wrap.className = 'retry-state';
  wrap.innerHTML =
    `<span class="empty-icon">${ICONS.warn}</span>` +
    `<span class="retry-msg"></span>` +
    `<button class="btn btn-ghost btn-sm" type="button">${ICONS.refresh}Try again</button>`;
  wrap.querySelector('.retry-msg').textContent = message;
  wrap.querySelector('button').addEventListener('click', onRetry);
  return wrap;
}

function emptyState(title, body, icon = 'empty') {
  return `
    <div class="empty empty-sm">
      <span class="empty-icon">${ICONS[icon] || ICONS.empty}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
    </div>`;
}

/* ------------------------------------------------------------ nav drawer */

(function initDrawer() {
  const rail = $('#rail');
  const scrim = $('#scrim');
  const toggle = $('#drawer-toggle');
  if (!rail || !scrim || !toggle) return;

  const MOBILE = () => window.matchMedia('(max-width: 768px)').matches;
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let lastFocused = null;

  /* When the drawer is closed on mobile it is marked inert, so the tab order
     never walks through off-screen navigation. */
  function syncInert() {
    if (MOBILE() && !rail.classList.contains('open')) {
      rail.setAttribute('inert', '');
    } else {
      rail.removeAttribute('inert');
    }
  }

  function open() {
    lastFocused = document.activeElement;
    rail.classList.add('open');
    rail.removeAttribute('inert');
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('open'));
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    const first = rail.querySelector(FOCUSABLE);
    if (first) first.focus();
  }

  function close() {
    rail.classList.remove('open');
    scrim.classList.remove('open');
    setTimeout(() => { if (!rail.classList.contains('open')) scrim.hidden = true; }, 260);
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    syncInert();

    /* Return focus to whatever opened the drawer. Anything still inside the
       now-inert rail, or no longer in the document, is not a valid landing
       spot — fall back to the toggle, which is the control that owns it. */
    const target =
      lastFocused && document.contains(lastFocused) &&
      !rail.contains(lastFocused) && lastFocused !== document.body
        ? lastFocused
        : toggle;
    target.focus();
    lastFocused = null;
  }

  toggle.addEventListener('click', () => {
    rail.classList.contains('open') ? close() : open();
  });
  scrim.addEventListener('click', close);

  document.addEventListener('keydown', (event) => {
    if (!rail.classList.contains('open')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    /* Focus trap: Tab cycles within the drawer while it is open. */
    if (event.key === 'Tab') {
      const items = [...rail.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener('resize', () => {
    if (!MOBILE() && rail.classList.contains('open')) close();
    else syncInert();
  });

  syncInert();
})();
