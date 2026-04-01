const socket = io();
let myId = null;
let latest = null;

socket.on('connect', () => {
  myId = socket.id;
});

const landing = document.getElementById('landing');
const game = document.getElementById('game');
const createForm = document.getElementById('createForm');
const joinForm = document.getElementById('joinForm');

const showCreate = document.getElementById('showCreate');
const showJoin = document.getElementById('showJoin');
showCreate.onclick = () => {
  createForm.classList.remove('hidden');
  joinForm.classList.add('hidden');
};
showJoin.onclick = () => {
  joinForm.classList.remove('hidden');
  createForm.classList.add('hidden');
};

createForm.onsubmit = (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(createForm));
  socket.emit('room:create', data);
};

joinForm.onsubmit = (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(joinForm));
  socket.emit('room:join', data);
};

socket.on('action:error', (msg) => alert(msg));
socket.on('state:update', (state) => {
  latest = state;
  landing.classList.add('hidden');
  game.classList.remove('hidden');
  render(state);
});

function render(state) {
  const me = state.players.find((p) => p.id === myId);
  const meName = me?.name || 'You';

  document.getElementById('roomTitle').textContent = `${state.roomName} (${state.roomCode})`;
  document.getElementById('meta').textContent = `Mode: ${state.mode.toUpperCase()} | Word Source: ${state.wordSource.toUpperCase()} | You: ${meName}`;

  const parts = state.hangmanParts.length ? state.hangmanParts.join(', ') : 'none';
  document.getElementById('hangman').textContent = `Parts drawn: ${parts}\n${state.wrongCount}/${state.maxWrong}`;
  const wrongLetters = state.wrongLetters.map((x) => x.replace(/^word:/, '[word] ')).join(', ') || 'None';
  document.getElementById('wrongLetters').textContent = wrongLetters;
  document.getElementById('wordMask').textContent = state.revealedWord || '(Round not started)';
  document.getElementById('result').textContent = state.gameOver ? state.gameResult : '';

  const players = document.getElementById('players');
  players.innerHTML = '';
  state.players.forEach((p) => {
    const li = document.createElement('li');
    const tags = [];
    if (p.id === state.hostId) tags.push('Host');
    if (p.id === state.currentSetterId) tags.push('Word-setter');
    li.textContent = `${p.name}${tags.length ? ` (${tags.join(', ')})` : ''}`;
    players.appendChild(li);
  });

  const setterSelect = document.getElementById('setterSelect');
  setterSelect.innerHTML = '';
  state.players.forEach((p) => {
    const op = document.createElement('option');
    op.value = p.id;
    op.textContent = p.name;
    if (p.id === state.currentSetterId) op.selected = true;
    setterSelect.appendChild(op);
  });

  const isSetter = state.currentSetterId === myId;
  document.getElementById('hostControls').classList.toggle('hidden', !state.canChooseSetter);
  document.getElementById('setterControls').classList.toggle('hidden', !(isSetter && state.canSubmitWord && !state.isRoundActive));
  document.getElementById('hostMessageControls').classList.toggle('hidden', myId !== state.hostId);

  const guessControls = document.getElementById('guessControls');
  guessControls.classList.toggle('hidden', isSetter || !state.isRoundActive || state.gameOver);

  const messages = document.getElementById('messages');
  messages.innerHTML = '';
  state.messages.slice(-30).forEach((m) => {
    const row = document.createElement('div');
    row.textContent = m.system ? `[System] ${m.text}` : `[${m.by}] ${m.text}`;
    messages.appendChild(row);
  });
  messages.scrollTop = messages.scrollHeight;
}

document.getElementById('applySetter').onclick = () => {
  socket.emit('setter:select', { setterId: document.getElementById('setterSelect').value });
};

document.getElementById('startRound').onclick = () => socket.emit('round:start');
document.getElementById('submitWord').onclick = () => {
  socket.emit('word:submit', { word: document.getElementById('setterWord').value });
  document.getElementById('setterWord').value = '';
};

document.getElementById('guessLetter').onclick = () => {
  socket.emit('guess:letter', { letter: document.getElementById('letterGuess').value });
  document.getElementById('letterGuess').value = '';
};

document.getElementById('guessWord').onclick = () => {
  socket.emit('guess:word', { guess: document.getElementById('wordGuess').value });
  document.getElementById('wordGuess').value = '';
};

document.getElementById('sendBroadcast').onclick = () => {
  socket.emit('chat:broadcast', { text: document.getElementById('broadcastText').value });
  document.getElementById('broadcastText').value = '';
};
