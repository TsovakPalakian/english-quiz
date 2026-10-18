  function receive(event) {
    if (event.profile) {
      const changed = (profileViews[event.profile.id]?.username || '') !== (event.profile.username || '');
      profileViews[event.profile.id] = event.profile;
      if (changed) paintRooms();
      scheduleProfiles();
      return;
    }
    if (event.catalogVersion && event.catalogVersion > catalogVersion) {
      catalogVersion = event.catalogVersion;
      scheduleExamRefresh();
    } else if (event.type === 'message' && event.message?.category === 'learning' && event.message.examId)
      scheduleExamRefresh();
    if (event.removeRoom) {
      data.rooms = data.rooms.filter((r) => r.id !== event.removeRoom);
      for (const cache of historyCache.keys()) if (cache.startsWith(event.removeRoom + ':')) historyCache.delete(cache);
      if (room === event.removeRoom) {
        cancelUploads();
        room = '';
        timeline.replaceChildren();
        el('msgCompose').hidden = true;
      }
    }
    upsertRoom(event.room);
    if (event.cleared && event.room) {
      const key = event.room.id + ':' + event.cleared.category;
      historyCache.delete(key);
      cursors.delete(key);
      if (room === event.room.id && kind === event.cleared.category) {
        reply = null;
        pending = null;
        paintDraft();
        history().catch((error) => status(error.message));
      }
    }
    if (event.message && event.room) {
      const cacheKey = event.room.id + ':' + event.message.category,
        cache = historyCache.get(cacheKey);
      if (event.type === 'message')
        messageSound(event, !cache?.rows.some((message) => message.id === event.message.id));
      if (cache?.loaded) {
        const existing = cache.rows.find((m) => m.id === event.message.id);
        if (existing) Object.assign(existing, event.message);
        else cache.rows.push(event.message);
        cache.rows.sort((a, b) => a.id - b.id);
      }
      if (active() && room === event.room.id && kind === event.message.category) {
        const wasBottom = bottom();
        if (cache?.loaded) mergeNode(event.message);
        else history().catch((error) => status(error.message));
        if (wasBottom || event.message.senderId === account) timeline.scrollTop = timeline.scrollHeight;
        else el('msgLatest').hidden = false;
        scheduleRead();
      }
      if (
        rightMode === 'info' &&
        prefs.right &&
        room === event.room.id &&
        active() &&
        (event.message.deleted || event.message.files)
      )
        showInfo(infoTab).catch(() => {});
      if (ready && event.type === 'message') ack('delivered', event.room.id, event.message.category, event.message.id);
      if (
        event.type === 'message' &&
        prefs.notifications !== false &&
        event.message.senderId !== account &&
        !mutedChat(event.room) &&
        document.visibilityState === 'hidden' &&
        window.Notification?.permission === 'granted'
      )
        new Notification(event.room.title, { body: event.message.text.slice(0, 160), tag: event.room.id });
    }
    if (event.receipt && event.room) {
      const c = event.receipt.category,
        peers = event.receipt.readers.filter((r) => r.id !== account),
        read = peers.length ? Math.min(...peers.map((r) => r.read)) : 0,
        delivered = peers.length ? Math.min(...peers.map((r) => r.delivered)) : 0;
      const cache = historyCache.get(event.room.id + ':' + c);
      if (cache)
        for (const message of cache.rows)
          if (message.senderId === account) {
            message.read = read >= message.id;
            message.delivered = delivered >= message.id;
            if (active() && room === event.room.id && kind === c) mergeNode(message);
          }
    }
    if (event.room && event.type === 'room') {
      membersCache.delete(event.room.id);
      if (rightMode === 'info' && prefs.right && room === event.room.id && active()) showInfo(infoTab).catch(() => {});
    }
    badge();
    paintRooms();
  }
  function attachment(file) {
    const url = String(file.url || '');
    if (!url.startsWith('/api/messages/file?')) return '';
    const label = escape(file.name),
      href = escape(url),
      attr = ' class="chat-file" data-file-id="' + escape(file.id) + '"';
    if (file.mime.startsWith('image/') || /\.(heic|heif|avif|bmp|tiff?)$/i.test(file.name))
      return (
        '<a' +
        attr +
        ' href="' +
        href +
        '" target="_blank" rel="noopener"><img loading="lazy" src="' +
        href +
        '" alt="' +
        label +
        '"></a>'
      );
    if (file.mime.startsWith('audio/'))
      return (
        '<div class="chat-file chat-audio" data-file-id="' +
        escape(file.id) +
        '"><audio preload="metadata" src="' +
        href +
        '" aria-label="' +
        label +
        '"></audio><button type="button" class="chat-audio-play" data-audio-play aria-label="Play audio">' +
        icon('play') +
        '</button><div class="chat-audio-track"><div class="chat-audio-wave" role="slider" tabindex="0" aria-label="Audio position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
        Array.from({ length: 40 }, () => '<span></span>').join('') +
        '</div><small class="chat-audio-duration">0:00</small></div></div>'
      );
    if (file.mime.startsWith('video/') && /^video-\d+\.(webm|mp4)$/i.test(file.name))
      return (
        '<div class="chat-file chat-round-video" data-file-id="' +
        escape(file.id) +
        '"><video autoplay muted loop playsinline preload="metadata" src="' +
        href +
        '" aria-label="' +
        label +
        '"></video><button type="button" class="chat-round-sound" data-round-sound aria-label="Enable sound" title="Enable sound" aria-pressed="false">' +
        icon('volume-x') +
        '</button></div>'
      );
    if (file.mime.startsWith('video/'))
      return (
        '<div' +
        attr +
        '><video controls playsinline preload="none" src="' +
        href +
        '" aria-label="' +
        label +
        '"></video></div>'
      );
    return (
      '<a' +
      attr +
      ' href="' +
      href +
      '">' +
      icon('file') +
      ' ' +
      label +
      ' (' +
      Math.ceil(file.size / 1024) +
      ' KB)</a>'
    );
  }
  function previewText(value, max = 320) {
    return new DOMParser()
      .parseFromString('<body>' + String(value || '').replace(/</g, '&lt;'), 'text/html')
      .body.textContent.replace(/[\x00-\x1f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }
  function decorateLinks(node) {
    const text = node.querySelector('.chat-message-text');
    if (!text) return;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT),
      nodes = [];
    let part,
      offset = 0;
    while ((part = walker.nextNode())) {
      nodes.push({ node: part, start: offset, end: offset + part.length });
      offset += part.length;
    }
    const source = text.textContent,
      matches = [];
    for (const match of source.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>]+/giu)) {
      let label = match[0].replace(/[.,;:!?"']+$/g, '');
      for (const [open, close] of [
        ['(', ')'],
        ['[', ']'],
      ])
        while (label.endsWith(close) && label.split(close).length > label.split(open).length)
          label = label.slice(0, -1);
      let url;
      try {
        url = new URL(label.startsWith('www.') ? 'https://' + label : label);
      } catch {
        continue;
      }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
      matches.push({ start: match.index, end: match.index + label.length, url });
    }
    // DOM ranges preserve text colors even when a URL spans multiple formatting runs.
    for (const match of [...matches].reverse()) {
      const start = nodes.find((n) => n.end > match.start),
        end = nodes.find((n) => n.end >= match.end);
      if (!start || !end) continue;
      const range = document.createRange();
      range.setStart(start.node, match.start - start.start);
      range.setEnd(end.node, match.end - end.start);
      const link = document.createElement('a');
      link.href = match.url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.append(range.extractContents());
      range.insertNode(link);
    }
    const gen = generation;
    for (const url of [...new Map(matches.map((m) => [m.url.href, m.url])).values()].slice(0, 3)) {
      const card = document.createElement('a');
      card.className = 'chat-preview';
      card.href = url.href;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.innerHTML =
        '<span class="chat-preview-copy"><small>' +
        escape(url.hostname) +
        '</small><strong>' +
        escape(url.pathname === '/' ? url.hostname : url.pathname) +
        '</strong></span>';
      text.after(card);
      if (!previewCache.has(url.href))
        previewCache.set(
          url.href,
          domain('/preview', { url: url.href }).catch(() => null),
        );
      previewCache.get(url.href).then((result) => {
        if (!result || !card.isConnected || gen !== generation) return;
        const copy = card.querySelector('.chat-preview-copy');
        copy.querySelector('strong').textContent = previewText(result.title, 200) || url.hostname;
        if (result.description) {
          const description = document.createElement('span');
          description.textContent = previewText(result.description);
          copy.append(description);
        }
        if (/^\/api\/messages\/preview-image\?id=[a-f0-9]{64}$/.test(result.image || '')) {
          const image = document.createElement('img');
          image.alt = '';
          image.loading = 'lazy';
          image.src = result.image;
          image.onerror = () => image.remove();
          card.prepend(image);
        }
      });
    }
  }
  function messageHTML(m) {
    const own = m.senderId === account,
      date = new Date(m.createdMs || m.created * 1000),
      receipt = m.pending ? 'Sending' : m.failed ? 'Retry' : m.read ? 'Read' : m.delivered ? 'Delivered' : 'Sent';
    return (
      (m.forwarded ? '' : '<header><strong>' + escape(m.sender) + '</strong></header>') +
      (m.forwarded
        ? '<button type="button" class="chat-forwarded" data-msg-original="' +
          m.id +
          '" title="Go to original message">' +
          icon('forward') +
          ' Forwarded from ' +
          escape(m.forwarded.sender || 'Unknown author') +
          '</button>' +
          (m.forwarded.text && m.forwarded.text !== m.text
            ? '<blockquote class="chat-study-reference">' + escape(m.forwarded.text) + '</blockquote>'
            : '')
        : '') +
      (m.replyTo && !m.deleted
        ? '<button type="button" class="msg-quote" data-msg-quote="' +
          m.replyTo +
          '"><b>' +
          escape(m.replySender || 'Original message') +
          '</b>' +
          escape((m.replyText || 'Attachment or unavailable message').slice(0, 240)) +
          '</button>'
        : '') +
      '<p class="chat-message-text">' +
      (window.TextColors ? window.TextColors.html(m.text, m.format) : escape(m.text)) +
      '</p>' +
      (m.files || []).map(attachment).join('') +
      (m.examId
        ? '<button type="button" class="chat-link" data-msg-exam="' +
          m.examId +
          '"' +
          (m.assignmentActive === false ? ' disabled' : '') +
          '>' +
          (m.assignmentActive === false ? 'Assignment cancelled' : 'Open exam') +
          '</button>'
        : '') +
      ((m.reactions || []).length
        ? '<div class="chat-reactions">' +
          m.reactions
            .map(
              (r) =>
                '<button type="button" data-reaction="' +
                escape(r.emoji) +
                '" data-reaction-id="' +
                m.id +
                '" aria-pressed="' +
                r.mine +
                '">' +
                escape(r.emoji) +
                ' ' +
                r.count +
                '</button>',
            )
            .join('') +
          '</div>'
        : '') +
      '<div class="chat-message-foot">' +
      (m.editedMs ? '<span>Edited</span>' : '') +
      '<time datetime="' +
      date.toISOString() +
      '" title="' +
      escape(stamp(date.getTime())) +
      '">' +
      escape(time(date.getTime())) +
      '</time>' +
      (own
        ? '<span class="msg-receipt' +
          (m.read ? ' is-read' : '') +
          '" aria-label="' +
          receipt +
          '" title="' +
          (m.read ? 'Read by everyone' : receipt) +
          '">' +
          icon(m.pending ? 'clock' : m.failed ? 'circle-alert' : m.delivered || m.read ? 'check-check' : 'check') +
          '</span>'
        : '') +
      '</div>'
    );
  }
  const roundVideos = new WeakSet();
  const videoPosters = new Map();
  function saveVideoPoster(id, poster) {
    videoPosters.set(id, poster);
    if (videoPosters.size > 32) videoPosters.delete(videoPosters.keys().next().value);
  }
  function videoFirstFrame(video) {
    try {
      if (!video.videoWidth) return '';
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 240;
      const context = canvas.getContext('2d'),
        side = Math.min(video.videoWidth, video.videoHeight);
      context.drawImage(
        video,
        (video.videoWidth - side) / 2,
        (video.videoHeight - side) / 2,
        side,
        side,
        0,
        0,
        240,
        240,
      );
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch {
      return '';
    }
  }
  const roundVideoObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = entry.target;
        if (!video.isConnected) {
          roundVideoObserver.unobserve(video);
          continue;
        }
        if (entry.isIntersecting && active() && document.visibilityState === 'visible') {
          if (!video.ended) video.play().catch(() => {});
        } else video.pause();
      }
    },
    { threshold: 0.2 },
  );
  function watchRoundVideos(root) {
    root.querySelectorAll('.chat-round-video video').forEach((video) => {
      if (roundVideos.has(video)) return;
      roundVideos.add(video);
      video.muted = true;
      video.loop = false;
      video.removeAttribute('loop');
      video.preload = 'auto';
      const id = video.parentElement.dataset.fileId,
        cover = document.createElement('canvas');
      cover.className = 'chat-video-cover';
      cover.width = 240;
      cover.height = 240;
      cover.setAttribute('aria-hidden', 'true');
      video.after(cover);
      const context = cover.getContext('2d');
      if (!context) return;
      const staging = document.createElement('canvas');
      staging.width = 240;
      staging.height = 240;
      const stage = staging.getContext('2d');
      const probe = document.createElement('canvas');
      probe.width = 8;
      probe.height = 8;
      const pixels = probe.getContext('2d', { willReadFrequently: true });
      let painted = false,
        callback = 0,
        firstFrame = false,
        restarting = false,
        knownDuration = 0;
      const duration = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : knownDuration);
      const restart = () => {
        if (video.seeking || restarting || !video.isConnected) return;
        restarting = true;
        video.currentTime = 0;
        video.play().catch(() => {});
      };
      const checkEnd = () => {
        const end = duration();
        if (
          end > 0 &&
          !video.paused &&
          !video.seeking &&
          !restarting &&
          video.currentTime >= end - Math.min(end / 4, 0.08)
        )
          restart();
      };
      const poster = videoPosters.get(id);
      if (poster) {
        video.poster = poster;
        const image = new Image();
        image.onload = () => {
          if (!painted) {
            context.drawImage(image, 0, 0, 240, 240);
            painted = true;
            video.parentElement.classList.add('has-video-frame');
          }
        };
        image.src = poster;
      }
      const draw = () => {
        if (video.readyState < 2 || video.seeking || restarting || !video.videoWidth) return;
        try {
          const side = Math.min(video.videoWidth, video.videoHeight);
          stage.drawImage(
            video,
            (video.videoWidth - side) / 2,
            (video.videoHeight - side) / 2,
            side,
            side,
            0,
            0,
            240,
            240,
          );
          const end = duration();
          if (!end || video.currentTime < 0.15 || video.currentTime > end - 0.15) {
            pixels.drawImage(staging, 0, 0, 8, 8);
            const data = pixels.getImageData(0, 0, 8, 8).data;
            let black = true;
            for (let i = 0; i < data.length; i += 4)
              if (data[i] > 6 || data[i + 1] > 6 || data[i + 2] > 6) {
                black = false;
                break;
              }
            if (black) return;
          }
          context.drawImage(staging, 0, 0);
          painted = true;
          video.parentElement.classList.add('has-video-frame');
          if (!firstFrame) {
            firstFrame = true;
            const frame = videoPosters.get(id) || cover.toDataURL('image/jpeg', 0.8);
            saveVideoPoster(id, frame);
            video.poster = frame;
          }
        } catch {}
      };
      const frame = () => {
        callback = 0;
        if (!video.isConnected) return;
        checkEnd();
        draw();
        if (!video.paused)
          callback = video.requestVideoFrameCallback
            ? video.requestVideoFrameCallback(frame)
            : requestAnimationFrame(frame);
      };
      const resume = () => {
        if (callback) return;
        callback = video.requestVideoFrameCallback
          ? video.requestVideoFrameCallback(frame)
          : requestAnimationFrame(frame);
      };
      const pause = () => {
        if (callback) {
          if (video.requestVideoFrameCallback) video.cancelVideoFrameCallback(callback);
          else cancelAnimationFrame(callback);
          callback = 0;
        }
      };
      video.addEventListener('loadeddata', () => {
        draw();
        if (!video.paused) resume();
      });
      video.addEventListener('playing', resume);
      video.addEventListener('pause', pause);
      video.addEventListener('seeked', () => {
        restarting = false;
        draw();
        if (!video.paused) resume();
      });
      video.addEventListener('timeupdate', checkEnd);
      video.addEventListener('ended', () => {
        if (!knownDuration && Number.isFinite(video.currentTime)) knownDuration = video.currentTime;
        restart();
      });
      roundVideoObserver.observe(video);
    });
  }
  const audioPlayers = new WeakSet();
  const imagePreviews = new Map();
  let heicDecoder;
  function watchImages(root) {
    root.querySelectorAll('.chat-file img:not(.chat-video-cover)').forEach((image) => {
      const link = image.closest('.chat-file'),
        name = image.alt,
        id = link.dataset.fileId;
      let converting = false;
      image.onerror = async () => {
        if (converting) return;
        converting = true;
        try {
          if (!/\.(heic|heif)$/i.test(name)) throw Error('Unsupported image format.');
          let preview = imagePreviews.get(id);
          if (!preview) {
            heicDecoder ||= import('/heic-to-1.6.6.js');
            const decoder = await heicDecoder;
            const response = await fetch(link.href);
            if (!response.ok) throw Error('Image download failed.');
            const blob = await decoder.heicTo({ blob: await response.blob(), type: 'image/jpeg', quality: 0.85 });
            preview = URL.createObjectURL(blob);
            imagePreviews.set(id, preview);
            if (imagePreviews.size > 16) {
              const key = imagePreviews.keys().next().value;
              URL.revokeObjectURL(imagePreviews.get(key));
              imagePreviews.delete(key);
            }
          }
          if (image.isConnected) {
            image.src = preview;
            image.onerror = null;
          }
        } catch {
          if (image.isConnected) {
            image.hidden = true;
            const fallback = document.createElement('span');
            fallback.className = 'chat-media-fallback';
            fallback.textContent = name + ' — Preview unavailable. Download original';
            link.append(fallback);
          }
        }
      };
      if (image.complete && !image.naturalWidth) image.onerror();
    });
    root.querySelectorAll('.chat-file video').forEach((video) => {
      video.onerror = () => {
        if (video.parentElement.querySelector('.chat-media-fallback')) return;
        video.hidden = true;
        const link = document.createElement('a');
        link.className = 'chat-media-fallback';
        link.href = video.src;
        link.textContent = 'Preview unavailable. Download original';
        link.setAttribute('download', '');
        video.parentElement.append(link);
      };
    });
  }
  function watchAudio(root) {
    root.querySelectorAll('.chat-audio').forEach((player) => {
      if (audioPlayers.has(player)) return;
      audioPlayers.add(player);
      const audio = player.querySelector('audio'),
        button = player.querySelector('[data-audio-play]'),
        wave = player.querySelector('.chat-audio-wave'),
        duration = player.querySelector('.chat-audio-duration');
      const clock = (value) => {
        const seconds = Math.floor(Number.isFinite(value) ? value : 0);
        return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
      };
      const sync = () => {
        const label = audio.paused ? 'Play audio' : 'Pause audio';
        if (button.getAttribute('aria-label') !== label || !button.firstChild) {
          button.innerHTML = icon(audio.paused ? 'play' : 'pause');
          button.setAttribute('aria-label', label);
          icons();
        }
        duration.textContent = clock(audio.paused && audio.currentTime === 0 ? audio.duration : audio.currentTime);
        const percent =
          Number.isFinite(audio.duration) && audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0;
        wave.setAttribute('aria-valuenow', String(Math.round(percent)));
        wave.querySelectorAll('span').forEach((bar, i) => bar.classList.toggle('played', (i / 40) * 100 < percent));
      };
      let decoded = false;
      const decode = async () => {
        if (decoded) return;
        decoded = true;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        let context;
        try {
          const response = await fetch(audio.src);
          if (!response.ok) return;
          context = new AudioContext();
          const data = await context.decodeAudioData(await response.arrayBuffer()),
            samples = data.getChannelData(0),
            bars = [...wave.children],
            levels = bars.map((_, i) => {
              const from = Math.floor((i * samples.length) / bars.length),
                to = Math.floor(((i + 1) * samples.length) / bars.length);
              let peak = 0;
              for (let j = from; j < to; j++) peak = Math.max(peak, Math.abs(samples[j]));
              return peak;
            }),
            maximum = Math.max(...levels, 0.001);
          bars.forEach((bar, i) => (bar.style.height = Math.max(3, (levels[i] / maximum) * 24) + 'px'));
        } catch {
        } finally {
          context?.close().catch(() => {});
        }
      };
      button.onclick = () => {
        if (audio.paused) {
          section.querySelectorAll('audio').forEach((other) => {
            if (other !== audio) other.pause();
          });
          audio.play().catch((error) => status(error.message));
        } else audio.pause();
      };
      wave.onclick = (event) => {
        if (Number.isFinite(audio.duration)) {
          const rect = wave.getBoundingClientRect();
          audio.currentTime = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * audio.duration;
        }
      };
      wave.onkeydown = (event) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) && Number.isFinite(audio.duration)) {
          event.preventDefault();
          audio.currentTime =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? audio.duration
                : Math.max(0, Math.min(audio.duration, audio.currentTime + (event.key === 'ArrowRight' ? 5 : -5)));
        }
      };
      for (const name of ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended'])
        audio.addEventListener(name, sync);
      audio.addEventListener('play', decode, { once: true });
      sync();
    });
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('#messages [data-round-sound]');
    if (!button) return;
    const video = button.parentElement.querySelector('video');
    video.muted = !video.muted;
    button.innerHTML = icon(video.muted ? 'volume-x' : 'volume-2');
    button.title = video.muted ? 'Enable sound' : 'Mute';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(!video.muted));
    icons();
    video.play().catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    section.querySelectorAll('.chat-round-video video').forEach((video) => {
      if (document.visibilityState === 'hidden') video.pause();
      else if (active()) {
        const rect = video.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < innerHeight) video.play().catch(() => {});
      }
    });
  });
  function mergeNode(m, group = true) {
    let node =
      timeline.querySelector('[data-msg-id="' + CSS.escape(String(m.id)) + '"]') ||
      (m.clientKey ? timeline.querySelector('[data-client-key="' + CSS.escape(m.clientKey) + '"]') : null);
    const content = JSON.stringify([
      m.id,
      m.text,
      m.format,
      m.files,
      m.forwarded,
      m.replyTo,
      m.replyText,
      m.replySender,
      m.sender,
      m.createdMs,
      m.examId,
      m.assignmentActive,
      m.pending,
      m.failed,
      m.deleted,
      m.editedMs,
      m.reactions,
    ]);
    if (node?.dataset.content === content) {
      const receipt = node.querySelector('.msg-receipt'),
        label = m.read ? 'Read' : m.delivered ? 'Delivered' : 'Sent';
      if (receipt && receipt.getAttribute('aria-label') !== label) {
        receipt.classList.toggle('is-read', !!m.read);
        receipt.setAttribute('aria-label', label);
        receipt.title = m.read ? 'Read by everyone' : label;
        receipt.innerHTML = icon(m.delivered || m.read ? 'check-check' : 'check');
        icons();
      }
      return;
    }
    const html = messageHTML(m);
    if (node) {
      if (node.innerHTML === html) return;
      node.innerHTML = html;
    } else {
      node = document.createElement('article');
      node.tabIndex = -1;
      node.innerHTML = html;
      timeline.append(node);
      timelineResize.observe(node);
    }
    node.className =
      'msg-message' +
      (m.senderId === account ? ' is-own' : '') +
      (m.category === 'learning' ? ' is-learning' : '') +
      (m.deleted ? ' is-deleted' : '') +
      (selection.has(m.id) ? ' is-selected' : '');
    node.dataset.msgId = m.id;
    node.dataset.clientKey = m.clientKey || '';
    node.dataset.content = content;
    node.dataset.day = dateLabel(m.createdMs || m.created * 1000);
    if (!m.deleted) decorateLinks(node);
    if (group) syncDays();
    icons();
    const emojis = emojiParts(m);
    if (!m.text?.trim() && m.files?.length === 1 && node.querySelector('.chat-round-video'))
      node.classList.add('is-video-message');
    if (!m.text?.trim() && m.files?.length === 1 && node.querySelector('.chat-audio'))
      node.classList.add('is-audio-message');
    watchRoundVideos(node);
    watchAudio(node);
    watchImages(node);
    if (emojis.length) {
      node.classList.add('is-emoji-only', 'emoji-count-' + (emojis.length <= 3 ? emojis.length : 'many'));
      const text = node.querySelector('.chat-message-text');
      text.replaceChildren();
      text.classList.add('emoji-big-wrap');
      emojis.forEach((emoji, i) => {
        const part = document.createElement('span');
        part.className = 'emoji-big appear';
        part.textContent = emoji;
        part.style.animationDelay = Math.min(i * 0.06, 0.6) + 's';
        part.addEventListener('animationend', () => {
          part.classList.remove('appear', 'bounce');
          part.style.animationDelay = '0s';
        });
        part.addEventListener('click', () => {
          part.classList.remove('appear', 'bounce');
          part.style.animationDelay = '0s';
          void part.offsetWidth;
          part.classList.add('bounce');
        });
        text.append(part);
      });
    }
  }
  function syncDays() {
    timeline.querySelectorAll('.chat-empty,.msg-day').forEach((n) => n.remove());
    let day = '';
    for (const node of timeline.querySelectorAll('.msg-message'))
      if (node.dataset.day !== day) {
        day = node.dataset.day;
        const heading = document.createElement('p');
        heading.className = 'msg-day';
        heading.textContent = day;
        node.before(heading);
      }
  }
  function paintMessages() {
    timelineResize.disconnect();
    timelineResize.observe(timeline);
    const renderKey = account + ':' + key();
    if (timeline.dataset.chatKey !== renderKey) {
      timeline.replaceChildren();
      timeline.dataset.chatKey = renderKey;
    }
    const rows = state()?.rows || [],
      ids = new Set(rows.map((m) => String(m.id)));
    timeline.querySelectorAll('.msg-message').forEach((node) => {
      if (!ids.has(node.dataset.msgId) && !(node.dataset.msgId === 'pending' && pending?.category === kind))
        node.remove();
    });
    let older = el('msgOlder');
    if (!older) {
      older = document.createElement('button');
      older.type = 'button';
      older.id = 'msgOlder';
      older.className = 'chat-link';
      older.textContent = 'Earlier messages';
      older.onclick = () => history({ older: true }).catch((error) => status(error.message));
      timeline.prepend(older);
    }
    older.hidden = !state()?.more;
    let previous = older;
    for (const m of rows) {
      mergeNode(m, false);
      const node = [...timeline.querySelectorAll('.msg-message')].find((n) => n.dataset.msgId === String(m.id));
      if (node) {
        let next = previous.nextElementSibling;
        while (next?.classList.contains('msg-day')) next = next.nextElementSibling;
        if (next !== node) previous.after(node);
        timelineResize.observe(node);
        previous = node;
      }
    }
    syncDays();
    paintUploads();
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      empty.textContent = 'No messages yet.';
      timeline.append(empty);
    }
    if (pending && pending.category === kind && !rows.some((m) => m.clientKey === pending.clientKey))
      mergeNode({
        ...pending,
        id: 'pending',
        senderId: account,
        sender: data.profile?.name || current()?.name || 'Me',
        createdMs: pending.createdMs || Date.now(),
        pending: busy,
        failed: !busy,
      });
  }
  async function history({ older = false, refresh = false, before = 0 } = {}) {
    if (!room || !ready) return;
    const token = ++loading,
      cacheKey = key(),
      roomId = room,
      category = kind,
      cache = state();
    if (cache?.loaded && !older && !refresh && !before) {
      paintMessages();
      timeline.scrollTop = timeline.scrollHeight;
      scheduleRead();
      return;
    }
    const height = timeline.scrollHeight,
      top = timeline.scrollTop,
      wasBottom = bottom(),
      result = await request('history', {
        roomId,
        category,
        ...(older && cache?.rows.length ? { before: cache.rows[0].id } : {}),
        ...(before ? { before } : {}),
      });
    if (token !== loading || cacheKey !== key()) return;
    const combined = older || refresh ? [...(cache?.rows || []), ...result.messages] : result.messages,
      rows = [...new Map(combined.map((m) => [m.id, m])).values()].sort((a, b) => a.id - b.id);
    historyCache.set(cacheKey, {
      loaded: true,
      rows,
      more: older || !refresh ? result.more : cache?.more || result.more,
    });
    upsertRoom(result.room);
    const readKey = roomId + ':' + category;
    const cursor = cursors.get(readKey) || {};
    cursor.read = Math.max(cursor.read || 0, result.readThrough || 0);
    cursors.set(readKey, cursor);
    paintMessages();
    timeline.scrollTop = older
      ? top + timeline.scrollHeight - height
      : refresh && !wasBottom
        ? top
        : timeline.scrollHeight;
    ack('delivered', roomId, category, result.messages.at(-1)?.id || 0);
    scheduleRead();
  }
  async function openRoom(id) {
    stickBottom = true;
    remember();
    if (id !== room) cancelUploads();
    closeEmoji();
    closeContext();
    clearSelection();
    if (recordGesture) cancelRecording();
    loading++;
    room = id;
    reply = null;
    pending = null;
    files = [];
    rightMode = '';
    listMode = 'chats';
    el('msgTextSearch').value = '';
    el('msgLatest').hidden = true;
    el('msgSendState').textContent = '';
    loadDraft();
    badge();
    paintRooms();
    if (prefs.right && innerWidth > 700) showInfo().catch((error) => status(error.message));
    else panel('right', false);
    if (innerWidth <= 700) panel('left', false);
    try {
      sessionStorage.setItem('enquiz-chat-room:' + account, room);
    } catch {}
    await history();
  }
  function ack(action, id, category, through) {
    if (!ready || !through) return;
    const k = id + ':' + category,
      entry = cursors.get(k) || {},
      column = action === 'read' ? 'read' : 'delivered';
    if (through <= Math.max(entry[column] || 0, entry[column + 'Pending'] || 0)) return;
    entry[column + 'Pending'] = through;
    cursors.set(k, entry);
    request(action, { roomId: id, category, through })
      .then((result) => {
        entry[column] = Math.max(entry[column] || 0, through);
        upsertRoom(result.room);
        badge();
        paintRooms();
      })
      .catch(() => {})
      .finally(() => {
        entry[column + 'Pending'] = 0;
      });
  }
  function acknowledgeSnapshot() {
    for (const r of data.rooms) if (r.lastMessage) ack('delivered', r.id, r.lastMessage.category, r.lastMessage.id);
  }
  function markRead() {
    if (
      !ready ||
      !active() ||
      !room ||
      document.visibilityState !== 'visible' ||
      !document.hasFocus() ||
      rightMode === 'search' ||
      (innerWidth <= 700 && prefs.left)
    )
      return;
    const box = timeline.getBoundingClientRect();
    const visible = [...timeline.querySelectorAll('[data-msg-id]')].filter((n) => {
      const r = n.getBoundingClientRect();
      return r.top < box.bottom && r.bottom > box.top;
    });
    ack('read', room, kind, Math.max(0, ...visible.map((n) => Number(n.dataset.msgId) || 0)));
  }
  function scheduleRead() {
    clearTimeout(readTimer);
    readTimer = setTimeout(markRead, 250);
  }
  timeline.addEventListener('scroll', () => {
    scheduleRead();
    if (bottom()) el('msgLatest').hidden = true;
  });
  async function send() {
    if ([...uploads.values()].some((item) => item.roomId === room && !item.cancelled)) {
      status('Wait for the attachments to finish uploading, or cancel them.');
      return;
    }
    if (busy || !room || (!composer.value.trim() && !files.length)) return;
    if (composer.value.length > 4000) {
      status('Maximum message length is 4000 characters.');
      return;
    }
    status('');
    const text = composer.value.trim(),
      category = reviewer() ? kind : 'personal',
      body = {
        roomId: room,
        text,
        category,
        replyTo: reply?.id || null,
        quote: reply?.quote || null,
        format: window.TextColors?.trim(format, composer.value) || null,
        files: files.map((f) => f.id),
      };
    if (!pending || Object.keys(body).some((k) => JSON.stringify(body[k]) !== JSON.stringify(pending[k])))
      pending = { ...body, clientKey: crypto.randomUUID(), createdMs: Date.now() };
    remember();
    busy = true;
    composer.disabled = true;
    el('msgSend').disabled = true;
    el('msgSendState').textContent = 'Sending...';
    paintUploads();
    const sent = pending,
      gen = generation;
    let succeeded = false;
    if (kind === category) {
      mergeNode({ ...sent, id: 'pending', senderId: account, sender: data.profile?.name || 'Me', pending: true });
      timeline.scrollTop = timeline.scrollHeight;
    }
    try {
      const result = await request('send', sent);
      if (gen !== generation || room !== sent.roomId) return;
      const cache = historyCache.get(room + ':' + category);
      if (cache && !cache.rows.some((m) => m.id === result.message.id)) cache.rows.push(result.message);
      if (kind === category) mergeNode(result.message);
      if (category === 'personal') {
        const currentRoom = data.rooms.find((r) => r.id === sent.roomId);
        if (currentRoom?.personalHidden)
          setRoomSettings(sent.roomId, { personalHidden: false }).catch(() => {});
        else {
          if (currentRoom) {
            currentRoom.hadPersonal = true;
            if (currentRoom.has) currentRoom.has.personal = true;
          }
          paintRooms();
        }
      }
      pending = null;
      reply = null;
      files = [];
      format = null;
      composer.value = '';
      window.TextColors?.sync(composer, null);
      paintDraft();
      remember();
      el('msgSendState').textContent = '';
      succeeded = true;
    } catch (error) {
      if (gen !== generation) return;
      el('msgSendState').textContent = error.message;
      if (kind === category)
        mergeNode({ ...sent, id: 'pending', senderId: account, sender: data.profile?.name || 'Me', failed: true });
    } finally {
      busy = false;
      composer.disabled = false;
      el('msgSend').disabled = false;
      paintUploads();
      if (succeeded && gen === generation && room === sent.roomId && active() && !el('msgCompose').hidden) {
        window.TextColors?.sync(composer, null);
        focusComposer();
      }
    }
  }
  el('msgCompose').onsubmit = (event) => {
    event.preventDefault();
    send();
  };
  composer.addEventListener('input', remember);
  let composing = false,
    shifted = false;
  composer.addEventListener('compositionstart', () => {
    composing = true;
  });
  composer.addEventListener('compositionend', () => {
    composing = false;
  });
  composer.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    shifted = event.shiftKey;
    if (prefs.enter === false || shifted || event.isComposing || composing || event.keyCode === 229) return;
    event.preventDefault();
    send();
  });
  composer.addEventListener('keyup', () => {
    shifted = false;
  });
