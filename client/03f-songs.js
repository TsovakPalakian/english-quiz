    const songBlobUrls = {};
    function forgetBlobUrl(id) {
      if (!songBlobUrls[id]) return;
      URL.revokeObjectURL(songBlobUrls[id]);
      delete songBlobUrls[id];
    }
    function blobUrlFor(id) {
      // While viewing another account, never resolve shared IDB blobs (id collisions).
      if (viewAccount) return Promise.resolve("");
      if (songBlobUrls[id]) return Promise.resolve(songBlobUrls[id]);
      return idbGetFile(id).then((rec) => {
        if (!rec || !rec.blob) return "";
        songBlobUrls[id] = URL.createObjectURL(rec.blob);
        return songBlobUrls[id];
      }).catch(() => "");
    }
    function linkParts(url) {
      try { return new URL(String(url || "").trim()); }
      catch (err) { return null; }
    }
    function youtubeId(url) {
      const parsed = linkParts(url);
      if (!parsed) return "";
      const host = parsed.hostname.replace(/^www\./, "");
      let id = "";
      if (host === "youtu.be") id = parsed.pathname.split("/").filter(Boolean)[0] || "";
      else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
        id = parsed.searchParams.get("v") || "";
        if (!id && parsed.pathname.indexOf("/embed/") === 0) id = parsed.pathname.split("/")[2] || "";
        if (!id && parsed.pathname.indexOf("/shorts/") === 0) id = parsed.pathname.split("/")[2] || "";
      }
      return /^[\w-]{6,}$/.test(id) ? id : "";
    }
    function vimeoId(url) {
      const parsed = linkParts(url);
      if (!parsed) return "";
      const host = parsed.hostname.replace(/^www\./, "");
      if (host !== "vimeo.com" && host !== "player.vimeo.com") return "";
      const id = (parsed.pathname.split("/").filter(Boolean).pop() || "");
      return /^\d+$/.test(id) ? id : "";
    }
    function spotifyEmbed(url) {
      const parsed = linkParts(url);
      if (!parsed || !/(^|\.)spotify\.com$/.test(parsed.hostname.replace(/^www\./, ""))) return "";
      const parts = parsed.pathname.split("/").filter(Boolean);
      const kindAt = parts.findIndex((part) => part === "track" || part === "album" || part === "playlist" || part === "episode");
      if (kindAt < 0 || !parts[kindAt + 1]) return "";
      const kind = parts[kindAt];
      const id = parts[kindAt + 1].split("?")[0];
      const height = kind === "track" || kind === "episode" ? 152 : 352;
      return '<iframe class="player" style="height:' + height + 'px" src="https://open.spotify.com/embed/' + kind + "/" + encodeURIComponent(id) + '" title="Music" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>';
    }
    function isDirectAudio(url) {
      const raw = String(url || "").trim();
      if (!/\.(mp3|ogg|wav|m4a|aac|flac)(\?|#|$)/i.test(raw)) return false;
      if (/^(javascript|data|vbscript):/i.test(raw)) return false;
      const parsed = linkParts(raw);
      if (!parsed) return true;
      return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "blob:";
    }
    function isDirectVideo(url) {
      const raw = String(url || "").trim();
      if (!/\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i.test(raw)) return false;
      if (/^(javascript|data|vbscript):/i.test(raw)) return false;
      const parsed = linkParts(raw);
      if (!parsed) return true;
      return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "blob:";
    }
    function openLink(label, url) {
      const parsed = linkParts(url);
      if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return "";
      return '<p><a href="' + esc(parsed.toString()) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + "</a></p>";
    }
    function videoHtml(url) {
      const link = String(url || "").trim();
      if (!link) return "";
      let player = "";
      const youtube = youtubeId(link);
      const vimeo = vimeoId(link);
      if (youtube) player = '<iframe class="player tall" id="yt' + embedSerial() + '" src="https://www.youtube.com/embed/' + esc(youtube) + '?enablejsapi=1&origin=' + encodeURIComponent(location.origin) + '" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
      else if (vimeo) player = '<iframe class="player tall" src="https://player.vimeo.com/video/' + esc(vimeo) + '" title="Video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
      else if (isDirectVideo(link)) player = '<video class="player" controls src="' + esc(link) + '"></video>';
      else player = openLink("Open the video", link);
      return songPlayerHtml("video", '<p class="label">Video</p>' + player);
    }
    function musicHtml(url) {
      const link = String(url || "").trim();
      if (!link) return "";
      let player = "";
      const spotify = spotifyEmbed(link);
      if (spotify) player = spotify;
      else if (isDirectAudio(link)) player = '<audio class="player" controls src="' + esc(link) + '"></audio>';
      else if (/soundcloud\.com/i.test(link)) player = '<iframe class="player tall" src="https://w.soundcloud.com/player/?url=' + encodeURIComponent(link) + '" title="Music" allow="autoplay"></iframe>';
      else player = openLink("Open the music", link);
      return songPlayerHtml("music", '<p class="label">Music</p>' + player);
    }
    function filePlayerHtml(src, type, name) {
      const kind = String(type || "");
      const player = kind.indexOf("video/") === 0
        ? '<video class="player" controls src="' + esc(src) + '"></video>'
        : (kind.indexOf("audio/") === 0 || isDirectAudio(name) ? '<audio class="player" controls src="' + esc(src) + '"></audio>' : openLink(name || "Open the file", src));
      return songPlayerHtml("file", '<p class="label">File</p>' + player + (name ? '<p class="hint">' + esc(name) + "</p>" : ""));
    }
    let embedCount = 0;
    function embedSerial() { embedCount += 1; return embedCount; }
    function songPlayerHtml(kind, html) {
      if (!html) return "";
      return '<div class="song-player" data-song-player="' + kind + '">' + html + '</div>';
    }
    function settleSongEmbeds(root) {
      (root || document).querySelectorAll(".song-player iframe, .song-player audio, .song-player video").forEach((node) => {
        node.style.setProperty("position", "relative", "important");
        node.style.setProperty("top", "auto", "important");
        node.style.setProperty("left", "auto", "important");
        node.style.setProperty("right", "auto", "important");
        node.style.setProperty("bottom", "auto", "important");
        node.style.setProperty("transform", "none", "important");
      });
    }
    function releaseSongPlayer(box) {
      if (!box) return;
      box.classList.remove("is-playing");
      box.style.position = "";
      box.style.top = "";
      box.style.left = "";
      box.style.width = "";
      box.style.zIndex = "";
      const spacer = box.previousElementSibling;
      if (spacer && spacer.classList.contains("song-player-spacer")) spacer.remove();
    }
    function stopSongPlayer(box) {
      if (!box) return;
      box.querySelectorAll("audio, video").forEach((node) => { try { node.pause(); } catch (err) {} });
      box.querySelectorAll("iframe.player").forEach((iframe) => {
        const win = iframe.contentWindow;
        const kind = iframe.dataset.embed;
        const control = iframe.__spotifyController;
        if (kind === "spotify") {
          if (control && typeof control.pause === "function") { try { control.pause(); } catch (err) {} }
          else if (win) win.postMessage({ command: "pause" }, "*");
          return;
        }
        if (!win) return;
        if (kind === "youtube") win.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*");
        else if (kind === "vimeo") win.postMessage(JSON.stringify({ method: "pause" }), "*");
        else if (kind === "soundcloud") win.postMessage(JSON.stringify({ method: "pause" }), "*");
      });
    }
    function setSongPlayer(box, playing) {
      if (!box) return;
      if (playing) {
        if (!box.classList.contains("is-playing")) {
          document.querySelectorAll("#songUser .song-player").forEach((el) => { if (el !== box) stopSongPlayer(el); });
          document.querySelectorAll(".song-player.is-playing").forEach((el) => { if (el !== box) releaseSongPlayer(el); });
        }
        box.classList.add("is-playing");
        placePlayingPlayer();
        return;
      }
      releaseSongPlayer(box);
    }
    function stopPageMedia(root) {
      if (!root) return;
      stopSongPlayer(root);
      root.querySelectorAll('iframe').forEach(frame => {
        const src = frame.getAttribute('src');
        if (!src || !/youtube|vimeo|spotify|soundcloud|archive\.org/.test(src)) return;
        frame.dataset.pausedSrc = src; frame.removeAttribute('src');
      });
    }
    function restorePageMedia(root) {
      root?.querySelectorAll('iframe[data-paused-src]').forEach(frame => {
        const url = new URL(frame.dataset.pausedSrc,location.href); url.searchParams.set('autoplay','0'); frame.src = url.href; delete frame.dataset.pausedSrc;
      });
    }
    document.addEventListener('visibilitychange',() => { if (document.hidden) stopPageMedia(document.querySelector('section.on')); else restorePageMedia(document.querySelector('section.on')); });
    window.addEventListener('pagehide',() => stopPageMedia(document.querySelector('section.on')));
    window.addEventListener('pageshow',() => restorePageMedia(document.querySelector('section.on')));
    function playerStickTop() {
      const bar = document.querySelector(".top");
      const meta = document.querySelector("#song.on .meta") || document.querySelector("section.on .meta");
      const stuck = (bar ? bar.offsetHeight : 0) + (meta ? meta.offsetHeight : 0);
      const metaBottom = meta ? meta.getBoundingClientRect().bottom : stuck;
      return Math.round(Math.max(stuck, metaBottom));
    }
    function hoistSpotify(root) {
      const user = document.getElementById("songUser");
      if (!user) return;
      (root || user).querySelectorAll(".song-player[data-song-player='music']").forEach((box) => {
        if (box.closest("[hidden], [data-lyric-meta-editor], [data-lyric-music-preview]")) return;
        if (box.parentElement === user) return;
        const media = user.querySelector("[data-song-media]");
        if (media && media.parentElement === user) media.after(box);
        else user.prepend(box);
      });
    }
    function stickSpotify() {
      hoistSpotify();
      document.querySelectorAll("#songUser > .song-player[data-song-player='music']").forEach((box) => {
        if (box.classList.contains("is-playing")) return;
        box.style.position = "";
        box.style.top = "";
        box.style.left = "";
        box.style.width = "";
        box.style.zIndex = "";
      });
    }
    function placePlayingPlayer() {
      stickSpotify();
      const box = document.querySelector("#songUser .song-player.is-playing");
      if (!box) return;
      if (!box.previousElementSibling || !box.previousElementSibling.classList.contains("song-player-spacer")) {
        const spacer = document.createElement("div");
        spacer.className = "song-player-spacer";
        box.before(spacer);
      }
      const spacer = box.previousElementSibling;
      const rect = spacer.getBoundingClientRect();
      settleSongEmbeds(document);
      box.style.position = "fixed";
      box.style.top = playerStickTop() + "px";
      box.style.left = Math.round(rect.left) + "px";
      box.style.width = Math.round(rect.width) + "px";
      spacer.style.height = box.offsetHeight + "px";
    }
    function greetEmbed(iframe) {
      const win = iframe.contentWindow;
      if (!win) return;
      const kind = iframe.dataset.embed;
      if (kind === "youtube") win.postMessage(JSON.stringify({ event: "listening", id: iframe.id, channel: "widget" }), "*");
      else if (kind === "vimeo") ["play", "pause", "ended"].forEach((name) => win.postMessage(JSON.stringify({ method: "addEventListener", value: name }), "*"));
      else if (kind === "soundcloud") ["play", "pause", "finish"].forEach((name) => win.postMessage(JSON.stringify({ method: "addEventListener", value: name }), "*"));
    }
    function ensureSpotifyApi() {
      if (window.__spotifyEmbedApi) return;
      if (!window.__spotifyEmbedWait) window.__spotifyEmbedWait = [];
      if (window.__spotifyEmbedHook) return;
      window.__spotifyEmbedHook = true;
      const previous = window.onSpotifyIframeApiReady;
      window.onSpotifyIframeApiReady = (api) => {
        window.__spotifyEmbedApi = api;
        if (typeof previous === "function") previous(api);
        const wait = window.__spotifyEmbedWait || [];
        window.__spotifyEmbedWait = [];
        wait.forEach((iframe) => attachSpotify(iframe));
      };
      if (!document.getElementById("spotifyIframeApi")) {
        const script = document.createElement("script");
        script.id = "spotifyIframeApi";
        script.async = true;
        script.src = "https://open.spotify.com/embed/iframe-api/v1";
        document.head.appendChild(script);
      }
    }
    function spotifyUriFrom(iframe) {
      const src = (iframe && (iframe.getAttribute("src") || iframe.dataset.spotifyUri)) || "";
      const match = String(src).match(/embed\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/);
      if (!match) return "";
      return "spotify:" + match[1] + ":" + match[2];
    }
    function attachSpotify(iframe) {
      if (!iframe || iframe.dataset.spotifyOn === "1") return;
      const uri = spotifyUriFrom(iframe);
      if (uri) iframe.dataset.spotifyUri = uri;
      const api = window.__spotifyEmbedApi;
      if (!api) {
        ensureSpotifyApi();
        if (window.__spotifyEmbedWait.indexOf(iframe) < 0) window.__spotifyEmbedWait.push(iframe);
        return;
      }
      if (!uri) return;
      iframe.dataset.spotifyOn = "1";
      const height = uri.indexOf(":track:") >= 0 || uri.indexOf(":episode:") >= 0 ? 152 : 352;
      const size = (node) => {
        if (!node || !node.style) return;
        node.dataset.spotifyHeight = String(height);
        ["height", "min-height", "max-height"].forEach((name) => node.style.setProperty(name, height + "px", "important"));
      };
      size(iframe);
      try {
        api.createController(iframe, { uri: uri, width: "100%", height: height }, (controller) => {
          const live = (controller && controller.iframeElement) || iframe;
          if (live.classList) live.classList.add("player");
          live.dataset.embed = "spotify";
          size(live);
          live.__spotifyController = controller;
          iframe.__spotifyController = controller;
          const box = live.closest(".song-player");
          settleSongEmbeds(box || document);
          const apply = (data) => {
            if (!box || !data || (data.isPaused == null && data.isBuffering == null)) return;
            setSongPlayer(box, data.isPaused === false || data.isBuffering === true);
          };
          controller.addListener("playback_update", (event) => apply(event && event.data));
          controller.addListener("playback_started", () => { if (box) setSongPlayer(box, true); });
        });
      } catch (err) { iframe.dataset.spotifyOn = ""; }
    }
    function watchSongPlayers(root) {
      (root || document).querySelectorAll("iframe.player").forEach((iframe) => {
        const src = iframe.getAttribute("src") || "";
        if (/youtube(?:-nocookie)?\.com/.test(src)) iframe.dataset.embed = "youtube";
        else if (/vimeo\.com/.test(src)) iframe.dataset.embed = "vimeo";
        else if (/spotify\.com/.test(src)) iframe.dataset.embed = "spotify";
        else if (/soundcloud\.com/.test(src)) iframe.dataset.embed = "soundcloud";
        else return;
        if (iframe.dataset.embed === "spotify") { attachSpotify(iframe); stickSpotify(); return; }
        if (iframe.dataset.armed === "1") return;
        iframe.dataset.armed = "1";
        iframe.addEventListener("load", () => greetEmbed(iframe));
        greetEmbed(iframe);
      });
    }
    function songPlayerFromMedia(event) {
      const node = event.target;
      if (!node || !node.closest) return null;
      if (node.tagName !== "AUDIO" && node.tagName !== "VIDEO") return null;
      return node.closest(".song-player");
    }
    function onEmbedMessage(event) {
      const frames = document.querySelectorAll("iframe.player");
      let iframe = null;
      for (let i = 0; i < frames.length; i++) {
        if (frames[i].contentWindow === event.source) { iframe = frames[i]; break; }
      }
      if (!iframe) return;
      const box = iframe.closest(".song-player");
      if (!box) return;
      let data = event.data;
      if (typeof data === "string") { try { data = JSON.parse(data); } catch (err) { return; } }
      if (!data || typeof data !== "object") return;
      if (!iframe.dataset.embed && /spotify\.com/.test(iframe.getAttribute("src") || "")) iframe.dataset.embed = "spotify";
      const kind = iframe.dataset.embed;
      if (kind === "youtube") {
        if (data.event === "onReady" || data.event === "initialDelivery") greetEmbed(iframe);
        if (data.event === "onStateChange") setSongPlayer(box, Number(data.info) === 1 || Number(data.info) === 3);
        if (data.event === "infoDelivery" && data.info && data.info.playerState != null) setSongPlayer(box, Number(data.info.playerState) === 1 || Number(data.info.playerState) === 3);
      } else if (kind === "vimeo") {
        if (data.event === "play") setSongPlayer(box, true);
        if (data.event === "pause" || data.event === "ended") setSongPlayer(box, false);
      } else if (kind === "soundcloud") {
        if (data.method === "play") setSongPlayer(box, true);
        if (data.method === "pause" || data.method === "finish") setSongPlayer(box, false);
      } else if (kind === "spotify") {
        const payload = data.payload && typeof data.payload === "object" ? data.payload : {};
        if (data.type === "ready" && iframe.contentWindow) iframe.contentWindow.postMessage({ command: "load_complete_ack" }, "https://open.spotify.com");
        if (data.type === "playback_started") setSongPlayer(box, true);
        else if (data.type === "playback_update") {
          if (payload.isPaused == null && payload.isBuffering == null) return;
          setSongPlayer(box, payload.isPaused === false || payload.isBuffering === true);
        }
      }
    }
    document.addEventListener("play", (event) => { const box = songPlayerFromMedia(event); if (box) setSongPlayer(box, true); }, true);
    document.addEventListener("pause", (event) => { const box = songPlayerFromMedia(event); if (box) setSongPlayer(box, false); }, true);
    document.addEventListener("ended", (event) => { const box = songPlayerFromMedia(event); if (box) setSongPlayer(box, false); }, true);
    window.addEventListener("message", onEmbedMessage);
    window.addEventListener("scroll", () => { settleSongEmbeds(); placePlayingPlayer(); }, true);
    window.addEventListener("resize", () => placePlayingPlayer());
    function mediaOf(song) {
      let video = (song && song.videoUrl) || "";
      let music = (song && song.musicUrl) || "";
      const legacy = !video && !music ? ((song && song.url) || "") : "";
      if (legacy) {
        if (youtubeId(legacy) || vimeoId(legacy) || isDirectVideo(legacy)) video = legacy;
        else music = legacy;
      }
      return { video: video, music: music };
    }
    function songFilePath(id) {
      const base = "/api/song-file?id=" + encodeURIComponent(id);
      return viewAccount ? base + "&for=" + encodeURIComponent(viewAccount.id) : base;
    }
    const editUpload = { xhr: null };
    const lyricUpload = { xhr: null };
    let editFileSent = false;
    let lyricFileSent = false;
    let pendingLyricId = "";
    function uploadSongFile(id, blob, type, onProgress, holder) {
      if (!authUser || accountApi() || !id || !blob) return Promise.resolve(false);
      if (window.LearningMain && typeof window.LearningMain.uploadSongAudio === "function") return Promise.resolve(false);
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        if (holder) holder.xhr = xhr;
        xhr.open("PUT", songFilePath(id));
        xhr.withCredentials = true;
        xhr.setRequestHeader("Content-Type", type || blob.type || "audio/mpeg");
        xhr.upload.onprogress = (event) => {
          if (onProgress && event.lengthComputable && event.total) onProgress(event.loaded / event.total);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(true);
          else reject(new Error("fail"));
        };
        xhr.onerror = () => reject(new Error("fail"));
        xhr.onabort = () => resolve(false);
        xhr.send(blob);
      });
    }
    function pushSongFile(id, blob, type) {
      return uploadSongFile(id, blob, type).catch(() => {});
    }
    function paintRing(box, ring, label, button, ratio, text) {
      if (!box || !ring) return;
      if (ratio == null) {
        box.hidden = true;
        if (button) button.disabled = false;
        return;
      }
      const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
      box.hidden = false;
      ring.style.setProperty("--p", String(pct));
      const num = ring.querySelector("b");
      if (num) num.textContent = String(pct);
      if (label) label.textContent = text || "";
      if (button) button.disabled = pct < 100;
    }
    function dropSongFile(id) {
      if (!authUser || accountApi() || !id) return Promise.resolve();
      return fetch(songFilePath(id), { method: "DELETE", credentials: "include" }).catch(() => {});
    }
    function mountSongFile(box, fileHtml) {
      if (!box) return;
      const musicNode = box.querySelector(".song-player[data-song-player='music']");
      hoistSpotify(box);
      if (!fileHtml) return;
      const holder = document.createElement("div");
      holder.innerHTML = fileHtml;
      const node = holder.firstElementChild;
      if (!node) return;
      if (musicNode && musicNode.isConnected) musicNode.after(node);
      else box.append(node);
    }
    let mediaPaint = 0;
    function paintSongMedia(song, box) {
      const token = ++mediaPaint;
      const slots = mediaOf(song);
      const draw = (fileHtml) => {
        if (token !== mediaPaint || !box) return;
        box.innerHTML = videoHtml(slots.video) + musicHtml(slots.music);
        mountSongFile(box, fileHtml || "");
        watchSongPlayers(document.getElementById("songUser") || box);
      };
      if (!song || !song.fileName) { draw(""); return; }
      const remote = !accountApi() && authUser ? songFilePath(song.id) : "";
      blobUrlFor(song.id).then((src) => {
        if (token !== mediaPaint) return;
          if (src) {
          draw(filePlayerHtml(src, song.fileType, song.fileName));
          // Never push a local IDB blob onto a viewed account (id collisions).
          if (!viewAccount) {
            idbGetFile(song.id).then((rec) => { if (rec && rec.blob) pushSongFile(song.id, rec.blob, rec.type || song.fileType); });
          }
          return;
        }
        if (!remote) {
          draw('<p class="label">File</p><p class="hint">' + esc(song.fileName) + "</p>");
          return;
        }
        fetch(remote, { method: "HEAD", credentials: "include" }).then((res) => {
          if (token !== mediaPaint) return;
          draw(res.ok ? filePlayerHtml(remote, song.fileType || "audio/mpeg", song.fileName) : '<p class="label">File</p><p class="hint">' + esc(song.fileName) + "</p>");
        }).catch(() => {
          if (token !== mediaPaint) return;
          draw('<p class="label">File</p><p class="hint">' + esc(song.fileName) + "</p>");
        });
      });
    }
    function lyricPieces(text, marks = {}) {
      const phrases = [];
      cardIndex().forEach((value, key) => { if (key.indexOf(" ") > 0) phrases.push(key); });
      Object.entries(marks).forEach(([key,mark])=>{if(key.includes(' ')&&['new','have'].includes(mark?.state)&&!phrases.includes(key))phrases.push(key);});
      phrases.sort((a, b) => b.length - a.length);
      const raw = [];
      const re = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;
      let last = 0;
      let match;
      while ((match = re.exec(text))) {
        if (match.index > last) raw.push({ gap: text.slice(last, match.index) });
        raw.push({ word: match[0], key: match[0].toLowerCase().replace(/’/g, "'") });
        last = match.index + match[0].length;
      }
      if (last < text.length) raw.push({ gap: text.slice(last) });
      const wordAt = [];
      raw.forEach((part, index) => { if (part.word) wordAt.push(index); });
      const grouped = {};
      wordAt.forEach((index, start) => {
        if (grouped[index]) return;
        phrases.forEach((phrase) => {
          if (grouped[index]) return;
          const bits = phrase.split(/\s+/);
          if (start + bits.length > wordAt.length) return;
          for (let n = 0; n < bits.length; n++) {
            if (raw[wordAt[start + n]].key !== bits[n]) return;
          }
          let crossed = false;
          for (let n = 0; n < bits.length - 1; n++) {
            let gap = "";
            const from = wordAt[start + n];
            const to = wordAt[start + n + 1];
            for (let k = from + 1; k < to; k++) if (raw[k] && raw[k].gap != null) gap += raw[k].gap;
            if (/[\n.!?;]/.test(gap)) { crossed = true; break; }
          }
          if (crossed) return;
          for (let n = 0; n < bits.length; n++) grouped[wordAt[start + n]] = phrase;
          raw[index].phrase = phrase;
          raw[index].phraseEnd = wordAt[start + bits.length - 1];
        });
      });
      return { raw: raw, grouped: grouped };
    }
    function lyricKeys(text, marks = {}) {
      const pieces = lyricPieces(text,marks);
      const keys = [];
      const seen = {};
      pieces.raw.forEach((part) => {
        if (!part.word || pieces.grouped[pieces.raw.indexOf(part)]) return;
        if (seen[part.key]) return;
        seen[part.key] = true;
        keys.push(part.key);
      });
      pieces.raw.forEach((part, index) => {
        if (!part.phrase || pieces.grouped[index] !== part.phrase) return;
        if (seen[part.phrase]) return;
        seen[part.phrase] = true;
        keys.push(part.phrase);
      });
      return keys;
    }
    function lyricHtml(text, marks) {
      const pieces = lyricPieces(text,marks);
      let html = "";
      for (let i = 0; i < pieces.raw.length; i++) {
        const part = pieces.raw[i];
        if (part.gap != null) { html += esc(part.gap); continue; }
        if (part.phrase) {
          let label = "";
          for (let n = i; n <= part.phraseEnd; n++) label += pieces.raw[n].gap != null ? pieces.raw[n].gap : pieces.raw[n].word;
          html += lyricMark(label, part.phrase, lyricShownMark(part.phrase, marks));
          i = part.phraseEnd;
          continue;
        }
        html += lyricMark(part.word, part.key, lyricShownMark(part.key, marks));
      }
      return html;
    }
    function lyricCountLine(added, missed) {
      const cards = added === 1 ? "1 new card" : added + " new cards";
      const red = missed === 1 ? "1 word is red" : missed + " words are red";
      return cards + ". " + red + ".";
    }
    const LEARNED_KEY = "enquiz-learned";
    function loadLearned() {
      try { return new Set(JSON.parse(localStorage.getItem(LEARNED_KEY) || "[]")); }
      catch (e) { return new Set(); }
    }
    let lyricSize = Number(localStorage.getItem("enquiz-lyric-size")) || 20;
    function songStat(keys, marks) {
      const learnedSet = loadLearned();
      const index = cardIndex();
      let words = 0;
      let fresh = 0;
      let learned = 0;
      let phrasal = 0;
      let idioms = 0;
      keys.forEach((key) => {
        words += 1;
        const rawMark = marks[key];
        const mark = rawMark && typeof rawMark === "object" ? rawMark : {};
        if (mark.state === "new") fresh += 1;
        const openKey = mark.word ? String(mark.word).toLowerCase() : key;
        if ((mark.state === "have" || mark.state === "new") && learnedSet.has(openKey)) learned += 1;
        if (mark.state !== "new" || String(key).indexOf(" ") < 0) return;
        const known = index.get(String(openKey).toLowerCase()) || index.get(String(key).toLowerCase());
        const kind = mark.deck || (known && known.kind) || "";
        if (kind === "idioms") idioms += 1;
        else if (kind === "phrasal") phrasal += 1;
      });
      return { words: words, fresh: fresh, learned: learned, left: Math.max(0, words - learned), phrasal: phrasal, idioms: idioms };
    }
    function phraseBit(count, one, many) {
      const n = count || 0;
      return n + " " + (n === 1 ? one : many);
    }
    function statsLine(stats) {
      return stats.words + " words · " + stats.fresh + " new · " + stats.learned + " learned · " + stats.left + " still to learn · " + phraseBit(stats.phrasal, "phrasal verb", "phrasal verbs") + " · " + phraseBit(stats.idioms, "idiom", "idioms");
    }
    function songRow(number, title, artist, about, attrs) {
      const who = artist ? '<span class="plain">. ' + esc(artist) + "</span>" : "";
      return '<button class="day active saas-card" type="button" ' + attrs + '><span class="date saas-badge saas-badge-muted">' + number + '</span><span class="song-line"><b>' + esc(title) + "</b>" + who + '</span><span class="label about saas-badge saas-badge-info">' + esc(about) + "</span></button>";
    }
    function lyricMark(label, key, mark) {
      if(mark&&(mark.state==='error'||mark.state==='untranslated'))return '<button class="word lyric-unchecked" type="button" title="'+esc(mark.state==='error'?'Check failed. Try again.':'No definition available yet.')+'" data-lyric-open="'+esc(key)+'">'+esc(label)+'</button>';
      if (!mark || mark.state === "error" || mark.state === "miss") return '<button class="word lyric-miss" type="button" data-lyric-open="' + esc(key) + '">' + esc(label) + "</button>";
      const openKey = mark.word ? String(mark.word).toLowerCase() : key;
      const learned = loadLearned().has(openKey) ? " learned" : "";
      return '<button class="word' + learned + '" type="button" data-lyric-open="' + esc(openKey) + '">' + esc(label) + "</button>";
    }
    function setSongHead(title, artist) {
      document.getElementById("songTitle").textContent = title;
      document.getElementById("songBanner").textContent = title;
      document.getElementById("songBannerArtist").textContent = artist || "";
    }
    function showSampleSong() {
      setSongHead("Sample line", "");
      document.getElementById("songSample").hidden = false;
      const user = document.getElementById("songUser");
      user.hidden = true;
      user.dataset.songId = "";
    }
    function applyLyricSize(root) {
      (root || document).querySelectorAll(".lyric-text").forEach((el) => { el.style.fontSize = lyricSize + "px"; });
    }
    function renderUserSong(song) {
      setSongHead(song.title, song.artist || "");
      document.getElementById("songSample").hidden = true;
      const user = document.getElementById("songUser");
      user.hidden = false;
      user.dataset.songId = song.id;
      let lyricBody = "";
      try { lyricBody = lyricHtml(song.lyrics || "", song.marks || {}); }
      catch (e) { lyricBody = esc(song.lyrics || ""); }
      let checkLine = "";
      try {
        const keys = Object.keys(song.marks || {});
        checkLine = statsLine(songStat(keys, song.marks || {}));
      } catch (e) { checkLine = ""; }
      user.innerHTML = '<div data-song-media></div>' +
        '<div class="row" style="margin-bottom:8px"><button class="btn saas-btn" type="button" data-lyric-size="-1">A−</button><button class="btn saas-btn" type="button" data-lyric-size="1">A+</button><button class="btn saas-btn" type="button" data-lyric-meta>Edit song</button><button class="btn saas-btn" type="button" data-lyric-edit>Edit lyric</button><button class="btn saas-btn" type="button" data-lyric-archive>Archive</button></div>' +
        '<p class="hint" data-lyric-check>' + esc(checkLine) + "</p>" +
        '<div class="saas-card saas-form-grid" data-lyric-meta-editor hidden style="margin-bottom:12px;padding:16px"><p class="label">Song title</p><input type="text" data-lyric-title autocomplete="off" /><p class="label">Artist</p><input type="text" data-lyric-artist placeholder="Band or singer" autocomplete="off" /><p class="label">Video link</p><input type="text" data-lyric-video placeholder="YouTube or another video link" autocomplete="off" /><div data-lyric-video-preview></div><p class="label">Music link</p><input type="text" data-lyric-music placeholder="Spotify, a music site, or a direct audio link" autocomplete="off" /><div data-lyric-music-preview></div><p class="label">File</p><div class="drop" data-lyric-drop>Drop a file here, or <button class="btn saas-btn" type="button" data-lyric-file-pick>choose a file</button><input type="file" data-lyric-file accept="audio/*,video/*" hidden /></div><p class="hint" data-lyric-file-name></p><p class="file-progress" data-lyric-file-progress hidden><span class="ring" data-lyric-file-ring style="--p:0"><b>0</b></span><span data-lyric-file-progress-text></span></p><div data-lyric-file-preview></div><div class="row" style="margin-top:8px"><button class="btn saas-btn" type="button" data-lyric-file-clear>Remove file</button><button class="btn primary saas-btn" type="button" data-lyric-meta-save>Save</button></div><p class="hint" data-lyric-meta-status></p></div>' +
        '<div class="saas-card saas-form-grid" data-lyric-editor hidden style="margin-bottom:12px;padding:16px"><textarea data-lyric-draft></textarea><div class="row" style="margin-top:8px"><button class="btn primary saas-btn" type="button" data-lyric-recheck>Check the words again</button></div><p class="hint" data-lyric-edit-status></p></div>' +
        '<div class="lyric-text">' + lyricBody + "</div>";
      const titleInput = user.querySelector("[data-lyric-title]");
      const artistInput = user.querySelector("[data-lyric-artist]");
      const slots = mediaOf(song);
      const videoInput = user.querySelector("[data-lyric-video]");
      const musicInput = user.querySelector("[data-lyric-music]");
      if (titleInput) titleInput.value = song.title || "";
      if (artistInput) artistInput.value = song.artist || "";
      if (videoInput) videoInput.value = slots.video || "";
      if (musicInput) musicInput.value = slots.music || "";
      pendingEditFile = null;
      editFileSent = false;
      editFileRemoved = false;
      const fileName = user.querySelector("[data-lyric-file-name]");
      if (fileName) fileName.textContent = song.fileName || "";
      paintSongMedia(song, user.querySelector("[data-song-media]"));
      refreshEditMedia();
      const draft = user.querySelector("[data-lyric-draft]");
      if (draft) draft.value = song.lyrics;
      if(draft){window.TextColors?.mount(draft,{format:song.colorText});window.TextColors?.sync(draft,song.colorText);}
      window.TextColors?.paintValue(user.querySelector('.lyric-text'),song.lyrics||'',song.colorText);
      applyLyricSize(user);
    }
    async function saveSongMeta() {
      const id = document.getElementById("songUser").dataset.songId;
      const list = loadSongs();
      const song = list.find((item) => item.id === id);
      const status = document.querySelector("#songUser [data-lyric-meta-status]");
      if (!song || !status) return;
      const title = document.querySelector("#songUser [data-lyric-title]").value.trim();
      const artist = document.querySelector("#songUser [data-lyric-artist]").value.trim();
      const video = document.querySelector("#songUser [data-lyric-video]").value.trim();
      const music = document.querySelector("#songUser [data-lyric-music]").value.trim();
      if (!title) {
        status.textContent = "Write the song title.";
        status.classList.add("bad");
        return;
      }
      song.title = title;
      song.artist = artist;
      song.videoUrl = video;
      song.musicUrl = music;
      song.url = "";
      try {
        if (editFileRemoved) {
          await idbDeleteFile(song.id);
          forgetBlobUrl(song.id);
          await dropSongFile(song.id);
          song.fileName = "";
          song.fileType = "";
        } else if (pendingEditFile) {
          if (!viewAccount) {
            await idbPutFile(song.id, pendingEditFile);
            forgetBlobUrl(song.id);
          }
          if (!editFileSent) await uploadSongFile(song.id, pendingEditFile, pendingEditFile.type || "", (ratio) => paintEditRing(ratio, "Uploading…"), editUpload);
          song.fileName = pendingEditFile.name;
          song.fileType = pendingEditFile.type || "";
        }
      } catch (err) {
        status.textContent = "The file could not be saved.";
        status.classList.add("bad");
        return;
      }
      saveSongs(list, song);
      paintLyrics();
      renderUserSong(song);
    }
    function openLyricSong(id) {
      const song = loadSongs().find((item) => item.id === id);
      if (!song || song.archived) return;
      renderUserSong(song);
      visit("song");
    }
    function paintLyrics() {
      const list = visibleSongs();
      const count = document.getElementById("lyricCount");
      if (count) count.textContent = String(list.length);
      const title = document.querySelector("#music h1");
      if (title) title.textContent = "Song lyrics · " + list.length;
      const box = document.getElementById("lyricList");
      if (!box) return;
      let html = "";
      list.forEach((song, index) => {
        let about = "";
        try {
          const keys = Object.keys(song.marks || {});
          about = statsLine(songStat(keys, song.marks || {}));
        } catch (e) {
          about = "";
        }
        html += songRow(index + 1, song.title, song.artist || "", about, 'data-lyric="' + esc(song.id) + '"');
      });
      box.innerHTML = html;
      applyCardSearch(box.closest("section"));
    }
    function rememberLyricCard(data, place, fromSong, bucket) {
      const deck = place || "music";
      if (hideStudentSongs() && deck === "music") return false;
      const key = String(data.word || "").trim().toLowerCase();
      if (!key || cardIndex().has(key)) return false;
      const list = loadAdded();
      const item = { word: midTitle(data.word), ru: data.ru || "", data: data, place: deck };
      if (data.expressionKey) item.expressionKey = data.expressionKey;
      if (data.expressionType) item.expressionType = data.expressionType;
      if (fromSong && (deck === "phrasal" || deck === "idioms")) item.fromSong = fromSong;
      list.unshift(item);
      saveAdded(list, bucket ? null : { op: "put-card", card: item });
      if (bucket) bucket.push(item);
      trackEvent("card", cardArea(deck), "add");
      return true;
    }
    function songTitleFor(word) {
      const key = String(word || "").trim().toLowerCase();
      if (!key || key.indexOf(" ") < 0) return "";
      const songs = loadSongs();
      for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        if (!song || song.archived) continue;
        if ((song.marks || {})[key] || spanOnOneLine(song.lyrics || "", key.split(/\s+/))) return song.title || "";
      }
      return "";
    }
    function spanOnOneLine(text, bits) {
      if (!bits || bits.length < 2) return false;
      const source = String(text || "");
      const words = [];
      const re = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;
      let match;
      while ((match = re.exec(source))) words.push({ key: match[0].toLowerCase().replace(/’/g, "'"), start: match.index, end: match.index + match[0].length });
      for (let i = 0; i + bits.length <= words.length; i++) {
        let same = true;
        for (let n = 0; n < bits.length; n++) if (words[i + n].key !== bits[n]) { same = false; break; }
        if (!same) continue;
        if (source.slice(words[i].end, words[i + bits.length - 1].start).indexOf("\n") < 0) return true;
      }
      return false;
    }
    const STRONG_PARTICLE = { up: 1, out: 1, off: 1, down: 1, away: 1, back: 1, over: 1, through: 1, into: 1, around: 1, along: 1, apart: 1, aside: 1, ahead: 1, together: 1 };
    const WEAK_PARTICLE = { on: 1, in: 1, for: 1, with: 1, after: 1 };
    const PHRASE_STOP = { a: 1, an: 1, the: 1, of: 1, to: 1, and: 1, or: 1, at: 1, by: 1, from: 1, as: 1, is: 1, are: 1, was: 1, were: 1, be: 1, been: 1, am: 1, do: 1, does: 1, did: 1, it: 1, its: 1, this: 1, that: 1, i: 1, you: 1, he: 1, she: 1, we: 1, they: 1, my: 1, your: 1, his: 1, her: 1, our: 1, their: 1, me: 1, him: 1, them: 1, not: 1, no: 1, so: 1, if: 1, but: 1 };
    const REFLEXIVE = { myself: 1, yourself: 1, himself: 1, herself: 1, itself: 1, ourselves: 1, yourselves: 1, themselves: 1, oneself: 1 };
    const PERSON = { me: 1, you: 1, him: 1, her: 1, us: 1, them: 1, someone: 1, somebody: 1, it: 1 };
    const OWN_DET = { my: 1, your: 1, his: 1, her: 1, its: 1, our: 1, their: 1, "one's": 1 };
    function lyricTokens(text) {
      return (String(text || "").match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || []).map((word) => word.toLowerCase().replace(/’/g, "'"));
    }
    function lemmaVerb(word) {
      const map = {
        thinking: "think", thought: "think", thinks: "think",
        saying: "say", says: "say", said: "say",
        showed: "show", shown: "show", shows: "show", showing: "show",
        woke: "wake", woken: "wake", wakes: "wake", waking: "wake",
        stopped: "stop", stops: "stop", stopping: "stop",
        got: "get", getting: "get", gets: "get",
        went: "go", going: "go", goes: "go", gone: "go",
        came: "come", coming: "come", comes: "come",
        took: "take", taken: "take", takes: "take", taking: "take",
        made: "make", makes: "make", making: "make",
        gave: "give", given: "give", gives: "give", giving: "give",
        told: "tell", tells: "tell", telling: "tell",
        felt: "feel", feels: "feel", feeling: "feel",
        kept: "keep", keeps: "keep", keeping: "keep",
        left: "leave", leaves: "leave", leaving: "leave",
        found: "find", finds: "find", finding: "find",
        brought: "bring", brings: "bring", bringing: "bring",
        sat: "sit", sits: "sit", sitting: "sit",
        ran: "run", runs: "run", running: "run",
        sang: "sing", sung: "sing", sings: "sing", singing: "sing",
        spoke: "speak", spoken: "speak", speaks: "speak", speaking: "speak",
        wrote: "write", written: "write", writes: "write", writing: "write",
        knew: "know", knows: "know", knowing: "know", known: "know",
        saw: "see", seen: "see", sees: "see", seeing: "see",
        had: "have", has: "have", having: "have",
        did: "do", does: "do", doing: "do", done: "do"
      };
      if (map[word]) return map[word];
      let stem = word;
      if (word.length > 5 && word.endsWith("ing")) stem = word.slice(0, -3);
      else if (word.length > 4 && word.endsWith("ed")) stem = word.slice(0, -2);
      else if (word.length > 4 && word.endsWith("es")) stem = word.slice(0, -2);
      else if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) stem = word.slice(0, -1);
      if (stem.length >= 4 && stem.charAt(stem.length - 1) === stem.charAt(stem.length - 2)) stem = stem.slice(0, -1);
      return stem || word;
    }
    function lyricPhraseCandidates(text, extra) {
      const tokens = lyricTokens(text);
      const known = cardIndex();
      const seen = {};
      const buckets = { found: [], set: [], strong: [], idiom: [], weak: [] };
      function add(key, bucket) {
        const bits = String(key || "").toLowerCase().replace(/’/g, "'").replace(/[^a-z'\s-]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
        const limit = bucket === "set" || bucket === "found" ? 10 : 6;
        if (bits.length < 2 || bits.length > limit) return;
        const id = bits.join(" ");
        if (seen[id] || known.has(id) || !spanOnOneLine(text, bits)) return;
        seen[id] = true;
        buckets[bucket].push(id);
      }
      (extra || []).forEach((key) => add(key, "found"));
      for (let i = 0; i < tokens.length; i++) {
        const here = tokens[i];
        if (tokens[i + 1] === "to" && REFLEXIVE[tokens[i + 2]] && here && !PHRASE_STOP[here]) add(tokens.slice(i, i + 3).join(" "), "set");
        if (/^show(s|ed|n|ing)?$/.test(here || "") && PERSON[tokens[i + 1]] && tokens[i + 2] === "the" && tokens[i + 3] === "way") add(tokens.slice(i, i + 4).join(" "), "set");
        if (here === "in" && tokens[i + 1] === "the" && tokens[i + 2] === "middle" && tokens[i + 3] === "of" && tokens[i + 4] === "the" && (tokens[i + 5] === "night" || tokens[i + 5] === "day")) add(tokens.slice(i, i + 6).join(" "), "set");
        if (here === "of" && OWN_DET[tokens[i + 1]] && tokens[i + 2] === "own" && tokens[i + 3] && !PHRASE_STOP[tokens[i + 3]]) add(tokens.slice(i, i + 4).join(" "), "set");
        if (tokens[i + 1] === "for" && tokens[i + 2] === "the" && (tokens[i + 3] === "night" || tokens[i + 3] === "day") && here && !PHRASE_STOP[here]) add(tokens.slice(i, i + 4).join(" "), "set");
        if (/^(wake|wakes|woke|woken|waking)$/.test(here || "") && PERSON[tokens[i + 1]] && tokens[i + 2] === "up") {
          let end = i + 3;
          if (tokens[i + 3] === "in" && tokens[i + 4] === "the" && tokens[i + 5] === "middle" && tokens[i + 6] === "of" && tokens[i + 7] === "the" && (tokens[i + 8] === "night" || tokens[i + 8] === "day")) end = i + 9;
          add(tokens.slice(i, end).join(" "), "set");
        }
        const next = tokens[i + 1];
        if (next && !PHRASE_STOP[here] && here.indexOf("'") < 0) {
          if (STRONG_PARTICLE[next]) add(here + " " + next, "strong");
          else if (WEAK_PARTICLE[next]) add(here + " " + next, "weak");
        }
        if (i + 2 < tokens.length && STRONG_PARTICLE[tokens[i + 2]] && (tokens[i + 1] === "it" || tokens[i + 1] === "them" || tokens[i + 1] === "him" || tokens[i + 1] === "her" || tokens[i + 1] === "me" || tokens[i + 1] === "you") && !PHRASE_STOP[here]) {
          add(here + " " + tokens[i + 1] + " " + tokens[i + 2], "strong");
        }
        for (let n = 3; n <= 5 && i + n <= tokens.length; n++) {
          const bits = tokens.slice(i, i + n);
          const glue = bits.some((word) => word === "the" || word === "a" || word === "an" || word === "of");
          const content = bits.filter((word) => !PHRASE_STOP[word] && !STRONG_PARTICLE[word] && !WEAK_PARTICLE[word]);
          if (glue && content.length >= 2) add(bits.join(" "), "idiom");
        }
      }
      buckets.set.sort((a, b) => b.split(" ").length - a.split(" ").length);
      return buckets.set.slice(0, 8).concat(buckets.found.slice(0, 4), buckets.strong.slice(0, 4), buckets.idiom.slice(0, 3), buckets.weak.slice(0, 1));
    }
    function phraseQueries(key) {
      const bits = String(key || "").split(" ");
      const queries = [];
      function push(query) {
        const text = String(query || "").replace(/\s+/g, " ").trim();
        if (text && queries.indexOf(text) < 0) queries.push(text);
      }
      if (bits.length === 3 && bits[1] === "to" && REFLEXIVE[bits[2]]) push(lemmaVerb(bits[0]) + " to oneself");
      if (bits.length === 4 && /^show/.test(bits[0]) && bits[2] === "the" && bits[3] === "way") {
        push("show someone the way");
        push("show the way");
      }
      if (bits[0] === "in" && bits[1] === "the" && bits[2] === "middle" && bits[3] === "of" && bits[4] === "the") push(bits.join(" "));
      if (bits.length === 4 && bits[0] === "of" && bits[2] === "own") {
        push("of one's own " + bits[3]);
        push("one's own " + bits[3]);
        if (bits[3] === "device" || bits[3] === "devices") push("leave someone to their own devices");
      }
      if (bits.length >= 4 && bits[bits.length - 3] === "for" && bits[bits.length - 2] === "the") push(lemmaVerb(bits[0]) + " for the " + bits[bits.length - 1]);
      if (/^wak/.test(bits[0] || "") && PERSON[bits[1]] && bits[2] === "up") {
        if (key.indexOf("middle of the night") >= 0) push("in the middle of the night");
        if (key.indexOf("middle of the day") >= 0) push("in the middle of the day");
        push("wake someone up");
        push("wake up");
      }
      if (bits.length === 3 && PERSON[bits[1]] && STRONG_PARTICLE[bits[2]]) {
        push(lemmaVerb(bits[0]) + " someone " + bits[2]);
        push(lemmaVerb(bits[0]) + " " + bits[2]);
      }
      push(key);
      return queries;
    }
    function lyricSurface(key, query) {
      if (query === key) return key;
      const keyBits = key.split(" ");
      const queryBits = query.split(" ");
      if (queryBits.length === 3 && queryBits[1] === "to" && queryBits[2] === "oneself" && keyBits.length === 3 && keyBits[1] === "to" && REFLEXIVE[keyBits[2]]) return key;
      if ((query === "show the way" || query === "show someone the way") && keyBits[keyBits.length - 2] === "the" && keyBits[keyBits.length - 1] === "way") return key;
      if (queryBits[0] === "of" && queryBits[1] === "one's" && queryBits[2] === "own" && keyBits[0] === "of" && keyBits[2] === "own" && keyBits[3] === queryBits[3]) return key;
      if ((query === "wake up" || query === "wake someone up") && /^wak/.test(keyBits[0] || "") && keyBits[2] === "up") return keyBits.slice(0, 3).join(" ");
      if ((query === "leave someone to their own devices" || query === "one's own devices" || query === "one's own device") && keyBits[0] === "of" && keyBits[2] === "own" && (keyBits[3] === "device" || keyBits[3] === "devices")) return key;
      if (queryBits.length === 2 && STRONG_PARTICLE[queryBits[1]] && keyBits.length === 3 && PERSON[keyBits[1]] && keyBits[2] === queryBits[1] && lemmaVerb(keyBits[0]) === queryBits[0]) return key;
      if (queryBits.length === 3 && queryBits[1] === "someone" && STRONG_PARTICLE[queryBits[2]] && keyBits.length === 3 && PERSON[keyBits[1]] && keyBits[2] === queryBits[2]) return key;
      if (queryBits.length >= 2 && (" " + key + " ").indexOf(" " + query + " ") >= 0) return query;
      if (bitsSameFrame(keyBits, queryBits)) return key;
      return "";
    }
    function bitsSameFrame(keyBits, queryBits) {
      if (keyBits.length !== queryBits.length || !keyBits.length) return false;
      if (keyBits[keyBits.length - 3] === "for" && queryBits[queryBits.length - 3] === "for" && keyBits[keyBits.length - 1] === queryBits[queryBits.length - 1]) return true;
      return false;
    }
    function isSetFrame(key) {
      const bits = String(key || "").split(" ");
      if (bits.length === 3 && bits[1] === "to" && REFLEXIVE[bits[2]]) return true;
      if (bits.length === 4 && /^show/.test(bits[0] || "") && PERSON[bits[1]] && bits[2] === "the" && bits[3] === "way") return true;
      if (bits[0] === "in" && bits[1] === "the" && bits[2] === "middle") return true;
      if (bits[0] === "of" && OWN_DET[bits[1]] && bits[2] === "own") return true;
      if (bits.length >= 4 && bits[bits.length - 3] === "for" && bits[bits.length - 2] === "the" && (bits[bits.length - 1] === "night" || bits[bits.length - 1] === "day")) return true;
      if (/^(wake|wakes|woke|woken|waking)$/.test(bits[0] || "") && PERSON[bits[1]] && bits[2] === "up") return true;
      return false;
    }
    function phraseDeck(data, key, framed) {
      if (!data || !data.found) return "";
      const head = String(data.word || "").trim().toLowerCase().replace(/’/g, "'").replace(/\s+/g, " ");
      if (head !== key) return "";
      const cam = data.cambridge || {};
      const poses = (cam.poses && cam.poses.length ? cam.poses : (cam.pos ? [cam.pos] : [])).map((item) => String(item).toLowerCase());
      const posBlob = poses.join(" ");
      const bits = key.split(/\s+/).filter((bit) => bit.length > 2);
      const clubUrl = String((data.englishClub && data.englishClub.url) || "").toLowerCase();
      const clubHit = !!((data.englishClub && (data.englishClub.meaning || (data.englishClub.examples || []).length)) && bits.length && bits.every((bit) => clubUrl.indexOf(bit) >= 0));
      const homeUrl = String((data.englishAtHome && data.englishAtHome.url) || "").toLowerCase();
      const homeHit = !!((data.englishAtHome && (data.englishAtHome.meaning || (data.englishAtHome.examples || []).length)) && bits.length && bits.every((bit) => homeUrl.indexOf(bit) >= 0));
      if (posBlob.indexOf("phrasal") >= 0) return "phrasal";
      if (posBlob.indexOf("idiom") >= 0 || clubHit || homeHit) return "idioms";
      const words = key.split(/\s+/);
      if (words.length === 2 && STRONG_PARTICLE[words[1]] && (posBlob.indexOf("verb") >= 0 || (!posBlob && data.wooordhunt && (data.wooordhunt.gloss || data.wooordhunt.verbGloss)))) return "phrasal";
      if (!framed || words.length < 2) return "";
      const gloss = data.ru || (cam && cam.definition) || (data.wooordhunt && (data.wooordhunt.gloss || data.wooordhunt.verbGloss)) || (data.englishClub && data.englishClub.meaning) || (data.englishAtHome && data.englishAtHome.meaning);
      if (!gloss) return "";
      if (STRONG_PARTICLE[words[words.length - 1]] || words.indexOf("up") >= 0) return "phrasal";
      return "music";
    }
    function phraseInside(key, longer) {
      const bits = key.split(" ");
      return longer.some((have) => {
        const whole = have.split(" ");
        if (bits.length >= whole.length) return false;
        for (let i = 0; i + bits.length <= whole.length; i++) {
          let same = true;
          for (let n = 0; n < bits.length; n++) if (whole[i + n] !== bits[n]) { same = false; break; }
          if (same) return true;
        }
        return false;
      });
    }
    function lyricLine(text, key) {
      const lines = String(text || "").split(/\n/);
      const escaped = String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("(^|[^A-Za-z])" + escaped + "([^A-Za-z]|$)", "i");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) return lines[i].trim();
      }
      return "";
    }
    function lookupLyricWord(word, context, waitMs, strict = false) {
      const wait = waitMs || 25000;
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      let timer = 0;
      const job = (async () => {
        try {
          let url = lookupBase() + "/lookup?word=" + encodeURIComponent(word);
          if (context) url += "&context=" + encodeURIComponent(context);
          const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
          const data = await res.json();
          if(res.status===404)return null;
          if(!res.ok)throw Object.assign(new Error(data.error||'Dictionary lookup failed.'),{status:res.status});
          if(!data.found)return null;
          return data;
        } catch (err) {
          if(strict)throw err;
          return null;
        }
      })();
      const limit = new Promise((resolve,reject) => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          if(strict)reject(new Error('Dictionary lookup timed out.'));else resolve(null);
        }, wait);
      });
      return Promise.race([job, limit]).finally(() => {
        clearTimeout(timer);
      });
    }
    async function readLyrics(existingId) {
      const editing = existingId ? loadSongs().find((item) => item.id === existingId) : null;
      const title = editing ? editing.title : document.getElementById("lyricTitle").value.trim();
      const artist = editing ? editing.artist : document.getElementById("lyricArtist").value.trim();
      const videoUrl = editing ? (editing.videoUrl || "") : document.getElementById("lyricVideo").value.trim();
      const musicUrl = editing ? (editing.musicUrl || "") : document.getElementById("lyricMusic").value.trim();
      const source = editing ? document.querySelector("#songUser [data-lyric-draft]") : document.getElementById("lyricText");
      const lyrics = source ? source.value.replace(/\r\n/g, "\n") : "";
      const status = editing ? document.querySelector("#songUser [data-lyric-edit-status]") : document.getElementById("lyricStatus");
      const button = editing ? document.querySelector("#songUser [data-lyric-recheck]") : document.getElementById("lyricGo");
      const write = (text, bad) => {
        status.textContent = text;
        status.classList.toggle("bad", !!bad);
      };
      if (!title) { write("Write the song title.", true); return; }
      if (!String(lyrics).trim()) { write("Paste the lyrics.", true); return; }
      const keys = lyricKeys(lyrics);
      if (!keys.length) { write("No words to read.", true); return; }
      const known = cardIndex();
      const marks = {};
      const todo = [];
      keys.forEach((key) => {
        if (known.has(key)) marks[key] = { state: "have" };
        else todo.push(key);
      });
      button.disabled = true;
      let failed = false;
      const harvested = [];
      const lyricCards = [];
      try {
        let cursor = 0;
        let done = 0;
        write(todo.length ? "Looking up " + todo.length + " new words…" : "Every word already has a card.", false);
        async function worker() {
          while (cursor < todo.length) {
            const key = todo[cursor++];
            try {
              const data = await lookupLyricWord(key, lyricLine(lyrics, key));
              if (!data) marks[key] = { state: "miss" };
              else {
                rememberLyricCard(data, "music", "", lyricCards);
                marks[key] = { state: "new", word: data.word };
                ((data.wooordhunt && data.wooordhunt.phrases) || []).forEach((phrase) => {
                  const en = String(phrase.en || "").trim();
                  if (en.indexOf(" ") > 0) harvested.push(en);
                });
              }
            } catch (err) {
              failed = true;
              marks[key] = { state: "error" };
            }
            done += 1;
            write("Checked " + done + " of " + todo.length + " new words…", false);
          }
        }
        if (todo.length) await Promise.all(Array.from({ length: Math.min(3, todo.length) }, worker));
        const song = {
          id: editing ? editing.id : (pendingLyricId || Date.now().toString(36)),
          title: title,
          artist: artist,
          url: editing ? (editing.url || "") : "",
          videoUrl: videoUrl,
          musicUrl: musicUrl,
          fileName: editing ? (editing.fileName || "") : (pendingLyricFile ? pendingLyricFile.name : ""),
          fileType: editing ? (editing.fileType || "") : (pendingLyricFile ? (pendingLyricFile.type || "") : ""),
          lyrics: lyrics,
          marks: marks,
          archived: editing ? !!editing.archived : false
        };
        let fileFailed = false;
        if (!editing && pendingLyricFile) {
          try {
            if (!viewAccount) await idbPutFile(song.id, pendingLyricFile);
            if (!lyricFileSent) await uploadSongFile(song.id, pendingLyricFile, pendingLyricFile.type || "", (ratio) => paintLyricRing(ratio, "Uploading…"), lyricUpload);
          }
          catch (err) {
            fileFailed = true;
            song.fileName = "";
            song.fileType = "";
          }
        }
        write("Saving the song…", false);
        const created = storeLyricSong(song, lyricCards);
        if (created) trackEvent("song", "lyrics", "add");
        paintLyrics();
        if (!editing) {
          document.getElementById("lyricTitle").value = "";
          document.getElementById("lyricArtist").value = "";
          document.getElementById("lyricVideo").value = "";
          document.getElementById("lyricMusic").value = "";
          document.getElementById("lyricText").value = "";
          pendingLyricFile = null;
          pendingLyricId = "";
          lyricFileSent = false;
          paintLyricRing(null);
          revokePreviewUrl();
          refreshLyricPreview();
          openLyricSong(song.id);
        } else renderUserSong(song);
        let phrases = [];
        const kept = [];
        let serverPhrases = null;
        const showCheck = (text, bad) => {
          write(text, bad);
          const open = document.getElementById("songUser");
          if (!open || open.dataset.songId !== song.id) return;
          const note = open.querySelector("[data-lyric-check]");
          if (!note) return;
          note.textContent = text;
          note.classList.toggle("bad", !!bad);
        };
        try {
          const analyzed = await accountFetch("/api/analyze", {
            method: "POST",
            body: JSON.stringify({ text: lyrics, contentType: "LYRICS" })
          });
          if (analyzed && Array.isArray(analyzed.expressions)) serverPhrases = analyzed.expressions;
        } catch (err) {
          serverPhrases = null;
        }
        if (serverPhrases) {
          if (!serverPhrases.length) showCheck(statsLine(songStat(keys, marks)), false);
          for (let i = 0; i < serverPhrases.length; i++) {
            const expr = serverPhrases[i];
            const head = expressionHead(expr.canonicalForm) || expr.exactText || "";
            const key = head.trim().toLowerCase();
            if (!key) continue;
            if (phraseInside(key, kept) || cardIndex().has(key)) {
              if (cardIndex().has(key)) marks[key] = marks[key] || { state: "have" };
              continue;
            }
            showCheck("Looking up phrase " + (i + 1) + " of " + serverPhrases.length + "…", false);
            try {
              const built = await accountFetch("/api/phrase-card", {
                method: "POST",
                body: JSON.stringify({
                  exactText: expr.exactText,
                  canonicalForm: expr.canonicalForm,
                  type: expr.type,
                  meaning: expr.meaning,
                  context: expr.context,
                  source: "song"
                })
              });
              const card = built && built.card;
              if (!card || !card.word) continue;
              const surface = String(card.word).trim();
              const savedKey = surface.toLowerCase();
              if (phraseInside(savedKey, kept) || cardIndex().has(savedKey)) continue;
              const payload = Object.assign({}, card.data || {}, {
                word: surface,
                ru: card.ru || "",
                expressionKey: card.expressionKey,
                expressionType: card.expressionType
              });
              const added = rememberLyricCard(payload, card.place || "mine", title, lyricCards);
              if (added || cardIndex().has(savedKey)) {
                marks[savedKey] = { state: added ? "new" : "have", word: surface, deck: card.place || "mine" };
                kept.push(savedKey);
              }
            } catch (err) {
              failed = true;
            }
          }
        }
        if (!serverPhrases) {
          try { phrases = lyricPhraseCandidates(lyrics, harvested); }
          catch (err) { phrases = []; }
        }
        if (!serverPhrases && !phrases.length) showCheck(statsLine(songStat(keys, marks)), false);
        for (let i = 0; i < phrases.length; i++) {
          const key = phrases[i];
          if (phraseInside(key, kept) || cardIndex().has(key)) {
            if (cardIndex().has(key)) marks[key] = marks[key] || { state: "have" };
            continue;
          }
          showCheck("Looking up phrase " + (i + 1) + " of " + phrases.length + "…", false);
          try {
            const queries = phraseQueries(key);
            let data = null;
            let deck = "";
            let surface = "";
            for (let q = 0; q < queries.length; q++) {
              const query = queries[q];
              const found = await lookupLyricWord(query, lyricLine(lyrics, key), 12000);
              const kind = phraseDeck(found, query, query !== key || isSetFrame(key));
              if (!kind) continue;
              surface = lyricSurface(key, query);
              if (!surface) continue;
              data = Object.assign({}, found, { word: surface });
              deck = kind;
              break;
            }
            if (!deck || !surface) continue;
            if (phraseInside(surface, kept) || cardIndex().has(surface)) {
              if (cardIndex().has(surface)) marks[surface] = marks[surface] || { state: "have" };
              continue;
            }
            const added = rememberLyricCard(data, deck, title, lyricCards);
            if (added || cardIndex().has(surface)) {
              marks[surface] = { state: added ? "new" : "have", word: data.word, deck: deck };
              kept.push(surface);
            }
          } catch (err) {
            failed = true;
          }
        }
        storeLyricSong(song, lyricCards);
        paintAdded();
        paintLyrics();
        const open = document.getElementById("songUser");
        if (open && open.dataset.songId === song.id) renderUserSong(song);
        let note = failed ? "The dictionary lookup stopped before every word was checked." : statsLine(songStat(keys.concat(kept), marks));
        if (fileFailed) note = "The file could not be saved. " + note;
        showCheck(note, fileFailed || failed);
      } catch (err) {
        write(err && err.message ? err.message : "The song could not be saved.", true);
      } finally {
        button.disabled = false;
      }
    }
    let pendingLyricFile = null;
    let pendingLyricUrl = "";
    let pendingEditFile = null;
    let pendingEditUrl = "";
    let editFileRemoved = false;
    function revokePreviewUrl() {
      if (!pendingLyricUrl) return;
      URL.revokeObjectURL(pendingLyricUrl);
      pendingLyricUrl = "";
    }
    function revokeEditPreviewUrl() {
      if (!pendingEditUrl) return;
      URL.revokeObjectURL(pendingEditUrl);
      pendingEditUrl = "";
    }
    function localFileHtml(file, url) {
      if (!file || !url) return "";
      return filePlayerHtml(url, file.type || "", file.name || "");
    }
    function refreshLyricPreview() {
      document.getElementById("lyricVideoPreview").innerHTML = videoHtml(document.getElementById("lyricVideo").value);
      document.getElementById("lyricMusicPreview").innerHTML = musicHtml(document.getElementById("lyricMusic").value);
      const name = document.getElementById("lyricFileName");
      name.textContent = pendingLyricFile ? pendingLyricFile.name : "";
      document.getElementById("lyricFilePreview").innerHTML = localFileHtml(pendingLyricFile, pendingLyricUrl);
      watchSongPlayers(document.getElementById("lyricForm"));
    }
    function refreshEditMedia() {
      const root = document.getElementById("songUser");
      if (!root) return;
      const video = root.querySelector("[data-lyric-video-preview]");
      const music = root.querySelector("[data-lyric-music-preview]");
      const name = root.querySelector("[data-lyric-file-name]");
      const fileBox = root.querySelector("[data-lyric-file-preview]");
      const videoInput = root.querySelector("[data-lyric-video]");
      const musicInput = root.querySelector("[data-lyric-music]");
      if (video && videoInput) video.innerHTML = videoHtml(videoInput.value);
      if (music && musicInput) music.innerHTML = musicHtml(musicInput.value);
      if (pendingEditFile) {
        if (name) name.textContent = pendingEditFile.name;
        if (fileBox) fileBox.innerHTML = localFileHtml(pendingEditFile, pendingEditUrl);
      } else if (editFileRemoved) {
        if (name) name.textContent = "";
        if (fileBox) fileBox.innerHTML = "";
      }
      watchSongPlayers(root);
    }
    function paintEditRing(ratio, text) {
      const root = document.getElementById("songUser");
      if (!root) return;
      paintRing(root.querySelector("[data-lyric-file-progress]"), root.querySelector("[data-lyric-file-ring]"), root.querySelector("[data-lyric-file-progress-text]"), root.querySelector("[data-lyric-meta-save]"), ratio, text);
    }
    function paintLyricRing(ratio, text) {
      paintRing(document.getElementById("lyricFileProgress"), document.getElementById("lyricFileRing"), document.getElementById("lyricFileProgressText"), document.getElementById("lyricGo"), ratio, text);
    }
    function beginFileUpload(file, id, sentFlag, paint, holder, readyText) {
      holder.file = file;
      if (holder.xhr) holder.xhr.abort();
      if (!authUser || accountApi() || !id) {
        paint(null);
        return;
      }
      paint(0, "Uploading…");
      uploadSongFile(id, file, file.type || "", (ratio) => {
        if (holder.file === file) paint(ratio, "Uploading…");
      }, holder).then((ok) => {
        if (holder.file !== file) return;
        if (!ok) { paint(null); return; }
        sentFlag();
        paint(1, readyText);
      }).catch(() => {
        if (holder.file !== file) return;
        paint(null);
      });
    }
    function takeLyricFile(file) {
      if (!file) return;
      revokePreviewUrl();
      pendingLyricFile = file;
      pendingLyricUrl = URL.createObjectURL(file);
      lyricFileSent = false;
      if (!pendingLyricId) pendingLyricId = Date.now().toString(36);
      refreshLyricPreview();
      beginFileUpload(file, pendingLyricId, () => { lyricFileSent = true; }, paintLyricRing, lyricUpload, "Press Read the words.");
    }
    function bindFileDrop(form, onFile) {
      if (!form) return;
      form.addEventListener("dragover", (e) => {
        if (!e.dataTransfer) return;
        e.preventDefault();
        form.classList.add("over");
      });
      form.addEventListener("dragleave", (e) => {
        if (form.contains(e.relatedTarget)) return;
        form.classList.remove("over");
      });
      form.addEventListener("drop", (e) => {
        e.preventDefault();
        form.classList.remove("over");
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) onFile(file);
      });
    }
    document.getElementById("lyricVideo").addEventListener("input", refreshLyricPreview);
    document.getElementById("lyricMusic").addEventListener("input", refreshLyricPreview);
    document.getElementById("lyricFilePick").addEventListener("click", () => { document.getElementById("lyricFile").click(); });
    document.getElementById("lyricFile").addEventListener("change", () => {
      takeLyricFile(document.getElementById("lyricFile").files[0]);
      document.getElementById("lyricFile").value = "";
    });
    bindFileDrop(document.getElementById("lyricForm"), takeLyricFile);
    document.getElementById("lyricGo").addEventListener("click", () => { readLyrics(); });
    document.getElementById("lyricList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-lyric]");
      if (btn) openLyricSong(btn.dataset.lyric);
    });
    document.getElementById("songUser").addEventListener("click", (e) => {
      if (e.target.closest("[data-lyric-file-pick]")) {
        const input = document.querySelector("#songUser [data-lyric-file]");
        if (input) input.click();
        return;
      }
      if (e.target.closest("[data-lyric-file-clear]")) {
        pendingEditFile = null;
        editFileSent = false;
        editUpload.file = null;
        if (editUpload.xhr) editUpload.xhr.abort();
        paintEditRing(null);
        revokeEditPreviewUrl();
        editFileRemoved = true;
        refreshEditMedia();
        return;
      }
      const smaller = e.target.closest("[data-lyric-size]");
      if (smaller) {
        lyricSize = Math.min(40, Math.max(14, lyricSize + Number(smaller.dataset.lyricSize) * 2));
        localStorage.setItem("enquiz-lyric-size", String(lyricSize));
        if (!viewAccount) syncChange({ op: "put-setting", key: "lyricSize", value: lyricSize });
        applyLyricSize(document.getElementById("songUser"));
        return;
      }
      if (e.target.closest("[data-lyric-meta]")) {
        const editor = document.querySelector("#songUser [data-lyric-meta-editor]");
        if (editor) editor.hidden = !editor.hidden;
        return;
      }
      if (e.target.closest("[data-lyric-meta-save]")) {
        saveSongMeta();
        return;
      }
      if (e.target.closest("[data-lyric-edit]")) {
        const editor = document.querySelector("#songUser [data-lyric-editor]");
        if (editor) editor.hidden = !editor.hidden;
        return;
      }
      if (e.target.closest("[data-lyric-archive]")) {
        const id = document.getElementById("songUser").dataset.songId;
        const list = loadSongs();
        const song = list.find((item) => item.id === id);
        if (!song) return;
        const wasArchived = !!song.archived;
        song.archived = true;
        saveSongs(list, song);
        if (!wasArchived) trackEvent("song", "lyrics", "archive");
        paintLyrics();
        goBack("music");
        return;
      }
      if (e.target.closest("[data-lyric-recheck]")) {
        const id = document.getElementById("songUser").dataset.songId;
        if (id) readLyrics(id);
      }
    });
    function takeEditFile(file) {
      if (!file) return;
      revokeEditPreviewUrl();
      pendingEditFile = file;
      pendingEditUrl = URL.createObjectURL(file);
      editFileRemoved = false;
      editFileSent = false;
      const editor = document.querySelector("#songUser [data-lyric-meta-editor]");
      if (editor) editor.hidden = false;
      refreshEditMedia();
      const id = (document.getElementById("songUser") || {}).dataset.songId || "";
      beginFileUpload(file, id, () => { editFileSent = true; }, paintEditRing, editUpload, "Press Save.");
    }
    const songBox = document.getElementById("songUser");
    songBox.addEventListener("input", (e) => {
      if (e.target.closest("[data-lyric-video], [data-lyric-music]")) refreshEditMedia();
    });
    songBox.addEventListener("change", (e) => {
      const input = e.target.closest("[data-lyric-file]");
      if (!input) return;
      takeEditFile(input.files && input.files[0]);
      input.value = "";
    });
    songBox.addEventListener("dragover", (e) => {
      e.preventDefault();
      const zone = songBox.querySelector("[data-lyric-drop]");
      if (zone) zone.classList.add("over");
    });
    songBox.addEventListener("dragleave", (e) => {
      const zone = songBox.querySelector("[data-lyric-drop]");
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("over");
    });
    songBox.addEventListener("drop", (e) => {
      e.preventDefault();
      const zone = songBox.querySelector("[data-lyric-drop]");
      if (zone) zone.classList.remove("over");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) takeEditFile(file);
    });
    document.getElementById("songUser").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-lyric-open]");
      if (!btn) return;
      document.querySelectorAll("#songUser [data-lyric-return]").forEach((el) => {
        el.classList.remove("lyric-return");
        el.removeAttribute("data-lyric-return");
      });
      btn.setAttribute("data-lyric-return", "1");
      btn.classList.add("lyric-return");
      const key = btn.dataset.lyricOpen;
      const known = cardForLyric(key);
      if (!known) { openUsages(key, ""); return; }
      if (known.kind === "verb") { openVerbCard(known.en); return; }
      if (known.kind === "lesson") {
        const word = words.find((item) => item.en.toLowerCase() === known.en.toLowerCase());
        if (word) { renderWord(word); visit("word"); }
      } else if (known.kind === "song") {
        renderSong(known.key);
        visit("musicword");
      } else if (known.kind === "phrasal" || known.kind === "idioms") {
        const bank = known.kind === "phrasal" ? phrasalWords : idiomWords;
        const word = bank.find((item) => String(item.en).toLowerCase() === known.en.toLowerCase());
        if (word) { renderWord(word); visit("word"); return; }
        const item = loadAdded().find((row) => String(row.word).toLowerCase() === known.en.toLowerCase() && row.place === known.kind);
        if (item) { renderMade(item); visit("made"); return; }
        openUsages(known.en, "");
      } else if (known.kind === "deck") visit("flip");
      else if (known.kind === "added") {
        const item = loadAdded().find((row) => String(row.word).toLowerCase() === known.en.toLowerCase());
        if (item) { renderMade(item); visit("made"); }
        else openUsages(known.en, "");
      }
    });
    paintLyrics();
    paintVerbs();
