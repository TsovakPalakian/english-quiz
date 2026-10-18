  function paintUploads() {
    const wasBottom = bottom(),
      items = [
        ...files.map((file) => ({
          id: 'file:' + file.id,
          fileId: file.id,
          name: file.name,
          createdMs: file.createdMs || Date.now(),
          progress: 100,
          state: 'ready',
        })),
        ...[...uploads.values()].filter((item) => item.roomId === room && !item.cancelled),
      ],
      ids = new Set(items.map((item) => item.id));
    for (const node of timeline.querySelectorAll('.chat-upload')) if (!ids.has(node.dataset.uploadId)) node.remove();
    for (const item of items) {
      let node = [...timeline.querySelectorAll('.chat-upload')].find((n) => n.dataset.uploadId === item.id);
      if (!node) {
        node = document.createElement('article');
        node.className = 'chat-upload is-own';
        node.dataset.uploadId = item.id;
        node.innerHTML =
          '<div class="chat-upload-body"><button type="button" class="chat-upload-cancel" data-cancel-upload="' +
          escape(item.id) +
          '" title="Cancel upload" aria-label="Cancel upload">' +
          icon('x') +
          '</button><span class="chat-upload-meter" role="progressbar" aria-label="' +
          escape('Upload ' + item.name) +
          '" aria-valuemin="0" aria-valuemax="100"></span><div class="chat-upload-copy"><strong>' +
          escape(item.name) +
          '</strong><small data-upload-state></small></div></div><div class="chat-message-foot"><time title="' +
          escape(stamp(item.createdMs)) +
          '">' +
          escape(time(item.createdMs)) +
          '</time><span data-upload-clock>' +
          icon('clock') +
          '</span></div>';
        timeline.append(node);
      }
      const cancel = node.querySelector('[data-cancel-upload]');
      cancel.style.setProperty('--upload-progress', item.progress + '%');
      cancel.setAttribute('aria-label', item.state === 'ready' ? 'Remove attachment' : 'Cancel upload');
      cancel.title = cancel.getAttribute('aria-label');
      cancel.disabled = item.state === 'ready' && busy;
      node.querySelector('[data-upload-state]').textContent =
        item.state === 'ready'
          ? pending && !busy
            ? 'Retry sending'
            : 'Uploaded'
          : item.state === 'failed'
            ? item.error
            : item.state === 'queued'
              ? 'Queued'
              : item.progress + '% uploaded' + (item.state === 'processing' ? ' - Processing...' : '');
      node.querySelector('[data-upload-clock]').hidden = item.state === 'ready';
      node.dataset.uploadState = item.state;
      const meter = node.querySelector('.chat-upload-meter');
      meter.hidden = item.state === 'ready';
      meter.setAttribute('aria-valuenow', String(item.progress));
      meter.setAttribute('aria-valuetext', item.progress + '% uploaded');
    }
    if (items.length) timeline.querySelectorAll('.chat-empty').forEach((n) => n.remove());
    if (wasBottom) timeline.scrollTop = timeline.scrollHeight;
    icons();
  }
  function updateUpload(item) {
    const node = [...timeline.querySelectorAll('.chat-upload')].find((n) => n.dataset.uploadId === item.id);
    if (!node) return;
    node.querySelector('[data-cancel-upload]').style.setProperty('--upload-progress', item.progress + '%');
    const meter = node.querySelector('.chat-upload-meter');
    meter.setAttribute('aria-valuenow', String(item.progress));
    meter.setAttribute('aria-valuetext', item.progress + '% uploaded');
    node.querySelector('[data-upload-state]').textContent =
      item.progress + '% uploaded' + (item.state === 'processing' ? ' - Processing...' : '');
    node.dataset.uploadState = item.state;
  }
  function cancelUploads(id) {
    for (const item of uploads.values())
      if (!id || item.id === id) {
        item.cancelled = true;
        item.xhr?.abort();
        uploads.delete(item.id);
      }
    section.classList.remove('is-file-drop');
    dragDepth = 0;
    paintUploads();
  }
  function queueUpload(file) {
    const item = {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      roomId: room,
      gen: generation,
      progress: 0,
      state: 'queued',
      createdMs: Date.now(),
      cancelled: false,
    };
    uploads.set(item.id, item);
    paintUploads();
    const job = uploadQueue.then(async () => {
      if (item.cancelled || item.gen !== generation || item.roomId !== room) return;
      item.state = 'uploading';
      updateUpload(item);
      try {
        const result = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          item.xhr = xhr;
          xhr.open('POST', '/api/messages/upload?' + new URLSearchParams({ roomId: item.roomId, name: file.name }));
          xhr.withCredentials = true;
          xhr.responseType = 'json';
          xhr.timeout = 180000;
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          xhr.upload.onprogress = (event) => {
            if (item.cancelled || item.gen !== generation || item.roomId !== room) return;
            item.progress = Math.min(
              100,
              Math.floor((event.loaded / (event.lengthComputable ? event.total : file.size || 1)) * 100),
            );
            updateUpload(item);
          };
          xhr.upload.onload = () => {
            if (item.cancelled) return;
            item.progress = 100;
            item.state = 'processing';
            updateUpload(item);
          };
          xhr.onload = () => {
            const value = xhr.response;
            if (xhr.status < 200 || xhr.status >= 300 || !value?.file)
              reject(new Error(value?.error || 'Upload failed.'));
            else resolve(value.file);
          };
          xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
          xhr.ontimeout = () => reject(new Error('Upload timed out. Try again.'));
          xhr.onabort = () => reject(new DOMException('Upload cancelled.', 'AbortError'));
          xhr.send(file);
        });
        if (item.cancelled || item.gen !== generation || item.roomId !== room) return;
        if (file.chatPoster) saveVideoPoster(result.id, file.chatPoster);
        files.push({ ...result, createdMs: item.createdMs });
        uploads.delete(item.id);
        remember();
        paintDraft();
        return result;
      } catch (error) {
        if (item.cancelled || item.gen !== generation || item.roomId !== room) return;
        item.state = 'failed';
        item.error = error.message;
        paintUploads();
        status(error.message);
      } finally {
        item.xhr = null;
      }
    });
    uploadQueue = job.catch(() => {});
    return job;
  }
  async function addFiles(incoming) {
    status('');
    try {
      if (!room || el('msgCompose').hidden || !ready)
        throw new Error('Open an available conversation before attaching files.');
      if (busy) throw new Error('Wait for the current message to be sent.');
      const targetRoom = room,
        gen = generation,
        selected = Array.from(incoming),
        waiting = [...uploads.values()].filter((item) => item.roomId === room && !item.cancelled).length;
      if (files.length + waiting + selected.length > 5) throw new Error('Attach up to five files.');
      if (selected.some((file) => file.size > 25 * 1024 * 1024)) throw new Error('Maximum attachment size is 25 MB.');
      const results = await Promise.all(selected.map(queueUpload));
      const uploaded = selected.length > 0 && results.every(Boolean);
      if (
        uploaded &&
        room === targetRoom &&
        generation === gen &&
        ![...uploads.values()].some((item) => item.roomId === room && !item.cancelled)
      )
        await send();
      return uploaded;
    } catch (error) {
      status(error.message);
    }
  }
  async function upload(file) {
    return addFiles([file]);
  }
  async function archiveFolder(entries, name) {
    status('Archiving folder...');
    let total = 0;
    const data = [];
    if (entries.length > 2000) throw Error('A folder can contain up to 2000 entries.');
    for (const entry of entries) {
      total += entry.file?.size || 0;
      if (total > 100 * 1024 * 1024) throw Error('Maximum folder size before compression is 100 MB.');
      data.push({
        path: entry.path,
        bytes: entry.file ? new Uint8Array(await entry.file.arrayBuffer()) : new Uint8Array(),
      });
    }
    const bytes = await new Promise((resolve, reject) => {
      const worker = new Worker('/chat-archive-worker.js');
      const timer = setTimeout(() => {
        worker.terminate();
        reject(Error('Folder compression timed out.'));
      }, 120000);
      const done = () => {
        clearTimeout(timer);
        worker.terminate();
      };
      worker.onmessage = (event) => {
        done();
        if (event.data.error) reject(Error(event.data.error));
        else resolve(event.data.archive);
      };
      worker.onerror = () => {
        done();
        reject(Error('Folder compression failed.'));
      };
      worker.postMessage(
        data,
        data.map((item) => item.bytes.buffer),
      );
    });
    return new File([bytes], name + '.zip', { type: 'application/zip' });
  }
  async function readFolder(entry, path, files) {
    if (files.length >= 2000) throw Error('A folder can contain up to 2000 entries.');
    if (entry.isFile) {
      files.push({ path, file: await new Promise((resolve, reject) => entry.file(resolve, reject)) });
      return;
    }
    files.push({ path: path + '/', file: null });
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await readFolder(child, path + '/' + child.name, files);
    }
  }
  async function dropFiles(items, fallback) {
    const targetRoom = room,
      gen = generation;
    try {
      const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
      if (!entries.length) {
        await addFiles(fallback);
        return;
      }
      if (entries.length > 5) throw Error('Attach up to five files.');
      const incoming = [];
      for (const entry of entries) {
        if (entry.isDirectory) {
          const files = [];
          await readFolder(entry, entry.name, files);
          incoming.push(await archiveFolder(files, entry.name));
        } else incoming.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
      }
      if (room === targetRoom && generation === gen) await addFiles(incoming);
    } catch (error) {
      status(error.message);
    }
  }
  const folderInput = document.createElement('input');
  folderInput.type = 'file';
  folderInput.multiple = true;
  folderInput.setAttribute('webkitdirectory', '');
  folderInput.hidden = true;
  el('msgCompose').append(folderInput);
  folderInput.onchange = async () => {
    const targetRoom = room,
      gen = generation;
    try {
      const selected = Array.from(folderInput.files);
      if (!selected.length) return;
      const root = selected[0].webkitRelativePath.split('/')[0] || 'Folder';
      const archive = await archiveFolder(
        selected.map((file) => ({ path: file.webkitRelativePath || root + '/' + file.name, file })),
        root,
      );
      if (room === targetRoom && generation === gen) await addFiles([archive]);
    } catch (error) {
      status(error.message);
    } finally {
      folderInput.value = '';
    }
  };
  const attachMenu = document.createElement('div');
  attachMenu.className = 'chat-attachment-menu';
  attachMenu.hidden = true;
  attachMenu.innerHTML =
    '<button type="button" data-attach-files>' +
    icon('file') +
    'Files</button><button type="button" data-attach-folder>' +
    icon('folder') +
    'Folder</button>';
  el('msgCompose').append(attachMenu);
  attachMenu.querySelector('[data-attach-files]').onclick = () => {
    attachMenu.hidden = true;
    el('msgFile').click();
  };
  attachMenu.querySelector('[data-attach-folder]').onclick = () => {
    attachMenu.hidden = true;
    folderInput.click();
  };
  el('msgAttach').onclick = () => {
    attachMenu.hidden = !attachMenu.hidden;
    icons();
  };
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#msgAttach,.chat-attachment-menu')) attachMenu.hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') attachMenu.hidden = true;
  });
  el('msgFile').onchange = async () => {
    await addFiles(el('msgFile').files);
    el('msgFile').value = '';
  };
  section.addEventListener('dragenter', (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    dragDepth++;
    section.classList.add('is-file-drop');
  });
  section.addEventListener('dragover', (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    section.classList.add('is-file-drop');
  });
  section.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      section.classList.remove('is-file-drop');
    }
  });
  section.addEventListener('drop', (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    dragDepth = 0;
    section.classList.remove('is-file-drop');
    dropFiles(Array.from(event.dataTransfer.items), Array.from(event.dataTransfer.files));
  });
  composer.parentElement.addEventListener(
    'paste',
    (event) => {
      if (event.clipboardData.files.length) {
        event.preventDefault();
        addFiles(event.clipboardData.files);
      }
    },
    true,
  );
  const recordButton = el('msgMic');
  const recordPreview = document.createElement('video');
  recordPreview.className = 'chat-record-preview';
  recordPreview.muted = true;
  recordPreview.autoplay = true;
  recordPreview.playsInline = true;
  recordPreview.hidden = true;
  const recordFrame = document.createElement('div');
  recordFrame.className = 'chat-record-frame';
  recordFrame.hidden = true;
  recordFrame.setAttribute('role', 'progressbar');
  recordFrame.setAttribute('aria-label', 'Video recording time');
  recordFrame.setAttribute('aria-valuemin', '0');
  recordFrame.setAttribute('aria-valuemax', '60');
  recordFrame.append(recordPreview);
  chatCenter.append(recordFrame);
  recordPreview.addEventListener('loadeddata', () => {
    if (recordGesture && !recordGesture.poster) recordGesture.poster = videoFirstFrame(recordPreview);
  });
