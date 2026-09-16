/**
 * ==========================================================================
 * ⚙️ PVT WORKFORCE HUB - SYSTEM SETTINGS CONTROLLER (การตั้งค่าระบบ)
 * ==========================================================================
 * รองรับ:
 * 1. ขยาย/ปรับขนาดข้อความ (Font Scaling) - ปกติ, ปานกลาง, ใหญ่พิเศษ
 * 2. เปลี่ยนโทนสีธีมระบบ (Color Themes) - มินต์, โอเชียน, อินดิโก้, เอเมอรัลด์, ซันเซ็ท
 * 3. เชื่อมต่อ LINE แจ้งเตือน (LINE Link Token / LINE ID)
 * 4. บันทึกค่าลง localStorage เพื่อคงสภาพการตั้งค่าทุกหน้าอัตโนมัติ
 */

(function() {
  const THEMES = {
    teal: {
      name: "มินต์เทอร์ควอยซ์",
      desc: "สดใส คลาสสิก",
      primary: "#0d9488",
      primaryDark: "#0f766e",
      primaryHover: "#0f766e",
      primarySoft: "#f0fdfa",
      primaryLight: "#ccfbf1",
      gradient: "linear-gradient(135deg, #0d9488, #0891b2)",
      color: "#0d9488"
    },
    blue: {
      name: "น้ำเงินโอเชียน",
      desc: "สุภาพ มั่นคง",
      primary: "#0284c7",
      primaryDark: "#0369a1",
      primaryHover: "#0369a1",
      primarySoft: "#f0f9ff",
      primaryLight: "#bae6fd",
      gradient: "linear-gradient(135deg, #0284c7, #2563eb)",
      color: "#0284c7"
    },
    indigo: {
      name: "ม่วงรอยัล",
      desc: "ทันสมัย พรีเมียม",
      primary: "#6366f1",
      primaryDark: "#4f46e5",
      primaryHover: "#4f46e5",
      primarySoft: "#eef2ff",
      primaryLight: "#c7d2fe",
      gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
      color: "#6366f1"
    },
    emerald: {
      name: "เขียวฟอเรสต์",
      desc: "ธรรมชาติ สบายตา",
      primary: "#059669",
      primaryDark: "#047857",
      primaryHover: "#047857",
      primarySoft: "#ecfdf5",
      primaryLight: "#a7f3d0",
      gradient: "linear-gradient(135deg, #059669, #10b981)",
      color: "#059669"
    },
    coral: {
      name: "ส้มซันเซ็ท",
      desc: "อบอุ่น มีพลัง",
      primary: "#ea580c",
      primaryDark: "#c2410c",
      primaryHover: "#c2410c",
      primarySoft: "#fff7ed",
      primaryLight: "#fed7aa",
      gradient: "linear-gradient(135deg, #ea580c, #e11d48)",
      color: "#ea580c"
    }
  };

  // 🚀 1. Immediate Application on script execution
  const NATIVE_LANGUAGE_NAMES = {
    'th': 'ไทย (Thai)',
    'en': 'English',
    'lo': 'ພາສາລາວ (Lao)',
    'my': 'မြန်မာစာ (Burmese)',
    'ja': '日本語 (Japanese)',
    'zh-CN': '简体中文 (Chinese)',
    'ko': '한국어 (Korean)'
  };

  function startNativeLanguageObserver() {
    if (window.nativeLanguageObserverStarted) return;
    window.nativeLanguageObserverStarted = true;

    setInterval(() => {
      const combo = document.querySelector('.goog-te-combo');
      if (combo) {
        // Change default option text (usually "เลือกภาษา" or "Select Language")
        const firstOption = combo.options[0];
        if (firstOption && firstOption.value === "" && firstOption.textContent !== "เลือกภาษา / Select Language") {
          firstOption.textContent = "เลือกภาษา / Select Language";
        }

        const options = combo.querySelectorAll('option');
        options.forEach(option => {
          const val = option.value;
          if (NATIVE_LANGUAGE_NAMES[val] && option.textContent !== NATIVE_LANGUAGE_NAMES[val]) {
            option.textContent = NATIVE_LANGUAGE_NAMES[val];
          }
        });
      }
    }, 300);
  }

  function startGoogleBannerKiller() {
    if (window.googleBannerKillerStarted) return;
    window.googleBannerKillerStarted = true;

    const selectors = [
      'body > .skiptranslate',
      'body > div.skiptranslate',
      'body > iframe.skiptranslate',
      'iframe.goog-te-banner-frame',
      'iframe.goog-te-banner-frame-escaped',
      'iframe[src*="translate.google.com"]',
      'iframe[id*="google_translate"]',
      'iframe[id*=":1.container"]',
      'iframe[id*=":2.container"]',
      'iframe[id*=":0.container"]',
      'iframe[class*="goog-te-banner-frame"]',
      '.goog-te-banner-frame',
      '.goog-te-banner',
      '#goog-gt-tt',
      '.goog-te-balloon-frame',
      '.goog-te-banner-frame-escaped',
      '.VIpgJd-ZVi9od-ORHb-OEVmcd',
      '.VIpgJd-ZVi9od-aZ2wEe-wOHMyf',
      '.VIpgJd-ZVi9od-xl07Ob-OEVmcd',
      '.goog-te-menu-frame',
      'iframe.goog-te-menu-frame',
      'div[id*="goog-gt-"]'
    ];

    const killBanners = () => {
      try {
        selectors.forEach(sel => {
          const els = document.querySelectorAll(sel);
          els.forEach(el => {
            // Keep the clean widget inside settings modal visible
            if (el.closest && (el.closest('#google_translate_element_visible') || el.closest('#systemSettingsModal') || el.closest('#google_translate_element_hidden'))) {
              return;
            }
            if (el.style.display !== 'none' || el.style.visibility !== 'hidden' || el.style.height !== '0px') {
              el.style.setProperty('display', 'none', 'important');
              el.style.setProperty('visibility', 'hidden', 'important');
              el.style.setProperty('opacity', '0', 'important');
              el.style.setProperty('height', '0px', 'important');
              el.style.setProperty('width', '0px', 'important');
              el.style.setProperty('max-height', '0px', 'important');
              el.style.setProperty('pointer-events', 'none', 'important');
              el.style.setProperty('position', 'absolute', 'important');
              el.style.setProperty('top', '-99999px', 'important');
              el.style.setProperty('left', '-99999px', 'important');
            }
          });
        });

        if (typeof window.protectIconsFromTranslation === 'function') {
          window.protectIconsFromTranslation(document.body);
        }

        if (document.body) {
          if (document.body.style.top && document.body.style.top !== '0px') {
            document.body.style.setProperty('top', '0px', 'important');
          }
          if (document.body.style.marginTop && document.body.style.marginTop !== '0px') {
            document.body.style.setProperty('margin-top', '0px', 'important');
          }
        }
        if (document.documentElement) {
          if (document.documentElement.style.top && document.documentElement.style.top !== '0px') {
            document.documentElement.style.setProperty('top', '0px', 'important');
          }
          if (document.documentElement.style.marginTop && document.documentElement.style.marginTop !== '0px') {
            document.documentElement.style.setProperty('margin-top', '0px', 'important');
          }
        }
      } catch (e) {
        // silent
      }
    };

    // Run immediately
    killBanners();

    // Fast polling
    setInterval(killBanners, 150);

    // Instant DOM observer
    if (window.MutationObserver) {
      const observer = new MutationObserver(() => {
        killBanners();
      });
      if (document.documentElement) {
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class']
        });
      }
    }
  }

  function applySavedPreferences() {
    startGoogleBannerKiller();
    // Dynamically inject Google Translate script and placeholder if not present
    if (!document.getElementById('google_translate_element_hidden') && document.body) {
      const div = document.createElement('div');
      div.id = 'google_translate_element_hidden';
      div.style.display = 'none';
      document.body.appendChild(div);
      
      window.googleTranslateElementInit = function() {
        new google.translate.TranslateElement({
          pageLanguage: 'th',
          includedLanguages: 'en,lo,my,th,zh-CN,ja,ko',
          autoDisplay: false
        }, 'google_translate_element_hidden');
      };
      
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      document.head.appendChild(script);
    }

    startNativeLanguageObserver();

    const savedFontSize = localStorage.getItem("pvt_user_font_size") || "normal";
    const savedTheme = localStorage.getItem("pvt_user_theme") || "teal";
    const savedCompact = localStorage.getItem("pvt_compact_mode") === "true";
    const savedEyeCare = localStorage.getItem("pvt_eyecare_mode") === "true";
    const savedPrivacy = localStorage.getItem("pvt_privacy_shield") === "true";
    const savedMotion = localStorage.getItem("pvt_reduced_motion") === "true";
    const savedContrast = localStorage.getItem("pvt_high_contrast") === "true";

    applyFontSizeToDoc(savedFontSize);
    applyThemeToDoc(savedTheme);
    applyCompactModeToDoc(savedCompact);
    applyEyeCareToDoc(savedEyeCare);
    applyPrivacyShieldToDoc(savedPrivacy);
    applyReducedMotionToDoc(savedMotion);
    applyHighContrastToDoc(savedContrast);
    initAutoRefreshTimer();
  }

  function applyCompactModeToDoc(enabled) {
    const root = document.documentElement;
    if (enabled) {
      root.setAttribute("data-compact-mode", "true");
      document.body?.classList?.add("compact-mode");
    } else {
      root.removeAttribute("data-compact-mode");
      document.body?.classList?.remove("compact-mode");
    }
  }

  function applyEyeCareToDoc(enabled) {
    const root = document.documentElement;
    if (enabled) {
      root.setAttribute("data-eyecare-mode", "true");
    } else {
      root.removeAttribute("data-eyecare-mode");
    }
  }

  function applyPrivacyShieldToDoc(enabled) {
    const root = document.documentElement;
    if (enabled) {
      root.setAttribute("data-privacy-shield", "true");
    } else {
      root.removeAttribute("data-privacy-shield");
    }
  }

  function applyReducedMotionToDoc(enabled) {
    const root = document.documentElement;
    if (enabled) {
      root.setAttribute("data-reduced-motion", "true");
    } else {
      root.removeAttribute("data-reduced-motion");
    }
  }

  function applyHighContrastToDoc(enabled) {
    const root = document.documentElement;
    if (enabled) {
      root.setAttribute("data-high-contrast", "true");
    } else {
      root.removeAttribute("data-high-contrast");
    }
  }

  // Auto-refresh interval initialization
  let globalRefreshIntervalId = null;
  function initAutoRefreshTimer() {
    if (globalRefreshIntervalId) {
      clearInterval(globalRefreshIntervalId);
      globalRefreshIntervalId = null;
    }
    const val = localStorage.getItem("pvt_auto_refresh") || "off";
    if (val === "off") return;
    
    const seconds = parseInt(val, 10);
    if (isNaN(seconds)) return;

    globalRefreshIntervalId = setInterval(() => {
      console.log(`[Auto-Refresh] Quietly checking feed updates at ${seconds}s interval...`);
      if (typeof window.reloadLeavesTable === "function") {
        window.reloadLeavesTable();
      } else if (typeof window.loadLeaveHistory === "function") {
        window.loadLeaveHistory();
      } else if (typeof window.fetchPendingRequests === "function") {
        window.fetchPendingRequests();
      } else if (typeof window.loadPendingLeaves === "function") {
        window.loadPendingLeaves();
      }
    }, seconds * 1000);
  }

  // 🔔 Web Audio Synthesized Sound Effects (100% Real client-side audio!)
  window.playSystemChime = function(type = "click") {
    const savedSound = localStorage.getItem("pvt_sound_enabled") !== "false";
    if (!savedSound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      if (type === "success") {
        // High-quality bright triple-tone confirmation chord
        const playTone = (freq, start, duration) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.06, start);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + duration);
        };
        playTone(523.25, ctx.currentTime, 0.4); // C5
        playTone(659.25, ctx.currentTime + 0.1, 0.4); // E5
        playTone(783.99, ctx.currentTime + 0.2, 0.5); // G5
      } else if (type === "toggle_on") {
        // Soft positive high blip
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === "toggle_off") {
        // Gentle descending click
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else {
        // Modern UI bubble click
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      }
    } catch (err) {
      console.warn("Audio not initialized or allowed", err);
    }
  };

  function applyFontSizeToDoc(sizeKey) {
    const root = document.documentElement;
    root.setAttribute("data-font-size", sizeKey);

    if (sizeKey === "large") {
      root.style.fontSize = "19px";
    } else if (sizeKey === "medium") {
      root.style.fontSize = "17.5px";
    } else {
      root.style.fontSize = "16px";
    }
  }

  function applyThemeToDoc(themeKey) {
    const theme = THEMES[themeKey] || THEMES.teal;
    const root = document.documentElement;

    root.style.setProperty("--primary", theme.primary);
    root.style.setProperty("--primary-dark", theme.primaryDark);
    root.style.setProperty("--primary-hover", theme.primaryHover);
    root.style.setProperty("--primary-soft", theme.primarySoft);
    root.style.setProperty("--primary-light", theme.primaryLight);
    root.style.setProperty("--primary-gradient", theme.gradient);
    root.setAttribute("data-theme", themeKey);

    // Update dynamically styled elements if present
    document.querySelectorAll(".sidebar-cta-btn").forEach(el => {
      el.style.background = theme.gradient;
    });
  }

  // Execute immediately
  applySavedPreferences();

  // Re-check after DOM is ready to ensure components pick it up
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applySavedPreferences);
  }

  // 🪟 2. Modal HTML Builder & Injector
  function ensureSettingsModalInDom() {
    let backdrop = document.getElementById("systemSettingsModal");
    if (backdrop) return backdrop;

    backdrop = document.createElement("div");
    backdrop.id = "systemSettingsModal";
    backdrop.className = "settings-modal-backdrop";
    backdrop.innerHTML = `
      <div class="settings-modal-box" role="dialog" aria-modal="true" aria-labelledby="settingsModalTitle">
        
        <!-- Header -->
        <div class="settings-modal-header">
          <div class="settings-header-title-wrap">
            <div class="settings-header-icon">
              <img src="/assets/icons/settings.svg" alt="ตั้งค่า" style="width: 24px; height: 24px; border-radius: 6px; object-fit: contain;" />
            </div>
            <div>
              <h3 class="settings-modal-title" id="settingsModalTitle">การตั้งค่าระบบ (Settings)</h3>
              <p class="settings-modal-subtitle">ปรับแต่งขนาดตัวอักษร ธีมสี และการเชื่อมต่อ LINE</p>
            </div>
          </div>
          <button type="button" class="settings-modal-close-btn" onclick="closeSystemSettingsModal()" title="ปิดหน้าต่าง">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Body -->
        <div class="settings-modal-body">
          
          <!-- Card 1: ขนาดตัวอักษร -->
          <div class="setting-card-item">
            <div class="setting-item-head">
              <span class="setting-item-icon material-symbols-outlined" style="color: #3b82f6; font-size: 28px;">text_format</span>
              <div class="setting-item-info">
                <h4>ขนาดตัวอักษรและการแสดงผล (Font Size)</h4>
                <p>เลือกขนาดข้อความที่เหมาะกับสายตาของคุณ เพื่อการอ่านที่สะดวกสบาย</p>
              </div>
            </div>

            <div class="font-size-options-grid">
              <button type="button" class="font-size-btn" id="fontBtnNormal" onclick="changeSystemFontSize('normal')">
                <span class="font-size-sample" style="font-size: 15px;">กขค</span>
                <span class="font-size-label">มาตรฐาน (100%)</span>
              </button>
              <button type="button" class="font-size-btn" id="fontBtnMedium" onclick="changeSystemFontSize('medium')">
                <span class="font-size-sample" style="font-size: 18px;">กขค</span>
                <span class="font-size-label">ปานกลาง (+12%)</span>
              </button>
              <button type="button" class="font-size-btn" id="fontBtnLarge" onclick="changeSystemFontSize('large')">
                <span class="font-size-sample" style="font-size: 21px;">กขค</span>
                <span class="font-size-label">ใหญ่พิเศษ (+25%)</span>
              </button>
            </div>

            <div class="font-preview-box" id="fontPreviewBox">
              <strong>ตัวอย่างการแสดงผล:</strong> ระบบยื่นใบลาและตรวจสอบสิทธิ์คงเหลือ ประจำปี พ.ศ. 2569 (PVT Workforce Hub)
            </div>
          </div>

          <!-- Card 2: ธีมสีของระบบ -->
          <div class="setting-card-item">
            <div class="setting-item-head">
              <span class="setting-item-icon material-symbols-outlined" style="color: #f43f5e; font-size: 28px;">palette</span>
              <div class="setting-item-info">
                <h4>ธีมและโทนสีของระบบ (Color Themes)</h4>
                <p>เปลี่ยนเฉดสีหลักของแอปพลิเคชันตามความชอบ</p>
              </div>
            </div>

            <div class="theme-options-grid" id="themeOptionsGrid">
              <!-- Rendered via JS -->
            </div>
          </div>

          <!-- Card 3: เชื่อมต่อ LINE -->
          <div class="setting-card-item">
            <div class="setting-item-head">
              <span class="setting-item-icon material-symbols-outlined" style="color: #10b981; font-size: 28px;">forum</span>
              <div class="setting-item-info">
                <h4>การแจ้งเตือนผ่าน LINE (LINE Notification)</h4>
                <p>รับข้อความแจ้งเตือนผลการอนุมัติใบลาและสถานะคำขอตรงสู่มือถือ</p>
              </div>
            </div>

            <div class="line-status-banner">
              <div class="line-status-left">
                <img src="/assets/icons/line.svg" alt="LINE" style="width: 28px; height: 28px; object-fit: contain;" />
                <div class="line-status-text">
                  <h5 id="lineStatusTitle">สถานะ: กำลังตรวจสอบ...</h5>
                  <p id="lineStatusDesc">ผูกบัญชีเพื่อรับการแจ้งเตือนทันที</p>
                </div>
              </div>
              <button type="button" class="btn-line-cta" onclick="requestLineTokenFromSettings()">
                <span class="material-symbols-outlined" style="font-size: 18px;">link</span>
                ขอรหัสผูก LINE
              </button>
            </div>

            <div style="margin-top: 4px;">
              <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">
                หรือระบุ LINE User ID โดยตรง:
              </label>
              <div class="line-manual-box">
                <input type="text" id="settingsLineIdInput" class="line-manual-input" placeholder="เช่น U1234567890abcdef..." />
                <button type="button" class="line-manual-save-btn" onclick="saveLineIdFromSettings()">
                  บันทึก ID
                </button>
              </div>
            </div>
          </div>

          <!-- Card 4.5: Google Magic Translate (ช่วยแปลอัตโนมัติ) -->
          <div class="setting-card-item magic-translate-card" style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #cbd5e1; border-left: 4px solid #3b82f6;">
            <div class="setting-item-head">
              <span class="setting-item-icon material-symbols-outlined" style="color: #a855f7; font-size: 28px;">auto_awesome</span>
              <div class="setting-item-info">
                <h4 style="color: #1e293b;">ตัวช่วยแปลภาษาอัตโนมัติ (Google Magic Translate)</h4>
                <p>หากภาษาในระบบยังไม่ครอบคลุม คุณสามารถใช้ระบบแปลอัตโนมัติของ Google แทนได้ทันที</p>
              </div>
            </div>
            <div style="margin-top: 10px; padding: 12px; background: white; border-radius: 10px; border: 1px dashed #cbd5e1; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; min-height: 52px;">
              <div style="font-size: 13px; color: #475569; display: flex; align-items: center; gap: 6px; min-width: 150px;">
                <span class="material-symbols-outlined" style="font-size: 18px; color: #3b82f6;">tips_and_updates</span>
                เลือกภาษาที่ต้องการแปล:
              </div>
              <div id="google_translate_element_visible" style="display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0; min-height: 36px;"></div>
            </div>
            <p style="font-size: 11px; color: #64748b; margin-top: 8px; line-height: 1.4;">
              💡 <b>คำแนะนำ:</b> เพื่อผลลัพธ์ที่ดีที่สุด ควรตั้งค่า "ภาษาที่ใช้งานในระบบ" เป็น <b>ภาษาไทย</b> ก่อนใช้ตัวช่วยแปลนี้
            </p>
          </div>

          <!-- Card 4: ภาษาที่ใช้งานในระบบ (Language) -->
          <div class="setting-card-item">
            <div class="setting-item-head">
              <span class="setting-item-icon material-symbols-outlined" style="color: #0ea5e9; font-size: 28px;">language</span>
              <div class="setting-item-info">
                <h4>ภาษาที่ใช้งานในระบบ (System Language)</h4>
                <p>เลือกภาษาหลักสำหรับเมนูและแบบฟอร์มการทำเรื่องขอลา</p>
              </div>
            </div>

            <div class="lang-options-grid" style="grid-template-columns: repeat(4, 1fr);">
              <button type="button" class="lang-pills-btn" id="langBtnTh" onclick="changeSystemLanguage('th')">
                <span class="lang-flag">🇹🇭</span>
                <span>ภาษาไทย</span>
              </button>
              <button type="button" class="lang-pills-btn" id="langBtnLo" onclick="changeSystemLanguage('lo')">
                <span class="lang-flag">🇱🇦</span>
                <span>ພາສາລາວ</span>
              </button>
              <button type="button" class="lang-pills-btn" id="langBtnMy" onclick="changeSystemLanguage('my')">
                <span class="lang-flag">🇲🇲</span>
                <span>မြန်မာစာ</span>
              </button>
              <button type="button" class="lang-pills-btn" id="langBtnEn" onclick="changeSystemLanguage('en')">
                <span class="lang-flag">🇬🇧</span>
                <span>English</span>
              </button>
            </div>
          </div>

          <!-- Card 5: เอฟเฟกต์เสียงและระบบเตือน (Sound & Accessibility) -->
          <div class="setting-card-item">
            <div class="setting-item-head">
              <span class="setting-item-icon material-symbols-outlined" style="color: #f59e0b; font-size: 28px;">notifications</span>
              <div class="setting-item-info">
                <h4>การเข้าถึงและเสียงแจ้งเตือน (Accessibility & Sound)</h4>
                <p>เปิด/ปิดเสียงตอบสนองและเอฟเฟกต์เมื่อกดปุ่มตอบรับหรือยื่นเรื่อง</p>
              </div>
            </div>

            <div class="setting-toggle-row" style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 4px;">
              <div class="setting-toggle-info">
                <h5>เสียงตอบสนองระบบ (System Audio Chimes)</h5>
                <p>เล่นเสียงสั้นตอบรับเมื่อกดปุ่มหรือบันทึกข้อมูลสำเร็จ</p>
              </div>
              <label class="setting-switch">
                <input type="checkbox" id="settingsSoundToggle" onchange="toggleSystemSound(this.checked)">
                <span class="setting-slider"></span>
              </label>
            </div>

            <div class="setting-toggle-row">
              <div class="setting-toggle-info">
                <h5>โหมดแสดงตารางแบบกระชับ (Compact Table Layout)</h5>
                <p>ลดขนาดพิกเซลพาร์ติชันช่องว่างเพื่อแสดงข้อมูลรายชื่อตารางได้หนาแน่นขึ้น</p>
              </div>
              <label class="setting-switch">
                <input type="checkbox" id="settingsCompactToggle" onchange="toggleSystemCompactMode(this.checked)">
                <span class="setting-slider"></span>
              </label>
            </div>
          </div>

          <!-- Card 6: โหมดสุขภาพและการทำงาน (Health & Live Performance) -->
          <div class="setting-card-item">
            <div class="setting-item-head">
              <span class="setting-item-icon material-symbols-outlined" style="color: #14b8a6; font-size: 28px;">visibility</span>
              <div class="setting-item-info">
                <h4>สุขภาพและประสิทธิภาพเรียลไทม์ (Eye Care & Real-time Feed)</h4>
                <p>ควบคุมการกรองแสงและอัตราการรีเฟรชข้อมูลหน้าจอของระบบ</p>
              </div>
            </div>

            <div class="setting-toggle-row" style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 8px;">
              <div class="setting-toggle-info">
                <h5>โหมดถนอมสายตา (Eye-Care Amber Filter)</h5>
                <p>กรองแสงสีฟ้าเพื่อถนอมสายตาเมื่อทำงานช่วงเย็นหรือกะดึก</p>
              </div>
              <label class="setting-switch">
                <input type="checkbox" id="settingsEyeCareToggle" onchange="toggleSystemEyeCare(this.checked)">
                <span class="setting-slider"></span>
              </label>
            </div>

            <div class="setting-toggle-info" style="margin-top: 4px;">
              <h5>ระบบดึงข้อมูลอัปเดตอัตโนมัติ (Auto-Refresh Interval)</h5>
              <p>ดึงความเคลื่อนไหวคำขอและสถิติล่าสุดโดยอัตโนมัติ (ไม่ต้องรีเฟรชทั้งหน้า)</p>
            </div>

            <div class="lang-options-grid" style="margin-top: 8px;">
              <button type="button" class="lang-pills-btn" id="refreshBtnOff" onclick="changeAutoRefresh('off')">
                <span>ปิดระบบ</span>
              </button>
              <button type="button" class="lang-pills-btn" id="refreshBtn30" onclick="changeAutoRefresh('30')">
                <span class="live-indicator-dot"></span>
                <span>ทุก 30 วินาที</span>
              </button>
              <button type="button" class="lang-pills-btn" id="refreshBtn60" onclick="changeAutoRefresh('60')">
                <span class="live-indicator-dot" style="background-color: #3b82f6; box-shadow: 0 0 6px #3b82f6;"></span>
                <span>ทุก 1 นาที</span>
              </button>
            </div>
          </div>

          <!-- Card 7: ความเป็นส่วนตัวและความเร็ว (Privacy & Power Saver) -->
          <div class="setting-card-item">
            <div class="setting-item-head">
              <span class="setting-item-icon material-symbols-outlined" style="color: #8b5cf6; font-size: 28px;">shield</span>
              <div class="setting-item-info">
                <h4>ความปลอดภัยและการประหยัดพลังงาน (Privacy & Battery)</h4>
                <p>ตั้งค่าการอำพรางสายตาและควบคุมแอนิเมชันเพื่อประหยัดทรัพยากรเครื่อง</p>
              </div>
            </div>

            <div class="setting-toggle-row" style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 4px;">
              <div class="setting-toggle-info">
                <h5>โหมดเกราะป้องกันความเป็นส่วนตัว (Privacy Shield Blur)</h5>
                <p>เบลอตัวเลขสถิติจำนวนวันลาและข้อมูลเงินเดือนจนกว่าจะนำเมาส์ไปชี้</p>
              </div>
              <label class="setting-switch">
                <input type="checkbox" id="settingsPrivacyToggle" onchange="toggleSystemPrivacyShield(this.checked)">
                <span class="setting-slider"></span>
              </label>
            </div>

            <div class="setting-toggle-row">
              <div class="setting-toggle-info">
                <h5>โหมดประหยัดพลังงานเคลื่อนไหว (Reduced Motion)</h5>
                <p>ปิดการเคลื่อนไหวแอนิเมชันและสลับเมนูอย่างรวดเร็วเพื่อประหยัดแบตเตอรี่มือถือ</p>
              </div>
              <label class="setting-switch">
                <input type="checkbox" id="settingsMotionToggle" onchange="toggleSystemReducedMotion(this.checked)">
                <span class="setting-slider"></span>
              </label>
            </div>
          </div>

          <!-- Card 8: ระบบจัดการสำหรับผู้อนุมัติและการเข้าถึง (Approver & Accessibility) -->
          <div class="setting-card-item">
            <div class="setting-item-head">
              <span class="setting-item-icon material-symbols-outlined" style="color: #64748b; font-size: 28px;">gavel</span>
              <div class="setting-item-info">
                <h4>ขั้นตอนอนุมัติและการเข้าถึงง่าย (Approver Flow & High Contrast)</h4>
                <p>กำหนดการถามยืนยันและการเพิ่มความหนาตัวอักษรเพื่อการอ่านที่ง่ายขึ้น</p>
              </div>
            </div>

            <div class="setting-toggle-row" style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 4px;">
              <div class="setting-toggle-info">
                <h5>ระบบอนุมัติเร็วแบบคลิกเดียว (One-Click Quick Approval)</h5>
                <p>ข้ามกล่องข้อความถามย้ำเตือนของหัวหน้างานเพื่อการอนุมัติแบบทันทีด่วน</p>
              </div>
              <label class="setting-switch">
                <input type="checkbox" id="settingsConfirmToggle" onchange="toggleSystemDoubleConfirm(this.checked)">
                <span class="setting-slider"></span>
              </label>
            </div>

            <div class="setting-toggle-row">
              <div class="setting-toggle-info">
                <h5>โหมดสีความคมชัดสูงพิเศษ (High Contrast Mode)</h5>
                <p>เพิ่มน้ำหนักเส้นขอบ ตัวอักษรสีดำเข้ม และตัดสีพาสเทลเพื่อการมองเห็นที่เด่นชัด</p>
              </div>
              <label class="setting-switch">
                <input type="checkbox" id="settingsHighContrastToggle" onchange="toggleSystemHighContrast(this.checked)">
                <span class="setting-slider"></span>
              </label>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="settings-modal-footer">
          <button type="button" class="btn-settings-reset" onclick="resetSystemSettingsToDefault()">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">restart_alt</span>
            รีเซ็ตเป็นค่าเริ่มต้น
          </button>
          <button type="button" class="btn-settings-done" onclick="closeSystemSettingsModal()" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
            <img src="/assets/icons/check-circle.svg" alt="เรียบร้อย" style="width: 16px; height: 16px; object-fit: contain;" />
            เรียบร้อย
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(backdrop);

    // Close on backdrop click
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        closeSystemSettingsModal();
      }
    });

    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && backdrop.classList.contains("active")) {
        closeSystemSettingsModal();
      }
    });

    return backdrop;
  }

  // 🛠️ 3. Open Modal Handler
  window.openSystemSettingsModal = function() {
    const backdrop = ensureSettingsModalInDom();
    populateThemeButtons();
    updateFontSizeButtonsUI();
    updateLineStatusUI();
    updateSoundSwitchUI();
    updateCompactSwitchUI();
    updateLanguageButtonsUI();
    updateEyeCareSwitchUI();
    updateAutoRefreshButtonsUI();
    updatePrivacySwitchUI();
    updateMotionSwitchUI();
    updateConfirmSwitchUI();
    updateHighContrastSwitchUI();

    backdrop.classList.add("active");
    document.body.style.overflow = "hidden";
    
    // Auto-close sidebar on mobile/desktop if it is open
    if (typeof window.closeMobileSidebar === 'function') {
      window.closeMobileSidebar();
    }
    
    // Move Google Translate widget to the modal placeholder
    setTimeout(() => {
      const source = document.getElementById('google_translate_element_hidden');
      const target = document.getElementById('google_translate_element_visible');
      if (source && target) {
        // Find the actual widget inside source (it's usually the first child after init)
        const widget = source.querySelector('.skiptranslate');
        if (widget) {
          target.appendChild(widget);
        } else {
          // If not initialized yet, try to init or just move everything
          target.appendChild(source);
          source.style.display = 'block';
        }
      }
    }, 300);

    if (window.playSystemChime) {
      window.playSystemChime("click");
    }
  };

  // ❌ 4. Close Modal Handler
  window.closeSystemSettingsModal = function() {
    const backdrop = document.getElementById("systemSettingsModal");
    if (backdrop) {
      backdrop.classList.remove("active");
    }
    document.body.style.overflow = "";
    if (window.playSystemChime) {
      window.playSystemChime("click");
    }
  };

  // 🔤 5. Font Size Functions
  window.changeSystemFontSize = function(sizeKey) {
    localStorage.setItem("pvt_user_font_size", sizeKey);
    applyFontSizeToDoc(sizeKey);
    updateFontSizeButtonsUI();

    // Visual feedback
    const preview = document.getElementById("fontPreviewBox");
    if (preview) {
      if (sizeKey === "large") {
        preview.style.fontSize = "17px";
      } else if (sizeKey === "medium") {
        preview.style.fontSize = "15px";
      } else {
        preview.style.fontSize = "13px";
      }
    }
    if (window.playSystemChime) {
      window.playSystemChime("click");
    }
  };

  function updateFontSizeButtonsUI() {
    const current = localStorage.getItem("pvt_user_font_size") || "normal";
    ["normal", "medium", "large"].forEach(s => {
      const btn = document.getElementById(`fontBtn${s.charAt(0).toUpperCase() + s.slice(1)}`);
      if (btn) {
        if (s === current) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      }
    });
  }

  // 🎨 6. Theme Functions
  function populateThemeButtons() {
    const container = document.getElementById("themeOptionsGrid");
    if (!container) return;

    const currentTheme = localStorage.getItem("pvt_user_theme") || "teal";

    container.innerHTML = Object.entries(THEMES).map(([key, t]) => `
      <button type="button" class="theme-color-btn ${key === currentTheme ? 'active' : ''}" onclick="changeSystemTheme('${key}')">
        <span class="theme-swatch-circle" style="background: ${t.color};"></span>
        <div class="theme-info-wrap">
          <span class="theme-name">${t.name}</span>
          <span class="theme-desc">${t.desc}</span>
        </div>
      </button>
    `).join("");
  }

  window.changeSystemTheme = function(themeKey) {
    localStorage.setItem("pvt_user_theme", themeKey);
    applyThemeToDoc(themeKey);
    populateThemeButtons();
    if (window.playSystemChime) {
      window.playSystemChime("click");
    }
  };

  // 🌐 6.5. System Language Functions
  window.changeSystemLanguage = function(langKey) {
    const isNative = ['th', 'lo', 'my', 'en'].includes((langKey || "").toLowerCase());
    if (isNative && typeof window.purgeGoogleTranslate === "function") {
      window.purgeGoogleTranslate();
    }
    if (typeof window.setGlobalLanguage === "function") {
      window.setGlobalLanguage(langKey, false, { forceBroadcast: true });
      updateLanguageButtonsUI();
      if (window.playSystemChime) {
        window.playSystemChime("success");
      }
    } else {
      console.warn("setGlobalLanguage not found");
    }
  };

  function updateLanguageButtonsUI() {
    const currentLang = localStorage.getItem("pvt_login_lang") || localStorage.getItem("pvt_language") || "th";
    ["Th", "Lo", "My", "En"].forEach(l => {
      const btn = document.getElementById(`langBtn${l}`);
      if (btn) {
        if (l.toLowerCase() === currentLang.toLowerCase()) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      }
    });
  }

  // 🔔 6.6. Sound Settings Functions
  window.toggleSystemSound = function(enabled) {
    localStorage.setItem("pvt_sound_enabled", enabled ? "true" : "false");
    updateSoundSwitchUI();
    if (enabled && window.playSystemChime) {
      window.playSystemChime("toggle_on");
    } else if (window.playSystemChime) {
      // Just a small click before turning off completely
      window.playSystemChime("toggle_off");
    }
  };

  function updateSoundSwitchUI() {
    const isSoundEnabled = localStorage.getItem("pvt_sound_enabled") !== "false";
    const toggle = document.getElementById("settingsSoundToggle");
    if (toggle) {
      toggle.checked = isSoundEnabled;
    }
  }

  // 📐 6.7. Compact Table Layout Functions
  window.toggleSystemCompactMode = function(enabled) {
    localStorage.setItem("pvt_compact_mode", enabled ? "true" : "false");
    applyCompactModeToDoc(enabled);
    updateCompactSwitchUI();
    if (window.playSystemChime) {
      window.playSystemChime(enabled ? "toggle_on" : "toggle_off");
    }
  };

  function updateCompactSwitchUI() {
    const isCompactEnabled = localStorage.getItem("pvt_compact_mode") === "true";
    const toggle = document.getElementById("settingsCompactToggle");
    if (toggle) {
      toggle.checked = isCompactEnabled;
    }
  }

  // 👁️ 6.8. Eye-Care Filter Functions
  window.toggleSystemEyeCare = function(enabled) {
    localStorage.setItem("pvt_eyecare_mode", enabled ? "true" : "false");
    applyEyeCareToDoc(enabled);
    updateEyeCareSwitchUI();
    if (window.playSystemChime) {
      window.playSystemChime(enabled ? "toggle_on" : "toggle_off");
    }
  };

  window.updateEyeCareSwitchUI = function() {
    const isEyeCareEnabled = localStorage.getItem("pvt_eyecare_mode") === "true";
    const toggle = document.getElementById("settingsEyeCareToggle");
    if (toggle) {
      toggle.checked = isEyeCareEnabled;
    }
  };

  // 🔄 6.9. Auto-Refresh Functions
  window.changeAutoRefresh = function(val) {
    localStorage.setItem("pvt_auto_refresh", val);
    initAutoRefreshTimer();
    updateAutoRefreshButtonsUI();
    if (window.playSystemChime) {
      window.playSystemChime("success");
    }
  };

  window.updateAutoRefreshButtonsUI = function() {
    const currentVal = localStorage.getItem("pvt_auto_refresh") || "off";
    ["off", "30", "60"].forEach(v => {
      const id = v === "off" ? "refreshBtnOff" : `refreshBtn${v}`;
      const btn = document.getElementById(id);
      if (btn) {
        if (v === currentVal) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      }
    });
  };

  // 🛡️ 6.10. Privacy Shield Functions
  window.toggleSystemPrivacyShield = function(enabled) {
    localStorage.setItem("pvt_privacy_shield", enabled ? "true" : "false");
    applyPrivacyShieldToDoc(enabled);
    updatePrivacySwitchUI();
    if (window.playSystemChime) {
      window.playSystemChime(enabled ? "toggle_on" : "toggle_off");
    }
  };

  window.updatePrivacySwitchUI = function() {
    const isPrivacyEnabled = localStorage.getItem("pvt_privacy_shield") === "true";
    const toggle = document.getElementById("settingsPrivacyToggle");
    if (toggle) {
      toggle.checked = isPrivacyEnabled;
    }
  };

  // ⚡ 6.11. Reduced Motion Functions
  window.toggleSystemReducedMotion = function(enabled) {
    localStorage.setItem("pvt_reduced_motion", enabled ? "true" : "false");
    applyReducedMotionToDoc(enabled);
    updateMotionSwitchUI();
    if (window.playSystemChime) {
      window.playSystemChime(enabled ? "toggle_on" : "toggle_off");
    }
  };

  window.updateMotionSwitchUI = function() {
    const isMotionEnabled = localStorage.getItem("pvt_reduced_motion") === "true";
    const toggle = document.getElementById("settingsMotionToggle");
    if (toggle) {
      toggle.checked = isMotionEnabled;
    }
  };

  // 🤝 6.12. Double Confirm (Skip confirmation dialog if false, default to true)
  window.toggleSystemDoubleConfirm = function(enabled) {
    // Note: enabled means ONE-CLICK QUICK mode is ON, so double confirm is FALSE!
    localStorage.setItem("pvt_double_confirm", enabled ? "false" : "true");
    updateConfirmSwitchUI();
    if (window.playSystemChime) {
      window.playSystemChime(enabled ? "toggle_on" : "toggle_off");
    }
  };

  window.updateConfirmSwitchUI = function() {
    // checked = is One-click Quick Mode active (which is pvt_double_confirm === "false")
    const isQuickModeActive = localStorage.getItem("pvt_double_confirm") === "false";
    const toggle = document.getElementById("settingsConfirmToggle");
    if (toggle) {
      toggle.checked = isQuickModeActive;
    }
  };

  // 🌓 6.13. High Contrast Functions
  window.toggleSystemHighContrast = function(enabled) {
    localStorage.setItem("pvt_high_contrast", enabled ? "true" : "false");
    applyHighContrastToDoc(enabled);
    updateHighContrastSwitchUI();
    if (window.playSystemChime) {
      window.playSystemChime(enabled ? "toggle_on" : "toggle_off");
    }
  };

  window.updateHighContrastSwitchUI = function() {
    const isContrastEnabled = localStorage.getItem("pvt_high_contrast") === "true";
    const toggle = document.getElementById("settingsHighContrastToggle");
    if (toggle) {
      toggle.checked = isContrastEnabled;
    }
  };

  // 💬 7. LINE Notification Status & Actions
  function updateLineStatusUI() {
    const titleEl = document.getElementById("lineStatusTitle");
    const descEl = document.getElementById("lineStatusDesc");
    const inputEl = document.getElementById("settingsLineIdInput");

    const emp = window.currentProfile || window.currentEmpProfile;
    const lineId = emp?.line_id || "";

    if (inputEl) inputEl.value = lineId;

    if (lineId) {
      if (titleEl) {
        titleEl.textContent = "● เชื่อมต่อ LINE แล้ว";
        titleEl.style.color = "#15803d";
      }
      if (descEl) {
        descEl.textContent = `User ID: ${lineId.substring(0, 8)}... (รับแจ้งเตือนปกติ)`;
        descEl.style.color = "#166534";
      }
    } else {
      if (titleEl) {
        titleEl.textContent = "○ ยังไม่ได้ผูกบัญชี LINE";
        titleEl.style.color = "#d97706";
      }
      if (descEl) {
        descEl.textContent = "คลิกเพื่อขอรหัสเชื่อมต่อรับแจ้งเตือนใบลา";
        descEl.style.color = "#b45309";
      }
    }
  }

  window.requestLineTokenFromSettings = function() {
    if (typeof window.generateLineLinkToken === "function") {
      closeSystemSettingsModal();
      window.generateLineLinkToken();
    } else {
      window.location.href = "/pages/user/index-user.html?action=line_link";
    }
  };

  window.saveLineIdFromSettings = async function() {
    const inputEl = document.getElementById("settingsLineIdInput");
    const newLineId = inputEl ? inputEl.value.trim() : "";
    const emp = window.currentProfile || window.currentEmpProfile;

    if (!emp || !emp.id) {
      if (window.Swal) {
        Swal.fire("แจ้งเตือน", "กรุณาเข้าสู่ระบบก่อนบันทึก LINE ID", "warning");
      } else {
        alert("กรุณาเข้าสู่ระบบก่อนบันทึก LINE ID");
      }
      return;
    }

    try {
      const client = window.pvtSupabase?.getClient ? window.pvtSupabase.getClient() : (window.supabase || window.sb);
      if (!client) throw new Error("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");

      const { error } = await client
        .from("employees")
        .update({ line_id: newLineId || null })
        .eq("id", emp.id);

      if (error) throw error;

      emp.line_id = newLineId;
      updateLineStatusUI();

      if (window.Swal) {
        Swal.fire({
          icon: "success",
          title: "บันทึก LINE ID สำเร็จ!",
          text: newLineId ? "ระบบจะส่งข้อความแจ้งเตือนสถานะใบลาไปยัง LINE ของคุณ" : "ลบการเชื่อมต่อ LINE เรียบร้อย",
          confirmButtonColor: "var(--primary, #0d9488)"
        });
      } else {
        alert("บันทึก LINE ID สำเร็จ!");
      }
    } catch (err) {
      console.error("❌ Save LINE ID error:", err);
      if (window.Swal) {
        Swal.fire("เกิดข้อผิดพลาด", err.message || "ไม่สามารถบันทึกได้", "error");
      } else {
        alert("เกิดข้อผิดพลาดในการบันทึก LINE ID");
      }
    }
  };

  // 🔄 8. Reset Settings
  window.resetSystemSettingsToDefault = function() {
    localStorage.removeItem("pvt_user_font_size");
    localStorage.removeItem("pvt_user_theme");
    localStorage.removeItem("pvt_sound_enabled");
    localStorage.removeItem("pvt_compact_mode");
    localStorage.removeItem("pvt_eyecare_mode");
    localStorage.removeItem("pvt_auto_refresh");
    localStorage.removeItem("pvt_privacy_shield");
    localStorage.removeItem("pvt_reduced_motion");
    localStorage.removeItem("pvt_double_confirm");
    localStorage.removeItem("pvt_high_contrast");
    localStorage.setItem("pvt_login_lang", "th");
    localStorage.setItem("pvt_language", "th");

    applyFontSizeToDoc("normal");
    applyThemeToDoc("teal");
    applyCompactModeToDoc(false);
    applyEyeCareToDoc(false);
    applyPrivacyShieldToDoc(false);
    applyReducedMotionToDoc(false);
    applyHighContrastToDoc(false);
    initAutoRefreshTimer();
    if (typeof window.setGlobalLanguage === "function") {
      window.setGlobalLanguage("th", false, { forceBroadcast: true });
    }

    updateFontSizeButtonsUI();
    populateThemeButtons();
    updateSoundSwitchUI();
    updateCompactSwitchUI();
    updateLanguageButtonsUI();
    updateEyeCareSwitchUI();
    updateAutoRefreshButtonsUI();
    updatePrivacySwitchUI();
    updateMotionSwitchUI();
    updateConfirmSwitchUI();
    updateHighContrastSwitchUI();

    const preview = document.getElementById("fontPreviewBox");
    if (preview) preview.style.fontSize = "13px";

    if (window.playSystemChime) {
      window.playSystemChime("success");
    }

    if (window.Swal) {
      Swal.fire({
        icon: "info",
        title: "รีเซ็ตค่าเริ่มต้นเรียบร้อย",
        text: "คืนค่าขนาดตัวอักษร ธีมสี ภาษา ความเป็นส่วนตัว และโหมดการเข้าถึงทั้งหมดกลับเป็นค่ามาตรฐานแล้ว",
        timer: 1500,
        showConfirmButton: false
      });
    }
  };

  // 🌟 9. Open Admin Dashboard Modal
  window.openAdminDashboardModal = function() {
    const sessionStr = localStorage.getItem('currentUser');
    const session = sessionStr ? JSON.parse(sessionStr) : null;
    const empObj = session?.employees || session || {};
    const rawRole = String(session?.role || empObj.role || '').toLowerCase().trim();
    const isTrueAdmin = rawRole === 'admin' || rawRole === 'superadmin' || session?.employee_code === 'HR-001' || empObj.employee_code === 'HR-001';

    if (!isTrueAdmin) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'error',
          title: 'ไม่มีสิทธิ์เข้าถึง',
          text: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเข้าใช้งานหน้าคอนโซลแอดมินได้',
          confirmButtonColor: '#ef4444'
        });
      } else {
        alert('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเข้าใช้งานหน้าคอนโซลแอดมินได้');
      }
      return;
    }

    let overlay = document.getElementById("adminDashboardModalOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "adminDashboardModalOverlay";
      overlay.className = "admin-modal-overlay";
      overlay.innerHTML = `
        <div class="admin-modal-content">
          <div class="admin-modal-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="brand-icon" style="width: 28px; height: 28px; min-width: 28px; min-height: 28px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">analytics</span>
              </div>
              <div>
                <strong style="font-size: 14px; color: #0f172a;">PVT คอนโซลแอดมิน & แดชบอร์ดสถิติ</strong>
                <span style="font-size: 12px; color: #64748b; margin-left: 8px;">(โหมดป๊อปอัปสำหรับผู้ดูแลระบบ)</span>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <a href="/pages/hr/admin-dashboard.html" target="_blank" class="action-btn" style="padding: 6px 12px; font-size: 12px; text-decoration: none; border-radius: 8px; background: #f1f5f9; color: #334155; display: inline-flex; align-items: center; gap: 4px;" title="เปิดในแท็บใหม่">
                <span class="material-symbols-outlined" style="font-size: 16px;">open_in_new</span>
                <span>เปิดแท็บใหม่</span>
              </a>
              <button type="button" onclick="closeAdminDashboardModal()" style="background: #fee2e2; border: none; color: #ef4444; border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="ปิดหน้าต่าง">
                <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
              </button>
            </div>
          </div>
          <iframe src="/pages/hr/admin-dashboard.html" class="admin-modal-iframe" title="Admin Dashboard"></iframe>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    setTimeout(() => {
      overlay.classList.add("active");
    }, 10);
  };

  window.closeAdminDashboardModal = function() {
    const overlay = document.getElementById("adminDashboardModalOverlay");
    if (overlay) {
      overlay.classList.remove("active");
    }
  };

})();
