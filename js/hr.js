// ============================================================================
// 🚀 PVT HR System - [FULL ROLE-BASED APPROVALS & CANCELLATION WORKFLOW]
// ============================================================================

let currentRole = "hr"; 
let currentUserProfile = null;
let allLeaveRequests = []; 
let currentLeaveTab = "pending"; // 'pending' | 'cancellation' | 'history'
let hasExecutiveColumn = true;
let deptApproversMap = {};

// ⚡ [1. IMMEDIATE CHECK]: เช็กสิทธิ์ทันทีตั้งแต่นาทีแรกที่โหลด JS
(function checkRoleImmediately() {
  try {
    const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
    const sessionUser = savedSession ? JSON.parse(savedSession) : {};
    const empData = sessionUser?.employees || sessionUser || {};
    
    const fastRole = String(sessionUser?.role || empData?.role || "").toLowerCase();
    const fastPosition = String(empData?.positions?.position_name || empData?.position_name || "").toLowerCase();

    const isAllowedRole = (
      fastRole === "hr" || fastRole === "admin" || fastRole === "director" || 
      fastRole === "manager" || fastRole === "leader" || fastRole === "executive" || fastRole === "owner" ||
      fastPosition.includes("ผู้จัดการ") || fastPosition.includes("ผู้อำนวยการ") || fastPosition.includes("หัวหน้า") || fastPosition.includes("บริหาร")
    );

    if (!isAllowedRole) {
      document.documentElement.style.visibility = 'hidden';
      window.__PVT_ACCESS_DENIED__ = true;
    }
  } catch (e) {
    console.error("🔒 Auth Check Error:", e);
  }
})();

// 🛡️ Helper function to escape HTML string to prevent XSS
function escapeHtml(value) {
  if (window.PVTSDK?.utils?.escapeHtml) {
    return window.PVTSDK.utils.escapeHtml(value);
  }
  if (window.pvtSupabase?.utils?.escapeHtml) {
    return window.pvtSupabase.utils.escapeHtml(value);
  }
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.__PVT_ACCESS_DENIED__) {
    if (typeof Swal !== 'undefined') {
      await Swal.fire({
        title: '<span style="color: #0f172a; font-size: 20px; font-weight: 700;">⛔ ปฏิเสธการเข้าถึง</span>',
        html: `
          <div style="font-family: 'Sarabun', sans-serif; text-align: center; color: #475569; padding: 10px 0;">
            <p style="font-size: 15px; margin-bottom: 6px; font-weight: 600; color: #1e293b;">คุณไม่มีสิทธิ์เข้าถึงหน้าระบบอนุมัติใบลา</p>
            <p style="font-size: 13px; color: #64748b; margin: 0;">หน้านี้สำหรับหัวหน้างาน ผู้จัดการ หรือ HR เท่านั้น</p>
          </div>
        `,
        icon: 'error',
        confirmButtonText: '🏠 กลับหน้าหลักพนักงาน',
        confirmButtonColor: '#06b6d4',
        allowOutsideClick: false,
        allowEscapeKey: false
      });
    } else {
      alert("⛔ คุณไม่มีสิทธิ์เข้าถึงหน้าระบบอนุมัติใบลา");
    }

    window.location.href = "/pages/user/index-user.html";
    return;
  }

  await initSystemAndPermissions();
});

/* ==========================================================================
   🔑 1. ROLE PERMISSIONS & DYNAMIC UI CONTROL
   ========================================================================== */

async function initSystemAndPermissions() {
  try {
    // 1. ดึงข้อมูล Profile อย่างละเอียดผ่าน SDK
    if (window.pvtSupabase?.hr?.getProfile) {
      currentUserProfile = await window.pvtSupabase.hr.getProfile();
    }
    
    const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
    const sessionUser = savedSession ? JSON.parse(savedSession) : {};
    
    // สำคัญ: ดึงข้อมูลพนักงาน (empData) จากจุดที่ลึกที่สุดเพื่อให้ได้ ID ที่ถูกต้อง (Employee UUID ไม่ใช่ Auth ID)
    const empData = currentUserProfile?.employees || sessionUser?.employees || sessionUser || {};
    
    // ตรวจสอบ Role และ Position เพื่อกำหนดสิทธิ์การมองเห็น
    const rawRole = String(currentUserProfile?.role || sessionUser?.role || empData?.role || "").toLowerCase();
    const rawPos = String(empData?.position_name || empData?.positions?.position_name || sessionUser?.position_name || "").toLowerCase();

    console.log("[HR Init] User Identity:", { rawRole, rawPos, empId: empData?.id });

    // ตรวจสอบโครงสร้างสายอนุมัติของแต่ละแผนก (department_approvers + รายชื่อหัวหน้า/ผู้จัดการจริงในแต่ละแผนก)
    const sb = window.pvtSupabase?.getClient();
    let isDeptSupervisor = false;
    let isDeptManager = false;
    if (sb) {
      try {
        const [apprvRes, deptRes, empRes] = await Promise.all([
          sb.from("department_approvers").select("department_id, supervisor_id, manager_id"),
          sb.from("departments").select("id, department_name, approver_id, backup_approver_id"),
          sb.from("employees").select("id, department_id, role, positions!position_id(position_name), status, l1_approver_id, l2_approver_id")
        ]);

        const apprvList = apprvRes.data || [];
        const depts = deptRes.data || [];
        const allEmps = empRes.data || [];

        const approverConfigByDept = {};
        apprvList.forEach(a => {
          if (a.department_id) approverConfigByDept[a.department_id] = a;
        });

        deptApproversMap = {};
        depts.forEach(d => {
          const cfg = approverConfigByDept[d.id];
          const deptEmps = allEmps.filter(e => e.department_id === d.id && (e.status === 'active' || !e.status));
          const deptName = String(d.department_name || '').toLowerCase();
          const isHrDept = deptName.includes('บุคคล') || deptName.includes('hr') || deptName.includes('ทรัพยากรบุคคล');
          
          let hasLeader = false;
          let supervisor_id = null;
          let hasManager = false;
          let manager_id = null;

          if (isHrDept) {
            // 🛡️ แผนกบุคคล/ทรัพยากรบุคคล: ไม่มีหัวหน้างาน (L1) มีแต่ผู้จัดการฝ่าย (L2)
            hasLeader = false;
            supervisor_id = null;
            hasManager = true;
            manager_id = cfg?.manager_id || d.approver_id || deptEmps.find(e => String(e.role || '').toLowerCase().includes('manager') || String(e.positions?.position_name || '').toLowerCase().includes('ผู้จัดการ'))?.id || null;
          } else if (cfg) {
            // 🎯 กำหนดค่าอย่างเป็นทางการจากตาราง department_approvers
            hasLeader = Boolean(cfg.supervisor_id);
            supervisor_id = cfg.supervisor_id || null;
            hasManager = Boolean(cfg.manager_id || d.approver_id);
            manager_id = cfg.manager_id || d.approver_id || null;
          } else {
            // สำรอง (Fallback) เฉพาะแผนกที่ยังไม่เคยตั้งค่าในตาราง department_approvers
            const leaders = deptEmps.filter(e => {
              const r = String(e.role || '').toLowerCase();
              const p = String(e.positions?.position_name || '').toLowerCase();
              return (r === 'leader' || r.includes('leader') || r.includes('supervisor') || p.includes('หัวหน้า')) && !r.includes('manager') && !p.includes('ผู้จัดการ');
            });
            const managers = deptEmps.filter(e => {
              const r = String(e.role || '').toLowerCase();
              const p = String(e.positions?.position_name || '').toLowerCase();
              return r === 'manager' || r.includes('manager') || p.includes('ผู้จัดการ');
            });
            hasLeader = leaders.length > 0;
            supervisor_id = leaders[0]?.id || null;
            hasManager = Boolean(d.approver_id || managers.length > 0);
            manager_id = d.approver_id || managers[0]?.id || null;
          }

          deptApproversMap[d.id] = {
            hasLeader,
            hasManager,
            supervisor_id,
            manager_id
          };
        });
        window.deptApproversMap = deptApproversMap;

        const deptNamesMap = {};
        depts.forEach(d => {
          deptNamesMap[d.id] = d.department_name;
        });
        window.allDepartmentsMap = deptNamesMap;

        if (empData?.id) {
          const empIdStr = String(empData.id);
          isDeptSupervisor = apprvList.some(a => String(a.supervisor_id) === empIdStr) ||
            depts.some(d => String(d.backup_approver_id) === empIdStr) ||
            allEmps.some(e => String(e.l1_approver_id) === empIdStr) ||
            allEmps.some(e => String(e.id) === empIdStr && (e.role === 'leader' || String(e.positions?.position_name || '').includes('หัวหน้า')));
          
          isDeptManager = apprvList.some(a => String(a.manager_id) === empIdStr) ||
            depts.some(d => String(d.approver_id) === empIdStr) ||
            allEmps.some(e => String(e.l2_approver_id) === empIdStr) ||
            allEmps.some(e => String(e.id) === empIdStr && (e.role === 'manager' || String(e.positions?.position_name || '').includes('ผู้จัดการ')));
        }
      } catch (e) {
        console.warn("Error checking approver list:", e);
      }
    }

    // ดึงค่าผู้บริหารสูงสุดอนุมัติหลัก (L3) จาก system_settings
    let isExecutiveApprover = false;
    try {
      const { data: execSet } = await sb.from("system_settings").select("employee_id").eq("setting_key", "leave_executive_approver").maybeSingle();
      if (execSet?.employee_id) {
        window.executiveSetting = execSet;
        window.executiveApproverId = execSet.employee_id;
        if (empData?.id && String(empData.id) === String(execSet.employee_id)) {
          isExecutiveApprover = true;
        }
      }
    } catch(err) {
      console.warn("Could not check executive approver setting:", err);
    }

    const empCode = String(empData?.employee_code || "").trim();

    // กำหนดกลุ่ม Role เพื่อใช้ในการ Filter ข้อมูล (ให้สิทธิ์ L3 Executive Approver เป็นอันดับสูงสุด)
    window.isViewOnlyHR = false; // Flag สำหรับสิทธิ์การดูอย่างเดียว

    if (empCode === '19122') {
      // 🌟 น.ส. ปณัยยา บุญเกิด: ผู้จัดการฝ่ายบุคคล-ธุรการ
      // มีแอคเคาต์แยกสำหรับ HR กลาง (HR-001/002/003) ให้ทำหน้าที่เป็น Manager อนุมัติเฉพาะคนในแผนกตนเอง
      currentRole = "manager";
    } else if (empCode === 'HR-001-3') {
      // 🌟 เฉพาะรหัส HR-001-3: ให้มีสิทธิ์เป็น HR (ดูได้อย่างเดียว ไม่สามารถอนุมัติได้)
      currentRole = "hr";
      window.isViewOnlyHR = true;
    } else if (isExecutiveApprover || rawRole === "director" || rawRole === "executive" || rawRole === "owner" || rawPos.includes("ผู้อำนวยการ") || rawPos.includes("ผู้บริหาร") || rawPos.includes("director") || rawPos.includes("executive") || rawPos.includes("owner")) {
      currentRole = "director";
    } else if (rawRole === "admin" || rawRole === "superadmin" || rawRole.includes("admin")) {
      currentRole = "admin";
    } else if (rawRole === "hr" || rawRole.includes("hr")) {
      currentRole = "hr";
    } else if (rawRole === "manager" || isDeptManager || rawPos.includes("ผู้จัดการ") || rawPos.includes("manager")) {
      currentRole = "manager";
    } else if (rawRole === "leader" || isDeptSupervisor || rawPos.includes("หัวหน้า") || rawPos.includes("leader") || rawPos.includes("supervisor")) {
      currentRole = "leader";
    } else {
      currentRole = "user"; // Default สำหรับพนักงานทั่วไป
    }
    
    console.log("[HR Init] Assigned System Role:", currentRole);

    document.documentElement.style.visibility = 'visible';

    const userNameEl = document.getElementById("userNameHeader");
    const userPositionEl = document.getElementById("userPositionHeader");
    const userAvatarEl = document.getElementById("userAvatarHeader");

    if (userNameEl) userNameEl.textContent = empData?.full_name || "ผู้ใช้งาน";
    if (userPositionEl) userPositionEl.textContent = empData?.positions?.position_name || empData?.position_name || "ไม่ระบุตำแหน่ง";
    if (userAvatarEl) userAvatarEl.src = getAvatarUrl(empData?.image_url);

    applyRoleBasedUI();
    
    // โหลดข้อมูลใบลา
    await loadPendingLeavesHR();

    // 🎯 [Query Param Tab/Status Auto Handler]:
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    const filterParam = urlParams.get("filter") || urlParams.get("status");

    if (tabParam) {
      console.log(`🎯 [Query Param]: Auto-switching tab to: ${tabParam}`);
      currentLeaveTab = tabParam;
      
      const tabBtn = document.querySelector(`.leave-tab-container .tab-btn[onclick*="${tabParam}"]`);
      if (tabBtn) {
        document.querySelectorAll('.leave-tab-container .tab-btn').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
      }

      // Update header titles based on tab
      const headerTitle = document.getElementById("sectionHeaderTitle");
      const headerIcon = document.getElementById("sectionHeaderIcon");
      const slaContainer = document.getElementById("leaveSlaTrackerContainer");
      const leaveTablePanel = document.getElementById("leaveTablePanel");

      if (tabParam === 'pending') {
        if (headerTitle) headerTitle.textContent = "คำขออนุมัติลาค้างพิจารณา";
        if (headerIcon) headerIcon.textContent = "hourglass_top";
        if (slaContainer) slaContainer.style.display = "block";
        if (leaveTablePanel) leaveTablePanel.style.display = "none";
      } else if (tabParam === 'cancellation') {
        if (headerTitle) headerTitle.textContent = "คำร้องขอยกเลิกใบลาหยุดงาน";
        if (headerIcon) headerIcon.textContent = "published_with_changes";
        if (slaContainer) slaContainer.style.display = "none";
        if (leaveTablePanel) leaveTablePanel.style.display = "block";
      } else {
        if (headerTitle) headerTitle.textContent = "ประวัติการพิจารณาใบลาทั้งหมด";
        if (headerIcon) headerIcon.textContent = "history";
        if (slaContainer) slaContainer.style.display = "none";
        if (leaveTablePanel) leaveTablePanel.style.display = "block";
      }
    }

    if (filterParam) {
      console.log(`🎯 [Query Param]: Auto-filtering to status/step: ${filterParam}`);
      const selectEl = document.getElementById("filterStepSelect");
      if (selectEl) {
        selectEl.value = filterParam;
      }
    }

    // Now render the table with the applied query parameters
    renderLeaveTable();

    // 🎯 [Query Param Auto Action Engine]:
    const leaveIdParam = urlParams.get("id") || urlParams.get("leave_id");
    const actionParam = urlParams.get("action");
    if (leaveIdParam) {
      console.log(`🎯 [Query Param]: Auto-opening leave preview/action for ID: ${leaveIdParam}`);
      setTimeout(() => {
        const found = allLeaveRequests.find(r => String(r.id) === String(leaveIdParam));
        if (found) {
          // If the leave status is cancellation or historical, automatically switch tab to make it visual
          const isCancel = found.status === 'cancel_requested' || found.status === 'cancel_pending' || found.status === 'ขอยกเลิก';
          const isHistory = found.status !== 'pending' && found.status !== 'รออนุมัติ' && !isCancel;
          
          if (isCancel) {
            currentLeaveTab = "cancellation";
            const tabBtn = document.querySelector('[onclick*="switchLeaveTab(\'cancellation\')"]');
            if (tabBtn) {
              document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
              tabBtn.classList.add('active');
            }
            renderLeaveTable();
          } else if (isHistory) {
            currentLeaveTab = "history";
            const tabBtn = document.querySelector('[onclick*="switchLeaveTab(\'history\')"]');
            if (tabBtn) {
              document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
              tabBtn.classList.add('active');
            }
            renderLeaveTable();
          }

          if (actionParam === "approve") {
            approveLeave(leaveIdParam);
          } else if (actionParam === "reject") {
            rejectLeave(leaveIdParam);
          } else {
            previewLeaveModal(leaveIdParam);
          }
        } else {
          console.warn(`⚠️ [Query Param]: Leave ID ${leaveIdParam} not found in the loaded requests.`);
        }
      }, 800);
    }

  } catch (err) {
    console.error("💥 Error during HR System Init:", err);
  }
}

function applyRoleBasedUI() {
  const sidebar = document.getElementById("mainSidebar");
  const mainContent = document.getElementById("mainContent");
  const btnBack = document.getElementById("btnHeaderBack");
  const roleBadge = document.getElementById("userRoleBadge");

  // กรองเมนูด้านข้างสำหรับ Leader/Manager
  if (sidebar) {
    const navItems = sidebar.querySelectorAll(".nav-menu .nav-item");
    navItems.forEach(item => {
      const href = item.getAttribute("href") || "";
      if (currentRole === "leader" || currentRole === "manager") {
        // ซ่อนลิงก์ "แก้ไข/เพิ่ม ประวัติ" (Management) สำหรับผู้อนุมัติทั่วไป แต่ยังคงแสดง "หน้าหลัก" (Dashboard) ไว้ให้ใช้งานได้ปกติ
        if (href.includes("management.html")) {
          item.style.setProperty("display", "none", "important");
        } else {
          item.style.setProperty("display", "flex", "important");
        }
      } else {
        // แอดมินและฝ่ายบุคคลสามารถเห็นเมนูทั้งหมดได้
        item.style.setProperty("display", "flex", "important");
      }
    });
  }

  if (currentRole === "leader" || currentRole === "manager") {
    // แสดงแถบเมนูด้านข้างเสมอ เพื่อให้สามารถสลับเมนูและกดดูข้อมูลส่วนตัว/วันหยุดได้
    if (sidebar) {
      sidebar.style.display = "flex";
    }
    if (mainContent) {
      // ล้าง inline styles เพื่อให้สไตล์ CSS ปกติและระบบย่อขยายเมนูด้านข้าง (Collapsible Sidebar) ทำงานได้ปกติ
      mainContent.style.removeProperty("margin-left");
      mainContent.style.removeProperty("width");
      mainContent.style.removeProperty("padding");
    }
    if (btnBack) btnBack.style.display = "inline-flex";

    if (roleBadge) {
      const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
      const sessionUser = savedSession ? JSON.parse(savedSession) : {};
      const empCode = String(currentUserProfile?.employee_code || currentUserProfile?.employees?.employee_code || sessionUser?.employee_code || '').trim();
      if (empCode === '19122') {
        roleBadge.textContent = "ผู้จัดการฝ่ายบุคคล-ธุรการ (อนุมัติคนในแผนก)";
        const pageSubTitle = document.getElementById("pageSubTitle");
        if (pageSubTitle) pageSubTitle.textContent = "ฝ่ายบุคคล-ธุรการ (อนุมัติเฉพาะคนในแผนก)";
      } else {
        roleBadge.textContent = currentRole === "manager" ? "ผู้จัดการอนุมัติ (L2)" : "หัวหน้างานอนุมัติ (L1)";
      }
      roleBadge.className = "status-badge status-pending";
    }
  } else {
    if (sidebar) sidebar.style.display = "flex";
    if (mainContent) {
      mainContent.style.removeProperty("margin-left");
      mainContent.style.removeProperty("width");
      mainContent.style.removeProperty("padding");
    }
    if (btnBack) btnBack.style.display = "none";
    if (roleBadge) {
      roleBadge.textContent = "PVT HR Administrator";
      roleBadge.className = "status-badge status-approved";
    }
  }
}

/* ==========================================================================
   🛠️ HELPER FUNCTIONS & DATE UTILS
   ========================================================================== */

function getAvatarUrl(imageUrl) {
  if (imageUrl && imageUrl.trim() !== "") {
    let url = imageUrl;
    if (!url.startsWith("http")) {
      url = `https://pgogmhqjdchakcytsomx.supabase.co/storage/v1/object/public/employee-images/${url}`;
    }
    return url;
  }
  return "/assets/img/default-avatar.jpg";
}

function getAttachmentUrl(reqData) {
  if (!reqData) return null;
  let url = reqData.attachment_url || reqData.file_url || reqData.attachment || reqData.medical_certificate || null;
  if (!url || String(url).trim() === '' || url === 'null' || url === 'undefined') return null;
  
  url = String(url).trim();
  if (!url.startsWith('http') && !url.startsWith('data:')) {
    url = `https://pgogmhqjdchakcytsomx.supabase.co/storage/v1/object/public/leave-attachments/${url}`;
  }
  return url;
}

function isPendingStatus(status) {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s === 'pending' || s === 'รออนุมัติ' || s === 'wait' || s === 'waiting' || s.startsWith('pending_');
}

function isLeaderOrManagerRole(roleStr, posStr = '') {
  const r = String(roleStr || '').toLowerCase();
  const p = String(posStr || '').toLowerCase();
  return (
    r.includes('leader') || r.includes('supervisor') || r.includes('head') ||
    r.includes('manager') || r.includes('director') || r.includes('executive') || r.includes('owner') ||
    r.includes('ผู้จัดการ') || r.includes('หัวหน้า') || r.includes('ผู้บริหาร') ||
    p.includes('ผู้จัดการ') || p.includes('หัวหน้า') || p.includes('ผู้บริหาร') ||
    p.includes('ผู้อำนวยการ') || p.includes('ผจก')
  );
}

function isCancelRequestStatus(status) {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s === 'cancel_requested' || s === 'cancel_pending' || s === 'ขอยกเลิก' || s === 'รออนุมัติยกเลิก';
}

