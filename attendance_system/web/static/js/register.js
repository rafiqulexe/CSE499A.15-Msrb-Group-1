'use strict';

(function initRegister() {
  const root = $('#register-root');
  const NUM = parseInt(root.dataset.numSamples || '10', 10);

  const state = {
    step: 1,
    studentId: '',
    name: '',
    samples: [], // { embedding: [...], thumb: dataUrl }
  };

  const els = {
    steps: $$('[data-step-item]'),
    detailsCard: $('#details-card'),
    captureCard: $('#capture-card'),
    successCard: $('#success-card'),
    studentId: $('#student-id'),
    name: $('#student-name'),
    btnStart: $('#btn-start'),
    detailsHint: $('#details-hint'),
    captureTitle: $('#capture-title'),
    btnRestart: $('#btn-restart-wizard'),
    segments: $('#segments'),
    sampleCount: $('#sample-count'),
    thumbs: $('#thumbs'),
    thumbsLabel: $('#thumbs-label'),
    btnFinalize: $('#btn-finalize'),
    finalizeHint: $('#finalize-hint'),
    files: $('#reg-files'),
    dropzone: $('#reg-dropzone'),
    fileList: $('#reg-file-list'),
    btnProcessUpload: $('#btn-process-upload'),
    successText: $('#success-text'),
    btnAgain: $('#btn-again'),
  };

  const TICK =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"' +
    ' stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="20 6 9 17 4 12"/></svg>';

  els.segments.innerHTML =
    Array.from({ length: NUM }, () => '<span class="segment"></span>').join('');

  /* ---- wizard ---------------------------------------------------------- */
  function setStep(step) {
    state.step = step;
    els.steps.forEach((item) => {
      const value = parseInt(item.dataset.stepItem, 10);
      item.classList.toggle('active', value === step);
      item.classList.toggle('done', value < step);
      const num = item.querySelector('.step-num');
      if (value < step) num.innerHTML = TICK;
      else num.textContent = value;
    });
  }

  /* ---- samples --------------------------------------------------------- */
  function renderSamples() {
    const count = state.samples.length;

    $$('.segment', els.segments).forEach((seg, i) => seg.classList.toggle('done', i < count));
    els.sampleCount.textContent = count;

    els.thumbs.innerHTML = state.samples.map((sample, i) => `
      <div class="thumb">
        ${sample.thumb ? `<img src="${sample.thumb}" alt="Face sample ${i + 1}">` : ''}
        <button class="thumb-x" type="button" data-remove="${i}" aria-label="Remove sample ${i + 1}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`).join('');

    els.thumbsLabel.textContent = count
      ? `Accepted samples (${count})`
      : 'Accepted samples — none yet';

    els.btnFinalize.disabled = count < NUM;
    const missing = NUM - count;
    els.finalizeHint.textContent = missing <= 0
      ? 'All samples collected — ready to save.'
      : `${missing} more sample${missing === 1 ? '' : 's'} needed.`;
  }

  function resetWizard(toStep = 1) {
    state.samples = [];
    state.studentId = '';
    state.name = '';
    els.studentId.value = '';
    els.name.value = '';
    els.btnStart.disabled = true;
    els.files.value = '';
    els.fileList.innerHTML = '';
    els.btnProcessUpload.disabled = true;
    renderSamples();
    setStep(toStep);
    els.detailsCard.classList.remove('hidden');
    els.captureCard.classList.add('hidden');
    els.successCard.classList.add('hidden');
    els.studentId.focus();
  }

  /* ---- step 1 ---------------------------------------------------------- */
  function validateDetails() {
    const ok = els.studentId.value.trim() && els.name.value.trim();
    els.btnStart.disabled = !ok;
    els.detailsHint.textContent = ok ? 'Ready to continue.' : 'Both fields are required.';
  }

  els.studentId.addEventListener('input', validateDetails);
  els.name.addEventListener('input', validateDetails);

  els.btnStart.addEventListener('click', () => {
    state.studentId = els.studentId.value.trim();
    state.name = els.name.value.trim();
    els.captureTitle.innerHTML =
      `Face samples — ${escapeHtml(state.name)} <span class="mono text-3">${escapeHtml(state.studentId)}</span>`;
    els.detailsCard.classList.add('hidden');
    els.captureCard.classList.remove('hidden');
    setStep(2);
    renderSamples();
    els.captureCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---- step 2 · file selection ---------------------------------------- */
  function renderFileList() {
    const files = [...els.files.files];
    els.btnProcessUpload.disabled = files.length === 0;
    els.fileList.innerHTML = files.map((f) => `
      <li>
        <span class="name">${escapeHtml(f.name)}</span>
        <span class="size">${formatSize(f.size)}</span>
      </li>`).join('');
  }

  els.files.addEventListener('change', renderFileList);

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
    els.files.files = dropped;
    renderFileList();
  });

  /* ---- step 2 · extraction --------------------------------------------
     The API returns only the embeddings it could extract, plus an error per
     rejected file prefixed with that file's name. Matching thumbnails back
     by filename keeps each preview aligned with its own embedding. */
  els.btnProcessUpload.addEventListener('click', async () => {
    const files = [...els.files.files];
    if (!files.length) return;

    setLoading(els.btnProcessUpload, true, 'Extracting faces');
    try {
      const names = files.map((f) => f.name);
      const images = [];
      for (const file of files) {
        images.push(await shrinkImage(await readFileAsDataUrl(file)));
      }

      const res = await api('/api/register/batch', {
        method: 'POST',
        body: JSON.stringify({ images, names }),
      });

      const failed = new Set();
      (res.errors || []).forEach((message) => {
        const hit = names.find((name) => message.startsWith(`${name}:`));
        if (hit) failed.add(hit);
      });

      const acceptedIdx = names
        .map((name, i) => (failed.has(name) ? -1 : i))
        .filter((i) => i !== -1);

      const thumbs = await Promise.all(
        acceptedIdx.map((i) => shrinkImage(images[i], 160, 0.8).catch(() => '')),
      );

      (res.embeddings || []).forEach((embedding, i) => {
        state.samples.push({ embedding, thumb: thumbs[i] || '' });
      });

      renderSamples();
      els.files.value = '';
      renderFileList();

      const accepted = (res.embeddings || []).length;
      if (accepted) {
        toast(`Accepted ${accepted} of ${images.length} photo${images.length === 1 ? '' : 's'}`, 'success');
      } else {
        toast('No usable face was found in those photos.', 'error');
      }
      (res.errors || []).slice(0, 3).forEach((e) => toast(e, 'warn'));
      if ((res.errors || []).length > 3) {
        toast(`${res.errors.length - 3} more photos were skipped.`, 'info');
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(els.btnProcessUpload, false);
    }
  });

  /* ---- thumbnails ------------------------------------------------------ */
  els.thumbs.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove]');
    if (!btn) return;
    state.samples.splice(parseInt(btn.dataset.remove, 10), 1);
    renderSamples();
  });

  /* ---- finalise -------------------------------------------------------- */
  els.btnFinalize.addEventListener('click', async () => {
    setLoading(els.btnFinalize, true, 'Saving profile');
    try {
      await api('/api/register/finalize', {
        method: 'POST',
        body: JSON.stringify({
          student_id: state.studentId,
          name: state.name,
          embeddings: state.samples.map((s) => s.embedding),
        }),
      });
      els.successText.textContent =
        `${state.name} (${state.studentId}) was enrolled from ${state.samples.length} face samples.`;
      els.captureCard.classList.add('hidden');
      els.successCard.classList.remove('hidden');
      setStep(3);
      toast(`${state.name} enrolled`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(els.btnFinalize, false);
    }
  });

  els.btnRestart.addEventListener('click', () => {
    if (state.samples.length && !confirm('Discard the collected samples and start over?')) return;
    resetWizard();
  });

  els.btnAgain.addEventListener('click', () => resetWizard());

  renderSamples();
})();
