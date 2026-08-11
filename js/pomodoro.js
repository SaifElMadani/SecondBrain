// ═══════════════════════════════════════════════════════════════
// TASK TIMER
// ═══════════════════════════════════════════════════════════════
let timerInterval = null;
let timerTaskId = null;
let timerSecondsLeft = 0;
let timerTotalSec = 0;
let timerStartTime = null;

function startTaskTimer(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  if (!task.duration) {
    toast('Set a time estimate on this task first', 'error'); return;
  }

  timerTaskId = id;
  timerTotalSec = task.duration * 60;
  timerSecondsLeft = timerTotalSec;
  timerStartTime = Date.now();

  document.getElementById('timer-task-name').textContent = task.title;
  document.getElementById('overlay-timer').classList.add('active');
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timerSecondsLeft = Math.max(0, timerTotalSec - Math.floor((Date.now() - timerStartTime) / 1000));
    updateTimerDisplay();
    if (timerSecondsLeft <= 0) {
      clearInterval(timerInterval);
      completeTimer();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const display = document.getElementById('timer-display');
  const fill = document.getElementById('timer-bar-fill');
  const pct = (timerSecondsLeft / timerTotalSec) * 100;

  display.textContent = formatSec(timerSecondsLeft);
  fill.style.width = `${pct}%`;

  const urgent = timerSecondsLeft < 120;
  display.classList.toggle('urgent', urgent);
  fill.classList.toggle('urgent', urgent);
}

async function completeTimer() {
  document.getElementById('overlay-timer').classList.remove('active');
  const task = state.tasks.find(t => t.id === timerTaskId);
  const actualMin = Math.round((Date.now() - timerStartTime) / 60000);

  // Log time entry
  const teId = uid();
  const te = { id: teId, taskId: timerTaskId, estimatedMin: task?.duration || 0, actualMin, date: dk(), categoryId: task ? getTaskCategoryId(task) : null, createdAt: Date.now() };
  state.timeEntries.push(te);
  await saveDoc('timeEntries', teId, te);

  clearTimer();
  toast('Timer done! ⏱', 'success');
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Temps écoulé', { body: task ? `Temps écoulé — ${task.title}` : 'Temps écoulé' });
  }
}

document.getElementById('timer-done-btn').addEventListener('click', async () => {
  clearInterval(timerInterval);
  await completeTimer();
  await toggleTask(timerTaskId);
});

document.getElementById('timer-cancel-btn').addEventListener('click', () => {
  clearInterval(timerInterval);
  clearTimer();
});

function clearTimer() {
  document.getElementById('overlay-timer').classList.remove('active');
  timerInterval = null; timerTaskId = null;
}

// ═══════════════════════════════════════════════════════════════
// PAUSE SCREEN
// ═══════════════════════════════════════════════════════════════
let pauseInterval = null;

function openPauseScreen(taskTitle) {
  document.getElementById('pause-title').textContent = `You finished: "${taskTitle}" 🎉`;
  const skipBtn = document.getElementById('pause-skip-btn');
  skipBtn.classList.remove('ready');
  skipBtn.disabled = true;

  let secs = 60;
  document.getElementById('pause-countdown').textContent = secs;
  const circle = document.getElementById('pause-ring-circle');
  const circumference = 2 * Math.PI * 80;

  document.getElementById('screen-pause').classList.add('active');

  pauseInterval = setInterval(() => {
    secs--;
    document.getElementById('pause-countdown').textContent = secs;
    const offset = circumference * (secs / 60);
    circle.setAttribute('stroke-dashoffset', offset);

    if (secs <= 0) {
      clearInterval(pauseInterval);
      skipBtn.classList.add('ready');
      skipBtn.disabled = false;
      document.getElementById('pause-countdown').textContent = '✓';
    }
  }, 1000);
}

document.getElementById('pause-close-btn').addEventListener('click', () => {
  clearInterval(pauseInterval);
  pauseInterval = null;
  document.getElementById('screen-pause').classList.remove('active');
});

document.getElementById('pause-skip-btn').addEventListener('click', () => {
  if (!document.getElementById('pause-skip-btn').classList.contains('ready')) return;
  clearInterval(pauseInterval);
  // Log win from the input
  const winText = document.getElementById('pause-win-input').value.trim();
  if (winText) logWin(winText);
  document.getElementById('pause-win-input').value = '';
  document.getElementById('screen-pause').classList.remove('active');
});


export { startTaskTimer, updateTimerDisplay, completeTimer, clearTimer, openPauseScreen };

Object.assign(window, { startTaskTimer, updateTimerDisplay, completeTimer, clearTimer, openPauseScreen });
