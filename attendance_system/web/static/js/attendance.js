'use strict';

(function initAttendance() {
  const els = {
    file: $('#att-file'),
    dropzone: $('#att-dropzone'),
    dropTitle: $('#att-drop-title'),
    dropHint: $('#att-drop-hint'),
    scanBar: $('#att-scan-bar'),
    fileList: $('#att-file-list'),
    btnAttendUpload: $('#btn-attend-upload'),
    btnNewScan: $('#btn-new-scan'),
    resultEmpty: $('#result-empty'),
    resultContent: $('#result-content'),
    resultScanning: $('#result-scanning'),
    scanStages: $('#scan-stages'),
    resultImg: $('#result-img'),
    resFaces: $('#res-faces'),
    resRecognized: $('#res-recognized'),
    resUnknown: $('#res-unknown'),
    recognizedList: $('#recognized-list'),
    unknownNote: $('#unknown-note'),
    logBody: $('#log-body'),
    logCount: $('#log-count'),
  };

  /* ---- staged progress -------------------------------------------------
     The API is a single call, so stages are advanced on our side: upload
     completes when the request goes out, detection is assumed once the
     server has the bytes, and matching runs until the response lands. */
  let stageTimer = null;

  function setStage(n) {
    $$('.scan-stage', els.scanStages).forEach((li) => {
      const value = parseInt(li.dataset.stage, 10);
      li.classList.toggle('is-done', value < n);
      li.classList.toggle('is-active', value === n);
    });
  }

  function startStages() {
    setStage(1);
    clearTimeout(stageTimer);
    stageTimer = setTimeout(() => {
      setStage(2);
      stageTimer = setTimeout(() => setStage(3), 900);
    }, 500);
  }

  function stopStages() {
    clearTimeout(stageTimer);
    setStage(4);
  }

  /* ---- processing ------------------------------------------------------ */
  async function processImage(image, button) {
    els.resultEmpty.classList.add('hidden');
    els.resultContent.classList.add('hidden');
    els.resultScanning.classList.remove('hidden');
    startStages();
    setLoading(button, true, 'Running recognition');

    try {
      const res = await api('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({ image }),
      });
      stopStages();

      els.resFaces.textContent = res.faces_detected;
      els.resRecognized.textContent = res.recognized.length;
      els.resUnknown.textContent = res.unknown_count;
      els.resultImg.src = res.image;

      els.recognizedList.innerHTML = res.recognized.length
        ? `<ul class="roster">${res.recognized.map((r) => `
            <li>
              <span class="check">${ICONS.check}</span>
              <span>
                <strong>${escapeHtml(r.name)}</strong>
                <span class="sid">${escapeHtml(r.student_id)}</span>
              </span>
              <span class="dist">d ${escapeHtml(r.distance)}</span>
            </li>`).join('')}</ul>`
        : emptyState(
            'No enrolled student matched',
            'Faces were found but none matched an enrolled profile. Check that the students are registered and clearly visible.',
            'warn',
          );

      els.unknownNote.classList.toggle('hidden', res.unknown_count === 0);
      els.resultScanning.classList.add('hidden');
      els.resultContent.classList.remove('hidden');
      els.btnNewScan.classList.remove('hidden');

      if (res.recognized.length) {
        toast(`Marked ${res.recognized.length} student${res.recognized.length === 1 ? '' : 's'} present`, 'success');
      } else if (res.faces_detected === 0) {
        toast('No faces were detected in this photo.', 'warn');
      }
      loadLog();
    } catch (err) {
      stopStages();
      els.resultScanning.classList.add('hidden');
      els.resultEmpty.classList.remove('hidden');
      toast(err.message, 'error');
    } finally {
      setLoading(button, false);
    }
  }

  /* ---- file selection -------------------------------------------------- */
  async function renderSelectedFile() {
    const file = els.file.files[0];
    els.btnAttendUpload.disabled = !file;

    if (!file) {
      els.dropzone.classList.remove('selected');
      els.dropzone.classList.remove('hidden');
      els.scanBar.classList.add('hidden');
      els.dropTitle.textContent = 'Choose a classroom photo';
      els.dropHint.innerHTML = 'JPG or PNG &nbsp;/&nbsp; drag and drop is supported';
      els.fileList.innerHTML = '';
      return;
    }

    let thumb = '';
    try {
      thumb = await shrinkImage(await readFileAsDataUrl(file), 140, 0.8);
    } catch (_) { /* preview is best-effort; processing surfaces real errors */ }

    /* Once a photo is chosen the dropzone steps aside for the result. */
    els.dropzone.classList.add('hidden');
    els.scanBar.classList.remove('hidden');
    els.fileList.innerHTML = `
      <li>
        ${thumb ? `<img class="file-thumb" src="${thumb}" alt="">` : ''}
        <span class="name">${escapeHtml(file.name)}</span>
        <span class="size">${formatSize(file.size)}</span>
        <button class="btn btn-quiet btn-sm" type="button" id="btn-clear-file">Change</button>
      </li>`;

    const clear = $('#btn-clear-file');
    if (clear) {
      clear.addEventListener('click', () => {
        els.file.value = '';
        renderSelectedFile();
      });
    }
  }

  els.file.addEventListener('change', renderSelectedFile);

  /* ---- drag and drop --------------------------------------------------- */
  ['dragenter', 'dragover'].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove('dragging');
    });
  });
  els.dropzone.addEventListener('drop', (event) => {
    const dropped = event.dataTransfer && event.dataTransfer.files;
    if (!dropped || !dropped.length) return;
    if (!/^image\/(jpeg|png)$/.test(dropped[0].type)) {
      toast('Only JPG and PNG photos are supported.', 'warn');
      return;
    }
    els.file.files = dropped;
    renderSelectedFile();
  });

  /* ---- run ------------------------------------------------------------- */
  els.btnAttendUpload.addEventListener('click', async () => {
    const file = els.file.files[0];
    if (!file) return;
    try {
      const image = await shrinkImage(await readFileAsDataUrl(file));
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
    els.dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ---- log ------------------------------------------------------------- */
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
            <td><span class="chip chip-present">Present</span></td>
          </tr>`).join('')
        : `<tr><td colspan="4">${emptyState(
             'Register is empty',
             'Nobody has been marked present today yet.',
             'camera',
           )}</td></tr>`;
    } catch (err) {
      els.logBody.innerHTML = '<tr><td colspan="4"></td></tr>';
      els.logBody.querySelector('td').appendChild(
        retryState('Could not load the register.', loadLog),
      );
      toast(err.message, 'error');
    }
  }

  loadLog();
})();
