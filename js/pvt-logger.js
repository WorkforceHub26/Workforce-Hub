/**
 * 🕵️‍♂️ PVT SYSTEM TELEMETRY & DEBUG UI (เวอร์ชันใช้งานจริงระดับโปรดักชัน)
 * - ดักจับ Error หน้าบ้านทุกชนิดอัตโนมัติ
 * - ส่ง Log ไปบันทึกหลังบ้านใน Supabase ทันที
 * - มีแดชบอร์ดจิ๋วบนหน้าจอให้กดดู Log ได้เรียลไทม์
 */

const PVTLogger = {
  // ⚙️ ตั้งค่าระบบ
  config: {
    enableConsoleLog: true,
    sendToServer: true,
    showWidget: true // เปิด-ปิด หน้าต่างแดชบอร์ดจิ๋วบนจอเว็บ
  },

  // 🚀 ฟังก์ชันหลักในการบันทึก Log
  async log(level, source, eventName, message, errorInstance = null, extraContext = {}) {
    if (this._isLogging) return; // ป้องกัน infinite recursion (Maximum call stack size exceeded)
    this._isLogging = true;
    try {
      const sb = window.pvtSupabase?.getClient();
      const currentUser = sb?.auth?.user?.() || null;

      const logPayload = {
        log_level: level,
        source: source,
        event_name: eventName,
        message: message,
        stack_trace: errorInstance?.stack || errorInstance?.componentStack || null,
        context_data: {
          url: window.location.href,
          userAgent: navigator.userAgent,
          screenSize: `${window.innerWidth}x${window.innerHeight}`,
          ...extraContext
        },
        user_id: currentUser?.id || null
      };

      // 1. พ่นออกหน้า Console ปกติแบบแต่งสีให้สังเกตง่าย
      if (this.config.enableConsoleLog) {
        const colors = { INFO: '#10b981', WARN: '#f59e0b', ERROR: '#ef4444', CRITICAL: '#7c3aed' };
        console.log(`%c[${level}][${eventName}]`, `color: ${colors[level]}; font-weight: bold;`, message, errorInstance || '');
      }

      // 2. อัปเดตข้อมูลเข้าหน้าต่างแดชบอร์ดจิ๋วบนจอภาพ
      if (this.config.showWidget) {
        this._appendLogToWidget(level, eventName, message);
      }

      // 3. ยิงไปเซฟในตารางหลังบ้าน Supabase ทันทีแบบเงียบ ๆ
      if (this.config.sendToServer && sb) {
        try {
          await sb.from('hr_admin_management_logs').insert([{
            action_category: 'SYSTEM_LOG',
            action_type: String(level || 'INFO'),
            target_identifier: String(eventName || 'FRONTEND'),
            description: String(message || '').substring(0, 500),
            payload_after: logPayload
          }]);
        } catch (dbErr) {
          // เงียบไว้เพื่อไม่ให้กระทบ Flow หลัก
        }
      }
    } catch (err) {
      console.error("PVTLogger failed:", err);
    } finally {
      this._isLogging = false;
    }
  },

  // 🛠️ ฟังก์ชันทางลัดสำหรับนำไปเขียนในโค้ด
  info(event, msg, ctx = {}) { this.log('INFO', 'FRONTEND', event, msg, null, ctx); },
  warn(event, msg, ctx = {}) { this.log('WARN', 'FRONTEND', event, msg, null, ctx); },
  error(event, msg, err = null, ctx = {}) { this.log('ERROR', 'FRONTEND', event, msg, err, ctx); },

  // 🛑 ระบบเปิดสวิตช์ดักจับ Error ทั่วทั้งหน้าต่างเว็บอัตโนมัติ
  initAutomatedTracking() {
    // ดักจับ Code พังทั่วไป (เช่น ตัวแปรไม่มีอยู่จริง, พิมพ์คำสั่งผิด)
    window.addEventListener('error', (event) => {
      this.log('ERROR', 'FRONTEND', 'UNCAUGHT_EXCEPTION', event.message, event.error, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // ดักจับพวก API หรือ Supabase ยิงไม่ผ่านแล้วลืมเขียน Catch ครอบไว้
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.log('CRITICAL', 'FRONTEND', 'UNHANDLED_PROMISE_REJECTION', reason?.message || 'Promise พังกลางอากาศ', reason, {
        status: reason?.status || 'N/A'
      });
    });
  },

  // 🖥️ สร้างหน้าต่างแผงควบคุมบั๊กลอยบนหน้าจอ (UI Widget)
  _buildDebugWidget() {
    if (!this.config.showWidget) return;

    const widget = document.createElement('div');
    widget.id = 'pvt-debug-widget';
    widget.innerHTML = `
      <div id="pvt-debug-header" style="display:flex;justify-content:space-between;align-items:center;background:#1e293b;padding:8px 12px;border-top-left-radius:8px;border-top-right-radius:8px;cursor:pointer;">
        <span style="font-weight:bold;font-size:12px;">🪲 PVT SYSTEM LOGS (Real-time)</span>
        <button id="pvt-debug-toggle-btn" style="background:#334155;border:none;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;cursor:pointer;">ขยาย</button>
      </div>
      <div id="pvt-debug-body" style="display:none;max-hight:200px;overflow-y:auto;background:#0f172a;padding:8px;font-size:11px;font-family:monospace;border-bottom-left-radius:8px;border-bottom-right-radius:8px;">
        <div style="color:#64748b;margin-bottom:4px;">-- เริ่มต้นบันทึกกล่องดำ --</div>
      </div>
    `;

    // สไตล์ตกแต่งแผงควบคุมให้ลอยอยู่มุมขวาล่างเสมอ ไม่กวนหน้าเว็บหลัก
    Object.assign(widget.style, {
      position: 'fixed', bottom: '10px', right: '10px', width: '350px',
      zIndex: '99999', background: '#0f172a', color: '#f8fafc',
      fontFamily: 'sans-serif', border: '1px solid #334155', borderRadius: '8px',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
    });

    document.body.appendChild(widget);

    // ระบบกดเปิด-ปิด พับย่อหน้าต่างเก็บได้
    const header = document.getElementById('pvt-debug-header');
    const body = document.getElementById('pvt-debug-body');
    const btn = document.getElementById('pvt-debug-toggle-btn');
    
    header.addEventListener('click', () => {
      if (body.style.display === 'none') {
        body.style.display = 'block';
        btn.textContent = 'ย่อ';
      } else {
        body.style.display = 'none';
        btn.textContent = 'ขยาย';
      }
    });
  },

  // สั่งให้ Log วิ่งไปแสดงผลบนกล่องลอยบนหน้าจอ
  _appendLogToWidget(level, event, message) {
    const body = document.getElementById('pvt-debug-body');
    if (!body) return;

    const colors = { INFO: '#34d399', WARN: '#fbbf24', ERROR: '#f87171', CRITICAL: '#c084fc' };
    const logRow = document.createElement('div');
    logRow.style.marginBottom = '6px';
    logRow.style.borderBottom = '1px solid #1e293b';
    logRow.style.paddingBottom = '4px';
    logRow.innerHTML = `
      <span style="color: ${colors[level]}; font-weight:bold;">[${level}]</span> 
      <span style="color: #94a3b8;">${event}</span>: 
      <span style="color: #f1f5f9;">${message}</span>
    `;
    body.appendChild(logRow);
    body.scrollTop = body.scrollHeight; // เลื่อนหน้าต่างลงมาล่างสุดอัตโนมัติ
  }
};

// เปิดใช้งานระบบทันทีเมื่อสคริปต์ทำงาน
document.addEventListener("DOMContentLoaded", () => {
  PVTLogger.initAutomatedTracking();
  PVTLogger._buildDebugWidget();
});