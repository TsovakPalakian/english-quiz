import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';

const chatHtml = fs.readFileSync('production/chat.html', 'utf8');
const chatJs = fs.readFileSync('production/chat.js', 'utf8');

function createChatEnvironment({
  initialUser = { id: 101, login: 'alice', name: 'Alice', role: 'USER' },
  initialRoomId = 'room-101',
  initialMessages = [
    {
      id: 501,
      senderId: 101,
      sender: 'Alice',
      text: 'Welcome to our platform class!',
      category: 'personal',
      createdMs: Date.now() - 60000,
      canEdit: true
    },
    {
      id: 502,
      senderId: 202,
      sender: 'Bob',
      text: 'Thanks! Let us practice English conversation.',
      category: 'personal',
      createdMs: Date.now() - 30000,
      canEdit: false
    }
  ]
} = {}) {
  const win = new Window({ url: 'https://preview.invalid/messages' });
  const doc = win.document;
  doc.body.innerHTML = chatHtml;
  doc.getElementById('messages').classList.add('on');

  win.authUser = initialUser;
  win.lucide = { createIcons: () => {} };
  win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  win.cancelAnimationFrame = () => {};

  const state = {
    messages: [...initialMessages],
    room: {
      id: initialRoomId,
      title: 'Study Room',
      kind: 'group',
      has: { personal: true },
      unread: { personal: 0, learning: 0 },
      pins: []
    },
    sentRequests: [],
    ws: null
  };

  class MockWebSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.sent = [];
      state.ws = this;
    }
    send(raw) {
      const parsed = JSON.parse(raw);
      state.sentRequests.push(parsed);

      process.nextTick(() => {
        const action = parsed.action;
        const body = parsed.body || {};

        if (action === 'history') {
            this.onmessage({
              data: JSON.stringify({
                type: 'response',
                requestId: parsed.requestId,
                result: {
                  messages: state.messages,
                  room: state.room,
                  more: false
                }
              })
            });
          } else if (action === 'profiles') {
            this.onmessage({
              data: JSON.stringify({
                type: 'response',
                requestId: parsed.requestId,
                result: { profiles: {} }
              })
            });
          } else if (action === 'pin') {
            const targetId = Number(body.id);
            const isPinned = !!body.pinned;
            const targetMsg = state.messages.find((m) => m.id === targetId);

            if (isPinned && targetMsg) {
              if (!state.room.pins.some((p) => p.id === targetId)) {
                state.room.pins.push({ id: targetMsg.id, text: targetMsg.text, category: targetMsg.category });
              }
            } else {
              state.room.pins = state.room.pins.filter((p) => p.id !== targetId);
            }

            this.onmessage({
              data: JSON.stringify({
                type: 'response',
                requestId: parsed.requestId,
                result: { room: state.room }
              })
            });
          } else if (action === 'send') {
            const newId = 600 + state.messages.length;
            const newMsg = {
              id: newId,
              senderId: initialUser.id,
              sender: initialUser.name,
              text: body.text,
              category: body.category || 'personal',
              replyTo: body.replyTo || null,
              quote: body.quote || null,
              createdMs: Date.now(),
              canEdit: true
            };
            state.messages.push(newMsg);

            this.onmessage({
              data: JSON.stringify({
                type: 'response',
                requestId: parsed.requestId,
                result: { message: newMsg, room: state.room }
              })
            });
          } else if (action === 'edit') {
            const targetId = Number(body.id);
            const targetMsg = state.messages.find((m) => m.id === targetId);
            if (targetMsg) {
              targetMsg.text = body.text;
              targetMsg.editedMs = Date.now();
            }

            this.onmessage({
              data: JSON.stringify({
                type: 'response',
                requestId: parsed.requestId,
                result: { message: targetMsg, room: state.room }
              })
            });
          } else if (action === 'delete') {
            const targetId = Number(body.id);
            const targetMsg = state.messages.find((m) => m.id === targetId);
            if (targetMsg) {
              targetMsg.deleted = true;
              targetMsg.text = 'Message deleted';
            }

            this.onmessage({
              data: JSON.stringify({
                type: 'response',
                requestId: parsed.requestId,
                result: { id: targetId, roomId: body.roomId }
              })
            });
          } else {
            // Acknowledge read/delivered and auxiliary requests to clear pending timeouts
            this.onmessage({
              data: JSON.stringify({
                type: 'response',
                requestId: parsed.requestId,
                result: {}
              })
            });
          }
        });
      }
    close() {}
  }

  win.WebSocket = MockWebSocket;

  vm.createContext(win);
  vm.runInContext(chatJs, win);

  // Initialize chat session
  const openBtn = doc.createElement('button');
  openBtn.setAttribute('data-msg-open', '');
  doc.body.append(openBtn);
  openBtn.click();

  // Send initial snapshot
  state.ws.onmessage({
    data: JSON.stringify({
      type: 'snapshot',
      data: {
        profile: { id: initialUser.id, name: initialUser.name, username: initialUser.login },
        profiles: { [initialUser.id]: { id: initialUser.id, name: initialUser.name } },
        rooms: [state.room],
        contacts: [],
        groups: [],
        folders: [],
        unread: { personal: 0, learning: 0 },
        seq: 1
      }
    })
  });

  return { win, doc, state };
}

