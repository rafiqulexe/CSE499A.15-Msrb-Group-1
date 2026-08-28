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
    captureTitle: $('#capture-title'),
    btnRestart: $('#btn-restart-wizard'),
    segments: $('#segments'),
    sampleCount: $('#sample-count'),
    thumbs: $('#thumbs'),
    thumbsLabel: $('#thumbs-label'),
    btnFinalize: $('#btn-finalize'),
    finalizeHint: $('#finalize-hint'),
    files: $('#reg-files'),
    fileList: $('#reg-file-list'),
    btnProcessUpload: $('#btn-process-upload'),
    successText: $('#success-text'),
    btnAgain: $('#btn-again'),
  };

  // Build the progress segments once.
  els.segments.innerHTML = Array.from({ length: NUM }, () => '<span class="segment"></span>').join('');

  // ------------------------------------------------------------- helpers
  function setStep(step) {
    state.step = step;
    els.steps.forEach((item) => {
      const value = parseInt(item.dataset.stepItem, 10);
      item.classList.toggle('active', value === step);
      item.classList.toggle('done', value < step);
      if (value < step) {
        item.querySelector('.step-num').innerHTML =
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      } else {
        item.querySelector('.step-num').textContent = value;
      }
    });
  }

  function renderSamples() {
    const count = state.samples.length;
    $$('.segment', els.segments).forEach((seg, i) => seg.classList.toggle('done', i < count));
    els.sampleCount.textContent = count;
    els.thumbs.innerHTML = state.samples.map((sample, i) => `
      <div class="thumb" title="Remove sample">
        <img src="${sample.thumb}" alt="Sample ${i + 1}">
        <button class="thumb-x" type="button" data-remove="${i}" aria-label="Remove sample ${i + 1}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');
    els.thumbsLabel.textContent = count ? `Collected samples (${count})` : 'Collected samples';
    els.btnFinalize.disabled = count < NUM;
    els.finalizeHint.textContent = count >= NUM
      ? 'All samples collected — ready to save.'
      : `${NUM - count} more sample${NUM - count === 1 ? '' : 's'} needed to finalize.`;
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
  }

  // ------------------------------------------------------------- step 1
  function validateDetails() {
    const ok = els.studentId.value.trim() && els.name.value.trim();
    els.btnStart.disabled = !ok;
  }

  els.studentId.addEventListener('input', validateDetails);
  els.name.addEventListener('input', validateDetails);

  els.btnStart.addEventListener('click', () => {
    state.studentId = els.studentId.value.trim();
    state.name = els.name.value.trim();
    els.captureTitle.innerHTML =
      `Uploading samples — <span class="mono">${escapeHtml(state.name)}</span> (${escapeHtml(state.studentId)})`;
    els.detailsCard.classList.add('hidden');
    els.captureCard.classList.remove('hidden');
    setStep(2);
    renderSamples();
  });

  // ------------------------------------------------------------- step 2 · upload
  function renderFileList() {
    const files = [...els.files.files];
    els.btnProcessUpload.disabled = files.length === 0;
    els.fileList.innerHTML = files.map((f) => {
      const size = f.size > 1024 * 1024 ? `${(f.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`;
      return `<li><span class="name">${escapeHtml(f.name)}</span><span class="size">${size}</span></li>`;
    }).join('');
  }

  els.files.addEventListener('change', renderFileList);

  els.btnProcessUpload.addEventListener('click', async () => {
    const files = [...els.files.files];
    if (!files.length) return;
    setLoading(els.btnProcessUpload, true, 'Processing…');
    try {
      const images = [];
      for (const file of files) {
        const raw = await readFileAsDataUrl(file);
        images.push(await shrinkImage(raw));
      }
      const res = await api('/api/register/batch', {
        method: 'POST',
        body: JSON.stringify({ images, names: files.map((f) => f.name) }),
      });
      for (const embedding of res.embeddings) {
        // thumbnails align with the order of successfully processed images
        state.samples.push({ embedding, thumb: '' });
      }
      // attach thumbnails for the first N processed images
      const thumbs = await Promise.all(images.map((img) => shrinkImage(img, 140, 0.8).catch(() => '')));
      let cursor = state.samples.length - res.embeddings.length;
      for (const thumb of thumbs) {
        if (cursor >= state.samples.length) break;
        if (!state.samples[cursor].thumb) state.samples[cursor].thumb = thumb;
        cursor++;
      }
      renderSamples();
      if (res.embeddings.length) {
        toast(`Processed ${res.embeddings.length} of ${images.length} image(s)`, 'success');
      } else {
        toast('No usable faces found in the uploaded images.', 'error');
      }
      res.errors.slice(0, 3).forEach((e) => toast(e, 'warn'));
      if (res.errors.length > 3) toast(`${res.errors.length - 3} more files were skipped.`, 'info');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(els.btnProcessUpload, false);
    }
  });

  // ------------------------------------------------------------- thumbnails
  els.thumbs.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove]');
    if (!btn) return;
    state.samples.splice(parseInt(btn.dataset.remove, 10), 1);
    renderSamples();
  });

  // ------------------------------------------------------------- finalize
  els.btnFinalize.addEventListener('click', async () => {
    setLoading(els.btnFinalize, true, 'Saving…');
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
        `${state.name} (${state.studentId}) was enrolled with ${state.samples.length} face samples.`;
      els.captureCard.classList.add('hidden');
      els.successCard.classList.remove('hidden');
      setStep(3);
      toast(`${state.name} registered successfully`, 'success');
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
