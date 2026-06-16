/**
 * MathFlip - Interactive Card Math Quiz
 * Javascript Logic (ES6 Vanilla)
 */

// ==========================================================================
// STATE MANAGEMENT & GLOBALS
// ==========================================================================
let quizData = {
  title: "Kuis Matematika Seru",
  timerEnabled: true,
  timerSeconds: 20,
  questions: []
};

let gameState = {
  score: 0,
  answeredCount: 0,
  remainingCards: 0,
  elapsedSeconds: 0,
  generalTimerInterval: null,
  questionTimerInterval: null,
  questionTimeLeft: 0,
  currentQuestion: null,
  currentCardElement: null,
  isSoundOn: true,
  audioCtx: null
};

// ==========================================================================
// SOUND SYNTHESIZER (WEB AUDIO API)
// ==========================================================================
function initAudio() {
  if (!gameState.audioCtx) {
    gameState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (gameState.audioCtx && gameState.audioCtx.state === 'suspended') {
    gameState.audioCtx.resume();
  }
}

function playTone(freq, type, duration, delay = 0) {
  if (!gameState.isSoundOn) return;
  initAudio();
  if (!gameState.audioCtx) return;

  const ctx = gameState.audioCtx;
  
  // Create nodes
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
  
  // Envelope - scale attack time relative to total duration
  const attackTime = Math.min(0.02, duration * 0.15);
  gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
  gainNode.gain.linearRampToValueAtTime(0.25, ctx.currentTime + delay + attackTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
  
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration);
}

function playFlipSound() {
  // Upwards sweep for flipping a card
  playTone(300, 'sine', 0.15);
  playTone(450, 'sine', 0.15, 0.05);
}

function playCorrectSound() {
  // Arpeggio / Chime for correct answer
  playTone(523.25, 'triangle', 0.3); // C5
  playTone(659.25, 'triangle', 0.3, 0.08); // E5
  playTone(783.99, 'triangle', 0.4, 0.16); // G5
}

function playWrongSound() {
  // Gentle buzz for wrong answer (using soft triangle wave)
  playTone(220, 'triangle', 0.4);
  playTone(147, 'triangle', 0.4, 0.1);
}

function playTickSound(isUrgent = false) {
  if (isUrgent) {
    // High-pitched clear warning beep (duration: 0.12 seconds)
    playTone(950, 'sine', 0.12);
  } else {
    // Soft clear woodblock clock tick (duration: 0.08 seconds)
    playTone(550, 'sine', 0.08);
  }
}

function playWinSound() {
  // Uplifting victory melody
  const melody = [
    { f: 523.25, d: 0.15, t: 0 },
    { f: 587.33, d: 0.15, t: 0.12 },
    { f: 659.25, d: 0.15, t: 0.24 },
    { f: 783.99, d: 0.3, t: 0.36 },
    { f: 659.25, d: 0.15, t: 0.6 },
    { f: 783.99, d: 0.6, t: 0.72 }
  ];
  melody.forEach(note => {
    playTone(note.f, 'triangle', note.d, note.t);
  });
}

// ==========================================================================
// URL CODEC (BASE64 SAFE ENCODER/DECODER)
// ==========================================================================
function encodeQuiz(data) {
  try {
    const jsonStr = JSON.stringify(data);
    // Safe base64 encoding for URL (handles unicode/UTF-8)
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
    // Replace non-url safe base64 chars
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (e) {
    console.error("Encoding error", e);
    return "";
  }
}

function decodeQuiz(str) {
  try {
    // Restore base64 chars
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const jsonStr = decodeURIComponent(escape(atob(base64)));
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Decoding error", e);
    return null;
  }
}

// ==========================================================================
// VIEWS CONTROLLER
// ==========================================================================
const screens = {
  landing: document.getElementById('screen-landing'),
  creator: document.getElementById('screen-creator'),
  gameplay: document.getElementById('screen-gameplay'),
  end: document.getElementById('screen-end')
};

function showScreen(screenId) {
  Object.keys(screens).forEach(key => {
    if (key === screenId) {
      screens[key].classList.add('active');
    } else {
      screens[key].classList.remove('active');
    }
  });
  // Redraw icons using Lucide
  if (window.lucide) {
    window.lucide.createIcons();
  }
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================================================
// MATH QUESTION GENERATOR
// ==========================================================================
function generateRandomQuestion(operators, min, max) {
  if (operators.length === 0) return null;
  
  const op = operators[Math.floor(Math.random() * operators.length)];
  let num1 = Math.floor(Math.random() * (max - min + 1)) + min;
  let num2 = Math.floor(Math.random() * (max - min + 1)) + min;
  
  let equation = "";
  let answer = 0;

  switch (op) {
    case 'add':
      equation = `${num1} + ${num2}`;
      answer = num1 + num2;
      break;
    case 'sub':
      // Ensure positive result for simple education math
      if (num1 < num2) {
        const temp = num1;
        num1 = num2;
        num2 = temp;
      }
      equation = `${num1} - ${num2}`;
      answer = num1 - num2;
      break;
    case 'mul':
      equation = `${num1} × ${num2}`;
      answer = num1 * num2;
      break;
    case 'div':
      // Ensure integer result: num1 is multiple of num2
      // Ensure divisor is not zero
      if (num2 === 0) num2 = 1;
      const multiplier = Math.floor(Math.random() * 10) + 1; // 1 to 10
      num1 = num2 * multiplier;
      equation = `${num1} ÷ ${num2}`;
      answer = multiplier;
      break;
  }

  // Generate 3 wrong options (unique from answer)
  const choices = new Set();
  choices.add(answer);

  // Offset-based wrong options generator
  const offsets = [-3, -2, -1, 1, 2, 3, 4, 5, 10, -10];
  while (choices.size < 4) {
    const offset = offsets[Math.floor(Math.random() * offsets.length)];
    const wrongAns = answer + offset;
    // For subtraction/division, ensure we don't have negative wrong answers if the result should be positive
    if (wrongAns >= 0 && wrongAns !== answer) {
      choices.add(wrongAns);
    }
  }

  // If we couldn't get enough wrong answers, add random close answers
  while (choices.size < 4) {
    const wrongAns = Math.max(0, answer + Math.floor(Math.random() * 20) - 10);
    choices.add(wrongAns);
  }

  // Shuffle options array
  const choicesArray = Array.from(choices);
  shuffleArray(choicesArray);

  return {
    equation: `${equation} = ... ?`,
    answer: answer,
    choices: choicesArray
  };
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ==========================================================================
// RENDER CREATOR LIST
// ==========================================================================
function renderCreatorQuestions() {
  const listContainer = document.getElementById('questions-list');
  const countSpan = document.getElementById('span-question-count');
  const emptyState = document.getElementById('creator-empty-state');
  
  // Clear previous non-empty elements
  const items = listContainer.querySelectorAll('.question-item');
  items.forEach(el => el.remove());

  countSpan.textContent = quizData.questions.length;

  if (quizData.questions.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  } else {
    emptyState.classList.add('hidden');
  }

  quizData.questions.forEach((q, index) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.innerHTML = `
      <div class="q-details">
        <span class="q-number-badge">KARTU ${index + 1}</span>
        <span class="q-text">${q.equation}</span>
        <span class="q-ans-pill">
          <i data-lucide="check" style="width:12px; height:12px"></i>
          Kunci: ${q.answer}
        </span>
      </div>
      <div class="q-actions">
        <button class="btn btn-icon-only btn-edit-question" data-index="${index}" title="Edit Soal">
          <i data-lucide="edit-2" style="width:16px; height:16px"></i>
        </button>
        <button class="btn btn-icon-only btn-danger-outline btn-delete-question" data-index="${index}" title="Hapus Soal">
          <i data-lucide="trash-2" style="width:16px; height:16px"></i>
        </button>
      </div>
    `;
    listContainer.appendChild(item);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Bind Actions to question items
  document.querySelectorAll('.btn-delete-question').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.getAttribute('data-index'));
      quizData.questions.splice(idx, 1);
      renderCreatorQuestions();
    });
  });

  document.querySelectorAll('.btn-edit-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'));
      openManualSoalModal(idx);
    });
  });
}

