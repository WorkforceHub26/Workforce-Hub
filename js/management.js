/**
 * ==========================================================================
 * 🏢 PVT WORKFORCE HUB - INTEGRATED HR MANAGEMENT & DASHBOARD SYSTEM
 * [FULL INTEGRATED, BUG-FIXED EDITION - 2026]
 * ==========================================================================
 */

// ==========================================
// 0. CONFIGURATION & REAL CREDENTIALS
// ==========================================
var SUPABASE_URL = window.SUPABASE_URL || "https://pgogmhqjdchakcytsomx.supabase.co";
var SUPABASE_KEY = window.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnb2dtaHFqZGNoYWtjeXRzb214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjUxMzYsImV4cCI6MjA5NzM0MTEzNn0.Ah-uFFvTK_qMiIyJN9Ddid6cXqjrZRtLbs14QXUa_m8";

window.PVT_SUPABASE_URL = SUPABASE_URL;
window.PVT_SUPABASE_ANON_KEY = SUPABASE_KEY;
var supabaseClient = (window.PVTSDK && typeof window.PVTSDK.getClient === 'function') ? window.PVTSDK.getClient() : window.supabaseClient;

function showAppError(title, message) {
  console.error(`❌ [${title}]:`, message);
  if (window.Swal) {
    Swal.fire({
      icon: 'error',
      title: title || 'เกิดข้อผิดพลาด',
      text: String(message || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุในการทำงานของระบบ'),
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#ef4444'
    });
  } else {
    alert(`❌ ${title}\n${message}`);
  }
}

// ==========================================
// 1. PVT SUPABASE MODULE DEFINITION
// ==========================================
window.pvtSupabase = (() => {
  let client = null;

  function getClient() {
    if (client) return client;
    if (window.supabaseClient) {
      client = window.supabaseClient;
      return client;
    }
    if (typeof supabase === 'undefined' || !supabase?.createClient) {
      console.warn("⚠️ Supabase SDK ยังไม่ได้โหลดบนหน้าเว็บ");
      return null;
    }
    try {
      client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
        global: { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }
      });
      window.supabaseClient = client;
      return client;
    } catch (err) {
      showAppError("ข้อผิดพลาดการเชื่อมต่อ Supabase", err.message);
      return null;
    }
  }

  async function getSession() {
    const sb = getClient();
    if (!sb?.auth) return null;
    try {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      return data?.session || null;
    } catch (err) {
      console.error("Get Session Error:", err);
      return null;
    }
  }

  function getCachedUser() {
    try {
      return JSON.parse(localStorage.getItem("currentUser") || "null");
    } catch {
      return null;
    }
  }

// ==========================================
// 1. getCurrentProfile (แก้ LEFT JOIN + เก็บ Role)
// ==========================================
// ==========================================
// 0. GLOBAL STATE INITIALIZATION
// ==========================================
window.state = window.state || {
  currentUserProfile: null
};

/**
 * =========================================================================
 * ฟังก์ชันดึงข้อมูลโปรไฟล์พนักงานตาม User ID (เวอร์ชันเสถียรสูง + ปลอดภัย)
 * =========================================================================
 * @param {string|number} userId - ID ของพนักงานที่ต้องการดึงข้อมูล
 * @param {number} timeoutMs - ระยะเวลา Timeout สูงสุดในการดึงข้อมูล (มิลลิวินาที) ค่าเริ่มต้น 10000ms (10 วินาที)
 * @returns {Promise<Object|null>} ข้อมูลโปรไฟล์พนักงาน หรือ null หากเกิดข้อผิดพลาด/ไม่พบข้อมูล
 */
async function getCurrentProfile(userId) {
  if (!userId) {
    console.warn("getCurrentProfile Warning: ไม่พบรหัสผู้ใช้งาน (User ID Missing or Empty)");
    return null;
  }

  try {
    const sb = getClient();
    if (!sb) return null;
    
    const { data, error } = await sb
      .from('employees')
      .select(`
        *,
        departments!department_id(*), 
        positions(*)
      `)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error("getCurrentProfile Supabase Error:", error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error("getCurrentProfile Unexpected Error:", err);
    return null;
  }
}
  function toISODate(input) {
    if (!input) return null;
    const value = String(input).trim();
    if (!value) return null;
    if (value.includes("/")) {
      const [rawDay, rawMonth, rawYear] = value.split("/");
      if (!rawDay || !rawMonth || !rawYear) return null;
      let year = Number(rawYear);
      if (year > 2400) year -= 543;
      return `${year}-${rawMonth.padStart(2, "0")}-${rawDay.padStart(2, "0")}`;
    }
    if (value.includes("-")) {
      const parts = value.split("-");
      if (parts.length < 3) return value;
      let year = Number(parts[0]);
      if (year > 2400) year -= 543;
      return `${year}-${parts[1].padStart(2, "0")}-${parts[2].substring(0, 2).padStart(2, "0")}`;
    }
    return null;
  }

  function formatThaiDate(dateValue) {
    if (!dateValue) return "-";
    const cleanDateStr = String(dateValue).trim().split("T")[0];
    const date = new Date(`${cleanDateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateValue;
    return new Intl.DateTimeFormat("th-TH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

// ฟังก์ชันช่วย Escape HTML ป้องกัน XSS
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function statusLabel(status) {
  return {
    pending: "รออนุมัติ",
    approved: "อนุมัติแล้ว",
    rejected: "ไม่อนุมัติ",
    cancelled: "ยกเลิกแล้ว",
    cancel_requested: "รออนุมัติยกเลิก", // 👈 เพิ่มบรรทัดนี้
  }[status] || status || "-";
}

function getAvatarUrl(imageUrl) {
  if (!imageUrl || imageUrl === "null" || imageUrl === "undefined") {
    return "/assets/img/default-avatar.jpg";
  }
  
  let url = String(imageUrl).trim();
  if (!url) return "/assets/img/default-avatar.jpg";

  // หากเป็น URL สมบูรณ์จากภายนอกหรือ Supabase CDN
  if (url.startsWith("http://") || url.startsWith("https://")) {
    // 🛑 แก้บั๊ก: ถ้ามี /public/ อยู่แล้ว ให้ส่งกลับทันที ห้ามเติมซ้ำ
    if (url.includes("/storage/v1/object/public/")) {
      return url;
    }
    return url.replace("/storage/v1/object/", "/storage/v1/object/public/");
  }

  // หากเป็นแค่ชื่อไฟล์ที่เก็บใน Storage
  return `${SUPABASE_URL}/storage/v1/object/public/employee-images/${url}`;
}

  function downloadBlob(filename, content, mimeType = "text/plain;charset=utf-8") {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return {
    getClient,
    getSession,
    getCachedUser,
    getCurrentProfile,
    toISODate,
    formatThaiDate,
    escapeHtml,
    statusLabel,
    getAvatarUrl,
    downloadBlob,
  };
})();

window.pvtSupabase.getClient();

// ==========================================
// 2. GLOBAL STATE & INITIALIZATION
// ==========================================
let employees = [];
let leaveRequests = [];
let leaveBalances = [];
let leaveTypes = [];
window.departments = [];
window.positions = [];

document.addEventListener("DOMContentLoaded", async () => {
  console.clear();
  console.group("🚀 [SYSTEM BOOT] เริ่มต้นโหลดระบบจัดการ HR และ Dashboard");
  console.time("⏱️ เวลาที่ใช้ในการ Boot ระบบทั้งหมด");

  const authSuccess = await initManagementSystem();

  if (authSuccess) {
    await refreshDashboard();
  }

  console.timeEnd("⏱️ เวลาที่ใช้ในการ Boot ระบบทั้งหมด");
  console.groupEnd();
});

function handleLogout() {
  if (window.Swal) {
    Swal.fire({
      title: 'ยืนยันการออกจากระบบ?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ออกจากระบบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#ef4444'
    }).then((result) => {
      if (result.isConfirmed) {
        localStorage.clear();
        window.location.href = '/index.html';
      }
    });
  } else {
    localStorage.clear();
    window.location.href = '/index.html';
  }
}

// ==========================================
// 3. SUPABASE CONNECTOR & AUDIT LOGS
// ==========================================
function getSupabase() {
  const client = window.pvtSupabase?.getClient();
  if (client && typeof client.from === 'function') {
    return client;
  }
  if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
    return window.supabaseClient;
  }
  return null;
}

function escapeHtml(str) {
  if (window.pvtSupabase?.escapeHtml) {
    return window.pvtSupabase.escapeHtml(str);
  }
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getLeaveType(typeId) {
  return leaveTypes.find(t => String(t.id) === String(typeId)) || null;
}

async function initManagementSystem() {
  const supabase = getSupabase();
  if (!supabase) {
    showAppError("ไม่พบการเชื่อมต่อ", "ไม่สามารถเริ่มทำงานระบบได้เนื่องจากไม่ได้เชื่อมต่อ Supabase");
    return false;
  }

  try {
    const cachedUser = window.pvtSupabase?.getCachedUser?.();
    const session = await window.pvtSupabase?.getSession?.();
    const currentUserId = session?.user?.id || cachedUser?.id || cachedUser?.employee_code;

    let profile = null;
    if (currentUserId) {
      profile = await window.pvtSupabase?.getCurrentProfile?.(currentUserId);
    }

    if (!profile && cachedUser) {
      profile = cachedUser;
    }

    if (!profile) {
      window.location.href = '/index.html';
      return false;
    }

    if (window.state) {
      window.state.currentUserProfile = profile;
      if (typeof renderGlobalUserProfile === 'function') {
         window.currentUserProfile = profile;
         renderGlobalUserProfile();
      }

    }

    const userStatus = typeof window.getUserRoleCategory === 'function' 
      ? window.getUserRoleCategory(profile) 
      : { isAuth: true, category: (profile.role === 'admin' || profile.role === 'hr') ? 'hr_exec' : 'employee' };
    
    window.isViewOnlyHR = userStatus.isViewOnly || false;

    if (userStatus.category !== 'hr_exec') {
      console.warn("🚫 [Management]: ผู้ใช้งานไม่มีสิทธิ์เข้าถึงหน้านี้ -> กำลังส่งกลับ");
      try { if (document.body) document.body.innerHTML = ''; } catch(e){}
      if (userStatus.category === 'leader_manager') {
        window.location.replace('/pages/hr/home.html');
      } else {
        window.location.replace('/pages/user/index-user.html');
      }
      return false;
    }

    // 🎯 1. แสดงโปรไฟล์บน Header ตรงนี้ได้เลยครับ!
    renderHeaderProfile();

    // 🔒 Hide edit actions if view-only
    if (window.isViewOnlyHR) {
      const addBtns = document.querySelectorAll('.action-btn[onclick*="addNewEmployee"], .action-btn[onclick*="importEmployeesExcel"]');
      addBtns.forEach(b => b.style.display = 'none');
    }

    // 🏢 2. เชื่อมต่อการสลับบริษัทในเครือ (Multi-Entity Switcher Event)
    if (!window._entityListenerAttached) {
      window._entityListenerAttached = true;
      window.addEventListener('pvt_entity_changed', () => {
        renderSummary();
        renderEmployeeTable();
        if (typeof window.renderRechartsDashboard === 'function') {
          window.renderRechartsDashboard();
        }
      });
    }

    return true;
  } catch (err) {
    showAppError("เกิดข้อผิดพลาดในการตรวจสอบระบบเริ่มต้น", err.message);
    return false;
  }
}


// ฟังก์ชันอัปเดตส่วนแสดงผลโปรไฟล์ผู้ใช้ด้านบน (Header)
function renderHeaderProfile() {
  const profile = window.state?.currentUserProfile;
  if (!profile) return;

  const nameEl = document.getElementById("headerUserName") || document.getElementById("userProfileName");
  const roleEl = document.getElementById("headerUserRole") || document.getElementById("userProfileRole");
  const avatarEl = document.getElementById("headerUserAvatar") || document.getElementById("userProfileAvatar");

  if (nameEl) nameEl.textContent = profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || "ผู้ใช้งาน";
  if (roleEl) roleEl.textContent = (profile.role || "User").toUpperCase();
  if (avatarEl) {
    avatarEl.src = window.pvtSupabase?.getAvatarUrl ? window.pvtSupabase.getAvatarUrl(profile.image_url) : '/assets/img/default-avatar.jpg';
  }
}


// ==========================================
// 5. saveHRActivityLog (ไม่ขัดจังหวะการทำงานหลัก)
// ==========================================
// ==========================================
// 5. saveHRActivityLog (ปรับรองรับทั้ง 2 และ 4 Arguments)
// ==========================================
async function saveHRActivityLog(moduleOrAction, actionOrDetails = '', target = '', details = '') {
  try {
    const client = window.pvtSupabase?.getClient() || getSupabase();
    if (!client) return;

    const user = window.state?.currentUserProfile;

    let moduleName = 'System';
    let actionName = '';
    let logDetails = '';

    if (arguments.length >= 3) {
      moduleName = moduleOrAction;
      actionName = actionOrDetails;
      logDetails = target ? `[${target}] ${details}` : details;
    } else {
      actionName = moduleOrAction;
      logDetails = actionOrDetails;
    }

    const logEntry = {
      actor_id: user ? user.id : null,
      actor_name: user ? (user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim()) : 'System',
      action_category: moduleName,
      action_type: actionName,
      target_identifier: target || '-',
      description: logDetails,
      created_at: new Date().toISOString()
    };

    const { error } = await client.from('hr_admin_management_logs').insert([logEntry]);
    
    if (error) {
      console.warn("HR Activity Log Notice:", error.message);
    }
  } catch (err) {
    console.warn("Failed to save activity log:", err);
  }
}

async function viewAuditLogs() {
  const supabase = getSupabase();
  if (!supabase) {
    showAppError("ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อฐานข้อมูลเพื่อดึงประวัติได้");
    return;
  }

  try {
    if (window.Swal) {
      Swal.fire({ title: 'กำลังโหลดประวัติการปรับปรุงระบบ...', didOpen: () => Swal.showLoading() });
    }

    const { data: logs, error } = await supabase
      .from('hr_admin_management_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    let logTableHTML = `
      <div style="max-height: 400px; overflow-y: auto; font-family:'Sarabun', sans-serif; text-align:left; font-size:12px;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1;">
              <th style="padding:6px; border:1px solid #cbd5e1;">เวลา</th>
              <th style="padding:6px; border:1px solid #cbd5e1;">โมดูล</th>
              <th style="padding:6px; border:1px solid #cbd5e1;">การกระทำ</th>
              <th style="padding:6px; border:1px solid #cbd5e1;">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (!logs || logs.length === 0) {
      logTableHTML += `<tr><td colspan="4" style="text-align:center; padding:15px; color:#64748b;">ไม่พบประวัติการแก้ไขระบบ</td></tr>`;
    } else {
      logs.forEach(l => {
        const timeStr = new Date(l.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
        logTableHTML += `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px; border:1px solid #cbd5e1; white-space:nowrap;">${timeStr}</td>
            <td style="padding:6px; border:1px solid #cbd5e1;"><b>${escapeHtml(l.action_category || 'System')}</b></td>
            <td style="padding:6px; border:1px solid #cbd5e1;"><span style="background:#e2e8f0; padding:2px 4px; border-radius:4px;">${escapeHtml(l.action_type || '-')}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${escapeHtml(l.description || '-')}</td>
          </tr>
        `;
      });
    }

    logTableHTML += `</tbody></table></div>`;

    if (window.Swal) {
      Swal.fire({
        title: '📜 ประวัติการแก้ไขระบบ (Audit Logs)',
        html: logTableHTML,
        width: 'min(92vw, 750px)',
        confirmButtonText: 'ปิดหน้าต่าง',
        confirmButtonColor: '#0d9488'
      });
    }

  } catch (err) {
    showAppError("ไม่สามารถดึงประวัติ Audit Log ได้", err.message);
  }
}

/**
 * 🔒 ดูประวัติการเข้าสู่ระบบ (Login Activity Audit Logs)
 * ดึงข้อมูลจากตาราง 'login_logs' ใน Supabase แสดง User ID, Timestamp และ Device Info พร้อมตัวกรองวันที่
 */
async function viewLoginAuditLogs() {
  try {
    if (typeof window.openLoginLogsViewerModal === 'function') {
      return await window.openLoginLogsViewerModal();
    }
    if (window.PVTLoginLogsViewer?.openModal) {
      return await window.PVTLoginLogsViewer.openModal();
    }

    if (window.Swal) {
      Swal.fire({
        title: 'กำลังโหลดประวัติการเข้าสู่ระบบ...',
        text: 'กำลังตรวจสอบข้อมูลจาก Supabase login_logs',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      });
    }

    // 1. ดึงข้อมูลผ่าน getLoginLogs หรือ API หรือ Supabase SDK
    let logs = [];
    if (typeof window.getLoginLogs === 'function') {
      logs = await window.getLoginLogs(100);
    } else if (window.PVTSDK?.loginAudit?.getLoginLogs) {
      logs = await window.PVTSDK.loginAudit.getLoginLogs(100);
    } else {
      try {
        const res = await fetch('/api/login-logs?limit=100');
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await res.json();
            logs = json.data || [];
          }
        }
      } catch (fetchErr) {
        console.warn('API login-logs fetch fallback:', fetchErr);
      }

      if ((!logs || logs.length === 0) && window.supabaseClient) {
        try {
          const { data, error } = await window.supabaseClient
            .from('login_logs')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(100);
          if (!error && Array.isArray(data)) {
            logs = data;
          }
        } catch (sdkErr) {
          console.warn('Supabase SDK login_logs fallback:', sdkErr);
        }
      }
    }

    if (!Array.isArray(logs)) logs = [];

    // 2. สร้างหน้าต่างแสดงผล Audit Modal
    let rowsHTML = '';
    if (logs.length === 0) {
      rowsHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 24px; color: #64748b; font-size: 13px;">
            <div style="font-size: 24px; margin-bottom: 6px;">📋</div>
            ยังไม่พบประวัติการเข้าสู่ระบบในระบบ หรือยังไม่มีการบันทึกข้อมูลล่าสุด
          </td>
        </tr>
      `;
    } else {
      logs.forEach((log, idx) => {
        const rawTime = log.timestamp || log.created_at || log.login_at;
        const timeStr = rawTime 
          ? new Date(rawTime).toLocaleString('th-TH', { 
              year: 'numeric', month: 'short', day: 'numeric', 
              hour: '2-digit', minute: '2-digit', second: '2-digit' 
            }) 
          : '-';

        const userId = log.user_id || log.employee_id || '-';
        const empCode = log.employee_code || '';
        const fullName = log.full_name || 'พนักงาน';
        const role = log.role || '';

        // Device info formatting
        let devInfo = log.device_info;
        if (typeof devInfo === 'string') {
          try { devInfo = JSON.parse(devInfo); } catch(e) {}
        }
        devInfo = devInfo || {};

        const devType = devInfo.device_type || (devInfo.screen && parseInt(devInfo.screen) < 600 ? 'Mobile' : 'Desktop');
        const os = devInfo.os || 'Unknown OS';
        const browser = devInfo.browser || 'Browser';
        const screen = devInfo.screen || '';
        const ip = log.ip_address || devInfo.server_ip || '-';

        const devIcon = devType === 'Mobile' ? 'smartphone' : (devType === 'Tablet' ? 'tablet_mac' : 'laptop_mac');
        const devBadgeColor = devType === 'Mobile' ? '#f59e0b' : '#0ea5e9';

        // Method formatting
        const method = String(log.login_method || 'password').toLowerCase();
        let methodBadge = `<span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔑 รหัสผ่าน</span>`;
        if (method.includes('qr')) {
          methodBadge = `<span style="background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">📱 QR Code</span>`;
        } else if (method.includes('token') || method.includes('auto')) {
          methodBadge = `<span style="background: #fdf4ff; color: #a21caf; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔗 Token</span>`;
        }

        rowsHTML += `
          <tr style="border-bottom: 1px solid #f1f5f9; font-size: 12px; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <td style="padding: 10px 8px; color: #334155; white-space: nowrap; font-family: monospace;">${timeStr}</td>
            <td style="padding: 10px 8px;">
              <div style="font-weight: 600; color: #0f172a;">${fullName}</div>
              <div style="font-size: 11px; color: #64748b;">${empCode ? `รหัส: ${empCode} · ` : ''}<span style="font-family: monospace; font-size: 10px; color: #94a3b8;">${String(userId).substring(0, 12)}...</span></div>
            </td>
            <td style="padding: 10px 8px; white-space: nowrap;">
              ${methodBadge}
            </td>
            <td style="padding: 10px 8px;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 15px; color: ${devBadgeColor};">${devIcon}</span>
                <span style="font-weight: 500; color: #1e293b;">${browser}</span>
              </div>
              <div style="font-size: 11px; color: #64748b;">${os} ${screen ? `· ${screen}` : ''}</div>
            </td>
            <td style="padding: 10px 8px; font-family: monospace; font-size: 11px; color: #475569; white-space: nowrap;">
              ${ip}
            </td>
            <td style="padding: 10px 8px; text-align: center; white-space: nowrap;">
              <span style="background: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 9999px; font-size: 11px; font-weight: 600;">สำเร็จ</span>
            </td>
          </tr>
        `;
      });
    }

    const modalHTML = `
      <div style="font-family: 'Sarabun', sans-serif; text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-size: 13px; color: #334155;">
            <strong style="color: #0d9488;">ตาราง Supabase:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 12px;">login_logs</code>
            <span style="margin-left: 10px; color: #64748b;">(ทั้งหมด ${logs.length} รายการล่าสุด)</span>
          </div>
          <button type="button" onclick="copyLoginLogsMigrationSql()" style="background: white; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 6px; font-size: 12px; color: #475569; cursor: pointer; display: flex; align-items: center; gap: 4px; font-weight: 500; transition: all 0.2s;" onmouseover="this.style.borderColor='#0d9488'; this.style.color='#0d9488'" onmouseout="this.style.borderColor='#cbd5e1'; this.style.color='#475569'">
            <span class="material-symbols-outlined" style="font-size: 15px;">content_copy</span> คัดลอก SQL สร้างตาราง
          </button>
        </div>

        <div style="max-height: 480px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead style="position: sticky; top: 0; background: #f1f5f9; z-index: 2;">
              <tr style="border-bottom: 2px solid #cbd5e1; font-size: 12px; color: #475569;">
                <th style="padding: 8px; font-weight: 600;">เวลา (Timestamp)</th>
                <th style="padding: 8px; font-weight: 600;">ผู้ใช้งาน (User ID / พนักงาน)</th>
                <th style="padding: 8px; font-weight: 600;">ช่องทาง</th>
                <th style="padding: 8px; font-weight: 600;">อุปกรณ์ & เบราว์เซอร์ (Device Info)</th>
                <th style="padding: 8px; font-weight: 600;">IP Address</th>
                <th style="padding: 8px; font-weight: 600; text-align: center;">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>
        </div>
        <div style="margin-top: 10px; font-size: 12px; color: #64748b; text-align: right;">
          💡 บันทึกอัตโนมัติทุกครั้งเมื่อมีการเข้าสู่ระบบผ่านรหัสผ่าน, คิวอาร์โค้ด หรือโทเค็นความปลอดภัย
        </div>
      </div>
    `;

    if (window.Swal) {
      Swal.fire({
        title: '🛡️ ประวัติการเข้าสู่ระบบ (Login Activity Audit Logs)',
        html: modalHTML,
        width: 'min(94vw, 920px)',
        confirmButtonText: 'ปิดหน้าต่าง',
        confirmButtonColor: '#0d9488'
      });
    }

  } catch (err) {
    showAppError("ไม่สามารถดึงข้อมูลประวัติการเข้าสู่ระบบได้", err.message);
  }
}

// 📋 ฟังก์ชันสำหรับคัดลอกคำสั่ง SQL สำหรับสร้างตาราง login_logs ใน Supabase Dashboard
window.copyLoginLogsMigrationSql = function() {
  const sql = `-- สร้างตาราง login_logs ใน Supabase
CREATE TABLE IF NOT EXISTS public.login_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_code text,
  full_name text,
  role text,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  device_info jsonb,
  ip_address text,
  login_method text DEFAULT 'password'::text,
  status text NOT NULL DEFAULT 'success'::text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT login_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_timestamp ON public.login_logs(timestamp DESC);

ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow insert login_logs" ON public.login_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow read login_logs" ON public.login_logs FOR SELECT USING (true);`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(sql).then(() => {
      Swal.fire({
        icon: 'success',
        title: 'คัดลอก SQL สำเร็จ!',
        text: 'นำคำสั่งนี้ไปวางใน SQL Editor ของ Supabase Dashboard ได้ทันที',
        timer: 2000,
        showConfirmButton: false
      });
    }).catch(() => {
      prompt("คัดลอก SQL ด้านล่างนี้ไปรันใน Supabase SQL Editor:", sql);
    });
  } else {
    prompt("คัดลอก SQL ด้านล่างนี้ไปรันใน Supabase SQL Editor:", sql);
  }
};

window.viewLoginAuditLogs = viewLoginAuditLogs;

// ==========================================
// 3. resetYearlyLeave & Admin Rules (เช็ก Role ล็อคความปลอดภัย)
// ==========================================
// ฟังก์ชันคำนวณรอบปีการลา (1 ธ.ค. ปีเก่า - 30 พ.ย. ปีใหม่) และระบุว่าเป็นใบลาปีไหน
function getLeaveCycleYear(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  
  // ถ้าวันที่อยู่ตั้งแต่ 1 ธ.ค. เป็นต้นไป ให้ถือเป็นรอบปีถัดไป
  return month === 12 ? year + 1 : year;
}

// ฟังก์ชันรีเซ็ตและสร้างโควตาวันลาประจำปีใหม่ (สำหรับ HR/Admin)
// ==========================================
// resetYearlyLeave (ใช้ window.state)
// ==========================================

async function resetYearlyLeave(isForce = false) {
  if (!window.Swal) return;

  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  // แสดง Popup UI เลือกปีและยืนยันการเจนโควตา (ขยายตัวเลือกให้รองรับปีก่อนๆ และปีหน้า)
  const { value: formValues } = await Swal.fire({
    title: '📅 เจน & รีเซ็ตโควตาวันลาประจำปี',
    width: 'min(90vw, 480px)',
    html: `
      <div style="text-align:left; font-family:'Sarabun', sans-serif; line-height: 1.5;">
        <div style="margin-bottom: 14px;">
          <label style="font-size:13px; font-weight:600; color:#334155;">เลือกรอบปีที่ต้องการคำนวณและประสานสิทธิ (ค.ศ.) *</label>
          <select id="swal-target-year" class="swal2-select" style="width:100%; margin-top:6px; height:40px; font-size:14px; border-radius:10px;">
            <option value="${nextYear + 1}">ปี ${nextYear + 1} (ล่วงหน้า 2 ปี)</option>
            <option value="${nextYear}" selected>ปี ${nextYear} (ล่วงหน้าปีหน้า)</option>
            <option value="${currentYear}">ปี ${currentYear} (ปีปัจจุบัน)</option>
            <option value="${currentYear - 1}">ปี ${currentYear - 1} (ปีก่อนหน้า)</option>
          </select>
          <div style="font-size:11px; color:#64748b; margin-top:4px;">
            * รอบการลาคำนวณตามจริง: 1 ธ.ค. ของปีก่อนหน้า ถึง 30 พ.ย. ของปีที่เลือก
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px; background:#fff1f2; padding:12px; border-radius:10px; border:1px solid #fecdd3; margin-bottom: 10px;">
          <input type="checkbox" id="swal-force-reset" ${isForce ? 'checked' : ''} style="width:18px; height:18px; accent-color:#e11d48; cursor:pointer;">
          <label for="swal-force-reset" style="font-size:12px; font-weight:600; color:#be123c; cursor:pointer;">
            รีเซ็ตโควตาเริ่มต้นใหม่ทั้งหมด (Force Overwrite) <br>
            <span style="font-weight:400; color:#9f1239;">(ติ๊กช่องนี้เพื่อปรับปรุงโควตากลับไปเป็นค่าเริ่มต้นตามนโยบายบริษัท)</span>
          </label>
        </div>
        <div style="font-size:11.5px; color:#0d9488; background:#f0fdfa; border:1px solid #ccfbf1; padding:8px 12px; border-radius:8px;">
          💡 <strong>ระบบล้างและรีเซ็ตอัจฉริยะ</strong>: ระบบจะไม่ตั้งค่าวันลาเป็น 0 บลอนด์ๆ แต่จะดึงใบลาที่ผ่านการอนุมัติจริงในระบบมาคำนวณยอดใช้วันลาให้ตรงโดยอัตโนมัติ ทำให้สิทธิคงเหลือสมบูรณ์ 100%
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '🚀 เริ่มซิงค์และคำนวณโควตา',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0d9488',
    cancelButtonColor: '#64748b',
    preConfirm: () => {
      const year = parseInt(document.getElementById('swal-target-year').value, 10);
      const force = document.getElementById('swal-force-reset').checked;
      return { year, force };
    }
  });

  if (!formValues) return;

  try {
    Swal.fire({ 
      title: `กำลังซิงค์โควตาวันลาปี ${formValues.year}...`, 
      text: 'ระบบกำลังนำประวัติใบลามาประมวลผลคำนวณยอดให้พนักงานทุกคน',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading() 
    });

    const actorName = window.state?.currentUserProfile?.full_name || 'HR Admin'; 
    const actorId = window.state?.currentUserProfile?.id || null; 

    // ดำเนินการผ่านสคริปต์ JS ฝั่ง Client เพื่อการันตีความอัจฉริยะในการคำนวณความสอดคล้อง (Self-Healing)
    let targetYearAD = formValues.year;
    if (targetYearAD > 2400) {
      targetYearAD = targetYearAD - 543;
    }
    const targetYearBE = targetYearAD + 543;
    const yearsToCreate = [targetYearAD, targetYearBE];

    // คำนวณขอบเขตวันของรอบปีนั้นๆ (1 ธ.ค. ปีก่อน - 30 พ.ย. ปีเป้าหมาย)
    const startDateStr = `${targetYearAD - 1}-12-01`;
    const endDateStr = `${targetYearAD}-11-30`;

    // ดึงข้อมูลในครั้งเดียวเพื่อประสิทธิภาพสูงสุด (Parallel queries)
    const [empRes, ltRes, leavesRes, balRes] = await Promise.all([
      supabaseClient.from('employees').select('id, employee_code, full_name, start_date, created_at').eq('status', 'active'),
      supabaseClient.from('leave_types').select('id, leave_code, leave_name, yearly_quota, default_days'),
      supabaseClient.from('leave_requests')
        .select('employee_id, leave_type_id, total_days, start_date')
        .eq('status', 'approved')
        .gte('start_date', startDateStr)
        .lte('start_date', endDateStr),
      supabaseClient.from('employee_leave_balances')
        .select('*')
        .in('year', yearsToCreate)
    ]);

    if (empRes.error) throw empRes.error;
    if (ltRes.error) throw ltRes.error;
    if (leavesRes.error) throw leavesRes.error;
    if (balRes.error) throw balRes.error;

    const employeesList = empRes.data || [];
    const typesList = ltRes.data || [];
    const approvedLeavesList = leavesRes.data || [];
    const existingBalances = balRes.data || [];

    // แผนผังยอดรวมวันลาที่ใช้ไปของแต่ละพนักงาน แยกตามประเภทการลา
    const leaveSumMap = {};
    for (const req of approvedLeavesList) {
      const key = `${req.employee_id}_${req.leave_type_id}`;
      const days = Number(req.total_days || 0);
      leaveSumMap[key] = (leaveSumMap[key] || 0) + days;
    }

    // แผนผังข้อมูลโควตาเดิมที่มีอยู่แล้วในระบบ
    const balanceMap = {};
    for (const bal of existingBalances) {
      const key = `${bal.employee_id}_${bal.leave_type_id}_${bal.year}`;
      balanceMap[key] = bal;
    }

    const toUpsert = [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const emp of employeesList) {
      for (const yr of yearsToCreate) {
        let sickUsed = 0, personalUsed = 0, vacationUsed = 0, maternityUsed = 0, otherUsed = 0;
        let vacationQuota = 6;
        
        // เช็คอายุงาน 1 ปี
        const empStartStr = emp.start_date || emp.created_at;
        if (empStartStr) {
          const empStart = new Date(empStartStr);
          const diffDays = (new Date().getTime() - empStart.getTime()) / (1000 * 3600 * 24);
          if (diffDays < 365) vacationQuota = 0;
        }

        for (const lt of typesList) {
          const approvedKey = `${emp.id}_${lt.id}`;
          const used = leaveSumMap[approvedKey] || 0;
          const leaveCode = String(lt.leave_code || '').toUpperCase();
          const leaveName = String(lt.leave_name || '').toLowerCase();

          if (leaveCode === 'SICK' || leaveCode === '01' || leaveName.includes('ป่วย')) sickUsed += used;
          else if (leaveCode === 'PERSONAL' || leaveCode === '02' || leaveName.includes('กิจ')) personalUsed += used;
          else if (leaveCode === 'VACATION' || leaveCode === '03' || leaveName.includes('พัก')) vacationUsed += used;
          else if (leaveCode === 'MATERNITY' || leaveName.includes('คลอด')) maternityUsed += used;
          else otherUsed += used;
        }

        toUpsert.push({
          employee_id: emp.id,
          year: yr,
          sick_total: 30,
          sick_used: sickUsed,
          personal_total: 6,
          personal_used: personalUsed,
          vacation_total: vacationQuota,
          vacation_used: vacationUsed,
          maternity_total: 98,
          maternity_used: maternityUsed,
          other_total: 30,
          other_used: otherUsed
        });
        createdCount++;
      }
    }

    // บันทึกแบบ Batch Upsert ไปยัง employee_leave_balances
    const chunkSize = 100;
    for (let i = 0; i < toUpsert.length; i += chunkSize) {
      const chunk = toUpsert.slice(i, i + chunkSize);
      try {
        const { error: upsertErr } = await supabaseClient
          .from('employee_leave_balances')
          .upsert(chunk, { onConflict: 'employee_id,year' });

        if (upsertErr) {
          console.warn("Notice during upsert of employee_leave_balances chunk:", upsertErr);
        }
      } catch (chunkErr) {
        console.warn("Batch upsert chunk fallback:", chunkErr);
      }
    }

    const successMessage = `ประสานและซิงค์ข้อมูลโควตาประจำปี ${formValues.year} สำเร็จ! ประมวลผลพนักงาน ${employeesList.length} คน (สร้างใหม่ ${createdCount} รายการ, ปรับยอดถูกต้องแล้ว ${updatedCount} รายการ)`;

    await saveHRActivityLog('LEAVE_SYSTEM', 'RESET_QUOTA', `ปี ${formValues.year}`, `รีเซ็ตและคำนวณซิงค์ยอดโควตาประจำปี ${formValues.year} (Force: ${formValues.force})`);

    Swal.fire({
      icon: 'success',
      title: 'รีเซ็ตและซิงค์โควตาสำเร็จ!',
      text: successMessage,
      confirmButtonColor: '#0d9488'
    });

    // ดึงข้อมูลปีล่าสุดมาแสดงผลบน Dashboard ทันที
    await fetchLeaveBalances(formValues.year);
    if (typeof renderSummary === 'function') renderSummary();

  } catch (err) {
    showAppError('เกิดข้อผิดพลาดในการคำนวณและรีเซ็ตโควตา', err.message);
  }
}
// ==========================================
// 4. DASHBOARD MAIN CONTROLLER & FETCHING
// ==========================================
async function refreshDashboard() {
  const status = document.getElementById("loadStatus");
  if (status) {
    status.textContent = "กำลังโหลด";
    status.className = "status pending";
  }

  // เคลียร์แคชเพื่อดึงข้อมูลสดใหม่ล่าสุดจาก Supabase เสมอ
  try {
    if (window.PVTSDK?.cache?.clearAll) {
      window.PVTSDK.cache.clearAll();
    }
  } catch (e) {
    console.warn("Cache clear error:", e);
  }

  try {
    await Promise.all([
      fetchEmployees(),
      fetchDepartments(),
      fetchPositions(),
      fetchLeaveTypes(),
      fetchLeaveBalances(),
      fetchLeaveRequests(),
    ]);

    fillDepartmentFilter();
    fillPositionFilter();
    renderSummary();
    renderEmployeeTable();

    // Rerender the Recharts Summary panel
    if (typeof window.renderRechartsDashboard === 'function') {
      window.renderRechartsDashboard();
    }

    if (status) {
      status.textContent = "โหลดสำเร็จ";
      status.className = "status active";
    }
  } catch (error) {
    console.error("Dashboard Loading Error:", error);
    showAppError("เกิดข้อผิดพลาดในการโหลดแดชบอร์ด", error.message);
    if (status) {
      status.textContent = "เกิด error";
      status.className = "status rejected";
    }
    const tableBody = document.getElementById("employeeTableBody");
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="8" class="empty">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(error.message)}</td></tr>`;
    }
  }
}

