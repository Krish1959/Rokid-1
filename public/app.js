const chatWindow = document.getElementById('chatWindow');
const chatForm = document.getElementById('chatForm');
const textInput = document.getElementById('textInput');
const imageInput = document.getElementById('imageInput');
const previewRow = document.getElementById('previewRow');
const sendBtn = document.getElementById('sendBtn');
const reportBtn = document.getElementById('reportBtn');

let sessionId = localStorage.getItem('inspectbot_session_id');
let pendingFiles = [];

function addBubble(role, text, imageUrls = []) {
  const b = document.createElement('div');
  b.className = `bubble ${role === 'user' ? 'user' : 'bot'}`;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = role === 'user' ? 'Inspector' : 'InspectBot';
  b.appendChild(meta);
  const textNode = document.createElement('div');
  textNode.textContent = text;
  b.appendChild(textNode);
  imageUrls.forEach((url) => {
    const img = document.createElement('img');
    img.className = 'evidence';
    img.src = url;
    b.appendChild(img);
  });
  chatWindow.appendChild(b);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return b;
}

function showTyping() {
  const t = document.createElement('div');
  t.className = 'typing';
  t.id = 'typingIndicator';
  t.textContent = 'InspectBot is typing…';
  chatWindow.appendChild(t);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
function hideTyping() {
  const t = document.getElementById('typingIndicator');
  if (t) t.remove();
}

async function initSession() {
  if (!sessionId) {
    const resp = await fetch('/api/session', { method: 'POST' });
    const data = await resp.json();
    sessionId = data.sessionId;
    localStorage.setItem('inspectbot_session_id', sessionId);
  }
  // Kick off the inspection with an empty "begin" signal
  showTyping();
  try {
    const resp = await fetch('/api/message', {
      method: 'POST',
      body: buildFormData('Begin the inspection.', []),
    });
    const data = await resp.json();
    hideTyping();
    if (data.reply) addBubble('bot', data.reply);
  } catch (e) {
    hideTyping();
    addBubble('bot', 'Could not reach the server. Is ANTHROPIC_API_KEY set?');
  }
}

function buildFormData(text, files) {
  const fd = new FormData();
  fd.append('sessionId', sessionId);
  fd.append('text', text || '');
  files.forEach((f) => fd.append('images', f));
  return fd;
}

function renderPreviews() {
  previewRow.innerHTML = '';
  pendingFiles.forEach((file, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    const rm = document.createElement('button');
    rm.className = 'rm';
    rm.textContent = '✕';
    rm.onclick = () => {
      pendingFiles.splice(idx, 1);
      renderPreviews();
    };
    thumb.appendChild(img);
    thumb.appendChild(rm);
    previewRow.appendChild(thumb);
  });
}

imageInput.addEventListener('change', () => {
  pendingFiles = pendingFiles.concat(Array.from(imageInput.files));
  imageInput.value = '';
  renderPreviews();
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  const files = pendingFiles.slice();
  if (!text && files.length === 0) return;

  const localImageUrls = files.map((f) => URL.createObjectURL(f));
  addBubble('user', text, localImageUrls);

  textInput.value = '';
  pendingFiles = [];
  renderPreviews();
  sendBtn.disabled = true;
  showTyping();

  try {
    const resp = await fetch('/api/message', {
      method: 'POST',
      body: buildFormData(text, files),
    });
    const data = await resp.json();
    hideTyping();
    if (data.error) {
      addBubble('bot', `⚠ ${data.error}`);
    } else {
      addBubble('bot', data.reply);
    }
  } catch (err) {
    hideTyping();
    addBubble('bot', '⚠ Network error — please try again.');
  } finally {
    sendBtn.disabled = false;
  }
});

reportBtn.addEventListener('click', () => {
  if (!sessionId) return;
  window.open(`/api/report/${sessionId}`, '_blank');
});

initSession();