function isPendingForRole(r, role) {
  if (!isPendingStatus(r.status)) return false;

  // 🚫 ห้ามตรวจ/อนุมัติใบลาของตนเอง (Self-Leave Exclusion):
  // ผู้จัดการ/หัวหน้างานไม่สามารถตรวจหรืออนุมัติใบลาของตนเองได้ (ต้องส่งให้ผู้บริหาร L3 พิจารณา)
  const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
  const sessionUser = savedSession ? JSON.parse(savedSession) : {};
  const currentEmpId = currentUserProfile?.employees?.id || currentUserProfile?.id || sessionUser?.employees?.id || sessionUser?.id || sessionUser?.employee_id;
  const currentEmpIdStr = currentEmpId ? String(currentEmpId) : '';
  const currentEmpCode = String(currentUserProfile?.employee_code || sessionUser?.employee_code || '').trim();
  if (currentEmpIdStr && (String(r.employee_id || '') === currentEmpIdStr || String(r.employees?.id || '') === currentEmpIdStr)) {
    return false;
  }
  if (currentEmpCode && String(r.employees?.employee_code || '').trim() === currentEmpCode) {
    return false;
  }

  // 🌟 สำหรับ น.ส. ปณัยยา บุญเกิด (รหัส: 19122) ผู้จัดการฝ่ายบุคคล-ธุรการ:
  if (currentEmpCode === '19122') {
    const isDirectorPending = (r.director_status || 'pending') === 'pending';
    const isManagerPending = (r.manager_status || 'pending') === 'pending';
    // แสดงรายการที่รอการพิจารณา ตราบใดที่ยังไม่ได้ approved_by หรือสถานะยัง pending
    return isDirectorPending || isManagerPending || !r.approved_by;
  }

  const userRole = String(role || '').toLowerCase();
  if (userRole === 'leader') {
    return (r.manager_status || 'pending') === 'pending';
  }
  if (userRole === 'manager') {
    // Manager handles requests waiting for L2 (director_status pending)
    // OR requests waiting for L1 (manager_status pending) if in their scope
    const isDirectorPending = (r.director_status || 'pending') === 'pending';
    const isManagerPending = (r.manager_status || 'pending') === 'pending';
    return isDirectorPending || isManagerPending;
  }
  if (userRole === 'director' || userRole === 'executive' || userRole === 'owner') {
    return (r.executive_status || 'pending') === 'pending';
  }
  return true;
}
window.isPendingForRole = isPendingForRole;

function isHistoryForRole(r, role) {
  const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
  const sessionUser = savedSession ? JSON.parse(savedSession) : {};
  const currentEmpCode = String(currentUserProfile?.employee_code || sessionUser?.employee_code || '').trim();

  if (currentEmpCode === '19122') {
    if (!isPendingStatus(r.status) && !isCancelRequestStatus(r.status)) {
      return true;
    }
    if (isPendingStatus(r.status)) {
      return (r.director_status || 'pending') !== 'pending' && Boolean(r.approved_by);
    }
    return false;
  }

  const userRole = String(role || '').toLowerCase();
  if (!isPendingStatus(r.status) && !isCancelRequestStatus(r.status)) {
    return true;
  }
  if (isPendingStatus(r.status)) {
    if (userRole === 'leader') {
      return (r.manager_status || 'pending') !== 'pending';
    }
    if (userRole === 'manager') {
      return (r.director_status || 'pending') !== 'pending' && (r.manager_status || 'pending') !== 'pending';
    }
    if (userRole === 'director' || userRole === 'executive' || userRole === 'owner') {
      return (r.executive_status || 'pending') !== 'pending';
    }
  }
  return false;
}
window.isHistoryForRole = isHistoryForRole;

function getADYear(dateStr) {
  if (typeof window.getADYear === 'function' && window.getADYear !== getADYear) {
    return window.getADYear(dateStr);
  }
  if (!dateStr) {
    const now = new Date();
    return now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  }
  const str = String(dateStr).trim();
  const parts = str.split('T')[0].split('-');
  let yearPart = parseInt(parts[0], 10);
  if (isNaN(yearPart)) {
    const now = new Date();
    return now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  }
  if (yearPart > 2400) yearPart -= 543;
  if (parts.length >= 2 && parseInt(parts[1], 10) === 12) {
    yearPart += 1;
  }
  return yearPart;
}

async function calculateActualLeaveDays(startDateStr, endDateStr) {
  const sb = window.pvtSupabase?.getClient();
  if (!sb || !startDateStr || !endDateStr) return 0;

  try {
    const cleanStart = String(startDateStr).split('T')[0];
    const cleanEnd = String(endDateStr).split('T')[0];

    const { data: holidayData } = await sb
      .from('holidays') 
      .select('holiday_date')
      .gte('holiday_date', cleanStart)
      .lte('holiday_date', cleanEnd);

    const holidaySet = new Set(holidayData ? holidayData.map(h => String(h.holiday_date).split('T')[0]) : []);
    let totalDays = 0;

    const [sYear, sMonth, sDay] = cleanStart.split('-').map(Number);
    const [eYear, eMonth, eDay] = cleanEnd.split('-').map(Number);

    let start = new Date(sYear, sMonth - 1, sDay);
    const end = new Date(eYear, eMonth - 1, eDay);

    while (start <= end) {
      const dayOfWeek = start.getDay();
      const y = start.getFullYear();
      const m = String(start.getMonth() + 1).padStart(2, '0');
      const d = String(start.getDate()).padStart(2, '0');
      const currentIsoString = `${y}-${m}-${d}`;

      const isSunday = (dayOfWeek === 0);
      const isSaturday = (dayOfWeek === 6);
      const isSpecialHoliday = holidaySet.has(currentIsoString);

      if (!isSunday && !isSaturday && !isSpecialHoliday) {
        totalDays++;
      }
      start.setDate(start.getDate() + 1);
    }

    return totalDays;
  } catch (err) {
    console.error("💥 คำนวณวันลาผิดพลาด:", err);
    return 0;
  }
}

async function getEffectiveLeaveDays(reqData) {
  if (reqData.actual_days && Number(reqData.actual_days) > 0) return Number(reqData.actual_days);
  if (reqData.start_date && reqData.end_date) {
    const calc = await calculateActualLeaveDays(reqData.start_date, reqData.end_date);
    if (calc > 0) return calc;
  }
  return Number(reqData.total_days || 0);
}

function formatThaiDate(dateStr, showTime = false) {
  if (!dateStr) return "-";
  try {
    const cleanStr = String(dateStr).replace("Z", "");
    const dateObj = new Date(cleanStr);
    if (isNaN(dateObj.getTime())) return dateStr;

    const thaiMonths = [
      "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
      "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
    ];

    const day = dateObj.getDate();
    const month = thaiMonths[dateObj.getMonth()];
    const year = dateObj.getFullYear() + 543;

    let result = `${day} ${month} ${year}`;
    if (showTime) {
      const hours = String(dateObj.getHours()).padStart(2, "0");
      const mins = String(dateObj.getMinutes()).padStart(2, "0");
      result += ` เวลา ${hours}:${mins} น.`;
    }
    return result;
  } catch (e) {
    return dateStr;
  }
}

/**
 * ⏱️ คำนวณสถานะ SLA การพิจารณาอนุมัติใบลา
 * กฎบริษัท: หัวหน้างาน (L1) และ ผู้จัดการ (L2) ต้องพิจารณาอนุมัติภายใน 2 วันทำการ (48 ชม.)
 * หากเกินกำหนด 2 วัน ระบบจะระบุว่า "เกินกำหนด" / "ใบลาไม่ได้รับการพิจารณาในเวลาที่กำหนด"
 */
function getLeaveApprovalSLA(req) {
  if (!req || !req.created_at) {
    return { isOverdue: false, elapsedDays: 0, elapsedHours: 0, label: "" };
  }

  const st = String(req.status || '').toLowerCase();
  const isFinalApproved = (st === 'approved' || st === 'อนุมัติแล้ว');
  const isFinalRejected = (st === 'rejected' || st === 'ไม่อนุมัติ');
  const isCancelled = (st === 'cancelled' || st === 'ยกเลิก' || isCancelRequestStatus(st));

  // ถ้าสิ้นสุดกระบวนการแล้ว ไม่ถือว่าค้างพิจารณา
  if (isFinalApproved || isFinalRejected || isCancelled) {
    return { isOverdue: false, isClosed: true, elapsedDays: 0, elapsedHours: 0, label: "" };
  }

  const createdTime = new Date(req.created_at).getTime();
  const now = Date.now();
  if (isNaN(createdTime)) {
    return { isOverdue: false, elapsedDays: 0, elapsedHours: 0, label: "" };
  }

  const diffMs = now - createdTime;
  const elapsedHours = Math.max(0, diffMs / (1000 * 60 * 60));
  const elapsedDays = Math.floor(elapsedHours / 24);

  // เงื่อนไข: เกิน 2 วัน (>= 48 ชั่วโมง)
  const isOverdue = elapsedHours >= 48;

  return {
    isOverdue,
    elapsedHours: Math.round(elapsedHours * 10) / 10,
    elapsedDays,
    label: isOverdue 
      ? `เกินกำหนด (${elapsedDays} วัน)` 
      : `เหลือเวลาพิจารณา ${Math.max(0, Math.ceil(48 - elapsedHours))} ชม.`
  };
}
window.getLeaveApprovalSLA = getLeaveApprovalSLA;

function getStatusBadgeHTML(status) {
  const st = (status || 'pending').toLowerCase();
  if (st === 'approved' || st === 'อนุมัติแล้ว') {
    return `<span class="status-badge status-approved"><span class="material-symbols-outlined">check_circle</span> อนุมัติแล้ว</span>`;
  }
  if (st === 'rejected' || st === 'ไม่อนุมัติ') {
    return `<span class="status-badge status-rejected"><span class="material-symbols-outlined">cancel</span> ไม่อนุมัติ</span>`;
  }
  if (st === 'cancelled' || st === 'ยกเลิก') {
    return `<span class="status-badge status-cancelled"><span class="material-symbols-outlined">block</span> ยกเลิกแล้ว</span>`;
  }
  return `<span class="status-badge status-pending"><span class="material-symbols-outlined">schedule</span> รอพิจารณา</span>`;
}

/**
 * 🔀 คำนวณลำดับและรายการขั้นตอนการอนุมัติสำหรับใบลาแต่ละใบ
 * แผนกไหนไม่มี หัวหน้า (L1) หรือ ผู้จัดการ (L2) ให้ซ่อน/ตัดขั้นตอนนั้นออกไปเลย
 */
function getApprovalWorkflowSteps(req) {
  const reqEmp = req.employees || {};
  const reqDeptId = req.department_id || reqEmp.department_id;
  const deptInfo = (window.deptApproversMap && window.deptApproversMap[reqDeptId]) || 
                   (typeof deptApproversMap !== 'undefined' && deptApproversMap[reqDeptId]) || 
                   { hasLeader: false, hasManager: false };

  const deptName = String(req.departments?.department_name || reqEmp.departments?.department_name || '').toLowerCase();
  const applicantRole = String(reqEmp.role || '').toLowerCase();
  const applicantPos = String(reqEmp.positions?.position_name || '').toLowerCase();

  const isApplicantLeader = (applicantRole === 'leader' || applicantRole.includes('leader') || applicantRole.includes('supervisor') || applicantPos.includes('หัวหน้า')) && !applicantPos.includes('หัวหน้ากะ') && !applicantPos.includes('หัวหน้าส่วน');
  const isApplicantManager = applicantRole === 'manager' || applicantRole.includes('manager') || applicantPos.includes('ผู้จัดการ') || applicantPos.includes('ผจก');
  const isApplicantExecutive = applicantRole === 'director' || applicantRole === 'executive' || applicantRole === 'owner' || applicantPos.includes('ผู้บริหาร') || applicantPos.includes('ผู้อำนวยการ');
  const isHrDept = deptName.includes('บุคคล') || deptName.includes('hr') || deptName.includes('ทรัพยากรบุคคล') || applicantRole === 'hr' || applicantRole.includes('hr');

  // 1. ตรวจสอบขั้นตอน "หัวหน้า" (L1):
  // - แผนกบุคคล (HR) ไม่มีหัวหน้า มีแต่ผู้จัดการฝ่าย -> ซ่อน/ตัด L1 ออก 100%
  // - ซ่อน/ตัดออก ถ้าผู้ยื่นเป็นระดับหัวหน้า/ผู้จัดการ/ผู้บริหาร เองอยู่แล้ว
  // - หรือ แผนกนั้นไม่มีหัวหน้า (และไม่มีรายบุคคล l1_approver_id กำหนดไว้)
  let hasL1 = false;
  if (!isHrDept && !isApplicantLeader && !isApplicantManager && !isApplicantExecutive) {
    if (reqEmp.l1_approver_id) {
      hasL1 = true;
    } else {
      hasL1 = Boolean(deptInfo && deptInfo.hasLeader && deptInfo.supervisor_id);
    }
  }

  // 2. ตรวจสอบขั้นตอน "ผู้จัดการ" (L2):
  // - ซ่อน/ตัดออก ถ้าผู้ยื่นเป็นผู้จัดการ/ผู้บริหาร เองอยู่แล้ว
  // - แผนกบุคคล (HR) มีผู้จัดการฝ่าย (19122) เป็นผู้อนุมัติเสมอ
  let hasL2 = false;
  if (!isApplicantManager && !isApplicantExecutive) {
    if (isHrDept) {
      hasL2 = true;
    } else if (reqEmp.l2_approver_id) {
      hasL2 = true;
    } else {
      hasL2 = Boolean(deptInfo && (deptInfo.hasManager || deptInfo.manager_id));
    }
  }

  // 3. ตรวจสอบขั้นตอน "ผู้บริหาร" (L3):
  // - มีเฉพาะกรณี: มีการระบุ l3_approver_id เฉพาะบุคคล, หรือผู้ยื่นเป็นผู้จัดการฝ่าย (L2), หรือหัวหน้า (L1) ในแผนกที่ไม่มี L2
  // - พนักงานทั่วไป (รวมถึงพนักงานฝ่ายบุคคล) จะไม่ปรากฏขั้นตอน L3 ให้เกะกะสายตา
  let hasExecutive = false;
  if (typeof hasExecutiveColumn !== 'undefined' && hasExecutiveColumn) {
    if (reqEmp.l3_approver_id) {
      hasExecutive = true;
    } else if (isApplicantManager) {
      hasExecutive = true;
    } else if (isApplicantLeader && !hasL2) {
      hasExecutive = true;
    }
  }

  // สร้างลำดับขั้นตอนการอนุมัติเฉพาะขั้นตอนที่มีอยู่จริงในสายงาน
  const steps = [];

  if (hasL1) {
    steps.push({
      role: 'leader',
      shortName: 'หัวหน้าแผนก (L1)',
      fullName: 'หัวหน้างานชั้นต้น (L1: Leader / Supervisor)',
      status: req.manager_status || 'pending'
    });
  }

  if (hasL2) {
    steps.push({
      role: 'manager',
      shortName: 'ผู้จัดการฝ่าย (L2)',
      fullName: 'ผู้จัดการฝ่าย (L2: Director / Manager)',
      status: req.director_status || 'pending'
    });
  }

  if (hasExecutive) {
    steps.push({
      role: 'executive',
      shortName: 'ผู้บริหาร (L3)',
      fullName: 'ผู้บริหารสูงสุด (L3: Executive / MD)',
      status: req.executive_status || 'pending'
    });
  }

  return steps;
}
window.getApprovalWorkflowSteps = getApprovalWorkflowSteps;

/* ==========================================================================
   📊 2. DATA FETCHING & TAB BADGES
   ========================================================================== */