// ==========================================================================
// MODAL FOR MANUAL QUESTION
// ==========================================================================
const manualModal = document.getElementById('manual-soal-modal');
const btnCloseManual = document.getElementById('btn-close-manual-modal');
const btnSaveManual = document.getElementById('btn-save-manual-soal');

function openManualSoalModal(editIdx = -1) {
  initAudio();
  const indexInput = document.getElementById('manual-edit-index');
  const questionInput = document.getElementById('input-manual-question');
  const answerInput = document.getElementById('input-manual-ans');
  const wrong1 = document.getElementById('input-manual-wrong-1');
  const wrong2 = document.getElementById('input-manual-wrong-2');
  const wrong3 = document.getElementById('input-manual-wrong-3');

  indexInput.value = editIdx;

  if (editIdx > -1) {
    // Fill with editing question data
    const q = quizData.questions[editIdx];
    questionInput.value = q.equation.replace(' = ... ?', '');
    answerInput.value = q.answer;
    
    // Distractors
    const wrongs = q.choices.filter(c => c !== q.answer);
    wrong1.value = wrongs[0] !== undefined ? wrongs[0] : '';
    wrong2.value = wrongs[1] !== undefined ? wrongs[1] : '';
    wrong3.value = wrongs[2] !== undefined ? wrongs[2] : '';
  } else {
    // Clear inputs
    questionInput.value = '';
    answerInput.value = '';
    wrong1.value = '';
    wrong2.value = '';
    wrong3.value = '';
  }

  manualModal.classList.add('active');
}

