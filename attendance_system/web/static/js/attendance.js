'use strict';

(function initAttendance() {
  const els = {
    file: $('#att-file'),
    dropzone: $('#att-dropzone'),
    dropTitle: $('#att-drop-title'),
    dropHint: $('#att-drop-hint'),
    fileList: $('#att-file-list'),
    btnAttendUpload: $('#btn-attend-upload'),
    btnNewScan: $('#btn-new-scan'),
    resultEmpty: $('#result-empty'),
    resultContent: $('#result-content'),
    resultScanning: $('#result-scanning'),
    resultImg: $('#result-img'),
    resFaces: $('#res-faces'),
    resRecognized: $('#res-recognized'),
    resUnknown: $('#res-unknown'),
    recognizedList: $('#recognized-list'),
    unknownNote: $('#unknown-note'),
    logBody: $('#log-body'),
    logCount: $('#log-count'),
  };

  // ------------------------------------------------------------- processing
  async function processImage(image, button) {
    els.resultEmpty.classList.add('hidden');
    els.resultContent.classList.add('hidden');
    els.resultScanning.classList.remove('hidden');
    setLoading(button, true, 'Processing…');
    try {
      const res = await api('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({ image }),
      });
      els.resFaces.textContent = res.faces_detected;
      els.resRecognized.textContent = res.recognized.length;
      els.resUnknown.textContent = res.unknown_count;
      els.resultImg.src = res.image;
      els.recognizedList.innerHTML = res.recognized.length
        ? `<ul class="recognized-list">${res.recognized.map((r) => `
            <li>
              <span class="check">${ICONS.check}</span>
              <strong>${escapeHtml(r.name)}</strong>
              <small class="mono">${escapeHtml(r.student_id)}</small>
              <span class="dist">similarity ${escapeHtml(r.distance)}</span>
            </li>`).join('')}</ul>`
        : `<div class="empty-state">
             <span class="empty-icon">${ICONS.warn}</span>
             <strong>No one was recognized</strong>
             <p>Make sure students are registered and faces are clearly visible.</p>
           </div>`;
      els.unknownNote.classList.toggle('hidden', res.unknown_count === 0);
      els.resultScanning.classList.add('hidden');
      els.resultContent.classList.remove('hidden');
      els.btnNewScan.classList.remove('hidden');
      if (res.recognized.length) {
        toast(`Marked ${res.recognized.length} student${res.recognized.length === 1 ? '' : 's'} present`, 'success');
      } else if (res.faces_detected === 0) {
        toast('No faces were detected in the photo.', 'warn');
      }
      loadLog();
    } catch (err) {
      els.resultScanning.classList.add('hidden');
      els.resultEmpty.classList.remove('hidden');
      toast(err.message, 'error');
    } finally {
      setLoading(button, false);
    }
  }

  function formatSize(bytes) {
    return bytes > 1048576
      ? `${(bytes / 1048576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  async function renderSelectedFile() {
    const file = els.file.files[0];
    els.btnAttendUpload.disabled = !file;
    if (!file) {
      els.dropzone.classList.remove('selected');
      els.dropTitle.textContent = 'Choose a classroom photo';
      els.dropHint.textContent = 'JPG or PNG · group photos are supported';
      els.fileList.innerHTML = '';
      els.fileList.classList.add('hidden');
      return;
    }
    let thumb = '';
    try {
      thumb = await shrinkImage(await readFileAsDataUrl(file), 140, 0.8);
    } catch (_) { /* preview is best-effort; processing surfaces real errors */ }
    els.dropzone.classList.add('selected');
    els.dropTitle.textContent = 'Photo selected';
    els.dropHint.textContent = 'Click to choose a different photo';
    els.fileList.innerHTML = `
      <li>
        ${thumb ? `<img class="file-thumb" src="${thumb}" alt="Preview of the selected photo">` : ''}
        <span class="name">${escapeHtml(file.name)}</span>
        <span class="size">${formatSize(file.size)}</span>
      </li>`;
    els.fileList.classList.remove('hidden');
    toast('Photo selected — ready to process', 'success');
  }

  els.file.addEventListener('change', renderSelectedFile);

  els.btnAttendUpload.addEventListener('click', async () => {
    const file = els.file.files[0];
    if (!file) return;
    try {
      const raw = await readFileAsDataUrl(file);
      const image = await shrinkImage(raw);
      processImage(image, els.btnAttendUpload);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  els.btnNewScan.addEventListener('click', () => {
    els.resultContent.classList.add('hidden');
    els.resultEmpty.classList.remove('hidden');
    els.btnNewScan.classList.add('hidden');
    els.file.value = '';
    renderSelectedFile();
  });

  // ------------------------------------------------------------- log table
  async function loadLog() {
    try {
      const res = await api('/api/attendance/records');
      const records = res.records || [];
      els.logCount.textContent = `${records.length} present`;
      els.logBody.innerHTML = records.length
        ? records.map((r) => `
          <tr>
            <td><strong>${escapeHtml(r.name || 'Unknown student')}</strong></td>
            <td class="mono">${escapeHtml(r.student_id)}</td>
            <td class="mono">${escapeHtml((r.timestamp || '').split(' ')[1] || '—')}</td>
            <td><span class="chip chip-green">Present</span></td>
          </tr>`).join('')
        : '<tr><td colspan="4" class="loading-row">No attendance recorded today yet.</td></tr>';
    } catch (err) {
      els.logBody.innerHTML = '<tr><td colspan="4" class="loading-row">Could not load the log.</td></tr>';
      toast(err.message, 'error');
    }
  }

  loadLog();
})();