async function waitForTicks(count = 3) {
  for (let i = 0; i < count; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('Chat initializes conversation room and loads message timeline without errors', async () => {
  const { doc } = createChatEnvironment();

  // Click room to open
  const roomNode = doc.querySelector('[data-msg-room="room-101"]');
  assert.ok(roomNode, 'Conversation room must be rendered in room list');
  roomNode.click();

  await waitForTicks(5);

  const timeline = doc.getElementById('msgTimeline');
  const messages = timeline.querySelectorAll('.msg-message');
  assert.equal(messages.length, 2, 'Timeline must display 2 seeded messages');
  assert.equal(messages[0].dataset.msgId, '501');
  assert.equal(messages[1].dataset.msgId, '502');
  assert.equal(messages[0].classList.contains('is-own'), true);
  assert.equal(messages[1].classList.contains('is-own'), false);
});

test('Pinning and unpinning messages updates pinned bar and dispatches WebSocket requests', async () => {
  const { doc, state } = createChatEnvironment();

  // Open conversation
  doc.querySelector('[data-msg-room="room-101"]').click();
  await waitForTicks(5);

  const pinnedBar = doc.getElementById('msgPinned');
  assert.equal(pinnedBar.hidden, true, 'Pinned banner must be hidden when room has no pins');

  // Trigger pin on message 501
  const pinMsgNode = doc.querySelector('[data-msg-id="501"]');
  assert.ok(pinMsgNode, 'Message 501 must be present in timeline');

  // Simulate context action pin via msgMenu trigger
  const menuTrigger = doc.createElement('button');
  menuTrigger.dataset.msgMenu = '501';
  doc.body.append(menuTrigger);
  menuTrigger.click();

  const contextMenu = doc.getElementById('msgContext');
  assert.ok(contextMenu, 'Context menu must exist');
  const pinOption = contextMenu.querySelector('[data-context-action="pin"]');
  assert.ok(pinOption, 'Pin action must be present in context menu');
  pinOption.click();

  await waitForTicks(5);

  // Verify pin request sent to server
  const pinReq = state.sentRequests.find((r) => r.action === 'pin');
  assert.ok(pinReq, 'WebSocket pin request must be dispatched');
  assert.equal(pinReq.body.id, 501);
  assert.equal(pinReq.body.pinned, true);

  // Verify pinned bar rendered in room
  assert.equal(pinnedBar.hidden, false, 'Pinned bar must become visible after pinning');
  assert.ok(pinnedBar.innerHTML.includes('Welcome to our platform class!'), 'Pinned text must appear in pinned banner');

  // Unpin via data-msg-unpin click
  const unpinBtn = doc.createElement('button');
  unpinBtn.dataset.msgUnpin = '501';
  doc.body.append(unpinBtn);
  unpinBtn.click();

  await waitForTicks(5);

  const unpinReq = state.sentRequests.filter((r) => r.action === 'pin').at(-1);
  assert.equal(unpinReq.body.id, 501);
  assert.equal(unpinReq.body.pinned, false);
});

test('Quoting messages mounts reply draft and delivers quote metadata with outgoing message', async () => {
  const { doc, state } = createChatEnvironment();

  doc.querySelector('[data-msg-room="room-101"]').click();
  await waitForTicks(5);

  // Click quote button directly on message reply action
  const replyTrigger = doc.createElement('button');
  replyTrigger.dataset.msgReply = '502';
  doc.body.append(replyTrigger);
  replyTrigger.click();

  const replyDraft = doc.getElementById('msgReply');
  assert.equal(replyDraft.hidden, false, 'Reply preview container must be visible');
  assert.ok(replyDraft.textContent.includes('Bob'), 'Reply preview must cite author');

  // Type message text in composer and send
  const composer = doc.getElementById('msgText');
  composer.value = 'I agree, conversation practice is great!';

  const sendBtn = doc.getElementById('msgSend');
  sendBtn.click();

  await waitForTicks(5);

  const sendReq = state.sentRequests.find((r) => r.action === 'send');
  assert.ok(sendReq, 'Send request must be sent over WebSocket');
  assert.equal(sendReq.body.text, 'I agree, conversation practice is great!');
  assert.equal(sendReq.body.replyTo, 502);

  // Verify reply preview is cleared after sending
  assert.equal(replyDraft.hidden, true, 'Reply preview must be hidden after message is sent');
});

test('Message author permissions enforce canEdit guard preventing unauthorized edits', async () => {
  const { doc } = createChatEnvironment();

  doc.querySelector('[data-msg-room="room-101"]').click();
  await waitForTicks(5);

  // Author's own message (501): context menu shows Edit
  const ownMenuBtn = doc.createElement('button');
  ownMenuBtn.dataset.msgMenu = '501';
  doc.body.append(ownMenuBtn);
  ownMenuBtn.click();

  const contextMenu = doc.getElementById('msgContext');
  const ownEditAction = contextMenu.querySelector('[data-context-action="edit"]');
  assert.ok(ownEditAction, 'Author own message must have Edit action in context menu');

  // Peer's message (502): context menu must NOT have Edit
  const peerMenuBtn = doc.createElement('button');
  peerMenuBtn.dataset.msgMenu = '502';
  doc.body.append(peerMenuBtn);
  peerMenuBtn.click();

  const peerEditAction = contextMenu.querySelector('[data-context-action="edit"]');
  assert.equal(peerEditAction, null, 'Peer message must not display Edit option');
});

test('Realtime server deletion event replaces message content with deleted placeholder without page reload', async () => {
  const { doc, state } = createChatEnvironment();

  doc.querySelector('[data-msg-room="room-101"]').click();
  await waitForTicks(5);

  const timeline = doc.getElementById('msgTimeline');
  const messageNode = timeline.querySelector('[data-msg-id="501"]');
  assert.ok(messageNode, 'Message 501 must initially be rendered');
  assert.equal(messageNode.classList.contains('is-deleted'), false);

  // Server sends realtime message deletion event to peers
  state.ws.onmessage({
    data: JSON.stringify({
      type: 'event',
      seq: 2,
      event: {
        type: 'message',
        room: state.room,
        message: {
          id: 501,
          senderId: 101,
          sender: 'Alice',
          text: 'Message deleted',
          deleted: true,
          category: 'personal',
          createdMs: Date.now() - 60000
        }
      }
    })
  });

  await waitForTicks(5);

  // Verify DOM updated in-place without page reload
  assert.equal(messageNode.classList.contains('is-deleted'), true, 'Message container must gain is-deleted class');
  assert.ok(messageNode.textContent.includes('Message deleted'), 'Message body must display deletion notice');
});

test('Realtime incoming message event appends new message card seamlessly to active timeline', async () => {
  const { doc, state } = createChatEnvironment();

  doc.querySelector('[data-msg-room="room-101"]').click();
  await waitForTicks(5);

  const timeline = doc.getElementById('msgTimeline');
  assert.equal(timeline.querySelectorAll('.msg-message').length, 2);

  // Incoming realtime message from Bob
  state.ws.onmessage({
    data: JSON.stringify({
      type: 'event',
      seq: 3,
      event: {
        type: 'message',
        room: state.room,
        message: {
          id: 503,
          senderId: 202,
          sender: 'Bob',
          text: 'Here is the homework audio recording.',
          deleted: false,
          category: 'personal',
          createdMs: Date.now()
        }
      }
    })
  });

  await waitForTicks(5);

  // Verify third message rendered in timeline
  const updatedMessages = timeline.querySelectorAll('.msg-message');
  assert.equal(updatedMessages.length, 3, 'Timeline must seamlessly append new incoming message');
  assert.equal(updatedMessages[2].dataset.msgId, '503');
  assert.ok(updatedMessages[2].textContent.includes('Here is the homework audio recording.'));
});
