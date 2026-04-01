const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const EASY_PARTS = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'leftEye', 'rightEye', 'nose', 'mouth', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot'];
const HARD_PARTS = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

const WORD_BANK = {
  easy: ['javascript', 'ocean', 'sunshine', 'flower', 'holiday', 'puzzle', 'friendship', 'keyboard'],
  hard: ['asynchronous', 'cryptography', 'quizzical', 'juxtaposition', 'metamorphosis', 'rhythm', 'syzygy', 'xylophone']
};

const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));

function normalizeWord(input) {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

function maskWord(word, guessedLetters) {
  return word
    .split('')
    .map((ch) => {
      if (ch === ' ') return ' ';
      return guessedLetters.has(ch) ? ch : '_';
    })
    .join(' ');
}

function pickRandomWord(mode) {
  const list = WORD_BANK[mode] || WORD_BANK.easy;
  return list[Math.floor(Math.random() * list.length)];
}

function ensurePlayerTurn(room) {
  if (room.players.length === 0) {
    room.currentSetterId = null;
    return;
  }

  if (!room.players.some((p) => p.id === room.currentSetterId)) {
    room.setterIndex = 0;
    room.currentSetterId = room.players[0].id;
    return;
  }

  const currentIndex = room.players.findIndex((p) => p.id === room.currentSetterId);
  room.setterIndex = currentIndex;
}

function currentState(room, forSocketId) {
  const viewerIsSetter = room.currentSetterId === forSocketId;
  const viewerIsHost = room.hostId === forSocketId;
  const isRoundActive = !!room.currentWord;
  const parts = room.mode === 'easy' ? EASY_PARTS : HARD_PARTS;

  const revealedWord = !isRoundActive
    ? ''
    : viewerIsSetter
      ? room.currentWord
      : maskWord(room.currentWord, room.guessedLetters);

  return {
    roomName: room.roomName,
    roomCode: room.roomCode,
    mode: room.mode,
    wordSource: room.wordSource,
    hostId: room.hostId,
    players: room.players,
    currentSetterId: room.currentSetterId,
    canChooseSetter: viewerIsHost,
    canSubmitWord: viewerIsSetter && room.wordSource === 'host',
    isRoundActive,
    revealedWord,
    guessedLetters: [...room.guessedLetters],
    wrongLetters: [...room.wrongLetters],
    maxWrong: parts.length,
    wrongCount: room.wrongLetters.length,
    hangmanParts: parts.slice(0, room.wrongLetters.length),
    messages: room.messages,
    gameOver: room.gameOver,
    gameResult: room.gameResult
  };
}

function broadcastState(room) {
  room.players.forEach((player) => {
    io.to(player.id).emit('state:update', currentState(room, player.id));
  });
}

function endRound(room, resultMessage) {
  room.gameOver = true;
  room.gameResult = resultMessage;
  room.messages.push({
    system: true,
    text: resultMessage,
    at: Date.now()
  });
}

function advanceSetter(room) {
  if (room.players.length === 0) return;
  room.setterIndex = (room.setterIndex + 1) % room.players.length;
  room.currentSetterId = room.players[room.setterIndex].id;
}

function resetRound(room) {
  room.currentWord = '';
  room.guessedLetters = new Set();
  room.wrongLetters = [];
  room.gameOver = false;
  room.gameResult = '';
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ roomName, roomCode, mode, wordSource, playerName }) => {
    const safeCode = String(roomCode || '').trim().toUpperCase();
    if (!safeCode) {
      socket.emit('action:error', 'Room code is required.');
      return;
    }
    if (rooms.has(safeCode)) {
      socket.emit('action:error', 'Room code already in use.');
      return;
    }

    const room = {
      roomName: roomName || 'Online Hangman Room',
      roomCode: safeCode,
      mode: mode === 'hard' ? 'hard' : 'easy',
      wordSource: wordSource === 'host' ? 'host' : 'random',
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName || 'Host' }],
      setterIndex: 0,
      currentSetterId: socket.id,
      currentWord: '',
      guessedLetters: new Set(),
      wrongLetters: [],
      messages: [{ system: true, text: 'Room created. Start the round when ready.', at: Date.now() }],
      gameOver: false,
      gameResult: ''
    };

    rooms.set(safeCode, room);
    socket.join(safeCode);
    socket.data.roomCode = safeCode;
    broadcastState(room);
  });

  socket.on('room:join', ({ roomCode, playerName }) => {
    const safeCode = String(roomCode || '').trim().toUpperCase();
    const room = rooms.get(safeCode);
    if (!room) {
      socket.emit('action:error', 'Room not found.');
      return;
    }

    room.players.push({ id: socket.id, name: playerName || 'Player' });
    socket.join(safeCode);
    socket.data.roomCode = safeCode;
    ensurePlayerTurn(room);
    room.messages.push({ system: true, text: `${playerName || 'A player'} joined.`, at: Date.now() });
    broadcastState(room);
  });

  socket.on('round:start', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;

    resetRound(room);
    if (room.wordSource === 'random') {
      room.currentWord = pickRandomWord(room.mode);
      room.messages.push({ system: true, text: 'A new random word was selected.', at: Date.now() });
    } else {
      room.messages.push({ system: true, text: 'Waiting for the selected word-setter to submit a word.', at: Date.now() });
    }
    broadcastState(room);
  });

  socket.on('setter:select', ({ setterId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    const idx = room.players.findIndex((p) => p.id === setterId);
    if (idx < 0) return;
    room.setterIndex = idx;
    room.currentSetterId = setterId;
    room.messages.push({ system: true, text: `Host selected ${room.players[idx].name} as next word-setter.`, at: Date.now() });
    broadcastState(room);
  });

  socket.on('word:submit', ({ word }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.wordSource !== 'host') return;
    if (room.currentSetterId !== socket.id) return;
    const normalized = normalizeWord(String(word || ''));
    if (!normalized || !/^[a-z\s]+$/.test(normalized)) {
      socket.emit('action:error', 'Word must use letters and spaces only.');
      return;
    }
    room.currentWord = normalized;
    room.messages.push({ system: true, text: 'Word submitted. Guessers can start now.', at: Date.now() });
    broadcastState(room);
  });

  socket.on('guess:letter', ({ letter }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.currentWord || room.gameOver) return;
    if (room.currentSetterId === socket.id) return;

    const char = String(letter || '').toLowerCase().trim();
    if (!/^[a-z]$/.test(char)) return;
    if (room.guessedLetters.has(char) || room.wrongLetters.includes(char)) return;

    if (room.currentWord.includes(char)) {
      room.guessedLetters.add(char);
      const solved = room.currentWord
        .split('')
        .filter((ch) => ch !== ' ')
        .every((ch) => room.guessedLetters.has(ch));
      if (solved) {
        endRound(room, 'Guessers won! The full word was solved.');
        advanceSetter(room);
      }
    } else {
      room.wrongLetters.push(char);
      const maxWrong = room.mode === 'easy' ? EASY_PARTS.length : HARD_PARTS.length;
      if (room.wrongLetters.length >= maxWrong) {
        endRound(room, `Hangman complete! The word was "${room.currentWord}".`);
        advanceSetter(room);
      }
    }

    broadcastState(room);
  });

  socket.on('guess:word', ({ guess }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.currentWord || room.gameOver) return;
    if (room.currentSetterId === socket.id) return;

    const normalized = normalizeWord(String(guess || ''));
    if (!normalized) return;

    if (normalized === room.currentWord) {
      room.currentWord.split('').forEach((ch) => {
        if (ch !== ' ') room.guessedLetters.add(ch);
      });
      endRound(room, 'Guessers won by solving the full word.');
    } else {
      room.wrongLetters.push(`word:${normalized}`);
      const maxWrong = room.mode === 'easy' ? EASY_PARTS.length : HARD_PARTS.length;
      if (room.wrongLetters.length >= maxWrong) {
        endRound(room, `Wrong full-word guess. The word was "${room.currentWord}".`);
      }
    }

    if (room.gameOver) {
      advanceSetter(room);
    }

    broadcastState(room);
  });

  socket.on('chat:broadcast', ({ text }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    const clean = String(text || '').trim();
    if (!clean) return;
    room.messages.push({ system: false, text: clean, by: 'Host', at: Date.now() });
    broadcastState(room);
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode);
    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(roomCode);
      return;
    }

    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
      room.messages.push({ system: true, text: `Host left. ${room.players[0].name} is now host.`, at: Date.now() });
    }

    if (room.currentSetterId === socket.id) {
      ensurePlayerTurn(room);
      room.messages.push({ system: true, text: 'Word-setter left. Host should pick a new setter and start next round.', at: Date.now() });
      resetRound(room);
    }

    ensurePlayerTurn(room);
    broadcastState(room);
  });
});

server.listen(PORT, () => {
  console.log(`Online Hangman running at http://localhost:${PORT}`);
});