function closeManualSoalModal() {
  manualModal.classList.remove('active');
}

btnCloseManual.addEventListener('click', closeManualSoalModal);

btnSaveManual.addEventListener('click', () => {
  const editIdx = parseInt(document.getElementById('manual-edit-index').value);
  const qText = document.getElementById('input-manual-question').value.trim();
  const ansVal = parseInt(document.getElementById('input-manual-ans').value);
  const w1 = parseInt(document.getElementById('input-manual-wrong-1').value);
  const w2 = parseInt(document.getElementById('input-manual-wrong-2').value);
  const w3 = parseInt(document.getElementById('input-manual-wrong-3').value);

  if (!qText || isNaN(ansVal) || isNaN(w1) || isNaN(w2) || isNaN(w3)) {
    alert("Mohon lengkapi semua isian dengan benar!");
    return;
  }

  // Ensure options are unique
  const choicesSet = new Set([ansVal, w1, w2, w3]);
  if (choicesSet.size < 4) {
    alert("Kunci jawaban dan pilihan salah harus unik (tidak boleh ada angka yang sama)!");
    return;
  }

  const choicesArray = [ansVal, w1, w2, w3];
  shuffleArray(choicesArray);

  const questionObj = {
    equation: `${qText} = ... ?`,
    answer: ansVal,
    choices: choicesArray
  };

  if (editIdx > -1) {
    quizData.questions[editIdx] = questionObj;
  } else {
    quizData.questions.push(questionObj);
  }

  closeManualSoalModal();
  renderCreatorQuestions();
});