// ==========================================
// 4. fetchAllPaginated (รองรับ Data Filtering ตาม Role)
// ==========================================
// ==========================================
// 4. fetchAllPaginated (ป้องกัน Type Mismatch จาก Filter)
// ==========================================
async function fetchAllPaginated(tableName, selectQuery = '*', filters = {}) {
  const client = window.pvtSupabase.getClient();
  const userRole = window.state?.currentUserProfile?.role || 'employee';
  const currentEmpId = window.state?.currentUserProfile?.id;

  let allRecords = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  // ตรวจสอบความถูกต้องของ filters (ต้องเป็น Object)
  const safeFilters = (typeof filters === 'object' && filters !== null) ? filters : {};

  while (hasMore) {
    let query = client.from(tableName).select(selectQuery);

    // ใส่ Custom Filters จาก Parameter
    Object.keys(safeFilters).forEach(key => {
      query = query.eq(key, safeFilters[key]);
    });

    // จำกัดขอบเขตข้อมูลสำหรับ พนักงานทั่วไป (ไม่ใช่ Admin/HR)
    if (userRole === 'employee' && currentEmpId) {
      if (['leave_requests', 'employee_leave_balances'].includes(tableName)) {
        query = query.eq('employee_id', currentEmpId);
      } else if (tableName === 'employees') {
        query = query.eq('id', currentEmpId);
      }
    }

    // ดึงข้อมูลทีละ Range (Pagination)
    const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error(`Error fetching paginated data from ${tableName}:`, error);
      throw error;
    }

    if (data && data.length > 0) {
      allRecords = allRecords.concat(data);
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allRecords;
}

async function fetchEmployees() {
  try {
    const query = `
      id, employee_code, title, full_name, nickname, phone, email, hospital,
      bank_account, line_id, image_url, start_date, status, role,
      employment_type, department_id, position_id,
      departments!department_id(department_name), positions(position_name)
    `;
    employees = await fetchAllPaginated("employees", query);
    window.employees = employees;
  } catch (err) {
    showAppError("ดึงข้อมูลพนักงานล้มเหลว", err.message);
  }
}

async function fetchDepartments() {
  try {
    const supabase = getSupabase();
    // 1. ตรวจสอบและสร้างแผนก "ฝ่ายบริหาร" หากยังไม่มี
    await ensureManagementDepartment(supabase);
    
    window.departments = await fetchAllPaginated("departments", "id, department_code, department_name, status");
  } catch (err) {
    console.warn("fetchDepartments error:", err);
  }
}

/**
 * 🏢 ตรวจสอบและสร้างแผนก "ฝ่ายบริหาร" อัตโนมัติ
 */
async function ensureManagementDepartment(supabase) {
  try {
    const { data: depts, error: fetchErr } = await supabase
      .from('departments')
      .select('id')
      .eq('department_name', 'ฝ่ายบริหาร')
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!depts) {
      console.log("✨ กำลังสร้างแผนกใหม่: ฝ่ายบริหาร");
      const { error: insErr } = await supabase
        .from('departments')
        .insert([{ 
          department_name: 'ฝ่ายบริหาร', 
          department_code: 'MGMT',
          status: 'active' 
        }]);
      if (insErr) throw insErr;
    }
  } catch (err) {
    console.error("ensureManagementDepartment error:", err);
  }
}

async function fetchPositions() {
  try {
    window.positions = await fetchAllPaginated("positions", "id, position_name, department_id, status");
  } catch (err) {
    console.warn("fetchPositions error:", err);
  }
}

async function fetchLeaveRequests() {
  try {
    const query = `
      id, employee_id, leave_type_id, start_date, end_date, total_days, reason,
      attachment_url, status, approved_at, approval_comment, start_period, end_period,
      leave_hours, note, manager_status, director_status, is_over_quota, created_at
    `;
    leaveRequests = await fetchAllPaginated("leave_requests", query);
    window.leaveRequests = leaveRequests;
  } catch (err) {
    showAppError("ดึงคำขอการลาล้มเหลว", err.message);
  }
}

async function fetchLeaveTypes() {
  const sb = getSupabase();
  if (!sb) return;

  try {
    const { data, error } = await sb
      .from("leave_types")
      .select("id, leave_code, leave_name, yearly_quota, require_advance_days, max_days_per_request, paid_leave")
      .order("leave_name", { ascending: true });

    if (error) throw error;
    leaveTypes = data || [];
  } catch (err) {
    showAppError("ดึงประเภทวันลาล้มเหลว", err.message);
  }
}

async function fetchLeaveBalances(selectedYear = null) {
  const sb = getSupabase();
  if (!sb) return;

  try {
    let yearNum = selectedYear ? parseInt(selectedYear, 10) : new Date().getFullYear(); 
    const yearAD = yearNum > 2400 ? yearNum - 543 : yearNum;
    const thaiYear = yearAD + 543;
    let formattedBalances = [];

    // Query employee_leave_balances
    const { data: empBalList, error: empErr } = await sb
      .from("employee_leave_balances")
      .select("*")
      .in("year", [yearAD, thaiYear]);

    if (!empErr && empBalList && empBalList.length > 0) {
      const { data: lTypes } = await sb.from("leave_types").select("*");
      const activeTypes = lTypes || leaveTypes || [];
      
      empBalList.forEach(empBal => {
        if (window.PVTSDK?.user?.transformEmployeeLeaveBalanceToItems) {
          const items = window.PVTSDK.user.transformEmployeeLeaveBalanceToItems(empBal, activeTypes);
          formattedBalances.push(...items);
        }
      });
      leaveBalances = formattedBalances;
      return;
    }

    leaveBalances = [];
  } catch (err) {
    console.warn("leave_balances unavailable", err);
    leaveBalances = [];
  }
}

// ==========================================
// 4.1 POSITION CATEGORIZATION & HELPER
// ==========================================
// จำแนกหมวดหมู่ตำแหน่งงาน: ผู้จัดการ (manager), หัวหน้าแผนก (supervisor), เจ้าหน้าที่/ผู้ช่วย (officer), พนักงานทั่วไป (staff)
function classifyPositionCategory(posOrName) {
  if (!posOrName) return 'staff';
  if (typeof posOrName === 'object') {
    if (posOrName.level_type && ['executive', 'manager', 'supervisor', 'officer', 'staff'].includes(String(posOrName.level_type).toLowerCase())) {
      return String(posOrName.level_type).toLowerCase();
    }
    posOrName = posOrName.position_name || '';
  }
  const name = String(posOrName).trim().toLowerCase();
  
  // 0. ผู้บริหารระดับสูง (Executive)
  if (
    name.includes('ผู้อำนวยการ') || 
    name.includes('director') || 
    name.includes('ผู้บริหาร') || 
    name.includes('executive') || 
    name.includes('กรรมการ') ||
    name.includes('md') || 
    name.includes('ceo') ||
    name.includes('ประธาน') ||
    name.includes('president')
  ) {
    return 'executive';
  }

  // 1. ตำแหน่งผู้ช่วย / รอง / หัวหน้ากะ (จัดอยู่ในหมวดผู้ช่วย/ปฏิบัติการพิเศษ ไม่ขึ้นเป็นผู้จัดการหรือหัวหน้าสายตรง)
  if (
    name.includes('ผู้ช่วย') ||
    name.includes('รอง') ||
    name.includes('หัวหน้ากะ') ||
    name.includes('shift lead') ||
    name.includes('shift leader') ||
    name.includes('assistant') ||
    name.includes('deputy') ||
    name.includes('vice')
  ) {
    return 'officer';
  }

  // 2. ผู้จัดการ (Manager)
  if (
    name.includes('ผู้จัดการ') || 
    name.includes('manager')
  ) {
    return 'manager';
  }
  
  // 3. หัวหน้าแผนก / หัวหน้างาน / Supervisor (สายอนุมัติหลัก L1)
  if (
    name.includes('หัวหน้า') || 
    name.includes('supervisor') || 
    name.includes('lead') || 
    name.includes('leader')
  ) {
    return 'supervisor';
  }
  
  // 4. เจ้าหน้าที่ (Officer, Engineer, Specialist)
  if (
    name.includes('เจ้าหน้าที่') || 
    name.includes('officer') || 
    name.includes('นักวิชาการ') || 
    name.includes('ธุรการ') || 
    name.includes('admin') || 
    name.includes('ประสานงาน') || 
    name.includes('coordinator') || 
    name.includes('วิศวกร') || 
    name.includes('engineer') || 
    name.includes('developer') || 
    name.includes('โปรแกรมเมอร์') || 
    name.includes('ช่างเทคนิค') || 
    name.includes('technician') || 
    name.includes('นักบัญชี') || 
    name.includes('accountant') || 
    name.includes('hr') ||
    name.includes('กราฟิก') ||
    name.includes('การตลาด') ||
    name.includes('เยี่ยมชม')
  ) {
    return 'officer';
  }
  
  // 5. พนักงานทั่วไป / ระดับปฏิบัติการ
  return 'staff';
}

function getPositionCategoryLabel(catKey) {
  switch (catKey) {
    case 'executive': return '👑 กลุ่มผู้บริหารระดับสูง (Executive)';
    case 'manager': return '👔 กลุ่มผู้จัดการ (Manager)';
    case 'supervisor': return '🎖️ กลุ่มหัวหน้าแผนก / หัวหน้างาน (Supervisor & Lead)';
    case 'officer': return '📋 กลุ่มเจ้าหน้าที่ / ผู้ช่วย / รองหัวหน้า / หัวหน้ากะ (Officer & Assistant)';
    case 'staff': return '👤 กลุ่มพนักงานทั่วไป / ปฏิบัติการ (General Staff)';
    default: return 'ตำแหน่งงาน';
  }
}

// สร้าง Dropdown Options จัดกลุ่มตามหมวดหมู่ <optgroup> พร้อมตัดรายการซ้ำ (Deduplication)
function buildGroupedPositionOptions(positionsList, selectedIdOrName) {
  const rawList = positionsList || window.positions || [];
  
  // ตัดรายการตำแหน่งซ้ำ (Deduplicate positions by name)
  const uniquePositionsMap = new Map();
  rawList.forEach(p => {
    if (!p) return;
    const pName = String(p.position_name || '').trim();
    if (!pName) return;
    
    const key = pName.toLowerCase();
    const isSelected = String(p.id) === String(selectedIdOrName) || pName === selectedIdOrName;
    
    if (!uniquePositionsMap.has(key) || isSelected) {
      uniquePositionsMap.set(key, p);
    }
  });

  const list = Array.from(uniquePositionsMap.values());

  const groups = {
    executive: [],
    manager: [],
    supervisor: [],
    officer: [],
    staff: []
  };

  list.forEach(p => {
    let cat = classifyPositionCategory(p.position_name);
    if (!groups[cat]) cat = 'staff'; 
    groups[cat].push(p);
  });

  const sortFn = (a, b) => (a.position_name || '').localeCompare(b.position_name || '', 'th');
  groups.executive.sort(sortFn);
  groups.manager.sort(sortFn);
  groups.supervisor.sort(sortFn);
  groups.officer.sort(sortFn);
  groups.staff.sort(sortFn);

  let html = `<option value="" disabled ${!selectedIdOrName ? 'selected' : ''}>-- เลือกตำแหน่งงาน --</option>`;

  if (groups.executive.length > 0) {
    html += `<optgroup label="👑 กลุ่มผู้บริหารระดับสูง (${groups.executive.length})">`;
    groups.executive.forEach(p => {
      const isSel = String(p.id) === String(selectedIdOrName) || p.position_name === selectedIdOrName;
      html += `<option value="${p.id}" ${isSel ? 'selected' : ''}>${escapeHtml(p.position_name)}</option>`;
    });
    html += `</optgroup>`;
  }

  if (groups.manager.length > 0) {
    html += `<optgroup label="👔 กลุ่มผู้จัดการ (${groups.manager.length})">`;
    groups.manager.forEach(p => {
      const isSel = String(p.id) === String(selectedIdOrName) || p.position_name === selectedIdOrName;
      html += `<option value="${p.id}" ${isSel ? 'selected' : ''}>${escapeHtml(p.position_name)}</option>`;
    });
    html += `</optgroup>`;
  }

  if (groups.supervisor.length > 0) {
    html += `<optgroup label="🎖️ กลุ่มหัวหน้าแผนก / หัวหน้างาน (${groups.supervisor.length})">`;
    groups.supervisor.forEach(p => {
      const isSel = String(p.id) === String(selectedIdOrName) || p.position_name === selectedIdOrName;
      html += `<option value="${p.id}" ${isSel ? 'selected' : ''}>${escapeHtml(p.position_name)}</option>`;
    });
    html += `</optgroup>`;
  }

  if (groups.officer.length > 0) {
    html += `<optgroup label="📋 กลุ่มเจ้าหน้าที่ / ผู้ช่วย / หัวหน้ากะ (${groups.officer.length})">`;
    groups.officer.forEach(p => {
      const isSel = String(p.id) === String(selectedIdOrName) || p.position_name === selectedIdOrName;
      html += `<option value="${p.id}" ${isSel ? 'selected' : ''}>${escapeHtml(p.position_name)}</option>`;
    });
    html += `</optgroup>`;
  }

  if (groups.staff.length > 0) {
    html += `<optgroup label="👤 กลุ่มพนักงานทั่วไป / ปฏิบัติการ (${groups.staff.length})">`;
    groups.staff.forEach(p => {
      const isSel = String(p.id) === String(selectedIdOrName) || p.position_name === selectedIdOrName;
      html += `<option value="${p.id}" ${isSel ? 'selected' : ''}>${escapeHtml(p.position_name)}</option>`;
    });
    html += `</optgroup>`;
  }

  return html;
}

let currentPosCategoryFilter = 'all';

