// ═══════════════════════════════════════════════════════════════
// HOURLY TIME ANCHOR NUDGE (gentle reminder)
// ═══════════════════════════════════════════════════════════════
function startHourlyNudge() {
  const now = new Date();
  const msUntilNextHour = (60 - now.getMinutes()) * 60000 - now.getSeconds() * 1000;
  setTimeout(() => {
    hourlyNudge();
    setInterval(hourlyNudge, 3600000);
  }, msUntilNextHour);
}

function hourlyNudge() {
  const hour = new Date().getHours();
  if (hour >= 7 && hour <= 22) {
    toast(`⏰ Hour check-in — it's ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. How's your focus?`, 'info', 5000);
    // Vibrate if supported
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  }
}

// ═══════════════════════════════════════════════════════════════
// END-OF-DAY PROMPT
// ═══════════════════════════════════════════════════════════════
function checkEndOfDay() {
  const hour = new Date().getHours();
  if (hour === 20) { // 8pm
    const j = state.journal[dk()];
    if (!j?.eveningDone) {
      setTimeout(() => openRitual('evening'), 2000);
    }
  }
}


export { startHourlyNudge, hourlyNudge, checkEndOfDay };

Object.assign(window, { startHourlyNudge, hourlyNudge, checkEndOfDay });
