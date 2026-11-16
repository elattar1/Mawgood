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
 * تشغيل التنبيه المزدوج (نغمة + اهتزاز خفيف) للطلبات الجديدة في لوحة المتجر والسائق
 */
export function playNewOrderAlert(soundEnabled: boolean = true) {
  if (soundEnabled) {
    playNewOrderChime();
  }
  triggerSoftVibration([180, 80, 220]);
}

/**
 * تشغيل نغمة تنبيه مخصصة للعميل حسب تغير حالة طلبه
 * (قبول وتحضير الطلب / خروج الدليفري / تسليم واكتمال الطلب / إلغاء)
 */
export function playCustomerOrderStatusChime(status?: string) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    let tones: Array<{ freq: number; start: number; duration: number; gain: number }>;

    switch (status) {
      case "accepted":
      case "confirmed":
      case "preparing":
        // نغمة صاعدة متناسقة تبشر العميل ببدء تجهيز وجبته أو طلبه: C5 -> E5 -> G5
        tones = [
          { freq: 523.25, start: 0, duration: 0.16, gain: 0.22 },
          { freq: 659.25, start: 0.12, duration: 0.18, gain: 0.25 },
          { freq: 783.99, start: 0.24, duration: 0.32, gain: 0.28 },
        ];
        break;

      case "on_the_way":
        // نغمة حيوية تنبه العميل بأن الكابتن استلم الطلب وهو في الطريق إليه: E5 -> G5 -> C6
        tones = [
          { freq: 659.25, start: 0, duration: 0.15, gain: 0.25 },
          { freq: 880.00, start: 0.11, duration: 0.17, gain: 0.28 },
          { freq: 1046.50, start: 0.23, duration: 0.38, gain: 0.30 },
        ];
        break;

      case "delivered":
      case "completed":
        // نغمة اكتمال ونجاح التسليم المبهجة: C5 -> G5 -> C6
        tones = [
          { freq: 523.25, start: 0, duration: 0.18, gain: 0.20 },
          { freq: 783.99, start: 0.14, duration: 0.22, gain: 0.24 },
          { freq: 1046.50, start: 0.28, duration: 0.45, gain: 0.26 },
        ];
        break;

      case "cancelled":
        // نغمة هادئة تنبه العميل بإلغاء الطلب
        tones = [
          { freq: 783.99, start: 0, duration: 0.18, gain: 0.18 },
          { freq: 622.25, start: 0.14, duration: 0.22, gain: 0.16 },
          { freq: 523.25, start: 0.28, duration: 0.38, gain: 0.14 },
        ];
        break;

      default:
        // نغمة تنبيه عامة ناعمة
        tones = [
          { freq: 587.33, start: 0, duration: 0.18, gain: 0.22 },
          { freq: 880.00, start: 0.12, duration: 0.32, gain: 0.25 },
        ];
        break;
    }

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
    console.warn("Could not play customer order status chime:", err);
  }
}

/**
 * تشغيل تنبيه حالة الطلب للعميل (نغمة + اهتزاز خفيف)
 */
export function playCustomerOrderAlert(status?: string, soundEnabled: boolean = true) {
  if (soundEnabled) {
    playCustomerOrderStatusChime(status);
  }
  const vibration = status === "on_the_way" ? [180, 80, 240, 80, 240] : [140, 70, 180];
  triggerSoftVibration(vibration);
}

/**
 * جلب وحفظ إعدادات تفعيل صوت تنبيهات الطلبات للعميل
 */
export function getCustomerSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const saved = localStorage.getItem("husayniya_customer_sound_enabled");
    return saved !== null ? saved === "true" : true;
  } catch {
    return true;
  }
}

export function setCustomerSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("husayniya_customer_sound_enabled", String(enabled));
  } catch {}
}