async function loadPendingLeavesHR(isSilent = false) {
  const container = document.getElementById("leaveListContainer");
  if (!container) return;

  const sb = window.pvtSupabase?.getClient();
  if (!sb) {
    if (!isSilent) {
      container.innerHTML = `<div class="empty-state">❌ ระบบฐานข้อมูลไม่พร้อมใช้งาน</div>`;
    }
    return;
  }

  try {
    // แสดงสถานะ Loading ระหว่างดึงข้อมูล
    if (!isSilent) {
      container.innerHTML = `
        <div style="padding: 100px 0; text-align: center; color: var(--text-soft);">
          <div class="pvt-loader" style="margin: 0 auto 20px;"></div>
          <p>กำลังดึงข้อมูลใบลา...</p>
        </div>`;
    }

    let queryResult = await sb
      .from("leave_requests")
      .select(`
        *,
        employees!employee_id ( 
          id, full_name, employee_code, nickname, role, image_url,
          department_id, l1_approver_id, l2_approver_id, l3_approver_id,
          departments!department_id (id, department_name), 
          positions!position_id (position_name, level_type) 
        ),
        leave_types!leave_type_id (id, leave_name, leave_code) 
      `)
      .order("created_at", { ascending: false });

    if (queryResult.error) {
      console.warn("⚠️ Complex Join Query Failed in HR load, retrying fallback fetch:", queryResult.error);
      const simpleRes = await sb.from("leave_requests").select("*").order("created_at", { ascending: false });
      if (simpleRes.data && simpleRes.data.length > 0) {
        try {
          const [empsRes, typesRes, deptsRes] = await Promise.all([
            sb.from("employees").select("id, full_name, employee_code, nickname, role, image_url, department_id, l1_approver_id, l2_approver_id, l3_approver_id, departments!department_id(id, department_name), positions!position_id(position_name, level_type)"),
            sb.from("leave_types").select("id, leave_name, leave_code"),
            sb.from("departments").select("id, department_name")
          ]);
          const deptIdMap = {};
          (deptsRes.data || []).forEach(d => { deptIdMap[d.id] = d.department_name; });
          const empMap = {};
          (empsRes.data || []).forEach(e => {
            if (e.department_id && !e.departments && deptIdMap[e.department_id]) {
              e.departments = { id: e.department_id, department_name: deptIdMap[e.department_id] };
            }
            empMap[e.id] = e;
          });
          const typeMap = {};
          (typesRes.data || []).forEach(t => { typeMap[t.id] = t; });

          queryResult = {
            data: simpleRes.data.map(r => {
              const emp = r.employees || empMap[r.employee_id] || null;
              if (emp && !emp.departments && emp.department_id && deptIdMap[emp.department_id]) {
                emp.departments = { id: emp.department_id, department_name: deptIdMap[emp.department_id] };
              }
              return {
                ...r,
                employees: emp,
                leave_types: r.leave_types || typeMap[r.leave_type_id] || null,
                department_name: r.department_name || emp?.departments?.department_name || (r.department_id ? deptIdMap[r.department_id] : '')
              };
            }),
            error: null
          };
        } catch(joinFallbackErr) {
          console.warn("Enrichment fallback failed:", joinFallbackErr);
          queryResult = simpleRes;
        }
      } else {
        queryResult = simpleRes;
      }
    }

    let rawData = queryResult.data || [];

    if ((queryResult.error || !rawData.length)) {
      try {
        const cached = localStorage.getItem("pvt_cached_hr_requests");
        if (cached) {
          rawData = JSON.parse(cached);
          console.log("📦 Loaded HR leave requests from local cache fallback.");
        }
      } catch(e) {}
    } else if (rawData.length) {
      try { localStorage.setItem("pvt_cached_hr_requests", JSON.stringify(rawData)); } catch(e) {}
    }
    console.log("[HR Load] Fetch success. Total records from DB:", rawData.length);

    // ⏱️ ตรวจสอบและตัดใบลาที่ค้างเกิน 2 วัน (48 ชม.) เป็น "ไม่อนุมัติ" อัตโนมัติ
    if (typeof window.autoRejectOverdueLeaves === 'function') {
      window.autoRejectOverdueLeaves();
    }

    const nowMs = Date.now();
    const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
    rawData = rawData.map(req => {
      const st = String(req.status || '').toLowerCase();
      const isPending = (st === 'pending' || st === 'pending_l1' || st === 'pending_l2' || st.includes('รออนุมัติ'));
      if (isPending && req.created_at) {
        const createdTime = new Date(req.created_at).getTime();
        if (!isNaN(createdTime) && (nowMs - createdTime >= TWO_DAYS_MS)) {
          return {
            ...req,
            status: 'rejected',
            approval_comment: req.approval_comment || 'เนื่องจากหัวหน้าไม่อนุมัติในเวลาที่กำหนด (เกิน 2 วัน)',
            rejected_at: req.rejected_at || new Date().toISOString()
          };
        }
      }
      return req;
    });

    // 🛡️ [Legacy Stuck Data Auto-Healing]: ตรวจหาใบลาเก่าที่เคยรอ HR อนุมัติ (หรือผ่านขั้นตอนทั้งหมดแล้วแต่ค้างอยู่) และปรับเป็นอนุมัติอัตโนมัติ
    rawData = rawData.map(req => {
      const st = String(req.status || '').toLowerCase();
      const isPending = (st === 'pending' || st === 'pending_l1' || st === 'pending_l2' || st === 'pending_hr' || st.includes('รออนุมัติ'));
      if (isPending) {
        // ดึงขั้นตอนการอนุมัติที่ควรจะมีจริงในระบบ ณ ปัจจุบัน
        const steps = getApprovalWorkflowSteps(req);
        if (steps.length > 0) {
          const allApproved = steps.every(step => {
            const stepSt = String(step.status || '').toLowerCase();
            return stepSt === 'approved' || stepSt === 'อนุมัติแล้ว';
          });

          // ⚠️ หากสถานะผู้บริหาร (L3) ยังรอพิจารณา ต้องห้าม auto-approve เด็ดขาด
          const reqExecSt = String(req.executive_status || '').toLowerCase();
          const isWaitingExecutive = (reqExecSt === 'pending' || reqExecSt === 'wait' || reqExecSt.includes('รอ'));
          
          if (allApproved && !isWaitingExecutive) {
            console.log(`💡 [Auto-Healing] ใบลา #${req.id} ผ่านการอนุมัติครบทุกระดับชั้นแล้ว (L1-L3) → ปรับสถานะเป็นอนุมัติเสร็จสิ้นโดยอัตโนมัติ`);
            // ยิงอัปเดตลงดาต้าเบสในเบื้องหลังแบบ non-blocking
            const sb = window.PVTSDK?.supabase;
            if (sb) {
              sb.from('leave_requests')
                .update({ status: 'approved', approved_at: new Date().toISOString() })
                .eq('id', req.id)
                .then(({ error }) => {
                  if (error) console.error(`💥 [Auto-Healing Fail]`, error);
                  else console.log(`✔️ [Auto-Healing DB Update Success] #${req.id}`);
                });
            }
            return {
              ...req,
              status: 'approved',
              approved_at: req.approved_at || new Date().toISOString()
            };
          }
        }
      }
      return req;
    });

    // ระบุตัวตนของผู้ใช้งานปัจจุบันให้ชัดเจน (ต้องเป็น Employee UUID)
    const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
    const sessionUser = savedSession ? JSON.parse(savedSession) : {};
    const myEmp = currentUserProfile?.employees || sessionUser?.employees || sessionUser || {};
    const currentEmpId = myEmp?.id;
    const currentEmpCode = String(myEmp?.employee_code || sessionUser?.employee_code || '').trim();
    let myDeptId = myEmp?.department_id || sessionUser?.department_id;
    let myDeptName = myEmp?.departments?.department_name || myEmp?.department_name || sessionUser?.department_name;
    if (currentEmpCode === '19122') {
      if (!myDeptId) myDeptId = 'a318f70f-8e24-4e36-958a-7726d6c9da4d';
      if (!myDeptName) myDeptName = 'บุคคล-ธุรการ';
    }

    const userRole = (currentRole || '').toLowerCase();
    const isHrOrAdmin = (userRole === "hr" || userRole === "admin") && currentEmpCode !== '19122';

    // ถ้าไม่ใช่ HR/Admin (หรือเป็นรหัส 19122) ให้กรองเห็นเฉพาะลูกน้อง (Subordinates) ตามโครงสร้างองค์กร
    if (!isHrOrAdmin || currentEmpCode === '19122') {
      console.log("[HR Load] Applying hierarchical filters for:", userRole, "EmpCode:", currentEmpCode);
      rawData = rawData.filter((req) => {
        const reqEmp = req.employees;
        if (!reqEmp) return false;

        const reqEmpId = String(reqEmp.id || req.employee_id || '');
        const currentEmpIdStr = currentEmpId ? String(currentEmpId) : '';
        const reqEmpRole = String(reqEmp.role || "").toLowerCase();
        const reqDeptId = reqEmp.department_id ? String(reqEmp.department_id) : '';
        const myDeptIdStr = myDeptId ? String(myDeptId) : '';
        // Resolve Department Names with robust fallback mapping
        let reqDeptName = String(reqEmp.departments?.department_name || req.department_name || '').toLowerCase();
        if (!reqDeptName && reqDeptId && window.allDepartmentsMap) {
          reqDeptName = String(window.allDepartmentsMap[reqDeptId] || '').toLowerCase();
        }
        let myDeptNameStr = String(myDeptName || '').toLowerCase();
        if (!myDeptNameStr && myDeptId && window.allDepartmentsMap) {
          myDeptNameStr = String(window.allDepartmentsMap[myDeptId] || '').toLowerCase();
        }

        // 🚫 ซ่อนใบลาของตนเองในหน้าตรวจใบลา (Self-Leave Exclusion):
        // ผู้จัดการหรือหัวหน้างานไม่ต้องเห็นใบลาของตนเองในหน้าตรวจใบลา
        // เพราะใบลาของผู้จัดการ/หัวหน้าฝ่ายจะต้องส่งให้ผู้บริหาร (Executive L3) เป็นผู้อนุมัติ
        // หากต้องการดูข้อมูลบริษัทในภาพรวม ให้เข้าสู่ระบบผ่านแอคเคาต์แยก
        const isSelf = currentEmpIdStr && (reqEmpId === currentEmpIdStr || String(req.employee_id || '') === currentEmpIdStr);
        if (isSelf) {
          return false;
        }

        // 🎯 ตรวจสอบความสอดคล้องของแผนก (Same Department Check)
        const isSameDept = Boolean(
          (myDeptIdStr && reqDeptId && myDeptIdStr === reqDeptId) ||
          (myDeptNameStr && reqDeptName && (
            myDeptNameStr === reqDeptName ||
            myDeptNameStr.includes(reqDeptName) ||
            reqDeptName.includes(myDeptNameStr)
          ))
        );

        const isHrDept = (
          reqDeptName.includes('บุคคล') || 
          reqDeptName.includes('ธุรการ') || 
          reqDeptName.includes('hr') || 
          reqDeptName.includes('human') || 
          reqDeptName.includes('personnel') || 
          reqDeptName.includes('admin') ||
          myDeptNameStr.includes('บุคคล') || 
          myDeptNameStr.includes('ธุรการ') || 
          myDeptNameStr.includes('hr')
        );

        // 🌟 พิเศษสำหรับ น.ส. ปณัยยา บุญเกิด (รหัส: 19122) ผู้จัดการฝ่าย - บุคคล-ธุรการ
        // มีแอคเคาต์แยกสำหรับ HR กลางในการดูข้อมูลรวม ดั้งนั้นแอคเคาต์นี้ให้เห็นเฉพาะใบลาของคนในแผนกตนเองเท่านั้น
        if (currentEmpCode === '19122') {
          const isHigherExec = ['director', 'executive', 'owner'].includes(reqEmpRole);
          const isMyHrDept = (
            reqDeptId === 'a318f70f-8e24-4e36-958a-7726d6c9da4d' ||
            isSameDept ||
            reqDeptName.includes('บุคคล') ||
            reqDeptName.includes('ธุรการ') ||
            reqDeptName.includes('hr')
          );
          return isMyHrDept && !isHigherExec;
        }

        // 🎯 ตรวจสอบว่าผู้ใช้งานปัจจุบันถูกระบุเป็นผู้อนุมัติโดยตรง (L1 / L2 / L3) หรือไม่
        const isDirectL1 = currentEmpIdStr && String(reqEmp.l1_approver_id || '') === currentEmpIdStr;
        const isDirectL2 = currentEmpIdStr && String(reqEmp.l2_approver_id || '') === currentEmpIdStr;
        const isDirectL3 = currentEmpIdStr && (
          String(reqEmp.l3_approver_id || '') === currentEmpIdStr ||
          String(window.executiveSetting?.employee_id || '') === currentEmpIdStr
        );
        if (isDirectL1 || isDirectL2 || isDirectL3) return true;

        // 🎯 ตรวจสอบการเป็นผู้จัดการ/หัวหน้าตามการตั้งค่าแผนก (deptApproversMap)
        const deptCfg = (window.deptApproversMap && reqDeptId) ? window.deptApproversMap[reqDeptId] : null;
        if (deptCfg) {
          if (currentEmpIdStr && (String(deptCfg.manager_id || '') === currentEmpIdStr || String(deptCfg.supervisor_id || '') === currentEmpIdStr)) {
            return true;
          }
        }

        let isSubordinate = false;
        const isHigherRole = ['director', 'executive', 'owner', 'superadmin'].includes(reqEmpRole);

        if (userRole === "leader") {
          // Leader เห็นพนักงานในแผนกเดียวกัน
          const isNotLeaderOrHigher = !['leader', 'manager', 'director', 'executive', 'owner'].includes(reqEmpRole);
          isSubordinate = isSameDept && isNotLeaderOrHigher;
        } 
        else if (userRole === "manager") {
          // Manager เห็นพนักงานและหัวหน้างานในแผนกตัวเอง
          isSubordinate = isSameDept && !isHigherRole;
        } 
        else if (userRole === "director" || userRole === "executive" || userRole === "owner" || isDirectL3) {
          // ระดับบริหาร เห็นทุกแผนกทั่วองค์กร
          isSubordinate = true; 
        } else {
          // กรณี role อื่นๆ ให้ดูคนในแผนกเดียวกันได้ถ้าได้รับสิทธิ์
          isSubordinate = isSameDept;
        }

        return isSubordinate;
      });
      console.log("[HR Load] Post-filter records:", rawData.length);
    }

    allLeaveRequests = rawData;
    hasExecutiveColumn = true;
    
    updateTabAndStatBadges();
    renderLeaveTable();

    // ⏱️ อัปเดตและแสดงผล SLA Countdown Tracker สำหรับรายการรอพิจารณาของผู้ใช้ปัจจุบัน
    if (typeof window.renderLeaveSlaTracker === 'function') {
      const pendingForRoleRequests = allLeaveRequests.filter(r => isPendingForRole(r, currentRole));
      window.renderLeaveSlaTracker("leaveSlaTrackerContainer", pendingForRoleRequests);
    }

    // 💡 จัดการการแสดงผลตาราง: ยุบตารางล่างเมื่ออยู่ในแท็บ 'รออนุมัติ' (SLA Tracker ทำหน้าที่แทน)
    const leaveTablePanel = document.getElementById("leaveTablePanel");
    const slaContainer = document.getElementById("leaveSlaTrackerContainer");
    if (currentLeaveTab === 'pending') {
      if (slaContainer) slaContainer.style.display = "block";
      if (leaveTablePanel) leaveTablePanel.style.display = "none";
    } else {
      if (slaContainer) slaContainer.style.display = "none";
      if (leaveTablePanel) leaveTablePanel.style.display = "block";
    }

  } catch (err) {
    console.error("💥 Critical Failure in loadPendingLeavesHR:", err);
    if (container) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 60px 20px;">
          <span class="material-symbols-outlined" style="font-size: 48px; color: var(--danger); margin-bottom: 16px;">error</span>
          <h3 style="margin-bottom: 8px;">ไม่สามารถโหลดข้อมูลได้</h3>
          <p style="color: var(--text-soft); font-size: 14px;">${err.message}</p>
          <button onclick="loadPendingLeavesHR()" class="btn-primary" style="margin-top: 20px; padding: 8px 24px;">🔄 ลองใหม่อีกครั้ง</button>
        </div>`;
    }
  }
}

function updateTabAndStatBadges() {
  const pendingRequests = allLeaveRequests.filter(r => isPendingForRole(r, currentRole));
  const cancelRequests = allLeaveRequests.filter(r => isCancelRequestStatus(r.status));
  const approvedRequests = allLeaveRequests.filter(r => String(r.status).toLowerCase() === 'approved');
  const historyRequests = allLeaveRequests.filter(r => isHistoryForRole(r, currentRole));

  const pBadge = document.getElementById("pendingCountBadge");
  const cBadge = document.getElementById("cancelCountBadge");
  const hBadge = document.getElementById("historyCountBadge");

  if (pBadge) pBadge.textContent = pendingRequests.length;
  if (cBadge) cBadge.textContent = cancelRequests.length;
  if (hBadge) hBadge.textContent = historyRequests.length;

  document.getElementById("statPendingCount") && (document.getElementById("statPendingCount").innerHTML = `${pendingRequests.length} <small>รายการ</small>`);
  document.getElementById("statCancelCount") && (document.getElementById("statCancelCount").innerHTML = `${cancelRequests.length} <small>รายการ</small>`);
  document.getElementById("statApprovedCount") && (document.getElementById("statApprovedCount").innerHTML = `${approvedRequests.length} <small>รายการ</small>`);
  document.getElementById("statTotalCount") && (document.getElementById("statTotalCount").innerHTML = `${allLeaveRequests.length} <small>รายการ</small>`);
}

window.switchLeaveTab = function(tabName, btnEl) {
  currentLeaveTab = tabName;
  
  document.querySelectorAll('.leave-tab-container .tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const headerTitle = document.getElementById("sectionHeaderTitle");
  const headerIcon = document.getElementById("sectionHeaderIcon");
  const slaContainer = document.getElementById("leaveSlaTrackerContainer");
  const leaveTablePanel = document.getElementById("leaveTablePanel");

  if (tabName === 'pending') {
    if (headerTitle) headerTitle.textContent = "คำขออนุมัติลาค้างพิจารณา";
    if (headerIcon) headerIcon.textContent = "hourglass_top";
    if (slaContainer) slaContainer.style.display = "block";
    // 💡 ยุบตารางล่างเมื่ออยู่ในแท็บ 'รออนุมัติ' (SLA Tracker ทำหน้าที่แทน)
    if (leaveTablePanel) leaveTablePanel.style.display = "none";
  } else if (tabName === 'cancellation') {
    if (headerTitle) headerTitle.textContent = "คำร้องขอยกเลิกใบลาหยุดงาน";
    if (headerIcon) headerIcon.textContent = "published_with_changes";
    if (slaContainer) slaContainer.style.display = "none";
    if (leaveTablePanel) leaveTablePanel.style.display = "block";
    renderLeaveTable();
  } else {
    if (headerTitle) headerTitle.textContent = "ประวัติการพิจารณาใบลาทั้งหมด";
    if (headerIcon) headerIcon.textContent = "history";
    if (slaContainer) slaContainer.style.display = "none";
    if (leaveTablePanel) leaveTablePanel.style.display = "block";
    renderLeaveTable();
  }
};

/* ==========================================================================
   🔒 SEQUENTIAL APPROVAL GUARD (UPDATED FOR FLEXIBLE WORKFLOW)
   ========================================================================== */

function canApproveStep(req, role) {
  // ดึงข้อมูลผู้ใช้งานปัจจุบันที่กำลังกดปุ่ม
  const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
  const sessionUser = savedSession ? JSON.parse(savedSession) : {};
  const empData = currentUserProfile?.employees || sessionUser?.employees || sessionUser || {};
  const currentEmpId = empData?.id || empData?.employee_id || currentUserProfile?.employee_id;
  const rawRole = String(empData?.role || sessionUser?.role || role || '').toLowerCase();

  const isAdminOrSuper = rawRole === 'admin' || rawRole === 'superadmin' || role === 'admin';

  // 🛑 1. ป้องกันการกดอนุมัติใบลาของตัวเอง (Self-Approval Guard) - ยกเว้น Admin สำหรับทดสอบ
  if (!isAdminOrSuper && currentEmpId && String(req.employee_id) === String(currentEmpId)) {
    Swal.fire({
      title: 'ไม่สามารถทำรายการได้',
      text: 'คุณไม่สามารถกดอนุมัติใบลาของตนเองได้ กรุณาให้ผู้จัดการฝ่าย หรือ ผู้บริหาร/HR เป็นผู้อนุมัติ',
      icon: 'warning',
      confirmButtonColor: '#06b6d4'
    });
    return false;
  }

  // ดึงสถานะปัจจุบันของแต่ละขั้น
  const isL1Approved = req.manager_status === 'approved';
  const isL2Approved = req.director_status === 'approved';
  const isL3Approved = req.executive_status === 'approved';
  const isFinalApproved = req.status === 'approved';

  if (isFinalApproved) {
    Swal.fire('ดำเนินการแล้ว', 'คำขอนี้ได้รับการอนุมัติเรียบร้อยแล้ว', 'info');
    return false;
  }

  // 🟡 2. Admin / Superadmin / Executive L3 สามารถอนุมัติได้เสมอ
  const isExecutiveUser = (
    role === 'director' || role === 'executive' || role === 'owner' || role === 'admin' || isAdminOrSuper ||
    (currentEmpId && (
      String(currentEmpId) === String(window.executiveSetting?.employee_id || '') ||
      String(currentEmpId) === String(window.executiveApproverId || '')
    ))
  );

  if (isExecutiveUser) {
    if (isL3Approved && isFinalApproved) {
      Swal.fire('ดำเนินการแล้ว', 'คำขอนี้ได้รับการอนุมัติเรียบร้อยแล้ว', 'info');
      return false;
    }
    return true;
  }

  // 🔵 3. กรณีหัวหน้างาน (L1 Leader) กำลังพิจารณา
  if (role === 'leader') {
    if (isL1Approved) {
      Swal.fire('ดำเนินการแล้ว', 'คำขอนี้หัวหน้างาน (L1) ได้พิจารณาอนุมัติเรียบร้อยแล้ว อยู่ในขั้นตอนของผู้จัดการฝ่าย/ผู้บริหาร', 'info');
      return false;
    }
  }

  // 🔵 4. กรณีผู้จัดการ (L2 Manager) กำลังพิจารณา
  if (role === 'manager') {
    if (isL2Approved && isL3Approved) {
      Swal.fire('ดำเนินการแล้ว', 'คำขอนี้ได้รับการอนุมัติเรียบร้อยแล้ว', 'info');
      return false;
    }
  }

  return true;
}

/* ==========================================================================
   🖼️ 4. RENDER TABLE DATA
   ========================================================================== */

function renderLeaveTable() {
  const container = document.getElementById("leaveListContainer");
  const stepFilter = document.getElementById("filterStepSelect")?.value || "all";
  if (!container) return;

  const selectFilter = document.getElementById("filterStepSelect");
  if (selectFilter) {
    if (hasExecutiveColumn && !selectFilter.dataset.hasExecutive) {
      selectFilter.dataset.hasExecutive = "true";
      selectFilter.innerHTML = `
        <option value="all">-- แสดงทั้งหมด --</option>
        <option value="overdue">⚠️ ค้างพิจารณาเกิน 2 วัน (เกินกำหนด)</option>
        <option value="pending_manager">1. รอหัวหน้าแผนกอนุมัติ (L1)</option>
        <option value="pending_director">2. หัวหน้าผ่านแล้ว / รอผู้จัดการอนุมัติ (L2)</option>
        <option value="pending_executive">3. ผู้จัดการผ่านแล้ว / รอผู้บริหารอนุมัติ (L3)</option>
        <option value="fully_approved">อนุมัติครบทุกระดับแล้ว</option>
        <option value="rejected">ถูกปฏิเสธ (Rejected)</option>
      `;
    } else if (!hasExecutiveColumn && selectFilter.dataset.hasExecutive) {
      delete selectFilter.dataset.hasExecutive;
      selectFilter.innerHTML = `
        <option value="all">-- แสดงทั้งหมด --</option>
        <option value="overdue">⚠️ ค้างพิจารณาเกิน 2 วัน (เกินกำหนด)</option>
        <option value="pending_manager">1. รอหัวหน้าแผนกอนุมัติ (L1)</option>
        <option value="pending_director">2. หัวหน้าผ่านแล้ว / รอผู้จัดการอนุมัติ (L2)</option>
        <option value="fully_approved">อนุมัติครบทุกระดับแล้ว</option>
        <option value="rejected">ถูกปฏิเสธ (Rejected)</option>
      `;
    }
  }

  let filteredRequests = [];

  if (currentLeaveTab === "pending") {
    filteredRequests = allLeaveRequests.filter(r => isPendingForRole(r, currentRole));
  } else if (currentLeaveTab === "cancellation") {
    filteredRequests = allLeaveRequests.filter(r => isCancelRequestStatus(r.status));
  } else {
    filteredRequests = allLeaveRequests.filter(r => isHistoryForRole(r, currentRole));
  }

  // 🔍 Real-time Search Filter
  const searchTerm = (document.getElementById("hrLeaveSearchInput")?.value || "").trim().toLowerCase();
  if (searchTerm) {
    filteredRequests = filteredRequests.filter(r => {
      const eName = (r.employees?.full_name || "").toLowerCase();
      const eCode = (r.employees?.employee_code || "").toLowerCase();
      const eDept = (r.employees?.departments?.department_name || "").toLowerCase();
      const ePos = (r.employees?.positions?.position_name || "").toLowerCase();
      const lType = (r.leave_types?.leave_name || "").toLowerCase();
      const reason = (r.reason || "").toLowerCase();
      return eName.includes(searchTerm) || eCode.includes(searchTerm) || 
             eDept.includes(searchTerm) || ePos.includes(searchTerm) || 
             lType.includes(searchTerm) || reason.includes(searchTerm);
    });
  }

  if (stepFilter !== "all") {
    filteredRequests = filteredRequests.filter(req => {
      const sla = getLeaveApprovalSLA(req);
      if (stepFilter === "overdue") {
        return sla.isOverdue;
      }

      const mStatus = req.manager_status || 'pending';
      const dStatus = req.director_status || 'pending';
      const execStatus = req.executive_status || 'pending';
      const hrStatus = req.status || 'pending';

      const isApplicantLeaderOrManager = isLeaderOrManagerRole(req.employees?.role, req.employees?.positions?.position_name);

      if (stepFilter === "pending_manager") return mStatus === 'pending';
      if (stepFilter === "pending_director") return mStatus === 'approved' && dStatus === 'pending';
      if (stepFilter === "pending_executive") {
        if (!isApplicantLeaderOrManager) return false;
        return mStatus === 'approved' && dStatus === 'approved' && execStatus === 'pending';
      }
      if (stepFilter === "pending_hr") {
        if (hasExecutiveColumn) {
          if (isApplicantLeaderOrManager) {
            return mStatus === 'approved' && dStatus === 'approved' && execStatus === 'approved' && hrStatus === 'pending';
          } else {
            return mStatus === 'approved' && dStatus === 'approved' && hrStatus === 'pending';
          }
        } else {
          return mStatus === 'approved' && dStatus === 'approved' && hrStatus === 'pending';
        }
      }
      if (stepFilter === "fully_approved") return hrStatus === 'approved';
      if (stepFilter === "rejected") {
        return mStatus === 'rejected' || dStatus === 'rejected' || execStatus === 'rejected' || hrStatus === 'rejected';
      }
      return true;
    });
  }

  if (filteredRequests.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 80px 20px; text-align: center; color: var(--text-soft); font-style: italic;">
      <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.2; display: block; margin-bottom: 12px;">inbox</span>
      ไม่พบรายการใบลาตามเงื่อนไขที่เลือก
    </div>`;
    return;
  }

  let cardsContent = "";

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

  filteredRequests.forEach((req) => {
    const rawEmpName = req.employees ? req.employees.full_name : "ไม่ทราบชื่อ";
    const rawEmpCode = req.employees ? req.employees.employee_code : "-";
    let rawDeptName = req.employees?.departments?.department_name || req.department_name || "";
    if (!rawDeptName && req.employees?.department_id && window.allDepartmentsMap) {
      rawDeptName = window.allDepartmentsMap[req.employees.department_id] || "";
    }
    if (!rawDeptName) rawDeptName = "-";
    const rawPositionName = req.employees?.positions?.position_name || "-";
    const rawLeaveType = req.leave_types ? req.leave_types.leave_name : "ไม่ระบุ";

    const empName = highlightMatch(rawEmpName, searchTerm);
    const empCode = highlightMatch(rawEmpCode, searchTerm);
    const empDeptName = highlightMatch(rawDeptName, searchTerm);
    const empPositionName = highlightMatch(rawPositionName, searchTerm);
    const leaveType = highlightMatch(rawLeaveType, searchTerm);
    const reasonText = highlightMatch(req.reason || "-", searchTerm);

    const startDate = formatThaiDate(req.start_date);
    const endDate = formatThaiDate(req.end_date);
    const avatarUrl = getAvatarUrl(req.employees?.image_url);
    const rawDays = req.actual_days || req.days_requested || req.total_days || 0;
    const leaveHours = req.leave_hours || 0;
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
      durationText = parts.length > 0 ? parts.join(" ") : `${leaveHours} ชม.`;
    } else if (rawDays % 1 !== 0) {
      const wholeDays = Math.floor(rawDays);
      const totalH = (rawDays - wholeDays) * 8;
      const wholeH = Math.floor(totalH);
      const mins = Math.round((totalH - wholeH) * 60);
      let parts = [];
      if (wholeDays > 0) parts.push(`${wholeDays} วัน`);
      if (wholeH > 0) parts.push(`${wholeH} ชม.`);
      if (mins > 0) parts.push(`${mins} นาที`);
      durationText = parts.length > 0 ? parts.join(" ") : `${rawDays} วัน`;
    }
    const attachmentUrl = getAttachmentUrl(req);

    // ⏱️ คำนวณ SLA การพิจารณาอนุมัติ 2 วัน
    const sla = getLeaveApprovalSLA(req);
    const isOverdue = sla.isOverdue;

    let actionButtons = "";

    const isHrOrAdmin = (currentRole === 'hr' || currentRole === 'admin');

    if (currentLeaveTab === "cancellation") {
      actionButtons = `
        <div class="action-btn-group">
          <button class="btn-act btn-act-preview" onclick="previewLeaveModal('${req.id}')" title="ดูรายละเอียด"><span class="material-symbols-outlined">visibility</span></button>
          <button class="btn-act btn-act-print" onclick="printLeaveA4('${req.id}')" title="พิมพ์ใบลา" style="background:#f1f5f9; color:#475569; border-color:#e2e8f0;"><span class="material-symbols-outlined">print</span></button>
          ${!isHrOrAdmin ? `
            <button class="btn-act btn-act-approve" onclick="approveCancellation('${req.id}')"><span class="material-symbols-outlined">check_circle</span> อนุมัติยกเลิก</button>
            <button class="btn-act btn-act-reject" onclick="rejectCancellation('${req.id}')"><span class="material-symbols-outlined">cancel</span> ปฏิเสธ</button>
          ` : ''}
        </div>
      `;
    } else if (currentLeaveTab === "history") {
      const userRoleLower = String(currentRole || '').toLowerCase();
      // Even if HR/Admin could force cancel in the past, let's keep it or remove it depending on intent. The user said: "มีหน้าที่แค่ดูข้อมูลไม่ต้องอนุมัติใบลา แก้ให้หมดนะด่วนๆ" (only has role to view data, does not approve leave). They can keep print and preview.
      const canForceCancel = !isHrOrAdmin && (userRoleLower === 'superadmin');
      actionButtons = `
        <div class="action-btn-group">
          <button class="btn-act btn-act-preview" onclick="previewLeaveModal('${req.id}')" title="ดูรายละเอียด"><span class="material-symbols-outlined">visibility</span><span class="btn-text"> รายละเอียด</span></button>
          <button class="btn-act btn-act-print" onclick="printLeaveA4('${req.id}')" title="พิมพ์ใบลา" style="background:#f1f5f9; color:#475569; border-color:#e2e8f0;"><span class="material-symbols-outlined">print</span><span class="btn-text"> พิมพ์</span></button>
          ${(req.status === 'approved' && canForceCancel) ? `
            <button class="btn-act btn-act-cancel" onclick="forceCancelLeave('${req.id}')"><span class="material-symbols-outlined">block</span> ยกเลิกใบลา</button>
          ` : ''}
        </div>
      `;
    } else {
      actionButtons = `
        <div class="action-btn-group">
          <button class="btn-act btn-act-preview" onclick="previewLeaveModal('${req.id}')" title="ดูรายละเอียด"><span class="material-symbols-outlined">visibility</span></button>
          <button class="btn-act btn-act-print" onclick="printLeaveA4('${req.id}')" title="พิมพ์ใบลา" style="background:#f1f5f9; color:#475569; border-color:#e2e8f0;"><span class="material-symbols-outlined">print</span></button>
          ${!isHrOrAdmin ? `
            <button class="btn-act btn-act-approve" onclick="approveLeave('${req.id}')" title="อนุมัติ"><span class="material-symbols-outlined">check_circle</span> อนุมัติ</button>
            <button class="btn-act btn-act-reject" onclick="rejectLeave('${req.id}')" title="ปฏิเสธ"><span class="material-symbols-outlined">cancel</span> ไม่อนุมัติ</button>
          ` : ''}
        </div>
      `;
    }

    const isApplicantLeaderOrManager = isLeaderOrManagerRole(req.employees?.role, req.employees?.positions?.position_name);
    let executiveStatusHTML = "-";
    if (isApplicantLeaderOrManager) {
      executiveStatusHTML = getStatusBadgeHTML(req.executive_status);
    }

    const isPendingTab = (currentLeaveTab === "pending" && currentRole !== 'hr' && currentRole !== 'admin');
    const checkboxHTML = isPendingTab ? `
      <div class="bulk-check-wrapper" style="display: flex; align-items: center; justify-content: center; padding-right: 12px; margin-right: 4px;">
        <input type="checkbox" class="bulk-item-check" data-id="${req.id}" onclick="handleBulkItemCheckChange()" style="width: 18px; height: 18px; cursor: pointer; accent-color: #0d9488;">
      </div>
    ` : '';

    cardsContent += `
      <div class="leave-card-item ${isOverdue ? 'is-overdue' : ''}">
        <!-- Zone 1: Profile & Emp Info -->
        <div class="card-zone profile-zone" style="display: flex; align-items: center;">
          ${checkboxHTML}
          <img src="${avatarUrl}" class="card-avatar" onerror="this.src='/assets/img/default-avatar.jpg';">
          <div class="profile-info">
            <span class="emp-code">#${empCode}</span>
            <strong class="emp-name">${empName}</strong>
            <span class="emp-dept">📂 ${empDeptName} · 💼 ${empPositionName}</span>
          </div>
        </div>

        <!-- Zone 2: Leave Details -->
        <div class="card-zone details-zone">
          <div class="detail-row">
            <span class="label">ประเภท:</span>
            <span class="val-highlight">${leaveType} (${durationText})</span>
          </div>
          <div class="detail-row">
            <span class="label">วันที่:</span>
            <span class="val">${startDate} ถึง ${endDate}</span>
          </div>
          <div class="detail-row reason-row" ${req.is_emergency ? 'style="background: #fef2f2; padding: 6px 8px; border-radius: 8px; border: 1px solid #fecaca;"' : ''}>
            <span class="label">เหตุผล:</span>
            <span class="val text-truncate-2" ${req.is_emergency ? 'style="color: #b91c1c; font-weight: 700;"' : ''}>
              ${req.is_emergency ? '<span style="background: #ef4444; color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 6px; font-weight: 800; margin-right: 4px; display: inline-block;">🚨 ฉุกเฉิน</span>' : ''}${reasonText}
            </span>
            <div class="attachment-trigger">
              ${renderAttachmentCell(attachmentUrl, req.id)}
            </div>
          </div>
          ${isOverdue ? `
            <div class="overdue-alert-box">
              <span class="material-symbols-outlined" style="font-size: 16px; flex-shrink: 0; color: #ea580c;">timer_off</span>
              <div>
                <strong>ใบลาไม่ได้รับการพิจารณาในเวลาที่กำหนด:</strong> ค้างพิจารณามาแล้ว <strong>${sla.elapsedDays} วัน</strong> (กำหนดหัวหน้าและผู้จัดการอนุมัติภายใน 2 วัน)
              </div>
            </div>
          ` : ''}
          ${(req.cancel_reason || (req.approval_comment && req.approval_comment.includes('ยกเลิก')) || req.status === 'cancelled') ? `
            <div class="cancellation-reason-box" style="margin-top: 6px; padding: 6px 10px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; font-size: 12px; color: #be123c; display: flex; align-items: flex-start; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 16px; margin-top: 1px; flex-shrink: 0;">info</span>
              <div>
                <strong>เหตุผลที่ยกเลิก:</strong> ${escapeHtml(req.cancel_reason || req.approval_comment || 'ไม่ได้ระบุเหตุผล')}
              </div>
            </div>
          ` : ''}
          ${(req.status === 'rejected' && req.approval_comment && !req.approval_comment.includes('ยกเลิก')) ? `
            <div class="rejection-reason-box" style="margin-top: 6px; padding: 6px 10px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; font-size: 12px; color: #be123c; display: flex; align-items: flex-start; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 16px; margin-top: 1px; flex-shrink: 0;">cancel</span>
              <div>
                <strong>เหตุผลที่ไม่อนุมัติ:</strong> ${escapeHtml(req.approval_comment)}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Zone 3: Approval Steps (ซ่อน L1/L2 หากแผนกไม่มีผู้รับผิดชอบในระดับนั้น) -->
        <div class="card-zone status-zone">
          ${(() => {
            const workflowSteps = getApprovalWorkflowSteps(req);
            const gridStyle = workflowSteps.length <= 2 
              ? `grid-template-columns: repeat(${workflowSteps.length}, 1fr);` 
              : '';
            return `
              <div class="status-steps-grid" style="${gridStyle}">
                ${workflowSteps.map((step, idx) => `
                  <div class="step-item">
                    <span class="step-lbl">${step.shortName} (L${idx + 1})</span>
                    ${getStatusBadgeHTML(step.status)}
                  </div>
                `).join('')}
              </div>
              ${isOverdue ? `
                <div style="margin-top: 6px; text-align: center;">
                  <span class="status-badge status-overdue" style="font-size: 11px; padding: 2px 8px;" title="เกินกรอบเวลาพิจารณา 2 วัน">
                    <span class="material-symbols-outlined" style="font-size: 13px;">timer_off</span> เกินกำหนด (${sla.elapsedDays} วัน)
                  </span>
                </div>
              ` : ''}
            `;
          })()}
        </div>

        <!-- Zone 4: Actions -->
        <div class="card-zone actions-zone">
          ${actionButtons}
        </div>
      </div>
    `;
  });

  // สร้างส่วน Header ของรายการ (ใช้สำหรับ Desktop ให้ดูเป็นระเบียบ)
  const listHeader = `
    <div class="leave-list-header">
      <div class="col-profile">ผู้ขอลา / ข้อมูลพนักงาน</div>
      <div class="col-details">รายละเอียดการลา / ช่วงเวลา</div>
      <div class="col-status-group">สถานะการอนุมัติ (L1-L3)</div>
      <div class="col-actions">การจัดการ</div>
    </div>
  `;
  container.innerHTML = listHeader + `<div class="leave-cards-container">${cardsContent}</div>`;

  // Update Bulk Action Bar visibility
  const bulkBar = document.getElementById("bulkActionBar");
  if (bulkBar) {
    if (currentLeaveTab === "pending" && filteredRequests.length > 0 && currentRole !== 'hr' && currentRole !== 'admin') {
      bulkBar.style.display = "flex";
      // Reset select all checkbox
      const selectAllCheckbox = document.getElementById("selectAllBulk");
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      document.getElementById("bulkSelectedCount").innerText = "เลือกแล้ว 0 รายการ";
    } else {
      bulkBar.style.display = "none";
    }
  }
}

/* ==========================================================================
   🖼️ ATTACHMENT CELL & LIGHTBOX PREVIEW
   ========================================================================== */

function renderAttachmentCell(rawUrl, rowId) {
  if (!rawUrl) {
    return `
      <span class="status-badge status-cancelled" style="font-size: 11px;">
        <span class="material-symbols-outlined" style="font-size:13px;">no_photography</span> ไม่มี
      </span>`;
  }

  const cleanUrl = String(rawUrl).trim();
  const isImage = /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(cleanUrl) || cleanUrl.startsWith('data:image/');

  if (isImage) {
    return `
      <button type="button" class="btn-act btn-act-preview" onclick="openImageLightbox('${cleanUrl}', 'หลักฐานการลา #${rowId}')" title="ดูรูปภาพ">
        <span class="material-symbols-outlined">image</span> ดูรูป
      </button>`;
  }

  return `
    <a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="btn-act btn-act-print" style="text-decoration:none;">
      <span class="material-symbols-outlined">description</span> เปิดไฟล์
    </a>`;
}

function openImageLightbox(imgUrl, titleText = 'หลักฐานการลา') {
  const existingModal = document.getElementById('imageLightboxModal');
  if (existingModal) existingModal.remove();

  const modalHtml = `
    <div id="imageLightboxModal" class="pvt-modal-overlay active" onclick="closeImageLightbox(event)" style="z-index: 99999;">
      <div class="pvt-modal-card" style="max-width: 800px; width: 90%; text-align: center;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3><span class="material-symbols-outlined">image</span> ${titleText}</h3>
          <button class="modal-close-btn" onclick="closeImageLightbox()">&times;</button>
        </div>
        <div class="modal-body" style="padding: 16px;">
          <img src="${imgUrl}" alt="หลักฐานขยาย" style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 12px; box-shadow: var(--shadow-md);" />
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  document.addEventListener('keydown', handleEscKey);
}

function closeImageLightbox(e) {
  const modal = document.getElementById('imageLightboxModal');
  if (modal) modal.remove();
  document.removeEventListener('keydown', handleEscKey);
}

function handleEscKey(e) {
  if (e.key === 'Escape') closeImageLightbox();
}

/* ==========================================================================
   👁️ 5. MODAL PREVIEW & LEAVE DETAILS
   ========================================================================== */

function previewLeaveModal(leaveId, isReviewMode = false) {
  const req = allLeaveRequests.find(r => String(r.id) === String(leaveId));
  if (!req) return;

  const modal = document.getElementById("leavePreviewModal");
  const modalBody = document.getElementById("leavePreviewModalBody");
  const modalFooter = document.getElementById("leavePreviewModalFooter");
  const modalHeaderTitle = document.querySelector("#leavePreviewModal .modal-header h3");

  if (!modal || !modalBody) return;

  if (modalHeaderTitle) {
    modalHeaderTitle.innerHTML = isReviewMode
      ? '<span class="material-symbols-outlined" style="color: #0d9488;">gavel</span> พิจารณาอนุมัติคำขอลาหยุดงาน'
      : '<span class="material-symbols-outlined">description</span> ตรวจสอบรายละเอียดใบขออนุมัติลา';
  }

  const emp = req.employees || {};
  const avatarUrl = getAvatarUrl(emp.image_url);
  const displayDays = req.actual_days || req.days_requested || req.total_days || 0;
  const friendlyDuration = window.PVTSDK?.formatLeaveDurationFriendly ? window.PVTSDK.formatLeaveDurationFriendly(displayDays, req.leave_hours || 0) : `${displayDays} วัน`;
  const leaveName = req.leave_types ? req.leave_types.leave_name : "ไม่ระบุประเภทการลา";
  const attachUrl = getAttachmentUrl(req);
  const isImage = attachUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(attachUrl.split('?')[0]);

  const sla = getLeaveApprovalSLA(req);
  const isOverdue = sla.isOverdue;
  const isPending = (!req.status || req.status === 'pending' || req.status === 'รออนุมัติ') && currentRole !== 'hr' && currentRole !== 'admin';

  modalBody.innerHTML = `
    <div class="preview-user-card">
      <img src="${avatarUrl}" class="preview-avatar" onerror="this.src='/assets/img/default-avatar.jpg';">
      <div class="preview-user-info">
        <h4>${emp.full_name || 'ไม่ระบุชื่อ'} ${emp.nickname ? `(${emp.nickname})` : ''}</h4>
        <p>รหัสพนักงาน: <strong>${emp.employee_code || '-'}</strong> | แผนก: ${emp.departments?.department_name || '-'} | ตำแหน่ง: ${emp.positions?.position_name || '-'}</p>
      </div>
    </div>

    ${isOverdue ? `
      <div class="preview-item" style="margin-bottom: 16px; background: #fff7ed; border: 1.5px solid #fed7aa; border-radius: 10px; padding: 12px 16px;">
        <label style="color: #c2410c; font-weight: 800; display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 13px;">
          <span class="material-symbols-outlined" style="font-size:20px; color:#ea580c;">timer_off</span> ใบลาไม่ได้รับการพิจารณาในเวลาที่กำหนด (Overdue Leave Request)
        </label>
        <div style="font-weight: 600; line-height: 1.5; color: #9a3412; font-size: 13px;">
          คำขอนี้ค้างการพิจารณามาแล้ว <strong>${sla.elapsedDays} วัน</strong> (${sla.elapsedHours} ชม.) ซึ่งเกินกำหนดเวลาที่หัวหน้าและผู้จัดการต้องพิจารณาภายใน 2 วันทำการ
        </div>
      </div>
    ` : ''}

    <div class="preview-grid">
      <div class="preview-item">
        <label>ประเภทการลา</label>
        <span class="value" style="color: var(--primary); font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
          <span class="material-symbols-outlined" style="font-size: 18px;">event_note</span> ${leaveName}
        </span>
      </div>
      <div class="preview-item">
        <label>ระยะเวลาการลา</label>
        <span class="value" style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 6px;">
          <span class="material-symbols-outlined" style="font-size: 18px;">schedule</span> ${friendlyDuration}
        </span>
      </div>
      <div class="preview-item">
        <label>ตั้งแต่วันที่</label>
        <span class="value" style="display: flex; align-items: center; gap: 6px;">
          <span class="material-symbols-outlined" style="font-size: 18px; color: #64748b;">calendar_today</span> ${formatThaiDate(req.start_date)}
        </span>
      </div>
      <div class="preview-item">
        <label>ถึงวันที่</label>
        <span class="value" style="display: flex; align-items: center; gap: 6px;">
          <span class="material-symbols-outlined" style="font-size: 18px; color: #64748b;">calendar_today</span> ${formatThaiDate(req.end_date)}
        </span>
      </div>
    </div>

    <div class="preview-item-full" ${req.is_emergency ? 'style="background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;"' : ''}>
      <label ${req.is_emergency ? 'style="color: #b91c1c; font-weight: 800; display: flex; align-items: center; gap: 6px;"' : ''}>
        ${req.is_emergency ? '<span class="material-symbols-outlined" style="font-size: 18px; color: #ef4444;">warning</span> 🚨 กรณีลาฉุกเฉิน / ลากะทันหัน (Emergency Leave)' : 'เหตุผล / หมายเหตุประกอบการลา'}
      </label>
      <div style="font-weight: 600; line-height: 1.6; color: ${req.is_emergency ? '#9f1239' : '#334155'}; font-size: 14px;">
        ${escapeHtml(req.reason || 'ไม่ได้ระบุเหตุผล')}
      </div>
    </div>

    ${(req.cancel_reason || (req.approval_comment && req.approval_comment.includes('ยกเลิก')) || req.status === 'cancelled') ? `
      <div class="preview-item" style="margin-bottom: 16px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 12px;">
        <label style="color: #be123c; font-weight: 700; display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
          <span class="material-symbols-outlined" style="font-size:18px;">warning</span> เหตุผลการยกเลิกใบลา (Cancellation Reason)
        </label>
        <div style="font-weight: 500; line-height: 1.5; color: #9f1239;">${escapeHtml(req.cancel_reason || req.approval_comment || 'ไม่ได้ระบุเหตุผล')}</div>
      </div>
    ` : ''}

    ${(req.status === 'rejected' && req.approval_comment && !req.approval_comment.includes('ยกเลิก')) ? `
      <div class="preview-item" style="margin-bottom: 16px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 12px;">
        <label style="color: #be123c; font-weight: 700; display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
          <span class="material-symbols-outlined" style="font-size:18px;">cancel</span> เหตุผลที่ไม่อนุมัติ (Rejection Reason)
        </label>
        <div style="font-weight: 500; line-height: 1.5; color: #9f1239;">${escapeHtml(req.approval_comment)}</div>
      </div>
    ` : ''}

    <div class="workflow-section" style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 20px 22px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 32px; height: 32px; border-radius: 8px; background: #f0fdfa; color: #0d9488; display: flex; align-items: center; justify-content: center;">
            <span class="material-symbols-outlined" style="font-size: 20px;">timeline</span>
          </div>
          <div>
            <h4 style="margin: 0; font-size: 15px; font-weight: 800; color: #0f172a;">ติดตามสถานะและขั้นตอนการพิจารณา (Visual Progress Tracker)</h4>
            <span style="font-size: 12px; color: #64748b; font-weight: 500;">คำนวณตามโครงสร้างสายงานจริงของแผนก (${escapeHtml(emp.departments?.department_name || '-')})</span>
          </div>
        </div>
      </div>

      <!-- Stepper Vertical Timeline -->
      <div style="position: relative; padding-left: 38px; display: flex; flex-direction: column; gap: 20px;">
        <!-- Vertical connecting line -->
        <div style="position: absolute; left: 14px; top: 14px; bottom: 20px; width: 2px; background: #e2e8f0; z-index: 1;"></div>

        ${(() => {
          const workflowSteps = getApprovalWorkflowSteps(req);
          const stepsList = [];
          
          // 1. Step 1: ยื่นคำขอลาสำเร็จ
          stepsList.push({
            title: '1. ยื่นคำขอลาสำเร็จ',
            badge: '<span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">check_circle</span> สำเร็จแล้ว</span>',
            desc: 'คำขอลาถูกส่งเข้าระบบ PVT Workforce Hub เรียบร้อยแล้ว',
            circle: { bg: '#10b981', color: '#ffffff', icon: 'check' }
          });

          let stepIndex = 2;
          let priorStepApproved = true;

          workflowSteps.forEach(ws => {
            const st = String(ws.status || 'pending').toLowerCase();
            const isApproved = st === 'approved' || st === 'อนุมัติแล้ว';
            const isRejected = st === 'rejected' || st === 'ไม่อนุมัติ';
            
            let badgeHtml = '';
            let circleStyle = { bg: '#f59e0b', color: '#ffffff', icon: 'hourglass_empty' };
            let descText = '';

            if (!priorStepApproved && !isApproved && !isRejected) {
              badgeHtml = '<span style="background: #f1f5f9; color: #64748b; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">schedule</span> รอดำเนินการ</span>';
              circleStyle = { bg: '#e2e8f0', color: '#94a3b8', icon: 'schedule' };
              descText = `รอดำเนินการหลังจากขั้นตอนก่อนหน้าได้รับการอนุมัติ`;
            } else if (isApproved) {
              badgeHtml = '<span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">check_circle</span> อนุมัติแล้ว</span>';
              circleStyle = { bg: '#10b981', color: '#ffffff', icon: 'check' };
              descText = `${ws.fullName} ตรวจสอบและลงนามอนุมัติเรียบร้อยแล้ว`;
            } else if (isRejected) {
              badgeHtml = '<span style="background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">cancel</span> ไม่อนุมัติ</span>';
              circleStyle = { bg: '#ef4444', color: '#ffffff', icon: 'close' };
              descText = `${ws.fullName} พิจารณาไม่อนุมัติคำขอนี้`;
              priorStepApproved = false;
            } else {
              badgeHtml = '<span style="background: #fef3c7; color: #b45309; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">hourglass_top</span> กำลังรอพิจารณา</span>';
              circleStyle = { bg: '#f59e0b', color: '#ffffff', icon: 'hourglass_empty' };
              descText = `กำลังรอ ${ws.fullName} ตรวจสอบและพิจารณาตามขั้นตอน`;
              priorStepApproved = false;
            }

            stepsList.push({
              title: `${stepIndex}. ${ws.fullName}`,
              badge: badgeHtml,
              desc: descText,
              circle: circleStyle
            });

            stepIndex++;
          });

          // Final step: อนุมัติเสร็จสมบูรณ์ (Final Decision)
          const overallStatus = String(req.status || 'pending').toLowerCase();
          const allStepsDone = workflowSteps.length > 0 && workflowSteps.every(ws => {
            const s = String(ws.status || '').toLowerCase();
            return s === 'approved' || s === 'อนุมัติแล้ว';
          });
          const isFinalApproved = overallStatus === 'approved' || overallStatus === 'อนุมัติแล้ว' || allStepsDone;
          const isFinalRejected = overallStatus === 'rejected' || overallStatus === 'ไม่อนุมัติ';
          const isFinalCancelled = overallStatus === 'cancelled' || overallStatus === 'ยกเลิก';

          let finalBadge = '';
          let finalCircle = { bg: '#f59e0b', color: '#ffffff', icon: 'hourglass_empty' };
          let finalDesc = '';

          if (isFinalApproved) {
            finalBadge = '<span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">verified</span> อนุมัติเสร็จสมบูรณ์</span>';
            finalCircle = { bg: '#10b981', color: '#ffffff', icon: 'verified' };
            finalDesc = 'คำขอลาผ่านการอนุมัติครบถ้วนสมบูรณ์ มีผลบันทึกในระบบและตัดยอดวันลาเรียบร้อยแล้ว';
          } else if (isFinalRejected) {
            finalBadge = '<span style="background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">cancel</span> สิ้นสุด (ไม่อนุมัติ)</span>';
            finalCircle = { bg: '#ef4444', color: '#ffffff', icon: 'close' };
            finalDesc = 'คำขอลาไม่ได้รับการอนุมัติ';
          } else if (isFinalCancelled) {
            finalBadge = '<span style="background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">block</span> ยกเลิกคำขอแล้ว</span>';
            finalCircle = { bg: '#94a3b8', color: '#ffffff', icon: 'block' };
            finalDesc = 'ใบลาถูกยกเลิกเรียบร้อยแล้ว';
          } else if (overallStatus === 'cancel_pending' || overallStatus === 'cancel_requested' || overallStatus === 'ขอยกเลิก') {
            finalBadge = '<span style="background: #fef3c7; color: #b45309; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">hourglass_top</span> รอการติดตามผลคำร้องขอยกเลิก</span>';
            finalCircle = { bg: '#f59e0b', color: '#ffffff', icon: 'hourglass_empty' };
            finalDesc = 'มีการยื่นคำร้องขอยกเลิกใบลา อยู่ระหว่างรอการตรวจสอบและพิจารณาจาก HR / ผู้ดูแล';
          } else {
            finalBadge = '<span style="background: #fef3c7; color: #b45309; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">hourglass_top</span> กำลังรอพิจารณา</span>';
            finalCircle = { bg: '#f59e0b', color: '#ffffff', icon: 'hourglass_empty' };
            finalDesc = 'ตรวจสอบความถูกต้องและผ่านการอนุมัติระดับแผนกเรียบร้อย';
          }

          stepsList.push({
            title: `${stepIndex}. อนุมัติเสร็จสมบูรณ์ (Final Decision)`,
            badge: finalBadge,
            desc: finalDesc,
            circle: finalCircle
          });

          return stepsList.map(step => `
            <div style="position: relative; z-index: 2;">
              <div style="position: absolute; left: -38px; top: 0; width: 30px; height: 30px; border-radius: 50%; background: ${step.circle.bg}; color: ${step.circle.color}; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 4px #ffffff, 0 2px 5px rgba(0,0,0,0.08);">
                <span class="material-symbols-outlined" style="font-size: 17px; font-weight: bold;">${step.circle.icon}</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                <div style="font-size: 13.5px; font-weight: 700; color: #1e293b;">${step.title}</div>
                <div>${step.badge}</div>
              </div>
              <div style="font-size: 12px; color: #64748b; margin-top: 3px; line-height: 1.5;">${step.desc}</div>
            </div>
          `).join('');
        })()}
      </div>

      <div style="margin-top: 18px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 10px 14px; display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #166534; line-height: 1.5;">
        <span class="material-symbols-outlined" style="font-size: 18px; color: #15803d; flex-shrink: 0; margin-top: 1px;">info</span>
        <div><strong>ระบบสายอนุมัติอัตโนมัติ:</strong> แสดงเฉพาะขั้นตอนที่จำเป็นตามโครงสร้างแผนกจริง หากแผนกไม่มีหัวหน้างาน หรือไม่ต้องผ่านผู้บริหาร ระบบจะข้ามขั้นตอนนั้นไปโดยอัตโนมัติ</div>
      </div>
    </div>

    <div class="preview-attachment-section" style="margin-bottom: 8px;">
      <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">หลักฐานแนบประกอบการลา</label>
      ${attachUrl ? `
        <div class="preview-attachment-box">
          ${isImage ? `
            <img src="${attachUrl}" class="preview-attachment-img" alt="หลักฐานการลา" onclick="openImageLightbox('${attachUrl}', 'รายการ #${req.id}')">
            <p style="font-size:11px; color:var(--text-soft); margin-top:8px; font-weight: 500;">(คลิกรูปเพื่อดูขนาดเต็ม)</p>
          ` : `
            <a href="${attachUrl}" target="_blank" style="color: var(--primary); font-weight: 600; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px; font-size: 14px;">
              <span class="material-symbols-outlined">attach_file</span> เปิดดูเอกสารแนบ
            </a>
          `}
        </div>
      ` : `
        <div class="preview-attachment-none">ไม่มีหลักฐานแนบ</div>
      `}
    </div>
  `;

  // 🔘 Footer Action Buttons
  if (modalFooter) {
    modalFooter.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn-act btn-act-print" id="btnModalPrint" style="background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; padding: 7px 14px; border-radius: 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
            <span class="material-symbols-outlined" style="font-size: 18px;">print</span> พิมพ์ใบลา A4
          </button>
          ${attachUrl ? `
            <button type="button" class="btn-act btn-act-preview" id="btnModalAttach" style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 7px 14px; border-radius: 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
              <span class="material-symbols-outlined" style="font-size: 18px;">${isImage ? 'image' : 'attach_file'}</span> ${isImage ? 'ดูรูปหลักฐาน' : 'เปิดไฟล์แนบ'}
            </button>
          ` : ''}
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          ${isPending && !window.isViewOnlyHR ? `
            <button type="button" class="btn-act btn-act-approve" id="btnModalApprove" style="background: #10b981; color: #ffffff; border: none; padding: 7px 18px; border-radius: 8px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);">
              <span class="material-symbols-outlined" style="font-size: 18px;">check_circle</span> อนุมัติ
            </button>
            <button type="button" class="btn-act btn-act-reject" id="btnModalReject" style="background: #ef4444; color: #ffffff; border: none; padding: 7px 18px; border-radius: 8px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3);">
              <span class="material-symbols-outlined" style="font-size: 18px;">cancel</span> ไม่อนุมัติ
            </button>
          ` : ''}
          <button type="button" class="tab-btn" onclick="closePreviewModal()" style="padding: 7px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; color: #64748b; font-weight: 600; cursor: pointer;">
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    `;

    const btnModalPrintEl = document.getElementById("btnModalPrint");
    if (btnModalPrintEl) {
      btnModalPrintEl.onclick = () => {
        closePreviewModal();
        printLeaveA4(req.id);
      };
    }

    const btnModalAttachEl = document.getElementById("btnModalAttach");
    if (btnModalAttachEl) {
      btnModalAttachEl.onclick = () => {
        if (isImage) {
          openImageLightbox(attachUrl, `หลักฐานการลา #${req.id}`);
        } else {
          window.open(attachUrl, '_blank');
        }
      };
    }

    const btnModalApproveEl = document.getElementById("btnModalApprove");
    if (btnModalApproveEl) {
      btnModalApproveEl.onclick = () => {
        closePreviewModal();
        approveLeave(req.id);
      };
    }

    const btnModalRejectEl = document.getElementById("btnModalReject");
    if (btnModalRejectEl) {
      btnModalRejectEl.onclick = () => {
        closePreviewModal();
        rejectLeave(req.id);
      };
    }
  }

  modal.classList.add("active");
}

