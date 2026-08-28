'use strict';

(function initReports() {
  const els = {
    date: $('#report-date'),
    btnPrev: $('#btn-prev-day'),
    btnNext: $('#btn-next-day'),
    btnRefresh: $('#btn-refresh'),
    btnDownload: $('#btn-download'),
    body: $('#report-body'),
    cards: $('#record-cards'),
    table: $('.report-table'),
    empty: $('#report-empty'),
    present: $('#rep-present'),
    rows: $('#rep-rows'),
  };

  const today = toLocalISODate();
  els.date.value = today;
  els.date.max = today;

  let records = [];
  let sort = { key: 'timestamp', dir: 'asc' };

  /* ---- date helpers ---------------------------------------------------- */
  function shiftDate(days) {
    const d = new Date(`${els.date.value || today}T00:00:00`);
    d.setDate(d.getDate() + days);
    const iso = toLocalISODate(d);
    if (iso > today) return;
    els.date.value = iso;
    load();
  }

  function syncNav() {
    els.btnNext.disabled = (els.date.value || today) >= today;
  }

  /* ---- rendering ------------------------------------------------------- */
  function timeOf(record) {
    return (record.timestamp || '').split(' ')[1] || '';
  }

  function sortRecords() {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...records].sort((a, b) => {
      const av = String(a[sort.key] == null ? '' : a[sort.key]).toLowerCase();
      const bv = String(b[sort.key] == null ? '' : b[sort.key]).toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function render() {
    const rows = sortRecords();

    els.body.innerHTML = rows.map((r, i) => `
      <tr>
        <td class="mono text-3">${i + 1}</td>
        <td><strong>${escapeHtml(r.name || 'Unknown student')}</strong></td>
        <td class="mono">${escapeHtml(r.student_id)}</td>
        <td class="mono">${escapeHtml(timeOf(r) || '—')}</td>
        <td><span class="chip chip-present">Present</span></td>
      </tr>`).join('');

    els.cards.innerHTML = rows.map((r) => `
      <div class="record-card">
        <span class="rc-name">${escapeHtml(r.name || 'Unknown student')}</span>
        <span class="rc-status"><span class="chip chip-present">Present</span></span>
        <span class="rc-meta">${escapeHtml(r.student_id)} &nbsp;/&nbsp; ${escapeHtml(timeOf(r) || '—')}</span>
      </div>`).join('');

    $$('th[data-sort]').forEach((th) => {
      if (th.dataset.sort === sort.key) {
        th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
      } else {
        th.removeAttribute('aria-sort');
      }
    });
  }

  /* ---- load ------------------------------------------------------------ */
  async function load() {
    const date = els.date.value || today;
    syncNav();
    setLoading(els.btnRefresh, true, 'Loading');
    els.empty.classList.add('hidden');

    try {
      const res = await api(`/api/attendance/records?date=${encodeURIComponent(date)}`);
      records = res.records || [];

      const presentCount = new Set(records.map((r) => r.student_id)).size;
      els.present.textContent = `${presentCount} present`;
      els.rows.textContent = `${records.length} record${records.length === 1 ? '' : 's'}`;
      els.btnDownload.href = `/api/reports/download?date=${encodeURIComponent(date)}`;

      if (!records.length) {
        els.body.innerHTML = '';
        els.cards.innerHTML = '';
        els.table.classList.add('hidden');
        els.empty.classList.remove('hidden');
        return;
      }

      els.table.classList.remove('hidden');
      render();
    } catch (err) {
      toast(err.message, 'error');
      els.body.innerHTML = '';
      els.cards.replaceChildren(retryState('Could not load these records.', load));
    } finally {
      setLoading(els.btnRefresh, false);
    }
  }

  /* ---- wiring ---------------------------------------------------------- */
  els.date.addEventListener('change', load);
  els.btnRefresh.addEventListener('click', load);
  els.btnPrev.addEventListener('click', () => shiftDate(-1));
  els.btnNext.addEventListener('click', () => shiftDate(1));

  $$('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(btn.dataset.quick, 10));
      els.date.value = toLocalISODate(d);
      load();
    });
  });

  $$('th[data-sort]').forEach((th) => {
    th.querySelector('button').addEventListener('click', () => {
      const key = th.dataset.sort;
      sort = { key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' };
      render();
    });
  });

  load();
})();
