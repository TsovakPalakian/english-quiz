  let recordPress = null;
  function paintRecordButtons() {
    const recording = !!recordGesture && (recordGesture.awaitingPermission || recordGesture.recorder);
    const mode = recordGesture?.mode || recordMode;
    const locked = !!(recordGesture?.locked && recording);
    recordButton.innerHTML = icon(locked ? 'send-horizontal' : mode === 'video' ? 'video' : 'mic');
    recordButton.title = locked ? 'Send recording' : mode === 'video'
      ? 'Hold to record video; click to switch to voice'
      : 'Hold to record voice; click to switch to video';
    recordButton.setAttribute('aria-label', recordButton.title);
    videoButton.setAttribute('aria-label', videoButton.title);
    recordButton.hidden = false;
    videoButton.hidden = true;
    recordButton.dataset.recordMode = mode;
    el('msgCancelRecording').hidden = !recording;
    el('msgCancelRecording').title = locked ? 'Delete recording' : 'Cancel recording';
    el('msgCancelRecording').setAttribute('aria-label', el('msgCancelRecording').title);
    const miniMic = el('miniMic');
    if (miniMic) {
      miniMic.innerHTML = mode === 'video'
        ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
      miniMic.title = locked ? 'Send recording' : mode === 'video'
        ? 'Hold to record video; click to switch to voice'
        : 'Hold to record voice; click to switch to video';
      miniMic.setAttribute('aria-label', miniMic.title);
      miniMic.dataset.recordMode = mode;
    }
    icons();
  }
  function finishRecording(cancel = false) {
    const gesture = recordGesture;
    const miniFrame = el('miniRecordFrame');
    const miniStatus = el('miniRecordStatus');
    const miniPreview = el('miniRecordPreview');
    if (miniFrame) miniFrame.hidden = true;
    if (miniStatus) miniStatus.hidden = true;
    if (miniPreview) miniPreview.srcObject = null;
    if (!gesture) return;
    if(gesture.awaitingPermission&&!cancel){gesture.released=true;gesture.locked=false;return;}
    clearTimeout(recordTimer);
    clearInterval(recordProgressTimer);
    gesture.awaitingPermission = false;
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
      paintRecordButtons();
      scheduleInputFit();
    }
  }
  function cancelRecording() {
    if(recordPress)clearTimeout(recordPress.timer);
    recordPress=null;
    const miniFrame = el('miniRecordFrame');
    const miniStatus = el('miniRecordStatus');
    const miniPreview = el('miniRecordPreview');
    if (miniFrame) miniFrame.hidden = true;
    if (miniStatus) miniStatus.hidden = true;
    if (miniPreview) miniPreview.srcObject = null;
    finishRecording(true);
  }
  function interruptRecording() {
    if(recordPress&&!recordPress.started){clearTimeout(recordPress.timer);recordPress=null;}
    if (recordGesture?.awaitingPermission) return;
    if (!recordGesture) return;
    if (recordGesture.locked) return;
    cancelRecording();
  }
  el('msgCancelRecording').onclick = () => {
    if (recordGesture?.locked) cancelRecording();
    else cancelRecording();
  };
  async function startRecording(mode, pointerId, startX = 0, startY = 0) {
    if (recordUploading || busy || !ready || !room || el('msgCompose').hidden) return;
    if (recordGesture) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      status('Recording is unavailable in this browser.');
      return;
    }
    const video = mode === 'video';
    const gesture = {
      mode,
      roomId: room,
      gen: generation,
      cancelled: false,
      awaitingPermission: true,
      recorder: null,
      stream: null,
      poster: '',
      locked: false,
      pointerId,
      startX,
      startY,
      released: false,
    };
    recordGesture = gesture;
    recordMode = mode;
    paintRecordButtons();
    let stream;
    try {
      el('msgSendState').textContent = video
        ? 'Waiting for camera permission...'
        : 'Waiting for microphone permission...';
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        ...(video ? { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } } : {}),
      });
      gesture.awaitingPermission = false;
      if (recordGesture !== gesture || gesture.cancelled || room !== gesture.roomId || generation !== gesture.gen || (!active() && !miniActive())) {
        stream.getTracks().forEach((t) => t.stop());
        if (recordGesture === gesture) finishRecording(true);
        return;
      }
      if(gesture.released&&!gesture.locked){
        stream.getTracks().forEach(track=>track.stop());recordGesture=null;paintRecordButtons();
        el('msgSendState').textContent='';status('Permission granted. Hold again to record.');return;
      }
      gesture.stream = stream;
      const mime = (
        video
          ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
          : ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']
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
          el('msgSendState').textContent = '';
          paintRecordButtons();
          scheduleInputFit();
        }
        const miniFrame = el('miniRecordFrame');
        const miniStatus = el('miniRecordStatus');
        const miniPreview = el('miniRecordPreview');
        if (miniFrame) miniFrame.hidden = true;
        if (miniStatus) miniStatus.hidden = true;
        if (miniPreview) miniPreview.srcObject = null;
        if (gesture.cancelled || room !== gesture.roomId || generation !== gesture.gen || (!active() && !miniActive())) return;
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        if (!blob.size) {
          recordFrame.hidden = true;
          recordPreview.hidden = true;
          status('Recording was empty. Try again.');
          return;
        }
        recordUploading = true;
        el('msgSendState').textContent = 'Sending recording...';
        try {
          const extension = mime.includes('mp4') ? '.mp4' : mime.includes('ogg') ? '.ogg' : '.webm';
          const file = new File([blob], (video ? 'video-' : 'voice-') + Date.now() + extension, { type: blob.type });
          file.chatPoster = gesture.poster;
          const uploaded=await upload(file);
          if(!uploaded)return;
        } catch (error) {
          status(error.message);
        } finally {
          recordUploading = false;
          recordFrame.hidden = true;
          recordPreview.hidden = true;
          if(!pending)el('msgSendState').textContent = '';
        }
      };
      recording.start(250);
      const startedAt = performance.now();
      const tick = () => {
        if (recordGesture !== gesture || gesture.cancelled) return;
        const elapsed = (performance.now() - startedAt) / 1000;
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
        const frac = String(Math.floor((elapsed % 1) * 10));
        if (gesture.locked)
          el('msgSendState').textContent =
            (video ? 'Video locked · ' : 'Audio locked · ') +
            mm +
            ':' +
            ss +
            ',' +
            frac +
            ' · Delete or send';
        else
          el('msgSendState').textContent =
            (video ? 'Recording video · ' : 'Recording · ') +
            mm +
            ':' +
            ss +
            ',' +
            frac +
            ' · Slide up to lock, release to send';
        if (video) {
          recordFrame.style.setProperty('--record-progress', Math.min(60, elapsed) * 6 + 'deg');
          recordFrame.setAttribute('aria-valuenow', String(Math.floor(elapsed)));
        }
        if (miniActive()) {
          const miniStatus = el('miniRecordStatus');
          const miniFrame = el('miniRecordFrame');
          const miniText = el('miniRecordText');
          const miniPreview = el('miniRecordPreview');
          if (miniStatus) miniStatus.hidden = false;
          if (miniText) {
            miniText.textContent =
              (video ? (gesture.locked ? 'Video locked · ' : 'Recording video · ') : (gesture.locked ? 'Audio locked · ' : 'Recording audio · ')) +
              mm +
              ':' +
              ss +
              ',' +
              frac;
          }
          if (video) {
            if (miniFrame) miniFrame.hidden = false;
            if (miniPreview && miniPreview.srcObject !== stream) {
              miniPreview.srcObject = stream;
              miniPreview.play().catch(() => {});
            }
          } else {
            if (miniFrame) miniFrame.hidden = true;
          }
        }
      };
      tick();
      recordProgressTimer = setInterval(tick, 100);
      paintRecordButtons();
      if (video) {
        recordPreview.poster = '';
        recordPreview.srcObject = stream;
        recordPreview.hidden = false;
        recordFrame.hidden = false;
        recordPreview.play().catch(() => {});
        scheduleInputFit();
        if (miniActive()) {
          const miniFrame = el('miniRecordFrame');
          const miniPreview = el('miniRecordPreview');
          if (miniFrame) miniFrame.hidden = false;
          if (miniPreview && miniPreview.srcObject !== stream) {
            miniPreview.srcObject = stream;
            miniPreview.play().catch(() => {});
          }
        }
      }
      if(video)recordTimer = setTimeout(() => finishRecording(), 60000);
      if(gesture.released&&!gesture.locked)finishRecording(false);
    } catch (error) {
      gesture.awaitingPermission = false;
      stream?.getTracks().forEach((t) => t.stop());
      if (recordGesture === gesture) {
        status(error.name==='NotAllowedError'?'Allow microphone'+(video?' and camera':'')+' access in your browser settings.':error.name==='NotFoundError'?'No microphone'+(video?' or camera':'')+' was found.':error.message || 'Camera or microphone unavailable.');
        finishRecording(true);
      }
    }
  }
  function onRecordPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    if (recordGesture?.locked) {
      finishRecording(false);
      return;
    }
    if (recordGesture||recordPress||recordUploading||busy) return;
    try{(event.currentTarget||recordButton).setPointerCapture?.(event.pointerId);}catch{}
    const press={pointerId:event.pointerId,x:event.clientX,y:event.clientY,started:false};
    recordPress=press;
    press.timer=setTimeout(()=>{
      if(recordPress!==press)return;
      if(!ready||!room){recordPress=null;status('Open a connected conversation before recording.');return;}
      press.started=true;
      startRecording(recordMode,press.pointerId,press.x,press.y);
    },200);
  }
  function onRecordPointerMove(event) {
    const press=recordPress;
    if(press&&!press.started&&press.pointerId===event.pointerId&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>56){
      clearTimeout(press.timer);press.started=true;startRecording(recordMode,press.pointerId,press.x,press.y);
    }
    const gesture = recordGesture;
    if (!gesture || gesture.locked) return;
    if (gesture.pointerId != null && event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.hypot(dx,dy)>56) {
      gesture.locked = true;
      paintRecordButtons();
      el('msgSendState').textContent =
        (gesture.mode === 'video' ? 'Video locked' : 'Audio locked') + ' · Delete or send';
    }
  }
  function onRecordPointerUp(event) {
    if(recordPress){
      if(event.pointerId!==recordPress.pointerId)return;
      const press=recordPress;recordPress=null;clearTimeout(press.timer);
      if(!press.started){recordMode=recordMode==='audio'?'video':'audio';paintRecordButtons();return;}
    }
    const gesture = recordGesture;
    if (!gesture) return;
    if (gesture.pointerId != null && event.pointerId !== gesture.pointerId) return;
    if (gesture.awaitingPermission) {gesture.released=true;return;}
    if (gesture.locked) return;
    finishRecording(false);
  }
  recordButton.addEventListener('pointerdown', onRecordPointerDown);
  recordButton.addEventListener('pointermove', onRecordPointerMove);
  recordButton.addEventListener('pointerup', onRecordPointerUp);
  recordButton.addEventListener('pointercancel', () => {
    if (!recordGesture?.locked) cancelRecording();
  });
  const miniMicBtn = el('miniMic');
  if (miniMicBtn) {
    miniMicBtn.addEventListener('pointerdown', onRecordPointerDown);
    miniMicBtn.addEventListener('pointermove', onRecordPointerMove);
    miniMicBtn.addEventListener('pointerup', onRecordPointerUp);
    miniMicBtn.addEventListener('pointercancel', () => {
      if (!recordGesture?.locked) cancelRecording();
    });
  }
  recordButton.addEventListener('contextmenu', (event) => event.preventDefault());
  recordButton.addEventListener('keydown', (event) => {
    if ([' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (!event.repeat) {
        if (recordGesture?.locked) finishRecording(false);
        else if (!recordGesture) startRecording(recordMode);
      }
    } else if (event.key === 'Escape') cancelRecording();
  });
  recordButton.addEventListener('keyup', (event) => {
    if([' ','Enter'].includes(event.key)&&recordGesture&&!recordGesture.locked){
      if(recordGesture.awaitingPermission)recordGesture.released=true;
      else finishRecording(false);
    }
  });
  window.addEventListener('blur', interruptRecording);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && recordGesture) cancelRecording();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') interruptRecording();
  });
  const miniCancelBtn = el('miniCancelRecord');
  if (miniCancelBtn) miniCancelBtn.onclick = () => cancelRecording();
  const miniSendBtn = el('miniSendRecord');
  if (miniSendBtn) miniSendBtn.onclick = () => finishRecording(false);
  paintRecordButtons();
