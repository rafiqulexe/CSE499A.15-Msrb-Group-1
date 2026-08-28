'use strict';

(function initReports() {
  const els = {
    date: $('#report-date'),
    btnRefresh: $('#btn-refresh'),
    btnDownload: $('#btn-download'),
    body: $('#report-body'),
    empty: $('#report-empty'),
    present: $('#rep-present'),
    rows: $('#rep-rows'),
  };

  const today = new Date().toISOString().slice(0, 10);
  els.date.value = today;
  els.date.max = today;

  async function load() {
    const date = els.date.value || today;
    setLoading(els.btnRefresh, true, 'Loading…');
    try {
      const res = await api(`/api/attendance/records?date=${encodeURIComponent(date)}`);
      const records = res.records || [];
      els.present.textContent = new Set(records.map((r) => r.student_id)).size;
      els.rows.textContent = records.length;
      els.btnDownload.href = `/api/reports/download?date=${encodeURIComponent(date)}`;

      if (!records.length) {
        els.body.innerHTML = '';
        els.empty.classList.remove('hidden');
        return;
      }
      els.empty.classList.add('hidden');
      els.body.innerHTML = records.map((r, i) => `
        <tr>
          <td class="mono">${i + 1}</td>
          <td><strong>${escapeHtml(r.name || 'Unknown student')}</strong></td>
          <td class="mono">${escapeHtml(r.student_id)}</td>
          <td class="mono">${escapeHtml(r.date)}</td>
          <td class="mono">${escapeHtml((r.timestamp || '').split(' ')[1] || '—')}</td>
          <td><span class="chip chip-green">Present</span></td>
        </tr>`).join('');
    } catch (err) {
      toast(err.message, 'error');
      els.body.innerHTML = '<tr><td colspan="6" class="loading-row">Could not load records.</td></tr>';
    } finally {
      setLoading(els.btnRefresh, false);
    }
  }

  els.date.addEventListener('change', load);
  els.btnRefresh.addEventListener('click', load);
  load();
})();