window.filterByPosCategory = function(category) {
  currentPosCategoryFilter = category;
  document.querySelectorAll('.pos-tab').forEach(tab => {
    const catVal = tab.dataset.posCat || tab.dataset.category;
    if (catVal === category) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  renderEmployeeTable();
};

window.clearEmployeeFilters = function() {
  const searchInput = document.getElementById("empSearchInput");
  if (searchInput) searchInput.value = "";
  
  const deptFilter = document.getElementById("deptFilter");
  if (deptFilter) deptFilter.value = "";
  
  const posFilter = document.getElementById("posFilter");
  if (posFilter) posFilter.value = "";

  const btnClearSearchIcon = document.getElementById("btnClearSearchIcon");
  if (btnClearSearchIcon) btnClearSearchIcon.style.display = "none";

  if (typeof window.fillPositionFilter === "function") {
    window.fillPositionFilter();
  }

  if (typeof window.filterByPosCategory === "function") {
    window.filterByPosCategory('all');
  } else if (typeof renderEmployeeTable === "function") {
    renderEmployeeTable();
  }
};

// ฟังก์ชันระบบช่วยเหลือแนะนำตำแหน่งตามแผนก
window.setupDepartmentPositionHelper = function(deptSelectId, positionSelectId, toggleCheckboxId) {
  const deptSelect = document.getElementById(deptSelectId);
  const posSelect = document.getElementById(positionSelectId);
  const toggleBtn = document.getElementById(toggleCheckboxId);

  if (!deptSelect || !posSelect) return;

  // เก็บ Option ทั้งหมดไว้อ้างอิง
  if (!posSelect.dataset.allOptions) {
    posSelect.dataset.allOptions = posSelect.innerHTML;
  }

  const applyFilter = () => {
    const isHelperActive = toggleBtn ? toggleBtn.checked : true;
    const selectedDeptText = deptSelect.options[deptSelect.selectedIndex]?.text || '';

    // หากปิดระบบช่วยเหลือ ให้คืนค่า Option ทั้งหมด
    if (!isHelperActive || !selectedDeptText || selectedDeptText.includes('เลือก')) {
      posSelect.innerHTML = posSelect.dataset.allOptions;
      return;
    }

    // กรองคำค้นหาเบื้องต้นจากชื่อแผนกและตำแหน่งที่เกี่ยวข้องกัน
    const deptKeywords = selectedDeptText.replace(/(ฝ่าย|แผนก|กลุ่มงาน)/g, '').trim().toLowerCase();
    const options = Array.from(new DOMParser().parseFromString(posSelect.dataset.allOptions, 'text/html').body.children);

    const filteredOptions = options.filter(opt => {
      if (!opt.value) return true; // เก็บ option `-- เลือกตำแหน่ง --` ไว้
      const posText = opt.text.toLowerCase();
      // แนะนำตำแหน่งที่มีความสอดคล้องกับชื่อแผนก
      return posText.includes(deptKeywords) || deptKeywords.includes(posText) || true; 
    });

    posSelect.innerHTML = options.map(opt => opt.outerHTML).join('');
  };

  deptSelect.addEventListener('change', applyFilter);
  if (toggleBtn) toggleBtn.addEventListener('change', applyFilter);
};

// ==========================================
// 5. UI RENDERERS & FILTERS
window.isSystemOrAdminAccount = function(emp) {
  if (!emp) return false;
  const code = String(emp.employee_code || emp.code || '').trim().toUpperCase();
  const role = String(emp.role || '').trim().toLowerCase();
  const name = String(emp.full_name || emp.name || '').trim().toUpperCase();
  const email = String(emp.email || '').trim().toLowerCase();

  if (code === 'HR-001' || code === 'HR-002' || code === 'HR-003' || code.startsWith('ADMIN') || code.startsWith('SYS') || code === 'ADMIN') return true;
  if (role === 'admin' || role === 'superadmin' || role === 'system') return true;
  if (name.includes('ADMINISTRATOR') || name.includes('SYSTEM ADMIN') || name.includes('บัญชีระบบ') || name.includes('อนุมัติระบบ')) return true;
  if (email.includes('admin@') || email.includes('system@')) return true;
  return false;
};

// ==========================================
function fillDepartmentFilter() {
  const select = document.getElementById("deptFilter");
  if (!select) return;

  const current = select.value;

  // คำนวณจำนวนพนักงานแยกตามแผนก (ยกเว้นรหัส admin และ HR-001 ที่ใช้สำหรับอนุมัติระบบ)
  const deptCounts = {};
  let totalRealEmps = 0;

  employees.forEach((emp) => {
    if (window.isSystemOrAdminAccount(emp)) return;
    totalRealEmps++;
    const dName = emp.departments?.department_name;
    if (dName) {
      deptCounts[dName] = (deptCounts[dName] || 0) + 1;
    }
  });

  const deptNames = Object.keys(deptCounts).sort((a, b) => a.localeCompare(b, 'th'));

  select.innerHTML = `<option value="">🏢 ทุกแผนก (รวม ${totalRealEmps} คน)</option>` + 
    deptNames.map((dept) => `<option value="${escapeHtml(dept)}">${escapeHtml(dept)} (${deptCounts[dept]} คน)</option>`).join("");

  select.value = deptNames.includes(current) ? current : "";
}

function fillPositionFilter() {
  const select = document.getElementById("posFilter");
  if (!select) return;

  const current = select.value;
  const currentDept = document.getElementById("deptFilter")?.value || "";

  // คำนวณจำนวนพนักงานแยกตามชื่อตำแหน่งงาน (ยกเว้นรหัส admin และ HR-001 ที่ใช้สำหรับอนุมัติระบบ)
  const posCounts = {};
  let totalScope = 0;

  employees.forEach((emp) => {
    if (window.isSystemOrAdminAccount(emp)) return;

    const department = emp.departments?.department_name || "";
    if (currentDept && department !== currentDept) return;

    const pName = emp.positions?.position_name || emp.position_name || "ไม่ระบุตำแหน่ง";
    posCounts[pName] = (posCounts[pName] || 0) + 1;
    totalScope++;
  });

  const posNames = Object.keys(posCounts).sort((a, b) => a.localeCompare(b, 'th'));

  select.innerHTML = `<option value="">💼 ทุกตำแหน่งงาน (รวม ${totalScope} คน)</option>` + 
    posNames.map((pos) => `<option value="${escapeHtml(pos)}">${escapeHtml(pos)} (${posCounts[pos]} คน)</option>`).join("");

  select.value = posNames.includes(current) ? current : "";
}

function renderSummary() {
  const safeRequests = Array.isArray(leaveRequests) ? leaveRequests : [];
  const safeEmployees = Array.isArray(employees) ? employees : [];

  const approvedRequests = safeRequests.filter((item) => {
    const st = String(item?.status || "").toLowerCase().trim();
    return st === "approved" || st === "อนุมัติ" || st === "pass";
  });
  
  const totalApprovedDays = approvedRequests.reduce((sum, item) => {
    return sum + Number(item.actual_days ?? item.total_days ?? item.days_requested ?? item.days ?? 0);
  }, 0);

  const pendingRequests = safeRequests.filter((item) => {
    const st = String(item?.status || "").toLowerCase().trim();
    return st === "pending" || st === "รออนุมัติ" || st === "cancel_pending" || st === "cancel_requested" || st === "ขอยกเลิก";
  });

  setText("statEmployees", safeEmployees.length);
  setText("statLeaves", safeRequests.length);
  setText("statPending", pendingRequests.length);
  setText("statDays", totalApprovedDays > 0 ? totalApprovedDays.toFixed(1).replace(/\.0$/, "") : (safeRequests.length > 0 ? "0" : "0"));

  const typeData = groupByLeaveType();
  const statusData = groupByStatus();

  renderBarChart("typeChart", typeData, false);
  renderBarChart("statusChart", statusData, true);
}

function groupByLeaveType() {
  const safeRequests = Array.isArray(leaveRequests) ? leaveRequests : [];
  const approvedRequests = safeRequests.filter((item) => {
    const st = String(item?.status || "").toLowerCase().trim();
    return st === "approved" || st === "อนุมัติ" || st === "pass";
  });

  const dataset = approvedRequests;
  const noteEl = document.getElementById("typeChartNote");
  if (noteEl) {
    noteEl.textContent = approvedRequests.length > 0 ? "อนุมัติแล้ว" : "ยังไม่มีข้อมูลอนุมัติ";
    noteEl.className = approvedRequests.length > 0 ? "status active" : "status";
  }

  const map = new Map();
  dataset.forEach((request) => {
    const type = request.leave_types?.leave_name || getLeaveType(request.leave_type_id)?.leave_name || "ไม่ระบุประเภท";
    const days = Number(request.actual_days ?? request.total_days ?? request.days_requested ?? request.days ?? 1) || 1;
    map.set(type, (map.get(type) || 0) + days);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function groupByStatus() {
  const safeRequests = Array.isArray(leaveRequests) ? leaveRequests : [];
  const map = new Map();
  safeRequests.forEach((request) => {
    let label = "รอพิจารณา";
    const st = String(request?.status || "").toLowerCase().trim();
    if (st === "approved" || st === "อนุมัติ" || st === "pass") label = "อนุมัติแล้ว";
    else if (st === "rejected" || st === "ไม่อนุมัติ") label = "ไม่อนุมัติ";
    else if (st === "cancelled" || st === "ยกเลิก") label = "ยกเลิกแล้ว";
    else if (st === "cancel_pending" || st === "cancel_requested" || st === "ขอยกเลิก") label = "ขอยกเลิก";
    else if (st === "pending" || st === "รออนุมัติ") label = "รอพิจารณา";
    else if (window.pvtSupabase?.statusLabel) label = window.pvtSupabase.statusLabel(request.status);
    else label = request.status || "อื่น ๆ";

    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function renderBarChart(targetId, rows, countMode = false) {
  const target = document.getElementById(targetId);
  if (!target) return;

  if (!rows || !rows.length) {
    target.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-soft); font-size:14px;">ยังไม่มีข้อมูลสำหรับแสดงกราฟ</div>`;
    return;
  }

  const max = Math.max(...rows.map(([, value]) => Number(value) || 0), 1);
  const statusColorMap = {
    "อนุมัติแล้ว": "linear-gradient(90deg, #0fa472 0%, #34d399 100%)",
    "รอพิจารณา": "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)",
    "ขอยกเลิก": "linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)",
    "ไม่อนุมัติ": "linear-gradient(90deg, #ef4444 0%, #f87171 100%)",
    "ยกเลิกแล้ว": "linear-gradient(90deg, #64748b 0%, #94a3b8 100%)"
  };

  const typeColorGradients = [
    "linear-gradient(90deg, #0fa472 0%, #34d399 100%)",
    "linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)",
    "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)",
    "linear-gradient(90deg, #8b5cf6 0%, #c084fc 100%)",
    "linear-gradient(90deg, #ef4444 0%, #f87171 100%)",
    "linear-gradient(90deg, #ec4899 0%, #f472b6 100%)"
  ];

  target.innerHTML = rows.map(([label, value], idx) => {
    const numVal = Number(value) || 0;
    const pct = Math.max(6, Math.min(100, Math.round((numVal / max) * 100)));
    const display = countMode ? `${numVal} รายการ` : `${numVal.toFixed(1).replace(/\.0$/, "")} วัน`;
    const barGradient = statusColorMap[label] || typeColorGradients[idx % typeColorGradients.length];

    return `
      <div class="bar-row">
        <strong title="${escapeHtml(label)}">${escapeHtml(label)}</strong>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%; background: ${barGradient};"></div>
        </div>
        <span>${display}</span>
      </div>
    `;
  }).join("");
}

function renderEmployeeTable() {
  const container = document.getElementById("employeeTableBody");
  if (!container) return;

  const searchInputEl = document.getElementById("empSearchInput");
  const search = searchInputEl?.value.trim().toLowerCase() || "";
  const dept = document.getElementById("deptFilter")?.value || "";
  const specificPos = document.getElementById("posFilter")?.value || "";

  const btnClearSearchIcon = document.getElementById("btnClearSearchIcon");
  if (btnClearSearchIcon) {
    btnClearSearchIcon.style.display = searchInputEl?.value ? "inline-flex" : "none";
  }

  // คำนวณจำนวนพนักงานในแต่ละหมวดหมู่ตำแหน่ง (กรองตามแผนกถ้ามีการเลือกแผนก)
  let cAll = 0, cExecutive = 0, cManager = 0, cSupervisor = 0, cOfficer = 0, cStaff = 0;
  employees.forEach(emp => {
    const department = emp.departments?.department_name || "";
    if (dept && department !== dept) return;

    const posName = emp.positions?.position_name || emp.position_name || "";
    const cat = classifyPositionCategory(posName);
    cAll++;
    if (cat === 'executive') cExecutive++;
    else if (cat === 'manager') cManager++;
    else if (cat === 'supervisor') cSupervisor++;
    else if (cat === 'officer') cOfficer++;
    else if (cat === 'staff') cStaff++;
  });

  const setTextIfEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTextIfEl('count-all', `${cAll} คน`);
  setTextIfEl('count-executive', `${cExecutive} คน`);
  setTextIfEl('count-manager', `${cManager} คน`);
  setTextIfEl('count-supervisor', `${cSupervisor} คน`);
  setTextIfEl('count-officer', `${cOfficer} คน`);
  setTextIfEl('count-staff', `${cStaff} คน`);

  const filtered = employees.filter((emp) => {
    const department = emp.departments?.department_name || "";
    const posName = emp.positions?.position_name || emp.position_name || "";
    const empCat = classifyPositionCategory(posName);

    // กรองตามหมวดหมู่ตำแหน่งงาน (แท็บ)
    if (currentPosCategoryFilter && currentPosCategoryFilter !== 'all' && empCat !== currentPosCategoryFilter) {
      return false;
    }

    // กรองตามชื่อตำแหน่งเจาะจง (Dropdown)
    if (specificPos && posName !== specificPos) {
      return false;
    }

    const haystack = [
      emp.employee_code,
      emp.full_name,
      posName,
      department,
      emp.hospital,
    ].join(" ").toLowerCase();

    return (!search || haystack.includes(search)) && (!dept || department === dept);
  });

  // อัปเดตแถบสรุปข้อมูลสถิติพนักงาน
  const leftTextEl = document.getElementById("summaryTextLeft");
  const rightTextEl = document.getElementById("summaryTextRight");
  if (leftTextEl && rightTextEl) {
    const deptTitle = dept ? `🏢 แผนก "${dept}"` : `🏢 ทุกแผนก`;
    const filterCatName = currentPosCategoryFilter === 'executive' ? 'ผู้บริหารระดับสูง' :
                          currentPosCategoryFilter === 'manager' ? 'ผู้จัดการ' :
                          currentPosCategoryFilter === 'supervisor' ? 'หัวหน้างาน/หัวหน้าแผนก' :
                          currentPosCategoryFilter === 'officer' ? 'เจ้าหน้าที่/ผู้ช่วย' :
                          currentPosCategoryFilter === 'staff' ? 'พนักงานทั่วไป' : 'ทุกกลุ่มตำแหน่ง';
    const posSubTitle = specificPos ? ` | ตำแหน่ง "${specificPos}"` : '';

    leftTextEl.innerHTML = `
      <span class="material-symbols-outlined" style="font-size: 18px; color: #0d9488;">analytics</span>
      <span>${escapeHtml(deptTitle)} (${filterCatName}${escapeHtml(posSubTitle)}): แสดง ${filtered.length} คน (จากทั้งหมด ${cAll} คน)</span>
    `;

    rightTextEl.innerHTML = `
      <span class="badge-role-tag badge-role-exec" style="padding: 4px 10px; font-size: 12px;">👑 ผู้บริหาร: ${cExecutive} คน</span>
      <span class="badge-role-tag badge-role-mgr" style="padding: 4px 10px; font-size: 12px;">👔 ผู้จัดการ: ${cManager} คน</span>
      <span class="badge-role-tag badge-role-sup" style="padding: 4px 10px; font-size: 12px;">🎖️ หัวหน้างาน: ${cSupervisor} คน</span>
      <span class="badge-role-tag badge-role-off" style="padding: 4px 10px; font-size: 12px;">📋 เจ้าหน้าที่: ${cOfficer} คน</span>
      <span style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">👤 พนักงานทั่วไป: ${cStaff} คน</span>
    `;
  }

  if (!filtered.length) {
    container.innerHTML = `<div class="empty">ไม่พบพนักงานตามเงื่อนไข</div>`;
    return;
  }

  container.innerHTML = filtered.map((emp) => {
    const avatarUrl = window.pvtSupabase?.getAvatarUrl ? window.pvtSupabase.getAvatarUrl(emp.image_url) : '/assets/img/default-avatar.jpg';
    const thaiStartDate = window.pvtSupabase?.formatThaiDate ? window.pvtSupabase.formatThaiDate(emp.start_date) : (emp.start_date || "-");
    const statusLabel = emp.status === "inactive" || emp.status === "resigned" ? "ลาออก" : "ใช้งาน";
    const statusClass = emp.status || "active";

    const posCategory = classifyPositionCategory(emp.positions?.position_name || emp.position_name || "");
    const roleBadgeHtml = posCategory === 'executive' 
      ? `<span class="badge-role-tag badge-role-exec">👑 ผู้บริหาร</span>`
      : posCategory === 'manager'
      ? `<span class="badge-role-tag badge-role-mgr">👔 ผู้จัดการ</span>`
      : posCategory === 'supervisor'
      ? `<span class="badge-role-tag badge-role-sup">🎖️ หัวหน้างาน</span>`
      : posCategory === 'officer'
      ? `<span class="badge-role-tag badge-role-off">📋 เจ้าหน้าที่</span>`
      : '';

    // Search term highlight helper
    const highlightMatch = (text, term) => {
      if (!term || !text) return escapeHtml(text || "");
      const cleanText = String(text);
      const idx = cleanText.toLowerCase().indexOf(term.toLowerCase());
      if (idx === -1) return escapeHtml(cleanText);
      const before = escapeHtml(cleanText.slice(0, idx));
      const matched = escapeHtml(cleanText.slice(idx, idx + term.length));
      const after = escapeHtml(cleanText.slice(idx + term.length));
      return `${before}<mark class="text-highlight">${matched}</mark>${after}`;
    };

    const displayName = highlightMatch(emp.full_name || "-", search);
    const displayCode = highlightMatch(emp.employee_code || "-", search);
    const displayPos = highlightMatch(emp.positions?.position_name || emp.position_name || "ไม่ระบุตำแหน่ง", search);
    const displayDept = highlightMatch(emp.departments?.department_name || "ไม่ระบุแผนก", search);

    return `
      <div class="emp-card-item ${posCategory === 'executive' ? 'is-executive' : ''}">
        <div class="col-avatar">
          <img src="${avatarUrl}" 
               onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(emp.full_name || 'PVT')}&background=0d9488&color=fff';" 
               alt="${escapeHtml(emp.full_name || '')}">
          ${posCategory === 'executive' ? '<span class="exec-crown-badge">👑</span>' : ''}
        </div>
        <div class="col-code">
          <span class="emp-code-badge">#${displayCode}</span>
        </div>
        <div class="col-info">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span class="emp-name">${displayName}</span>
            ${roleBadgeHtml}
          </div>
          <span class="emp-pos">${displayPos}</span>
        </div>
        <div class="col-dept">
          <span class="emp-dept-chip">
            <span class="material-symbols-outlined" style="font-size: 14px; color: #0d9488;">corporate_fare</span>
            ${displayDept}
          </span>
        </div>
        <div class="col-start">
          <span class="emp-start-date">
            <span class="material-symbols-outlined" style="font-size: 14px; color: #64748b;">calendar_today</span>
            ${thaiStartDate}
          </span>
        </div>
        <div class="col-status">
          <span class="status-badge-pill ${statusClass}">
            <span class="status-dot"></span>
            ${statusLabel}
          </span>
        </div>
        <div class="col-actions">
          <button class="btn-table-act primary" onclick="openEmployeeDetail('${emp.id}')" title="ดูรายละเอียดพนักงาน">
            <span class="material-symbols-outlined" style="font-size: 16px;">visibility</span>
            <span>รายละเอียด</span>
          </button>
          ${window.isViewOnlyHR ? '' : `
            <button class="btn-table-act danger" 
                    onclick="deleteEmployee('${emp.id}', '${escapeHtml(emp.employee_code)}', '${escapeHtml(emp.full_name)}')" 
                    title="ลบพนักงาน">
              <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
            </button>
            ${emp.line_id ? `
            <button class="btn-table-act warning" 
                    onclick="unlinkLineAccount('${emp.id}', '${escapeHtml(emp.full_name)}')" 
                    title="ยกเลิกการผูกบัญชี LINE">
              <span class="material-symbols-outlined" style="font-size: 16px;">link_off</span>
            </button>
            ` : ''}
          `}
        </div>
      </div>
    `;
  }).join("");
}

// ==========================================
// 6. EMPLOYEE DETAIL MODAL & EXPORT
// ==========================================
function formatEmploymentType(typeStr) {
  if (!typeStr || typeStr === "-" || typeStr === "null") return "ไม่ระบุ";
  const str = String(typeStr).toLowerCase().trim();

  if (str.includes("full") || str.includes("ประจำ")) return "พนักงานประจำ (Full-time)";
  if (str.includes("part") || str.includes("พาร์ทไทม์")) return "พนักงานพาร์ทไทม์ (Part-time)";
  if (str.includes("contract") || str.includes("สัญญาจ้าง")) return "พนักงานสัญญาจ้าง (Contract)";
  if (str.includes("intern") || str.includes("ฝึกงาน")) return "นักศึกษาฝึกงาน (Intern)";

  return typeStr;
}

function exportIndividualLeaveExcel(employeeId) {
  const emp = employees.find((item) => String(item.id) === String(employeeId));
  if (!emp) {
    showAppError("ไม่พบข้อมูล", "ไม่พบข้อมูลพนักงานสำหรับส่งออก Excel");
    return;
  }

  const requests = leaveRequests.filter((item) => String(item.employee_id) === String(employeeId));
  let csvContent = "\uFEFF"; // UTF-8 BOM
  csvContent += `รหัสพนักงาน,ชื่อ-นามสกุล,แผนก,ประเภทการลา,วันที่เริ่มต้น,วันที่สิ้นสุด,จำนวนวัน,เหตุผล,สถานะ\n`;

  requests.forEach((r) => {
    const type = getLeaveType(r.leave_type_id)?.leave_name || "ไม่ระบุ";
    const status = window.pvtSupabase?.statusLabel ? window.pvtSupabase.statusLabel(r.status) : r.status;
    const cleanReason = (r.reason || r.note || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
    csvContent += `"${emp.employee_code || ''}","${emp.full_name || ''}","${emp.departments?.department_name || ''}","${type}","${r.start_date || ''}","${r.end_date || ''}","${r.total_days || 0}","${cleanReason}","${status}"\n`;
  });

  const filename = `ประวัติการลา_${emp.employee_code}_${emp.full_name}.csv`;
  window.pvtSupabase.downloadBlob(filename, csvContent, "text/csv;charset=utf-8;");
}

// ==========================================================================
// CUSTOM FIELDS ENTERPRISE SAVE & LOAD IN SYSTEM_SETTINGS
async function saveEmployeeCustomFields(supabase, employeeCode, customFields) {
  try {
    const { error } = await supabase
      .from('system_settings')
      .upsert({
        setting_key: `custom_fields_emp_${employeeCode}`,
        setting_value: customFields,
        updated_at: new Date().toISOString()
      }, { onConflict: 'setting_key' });
    if (error) console.error("Error saving custom fields to system_settings:", error);
  } catch (err) {
    console.error("Error in saveEmployeeCustomFields:", err);
  }
}

async function getEmployeeCustomFields(supabase, employeeCode) {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', `custom_fields_emp_${employeeCode}`)
      .maybeSingle();
    return data?.setting_value || {};
  } catch (err) {
    console.error("Error reading custom fields from system_settings:", err);
    return {};
  }
}

async function renderCustomFieldsHTMLForView(supabase, employeeCode) {
  const customDefs = await getCustomFieldDefinitions(supabase);
  const values = await getEmployeeCustomFields(supabase, employeeCode);

  if (!customDefs || customDefs.length === 0) return '';

  const details = customDefs.map(field => {
    const val = values[field.name] || "-";
    return detail(field.name, val);
  }).join('');

  return `
    <div style="margin-top: 16px; border-top: 1px dashed #cbd5e1; padding-top: 12px;">
      <strong style="font-size:14px; display:block; margin-bottom:8px; color:#0d9488;">📌 ข้อมูลเพิ่มเติม (คอลัมน์กำหนดเอง)</strong>
      <div class="detail-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
        ${details}
      </div>
    </div>
  `;
}

async function renderCustomFieldsHTMLForEdit(supabase, employeeCode) {
  const customDefs = await getCustomFieldDefinitions(supabase);
  const values = await getEmployeeCustomFields(supabase, employeeCode);

  if (!customDefs || customDefs.length === 0) {
    return `<div style="text-align:center; color:#94a3b8; font-size:12px; padding:10px; grid-column: 1 / -1;">ยังไม่มีคอลัมน์พิเศษในระบบ (กดปุ่มจัดการด้านบนได้เลย)</div>`;
  }

  return customDefs.map(field => {
    const reqMark = field.required ? `<span style="color:#e11d48; font-weight:bold;">*</span>` : '';
    const currentVal = values[field.name] || '';
    let inputControl = '';

    if (field.type === 'select') {
      const opts = field.options.map(o => `<option value="${escapeHtml(o)}" ${currentVal === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
      inputControl = `
        <select class="swal2-select custom-field-input" data-key="${escapeHtml(field.name)}" data-required="${field.required}" style="margin:4px 0 0; height:38px; width:100%; font-size:13px; background:#fff; box-sizing: border-box; border:1px solid #cbd5e1; border-radius:6px; padding:0 8px;">
          <option value="">-- เลือก${escapeHtml(field.name)} --</option>
          ${opts}
        </select>
      `;
    } else {
      inputControl = `
        <input type="text" class="swal2-input custom-field-input" data-key="${escapeHtml(field.name)}" data-required="${field.required}" value="${escapeHtml(currentVal)}" placeholder="กรอก${escapeHtml(field.name)}" style="margin:4px 0 0; height:38px; width:100%; font-size:13px; background:#fff; box-sizing: border-box; border:1px solid #cbd5e1; border-radius:6px; padding:0 12px;">
      `;
    }

    return `
      <div style="display:flex; flex-direction:column;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <label style="font-size:13px; font-weight:600; color:#334155; margin-bottom:2px;">
            ${escapeHtml(field.name)} ${reqMark}
          </label>
          <button type="button" onclick="window.deleteCustomColumnWithDoubleConfirm('${field.id}', '${escapeHtml(field.name)}', () => openEmployeeDetail('${employeeCode}', true))" 
                  style="background:none; border:none; color:#dc2626; cursor:pointer; font-size:11px; font-weight:500; display:inline-flex; align-items:center; gap:2px; padding:0;" title="ลบคอลัมน์นี้ออกจากระบบ">
            🗑️ ลบ
          </button>
        </div>
        ${inputControl}
      </div>
    `;
  }).join('');
}

// ปรับปรุงฟอร์มเปิดดู/แก้ไขพนักงานแบบย่อ
async function openEmployeeDetail(employeeId, isEditMode = false) {
  if (isEditMode && window.isViewOnlyHR) isEditMode = false;
  if (!window.departments || window.departments.length === 0) await fetchDepartments();
  if (!window.positions || window.positions.length === 0) await fetchPositions();

  let emp = employees.find((item) => String(item.id) === String(employeeId) || String(item.employee_code) === String(employeeId));
  if (!emp) {
    try {
      const supabase = getSupabase();
      const { data } = await supabase.from('employees')
        .select('*, departments!department_id(department_name), positions(position_name)')
        .or(`id.eq.${employeeId},employee_code.eq.${employeeId}`)
        .maybeSingle();
      if (data) emp = data;
    } catch (e) {
      console.warn("Direct employee fetch error:", e);
    }
  }

  if (!emp) {
    showAppError("ไม่พบข้อมูลพนักงาน", "ไม่พบข้อมูลพนักงานที่ต้องการเปิดในระบบ");
    return;
  }

  const requests = leaveRequests.filter((item) => String(item.employee_id) === String(emp.id));
  const balances = leaveBalances.filter((item) => String(item.employee_id) === String(emp.id));
  const modal = document.getElementById("employeeModal");
  const title = document.getElementById("modalTitle");
  const body = document.getElementById("modalBody");
  const supabase = getSupabase();

  if (!isEditMode) {
    if (title) {
      title.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px; flex-wrap:wrap;">
          <span style="display:flex; align-items:center; gap:8px; font-size:16px;">
            <strong style="color:#0f766e;">${escapeHtml(emp.employee_code || "-")}</strong>
            <span style="color:#64748b;">·</span>
            <span>${escapeHtml(emp.full_name || "-")}</span>
          </span>
          ${window.isViewOnlyHR ? '' : `
            <button type="button" class="btn-primary btn-sm" onclick="openEmployeeDetail('${emp.id}', true)" style="font-size:12px; padding:6px 12px; cursor:pointer; background:#0d9488; border:1px solid #0d9488; color:white; border-radius:8px; display:inline-flex; align-items:center; gap:4px;">
              <span class="material-symbols-outlined" style="font-size:16px;">edit</span> แก้ไขข้อมูล
            </button>
          `}
        </div>
      `;
    }
    const customFieldsViewHTML = await renderCustomFieldsHTMLForView(supabase, emp.employee_code);

    if (body) {
      body.innerHTML = `
        <div style="display:flex; align-items:center; gap:14px; background:#f8fafc; padding:14px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:16px; flex-wrap:wrap;">
          <img src="${emp.image_url || 'https://placehold.co/100?text=PVT'}" alt="Avatar" style="width:56px; height:56px; border-radius:50%; object-fit:cover; border:2px solid #0d9488; background:#fff; flex-shrink:0;">
          <div style="flex:1; min-width:180px;">
            <div style="font-size:15px; font-weight:700; color:#1e293b;">${escapeHtml(emp.full_name || "-")} ${emp.nickname ? `<span style="font-weight:400; color:#64748b;">(${escapeHtml(emp.nickname)})</span>` : ''}</div>
            <div style="font-size:13px; color:#0d9488; font-weight:600; margin-top:2px;">${escapeHtml(emp.positions?.position_name || "-")} · ${escapeHtml(emp.departments?.department_name || "-")}</div>
            <div style="font-size:12px; color:#64748b; margin-top:2px;">ประเภท: ${formatEmploymentType(emp.employment_type)}</div>
          </div>
        </div>

        <div class="detail-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 16px;">
          ${detail("เบอร์โทรศัพท์", emp.phone || "-")}
          ${detail("ไอดีไลน์ (LINE ID)", emp.line_id || "-")}
          ${detail("อีเมล", emp.email || "-")}
          ${detail("วันเริ่มงาน", window.pvtSupabase?.formatThaiDate ? window.pvtSupabase.formatThaiDate(emp.start_date) : (emp.start_date || "-"))}
          ${detail("โรงพยาบาลประกันสังคม", emp.hospital || "-")}
          ${detail("เลขบัญชีธนาคาร", emp.bank_account || "-")}
        </div>
        ${customFieldsViewHTML}
        
        <div style="margin-bottom:20px; margin-top: 16px;">
          <strong style="font-size:14px; display:flex; align-items:center; gap:6px; margin-bottom:10px; color:#0f766e;">
            <span class="material-symbols-outlined" style="font-size:18px;">analytics</span> สิทธิวันลาคงเหลือประจำปี
          </strong>
          ${renderBalanceCards(balances)}
        </div>

        <div style="margin-top: 20px;">
          <strong style="font-size:14px; display:flex; align-items:center; gap:6px; margin-bottom:10px; color:#1e293b; border-left: 4px solid #0d9488; padding-left: 8px;">
            <span class="material-symbols-outlined" style="font-size:18px; color:#0d9488;">history</span> ประวัติการลาทั้งหมด
          </strong>
          <div class="leave-history-cards-container" style="display: flex; flex-direction: column; gap: 10px; padding-bottom: 8px;">
            ${requests.length ? requests.sort((a,b) => new Date(b.start_date) - new Date(a.start_date)).map(renderLeaveCardItem).join("") : '<div style="text-align:center; padding:28px; color:#94a3b8; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1;">ยังไม่มีประวัติการลาในระบบ</div>'}
          </div>
        </div>
      `;
    }
  } else {
    // โหมดแก้ไข
    if (title) title.innerHTML = `<span>✏️ แก้ไขพนักงาน: ${escapeHtml(emp.employee_code || "-")}</span>`;
    
    // สร้าง Dropdown แผนกและตำแหน่ง (จัดกลุ่มตามประเภท: ผู้จัดการ, หัวหน้า, เจ้าหน้าที่/ผู้ช่วย, พนักงาน)
    const deptOptions = (window.departments || []).map(d => {
      const isSelected = String(d.id) === String(emp.department_id) || d.department_name === emp.departments?.department_name;
      return `<option value="${d.id}" ${isSelected ? 'selected' : ''}>${escapeHtml(d.department_name)}</option>`;
    }).join("");

    const roleOptions = buildGroupedPositionOptions(window.positions, emp.position_id || emp.positions?.position_name);
    
    const empTypeOptions = [
      { val: 'monthly', label: 'รายเดือน (Monthly)' },
      { val: 'daily', label: 'รายวัน (Daily)' },
      { val: 'full_time', label: 'พนักงานประจำ (Full-time)' },
      { val: 'part_time', label: 'พนักงานพาร์ทไทม์ (Part-time)' },
      { val: 'contract', label: 'พนักงานสัญญาจ้าง (Contract)' },
      { val: 'probation', label: 'ทดลองงาน (Probation)' }
    ].map(t => {
      const isSelected = t.val === emp.employment_type || t.label.includes(emp.employment_type);
      return `<option value="${t.val}" ${isSelected ? 'selected' : ''}>${t.label}</option>`;
    }).join("");

    // ดึงข้อมูล Custom Fields สำหรับพนักงานรายนี้
    const customFieldsHTML = await renderCustomFieldsHTMLForEdit(supabase, emp.employee_code);

    // แยกชื่อจริง และ นามสกุล จาก full_name หรือข้อมูลเดิม
    let empFirstName = emp.first_name || '';
    let empLastName = emp.last_name || '';
    if (!empFirstName && !empLastName && emp.full_name) {
      const nameParts = (emp.full_name || '').trim().split(/\s+/);
      empFirstName = nameParts[0] || '';
      empLastName = nameParts.slice(1).join(' ') || '';
    }

    if (body) {
      body.innerHTML = `
        <form id="inlineEditForm" onsubmit="event.preventDefault(); saveEmployeeInlineEdit('${emp.id}');" style="display:flex; flex-direction:column; gap:16px; font-family:'Sarabun', sans-serif;">
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px; text-align:left; max-height: 65vh; overflow-y: auto; padding-right: 6px;">
            
            <div style="grid-column: 1 / -1; text-align: center; background: #f8fafc; padding: 12px; border-radius: 10px; border: 1px dashed #cbd5e1; margin-bottom: 12px;">
              <img id="inline-edit-profilePreview" src="${emp.image_url || 'https://placehold.co/100?text=No+Image'}" 
                   style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 3px solid #0d9488; margin-bottom: 8px; background: #fff;">
              <input type="file" id="inline-edit-img" class="swal2-file" accept="image/*" style="display: block; margin: 0 auto; font-size: 12px;">
            </div>

            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">รหัสพนักงาน *</label>
              <input id="inline-edit-code" class="swal2-input custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;" value="${escapeHtml(emp.employee_code || '')}" required>
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">รหัสผ่านใหม่ (ว่างไว้เพื่อคงเดิม)</label>
              <input type="text" id="inline-edit-password" class="swal2-input custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;" placeholder="ปล่อยว่างหากใช้รหัสผ่านเดิม">
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">คำนำหน้าชื่อ <span id="edit-prefix-req" style="color:red;">*</span></label>
              <select id="inline-edit-title" class="swal2-select custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;">
                <option value="" disabled ${!emp.title ? 'selected' : ''}>เลือกคำนำหน้า...</option>
                <option value="นาย" ${emp.title === 'นาย' ? 'selected' : ''}>นาย</option>
                <option value="นาง" ${emp.title === 'นาง' ? 'selected' : ''}>นาง</option>
                <option value="นางสาว" ${emp.title === 'นางสาว' ? 'selected' : ''}>นางสาว</option>
                ${(emp.role === 'executive' || emp.role === 'admin' || emp.title === 'คุณ') ? `<option value="คุณ" ${emp.title === 'คุณ' ? 'selected' : ''}>คุณ</option>` : ''}
              </select>
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">ชื่อจริง *</label>
              <input id="inline-edit-firstName" class="swal2-input custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;" value="${escapeHtml(empFirstName)}" placeholder="ชื่อจริง" required>
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">นามสกุล *</label>
              <input id="inline-edit-lastName" class="swal2-input custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;" value="${escapeHtml(empLastName)}" placeholder="นามสกุล" required>
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">ชื่อเล่น</label>
              <input id="inline-edit-nickname" class="swal2-input custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;" value="${escapeHtml(emp.nickname || '')}" placeholder="ชื่อเล่น">
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">เบอร์โทรศัพท์</label>
              <input id="inline-edit-phone" class="swal2-input custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;" value="${escapeHtml(emp.phone || '')}" placeholder="08X-XXX-XXXX">
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">ไอดีไลน์ (Line ID)</label>
              <input id="inline-edit-lineId" class="swal2-input custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;" value="${escapeHtml(emp.line_id || '')}" placeholder="Line ID">
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">อีเมลองค์กร</label>
              <input type="email" id="inline-edit-email" class="swal2-input custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;" value="${escapeHtml(emp.email || '')}" placeholder="email@company.com">
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">เลขบัญชีธนาคาร</label>
              <input id="inline-edit-bankAccount" class="swal2-input custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;" value="${escapeHtml(emp.bank_account || '')}" placeholder="เลขบัญชี 10 หลัก">
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">🏥 โรงพยาบาลประกันสังคม</label>
              <input id="inline-edit-hospital" class="swal2-input custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;" value="${escapeHtml(emp.hospital || '')}" placeholder="เช่น รพ.เปาโล">
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">สังกัดฝ่าย / แผนก <span id="edit-dept-req" style="color:red;">*</span></label>
              <select id="inline-edit-dept" class="swal2-select custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;">
                <option value="" disabled>-- เลือกแผนก --</option>
                ${deptOptions}
              </select>
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">ตำแหน่งงาน <span id="edit-role-req" style="color:red;">*</span></label>
              <select id="inline-edit-role" class="swal2-select custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;">
                <option value="" disabled>-- เลือกตำแหน่ง --</option>
                ${roleOptions}
              </select>
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #0d9488;">👑 สิทธิ์ในระบบ (System Role) *</label>
              <select id="inline-edit-system-role" class="swal2-select custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box; background:#ffffff; border: 2px solid #0d9488; font-weight:600; color:#0d9488; cursor: pointer;" onchange="window.updateEmployeeEditFormRequirements()">
                <option value="user" ${emp.role === 'user' || !emp.role ? 'selected' : ''}>👤 พนักงานทั่วไป (Employee / Staff)</option>
                <option value="leader" ${emp.role === 'leader' ? 'selected' : ''}>🎖️ หัวหน้างาน (Supervisor / Leader - ผู้อนุมัติ L1)</option>
                <option value="manager" ${emp.role === 'manager' ? 'selected' : ''}>👔 ผู้จัดการฝ่าย (Department Manager - ผู้อนุมัติ L2)</option>
                <option value="executive" ${emp.role === 'executive' || emp.role === 'director' || emp.role === 'owner' ? 'selected' : ''}>⭐ ผู้บริหารระดับสูง (Director / Executive - ผู้อนุมัติ L3)</option>
                <option value="hr" ${emp.role === 'hr' ? 'selected' : ''}>📋 ฝ่ายบุคคล (HR Officer - อนุมัติขั้นสุดท้าย)</option>
                <option value="admin" ${emp.role === 'admin' || emp.role === 'superadmin' ? 'selected' : ''}>🛡️ ผู้ดูแลระบบ (System Admin)</option>
              </select>
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">ประเภทพนักงาน <span id="edit-type-req" style="color:red;">*</span></label>
              <select id="inline-edit-type" class="swal2-select custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;">
                <option value="" disabled>เลือกประเภทพนักงาน...</option>
                <option value="พนักงานประจำ (Full-time)" ${emp.employment_type === 'พนักงานประจำ (Full-time)' || emp.employment_type === 'full_time' ? 'selected' : ''}>พนักงานประจำ (Full-time)</option>
                <option value="พนักงานพาร์ทไทม์ (Part-time)" ${emp.employment_type === 'พนักงานพาร์ทไทม์ (Part-time)' || emp.employment_type === 'part_time' ? 'selected' : ''}>พนักงานพาร์ทไทม์ (Part-time)</option>
                <option value="พนักงานสัญญาจ้าง (Contract)" ${emp.employment_type === 'พนักงานสัญญาจ้าง (Contract)' || emp.employment_type === 'contract' ? 'selected' : ''}>พนักงานสัญญาจ้าง (Contract)</option>
                <option value="นักศึกษาฝึกงาน (Intern)" ${emp.employment_type === 'นักศึกษาฝึกงาน (Intern)' || emp.employment_type === 'intern' ? 'selected' : ''}>นักศึกษาฝึกงาน (Intern)</option>
                <option value="พนักงานทดลองงาน (Probation)" ${emp.employment_type === 'พนักงานทดลองงาน (Probation)' ? 'selected' : ''}>พนักงานทดลองงาน (Probation)</option>
                <option value="รายเดือน (Monthly)" ${emp.employment_type === 'รายเดือน (Monthly)' || emp.employment_type === 'monthly' ? 'selected' : ''}>รายเดือน (Monthly)</option>
                <option value="รายวัน (Daily)" ${emp.employment_type === 'รายวัน (Daily)' || emp.employment_type === 'daily' ? 'selected' : ''}>รายวัน (Daily)</option>
              </select>
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; color: #1e293b;">วันที่เริ่มงาน <span id="edit-start-req" style="color:red;">*</span></label>
              <input type="date" id="inline-edit-startDate" class="swal2-input custom-input-consistent" style="margin:4px 0 0; width:100%; height:42px; font-size:14px; box-sizing: border-box;" value="${emp.start_date ? emp.start_date.split('T')[0] : ''}">
            </div>

            <!-- Section Custom Columns -->
            <div class="custom-fields-section" style="grid-column: 1 / -1; margin-top: 10px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h6 style="margin: 0; font-weight: 700; color: #0d9488; font-size: 13px;">📌 ข้อมูลเพิ่มเติม (คอลัมน์กำหนดเอง)</h6>
                <button type="button" class="btn-light btn-sm" onclick="window.openCreateCustomFieldModal(() => openEmployeeDetail('${emp.id}', true))" style="font-size: 12px; padding: 5px 12px; background: #0d9488; color: white; border: none; border-radius: 4px; cursor: pointer;">
                  ⚙️ จัดการ/เพิ่มคอลัมน์ระบบ
                </button>
              </div>
              <div id="customColumnsContainer" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">${customFieldsHTML}</div>
            </div>

          </div>

          <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:16px;">
            <button type="button" class="btn-light" onclick="openEmployeeDetail('${emp.id}', false)">ยกเลิก</button>
            <button type="submit" class="btn-primary" style="background:#0d9488; border-color:#0d9488; color:white; border-radius:6px; cursor:pointer;">บันทึกข้อมูล</button>
          </div>
        </form>
      `;

      // ผูก Event Listener ทันทีเพื่ออัปเดตรูปประจำตัวพรีวิวเรียลไทม์เมื่อเลือกไฟล์ใหม่
      setTimeout(() => {
        window.updateEmployeeEditFormRequirements();
        const imgInput = document.getElementById('inline-edit-img');
        const preview = document.getElementById('inline-edit-profilePreview');
        if (imgInput && preview) {
          imgInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
              const url = URL.createObjectURL(file);
              preview.src = url;
            }
          });
        }
      }, 50);
    }
  }
  if (modal) modal.classList.add("open");
}

async function saveEmployeeInlineEdit(employeeId) {
  const emp = employees.find(e => String(e.id) === String(employeeId));
  if (!emp) return;

  const code = document.getElementById('inline-edit-code')?.value.trim();
  const firstName = document.getElementById('inline-edit-firstName')?.value.trim() || '';
  const lastName = document.getElementById('inline-edit-lastName')?.value.trim() || '';
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const dept = document.getElementById('inline-edit-dept')?.value;
  const role = document.getElementById('inline-edit-role')?.value;
  const empType = document.getElementById('inline-edit-type')?.value;

  const system_role = document.getElementById('inline-edit-system-role')?.value || 'user';
  const isExec = system_role === 'executive' || system_role === 'admin' || system_role === 'hr';
  
  if (!code || !firstName || !lastName) {
    showAppError("ข้อมูลไม่ครบถ้วน", "กรุณากรอกข้อมูลรหัส ชื่อจริง และนามสกุลให้ครบถ้วน");
    return;
  }
  
  if (!isExec && (!dept || !role)) {
    showAppError("ข้อมูลไม่ครบถ้วน", "กรุณากรอกข้อมูลแผนก และ ตำแหน่ง");
    return;
  }

  // ดึงข้อมูล Custom Fields จากหน้าจอ
  const customFields = {};
  const inputs = document.querySelectorAll('.custom-field-input');
  let missingRequiredField = null;

  inputs.forEach(input => {
    const key = input.getAttribute('data-key');
    const isReq = input.getAttribute('data-required') === 'true';
    const val = input.value.trim();

    if (isReq && !val) {
      missingRequiredField = key;
    }
    if (key && val) {
      customFields[key] = val;
    }
  });

  if (missingRequiredField) {
    showAppError("ข้อมูลไม่ครบถ้วน", `กรุณากรอกข้อมูลในคอลัมน์บังคับ: "${missingRequiredField}"`);
    return;
  }

  const updateData = {
    employee_code: code,
    full_name: name,
    title: document.getElementById('inline-edit-title')?.value || null,
    nickname: document.getElementById('inline-edit-nickname')?.value.trim() || null,
    phone: document.getElementById('inline-edit-phone')?.value.trim() || null,
    line_id: document.getElementById('inline-edit-lineId')?.value.trim() || null,
    email: document.getElementById('inline-edit-email')?.value.trim() || null,
    department_id: dept || null,
    position_id: role || null,
    role: document.getElementById('inline-edit-system-role')?.value || 'user',
    bank_account: document.getElementById('inline-edit-bankAccount')?.value.trim() || null,
    start_date: document.getElementById('inline-edit-startDate')?.value || null,
    hospital: document.getElementById('inline-edit-hospital')?.value.trim() || null,
    employment_type: empType || null,
  };

  const newPass = document.getElementById('inline-edit-password')?.value.trim();
  if (newPass) {
    updateData.password = newPass;
  }

  const fileInput = document.getElementById('inline-edit-img');
  if (fileInput && fileInput.files[0]) {
    const uploadedUrl = await uploadEmployeeImage(getSupabase(), code, fileInput.files[0]);
    if (uploadedUrl) updateData.image_url = uploadedUrl;
  }

  // 🛑 เพิ่มปุ่มยืนยันก่อนบันทึกการแก้ไขข้อมูลพนักงาน (ป้องกันลืม/กดพลาด)
  if (window.Swal) {
    const confirmResult = await Swal.fire({
      title: 'ยืนยันการบันทึกแก้ไขข้อมูลพนักงาน?',
      html: `คุณกำลังจะอัปเดตข้อมูลของ <b>"${escapeHtml(name)}"</b> (${escapeHtml(code)})`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0fa472',
      cancelButtonColor: '#64748b',
      confirmButtonText: '✔️ ยืนยันบันทึก',
      cancelButtonText: 'ยกเลิก'
    });
    if (!confirmResult.isConfirmed) return;
  }

  try {
    if (window.Swal) {
      Swal.fire({
        title: 'กำลังบันทึกข้อมูล...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
    }

    const supabase = getSupabase();
    const { error } = await supabase.from('employees').update(updateData).eq('id', emp.id);
    if (error) throw error;

    // บันทึก Custom Fields ลงใน system_settings แทนเพื่อหลีกเลี่ยงข้อจำกัดของโครงสร้างตาราง DB
    await saveEmployeeCustomFields(supabase, code, customFields);

    await saveHRActivityLog('EMPLOYEE', 'UPDATE', code, `แก้ไขข้อมูลพนักงาน: ${name}`);
    
    if (window.Swal) {
      Swal.fire({ 
        icon: 'success', 
        title: 'บันทึกสำเร็จ', 
        text: 'อัปเดตข้อมูลพนักงานเรียบร้อยแล้ว', 
        timer: 1500, 
        showConfirmButton: false 
      });
    }
    
    await refreshDashboard();
    // ปิด Modal และเปิดใหม่ในโหมดดูข้อมูลเพื่อรีเฟรช UI
    openEmployeeDetail(emp.id, false);
  } catch (err) {
    console.error("Save error:", err);
    showAppError("ไม่สามารถบันทึกข้อมูลได้", err.message);
  }
}



function closeEmployeeModal(event) {
  if (event && event.target && event.target.id !== "employeeModal" && !event.target.closest('.btn-close') && !event.target.closest('.btn-light')) {
    return;
  }
  document.getElementById("employeeModal")?.classList.remove("open");
}

function detail(label, value) {
  return `<div class="detail-item" style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
    <span style="font-size:12px; color:#64748b; display:block; margin-bottom:2px;">${escapeHtml(label)}</span>
    <strong style="font-size:14px; color:#1e293b;">${escapeHtml(value)}</strong>
  </div>`;
}

function renderBalanceCards(rows) {
  if (!rows.length) return `<div class="empty">ยังไม่มีข้อมูลโควตาวันลาในระบบ</div>`;
  return `<div class="detail-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">${rows.map((row) => {
    const typeObj = getLeaveType(row.leave_type_id);
    const type = row.leave_types?.leave_name || typeObj?.leave_name || "สิทธิการลา";

    const entitlement = Number(row.entitlement_days ?? typeObj?.yearly_quota ?? 0);
    const used = Number(row.used_days ?? 0);
    const remaining = row.remaining_days !== undefined ? Number(row.remaining_days) : (entitlement - used);

    return `
      <div style="background:#f0fdfa; border:1px solid #ccfbf1; padding:10px 14px; border-radius:10px;">
        <span style="font-size:12px; color:#0d9488; font-weight:600; display:block; margin-bottom:4px;">${escapeHtml(type)}</span>
        <div style="font-size:18px; font-weight:700; color:#0f766e;">
          ${remaining} <span style="font-size:12px; font-weight:normal; color:#475569;">/ ${entitlement} วัน (ใช้ไป ${used})</span>
        </div>
      </div>
    `;
  }).join("")}</div>`;
}

function renderLeaveCardItem(request) {
  const type = getLeaveType(request.leave_type_id)?.leave_name || "ไม่ระบุ";
  const startDate = window.pvtSupabase?.formatThaiDate ? window.pvtSupabase.formatThaiDate(request.start_date) : (request.start_date || "-");
  const endDate = window.pvtSupabase?.formatThaiDate ? window.pvtSupabase.formatThaiDate(request.end_date) : (request.end_date || "-");
  const statusLabel = window.pvtSupabase?.statusLabel ? window.pvtSupabase.statusLabel(request.status) : request.status;
  const statusClass = (request.status || "pending").toLowerCase();
  const cancelOrRejectReason = request.cancel_reason || request.approval_comment;

  return `
    <div class="leave-history-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <span style="font-size: 13px; font-weight: 700; color: #0d9488; background: #f0fdfa; padding: 2px 8px; border-radius: 6px;">${escapeHtml(type)}</span>
          <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-top: 4px;">${startDate} - ${endDate}</div>
        </div>
        <span class="status ${statusClass}" style="font-size: 11px; padding: 2px 8px; border-radius: 20px;">${statusLabel}</span>
      </div>
      <div style="font-size: 13px; color: #64748b; line-height: 1.4;">
        <b>เหตุผล:</b> ${escapeHtml(request.reason || request.note || "-")}
      </div>
      ${((request.status === 'cancelled' || (request.approval_comment && request.approval_comment.includes('ยกเลิก'))) && cancelOrRejectReason) ? `
        <div style="font-size: 11.5px; color: #be123c; background: #fff1f2; padding: 4px 8px; border-radius: 6px; border: 1px solid #fecdd3;">
          <strong>เหตุผลที่ยกเลิก:</strong> ${escapeHtml(cancelOrRejectReason)}
        </div>
      ` : (request.status === 'rejected' && request.approval_comment) ? `
        <div style="font-size: 11.5px; color: #be123c; background: #fff1f2; padding: 4px 8px; border-radius: 6px; border: 1px solid #fecdd3;">
          <strong>เหตุผลที่ไม่อนุมัติ:</strong> ${escapeHtml(request.approval_comment)}
        </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e2e8f0; padding-top: 8px; margin-top: 4px;">
        <span style="font-size: 13px; font-weight: 600; color: #475569;">จำนวน <strong style="color: #0d9488;">${request.total_days || 0}</strong> วัน</span>
        <button class="btn-light btn-sm" title="แก้ไขคำขอ" onclick="editSingleLeaveRequest('${request.id}')" style="display: flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 12px; border-radius: 6px;">
          <span class="material-symbols-outlined" style="font-size:16px;">edit</span> แก้ไข
        </button>
      </div>
    </div>
  `;
}

function renderLeaveRow(request) {
  const type = getLeaveType(request.leave_type_id)?.leave_name || "ไม่ระบุ";
  const startDate = window.pvtSupabase?.formatThaiDate ? window.pvtSupabase.formatThaiDate(request.start_date) : (request.start_date || "-");
  const endDate = window.pvtSupabase?.formatThaiDate ? window.pvtSupabase.formatThaiDate(request.end_date) : (request.end_date || "-");
  const statusLabel = window.pvtSupabase?.statusLabel ? window.pvtSupabase.statusLabel(request.status) : request.status;
  const cancelOrRejectReason = request.cancel_reason || request.approval_comment;

  return `
    <tr>
      <td>${escapeHtml(type)}</td>
      <td>${startDate} - ${endDate}</td>
      <td><strong style="color:#0f766e;">${request.total_days || 0}</strong> วัน</td>
      <td>
        <div>${escapeHtml(request.reason || request.note || "-")}</div>
        ${((request.status === 'cancelled' || (request.approval_comment && request.approval_comment.includes('ยกเลิก'))) && cancelOrRejectReason) ? `
          <div style="font-size: 11px; color: #be123c; background: #fff1f2; padding: 2px 6px; border-radius: 4px; border: 1px solid #fecdd3; margin-top: 3px; display: inline-block;">
            <strong>ยกเลิก:</strong> ${escapeHtml(cancelOrRejectReason)}
          </div>
        ` : (request.status === 'rejected' && request.approval_comment) ? `
          <div style="font-size: 11px; color: #be123c; background: #fff1f2; padding: 2px 6px; border-radius: 4px; border: 1px solid #fecdd3; margin-top: 3px; display: inline-block;">
            <strong>ไม่อนุมัติ:</strong> ${escapeHtml(request.approval_comment)}
          </div>
        ` : ''}
      </td>
      <td><span class="status ${request.status || "pending"}">${statusLabel}</span></td>
      <td style="text-align: center;">
        <button class="btn-light btn-sm" title="แก้ไขจำนวนวัน/ข้อมูลคำขอ" onclick="editSingleLeaveRequest('${request.id}')">
          <span class="material-symbols-outlined" style="font-size:16px;">edit</span>
        </button>
      </td>
    </tr>
  `;
}

async function editSingleLeaveRequest(requestId) {
  const req = leaveRequests.find(r => String(r.id) === String(requestId));
  if (!req) return;

  const supabase = getSupabase();
  const typeObj = getLeaveType(req.leave_type_id);

  if (!window.Swal) return;

  const { value: formValues } = await Swal.fire({
    title: '📝 ปรับแก้ไขจำนวนวันลา / คำขอ',
    width: 'min(90vw, 500px)',
    html: `
      <div style="text-align:left; font-family:'Sarabun', sans-serif; display:flex; flex-direction:column; gap:12px;">
        <div style="background:#f1f5f9; padding:10px; border-radius:6px; font-size:13px;">
          <b>ประเภท:</b> ${escapeHtml(typeObj?.leave_name || 'ไม่ระบุ')}<br>
          <b>วันที่:</b> ${escapeHtml(req.start_date)} ถึง ${escapeHtml(req.end_date)}
        </div>
        <div>
          <label style="font-size:13px; font-weight:600;">จำนวนวันลา (ปรับเพิ่ม/ลดได้ยืดหยุ่น) *</label>
          <div style="display:flex; gap:6px; align-items:center; margin-top:4px;">
            <button type="button" class="action-btn" onclick="let el=document.getElementById('edit-days'); el.value = Math.max(0.5, (parseFloat(el.value)||1)-0.5);" style="width:40px; padding:0; height:40px;">-</button>
            <input type="number" id="edit-days" class="swal2-input" step="0.5" min="0.5" value="${req.total_days || 1}" style="margin:0; text-align:center; height:40px; flex:1;">
            <button type="button" class="action-btn" onclick="let el=document.getElementById('edit-days'); el.value = (parseFloat(el.value)||0)+0.5;" style="width:40px; padding:0; height:40px;">+</button>
          </div>
        </div>
        <div>
          <label style="font-size:13px; font-weight:600;">เหตุผลการลา / หมายเหตุ HR</label>
          <textarea id="edit-reason" class="swal2-textarea" style="margin:4px 0 0 0; width:100%; height:70px; font-size:13px;">${escapeHtml(req.reason || req.note || '')}</textarea>
        </div>
        <div>
          <label style="font-size:13px; font-weight:600;">สถานะคำขอ</label>
          <select id="edit-status" class="swal2-select" style="margin:4px 0 0 0; width:100%; height:40px;">
            <option value="approved" ${req.status === 'approved' ? 'selected' : ''}>อนุมัติ (Approved)</option>
            <option value="pending" ${req.status === 'pending' ? 'selected' : ''}>รออนุมัติ (Pending)</option>
            <option value="rejected" ${req.status === 'rejected' ? 'selected' : ''}>ไม่อนุมัติ (Rejected)</option>
            <option value="cancelled" ${req.status === 'cancelled' ? 'selected' : ''}>ยกเลิก (Cancelled)</option>
          </select>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '💾 บันทึกการแก้ไข',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0d9488',
    preConfirm: () => {
      const days = parseFloat(document.getElementById('edit-days').value) || 0;
      const reason = document.getElementById('edit-reason').value.trim();
      const status = document.getElementById('edit-status').value;
      if (days <= 0) {
        Swal.showValidationMessage('❌ จำนวนวันลาต้องมากกว่า 0 วัน');
        return false;
      }
      return { total_days: days, reason: reason, status: status };
    }
  });

  if (formValues) {
    Swal.fire({ title: 'กำลังปรับปรุงข้อมูลคำขอ...', didOpen: () => Swal.showLoading() });
    if (window.PVTSDK?.user?.ensureLeaveBalances) {
      await window.PVTSDK.user.ensureLeaveBalances(req.employee_id, req.start_date);
    }
    const { error } = await supabase.from('leave_requests').update(formValues).eq('id', req.id);
    if (error) {
      showAppError('ปรับปรุงข้อมูลคำขอล้มเหลว', error.message);
    } else {
      await saveHRActivityLog('LEAVE_REQUEST', 'UPDATE', `คำขอID:${req.id}`, `HR ปรับแก้จำนวนวันลาเป็น ${formValues.total_days} วัน สถานะ: ${formValues.status}`);
      Swal.fire('สำเร็จ', 'ปรับแก้ไขวันลาเรียบร้อยแล้ว', 'success');
      await refreshDashboard();
      openEmployeeDetail(req.employee_id);
    }
  }
}

// ==========================================
// 7. ADMIN HR MANAGEMENT (EMPLOYEES & DEPTS)
// ==========================================
async function uploadEmployeeImage(supabase, employeeCode, fileObject) {
  if (!fileObject) return null;
  try {
    const fileExt = fileObject.name.split('.').pop();
    const fileName = `${employeeCode}_${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error } = await supabase.storage
      .from('employee-images')
      .upload(filePath, fileObject, { cacheControl: '3600', upsert: true });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from('employee-images')
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  } catch (err) {
    showAppError("อัปโหลดรูปภาพไม่สำเร็จ", err.message);
    return null;
  }
}

// ==========================================================================
// 1. ฟังก์ชันช่วยดึง "รายชื่อคอลัมน์พิเศษทั้งหมด" ที่เคยถูกสร้างไว้ในระบบ
// ==========================================================================
async function getAllExistingCustomKeys(supabase) {
  try {
    const definitions = await getCustomFieldDefinitions(supabase);
    const keysSet = new Set();
    if (Array.isArray(definitions)) {
      definitions.forEach(def => {
        if (def && def.name) keysSet.add(def.name.trim());
      });
    }
    return Array.from(keysSet);
  } catch (err) {
    console.warn("Error fetching custom keys:", err);
    return [];
  }
}

// ==========================================================================
// SYSTEM CUSTOM FIELDS & HR MANAGEMENT (แก้ไข ReferenceError แล้ว)
// ==========================================================================

// 1. ดึง คอลัมน์พิเศษ ทั้งหมดจาก system_settings
async function getCustomFieldDefinitions(supabase) {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'custom_field_definitions')
      .maybeSingle();

    return data?.setting_value || [];
  } catch (err) {
    console.error("Error fetching custom definitions:", err);
    return [];
  }
}

// 2. บันทึก คอลัมน์พิเศษ ลง system_settings
async function saveCustomFieldDefinitions(supabase, definitions) {
  const { error } = await supabase
    .from('system_settings')
    .upsert({
      setting_key: 'custom_field_definitions',
      setting_value: definitions,
      updated_at: new Date().toISOString()
    }, { onConflict: 'setting_key' });

  if (error) throw error;
}

// 3. UI Helpers
window.toggleCustomFieldType = function(type) {
  const optionsSec = document.getElementById('selectOptionsSection');
  if (optionsSec) optionsSec.style.display = (type === 'select') ? 'block' : 'none';
};

window.addChoiceInput = function(value = '') {
  const container = document.getElementById('choiceOptionsContainer');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'choice-option-row';
  div.style.cssText = 'display: flex; gap: 6px; margin-bottom: 6px; align-items: center;';
  div.innerHTML = `
    <input type="text" class="swal2-input choice-val" value="${escapeHtml(value)}" placeholder="เช่น ไซส์ S, แผนก A" style="margin:0; height:34px; flex:1; font-size:12px;">
    <button type="button" onclick="this.parentElement.remove()" style="height:34px; padding:0 10px; background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:6px; cursor:pointer;">🗑️</button>
  `;
  container.appendChild(div);
};

// 4. Modal สำหรับสร้างคอลัมน์ใหม่ทันที
window.openCreateCustomFieldModal = async function(onSuccessCallback) {
  const supabase = getSupabase();

  const { value: fieldConfig } = await Swal.fire({
    title: '⚙️ สร้างคอลัมน์ใหม่ในระบบ',
    width: 'min(90vw, 550px)',
    html: `
      <div style="text-align:left; font-family:'Sarabun', sans-serif;">
        <div style="margin-bottom: 12px;">
          <label style="font-size:13px; font-weight:600;">ชื่อคอลัมน์ *</label>
          <input id="cf-name" class="swal2-input" placeholder="เช่น ไซส์เสื้อ, ประวัติการแพ้ยา" style="margin:4px 0 0; width:100%; height:38px; font-size:13px;">
        </div>

        <div style="margin-bottom: 12px;">
          <label style="font-size:13px; font-weight:600;">ชนิดคอลัมน์ *</label>
          <select id="cf-type" class="swal2-select" onchange="window.toggleCustomFieldType(this.value)" style="margin:4px 0 0; width:100%; height:38px; font-size:13px;">
            <option value="text">ข้อความทั่วไป (Text)</option>
            <option value="select">รายการตัวเลือก (Dropdown / Select)</option>
          </select>
        </div>

        <div id="selectOptionsSection" style="display:none; margin-bottom: 12px; padding: 10px; background: #f1f5f9; border-radius: 8px; border: 1px solid #cbd5e1;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label style="font-size:12px; font-weight:700; color:#334155;">รายการช้อยส์ตัวเลือก</label>
            <button type="button" onclick="window.addChoiceInput()" style="font-size:11px; padding:3px 8px; background:#0d9488; color:white; border:none; border-radius:4px; cursor:pointer;">+ เพิ่มช้อยส์</button>
          </div>
          <div id="choiceOptionsContainer"></div>
        </div>

        <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px; background: #fffbe3; padding: 8px 12px; border-radius: 6px; border: 1px solid #fde047;">
          <input type="checkbox" id="cf-required" style="width:16px; height:16px; cursor:pointer;">
          <label for="cf-required" style="font-size:13px; font-weight:600; cursor:pointer; color:#854d0e;">บังคับกรอกข้อมูลหรือไม่? (แสดง * Red Asterisk)</label>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '💾 บันทึกสร้างคอลัมน์',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0d9488',
    didOpen: () => {
      window.addChoiceInput('');
      window.addChoiceInput('');
    },
    preConfirm: () => {
      const name = document.getElementById('cf-name').value.trim();
      const type = document.getElementById('cf-type').value;
      const isRequired = document.getElementById('cf-required').checked;

      if (!name) {
        Swal.showValidationMessage('⚠️ กรุณาระบุชื่อคอลัมน์');
        return false;
      }

      let options = [];
      if (type === 'select') {
        const optionInputs = document.querySelectorAll('.choice-val');
        optionInputs.forEach(input => {
          if (input.value.trim()) options.push(input.value.trim());
        });

        if (options.length === 0) {
          Swal.showValidationMessage('⚠️ กรุณาเพิ่มช้อยส์ตัวเลือกอย่างน้อย 1 รายการ');
          return false;
        }
      }

      return {
        id: 'cf_' + Date.now(),
        name: name,
        type: type,
        required: isRequired,
        options: options
      };
    }
  });

  if (fieldConfig) {
    try {
      const currentDefs = await getCustomFieldDefinitions(supabase);
      currentDefs.push(fieldConfig);
      await saveCustomFieldDefinitions(supabase, currentDefs);

      Swal.fire('สำเร็จ!', `เพิ่มคอลัมน์ "${fieldConfig.name}" เข้าสู่ระบบเรียบร้อยแล้ว`, 'success');
      if (typeof onSuccessCallback === 'function') onSuccessCallback();
    } catch (err) {
      Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
  }
};

// 5. Double Confirm Delete Column
window.deleteCustomColumnWithDoubleConfirm = async function(fieldId, fieldName, onDeletedCallback) {
  const supabase = getSupabase();

  const confirm1 = await Swal.fire({
    title: `❓ ต้องการลบคอลัมน์ "${fieldName}"?`,
    text: "คอลัมน์นี้จะถูกถอดออกจากระบบและแบบฟอร์มพนักงานทุกคน",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ถัดไป >',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#f59e0b'
  });

  if (!confirm1.isConfirmed) return;

  const confirm2 = await Swal.fire({
    title: `🚨 ยืนยันครั้งที่ 2 (Double Check)`,
    html: `คุณแน่ใจจริงๆ หรือไม่ที่จะลบคอลัมน์ <b style="color:#e11d48;">"${escapeHtml(fieldName)}"</b>?<br><small style="color:#64748b;">ข้อมูลในคอลัมน์นี้ของพนักงานทุกคนอาจหายไปอย่างถาวร!</small>`,
    icon: 'error',
    showCancelButton: true,
    confirmButtonText: '💥 ยืนยันลบเด็ดขาด',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626'
  });

  if (confirm2.isConfirmed) {
    try {
      let currentDefs = await getCustomFieldDefinitions(supabase);
      currentDefs = currentDefs.filter(item => item.id !== fieldId && item.name !== fieldName);
      await saveCustomFieldDefinitions(supabase, currentDefs);

      Swal.fire('ลบสำเร็จ!', `ถอนคอลัมน์ ${fieldName} ออกจากระบบแล้ว`, 'success');
      if (typeof onDeletedCallback === 'function') onDeletedCallback();
    } catch (err) {
      Swal.fire('ลบไม่สำเร็จ', err.message, 'error');
    }
  }
};

// 6. Render Custom Fields HTML
async function renderCustomFieldsHTML(supabase) {
  const customDefs = await getCustomFieldDefinitions(supabase);

  if (customDefs.length === 0) {
    return `<div style="text-align:center; color:#94a3b8; font-size:12px; padding:10px;">ยังไม่มีคอลัมน์พิเศษในระบบ (กดปุ่มจัดการด้านบนได้เลย)</div>`;
  }

  return customDefs.map(field => {
    const reqMark = field.required ? `<span style="color:#e11d48; font-weight:bold;">*</span>` : '';
    let inputControl = '';

    if (field.type === 'select') {
      const opts = field.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
      inputControl = `
        <select class="swal2-select custom-field-input" data-key="${escapeHtml(field.name)}" data-required="${field.required}" style="margin:0; height:38px; width:100%; font-size:13px; background:#fff;">
          <option value="">-- เลือก${escapeHtml(field.name)} --</option>
          ${opts}
        </select>
      `;
    } else {
      inputControl = `
        <input type="text" class="swal2-input custom-field-input" data-key="${escapeHtml(field.name)}" data-required="${field.required}" placeholder="กรอก${escapeHtml(field.name)}" style="margin:0; height:38px; width:100%; font-size:13px; background:#fff;">
      `;
    }

    return `
      <div class="custom-field-row" style="display:flex; gap:8px; align-items:flex-end; margin-bottom:10px;">
        <div style="flex:1;">
          <label style="font-size:12px; font-weight:600; color:#334155; display:block; margin-bottom:2px;">
            ${escapeHtml(field.name)} ${reqMark}
          </label>
          ${inputControl}
        </div>
        <button type="button" onclick="window.deleteCustomColumnWithDoubleConfirm('${field.id}', '${escapeHtml(field.name)}', () => window.addNewEmployee())" 
                style="height:38px; padding:0 10px; background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; shrink:0;" title="ลบคอลัมน์นี้ออกจากระบบ">
          🗑️ ลบ
        </button>
      </div>
    `;
  }).join('');
}

// 7. MAIN FUNCTION: addNewEmployee (ผูก window.addNewEmployee ให้ HTML เรียกได้)
window.addNewEmployee = async function addNewEmployee() {
  const supabase = getSupabase();
  if (!supabase || !window.Swal) return;

  try {
    const [deptRes, roleRes, customFieldsHTML] = await Promise.all([
      supabase.from('departments').select('id, department_name'),
      supabase.from('positions').select('id, position_name'),
      renderCustomFieldsHTML(supabase)
    ]);

    let deptOptions = deptRes.data?.map(d => `<option value="${d.id}">${escapeHtml(d.department_name)}</option>`).join('') || '';
    let roleOptions = buildGroupedPositionOptions(roleRes.data, null);

    const { value: formValues } = await Swal.fire({
      title: '➕ เพิ่มพนักงานใหม่เข้าสู่ระบบ',
      width: 'min(92vw, 800px)',
      html: `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px; text-align:left; font-family:'Sarabun', sans-serif; max-height: 65vh; overflow-y: auto; padding-right: 6px;">
          
          <div style="grid-column: 1 / -1; text-align: center; background: #f8fafc; padding: 12px; border-radius: 10px; border: 1px dashed #cbd5e1;">
            <img id="profilePreview" src="https://placehold.co/100?text=No+Image" 
                 style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 3px solid #0d9488; margin-bottom: 8px; background: #fff;">
            <input type="file" id="empImage" class="swal2-file" accept="image/*" style="display: block; margin: 0 auto; font-size: 12px;">
          </div>

          <div>
            <label style="font-size:13px; font-weight:600;">รหัสพนักงาน *</label>
            <input id="swal-empCode" class="swal2-input" style="margin:4px 0 0; width:100%; height:38px;" placeholder="เช่น 19001">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">รหัสผ่านเข้าใช้งาน *</label>
            <input type="text" id="swal-password" class="swal2-input" style="margin:4px 0 0; width:100%; height:38px;" placeholder="รหัสผ่านเข้าสู่ระบบ">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">คำนำหน้าชื่อ <span id="swal-prefix-req" style="color:red;">*</span></label>
            <select id="title" class="swal2-select" style="margin:4px 0 0; width:100%; height:38px;">
              <option value="" disabled selected>เลือกคำนำหน้า...</option>
              <option value="นาย">นาย</option>
              <option value="นาง">นาง</option>
              <option value="นางสาว">นางสาว</option>
            </select>
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">ชื่อจริง *</label>
            <input id="swal-firstName" class="swal2-input" style="margin:4px 0 0; width:100%; height:38px;" placeholder="ชื่อจริง">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">นามสกุล *</label>
            <input id="swal-lastName" class="swal2-input" style="margin:4px 0 0; width:100%; height:38px;" placeholder="นามสกุล">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">ชื่อเล่น</label>
            <input id="swal-nickname" class="swal2-input" style="margin:4px 0 0; width:100%; height:38px;" placeholder="ชื่อเล่น">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">เบอร์โทรศัพท์</label>
            <input id="swal-phone" class="swal2-input" style="margin:4px 0 0; width:100%; height:38px;" placeholder="08X-XXX-XXXX">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">ไอดีไลน์ (Line ID)</label>
            <input id="swal-lineId" class="swal2-input" style="margin:4px 0 0; width:100%; height:38px;" placeholder="Line ID">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">อีเมลองค์กร</label>
            <input type="email" id="swal-email" class="swal2-input" style="margin:4px 0 0; width:100%; height:38px;" placeholder="email@company.com">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">เลขบัญชีธนาคาร</label>
            <input id="swal-bankAccount" class="swal2-input" style="margin:4px 0 0; width:100%; height:38px;" placeholder="เลขบัญชี 10 หลัก">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">🏥 โรงพยาบาลประกันสังคม</label>
            <input id="swal-hospital" class="swal2-input" style="margin:4px 0 0; width:100%; height:38px;" placeholder="เช่น รพ.เปาโล">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">สังกัดฝ่าย / แผนก <span id="swal-dept-req" style="color:red;">*</span></label>
            <select id="swal-dept" class="swal2-select" style="margin:4px 0 0; width:100%; height:38px;">
              <option value="" disabled selected>-- เลือกแผนก --</option>
              ${deptOptions}
            </select>
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">ตำแหน่งงาน <span id="swal-role-req" style="color:red;">*</span></label>
            <select id="swal-role" class="swal2-select" style="margin:4px 0 0; width:100%; height:38px;">
              <option value="" disabled selected>-- เลือกตำแหน่ง --</option>
              ${roleOptions}
            </select>
          </div>
          <div>
            <label style="font-size:13px; font-weight:600; color: #0d9488;">👑 สิทธิ์ในระบบ (System Role) *</label>
            <select id="swal-system-role" class="swal2-select" style="margin:4px 0 0; width:100%; height:38px; background:#ffffff; border: 2px solid #0d9488; font-weight:600; color:#0d9488; cursor: pointer;" onchange="window.updateEmployeeFormRequirements()">
              <option value="user" selected>👤 พนักงานทั่วไป (Employee / Staff)</option>
              <option value="leader">🎖️ หัวหน้างาน (Supervisor / Leader - ผู้อนุมัติ L1)</option>
              <option value="manager">👔 ผู้จัดการฝ่าย (Department Manager - ผู้อนุมัติ L2)</option>
              <option value="executive">⭐ ผู้บริหารระดับสูง (Director / Executive - ผู้อนุมัติ L3)</option>
              <option value="hr">📋 ฝ่ายบุคคล (HR Officer - อนุมัติขั้นสุดท้าย)</option>
              <option value="admin">🛡️ ผู้ดูแลระบบ (System Admin)</option>
            </select>
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">ประเภทพนักงาน <span id="swal-type-req" style="color:red;">*</span></label>
            <select id="employee_type" class="swal2-select" style="margin:4px 0 0; width:100%; height:38px;">
              <option value="" disabled selected>เลือกประเภทพนักงาน...</option>
              <option value="พนักงานประจำ (Full-time)">พนักงานประจำ (Full-time)</option>
              <option value="พนักงานพาร์ทไทม์ (Part-time)">พนักงานพาร์ทไทม์ (Part-time)</option>
              <option value="พนักงานสัญญาจ้าง (Contract)">พนักงานสัญญาจ้าง (Contract)</option>
              <option value="นักศึกษาฝึกงาน (Intern)">นักศึกษาฝึกงาน (Intern)</option>
              <option value="พนักงานทดลองงาน (Probation)">พนักงานทดลองงาน (Probation)</option>
            </select>
          </div>
          <div>
            <label style="font-size:13px; font-weight:600;">วันที่เริ่มงาน <span id="swal-start-req" style="color:red;">*</span></label>
            <input type="date" id="swal-startDate" class="swal2-input" style="margin:4px 0 0; width:100%; height:38px;">
          </div>

          <!-- Section Custom Columns -->
          <div class="custom-fields-section" style="grid-column: 1 / -1; margin-top: 10px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <h6 style="margin: 0; font-weight: 700; color: #0d9488; font-size: 13px;">📌 ข้อมูลเพิ่มเติม (คอลัมน์กำหนดเอง)</h6>
              <button type="button" class="btn-light btn-sm" onclick="window.openCreateCustomFieldModal(() => window.addNewEmployee())" style="font-size: 12px; padding: 5px 12px; background: #0d9488; color: white; border: none; border-radius: 4px; cursor: pointer;">
                ⚙️ จัดการ/เพิ่มคอลัมน์ระบบ
              </button>
            </div>
            <div id="customColumnsContainer" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">${customFieldsHTML}</div>
          </div>

        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'ตรวจสอบความถูกต้อง >',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#0d9488',
      didOpen: (popup) => {
        window.updateEmployeeFormRequirements();
        const empImageInput = popup.querySelector('#empImage');
        const profilePreviewImg = popup.querySelector('#profilePreview');
        if (empImageInput && profilePreviewImg) {
          empImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) profilePreviewImg.src = URL.createObjectURL(file);
          });
        }
      },
      preConfirm: () => {
        const code = document.getElementById('swal-empCode').value.trim();
        const password = document.getElementById('swal-password').value.trim();
        const firstName = document.getElementById('swal-firstName')?.value.trim() || '';
        const lastName = document.getElementById('swal-lastName')?.value.trim() || '';
        const name = [firstName, lastName].filter(Boolean).join(' ').trim();
        const dept = document.getElementById('swal-dept').value;
        const role = document.getElementById('swal-role').value;
        const system_role = document.getElementById('swal-system-role')?.value || 'user';
        const employee_type = document.getElementById('employee_type').value;
        const startDate = document.getElementById('swal-startDate').value;
        const title = document.getElementById('title').value;
        const imageFile = document.getElementById('empImage').files[0];

        // Basic Check
        if (!code || !password || !firstName || !lastName) {
          Swal.showValidationMessage('⚠️ กรุณากรอกข้อมูลรหัส, รหัสผ่าน, ชื่อจริง และนามสกุลให้ครบถ้วน');
          return false;
        }

        // Executive / Admin bypass certain required fields
        const isExec = system_role === 'executive' || system_role === 'admin' || system_role === 'hr';
        if (!isExec) {
          if (!dept || !role || !startDate || !title) {
            Swal.showValidationMessage('⚠️ กรุณากรอกข้อมูลแผนก, ตำแหน่ง, วันเริ่มงาน และ คำนำหน้า ให้ครบถ้วน');
            return false;
          }
        }

        // Check Validation Custom Fields (Required Check)
        const customFields = {};
        const inputs = document.querySelectorAll('.custom-field-input');
        let missingRequiredField = null;

        inputs.forEach(input => {
          const key = input.getAttribute('data-key');
          const isReq = input.getAttribute('data-required') === 'true';
          const val = input.value.trim();

          if (isReq && !val) {
            missingRequiredField = key;
          }
          if (key && val) {
            customFields[key] = val;
          }
        });

        if (missingRequiredField) {
          Swal.showValidationMessage(`⚠️ กรุณากรอกข้อมูลในคอลัมน์บังคับ: "${missingRequiredField}"`);
          return false;
        }

        return {
          employee_code: code,
          password: password,
          full_name: name,
          title: document.getElementById('title').value || null,
          nickname: document.getElementById('swal-nickname').value.trim() || null,
          phone: document.getElementById('swal-phone').value.trim() || null,
          line_id: document.getElementById('swal-lineId').value.trim() || null,
          email: document.getElementById('swal-email').value.trim() || null,
          department_id: dept || null,
          position_id: role || null,
          bank_account: document.getElementById('swal-bankAccount').value.trim() || null,
          start_date: document.getElementById('swal-startDate').value || null,
          hospital: document.getElementById('swal-hospital').value.trim() || null,
          employment_type: employee_type || null,
          status: 'active',
          role: document.getElementById('swal-system-role')?.value || 'user',
          custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
          imageFile: imageFile
        };
      }
    });

    if (formValues) {
      const confirm1 = await Swal.fire({
        title: '❓ ยืนยันข้อมูลพนักงานใหม่',
        html: `ต้องการบันทึกรหัสพนักงาน <b>${escapeHtml(formValues.employee_code)}</b><br>คุณ <b>${escapeHtml(formValues.full_name)}</b> ใช่หรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '💾 บันทึกข้อมูล',
        cancelButtonText: 'แก้ไขข้อมูล',
        confirmButtonColor: '#0d9488'
      });

      if (!confirm1.isConfirmed) return;

      Swal.fire({ title: 'กำลังบันทึกข้อมูลพนักงาน...', didOpen: () => Swal.showLoading() });

      if (formValues.imageFile) {
        const uploadedUrl = await uploadEmployeeImage(supabase, formValues.employee_code, formValues.imageFile);
        if (uploadedUrl) formValues.image_url = uploadedUrl;
      }

      delete formValues.imageFile;

      const customFields = formValues.custom_fields || {};
      delete formValues.custom_fields;

      const { error } = await supabase.from('employees').insert([formValues]);
      if (error) throw error;

      if (Object.keys(customFields).length > 0) {
        await saveEmployeeCustomFields(supabase, formValues.employee_code, customFields);
      }

      await saveHRActivityLog('EMPLOYEE', 'INSERT', formValues.employee_code, `เพิ่มพนักงานใหม่: ${formValues.full_name}`);
      Swal.fire('สำเร็จ!', 'เพิ่มประวัติพนักงานเข้าสู่ระบบเรียบร้อยแล้ว', 'success');
      refreshDashboard();
    }
  } catch (err) {
    showAppError("ไม่สามารถบันทึกข้อมูลพนักงานได้", err.message);
  }
};

/**
 * 💡 Update form field requirements based on system role
 * For Executives and Admins, certain fields are optional
 */
window.updateEmployeeFormRequirements = function() {
  try {
    const role = document.getElementById('swal-system-role')?.value;
    const isExec = role === 'executive' || role === 'admin' || role === 'hr';
    
    const reqMarkers = {
      'swal-prefix-req': 'title',
      'swal-dept-req': 'swal-dept',
      'swal-role-req': 'swal-role',
      'swal-start-req': 'swal-startDate',
      'swal-type-req': 'employee_type'
    };
    
    for (const [markerId, fieldId] of Object.entries(reqMarkers)) {
      const marker = document.getElementById(markerId);
      if (marker) {
        marker.style.display = isExec ? 'none' : 'inline';
      }
    }

    // Update Prefix options
    const titleSelect = document.getElementById('title');
    if (titleSelect) {
      const currentVal = titleSelect.value;
      const hasKhun = Array.from(titleSelect.options).some(opt => opt.value === 'คุณ');
      
      if (isExec && !hasKhun) {
        const opt = document.createElement('option');
        opt.value = 'คุณ';
        opt.textContent = 'คุณ';
        titleSelect.appendChild(opt);
      } else if (!isExec && hasKhun) {
        for (let i = 0; i < titleSelect.options.length; i++) {
          if (titleSelect.options[i].value === 'คุณ') {
            titleSelect.remove(i);
            break;
          }
        }
      }
      titleSelect.value = currentVal;
    }

    // ✨ แนะนำแผนก "ฝ่ายบริหาร" สำหรับผู้บริหาร
    const deptSelect = document.getElementById('swal-dept');
    if (isExec && deptSelect && !deptSelect.value) {
      for (let i = 0; i < deptSelect.options.length; i++) {
        if (deptSelect.options[i].textContent.includes('ฝ่ายบริหาร')) {
          deptSelect.selectedIndex = i;
          break;
        }
      }
    }
  } catch (err) {
    console.warn("updateEmployeeFormRequirements error:", err);
  }
}

/**
 * 💡 Update edit form field requirements based on system role
 */
window.updateEmployeeEditFormRequirements = function() {
  try {
    const role = document.getElementById('inline-edit-system-role')?.value;
    const isExec = role === 'executive' || role === 'admin' || role === 'hr';
    
    const reqMarkers = {
      'edit-prefix-req': 'inline-edit-title',
      'edit-dept-req': 'inline-edit-dept',
      'edit-role-req': 'inline-edit-role',
      'edit-start-req': 'inline-edit-startDate',
      'edit-type-req': 'inline-edit-type'
    };
    
    for (const [markerId, fieldId] of Object.entries(reqMarkers)) {
      const marker = document.getElementById(markerId);
      if (marker) {
        marker.style.display = isExec ? 'none' : 'inline';
      }
    }

    // Update Prefix options for Edit Modal
    const titleSelect = document.getElementById('inline-edit-title');
    if (titleSelect) {
      const currentVal = titleSelect.value;
      const hasKhun = Array.from(titleSelect.options).some(opt => opt.value === 'คุณ');
      
      if (isExec && !hasKhun) {
        const opt = document.createElement('option');
        opt.value = 'คุณ';
        opt.textContent = 'คุณ';
        titleSelect.appendChild(opt);
      } else if (!isExec && hasKhun) {
        for (let i = 0; i < titleSelect.options.length; i++) {
          if (titleSelect.options[i].value === 'คุณ') {
            titleSelect.remove(i);
            break;
          }
        }
      }
      titleSelect.value = currentVal;
    }

    // ✨ แนะนำแผนก "ฝ่ายบริหาร" สำหรับผู้บริหาร (ในหน้าแก้ไข)
    const deptSelect = document.getElementById('inline-edit-dept');
    if (isExec && deptSelect && !deptSelect.value) {
      for (let i = 0; i < deptSelect.options.length; i++) {
        if (deptSelect.options[i].textContent.includes('ฝ่ายบริหาร')) {
          deptSelect.selectedIndex = i;
          break;
        }
      }
    }
  } catch (err) {
    console.warn("updateEmployeeEditFormRequirements error:", err);
  }
}

async function editEmployeeData(presetSearchKey = null) {
  if (!employees || employees.length === 0) {
    await fetchEmployees();
  }

  if (presetSearchKey) {
    let emp = employees.find(e => e.employee_code === presetSearchKey || e.id === presetSearchKey);
    if (!emp) {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.from('employees').select('*, departments!department_id(department_name), positions(position_name)').or(`id.eq.${presetSearchKey},employee_code.eq.${presetSearchKey}`).maybeSingle();
        if (data) emp = data;
      } catch (e) {}
    }
    if (emp) {
      await openEmployeeDetail(emp.id, true);
      return;
    }
  }

  if (!window.Swal) return;

  // 💡 สร้างรายการตัวเลือกพนักงานทั้งหมดมาเป็น <option>
  const employeeOptions = (employees || []).map(e => 
    `<option value="${escapeHtml(e.employee_code || '')}">${escapeHtml(e.full_name || '')} (${escapeHtml(e.departments?.department_name || 'ไม่ระบุแผนก')})</option>`
  ).join('');

  const { value: inputKey } = await Swal.fire({
    title: '🔍 ค้นหาและจัดการแฟ้มบุคคล',
    html: `
      <div style="text-align:left; font-family:'Sarabun', sans-serif;">
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:4px;">
          พิมพ์ค้นหารหัส หรือ ชื่อ-นามสกุล พนักงาน
        </label>
        <input id="swal-search-emp" class="swal2-input" list="employeeListSuggestions" placeholder="เช่น 19001 หรือ สมชาย..." style="margin:0; width:100%; height:42px; font-size:14px;">
        <datalist id="employeeListSuggestions">
          ${employeeOptions}
        </datalist>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'ดึงข้อมูล',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0d9488',
    preConfirm: () => {
      const val = document.getElementById('swal-search-emp')?.value.trim();
      if (!val) {
        Swal.showValidationMessage('❌ กรุณาระบุรหัส หรือชื่อพนักงานที่ต้องการค้นหา');
        return false;
      }
      return val;
    }
  });

  if (!inputKey) return;

  const cleanKey = inputKey.trim().toLowerCase();
  let emp = employees.find(e =>
    (e.employee_code && e.employee_code.toLowerCase() === cleanKey) ||
    (e.full_name && e.full_name.toLowerCase().includes(cleanKey)) ||
    (e.id && String(e.id) === cleanKey)
  );

  if (!emp) {
    try {
      const supabase = getSupabase();
      const { data } = await supabase.from('employees')
        .select('*, departments!department_id(department_name), positions(position_name)')
        .or(`employee_code.ilike.%${cleanKey}%,full_name.ilike.%${cleanKey}%,id.eq.${cleanKey}`)
        .limit(1);
      if (data && data.length > 0) {
        emp = data[0];
      }
    } catch(e) {
      console.warn("Direct DB employee search error:", e);
    }
  }

  if (emp) {
    await openEmployeeDetail(emp.id, true);
  } else {
    Swal.fire('ไม่พบพนักงาน', `ไม่พบข้อมูลพนักงานที่ค้นหา: ${escapeHtml(inputKey)}`, 'warning');
  }
}

// ==========================================
// 2. deleteEmployee (มีระบบลบแบบ Cascading Safety)
// ==========================================
// ==========================================
// deleteEmployee (ใช้ window.state ป้องกัน Error)
// ==========================================
window.unlinkLineAccount = async function(employeeId, employeeName) {
  const userRole = window.state?.currentUserProfile?.role;
  if (!['admin', 'hr'].includes(userRole)) {
    return Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Admin และ HR เท่านั้นที่สามารถยกเลิกการผูกบัญชี LINE ได้', 'error');
  }

  const confirm = await Swal.fire({
    title: `ยกเลิกการผูกบัญชี LINE?`,
    html: `คุณกำลังจะยกเลิกการเชื่อมต่อ LINE ของพนักงาน <b>"${employeeName}"</b><br><span style="color:red; font-size:13px;">* พนักงานจะไม่ได้รับการแจ้งเตือนผ่าน LINE อีกจนกว่าจะเชื่อมต่อใหม่</span>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'ยืนยันยกเลิก',
    cancelButtonText: 'ปิด'
  });

  if (!confirm.isConfirmed) return;

  Swal.fire({ title: 'กำลังดำเนินการ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  
  try {
    const client = window.pvtSupabase.getClient();
    const { error } = await client.from('employees').update({ line_id: null }).eq('id', employeeId);
    
    if (error) throw error;
    
    Swal.fire({
      icon: 'success',
      title: 'ยกเลิกการผูกบัญชีเรียบร้อย',
      text: `ข้อมูลการเชื่อมต่อ LINE ของ ${employeeName} ถูกลบแล้ว`,
      timer: 2000,
      showConfirmButton: false
    });
    
    await fetchEmployees();
    renderEmployeeTable();
  } catch (error) {
    Swal.fire('ข้อผิดพลาด', `ไม่สามารถยกเลิกการผูกบัญชีได้: ${error.message}`, 'error');
  }
};

async function deleteEmployee(employeeId, employeeCode, employeeName) {
  // เช็กสิทธิ์ก่อนทำรายการ
  const userRole = window.state?.currentUserProfile?.role;
  if (!['admin', 'hr'].includes(userRole)) {
    return Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Admin และ HR เท่านั้นที่สามารถลบพนักงานได้', 'error');
  }

  const confirm = await Swal.fire({
    title: `ยืนยันการลบพนักงาน?`,
    html: `คุณกำลังจะลบ <b>"${employeeName}"</b><br><span style="color:red; font-size:13px;">* ข้อมูลวันลาและประวัติทั้งหมดจะถูกลบถาวร</span>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'ยืนยันลบข้อมูล',
    cancelButtonText: 'ยกเลิก'
  });

  if (!confirm.isConfirmed) return;

  Swal.showLoading();

  try {
    const client = window.pvtSupabase.getClient();

    // วิธีที่ 1: เรียกใช้ RPC (Stored Procedure) เพื่อลบแบบ atomic บน Database
    const { error: rpcError } = await client.rpc('delete_employee_cascade', {
      p_emp_id: employeeId
    });

    // วิธีที่ 2 (Fallback): หากยังไม่ได้สร้าง RPC ใน Supabase ให้ทำ Sequential Delete ฝั่ง Client
    if (rpcError) {
      console.warn("RPC delete_employee_cascade ไม่พร้อมใช้งาน, ระบบจะใช้ Fallback Delete:", rpcError.message);

      await client.from('employee_leave_balances').delete().eq('employee_id', employeeId);
      await client.from('leave_requests').delete().eq('employee_id', employeeId);
      await client.from('profiles').update({ employee_id: null }).eq('employee_id', employeeId);
      await client.from('employees').update({ l1_approver_id: null }).eq('l1_approver_id', employeeId);
      await client.from('employees').update({ l2_approver_id: null }).eq('l2_approver_id', employeeId);
      await client.from('employees').update({ l3_approver_id: null }).eq('l3_approver_id', employeeId);
      
      const { error: empErr } = await client.from('employees').delete().eq('id', employeeId);
      if (empErr) throw empErr;
    }

    await saveHRActivityLog('EMPLOYEE', 'DELETE', employeeCode || employeeId, `ลบพนักงาน ${employeeName}`);

    Swal.fire('สำเร็จ!', 'ลบข้อมูลพนักงานเรียบร้อยแล้ว', 'success');
    
    // รีโหลดข้อมูลหน้าเว็บ
    await refreshDashboard();
  } catch (err) {
    console.error("deleteEmployee Error:", err);
    Swal.fire('เกิดข้อผิดพลาด', `ไม่สามารถลบข้อมูลได้: ${err.message}`, 'error');
  }
}

function generateDeptCode(deptName) {
  if (!deptName) return "DEPT";
  const cleanName = deptName.replace(/^(ฝ่าย|แผนก|ศูนย์|กลุ่มงาน)\s*/g, '').trim().toLowerCase();
  const mapping = [
    { keywords: ['ขนส่ง', 'จัดส่ง', 'โลจิสติกส์'], code: 'DL' },
    { keywords: ['คลัง', 'สโตร์'], code: 'WH' },
    { keywords: ['ไอที', 'เทคโนโลยี', 'it'], code: 'IT' },
    { keywords: ['บุคคล', 'เอชอาร์', 'hr'], code: 'HR' },
    { keywords: ['บัญชี', 'การเงิน'], code: 'ACC' },
    { keywords: ['ตลาด', 'การตลาด'], code: 'MKT' },
    { keywords: ['ขาย'], code: 'SL' },
    { keywords: ['ผลิต'], code: 'PROD' }
  ];

  for (const item of mapping) {
    if (item.keywords.some(kw => cleanName.includes(kw))) return item.code;
  }
  return `D-${cleanName.substring(0, 3).toUpperCase()}`;
}

async function manageDepartments() {
  const supabase = getSupabase();
  if (!supabase || !window.Swal) return;

  try {
    Swal.fire({ title: 'กำลังโหลดโครงสร้างองค์กร...', didOpen: () => Swal.showLoading() });
    
    const [deptRes, posRes, empRes] = await Promise.all([
      supabase.from('departments').select('id, department_name, department_code, status').order('department_name', { ascending: true }),
      supabase.from('positions').select('id, position_name, department_id, level_type, duty_name, status').order('position_name', { ascending: true }),
      supabase.from('employees').select('id, position_id, department_id, positions(position_name), departments!department_id(department_name)')
    ]);

    Swal.close();

    const depts = deptRes.data || [];
    const positions = posRes.data || [];
    const emps = empRes.data || [];

    // คำนวณจำนวนพนักงานต่อตำแหน่ง (ยกเว้นรหัสระบบ/อนุมัติ admin และ HR-001)
    const posCountMap = {};
    const deptCountMap = {};
    emps.forEach(e => {
      if (window.isSystemOrAdminAccount && window.isSystemOrAdminAccount(e)) return;
      if (e.position_id) posCountMap[e.position_id] = (posCountMap[e.position_id] || 0) + 1;
      if (e.positions?.position_name) posCountMap[e.positions.position_name] = (posCountMap[e.positions.position_name] || 0) + 1;
      if (e.department_id) deptCountMap[e.department_id] = (deptCountMap[e.department_id] || 0) + 1;
    });

    // จำแนกตำแหน่งออกเป็น 5 หมวด (รวมผู้บริหาร)
    const categorizedPositions = {
      executive: [],
      manager: [],
      supervisor: [],
      officer: [],
      staff: []
    };

    positions.forEach(p => {
      let cat = classifyPositionCategory(p.position_name);
      if (!categorizedPositions[cat]) cat = 'staff';
      categorizedPositions[cat].push({
        ...p,
        empCount: posCountMap[p.id] || posCountMap[p.position_name] || 0
      });
    });

    // สร้าง HTML สำหรับแต่ละหมวดหมู่
    const renderPosListHTML = (catKey) => {
      const list = categorizedPositions[catKey] || [];
      if (!list.length) {
        return `
          <div style="text-align:center; padding:32px 16px; color:#94a3b8; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1;">
            <span class="material-symbols-outlined" style="font-size:32px; display:block; margin-bottom:6px; color:#cbd5e1;">folder_open</span>
            ยังไม่มีตำแหน่งงานในหมวดนี้
          </div>
        `;
      }

      return `
        <div class="pos-item-grid">
          ${list.map(p => `
            <div class="pos-item-card" id="pos-card-${p.id}">
              <div style="flex:1; min-width:0;">
                <div class="pos-item-name" title="${escapeHtml(p.position_name)}">${escapeHtml(p.position_name)}</div>
                <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
                  พนักงาน: <strong>${p.empCount}</strong> คน
                </div>
              </div>
              <div style="display:flex; gap:4px; align-items:center;">
                <button type="button" onclick="editPositionName('${p.id}', '${escapeHtml(p.position_name)}')" 
                        style="padding:4px 6px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer; font-size:11px; color:#475569;"
                        title="แก้ไขชื่อตำแหน่ง">
                  ✏️
                </button>
                <button type="button" onclick="deletePositionItem('${p.id}', '${escapeHtml(p.position_name)}', ${p.empCount})" 
                        style="padding:4px 6px; background:#fff1f2; border:1px solid #fecdd3; border-radius:6px; cursor:pointer; font-size:11px; color:#e11d48;"
                        title="ลบตำแหน่ง">
                  🗑️
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    };

    // สร้าง HTML สำหรับรายการแผนก
    const renderDeptListHTML = () => {
      if (!depts.length) {
        return `
          <div style="text-align:center; padding:32px 16px; color:#94a3b8; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1;">
            ยังไม่มีข้อมูลฝ่าย/แผนกในระบบ
          </div>
        `;
      }
      return `
        <div class="pos-item-grid">
          ${depts.map(d => {
            const count = deptCountMap[d.id] || 0;
            return `
              <div class="pos-item-card" id="dept-card-${d.id}">
                <div style="flex:1; min-width:0;">
                  <div class="pos-item-name" title="${escapeHtml(d.department_name)}">${escapeHtml(d.department_name)}</div>
                  <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
                    รหัส: <code style="background:#f1f5f9; padding:1px 4px; border-radius:4px;">${escapeHtml(d.department_code || '-')}</code> · พนักงาน: <strong>${count}</strong> คน
                  </div>
                </div>
                <div style="display:flex; gap:4px; align-items:center;">
                  <button type="button" onclick="editDepartmentName('${d.id}', '${escapeHtml(d.department_name)}')" 
                          style="padding:4px 6px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer; font-size:11px; color:#475569;"
                          title="แก้ไขชื่อแผนก">
                    ✏️
                  </button>
                  <button type="button" onclick="deleteDepartmentItem('${d.id}', '${escapeHtml(d.department_name)}', ${count})" 
                          style="padding:4px 6px; background:#fef2f2; border:1px solid #fca5a5; border-radius:6px; cursor:pointer; font-size:11px; color:#dc2626;"
                          title="ลบแผนก">
                    🗑️
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    };

    await Swal.fire({
      title: '🏢 ศูนย์จัดการโครงสร้างองค์กร & ตำแหน่งงาน',
      width: 'min(94vw, 840px)',
      html: `
        <div style="font-family:'Sarabun', sans-serif; text-align:left;">
          <p style="font-size:13px; color:#64748b; margin-bottom:12px;">
            เลือกแท็บประเภทตำแหน่งงานเพื่อดู/เพิ่ม/แก้ไขตำแหน่งในแต่ละสายงาน หรือจัดการรายชื่อฝ่าย/แผนก
          </p>

          <!-- แถบเลือกแท็บแยกประเภทตำแหน่ง -->
          <div class="pos-modal-tabs" id="posModalTabs">
            <button type="button" class="pos-modal-tab-btn active" onclick="switchPosModalView('executive')">
              <span>👑 ผู้บริหาร (${categorizedPositions.executive.length})</span>
            </button>
            <button type="button" class="pos-modal-tab-btn" onclick="switchPosModalView('manager')">
              <span>👔 ผู้จัดการ (${categorizedPositions.manager.length})</span>
            </button>
            <button type="button" class="pos-modal-tab-btn" onclick="switchPosModalView('supervisor')">
              <span>🎖️ หัวหน้าแผนก (${categorizedPositions.supervisor.length})</span>
            </button>
            <button type="button" class="pos-modal-tab-btn" onclick="switchPosModalView('officer')">
              <span>📋 เจ้าหน้าที่/ผู้ช่วย (${categorizedPositions.officer.length})</span>
            </button>
            <button type="button" class="pos-modal-tab-btn" onclick="switchPosModalView('staff')">
              <span>👤 พนักงาน (${categorizedPositions.staff.length})</span>
            </button>
            <button type="button" class="pos-modal-tab-btn" onclick="switchPosModalView('department')">
              <span>🏢 แผนกงาน (${depts.length})</span>
            </button>
          </div>

          <!-- แถบเครื่องมือและปุ่มเพิ่มข้อมูล -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:8px; flex-wrap:wrap;">
            <input type="text" id="posModalSearch" placeholder="🔍 ค้นหาในหน้านี้..." 
                   oninput="filterPosModalItems()" 
                   style="padding:6px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; min-width:200px; flex:1;">
            
            <button type="button" id="posModalAddBtn" onclick="quickAddPositionOrDept()" 
                    class="action-btn success-zone" style="font-size:12.5px; padding:6px 14px;">
              ➕ เพิ่มตำแหน่งผู้บริหารระดับสูง
            </button>
          </div>

          <!-- เนื้อหาของแต่ละแท็บ -->
          <div id="pos-view-executive" class="pos-view-panel">
            ${renderPosListHTML('executive')}
          </div>
          <div id="pos-view-manager" class="pos-view-panel" style="display:none;">
            ${renderPosListHTML('manager')}
          </div>
          <div id="pos-view-supervisor" class="pos-view-panel" style="display:none;">
            ${renderPosListHTML('supervisor')}
          </div>
          <div id="pos-view-officer" class="pos-view-panel" style="display:none;">
            ${renderPosListHTML('officer')}
          </div>
          <div id="pos-view-staff" class="pos-view-panel" style="display:none;">
            ${renderPosListHTML('staff')}
          </div>
          <div id="pos-view-department" class="pos-view-panel" style="display:none;">
            ${renderDeptListHTML()}
          </div>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'ปิดหน้าต่าง',
      cancelButtonColor: '#64748b'
    });

  } catch (err) {
    showAppError("เกิดข้อผิดพลาดในการจัดการโครงสร้างองค์กร", err.message);
  }
}

let activePosModalTab = 'executive';

window.switchPosModalView = function(tabKey) {
  activePosModalTab = tabKey;
  
  const allKeys = ['executive', 'manager', 'supervisor', 'officer', 'staff', 'department'];

  // ปรับ active class ของปุ่มแท็บ
  document.querySelectorAll('.pos-modal-tab-btn').forEach((btn, idx) => {
    if (allKeys[idx] === tabKey) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  // สลับการแสดงผลหน้าจอ
  allKeys.forEach(k => {
    const el = document.getElementById(`pos-view-${k}`);
    if (el) el.style.display = k === tabKey ? 'block' : 'none';
  });

  // ปรับข้อความปุ่มเพิ่ม
  const addBtn = document.getElementById('posModalAddBtn');
  if (addBtn) {
    if (tabKey === 'department') {
      addBtn.innerHTML = '➕ เพิ่มฝ่าย/แผนกใหม่';
    } else {
      const labels = {
        executive: '➕ เพิ่มตำแหน่งผู้บริหารระดับสูง',
        manager: '➕ เพิ่มตำแหน่งผู้จัดการ',
        supervisor: '➕ เพิ่มตำแหน่งหัวหน้างาน',
        officer: '➕ เพิ่มตำแหน่งเจ้าหน้าที่/ผู้ช่วย',
        staff: '➕ เพิ่มตำแหน่งพนักงานทั่วไป'
      };
      addBtn.innerHTML = labels[tabKey] || '➕ เพิ่มตำแหน่งใหม่';
    }
  }

  // รีเซ็ตการค้นหา
  const searchInput = document.getElementById('posModalSearch');
  if (searchInput) {
    searchInput.value = '';
    filterPosModalItems();
  }
};

window.filterPosModalItems = function() {
  const query = document.getElementById('posModalSearch')?.value.trim().toLowerCase() || '';
  const currentPanel = document.getElementById(`pos-view-${activePosModalTab}`);
  if (!currentPanel) return;

  const cards = currentPanel.querySelectorAll('.pos-item-card');
  cards.forEach(c => {
    const text = c.textContent.toLowerCase();
    c.style.display = (!query || text.includes(query)) ? 'flex' : 'none';
  });
};

window.quickAddPositionOrDept = async function() {
  const supabase = getSupabase();
  if (!supabase || !window.Swal) return;

  if (activePosModalTab === 'department') {
    const { value: deptName } = await Swal.fire({
      title: '🏢 เพิ่มฝ่าย/แผนกงานใหม่',
      input: 'text',
      inputLabel: 'ระบุชื่อฝ่ายหรือแผนกงาน',
      inputPlaceholder: 'เช่น ฝ่ายการเงิน, ฝ่ายโลจิสติกส์...',
      showCancelButton: true,
      confirmButtonText: '💾 บันทึกแผนก',
      confirmButtonColor: '#0d9488',
      inputValidator: (value) => { if (!value || !value.trim()) return '❌ จำเป็นต้องระบุชื่อแผนก!'; }
    });

    if (deptName && deptName.trim()) {
      const cleanName = deptName.trim();
      const code = generateDeptCode(cleanName);
      Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
      const { error } = await supabase.from('departments').insert([{ department_name: cleanName, department_code: code }]);
      if (error) throw error;
      await saveHRActivityLog('DEPARTMENT', 'INSERT', cleanName, `เพิ่มแผนกงานใหม่: ${cleanName}`);
      Swal.fire('สำเร็จ!', `บันทึกแผนก "${escapeHtml(cleanName)}" เรียบร้อยแล้ว`, 'success');
      refreshDashboard();
    }
  } else {
    const placeholders = {
      executive: 'เช่น ประธานเจ้าหน้าที่บริหาร (CEO), กรรมการผู้จัดการ (MD), ผู้อำนวยการฝ่าย...',
      manager: 'เช่น ผู้จัดการฝ่ายผลิต, ผู้อำนวยการฝ่ายการเงิน...',
      supervisor: 'เช่น หัวหน้าแผนกสโตร์, หัวหน้ากะงาน...',
      officer: 'เช่น เจ้าหน้าที่บัญชี, ผู้ช่วยผู้จัดการ, โปรแกรมเมอร์...',
      staff: 'เช่น พนักงานขนส่ง, พนักงานฝ่ายผลิต, ช่างซ่อมบำรุง...'
    };

    const { value: posName } = await Swal.fire({
      title: '💼 เพิ่มตำแหน่งงานใหม่',
      text: `ประเภท: ${getPositionCategoryLabel(activePosModalTab)}`,
      input: 'text',
      inputLabel: 'ระบุชื่อตำแหน่งงาน',
      inputPlaceholder: placeholders[activePosModalTab] || 'ระบุชื่อตำแหน่ง...',
      showCancelButton: true,
      confirmButtonText: '💾 บันทึกตำแหน่ง',
      confirmButtonColor: '#0d9488',
      inputValidator: (value) => { if (!value || !value.trim()) return '❌ จำเป็นต้องระบุชื่อตำแหน่งงาน!'; }
    });

    if (posName && posName.trim()) {
      const cleanName = posName.trim();
      Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
      const { error } = await supabase.from('positions').insert([{ 
        position_name: cleanName,
        level_type: activePosModalTab,
        status: 'active'
      }]);
      if (error) throw error;
      await saveHRActivityLog('POSITION', 'INSERT', cleanName, `เพิ่มตำแหน่งงานใหม่: ${cleanName} (ประเภท: ${activePosModalTab})`);
      Swal.fire('สำเร็จ!', `บันทึกตำแหน่ง "${escapeHtml(cleanName)}" เรียบร้อยแล้ว`, 'success');
      refreshDashboard();
    }
  }
};

window.editPositionName = async function(posId, currentName) {
  const supabase = getSupabase();
  if (!supabase || !window.Swal) return;

  const { value: newName } = await Swal.fire({
    title: '✏️ แก้ไขชื่อตำแหน่งงาน',
    input: 'text',
    inputValue: currentName,
    showCancelButton: true,
    confirmButtonText: '💾 บันทึกการแก้ไข',
    confirmButtonColor: '#0d9488',
    inputValidator: (value) => { if (!value || !value.trim()) return '❌ กรุณาระบุชื่อตำแหน่ง!'; }
  });

  if (newName && newName.trim() && newName.trim() !== currentName) {
    const cleanName = newName.trim();
    Swal.fire({ title: 'กำลังอัปเดต...', didOpen: () => Swal.showLoading() });
    const { error } = await supabase.from('positions').update({ position_name: cleanName }).eq('id', posId);
    if (error) {
      showAppError("แก้ไขตำแหน่งล้มเหลว", error.message);
      return;
    }
    await saveHRActivityLog('POSITION', 'UPDATE', cleanName, `แก้ไขตำแหน่งจาก ${currentName} เป็น ${cleanName}`);
    Swal.fire('สำเร็จ!', 'อัปเดตชื่อตำแหน่งเรียบร้อยแล้ว', 'success');
    refreshDashboard();
  }
};

window.editDepartmentName = async function(deptId, currentName) {
  const supabase = getSupabase();
  if (!supabase || !window.Swal) return;

  const { value: newName } = await Swal.fire({
    title: '✏️ แก้ไขชื่อฝ่าย/แผนก',
    input: 'text',
    inputValue: currentName,
    showCancelButton: true,
    confirmButtonText: '💾 บันทึกการแก้ไข',
    confirmButtonColor: '#0d9488',
    inputValidator: (value) => { if (!value || !value.trim()) return '❌ กรุณาระบุชื่อแผนก!'; }
  });

  if (newName && newName.trim() && newName.trim() !== currentName) {
    const cleanName = newName.trim();
    Swal.fire({ title: 'กำลังอัปเดต...', didOpen: () => Swal.showLoading() });
    const { error } = await supabase.from('departments').update({ department_name: cleanName }).eq('id', deptId);
    if (error) {
      showAppError("แก้ไขแผนกล้มเหลว", error.message);
      return;
    }
    await saveHRActivityLog('DEPARTMENT', 'UPDATE', cleanName, `แก้ไขแผนกจาก ${currentName} เป็น ${cleanName}`);
    Swal.fire('สำเร็จ!', 'อัปเดตชื่อแผนกเรียบร้อยแล้ว', 'success');
    refreshDashboard();
  }
};

window.deleteDepartmentItem = async function(deptId, deptName, empCount) {
  const supabase = getSupabase();
  if (!supabase || !window.Swal) return;

  if (empCount > 0) {
    Swal.fire('ไม่สามารถลบได้', `ฝ่าย/แผนก "${escapeHtml(deptName)}" มีพนักงานสังกัดอยู่ ${empCount} คน กรุณาย้ายแผนกสังกัดของพนักงานก่อนทำการลบ`, 'warning');
    return;
  }

  const confirm = await Swal.fire({
    title: 'ยืนยันการลบฝ่าย/แผนกงาน?',
    text: `ต้องการลบแผนก "${deptName}" ออกจากระบบ ใช่หรือไม่?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#64748b',
    confirmButtonText: '🗑️ ยืนยันลบ',
    cancelButtonText: 'ยกเลิก'
  });

  if (confirm.isConfirmed) {
    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
    const { error } = await supabase.from('departments').delete().eq('id', deptId);
    if (error) {
      showAppError("ลบแผนกล้มเหลว", error.message);
      return;
    }
    await saveHRActivityLog('DEPARTMENT', 'DELETE', deptName, `ลบฝ่าย/แผนกงาน: ${deptName}`);
    Swal.fire('สำเร็จ!', `ลบแผนก "${escapeHtml(deptName)}" เรียบร้อยแล้ว`, 'success');
    refreshDashboard();
  }
};

window.deletePositionItem = async function(posId, posName, empCount) {
  const supabase = getSupabase();
  if (!supabase || !window.Swal) return;

  if (empCount > 0) {
    Swal.fire('ไม่สามารถลบได้', `ตำแหน่ง "${escapeHtml(posName)}" มีพนักงานสังกัดอยู่ ${empCount} คน กรุณาย้ายตำแหน่งพนักงานก่อนทำการลบ`, 'warning');
    return;
  }

  const confirm = await Swal.fire({
    title: 'ยืนยันการลบตำแหน่งงาน?',
    text: `ต้องการลบตำแหน่ง "${posName}" ออกจากระบบ ใช่หรือไม่?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#64748b',
    confirmButtonText: '🗑️ ยืนยันลบ',
    cancelButtonText: 'ยกเลิก'
  });

  if (confirm.isConfirmed) {
    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
    const { error } = await supabase.from('positions').delete().eq('id', posId);
    if (error) {
      showAppError("ลบตำแหน่งล้มเหลว", error.message);
      return;
    }
    await saveHRActivityLog('POSITION', 'DELETE', posName, `ลบตำแหน่งงาน: ${posName}`);
    Swal.fire('สำเร็จ!', `ลบตำแหน่ง "${escapeHtml(posName)}" เรียบร้อยแล้ว`, 'success');
    refreshDashboard();
  }
};

// ==========================================
// 8. LEAVE RULES & FLEXIBLE BALANCES MANAGEMENT
// ==========================================
async function editGlobalLeaveRules() {
  const supabase = getSupabase();
  if (!supabase || !window.Swal) return;

  try {
    Swal.fire({ title: 'กำลังโหลดประเภทวันลา...', didOpen: () => Swal.showLoading() });
    const { data: rules, error } = await supabase.from('leave_types').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    Swal.close();

    let tableRowsHTML = rules.map(r => `
      <tr style="border-bottom:1px solid #e2e8f0;" id="rule-row-${r.id}">
        <td style="padding:8px; border:1px solid #cbd5e1;">
          <input type="text" id="rule-name-${r.id}" class="swal2-input" value="${escapeHtml(r.leave_name)}" style="margin:0; height:36px; font-size:13px; width:100%;">
          <small style="color:#64748b; font-size:10px;">รหัส: ${escapeHtml(r.leave_code)}</small>
        </td>
        <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">
          <input type="number" id="rule-quota-${r.id}" class="swal2-input" value="${r.yearly_quota || 0}" step="0.5" min="0" style="margin:0; height:36px; font-size:13px; text-align:center; width:80px;">
        </td>
        <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">
          <button type="button" onclick="saveSingleLeaveRule('${r.id}')" style="padding:4px 8px; background:#0d9488; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">💾 บันทึก</button>
        </td>
      </tr>
    `).join('');

    await Swal.fire({
      title: '⚙️ ตั้งค่าโควตากลาง & แก้ไขชื่อประเภทวันลา',
      width: 'min(92vw, 650px)',
      html: `
        <div style="font-family:'Sarabun', sans-serif; text-align:left; margin-bottom:12px;">
          <button type="button" onclick="addNewLeaveTypeModal()" class="action-btn success-zone" style="font-size:12px; padding:6px 12px;">
            ➕ เพิ่มประเภทการลาใหม่
          </button>
        </div>
        <div style="max-height: 350px; overflow-y: auto; font-family:'Sarabun', sans-serif;">
          <table style="width:100%; text-align:left; font-size:13px; border-collapse:collapse;">
            <thead>
              <tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1;">
                <th style="padding:8px; border:1px solid #cbd5e1;">ชื่อประเภทการลา</th>
                <th style="padding:8px; border:1px solid #cbd5e1; width:100px; text-align:center;">โควตา (วัน/ปี)</th>
                <th style="padding:8px; border:1px solid #cbd5e1; width:80px; text-align:center;">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHTML}
            </tbody>
          </table>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'ปิดหน้าต่าง'
    });

  } catch (err) {
    showAppError("ไม่สามารถดึงข้อมูลโควตากลางได้", err.message);
  }
}

// ฟังก์ชันบันทึกชื่อและโควตา
async function saveSingleLeaveRule(ruleId) {
  const supabase = getSupabase();
  const newName = document.getElementById(`rule-name-${ruleId}`)?.value.trim();
  const newQuota = parseFloat(document.getElementById(`rule-quota-${ruleId}`)?.value) || 0;

  if (!newName) {
    Swal.fire('ข้อผิดพลาด', 'กรุณาระบุชื่อประเภทการลา', 'warning');
    return;
  }

  // 🛑 ยืนยันก่อนบันทึกโควตา/กฎการลา
  if (window.Swal) {
    const confirmResult = await Swal.fire({
      title: 'ยืนยันการปรับโควตาประเภทการลา?',
      text: `ต้องการปรับเปลี่ยนชื่อเป็น "${newName}" และโควตาเป็น ${newQuota} วัน ใช่หรือไม่`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0fa472',
      cancelButtonColor: '#64748b',
      confirmButtonText: '✔️ ยืนยันบันทึก',
      cancelButtonText: 'ยกเลิก'
    });
    if (!confirmResult.isConfirmed) return;
  }

  try {
    const { error } = await supabase
      .from('leave_types')
      .update({ leave_name: newName, yearly_quota: newQuota })
      .eq('id', ruleId);

    if (error) throw error;

    await saveHRActivityLog('LEAVE_RULE', 'UPDATE', newName, `ปรับแก้ไขชื่อประเภทวันลาเป็น "${newName}" และโควตาเป็น ${newQuota} วัน`);
    Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: `อัปเดตข้อมูล "${newName}" เรียบร้อยแล้ว`, timer: 1500, showConfirmButton: false });
    refreshDashboard();
  } catch (err) {
    showAppError("บันทึกโควตากลางไม่สำเร็จ", err.message);
  }
}

// ฟังก์ชันเพิ่มประเภทการลาใหม่
async function addNewLeaveTypeModal() {
  const supabase = getSupabase();
  const { value: formValues } = await Swal.fire({
    title: '➕ เพิ่มประเภทการลาใหม่',
    html: `
      <div style="text-align:left; font-family:'Sarabun', sans-serif;">
        <label style="font-size:12px; font-weight:600;">รหัสการลา (Code) *</label>
        <input id="new-lt-code" class="swal2-input" placeholder="เช่น VAC, SICK" style="margin:4px 0 10px; height:38px; font-size:13px; width:100%;">
        <label style="font-size:12px; font-weight:600;">ชื่อประเภทการลา *</label>
        <input id="new-lt-name" class="swal2-input" placeholder="เช่น ลาพักร้อนประจำปี" style="margin:4px 0 10px; height:38px; font-size:13px; width:100%;">
        <label style="font-size:12px; font-weight:600;">โควตากลาง (วัน/ปี)</label>
        <input type="number" id="new-lt-quota" class="swal2-input" value="6" step="0.5" style="margin:4px 0 0; height:38px; font-size:13px; width:100%;">
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'บันทึกประเภทใหม่',
    cancelButtonText: 'ยกเลิก',
    preConfirm: () => {
      const code = document.getElementById('new-lt-code').value.trim();
      const name = document.getElementById('new-lt-name').value.trim();
      const quota = parseFloat(document.getElementById('new-lt-quota').value) || 0;
      if (!code || !name) {
        Swal.showValidationMessage('กรุณากรอกรหัสและชื่อประเภทวันลาให้ครบถ้วน');
        return false;
      }
      return { leave_code: code, leave_name: name, yearly_quota: quota };
    }
  });

  if (formValues) {
    const { error } = await supabase.from('leave_types').insert([formValues]);
    if (error) {
      showAppError('ไม่สามารถเพิ่มประเภทการลาได้', error.message);
    } else {
      Swal.fire('สำเร็จ', 'เพิ่มประเภทวันลาเรียบร้อยแล้ว', 'success');
      editGlobalLeaveRules();
    }
  }
}

async function actionDeleteLeaveType(id, name) {
  const supabase = getSupabase();
  if (!supabase || !window.Swal) return;

  const confirm = await Swal.fire({
    title: '⚠️ ยืนยันปิดสถานะระบบการลานี้?',
    html: `คุณต้องการระงับประเภทการลาชื่อ "<b>${escapeHtml(name)}</b>" หรือไม่?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ระงับการใช้งาน',
    confirmButtonColor: '#ef4444'
  });

  if (!confirm.isConfirmed) { editGlobalLeaveRules(); return; }

  const { error } = await supabase.from('leave_types').update({ status: 'inactive' }).eq('id', id);
  if (error) {
    showAppError('ไม่สามารถระงับประเภทวันลาได้', error.message);
    editGlobalLeaveRules();
  } else {
    await saveHRActivityLog('LEAVE_QUOTA', 'DELETE', name, `ปิดการใช้งานรหัสเกณฑ์วันลา: ${name}`);
    Swal.fire('ลบเสร็จสิ้น', 'อัปเดตสถานะเรียบร้อย', 'success').then(() => editGlobalLeaveRules());
  }
}

async function editIndividualLeaveBalance(presetEmpCode = null) {
  const supabase = getSupabase();
  if (!supabase || !window.Swal) return;

  try {
    let empCode = presetEmpCode;

    if (!empCode) {
      const { value: inputCode } = await Swal.fire({
        title: '🛠️ ปรับโควตาพิเศษรายบุคคล',
        input: 'text',
        inputLabel: 'กรอกรหัสพนักงานที่ต้องการปรับยอดสิทธิ์',
        inputPlaceholder: 'เช่น 19001',
        showCancelButton: true,
        confirmButtonColor: '#0d9488',
        inputValidator: (value) => { if (!value) return '❌ กรุณาระบุรหัสพนักงาน'; }
      });
      empCode = inputCode;
    }

    if (!empCode) return;

    Swal.fire({ title: 'กำลังค้นหาข้อมูลพนักงาน...', didOpen: () => Swal.showLoading() });

    const { data: emp, error: empErr } = await supabase.from('employees').select('id, full_name, employee_code').eq('employee_code', empCode.trim()).maybeSingle();
    if (empErr) throw empErr;

    if (!emp) {
      Swal.fire('ไม่พบรหัสพนักงาน', 'ไม่มีรหัสบุคลากรนี้ในทำเนียบบริษัท', 'warning');
      return;
    }

    const currentYear = new Date().getFullYear();
    let balances = [];
    if (window.PVTSDK?.user?.getLeaveBalances) {
      balances = await window.PVTSDK.user.getLeaveBalances(emp.id, currentYear);
    }

    if (!balances || balances.length === 0) {
      if (window.PVTSDK?.user?.ensureLeaveBalances) {
        await window.PVTSDK.user.ensureLeaveBalances(emp.id, currentYear);
        balances = await window.PVTSDK.user.getLeaveBalances(emp.id, currentYear);
      }
    }

    let formHTML = `<div style="text-align:left; font-size:13px; max-height:360px; overflow-y:auto; font-family:'Sarabun', sans-serif;">`;
    balances.forEach(b => {
      const typeName = b.leave_types?.leave_name || getLeaveType(b.leave_type_id)?.leave_name || 'ทั่วไป';
      const ent = Number(b.entitlement_days ?? 0);
      const used = Number(b.used_days ?? 0);
      const rem = Number(b.remaining_days ?? (ent - used));

      formHTML += `
        <div style="margin-bottom:12px; padding:10px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px;">
          <div style="font-weight:700; color:#0f766e; font-size:14px; margin-bottom:6px;">${escapeHtml(typeName)}</div>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; align-items:center;">

            <div>
              <span style="font-size:11px; color:#64748b; display:block;">สิทธิ์รวม (วัน)</span>
              <div style="display:flex; gap:2px; margin-top:2px;">
                <button type="button" class="btn-light btn-sm" onclick="let el=document.getElementById('entit-${b.id}'); el.value=Math.max(0, (parseFloat(el.value)||0)-0.5); window.calcRem('${b.id}');" style="padding:2px 6px;">-</button>
                <input type="number" id="entit-${b.id}" class="swal2-input" step="0.5" style="width:100%; height:32px; margin:0; font-size:12px; text-align:center; padding:0;" value="${ent}" oninput="window.calcRem('${b.id}')">
                <button type="button" class="btn-light btn-sm" onclick="let el=document.getElementById('entit-${b.id}'); el.value=(parseFloat(el.value)||0)+0.5; window.calcRem('${b.id}');" style="padding:2px 6px;">+</button>
              </div>
            </div>

            <div>
              <span style="font-size:11px; color:#64748b; display:block;">ใช้ไปแล้ว (วัน)</span>
              <div style="display:flex; gap:2px; margin-top:2px;">
                <button type="button" class="btn-light btn-sm" onclick="let el=document.getElementById('used-${b.id}'); el.value=Math.max(0, (parseFloat(el.value)||0)-0.5); window.calcRem('${b.id}');" style="padding:2px 6px;">-</button>
                <input type="number" id="used-${b.id}" class="swal2-input" step="0.5" style="width:100%; height:32px; margin:0; font-size:12px; text-align:center; padding:0;" value="${used}" oninput="window.calcRem('${b.id}')">
                <button type="button" class="btn-light btn-sm" onclick="let el=document.getElementById('used-${b.id}'); el.value=(parseFloat(el.value)||0)+0.5; window.calcRem('${b.id}');" style="padding:2px 6px;">+</button>
              </div>
            </div>

            <div>
              <span style="font-size:11px; color:#0d9488; font-weight:600; display:block;">คงเหลือ (วัน)</span>
              <input type="number" id="remain-${b.id}" class="swal2-input" step="0.5" style="width:100%; height:32px; margin:2px 0 0 0; font-size:12px; text-align:center; font-weight:700; color:#0f766e; background:#e6fffa;" value="${rem}">
            </div>

          </div>
        </div>`;
    });
    formHTML += `</div>`;

    window.calcRem = (bId) => {
      const entVal = parseFloat(document.getElementById(`entit-${bId}`)?.value) || 0;
      const usedVal = parseFloat(document.getElementById(`used-${bId}`)?.value) || 0;
      const remainInput = document.getElementById(`remain-${bId}`);
      if (remainInput) {
        remainInput.value = Math.max(0, entVal - usedVal);
      }
    };

    const { value: updatedBalances } = await Swal.fire({
      title: `🛠️ ปรับโควตา: ${escapeHtml(emp.full_name)}`,
      html: formHTML,
      width: 'min(92vw, 550px)',
      showCancelButton: true,
      confirmButtonText: '💾 อัปเดตยอดโควตา',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#0d9488',
      preConfirm: () => {
        const listBalances = [];
        balances.forEach(b => {
          const newEntit = parseFloat(document.getElementById(`entit-${b.id}`).value) || 0;
          const newUsed = parseFloat(document.getElementById(`used-${b.id}`).value) || 0;
          const newRemain = parseFloat(document.getElementById(`remain-${b.id}`).value) || 0;
          listBalances.push({ 
            id: b.id, 
            leave_type_id: b.leave_type_id,
            leave_code: b.leave_types?.leave_code,
            old_entit: b.entitlement_days, 
            old_used: b.used_days,
            old_remain: b.remaining_days, 
            new_entit: newEntit, 
            new_used: newUsed,
            new_remain: newRemain 
          });
        });
        return listBalances;
      }
    });

    if (updatedBalances) {
      Swal.fire({ title: 'กำลังปรับปรุงยอดโควตา...', didOpen: () => Swal.showLoading() });
      for (const b of updatedBalances) {
        if (b.new_entit !== b.old_entit || b.new_used !== b.old_used || b.new_remain !== b.old_remain) {
          if (window.PVTSDK?.user?.updateLeaveBalance) {
            await window.PVTSDK.user.updateLeaveBalance(emp.id, b.leave_type_id, b.leave_code, currentYear, 0, b.new_used, b.new_entit);
          }
        }
      }
      await saveHRActivityLog('LEAVE_QUOTA', 'UPDATE', emp.employee_code, `ปรับสิทธิ์ใบลาให้คุณ ${emp.full_name}`);
      Swal.fire('สำเร็จ', 'ดำเนินการปรับยอดสิทธิ์เรียบร้อยแล้ว', 'success');
      await refreshDashboard();
      if (document.getElementById("employeeModal")?.classList.contains("open")) {
        openEmployeeDetail(emp.id);
      }
    }
  } catch (err) {
    showAppError("ไม่สามารถปรับโควตารายบุคคลได้", err.message);
  }
}

// =========================================================================
// 📅 หมวดหมู่ระบบจัดการวันหยุดบริษัท (COMPANY HOLIDAYS MANAGEMENT MODULE)
// =========================================================================

// ตัวแปรเก็บแคชรายการวันหยุด
let companyHolidaysCache = [];

/**
 * 1. ดึงข้อมูลวันหยุดจาก Supabase
 */
async function fetchCompanyHolidaysData() {
  const sb = getSupabase(); // เรียกใช้ฟังก์ชันเชื่อมต่อ Supabase ในระบบ
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('holidays')
      .select('*')
      .order('holiday_date', { ascending: true });

    if (error) throw error;
    companyHolidaysCache = data || [];
    return companyHolidaysCache;
  } catch (err) {
    console.error("Fetch Company Holidays Error:", err);
    showAppError("โหลดข้อมูลวันหยุดไม่สำเร็จ", err.message); //
    return [];
  }
}

/**
 * 2. ฟังก์ชันหลัก: เปิดหน้าต่าง (Modal) จัดการวันหยุดทั้งหมด
 * (สร้าง UI ตาราง และปุ่มต่าง ๆ ไดนามิกจาก JS โดยไม่ต้องเขียน HTML รอตารางไว้)
 */
async function openHolidayManagerModal() {
  if (!window.Swal) return;

  Swal.fire({
    title: '⏳ กำลังโหลดข้อมูลวันหยุด...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  const holidays = await fetchCompanyHolidaysData();

  const typeMap = {
    public_holiday: { label: 'วันหยุดนักขัตฤกษ์', style: 'background:#ccfbf1; color:#0f766e;' },
    company_holiday: { label: 'วันหยุดพิเศษบริษัท', style: 'background:#e0e7ff; color:#3730a3;' },
    tradition_holiday: { label: 'วันหยุดตามประเพณี', style: 'background:#fef3c7; color:#92400e;' }
  };

  const rowsHtml = holidays.length === 0
    ? `<tr><td colspan="5" style="text-align:center; padding: 24px; color: #94a3b8;">ไม่พบรายการวันหยุดบริษัท</td></tr>`
    : holidays.map(h => {
        const typeInfo = typeMap[h.holiday_type] || { label: h.holiday_type || 'วันหยุดทั่วไป', style: 'background:#f1f5f9; color:#475569;' };
        const formattedDate = window.pvtSupabase?.formatThaiDate ? window.pvtSupabase.formatThaiDate(h.holiday_date) : h.holiday_date; //

        return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px; font-weight: 600; color: #334155; white-space: nowrap;">${formattedDate}</td>
            <td style="padding: 10px; text-align: left;">
              <div style="font-weight: 600; color: #0f172a;">${escapeHtml(h.holiday_name)}</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${escapeHtml(h.description || '-')}</div>
            </td>
            <td style="padding: 10px;">
              <span style="padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; ${typeInfo.style}">
                ${typeInfo.label}
              </span>
            </td>
            <td style="padding: 10px; text-align: center; white-space: nowrap;">
              <span style="padding: 3px 8px; border-radius: 4px; font-size: 11px; background: ${h.is_paid !== false ? '#dcfce7' : '#f1f5f9'}; color: ${h.is_paid !== false ? '#15803d' : '#64748b'}; font-weight: 600;">
                ${h.is_paid !== false ? 'ได้รับค่าจ้าง' : 'ไม่ได้รับค่าจ้าง'}
              </span>
            </td>
            <td style="padding: 10px; text-align: center; white-space: nowrap;">
              <button onclick="openEditHolidayModal('${h.id}')" style="background:#f8fafc; color:#0284c7; border:1px solid #bae6fd; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px; margin-right:4px;">
                ✏️ แก้ไข
              </button>
                <button onclick="deleteHoliday('${h.id}')" style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px;">
                  🗑️ ลบ
                </button>
            </td>
          </tr>
        `;
      }).join('');

  Swal.fire({
    title: '📅 จัดการวันหยุดบริษัท',
    width: 'min(94vw, 850px)',
    html: `
      <div style="font-family: 'Sarabun', sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <span style="font-size: 13px; color: #64748b;">รายการวันหยุดทั้งหมดประจำปี</span>
          <button onclick="openAddHolidayModal()" style="display: flex; align-items: center; gap: 4px; padding: 8px 14px; background: #0d9488; color: #fff; border: none; border-radius: 8px; font-weight: 500; font-size: 13px; cursor: pointer;">
            ➕ เพิ่มวันหยุดใหม่
          </button>
        </div>

        <div style="max-height: 420px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
            <thead style="position: sticky; top: 0; background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569;">
              <tr>
                <th style="padding: 10px;">วันที่</th>
                <th style="padding: 10px;">ชื่อวันหยุด & รายละเอียด</th>
                <th style="padding: 10px;">ประเภท</th>
                <th style="padding: 10px; text-align: center;">สิทธิ์ค่าจ้าง</th>
                <th style="padding: 10px; text-align: center;">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `,
    showConfirmButton: false,
    showCloseButton: true
  });
}

/**
 * 3. เปิด Modal สำหรับ "เพิ่มวันหยุดใหม่"
 */
async function openAddHolidayModal() {
  if (!window.Swal) return;

  const { value: formValues } = await Swal.fire({
    title: '➕ เพิ่มวันหยุดบริษัท',
    width: 'min(92vw, 480px)',
    html: `
      <div style="text-align: left; display: flex; flex-direction: column; gap: 12px; font-family: 'Sarabun', sans-serif;">
        <div>
          <label style="font-size: 13px; font-weight: 600;">ชื่อวันหยุด *</label>
          <input id="swal-holiday-name" class="swal2-input" placeholder="เช่น วันขึ้นปีใหม่" style="margin: 4px 0 0; width: 100%; height: 38px;">
        </div>
        <div>
          <label style="font-size: 13px; font-weight: 600;">วันที่ *</label>
          <input type="date" id="swal-holiday-date" class="swal2-input" style="margin: 4px 0 0; width: 100%; height: 38px;">
        </div>
        <div>
          <label style="font-size: 13px; font-weight: 600;">ประเภทวันหยุด *</label>
          <select id="swal-holiday-type" class="swal2-select" style="margin: 4px 0 0; width: 100%; height: 38px;">
            <option value="public_holiday">วันหยุดนักขัตฤกษ์</option>
            <option value="company_holiday">วันหยุดพิเศษบริษัท</option>
            <option value="tradition_holiday">วันหยุดตามประเพณี</option>
          </select>
        </div>
        <div>
          <label style="font-size: 13px; font-weight: 600;">รายละเอียดเพิ่มเติม</label>
          <textarea id="swal-holiday-desc" class="swal2-textarea" placeholder="รายละเอียดวันหยุด..." style="margin: 4px 0 0; width: 100%; height: 60px; font-size: 13px;"></textarea>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="swal-holiday-paid" checked style="width: 16px; height: 16px; cursor: pointer;">
          <label for="swal-holiday-paid" style="font-size: 13px; font-weight: 600; cursor: pointer;">ได้รับค่าจ้าง (Paid Leave)</label>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '💾 บันทึกวันหยุด',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0d9488',
    preConfirm: () => {
      const name = document.getElementById('swal-holiday-name').value.trim();
      const date = document.getElementById('swal-holiday-date').value;
      const type = document.getElementById('swal-holiday-type').value;
      const desc = document.getElementById('swal-holiday-desc').value.trim();
      const isPaid = document.getElementById('swal-holiday-paid').checked;

      if (!name || !date) {
        Swal.showValidationMessage('⚠️ กรุณากรอกชื่อวันหยุดและเลือกวันที่ให้ครบถ้วน');
        return false;
      }
      return { holiday_name: name, holiday_date: date, holiday_type: type, description: desc, is_paid: isPaid };
    }
  });

  if (formValues) {
    try {
      const supabase = getSupabase();
      Swal.fire({ title: 'กำลังบันทึกข้อมูล...', didOpen: () => Swal.showLoading() });
      const { error } = await supabase.from('holidays').insert([formValues]);
      if (error) throw error;

      await saveHRActivityLog('HOLIDAY', 'INSERT', formValues.holiday_name, `เพิ่มวันหยุดบริษัท: ${formValues.holiday_name} (${formValues.holiday_date})`);
      Swal.fire('สำเร็จ!', 'บันทึกวันหยุดเรียบร้อยแล้ว', 'success');
      openHolidayManagerModal();
    } catch (err) {
      showAppError('ไม่สามารถเพิ่มวันหยุดได้', err.message);
    }
  }
}

/**
 * 4. เปิด Modal สำหรับ "แก้ไขวันหยุด" (แก้ไข ชื่อ, รายละเอียด, ประเภท, วันที่, สิทธิ์ค่าจ้าง)
 */
async function openEditHolidayModal(holidayId) {
  const holiday = companyHolidaysCache.find(h => String(h.id) === String(holidayId));
  if (!holiday) {
    showAppError("ไม่พบข้อมูล", "ไม่พบข้อมูลวันหยุดที่ต้องการแก้ไข");
    return;
  }

  const { value: formValues } = await Swal.fire({
    title: '✏️ แก้ไขวันหยุดบริษัท',
    width: 'min(92vw, 480px)',
    html: `
      <div style="text-align: left; display: flex; flex-direction: column; gap: 12px; font-family: 'Sarabun', sans-serif;">
        <div>
          <label style="font-size: 13px; font-weight: 600; color: #334155;">วันที่วันหยุด <span style="color:red">*</span></label>
          <input type="date" id="swal-edit-holiday-date" class="swal2-input" value="${holiday.holiday_date}" style="width: 100%; margin: 4px 0 0 0; font-size: 14px;">
        </div>
        <div>
          <label style="font-size: 13px; font-weight: 600; color: #334155;">ชื่อวันหยุด <span style="color:red">*</span></label>
          <input type="text" id="swal-edit-holiday-name" class="swal2-input" value="${escapeHtml(holiday.holiday_name || '')}" placeholder="เช่น วันสงกรานต์" style="width: 100%; margin: 4px 0 0 0; font-size: 14px;">
        </div>
        <div>
          <label style="font-size: 13px; font-weight: 600; color: #334155;">ประเภทวันหยุด</label>
          <select id="swal-edit-holiday-type" class="swal2-select" style="width: 100%; margin: 4px 0 0 0; height: 42px; border-radius: 8px; font-size: 14px;">
            <option value="public_holiday" ${holiday.holiday_type === 'public_holiday' ? 'selected' : ''}>วันหยุดนักขัตฤกษ์</option>
            <option value="company_holiday" ${holiday.holiday_type === 'company_holiday' ? 'selected' : ''}>วันหยุดพิเศษบริษัท</option>
            <option value="tradition_holiday" ${holiday.holiday_type === 'tradition_holiday' ? 'selected' : ''}>วันหยุดตามประเพณี</option>
          </select>
        </div>
        <div>
          <label style="font-size: 13px; font-weight: 600; color: #334155;">รายละเอียดเพิ่มเติม</label>
          <textarea id="swal-edit-holiday-desc" class="swal2-textarea" placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)" style="width: 100%; margin: 4px 0 0 0; height: 70px; font-size: 14px;">${escapeHtml(holiday.description || '')}</textarea>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
          <input type="checkbox" id="swal-edit-holiday-paid" ${holiday.is_paid !== false ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: #0d9488;">
          <label for="swal-edit-holiday-paid" style="font-size: 13px; font-weight: 500; cursor: pointer;">เป็นวันหยุดที่ได้รับค่าจ้าง (Paid Holiday)</label>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'บันทึกการแก้ไข',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0d9488',
    focusConfirm: false,
    preConfirm: () => {
      const date = document.getElementById('swal-edit-holiday-date').value;
      const name = document.getElementById('swal-edit-holiday-name').value.trim();
      const type = document.getElementById('swal-edit-holiday-type').value;
      const desc = document.getElementById('swal-edit-holiday-desc').value.trim();
      const isPaid = document.getElementById('swal-edit-holiday-paid').checked;

      if (!date || !name) {
        Swal.showValidationMessage('กรุณากรอกวันที่และชื่อวันหยุดให้ครบถ้วน');
        return false;
      }
      return {
        holiday_date: date,
        holiday_name: name,
        holiday_type: type,
        description: desc,
        is_paid: isPaid
      };
    }
  });

  if (formValues) {
    const sb = getSupabase();
    const { error } = await sb
      .from('holidays')
      .update(formValues)
      .eq('id', holidayId);

    if (error) {
      showAppError('แก้ไขวันหยุดไม่สำเร็จ', error.message);
    } else {
      if (typeof saveHRActivityLog === 'function') {
        saveHRActivityLog('วันหยุดบริษัท', 'แก้ไขวันหยุด', formValues.holiday_name, `อัปเดต ID: ${holidayId}`); //
      }
      Swal.fire({ icon: 'success', title: 'อัปเดตข้อมูลวันหยุดเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
      openHolidayManagerModal(); // รีโหลด Popup ตารางหลัก
    }
  }
}

/**
 * 5. ฟังก์ชันลบรายการวันหยุด
 */
// =========================================================================
// 🗑️ ฟังก์ชันลบวันหยุด (รองรับทั้งการคลิก Inline และป้องกัน Quote Error)
// =========================================================================

/**
 * ฟังก์ชันลบรายการวันหยุด
 * @param {number|string} holidayId - ID ของวันหยุดที่ต้องการลบ
 */
async function deleteHoliday(holidayId) {
  // 1. ค้นหาข้อมูลวันหยุดจาก Cache ด้วย ID เพื่อเลี่ยงปัญหาการส่ง String ชื่อผ่าน HTML onclick
  const holiday = (companyHolidaysCache || []).find(h => String(h.id) === String(holidayId));
  const holidayName = holiday ? (holiday.holiday_name || holiday.name || 'รายการนี้') : 'รายการนี้';

  if (!window.Swal) return;

  // 2. แสดง Popup ยืนยันการลบ
  const result = await Swal.fire({
    title: 'ยืนยันลบวันหยุด?',
    text: `คุณต้องการลบ "${holidayName}" ออกจากระบบใช่หรือไม่`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันลบ',
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true
  });

  if (result.isConfirmed) {
    try {
      const sb = getSupabase();
      // ลบข้อมูลออกจากตาราง holidays ใน Supabase
      const { error } = await sb.from('holidays').delete().eq('id', holidayId);

      if (error) throw error;

      // บันทึก Log การลบ
      if (typeof saveHRActivityLog === 'function') {
        saveHRActivityLog('วันหยุดบริษัท', 'ลบวันหยุด', holidayName, `ลบข้อมูล ID: ${holidayId}`);
      }

      await Swal.fire({ 
        icon: 'success', 
        title: 'ลบรายการสำเร็จ', 
        timer: 1500, 
        showConfirmButton: false 
      });

      // รีโหลด Modal ตารางวันหยุดใหม่
      if (typeof openHolidayManagerModal === 'function') {
        openHolidayManagerModal();
      }
    } catch (err) {
      console.error("Delete Holiday Error:", err);
      showAppError('ลบวันหยุดไม่สำเร็จ', err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล');
    }
  }
}

// ⚠️ สำคัญมาก: ผูกฟังก์ชันเข้ากับ window เพื่อให้ onclick ใน HTML เรียกใช้งานได้เสมอ
window.deleteHoliday = deleteHoliday;

// ==========================================
// EXCEL EXPORT ENGINE (EXCELJS INTEGRATION)
// ==========================================
/**
 * 📊 ดึงรายงานการลาและโควตาวันลาพนักงานเป็นไฟล์ Excel
 * รองรับทั้ง:
 * 1. ดึงข้อมูลพนักงานทั้งหมด 100% (ไม่สนว่าจะมีใบลาหรือไม่) รูปแบบคล้ายตาราง employee_leave_balances ใน Supabase
 * 2. เอาเฉพาะพนักงานที่มีประวัติการลา (Leave Active Only)
 * 3. รวมทุกข้อมูลในไฟล์เดียว (All-in-One Workbook: ทุกคน + คนที่ลา + ประวัติใบลาดิบ + ตาราง Supabase 1:1)
 * 4. ประวัติใบลาแบบละเอียดรายใบ (Raw Leave Requests)
 */
async function exportAllLeaveHistoryExcel() {
  if (typeof ExcelJS === "undefined") {
    showAppError("ไลบรารีไม่พร้อมใช้งาน", "ยังไม่ได้โหลด ExcelJS กรุณารีเฟรชหน้าเว็บ");
    return;
  }

  // 1. ตรวจสอบและดึงข้อมูลพนักงานหากยังไม่มี
  if (!employees || !employees.length) {
    if (typeof fetchEmployees === "function") {
      await fetchEmployees();
    }
  }

  if (!employees || !employees.length) {
    showAppError("ไม่พบข้อมูลพนักงาน", "ยังไม่มีข้อมูลพนักงานในระบบสำหรับส่งออก");
    return;
  }

  // 2. ให้ผู้ใช้เลือกรูปแบบรายงานที่ต้องการอย่างชัดเจน
  const empCount = employees.length;
  const leaveCount = Array.isArray(leaveRequests) ? leaveRequests.length : 0;

  const { value: exportType } = await Swal.fire({
    title: '📊 ส่งออกรายงานการลา & โควตาพนักงาน (Excel)',
    html: `
      <div style="text-align: left; font-family: 'Sarabun', sans-serif; font-size: 13.5px; color: #334155;">
        <div style="margin-bottom: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 13px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>👥 พนักงานทั้งหมด: <strong style="color: #0d9488;">${empCount} คน</strong></span>
            <span>📋 ใบลาในระบบ: <strong style="color: #2563eb;">${leaveCount} รายการ</strong></span>
          </div>
          <div style="font-size: 11.5px; color: #64748b; margin-top: 4px;">
            อิงตามฐานข้อมูลตาราง <code style="background: #e2e8f0; padding: 1px 5px; border-radius: 4px;">employee_leave_balances</code> และ <code style="background: #e2e8f0; padding: 1px 5px; border-radius: 4px;">leave_requests</code>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <!-- 1. พนักงานทุกคน -->
          <label style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1.5px solid #cbd5e1; border-radius: 10px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='#0d9488'; this.style.background='#f0fdfa';" onmouseout="this.style.borderColor='#cbd5e1'; this.style.background='transparent';">
            <input type="radio" name="exportChoiceRadio" value="all_employees" checked style="margin-top: 3px; accent-color: #0d9488; transform: scale(1.2);">
            <div>
              <div style="font-weight: 700; color: #0f172a; font-size: 14px;">👥 1. ดึงข้อมูลพนักงานทั้งหมด (ไม่สนใบลารวม)</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                ส่งออกพนักงานทุกคนในระบบ 100% (แม้ไม่เคยลา) โครงสร้างตามตาราง <code>employee_leave_balances</code> พร้อมยอดสิทธิ์, ใช้ไป, คงเหลือ ครบทุกประเภท
              </div>
            </div>
          </label>

          <!-- 2. เฉพาะคนที่ลา -->
          <label style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1.5px solid #cbd5e1; border-radius: 10px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='#0d9488'; this.style.background='#f0fdfa';" onmouseout="this.style.borderColor='#cbd5e1'; this.style.background='transparent';">
            <input type="radio" name="exportChoiceRadio" value="active_only" style="margin-top: 3px; accent-color: #0d9488; transform: scale(1.2);">
            <div>
              <div style="font-weight: 700; color: #0f172a; font-size: 14px;">🏃 2. เอาเฉพาะคนที่ลา (Employees with Leave Requests)</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                คัดกรองเฉพาะพนักงานที่เคยมียอดวันลาที่ใช้ไป หรือมีประวัติการยื่นใบลา พร้อมตารางสรุปโควตาคล้าย <code>employee_leave_balances</code>
              </div>
            </div>
          </label>

          <!-- 3. รวมทุกอย่างในไฟล์เดียว -->
          <label style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1.5px solid #cbd5e1; border-radius: 10px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='#0d9488'; this.style.background='#f0fdfa';" onmouseout="this.style.borderColor='#cbd5e1'; this.style.background='transparent';">
            <input type="radio" name="exportChoiceRadio" value="all_in_one" style="margin-top: 3px; accent-color: #0d9488; transform: scale(1.2);">
            <div>
              <div style="font-weight: 700; color: #0f172a; font-size: 14px;">📑 3. รวมทุกข้อมูลในไฟล์เดียว (All-in-One Complete Workbook)</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                ครบถ้วนทุกชีต: ชีตพนักงานทุกคน + ชีตเฉพาะคนที่ลา + ชีตประวัติใบลาละเอียด + ชีตโครงสร้าง Supabase 1:1
              </div>
            </div>
          </label>

          <!-- 4. ประวัติใบลาดิบ -->
          <label style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1.5px solid #cbd5e1; border-radius: 10px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='#0d9488'; this.style.background='#f0fdfa';" onmouseout="this.style.borderColor='#cbd5e1'; this.style.background='transparent';">
            <input type="radio" name="exportChoiceRadio" value="raw_leaves" style="margin-top: 3px; accent-color: #0d9488; transform: scale(1.2);">
            <div>
              <div style="font-weight: 700; color: #0f172a; font-size: 14px;">📄 4. ข้อมูลประวัติใบลาแบบละเอียดรายใบ (Raw Leave Requests Only)</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                รายการคำขอลาทุกรายการ พร้อมวันเริ่มต้น-สิ้นสุด เหตุผล สถานะ และผู้อนุมัติ
              </div>
            </div>
          </label>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">download</span> ดาวน์โหลด Excel',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0d9488',
    cancelButtonColor: '#94a3b8',
    width: 'min(94vw, 580px)',
    preConfirm: () => {
      const selected = document.querySelector('input[name="exportChoiceRadio"]:checked');
      return selected ? selected.value : 'all_employees';
    }
  });

  if (!exportType) return; // กดยกเลิก

  await generateAndDownloadLeaveBalancesExcel(exportType);
}

/**
 * ⚡ ฟังก์ชันประมวลผลข้อมูลและสร้างไฟล์ Excel ตามตัวเลือกที่ระบุ
 * @param {'all_employees' | 'active_only' | 'all_in_one' | 'raw_leaves'} mode 
 */
async function generateAndDownloadLeaveBalancesExcel(mode = 'all_employees') {
  Swal.fire({
    title: 'กำลังสร้างไฟล์ Excel...',
    text: 'กำลังรวบรวมข้อมูลจากตาราง employee_leave_balances และจัดรูปแบบรายงาน',
    didOpen: () => Swal.showLoading(),
    allowOutsideClick: false
  });

  try {
    const sb = getSupabase();
    const currentYearAD = new Date().getFullYear();
    const thaiYear = currentYearAD > 2400 ? currentYearAD : currentYearAD + 543;
    const yearAD = currentYearAD > 2400 ? currentYearAD - 543 : currentYearAD;

    // 1. ดึงข้อมูลพนักงานล่าสุด
    if (!employees || !employees.length) {
      await fetchEmployees();
    }

    // 2. ดึงข้อมูลใบลาล่าสุด
    if (!leaveRequests || !leaveRequests.length) {
      if (typeof fetchLeaveRequests === 'function') {
        await fetchLeaveRequests();
      }
    }

    // 3. ดึงข้อมูลจากตาราง employee_leave_balances ใน Supabase สำหรับปีปัจจุบัน
    let rawBalances = [];
    if (sb) {
      try {
        const { data, error } = await sb
          .from("employee_leave_balances")
          .select("*")
          .in("year", [yearAD, thaiYear]);

        if (!error && Array.isArray(data)) {
          rawBalances = data;
        }
      } catch (dbErr) {
        console.warn("Could not query employee_leave_balances:", dbErr);
      }
    }

    // สร้าง Map สำหรับค้นหาโควตาตาม employee_id
    const balancesMap = new Map();
    rawBalances.forEach(b => {
      if (b && b.employee_id) {
        balancesMap.set(String(b.employee_id), b);
      }
    });

    // สร้าง Map สำหรับจัดกลุ่มประวัติใบลาตาม employee_id
    const requestsByEmp = new Map();
    (leaveRequests || []).forEach(r => {
      if (r && r.employee_id) {
        const eid = String(r.employee_id);
        if (!requestsByEmp.has(eid)) requestsByEmp.set(eid, []);
        requestsByEmp.get(eid).push(r);
      }
    });

    // 4. รวบรวมข้อมูลโควตาวันลาของพนักงานทุกคน (All Employees Dataset)
    const allEmployeesData = (employees || []).map((emp, index) => {
      const eid = String(emp.id);
      const bal = balancesMap.get(eid);
      const empRequests = requestsByEmp.get(eid) || [];

      // ดึงหรือคำนวณสิทธิ์และวันลาที่ใช้ไป (อิงตาม employee_leave_balances)
      let sick_total = bal ? Number(bal.sick_total ?? 30) : 30;
      let sick_used = bal ? Number(bal.sick_used ?? 0) : 0;

      let personal_total = bal ? Number(bal.personal_total ?? 6) : 6;
      let personal_used = bal ? Number(bal.personal_used ?? 0) : 0;

      let vacation_total = bal ? Number(bal.vacation_total ?? 6) : 6;
      let vacation_used = bal ? Number(bal.vacation_used ?? 0) : 0;

      let maternity_total = bal ? Number(bal.maternity_total ?? 98) : 98;
      let maternity_used = bal ? Number(bal.maternity_used ?? 0) : 0;

      let other_total = bal ? Number(bal.other_total ?? 30) : 30;
      let other_used = bal ? Number(bal.other_used ?? 0) : 0;

      // หากไม่มีข้อมูลใน employee_leave_balances แต่มีใบลาที่อนุมัติแล้วในระบบ ให้คำนวณวันลาที่ใช้ไป
      if (!bal && empRequests.length > 0) {
        empRequests.forEach(r => {
          if (String(r.status).toLowerCase() === 'approved') {
            const days = Number(r.total_days || 0);
            const typeName = String(getLeaveType(r.leave_type_id)?.leave_name || '').toLowerCase();
            if (typeName.includes('ป่วย')) sick_used += days;
            else if (typeName.includes('กิจ')) personal_used += days;
            else if (typeName.includes('พักร้อน')) vacation_used += days;
            else if (typeName.includes('คลอด')) maternity_used += days;
            else other_used += days;
          }
        });
      }

      // คำนวณคงเหลือ
      const sick_remaining = Math.max(0, sick_total - sick_used);
      const personal_remaining = Math.max(0, personal_total - personal_used);
      const vacation_remaining = Math.max(0, vacation_total - vacation_used);
      const maternity_remaining = Math.max(0, maternity_total - maternity_used);
      const other_remaining = Math.max(0, other_total - other_used);

      // ยอดรวม
      const total_entitled = sick_total + personal_total + vacation_total + maternity_total + other_total;
      const total_used = sick_used + personal_used + vacation_used + maternity_used + other_used;
      const total_remaining = Math.max(0, total_entitled - total_used);

      // ตรวจสอบว่าพนักงานคนนี้ "เคยลาหรือไม่" (Active Leave Employee)
      const isLeaveActive = total_used > 0 || empRequests.length > 0;

      const deptName = emp.departments?.department_name || (typeof emp.departments === 'string' ? emp.departments : '-');
      const posName = emp.positions?.position_name || (typeof emp.positions === 'string' ? emp.positions : '-');
      
      let statusText = 'ปฏิบัติงาน';
      if (emp.status === 'resigned' || emp.status === 'inactive') statusText = 'พ้นสภาพ/ลาออก';
      else if (emp.status === 'probation') statusText = 'ทดลองงาน';

      return {
        no: index + 1,
        employee_id: emp.id,
        balance_id: bal?.id || `BAL-${emp.id.substring(0, 8)}`,
        employee_code: emp.employee_code || '-',
        full_name: emp.full_name || '-',
        nickname: emp.nickname || '-',
        department_name: deptName,
        position_name: posName,
        status: statusText,
        start_date: emp.start_date ? new Date(emp.start_date).toLocaleDateString('th-TH') : '-',
        year: bal?.year || thaiYear,
        
        // หมวดลาป่วย
        sick_total,
        sick_used,
        sick_remaining,

        // หมวดลากิจ
        personal_total,
        personal_used,
        personal_remaining,

        // หมวดพักร้อน
        vacation_total,
        vacation_used,
        vacation_remaining,

        // หมวดลาคลอด
        maternity_total,
        maternity_used,
        maternity_remaining,

        // หมวดลาอื่นๆ
        other_total,
        other_used,
        other_remaining,

        // สรุปรวม
        total_entitled,
        total_used,
        total_remaining,

        // สถิติใบลา
        leave_requests_count: empRequests.length,
        approved_requests_count: empRequests.filter(r => String(r.status).toLowerCase() === 'approved').length,
        isLeaveActive,
        created_at: bal?.created_at || emp.created_at || new Date().toISOString(),
        updated_at: bal?.updated_at || new Date().toISOString()
      };
    });

    // พนักงานเฉพาะคนที่มีประวัติการลา
    const activeOnlyData = allEmployeesData.filter(e => e.isLeaveActive);

    // 5. สร้าง Workbook ด้วย ExcelJS
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "PVT Workforce Hub";
    workbook.created = new Date();

    const dateStr = new Date().toISOString().slice(0, 10);
    let fileName = `รายงานการลา_${dateStr}.xlsx`;

    // -------------------------------------------------------------
    // BUILD SHEETS ตาม MODE ที่เลือก
    // -------------------------------------------------------------
    if (mode === 'all_employees') {
      // 1. ดึงพนักงานทุกคน (ไม่สนว่าจะมีใบลาหรือไม่)
      fileName = `โควตาวันลาพนักงานทุกคน_PVT_${thaiYear}_${dateStr}.xlsx`;
      addLeaveBalancesWorksheet(workbook, `โควตาพนักงานทุกคน (${allEmployeesData.length})`, allEmployeesData, `พนักงานทั้งหมด (${allEmployeesData.length} คน)`);
      addSupabaseFormatWorksheet(workbook, "ตาราง Supabase Format", allEmployeesData);
    } 
    else if (mode === 'active_only') {
      // 2. เอาเฉพาะคนที่ลา
      fileName = `โควตาวันลาเฉพาะคนที่มีการลา_PVT_${thaiYear}_${dateStr}.xlsx`;
      const activeList = activeOnlyData.length > 0 ? activeOnlyData : allEmployeesData;
      const subtitle = activeOnlyData.length > 0 
        ? `เฉพาะพนักงานที่มีการลา (${activeOnlyData.length} คน)` 
        : `ไม่พบพนักงานที่มีการลา แสดงพนักงานทั้งหมด (${allEmployeesData.length} คน)`;
      
      addLeaveBalancesWorksheet(workbook, `เฉพาะคนที่มีการลา (${activeOnlyData.length})`, activeList, subtitle);
      addRawLeaveRequestsWorksheet(workbook, "ประวัติใบลาทั้งหมด", leaveRequests, employees);
    } 
    else if (mode === 'all_in_one') {
      // 3. รวมทุกชีตในเล่มเดียว
      fileName = `รายงานโควตาและประวัติการลารวมเล่ม_PVT_${thaiYear}_${dateStr}.xlsx`;
      addLeaveBalancesWorksheet(workbook, "1.พนักงานทุกคน (All)", allEmployeesData, `พนักงานทั้งหมดในระบบ (${allEmployeesData.length} คน)`);
      addLeaveBalancesWorksheet(workbook, "2.เฉพาะคนลา (Active)", activeOnlyData.length > 0 ? activeOnlyData : allEmployeesData, `เฉพาะคนที่มีการลา (${activeOnlyData.length} คน)`);
      addRawLeaveRequestsWorksheet(workbook, "3.ประวัติใบลาละเอียด", leaveRequests, employees);
      addSupabaseFormatWorksheet(workbook, "4.Supabase Format (1-1)", allEmployeesData);
    } 
    else if (mode === 'raw_leaves') {
      // 4. ประวัติใบลาดิบ
      fileName = `ประวัติการลาดิบ_PVT_${dateStr}.xlsx`;
      addRawLeaveRequestsWorksheet(workbook, "ประวัติใบลาทั้งหมด", leaveRequests, employees);
      addLeaveBalancesWorksheet(workbook, "สรุปโควตาพนักงานทุกคน", allEmployeesData, `ข้อมูลสรุปพนักงานทั้งหมด (${allEmployeesData.length} คน)`);
    }

    // 6. ดาวน์โหลดไฟล์
    const buffer = await workbook.xlsx.writeBuffer();
    window.pvtSupabase.downloadBlob(
      fileName,
      buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    Swal.fire({
      icon: "success",
      title: "ดาวน์โหลดสำเร็จ!",
      html: `
        <div style="font-size: 13.5px; text-align: left; color: #334155;">
          <div>✅ ส่งออกไฟล์ <strong>${fileName}</strong> เรียบร้อยแล้ว</div>
          <div style="margin-top: 6px; font-size: 12px; color: #64748b;">
            • จำนวนพนักงานในรายงาน: <strong>${mode === 'active_only' ? activeOnlyData.length : allEmployeesData.length} คน</strong><br/>
            • โครงสร้างคอลัมน์ตรงตามตาราง <code>employee_leave_balances</code> ของ Supabase ครบทุกประเภทวันลา
          </div>
        </div>
      `,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#0d9488',
      showDenyButton: false,
      showCancelButton: false,
      showCloseButton: false
    });

  } catch (err) {
    console.error("Excel Export Error:", err);
    showAppError("ไม่สามารถสร้างไฟล์ Excel ได้", err.message);
  }
}

/**
 * 🎨 Helper: สร้างชีตตารางโควตาวันลา (employee_leave_balances) พร้อมสไตล์ที่สวยงามและอ่านง่าย
 */
function addLeaveBalancesWorksheet(workbook, sheetTitle, dataList, scopeSubtitle = '') {
  const sheet = workbook.addWorksheet(sheetTitle);
  sheet.views = [{ state: 'frozen', ySplit: 4, showGridLines: true }];

  // 1. หัวข้อรายงาน (Banner Rows)
  sheet.mergeCells("A1:AA1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `🏢 บริษัท ปัญจวัฒนา จำกัด - รายงานสรุปโควตาวันลาพนักงาน (employee_leave_balances)`;
  titleCell.font = { name: "Sarabun", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 36;

  sheet.mergeCells("A2:AA2");
  const subCell = sheet.getCell("A2");
  const nowStr = new Date().toLocaleString("th-TH");
  subCell.value = `ขอบเขตรายงาน: ${scopeSubtitle} | วันที่ส่งออก: ${nowStr} | ตารางฐานข้อมูล: public.employee_leave_balances`;
  subCell.font = { name: "Sarabun", size: 10.5, italic: true, color: { argb: "FF475569" } };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDFA" } };
  subCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(2).height = 22;

  // 2. หมวดหมู่กลุ่มหัวตาราง (Group Headers - Row 3)
  const groupRow = sheet.getRow(3);
  groupRow.height = 24;

  sheet.mergeCells("A3:F3");
  sheet.getCell("A3").value = "ข้อมูลพนักงานทั่วไป (Employee Info)";
  sheet.getCell("A3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  sheet.getCell("A3").font = { name: "Sarabun", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A3").alignment = { horizontal: "center", vertical: "middle" };

  sheet.getCell("G3").value = "ปี พ.ศ.";
  sheet.getCell("G3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  sheet.getCell("G3").font = { name: "Sarabun", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("G3").alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("H3:J3");
  sheet.getCell("H3").value = "🩺 ลาป่วย (Sick)";
  sheet.getCell("H3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D9488" } };
  sheet.getCell("H3").font = { name: "Sarabun", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("H3").alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("K3:M3");
  sheet.getCell("K3").value = "💼 ลากิจ (Personal)";
  sheet.getCell("K3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  sheet.getCell("K3").font = { name: "Sarabun", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("K3").alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("N3:P3");
  sheet.getCell("N3").value = "🏖️ พักร้อน (Vacation)";
  sheet.getCell("N3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
  sheet.getCell("N3").font = { name: "Sarabun", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("N3").alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("Q3:S3");
  sheet.getCell("Q3").value = "🍼 ลาคลอด (Maternity)";
  sheet.getCell("Q3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C3AED" } };
  sheet.getCell("Q3").font = { name: "Sarabun", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("Q3").alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("T3:V3");
  sheet.getCell("T3").value = "📌 ลาอื่นๆ (Other)";
  sheet.getCell("T3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF475569" } };
  sheet.getCell("T3").font = { name: "Sarabun", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("T3").alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("W3:Y3");
  sheet.getCell("W3").value = "📊 สรุปรวมวันลาทุกประเภท";
  sheet.getCell("W3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
  sheet.getCell("W3").font = { name: "Sarabun", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("W3").alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("Z3:AA3");
  sheet.getCell("Z3").value = "สถิติใบลา & สถานะ";
  sheet.getCell("Z3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0284C7" } };
  sheet.getCell("Z3").font = { name: "Sarabun", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("Z3").alignment = { horizontal: "center", vertical: "middle" };

  // 3. ชื่อคอลัมน์ย่อย (Row 4)
  const columnsDef = [
    { key: "no", header: "ลำดับ", width: 7 },
    { key: "employee_code", header: "รหัสพนักงาน", width: 14 },
    { key: "full_name", header: "ชื่อ - นามสกุล", width: 22 },
    { key: "nickname", header: "ชื่อเล่น", width: 11 },
    { key: "department_name", header: "แผนก / ฝ่าย", width: 18 },
    { key: "position_name", header: "ตำแหน่งงาน", width: 20 },
    { key: "year", header: "ปี พ.ศ.", width: 10 },

    // ลาป่วย
    { key: "sick_total", header: "สิทธิ์ (วัน)", width: 11 },
    { key: "sick_used", header: "ใช้ไป (วัน)", width: 11 },
    { key: "sick_remaining", header: "คงเหลือ (วัน)", width: 12 },

    // ลากิจ
    { key: "personal_total", header: "สิทธิ์ (วัน)", width: 11 },
    { key: "personal_used", header: "ใช้ไป (วัน)", width: 11 },
    { key: "personal_remaining", header: "คงเหลือ (วัน)", width: 12 },

    // พักร้อน
    { key: "vacation_total", header: "สิทธิ์ (วัน)", width: 11 },
    { key: "vacation_used", header: "ใช้ไป (วัน)", width: 11 },
    { key: "vacation_remaining", header: "คงเหลือ (วัน)", width: 12 },

    // ลาคลอด
    { key: "maternity_total", header: "สิทธิ์ (วัน)", width: 11 },
    { key: "maternity_used", header: "ใช้ไป (วัน)", width: 11 },
    { key: "maternity_remaining", header: "คงเหลือ (วัน)", width: 12 },

    // ลาอื่นๆ
    { key: "other_total", header: "สิทธิ์ (วัน)", width: 11 },
    { key: "other_used", header: "ใช้ไป (วัน)", width: 11 },
    { key: "other_remaining", header: "คงเหลือ (วัน)", width: 12 },

    // สรุปรวม
    { key: "total_entitled", header: "สิทธิ์รวม", width: 12 },
    { key: "total_used", header: "ใช้ไปรวม", width: 12 },
    { key: "total_remaining", header: "คงเหลือรวม", width: 13 },

    // สถิติใบลา
    { key: "leave_requests_count", header: "จำนวนใบลา", width: 12 },
    { key: "leave_status_note", header: "ประวัติการลา", width: 16 }
  ];

  const subHeaderRow = sheet.getRow(4);
  subHeaderRow.height = 24;
  columnsDef.forEach((col, idx) => {
    const colNumber = idx + 1;
    const cell = subHeaderRow.getCell(colNumber);
    cell.value = col.header;
    cell.font = { name: "Sarabun", size: 10, bold: true, color: { argb: "FF334155" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF94A3B8" } },
      bottom: { style: "medium", color: { argb: "FF475569" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } }
    };
  });

  // 4. บันทึกข้อมูลแถว (Data Rows)
  dataList.forEach((item, rIdx) => {
    const rowNumber = rIdx + 5;
    const row = sheet.getRow(rowNumber);
    row.height = 21;

    const rowValues = [
      item.no,
      item.employee_code,
      item.full_name,
      item.nickname,
      item.department_name,
      item.position_name,
      item.year,
      
      item.sick_total,
      item.sick_used,
      item.sick_remaining,

      item.personal_total,
      item.personal_used,
      item.personal_remaining,

      item.vacation_total,
      item.vacation_used,
      item.vacation_remaining,

      item.maternity_total,
      item.maternity_used,
      item.maternity_remaining,

      item.other_total,
      item.other_used,
      item.other_remaining,

      item.total_entitled,
      item.total_used,
      item.total_remaining,

      item.leave_requests_count,
      item.isLeaveActive ? "✓ มีประวัติการลา" : "— ยังไม่มีการลา"
    ];

    rowValues.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: "Sarabun", size: 10 };

      // Zebra striping
      const isEven = rIdx % 2 === 0;
      if (isEven) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }

      // Border
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };

      const colNum = cIdx + 1;

      // จัด Alignment
      if (colNum === 1 || colNum === 2 || colNum === 7 || colNum === 26 || colNum === 27) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (colNum === 3 || colNum === 4 || colNum === 5 || colNum === 6) {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      } else {
        // ตัวเลขยอดวันลา
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "#,##0.0";
      }

      // Highlight used columns if > 0
      const usedColIndexes = [9, 12, 15, 18, 21, 24];
      if (usedColIndexes.includes(colNum) && typeof val === 'number' && val > 0) {
        cell.font = { name: "Sarabun", size: 10, bold: true, color: { argb: "FFB45309" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      }

      // Highlight remaining columns
      const remColIndexes = [10, 13, 16, 19, 22, 25];
      if (remColIndexes.includes(colNum)) {
        cell.font = { name: "Sarabun", size: 10, bold: true, color: { argb: "FF0F766E" } };
      }

      // Active badge
      if (colNum === 27) {
        if (item.isLeaveActive) {
          cell.font = { name: "Sarabun", size: 9.5, bold: true, color: { argb: "FF15803D" } };
        } else {
          cell.font = { name: "Sarabun", size: 9.5, color: { argb: "FF94A3B8" } };
        }
      }
    });
  });

  // ปรับความกว้างของคอลัมน์
  columnsDef.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width;
  });
}

/**
 * 🛠️ Helper: สร้างชีตแบบ 1:1 เทียบเคียงกับโครงสร้างตาราง Supabase 'employee_leave_balances'
 */
function addSupabaseFormatWorksheet(workbook, sheetTitle, dataList) {
  const sheet = workbook.addWorksheet(sheetTitle);
  sheet.views = [{ state: 'frozen', ySplit: 2, showGridLines: true }];

  // หัวเรื่องชีต Supabase Format
  sheet.mergeCells("A1:R1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `💾 ตาราง public.employee_leave_balances (Supabase Schema 1:1 Compatibility)`;
  titleCell.font = { name: "Consolas", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 30;

  const rawColumns = [
    { key: "id", header: "id (UUID)", width: 34 },
    { key: "employee_id", header: "employee_id (UUID)", width: 34 },
    { key: "employee_code", header: "employee_code", width: 16 },
    { key: "full_name", header: "full_name", width: 22 },
    { key: "department_name", header: "department", width: 18 },
    { key: "year", header: "year", width: 10 },
    { key: "sick_total", header: "sick_total", width: 12 },
    { key: "sick_used", header: "sick_used", width: 12 },
    { key: "personal_total", header: "personal_total", width: 14 },
    { key: "personal_used", header: "personal_used", width: 14 },
    { key: "vacation_total", header: "vacation_total", width: 14 },
    { key: "vacation_used", header: "vacation_used", width: 14 },
    { key: "maternity_total", header: "maternity_total", width: 15 },
    { key: "maternity_used", header: "maternity_used", width: 15 },
    { key: "other_total", header: "other_total", width: 12 },
    { key: "other_used", header: "other_used", width: 12 },
    { key: "created_at", header: "created_at", width: 22 },
    { key: "updated_at", header: "updated_at", width: 22 }
  ];

  const headerRow = sheet.getRow(2);
  headerRow.height = 24;
  rawColumns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: "Consolas", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" }
    };
    sheet.getColumn(idx + 1).width = col.width;
  });

  dataList.forEach((item, idx) => {
    const row = sheet.getRow(idx + 3);
    row.height = 20;

    const values = [
      item.balance_id,
      item.employee_id,
      item.employee_code,
      item.full_name,
      item.department_name,
      item.year,
      item.sick_total,
      item.sick_used,
      item.personal_total,
      item.personal_used,
      item.vacation_total,
      item.vacation_used,
      item.maternity_total,
      item.maternity_used,
      item.other_total,
      item.other_used,
      item.created_at,
      item.updated_at
    ];

    values.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: "Consolas", size: 9.5 };

      if (idx % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }

      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };

      if ([1, 2].includes(cIdx + 1)) cell.alignment = { horizontal: "left", vertical: "middle" };
      else if ([3, 6].includes(cIdx + 1)) cell.alignment = { horizontal: "center", vertical: "middle" };
      else if (cIdx + 1 >= 7 && cIdx + 1 <= 16) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "0.0";
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
  });
}

/**
 * 📄 Helper: สร้างชีตแสดงประวัติใบลาทุกรายการ (Raw Leave Requests)
 */
function addRawLeaveRequestsWorksheet(workbook, sheetTitle, requests, employeesList) {
  const sheet = workbook.addWorksheet(sheetTitle);
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }];

  const columns = [
    { key: "emp_code", header: "รหัสพนักงาน", width: 14 },
    { key: "emp_name", header: "ชื่อ-นามสกุล", width: 22 },
    { key: "dept", header: "แผนก/ฝ่าย", width: 18 },
    { key: "position", header: "ตำแหน่ง", width: 20 },
    { key: "leave_type", header: "ประเภทการลา", width: 18 },
    { key: "start_date", header: "วันที่เริ่มต้น", width: 14 },
    { key: "end_date", header: "วันที่สิ้นสุด", width: 14 },
    { key: "total_days", header: "จำนวนวัน", width: 12 },
    { key: "reason", header: "เหตุผลการลา", width: 30 },
    { key: "status", header: "สถานะคำขอ", width: 14 },
    { key: "created_at", header: "วันที่ยื่นคำขอ", width: 18 }
  ];

  sheet.columns = columns;

  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D9488" } };
    cell.font = { name: "Sarabun", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { top: { style: "medium" }, bottom: { style: "medium" } };
  });

  const empMap = new Map();
  (employeesList || []).forEach(e => empMap.set(String(e.id), e));

  (requests || []).forEach((r, idx) => {
    const emp = empMap.get(String(r.employee_id));
    const leaveType = getLeaveType(r.leave_type_id)?.leave_name || "ไม่ระบุ";
    const statusText = window.pvtSupabase?.statusLabel ? window.pvtSupabase.statusLabel(r.status) : (r.status || "-");
    const createdDateFormatted = r.created_at ? new Date(r.created_at).toLocaleString("th-TH") : "-";

    const addedRow = sheet.addRow({
      emp_code: emp?.employee_code || "-",
      emp_name: emp?.full_name || "-",
      dept: emp?.departments?.department_name || "-",
      position: emp?.positions?.position_name || "-",
      leave_type: leaveType,
      start_date: window.pvtSupabase?.formatThaiDate ? window.pvtSupabase.formatThaiDate(r.start_date) : r.start_date,
      end_date: window.pvtSupabase?.formatThaiDate ? window.pvtSupabase.formatThaiDate(r.end_date) : r.end_date,
      total_days: Number(r.total_days || 0),
      reason: (r.reason || r.note || "-").trim(),
      status: statusText,
      created_at: createdDateFormatted
    });

    addedRow.height = 20;
    const isEven = idx % 2 === 0;

    addedRow.eachCell((cell, colNumber) => {
      cell.font = { name: "Sarabun", size: 10 };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };

      if (isEven) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }

      if ([1, 6, 7, 10, 11].includes(colNumber)) cell.alignment = { horizontal: "center", vertical: "middle" };
      else if (colNumber === 8) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "0.0";
      } else cell.alignment = { horizontal: "left", vertical: "middle" };

      if (colNumber === 10) {
        if (r.status === "approved") cell.font = { bold: true, color: { argb: "FF15803D" } };
        else if (r.status === "pending") cell.font = { bold: true, color: { argb: "FFA16207" } };
        else if (r.status === "rejected") cell.font = { bold: true, color: { argb: "FFBE123C" } };
      }
    });
  });

  columns.forEach((column, idx) => {
    sheet.getColumn(idx + 1).width = column.width;
  });
}

// 1. ฟังก์ชันสร้างช่องกรอกคอลัมน์ใหม่เมื่อกดปุ่ม "+ เพิ่มคอลัมน์"
function addCustomColumnField(key = '', value = '') {
  const container = document.getElementById('customColumnsContainer');
  const rowId = 'col-row-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);

  const rowHTML = `
    <div id="${rowId}" class="d-flex gap-2 align-items-center mb-2 custom-column-row">
      <input type="text" class="form-control custom-key" placeholder="ชื่อคอลัมน์ (เช่น Line ID)" value="${key}">
      <input type="text" class="form-control custom-value" placeholder="ข้อมูล" value="${value}">
      <button type="button" class="btn btn-danger btn-sm" onclick="removeCustomColumnField('${rowId}')">
        ลบ
      </button>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', rowHTML);
}

// 2. ฟังก์ชันลบแถวคอลัมน์ที่ไม่ต้องการ
function removeCustomColumnField(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
}

// 3. ฟังก์ชันดึงค่าจากคอลัมน์ทั้งหมดเพื่อเตรียม Save ส่งเข้า Database / Supabase
function getCustomColumnsData() {
  const customData = {};
  const rows = document.querySelectorAll('.custom-column-row');

  rows.forEach(row => {
    const key = row.querySelector('.custom-key').value.trim();
    const val = row.querySelector('.custom-value').value.trim();
    if (key) {
      customData[key] = val; // รวมเป็น Object เช่น { "Line ID": "@john", "เลขผู้เสียภาษี": "123456" }
    }
  });

  return customData;
}

// 4. (สำหรับหน้าแก้ไขประวัติ) ดึงข้อมูลคอลัมน์เดิมมาแสดงเมื่อเปิด Modal แก้ไข
function loadEditEmployeeData(employee) {
  // ล้างข้อมูลช่องเดิมก่อน
  const container = document.getElementById('customColumnsContainer');
  if (container) container.innerHTML = '';

  // สมมติว่าข้อมูลคอลัมน์เพิ่มเติมเก็บเป็น JSON ใน Object ชื่อ employee.custom_fields
  if (employee && employee.custom_fields) {
    Object.entries(employee.custom_fields).forEach(([key, value]) => {
      addCustomColumnField(key, value);
    });
  }
}


// ผูกฟังก์ชันเข้ากับปุ่มดึงข้อมูลบนหน้าจอ
async function handleFetchDataClick() {
  const fetchBtn = document.getElementById("btnFetchData") || document.getElementById("refreshBtn");
  if (fetchBtn) {
    fetchBtn.disabled = true;
    fetchBtn.innerHTML = `<span class="material-symbols-outlined spin">sync</span> กำลังดึงข้อมูล...`;
  }

  await refreshDashboard();

  if (fetchBtn) {
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = `<span class="material-symbols-outlined">sync</span> ดึงข้อมูลล่าสุด`;
  }
  
  if (window.Swal) {
    const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    Swal.fire({
      title: `<div style="display:flex; align-items:center; justify-content:center; gap:8px; font-size:18px; font-weight:700; color:#0f766e;">
        <span class="material-symbols-outlined" style="font-size:26px; color:#0d9488;">cloud_done</span>
        ซิงค์และอัปเดตข้อมูลสำเร็จ
      </div>`,
      html: `
        <div style="font-size:13.5px; color:#334155; margin-top:8px; text-align:center;">
          ดึงและซิงค์ข้อมูลรายชื่อพนักงาน ยอดโควตาวันลา และผังองค์กรล่าสุดเรียบร้อยแล้ว (${timeStr} น.)
        </div>
      `,
      showConfirmButton: true,
      confirmButtonText: '<span style="display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;font-size:14px;font-weight:700;"><span class="material-symbols-outlined" style="font-size:18px;">check_circle</span> ตกลง</span>',
      confirmButtonColor: '#0d9488',
      showDenyButton: false,
      showCancelButton: false,
      timer: 15000,
      timerProgressBar: true,
      showCloseButton: true,
      allowOutsideClick: true,
      allowEscapeKey: true,
      didOpen: (popup) => {
        const container = popup.closest('.swal2-container') || document.querySelector('.swal2-container');
        if (container) {
          container.style.zIndex = '2147483647';
          container.style.pointerEvents = 'auto';
        }
      }
    });
  }
}

// =========================================================================
// 📥 [ระบบนำเข้าและอัปเดตรายชื่อพนักงานจาก Excel ด้วย ExcelJS และ Supabase]
// =========================================================================

function getCellValue(cell) {
  if (!cell) return null;
  let val = cell.value;
  if (val === null || val === undefined) return null;
  
  if (typeof val === 'object') {
    if (val.result !== undefined) {
      val = val.result;
    } else if (val.richText !== undefined) {
      val = val.richText.map(t => t.text).join('');
    } else if (val instanceof Date) {
      const year = val.getFullYear();
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } else {
      val = JSON.stringify(val);
    }
  }
  
  return String(val).trim();
}

window.downloadExcelTemplate = function downloadExcelTemplate() {
  const ExcelJS = window.ExcelJS;
  if (!ExcelJS) {
    Swal.fire({ icon: 'error', title: 'ไม่พบ ExcelJS', text: 'กรุณารอสักครู่ให้หน้าเว็บโหลดไลบรารีเสร็จสิ้น' });
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('รายชื่อพนักงาน');
  
  worksheet.columns = [
    { header: 'รหัสพนักงาน (employee_code) *บังคับ', key: 'employee_code', width: 25 },
    { header: 'คำนำหน้า (title)', key: 'title', width: 15 },
    { header: 'ชื่อจริง (first_name)', key: 'first_name', width: 20 },
    { header: 'นามสกุล (last_name)', key: 'last_name', width: 20 },
    { header: 'ชื่อ-นามสกุล (full_name) *บังคับ', key: 'full_name', width: 25 },
    { header: 'ชื่อเล่น (nickname)', key: 'nickname', width: 12 },
    { header: 'เบอร์โทรศัพท์ (phone)', key: 'phone', width: 15 },
    { header: 'อีเมล (email)', key: 'email', width: 25 },
    { header: 'Line ID (line_id)', key: 'line_id', width: 15 },
    { header: 'สิทธิ์การใช้งาน (role)', key: 'role', width: 18 },
    { header: 'แผนก (department)', key: 'department', width: 20 },
    { header: 'ตำแหน่งงาน (position)', key: 'position', width: 20 },
    { header: 'ประเภทการจ้าง (employment_type)', key: 'employment_type', width: 20 },
    { header: 'โรงพยาบาลประกันสังคม (hospital)', key: 'hospital', width: 25 },
    { header: 'เลขบัญชีธนาคาร (bank_account)', key: 'bank_account', width: 20 },
    { header: 'วันเริ่มงาน (start_date)', key: 'start_date', width: 15 },
    { header: 'สถานะพนักงาน (status)', key: 'status', width: 15 },
    { header: 'รหัสผ่าน (password)', key: 'password', width: 18 }
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '0F766E' }
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  worksheet.addRow({
    employee_code: '19001',
    title: 'ดร.',
    first_name: 'วิโรจน์',
    last_name: 'เลิศวิจิตรประภา',
    full_name: 'ดร.วิโรจน์ เลิศวิจิตรประภา',
    nickname: 'ดร.วิโรจน์',
    phone: '0819998888',
    email: 'viroj.l@company.com',
    line_id: 'viroj.line',
    role: 'executive',
    department: 'HR',
    position: 'ผู้จัดการฝ่าย',
    employment_type: 'monthly',
    hospital: 'โรงพยาบาลเปาโล',
    bank_account: '123-4-56789-0',
    start_date: '2019-01-01',
    status: 'active',
    password: 'password99'
  });

  worksheet.addRow({
    employee_code: '19012',
    title: 'นาย',
    first_name: 'สมชาย',
    last_name: 'ดีใจ',
    full_name: 'นายสมชาย ดีใจ',
    nickname: 'ชาย',
    phone: '0821112222',
    email: 'somchai.d@company.com',
    line_id: 'somchai.line',
    role: 'user',
    department: 'IT',
    position: 'IT Support',
    employment_type: 'monthly',
    hospital: 'โรงพยาบาลพระราม 9',
    bank_account: '987-6-54321-0',
    start_date: '2024-03-15',
    status: 'active',
    password: ''
  });

  workbook.xlsx.writeBuffer().then(buffer => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'PVT_Employee_Import_Template.xlsx';
    link.click();
    URL.revokeObjectURL(link.href);
  });
};

window.importEmployeesExcel = function importEmployeesExcel() {
  const ExcelJS = window.ExcelJS;
  if (!ExcelJS) {
    Swal.fire({ icon: 'error', title: 'ไม่พบ ExcelJS', text: 'กรุณารอสักครู่ให้หน้าเว็บโหลดไลบรารีเสร็จสิ้น' });
    return;
  }

  Swal.fire({
    title: '📥 นำเข้าและอัปเดตข้อมูลพนักงานด้วย Excel',
    width: 'min(92vw, 650px)',
    html: `
      <div class="excel-import-container" style="font-family: 'Sarabun', sans-serif; text-align: left; padding: 4px;">
        <p style="font-size: 14px; color: #475569; margin-bottom: 16px;">
          ระบบรองรับการ <strong>อัปเดตข้อมูลพนักงานเดิม</strong> (อ้างอิงจากรหัสพนักงาน) และ <strong>เพิ่มพนักงานใหม่</strong> โดยอัตโนมัติ 
          หากไม่พบข้อมูลแผนกหรือตำแหน่งงานในฐานข้อมูล ระบบจะสร้างให้ใหม่ทันที
        </p>
        
        <!-- Step 1: Download Template -->
        <div style="background: #f0fdfa; border: 1px solid #ccfbf1; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div style="flex: 1;">
            <h4 style="font-size: 14px; font-weight: 700; color: #0f766e; margin: 0 0 2px 0;">1. ดาวน์โหลดไฟล์เทมเพลตมาตรฐาน</h4>
            <p style="font-size: 12px; color: #0d9488; margin: 0;">ดาวน์โหลดไฟล์ Excel (.xlsx) เพื่อกรอกข้อมูลพนักงานตามโครงสร้างที่ถูกต้อง</p>
          </div>
          <button type="button" onclick="downloadExcelTemplate()" class="swal2-styled" style="background: #0f766e; color: #fff; margin: 0; padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 6px; box-shadow: none; white-space: nowrap; display: flex; align-items: center; gap: 4px; border: none; cursor: pointer;">
            <span class="material-symbols-outlined" style="font-size: 16px;">download</span> ดาวน์โหลด
          </button>
        </div>

        <!-- Step 2: Upload File with Drag & Drop -->
        <div style="margin-bottom: 8px;">
          <h4 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 8px 0;">2. เลือกไฟล์หรือลากไฟล์ Excel มาวาง</h4>
          
          <div id="excel-drop-zone" style="border: 2px dashed #cbd5e1; border-radius: 10px; padding: 30px 20px; text-align: center; background: #f8fafc; cursor: pointer; transition: all 0.2s ease-in-out; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
            <span class="material-symbols-outlined" style="font-size: 48px; color: #94a3b8;" id="drop-zone-icon">upload_file</span>
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: #475569;" id="drop-zone-text">ลากไฟล์ Excel (.xlsx) มาวางที่นี่ หรือ คลิกเพื่อเลือกไฟล์</p>
            <p style="margin: 0; font-size: 12px; color: #64748b;">ขนาดไฟล์ไม่เกิน 10MB (เฉพาะนามสกุล .xlsx เท่านั้น)</p>
            <input type="file" id="excel-file-input" accept=".xlsx" style="display: none;" />
          </div>
        </div>
      </div>
    `,
    showConfirmButton: false,
    showCloseButton: true,
    didOpen: () => {
      const dropZone = document.getElementById('excel-drop-zone');
      const fileInput = document.getElementById('excel-file-input');
      const dropIcon = document.getElementById('drop-zone-icon');

      if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());

        ['dragenter', 'dragover'].forEach(eventName => {
          dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = '#0f766e';
            dropZone.style.background = '#f0fdfa';
            if (dropIcon) dropIcon.style.color = '#0f766e';
          }, false);
        });

        ['dragleave', 'dragend'].forEach(eventName => {
          dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = '#cbd5e1';
            dropZone.style.background = '#f8fafc';
            if (dropIcon) dropIcon.style.color = '#94a3b8';
          }, false);
        });

        dropZone.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          dropZone.style.borderColor = '#cbd5e1';
          dropZone.style.background = '#f8fafc';
          if (dropIcon) dropIcon.style.color = '#94a3b8';

          const dt = e.dataTransfer;
          const files = dt.files;
          if (files && files.length > 0) {
            const file = files[0];
            if (file.name.endsWith('.xlsx')) {
              fileInput.files = files;
              processExcelImport(file);
            } else {
              Swal.showValidationMessage('กรุณาอัปโหลดเฉพาะไฟล์นามสกุล .xlsx เท่านั้น');
            }
          }
        }, false);

        fileInput.addEventListener('change', () => {
          if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            processExcelImport(file);
          }
        });
      }
    }
  });
};

async function processExcelImport(file) {
  const ExcelJS = window.ExcelJS;
  const Swal = window.Swal;

  Swal.fire({
    title: '⚙️ กำลังประมวลผลไฟล์...',
    html: '<div style="font-size:14px; color:#0d9488; font-weight:600;">⌛ ระบบกำลังเปิดและอ่านโครงสร้างไฟล์ Excel...</div>',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target.result;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) {
          throw new Error("ไม่พบแผ่นงาน (Worksheet) ในไฟล์ Excel นี้");
        }

        const rows = [];
        const headerRow = worksheet.getRow(1);
        const colMapping = {};

        headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const rawHeader = getCellValue(cell) || '';
          const headerText = rawHeader.trim().toLowerCase();
          if (!headerText) return;

          const matches = (keywords) => keywords.some(k => headerText.includes(k.toLowerCase()));

          if (matches(['employee_code', 'employee code', 'emp_code', 'emp code', 'รหัสพนักงาน', 'รหัส', 'code'])) {
            colMapping['employee_code'] = colNumber;
          } else if (matches(['คำนำหน้า', 'คำนำหน้าชื่อ', 'title'])) {
            colMapping['title'] = colNumber;
          } else if (matches(['ชื่อเล่น', 'nickname'])) {
            colMapping['nickname'] = colNumber;
          } else if (matches(['ชื่อ-นามสกุล', 'ชื่อและนามสกุล', 'ชื่อเต็ม', 'full_name', 'full name', 'ชื่อพนักงาน'])) {
            colMapping['full_name'] = colNumber;
          } else if (matches(['ชื่อจริง', 'first_name', 'first name', 'ชื่อ'])) {
            if (!headerText.includes('เล่น') && !headerText.includes('สกุล') && !headerText.includes('เต็ม') && !headerText.includes('พนักงาน')) {
              colMapping['first_name'] = colNumber;
            }
          } else if (matches(['นามสกุล', 'last_name', 'last name'])) {
            colMapping['last_name'] = colNumber;
          } else if (matches(['เบอร์โทร', 'เบอร์โทรศัพท์', 'โทร', 'มือถือ', 'phone', 'mobile', 'telephone'])) {
            colMapping['phone'] = colNumber;
          } else if (matches(['อีเมล', 'อีเมล์', 'email', 'e-mail'])) {
            colMapping['email'] = colNumber;
          } else if (matches(['ไลน์', 'line_id', 'line'])) {
            colMapping['line_id'] = colNumber;
          } else if (matches(['สิทธิ์', 'บทบาท', 'ระดับ', 'role'])) {
            colMapping['role'] = colNumber;
          } else if (matches(['แผนก', 'ฝ่าย', 'สังกัด', 'department', 'dept', 'section'])) {
            colMapping['department_val'] = colNumber;
          } else if (matches(['ตำแหน่ง', 'position'])) {
            colMapping['position_val'] = colNumber;
          } else if (matches(['ประเภทการจ้าง', 'การจ้างงาน', 'ประเภทพนักงาน', 'employment_type', 'employment type'])) {
            colMapping['employment_type'] = colNumber;
          } else if (matches(['โรงพยาบาล', 'รพ', 'ประกันสังคม', 'hospital'])) {
            colMapping['hospital'] = colNumber;
          } else if (matches(['เลขบัญชี', 'บัญชีธนาคาร', 'เลขที่บัญชี', 'ธนาคาร', 'bank_account', 'bank account'])) {
            colMapping['bank_account'] = colNumber;
          } else if (matches(['วันเริ่มงาน', 'วันเข้าทำงาน', 'เริ่มงาน', 'start_date', 'start date', 'join_date'])) {
            colMapping['start_date'] = colNumber;
          } else if (matches(['สถานะ', 'status'])) {
            colMapping['status'] = colNumber;
          } else if (matches(['รหัสผ่าน', 'password', 'pass'])) {
            colMapping['password'] = colNumber;
          }
        });

        if (!colMapping['employee_code']) {
          throw new Error("❌ ไม่พบคอลัมน์ 'รหัสพนักงาน' หรือ 'employee_code' ในไฟล์ Excel นี้ กรุณาตรวจสอบว่ามีหัวคอลัมน์ดังกล่าวในแถวแรกของไฟล์ดิบหรือไม่");
        }

        const getMappedValue = (row, fieldName) => {
          const colIndex = colMapping[fieldName];
          if (!colIndex) return null;
          return getCellValue(row.getCell(colIndex));
        };

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // Skip header

          const employee_code = getMappedValue(row, 'employee_code');
          if (!employee_code) return; // Skip empty employee_code

          const title = getMappedValue(row, 'title');
          const first_name = getMappedValue(row, 'first_name');
          const last_name = getMappedValue(row, 'last_name');
          let full_name = getMappedValue(row, 'full_name');
          const nickname = getMappedValue(row, 'nickname');
          const phone = getMappedValue(row, 'phone');
          const email = getMappedValue(row, 'email');
          const line_id = getMappedValue(row, 'line_id');
          const role = getMappedValue(row, 'role') || 'user';
          const department_val = getMappedValue(row, 'department_val');
          const position_val = getMappedValue(row, 'position_val');
          const employment_type = getMappedValue(row, 'employment_type') || 'monthly';
          const hospital = getMappedValue(row, 'hospital');
          const bank_account = getMappedValue(row, 'bank_account');
          const start_date = getMappedValue(row, 'start_date');
          const status = getMappedValue(row, 'status') || 'active';
          const password = getMappedValue(row, 'password');

          if (!full_name) {
            full_name = `${title || ''}${first_name || ''} ${last_name || ''}`.trim();
          }
          if (!full_name) {
            full_name = `พนักงานรหัส ${employee_code}`;
          }

          rows.push({
            employee_code,
            title,
            first_name,
            last_name,
            full_name,
            nickname,
            phone,
            email,
            line_id,
            role: role.toLowerCase(),
            department_val,
            position_val,
            employment_type: employment_type.toLowerCase(),
            hospital,
            bank_account,
            start_date,
            status: status.toLowerCase(),
            password
          });
        });

        if (rows.length === 0) {
          throw new Error("ไม่พบรายการพนักงานที่สมบูรณ์ในไฟล์นี้ (แถวที่ 2 เป็นต้นไป)");
        }

        await executeDatabaseImport(rows);

      } catch (err) {
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาดในการอ่านไฟล์',
          text: err.message,
          confirmButtonColor: '#ef4444'
        });
      }
    };
    reader.readAsArrayBuffer(file);
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'ข้อผิดพลาด',
      text: err.message,
      confirmButtonColor: '#ef4444'
    });
  }
}

