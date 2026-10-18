  function paintRecordButton() {
    recordButton.innerHTML = icon(recordMode === 'video' ? 'video' : 'mic');
    recordButton.title =
      recordMode === 'video'
        ? 'Hold to record video; click to switch to audio'
        : 'Hold to record audio; click to switch to video';
    recordButton.setAttribute('aria-label', recordButton.title);
    icons();
  }
  function finishRecording(cancel = false) {
    const gesture = recordGesture;
    if (!gesture) return;
    clearTimeout(gesture.hold);
    clearTimeout(recordTimer);
    clearInterval(recordProgressTimer);
    gesture.held = false;
    gesture.cancelled ||= cancel;
    if (gesture.recorder?.state === 'recording') gesture.recorder.stop();
    else {
      gesture.cancelled = true;
      recordGesture = null;
      gesture.stream?.getTracks().forEach((t) => t.stop());
      recordPreview.srcObject = null;
      recordPreview.hidden = true;
      recordFrame.hidden = true;
      el('msgSendState').textContent = '';
      el('msgCancelRecording').hidden = true;
      paintRecordButton();
      scheduleInputFit();
    }
  }
  function cancelRecording() {
    finishRecording(true);
  }
  el('msgCancelRecording').onclick = cancelRecording;
  async function startRecording(gesture) {
    if (recordGesture !== gesture || !gesture.held) return;
    gesture.started = true;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      status('Recording is unavailable in this browser.');
      finishRecording(true);
      return;
    }
    const video = gesture.mode === 'video';
    let stream;
    try {
      el('msgSendState').textContent = video
        ? 'Waiting for camera permission...'
        : 'Waiting for microphone permission...';
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        ...(video ? { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } } : {}),
      });
      if (
        recordGesture !== gesture ||
        !gesture.held ||
        gesture.cancelled ||
        room !== gesture.roomId ||
        generation !== gesture.gen ||
        !active()
      ) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      gesture.stream = stream;
      const mime = (
        video
          ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
          : ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
      ).find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error('Recording format is unsupported in this browser.');
      const chunks = [];
      let size = 0;
      const recording = new MediaRecorder(stream, { mimeType: mime });
      recorder = recording;
      gesture.recorder = recording;
      recording.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          size += event.data.size;
        }
        if (size > 25 * 1024 * 1024) {
          status('Maximum attachment size is 25 MB.');
          finishRecording(true);
        }
      };
      recording.onerror = () => {
        status('Recording failed. Please try again.');
        finishRecording(true);
      };
      recording.onstop = async () => {
        clearTimeout(recordTimer);
        clearInterval(recordProgressTimer);
        stream.getTracks().forEach((t) => t.stop());
        if (recorder === recording) recorder = null;
        if (recordGesture === gesture) {
          recordGesture = null;
          recordPreview.poster = gesture.poster || '';
          recordPreview.srcObject = null;
          recordPreview.load();
          recordFrame.hidden = gesture.cancelled || !video;
          recordPreview.hidden = recordFrame.hidden;
          el('msgCancelRecording').hidden = true;
          el('msgSendState').textContent = '';
          paintRecordButton();
          scheduleInputFit();
        }
        if (gesture.cancelled || room !== gesture.roomId || generation !== gesture.gen || !active()) return;
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        if (!blob.size) {
          recordFrame.hidden = true;
          recordPreview.hidden = true;
          return;
        }
        recordUploading = true;
        try {
          const extension = mime.includes('mp4') ? '.mp4' : mime.includes('ogg') ? '.ogg' : '.webm';
          const file = new File([blob], (video ? 'video-' : 'voice-') + Date.now() + extension, { type: blob.type });
          file.chatPoster = gesture.poster;
          await upload(file);
        } catch (error) {
          status(error.message);
        } finally {
          recordUploading = false;
          recordFrame.hidden = true;
          recordPreview.hidden = true;
        }
      };
      recording.start(250);
      el('msgCancelRecording').hidden = false;
      el('msgSendState').textContent = video ? 'Recording video...' : 'Recording audio...';
      recordButton.innerHTML = icon('square');
      icons();
      if (video) {
        const startedAt = performance.now();
        const progress = () => {
          const elapsed = Math.min(60, (performance.now() - startedAt) / 1000);
          recordFrame.style.setProperty('--record-progress', elapsed * 6 + 'deg');
          recordFrame.setAttribute('aria-valuenow', String(Math.floor(elapsed)));
          el('msgSendState').textContent =
            'Recording video... ' +
            String(Math.floor(elapsed / 60)).padStart(2, '0') +
            ':' +
            String(Math.floor(elapsed % 60)).padStart(2, '0') +
            ' / 01:00';
        };
        progress();
        recordProgressTimer = setInterval(progress, 100);
        recordPreview.poster = '';
        recordPreview.srcObject = stream;
        recordPreview.hidden = false;
        recordFrame.hidden = false;
        recordPreview.play().catch(() => {});
        scheduleInputFit();
      }
      recordTimer = setTimeout(() => finishRecording(), video ? 60000 : 120000);
    } catch (error) {
      stream?.getTracks().forEach((t) => t.stop());
      if (recordGesture === gesture) {
        status(error.message || 'Camera or microphone unavailable.');
        finishRecording(true);
      }
    }
  }
  function beginRecordHold(pointerId) {
    if (recordGesture || recordUploading || busy || !ready || !room || el('msgCompose').hidden) return;
    const gesture = {
      pointerId,
      mode: recordMode,
      roomId: room,
      gen: generation,
      held: true,
      started: false,
      cancelled: false,
    };
    recordGesture = gesture;
    gesture.hold = setTimeout(() => startRecording(gesture), 250);
  }
  function releaseRecordHold() {
    const gesture = recordGesture;
    if (!gesture) return;
    const short = !gesture.started;
    finishRecording();
    if (short) {
      recordMode = recordMode === 'audio' ? 'video' : 'audio';
      paintRecordButton();
    }
  }
  recordButton.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    beginRecordHold(event.pointerId);
    if (recordGesture) recordButton.setPointerCapture(event.pointerId);
  });
  recordButton.addEventListener('pointerup', (event) => {
    if (recordGesture?.pointerId === event.pointerId) releaseRecordHold();
  });
  recordButton.addEventListener('pointercancel', cancelRecording);
  recordButton.addEventListener('lostpointercapture', () => {
    if (recordGesture?.held) cancelRecording();
  });
  recordButton.addEventListener('contextmenu', (event) => event.preventDefault());
  recordButton.addEventListener('keydown', (event) => {
    if ([' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (!event.repeat) beginRecordHold('keyboard');
    } else if (event.key === 'Escape') cancelRecording();
  });
  recordButton.addEventListener('keyup', (event) => {
    if ([' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (recordGesture?.pointerId === 'keyboard') releaseRecordHold();
    }
  });
  recordButton.onclick = (event) => {
    if (event.detail === 0 && !recordGesture) {
      recordMode = recordMode === 'audio' ? 'video' : 'audio';
      paintRecordButton();
    }
  };
  window.addEventListener('blur', cancelRecording);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && recordGesture) cancelRecording();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cancelRecording();
  });
  paintRecordButton();
