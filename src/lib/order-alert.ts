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
 * نغمة إنذار المطبخ المرتفعة والمميزة وسط ضوضاء العمل (Kitchen Order Alarm)
 */
export function playKitchenAlarmChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // نغمات إنذار مطبخ سريعة وواضحة (G5 -> C6 -> E6 -> C6) لضمان لفت انتباه صاحب المتجر
    const tones = [
      { freq: 783.99, start: 0, duration: 0.16, gain: 0.35 },
      { freq: 1046.50, start: 0.14, duration: 0.18, gain: 0.38 },
      { freq: 1318.51, start: 0.28, duration: 0.22, gain: 0.40 },
      { freq: 1046.50, start: 0.44, duration: 0.35, gain: 0.35 },
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
    console.warn("Could not play kitchen alarm chime:", err);
  }
}

// ----------------------------------------------------
// مدير إنذار المطبخ المستمر (Kitchen Order Alarm Manager)
// ----------------------------------------------------
let kitchenAlarmTimer: any = null;
let kitchenAlarmMutedUntil = 0;
const pendingAlarmOrderIds = new Set<string>();
const kitchenAlarmSubscribers = new Set<(active: boolean, count: number) => void>();

function notifyKitchenAlarmSubscribers() {
  const active = isKitchenAlarmRinging();
  const count = pendingAlarmOrderIds.size;
  kitchenAlarmSubscribers.forEach((cb) => {
    try {
      cb(active, count);
    } catch {}
  });
}

/**
 * التحقق مما إذا كان إنذار المطبخ المستمر مفعّلاً في الإعدادات
 */
export function getKitchenAlarmEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const saved = localStorage.getItem("husayniya_kitchen_alarm_enabled");
    return saved !== null ? saved === "true" : true;
  } catch {
    return true;
  }
}

export function setKitchenAlarmEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("husayniya_kitchen_alarm_enabled", String(enabled));
  } catch {}
  if (!enabled) {
    stopAllKitchenAlarms();
  }
}

/**
 * هل إنذار المطبخ يرن فعلياً الآن؟
 */
export function isKitchenAlarmRinging(): boolean {
  return kitchenAlarmTimer !== null && pendingAlarmOrderIds.size > 0;
}

/**
 * بدء إنذار المطبخ المستمر لطلب وارد معين
 */
export function startKitchenAlarm(orderId?: string) {
  if (!getKitchenAlarmEnabled()) return;
  if (Date.now() < kitchenAlarmMutedUntil) return;

  if (orderId) {
    pendingAlarmOrderIds.add(orderId);
  }

  if (!kitchenAlarmTimer) {
    // رنة فورية أولى
    playKitchenAlarmChime();
    triggerSoftVibration([250, 100, 250, 100, 350]);

    // تكرار الرنين كل 3.5 ثانية حتى يتم قبول الطلب
    kitchenAlarmTimer = setInterval(() => {
      if (pendingAlarmOrderIds.size === 0 || Date.now() < kitchenAlarmMutedUntil) {
        stopAllKitchenAlarms();
        return;
      }
      playKitchenAlarmChime();
      triggerSoftVibration([250, 100, 250, 100, 350]);
    }, 3500);

    notifyKitchenAlarmSubscribers();
  }
}

/**
 * إيقاف إنذار المطبخ لطلب تم قبوله
 */
export function stopKitchenAlarm(orderId?: string) {
  if (orderId) {
    pendingAlarmOrderIds.delete(orderId);
  }
  if (pendingAlarmOrderIds.size === 0) {
    stopAllKitchenAlarms();
  } else {
    notifyKitchenAlarmSubscribers();
  }
}

/**
 * إيقاف كافة إنذارات المطبخ فوراً
 */
export function stopAllKitchenAlarms() {
  if (kitchenAlarmTimer) {
    clearInterval(kitchenAlarmTimer);
    kitchenAlarmTimer = null;
  }
  pendingAlarmOrderIds.clear();
  notifyKitchenAlarmSubscribers();
}

/**
 * كتم الإنذار مؤقتاً لعدة ثوانٍ/دقائق
 */
export function muteKitchenAlarm(seconds: number = 120) {
  kitchenAlarmMutedUntil = Date.now() + seconds * 1000;
  if (kitchenAlarmTimer) {
    clearInterval(kitchenAlarmTimer);
    kitchenAlarmTimer = null;
  }
  notifyKitchenAlarmSubscribers();
}

/**
 * الاشتراك في حالة إنذار المطبخ لتحديث واجهة المستخدم تلقائياً
 */
export function subscribeToKitchenAlarm(callback: (active: boolean, count: number) => void): () => void {
  kitchenAlarmSubscribers.add(callback);
  callback(isKitchenAlarmRinging(), pendingAlarmOrderIds.size);
  return () => {
    kitchenAlarmSubscribers.delete(callback);
  };
}

// ----------------------------------------------------
// نظام رنين مكالمة الطلب الجديد الوارد (Incoming Order Call Ringtone)
// صوت مكالمة تليفون مستمر + اهتزاز نبضي حتى يقوم المطعم بالرد (قبول أو رفض)
// ----------------------------------------------------
let incomingCallTimer: any = null;

export function isIncomingCallRinging(): boolean {
  return incomingCallTimer !== null;
}

/**
 * رنين هاتف متناغم واقعي بنغمتين (440Hz + 480Hz) يتكرر مثل رنين التليفون الحقيقي تماماً
 */
export function playPhoneCallCadence() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const ringBursts = [
      { start: 0, duration: 0.8 },
      { start: 1.0, duration: 0.8 },
    ];

    ringBursts.forEach(({ start, duration }) => {
      [440, 480].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + start);

        gainNode.gain.setValueAtTime(0.001, now + start);
        gainNode.gain.exponentialRampToValueAtTime(0.25, now + start + 0.05);
        gainNode.gain.setValueAtTime(0.25, now + start + duration - 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + start + duration);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + start);
        osc.stop(now + start + duration + 0.05);
      });
    });
  } catch (err) {
    console.warn("Could not play phone call cadence:", err);
  }
}

/**
 * بدء رنين مكالمة الطلب الجديد واهتزاز الهاتف بشكل مستمر
 */
export function startIncomingOrderCallRingtone() {
  if (incomingCallTimer) return;

  // رنين واهتزاز أولي فوري
  playPhoneCallCadence();
  triggerSoftVibration([400, 200, 400, 200, 800]);

  // تكرار الرنين والاهتزاز كل 2.6 ثانية كالمكالمة الواردة
  incomingCallTimer = setInterval(() => {
    playPhoneCallCadence();
    triggerSoftVibration([400, 200, 400, 200, 800]);
  }, 2600);
}

/**
 * إيقاف رنين مكالمة الطلب واهتزاز الهاتف فوراً عند القبول أو الرفض
 */
export function stopIncomingOrderCallRingtone() {
  if (incomingCallTimer) {
    clearInterval(incomingCallTimer);
    incomingCallTimer = null;
  }
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