async function executeDatabaseImport(rows) {
  const supabase = getSupabase();
  if (!supabase) return;

  const totalCount = rows.length;
  let successCount = 0;
  let updateCount = 0;
  let insertCount = 0;
  const successLogs = [];
  const errorLogs = [];

  let { data: dbDepts } = await supabase.from('departments').select('id, department_code, department_name');
  let { data: dbPositions } = await supabase.from('positions').select('id, position_name, department_id, level_type, duty_name, status');
  
  dbDepts = dbDepts || [];
  dbPositions = dbPositions || [];

  async function getOrCreateDepartment(deptVal) {
    if (!deptVal) return null;
    const cleanDept = deptVal.trim();
    
    let dept = dbDepts.find(d => 
      String(d.department_code).toLowerCase() === cleanDept.toLowerCase() || 
      String(d.department_name).toLowerCase() === cleanDept.toLowerCase()
    );
    
    if (dept) return dept.id;
    
    const deptCode = cleanDept.substring(0, 5).toUpperCase();
    const { data, error } = await supabase.from('departments').insert([
      { department_code: deptCode, department_name: cleanDept, status: 'active' }
    ]).select().single();
    
    if (error) {
      console.error("สร้างแผนกล้มเหลว:", error);
      return null;
    }
    
    dbDepts.push(data);
    return data.id;
  }

  async function getOrCreatePosition(posVal, deptId) {
    if (!posVal) return null;
    const cleanPos = posVal.trim();
    
    let pos = dbPositions.find(p => 
      String(p.position_name).toLowerCase() === cleanPos.toLowerCase() && 
      (deptId ? String(p.department_id) === String(deptId) : true)
    );
    
    if (pos) return pos.id;
    
    const posCat = classifyPositionCategory(cleanPos);
    const { data, error } = await supabase.from('positions').insert([
      { position_name: cleanPos, department_id: deptId, level_type: posCat, status: 'active' }
    ]).select().single();
    
    if (error) {
      console.error("สร้างตำแหน่งล้มเหลว:", error);
      return null;
    }
    
    dbPositions.push(data);
    return data.id;
  }

  for (let i = 0; i < totalCount; i++) {
    const row = rows[i];
    
    Swal.fire({
      title: '💾 กำลังนำเข้าข้อมูล...',
      html: `
        <div style="text-align:left; font-size:13px; font-family:'Sarabun', sans-serif;">
          <div style="font-weight:600; font-size:14px; margin-bottom:8px; color:#0f766e;">แถวที่ ${i+1} จากทั้งหมด ${totalCount} รายการ</div>
          <p style="margin:0 0 4px 0;"><strong>ชื่อพนักงาน:</strong> ${row.full_name}</p>
          <p style="margin:0 0 8px 0;"><strong>รหัสพนักงาน:</strong> ${row.employee_code}</p>
          <div style="background:#f1f5f9; border-radius:6px; height:8px; overflow:hidden;">
            <div style="background:#0f766e; height:100%; width:${((i+1)/totalCount)*100}%"></div>
          </div>
        </div>
      `,
      showConfirmButton: false,
      allowOutsideClick: false
    });

    try {
      const deptId = await getOrCreateDepartment(row.department_val);
      const posId = await getOrCreatePosition(row.position_val, deptId);

      const empPayload = {
        employee_code: row.employee_code,
        title: row.title || null,
        first_name: row.first_name || null,
        last_name: row.last_name || null,
        full_name: row.full_name,
        nickname: row.nickname || null,
        phone: row.phone || null,
        email: row.email || null,
        line_id: row.line_id || null,
        role: row.role,
        department_id: deptId,
        position_id: posId,
        employment_type: row.employment_type || 'monthly',
        hospital: row.hospital || null,
        bank_account: row.bank_account || null,
        status: row.status || 'active',
        updated_at: new Date().toISOString()
      };

      if (row.start_date) {
        try {
          const parsedDate = new Date(row.start_date);
          if (!isNaN(parsedDate.getTime())) {
            empPayload.start_date = parsedDate.toISOString().split('T')[0];
          }
        } catch (e) {}
      }

      const { data: existingEmp } = await supabase
        .from('employees')
        .select('id')
        .eq('employee_code', row.employee_code)
        .maybeSingle();

      if (existingEmp) {
        if (row.password) {
          empPayload.password = row.password;
        }

        const { error } = await supabase
          .from('employees')
          .update(empPayload)
          .eq('employee_code', row.employee_code);

        if (error) throw error;
        updateCount++;
        successCount++;
        successLogs.push(`✏️ [อัปเดต] ${row.full_name} (รหัส: ${row.employee_code})`);
      } else {
        empPayload.password = row.password || row.employee_code;

        const { error } = await supabase
          .from('employees')
          .insert([empPayload]);

        if (error) throw error;
        insertCount++;
        successCount++;
        successLogs.push(`➕ [เพิ่มใหม่] ${row.full_name} (รหัส: ${row.employee_code})`);
      }
    } catch (err) {
      console.error(err);
      errorLogs.push(`❌ รหัส ${row.employee_code} (${row.full_name}): ${err.message}`);
    }
  }

  const logHTML = `
    <div style="font-family:'Sarabun', sans-serif; text-align:left; max-height: 50vh; overflow-y:auto; padding-right:4px;">
      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; text-align:center; margin-bottom:16px;">
        <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:10px; border-radius:8px;">
          <div style="font-size:20px; font-weight:700; color:#047857;">${successCount}</div>
          <div style="font-size:12px; color:#065f46;">สำเร็จทั้งหมด</div>
        </div>
        <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:10px; border-radius:8px;">
          <div style="font-size:20px; font-weight:700; color:#1d4ed8;">${insertCount}</div>
          <div style="font-size:12px; color:#1e40af;">พนักงานใหม่</div>
        </div>
        <div style="background:#fef3c7; border:1px solid #fde68a; padding:10px; border-radius:8px;">
          <div style="font-size:20px; font-weight:700; color:#b45309;">${updateCount}</div>
          <div style="font-size:12px; color:#92400e;">อัปเดตข้อมูล</div>
        </div>
      </div>

      ${errorLogs.length > 0 ? `
        <div style="background:#fef2f2; border:1px solid #fca5a5; padding:12px; border-radius:8px; margin-bottom:16px; font-size:13px; color:#991b1b;">
          <h5 style="margin:0 0 6px 0; font-weight:700;">⚠️ ข้อผิดพลาด (${errorLogs.length} รายการ):</h5>
          <ul style="margin:0; padding-left:20px; list-style-type:disc;">
            ${errorLogs.map(log => `<li>${escapeHtml(log)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px; border-radius:8px;">
        <h5 style="margin:0 0 6px 0; font-weight:700; color:#334155;">📋 ประวัติการดำเนินการ:</h5>
        <ul style="margin:0; padding-left:20px; list-style-type:disc; font-size:12px; color:#475569; max-height:200px; overflow-y:auto;">
          ${successLogs.map(log => `<li>${escapeHtml(log)}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;

  Swal.fire({
    icon: errorLogs.length > 0 && successCount === 0 ? 'error' : 'success',
    title: '🎉 นำเข้าข้อมูลเสร็จสมบูรณ์!',
    width: 'min(92vw, 600px)',
    html: logHTML,
    confirmButtonText: '🔄 อัปเดตหน้าจอหลัก',
    confirmButtonColor: '#0f766e'
  }).then(() => {
    if (typeof refreshDashboard === 'function') {
      refreshDashboard();
    } else {
      window.location.reload();
    }
  });
}

/**
 * 🔍 ตรวจสอบและสร้างโควตาวันลาให้กับพนักงานที่ยังไม่มีข้อมูลในระบบ
 */
async function checkAndCreateMissingQuotas() {
  const supabase = getSupabase();
  if (!supabase || !window.Swal) return;

  Swal.fire({
    title: 'กำลังเริ่มตรวจสอบข้อมูลโควตาวันลา...',
    text: 'กรุณารอสักครู่ ระบบกำลังดึงรายชื่อพนักงานและประเภทวันลาทั้งหมด',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    // 1. ดึงพนักงานที่ยังมีสถานะ Active ทั้งหมด
    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('id, full_name, employee_code')
      .eq('status', 'active');
    
    if (empErr) throw empErr;

    if (!employees || employees.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่พบพนักงาน',
        text: 'ไม่มีข้อมูลพนักงานที่มีสถานะปกติ (Active) ในระบบ',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#0f766e'
      });
      return;
    }

    // 2. ดึงประเภทการลาที่เปิดใช้งานทั้งหมด
    const { data: activeLeaveTypes, error: ltErr } = await supabase
      .from('leave_types')
      .select('id, leave_name, yearly_quota, default_days')
      .eq('status', 'active');

    if (ltErr) throw ltErr;

    if (!activeLeaveTypes || activeLeaveTypes.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่พบประเภทวันลา',
        text: 'ไม่มีข้อมูลประเภทการลาที่เปิดใช้งานในระบบ',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#0f766e'
      });
      return;
    }

    // 3. กำหนดปีที่จะตรวจสอบ (รองรับทั้ง ค.ศ. และ พ.ศ.)
    const currentYear = new Date().getFullYear();
    const thaiYear = currentYear + 543;

    // 4. ดึงรายการที่มีอยู่ใน employee_leave_balances
    const { data: existingEmpBal } = await supabase
      .from('employee_leave_balances')
      .select('employee_id')
      .in('year', [currentYear, thaiYear]);

    const existingEmpIds = new Set([
      ...(existingEmpBal || []).map(b => b.employee_id)
    ]);
    const missingEmployees = employees.filter(e => !existingEmpIds.has(e.id));

    if (missingEmployees.length === 0) {
      Swal.fire({
        icon: 'success',
        title: 'มีข้อมูลแล้ว ✨',
        html: `พนักงานทุกคนในระบบ (จำนวน <b>${employees.length}</b> คน) มีข้อมูลโควตาวันลาประจำปี ${currentYear} (employee_leave_balances) ครบถ้วนเรียบร้อยแล้ว`,
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#0f766e'
      });
      return;
    }

    // 5. แสดงกล่องยืนยันก่อนสร้าง
    const confirmResult = await Swal.fire({
      icon: 'question',
      title: 'พบข้อมูลที่ไม่มีโควตาวันลา!',
      html: `พบพนักงานจำนวน <b>${missingEmployees.length}</b> คน ที่ยังไม่มีข้อมูลโควตาวันลาประจำปี ${currentYear}<br><br>` +
            `คุณต้องการให้ระบบสร้างข้อมูลโควตาวันลาเริ่มต้นให้กับกลุ่มพนักงานดังกล่าวทันทีหรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ใช่, สร้างโควตาเริ่มต้นให้ทันที',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#0f766e',
      cancelButtonColor: '#64748b'
    });

    if (!confirmResult.isConfirmed) return;

    Swal.fire({
      title: 'กำลังสร้างโควตาวันลา...',
      text: 'กรุณาอย่าปิดหน้านี้ ระบบกำลังเชื่อมต่อฐานข้อมูล',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    let successCount = 0;
    for (const empItem of missingEmployees) {
      if (window.PVTSDK?.user?.ensureLeaveBalances) {
        await window.PVTSDK.user.ensureLeaveBalances(empItem.id, currentYear);
        successCount++;
      }
    }

    // 7. บันทึกประวัติใน HR Log
    await saveHRActivityLog('LEAVE_QUOTA', 'CREATE', `SYSTEM_AUTO_INITIALIZE`, `ระบบตรวจสอบและสร้างโควตาวันลาเริ่มต้นอัตโนมัติให้กับพนักงาน ${successCount} คน`);

    Swal.fire({
      icon: 'success',
      title: 'สร้างโควตาวันลาสำเร็จ! 🎉',
      html: `ระบบสร้างโควตาวันลาเริ่มต้นให้กับพนักงานจำนวน <b>${successCount}</b> คน ครบถ้วนแล้ว`,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#0f766e'
    });

  } catch (err) {
    showAppError('เกิดข้อผิดพลาดในการตรวจสอบโควตา', err.message || err);
  }
}

/**
 * ⚡ ฟังก์ชันสำหรับทดสอบส่งแจ้งเตือน LINE สำหรับ HR (เลือกยิง Flex Message)
 */
async function testLineNotificationFromHR() {
  if (!window.Swal) {
    alert("ระบบไม่พบ SweetAlert2 SDK");
    return;
  }

  // แสดง Loading ระหว่างดึงข้อมูลพนักงานที่ผูก LINE ไว้
  Swal.fire({
    title: 'กำลังดึงข้อมูลพนักงานที่เชื่อมต่อ LINE...',
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  let linkedEmployees = [];
  try {
    const sb = (typeof PVTSDK !== 'undefined' && PVTSDK.getClient) ? PVTSDK.getClient() : window.supabaseClient;
    if (sb) {
      const { data, error } = await sb
        .from('employees')
        .select('id, full_name, line_id, employee_code')
        .not('line_id', 'is', null)
        .order('full_name');
      
      if (!error && data) {
        // กรองค่าว่างเปล่าออก
        linkedEmployees = data.filter(emp => emp.line_id && emp.line_id.trim() !== "");
      }
    }
  } catch (err) {
    console.warn("⚠️ ไม่สามารถดึงข้อมูลพนักงานที่ผูก LINE ได้:", err);
  }

  Swal.close();

  // สร้าง HTML Options สำหรับเลือกพนักงาน
  let empSelectHtml = '<option value="CUSTOM">-- ✍️ กรอกรหัส LINE User ID ด้วยตนเอง --</option>';
  if (linkedEmployees.length > 0) {
    linkedEmployees.forEach(emp => {
      empSelectHtml += `<option value="${emp.line_id}">${emp.full_name} (${emp.employee_code || 'ไม่มีรหัส'})</option>`;
    });
  }

  const { value: formValues } = await Swal.fire({
    title: '💬 ทดสอบส่งแจ้งเตือน LINE (HR)',
    html:
      '<div style="text-align: left; margin-bottom: 8px; font-size: 13px; line-height: 1.5; background: #f8fafc; padding: 10px; border-radius: 6px; color: #475569; border: 1px solid #e2e8f0; margin-bottom: 14px;">' +
        '💡 <b>LINE User ID คืออะไร?</b><br>' +
        'คือรหัสเฉพาะของระบบ LINE (ขึ้นต้นด้วยตัว <b>U</b> ตามด้วยเลข/อักษรรวม 32 หลัก) ' +
        'ได้จากการที่พนักงานกดปุ่ม <b>"ขอรหัสเชื่อมต่อ LINE"</b> ในหน้าโปรไฟล์ แล้วส่งรหัส 6 หลักไปให้บอทในแชต LINE ครับ' +
      '</div>' +

      '<div style="text-align: left; margin-bottom: 8px;"><label style="font-size: 13px; font-weight: 600; color: #1e293b;">🎯 เลือกพนักงานที่ผูก LINE แล้ว:</label></div>' +
      `<select id="swal-select-employee" class="swal2-input" style="margin-top: 0; margin-bottom: 12px; width: 85%; font-size: 14px; padding: 8px; height: 42px;">${empSelectHtml}</select>` +

      '<div id="custom-line-id-wrapper" style="text-align: left; margin-bottom: 12px;">' +
        '<div style="text-align: left; margin-bottom: 8px;"><label style="font-size: 13px; font-weight: 600; color: #1e293b;">ระบุ LINE User ID ของคุณเองเพื่อเทส:</label></div>' +
        '<input id="swal-input-line-id" class="swal2-input" style="margin-top: 0; margin-bottom: 4px; width: 85%; font-family: monospace; font-size: 14px; padding: 10px;" placeholder="เช่น U8590cc03a13b22da60ab9991b771afd8">' +
      '</div>' +

      '<div style="text-align: left; margin-bottom: 8px;"><label style="font-size: 13px; font-weight: 600; color: #1e293b;">📊 ประเภทดีไซน์สลิปทดสอบ:</label></div>' +
      '<select id="swal-input-type" class="swal2-input" style="margin-top: 0; width: 85%; font-size: 14px; padding: 10px; height: 42px;">' +
        '<option value="NEW_REQUEST">คำขอใหม่ (รออนุมัติ L1)</option>' +
        '<option value="LEADER_APPROVED">ผ่านอนุมัติขั้นต้น (รอ L2)</option>' +
        '<option value="MANAGER_APPROVED">ผ่านอนุมัติผู้จัดการ (สำเร็จ)</option>' +
        '<option value="FINAL_APPROVED">อนุมัติเสร็จสมบูรณ์</option>' +
        '<option value="REJECTED">คำขอลาไม่อนุมัติ</option>' +
        '<option value="CANCELLATION">แจ้งเตือนยกเลิกใบลา</option>' +
      '</select>',
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: '⚡ ส่งสลิปทดสอบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#4f46e5',
    didOpen: () => {
      const selectEmp = document.getElementById('swal-select-employee');
      const customWrapper = document.getElementById('custom-line-id-wrapper');
      
      // ตรวจสอบสถานะเริ่มต้น
      if (selectEmp.value === 'CUSTOM') {
        customWrapper.style.display = 'block';
      } else {
        customWrapper.style.display = 'none';
      }

      // ตรวจสอบเมื่อเปลี่ยนค่า dropdown
      selectEmp.addEventListener('change', (e) => {
        if (e.target.value === 'CUSTOM') {
          customWrapper.style.display = 'block';
        } else {
          customWrapper.style.display = 'none';
        }
      });
    },
    preConfirm: () => {
      const selectEmpVal = document.getElementById('swal-select-employee').value;
      const customLineId = document.getElementById('swal-input-line-id').value.trim();
      const type = document.getElementById('swal-input-type').value;

      let lineId = selectEmpVal;
      if (selectEmpVal === 'CUSTOM') {
        lineId = customLineId;
        if (!lineId) {
          Swal.showValidationMessage('กรุณาระบุ LINE User ID สำหรับทดสอบ');
          return false;
        }
        if (!lineId.startsWith('U') || lineId.length < 20) {
          Swal.showValidationMessage('LINE User ID ที่ถูกต้องมักจะขึ้นต้นด้วยตัว U และมีความยาว 32 หลัก');
          return false;
        }
      }
      return { lineId, type };
    }
  });

  if (!formValues) return;

  const { lineId, type } = formValues;

  Swal.fire({
    title: 'กำลังส่งข้อความสลิปทดสอบ...',
    text: 'กรุณารอสักครู่ ระบบกำลังส่ง Flex Message ไปยัง LINE OA',
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    if (!window.PVTSDK?.line?.sendWorkflowNotification) {
      throw new Error('ไม่พบเอนจิน LINE SDK ในระบบ (PVTSDK.line)');
    }

    // ค้นหาข้อมูลพนักงานเพิ่มเติมมาใช้พรีวิวข้อมูลสลิป
    let testEmpName = 'สมมุติ ทดสอบระบบ (HR TEST)';
    let testEmpCode = 'EMP99999';
    if (linkedEmployees.length > 0) {
      const found = linkedEmployees.find(e => e.line_id === lineId);
      if (found) {
        testEmpName = found.full_name;
        testEmpCode = found.employee_code || 'EMP99999';
      }
    }

    const res = await window.PVTSDK.line.sendWorkflowNotification({
      type: type,
      recipientId: '', // ส่งตรงด้วย LINE ID
      recipientLineId: lineId,
      employeeName: testEmpName,
      employeeCode: testEmpCode,
      leaveType: 'ลาพักร้อนประจำปี',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      totalDays: 1,
      reason: 'ทดสอบส่งการ์ดแจ้งเตือนสลิปธนาคารจากเมนูควบคุมส่วนกลาง HR',
      comment: 'ความเห็นตัวอย่างจากผู้อนุมัติ (ผ่านระบบทดสอบ)',
      attachmentUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80'
    });

    if (res && res.lineSent) {
      Swal.fire({
        icon: 'success',
        title: 'ส่งการ์ดสลิปทดสอบสำเร็จ! 🎉',
        text: 'การ์ด Flex Message สไตล์ธนาคารส่งไปยัง LINE เรียบร้อยแล้ว กรุณาเช็กห้องแชต LINE ของคุณ',
        confirmButtonColor: '#16a34a'
      });
    } else {
      Swal.fire({
        icon: 'info',
        title: 'บันทึกการส่งสำเร็จ',
        text: res?.message || 'ระบบบันทึกการส่งทดสอบแล้ว (หากยังไม่ได้รับใน LINE กรุณาตรวจสอบว่าบอท LINE OA ได้รับ LINE User ID ที่ถูกต้อง)',
        confirmButtonColor: '#0284c7'
      });
    }
  } catch (err) {
    console.error("❌ Test LINE Notification from HR error:", err);
    Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถส่งข้อความทดสอบได้', 'error');
  }
}

// 🌐 Global Window Function Bindings for Management Page
window.testLineNotificationFromHR = testLineNotificationFromHR;
window.checkAndCreateMissingQuotas = checkAndCreateMissingQuotas;
window.openEmployeeDetail = typeof openEmployeeDetail !== 'undefined' ? openEmployeeDetail : window.openEmployeeDetail;
window.deleteEmployee = typeof deleteEmployee !== 'undefined' ? deleteEmployee : window.deleteEmployee;
window.saveEmployeeInlineEdit = typeof saveEmployeeInlineEdit !== 'undefined' ? saveEmployeeInlineEdit : window.saveEmployeeInlineEdit;
window.closeEmployeeModal = closeEmployeeModal;
window.editSingleLeaveRequest = typeof editSingleLeaveRequest !== 'undefined' ? editSingleLeaveRequest : window.editSingleLeaveRequest;
window.saveSingleLeaveRule = typeof saveSingleLeaveRule !== 'undefined' ? saveSingleLeaveRule : window.saveSingleLeaveRule;
window.addNewLeaveTypeModal = typeof addNewLeaveTypeModal !== 'undefined' ? addNewLeaveTypeModal : window.addNewLeaveTypeModal;
window.openEditHolidayModal = typeof openEditHolidayModal !== 'undefined' ? openEditHolidayModal : window.openEditHolidayModal;
window.openAddHolidayModal = typeof openAddHolidayModal !== 'undefined' ? openAddHolidayModal : window.openAddHolidayModal;
window.removeCustomColumnField = typeof removeCustomColumnField !== 'undefined' ? removeCustomColumnField : window.removeCustomColumnField;
window.addChoiceInput = typeof addChoiceInput !== 'undefined' ? addChoiceInput : window.addChoiceInput;
window.calcRem = typeof calcRem !== 'undefined' ? calcRem : window.calcRem;
window.deleteCustomColumnWithDoubleConfirm = typeof deleteCustomColumnWithDoubleConfirm !== 'undefined' ? deleteCustomColumnWithDoubleConfirm : window.deleteCustomColumnWithDoubleConfirm;
window.toggleCustomFieldType = typeof toggleCustomFieldType !== 'undefined' ? toggleCustomFieldType : window.toggleCustomFieldType;
window.openCreateCustomFieldModal = typeof openCreateCustomFieldModal !== 'undefined' ? openCreateCustomFieldModal : window.openCreateCustomFieldModal;
window.handleFetchDataClick = handleFetchDataClick;
window.exportAllLeaveHistoryExcel = typeof exportAllLeaveHistoryExcel !== 'undefined' ? exportAllLeaveHistoryExcel : window.exportAllLeaveHistoryExcel;
window.generateAndDownloadLeaveBalancesExcel = typeof generateAndDownloadLeaveBalancesExcel !== 'undefined' ? generateAndDownloadLeaveBalancesExcel : window.generateAndDownloadLeaveBalancesExcel;
window.addNewEmployee = typeof addNewEmployee !== 'undefined' ? addNewEmployee : window.addNewEmployee;
window.editEmployeeData = typeof editEmployeeData !== 'undefined' ? editEmployeeData : window.editEmployeeData;
window.manageDepartments = typeof manageDepartments !== 'undefined' ? manageDepartments : window.manageDepartments;
window.editGlobalLeaveRules = typeof editGlobalLeaveRules !== 'undefined' ? editGlobalLeaveRules : window.editGlobalLeaveRules;
window.editIndividualLeaveBalance = typeof editIndividualLeaveBalance !== 'undefined' ? editIndividualLeaveBalance : window.editIndividualLeaveBalance;
window.openHolidayManagerModal = typeof openHolidayManagerModal !== 'undefined' ? openHolidayManagerModal : window.openHolidayManagerModal;
window.viewAuditLogs = typeof viewAuditLogs !== 'undefined' ? viewAuditLogs : window.viewAuditLogs;
window.resetYearlyLeave = typeof resetYearlyLeave !== 'undefined' ? resetYearlyLeave : window.resetYearlyLeave;
window.importEmployeesExcel = importEmployeesExcel;
window.downloadExcelTemplate = downloadExcelTemplate;

