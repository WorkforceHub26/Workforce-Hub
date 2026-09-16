/**
 * ==========================================================================
 * 🏢 PVT WORKFORCE HUB - DASHBOARD CORE SYSTEM (BATCH CARD PRINT ENHANCED)
 * ==========================================================================
 */

/* ==========================================================================
   1. 🎨 CSS INSPECTION GUARDIAN
   ========================================================================== */


/* ==========================================================================
   2. ⚙️ GLOBAL STATE VARIABLES
   ========================================================================== */
let sb = null;
let rawRequests = [];
let rawEmployees = [];
let chartDeptInstance = null;
let chartTypeInstance = null;
let currentTabState = "pending";
let toastTimer = null;

/* ==========================================================================
   3. 🚀 INITIALIZATION & EVENT LISTENERS
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
  console.group("🚀 [Timeline Step 1]: เริ่มต้นโหลดระบบ Dashboard Core");
  
  try {
    setupSidebarToggle();
    initializeSupabaseConnection();
    setupBellNotificationToggle();

    await refreshDashboardData();

    switchTab(currentTabState);
    setupTableSearch();
    fetchRealNotifications();
    initializeCollapsiblePanels();

  } catch (criticalError) {
    console.error("🚨 [CRITICAL ERROR] เกิดข้อผิดพลาดใน Process หลัก:", criticalError);
  }
  
  console.groupEnd();
});

function initializeCollapsiblePanels() {
  const panels = document.querySelectorAll('.panel, .leave-analytics-card');
  
  panels.forEach(panel => {
    const header = panel.querySelector('.panel-header');
    if (!header) return;
    
    // ตรวจสอบความถูกต้องของปุ่มสลับสถานะ
    let chevron = header.querySelector('.panel-toggle-chevron') || header.querySelector('.btn-toggle-icon') || header.querySelector('#homeTeamToggleIcon');
    let hasExistingToggle = !!chevron;
    
    if (!hasExistingToggle) {
      chevron = document.createElement('span');
      chevron.className = 'material-symbols-outlined panel-toggle-chevron';
      chevron.textContent = 'expand_less'; // ค่าเริ่มต้นคือแสดงอยู่
      chevron.style.marginLeft = 'auto';
      chevron.style.cursor = 'pointer';
      chevron.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      chevron.style.userSelect = 'none';
      chevron.style.color = 'var(--text-soft)';
      header.appendChild(chevron);
    }
    
    header.style.cursor = 'pointer';
    header.style.userSelect = 'none';
    
    header.addEventListener('click', (e) => {
      // ข้ามกรณีที่ผู้ใช้กดคลิกโดนองค์ประกอบโต้ตอบใน Header (เช่น dropdown หรือลิงก์)
      if (e.target.closest('select') || e.target.closest('input') || e.target.closest('button') || e.target.closest('a')) {
        return;
      }
      
      const isCollapsed = panel.classList.toggle('panel-collapsed');
      
      if (chevron) {
        if (chevron.id === 'homeTeamToggleIcon' || chevron.closest('.btn-toggle-icon')) {
          // หากเป็นแผงทีมพนักงาน ให้เรียกตัวแปร Toggle ของตัวระบบหลักเพื่อความสอดคล้องกัน
          const btn = header.querySelector('.btn-toggle-icon');
          if (btn && e.target !== btn && !btn.contains(e.target)) {
            btn.click();
            return;
          }
        } else {
          chevron.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      }
      
      // ถ้าเป็นแผงรายชื่อพนักงานที่มีสคริปต์ควบคุมเฉพาะของตัวเองอยู่แล้ว ให้ข้ามเพื่อไม่ให้ชนกัน
      if (panel.id === 'homeDepartmentTeamSection') {
        return;
      }
      
      // ปิด-เปิดการแสดงผลของคอนเทนต์ด้านในทั้งหมด
      const children = Array.from(panel.children);
      children.forEach(child => {
        if (child !== header) {
          if (isCollapsed) {
            child.style.display = 'none';
          } else {
            child.style.display = '';
          }
        }
      });
    });
  });
}

function initializeSupabaseConnection() {
  if (window.pvtSupabase && typeof window.pvtSupabase.getClient === "function") {
    sb = window.pvtSupabase.getClient();
    console.log("🔌 [DB Connect]: เชื่อมต่อผ่าน window.pvtSupabase สำเร็จ");
  } else if (typeof window.supabaseClient !== "undefined") {
    sb = window.supabaseClient;
    console.log("🔌 [DB Connect]: เชื่อมต่อผ่าน window.supabaseClient สำเร็จ");
  } else if (typeof supabase !== "undefined") {
    sb = supabase;
    console.log("🔌 [DB Connect]: เชื่อมต่อผ่านตัวแปรส่วนกลาง supabase สำเร็จ");
  } else {
    console.warn("⚠️ [DB Connect]: ไม่พบ Supabase Client สลับใช้ Mock Mode");
  }
}

function setupSidebarToggle() {
  const btn = document.getElementById("mobileMenuBtn") || document.querySelector(".mobile-menu-btn");
  if (btn && typeof window.toggleMobileSidebar === "function") {
    btn.removeEventListener("click", window.toggleMobileSidebar);
    btn.addEventListener("click", window.toggleMobileSidebar);
  }
}

function setupBellNotificationToggle() {
  const bellBtn = document.getElementById("notifBellBtn");
  const dropdown = document.getElementById("notifDropdown");

  if (!bellBtn || !dropdown) return;

  const toggleDropdown = (e) => {
    e.stopPropagation();
    const willShow = !dropdown.classList.contains("show");
    dropdown.classList.toggle("show");
    if (willShow) {
      document.body.classList.add("notif-open");
      if (typeof fetchRealNotifications === "function") {
        fetchRealNotifications();
      }
    } else {
      document.body.classList.remove("notif-open");
    }
  };

  bellBtn.addEventListener("click", toggleDropdown);

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
      dropdown.classList.remove("show");
      document.body.classList.remove("notif-open");
    }
  });

  document.addEventListener("touchstart", (e) => {
    if (!dropdown.contains(e.target) && !bellBtn.contains(e.target) && dropdown.classList.contains("show")) {
      dropdown.classList.remove("show");
      document.body.classList.remove("notif-open");
    }
  }, { passive: true });
}

/* ==========================================================================
   4. 🔄 DATA SYNC & FETCHING
   ========================================================================== */
window.showSyncSuccessPopup = function(stats, isManualClick = false) {
  const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  
  const titleText = isManualClick ? 'ซิงค์ข้อมูลระบบเรียบร้อยแล้ว' : 'สรุปภาพรวมข้อมูลล่าสุด';

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: `<div style="display:flex; align-items:center; justify-content:center; gap:8px; font-size:18px; font-weight:700; color:#0f766e;">
        <span class="material-symbols-outlined" style="font-size:26px; color:#0d9488;">cloud_done</span>
        ${titleText}
      </div>`,
      html: `
        <div style="margin-top:10px; text-align:left; font-family:var(--font-sans, sans-serif);">
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between;">
            <div>
              <div style="font-size:11px; color:#166534; font-weight:600;">สถานะการเชื่อมต่อฐานข้อมูล</div>
              <div style="font-size:13px; color:#15803d; font-weight:700; display:flex; align-items:center; gap:6px; margin-top:2px;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#22c55e;"></span>
                Supabase Live Cloud Connected
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px; color:#166534;">เวลาที่ซิงค์ล่าสุด</div>
              <div style="font-size:13px; color:#15803d; font-weight:700;">${timeStr} น.</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; margin-bottom:12px;">
            <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:10px 12px;">
              <div style="font-size:11px; color:#92400e; font-weight:600; display:flex; align-items:center; gap:4px;">
                <span class="material-symbols-outlined" style="font-size:16px; color:#d97706;">hourglass_top</span>
                ใบลารออนุมัติ
              </div>
              <div style="font-size:22px; font-weight:800; color:#d97706; margin-top:4px;">${stats.pendingCount || 0} <span style="font-size:12px; font-weight:600; color:#92400e;">รายการ</span></div>
            </div>

            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:10px 12px;">
              <div style="font-size:11px; color:#1e40af; font-weight:600; display:flex; align-items:center; gap:4px;">
                <span class="material-symbols-outlined" style="font-size:16px; color:#2563eb;">event_available</span>
                ผู้ลาวันนี้
              </div>
              <div style="font-size:22px; font-weight:800; color:#2563eb; margin-top:4px;">${stats.todayCount || 0} <span style="font-size:12px; font-weight:600; color:#1e40af;">คน</span></div>
            </div>

            <div style="background:#f0fdfa; border:1px solid #99f6e4; border-radius:10px; padding:10px 12px;">
              <div style="font-size:11px; color:#115e59; font-weight:600; display:flex; align-items:center; gap:4px;">
                <span class="material-symbols-outlined" style="font-size:16px; color:#0f766e;">groups</span>
                บุคลากรทั้งหมด
              </div>
              <div style="font-size:22px; font-weight:800; color:#0f766e; margin-top:4px;">${stats.totalEmp || 0} <span style="font-size:12px; font-weight:600; color:#115e59;">คน</span></div>
            </div>

            <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:10px; padding:10px 12px;">
              <div style="font-size:11px; color:#5b21b6; font-weight:600; display:flex; align-items:center; gap:4px;">
                <span class="material-symbols-outlined" style="font-size:16px; color:#7c3aed;">today</span>
                ผู้ลาพรุ่งนี้
              </div>
              <div style="font-size:22px; font-weight:800; color:#7c3aed; margin-top:4px;">${stats.tomorrowCount || 0} <span style="font-size:12px; font-weight:600; color:#5b21b6;">คน</span></div>
            </div>
          </div>

          <div style="font-size:11px; color:#94a3b8; text-align:center;">
            อัปเดตข้อมูลระบบล่าสุดเรียบร้อยแล้ว (${dateStr})
          </div>
        </div>
      `,
      showConfirmButton: true,
      confirmButtonText: '<span style="display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;font-size:14px;font-weight:700;"><span class="material-symbols-outlined" style="font-size:18px;">check_circle</span> รับทราบ</span>',
      confirmButtonColor: '#0d9488',
      showDenyButton: false,
      showCancelButton: false,
      timer: 15000,
      timerProgressBar: true,
      showCloseButton: true,
      allowOutsideClick: true,
      allowEscapeKey: true,
      focusConfirm: true,
      customClass: {
        popup: 'pvt-sync-popup'
      },
      didOpen: (popup) => {
        const container = popup.closest('.swal2-container') || document.querySelector('.swal2-container');
        if (container) {
          container.style.zIndex = '2147483647';
          container.style.pointerEvents = 'auto';
        }
      }
    });
  } else {
    showToast('✅ ซิงค์ข้อมูลระบบเรียบร้อยแล้ว', 'success');
  }
};

window.refreshDashboardData = async function(isManualClick = false) {
  console.log("🔄 [Process]: ฟังก์ชัน refreshDashboardData() เริ่มซิงค์ข้อมูล...");
  
  const syncBtn = document.getElementById("btnSyncData");
  if (syncBtn) syncBtn.classList.add("refresh-spin-active");

  const mockRequests = [
    { id: 1, emp_name: "คุณ สมศักดิ์ ผลดี", department: "ฝ่ายผลิต", leave_type_name: "ลาป่วย", total_days: 2, status: "pending", start_date: "2026-07-08", end_date: "2026-07-09", reason: "ไข้ขึ้นสูง" },
    { id: 2, emp_name: "คุณ เจนจิรา มีสุข", department: "ฝ่ายออฟฟิศ", leave_type_name: "ลาพักร้อน", total_days: 3, status: "approved", start_date: "2026-07-10", end_date: "2026-07-12", reason: "พักผ่อนประจำปี" },
    { id: 3, emp_name: "คุณ วิชัย ใจดี", department: "ฝ่ายการตลาด", leave_type_name: "ลากิจ", total_days: 1, status: "approved", start_date: "2026-07-15", end_date: "2026-07-15", reason: "ทำธุระที่ธนาคาร" }
  ];
  const mockEmployees = [{ emp_code: "PVT-001", first_name: "สมศักดิ์", last_name: "ผลดี", full_name: "สมศักดิ์ ผลดี", department: "ฝ่ายผลิต" }];

  if (!sb) {
    rawRequests = mockRequests;
    rawEmployees = mockEmployees;
    renderCounters(1, 1, 1);
    drawCharts();
    if (syncBtn) syncBtn.classList.remove("refresh-spin-active");
    return;
  }

  try {
    // 🟢 ดึงข้อมูลแบบสมบูรณ์พร้อม Fallback ป้องกัน Join Error
    let resRequests = null;
    let resEmployees = null;
    let resLeaveTypes = null;

    try {
      const results = await Promise.all([
        sb.from("leave_requests").select(`
          *,
          employees (
            id, employee_code, full_name, first_name, last_name, nickname, role, image_url, department_id,
            departments!department_id ( id, department_name ),
            positions ( position_name )
          ),
          leave_types ( id, leave_code, leave_name )
        `).order("created_at", { ascending: false }),
        sb.from("employees").select("*, departments!department_id(id, department_name), positions(position_name)"),
        sb.from("leave_types").select("*")
      ]);
      resRequests = results[0];
      resEmployees = results[1];
      resLeaveTypes = results[2];
    } catch (joinErr) {
      console.warn("⚠️ Complex Join Query Failed, retrying simple select:", joinErr);
      const fallbackResults = await Promise.all([
        sb.from("leave_requests").select("*").order("created_at", { ascending: false }),
        sb.from("employees").select("*"),
        sb.from("leave_types").select("*")
      ]);
      resRequests = fallbackResults[0];
      resEmployees = fallbackResults[1];
      resLeaveTypes = fallbackResults[2];
    }

    if (resRequests?.error || resEmployees?.error) {
      console.warn("⚠️ Initial Supabase fetch error, attempting simple query retry...", resRequests?.error || resEmployees?.error);
      try {
        const fallbackResults = await Promise.all([
          sb.from("leave_requests").select("*").order("created_at", { ascending: false }),
          sb.from("employees").select("*"),
          sb.from("leave_types").select("*")
        ]);
        if (!fallbackResults[0]?.error && fallbackResults[0]?.data) resRequests = fallbackResults[0];
        if (!fallbackResults[1]?.error && fallbackResults[1]?.data) resEmployees = fallbackResults[1];
        if (!fallbackResults[2]?.error && fallbackResults[2]?.data) resLeaveTypes = fallbackResults[2];
      } catch (retryErr) {
        console.warn("⚠️ Retry simple query error:", retryErr);
      }
    }

    rawRequests = resRequests?.data || [];
    rawEmployees = resEmployees?.data || [];
    const allLeaveTypes = resLeaveTypes?.data || [];

    // 📦 Fallback to local cache if network/Supabase request failed completely
    if ((!rawRequests || rawRequests.length === 0) || (!rawEmployees || rawEmployees.length === 0)) {
      try {
        const cachedReq = localStorage.getItem("pvt_cached_home_requests");
        const cachedEmp = localStorage.getItem("pvt_cached_home_employees");
        if ((!rawRequests || rawRequests.length === 0) && cachedReq) {
          rawRequests = JSON.parse(cachedReq);
          console.log("📦 Loaded leave requests from local cache fallback.");
        }
        if ((!rawEmployees || rawEmployees.length === 0) && cachedEmp) {
          rawEmployees = JSON.parse(cachedEmp);
          console.log("📦 Loaded employees from local cache fallback.");
        }
      } catch (cacheErr) {}
    } else {
      try {
        localStorage.setItem("pvt_cached_home_requests", JSON.stringify(rawRequests));
        localStorage.setItem("pvt_cached_home_employees", JSON.stringify(rawEmployees));
      } catch (cacheErr) {}
    }

    // ⏱️ ตรวจสอบและตัดใบลาที่ค้างเกิน 2 วัน (48 ชม.) เป็น "ไม่อนุมัติ"
    if (typeof window.autoRejectOverdueLeaves === 'function') {
      try { await window.autoRejectOverdueLeaves(); } catch(e) {}
    }

    const nowMs = Date.now();
    const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
    rawRequests = rawRequests.map(r => {
      const st = String(r.status || '').toLowerCase();
      const isPending = (st === 'pending' || st === 'pending_l1' || st === 'pending_l2' || st.includes('รออนุมัติ'));
      if (isPending && r.created_at) {
        const createdTime = new Date(r.created_at).getTime();
        if (!isNaN(createdTime) && (nowMs - createdTime >= TWO_DAYS_MS)) {
          return {
            ...r,
            status: 'cancelled',
            approval_comment: r.approval_comment || 'ยกเลิกอัตโนมัติเนื่องจากหัวหน้าไม่ได้ดำเนินการในเวลาที่กำหนด (เกิน 2 วัน)'
          };
        }
      }
      return r;
    });

    // --- 🔐 Role-Based Data Filtering (Personalized Dashboard) ---
    const savedSession = localStorage.getItem("currentUser");
    const sessionUser = savedSession ? JSON.parse(savedSession) : {};
    const empCode = String(sessionUser.employee_code || sessionUser?.employees?.employee_code || '').trim();
    const myRole = String(sessionUser.role || 'user').toLowerCase();
    const myDeptId = sessionUser.department_id || (rawEmployees.find(e => String(e.id) === String(sessionUser.id) || String(e.employee_code) === empCode)?.department_id) || (empCode === '19122' ? 'a318f70f-8e24-4e36-958a-7726d6c9da4d' : null);

    // ถ้าเป็น Leader หรือ Manager หรือเป็นรหัส 19122 (ผู้จัดการฝ่ายบุคคล-ธุรการ) ให้เห็นเฉพาะข้อมูลในแผนกตนเอง
    const isDeptHead = (myRole === 'leader' || myRole === 'manager' || empCode === '19122');
    if (isDeptHead && myDeptId) {
      console.log(`🔒 [Role Filter]: กรองข้อมูลเฉพาะแผนก ID: ${myDeptId} (Role: ${myRole}, EmpCode: ${empCode})`);
      
      // กรองพนักงานในแผนก
      rawEmployees = rawEmployees.filter(e => String(e.department_id) === String(myDeptId));
      
      // กรองใบลาของพนักงานในแผนก
      const deptEmpIds = new Set(rawEmployees.map(e => String(e.id)));
      rawRequests = rawRequests.filter(r => deptEmpIds.has(String(r.employee_id)));
      
      // เปลี่ยนหัวข้อให้ชัดเจน
      const titleEl = document.querySelector('.topbar-left h1');
      if (titleEl) titleEl.textContent = `ภาพรวมข้อมูลแผนก (${rawEmployees[0]?.departments?.department_name || 'ฝ่ายบุคคล-ธุรการ'})`;
    }

    // ผูกข้อมูลสัมพันธ์เพิ่มเติมเพื่อความสมบูรณ์ 100%
    const empMap = new Map((rawEmployees || []).map(e => [String(e.id), e]));
    const typeMap = new Map((allLeaveTypes || []).map(t => [String(t.id), t]));

    rawRequests.forEach(r => {
      if (!r.employees && r.employee_id) {
        r.employees = empMap.get(String(r.employee_id)) || null;
      }
      if (!r.leave_types && r.leave_type_id) {
        r.leave_types = typeMap.get(String(r.leave_type_id)) || null;
      }
    });

    if (rawRequests.length === 0 && rawEmployees.length === 0) {
      rawRequests = mockRequests;
      rawEmployees = mockEmployees;
    }

    const myEmpId = sessionUser?.id || sessionUser?.employee_id || sessionUser?.employees?.id;
    const pendingCount = rawRequests.filter(r => {
      if (!r || !r.status) return false;

      // 🚫 ห้ามรวมใบลาของตนเอง (Self-Leave Exclusion)
      const isSelf = myEmpId ? (String(r.employee_id) === String(myEmpId) || String(r.employees?.id) === String(myEmpId)) : false;
      if (isSelf) return false;

      // กรองเฉพาะใบลาค้างพิจารณาที่รอสิทธิ์อนุมัติของบทบาทเราจริงๆ เพื่อให้ตัวเลขหน้า Home ตรงกับหน้า "ตรวจใบลา"
      return isPendingForRoleHome(r, myRole);
    }).length;
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const todayLeaves = rawRequests.filter(r => {
      const isApproved = (r.status === "approved" || r.status === "อนุมัติ");
      const inRange = r.start_date && r.end_date && (todayStr >= r.start_date && todayStr <= r.end_date);
      return isApproved && inRange;
    });

    const tomorrowLeaves = rawRequests.filter(r => {
      const isApproved = (r.status === "approved" || r.status === "อนุมัติ");
      const inRange = r.start_date && r.end_date && (tomorrowStr >= r.start_date && tomorrowStr <= r.end_date);
      return isApproved && inRange;
    });

    const totalEmp = rawEmployees.length;

    renderCounters(pendingCount, todayLeaves.length, totalEmp, tomorrowLeaves.length);
    renderTodayLeavesDetail(todayLeaves);
    renderHomeDepartmentTeam(rawEmployees, sessionUser);
    
    // --- 🎯 Render "My Action Required" items (Action-First Dashboard) ---
    renderMyActionRequiredSection(rawRequests, sessionUser);

    drawCharts();
    
    // 🟢 แสดง SweetAlert2 Sync Popup Modal รายละเอียดสมบูรณ์
    showSyncSuccessPopup({
      pendingCount,
      todayCount: todayLeaves.length,
      totalEmp,
      tomorrowCount: tomorrowLeaves.length
    }, isManualClick);

  } catch (error) {
    console.error("❌ [Catch Error]: เกิดข้อผิดพลาดระหว่างคิวรีข้อมูล:", error);
    renderCounters(0, 0, 0, 0);
  } finally {
    if (syncBtn) {
      setTimeout(() => {
        syncBtn.classList.remove("refresh-spin-active");
      }, 500);
    }
  }
};

