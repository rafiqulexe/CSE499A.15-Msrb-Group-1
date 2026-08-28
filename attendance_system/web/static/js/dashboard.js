'use strict';

(function initDashboard() {
  const els = {
    date: $('#dash-date'),
    present: $('#stat-present'),
    students: $('#stat-students'),
    rate: $('#stat-rate'),
    coverageFill: $('#coverage-fill'),
    coverageText: $('#coverage-text'),
    coverageRemaining: $('#coverage-remaining'),
    lastScan: $('#last-scan'),
    recent: $('#recent-list'),
    activityCount: $('#activity-count'),
    trendChart: $('#trend-chart'),
    trendStart: $('#trend-start'),
    trendPeak: $('#trend-peak'),
    btnReload: $('#btn-reload'),
  };

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  els.date.textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  /* Count-up is decorative; under reduced motion the value simply appears. */
  function countTo(el, target, suffix = '') {
    const decimals = target % 1 ? 1 : 0;
    if (REDUCED) {
      el.textContent = target.toFixed(decimals) + suffix;
      return;
    }
    const start = performance.now();
    const duration = 600;
    (function frame(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    })(start);
  }

  function renderRecent(records) {
    if (!records.length) {
      els.recent.innerHTML = `<li>${emptyState(
        'Nothing recorded yet',
        'Students appear here the moment a scan marks them present.',
        'camera',
      )}</li>`;
      els.activityCount.textContent = 'Today';
      return;
    }
    els.activityCount.textContent = `${records.length} today`;
    els.recent.innerHTML = records.map((r) => {
      const name = r.name || 'Unknown student';
      const time = (r.timestamp || '').split(' ')[1] || '';
      const initial = escapeHtml(name.trim().charAt(0).toUpperCase() || '?');
      return `
        <li>
          <span class="avatar" aria-hidden="true">${initial}</span>
          <span class="who">
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(r.student_id)}</small>
          </span>
          <span class="when">${escapeHtml(time)}</span>
          <span class="chip chip-present">Present</span>
        </li>`;
    }).join('');
  }

  function renderCoverage(present, students, rate) {
    const pct = students ? Math.min(100, rate) : 0;
    els.coverageFill.style.width = `${pct}%`;
    els.coverageFill.setAttribute('aria-valuenow', String(Math.round(pct)));
    els.coverageText.textContent = `${present} of ${students} present`;
    const missing = Math.max(0, students - present);
    els.coverageRemaining.textContent = students
      ? (missing ? `${missing} not yet seen` : 'full attendance')
      : 'no students enrolled';
  }

  /* ---- 14-day trend -----------------------------------------------------
     Built from the existing per-date records endpoint, one request per day,
     issued in parallel. Fine at classroom scale; a single range endpoint
     would be the natural optimisation if the dataset ever grows. */
  function lastNDates(n) {
    const out = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      out.push({
        iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        isToday: i === 0,
      });
    }
    return out;
  }

  async function loadTrend() {
    const days = lastNDates(14);
    els.trendStart.textContent = days[0].label;

    const results = await Promise.all(days.map((day) =>
      api(`/api/attendance/records?date=${encodeURIComponent(day.iso)}`)
        .then((res) => new Set((res.records || []).map((r) => r.student_id)).size)
        .catch(() => null)));

    const counts = results.map((v) => (v === null ? 0 : v));
    const peak = Math.max(1, ...counts);
    els.trendPeak.textContent = `peak ${Math.max(...counts)}`;

    els.trendChart.innerHTML = days.map((day, i) => {
      const value = counts[i];
      const height = Math.round((value / peak) * 100);
      const cls = ['trend-bar'];
      if (day.isToday) cls.push('is-today');
      if (!value) cls.push('is-empty');
      return `<span class="${cls.join(' ')}" title="${day.label}: ${value} present">
                <i style="height:${value ? Math.max(height, 6) : 2}%"></i>
              </span>`;
    }).join('');
  }

  /* ---- load ------------------------------------------------------------ */
  async function load() {
    setLoading(els.btnReload, true, 'Refreshing');
    els.recent.innerHTML = skeletonRows(4);
    try {
      const stats = await api('/api/stats');

      countTo(els.present, stats.present_today);
      countTo(els.students, stats.students);
      countTo(els.rate, stats.rate, '%');
      renderCoverage(stats.present_today, stats.students, stats.rate);
      renderRecent(stats.recent || []);

      const latest = (stats.recent || [])[0];
      els.lastScan.textContent = latest && latest.timestamp
        ? `last marked ${(latest.timestamp.split(' ')[1] || '').slice(0, 5)}`
        : 'No scan yet today';

      loadTrend().catch(() => {
        els.trendChart.innerHTML = '';
        els.trendPeak.textContent = 'unavailable';
      });
    } catch (err) {
      toast(err.message, 'error');
      els.recent.replaceChildren(retryState('Could not load activity.', load));
    } finally {
      setLoading(els.btnReload, false);
    }
  }

  els.btnReload.addEventListener('click', load);
  load();
})();
