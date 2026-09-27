/**
 * Notification chime: two short sine notes synthesized with WebAudio — no
 * audio file to ship or load. On/off is a per-device preference (a laptop in
 * a meeting and a desktop at home can differ), so it lives in localStorage.
 */
const KEY = "tesuto:notify-sound"

export function isSoundEnabled() {
  try {
    return localStorage.getItem(KEY) !== "off"
  } catch {
    return true
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off")
  } catch {}
}

let ctx: AudioContext | null = null

export function playChime({ force = false } = {}) {
  if (!force && !isSoundEnabled()) return
  try {
    ctx ??= new AudioContext()
    // Browsers keep the context suspended until a user gesture has happened;
    // resume() is a no-op before that, and the chime is simply skipped.
    if (ctx.state === "suspended") void ctx.resume()
    const start = ctx.currentTime
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const t = start + i * 0.12
      osc.type = "sine"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.4)
    }
  } catch {
    // No audio support — notifications still show visually.
  }
}