/* ==========================================================================
   5. 📊 CHARTS & TOP LEAVE TAKERS (ENHANCED ENGINE)
   ========================================================================== */
// ประกาศตัวแปร Global สำหรับเก็บ Chart Instance (ป้องกัน ReferenceError)
if (typeof window.chartTypeInstance === "undefined") window.chartTypeInstance = null;
if (typeof window.chartDeptInstance === "undefined") window.chartDeptInstance = null;

function drawCharts() {
  // 1. ตรวจสอบว่ามีไลบรารี Chart.js หรือไม่
  if (typeof Chart === "undefined") {
    console.warn("⚠️ Chart.js library not loaded yet, retrying in 300ms...");
    setTimeout(drawCharts, 300);
    return;
  }

  // 2. ข้อมูลคำขอที่ปลอดภัย
  const safeRequests = Array.isArray(typeof rawRequests !== "undefined" ? rawRequests : null)
    ? rawRequests
    : [];

  const canvasType = document.getElementById("chartLeaveTypes");
  const canvasDept = document.getElementById("chartDepartments");

  // 🟢 กรองรายการที่อนุมัติแล้วอย่างเคร่งครัด
  const approvedRequests = safeRequests.filter(r => {
    if (!r || !r.status) return false;
    const st = String(r.status).trim().toLowerCase();
    return st === "approved" || st === "อนุมัติ" || st === "อนุมัติแล้ว" || st === "pass" || st === "completed" || st === "complete";
  });

  const activeDataset = approvedRequests;
  const isApprovedData = approvedRequests.length > 0;
  const hasData = activeDataset.length > 0;

  // --- 1. กราฟสัดส่วนประเภทการลา ---
  if (canvasType) {
    const typeSummary = {};
    let totalCount = 0;

    activeDataset.forEach(r => {
      const typeName = r.leave_types?.leave_name || r.leave_type_name || "อื่น ๆ";
      typeSummary[typeName] = (typeSummary[typeName] || 0) + 1;
      totalCount++;
    });

    const headerTotalEl = document.getElementById("leaveTypeTotalHeader");
    if (headerTotalEl) {
      headerTotalEl.textContent = isApprovedData 
        ? `(อนุมัติแล้ว ${totalCount} รายการ)` 
        : `(รวม ${totalCount} รายการ)`;
    }

    const centerTotalEl = document.getElementById("leaveTypeTotalCenter");
    if (centerTotalEl) centerTotalEl.textContent = totalCount;

    const typeLabels = hasData ? Object.keys(typeSummary) : ["ไม่มีข้อมูล"];
    const typeValues = hasData ? Object.values(typeSummary) : [1];
    const colorPalette = ['#0fa472', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4', '#64748b'];
    const bgColors = hasData ? typeLabels.map((_, i) => colorPalette[i % colorPalette.length]) : ['#e2e8f0'];

    // เคลียร์กราฟเก่า
    if (window.chartTypeInstance) {
      window.chartTypeInstance.destroy();
      window.chartTypeInstance = null;
    }

    const chartTypeElement1 = document.getElementById('typeChartType');
    const typeChartTypeValue = chartTypeElement1 ? chartTypeElement1.value : 'doughnut';

    // วาดกราฟใหม่
    window.chartTypeInstance = new Chart(canvasType.getContext("2d"), {
      type: typeChartTypeValue,
      data: {
        labels: typeLabels,
        datasets: [{
          data: typeValues,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: typeChartTypeValue !== 'doughnut' },
          tooltip: {
            enabled: hasData,
            callbacks: {
              label: function(context) {
                const val = context.raw || 0;
                const pct = totalCount > 0 ? ((val / totalCount) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${val} รายการ (${pct}%)`;
              }
            }
          }
        },
        cutout: typeChartTypeValue === 'doughnut' ? '70%' : undefined
      }
    });

    if (typeof renderLeaveBreakdownList === "function") {
      renderLeaveBreakdownList(typeSummary, totalCount, colorPalette);
    }
  }

  // --- 2. กราฟสถิติจำนวนวันลาแยกตามแผนก ---
  if (canvasDept) {
    const deptSummary = {};

    activeDataset.forEach(r => {
      const deptObj = r.employees?.departments;
      const deptName = (Array.isArray(deptObj) ? deptObj[0]?.department_name : deptObj?.department_name)
        || r.department
        || "ส่วนกลาง / ไม่ระบุ";

      const rawDays = r.actual_days ?? r.total_days ?? r.days_requested ?? r.days;
      const days = (rawDays !== null && rawDays !== undefined && rawDays !== "") ? parseFloat(rawDays) : 1;

      deptSummary[deptName] = (deptSummary[deptName] || 0) + days;
    });

    const deptLabels = hasData ? Object.keys(deptSummary) : ["ไม่มีข้อมูล"];
    const deptValues = hasData ? Object.values(deptSummary) : [0];
    const colorPalette = ['#0fa472', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4', '#64748b'];
    const deptColors = hasData ? deptLabels.map((_, i) => colorPalette[i % colorPalette.length]) : ['#e2e8f0'];

    // เคลียร์กราฟเก่า
    if (window.chartDeptInstance) {
      window.chartDeptInstance.destroy();
      window.chartDeptInstance = null;
    }

    const chartTypeElement = document.getElementById('deptChartType');
    const chartType = chartTypeElement ? chartTypeElement.value : 'bar';

    // วาดกราฟใหม่
    window.chartDeptInstance = new Chart(canvasDept.getContext("2d"), {
      type: chartType,
      data: {
        labels: deptLabels,
        datasets: [{
          label: 'รวมวันลา (วัน)',
          data: deptValues,
          backgroundColor: deptColors,
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: hasData,
            callbacks: {
              label: function(context) {
                return ` รวมวันลา: ${context.raw} วัน`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { 
              font: { family: 'Sarabun', size: 12 },
              color: '#64748b'
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
              font: { family: 'Sarabun', size: 12 },
              color: '#64748b',
              callback: function(val) { return val + ' วัน'; }
            },
            grid: { color: '#f1f5f9' }
          }
        }
      }
    });
  }

  // --- 3. อันดับพนักงานที่ลาเยอะที่สุด ---
  if (typeof renderTopLeaveEmployees === "function") {
    renderTopLeaveEmployees(activeDataset);
  }
}

function renderLeaveBreakdownList(typeSummary, totalCount, colors) {
  const detailsList = document.getElementById("leaveDetailsList") || document.querySelector(".details-list");
  if (!detailsList) return;

  const keys = Object.keys(typeSummary);

  if (keys.length === 0) {
    detailsList.innerHTML = `<div style="color:var(--text-soft); font-size:14px; text-align:center; padding:20px;">ไม่มีข้อมูลประวัติการลา</div>`;
    return;
  }

  let html = "";
  keys.forEach((key, index) => {
    const count = typeSummary[key];
    const pct = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : 0;
    const color = colors[index % colors.length];

    html += `
      <div class="detail-item">
        <div class="item-info">
          <span class="badge-dot" style="background-color: ${color};"></span>
          <span class="item-name">${key}</span>
          <span class="item-val">${count} รายการ</span>
          <span class="item-pct" style="color: ${color};">${pct}%</span>
        </div>
        <div class="progress-bar">
          <div class="fill" style="width: ${pct}%; background-color: ${color};"></div>
        </div>
      </div>
    `;
  });

  detailsList.innerHTML = html;
}

function renderTopLeaveEmployees(approvedRequests) {
  const container = document.getElementById("topLeaveEmployeesTable");
  if (!container) return;

  const reqList = Array.isArray(approvedRequests) ? approvedRequests : [];

  // กรองรายการที่อนุมัติแล้ว (หรือถ้ายังไม่มีอนุมัติ ให้ดูว่ามี safeRequests ไหม)
  const validApproved = reqList.filter(r => {
    if (!r) return false;
    const st = String(r.status || "").trim().toLowerCase();
    return st === "approved" || st === "อนุมัติ" || st === "อนุมัติแล้ว" || st === "complete" || st === "completed" || st === "pass";
  });

  if (validApproved.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 28px 16px; text-align: center; color: var(--text-soft); background: #f8fafc; border-radius: var(--radius-md); border: 1px dashed #e2e8f0;">
        <span class="material-symbols-outlined" style="font-size: 38px; color: #cbd5e1; margin-bottom: 8px; display: block;">event_busy</span>
        <div style="font-weight: 700; color: #64748b; font-size: 14px;">ยังไม่มีข้อมูลการลาที่อนุมัติแล้ว</div>
        <span style="font-size: 12px; color: #94a3b8; margin-top: 4px; display: block;">ระบบจะจัดอันดับอัตโนมัติเมื่อมีใบลาที่ได้รับการอนุมัติเรียบร้อย</span>
      </div>
    `;
    return;
  }

  const empMap = {};
  const allEmps = Array.isArray(typeof rawEmployees !== "undefined" ? rawEmployees : null) ? rawEmployees : [];

  validApproved.forEach(r => {
    if (!r) return;
    
    // 1. ดึงพนักงานและเชื่อมโยงข้อมูล
    const empObj = r.employees || allEmps.find(e => String(e.id) === String(r.employee_id) || String(e.employee_code) === String(r.employee_id));
    const empId = String(r.employee_id || (empObj ? (empObj.id || empObj.employee_code) : '') || r.emp_name || r.full_name || "Unknown");
    
    let empName = "ไม่ระบุชื่อ";
    if (empObj) {
      if (empObj.full_name) {
        empName = empObj.full_name;
      } else if (empObj.first_name) {
        const parts = [empObj.prefix || empObj.title, empObj.first_name, empObj.last_name].filter(Boolean);
        empName = parts.join(" ");
      }
    } else if (r.full_name) {
      empName = r.full_name;
    } else if (r.emp_name) {
      empName = r.emp_name;
    } else if (r.employee_name) {
      empName = r.employee_name;
    }

    // แผนก
    let deptName = "ส่วนกลาง / ทั่วไป";
    if (empObj) {
      const deptData = empObj.departments;
      if (Array.isArray(deptData) && deptData.length > 0) {
        deptName = deptData[0].department_name || deptName;
      } else if (deptData && typeof deptData === "object" && deptData.department_name) {
        deptName = deptData.department_name;
      } else if (empObj.department) {
        deptName = empObj.department;
      }
    } else if (r.department) {
      deptName = r.department;
    }

    // รูปและรหัส
    const avatarUrl = empObj?.image_url || empObj?.avatar_url || r.image_url || r.avatar_url || "";
    const empCode = empObj?.employee_code || empObj?.emp_code || r.employee_code || "";

    // 2. คำนวณจำนวนวันลาสะสมอย่างปลอดภัย
    let days = 0;
    const rawActual = r.actual_days;
    const rawTotal = r.total_days;
    const rawReq = r.days_requested;
    const rawDays = r.days;
    const rawHours = r.leave_hours ?? r.total_hours ?? r.hours;

    if (rawActual !== null && rawActual !== undefined && rawActual !== "") {
      days = parseFloat(rawActual) || 0;
    } else if (rawTotal !== null && rawTotal !== undefined && rawTotal !== "") {
      days = parseFloat(rawTotal) || 0;
    } else if (rawReq !== null && rawReq !== undefined && rawReq !== "") {
      days = parseFloat(rawReq) || 0;
    } else if (rawDays !== null && rawDays !== undefined && rawDays !== "") {
      days = parseFloat(rawDays) || 0;
    } else if (rawHours !== null && rawHours !== undefined && rawHours !== "") {
      days = (parseFloat(rawHours) || 0) / 8;
    } else if (r.start_date && r.end_date) {
      const s = new Date(r.start_date);
      const e = new Date(r.end_date);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        days = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
      } else {
        days = 1;
      }
    } else {
      days = 1;
    }

    if (!empMap[empId]) {
      empMap[empId] = {
        id: empId,
        name: empName,
        code: empCode,
        dept: deptName,
        avatar: avatarUrl,
        count: 0,
        totalDays: 0
      };
    }

    empMap[empId].count += 1;
    empMap[empId].totalDays += days;
  });

  const sortedEmployees = Object.values(empMap)
    .sort((a, b) => b.totalDays - a.totalDays)
    .slice(0, 5);

  if (sortedEmployees.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px 16px; text-align: center; color: var(--text-soft);">
        <span class="material-symbols-outlined" style="font-size: 36px; color: #cbd5e1; margin-bottom: 6px; display: block;">event_busy</span>
        <div>ไม่มีข้อมูลประวัติการลาที่อนุมัติ</div>
      </div>
    `;
    return;
  }

  const maxDays = Math.max(...sortedEmployees.map(e => e.totalDays), 1);

  let html = "";
  sortedEmployees.forEach((emp, index) => {
    let rankBadge = `<span class="col-rank">${index + 1}</span>`;
    let rankClass = `rank-${index + 1}`;
    if (index === 0) rankBadge = `<span class="col-rank rank-medal" title="อันดับ 1">🥇</span>`;
    else if (index === 1) rankBadge = `<span class="col-rank rank-medal" title="อันดับ 2">🥈</span>`;
    else if (index === 2) rankBadge = `<span class="col-rank rank-medal" title="อันดับ 3">🥉</span>`;

    // แปลงจำนวนวันและชั่วโมงลาให้อ่านง่ายเป็นภาษาไทยชัดเจน 100% (ไม่มีทศนิยมลอยน้ำ)
    const totMin = Math.round((parseFloat(emp.totalDays) || 0) * 480);
    const wDays = Math.floor(totMin / 480);
    const remMin = totMin % 480;
    const wH = Math.floor(remMin / 60);
    const mins = remMin % 60;
    
    let formattedDays = "";
    if (wDays === 0) {
      if (wH === 4 && mins === 0) {
        formattedDays = "4 ชม. (ครึ่งวัน)";
      } else if (wH > 0 && mins > 0) {
        formattedDays = `${wH} ชม. ${mins} นาที`;
      } else if (wH > 0) {
        formattedDays = `${wH} ชม.`;
      } else if (mins > 0) {
        formattedDays = `${mins} นาที`;
      } else {
        formattedDays = "0 วัน";
      }
    } else {
      const parts = [`${wDays} วัน`];
      if (wH === 4 && mins === 0) {
        parts.push("4 ชม.");
      } else {
        if (wH > 0) parts.push(`${wH} ชม.`);
        if (mins > 0) parts.push(`${mins} นาที`);
      }
      formattedDays = parts.join(" ");
    }

    // Helper to extract 2 readable consonants/letters from Thai/English names
    function getDisplayInitials(fullName, nickname) {
      if (nickname && nickname.trim()) {
        const cleanNick = nickname.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').trim();
        if (cleanNick.length >= 2) return cleanNick.substring(0, 2);
      }
      if (!fullName) return "PV";
      let name = fullName.replace(/^(คุณ|นาย|นาง|นางสาว|ด\.ช\.|ด\.ญ\.|Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').trim();
      const parts = name.split(/\s+/);
      if (parts.length >= 2) {
        const firstP = parts[0].replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').trim();
        const lastP = parts[parts.length - 1].replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').trim();
        const fChar = firstP.charAt(0) || '';
        const lChar = lastP.charAt(0) || '';
        if (fChar || lChar) return (fChar + lChar).toUpperCase();
      }
      const cleanName = name.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').trim();
      if (cleanName.length >= 2) return cleanName.substring(0, 2).toUpperCase();
      if (cleanName.length === 1) return cleanName.toUpperCase();
      return "PV";
    }

    // Avatar
    const initials = getDisplayInitials(emp.name, emp.nickname);
    const avatarHtml = emp.avatar 
      ? `<img src="${emp.avatar}" class="top-emp-avatar" alt="${emp.name}" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'top-emp-avatar-badge',textContent:'${initials}'}));">`
      : `<div class="top-emp-avatar-badge">${initials}</div>`;

    html += `
      <div class="top-emp-card ${rankClass}">
        <div class="col-rank-box">
          ${rankBadge}
        </div>
        <div class="col-profile-box">
          ${avatarHtml}
          <div class="col-name">
            <span class="emp-name">${emp.name}</span>
            <span class="emp-dept">${emp.dept} ${emp.code ? `• <span class="emp-code">${emp.code}</span>` : ''}</span>
          </div>
        </div>
        <div class="col-stats">
          <span class="stat-badge">${emp.count} ครั้ง</span>
          <span class="stat-days">${formattedDays}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/* ==========================================================================
   6. 📋 TABLE DATA & TAB SWITCHING
   ========================================================================== */
window.switchTab = function(targetTab) {
  currentTabState = targetTab;
  const tContainer = document.getElementById("tableBody");
  const tTitle = document.getElementById("tableTitle");

  if (!tContainer) return;
  tContainer.style.opacity = "0.3";

  let bodyHtml = "";

  if (targetTab === "pending") {
    if (tTitle) tTitle.textContent = "รายการคำขอลาล่าสุด (รอพิจารณา)";
    const filtered = rawRequests.filter(r => r && (r.status === "pending" || r.status === "รออนุมัติ"));

    if (filtered.length === 0) {
      bodyHtml = `<div class="empty-state">ไม่มีใบลาค้างพิจารณาในระบบ ✨</div>`;
    } else {
      filtered.forEach(item => {
        const safeEmp = item.employees || {};
        const safeType = item.leave_types || {};

        const name = safeEmp.full_name || safeEmp.name || getSafeValue(item, ["emp_name", "employee_name", "name"]);
        const type = safeType.leave_name || getSafeValue(item, ["leave_type_name", "leave_type"]);
        const dept = safeEmp.departments?.department_name || getSafeValue(item, ["department", "division"]);
        
        const sDate = formatThaiDate(getSafeValue(item, ["start_date", "date"]));
        const eDate = formatThaiDate(getSafeValue(item, ["end_date"]));
        const dateStr = sDate !== "-" ? `${sDate} - ${eDate !== "-" ? eDate : sDate}` : `${getSafeValue(item, ["total_days", "days"], 0)} วัน`;

        bodyHtml += `
          <div class="dash-leave-card">
            <div class="col-emp">
              <span class="emp-name">${name}</span>
              <span class="emp-dept">${dept || "-"}</span>
            </div>
            <div class="col-type"><span>${type || "-"}</span></div>
            <div class="col-date">${dateStr}</div>
            <div class="col-status">
              <span class="status pending">รออนุมัติ</span>
            </div>
          </div>`;
      });
    }
  }
  else if (targetTab === "approved") {
    if (tTitle) tTitle.textContent = "ประวัติคำขอลาที่พิจารณาเสร็จสิ้นแล้ว";
    const filtered = rawRequests.filter(r => r && (r.status === "approved" || r.status === "rejected" || r.status === "อนุมัติ"));
    
    if (filtered.length === 0) {
      bodyHtml = `<div class="empty-state">ยังไม่มีประวัติการบันทึกผลในระบบ</div>`;
    } else {
      filtered.forEach(item => {
        const safeEmp = item.employees || {};
        const safeType = item.leave_types || {};

        const name = safeEmp.full_name || safeEmp.name || getSafeValue(item, ["emp_name", "employee_name", "name"]);
        const type = safeType.leave_name || getSafeValue(item, ["leave_type_name", "leave_type"]);
        const dept = safeEmp.departments?.department_name || getSafeValue(item, ["department", "division"]);
        const dateStr = formatThaiDate(getSafeValue(item, ["start_date", "date"]));
        const isApp = item.status === "approved" || item.status === "อนุมัติ";
        
        bodyHtml += `
          <div class="dash-leave-card">
            <div class="col-emp">
              <span class="emp-name">${name || "-"}</span>
              <span class="emp-dept">${dept || "-"}</span>
            </div>
            <div class="col-type"><span>${type || "-"}</span></div>
            <div class="col-date">${dateStr}</div>
            <div class="col-status">
              <span class="status ${isApp?'approved':'rejected'}">${isApp?'อนุมัติแล้ว':'ปฏิเสธ'}</span>
            </div>
          </div>`;
      });
    }
  }

  tContainer.innerHTML = bodyHtml;
  setTimeout(() => { tContainer.style.opacity = "1"; }, 20);
};

function computeSlaStats(requests) {
  const SLA_HOURS = 48; // 2 วัน = 48 ชม.
  const SLA_MS = SLA_HOURS * 3600 * 1000;
  const now = Date.now();

  const savedSession = localStorage.getItem("currentUser");
  const sessionUser = savedSession ? JSON.parse(savedSession) : {};
  const empCode = String(sessionUser.employee_code || sessionUser?.employees?.employee_code || '').trim();
  let myRole = String(sessionUser.role || 'user').toLowerCase();
  if (empCode === '19122') {
    myRole = 'manager';
  }
  const myEmpId = sessionUser?.id || sessionUser?.employee_id || sessionUser?.employees?.id;

  const pendingList = (requests || []).filter(r => {
    if (!r || !r.status) return false;

    // 🚫 ห้ามรวมใบลาของตนเอง (Self-Leave Exclusion)
    const isSelf = myEmpId ? (String(r.employee_id) === String(myEmpId) || String(r.employees?.id) === String(myEmpId)) : false;
    if (isSelf) return false;

    // กรองเฉพาะใบลาค้างพิจารณาที่รอสิทธิ์อนุมัติของบทบาทเราจริงๆ เพื่อให้ตัวเลขและสัญลักษณ์ SLA สอดคล้องกับหน้างานจริง
    return isPendingForRoleHome(r, myRole);
  });

  let overdueList = [];
  let urgentList = [];
  let normalList = [];

  pendingList.forEach(r => {
    const createdAt = r.created_at ? new Date(r.created_at).getTime() : now;
    const diffMs = Math.max(0, now - createdAt);
    const remainingMs = SLA_MS - diffMs;
    const remainingHours = remainingMs / (3600 * 1000);
    const isOverdue = diffMs >= SLA_MS;
    const isUrgent = !isOverdue && remainingHours <= 24; // Approaching 2-day limit: <= 24h

    let countdownText = "";
    if (isOverdue) {
      const overdueMs = Math.abs(remainingMs);
      const days = Math.floor(overdueMs / (86400 * 1000));
      const hours = Math.floor((overdueMs % (86400 * 1000)) / (3600 * 1000));
      const mins = Math.floor((overdueMs % (3600 * 1000)) / (60 * 1000));
      if (days > 0) {
        countdownText = `เกินกำหนด ${days} วัน ${hours} ชม.`;
      } else {
        countdownText = `เกินกำหนด ${hours} ชม. ${mins} นาที`;
      }
      overdueList.push({ ...r, slaStatus: 'overdue', diffMs, remainingHours, countdownText });
    } else if (isUrgent) {
      const hours = Math.floor(remainingMs / (3600 * 1000));
      const mins = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
      countdownText = `เหลือ ${hours} ชม. ${mins} นาที`;
      urgentList.push({ ...r, slaStatus: 'urgent', diffMs, remainingHours, countdownText });
    } else {
      const days = Math.floor(remainingMs / (86400 * 1000));
      const hours = Math.floor((remainingMs % (86400 * 1000)) / (3600 * 1000));
      countdownText = `เหลือ ${days} วัน ${hours} ชม.`;
      normalList.push({ ...r, slaStatus: 'normal', diffMs, remainingHours, countdownText });
    }
  });

  return {
    totalPending: pendingList.length,
    overdueCount: overdueList.length,
    urgentCount: urgentList.length,
    normalCount: normalList.length,
    overdueList,
    urgentList,
    normalList,
    allPendingWithSla: [...overdueList, ...urgentList, ...normalList]
  };
}

function updateSlaBadges(slaStats) {
  const { totalPending, overdueCount, urgentCount, normalCount } = slaStats;

  // 1. 📌 Sidebar Badge บนเมนู "ตรวจใบลา"
  const sidebarBadge = document.getElementById("sidebarSlaPendingBadge");
  if (sidebarBadge) {
    if (totalPending > 0) {
      sidebarBadge.textContent = totalPending > 99 ? '99+' : totalPending;
      sidebarBadge.style.display = 'inline-flex';
      sidebarBadge.className = 'sidebar-badge';
      if (overdueCount > 0) {
        sidebarBadge.classList.add('overdue');
        sidebarBadge.title = `มีคำขอลาเกินกำหนด SLA 2 วัน: ${overdueCount} รายการ`;
      } else if (urgentCount > 0) {
        sidebarBadge.classList.add('urgent');
        sidebarBadge.title = `มีคำขอลาใกล้ครบกำหนด SLA 2 วัน: ${urgentCount} รายการ`;
      } else {
        sidebarBadge.classList.add('normal');
        sidebarBadge.title = `มีคำขอลารอพิจารณา: ${totalPending} รายการ`;
      }
    } else {
      sidebarBadge.style.display = 'none';
    }
  }

  // 2. 📊 Stat Card "รอพิจารณา (L1/L2)" Warning Badge & Subpills
  const statCard = document.getElementById("statCardPendingLeaves");
  const statBadgeWarning = document.getElementById("statSlaBadgeWarning");
  const statSubbadges = document.getElementById("statSlaSubbadges");
  const subOverdue = document.getElementById("subStatOverdue");
  const subUrgent = document.getElementById("subStatUrgent");

  if (statBadgeWarning) {
    if (overdueCount > 0) {
      statBadgeWarning.textContent = `⚠️ เกิน SLA (${overdueCount})`;
      statBadgeWarning.style.display = 'inline-block';
      statBadgeWarning.className = 'stat-sla-badge';
    } else if (urgentCount > 0) {
      statBadgeWarning.textContent = `⏳ ใกล้ครบ (${urgentCount})`;
      statBadgeWarning.style.display = 'inline-block';
      statBadgeWarning.className = 'stat-sla-badge urgent';
    } else {
      statBadgeWarning.style.display = 'none';
    }
  }

  if (statSubbadges && subOverdue && subUrgent) {
    if (totalPending > 0 && (overdueCount > 0 || urgentCount > 0)) {
      statSubbadges.style.display = 'flex';
      subOverdue.textContent = `🔴 เกิน 2 วัน: ${overdueCount}`;
      subOverdue.style.display = overdueCount > 0 ? 'inline-flex' : 'none';
      subUrgent.textContent = `🟠 ใกล้ครบ: ${urgentCount}`;
      subUrgent.style.display = urgentCount > 0 ? 'inline-flex' : 'none';
    } else {
      statSubbadges.style.display = 'none';
    }
  }

  // 3. 🚨 Top SLA Alert Notification Banner
  renderSlaAlertBanner(slaStats);
}

function renderSlaAlertBanner(slaStats) {
  const banner = document.getElementById("slaAlertBanner");
  if (!banner) return;

  const { totalPending, overdueCount, urgentCount, normalCount } = slaStats;

  if (totalPending === 0 || (overdueCount === 0 && urgentCount === 0)) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';

  const pill = document.getElementById("slaBannerOverallPill");
  const msg = document.getElementById("slaBannerMessage");
  const valOverdue = document.getElementById("slaBannerOverdueVal");
  const valUrgent = document.getElementById("slaBannerUrgentVal");
  const valSafe = document.getElementById("slaBannerSafeVal");

  if (valOverdue) valOverdue.textContent = overdueCount;
  if (valUrgent) valUrgent.textContent = urgentCount;
  if (valSafe) valSafe.textContent = normalCount;

  if (overdueCount > 0) {
    banner.className = 'sla-alert-banner has-overdue';
    if (pill) {
      pill.textContent = `เกินกำหนด ${overdueCount} รายการ`;
      pill.className = 'sla-banner-status-pill overdue';
    }
    if (msg) {
      msg.textContent = `พบคำขอลาที่เกินกรอบเวลานโยบาย 2 วันทำการ (48 ชม.) จำนวน ${overdueCount} รายการ และใกล้ครบกำหนดอีก ${urgentCount} รายการ กรุณาเร่งอนุมัติทันที`;
    }
  } else {
    banner.className = 'sla-alert-banner';
    if (pill) {
      pill.textContent = `ใกล้ครบกำหนด ${urgentCount} รายการ`;
      pill.className = 'sla-banner-status-pill urgent';
    }
    if (msg) {
      msg.textContent = `พบคำขอลาที่เหลือเวลาอนุมัติน้อยกว่า 24 ชั่วโมง จำนวน ${urgentCount} รายการ เพื่อให้ทันตามนโยบาย SLA ภายใน 2 วันทำการ`;
    }
  }
}

window.focusSlaTrackerSection = function(filterType) {
  const trackerEl = document.getElementById("homeLeaveSlaTrackerContainer") || document.getElementById("slaTrackerComponent");
  if (trackerEl) {
    trackerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // ถ้ามีฟิลเตอร์ใน Tracker ให้กดเลือกฟิลเตอร์นั้นให้อัตโนมัติ
    if (filterType && filterType !== 'all') {
      const filterBtn = document.querySelector(`.sla-filter-btn[data-filter="${filterType}"]`);
      if (filterBtn) filterBtn.click();
    }
  } else {
    window.location.href = "/pages/hr/hr.html";
  }
}

function renderCounters(pending, todayLeaves, employees, tomorrowLeaves) {
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setEl("statPendingLeaves", pending);
  setEl("statTodayLeaves", todayLeaves);
  setEl("statTotalEmployees", employees);
  setEl("statTomorrowLeaves", tomorrowLeaves);

  // คำนวณและอัปเดตระบบ SLA Badge ทั้งหมด
  const slaStats = computeSlaStats(rawRequests);
  updateSlaBadges(slaStats);
}

function renderTodayLeavesDetail(leaves) {
  const container = document.getElementById("todayLeavesDetailList");
  if (!container) return;

  if (leaves.length === 0) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: #94a3b8; width: 100%;">วันนี้ไม่มีพนักงานลางาน ✨</div>`;
    return;
  }

  container.innerHTML = leaves.map(r => {
    const emp = r.employees || {};
    const type = r.leave_types?.leave_name || "ไม่ระบุประเภท";
    const dept = (emp.departments?.department_name) || "-";
    const img = emp.image_url || "/assets/img/default-avatar.jpg";
    
    return `
      <div class="today-leave-card-detail">
        <img src="${img}" class="emp-avatar" onerror="this.src='/assets/img/default-avatar.jpg'">
        <div class="info">
          <div class="name">${escapeHtmlText(emp.full_name || "ไม่ระบุชื่อ")}</div>
          <div class="dept">${escapeHtmlText(dept)}</div>
          <div class="type-badge">${escapeHtmlText(type)}</div>
        </div>
      </div>
    `;
  }).join("");
}

/* ==========================================================================
   👥 6.5 DEPARTMENT TEAM ROSTER FOR LEADERS (3-4 COLUMNS COMPACT LAYOUT)
   ========================================================================== */
let homeTeamFullList = [];
let homeTeamCurrentRoleFilter = 'all';
let homeTeamSearchKeyword = '';
let homeTeamIsExpandedHeight = false;

function renderHomeDepartmentTeam(employeesList, sessionUser) {
  const container = document.getElementById("homeTeamMembersGrid");
  const titleEl = document.getElementById("homeTeamSectionTitle");
  const subtitleEl = document.getElementById("homeTeamSectionSubtitle");
  const badgeEl = document.getElementById("homeTeamCountBadge");
  const sectionEl = document.getElementById("homeDepartmentTeamSection");

  if (!container) return;

  const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
  const userObj = sessionUser || (savedSession ? JSON.parse(savedSession) : {});
  const userRole = String(userObj.role || 'user').toLowerCase();

  // ซ่อนรายชื่อพนักงานในแผนกเฉพาะ HR เท่านั้นตามความต้องการของลูกค้า
  const isHr = userRole === 'hr' || userRole.includes('hr');
  if (isHr) {
    if (sectionEl) {
      sectionEl.style.setProperty("display", "none", "important");
    }
    return;
  } else {
    if (sectionEl) {
      sectionEl.style.setProperty("display", "block", "important");
    }
  }
  
  let deptId = userObj.department_id;
  let deptName = userObj.department_name || userObj.departments?.department_name;

  if (!deptId && Array.isArray(employeesList)) {
    const me = employeesList.find(e => String(e.id) === String(userObj.id));
    if (me) {
      deptId = me.department_id;
      deptName = me.departments?.department_name || me.department_name;
    }
  }

  const isLeaderOrManager = ['leader', 'manager', 'supervisor', 'head'].includes(userRole);
  const isHrOrAdmin = ['hr', 'admin', 'director', 'executive', 'owner'].includes(userRole);

  let filteredList = Array.isArray(employeesList) ? [...employeesList] : [];

  // ถ้าเป็น Leader หรือ Manager ให้แสดงเฉพาะสมาชิกในแผนกของเขา
  if (isLeaderOrManager && deptId) {
    filteredList = filteredList.filter(e => String(e.department_id) === String(deptId));
  }

  if (filteredList.length > 0 && !deptName) {
    deptName = filteredList[0]?.departments?.department_name || filteredList[0]?.department_name || "แผนกของคุณ";
  }

  if (titleEl) {
    if (isLeaderOrManager) {
      titleEl.textContent = `สมาชิกพนักงานในแผนก (${deptName || 'แผนกของคุณ'})`;
    } else if (isHrOrAdmin) {
      titleEl.textContent = `สมาชิกพนักงานในองค์กร (${deptName ? deptName : 'ทั้งหมด'})`;
    } else {
      titleEl.textContent = `เพื่อนร่วมงานในแผนก (${deptName || 'แผนกของคุณ'})`;
    }
  }

  if (subtitleEl) {
    if (isLeaderOrManager) {
      subtitleEl.textContent = `ข้อมูลสมาชิกและตำแหน่งงานในสังกัดแผนก ${deptName || 'ของคุณ'}`;
    } else {
      subtitleEl.textContent = `ข้อมูลสมาชิกและตำแหน่งงานสังกัดแผนก ${deptName || 'บริษัท'}`;
    }
  }

  if (badgeEl) {
    badgeEl.textContent = `${filteredList.length} คน`;
  }

  // บันทึกรายการทั้งหมดสำหรับค้นหา/กรอง
  homeTeamFullList = filteredList;
  updateHomeTeamFilterCounts(filteredList);
  applyHomeTeamRender();
}

function updateHomeTeamFilterCounts(list) {
  const allCount = list.length;
  let leaderCount = 0;
  let staffCount = 0;

  list.forEach(emp => {
    const r = String(emp.role || '').toLowerCase();
    if (['leader', 'manager', 'supervisor', 'head', 'director', 'executive', 'owner'].some(x => r.includes(x))) {
      leaderCount++;
    } else {
      staffCount++;
    }
  });

  const chipAll = document.getElementById("chipCountAll");
  const chipLeader = document.getElementById("chipCountLeader");
  const chipStaff = document.getElementById("chipCountStaff");

  if (chipAll) chipAll.textContent = allCount;
  if (chipLeader) chipLeader.textContent = leaderCount;
  if (chipStaff) chipStaff.textContent = staffCount;
}

function applyHomeTeamRender() {
  const container = document.getElementById("homeTeamMembersGrid");
  const showingInfo = document.getElementById("homeTeamShowingInfo");
  if (!container) return;

  let displayList = [...homeTeamFullList];

  // กรองตามบทบาท
  if (homeTeamCurrentRoleFilter === 'leader') {
    displayList = displayList.filter(emp => {
      const r = String(emp.role || '').toLowerCase();
      return ['leader', 'manager', 'supervisor', 'head', 'director', 'executive', 'owner'].some(x => r.includes(x));
    });
  } else if (homeTeamCurrentRoleFilter === 'staff') {
    displayList = displayList.filter(emp => {
      const r = String(emp.role || '').toLowerCase();
      return !['leader', 'manager', 'supervisor', 'head', 'director', 'executive', 'owner'].some(x => r.includes(x));
    });
  }

  // ค้นหาข้อความ
  if (homeTeamSearchKeyword) {
    const kw = homeTeamSearchKeyword.toLowerCase();
    displayList = displayList.filter(emp => {
      const name = `${emp.first_name || ''} ${emp.last_name || ''} ${emp.full_name || ''} ${emp.nickname || ''}`.toLowerCase();
      const code = String(emp.employee_code || '').toLowerCase();
      const pos = String(emp.positions?.position_name || emp.position_name || '').toLowerCase();
      return name.includes(kw) || code.includes(kw) || pos.includes(kw);
    });
  }

  if (showingInfo) {
    showingInfo.textContent = `กำลังแสดง ${displayList.length} จากทั้งหมด ${homeTeamFullList.length} คน`;
  }

  if (displayList.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--text-soft); font-size: 12.5px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
        <span class="material-symbols-outlined" style="font-size: 28px; color: #94a3b8; display: block; margin-bottom: 4px;">person_search</span>
        ไม่พบรายชื่อพนักงานที่ตรงกับเงื่อนไขการค้นหา
      </div>`;
    return;
  }

  // 🗂️ GRID 3-4 COLUMNS (จัดเรียง 3-4 แถว/คอลัมน์ให้อ่านง่าย สวยงาม เลื่อนน้อยที่สุด)
  container.className = "team-grid-4col";

  container.innerHTML = displayList.map(emp => {
    const avatar = (window.pvtSupabase?.getAvatarUrl ? window.pvtSupabase.getAvatarUrl(emp.image_url) : emp.image_url) || "/assets/img/default-avatar.jpg";
    const pos = emp.positions?.position_name || emp.position_name || "พนักงาน";
    const empCode = emp.employee_code ? `${emp.employee_code}` : "-";
    const nickStr = emp.nickname ? `(${emp.nickname})` : "";
    const roleStr = String(emp.role || "").toLowerCase();
    const fullName = emp.full_name || (emp.first_name ? `${emp.first_name} ${emp.last_name || ''}` : 'พนักงาน');

    let roleBadge = '<span style="font-size: 11px; background: #f1f5f9; color: #475569; padding: 2px 7px; border-radius: 6px; font-weight: 600;">👤 พนักงาน</span>';
    if (roleStr === "leader" || roleStr.includes("leader")) {
      roleBadge = '<span style="font-size: 11px; background: #fef3c7; color: #b45309; padding: 2px 7px; border-radius: 6px; font-weight: 700;">👑 หัวหน้า</span>';
    } else if (roleStr === "manager" || roleStr.includes("manager")) {
      roleBadge = '<span style="font-size: 11px; background: #dbeafe; color: #1d4ed8; padding: 2px 7px; border-radius: 6px; font-weight: 700;">💼 ผจก.</span>';
    } else if (["hr", "admin", "superadmin"].includes(roleStr)) {
      roleBadge = '<span style="font-size: 11px; background: #f3e8ff; color: #6b21a8; padding: 2px 7px; border-radius: 6px; font-weight: 700;">⚙️ ฝ่ายบุคคล</span>';
    } else if (["director", "executive", "owner"].includes(roleStr)) {
      roleBadge = '<span style="font-size: 11px; background: #ecfdf5; color: #047857; padding: 2px 7px; border-radius: 6px; font-weight: 700;">🏛️ ผู้บริหาร</span>';
    }

    const lineIndicator = emp.line_id 
      ? '<span title="เชื่อมต่อ LINE แล้ว" style="font-size: 11.5px; color: #16a34a; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width:6px;height:6px;border-radius:50%;background:#16a34a;display:inline-block;"></span> LINE</span>'
      : '<span title="ยังไม่ผูก LINE" style="font-size: 11.5px; color: #94a3b8; display: inline-flex; align-items: center; gap: 4px;"><span style="width:6px;height:6px;border-radius:50%;background:#cbd5e1;display:inline-block;"></span> ไม่ผูก</span>';

    return `
      <div class="team-member-card">
        <img src="${avatar}" class="team-member-avatar" onerror="this.src='/assets/img/default-avatar.jpg';">
        <div style="flex: 1; min-width: 0; overflow: hidden;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 2px;">
            <span style="font-weight: 700; font-size: 14px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtmlText(fullName)}">
              ${escapeHtmlText(fullName)} ${nickStr}
            </span>
            <span style="font-size: 12px; color: #64748b; font-weight: 600; flex-shrink: 0;">#${escapeHtmlText(empCode)}</span>
          </div>
          <div style="font-size: 12.5px; color: #0284c7; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${escapeHtmlText(pos)}
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
            ${roleBadge}
            ${lineIndicator}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// 🔍 ควบคุมการค้นหาชื่อ/รหัส
window.handleHomeTeamSearch = function(keyword) {
  homeTeamSearchKeyword = (keyword || '').trim();
  applyHomeTeamRender();
};

// 🏷️ ควบคุมการกรองตาม Role
window.filterHomeTeamByRole = function(role, btn) {
  homeTeamCurrentRoleFilter = role;
  const chips = document.querySelectorAll("#homeTeamRoleFilters .team-filter-chip");
  chips.forEach(c => {
    c.classList.remove("active");
    c.style.background = "";
    c.style.color = "";
    c.style.borderColor = "";
  });
  if (btn) {
    btn.classList.add("active");
  }
  applyHomeTeamRender();
};

// ↕️ ขยาย / ยุบความสูง Scroll Container
window.toggleHomeTeamScrollHeight = function() {
  const scrollArea = document.getElementById("homeTeamScrollContainer");
  const txt = document.getElementById("txtToggleTeamHeight");
  const ico = document.getElementById("icoToggleTeamHeight");
  if (!scrollArea) return;

  homeTeamIsExpandedHeight = !homeTeamIsExpandedHeight;
  if (homeTeamIsExpandedHeight) {
    scrollArea.classList.add("expanded");
    scrollArea.style.maxHeight = "none";
    if (txt) txt.textContent = "ย่อความสูง (ประหยัดพื้นที่)";
    if (ico) ico.textContent = "unfold_less";
  } else {
    scrollArea.classList.remove("expanded");
    scrollArea.style.maxHeight = "380px";
    if (txt) txt.textContent = "ขยายดูทั้งหมด";
    if (ico) ico.textContent = "unfold_more";
  }
};

// 🔼 ซ่อน / แสดงแผงสมาชิกทั้งหมด
window.toggleHomeTeamContainer = function(btn) {
  const body = document.getElementById("homeTeamBodyWrapper");
  const icon = document.getElementById("homeTeamToggleIcon");
  if (!body) return;
  const isHidden = body.classList.toggle("collapsed");
  if (icon) {
    icon.textContent = isHidden ? "expand_more" : "expand_less";
  }
};

function setupTableSearch() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const keyword = e.target.value.toLowerCase();
    const trs = document.querySelectorAll("#tableBody tr");
    
    trs.forEach(tr => {
      if (tr.cells.length === 1) return; 
      const text = tr.innerText.toLowerCase();
      tr.style.display = text.includes(keyword) ? "" : "none";
    });
  });
}

/* ==========================================================================
   7. 💳 DIGITAL EMPLOYEE CARD MANAGER & BATCH PRINT SYSTEM (FUTURE-PROOFED)
   ========================================================================== */

// 🟢 7.0 CONFIG & HELPER CENTRAL FOR QR CODE & ROUTING
const PVT_CARD_CONFIG = {
  // หากพัฒนาบน localhost จะสลับไปใช้ Domain จริงให้อัตโนมัติ เพื่อให้โทรศัพท์สแกนได้
  PRODUCTION_DOMAIN: "https://dev-workforcehub-2026.pages.dev",
  // ระบุไฟล์ปลายทางให้ชัดเจนเพื่อป้องกันปัญหา Blank Page (หน้าขาว)
  ENTRY_PAGE_PATH: "/index.html", 
  QR_SIZE: "180x180"
};

/**
 * ดึง Base URL ของระบบอย่างปลอดภัย
 */
function getSystemBaseUrl() {
  const currentOrigin = window.location.origin;
  if (!currentOrigin || currentOrigin.includes("localhost") || currentOrigin.includes("127.0.0.1") || currentOrigin.includes("file://")) {
    return PVT_CARD_CONFIG.PRODUCTION_DOMAIN;
  }
  return currentOrigin;
}

/**
 * ฟังก์ชันกลางสำหรับสร้าง URL ปลายทาง และ URL รูปภาพ QR Code
 */
function generateEmployeeQrUrl(empCode) {
  if (!empCode) return "";
  
  const cleanCode = String(empCode).trim();
  const baseUrl = getSystemBaseUrl();
  
  try {
    const targetUrl = new URL(PVT_CARD_CONFIG.ENTRY_PAGE_PATH, baseUrl);
    targetUrl.searchParams.set("auto_login", cleanCode);

    const encodedTarget = encodeURIComponent(targetUrl.toString());
    return `https://api.qrserver.com/v1/create-qr-code/?size=${PVT_CARD_CONFIG.QR_SIZE}&data=${encodedTarget}`;
  } catch (err) {
    console.error("❌ Error generating QR URL:", err);
    const fallbackTarget = `${baseUrl}${PVT_CARD_CONFIG.ENTRY_PAGE_PATH}?auto_login=${encodeURIComponent(cleanCode)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=${PVT_CARD_CONFIG.QR_SIZE}&data=${encodeURIComponent(fallbackTarget)}`;
  }
}

// ตัวแปร Cache เก็บรายชื่อพนักงาน
let cachedEmployeeList = null;

// 🟢 7.1 ฟังก์ชันเปิด Popup เลือกพนักงาน (Batch Print & Card Selection)
window.openEmployeeCardManagerPopup = async function (forceRefresh = false) {
  if (typeof Swal === "undefined") {
    alert("⚠️ ไม่พบลายบรารี SweetAlert2");
    return;
  }

  if (!cachedEmployeeList || forceRefresh) {
    Swal.fire({
      title: 'กำลังโหลดบัญชีรายชื่อ...',
      html: '<div style="padding:20px; font-size:14px; color:#0fa472;">⌛ กรุณารอสักครู่กำลังดึงข้อมูล...</div>',
      showConfirmButton: false,
      allowOutsideClick: false
    });

    const client = window.sb || window.pvtSupabase?.getClient();
    if (!client) {
      Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้', 'error');
      return;
    }

    try {
      const { data: employees, error } = await client
        .from('employees')
        .select(`
          id,
          employee_code,
          full_name,
          department_id,
          image_url,
          departments!department_id ( department_name ),
          positions ( position_name )
        `)
        .order('employee_code', { ascending: true });

      if (error) throw error;
      cachedEmployeeList = employees || [];
    } catch (err) {
      console.error("Error loading employees for cards:", err);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงรายชื่อพนักงานได้', 'error');
      return;
    }
  }

  // Filter by user's department to only see their own department (meaning employees in the department)
  const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
  let sessionUser = {};
  try {
    sessionUser = savedSession ? JSON.parse(savedSession) : {};
  } catch (e) {}
  const myProfile = window.currentUserProfile || sessionUser || {};
  const myDeptId = myProfile?.department_id || myProfile?.employees?.department_id;
  const myRole = (myProfile?.role || "").toLowerCase();

  let displayEmployees = cachedEmployeeList || [];
  if (myDeptId && myRole !== 'admin' && myRole !== 'hr') {
    displayEmployees = displayEmployees.filter(emp => String(emp.department_id) === String(myDeptId));
  }

  let rowsHtml = "";
  if (displayEmployees.length === 0) {
    rowsHtml = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#64748b;">ไม่พบข้อมูลพนักงานในระบบ</td></tr>`;
  } else {
    displayEmployees.forEach(emp => {
      const empRole = emp.positions?.position_name || 'พนักงาน';
      const empDept = emp.departments?.department_name || 'ไม่ระบุแผนก';
      const empName = emp.full_name || 'ไม่ระบุชื่อ';
      const empCode = emp.employee_code || '';
      const fullAvatarUrl = window.pvtSupabase?.getAvatarUrl ? window.pvtSupabase.getAvatarUrl(emp.image_url) : (emp.image_url || '');

      rowsHtml += `
        <div class="emp-card-selection-item" style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #e2e8f0; gap: 12px;">
          <div style="flex-shrink: 0;">
            <input type="checkbox" class="emp-card-checkbox" 
                   data-code="${empCode}" 
                   data-name="${escapeHtmlAttribute(empName)}" 
                   data-role="${escapeHtmlAttribute(empRole)}" 
                   data-dept="${escapeHtmlAttribute(empDept)}"
                   style="cursor: pointer; width: 20px; height: 20px;" />
          </div>
          <div style="flex-shrink: 0;">
            <img src="${fullAvatarUrl || '/assets/img/default-avatar.jpg'}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 1px solid #e2e8f0;" onerror="this.src='/assets/img/default-avatar.jpg';">
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; color: #1e293b; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtmlText(empName)}</div>
            <div style="color: #64748b; font-size: 12px; margin-top: 2px;">#${empCode} · ${escapeHtmlText(empDept)}</div>
          </div>
          <div style="flex-shrink: 0;">
            <button class="btn-view-card" 
                    data-code="${empCode}" 
                    data-name="${escapeHtmlAttribute(empName)}" 
                    data-role="${escapeHtmlAttribute(empRole)}" 
                    data-dept="${escapeHtmlAttribute(empDept)}"
                    data-avatar="${escapeHtmlAttribute(fullAvatarUrl)}"
              style="background: #3b82f6; color: white; border: none; padding: 8px 12px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size:18px;">visibility</span>
            </button>
          </div>
        </div>
      `;
    });
  }

  Swal.fire({
    title: '👥 เลือกพนักงานเพื่อพิมพ์บัตรประจำตัว',
    width: '600px',
    html: `
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px;">
        <div style="display: flex; gap: 8px;">
          <input type="text" id="cardSearchInput" placeholder="🔍 ค้นหารหัส, ชื่อ-สกุล, ตำแหน่ง..." 
            style="flex: 1; padding: 12px 14px; font-size: 15px; border: 1px solid #cbd5e1; border-radius: 12px; outline: none; font-family: inherit;" />
        </div>
        
        <div style="display: flex; align-items: center; justify-content: space-between; background: #f8fafc; padding: 10px 14px; border-radius: 10px; border: 1px solid #e2e8f0;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; font-weight: 600; color: #475569;">
            <input type="checkbox" id="selectAllCardsCheckbox" onchange="toggleSelectAllCards(this)" style="cursor: pointer; width: 18px; height: 18px;" />
            เลือกทั้งหมด
          </label>
          <button id="btnPrintSelectedCards" onclick="handlePrintSelectedCardsFromPopup()" disabled
            style="background: #10b981; color: white; border: none; padding: 10px 16px; border-radius: 10px; font-weight: 700; cursor: not-allowed; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; opacity: 0.5; transition: all 0.2s;">
            <span class="material-symbols-outlined" style="font-size:20px;">print</span> 
            พิมพ์ (<span id="selectedCardCount">0</span>)
          </button>
        </div>
      </div>
      
      <div id="employeeCardTableBody" style="max-height: 450px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; text-align: left;">
        ${rowsHtml}
      </div>
      <div id="noMatchCardMessage" style="display: none; padding: 24px; text-align: center; color: #64748b; font-size: 14px;">
        ❌ ไม่พบข้อมูลพนักงานที่ตรงกับคำค้นหา
      </div>
    `,
    confirmButtonText: 'ปิดหน้าต่าง',
    confirmButtonColor: '#64748b',
    didOpen: () => {
      const searchInput = document.getElementById("cardSearchInput");
      const container = document.getElementById("employeeCardTableBody");
      const noMatchMsg = document.getElementById("noMatchCardMessage");

      container.addEventListener('change', (e) => {
        if (e.target.classList.contains('emp-card-checkbox')) {
          updateCardSelectionCount();
        }
      });

      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-view-card');
        if (btn) {
          const { code, name, role, dept, avatar } = btn.dataset;
          showIndividualIdCard(code, name, role, dept, avatar);
        }
      });

      if (searchInput && container) {
        searchInput.focus();
        searchInput.addEventListener("input", (e) => {
          const keyword = e.target.value.trim().toLowerCase();
          const items = container.querySelectorAll(".emp-card-selection-item");
          let visibleCount = 0;

          items.forEach(item => {
            const text = item.innerText.toLowerCase();
            if (text.includes(keyword)) {
              item.style.display = "flex";
              visibleCount++;
            } else {
              item.style.display = "none";
            }
          });

          if (noMatchMsg) {
            noMatchMsg.style.display = (visibleCount === 0 && items.length > 0) ? "block" : "none";
          }
        });
      }
    }
  });
};

// 🟢 7.2 ฟังก์ชัน Helper เลือก Checkbox
window.toggleSelectAllCards = function (masterCb) {
  const checkboxes = document.querySelectorAll('.emp-card-checkbox');
  checkboxes.forEach(cb => {
    const row = cb.closest('.emp-card-selection-item');
    if (row && row.style.display !== 'none') {
      cb.checked = masterCb.checked;
    }
  });
  updateCardSelectionCount();
};

window.updateCardSelectionCount = function () {
  const checkedBoxes = document.querySelectorAll('.emp-card-checkbox:checked');
  const countEl = document.getElementById('selectedCardCount');
  const btnPrint = document.getElementById('btnPrintSelectedCards');

  const count = checkedBoxes.length;
  if (countEl) countEl.textContent = count;

  if (btnPrint) {
    if (count > 0) {
      btnPrint.disabled = false;
      btnPrint.style.opacity = '1';
      btnPrint.style.cursor = 'pointer';
    } else {
      btnPrint.disabled = true;
      btnPrint.style.opacity = '0.5';
      btnPrint.style.cursor = 'not-allowed';
    }
  }
};

window.handlePrintSelectedCardsFromPopup = function () {
  const checkedBoxes = document.querySelectorAll('.emp-card-checkbox:checked');
  if (checkedBoxes.length === 0) return;

  const selectedEmployees = Array.from(checkedBoxes).map(cb => ({
    empCode: cb.dataset.code,
    empName: cb.dataset.name,
    empRole: cb.dataset.role,
    empDept: cb.dataset.dept
  }));

  printMultipleCards(selectedEmployees);
};

// 🟢 7.3 ฟังก์ชันแสดงพรีวิวบัตรใบเดียว (Single Card Modal)
window.showIndividualIdCard = function (empCode, empName, empRole, empDept, avatarUrl) {
  // เรียกใช้ Centralized QR URL Generator
  const qrUrl = generateEmployeeQrUrl(empCode);
  const imgUrl = avatarUrl || '/assets/img/default-avatar.jpg';
  
  Swal.fire({
    title: '💳 ตัวอย่างบัตรพนักงานดิจิทัล',
    width: '420px',
    html: `
      <div id="pvt-id-card" style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); width: 320px; margin: 15px auto; border-radius: 20px; padding: 24px; color: white; box-shadow: 0 15px 30px rgba(30,58,138,0.3); text-align: center; border: 1px solid rgba(255,255,255,0.1);">
        <div style="font-weight: 700; font-size: 14px; letter-spacing: 1.5px; color: #38bdf8; margin-bottom: 16px;">PVT WORKFORCE HUB</div>
        <div style="width: 80px; height: 80px; margin: 0 auto 14px auto; border-radius: 50%; border: 3px solid #38bdf8; overflow: hidden; background: #1e293b;">
          <img src="${imgUrl}" onerror="this.src='/assets/img/default-avatar.jpg';" style="width: 100%; height: 100%; object-fit: cover;" alt="Employee Photo" />
        </div>
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 6px;">${escapeHtmlText(empName)}</div>
        <div style="font-size: 13px; color: #38bdf8; font-weight: 600; margin-bottom: 2px;">ตำแหน่ง: ${escapeHtmlText(empRole)}</div>
        <div style="font-size: 12px; color: #94a3b8; font-weight: 500; margin-bottom: 16px;">แผนก: ${escapeHtmlText(empDept)}</div>
        <div style="background: white; padding: 10px; border-radius: 14px; display: inline-block; margin-bottom: 16px;">
          <img src="${qrUrl}" alt="Employee QR Code" style="width: 130px; height: 130px; display: block;" 
               onerror="this.onerror=null; this.src='https://via.placeholder.com/130?text=QR+Error';" />
        </div>
        <div>
          <span style="font-size: 11px; color: #94a3b8; display: block; text-transform: uppercase;">Employee ID</span>
          <span style="font-size: 16px; font-weight: 700; background: rgba(255,255,255,0.1); padding: 4px 16px; border-radius: 30px; display: inline-block;">
            ${escapeHtmlText(empCode)}
          </span>
        </div>
      </div>
    `,
    showCancelButton: true,
    cancelButtonText: '🔙 ย้อนกลับ',
    confirmButtonText: '🖨️ สั่งพิมพ์บัตร',
    confirmButtonColor: '#10b981',
    cancelButtonColor: '#64748b',
  }).then((result) => {
    if (result.dismiss === Swal.DismissReason.cancel) {
      openEmployeeCardManagerPopup();
    } else if (result.isConfirmed) {
      printSingleCard(empCode, empName, empRole, empDept, imgUrl);
    }
  });
};

// 🟢 7.4 ฟังก์ชันพิมพ์บัตรแบบใบเดียว (Single Print)
window.printSingleCard = function (empCode, empName, position, department, pictureUrl) {
  let employee = {};
  
  if (typeof empCode === 'object' && empCode !== null) {
    employee = {
      code: empCode.employee_code || empCode.empCode || empCode.id || '',
      name: empCode.name || empCode.empName || empCode.full_name || '-',
      position: empCode.position || empCode.empRole || '-',
      department: empCode.department || empCode.empDept || '-',
      avatar: empCode.image_url || empCode.avatarUrl || '/assets/img/default-avatar.jpg',
      qr_url: empCode.qr_url || generateEmployeeQrUrl(empCode.employee_code || empCode.empCode)
    };
  } else {
    employee = {
      code: empCode || '',
      name: empName || '-',
      position: position || '-',
      department: department || '-',
      avatar: pictureUrl || '/assets/img/default-avatar.jpg',
      qr_url: (pictureUrl && pictureUrl.includes('qrserver.com')) ? pictureUrl : generateEmployeeQrUrl(empCode)
    };
  }

  const printWindow = window.open('', '_blank', 'width=500,height=600');
  if (!printWindow) {
    alert('⚠️ เบราว์เซอร์ระงับการเปิด Pop-up! กรุณากด "อนุญาตให้เปิด Pop-up" ที่แถบ URL ด้านบน');
    return;
  }

  const cardHtml = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>พิมพ์บัตรพนักงาน - ${escapeHtmlText(employee.name)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        @page { size: 85.6mm 53.98mm; margin: 0; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: 'Sarabun', sans-serif; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f1f5f9; }
        .card {
          position: relative; width: 85.6mm; height: 53.98mm; border-radius: 8px; padding: 8px 12px;
          background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: white;
          display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .card-header { font-size: 10px; font-weight: 700; color: #38bdf8; text-align: center; letter-spacing: 1px; }
        .card-body { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
        .avatar-box { width: 44px; height: 44px; border-radius: 50%; overflow: hidden; border: 2px solid #38bdf8; flex-shrink: 0; background: #1e293b; }
        .avatar-box img { width: 100%; height: 100%; object-fit: cover; }
        .details { flex: 1; font-size: 9px; line-height: 1.3; }
        .name { font-weight: 700; font-size: 11px; color: #fff; margin-bottom: 2px; }
        .meta { color: #94a3b8; font-size: 9px; }
        .role { color: #38bdf8; font-weight: 600; }
        .qr-box { background: white; padding: 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
        .qr-box img { width: 50px; height: 50px; display: block; }
        .card-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px; }
        .emp-id { font-size: 10px; font-weight: 700; background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 10px; }
        @media print { body { background: transparent; } .card { border: none; box-shadow: none; } }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="card-header">PVT WORKFORCE HUB</div>
        <div class="card-body">
          <div class="avatar-box">
            <img src="${employee.avatar}" onerror="this.src='/assets/img/default-avatar.jpg';" alt="Avatar" />
          </div>
          <div class="details">
            <div class="name">${escapeHtmlText(employee.name)}</div>
            <div class="meta role">ตำแหน่ง: ${escapeHtmlText(employee.position)}</div>
            <div class="meta">แผนก: ${escapeHtmlText(employee.department)}</div>
          </div>
          <div class="qr-box">
            <img id="singleQrImg" src="${employee.qr_url}" alt="QR Code" />
          </div>
        </div>
        <div class="card-footer">
          <span style="font-size: 8px; color: #94a3b8;">EMPLOYEE ID</span>
          <span class="emp-id">${escapeHtmlText(employee.code)}</span>
        </div>
      </div>
      <script>
        const img = document.getElementById('singleQrImg');
        let printed = false;
        function triggerPrint() {
          if (printed) return;
          printed = true;
          setTimeout(() => {
            window.print();
            setTimeout(() => { window.close(); }, 500);
          }, 300);
        }
        
        if (img.complete) { triggerPrint(); } 
        else { img.onload = triggerPrint; img.onerror = triggerPrint; }
        
        // Timeout สำรอง กันหน้าพิมพ์ค้าง
        setTimeout(triggerPrint, 1500);
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(cardHtml);
  printWindow.document.close();
};

// 🟢 7.5 ฟังก์ชันพิมพ์บัตรแบบชุดหลายใบ (Batch Print Multiple Cards)
window.printMultipleCards = function (selectedList = []) {
  if (!Array.isArray(selectedList) || selectedList.length === 0) {
    alert("⚠️ กรุณาเลือกพนักงานที่ต้องการพิมพ์บัตร");
    return;
  }

  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (!printWindow) {
    alert('⚠️ เบราว์เซอร์ระงับการเปิด Pop-up! กรุณากด "อนุญาตให้เปิด Pop-up" ที่แถบ URL ด้านบน');
    return;
  }

  let cardsHtml = selectedList.map(item => {
    const empCode = item.empCode || item.employee_code || '';
    const qrUrl = generateEmployeeQrUrl(empCode);

    return `
      <div class="card">
        <div class="lanyard-hole"></div>
        <div class="company">PVT WORKFORCE HUB</div>
        <div class="profile-section">
          <div class="name">${escapeHtmlText(item.empName)}</div>
          <div class="badge-container">
            <span class="role-badge">${escapeHtmlText(item.empRole)}</span>
            <span class="dept-text">แผนก: ${escapeHtmlText(item.empDept)}</span>
          </div>
        </div>
        <div class="qr-box"><img class="batch-qr-img" src="${qrUrl}" alt="QR Code" /></div>
        <div class="footer-section"><div class="id-tag">${escapeHtmlText(empCode)}</div></div>
      </div>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="th">
      <head>
        <meta charset="UTF-8">
        <title>Batch Print ID Cards (${selectedList.length} รายการ)</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { font-family: 'Sarabun', sans-serif; background: #f1f5f9; padding: 20px; margin: 0; }
          .card-grid { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
          .card { 
            position: relative; background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%); 
            width: 240px; height: 380px; border-radius: 16px; padding: 18px 14px; color: white; 
            text-align: center; border: 1px solid rgba(255, 255, 255, 0.1); display: flex; flex-direction: column;
            justify-content: space-between; align-items: center; overflow: hidden; page-break-inside: avoid;
          }
          .card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 5px; background: linear-gradient(90deg, #06b6d4, #3b82f6, #6366f1); }
          .lanyard-hole { width: 32px; height: 6px; background: #020617; border-radius: 10px; margin-bottom: 6px; border: 1px solid rgba(255, 255, 255, 0.15); }
          .company { font-weight: 700; font-size: 10px; letter-spacing: 2px; color: #38bdf8; text-transform: uppercase; margin-bottom: 6px; }
          .profile-section { margin-bottom: 4px; width: 100%; }
          .name { font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 4px; line-height: 1.2; word-break: break-word; }
          .badge-container { display: flex; flex-direction: column; gap: 3px; align-items: center; justify-content: center; }
          .role-badge { font-size: 10px; color: #38bdf8; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25); padding: 2px 8px; border-radius: 12px; font-weight: 500; }
          .dept-text { font-size: 10px; color: #94a3b8; font-weight: 400; }
          .qr-box { background: #ffffff; padding: 6px; border-radius: 10px; display: inline-block; border: 2px solid #38bdf8; }
          .qr-box img { width: 110px; height: 110px; display: block; }
          .footer-section { width: 100%; }
          .id-tag { font-size: 13px; font-weight: 700; letter-spacing: 1.5px; color: #f8fafc; background: rgba(255, 255, 255, 0.08); padding: 4px 14px; border-radius: 20px; display: inline-block; border: 1px solid rgba(255,255,255,0.15); font-family: monospace, 'Sarabun'; }
          @media print { body { background: transparent; padding: 0; } .card-grid { gap: 15px; } }
        </style>
      </head>
      <body>
        <div class="card-grid">${cardsHtml}</div>
        <script>
          const images = document.querySelectorAll('.batch-qr-img');
          let loadedCount = 0;
          let printed = false;

          function triggerPrint() {
            if (printed) return;
            printed = true;
            setTimeout(() => {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            }, 400);
          }

          function checkAllLoaded() {
            loadedCount++;
            if (loadedCount >= images.length) {
              triggerPrint();
            }
          }

          if (images.length === 0) {
            triggerPrint();
          } else {
            images.forEach(img => {
              if (img.complete) { checkAllLoaded(); } 
              else { img.onload = checkAllLoaded; img.onerror = checkAllLoaded; }
            });
          }

          // Timeout สำรองสูงสุด 2.5 วินาที สำหรับ Batch หลายใบ
          setTimeout(triggerPrint, 2500);
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();

  setTimeout(() => { openEmployeeCardManagerPopup(); }, 800);
};

// 🛠️ Helper Functions สำหรับ Escape ข้อความ ป้องกัน XSS และ Syntax Error
function escapeHtmlText(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttribute(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ==========================================================================
   8. 🔔 REAL NOTIFICATION SYSTEM WITH SUPABASE (FIXED & LOCAL STORAGE SYNC)
   ========================================================================== */

// Helper: ดึงและบันทึกรายชื่อ ID การแจ้งเตือนที่กดอ่านแล้วลง LocalStorage
function getReadNotifIds() {
  try {
    return JSON.parse(localStorage.getItem('pvt_read_notifs') || '[]');
  } catch (e) {
    return [];
  }
}

function addReadNotifId(id) {
  const readIds = getReadNotifIds();
  const strId = String(id);
  if (!readIds.includes(strId)) {
    readIds.push(strId);
    localStorage.setItem('pvt_read_notifs', JSON.stringify(readIds));
  }
}

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'เมื่อสักครู่นี้';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} นาทีที่แล้ว`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ชั่วโมงที่แล้ว`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} วันที่แล้ว`;
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function getNotifTheme(type) {
  switch (type) {
    case 'leave':
      return { icon: 'event_note', bgClass: 'bg-orange' };
    case 'payroll':
      return { icon: 'payments', bgClass: 'bg-green' };
    case 'employee':
      return { icon: 'badge', bgClass: 'bg-blue' };
    default:
      return { icon: 'notifications', bgClass: 'bg-purple' };
  }
}

let cachedAllNotifications = [];
let currentDropdownNotifFilter = 'all';

window.filterDropdownNotifs = function(filterType) {
  currentDropdownNotifFilter = filterType || 'all';

  // อัปเดต Active Tab UI
  const tabBtns = document.querySelectorAll('.notif-filter-tab');
  tabBtns.forEach(btn => {
    if (btn.getAttribute('data-filter') === currentDropdownNotifFilter) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  renderDropdownNotifsList();
};

function renderDropdownNotifsList() {
  const container = document.getElementById('notifListContainer');
  if (!container) return;

  // กรองแสดงผลเฉพาะรายการที่ยังไม่ได้อ่าน เพื่อเมื่อกดอ่านทั้งหมดแล้วจะเคลียร์รายการออกทันที
  const unreadNotifs = cachedAllNotifications.filter(item => !item.is_read);

  let filtered = unreadNotifs;
  if (currentDropdownNotifFilter === 'overdue') {
    filtered = unreadNotifs.filter(item => item.slaStatus === 'overdue');
  } else if (currentDropdownNotifFilter === 'urgent') {
    filtered = unreadNotifs.filter(item => item.slaStatus === 'urgent');
  }

  if (filtered.length === 0) {
    let emptyMsg = "🔕 ยังไม่มีการแจ้งเตือนใหม่";
    if (currentDropdownNotifFilter === 'overdue') emptyMsg = "✨ ยอดเยี่ยม! ไม่มีรายการใบลาที่เกินกำหนด 2 วัน";
    if (currentDropdownNotifFilter === 'urgent') emptyMsg = "✨ ไม่มีรายการใบลาที่ใกล้ครบกำหนดในขณะนี้";

    container.innerHTML = `
      <div style="padding: 32px 16px; text-align: center; color: var(--text-soft); font-size: 13px;">
        ${emptyMsg}
      </div>`;
    return;
  }

  let html = '';
  filtered.slice(0, 15).forEach(item => {
    const theme = getNotifTheme(item.type);
    const timeText = formatTimeAgo(item.created_at);
    const isUnread = !item.is_read;
    const formatted = formatCleanNotification(item.title, item.message);

    let slaItemClass = '';
    let slaBadgeHtml = '';
    let slaTimeHtml = '';

    if (item.slaStatus === 'overdue') {
      slaItemClass = 'notif-sla-overdue';
      slaBadgeHtml = `<span class="notif-sla-badge-tag overdue">🔴 เกิน 2 วัน</span>`;
      slaTimeHtml = `<span class="notif-sla-time-highlight overdue">⚠️ ${item.countdownText || 'เกิน SLA'}</span>`;
    } else if (item.slaStatus === 'urgent') {
      slaItemClass = 'notif-sla-urgent';
      slaBadgeHtml = `<span class="notif-sla-badge-tag urgent">🟠 ใกล้ครบ 2 วัน</span>`;
      slaTimeHtml = `<span class="notif-sla-time-highlight urgent">⏳ ${item.countdownText || 'ใกล้ครบ'}</span>`;
    }

    html += `
      <div class="notif-item ${isUnread ? 'unread' : 'read'} ${slaItemClass}" onclick="handleNotifClick('${item.id}', '${item.link}')" style="cursor: pointer; opacity: ${isUnread ? '1' : '0.88'}; padding: 12px 14px; display: flex; gap: 10px; align-items: flex-start; border-bottom: 1.5px solid #f1f5f9; transition: background 0.15s;">
        <div class="notif-icon ${theme.bgClass}" style="width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <span class="material-symbols-outlined" style="font-size: 22px;">${item.slaStatus === 'overdue' ? 'alarm_off' : item.slaStatus === 'urgent' ? 'hourglass_top' : theme.icon}</span>
        </div>
        <div class="notif-content" style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-bottom: 4px;">
            ${slaBadgeHtml}
            <span class="notif-item-title" style="font-size: 14px; font-weight: 750; color: #0f172a; line-height: 1.4;">${formatted.title}</span>
          </div>
          ${formatted.bodyHtml}
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px; flex-wrap: wrap; gap: 4px;">
            <span class="notif-time" style="font-size: 12px; color: #64748b; font-weight: 500;">🕒 ${timeText}</span>
            ${slaTimeHtml}
          </div>
        </div>
        ${isUnread ? '<span class="unread-dot" style="width: 8px; height: 8px; background: #0d9488; border-radius: 50%; flex-shrink: 0; margin-top: 4px; box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.25);"></span>' : ''}
      </div>
    `;
  });

  container.innerHTML = html;
}

// 🛠️ Helper function จัดแต่งข้อความแจ้งเตือนให้อ่านง่าย สะอาดตา และไม่ซ้ำซ้อน
function formatCleanNotification(title, rawMessage) {
  if (!rawMessage) return { title: title || '', bodyHtml: '' };
  
  let cleanTitle = String(title || '').trim();
  let msg = String(rawMessage).replace(/\*\*/g, '').trim();

  // ตัดบรรทัดแรกที่ซ้ำซ้อนกับ Title ออก
  const lines = msg.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const rawFirst = lines[0].replace(/^[❌✅📌🟢🎉📢⚠️\s]+/, '').trim();
    const rawTitle = cleanTitle.replace(/^[❌✅📌🟢🎉📢⚠️\s]+/, '').trim();
    if (rawFirst.includes(rawTitle) || rawTitle.includes(rawFirst) || rawFirst.startsWith("คำขอลา") || rawFirst.startsWith("ใบลาได้รับการอนุมัติ")) {
      lines.shift();
    }
  }

  if (lines.length === 0) {
    return {
      title: cleanTitle,
      bodyHtml: ''
    };
  }

  // แปลงแต่ละบรรทัดให้เป็น Tag ชัดเจนสวยงาม ขนาดกะทัดรัดและอ่านง่าย
  const formattedLines = lines.map(line => {
    if (line.includes('เหตุผลที่ไม่ผ่าน') || line.includes('เหตุผลที่ยกเลิก') || line.includes('⚠️')) {
      return `<div style="background: #fff1f2; color: #be123c; padding: 5px 10px; border-radius: 6px; border: 1px solid #fecdd3; font-weight: 700; font-size: 12.5px; margin-top: 3px; line-height: 1.4;">${line}</div>`;
    }
    if (line.includes('ความเห็นหัวหน้า') || line.includes('ความเห็นผู้จัดการ')) {
      return `<div style="background: #f0fdf4; color: #166534; padding: 5px 10px; border-radius: 6px; border: 1px solid #bbf7d0; font-size: 12.5px; font-weight: 600; margin-top: 3px; line-height: 1.4;">${line}</div>`;
    }
    if (line.startsWith('👉')) {
      return `<div style="color: #0d9488; font-weight: 700; font-size: 13px; margin-top: 3px;">${line}</div>`;
    }
    return `<div style="line-height: 1.5; font-size: 13px; color: #334155;">${line}</div>`;
  });

  return {
    title: cleanTitle,
    bodyHtml: `<div class="notif-parsed-list" style="display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #334155; margin-top: 4px;">${formattedLines.join('')}</div>`
  };
}

async function fetchRealNotifications() {
  const client = sb || window.pvtSupabase?.getClient();
  const container = document.getElementById('notifListContainer');
  const badge = document.getElementById('notifBadge');
  const unreadCountPill = document.getElementById('notifUnreadCount');

  if (!container) return;

  try {
    const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
    const sessionUser = savedSession ? JSON.parse(savedSession) : {};
    const myProfile = window.currentUserProfile || sessionUser;
    const myRole = (myProfile?.role || "").toLowerCase();
    const myDeptId = myProfile?.department_id || myProfile?.employees?.department_id;
    const myDeptName = myProfile?.department_name || myProfile?.departments?.department_name || myProfile?.departments?.id;

    let dbNotifications = [];

    // 1. ดึงข้อมูลการแจ้งเตือนจากตาราง notifications ใน Supabase
    if (client) {
      const myId = sessionUser?.id || myProfile?.id;
      const { data, error } = await client
        .from('notifications')
        .select('*')
        .eq('employee_id', myId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        dbNotifications = data;
      }
    }

    const readNotifIds = getReadNotifIds();

    // 2. แปลงรายการใบลาค้างอนุมัติ (rawRequests) เป็นรายการแจ้งเตือนตามบทบาท พร้อมคำนวณ SLA 2 วัน
    const SLA_HOURS = 48; // 2 วัน
    const SLA_MS = SLA_HOURS * 3600 * 1000;
    const now = Date.now();

    let pendingLeaves = rawRequests.filter(r => r && (r.status === "pending" || r.status === "รออนุมัติ" || r.status === "cancel_pending"));

    if (myRole === "leader" || myRole === "manager" || myRole === "director" || myRole === "executive" || myRole === "owner") {
      pendingLeaves = pendingLeaves.filter((req) => {
        const reqEmp = req.employees;
        if (!reqEmp) return false;

        const reqDeptId = reqEmp.department_id;
        const reqDeptName = reqEmp.departments?.department_name;
        const reqEmpId = req.employee_id;
        const reqEmpRole = String(reqEmp.role || 'user').toLowerCase();

        const isNotSelf = sessionUser.id ? String(reqEmpId) !== String(sessionUser.id) : true;
        
        let isSameDept = true;
        let isSubordinate = false;

        if (myRole === "leader") {
          isSameDept = (myDeptId || myDeptName) 
            ? (String(reqDeptId) === String(myDeptId) || String(reqDeptName).toLowerCase() === String(myDeptName).toLowerCase())
            : true;
          isSubordinate = !['leader', 'manager', 'director', 'executive', 'owner', 'hr', 'admin'].includes(reqEmpRole);
        } else if (myRole === "manager") {
          isSameDept = (myDeptId || myDeptName) 
            ? (String(reqDeptId) === String(myDeptId) || String(reqDeptName).toLowerCase() === String(myDeptName).toLowerCase())
            : true;
          isSubordinate = !['manager', 'director', 'executive', 'owner', 'hr', 'admin'].includes(reqEmpRole);
        } else {
          isSameDept = true;
          isSubordinate = !['owner'].includes(reqEmpRole);
        }

        return isSameDept && isNotSelf && isSubordinate;
      });
    } else if (myRole === "user") {
      pendingLeaves = [];
    }

    const pendingNotifications = pendingLeaves.map(item => {
      const emp = item.employees || {};
      const empName = emp.full_name || item.emp_name || 'พนักงาน';
      const empCode = emp.employee_code || '';
      const deptName = emp.departments?.department_name || '';
      const leaveType = item.leave_types?.leave_name || item.leave_type_name || 'ใบลา';
      const notifId = `pending-${item.id}`;

      // คำนวณ SLA รายการนี้
      const createdAt = item.created_at ? new Date(item.created_at).getTime() : now;
      const diffMs = Math.max(0, now - createdAt);
      const remainingMs = SLA_MS - diffMs;
      const remainingHours = remainingMs / (3600 * 1000);
      const isOverdue = diffMs >= SLA_MS;
      const isUrgent = !isOverdue && remainingHours <= 24;

      let slaStatus = 'normal';
      let countdownText = '';
      let title = `คำขอลาใหม่: ${empName}`;
      let message = `ยื่นขอ${leaveType} (${item.total_days || 1} วัน) แผนก ${deptName || '-'}`;

      if (isOverdue) {
        slaStatus = 'overdue';
        const overdueMs = Math.abs(remainingMs);
        const days = Math.floor(overdueMs / (86400 * 1000));
        const hours = Math.floor((overdueMs % (86400 * 1000)) / (3600 * 1000));
        const mins = Math.floor((overdueMs % (3600 * 1000)) / (60 * 1000));
        countdownText = days > 0 ? `เกินกำหนด ${days} วัน ${hours} ชม.` : `เกินกำหนด ${hours} ชม. ${mins} นาที`;
        title = `⚠️ เกิน SLA 2 วัน: ${empName} ${empCode ? `(${empCode})` : ''}`;
        message = `ยื่นขอ${leaveType} (${item.total_days || 1} วัน) แผนก ${deptName || '-'}`;
      } else if (isUrgent) {
        slaStatus = 'urgent';
        const hours = Math.floor(remainingMs / (3600 * 1000));
        const mins = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
        countdownText = `เหลือ ${hours} ชม. ${mins} นาที`;
        title = `🔥 ใกล้ครบกำหนด 2 วัน: ${empName} ${empCode ? `(${empCode})` : ''}`;
        message = `ยื่นขอ${leaveType} (${item.total_days || 1} วัน) แผนก ${deptName || '-'}`;
      }

      return {
        id: notifId,
        title,
        message,
        type: isOverdue ? 'alert' : isUrgent ? 'warning' : 'leave',
        slaStatus,
        countdownText,
        is_read: readNotifIds.includes(notifId),
        created_at: item.created_at || new Date().toISOString(),
        link: '/pages/hr/hr.html'
      };
    });

    // 3. กรอง DB Notifications
    const mappedDbNotifications = dbNotifications.filter(n => {
      const notifRecipient = n.employee_id || n.user_id;
      if (notifRecipient && myProfile?.id) {
        return String(notifRecipient) === String(myProfile.id);
      }
      
      const titleLower = String(n.title).toLowerCase();
      const msgLower = String(n.message).toLowerCase();
      
      if (myRole === "user") {
        const myName = myProfile?.full_name || "";
        if (myName && (msgLower.includes(myName.toLowerCase()) || titleLower.includes(myName.toLowerCase()))) {
          return true;
        }
        return false;
      }
      
      if (myRole === "leader" || myRole === "manager") {
        const myDeptKeyword = String(myDeptName || "").toLowerCase();
        if (myDeptKeyword && (msgLower.includes(myDeptKeyword) || titleLower.includes(myDeptKeyword))) {
          return true;
        }
        return false;
      }
      
      return true;
    }).map(n => {
      let resolvedLink = '/pages/user/leave-history.html';
      const titleLower = String(n.title).toLowerCase();
      const msgLower = String(n.message).toLowerCase();
      
      if (titleLower.includes('ใหม่') || titleLower.includes('ส่งถึงคุณ') || msgLower.includes('พิจารณาอนุมัติขั้นถัดไป') || titleLower.includes('รอหัวหน้า')) {
        if (['leader', 'manager', 'director', 'executive', 'hr', 'admin'].includes(myRole)) {
          resolvedLink = '/pages/hr/hr.html';
        }
      } else if (titleLower.includes('อนุมัติสมบูรณ์') || titleLower.includes('ได้รับการอนุมัติ') || titleLower.includes('ยืนยันใบลา')) {
        resolvedLink = '/pages/user/leave-history.html';
      }
      
      return {
        ...n,
        slaStatus: 'normal',
        link: resolvedLink,
        is_read: n.is_read || readNotifIds.includes(String(n.id))
      };
    });

    // 4. จัดเรียงลำดับการแจ้งเตือน: Overdue -> Urgent -> ล่าสุด
    cachedAllNotifications = [
      ...pendingNotifications,
      ...mappedDbNotifications
    ].sort((a, b) => {
      const getPriority = (item) => {
        if (item.slaStatus === 'overdue' && !item.is_read) return 3;
        if (item.slaStatus === 'urgent' && !item.is_read) return 2;
        if (!item.is_read) return 1;
        return 0;
      };

      const priorityDiff = getPriority(b) - getPriority(a);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    // 5. คำนวณยอด Unread และอัปเดต Tab Badges
    const unreadNotifications = cachedAllNotifications.filter(n => !n.is_read);
    const unreadCount = unreadNotifications.length;

    const overdueCount = cachedAllNotifications.filter(n => n.slaStatus === 'overdue' && !n.is_read).length;
    const urgentCount = cachedAllNotifications.filter(n => n.slaStatus === 'urgent' && !n.is_read).length;

    const tabCountAll = document.getElementById('tabCountAll');
    const tabCountOverdue = document.getElementById('tabCountOverdue');
    const tabCountUrgent = document.getElementById('tabCountUrgent');

    if (tabCountAll) tabCountAll.textContent = unreadCount;
    if (tabCountOverdue) tabCountOverdue.textContent = overdueCount;
    if (tabCountUrgent) tabCountUrgent.textContent = urgentCount;

    // อัปเดตตัวเลข Badge บนไอคอนกระดิ่ง
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'inline-block';
        if (overdueCount > 0) {
          badge.style.background = '#ef4444';
          badge.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.7)';
        } else if (urgentCount > 0) {
          badge.style.background = '#f97316';
          badge.style.boxShadow = '0 0 10px rgba(249, 115, 22, 0.6)';
        } else {
          badge.style.background = 'var(--primary)';
          badge.style.boxShadow = 'none';
        }
      } else {
        badge.style.display = 'none';
      }
    }

    if (unreadCountPill) {
      unreadCountPill.textContent = `${unreadCount} รายการใหม่`;
    }

    renderDropdownNotifsList();

  } catch (err) {
    console.error('Error loading notifications:', err);
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: #ef4444; font-size: 13px;">
        ❌ ไม่สามารถโหลดการแจ้งเตือนได้
      </div>`;
  }
}

async function handleNotifClick(notifId, redirectUrl) {
  // 1. บันทึก ID ลง LocalStorage ทันที
  addReadNotifId(notifId);

  // 2. ถ้าเป็น ID จากตาราง Supabase ให้ส่งไปอัปเดตที่ DB ด้วย
  const client = sb || window.pvtSupabase?.getClient();
  if (client && notifId && !String(notifId).startsWith('pending-')) {
    try {
      await client.from('notifications').update({ is_read: true }).eq('id', notifId);
    } catch (e) {
      console.warn('DB update failed:', e);
    }
  }

  // 3. ย้ายหน้า หรือ อัปเดต UI ทันที
  if (redirectUrl && redirectUrl !== '#' && redirectUrl !== 'undefined') {
    window.location.href = redirectUrl;
  } else {
    fetchRealNotifications();
  }
}

async function markAllNotificationsAsRead() {
  const client = sb || window.pvtSupabase?.getClient();

  // 1. มาร์กรายการทั้งหมดที่มีใน cachedAllNotifications เป็นอ่านแล้วใน LocalStorage ทันทีเพื่อความรวดเร็วและแม่นยำ
  if (Array.isArray(cachedAllNotifications)) {
    cachedAllNotifications.forEach(item => {
      if (item && item.id) {
        addReadNotifId(item.id);
      }
    });
  }

  // 2. มาร์กรายการคำขอใบลาค้างทั้งหมดเป็นอ่านแล้ว
  const pendingLeaves = rawRequests.filter(r => r && (r.status === "pending" || r.status === "รออนุมัติ" || r.status === "cancel_pending"));
  pendingLeaves.forEach(item => addReadNotifId(`pending-${item.id}`));

  // 3. มาร์กรายการแจ้งเตือนในระบบฐานข้อมูล Supabase เป็นอ่านแล้วเฉพาะของพนักงานคนนี้
  if (client) {
    try {
      const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
      const sessionUser = savedSession ? JSON.parse(savedSession) : {};
      const myProfile = window.currentUserProfile || sessionUser;
      const myId = sessionUser?.id || myProfile?.id;

      if (myId) {
        // อัปเดตเฉพาะรายการแจ้งเตือนของตนเอง
        await client.from('notifications')
          .update({ is_read: true })
          .eq('employee_id', myId)
          .eq('is_read', false);
      } else {
        await client.from('notifications')
          .update({ is_read: true })
          .eq('is_read', false);
      }
    } catch (err) {
      console.warn('Supabase mark all error:', err);
    }
  }

  // 4. รีเฟรชการแสดงผลกระดิ่งและเนื้อหาทันที
  await fetchRealNotifications();
}

/* ==========================================================================
   9. 🛠️ UTILITY & HELPERS
   ========================================================================== */
function getSafeValue(item, possibleKeys, defaultValue = "-") {
  if (!item) return defaultValue;
  for (let key of possibleKeys) {
    if (item[key] !== undefined && item[key] !== null) return item[key];
  }
  return defaultValue;
}

function formatThaiDate(dateStr) {
  if (!dateStr || dateStr === "-") return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function showToast(msg, type = "success") {
  const el = document.getElementById("statusToast");
  if (!el) return;
  el.textContent = msg;
  el.className = `toast status-toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove("show"); }, 3000);
}

window.handleLogout = function() {
  Swal.fire({
    title: 'ยืนยันการออกจากระบบ',
    text: 'คุณต้องการออกจากระบบ PVT Workforce Hub ใช่หรือไม่?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ออกจากระบบ',
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
    focusCancel: true
  }).then((result) => {
    if (result.isConfirmed) {
      Swal.fire({
        title: 'กำลังออกจากระบบ...',
        text: 'ระบบกำลังล้างข้อมูลเซสชันและนำคุณกลับสู่หน้าแรก',
        icon: 'success',
        showConfirmButton: false,
        timer: 1200,
        timerProgressBar: true
      });

      setTimeout(() => {
        localStorage.clear();
        localStorage.clear();
        window.location.href = "/index.html";
      }, 1200);
    }
  });
};

// ฟังก์ชันเปิด Pop-up แสดงการแจ้งเตือนทั้งหมด
window.openAllNotificationsModal = async function() {
  if (typeof Swal === "undefined") {
    alert("⚠️ ไม่พบลายบรารี SweetAlert2");
    return;
  }

  Swal.fire({
    title: 'กำลังโหลดการแจ้งเตือน...',
    html: '<div style="padding:20px; font-size:14px; color:#0fa472;">⌛ กรุณารอสักครู่...</div>',
    showConfirmButton: false,
    allowOutsideClick: false
  });

  try {
    const client = sb || window.pvtSupabase?.getClient();
    const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
    const sessionUser = savedSession ? JSON.parse(savedSession) : {};
    const myProfile = window.currentUserProfile || sessionUser;
    const myRole = (myProfile?.role || "").toLowerCase();
    const myDeptId = myProfile?.department_id || myProfile?.employees?.department_id;
    const myDeptName = myProfile?.department_name || myProfile?.departments?.department_name || myProfile?.departments?.id;

    let dbNotifications = [];

    if (client) {
      const { data } = await client
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (data) dbNotifications = data;
    }

    const readNotifIds = getReadNotifIds();

    // รวมคำขอลาค้างอนุมัติตามสิทธิ์
    let pendingLeaves = rawRequests.filter(r => r && (r.status === "pending" || r.status === "รออนุมัติ"));

    if (myRole === "leader" || myRole === "manager" || myRole === "director" || myRole === "executive" || myRole === "owner") {
      pendingLeaves = pendingLeaves.filter((req) => {
        const reqEmp = req.employees;
        if (!reqEmp) return false;

        const reqDeptId = reqEmp.department_id;
        const reqDeptName = reqEmp.departments?.department_name;
        const reqEmpId = req.employee_id;
        const reqEmpRole = String(reqEmp.role || 'user').toLowerCase();

        const isNotSelf = sessionUser.id ? String(reqEmpId) !== String(sessionUser.id) : true;
        
        let isSameDept = true;
        let isSubordinate = false;

        if (myRole === "leader") {
          isSameDept = (myDeptId || myDeptName) 
            ? (String(reqDeptId) === String(myDeptId) || String(reqDeptName).toLowerCase() === String(myDeptName).toLowerCase())
            : true;
          isSubordinate = !['leader', 'manager', 'director', 'executive', 'owner', 'hr', 'admin'].includes(reqEmpRole);
        } else if (myRole === "manager") {
          isSameDept = (myDeptId || myDeptName) 
            ? (String(reqDeptId) === String(myDeptId) || String(reqDeptName).toLowerCase() === String(myDeptName).toLowerCase())
            : true;
          isSubordinate = !['manager', 'director', 'executive', 'owner', 'hr', 'admin'].includes(reqEmpRole);
        } else {
          isSameDept = true;
          isSubordinate = !['owner'].includes(reqEmpRole);
        }

        return isSameDept && isNotSelf && isSubordinate;
      });
    } else if (myRole === "user") {
      pendingLeaves = [];
    }

    const pendingNotifications = pendingLeaves.map(item => {
      const empName = item.employees?.full_name || item.emp_name || 'พนักงาน';
      const leaveType = item.leave_types?.leave_name || item.leave_type_name || 'ใบลา';
      const notifId = `pending-${item.id}`;

      return {
        id: notifId,
        title: `คำขอลาใหม่: ${empName}`,
        message: `ยื่นขอ${leaveType} (${item.total_days || 1} วัน) รอการพิจารณา`,
        type: 'leave',
        is_read: readNotifIds.includes(notifId),
        created_at: item.created_at || new Date().toISOString(),
        link: '/pages/hr/hr.html'
      };
    });

    // กรองและอัปเดต DB notifications
    dbNotifications = dbNotifications.filter(n => {
      if (n.user_id && myProfile?.id) {
        return String(n.user_id) === String(myProfile.id);
      }
      
      const titleLower = String(n.title).toLowerCase();
      const msgLower = String(n.message).toLowerCase();
      
      if (myRole === "user") {
        const myName = myProfile?.full_name || "";
        if (myName && (msgLower.includes(myName.toLowerCase()) || titleLower.includes(myName.toLowerCase()))) {
          return true;
        }
        return false;
      }
      
      if (myRole === "leader" || myRole === "manager") {
        const myDeptKeyword = String(myDeptName || "").toLowerCase();
        if (myDeptKeyword && (msgLower.includes(myDeptKeyword) || titleLower.includes(myDeptKeyword))) {
          return true;
        }
        // ถ้าไม่มีข้อมูลแผนก หรือไม่ใช่ของแผนกตนเอง ไม่ควรแสดงเพื่อความเป็นส่วนตัว
        return false;
      }
      
      return true;
    }).map(n => {
      let resolvedLink = '/pages/user/leave-history.html';
      const titleLower = String(n.title).toLowerCase();
      const msgLower = String(n.message).toLowerCase();
      
      if (titleLower.includes('ใหม่') || titleLower.includes('ส่งถึงคุณ') || msgLower.includes('พิจารณาอนุมัติขั้นถัดไป') || titleLower.includes('รอหัวหน้า')) {
        if (['leader', 'manager', 'director', 'executive', 'hr', 'admin'].includes(myRole)) {
          resolvedLink = '/pages/hr/hr.html';
        }
      } else if (titleLower.includes('อนุมัติสมบูรณ์') || titleLower.includes('ได้รับการอนุมัติ') || titleLower.includes('ยืนยันใบลา')) {
        resolvedLink = '/pages/user/leave-history.html';
      }
      
      return {
        ...n,
        link: resolvedLink,
        is_read: n.is_read || readNotifIds.includes(String(n.id))
      };
    });

    const allNotifications = [
      ...pendingNotifications, 
      ...dbNotifications
    ];

    let listHtml = '';
    if (allNotifications.length === 0) {
      listHtml = `<div style="padding: 24px; text-align: center; color: #64748b; font-size: 14px;">🔕 ไม่มีรายการแจ้งเตือนในขณะนี้</div>`;
    } else {
      allNotifications.forEach(item => {
        const theme = getNotifTheme(item.type);
        const timeText = formatTimeAgo(item.created_at);
        const bgStyle = item.is_read 
          ? 'background: #ffffff; border: 1px solid #e2e8f0;' 
          : 'background: #f0fdfa; border: 1px solid #a7f3d0; border-left: 4px solid #0fa472;';
        const formatted = formatCleanNotification(item.title, item.message);

        listHtml += `
          <div onclick="Swal.close(); handleNotifClick('${item.id}', '${item.link}');" 
               style="display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 10px; margin-bottom: 8px; ${bgStyle} cursor: pointer; text-align: left; transition: all 0.2s;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: #ffffff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
              <span class="material-symbols-outlined" style="font-size: 20px; color: #0fa472;">${theme.icon}</span>
            </div>
            <div style="flex: 1;">
              <div style="font-size: 13.5px; font-weight: 700; color: #0f172a; line-height: 1.35;">${formatted.title}</div>
              ${formatted.bodyHtml}
              <span style="font-size: 11px; color: #64748b; margin-top: 5px; display: block;">🕒 ${timeText}</span>
            </div>
            ${!item.is_read ? '<span style="width: 8px; height: 8px; background: #0fa472; border-radius: 50%; margin-top: 6px;"></span>' : ''}
          </div>
        `;
      });
    }

    Swal.fire({
      title: '🔔 การแจ้งเตือนทั้งหมด',
      width: '540px',
      html: `
        <div style="max-height: 420px; overflow-y: auto; padding-right: 4px; margin-top: 10px;">
          ${listHtml}
        </div>
      `,
      showConfirmButton: true,
      confirmButtonText: 'ปิดหน้าต่าง',
      confirmButtonColor: '#64748b'
    });

  } catch (err) {
    console.error("Error opening notifications modal:", err);
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรายการแจ้งเตือนทั้งหมดได้', 'error');
  }
};

// 🌐 Global Window Function Bindings for Home Page
window.handleNotifClick = typeof handleNotifClick !== 'undefined' ? handleNotifClick : window.handleNotifClick;
window.openEmployeeCardManagerPopup = typeof openEmployeeCardManagerPopup !== 'undefined' ? openEmployeeCardManagerPopup : window.openEmployeeCardManagerPopup;
window.markAllNotificationsAsRead = typeof markAllNotificationsAsRead !== 'undefined' ? markAllNotificationsAsRead : window.markAllNotificationsAsRead;
window.openAllNotificationsModal = typeof openAllNotificationsModal !== 'undefined' ? openAllNotificationsModal : window.openAllNotificationsModal;
window.handlePrintSelectedCardsFromPopup = typeof handlePrintSelectedCardsFromPopup !== 'undefined' ? handlePrintSelectedCardsFromPopup : window.handlePrintSelectedCardsFromPopup;
window.toggleSelectAllCards = typeof toggleSelectAllCards !== 'undefined' ? toggleSelectAllCards : window.toggleSelectAllCards;

/* ==========================================================================
   7. 🎯 ACTION-FIRST DASHBOARD ENGINE
   ========================================================================== */
function isPendingForRoleHome(r, role) {
  const s = String(r.status || '').trim().toLowerCase();
  const isPending = s === 'pending' || s === 'รออนุมัติ' || s === 'wait';
  if (!isPending) return false;
  
  const userRole = String(role || '').toLowerCase();
  if (userRole === 'leader') {
    return (r.manager_status || 'pending') === 'pending';
  }
  if (userRole === 'manager') {
    if ((r.director_status || 'pending') === 'pending') return true;
    if ((r.manager_status || 'pending') === 'pending') {
      const deptId = r.employees?.department_id;
      const deptApprover = (typeof window.deptApproversMap !== 'undefined' && window.deptApproversMap[deptId]) || null;
      if (deptApprover && !deptApprover.supervisor_id) return true;
    }
    return false;
  }
  if (userRole === 'director' || userRole === 'executive' || userRole === 'owner') {
    return (r.executive_status || 'pending') === 'pending';
  }
  return true; // HR/Admin can act on any pending
}

function renderMyActionRequiredSection(requests, sessionUser) {
  const panel = document.getElementById("myActionRequiredPanel");
  const listContainer = document.getElementById("myActionRequiredList");
  const countBadge = document.getElementById("myActionCountBadge");
  if (!panel || !listContainer) return;

  const empCode = String(sessionUser?.employee_code || sessionUser?.employees?.employee_code || localStorage.getItem("currentEmpCode") || '').trim();
  let myRole = String(sessionUser?.role || localStorage.getItem("userRole") || 'user').toLowerCase();
  const isViewOnly = empCode === 'HR-001-3';

  if (empCode === '19122') {
    myRole = 'manager';
  }
  const myEmpId = sessionUser?.id || sessionUser?.employee_id || sessionUser?.employees?.id;

  // Filter requests that are pending and require current user's role approval
  const myPendingActionItems = (requests || []).filter(r => {
    if (!r) return false;
    const isSelf = myEmpId ? (String(r.employee_id) === String(myEmpId) || String(r.employees?.id) === String(myEmpId)) : false;
    if (isSelf) return false; // Can't approve own leaves

    return isPendingForRoleHome(r, myRole);
  });

  if (myPendingActionItems.length === 0) {
    panel.style.display = "none";
    return;
  }

  // Display the panel!
  panel.style.display = "block";
  if (countBadge) {
    countBadge.innerText = myPendingActionItems.length;
  }

  let html = "";
  const toggleContainer = document.getElementById("myActionToggleContainer");
  const toggleText = document.getElementById("toggleMyActionsText");
  const toggleIcon = document.getElementById("toggleMyActionsIcon");

  window._myActionExpanded = window._myActionExpanded || false;

  myPendingActionItems.forEach((item, idx) => {
    const safeEmp = item.employees || {};
    const safeType = item.leave_types || {};

    const name = safeEmp.full_name || safeEmp.name || item.emp_name || "ไม่ระบุชื่อ";
    const code = safeEmp.employee_code || item.emp_code || "";
    const typeName = safeType.leave_name || item.leave_type_name || "ไม่ระบุประเภท";
    const deptName = safeEmp.departments?.department_name || item.department || "ไม่ระบุแผนก";
    
    const startDate = formatThaiDate(item.start_date);
    const endDate = item.end_date ? formatThaiDate(item.end_date) : startDate;
    const durationDays = item.actual_days || item.days_requested || item.total_days || 0;
    const reason = item.reason || "-";

    const isHiddenOnMobile = (!window._myActionExpanded && idx >= 4) ? "mobile-hidden" : "";

    html += `
      <div class="my-action-item-card ${isHiddenOnMobile}">
        <div class="my-action-card-header">
          <div class="my-action-card-avatar">
            <span class="material-symbols-outlined">person</span>
          </div>
          <div class="my-action-card-userinfo">
            <div class="my-action-card-name" title="${name}">${name}</div>
            <div class="my-action-card-badges">
              <span style="font-size: 11px; color: #64748b; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-weight: 600;">#${code}</span>
              <span style="font-size: 11px; color: #ef4444; font-weight: 700; background: #fee2e2; padding: 1px 6px; border-radius: 4px;">${typeName}</span>
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div class="my-action-card-dept" title="${deptName}">
            <span class="material-symbols-outlined" style="font-size: 14px; color: #64748b; flex-shrink: 0;">apartment</span>
            <span>${deptName}</span>
          </div>
          <div class="my-action-card-time">
            <span class="material-symbols-outlined" style="font-size: 14px; flex-shrink: 0;">calendar_month</span>
            <span>${startDate} - ${endDate} (<strong>${durationDays} วัน</strong>)</span>
          </div>
          <div class="my-action-card-reason" title="${reason}">
            💬 ${reason}
          </div>
        </div>

        <div class="my-action-card-actions">
          ${isViewOnly ? `
            <div style="font-size: 11px; color: #64748b; font-style: italic; padding: 4px 8px; background: #f8fafc; border-radius: 6px; width: 100%; text-align: center;">
              สิทธิ์รับชมอย่างเดียว
            </div>
          ` : `
            <button type="button" class="my-action-btn-approve" onclick="quickApproveFromDashboard('${item.id}')" title="อนุมัติคำขอลาทันที">
              <span class="material-symbols-outlined">check_circle</span> อนุมัติ
            </button>
            <button type="button" class="my-action-btn-reject" onclick="quickRejectFromDashboard('${item.id}')" title="ปฏิเสธคำขอลา">
              <span class="material-symbols-outlined">cancel</span> ปฏิเสธ
            </button>
          `}
        </div>
      </div>
    `;
  });

  listContainer.innerHTML = html;

  if (toggleContainer) {
    if (myPendingActionItems.length > 4) {
      toggleContainer.style.display = "block";
      if (toggleText) {
        toggleText.innerText = window._myActionExpanded 
          ? "ย่อเหลือ 2 แถว" 
          : `ดูคำขอทั้งหมด (${myPendingActionItems.length} รายการ)`;
      }
      if (toggleIcon) {
        toggleIcon.innerText = window._myActionExpanded ? "expand_less" : "expand_more";
      }
    } else {
      toggleContainer.style.display = "none";
    }
  }
}

window.toggleMyActionItemsExpand = function() {
  window._myActionExpanded = !window._myActionExpanded;
  const cards = document.querySelectorAll("#myActionRequiredList .my-action-item-card");
  cards.forEach((card, idx) => {
    if (idx >= 4) {
      if (window._myActionExpanded) {
        card.classList.remove("mobile-hidden");
      } else {
        card.classList.add("mobile-hidden");
      }
    }
  });

  const toggleText = document.getElementById("toggleMyActionsText");
  const toggleIcon = document.getElementById("toggleMyActionsIcon");
  const badge = document.getElementById("myActionCountBadge");
  const count = badge ? badge.innerText : "";

  if (toggleText) {
    toggleText.innerText = window._myActionExpanded ? "ย่อเหลือ 2 แถว" : `ดูคำขอทั้งหมด (${count} รายการ)`;
  }
  if (toggleIcon) {
    toggleIcon.innerText = window._myActionExpanded ? "expand_less" : "expand_more";
  }
};

function buildDashboardLeaveConfirmHtml(reqData, roleTitle, actionType = 'approve') {
  const safeEscape = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  };

  const empName = reqData.employees?.full_name || reqData.employees?.name || reqData.emp_name || reqData.name || 'พนักงาน';
  const empCode = reqData.employees?.employee_code || reqData.employee_code || '';
  const deptName = reqData.employees?.departments?.department_name || reqData.department || reqData.department_name || '-';
  const posName = reqData.employees?.positions?.position_name || reqData.position || '-';
  const leaveName = reqData.leave_types?.leave_name || reqData.leave_type_name || 'ไม่ระบุประเภท';
  const startDate = typeof formatThaiDate === 'function' ? formatThaiDate(reqData.start_date) : reqData.start_date;
  const endDate = typeof formatThaiDate === 'function' ? formatThaiDate(reqData.end_date) : reqData.end_date;
  const reason = reqData.reason || 'ไม่ได้ระบุเหตุผล';

  const rawDays = reqData.actual_days || reqData.days_requested || reqData.total_days || 0;
  const leaveHours = reqData.leave_hours || 0;
  let durationText = `${rawDays} วัน`;
  if (leaveHours > 0) {
    const d = Math.floor(leaveHours / 8);
    const remH = leaveHours % 8;
    const wholeH = Math.floor(remH);
    const mins = Math.round((remH - wholeH) * 60);
    let parts = [];
    if (d > 0) parts.push(`${d} วัน`);
    if (wholeH > 0) parts.push(`${wholeH} ชม.`);
    if (mins > 0) parts.push(`${mins} นาที`);
    durationText = parts.length > 0 ? parts.join(' ') : `${leaveHours} ชม.`;
  }

  const isApprove = actionType === 'approve';
  const themeColor = isApprove ? '#10b981' : '#ef4444';
  const themeBg = isApprove ? '#f0fdf4' : '#fef2f2';
  const themeBorder = isApprove ? '#bbf7d0' : '#fecaca';

  return `
    <div style="text-align: left; font-size: 13.5px; line-height: 1.5; color: #334155; margin-top: 6px;">
      <div style="background: ${themeBg}; border: 1.5px solid ${themeBorder}; border-radius: 14px; padding: 14px; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="font-size: 22px; color: ${themeColor};">person</span>
            <div>
              <strong style="color: #0f172a; font-size: 15px;">${safeEscape(empName)}</strong>
              ${empCode ? `<span style="background: #ffffff; color: #475569; font-size: 11.5px; font-weight: 600; padding: 1px 7px; border-radius: 6px; border: 1px solid #cbd5e1; margin-left: 6px;">รหัส ${safeEscape(empCode)}</span>` : ''}
            </div>
          </div>
          <span style="font-size: 11.5px; font-weight: 700; color: ${themeColor}; background: #ffffff; padding: 2px 9px; border-radius: 12px; border: 1px solid ${themeBorder};">
            #${safeEscape(String(reqData.id).slice(-6))}
          </span>
        </div>

        <div style="font-size: 12.5px; color: #64748b; margin-bottom: 10px; padding-left: 30px;">
          <span>แผนก: <strong style="color: #334155;">${safeEscape(deptName)}</strong></span>
          <span style="margin: 0 6px;">•</span>
          <span>ตำแหน่ง: <strong style="color: #334155;">${safeEscape(posName)}</strong></span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #ffffff; border-radius: 10px; padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 13px;">
          <div>
            <span style="color: #64748b; font-size: 11.5px; display: block; margin-bottom: 2px;">ประเภทการลา</span>
            <strong style="color: #0d9488; font-size: 13.5px;">${safeEscape(leaveName)}</strong>
          </div>
          <div>
            <span style="color: #64748b; font-size: 11.5px; display: block; margin-bottom: 2px;">จำนวนเวลาลา</span>
            <strong style="color: #0f172a; font-size: 13.5px;">${durationText}</strong>
          </div>
          <div style="grid-column: span 2; border-top: 1px dashed #e2e8f0; padding-top: 8px; margin-top: 2px;">
            <span style="color: #64748b; font-size: 11.5px; display: block; margin-bottom: 2px;">ช่วงวันที่ขอลา</span>
            <strong style="color: #334155; font-size: 13px;">${startDate} - ${endDate}</strong>
          </div>
        </div>

        <div style="margin-top: 10px; font-size: 12.5px; background: #ffffff; border-radius: 10px; padding: 8px 12px; border: 1px solid #e2e8f0;">
          <span style="color: #64748b; font-weight: 600;">เหตุผลการลา:</span>
          <span style="color: #1e293b; margin-left: 4px;">${safeEscape(reason)}</span>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #64748b; padding: 2px 4px 6px 4px;">
        <span>สิทธิ์ผู้พิจารณา:</span>
        <span style="font-weight: 700; color: ${themeColor}; background: ${themeBg}; padding: 3px 10px; border-radius: 8px; border: 1px solid ${themeBorder};">
          ${safeEscape(roleTitle)}
        </span>
      </div>

      ${isApprove ? `
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 8px 12px; font-size: 12px; color: #065f46; display: flex; align-items: center; gap: 6px; margin-top: 6px;">
          <span class="material-symbols-outlined" style="font-size: 17px; color: #10b981; flex-shrink: 0;">check_circle</span>
          <span>การอนุมัติจะมีผลตัดยอดวันลาและส่งการแจ้งเตือนไปยังพนักงานทันที</span>
        </div>
      ` : `
        <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 8px 12px; font-size: 12px; color: #9f1239; display: flex; align-items: center; gap: 6px; margin-top: 6px;">
          <span class="material-symbols-outlined" style="font-size: 17px; color: #ef4444; flex-shrink: 0;">warning</span>
          <span>การไม่อนุมัติจะมีผลสิ้นสุดคำขอนี้ทันที และส่งเหตุผลแจ้งเตือนให้พนักงานทราบ</span>
        </div>
      `}
    </div>
  `;
}

window.quickApproveFromDashboard = async function(leaveId) {
  const sb = window.pvtSupabase?.getClient();
  if (!sb) return;

  const reqData = rawRequests.find(r => String(r.id) === String(leaveId));
  if (!reqData) return;

  const savedSession = localStorage.getItem("currentUser");
  const sessionUser = savedSession ? JSON.parse(savedSession) : {};
  const myRole = String(sessionUser?.role || localStorage.getItem("userRole") || 'user').toLowerCase();

  const roleTitle = myRole === 'leader' 
    ? 'หัวหน้างาน (L1)' 
    : myRole === 'manager' 
    ? 'ผู้จัดการฝ่าย (L2)' 
    : (myRole === 'executive' || myRole === 'director' || myRole === 'owner')
    ? 'ผู้บริหาร (L3)'
    : 'ฝ่ายบุคคล HR / Admin';

  // 🛡️ กล่องยืนยัน SweetAlert2 ก่อนทำการอนุมัติ เพื่อป้องกันการกดผิดพลาดโดยไม่ตั้งใจ
  const result = await Swal.fire({
    title: '<span style="font-size: 20px; font-weight: 800; color: #0f172a;">ยืนยันอนุมัติคำขอลา</span>',
    html: buildDashboardLeaveConfirmHtml(reqData, roleTitle, 'approve'),
    icon: 'question',
    iconColor: '#10b981',
    showCancelButton: true,
    showDenyButton: false,
    confirmButtonColor: '#10b981',
    cancelButtonColor: '#64748b',
    confirmButtonText: '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">check_circle</span> ยืนยันอนุมัติคำขอลา',
    cancelButtonText: 'ยกเลิก',
    focusCancel: true,
    allowOutsideClick: false,
    customClass: {
      popup: 'swal-refined-popup',
      confirmButton: 'swal-btn-success',
      cancelButton: 'swal-btn-cancel'
    }
  });

  if (!result.isConfirmed) return;

  Swal.fire({ title: 'กำลังประมวลผล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    let updateFields = {};

    if (window.PVTSDK?.user?.ensureLeaveBalances) {
      await window.PVTSDK.user.ensureLeaveBalances(reqData.employee_id, reqData.start_date);
    }

    if (myRole === 'leader') {
      updateFields.manager_status = 'approved';
      const deptId = reqData.employees?.department_id || null;
      const { data: deptInfo } = await sb.from("department_approvers").select("manager_id").eq("department_id", deptId).maybeSingle();
      const hasManagerInDept = deptInfo?.manager_id || Boolean(reqData.employees?.l2_approver_id);
      if (!hasManagerInDept) {
        updateFields.director_status = 'approved';
      }
    } else if (myRole === 'manager') {
      updateFields.director_status = 'approved';
      if (reqData.manager_status !== 'approved') updateFields.manager_status = 'approved';
    } else if (myRole === 'executive' || myRole === 'director' || myRole === 'owner') {
      if (reqData.manager_status !== 'approved') updateFields.manager_status = 'approved';
      if (reqData.director_status !== 'approved') updateFields.director_status = 'approved';
      updateFields.status = 'approved';
      updateFields.approved_at = new Date().toISOString();
    } else {
      // HR / Admin
      if (reqData.manager_status !== 'approved') updateFields.manager_status = 'approved';
      if (reqData.director_status !== 'approved') updateFields.director_status = 'approved';
      updateFields.status = 'approved';
      updateFields.approved_at = new Date().toISOString();
    }

    // หักยอดวันลาหากได้รับการอนุมัติขั้นสุดท้ายเรียบร้อยแล้ว
    if (updateFields.status === 'approved') {
      const leaveDays = reqData.actual_days || reqData.days_requested || reqData.total_days || 0;
      const currentYear = new Date(reqData.start_date).getFullYear();

      if (window.PVTSDK?.user?.updateLeaveBalance) {
        const lCode = reqData.leave_types?.leave_code || null;
        await window.PVTSDK.user.updateLeaveBalance(reqData.employee_id, reqData.leave_type_id, lCode, currentYear, leaveDays);
      }
    }

    // 🔄 ตรวจสอบว่าเป็นการอนุมัติแทนตามระบบ Auto-Delegation หรือไม่ (เมื่อหัวหน้าลาพักร้อน)
    if (window.AutoDelegationService) {
      try {
        const delegation = await window.AutoDelegationService.resolveDelegationForRequest(reqData);
        if (delegation && delegation.isDelegated) {
          const actorName = sessionUser?.full_name || 'ผู้รักษาการแทน';
          updateFields.approval_comment = `[Auto-Delegation] อนุมัติโดย ${actorName} รักษาการแทน ${delegation.originalApproverName} (${delegation.reason})`;
        }
      } catch (delErr) {
        console.warn("[Auto-Delegation] Audit resolution error in dashboard:", delErr);
      }
    }

    const { error: updateErr } = await sb
      .from('leave_requests')
      .update(updateFields)
      .eq('id', leaveId);

    if (updateErr) throw updateErr;

    // 🔔 บันทึกแจ้งเตือนลงฐานข้อมูล
    await sb.from('notifications').insert({
      employee_id: reqData.employee_id,
      title: `ใบลาได้รับการอนุมัติ`,
      message: `ใบลาประเภท ${reqData.leave_types?.leave_name || 'ใบลา'} วันที่ ${reqData.start_date} ได้รับการอนุมัติแล้ว`,
      type: 'leave',
      link_url: '/pages/user/index-user.html'
    });

    // 💬 ส่งแจ้งเตือน LINE ให้พนักงานผู้ขอลา
    if (window.PVTSDK?.line) {
      try {
        await window.PVTSDK.line.sendWorkflowNotification({
          type: 'REQUEST_APPROVED',
          recipientId: reqData.employee_id,
          recipientLineId: reqData.employees?.line_id || '',
          leaveId: leaveId,
          employeeName: reqData.employees?.full_name || 'พนักงาน',
          employeeCode: reqData.employees?.employee_code || '',
          departmentName: reqData.employees?.departments?.department_name || '',
          recipientRole: 'employee',
          leaveType: reqData.leave_types?.leave_name || 'ใบลา',
          startDate: reqData.start_date,
          endDate: reqData.end_date,
          totalDays: reqData.total_days,
          comment: 'ใบลาของคุณได้รับการอนุมัติเรียบร้อยแล้ว',
          attachmentUrl: reqData.attachment_url || ""
        });
      } catch (lineErr) {
        console.warn("⚠️ [Home LINE] Employee notification error:", lineErr);
      }
    }

    // 📢 ส่งแจ้งเตือน LINE ให้ฝ่ายบุคคล (HR)
    if (window.PVTSDK?.notifyHrWorkflow || window.pvtSupabase?.notifyHrWorkflow) {
      try {
        const notifyFn = window.PVTSDK?.notifyHrWorkflow ? window.PVTSDK.notifyHrWorkflow.bind(window.PVTSDK) : window.pvtSupabase.notifyHrWorkflow.bind(window.pvtSupabase);
        const notifTypeToHr = (updateFields.status === 'approved' || reqData.status === 'approved' || myRole === 'manager' || myRole === 'executive' || myRole === 'director' || myRole === 'owner')
          ? 'HR_NOTIFY'
          : 'HR_REVIEW';

        await notifyFn({
          id: leaveId,
          applicant_name: reqData.employees?.full_name || 'พนักงาน',
          employee_code: reqData.employees?.employee_code || '',
          department_name: reqData.employees?.departments?.department_name || '',
          leave_type_name: reqData.leave_types?.leave_name || 'ใบลา',
          start_date: reqData.start_date,
          end_date: reqData.end_date,
          total_days: reqData.total_days,
          leave_hours: reqData.leave_hours || 0,
          reason: reqData.reason || '',
          comment: updateFields.approval_comment || `อนุมัติโดย ${myRole.toUpperCase()}`,
          attachment_url: reqData.attachment_url || ''
        }, notifTypeToHr);
      } catch (hrNotifErr) {
        console.warn("⚠️ [Home LINE] HR notification error:", hrNotifErr);
      }
    }

    if (updateFields.status === 'approved' || reqData.status === 'approved') {
      const subject = `[วันลาพัก] ${reqData.employees?.full_name || 'พนักงาน'} (${reqData.leave_types?.leave_name || 'ลากิจ'})`;
      
      const formatGCalDate = (dateStr, addDays = 0) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (addDays > 0) d.setDate(d.getDate() + addDays);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const r = String(d.getDate()).padStart(2, '0');
        return `${y}${m}${r}`;
      };

      const sDateStr = formatGCalDate(reqData.start_date);
      const eDateStr = formatGCalDate(reqData.end_date, 1);
      
      const durationFriendly = window.PVTSDK?.formatLeaveDurationFriendly 
        ? window.PVTSDK.formatLeaveDurationFriendly(reqData.total_days, reqData.leave_hours || 0)
        : (reqData.total_days ? `${reqData.total_days} วัน` : '1 วัน');

      const details = `ประเภทการลา: ${reqData.leave_types?.leave_name || 'ใบลา'}\nเหตุผลการลา: ${reqData.reason || '-'}\nจำนวนวันลา: ${durationFriendly}\nอนุมัติโดยระบบ PVT Workforce Hub`;
      const location = `PVT Workforce Hub`;

      const gcalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(subject)}&dates=${sDateStr}/${eDateStr}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
      const ocalLink = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(subject)}&startdt=${reqData.start_date}&enddt=${reqData.end_date}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}&allday=true`;

      await Swal.fire({
        icon: 'success',
        title: '🎉 อนุมัติใบลาเสร็จสิ้น!',
        html: `
          <div style="font-family: var(--font-sans, sans-serif); text-align: left; padding: 10px 0;">
            <p style="color: var(--text-soft); font-size: 14.5px; margin-bottom: 16px;">
              ใบลาของ <strong>${reqData.employees?.full_name || 'พนักงาน'}</strong> ได้รับการอนุมัติขั้นสุดท้ายเรียบร้อยแล้ว
            </p>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
              <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #0d9488; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">calendar_month</span>
                Auto-Sync Calendar (ซิงค์ปฏิทินทีม)
              </h4>
              <p style="font-size: 12px; color: #64748b; margin: 0 0 12px 0;">
                เลือกช่องทางที่ต้องการนำวันลาที่อนุมัตินี้ ไปบันทึกลงในปฏิทินส่วนกลางของทีมโดยอัตโนมัติ
              </p>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <a href="${gcalLink}" target="_blank" style="background: #ffffff; border: 1px solid #dadce0; border-radius: 8px; padding: 10px; display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; color: #3c4043; font-size: 13px; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: background 0.2s;">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" style="width:16px; height:16px;">
                  Google Calendar
                </a>
                <a href="${ocalLink}" target="_blank" style="background: #ffffff; border: 1px solid #dadce0; border-radius: 8px; padding: 10px; display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; color: #3c4043; font-size: 13px; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: background 0.2s;">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/d/df/Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg" style="width:16px; height:16px;">
                  Outlook Calendar
                </a>
              </div>
            </div>
          </div>
        `,
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#0d9488'
      });
    } else {
      await Swal.fire('อนุมัติสำเร็จ!', 'บันทึกสถานะการอนุมัติเรียบร้อยแล้ว', 'success');
    }
    await refreshDashboardData();

  } catch (err) {
    console.error("❌ Quick Approve Error:", err);
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, confirmButtonColor: '#ef4444' });
  }
};

window.quickRejectFromDashboard = async function(leaveId) {
  const sb = window.pvtSupabase?.getClient();
  if (!sb) return;

  const reqData = rawRequests.find(r => String(r.id) === String(leaveId));
  if (!reqData) return;

  const savedSession = localStorage.getItem("currentUser");
  const sessionUser = savedSession ? JSON.parse(savedSession) : {};
  const myRole = String(sessionUser?.role || localStorage.getItem("userRole") || 'user').toLowerCase();

  const roleTitle = myRole === 'leader' 
    ? 'หัวหน้างาน (L1)' 
    : myRole === 'manager' 
    ? 'ผู้จัดการฝ่าย (L2)' 
    : (myRole === 'executive' || myRole === 'director' || myRole === 'owner')
    ? 'ผู้บริหาร (L3)'
    : 'ฝ่ายบุคคล HR / Admin';

  const summaryHtml = buildDashboardLeaveConfirmHtml(reqData, roleTitle, 'reject');

  // 🛡️ กล่องยืนยัน SweetAlert2 ก่อนทำการไม่อนุมัติ เพื่อป้องกันการกดผิดพลาดโดยไม่ตั้งใจ
  const { value: rejectComment, isConfirmed } = await Swal.fire({
    title: '<span style="font-size: 20px; font-weight: 800; color: #b91c1c;">ยืนยันไม่อนุมัติ / ปฏิเสธคำขอลา</span>',
    html: `
      ${summaryHtml}
      <div style="text-align: left; margin-top: 14px;">
        <label for="swal-dashboard-reject-input" style="font-size: 13px; font-weight: 700; color: #b91c1c; display: block; margin-bottom: 6px;">
          โปรดระบุเหตุผลความจำเป็นที่ไม่อนุมัติ (บังคับกรอก เพื่อแจ้งเตือนพนักงาน):
        </label>
        <textarea id="swal-dashboard-reject-input" class="swal2-textarea" placeholder="พิมพ์เหตุผลการไม่อนุมัติ เช่น งานเร่งด่วนทับซ้อน, กำลังพลในแผนกไม่เพียงพอ, เอกสารไม่สมบูรณ์..." style="width: 100%; min-height: 80px; margin: 0; box-sizing: border-box; font-size: 13.5px; border-radius: 8px; border: 1.5px solid #cbd5e1; padding: 10px; font-family: inherit;"></textarea>
      </div>
    `,
    icon: 'warning',
    iconColor: '#ef4444',
    showCancelButton: true,
    showDenyButton: false,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">cancel</span> ยืนยันไม่อนุมัติคำขอ',
    cancelButtonText: 'ยกเลิก',
    focusCancel: true,
    allowOutsideClick: false,
    customClass: {
      popup: 'swal-refined-popup',
      confirmButton: 'swal-btn-danger',
      cancelButton: 'swal-btn-cancel'
    },
    preConfirm: () => {
      const textarea = document.getElementById('swal-dashboard-reject-input');
      const val = textarea ? textarea.value.trim() : '';
      if (!val) {
        Swal.showValidationMessage('กรุณาระบุเหตุผลในการไม่อนุมัติคำขอลาด้วยครับ เพื่อแจ้งให้พนักงานทราบ');
        return false;
      }
      return val;
    }
  });

  if (!isConfirmed || !rejectComment) return;

  Swal.fire({ title: 'กำลังประมวลผล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const trimmedComment = rejectComment.trim();
    let updateFields = {
      status: 'rejected',
      approval_comment: trimmedComment
    };

    if (myRole === 'leader') {
      updateFields.manager_status = 'rejected';
    } else if (myRole === 'manager') {
      updateFields.director_status = 'rejected';
    } else {
      updateFields.status = 'rejected';
    }

    const { error: updateErr } = await sb
      .from('leave_requests')
      .update(updateFields)
      .eq('id', leaveId);

    if (updateErr) throw updateErr;

    // 🔔 แจ้งเตือนพนักงาน
    await sb.from('notifications').insert({
      employee_id: reqData.employee_id,
      title: `ใบลาได้รับการปฏิเสธ`,
      message: `ใบลาประเภท ${reqData.leave_types?.leave_name || 'ใบลา'} วันที่ ${reqData.start_date} ได้รับการปฏิเสธ เนื่องจาก: ${trimmedComment}`,
      type: 'leave',
      link_url: '/pages/user/index-user.html'
    });

    Swal.fire({ icon: 'success', title: 'ปฏิเสธใบลาเรียบร้อย', showConfirmButton: false, timer: 1500 });
    await refreshDashboardData();

  } catch (err) {
    console.error("❌ Quick Reject Error:", err);
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, confirmButtonColor: '#ef4444' });
  }
};