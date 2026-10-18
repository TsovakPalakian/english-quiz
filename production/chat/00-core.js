(() => {
  'use strict';
  const section = document.getElementById('messages');
  if (!section) return;
  const el = (id) => document.getElementById(id),
    timeline = el('msgTimeline'),
    composer = el('msgText');
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const icon = (name) => '<i data-chat-icon="' + name + '"></i>';
  let iconFrame = 0;
  const icons = () => {
    if (!iconFrame)
      iconFrame = requestAnimationFrame(() => {
        iconFrame = 0;
        window.lucide?.createIcons({ nameAttr: 'data-chat-icon' });
        document.querySelectorAll('svg[data-chat-icon]').forEach((node) => node.removeAttribute('data-chat-icon'));
      });
  };
  const signedIn = () => (typeof authUser !== 'undefined' ? authUser : null);
  let databaseResetting = false;
  const current = () =>
    !databaseResetting && signedIn() && !(typeof viewAccount !== 'undefined' && viewAccount) ? signedIn() : null;
  const reviewer = () => ['ADMIN', 'DEVELOPER'].includes(current()?.role);
  const active = () => section.classList.contains('on');
  const initials = (name) =>
    String(name || '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .join('')
      .toUpperCase();
  const avatar = (name, group = false, subject = '') =>
    '<span class="chat-avatar"' +
    (subject
      ? ' data-avatar-subject="' +
        escape(subject) +
        '" data-avatar-name="' +
        escape(name) +
        '" data-avatar-group="' +
        group +
        '"'
      : '') +
    '>' +
    (group ? icon('users-round') : escape(initials(name))) +
    '</span>';
  let profileViews = Object.create(null),
    profileRequested = new Set(),
    profileFrame = 0,
    interactiveAccount = '';
  const dateLabel = (value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('.');
    const d = new Date(value);
    return [String(d.getDate()).padStart(2, '0'), String(d.getMonth() + 1).padStart(2, '0'), d.getFullYear()].join('.');
  };
  const birthdayIso = (value) => value.trim().split('.').reverse().join('-');
  const stamp = (ms) => {
    const date = new Date(ms);
    return (
      dateLabel(ms) +
      ' · ' +
      time(ms) +
      '.' +
      String(date.getSeconds()).padStart(2, '0') +
      '.' +
      String(date.getMilliseconds()).padStart(3, '0')
    );
  };
  const time = (ms) => {
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0');
  };
  const roomTime = (ms, now = Date.now()) => (dateLabel(ms) === dateLabel(now) ? time(ms) : dateLabel(ms));
  const roomPreview = (text) => {
    const words = String(text || '')
        .trim()
        .split(/\s+/),
      short = words.slice(0, 6).join(' '),
      chars = Array.from(short);
    return chars.length > 64 ? chars.slice(0, 64).join('') + '…' : short + (words.length > 6 ? '…' : '');
  };
  const folderUnread = (folder) =>
    data.rooms
      .filter((row) => folder.roomIds.includes(row.id) && !row.archived && !row.access?.blockedByMe)
      .reduce((sum, row) => sum + (row.unread?.personal || 0) + (row.unread?.learning || 0), 0);
  const roomTitle = (row) => {
    const role = row.kind === 'direct' ? row.peerRole || data.contacts.find((p) => p.id === row.peerId)?.role : '';
    return row.title + (['Student', 'Teacher', 'Support'].includes(role) ? ' · ' + role : '');
  };
  const emojiSegmenter =
    typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  function emojiParts(m) {
    if (!emojiSegmenter || m.deleted || m.files?.length || m.examId || m.forwarded || m.replyTo) return [];
    const parts = [...emojiSegmenter.segment(String(m.text || '').trim())]
      .map((p) => p.segment)
      .filter((p) => !/^\s+$/u.test(p));
    const emoji =
      /^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}[\uFE0E\uFE0F]?[\p{Emoji_Modifier}]?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F]?[\p{Emoji_Modifier}]?)*)$/u;
    return parts.length <= 48 && parts.every((p) => emoji.test(p)) ? parts : [];
  }
  let account = '',
    signature = '',
    generation = 0,
    socket = null,
    seq = 0,
    reconnectTimer,
    reconnectCount = 0,
    ready = false,
    room = '',
    kind = 'personal',
    rightMode = '',
    unreadOnly = false,
    examDirty = false,
    catalogVersion = 0;
  let examRefreshTimer,
    examRefreshing = false;
  function scheduleExamRefresh() {
    examDirty = true;
    clearTimeout(examRefreshTimer);
    const gen = generation;
    examRefreshTimer = setTimeout(async () => {
      if (gen !== generation || !current() || examRefreshing) return;
      examRefreshing = true;
      try {
        while (examDirty && gen === generation && current()) {
          examDirty = false;
          if (typeof examPulling !== 'undefined' && examPulling) await examFlight;
          if (gen !== generation || !current()) return;
          await examPull(true);
          if (gen !== generation || !current()) return;
          examResetWork();
          examPullWork();
        }
      } catch {
        if (gen === generation) examDirty = true;
      } finally {
        examRefreshing = false;
        if (gen !== generation && examDirty && current()) scheduleExamRefresh();
      }
    }, 150);
  }
  let data = { rooms: [], contacts: [], groups: [], unread: { personal: 0, learning: 0 }, total: 0 },
    prefs = {},
    reply = null,
    pending = null,
    files = [],
    format = null,
    busy = false,
    loading = 0,
    searchToken = 0,
    searchBefore = 0,
    searchTimer,
    readTimer,
    listMode = 'chats',
    emojiMode = '';
  let recorder = null,
    recordTimer,
    recordProgressTimer,
    recordMode = 'audio',
    recordGesture = null,
    recordUploading = false;
  let contextMessage = null,
    contextRoom = '',
    selection = new Set(),
    selecting = false;
  let chatListView = '',
    draggedPin = '';
  const mutedChat = (r) =>
    r?.archived ||
    r?.access?.blockedByMe ||
    (r?.muteUntil === undefined ? r?.muted : r.muteUntil === -1 || r.muteUntil > Date.now());
  let inputFrame = 0,
    inputBase = 0,
    uploadQueue = Promise.resolve(),
    dragDepth = 0,
    stickBottom = true;
  const uploads = new Map(),
    chatCenter = section.querySelector('.chat-center');
  const requests = new Map(),
    historyCache = new Map(),
    cursors = new Map(),
    membersCache = new Map(),
    previewCache = new Map();