// ==========================================================================
// GAMEPLAY PLAY LOGIC
// ==========================================================================
function setupGame(quiz) {
  gameState.score = 0;
  gameState.answeredCount = 0;
  gameState.remainingCards = quiz.questions.length;
  gameState.elapsedSeconds = 0;
  
  document.getElementById('game-quiz-title').textContent = quiz.title;
  document.getElementById('game-score').textContent = "0";
  document.getElementById('game-total').textContent = quiz.questions.length;
  document.getElementById('game-remaining').textContent = quiz.questions.length;

  const cardGrid = document.getElementById('game-card-grid');
  cardGrid.innerHTML = '';

  // Setup Timer Bar visibility
  const timerContainer = document.getElementById('game-timer-container');
  if (quiz.timerEnabled) {
    timerContainer.classList.remove('hidden');
    document.getElementById('game-timer-text').textContent = `${quiz.timerSeconds}s`;
    document.getElementById('game-timer-bar').style.width = '100%';
    document.getElementById('game-timer-bar').className = 'timer-progress-bar'; // Reset colors
  } else {
    timerContainer.classList.add('hidden');
  }

  // Generate cards
  quiz.questions.forEach((q, index) => {
    const card = document.createElement('div');
    card.className = 'card-3d';
    card.setAttribute('data-index', index);
    
    // Front face (closed card)
    // Back face (revealed with correct/wrong status)
    card.innerHTML = `
      <div class="card-face card-front">
        <div class="card-icon-wrapper">${index + 1}</div>
        <div class="card-label">Kartu</div>
      </div>
      <div class="card-face card-back" id="card-back-${index}">
        <div class="card-status-icon" id="card-icon-${index}">
          <i data-lucide="help-circle"></i>
        </div>
        <div class="card-back-text" id="card-status-text-${index}">Buka</div>
        <div class="card-back-equation">${q.equation}</div>
      </div>
    `;

    cardGrid.appendChild(card);

    // Click handler for card
    card.addEventListener('click', () => {
      if (card.classList.contains('flipped')) return;
      openQuestionModal(index, card);
    });
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Start game time tracking
  if (gameState.generalTimerInterval) clearInterval(gameState.generalTimerInterval);
  gameState.generalTimerInterval = setInterval(() => {
    gameState.elapsedSeconds++;
  }, 1000);
}

// Open Question Overlay Modal
const questionModal = document.getElementById('question-modal');
const modalOverlayStatus = document.getElementById('answer-status-overlay');

function openQuestionModal(qIndex, cardElement) {
  initAudio();
  playFlipSound();
  
  gameState.currentQuestionIndex = qIndex;
  gameState.currentCardElement = cardElement;
  
  const q = currentQuiz.questions[qIndex];
  
  document.getElementById('modal-card-number').textContent = qIndex + 1;
  document.getElementById('modal-question-text').textContent = q.equation;
  
  // Set choice button labels
  q.choices.forEach((choice, idx) => {
    const btn = document.querySelector(`.btn-choice[data-choice="${idx}"]`);
    btn.className = 'btn-choice'; // reset classes
    document.getElementById(`choice-text-${idx}`).textContent = choice;
    btn.disabled = false;
  });

  // Reset overlay
  modalOverlayStatus.classList.remove('active');
  document.getElementById('status-icon-correct').classList.remove('active');
  document.getElementById('status-icon-wrong').classList.remove('active');
  document.getElementById('status-icon-timeout').classList.remove('active');

  // Configure timer for the modal
  const timerPill = document.getElementById('modal-timer-pill');
  if (currentQuiz.timerEnabled) {
    timerPill.classList.remove('hidden');
    gameState.questionTimeLeft = currentQuiz.timerSeconds;
    document.getElementById('modal-timer-text').textContent = gameState.questionTimeLeft;
    
    // Start countdown
    if (gameState.questionTimerInterval) clearInterval(gameState.questionTimerInterval);
    gameState.questionTimerInterval = setInterval(() => {
      gameState.questionTimeLeft--;
      document.getElementById('modal-timer-text').textContent = gameState.questionTimeLeft;

      // Update the main progress bar as well!
      const pct = (gameState.questionTimeLeft / currentQuiz.timerSeconds) * 100;
      const timerBar = document.getElementById('game-timer-bar');
      timerBar.style.width = `${pct}%`;
      document.getElementById('game-timer-text').textContent = `${gameState.questionTimeLeft}s`;

      // Tick sound and colors
      if (gameState.questionTimeLeft <= 5) {
        timerBar.className = 'timer-progress-bar danger';
        playTickSound(true); // Suara peringatan darurat (detik-detik akhir)
      } else if (gameState.questionTimeLeft <= 10) {
        timerBar.className = 'timer-progress-bar warning';
        playTickSound(false); // Suara tik-tok normal
      } else {
        playTickSound(false); // Suara tik-tok normal
      }

      if (gameState.questionTimeLeft <= 0) {
        handleQuestionTimeout();
      }
    }, 1000);
  } else {
    timerPill.classList.add('hidden');
    if (gameState.questionTimerInterval) clearInterval(gameState.questionTimerInterval);
  }

  questionModal.classList.add('active');
}

function handleQuestionTimeout() {
  clearInterval(gameState.questionTimerInterval);
  playWrongSound();

  // Disable buttons
  document.querySelectorAll('.btn-choice').forEach(btn => btn.disabled = true);

  // Show status overlay
  document.getElementById('status-icon-timeout').classList.add('active');
  document.getElementById('status-message').textContent = "⏰ Oh No, Waktu Habis! ⏰";
  document.getElementById('status-submessage').textContent = `Jawaban yang benar adalah: ${currentQuiz.questions[gameState.currentQuestionIndex].answer} 💡`;
  modalOverlayStatus.classList.add('active');

  // Update card state on grid
  updateCardResult(gameState.currentQuestionIndex, false);

  setTimeout(closeQuestionModal, 2500);
}

function selectChoice(choiceIdx) {
  clearInterval(gameState.questionTimerInterval);
  
  const qIndex = gameState.currentQuestionIndex;
  const q = currentQuiz.questions[qIndex];
  const chosenVal = q.choices[choiceIdx];
  const isCorrect = chosenVal === q.answer;

  // Disable choices
  document.querySelectorAll('.btn-choice').forEach(btn => btn.disabled = true);

  // Apply colors to choices
  q.choices.forEach((c, idx) => {
    const btn = document.querySelector(`.btn-choice[data-choice="${idx}"]`);
    if (c === q.answer) {
      btn.classList.add('correct');
    } else if (idx === choiceIdx) {
      btn.classList.add('wrong');
    }
  });

  // Setup overlay status
  if (isCorrect) {
    gameState.score++;
    playCorrectSound();
    document.getElementById('status-icon-correct').classList.add('active');
    document.getElementById('status-message').textContent = "🌟 Hebat! Benar! 🌟";
    document.getElementById('status-submessage').textContent = "Kamu pintar sekali! 🎉";
    document.getElementById('game-score').textContent = gameState.score;
  } else {
    playWrongSound();
    document.getElementById('status-icon-wrong').classList.add('active');
    document.getElementById('status-message').textContent = "Tidak Apa-apa! ✨";
    document.getElementById('status-submessage').textContent = `Jawaban yang benar adalah: ${q.answer} 💡`;
  }

  modalOverlayStatus.classList.add('active');

  // Update Card on grid
  updateCardResult(qIndex, isCorrect);

  setTimeout(closeQuestionModal, 2500);
}

function updateCardResult(qIndex, isCorrect) {
  const backFace = document.getElementById(`card-back-${qIndex}`);
  const statusIconDiv = document.getElementById(`card-icon-${qIndex}`);
  const statusText = document.getElementById(`card-status-text-${qIndex}`);

  // Flip card element
  gameState.currentCardElement.classList.add('flipped');

  if (isCorrect) {
    backFace.classList.add('correct');
    statusIconDiv.innerHTML = '<i data-lucide="check" style="width: 24px; height:24px;"></i>';
    statusText.textContent = "🎉 BENAR!";
  } else {
    backFace.classList.add('wrong');
    statusIconDiv.innerHTML = '<i data-lucide="help-circle" style="width: 24px; height:24px;"></i>';
    statusText.textContent = "💡 COBA LAGI";
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Update score status
  gameState.answeredCount++;
  gameState.remainingCards--;
  document.getElementById('game-remaining').textContent = gameState.remainingCards;
}

function closeQuestionModal() {
  questionModal.classList.remove('active');
  modalOverlayStatus.classList.remove('active');

  // Reset main timer bar
  if (currentQuiz.timerEnabled) {
    document.getElementById('game-timer-bar').style.width = '100%';
    document.getElementById('game-timer-bar').className = 'timer-progress-bar';
    document.getElementById('game-timer-text').textContent = `${currentQuiz.timerSeconds}s`;
  }

  // Check Game Over
  if (gameState.remainingCards === 0) {
    endGame();
  }
}

// End Game & Score Summary
function endGame() {
  if (gameState.generalTimerInterval) clearInterval(gameState.generalTimerInterval);
  if (gameState.questionTimerInterval) clearInterval(gameState.questionTimerInterval);

  playWinSound();

  // Populate scoreboard
  const scoreNum = gameState.score;
  const totalNum = currentQuiz.questions.length;
  const accuracy = Math.round((scoreNum / totalNum) * 100);

  document.getElementById('end-score').textContent = scoreNum;
  document.getElementById('end-total').textContent = totalNum;
  document.getElementById('end-accuracy').textContent = `${accuracy}%`;
  document.getElementById('end-time').textContent = `${gameState.elapsedSeconds} detik`;

  // Dynamic trophy feedback based on accuracy
  const heading = document.getElementById('end-status-heading');
  if (accuracy === 100) {
    heading.textContent = "Sempurna! 🌟";
  } else if (accuracy >= 75) {
    heading.textContent = "Luar Biasa! 🎉";
  } else if (accuracy >= 50) {
    heading.textContent = "Kerja Bagus! 👍";
  } else {
    heading.textContent = "Tetap Semangat! 💪";
  }

  showScreen('end');

  // Trigger confetti shower!
  if (window.confetti) {
    // First burst
    window.confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });

    // Secondary burst
    setTimeout(() => {
      window.confetti({
        particleCount: 100,
        spread: 100,
        origin: { x: 0.3, y: 0.7 }
      });
      window.confetti({
        particleCount: 100,
        spread: 100,
        origin: { x: 0.7, y: 0.7 }
      });
    }, 400);
  }
}

// Setup Event Listeners on Answer Choices
document.querySelectorAll('.btn-choice').forEach(btn => {
  btn.addEventListener('click', () => {
    const choiceIdx = parseInt(btn.getAttribute('data-choice'));
    selectChoice(choiceIdx);
  });
});

// ==========================================================================
// EVENT HANDLERS & INITS
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  // Initial check for URL data
  checkUrlHash();

  // Lucide initialize
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

// Watch hash change
window.addEventListener('hashchange', checkUrlHash);

let currentQuiz = null;

function checkUrlHash() {
  const hash = window.location.hash;
  const playBox = document.getElementById('box-student-play');
  
  if (hash && hash.startsWith('#quiz=')) {
    const b64Data = hash.substring(6);
    const decoded = decodeQuiz(b64Data);
    
    if (decoded && decoded.questions && decoded.questions.length > 0) {
      currentQuiz = decoded;
      
      // Update landing screen with loaded quiz info
      document.getElementById('landing-quiz-title').textContent = decoded.title;
      document.getElementById('landing-quiz-count').textContent = `${decoded.questions.length} Kartu`;
      playBox.classList.remove('hidden');
      return;
    }
  }
  
  // No quiz in URL or invalid data
  playBox.classList.add('hidden');
  currentQuiz = null;
}

// Navigation Buttons
document.getElementById('btn-go-creator').addEventListener('click', () => {
  initAudio();
  showScreen('creator');
  renderCreatorQuestions();
});

document.getElementById('btn-creator-back').addEventListener('click', () => {
  showScreen('landing');
});

document.getElementById('btn-start-game').addEventListener('click', () => {
  if (currentQuiz) {
    initAudio();
    setupGame(currentQuiz);
    showScreen('gameplay');
  }
});

document.getElementById('btn-game-quit').addEventListener('click', () => {
  if (confirm("Apakah Anda yakin ingin keluar dari kuis? Progress bermain Anda akan hilang.")) {
    if (gameState.generalTimerInterval) clearInterval(gameState.generalTimerInterval);
    if (gameState.questionTimerInterval) clearInterval(gameState.questionTimerInterval);
    showScreen('landing');
  }
});

document.getElementById('btn-restart-game').addEventListener('click', () => {
  if (currentQuiz) {
    setupGame(currentQuiz);
    showScreen('gameplay');
  }
});

document.getElementById('btn-end-home').addEventListener('click', () => {
  showScreen('landing');
});

// Timer Setting Panel Toggle
const checkboxTimer = document.getElementById('checkbox-timer-enable');
const divTimerValue = document.getElementById('div-timer-value');
const timerStatusText = document.getElementById('timer-status-text');

checkboxTimer.addEventListener('change', () => {
  if (checkboxTimer.checked) {
    divTimerValue.style.display = 'flex';
    timerStatusText.textContent = "Aktif (Detik per Soal)";
    quizData.timerEnabled = true;
  } else {
    divTimerValue.style.display = 'none';
    timerStatusText.textContent = "Nonaktif";
    quizData.timerEnabled = false;
  }
});

// Generate Questions automatically
document.getElementById('btn-generate-questions').addEventListener('click', () => {
  const cardCount = parseInt(document.getElementById('select-card-count').value);
  const minNum = parseInt(document.getElementById('input-num-min').value);
  const maxNum = parseInt(document.getElementById('input-num-max').value);
  
  // Selected math ops
  const ops = [];
  if (document.getElementById('op-add').checked) ops.push('add');
  if (document.getElementById('op-sub').checked) ops.push('sub');
  if (document.getElementById('op-mul').checked) ops.push('mul');
  if (document.getElementById('op-div').checked) ops.push('div');

  if (ops.length === 0) {
    alert("Silakan pilih minimal satu jenis operasi matematika!");
    return;
  }

  if (minNum >= maxNum) {
    alert("Angka Minimum harus lebih kecil dari Angka Maksimum!");
    return;
  }

  // Clear current questions
  quizData.questions = [];

  // Generate cards
  for (let i = 0; i < cardCount; i++) {
    const qObj = generateRandomQuestion(ops, minNum, maxNum);
    if (qObj) {
      quizData.questions.push(qObj);
    }
  }

  renderCreatorQuestions();
  
  // Highlight workspace
  const workspace = document.querySelector('.creator-workspace');
  workspace.style.transform = 'scale(1.01)';
  setTimeout(() => workspace.style.transform = 'none', 300);
});

// Add Manual Question Button
document.getElementById('btn-add-manual').addEventListener('click', () => {
  openManualSoalModal();
});

// Share and copy link
const shareModal = document.getElementById('share-modal');
const btnCloseShare = document.getElementById('btn-close-share-modal');
const inputShareLink = document.getElementById('input-share-link');
const btnCopyLink = document.getElementById('btn-copy-link');

document.getElementById('btn-share-quiz').addEventListener('click', () => {
  if (quizData.questions.length === 0) {
    alert("Silakan buat minimal satu soal sebelum membagikan kuis!");
    return;
  }

  // Build Quiz Data
  quizData.title = document.getElementById('input-quiz-title').value.trim() || "Kuis Matematika";
  quizData.timerEnabled = checkboxTimer.checked;
  quizData.timerSeconds = parseInt(document.getElementById('input-timer-seconds').value) || 20;

  const base64 = encodeQuiz(quizData);
  const shareUrl = `${window.location.origin}${window.location.pathname}#quiz=${base64}`;

  inputShareLink.value = shareUrl;
  
  // Reset Copy Button
  document.getElementById('btn-copy-icon').setAttribute('data-lucide', 'copy');
  document.getElementById('btn-copy-text').textContent = 'Salin';
  if (window.lucide) window.lucide.createIcons();

  shareModal.classList.add('active');
});

btnCloseShare.addEventListener('click', () => {
  shareModal.classList.remove('active');
});

// Copy link click handler
btnCopyLink.addEventListener('click', () => {
  inputShareLink.select();
  inputShareLink.setSelectionRange(0, 99999); // For mobile devices

  try {
    navigator.clipboard.writeText(inputShareLink.value).then(() => {
      // success
      document.getElementById('btn-copy-icon').setAttribute('data-lucide', 'check');
      document.getElementById('btn-copy-text').textContent = 'Tersalin!';
      if (window.lucide) window.lucide.createIcons();
    });
  } catch (err) {
    // Fallback if clipboard API is not available
    document.execCommand('copy');
    document.getElementById('btn-copy-icon').setAttribute('data-lucide', 'check');
    document.getElementById('btn-copy-text').textContent = 'Tersalin!';
    if (window.lucide) window.lucide.createIcons();
  }
});

// Sound toggler
const btnSound = document.getElementById('btn-sound-toggle');
const iconSound = document.getElementById('icon-sound');

btnSound.addEventListener('click', () => {
  gameState.isSoundOn = !gameState.isSoundOn;
  
  if (gameState.isSoundOn) {
    btnSound.className = 'btn-icon-only sound-on';
    iconSound.setAttribute('data-lucide', 'volume-2');
  } else {
    btnSound.className = 'btn-icon-only sound-off';
    iconSound.setAttribute('data-lucide', 'volume-x');
  }
  
  if (window.lucide) window.lucide.createIcons();
});