function closePreviewModal() {
  const modal = document.getElementById("leavePreviewModal");
  if (modal) modal.classList.remove("active");
}

/* ==========================================================================
   🔵 6. WORKFLOW ACTIONS (APPROVE / REJECT / CANCEL)
   ========================================================================== */

/**
 * 🛡️ สร้างโครงร่าง HTML สรุปข้อมูลใบลาสำหรับกล่องยืนยัน SweetAlert2
 * ป้องกันการกดยืนยันหรือไม่อนุมัติโดยไม่ตั้งใจ (Accidental Submissions)
 */
function buildLeaveActionConfirmDialogHtml(reqData, roleTitle, actionType = 'approve') {
  const empName = reqData.employees?.full_name || reqData.employees?.name || 'ไม่ระบุชื่อพนักงาน';
  const empCode = reqData.employees?.employee_code ? `รหัส ${reqData.employees.employee_code}` : '';
  let deptName = reqData.employees?.departments?.department_name || reqData.department_name || '';
  if (!deptName && reqData.employees?.department_id && window.allDepartmentsMap) {
    deptName = window.allDepartmentsMap[reqData.employees.department_id] || '';
  }
  if (!deptName) deptName = '-';
  const posName = reqData.employees?.positions?.position_name || '-';
  const leaveName = reqData.leave_types ? reqData.leave_types.leave_name : 'ไม่ระบุประเภท';
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
  } else if (rawDays % 1 !== 0) {
    const wholeDays = Math.floor(rawDays);
    const totalH = (rawDays - wholeDays) * 8;
    const wholeH = Math.floor(totalH);
    const mins = Math.round((totalH - wholeH) * 60);
    let parts = [];
    if (wholeDays > 0) parts.push(`${wholeDays} วัน`);
    if (wholeH > 0) parts.push(`${wholeH} ชม.`);
    if (mins > 0) parts.push(`${mins} นาที`);
    durationText = parts.length > 0 ? parts.join(' ') : `${rawDays} วัน`;
  }

  const isApprove = actionType === 'approve';
  const themeColor = isApprove ? '#10b981' : '#ef4444';
  const themeBg = isApprove ? '#f0fdf4' : '#fef2f2';
  const themeBorder = isApprove ? '#bbf7d0' : '#fecaca';

  return `
    <div style="text-align: left; font-size: 13.5px; line-height: 1.5; color: #334155; margin-top: 6px;">
      <!-- กล่องรายละเอียดข้อมูลใบลา -->
      <div style="background: ${themeBg}; border: 1.5px solid ${themeBorder}; border-radius: 14px; padding: 14px; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="font-size: 22px; color: ${themeColor};">person</span>
            <div>
              <strong style="color: #0f172a; font-size: 15px;">${escapeHtml(empName)}</strong>
              ${empCode ? `<span style="background: #ffffff; color: #475569; font-size: 11.5px; font-weight: 600; padding: 1px 7px; border-radius: 6px; border: 1px solid #cbd5e1; margin-left: 6px;">${escapeHtml(empCode)}</span>` : ''}
            </div>
          </div>
          <span style="font-size: 11.5px; font-weight: 700; color: ${themeColor}; background: #ffffff; padding: 2px 9px; border-radius: 12px; border: 1px solid ${themeBorder};">
            #${escapeHtml(String(reqData.id).slice(-6))}
          </span>
        </div>

        <div style="font-size: 12.5px; color: #64748b; margin-bottom: 10px; padding-left: 30px;">
          <span>แผนก: <strong style="color: #334155;">${escapeHtml(deptName)}</strong></span>
          <span style="margin: 0 6px;">•</span>
          <span>ตำแหน่ง: <strong style="color: #334155;">${escapeHtml(posName)}</strong></span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #ffffff; border-radius: 10px; padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 13px;">
          <div>
            <span style="color: #64748b; font-size: 11.5px; display: block; margin-bottom: 2px;">ประเภทการลา</span>
            <strong style="color: #0d9488; font-size: 13.5px;">${escapeHtml(leaveName)}</strong>
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
          <span style="color: #1e293b; margin-left: 4px;">${escapeHtml(reason)}</span>
        </div>
      </div>

      <!-- ข้อมูลสิทธิ์ผู้พิจารณา -->
      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #64748b; padding: 2px 4px 6px 4px;">
        <span>สิทธิ์ผู้พิจารณา:</span>
        <span style="font-weight: 700; color: ${themeColor}; background: ${themeBg}; padding: 3px 10px; border-radius: 8px; border: 1px solid ${themeBorder};">
          ${escapeHtml(roleTitle)}
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

async function approveLeave(leaveId) {
  const reqData = allLeaveRequests.find(r => r.id === leaveId);
  if (!reqData) return;

  const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
  const sessionUser = savedSession ? JSON.parse(savedSession) : {};
  const currentEmpId = currentUserProfile?.employees?.id || currentUserProfile?.id || sessionUser?.employees?.id || sessionUser?.id || sessionUser?.employee_id;

  if (!canApproveStep(reqData, currentRole)) return;

  const roleTitle = currentRole === 'leader' 
    ? 'หัวหน้างาน (L1)' 
    : currentRole === 'manager' 
    ? 'ผู้จัดการฝ่าย (L2)' 
    : (currentRole === 'executive' || currentRole === 'director' || currentRole === 'owner')
    ? 'ผู้บริหาร (L3)'
    : 'ฝ่ายบุคคล HR / Admin';

  // 🛡️ กล่องยืนยัน SweetAlert2 ก่อนทำการอนุมัติเพื่อป้องกันการกดผิดพลาดโดยไม่ตั้งใจ
  const result = await Swal.fire({
    title: '<span style="font-size: 20px; font-weight: 800; color: #0f172a;">ยืนยันอนุมัติคำขอลา</span>',
    html: buildLeaveActionConfirmDialogHtml(reqData, roleTitle, 'approve'),
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
  if (typeof closePreviewModal === 'function') closePreviewModal();

  const sb = window.pvtSupabase?.getClient();
  if (!sb) return;

  Swal.fire({ title: 'กำลังประมวลผล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    let updateFields = {};

    // 🛡️ ตรวจสอบและสร้างโควตาวันลาใน leave_balances อัตโนมัติ (รองรับทั้งปี ค.ศ. และ พ.ศ. 2569) เพื่อป้องกัน Trigger Error
    if (window.PVTSDK?.user?.ensureLeaveBalances) {
      await window.PVTSDK.user.ensureLeaveBalances(reqData.employee_id, reqData.start_date);
    }

    if (currentRole === 'leader') {
      // ✅ L1 อนุมัติ (หัวหน้างาน / Supervisor)
      updateFields.manager_status = 'approved';

      // 🔀 ตรวจสายอนุมัติของแผนก
      // ถ้าแผนกนี้ไม่มี ผู้จัดการ (L2) ให้ข้าม L2 และอนุมัติทันที (ถ้าไม่มี L3)
      const deptId = reqData.employees?.department_id || null;
      const deptInfo = deptApproversMap[deptId] || {};
      const hasManagerInDept = deptInfo.hasManager || Boolean(reqData.employees?.l2_approver_id);

      if (!hasManagerInDept) {
        console.log('ℹ️ [Approval Routing] แผนกนี้ไม่มี ผู้จัดการ (L2) → ข้าม L2');
        updateFields.director_status = 'approved';
        if (!hasExecutiveColumn) {
          updateFields.status = 'approved';
          updateFields.approved_at = new Date().toISOString();
        }
      }
    } else if (currentRole === 'manager') {
      // ✅ L2 อนุมัติ (ผู้จัดการฝ่าย / Department Manager)
      updateFields.director_status = 'approved';
      if (reqData.manager_status !== 'approved') {
        updateFields.manager_status = 'approved';
      }
      if (hasExecutiveColumn) {
        const isApplicantLeaderOrManager = isLeaderOrManagerRole(reqData.employees?.role, reqData.employees?.positions?.position_name);
        if (!isApplicantLeaderOrManager) {
          updateFields.executive_status = 'approved';
          updateFields.status = 'approved';
          updateFields.approved_at = new Date().toISOString();
        }
      } else {
        updateFields.status = 'approved';
        updateFields.approved_at = new Date().toISOString();
      }
    } else if (currentRole === 'executive' || currentRole === 'director' || currentRole === 'owner' || (window.executiveApproverId && String(currentEmpId) === String(window.executiveApproverId))) {
      // ✅ L3 อนุมัติ (ผู้บริหารระดับสูง / Director / Executive)
      if (reqData.manager_status !== 'approved') updateFields.manager_status = 'approved';
      if (reqData.director_status !== 'approved') updateFields.director_status = 'approved';
      if (hasExecutiveColumn) {
        updateFields.executive_status = 'approved';
      }
      updateFields.status = 'approved';
      updateFields.approved_at = new Date().toISOString();
    } else {
      // ✅ L4 / ขั้นสุดท้าย (ฝ่ายบุคคล HR / Super Admin) - เก็บเป็น fallback เผื่อมีสิทธิพิเศษอื่น แต่อนุมัติสำเร็จทันที
      if (reqData.manager_status !== 'approved') updateFields.manager_status = 'approved';
      if (reqData.director_status !== 'approved') updateFields.director_status = 'approved';
      if (hasExecutiveColumn) updateFields.executive_status = 'approved';
      updateFields.status = 'approved';
      updateFields.approved_at = new Date().toISOString();
    }

    if (updateFields.status === 'approved' && currentEmpId) {
      updateFields.approved_by = currentEmpId;
    }

    // หักยอดวันลาหากได้รับการอนุมัติขั้นสุดท้ายเรียบร้อยแล้ว (status = approved)
    if (updateFields.status === 'approved') {
      const leaveDays = await getEffectiveLeaveDays(reqData);
      const currentYear = getADYear(reqData.start_date);

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
          const actorName = currentUserProfile?.full_name || 'ผู้รักษาการแทน';
          updateFields.approval_comment = `[Auto-Delegation] อนุมัติโดย ${actorName} รักษาการแทน ${delegation.originalApproverName} (${delegation.reason})`;
        }
      } catch (delErr) {
        console.warn("[Auto-Delegation] Audit resolution error:", delErr);
      }
    }

    const { error: updateErr } = await sb
      .from('leave_requests')
      .update(updateFields)
      .eq('id', leaveId);

    if (updateErr) throw updateErr;

    // 🔔 บันทึกแจ้งเตือนลงฐานข้อมูล (In-app)
    const notificationTitle = `ใบลาของคุณได้รับการอนุมัติ (ขั้นสุดท้าย)`;
    const notificationMessage = `ใบลาประเภท ${reqData.leave_types?.leave_name || 'ใบลา'} วันที่ ${reqData.start_date} ได้รับการอนุมัติเรียบร้อยแล้ว`;
    
    await sb.from('notifications').insert({
      employee_id: reqData.employee_id,
      title: notificationTitle,
      message: notificationMessage,
      type: 'leave',
      link_url: '/pages/user/index-user.html'
    });

    // 💬 ส่งแจ้งเตือน LINE โดยอัตโนมัติผ่าน SDK ด้านล่าง (ส่ง Flex Message)
    if (window.PVTSDK?.line) {
      try {
        const applicantName = reqData.employees?.full_name || 'พนักงาน';
        const applicantCode = reqData.employees?.employee_code || '';
        const applicantLineId = reqData.employees?.line_id || '';
        const leaveTypeName = reqData.leave_types?.leave_name || 'ใบลา';

        if (currentRole === 'leader') {
          // 🔀 ใช้ Manager L2 ที่ Admin กำหนดไว้ในตาราง departments
          const deptId = reqData.employees?.department_id || null;
          const deptName = reqData.employees?.departments?.department_name || '';

          let managerId = null;

          if (deptId) {
            const { data: approverConfig, error: approverError } = await sb
              .from('department_approvers')
              .select('manager_id')
              .eq('department_id', deptId)
              .maybeSingle();

            if (approverError) throw approverError;

            managerId = approverConfig?.manager_id || null;

            // มี L2 → ดึง LINE User ID และส่งแจ้งเตือน
            if (managerId) {
              const { data: managerEmp, error: managerError } = await sb
                .from('employees')
                .select('id, full_name, line_id')
                .eq('id', managerId)
                .maybeSingle();

              if (managerError) throw managerError;

              managerLineId = managerEmp?.line_id || '';

              await window.PVTSDK.line.sendWorkflowNotification({
                type: 'LEADER_APPROVED',
                recipientId: managerId,
                recipientLineId: managerLineId,
                leaveId: leaveId,
                employeeName: applicantName,
                employeeCode: applicantCode,
                departmentName: deptName,
                recipientRole: 'manager',
                leaveType: leaveTypeName,
                startDate: reqData.start_date,
                endDate: reqData.end_date,
                totalDays: reqData.total_days,
                comment: reqData.approval_comment || 'หัวหน้างานตรวจสอบแล้ว เห็นควรอนุมัติ',
                attachmentUrl: reqData.attachment_url || ""
              });

              if (!managerLineId) {
                console.warn('⚠️ [LINE OA] ผู้จัดการ L2 ยังไม่มี LINE User ID');
              }
            } else {
              // ไม่มี L2 → ส่งแจ้งเตือนผู้บริหารระดับสูง (Executive)
              console.log('ℹ️ [LINE OA] แผนกนี้ไม่มี L2 → ส่งต่อผู้บริหาร L3');
              const { data: executiveSetting } = await sb
                .from('system_settings')
                .select('employee_id')
                .eq('setting_key', 'leave_executive_approver')
                .maybeSingle();

              if (executiveSetting?.employee_id) {
                const { data: executiveEmp } = await sb
                  .from('employees')
                  .select('id, full_name, line_id')
                  .eq('id', executiveSetting.employee_id)
                  .maybeSingle();

                if (executiveEmp) {
                  // บันทึกแจ้งเตือนลงตาราง notifications สำหรับผู้บริหาร
                  await sb.from('notifications').insert({
                    employee_id: executiveEmp.id,
                    title: `ใบลาจาก ${applicantName} ส่งหาผู้บริหาร (เนื่องจากแผนกไม่มีผู้จัดการ)`,
                    message: `พนักงาน: ${applicantName} (${applicantCode})\nแผนก: ${deptName}\nประเภท: ${leaveTypeName}\nวันที่: ${reqData.start_date} ถึง ${reqData.end_date}\n(แผนกไม่มีผู้จัดการฝ่าย)`,
                    type: 'leave',
                    link_url: '/pages/hr/hr.html'
                  });

                  if (window.PVTSDK?.line) {
                    await window.PVTSDK.line.sendWorkflowNotification({
                      type: 'LEADER_APPROVED',
                      recipientId: executiveEmp.id,
                      recipientLineId: executiveEmp.line_id || '',
                      leaveId: leaveId,
                      employeeName: applicantName,
                      employeeCode: applicantCode,
                      departmentName: deptName,
                      recipientRole: 'executive',
                      leaveType: leaveTypeName,
                      startDate: reqData.start_date,
                      endDate: reqData.end_date,
                      totalDays: reqData.total_days,
                      comment: reqData.approval_comment || 'หัวหน้างานตรวจสอบแล้ว และไม่มีผู้จัดการฝ่าย (ส่งหาผู้บริหาร)',
                      attachmentUrl: reqData.attachment_url || ""
                    });
                  }
                }
              }
            }
          }

        } else if (currentRole === 'manager') {
          // ผู้จัดการ L2 อนุมัติคำขอของ "หัวหน้างาน/ผู้จัดการ"
          // → แจ้งผู้บริหาร L3
          const needsExecutive = isLeaderOrManagerRole(reqData.employees?.role, reqData.employees?.positions?.position_name);

          if (needsExecutive) {
            const { data: executiveSetting, error: executiveSettingError } = await sb
              .from('system_settings')
              .select('employee_id')
              .eq('setting_key', 'leave_executive_approver')
              .maybeSingle();

            if (executiveSettingError) throw executiveSettingError;

            let executiveEmp = null;

            if (executiveSetting?.employee_id) {
              const { data: executiveData, error: executiveError } = await sb
                .from('employees')
                .select('id, full_name, line_id, role')
                .eq('id', executiveSetting.employee_id)
                .maybeSingle();

              if (executiveError) throw executiveError;
              executiveEmp = executiveData || null;
            }

            if (executiveEmp) {
              await window.PVTSDK.line.sendWorkflowNotification({
                type: 'MANAGER_APPROVED',
                recipientId: executiveEmp.id,
                recipientLineId: executiveEmp.line_id || '',
                leaveId: leaveId,
                employeeName: applicantName,
                employeeCode: applicantCode,
                departmentName: reqData.employees?.departments?.department_name || '',
                recipientRole: 'executive',
                leaveType: leaveTypeName,
                startDate: reqData.start_date,
                endDate: reqData.end_date,
                totalDays: reqData.total_days,
                comment: reqData.approval_comment || 'ผู้จัดการตรวจสอบแล้ว เห็นควรอนุมัติ',
                attachmentUrl: reqData.attachment_url || ""
              });

              if (!executiveEmp.line_id) {
                console.warn('⚠️ [LINE OA] ผู้บริหารยังไม่มี LINE User ID');
              }
            } else {
              console.warn('⚠️ [LINE OA] ไม่พบผู้บริหาร role executive/director/owner');
            }
          }
        }
      } catch (lineErr) {
        console.warn("⚠️ [LINE OA Trigger] Approval notice error:", lineErr);
      }
    }

    // 💬 1. ส่งแจ้งเตือนกลับหาพนักงานเจ้าของใบลา
    if (window.PVTSDK?.line) {
      try {
        await window.PVTSDK.line.sendWorkflowNotification({
          type: 'REQUEST_APPROVED',
          recipientId: reqData.employee_id, // เจ้าของใบลา
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
        console.warn("⚠️ [Workflow Notification] Approval notice error to employee:", lineErr);
      }
    }

    // 💬 2. 📢 ส่งแจ้งเตือนไปยังฝ่ายบุคคล (HR) ผ่าน LINE ทันทีเมื่อมีการอนุมัติ
    if (window.PVTSDK?.notifyHrWorkflow || window.pvtSupabase?.notifyHrWorkflow) {
      try {
        const notifyFn = window.PVTSDK?.notifyHrWorkflow ? window.PVTSDK.notifyHrWorkflow.bind(window.PVTSDK) : window.pvtSupabase.notifyHrWorkflow.bind(window.pvtSupabase);
        
        // ถ้าเป็นหัวหน้างานอนุมัติแล้วต้องส่งต่อ ให้ใช้ HR_REVIEW หรือถ้าอนุมัติเสร็จสิ้นใช้ HR_NOTIFY
        const notifTypeToHr = (updateFields.status === 'approved' || reqData.status === 'approved' || currentRole === 'manager' || currentRole === 'executive' || currentRole === 'director' || currentRole === 'owner') 
          ? 'HR_NOTIFY' 
          : 'HR_REVIEW';

        await notifyFn({
          id: leaveId,
          applicant_name: reqData.employees?.full_name || applicantName,
          employee_code: reqData.employees?.employee_code || applicantCode,
          department_name: reqData.employees?.departments?.department_name || deptName,
          leave_type_name: reqData.leave_types?.leave_name || leaveTypeName,
          start_date: reqData.start_date,
          end_date: reqData.end_date,
          total_days: reqData.total_days,
          leave_hours: reqData.leave_hours || 0,
          reason: reqData.reason || '',
          comment: reqData.approval_comment || `อนุมัติโดย ${currentRole.toUpperCase()}`,
          attachment_url: reqData.attachment_url || ''
        }, notifTypeToHr);
        console.log(`✅ [LINE OA] Dispatched HR notification [${notifTypeToHr}] for leave ID: ${leaveId}`);
      } catch (hrNotifErr) {
        console.warn("⚠️ [LINE OA Trigger] HR notification notice error:", hrNotifErr);
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
    loadPendingLeavesHR();

  } catch (err) {
    console.error("💥 Approve Error:", err);
    Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถทำรายการอนุมัติได้', 'error');
  }
}

async function rejectLeave(leaveId) {
  const reqData = allLeaveRequests.find(r => r.id === leaveId);
  if (!reqData) return;

  const roleTitle = currentRole === 'leader' 
    ? 'หัวหน้างาน (L1)' 
    : currentRole === 'manager' 
    ? 'ผู้จัดการฝ่าย (L2)' 
    : (currentRole === 'executive' || currentRole === 'director' || currentRole === 'owner')
    ? 'ผู้บริหาร (L3)'
    : 'ฝ่ายบุคคล HR / Admin';

  const summaryHtml = buildLeaveActionConfirmDialogHtml(reqData, roleTitle, 'reject');

  // 🛡️ กล่องยืนยัน SweetAlert2 ก่อนทำการไม่อนุมัติ เพื่อป้องกันการกดผิดพลาดโดยไม่ตั้งใจ
  const { value: reason, isConfirmed } = await Swal.fire({
    title: '<span style="font-size: 20px; font-weight: 800; color: #b91c1c;">ยืนยันไม่อนุมัติ / ปฏิเสธคำขอลา</span>',
    html: `
      ${summaryHtml}
      <div style="text-align: left; margin-top: 14px;">
        <label for="swal-reject-reason-input" style="font-size: 13px; font-weight: 700; color: #b91c1c; display: block; margin-bottom: 6px;">
          โปรดระบุเหตุผลความจำเป็นที่ไม่อนุมัติ (บังคับกรอก เพื่อแจ้งเตือนพนักงาน):
        </label>
        <textarea id="swal-reject-reason-input" class="swal2-textarea" placeholder="ระบุเหตุผล เช่น ติดภารกิจเร่งด่วนในแผนก, กำลังพลไม่เพียงพอ, ยื่นเอกสารไม่สมบูรณ์..." style="width: 100%; min-height: 80px; margin: 0; box-sizing: border-box; font-size: 13.5px; border-radius: 8px; border: 1.5px solid #cbd5e1; padding: 10px; font-family: inherit;"></textarea>
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
      const textarea = document.getElementById('swal-reject-reason-input');
      const val = textarea ? textarea.value.trim() : '';
      if (!val) {
        Swal.showValidationMessage('กรุณาระบุเหตุผลในการไม่อนุมัติคำขอลาด้วยครับ เพื่อแจ้งให้พนักงานทราบ');
        return false;
      }
      return val;
    }
  });

  if (!isConfirmed || !reason) return;
  if (typeof closePreviewModal === 'function') closePreviewModal();

  const sb = window.pvtSupabase?.getClient();
  if (!sb) return;

  try {
    let updateFields = {
      status: 'rejected',
      approval_comment: reason.trim()
    };

    if (currentRole === 'leader') {
      updateFields.manager_status = 'rejected';
    } else if (currentRole === 'manager') {
      updateFields.director_status = 'rejected';
    } else if (currentRole === 'executive' || currentRole === 'director' || currentRole === 'owner') {
      if (hasExecutiveColumn) {
        updateFields.executive_status = 'rejected';
      } else {
        updateFields.director_status = 'rejected';
      }
    }

    const { error } = await sb
      .from('leave_requests')
      .update(updateFields)
      .eq('id', leaveId);

    if (error) throw error;

    // 🔔 บันทึกแจ้งเตือนลงฐานข้อมูล (In-app)
    const reqData = allLeaveRequests.find(r => r.id === leaveId);
    if (reqData) {
      const notificationTitle = `ใบลาของคุณถูกปฏิเสธ`;
      const notificationMessage = `ใบลาประเภท ${reqData.leave_types?.leave_name || 'ใบลา'} วันที่ ${reqData.start_date} ไม่ได้รับการอนุมัติ\nเหตุผล: ${reason.trim()}`;
      
      await sb.from('notifications').insert({
        employee_id: reqData.employee_id,
        title: notificationTitle,
        message: notificationMessage,
        type: 'leave',
        link_url: '/pages/user/index-user.html'
      });

      // 💬 ส่งแจ้งเตือน LINE โดยอัตโนมัติผ่าน SDK ด้านล่าง (ส่ง Flex Message)
    }

    // 💬 แจ้งเตือนพนักงานผ่าน LINE OA เมื่อคำขอลาโดนปฏิเสธ
    if (window.PVTSDK?.line) {
      try {
        const reqData = allLeaveRequests.find(r => r.id === leaveId);
        if (reqData) {
          await window.PVTSDK.line.sendWorkflowNotification({
            type: 'REJECTED',
            recipientId: reqData.employee_id, // ระบุผู้รับ (พนักงาน)
            leaveId: leaveId,
            employeeName: reqData.employees?.full_name || 'พนักงาน',
            employeeCode: reqData.employees?.employee_code || '',
            recipientRole: 'employee',
            recipientLineId: reqData.employees?.line_id || '',
            leaveType: reqData.leave_types?.leave_name || 'ใบลา',
            startDate: reqData.start_date,
            endDate: reqData.end_date,
            totalDays: reqData.total_days,
            comment: reason.trim(),
            attachmentUrl: reqData.attachment_url || ""
          });
        }
      } catch (lineErr) {
        console.warn("⚠️ [LINE OA Trigger] Rejection notice error:", lineErr);
      }
    }

    await Swal.fire('ปฏิเสธสำเร็จ', 'บันทึกสถานะไม่อนุมัติเรียบร้อยแล้ว', 'success');
    loadPendingLeavesHR();

  } catch (err) {
    Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
  }
}

