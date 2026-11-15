// src/lib/order-alert.ts
// نظام التنبيه الصوتي والاهتزاز للطلبات الجديدة في لوحة التاجر ورادار السائق

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

// تفعيل AudioContext تلقائياً عند أول تفاعل للمستخدم مع الشاشة
if (typeof window !== "undefined") {
  const unlock = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    } catch {}
    window.removeEventListener("click", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("click", unlock, { once: true, passive: true });
  window.addEventListener("touchstart", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true, passive: true });
}

/**
 * تشغيل اهتزاز خفيف مزدوج على أجهزة الموبايل
 */
export function triggerSoftVibration(pattern: number[] = [180, 80, 220]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // تجاهل إذا كانت ميزة الاهتزاز غير مدعومة في المتصفح
  }
}

/**
 * تشغيل نغمة رنين تنبيهية لطيفة وفخمة باستخدام Web Audio API
 * متوافقة 100% بدون الحاجة لملفات صوتية خارجية وتعمل دون إنترنت
 */
export function playNewOrderChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // نغمات متتالية متناسقة D5 -> A5 -> D6
    const tones = [
      { freq: 587.33, start: 0, duration: 0.18, gain: 0.25 },
      { freq: 880.00, start: 0.12, duration: 0.25, gain: 0.3 },
      { freq: 1174.66, start: 0.28, duration: 0.45, gain: 0.28 },
    ];

    tones.forEach(({ freq, start, duration, gain: targetGain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);

      gainNode.gain.setValueAtTime(0.001, now + start);
      gainNode.gain.exponentialRampToValueAtTime(targetGain, now + start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + start + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    });
  } catch (err) {
    console.warn("Could not play new order chime:", err);
  }
}

/**
 * تشغيل التنبيه المزدوج (نغمة + اهتزاز خفيف)
 */
export function playNewOrderAlert(soundEnabled: boolean = true) {
  if (soundEnabled) {
    playNewOrderChime();
  }
  triggerSoftVibration([180, 80, 220]);
}
