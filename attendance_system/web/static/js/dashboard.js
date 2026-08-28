'use strict';

(function initDashboard() {
  $('#dash-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  function animateNumber(el, target, suffix = '') {
    const start = performance.now();
    const duration = 700;
    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = (target * eased).toFixed(target % 1 ? 1 : 0) + suffix;
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function renderRecent(records) {
    const list = $('#recent-list');
    if (!records.length) {
      list.innerHTML = `
        <li class="empty-state">
          <span class="empty-icon">${ICONS.info}</span>
          <strong>No attendance yet today</strong>
          <p>Recognized faces will appear here as they are marked present.</p>
        </li>`;
      return;
    }
    list.innerHTML = records.map((r) => {
      const name = r.name || 'Unknown student';
      const time = (r.timestamp || '').split(' ')[1] || '';
      const initial = escapeHtml(name.trim().charAt(0).toUpperCase() || '?');
      return `
        <li>
          <span class="avatar">${initial}</span>
          <span class="who">
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(r.student_id)}</small>
          </span>
          <span class="when">${escapeHtml(time)}</span>
          <span class="chip chip-green">Present</span>
        </li>`;
    }).join('');
  }

  api('/api/stats')
    .then((stats) => {
      animateNumber($('#stat-students'), stats.students);
      animateNumber($('#stat-present'), stats.present_today);
      animateNumber($('#stat-rate'), stats.rate, '%');
      renderRecent(stats.recent);
    })
    .catch((err) => {
      toast(err.message, 'error');
      $('#recent-list').innerHTML = '<li class="loading-row">Could not load activity.</li>';
    });
})();