async function forceCancelLeave(leaveId) {
  const { value: reason } = await Swal.fire({
    title: 'ยืนยันการยกเลิกใบลาย้อนหลัง?',
    text: 'การยกเลิกจะทำการ คืนจำนวนวันลา กลับเข้าสู่ระบบของพนักงาน',
    icon: 'warning',
    input: 'textarea',
    inputPlaceholder: 'ระบุเหตุผลการยกเลิกใบลา...',
    showCancelButton: true,
    showDenyButton: false,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: '✖️ ยืนยันยกเลิกใบลา',
    cancelButtonText: 'ยกเลิก',
    inputValidator: (value) => {
      if (!value) return 'กรุณาระบุเหตุผลในการยกเลิกใบลา!';
    }
  });

  if (!reason) return;
  const sb = window.pvtSupabase?.getClient();
  if (!sb) return;

  try {
    Swal.fire({ title: 'กำลังดำเนินการ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const { data: reqData } = await sb
      .from('leave_requests')
      .select('*, leave_types!leave_type_id(leave_code, leave_name)')
      .eq('id', leaveId)
      .single();

    if (reqData && reqData.status === 'approved') {
      const currentYear = getADYear(reqData.start_date);
      const daysToReturn = await getEffectiveLeaveDays(reqData);

      if (window.PVTSDK?.user?.updateLeaveBalance) {
        const lCode = reqData.leave_types?.leave_code || null;
        await window.PVTSDK.user.updateLeaveBalance(reqData.employee_id, reqData.leave_type_id, lCode, currentYear, -daysToReturn);
      }
    }

    let { error } = await sb
      .from('leave_requests')
      .update({ 
        status: 'cancelled',
        cancel_reason: reason.trim(),
        approval_comment: `[ยกเลิกโดย HR/ผู้ดูแล] ${reason.trim()}`
      })
      .eq('id', leaveId);

    if (error && (error.code === 'P0001' || (error.message && (error.message.includes('ช่วงวันที่ดังกล่าว') || error.message.includes('ซ้อนทับ'))))) {
      await sb.from('leave_requests').update({ start_date: '2099-12-31', end_date: '2099-12-31' }).eq('id', leaveId);
      const retry = await sb.from('leave_requests').update({
        status: 'cancelled',
        cancel_reason: reason.trim(),
        approval_comment: `[ยกเลิกโดย HR/ผู้ดูแล] ${reason.trim()}`
      }).eq('id', leaveId);
      error = retry.error;
    }

    if (error) throw error;

    await Swal.fire('สำเร็จ!', 'ทำการยกเลิกใบลาและคืนวันลาเรียบร้อยแล้ว', 'success');
    loadPendingLeavesHR();
  } catch (err) {
    console.error('Error cancelling leave:', err);
    Swal.fire('เกิดข้อผิดพลาด!', err.message || 'ไม่สามารถยกเลิกใบลาได้', 'error');
  }
}

async function approveCancellation(leaveId) {
  const reqData = allLeaveRequests.find(r => r.id === leaveId);
  const empName = reqData?.employees?.full_name || reqData?.employees?.name || 'พนักงาน';
  const leaveName = reqData?.leave_types?.leave_name || 'ใบลา';

  const result = await Swal.fire({
    title: '<span style="font-size: 20px; font-weight: 800; color: #0f172a;">ยืนยันอนุมัติการยกเลิกใบลา</span>',
    html: `
      <div style="text-align: left; font-size: 13.5px; color: #334155; margin-top: 8px;">
        <div style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
          <div style="font-weight: 700; color: #166534; font-size: 14px; margin-bottom: 4px;">
            ${escapeHtml(empName)} - ${escapeHtml(leaveName)}
          </div>
          <div style="font-size: 12.5px; color: #64748b;">
            ช่วงวันที่: ${reqData ? formatThaiDate(reqData.start_date) : '-'} - ${reqData ? formatThaiDate(reqData.end_date) : '-'}
          </div>
          ${reqData?.cancel_reason ? `
            <div style="margin-top: 8px; font-size: 12px; color: #991b1b; background: #fef2f2; padding: 6px 10px; border-radius: 6px; border: 1px solid #fecaca;">
              <strong>เหตุผลขอยกเลิก:</strong> ${escapeHtml(reqData.cancel_reason)}
            </div>
          ` : ''}
        </div>
        <div style="font-size: 13px; color: #065f46; background: #ecfdf5; border-radius: 8px; padding: 8px 12px; border: 1px solid #a7f3d0; display: flex; align-items: center; gap: 6px;">
          <span class="material-symbols-outlined" style="font-size: 18px; color: #10b981;">restart_alt</span>
          <span>ระบบจะทำรายการยกเลิกใบลา และคืนจำนวนวันลาที่หักไปกลับเข้าโควตาพนักงานทันที</span>
        </div>
      </div>
    `,
    icon: 'warning',
    iconColor: '#10b981',
    showCancelButton: true,
    showDenyButton: false,
    confirmButtonColor: '#10b981',
    cancelButtonColor: '#64748b',
    confirmButtonText: '✔️ อนุมัติยกเลิก (คืนโควตา)',
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

  const sb = window.pvtSupabase?.getClient();
  if (!sb) return;

  Swal.fire({
    title: 'กำลังคืนโควตาวันลา...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const { data: reqData, error: reqErr } = await sb
      .from('leave_requests')
      .select('*, leave_types!leave_type_id(leave_code, leave_name)')
      .eq('id', leaveId)
      .single();

    if (reqErr || !reqData) throw new Error("ไม่พบข้อมูลใบลา");

    const daysToReturn = await getEffectiveLeaveDays(reqData);
    const currentYear = getADYear(reqData.start_date);

    if (window.PVTSDK?.user?.updateLeaveBalance) {
      const lCode = reqData.leave_types?.leave_code || null;
      await window.PVTSDK.user.updateLeaveBalance(reqData.employee_id, reqData.leave_type_id, lCode, currentYear, -daysToReturn);
    }

    let { error: updateErr } = await sb
      .from('leave_requests')
      .update({
        status: 'cancelled',
        approval_comment: '[อนุมัติยกเลิกคำร้อง] คืนวันลาเข้าระบบเรียบร้อย',
        approved_at: new Date().toISOString()
      })
      .eq('id', leaveId);

    if (updateErr && (updateErr.code === 'P0001' || (updateErr.message && (updateErr.message.includes('ช่วงวันที่ดังกล่าว') || updateErr.message.includes('ซ้อนทับ'))))) {
      await sb.from('leave_requests').update({ start_date: '2099-12-31', end_date: '2099-12-31' }).eq('id', leaveId);
      const retry = await sb.from('leave_requests').update({
        status: 'cancelled',
        approval_comment: '[อนุมัติยกเลิกคำร้อง] คืนวันลาเข้าระบบเรียบร้อย',
        approved_at: new Date().toISOString()
      }).eq('id', leaveId);
      updateErr = retry.error;
    }

    if (updateErr) throw updateErr;

    await Swal.fire('ยกเลิกใบลาสำเร็จ!', `อนุมัติการยกเลิกเรียบร้อยแล้ว คืนโควตาวันลาจำนวน ${daysToReturn} วัน ให้พนักงานแล้ว`, 'success');
    loadPendingLeavesHR();

  } catch (err) {
    console.error("💥 Approve Cancellation Error:", err);
    Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถยกเลิกได้', 'error');
  }
}

async function rejectCancellation(leaveId) {
  const reqData = allLeaveRequests.find(r => r.id === leaveId);
  const empName = reqData?.employees?.full_name || reqData?.employees?.name || 'พนักงาน';
  const leaveName = reqData?.leave_types?.leave_name || 'ใบลา';

  const { value: reason, isConfirmed } = await Swal.fire({
    title: '<span style="font-size: 20px; font-weight: 800; color: #b91c1c;">ปฏิเสธคำร้องขอยกเลิกใบลา</span>',
    html: `
      <div style="text-align: left; font-size: 13.5px; color: #334155; margin-top: 8px;">
        <div style="background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
          <div style="font-weight: 700; color: #991b1b; font-size: 14px; margin-bottom: 4px;">
            ${escapeHtml(empName)} - ${escapeHtml(leaveName)}
          </div>
          <div style="font-size: 12.5px; color: #64748b;">
            ช่วงวันที่: ${reqData ? formatThaiDate(reqData.start_date) : '-'} - ${reqData ? formatThaiDate(reqData.end_date) : '-'}
          </div>
        </div>
        <label for="swal-reject-cancel-input" style="font-size: 13px; font-weight: 700; color: #b91c1c; display: block; margin-bottom: 6px;">
          โปรดระบุเหตุผลที่ไม่อนุมัติให้ยกเลิก (บังคับกรอก):
        </label>
        <textarea id="swal-reject-cancel-input" class="swal2-textarea" placeholder="พิมพ์เหตุผลการปฏิเสธคำร้องขอยกเลิก..." style="width: 100%; min-height: 75px; margin: 0; box-sizing: border-box; font-size: 13.5px; border-radius: 8px; border: 1.5px solid #cbd5e1; padding: 10px; font-family: inherit;"></textarea>
      </div>
    `,
    icon: 'warning',
    iconColor: '#ef4444',
    showCancelButton: true,
    showDenyButton: false,
    confirmButtonColor: '#ef4444',
    confirmButtonText: '✖️ ยืนยันปฏิเสธคำร้อง',
    cancelButtonText: 'ยกเลิก',
    focusCancel: true,
    allowOutsideClick: false,
    customClass: {
      popup: 'swal-refined-popup',
      confirmButton: 'swal-btn-danger',
      cancelButton: 'swal-btn-cancel'
    },
    preConfirm: () => {
      const el = document.getElementById('swal-reject-cancel-input');
      const val = el ? el.value.trim() : '';
      if (!val) {
        Swal.showValidationMessage('กรุณาระบุเหตุผลที่ไม่อนุมัติให้ยกเลิกใบลาด้วยครับ');
        return false;
      }
      return val;
    }
  });

  if (!isConfirmed || !reason) return;
  const sb = window.pvtSupabase?.getClient();
  if (!sb) return;

  try {
    const { error } = await sb
      .from('leave_requests')
      .update({
        status: 'approved',
        approval_comment: `[ไม่อนุมัติให้ยกเลิก] ${reason.trim()}`
      })
      .eq('id', leaveId);

    if (error) throw error;

    await Swal.fire('ปฏิเสธคำร้องแล้ว', 'ใบลาจะยังคงสถานะอนุมัติตามเดิม', 'success');
    loadPendingLeavesHR();

  } catch (err) {
    Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
  }
}

/* ==========================================================================
   🖨️ 7. PRINT LEAVE A4 DOCUMENT
   ========================================================================== */

async function printLeaveA4(leaveId) {
  const sb = window.pvtSupabase?.getClient();
  if (!sb) return;

  try {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'กำลังเตรียมเอกสารใบลา...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });
    }

    const { data: req, error } = await sb
      .from('leave_requests')
      .select(`
        *,
        employees!employee_id ( full_name, employee_code, nickname, departments!department_id(department_name), positions(position_name) ),
        leave_types ( leave_name )
      `)
      .eq('id', leaveId)
      .single();

    if (error || !req) throw new Error("ไม่พบข้อมูลเอกสารใบลา");

    const emp = req.employees || {};
    const printDays = req.actual_days || req.days_requested || req.total_days || 0;
    const printDurationFormatted = window.PVTSDK?.formatLeaveDurationFriendly ? window.PVTSDK.formatLeaveDurationFriendly(printDays, req.leave_hours || 0) : `${printDays} วัน`;
    const leaveName = req.leave_types?.leave_name || 'ไม่ระบุประเภทการลา';
    const deptName = emp.departments?.department_name || '-';
    const posName = emp.positions?.position_name || '-';

    const attachUrl = getAttachmentUrl(req);
    const isImageAttachment = attachUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(attachUrl.split('?')[0]);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      if (typeof Swal !== 'undefined') Swal.close();
      alert("กรุณาอนุญาตให้เปิด Pop-up ในเบราว์เซอร์เพื่อพิมพ์เอกสาร");
      return;
    }

    const docTitle = `ใบลา_${emp.employee_code || ''}_${emp.full_name || 'พนักงาน'}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="UTF-8">
        <title>${docTitle}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          @page { size: A4 portrait; margin: 12mm 15mm 12mm 15mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: 'Sarabun', sans-serif; margin: 0; padding: 0; background: #ffffff; color: #1e293b; line-height: 1.5; }
          .page { width: 100%; min-height: 270mm; background: #ffffff; position: relative; padding-bottom: 20mm; }
          
          /* Elegant modern company banner */
          .doc-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 20px; }
          .logo-area { display: flex; align-items: center; gap: 12px; }
          .logo-placeholder { width: 44px; height: 44px; background: linear-gradient(135deg, #0f766e, #0d9488); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 18px; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(15, 118, 110, 0.15); }
          .company-name { font-size: 18px; font-weight: 800; color: #0f766e; letter-spacing: -0.3px; line-height: 1.2; }
          .company-sub { font-size: 11px; color: #475569; font-weight: 500; margin-top: 1px; }
          
          .doc-meta { text-align: right; font-size: 11px; color: #475569; line-height: 1.4; }
          .doc-meta strong { color: #0f172a; }

          /* Clean, authoritative document title */
          .form-title-box { text-align: center; margin: 15px 0 20px 0; border: 1.5px solid #cbd5e1; padding: 12px; border-radius: 10px; background: #f8fafc; }
          .form-title-box h1 { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: 0.3px; }
          .form-title-box p { margin: 3px 0 0 0; font-size: 11px; color: #64748b; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
          
          /* Section separation */
          .section { margin-bottom: 20px; }
          .section-label { font-size: 13px; font-weight: 800; color: #0f766e; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.3px; }
          .section-label::after { content: ''; flex: 1; height: 1px; background: #cbd5e1; margin-left: 8px; }
          
          /* Form Tables (Sleek corporate grids) */
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; border-radius: 8px; overflow: hidden; border: 1px solid #cbd5e1; }
          .info-table td { padding: 8px 12px; font-size: 13px; border: 1px solid #cbd5e1; color: #334155; }
          .info-table td.label { width: 22%; background: #f8fafc; font-weight: 700; color: #475569; }
          .info-table td.value { background: #ffffff; }
          .info-table td.value strong { color: #0f172a; }

          /* Reason statement container */
          .reason-container { padding: 12px 16px; border: 1.5px solid #cbd5e1; border-radius: 8px; background: #fafafa; font-size: 13px; min-height: 60px; line-height: 1.6; color: #1e293b; }
          
          /* Status Stamp Style */
          .status-indicator { display: inline-flex; align-items: center; justify-content: center; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
          .status-approved { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
          .status-pending { background: #fffbeb; color: #b45309; border: 1px solid #fef3c7; }
          .status-rejected { background: #fef2f2; color: #b91c1c; border: 1px solid #fee2e2; }

          /* Beautiful corporate stamp / sign block */
          .signature-grid { margin-top: 40px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
          .sig-box { text-align: center; border: 1px solid #cbd5e1; border-radius: 10px; padding: 15px 10px 12px 10px; background: #ffffff; position: relative; }
          .sig-space { height: 50px; margin-bottom: 8px; display: flex; align-items: flex-end; justify-content: center; position: relative; }
          .sig-line { width: 85%; border-bottom: 1.2px solid #cbd5e1; margin: 0 auto; }
          .sig-name { font-size: 12px; font-weight: 700; margin-top: 6px; color: #1e293b; }
          .sig-title { font-size: 10.5px; color: #64748b; margin-top: 1px; font-weight: 500; }
          
          /* Electronic approval badge watermark overlay */
          .digital-stamp { font-size: 9px; border: 1.5px dashed #059669; color: #059669; padding: 4px 6px; border-radius: 6px; text-transform: uppercase; font-weight: 800; display: inline-block; transform: rotate(-3deg); line-height: 1.2; background: #f0fdf4; }

          .doc-footer { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="doc-header">
            <div class="logo-area">
              <div class="logo-placeholder">PVT</div>
              <div>
                <div class="company-name">PVT WORKFORCE HUB</div>
                <div class="company-sub">บริษัท พีวีที คอร์ปอเรชั่น จำกัด (สำนักงานใหญ่)</div>
              </div>
            </div>
            <div class="doc-meta">
              เลขที่เอกสาร: <strong>LV-${String(req.id).substring(0, 8).toUpperCase()}</strong><br>
              วันที่พิมพ์: <strong>${formatThaiDate(new Date().toISOString(), true)}</strong>
            </div>
          </div>
 
          <div class="form-title-box">
            <h1>ใบขออนุมัติลาหยุดงาน</h1>
            <p>LEAVE REQUEST APPLICATION FORM</p>
          </div>
 
          <div class="section">
            <div class="section-label">ข้อมูลผู้ยื่นคำขอลา (Applicant Profile)</div>
            <table class="info-table">
              <tr>
                <td class="label">รหัสพนักงาน</td>
                <td class="value"><strong>${emp.employee_code || '-'}</strong></td>
                <td class="label">ชื่อ-นามสกุล</td>
                <td class="value"><strong>${emp.full_name || '-'} ${emp.nickname ? `(${emp.nickname})` : ''}</strong></td>
              </tr>
              <tr>
                <td class="label">แผนก / สังกัด</td>
                <td class="value"><strong>${deptName}</strong></td>
                <td class="label">ตำแหน่งงาน</td>
                <td class="value"><strong>${posName}</strong></td>
              </tr>
            </table>
          </div>
 
          <div class="section">
            <div class="section-label">รายละเอียดการขอลา (Leave Details)</div>
            <table class="info-table">
              <tr>
                <td class="label">ประเภทการลา</td>
                <td class="value"><strong style="color: #0f766e; font-size: 14px;">${leaveName}</strong></td>
                <td class="label">สถานะคำขอ</td>
                <td class="value">
                  <span class="status-indicator ${req.status === 'approved' ? 'status-approved' : req.status === 'rejected' ? 'status-rejected' : 'status-pending'}">
                    ${req.status === 'approved' ? 'อนุมัติแล้ว' : req.status === 'rejected' ? 'ปฏิเสธ' : 'รอพิจารณา'}
                  </span>
                </td>
              </tr>
              <tr>
                <td class="label">ตั้งแต่วันที่</td>
                <td class="value"><strong>${formatThaiDate(req.start_date)}</strong></td>
                <td class="label">ถึงวันที่</td>
                <td class="value"><strong>${formatThaiDate(req.end_date)}</strong></td>
              </tr>
              <tr>
                <td class="label">รวมระยะเวลาการลา</td>
                <td class="value" colspan="3"><strong style="font-size: 14px; color: #0f766e;">${printDurationFormatted}</strong></td>
              </tr>
            </table>
          </div>
 
          <div class="section">
            <div class="section-label">เหตุผลความจำเป็นในการลา (Leave Reason)</div>
            <div class="reason-container">
              <strong>เหตุผลการลา:</strong> ${req.reason || 'ไม่ได้ระบุเหตุผลความจำเป็น'}<br>
              ${req.approval_comment ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1.2px dashed #cbd5e1; color: #b91c1c; font-size: 12px; font-weight: 600;">* ความเห็นเพิ่มเติมจากผู้อนุมัติ: ${req.approval_comment}</div>` : ''}
            </div>
          </div>
 
          <div class="signature-grid">
            <div class="sig-box">
              <div class="sig-space">
                <span class="digital-stamp" style="border-color: #0d9488; color: #0d9488; background: #f0fdfa;">[ ส่งออนไลน์สำเร็จ ]</span>
              </div>
              <div class="sig-name">${emp.full_name || 'ผู้ยื่นคำขอ'}</div>
              <div class="sig-line" style="margin-top: 4px;"></div>
              <div class="sig-title">พนักงานผู้ขอลา</div>
            </div>
            <div class="sig-box">
              <div class="sig-space">
                ${req.manager_status === 'approved' ? `
                  <div class="digital-stamp">
                    APPROVED L1<br>
                    <span style="font-size:7px; font-weight:normal;">ผ่านระบบออนไลน์</span>
                  </div>
                ` : '<div class="sig-line"></div>'}
              </div>
              <div class="sig-name">${req.manager_status === 'approved' ? 'อนุมัติโดยผู้จัดการ (L1)' : '( .................................................. )'}</div>
              <div class="sig-line" style="margin-top: 4px;"></div>
              <div class="sig-title">หัวหน้างาน / ผู้จัดการ (L1)</div>
            </div>
            <div class="sig-box">
              <div class="sig-space">
                ${req.status === 'approved' ? `
                  <div class="digital-stamp" style="border-color: #0f766e; color: #0f766e;">
                    APPROVED L2 (HR)<br>
                    <span style="font-size:7px; font-weight:normal;">ผ่านระบบอนุมัติกลาง</span>
                  </div>
                ` : '<div class="sig-line"></div>'}
              </div>
              <div class="sig-name">${req.status === 'approved' ? 'ฝ่ายทรัพยากรบุคคล' : '( .................................................. )'}</div>
              <div class="sig-line" style="margin-top: 4px;"></div>
              <div class="sig-title">ฝ่ายทรัพยากรบุคคล (HR L2)</div>
            </div>
          </div>
 
          <div class="doc-footer">
            เอกสารฉบับนี้พิมพ์อย่างเป็นทางการโดยระบบระบบสารสนเทศความร่วมมือทีมและจัดสรรวันลา (PVT WORKFORCE HUB)<br>
            รหัสเอกสารอ้างอิง: <strong>${req.id}</strong> | ตรวจสอบข้อมูลล่าสุดในแอปพลิเคชันหลัก
          </div>
        </div>
 
        <script>
          window.onload = function() {
            if (window.opener && window.opener.Swal) window.opener.Swal.close();
            setTimeout(() => { window.print(); }, 500);
          };
        </script>
      </body>
      </html>
    `);

    printWindow.document.close();
    if (typeof Swal !== 'undefined') Swal.close();

  } catch (err) {
    console.error("💥 Print Error:", err);
    if (typeof Swal !== 'undefined') {
      Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถสร้างเอกสารสำหรับพิมพ์ได้', 'error');
    }
  }
}

/* ==========================================================================
   📊 EXCEL EXPORT ENGINE (PREMIUM EXECUTIVE SUMMARY & CATEGORIZED SHEETS)
   ========================================================================== */

async function exportLeaveReportExcel() {
  if (!allLeaveRequests || !allLeaveRequests.length) {
    Swal.fire({
      title: 'ไม่พบข้อมูล',
      text: 'ยังไม่มีข้อมูลใบลาในระบบสำหรับการส่งออก',
      icon: 'info',
      confirmButtonColor: '#0fa472'
    });
    return;
  }

  if (typeof ExcelJS === 'undefined') {
    Swal.fire({
      title: 'กำลังเตรียมระบบ',
      text: 'กรุณารอสักครู่ กำลังโหลดเครื่องมือสร้างรายงาน Excel',
      icon: 'warning',
      confirmButtonColor: '#0fa472'
    });
    return;
  }

  // 1. ตัวเลือกการดาวน์โหลด
  const { value: exportOption } = await Swal.fire({
    title: '<span style="color:#0f172a; font-weight:700; font-size:20px;">📊 ดาวน์โหลดรายงานการลา Excel</span>',
    html: `
      <div style="text-align: left; font-family: 'Sarabun', sans-serif; font-size: 14px; color: #475569; display:flex; flex-direction:column; gap:14px;">
        <p>เลือกประเภทและขอบเขตข้อมูลที่ต้องการส่งออกเป็นรายงานและนำเข้าเครื่องมือคำนวณเงินเดือน (Payroll):</p>
        
        <div>
          <label style="font-weight: 600; color: #1e293b; display: block; margin-bottom: 4px;">รูปแบบรายงาน:</label>
          <select id="swalExportFormat" class="swal2-select" style="width: 100%; margin: 0; height: 42px; border-radius: 8px; font-size: 13.5px; border-color: #cbd5e1;">
            <option value="executive_full">📈 เล่มรายงานสมบูรณ์ (สรุป Dashboard + แยกประเภท + รายบุคคล)</option>
            <option value="summary_only">📊 สรุปภาพรวม Dashboard & สถิติรายแผนก (Executive Summary)</option>
            <option value="raw_active">📋 รายการตามที่กำลังแสดงบนตาราง (${currentLeaveTab === 'pending' ? 'รออนุมัติ' : currentLeaveTab === 'cancellation' ? 'ขอยกเลิก' : 'ประวัติทั้งหมด'})</option>
          </select>
        </div>

        <div>
          <label style="font-weight: 600; color: #1e293b; display: block; margin-bottom: 4px;">ตัวกรองสถานะ:</label>
          <select id="swalExportStatus" class="swal2-select" style="width: 100%; margin: 0; height: 42px; border-radius: 8px; font-size: 13.5px; border-color: #cbd5e1;">
            <option value="all">-- รวมทุกสถานะ (All Statuses) --</option>
            <option value="approved" selected>เฉพาะที่ "อนุมัติแล้ว" (Approved Only - แนะนำสำหรับทำเงินเดือน)</option>
            <option value="pending">เฉพาะที่ "รอพิจารณา" (Pending Only)</option>
            <option value="rejected">เฉพาะที่ "ไม่อนุมัติ / ยกเลิก" (Rejected/Cancelled)</option>
          </select>
        </div>

        <div>
          <label style="font-weight: 600; color: #1e293b; display: block; margin-bottom: 4px;">รอบระยะเวลา (วีค / 15 วัน เพื่อคำนวณเงินเดือน):</label>
          <select id="swalExportPeriod" class="swal2-select" style="width: 100%; margin: 0; height: 42px; border-radius: 8px; font-size: 13.5px; border-color: #cbd5e1;">
            <option value="all_time" selected>แสดงทั้งหมด (All dates)</option>
            <option value="first_15_cur">📅 วีคที่ 1: วันที่ 1 - 15 ของเดือนนี้</option>
            <option value="last_15_cur">📅 วีคที่ 2: วันที่ 16 - สิ้นเดือน ของเดือนนี้</option>
            <option value="first_15_prev">📅 วีคที่ 1: วันที่ 1 - 15 ของเดือนที่แล้ว</option>
            <option value="last_15_prev">📅 วีคที่ 2: วันที่ 16 - สิ้นเดือน ของเดือนที่แล้ว</option>
            <option value="weekly_cur">📅 สัปดาห์ปัจจุบัน (7 วันล่าสุด)</option>
            <option value="custom_range">⚙️ กำหนดช่วงวันที่เอง (Custom Range)</option>
          </select>
        </div>

        <div id="swalCustomDatesContainer" style="display: none; border: 1px dashed #cbd5e1; padding: 12px; border-radius: 8px; background: #f8fafc; gap: 8px;">
          <div style="display: flex; gap: 8px; align-items: center;">
            <div style="flex: 1;">
              <label style="font-size: 11px; font-weight:600; color:#475569;">วันที่เริ่มต้น:</label>
              <input type="date" id="swalStartDate" class="swal2-input" style="width: 100%; margin: 4px 0 0 0; height: 38px; border-radius: 6px; font-size: 13px; padding: 4px 8px;">
            </div>
            <div style="flex: 1;">
              <label style="font-size: 11px; font-weight:600; color:#475569;">วันที่สิ้นสุด:</label>
              <input type="date" id="swalEndDate" class="swal2-input" style="width: 100%; margin: 4px 0 0 0; height: 38px; border-radius: 6px; font-size: 13px; padding: 4px 8px;">
            </div>
          </div>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '📥 ดาวน์โหลด Excel',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0fa472',
    cancelButtonColor: '#64748b',
    focusConfirm: false,
    didOpen: () => {
      const selectPeriod = document.getElementById('swalExportPeriod');
      const customDatesDiv = document.getElementById('swalCustomDatesContainer');
      if (selectPeriod && customDatesDiv) {
        selectPeriod.addEventListener('change', (e) => {
          if (e.target.value === 'custom_range') {
            customDatesDiv.style.display = 'flex';
          } else {
            customDatesDiv.style.display = 'none';
          }
        });
      }
    },
    preConfirm: () => {
      return {
        format: document.getElementById('swalExportFormat').value,
        statusFilter: document.getElementById('swalExportStatus').value,
        period: document.getElementById('swalExportPeriod').value,
        startDate: document.getElementById('swalStartDate')?.value || '',
        endDate: document.getElementById('swalEndDate')?.value || ''
      };
    }
  });

  if (!exportOption) return;

  Swal.fire({
    title: 'กำลังสร้างไฟล์ Excel...',
    text: 'ระบบกำลังจัดทำสรุปภาพรวม สถิติ และแยกชีตข้อมูลอย่างสวยงาม',
    didOpen: () => Swal.showLoading(),
    allowOutsideClick: false
  });

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "PVT Workforce Hub";
    workbook.created = new Date();

    // กรองตาม statusFilter ที่เลือก
    let targetLeaves = [...allLeaveRequests];
    if (exportOption.statusFilter === 'approved') {
      targetLeaves = targetLeaves.filter(r => String(r.status).toLowerCase() === 'approved');
    } else if (exportOption.statusFilter === 'pending') {
      targetLeaves = targetLeaves.filter(r => isPendingStatus(r.status));
    } else if (exportOption.statusFilter === 'rejected') {
      targetLeaves = targetLeaves.filter(r => String(r.status).toLowerCase() === 'rejected' || isCancelRequestStatus(r.status));
    }

    if (exportOption.format === 'raw_active') {
      if (currentLeaveTab === 'pending') {
        targetLeaves = targetLeaves.filter(r => isPendingStatus(r.status));
      } else if (currentLeaveTab === 'cancellation') {
        targetLeaves = targetLeaves.filter(r => isCancelRequestStatus(r.status));
      }
    }

    // 🟢 ประยุกต์ใช้ตัวกรองรอบระยะเวลา (วีค / 15 วัน)
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth();

    let rangeStart = null;
    let rangeEnd = null;

    if (exportOption.period === 'first_15_cur') {
      rangeStart = new Date(curYear, curMonth, 1);
      rangeEnd = new Date(curYear, curMonth, 15, 23, 59, 59);
    } else if (exportOption.period === 'last_15_cur') {
      rangeStart = new Date(curYear, curMonth, 16);
      rangeEnd = new Date(curYear, curMonth + 1, 0, 23, 59, 59);
    } else if (exportOption.period === 'first_15_prev') {
      let prevMonth = curMonth - 1;
      let prevYear = curYear;
      if (prevMonth < 0) {
        prevMonth = 11;
        prevYear--;
      }
      rangeStart = new Date(prevYear, prevMonth, 1);
      rangeEnd = new Date(prevYear, prevMonth, 15, 23, 59, 59);
    } else if (exportOption.period === 'last_15_prev') {
      let prevMonth = curMonth - 1;
      let prevYear = curYear;
      if (prevMonth < 0) {
        prevMonth = 11;
        prevYear--;
      }
      rangeStart = new Date(prevYear, prevMonth, 16);
      rangeEnd = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59);
    } else if (exportOption.period === 'weekly_cur') {
      rangeStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      rangeEnd = new Date(today.getTime());
    } else if (exportOption.period === 'custom_range' && exportOption.startDate && exportOption.endDate) {
      rangeStart = new Date(exportOption.startDate);
      rangeEnd = new Date(exportOption.endDate + 'T23:59:59');
    }

    if (rangeStart && rangeEnd) {
      targetLeaves = targetLeaves.filter(r => {
        if (!r.start_date || !r.end_date) return false;
        const lStart = new Date(r.start_date);
        const lEnd = new Date(r.end_date);
        // เช็คการคาบเกี่ยวของช่วงวันที่ลาและรอบการสแกน
        return lStart <= rangeEnd && lEnd >= rangeStart;
      });
    }

    // -------------------------------------------------------------
    // 🌟 SHEET 1: สรุปภาพรวม (Executive Leave Dashboard)
    // -------------------------------------------------------------
    const summarySheet = workbook.addWorksheet("📊 สรุปภาพรวม (Executive Summary)", {
      views: [{ showGridLines: true }]
    });

    // 1. หัวตารางรายงาน
    summarySheet.mergeCells("A1:G1");
    const headerCell = summarySheet.getCell("A1");
    headerCell.value = "🏢 บริษัท พีวีที เวิร์กฟอร์ซ ฮับ | รายงานสรุปภาพรวมการลาพนักงาน (Executive Leave Dashboard)";
    headerCell.font = { name: "Sarabun", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
    headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B845C" } };
    headerCell.alignment = { vertical: "middle", horizontal: "center" };
    summarySheet.getRow(1).height = 36;

    summarySheet.mergeCells("A2:G2");
    const subHeader = summarySheet.getCell("A2");
    let filterPeriodText = "รอบเวลา: ทั้งหมด";
    if (rangeStart && rangeEnd) {
      filterPeriodText = `รอบเวลา: ${rangeStart.toLocaleDateString("th-TH")} ถึง ${rangeEnd.toLocaleDateString("th-TH")}`;
    }
    subHeader.value = `วันที่สร้างรายงาน: ${new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} | ${filterPeriodText} | สิทธิ์: HR`;
    subHeader.font = { name: "Sarabun", size: 10, italic: true, color: { argb: "FF475569" } };
    subHeader.alignment = { vertical: "middle", horizontal: "center" };
    summarySheet.getRow(2).height = 20;

    // 2. การ์ด KPI รวม (Stats KPI Cards)
    const totalRequests = targetLeaves.length;
    const approvedCount = targetLeaves.filter(r => String(r.status).toLowerCase() === 'approved').length;
    const pendingCount = targetLeaves.filter(r => isPendingStatus(r.status)).length;
    const cancelCount = targetLeaves.filter(r => isCancelRequestStatus(r.status)).length;
    const totalApprovedDays = targetLeaves
      .filter(r => String(r.status).toLowerCase() === 'approved')
      .reduce((sum, r) => sum + Number(r.actual_days || r.total_days || 0), 0);

    summarySheet.getRow(4).values = ["ตัวชี้วัดสำคัญ (Key Metrics)", "รายการรวม", "อนุมัติแล้ว", "รอพิจารณา", "ขอยกเลิก", "วันลาที่อนุมัติสะสม", "เฉลี่ยวัน/รายการ"];
    summarySheet.getRow(5).values = [
      "สถิติภาพรวมบริษัท", 
      totalRequests, 
      approvedCount, 
      pendingCount, 
      cancelCount, 
      totalApprovedDays,
      approvedCount > 0 ? Number((totalApprovedDays / approvedCount).toFixed(1)) : 0
    ];

    const kpiHead = summarySheet.getRow(4);
    const kpiVal = summarySheet.getRow(5);
    kpiHead.height = 24;
    kpiVal.height = 28;

    for (let c = 1; c <= 7; c++) {
      const cellH = kpiHead.getCell(c);
      const cellV = kpiVal.getCell(c);

      cellH.font = { name: "Sarabun", size: 11, bold: true, color: { argb: "FF0F172A" } };
      cellH.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cellH.alignment = { vertical: "middle", horizontal: "center" };
      cellH.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

      cellV.font = { name: "Kanit", size: 13, bold: true, color: { argb: c === 3 ? "FF059669" : c === 4 ? "FFD97706" : "FF0F172A" } };
      cellV.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c === 3 ? "FFECFDF5" : c === 4 ? "FFFFFBEB" : "FFF8FAFC" } };
      cellV.alignment = { vertical: "middle", horizontal: "center" };
      cellV.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    }

    // 3. ตารางแยกสถิติตามประเภทการลา (Summary by Leave Type)
    summarySheet.getCell("A7").value = "📋 1. สรุปสถิติแยกตามประเภทการลา (Breakdown by Leave Type)";
    summarySheet.getCell("A7").font = { name: "Sarabun", size: 12, bold: true, color: { argb: "FF0B845C" } };

    const typeSummaryRow = summarySheet.getRow(8);
    typeSummaryRow.values = ["ประเภทการลา", "จำนวนคำขอ (รายการ)", "อนุมัติแล้ว", "วันลารวม (วัน)", "สัดส่วน %", "สถานะ"];
    typeSummaryRow.height = 24;
    for (let c = 1; c <= 6; c++) {
      const cell = typeSummaryRow.getCell(c);
      cell.font = { name: "Sarabun", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0FA472" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }

    // รวมกลุ่มประเภทการลา
    const leaveTypeMap = {};
    targetLeaves.forEach(r => {
      const type = r.leave_types?.leave_name || "ไม่ระบุประเภท";
      if (!leaveTypeMap[type]) {
        leaveTypeMap[type] = { count: 0, approvedCount: 0, days: 0 };
      }
      leaveTypeMap[type].count++;
      if (String(r.status).toLowerCase() === 'approved') {
        leaveTypeMap[type].approvedCount++;
        leaveTypeMap[type].days += Number(r.actual_days || r.total_days || 0);
      }
    });

    let rowIdx = 9;
    Object.entries(leaveTypeMap).forEach(([tName, data]) => {
      const pct = totalRequests > 0 ? ((data.count / totalRequests) * 100).toFixed(1) + "%" : "0%";
      const row = summarySheet.getRow(rowIdx);
      row.values = [tName, data.count, data.approvedCount, data.days, pct, data.count > 0 ? "มีรายการลา" : "ไม่มีข้อมูล"];
      row.height = 20;

      for (let c = 1; c <= 6; c++) {
        const cell = row.getCell(c);
        cell.font = { name: "Sarabun", size: 10 };
        cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "center" };
        cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
      }
      rowIdx++;
    });

    // 4. ตารางแยกสถิติตามแผนก (Summary by Department)
    rowIdx += 2;
    summarySheet.getCell(`A${rowIdx}`).value = "🏢 2. สรุปสถิติแยกตามแผนก (Breakdown by Department)";
    summarySheet.getCell(`A${rowIdx}`).font = { name: "Sarabun", size: 12, bold: true, color: { argb: "FF0B845C" } };
    rowIdx++;

    const deptHeaderRow = summarySheet.getRow(rowIdx);
    deptHeaderRow.values = ["ชื่อแผนก / ฝ่าย", "จำนวนคำขอทั้งหมด", "อนุมัติแล้ว", "วันลารวม (วัน)", "รอตรวจสอบ", "สัดส่วน %"];
    deptHeaderRow.height = 24;
    for (let c = 1; c <= 6; c++) {
      const cell = deptHeaderRow.getCell(c);
      cell.font = { name: "Sarabun", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B82F6" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
    rowIdx++;

    const deptMap = {};
    targetLeaves.forEach(r => {
      const dept = r.employees?.departments?.department_name || "ส่วนกลาง / ไม่ระบุ";
      if (!deptMap[dept]) {
        deptMap[dept] = { count: 0, approved: 0, days: 0, pending: 0 };
      }
      deptMap[dept].count++;
      if (String(r.status).toLowerCase() === 'approved') {
        deptMap[dept].approved++;
        deptMap[dept].days += Number(r.actual_days || r.total_days || 0);
      }
      if (isPendingStatus(r.status)) {
        deptMap[dept].pending++;
      }
    });

    Object.entries(deptMap).forEach(([dName, data]) => {
      const pct = totalRequests > 0 ? ((data.count / totalRequests) * 100).toFixed(1) + "%" : "0%";
      const row = summarySheet.getRow(rowIdx);
      row.values = [dName, data.count, data.approved, data.days, data.pending, pct];
      row.height = 20;

      for (let c = 1; c <= 6; c++) {
        const cell = row.getCell(c);
        cell.font = { name: "Sarabun", size: 10 };
        cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "center" };
        cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
      }
      rowIdx++;
    });

    // ปรับความกว้างคอลัมน์ของชีตสรุป
    summarySheet.columns = [
      { width: 34 },
      { width: 22 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 20 },
      { width: 18 }
    ];

    // -------------------------------------------------------------
    // 📄 SHEET 2: รายการคำขอลาทั้งหมด (Detailed Requests Log)
    // -------------------------------------------------------------
    if (exportOption.format !== 'summary_only') {
      const detailSheet = workbook.addWorksheet("📋 ข้อมูลการลาละเอียด (Detailed Records)", {
        views: [{ showGridLines: true }]
      });

      // Headers
      const headers = [
        "ลำดับ",
        "รหัสพนักงาน",
        "ชื่อ-นามสกุล",
        "ชื่อเล่น",
        "แผนก",
        "ตำแหน่ง",
        "ประเภทการลา",
        "สิทธิ์จ่ายเงิน (Paid/Unpaid)",
        "วันที่เริ่มต้น",
        "วันที่สิ้นสุด",
        "จำนวนวันลา",
        "เหตุผลการลา",
        "สถานะหัวหน้า (L1)",
        "สถานะผู้จัดการ (L2)",
        "สถานะสุดท้าย HR (L3)",
        "วันที่ยื่นคำขอ"
      ];

      const headerRow = detailSheet.getRow(1);
      headerRow.values = headers;
      headerRow.height = 26;

      for (let c = 1; c <= headers.length; c++) {
        const cell = headerRow.getCell(c);
        cell.font = { name: "Sarabun", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0FA472" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = { top: { style: "thin" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } };
      }

      // Populate Data
      targetLeaves.forEach((r, idx) => {
        const emp = r.employees || {};
        const empCode = emp.employee_code || "-";
        const empName = emp.full_name || "-";
        const nickname = emp.nickname || "-";
        const dept = emp.departments?.department_name || "-";
        const position = emp.positions?.position_name || "-";
        const leaveType = r.leave_types?.leave_name || "ไม่ระบุ";
        const isPaidText = r.leave_types?.paid_leave ? "ได้รับค่าจ้าง (Paid)" : "หักค่าจ้าง (Unpaid)";
        const startDate = formatThaiDate(r.start_date);
        const endDate = formatThaiDate(r.end_date);
        const days = r.actual_days || r.days_requested || r.total_days || 0;
        const reason = (r.reason || r.note || "-").replace(/[\r\n]+/g, " ");
        
        const mStatus = r.manager_status === 'approved' ? 'อนุมัติแล้ว' : r.manager_status === 'rejected' ? 'ไม่อนุมัติ' : 'รอพิจารณา';
        const dStatus = r.director_status === 'approved' ? 'อนุมัติแล้ว' : r.director_status === 'rejected' ? 'ไม่อนุมัติ' : 'รอพิจารณา';
        const hrStatus = r.status === 'approved' ? 'อนุมัติครบสมบูรณ์' : r.status === 'rejected' ? 'ไม่อนุมัติ' : isCancelRequestStatus(r.status) ? 'ขอยกเลิก' : 'รออนุมัติ';
        const createdAt = r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "-";

        const row = detailSheet.getRow(idx + 2);
        row.values = [
          idx + 1,
          empCode,
          empName,
          nickname,
          dept,
          position,
          leaveType,
          isPaidText,
          startDate,
          endDate,
          days,
          reason,
          mStatus,
          dStatus,
          hrStatus,
          createdAt
        ];
        row.height = 20;

        // สลับสีแถว (Zebra striping)
        const isEven = idx % 2 === 0;
        const rowBg = isEven ? "FFFFFFFF" : "FFF8FAFC";

        for (let c = 1; c <= headers.length; c++) {
          const cell = row.getCell(c);
          cell.font = { name: "Sarabun", size: 10 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
          cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };

          // ปรับการจัดแนว (ลำดับ, รหัส, ชื่อเล่น, วันที่เริ่มต้น, วันที่สิ้นสุด, จำนวนวัน, L1, L2, L3, วันที่ยื่น, สิทธิ์จ่ายเงิน)
          if ([1, 2, 4, 8, 9, 10, 11, 13, 14, 15, 16].includes(c)) {
            cell.alignment = { vertical: "middle", horizontal: "center" };
          } else {
            cell.alignment = { vertical: "middle", horizontal: "left" };
          }

          // ไฮไลต์สิทธิ์จ่ายเงิน
          if (c === 8) {
            if (r.leave_types?.paid_leave) {
              cell.font = { name: "Sarabun", size: 10, bold: true, color: { argb: "FF059669" } };
            } else {
              cell.font = { name: "Sarabun", size: 10, bold: true, color: { argb: "FFD97706" } };
            }
          }

          // ไฮไลต์สถานะสุดท้าย L3
          if (c === 15) {
            if (r.status === 'approved') {
              cell.font = { name: "Sarabun", size: 10, bold: true, color: { argb: "FF059669" } };
            } else if (r.status === 'rejected') {
              cell.font = { name: "Sarabun", size: 10, bold: true, color: { argb: "FFDC2626" } };
            }
          }
        }
      });

      // ปรับขนาดคอลัมน์ให้สวยงาม
      detailSheet.columns = [
        { width: 8 },   // ลำดับ
        { width: 14 },  // รหัส
        { width: 24 },  // ชื่อ
        { width: 12 },  // ชื่อเล่น
        { width: 22 },  // แผนก
        { width: 22 },  // ตำแหน่ง
        { width: 18 },  // ประเภท
        { width: 22 },  // สิทธิ์จ่ายเงิน (NEW!)
        { width: 16 },  // เริ่ม
        { width: 16 },  // สิ้นสุด
        { width: 14 },  // จำนวนวัน
        { width: 30 },  // เหตุผล
        { width: 18 },  // L1
        { width: 18 },  // L2
        { width: 22 },  // L3
        { width: 16 }   // วันที่ยื่น
      ];
    }

    // ทำการแปลงและดาวน์โหลดไฟล์
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `รายงานสรุปภาพรวมการลา_PVT_${timestamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    Swal.fire({
      title: 'ดาวน์โหลดสำเร็จ!',
      text: 'รายงานสรุปภาพรวมและข้อมูลการลาถูกสร้างเรียบร้อยแล้ว',
      icon: 'success',
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#0fa472',
      showDenyButton: false,
      showCancelButton: false,
      showCloseButton: false
    });

  } catch (err) {
    console.error("💥 Excel Export Error:", err);
    Swal.fire({
      title: 'เกิดข้อผิดพลาด',
      text: 'ไม่สามารถสร้างไฟล์ Excel ได้: ' + err.message,
      icon: 'error',
      confirmButtonColor: '#ef4444'
    });
  }
}

/* ==========================================================================
   🚪 8. GLOBAL EXPORTS & LOGOUT
   ========================================================================== */

window.approveLeave = approveLeave;
window.rejectLeave = rejectLeave;
window.forceCancelLeave = forceCancelLeave;
window.approveCancellation = approveCancellation;
window.rejectCancellation = rejectCancellation;
window.printLeaveA4 = printLeaveA4;
window.loadPendingLeavesHR = loadPendingLeavesHR;
window.previewLeaveModal = previewLeaveModal;
window.closePreviewModal = closePreviewModal;
window.openImageLightbox = openImageLightbox;
window.closeImageLightbox = closeImageLightbox;
window.exportLeaveReportExcel = exportLeaveReportExcel;

/* ==========================================================================
   ⚡ BULK ACTION WORKFLOW (อนุมัติหลายรายการพร้อมกัน)
   ========================================================================== */
window.toggleSelectAllBulk = function(sourceCheckbox) {
  const checkboxes = document.querySelectorAll(".bulk-item-check");
  checkboxes.forEach(cb => {
    cb.checked = sourceCheckbox.checked;
  });
  handleBulkItemCheckChange();
};

window.handleBulkItemCheckChange = function() {
  const checkboxes = document.querySelectorAll(".bulk-item-check");
  const checkedBoxes = document.querySelectorAll(".bulk-item-check:checked");
  const countSpan = document.getElementById("bulkSelectedCount");
  const selectAll = document.getElementById("selectAllBulk");
  
  if (countSpan) {
    countSpan.innerText = `เลือกแล้ว ${checkedBoxes.length} รายการ`;
  }
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && checkedBoxes.length === checkboxes.length;
  }
};

window.cancelBulkSelection = function() {
  const checkboxes = document.querySelectorAll(".bulk-item-check");
  checkboxes.forEach(cb => cb.checked = false);
  const selectAll = document.getElementById("selectAllBulk");
  if (selectAll) selectAll.checked = false;
  const countSpan = document.getElementById("bulkSelectedCount");
  if (countSpan) countSpan.innerText = "เลือกแล้ว 0 รายการ";
};

window.submitBulkApproval = async function() {
  const checkedBoxes = Array.from(document.querySelectorAll(".bulk-item-check:checked"));
  if (checkedBoxes.length === 0) {
    return Swal.fire({
      icon: 'warning',
      title: 'ยังไม่ได้เลือกรายการ',
      text: 'กรุณาทำเครื่องหมายถูกที่ช่องหน้ารายการใบลาที่ต้องการอนุมัติครับ',
      confirmButtonColor: '#0d9488'
    });
  }

  const result = await Swal.fire({
    title: 'ยืนยันอนุมัติกลุ่ม?',
    html: `คุณต้องการอนุมัติใบลาทั้งหมด <strong>${checkedBoxes.length} รายการ</strong> ที่เลือกพร้อมกันทันทีหรือไม่?`,
    icon: 'question',
    showCancelButton: true,
    showDenyButton: false,
    confirmButtonColor: '#0d9488',
    cancelButtonColor: '#64748b',
    confirmButtonText: `✔️ ยืนยันอนุมัติ (${checkedBoxes.length} รายการ)`,
    cancelButtonText: 'ยกเลิก'
  });

  if (!result.isConfirmed) return;

  const total = checkedBoxes.length;
  let successCount = 0;
  let failCount = 0;

  Swal.fire({
    title: 'กำลังอนุมัติกลุ่ม...',
    html: `ระบบกำลังประมวลผล <strong>0</strong> จาก ${total} รายการ`,
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  const sb = window.pvtSupabase?.getClient?.() || window.supabaseClient;

  for (let i = 0; i < total; i++) {
    const leaveId = checkedBoxes[i].dataset.id;
    try {
      const reqData = allLeaveRequests.find(r => String(r.id) === String(leaveId));
      if (!reqData) continue;

      if (window.PVTSDK?.user?.ensureLeaveBalances) {
        await window.PVTSDK.user.ensureLeaveBalances(reqData.employee_id, reqData.start_date);
      }

      let updateFields = {};
      if (currentRole === 'leader') {
        updateFields.manager_status = 'approved';
        const deptId = reqData.employees?.department_id || null;
        const deptInfo = deptApproversMap[deptId] || {};
        const hasManagerInDept = deptInfo.hasManager || Boolean(reqData.employees?.l2_approver_id);
        if (!hasManagerInDept) {
          updateFields.director_status = 'approved';
          if (!hasExecutiveColumn) {
            updateFields.status = 'approved';
            updateFields.approved_at = new Date().toISOString();
          }
        }
      } else if (currentRole === 'manager') {
        updateFields.director_status = 'approved';
        if (reqData.manager_status !== 'approved') updateFields.manager_status = 'approved';
        if (hasExecutiveColumn) {
          const isApplicantLeaderOrManager = isLeaderOrManagerRole(reqData.employees?.role, reqData.employees?.positions?.position_name);
          if (!isApplicantLeaderOrManager) {
            updateFields.executive_status = 'approved';
            updateFields.status = 'approved';
            updateFields.approved_at = new Date().toISOString();
          }
        } else {
          updateFields.status = 'approved';
          updateFields.approved_at = new Date().toISOString();
        }
      } else if (currentRole === 'executive' || currentRole === 'director' || currentRole === 'owner' || (window.executiveApproverId && String(currentEmpId) === String(window.executiveApproverId))) {
        if (reqData.manager_status !== 'approved') updateFields.manager_status = 'approved';
        if (reqData.director_status !== 'approved') updateFields.director_status = 'approved';
        if (hasExecutiveColumn) {
          updateFields.executive_status = 'approved';
        }
        updateFields.status = 'approved';
        updateFields.approved_at = new Date().toISOString();
      } else {
        if (reqData.manager_status !== 'approved') updateFields.manager_status = 'approved';
        if (reqData.director_status !== 'approved') updateFields.director_status = 'approved';
        if (hasExecutiveColumn) updateFields.executive_status = 'approved';
        updateFields.status = 'approved';
        updateFields.approved_at = new Date().toISOString();
      }

      if (updateFields.status === 'approved') {
        const leaveDays = await getEffectiveLeaveDays(reqData);
        const currentYear = getADYear(reqData.start_date);
        if (window.PVTSDK?.user?.updateLeaveBalance) {
          const lCode = reqData.leave_types?.leave_code || null;
          await window.PVTSDK.user.updateLeaveBalance(reqData.employee_id, reqData.leave_type_id, lCode, currentYear, leaveDays);
        }
      }

      const { error: updateErr } = await sb
        .from('leave_requests')
        .update(updateFields)
        .eq('id', leaveId);

      if (updateErr) throw updateErr;

      // In-app Notification
      await sb.from('notifications').insert({
        employee_id: reqData.employee_id,
        title: `ใบลาของคุณได้รับการอนุมัติ`,
        message: `ใบลาประเภท ${reqData.leave_types?.leave_name || 'ใบลา'} วันที่ ${reqData.start_date} ได้รับการอนุมัติแล้ว`,
        type: 'leave',
        link_url: '/pages/user/index-user.html'
      });

      successCount++;
    } catch (err) {
      console.error(`Bulk item ${leaveId} failed:`, err);
      failCount++;
    }

    const htmlContent = `ระบบกำลังประมวลผล <strong>${i + 1}</strong> จาก ${total} รายการ`;
    const popup = Swal.getHtmlContainer();
    if (popup) popup.innerHTML = htmlContent;
  }

  Swal.fire({
    icon: 'success',
    title: 'อนุมัติกลุ่มสำเร็จ!',
    html: `ระบบดำเนินการอนุมัติเรียบร้อยทั้งหมด <strong>${successCount}</strong> รายการ${failCount > 0 ? `<br><small style="color:red">ไม่สำเร็จ ${failCount} รายการ</small>` : ''}`,
    confirmButtonColor: '#0d9488',
    confirmButtonText: 'ตกลง'
  }).then(() => {
    loadPendingLeavesHR();
  });
};

window.handleLogout = function() {
  Swal.fire({
    title: 'ยืนยันการออกจากระบบ',
    text: 'คุณต้องการออกจากระบบ PVT Workforce Hub ใช่หรือไม่?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'ออกจากระบบ',
    cancelButtonText: 'ยกเลิก'
  }).then((result) => {
    if (result.isConfirmed) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/index.html";
    }
  });
};

// 📱 Auto-sync on Android/Mobile WebView foreground resume for HR Dashboard
let lastHrSyncTime = Date.now();
async function handleHrAutoSync() {
  if (document.visibilityState === 'visible' || !document.hidden) {
    const now = Date.now();
    if (now - lastHrSyncTime > 4000) {
      lastHrSyncTime = now;
      console.log("📱 [AUTO-SYNC] HR Dashboard foreground resume, refreshing pending leaves & stats...");
      try {
        if (typeof loadPendingLeavesHR === 'function') loadPendingLeavesHR();
        if (typeof loadDeptApproversMapping === 'function') loadDeptApproversMapping();
      } catch (err) {
        console.warn("HR auto-sync error:", err);
      }
    }
  }
}

document.addEventListener("visibilitychange", handleHrAutoSync);
window.addEventListener("pageshow", handleHrAutoSync);
window.addEventListener("focus", handleHrAutoSync);

// Polling ทุกๆ 15 วินาที
setInterval(() => {
  if (document.visibilityState === 'visible' && !document.hidden) {
    if (typeof loadPendingLeavesHR === 'function') loadPendingLeavesHR(true);
  }
}, 15000);

// ⚡ Realtime Channel Subscription for instant leave updates
let hrRealtimeChannel = null;
function setupHrRealtimeSubscription() {
  try {
    const sb = window.pvtSupabase?.getClient();
    if (!sb || hrRealtimeChannel) return;

    hrRealtimeChannel = sb
      .channel('hr-leave-requests-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leave_requests' },
        (payload) => {
          console.log('⚡ [Realtime Leave INSERT]:', payload.new?.id);
          if (typeof loadPendingLeavesHR === 'function') {
            loadPendingLeavesHR(true);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leave_requests' },
        (payload) => {
          console.log('⚡ [Realtime Leave UPDATE]:', payload.new?.id);
          if (typeof loadPendingLeavesHR === 'function') {
            loadPendingLeavesHR(true);
          }
        }
      )
      .subscribe((status) => {
        console.log('⚡ [Realtime Channel Status]:', status);
      });
  } catch (err) {
    console.warn('Realtime subscription error:', err);
  }
}

// Initialize Realtime once SDK is ready
if (window.pvtSupabase) {
  setupHrRealtimeSubscription();
} else {
  window.addEventListener('load', () => {
    setTimeout(setupHrRealtimeSubscription, 1000);
  });
}