// ============================================================
// PVT Workforce Hub - ตั้งค่าสายอนุมัติใบลา
// ใช้ตาราง: departments, employees, department_approvers
// ============================================================

let sb = null;
let departments = [];
let employees = [];
let approverMap = new Map();
let executiveSetting = null;
let realtimeSub = null;
let lastSyncTime = null;

/**
 * 🔒 ตรวจสอบว่าพนักงานมี LINE User ID พร้อมใช้งานหรือไม่ (Robust Check)
 */
window.isLineConnected = function(emp) {
  if (!emp || !emp.line_id) return false;
  const str = String(emp.line_id).trim();
  return str !== "" && str !== "null" && str !== "undefined" && str !== "-";
};

document.addEventListener("DOMContentLoaded", async () => {
  const session = JSON.parse(localStorage.getItem("currentUser") || "{}");
  const userStatus = typeof window.getUserRoleCategory === "function" 
    ? window.getUserRoleCategory(session) 
    : { category: "guest" };

  if (userStatus.category !== "hr_exec") {
    console.warn("🚫 [Approval Settings]: ไม่มีสิทธิ์เข้าถึงหน้านี้");
    window.location.replace("/pages/hr/home.html");
    return;
  }

  sb = window.pvtSupabase?.getClient?.() || window.supabaseClient || null;

  if (!sb) {
    Swal.fire("เชื่อมต่อไม่ได้", "ไม่พบ Supabase Client", "error");
    return;
  }

  bindEvents();
  await loadAllData();
  setupRealtimeSubscription();
});

function bindEvents() {
  document.getElementById("departmentSelect")?.addEventListener("change", handleDepartmentChange);
  document.getElementById("supervisorSelect")?.addEventListener("change", () => updateLineStatus("supervisor"));
  document.getElementById("managerSelect")?.addEventListener("change", () => updateLineStatus("manager"));
  document.getElementById("saveApproverBtn")?.addEventListener("click", saveApprover);
  document.getElementById("executiveSelect")?.addEventListener("change", updateExecutiveLineStatus);
  document.getElementById("saveExecutiveBtn")?.addEventListener("click", saveExecutiveSetting);
  document.getElementById("saveLineNotifSettingsBtn")?.addEventListener("click", saveLineNotificationSettings);
  
  // New: Individual Approver Events
  document.getElementById("individualEmployeeSelect")?.addEventListener("change", handleIndividualEmployeeChange);
  document.getElementById("btnSaveIndividual")?.addEventListener("click", saveIndividualApprover);
}

/**
 * 🔄 ตั้งค่า Realtime Subscription เพื่อรับการอัปเดต LINE และสายอนุมัติอัตโนมัติแบบ Live
 */
function setupRealtimeSubscription() {
  if (!sb || typeof sb.channel !== "function") return;
  if (realtimeSub) {
    try { sb.removeChannel(realtimeSub); } catch(e) {}
  }

  try {
    realtimeSub = sb.channel("approval-settings-live-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, (payload) => {
        console.log("⚡ [Realtime] พนักงานมีการเปลี่ยนแปลง (เช่น เชื่อม LINE):", payload);
        if (payload.eventType === "UPDATE" && payload.new) {
          const idx = employees.findIndex(e => String(e.id) === String(payload.new.id));
          if (idx !== -1) {
            employees[idx] = { ...employees[idx], ...payload.new };
            // เติม department object หากขาด
            if (!employees[idx].departments && employees[idx].department_id) {
              const d = departments.find(x => String(x.id) === String(employees[idx].department_id));
              if (d) employees[idx].departments = { department_name: d.department_name };
            }
            renderApproverTable();
            renderEmployeeLineTable();
            updateExecutiveLineStatus();
            updateLineStatus("supervisor");
            updateLineStatus("manager");
          } else {
            loadAllData(true);
          }
        } else {
          loadAllData(true);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "department_approvers" }, () => {
        console.log("⚡ [Realtime] มีการอัปเดตสายอนุมัติแผนก");
        loadAllData(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "system_settings" }, () => {
        console.log("⚡ [Realtime] มีการอัปเดตการตั้งค่าระบบ/ผู้บริหาร");
        loadAllData(true);
      })
      .subscribe((status) => {
        console.log("📡 [Realtime Status]:", status);
      });
  } catch (rtErr) {
    console.warn("Realtime subscription setup failed:", rtErr);
  }
}

/**
 * 🔄 ฟังก์ชันกดซิงค์ข้อมูลทั้งหมดทันที (Manual Refresh with UI feedback)
 */
window.refreshAllApprovalData = async function() {
  const syncIcons = document.querySelectorAll("#syncIconHero, .spinning-sync-btn");
  syncIcons.forEach(ic => ic.classList.add("spinning-icon"));

  try {
    await loadAllData();
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true
    });
    Toast.fire({
      icon: 'success',
      title: 'ซิงค์ข้อมูลล่าสุดสำเร็จ'
    });
  } catch (err) {
    console.error("refreshAllApprovalData Error:", err);
  } finally {
    setTimeout(() => {
      syncIcons.forEach(ic => ic.classList.remove("spinning-icon"));
    }, 500);
  }
};

window.focusSection = function(sectionId, focusElementId) {
  const el = document.getElementById(sectionId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('highlight-pulse');
    void el.offsetWidth;
    el.classList.add('highlight-pulse');
  }
  if (focusElementId) {
    setTimeout(() => {
      const focusEl = document.getElementById(focusElementId);
      if (focusEl && !focusEl.disabled) {
        focusEl.focus();
      }
    }, 400);
  }
};

async function loadAllData(silent = false) {
  try {
    const [deptRes, empRes, mapRes, executiveRes] = await Promise.all([
      sb.from("departments").select("id, department_name").order("department_name"),
      sb.from("employees")
        .select("id, employee_code, full_name, nickname, department_id, role, line_id, status, image_url, l1_approver_id, l2_approver_id, positions(position_name), departments!department_id(department_name)")
        .order("full_name"),
      sb.from("department_approvers").select("id, department_id, supervisor_id, manager_id"),
      sb.from("system_settings").select("setting_key, employee_id").eq("setting_key", "leave_executive_approver").maybeSingle()
    ]);

    if (deptRes.error) throw deptRes.error;
    if (empRes.error) throw empRes.error;
    if (mapRes.error) throw mapRes.error;
    if (executiveRes.error) throw executiveRes.error;

    departments = deptRes.data || [];
    employees = empRes.data || [];
    
    // เติม fallback แผนกให้พนักงานทุกท่านเพื่อความแม่นยำ 100%
    employees.forEach(emp => {
      if (!emp.departments && emp.department_id) {
        const d = departments.find(x => String(x.id) === String(emp.department_id));
        if (d) emp.departments = { department_name: d.department_name };
      }
    });

    approverMap = new Map((mapRes.data || []).map(x => [String(x.department_id), x]));
    executiveSetting = executiveRes.data || null;
    lastSyncTime = new Date();

    renderExecutiveOptions();
    renderDepartmentOptions();
    renderIndividualEmployeeOptions(); // New
    
    // Initialize Tom Select for searchable dropdowns
    setTimeout(() => {
      initTomSelect();
    }, 200);
    
    renderApproverTable();
    renderEmployeeLineTable();
    await loadLineOaConfig();
    await loadLineNotificationSettings();
    await loadAutoDelegationData();
    
    updateSyncTimeBadge();
  } catch (err) {
    console.error("loadAllData:", err);
    if (!silent) {
      Swal.fire("โหลดข้อมูลไม่สำเร็จ", err.message || "กรุณาลองใหม่", "error");
    }
  }
}

function updateSyncTimeBadge() {
  const badge = document.getElementById("lastSyncTimeBadge");
  if (badge && lastSyncTime) {
    const timeStr = lastSyncTime.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    badge.textContent = `อัปเดตล่าสุด: ${timeStr}`;
  }
}

// ============================================================
// 🏢 1. จัดการรายชื่อแผนก (CRUD)
// ============================================================
window.manageDepartmentsModal = async function() {
  const { value: formValues } = await Swal.fire({
    title: '🏢 จัดการรายชื่อแผนก',
    html: `
      <div style="text-align: left; margin-bottom: 15px;">
        <button class="btn btn-primary btn-sm" onclick="addNewDepartmentPrompt()" style="margin-bottom: 15px;">
          <span class="material-symbols-outlined" style="font-size: 18px;">add</span> เพิ่มแผนกใหม่
        </button>
        <div id="modalDeptList" style="max-height: 300px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 12px;">
          <div style="padding: 20px; text-align: center; color: #94a3b8;">กำลังโหลด...</div>
        </div>
      </div>
    `,
    showConfirmButton: false,
    showCloseButton: true,
    didOpen: () => {
      renderModalDeptList();
    }
  });
};

async function renderModalDeptList() {
  const container = document.getElementById('modalDeptList');
  if (!container) return;

  try {
    const { data, error } = await sb.from('departments').select('*').order('department_name');
    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8;">ไม่มีข้อมูลแผนก</div>';
      return;
    }

    container.innerHTML = data.map(d => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #f1f5f9;">
        <span style="font-weight: 600; color: #1e293b;">${escapeHtml(d.department_name)}</span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-edit" onclick="editDeptNamePrompt('${d.id}', '${escapeAttr(d.department_name)}')">
            <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
          </button>
          <button class="btn btn-sm btn-delete" onclick="deleteDeptPrompt('${d.id}', '${escapeAttr(d.department_name)}')">
            <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="padding: 20px; color: #ef4444;">ข้อผิดพลาด: ${err.message}</div>`;
  }
}

window.addNewDepartmentPrompt = async function() {
  const { value: name } = await Swal.fire({
    title: 'เพิ่มแผนกใหม่',
    input: 'text',
    inputLabel: 'ชื่อแผนก',
    inputPlaceholder: 'เช่น ฝ่ายผลิต, ฝ่ายขาย',
    showCancelButton: true,
    confirmButtonColor: '#0d9488',
    inputValidator: (value) => {
      if (!value) return 'กรุณาระบุชื่อแผนก';
    }
  });

  if (name) {
    try {
      const { error } = await sb.from('departments').insert({ department_name: name });
      if (error) throw error;
      await loadAllData();
      renderModalDeptList();
      Swal.fire('สำเร็จ', 'เพิ่มแผนกเรียบร้อย', 'success');
    } catch (err) {
      Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
  }
};

window.editDeptNamePrompt = async function(id, currentName) {
  const { value: name } = await Swal.fire({
    title: 'แก้ไขชื่อแผนก',
    input: 'text',
    inputLabel: 'ชื่อแผนกใหม่',
    inputValue: currentName,
    showCancelButton: true,
    confirmButtonColor: '#0d9488',
    inputValidator: (value) => {
      if (!value) return 'กรุณาระบุชื่อแผนก';
    }
  });

  if (name) {
    try {
      const { error } = await sb.from('departments').update({ department_name: name }).eq('id', id);
      if (error) throw error;
      await loadAllData();
      renderModalDeptList();
    } catch (err) {
      Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
  }
};

window.deleteDeptPrompt = async function(id, name) {
  const result = await Swal.fire({
    title: 'ยืนยันการลบ?',
    text: `คุณกำลังลบแผนก "${name}" ซึ่งอาจมีผลต่อพนักงานในแผนกนี้`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'ลบข้อมูล',
    cancelButtonText: 'ยกเลิก'
  });

  if (result.isConfirmed) {
    try {
      const { error } = await sb.from('departments').delete().eq('id', id);
      if (error) throw error;
      await loadAllData();
      renderModalDeptList();
      Swal.fire('ลบแล้ว', 'ลบแผนกเรียบร้อย', 'success');
    } catch (err) {
      Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
  }
};

// ============================================================
// Helper คัดกรองพนักงานตามแผนกและตำแหน่งอย่างเคร่งครัด (Strict Department & Role Filtering)
// ============================================================

function isLeaderCandidate(emp) {
  if (!emp) return false;
  if (emp.status === 'resigned' || emp.status === 'inactive') return false;
  const role = (emp.role || "").toLowerCase();
  const pos = (emp.positions?.position_name || emp.position_name || emp.position || "").toLowerCase();
  const duty = (emp.positions?.duty_name || emp.duty_name || "").toLowerCase();
  const code = (emp.employee_code || "").toUpperCase();

  // 1. role เป็น leader, supervisor, hr, admin, superadmin, manager, officer
  if (['leader', 'supervisor', 'hr', 'admin', 'superadmin', 'manager', 'hr_manager', 'executive', 'director', 'officer'].includes(role)) return true;

  // 2. รหัส HR หรือบัญชีอนุมัติพิเศษ (HR-001, HR-002, HR-003 เป็นต้น)
  if (code.startsWith('HR') || code === 'HR-001' || code === 'HR-002' || code === 'HR-003') return true;

  // 3. ชื่อตำแหน่ง/หน้าที่ มีคำว่า หัวหน้า, leader, supervisor, lead
  const hasLeaderKeyword = (
    pos.includes('หัวหน้า') ||
    pos.includes('leader') ||
    pos.includes('supervisor') ||
    pos.includes('ผช.หัวหน้า') ||
    pos.includes('ผู้ช่วยหัวหน้า') ||
    pos.includes('รองหัวหน้า') ||
    pos.includes('lead') ||
    pos.includes('บุคคล') ||
    pos.includes('hr') ||
    duty.includes('หัวหน้า') ||
    duty.includes('leader') ||
    duty.includes('supervisor')
  );

  return hasLeaderKeyword;
}

function isManagerCandidate(emp) {
  if (!emp) return false;
  if (emp.status === 'resigned' || emp.status === 'inactive') return false;
  const role = (emp.role || "").toLowerCase();
  const pos = (emp.positions?.position_name || emp.position_name || emp.position || "").toLowerCase();
  const duty = (emp.positions?.duty_name || emp.duty_name || "").toLowerCase();
  const code = (emp.employee_code || "").toUpperCase();

  // 1. role เป็น manager, hr, hr_manager, executive, admin, superadmin, director, owner
  if (['manager', 'hr', 'hr_manager', 'executive', 'admin', 'superadmin', 'director', 'owner'].includes(role)) return true;

  // 2. รหัส HR หรือบัญชีอนุมัติพิเศษ
  if (code.startsWith('HR') || code === 'HR-001' || code === 'HR-002' || code === 'HR-003') return true;

  // 3. ชื่อตำแหน่ง/หน้าที่ มีคำว่า ผู้จัดการ, manager, ผจก, director, ผู้อำนวยการ, ผู้บริหาร, hr, บุคคล
  return (
    pos.includes('ผู้จัดการ') ||
    pos.includes('manager') ||
    pos.includes('ผจก') ||
    pos.includes('ผู้อำนวยการ') ||
    pos.includes('director') ||
    pos.includes('head') ||
    pos.includes('chief') ||
    pos.includes('gm') ||
    pos.includes('รองผู้จัดการ') ||
    pos.includes('ผู้ช่วยผู้จัดการ') ||
    pos.includes('บริหาร') ||
    pos.includes('บุคคล') ||
    pos.includes('hr') ||
    duty.includes('ผู้จัดการ') ||
    duty.includes('manager')
  );
}

function isExecutiveCandidate(emp) {
  if (!emp) return false;
  if (emp.status === 'resigned' || emp.status === 'inactive') return false;
  const role = (emp.role || "").toLowerCase();
  const pos = (emp.positions?.position_name || "").toLowerCase();
  const code = (emp.employee_code || "").toUpperCase();

  if (['executive', 'director', 'superadmin', 'admin'].includes(role)) return true;
  if (code === 'HR-001' || code === 'EXEC-001' || code === 'CEO-001') return true;

  if (
    pos.includes('ผู้บริหาร') ||
    pos.includes('executive') ||
    pos.includes('director') ||
    pos.includes('ผู้อำนวยการ') ||
    pos.includes('กรรมการ') ||
    pos.includes('managing') ||
    pos.includes('ceo') ||
    pos.includes('coo') ||
    pos.includes('cfo') ||
    pos.includes('cto') ||
    pos.includes('ประธาน') ||
    pos.includes('รองกรรมการ') ||
    pos.includes('chief') ||
    pos.includes('ผู้จัดการทั่วไป') ||
    pos.includes('gm')
  ) {
    return true;
  }

  return false;
}

function buildSupervisorOptions(departmentId, selectedId) {
  const targetId = String(departmentId || "");
  const dept = departments.find(d => String(d.id) === targetId);
  const deptName = dept?.department_name || "แผนก";

  // 1. พนักงานทุกคนในแผนกนี้ (Active) ให้สามารถเลือกเป็นหัวหน้า L1 ได้ทั้งหมด (รวมถึง HR-001 ในแผนกบุคคล)
  const inDeptEmployees = employees.filter(e => String(e.department_id) === targetId && e.status !== 'resigned');

  // 2. ดึงหัวหน้า / HR / ผู้จัดการจากทุกแผนก
  const allLeaders = employees.filter(e => isLeaderCandidate(e) && e.status !== 'resigned');

  let html = "";
  html += `<option value="">-- ไม่กำหนด / ข้ามขั้นตอน L1 (ส่งไป L2 หรือ HR) --</option>`;

  // แสดงกลุ่มพนักงานและหัวหน้าในแผนกตนเองก่อน
  if (inDeptEmployees.length > 0) {
    const realInDeptCount = inDeptEmployees.filter(e => !(window.isSystemOrAdminAccount && window.isSystemOrAdminAccount(e))).length;
    html += `<optgroup label="พนักงานและหัวหน้าในแผนก ${escapeHtml(deptName)} (${realInDeptCount} คน)">`;
    inDeptEmployees.forEach(e => {
      const pos = e.positions?.position_name || e.role || "เจ้าหน้าที่";
      const code = e.employee_code ? `#${e.employee_code} · ` : "";
      const isSel = selectedId && String(e.id) === String(selectedId);
      html += `<option value="${escapeAttr(e.id)}" ${isSel ? 'selected' : ''}>${escapeHtml(code + (e.full_name || "-") + " — " + pos)}</option>`;
    });
    html += `</optgroup>`;
  }

  // 3. แสดงกลุ่มหัวหน้า / HR / ผู้จัดการจากแผนกอื่น
  const otherLeaders = allLeaders.filter(e => !inDeptEmployees.some(inEmp => String(inEmp.id) === String(e.id)));
  if (otherLeaders.length > 0) {
    html += `<optgroup label="หัวหน้า / HR / ผู้จัดการ จากแผนกอื่น">`;
    otherLeaders.forEach(e => {
      const pos = e.positions?.position_name || e.role || "หัวหน้างาน";
      const empDept = departments.find(d => String(d.id) === String(e.department_id));
      const deptLabel = empDept ? ` [แผนก ${empDept.department_name}]` : "";
      const code = e.employee_code ? `#${e.employee_code} · ` : "";
      const isSel = selectedId && String(e.id) === String(selectedId);
      html += `<option value="${escapeAttr(e.id)}" ${isSel ? 'selected' : ''}>${escapeHtml(code + (e.full_name || "-") + " — " + pos + deptLabel)}</option>`;
    });
    html += `</optgroup>`;
  }

  // กรณีมีหัวหน้าเดิมที่เคยผูกไว้ (ถ้าไม่ติดอยู่ในกลุ่มข้างต้น)
  if (selectedId && !inDeptEmployees.some(e => String(e.id) === String(selectedId)) && !otherLeaders.some(e => String(e.id) === String(selectedId))) {
    const e = employees.find(x => String(x.id) === String(selectedId));
    if (e) {
      const pos = e.positions?.position_name || e.role || "หัวหน้างาน";
      const empDept = departments.find(d => String(d.id) === String(e.department_id));
      const deptLabel = empDept ? ` [แผนก ${empDept.department_name}]` : "";
      const code = e.employee_code ? `#${e.employee_code} · ` : "";
      html += `<option value="${escapeAttr(e.id)}" selected>${escapeHtml(code + (e.full_name || "-") + " — " + pos + deptLabel + " (หัวหน้าเดิม)")}</option>`;
    }
  }

  return html;
}

function buildManagerOptions(departmentId, selectedId) {
  const targetId = String(departmentId || "");
  const dept = departments.find(d => String(d.id) === targetId);
  const deptName = dept?.department_name || "แผนก";

  // 1. พนักงานทุกคนในแผนกนี้ (Active) ให้สามารถเลือกเป็นผู้จัดการ L2 ได้ทั้งหมด
  const inDeptEmployees = employees.filter(e => String(e.department_id) === targetId && e.status !== 'resigned');

  // 2. ดึงผู้จัดการและผู้บริหารจากทุกแผนก
  const allManagers = employees.filter(e => (isManagerCandidate(e) || isExecutiveCandidate(e)) && e.status !== 'resigned');

  let html = "";
  html += `<option value="">-- ไม่มีผู้จัดการ (ส่งใบลาหาผู้บริหารโดยตรง) --</option>`;

  // แสดงกลุ่มผู้จัดการ/บุคลากรในแผนกตนเองก่อน
  if (inDeptEmployees.length > 0) {
    const realInDeptCount = inDeptEmployees.filter(e => !(window.isSystemOrAdminAccount && window.isSystemOrAdminAccount(e))).length;
    html += `<optgroup label="ผู้จัดการ / หัวหน้า / บุคลากรในแผนก ${escapeHtml(deptName)} (${realInDeptCount} คน)">`;
    inDeptEmployees.forEach(e => {
      const pos = e.positions?.position_name || e.role || "ผู้จัดการ/เจ้าหน้าที่";
      const code = e.employee_code ? `#${e.employee_code} · ` : "";
      const isSel = selectedId && String(e.id) === String(selectedId);
      html += `<option value="${escapeAttr(e.id)}" ${isSel ? 'selected' : ''}>${escapeHtml(code + (e.full_name || "-") + " — " + pos)}</option>`;
    });
    html += `</optgroup>`;
  }

  // แสดงผู้จัดการจากแผนกอื่นๆ ทั้งหมด
  const otherManagers = allManagers.filter(e => !inDeptEmployees.some(inEmp => String(inEmp.id) === String(e.id)));
  if (otherManagers.length > 0) {
    html += `<optgroup label="ผู้จัดการ / ผู้บริหาร แผนกอื่นๆ">`;
    otherManagers.forEach(e => {
      const pos = e.positions?.position_name || e.role || "ผู้จัดการ";
      const empDept = departments.find(d => String(d.id) === String(e.department_id));
      const deptLabel = empDept ? ` [แผนก ${empDept.department_name}]` : "";
      const code = e.employee_code ? `#${e.employee_code} · ` : "";
      const isSel = selectedId && String(e.id) === String(selectedId);
      html += `<option value="${escapeAttr(e.id)}" ${isSel ? 'selected' : ''}>${escapeHtml(code + (e.full_name || "-") + " — " + pos + deptLabel)}</option>`;
    });
    html += `</optgroup>`;
  }

  // กรณีมีผู้จัดการเดิมที่เคยผูกไว้ แต่หาไม่เจอในตัวเลือกด้านบน
  if (selectedId && !inDeptEmployees.some(e => String(e.id) === String(selectedId)) && !otherManagers.some(e => String(e.id) === String(selectedId))) {
    const e = employees.find(x => String(x.id) === String(selectedId));
    if (e) {
      const pos = e.positions?.position_name || e.role || "ผู้จัดการ";
      const empDept = departments.find(d => String(d.id) === String(e.department_id));
      const deptLabel = empDept ? ` [แผนก ${empDept.department_name}]` : "";
      const code = e.employee_code ? `#${e.employee_code} · ` : "";
      html += `<option value="${escapeAttr(e.id)}" selected>${escapeHtml(code + (e.full_name || "-") + " — " + pos + deptLabel + " (ผู้จัดการเดิม)")}</option>`;
    }
  }

  return html;
}

function renderExecutiveOptions() {
  const el = document.getElementById("executiveSelect");
  if (!el) return;

  // คัดเฉพาะผู้บริหารระดับสูงเท่านั้น (Strict Executive Filtering)
  let candidates = employees.filter(isExecutiveCandidate);
  if (candidates.length === 0) {
    candidates = employees.filter(isManagerCandidate);
  }

  const options = candidates.map(e => {
    const position = e.positions?.position_name || e.role || "ผู้บริหาร";
    const code = e.employee_code ? `#${e.employee_code} · ` : "";
    return `<option value="${escapeAttr(e.id)}">${escapeHtml(code + (e.full_name || "-") + " — " + position)}</option>`;
  }).join("");

  el.innerHTML = `<option value="">-- เลือกผู้บริหาร L3 (${candidates.length} ท่าน) --</option>${options}`;

  if (executiveSetting?.employee_id) {
    if (!candidates.some(e => String(e.id) === String(executiveSetting.employee_id))) {
      const selectedEmp = employees.find(e => String(e.id) === String(executiveSetting.employee_id));
      if (selectedEmp) {
        const position = selectedEmp.positions?.position_name || selectedEmp.role || "ผู้บริหาร";
        const code = selectedEmp.employee_code ? `#${selectedEmp.employee_code} · ` : "";
        el.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(selectedEmp.id)}">${escapeHtml(code + (selectedEmp.full_name || "-") + " — " + position + " (เดิม)")}</option>`);
      }
    }
    el.value = executiveSetting.employee_id;
  }

  updateExecutiveLineStatus();
}

function updateExecutiveLineStatus() {
  const employeeId = document.getElementById("executiveSelect")?.value;
  const el = document.getElementById("executiveLine");
  if (!el) return;

  const emp = employees.find(e => String(e.id) === String(employeeId));

  if (!emp) {
    el.className = "hint";
    el.textContent = "LINE: -";
    return;
  }

  if (isLineConnected(emp)) {
    el.className = "hint line-ok";
    el.textContent = "● LINE User ID พร้อมใช้งาน";
  } else {
    el.className = "hint line-no";
    el.textContent = "● ยังไม่มี LINE User ID";
  }
}

async function saveExecutiveSetting() {
  const employeeId = document.getElementById("executiveSelect")?.value || null;

  if (!employeeId) {
    Swal.fire("ข้อมูลยังไม่ครบ", "กรุณาเลือกผู้บริหาร L3", "warning");
    return;
  }

  const btn = document.getElementById("saveExecutiveBtn");
  btn.disabled = true;
  btn.textContent = "กำลังบันทึก...";

  try {
    const { data, error } = await sb
      .from("system_settings")
      .upsert({
        setting_key: "leave_executive_approver",
        employee_id: employeeId,
        updated_at: new Date().toISOString()
      }, { onConflict: "setting_key" })
      .select()
      .single();

    if (error) throw error;

    // 🔄 ซิงค์ Role ในตาราง employees เพื่อสิทธิ์ผู้บริหาร
    if (employeeId) {
      sb.from("employees").update({ role: "executive" }).eq("id", employeeId).in("role", ["user", "leader", "manager"]).then(()=>{});
    }

    executiveSetting = data;
    updateExecutiveLineStatus();

    Swal.fire({
      icon: "success",
      title: "บันทึกแล้ว",
      text: "กำหนดผู้บริหารอนุมัติหลัก L3 เรียบร้อย",
      timer: 1600,
      showConfirmButton: false
    });
  } catch (err) {
    console.error("saveExecutiveSetting:", err);
    Swal.fire("บันทึกไม่สำเร็จ", err.message || "กรุณาตรวจสอบสิทธิ์ RLS", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "บันทึกผู้บริหาร L3";
  }
}

function renderDepartmentOptions() {
  const el = document.getElementById("departmentSelect");
  el.innerHTML = `<option value="">-- เลือกแผนก --</option>` +
    departments.map(d => `<option value="${escapeAttr(d.id)}">${escapeHtml(d.department_name || "-")}</option>`).join("");
}

function handleDepartmentChange() {
  try {
    const deptSelect = document.getElementById("departmentSelect");
    if (!deptSelect) return;
    
    const departmentId = deptSelect.value;
    const sup = document.getElementById("supervisorSelect");
    const mgr = document.getElementById("managerSelect");
    const save = document.getElementById("saveApproverBtn");

    if (!departmentId) {
      if (sup) {
        sup.disabled = true;
        sup.innerHTML = `<option value="">-- กรุณาเลือกแผนกก่อน --</option>`;
      }
      if (mgr) {
        mgr.disabled = true;
        mgr.innerHTML = `<option value="">-- ไม่มี / ข้ามขั้นตอน L2 --</option>`;
      }
      if (save) save.disabled = true;
      updateLineStatus("supervisor");
      updateLineStatus("manager");
      return;
    }

    const current = approverMap.get(String(departmentId));
    const currentSupId = current?.supervisor_id || "";
    const currentMgrId = current?.manager_id || "";

    if (sup) {
      sup.innerHTML = buildSupervisorOptions(departmentId, currentSupId);
      if (currentSupId) sup.value = currentSupId;
      sup.disabled = false;
      if (sup.tomselect) {
        sup.tomselect.clearOptions();
        sup.tomselect.sync();
        sup.tomselect.setValue(currentSupId || "");
      }
    }
    
    if (mgr) {
      mgr.innerHTML = buildManagerOptions(departmentId, currentMgrId);
      if (currentMgrId) mgr.value = currentMgrId;
      mgr.disabled = false;
      if (mgr.tomselect) {
        mgr.tomselect.clearOptions();
        mgr.tomselect.sync();
        mgr.tomselect.setValue(currentMgrId || "");
      }
    }

    if (save) save.disabled = false;
    updateLineStatus("supervisor");
    updateLineStatus("manager");
  } catch (err) {
    console.error("handleDepartmentChange Error:", err);
  }
}

function updateLineStatus(type) {
  const selectId = type === "supervisor" ? "supervisorSelect" : "managerSelect";
  const statusId = type === "supervisor" ? "supervisorLine" : "managerLine";
  const employeeId = document.getElementById(selectId)?.value;
  const el = document.getElementById(statusId);
  if (!el) return;

  const emp = employees.find(e => String(e.id) === String(employeeId));

  if (!emp) {
    el.className = "line-badge line-no";
    el.textContent = "ยังไม่มี LINE User ID";
    return;
  }

  if (isLineConnected(emp)) {
    el.className = "line-badge line-ok";
    el.textContent = "● LINE User ID พร้อมใช้งาน";
  } else {
    el.className = "line-badge line-no";
    el.textContent = "● ยังไม่มี LINE User ID";
  }
}

async function saveApprover() {
  const departmentId = document.getElementById("departmentSelect").value;
  const supervisorId = document.getElementById("supervisorSelect").value || null;
  const managerId = document.getElementById("managerSelect").value || null;

  if (!departmentId) return;
  if (!supervisorId && !managerId) {
    const confirmClear = await Swal.fire({
      title: "ข้ามทั้ง L1 และ L2?",
      text: "คุณไม่ได้เลือกทั้งหัวหน้า L1 และผู้จัดการ L2 คำขอใบลาของแผนกนี้จะถูกส่งไปที่ HR/ผู้บริหาร โดยตรง ต้องการบันทึกหรือไม่?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "ยืนยันบันทึก",
      cancelButtonText: "ยกเลิก"
    });
    if (!confirmClear.isConfirmed) return;
  }

  const btn = document.getElementById("saveApproverBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined">sync</span> กำลังบันทึก...';

  try {
    const { data, error } = await sb
      .from("department_approvers")
      .upsert({
        department_id: departmentId,
        supervisor_id: supervisorId,
        manager_id: managerId,
        updated_at: new Date().toISOString()
      }, { onConflict: "department_id" })
      .select()
      .single();

    if (error) throw error;

    // 🔄 ซิงค์ Role ในตาราง employees เพื่อความแม่นยำของสิทธิ์ระบบ
    if (supervisorId) {
      sb.from("employees").update({ role: "leader" }).eq("id", supervisorId).eq("role", "user").then(()=>{});
    }
    if (managerId) {
      sb.from("employees").update({ role: "manager" }).eq("id", managerId).in("role", ["user", "leader"]).then(()=>{});
    }

    // 🔄 ซิงค์ departments.approver_id ด้วย
    const defaultApproverId = managerId || supervisorId || null;
    try {
      await sb.from("departments").update({ approver_id: defaultApproverId }).eq("id", departmentId);
    } catch (deptErr) {
      console.warn("Sync departments.approver_id warning:", deptErr);
    }

    // 🔄 ซิงค์ l1_approver_id และ l2_approver_id ให้พนักงานทุกคนในแผนก
    try {
      await sb.from("employees")
        .update({ l1_approver_id: supervisorId || null, l2_approver_id: managerId || null })
        .eq("department_id", departmentId);
      
      if (supervisorId) {
        await sb.from("employees")
          .update({ l1_approver_id: null, l2_approver_id: managerId || null })
          .eq("id", supervisorId);
      }
      if (managerId) {
        await sb.from("employees")
          .update({ l1_approver_id: null, l2_approver_id: null })
          .eq("id", managerId);
      }
    } catch (empSyncErr) {
      console.warn("Sync employees approvers warning:", empSyncErr);
    }

    approverMap.set(String(departmentId), data);
    if (currentLineFilter === "no_approver") {
      currentLineFilter = "all";
      document.querySelectorAll("#approverFilterTabs .filter-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-filter") === "all");
      });
    }
    await loadAllData();
    Swal.fire({ icon:"success", title:"บันทึกแล้ว", text:"ตั้งค่าสายอนุมัติของแผนกเรียบร้อย", timer:1600, showConfirmButton:false });
  } catch (err) {
    console.error("saveApprover:", err);
    Swal.fire("บันทึกไม่สำเร็จ", err.message || "กรุณาลองใหม่", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined">save</span> บันทึกสายอนุมัติแผนก';
  }
}

let currentSearchQuery = "";
let currentLineFilter = "all";

window.setLineStatusFilter = function(filter) {
  currentLineFilter = filter;
  document.querySelectorAll("#approverFilterTabs .filter-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-filter") === filter);
  });
  renderApproverTable();
};

window.filterApproverTable = function() {
  currentSearchQuery = (document.getElementById("deptSearchInput")?.value || "").trim().toLowerCase();
  renderApproverTable();
};

function updateLineSummaryStats() {
  const uniqueApproverIds = new Set();
  departments.forEach(dept => {
    const map = approverMap.get(String(dept.id));
    if (map?.supervisor_id) uniqueApproverIds.add(String(map.supervisor_id));
    if (map?.manager_id) uniqueApproverIds.add(String(map.manager_id));
  });
  if (executiveSetting?.employee_id) {
    uniqueApproverIds.add(String(executiveSetting.employee_id));
  }

  let connectedCount = 0;
  let notConnectedCount = 0;

  uniqueApproverIds.forEach(id => {
    const emp = employees.find(e => String(e.id) === String(id));
    if (emp && isLineConnected(emp)) {
      connectedCount++;
    } else {
      notConnectedCount++;
    }
  });

  const configuredDeptCount = Array.from(approverMap.values()).filter(m => m.supervisor_id || m.manager_id).length;

  const statConnected = document.getElementById("statConnectedCount");
  const statNotConnected = document.getElementById("statNotConnectedCount");
  const statConfiguredDept = document.getElementById("statConfiguredDeptCount");
  const statExecLine = document.getElementById("statExecutiveLineStatus");

  if (statConnected) statConnected.textContent = `${connectedCount} ท่าน`;
  if (statNotConnected) statNotConnected.textContent = `${notConnectedCount} ท่าน`;
  if (statConfiguredDept) statConfiguredDept.textContent = `${configuredDeptCount} / ${departments.length} แผนก`;

  if (statExecLine) {
    if (!executiveSetting?.employee_id) {
      statExecLine.innerHTML = '<span style="color:#94a3b8; font-size:16px;">ยังไม่ระบุ</span>';
    } else {
      const execEmp = employees.find(e => String(e.id) === String(executiveSetting.employee_id));
      if (isLineConnected(execEmp)) {
        statExecLine.innerHTML = '<span style="color:#16a34a; font-size:16px; font-weight:700;">● เชื่อมต่อแล้ว</span>';
      } else {
        statExecLine.innerHTML = '<span style="color:#ea580c; font-size:16px; font-weight:700;">○ ยังไม่ผูก LINE</span>';
      }
    }
  }

  // ตัวนับสถานะของแต่ละตัวกรอง
  let countFull = 0;
  let countMissing = 0;
  let countNoApp = 0;

  departments.forEach(dept => {
    const map = approverMap.get(String(dept.id));
    const sup = employees.find(e => String(e.id) === String(map?.supervisor_id));
    const mgr = employees.find(e => String(e.id) === String(map?.manager_id));

    if (!sup && !mgr) {
      countNoApp++;
    } else {
      const supOk = sup ? isLineConnected(sup) : true;
      const mgrOk = mgr ? isLineConnected(mgr) : true;
      if (supOk && mgrOk && (sup || mgr)) {
        countFull++;
      } else {
        countMissing++;
      }
    }
  });

  const countAllEl = document.getElementById("countAllFilter");
  const countFullEl = document.getElementById("countLineFull");
  const countMissingEl = document.getElementById("countLineMissing");
  const countNoAppEl = document.getElementById("countNoApprover");

  if (countAllEl) countAllEl.textContent = departments.length;
  if (countFullEl) countFullEl.textContent = countFull;
  if (countMissingEl) countMissingEl.textContent = countMissing;
  if (countNoAppEl) countNoAppEl.textContent = countNoApp;
}

function renderApproverTable() {
  updateLineSummaryStats();

  const body = document.getElementById("approverTableBody");
  const countBadge = document.getElementById("tableCountBadge");
  if (!body) return;

  const validDepts = departments.filter(dept => {
    const map = approverMap.get(String(dept.id));
    const sup = employees.find(e => String(e.id) === String(map?.supervisor_id));
    const mgr = employees.find(e => String(e.id) === String(map?.manager_id));

    // ตรวจสอบตัวกรองสถานะ LINE
    if (currentLineFilter === "line_all_connected") {
      if (!sup && !mgr) return false;
      const supOk = sup ? isLineConnected(sup) : true;
      const mgrOk = mgr ? isLineConnected(mgr) : true;
      if (!(supOk && mgrOk)) return false;
    } else if (currentLineFilter === "line_missing") {
      if (!sup && !mgr) return false;
      const hasUnlinked = (sup && !isLineConnected(sup)) || (mgr && !isLineConnected(mgr));
      if (!hasUnlinked) return false;
    } else if (currentLineFilter === "no_approver") {
      if (sup || mgr) return false;
    }

    // ตรวจสอบค้นหาข้อความ
    if (!currentSearchQuery) return true;
    const searchTarget = `${dept.department_name || ''} ${sup?.full_name || ''} ${mgr?.full_name || ''}`.toLowerCase();
    return searchTarget.includes(currentSearchQuery);
  });

  if (countBadge) {
    countBadge.textContent = `${validDepts.length} แผนก`;
  }

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

  const rows = validDepts.map(dept => {
    const map = approverMap.get(String(dept.id));
    const sup = employees.find(e => String(e.id) === String(map?.supervisor_id));
    const mgr = employees.find(e => String(e.id) === String(map?.manager_id));

    const supNameHtml = sup ? highlightMatch(sup.full_name, currentSearchQuery) : '';
    const mgrNameHtml = mgr ? highlightMatch(mgr.full_name, currentSearchQuery) : '';
    const deptNameHtml = highlightMatch(dept.department_name || "-", currentSearchQuery);

    const l1Display = sup 
      ? `<div class="approver-name">🎖️ ${supNameHtml}</div><div class="approver-pos">${escapeHtml(sup.positions?.position_name || 'หัวหน้างาน')}</div>` 
      : '<span style="color:#64748b; font-style:italic; font-size:13px;">⚡ ข้ามขั้นตอน L1 (ส่งไป L2 / HR)</span>';
    
    const l1Line = sup 
      ? (isLineConnected(sup)
          ? `<span class="table-line-tag active" title="LINE ID: ${escapeAttr(sup.line_id)}">● LINE เชื่อมแล้ว</span>` 
          : `<span class="table-line-tag inactive" style="cursor:pointer;" onclick="createLineLinkCode('${escapeAttr(sup.id)}')" title="คลิกเพื่อสร้างรหัสผูก LINE">○ ยังไม่ผูก LINE <span class="material-symbols-outlined" style="font-size:12px;">link</span></span>`) 
      : '';
    
    const l2Display = mgr 
      ? `<div class="approver-name">👔 ${mgrNameHtml}</div><div class="approver-pos">${escapeHtml(mgr.positions?.position_name || 'ผู้จัดการฝ่าย')}</div>` 
      : '<span style="color:#64748b; font-style:italic; font-size:13px;">⚡ ข้ามขั้นตอน L2 (มีเฉพาะ L1)</span>';
    
    const l2Line = mgr 
      ? (isLineConnected(mgr)
          ? `<span class="table-line-tag active" title="LINE ID: ${escapeAttr(mgr.line_id)}">● LINE เชื่อมแล้ว</span>` 
          : `<span class="table-line-tag inactive" style="cursor:pointer;" onclick="createLineLinkCode('${escapeAttr(mgr.id)}')" title="คลิกเพื่อสร้างรหัสผูก LINE">○ ยังไม่ผูก LINE <span class="material-symbols-outlined" style="font-size:12px;">link</span></span>`) 
      : '';

    return `<tr>
      <td>
        <div class="dept-title">
          <span class="dept-badge"><span class="material-symbols-outlined" style="font-size:16px;">domain</span></span>
          <span>${deptNameHtml}</span>
        </div>
      </td>
      <td>
        <div class="approver-cell">
          ${l1Display}
          ${l1Line}
        </div>
      </td>
      <td>
        <div class="approver-cell">
          ${l2Display}
          ${l2Line}
        </div>
      </td>
      <td style="text-align: center;">
        <div class="btn-action-group" style="justify-content: center;">
          <button type="button" class="btn-table-edit" onclick="editApprover('${escapeAttr(dept.id)}')">
            <span class="material-symbols-outlined" style="font-size:15px;">edit</span> ตั้งค่า
          </button>
          ${map ? `
            <button type="button" class="btn-table-delete" onclick="deleteApprover('${escapeAttr(dept.id)}')">
              <span class="material-symbols-outlined" style="font-size:15px;">delete</span> ล้าง
            </button>
          ` : ''}
        </div>
      </td>
    </tr>`;
  });

  body.innerHTML = rows.length ? rows.join("") :
    `<tr><td colspan="4" class="empty-state">
      <span class="material-symbols-outlined" style="font-size: 48px; color: #cbd5e1; margin-bottom: 8px;">search_off</span>
      <p style="margin:0; font-weight:600; font-size: 14.5px; color: #64748b;">ไม่พบข้อมูลสายอนุมัติที่ตรงกับการค้นหาหรือตัวกรอง</p>
    </td></tr>`;
}

window.editApprover = function(departmentId) {
  console.log("editApprover clicked for:", departmentId);
  try {
    const dept = departments.find(d => String(d.id) === String(departmentId));
    if (!dept) {
      console.warn("Department not found", departmentId);
      return;
    }

    // ตั้งค่าใน Form บนหน้าจอหลักด้วย
    const deptSelect = document.getElementById("departmentSelect");
    if (deptSelect) {
      deptSelect.value = departmentId;
      if (typeof handleDepartmentChange === "function") {
        handleDepartmentChange();
      }
    }

    // เปิด Modal เพื่อให้แก้ไขได้ทันทีโดยตรง
    openApproverModal(departmentId);
  } catch (err) {
    console.error("editApprover Error:", err);
    if (typeof Swal !== "undefined") {
      Swal.fire("ข้อผิดพลาด", "ไม่สามารถเปิดหน้าต่างตั้งค่าได้", "error");
    }
  }
};

window.openApproverModal = function(departmentId) {
  // Logic from function openApproverModal moved directly here
  try {
    const dept = departments.find(d => String(d.id) === String(departmentId));
    if (!dept) return;

    const modal = document.getElementById("approverModalBackdrop");
    const modalDeptId = document.getElementById("modalDeptId");
    const modalDeptTitle = document.getElementById("modalDeptTitle");
    const supSelect = document.getElementById("modalSupervisorSelect");
    const mgrSelect = document.getElementById("modalManagerSelect");

    if (!modal || !supSelect || !mgrSelect || !modalDeptId || !modalDeptTitle) {
      console.warn("Modal elements missing", { modal, supSelect, mgrSelect, modalDeptId, modalDeptTitle });
      return;
    }

    modalDeptId.value = departmentId;
    modalDeptTitle.textContent = `ตั้งค่าสายอนุมัติ: ${dept.department_name || "แผนก"}`;

    const current = approverMap.get(String(departmentId));
    const currentSupId = current?.supervisor_id || "";
    const currentMgrId = current?.manager_id || "";

    // ใช้ตัวสร้าง Option คัดกรองตรงตามแผนก
    supSelect.innerHTML = buildSupervisorOptions(departmentId, currentSupId);
    mgrSelect.innerHTML = buildManagerOptions(departmentId, currentMgrId);

    if (currentSupId) supSelect.value = currentSupId;
    if (currentMgrId) mgrSelect.value = currentMgrId;

    if (supSelect.tomselect) {
      supSelect.tomselect.clearOptions();
      supSelect.tomselect.sync();
      supSelect.tomselect.setValue(currentSupId || "");
    }
    if (mgrSelect.tomselect) {
      mgrSelect.tomselect.clearOptions();
      mgrSelect.tomselect.sync();
      mgrSelect.tomselect.setValue(currentMgrId || "");
    }

    if (typeof updateModalLineStatus === "function") {
      updateModalLineStatus("supervisor");
      updateModalLineStatus("manager");
    }

    modal.classList.add("show");
    
    // Re-init Tom Select for modal selects
    setTimeout(() => {
      initTomSelect();
    }, 100);
  } catch (err) {
    console.error("openApproverModal Error:", err);
  }
}

window.closeApproverModal = function(e) {
  if (e && e.target && e.target.id !== "approverModalBackdrop") return;
  const modal = document.getElementById("approverModalBackdrop");
  if (modal) modal.classList.remove("show");
};

window.updateModalLineStatus = function(type) {
  const selectId = type === "supervisor" ? "modalSupervisorSelect" : "modalManagerSelect";
  const statusId = type === "supervisor" ? "modalSupervisorLine" : "modalManagerLine";
  const employeeId = document.getElementById(selectId)?.value;
  const el = document.getElementById(statusId);
  if (!el) return;

  const emp = employees.find(e => String(e.id) === String(employeeId));
  if (!emp) {
    el.className = "line-badge line-no";
    el.textContent = "ยังไม่มี LINE User ID";
    return;
  }

  if (isLineConnected(emp)) {
    el.className = "line-badge line-ok";
    el.textContent = "● LINE User ID พร้อมใช้งาน";
  } else {
    el.className = "line-badge line-no";
    el.textContent = "● ยังไม่มี LINE User ID";
  }
};

window.saveApproverFromModal = async function() {
  const departmentId = document.getElementById("modalDeptId")?.value;
  const supervisorId = document.getElementById("modalSupervisorSelect")?.value || null;
  const managerId = document.getElementById("modalManagerSelect")?.value || null;

  if (!departmentId) {
    Swal.fire("ข้อผิดพลาด", "ไม่พบข้อมูลแผนก", "error");
    return;
  }

  if (!supervisorId && !managerId) {
    const confirmClear = await Swal.fire({
      title: "ข้ามทั้ง L1 และ L2?",
      text: "คุณไม่ได้เลือกทั้งหัวหน้า L1 และผู้จัดการ L2 คำขอใบลาของแผนกนี้จะถูกส่งไปที่ HR/ผู้บริหาร โดยตรง ต้องการบันทึกหรือไม่?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "ยืนยันบันทึก",
      cancelButtonText: "ยกเลิก"
    });
    if (!confirmClear.isConfirmed) return;
  }

  const btn = document.getElementById("modalSaveBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined spinning-icon" style="font-size:18px;">sync</span> กำลังบันทึก...';

  try {
    const { data, error } = await sb
      .from("department_approvers")
      .upsert({
        department_id: departmentId,
        supervisor_id: supervisorId,
        manager_id: managerId,
        updated_at: new Date().toISOString()
      }, { onConflict: "department_id" })
      .select()
      .single();

    if (error) throw error;

    // ซิงค์ Role ใน employees เพื่อความถูกต้อง
    if (supervisorId) {
      sb.from("employees").update({ role: "leader" }).eq("id", supervisorId).eq("role", "user").then(()=>{});
    }
    if (managerId) {
      sb.from("employees").update({ role: "manager" }).eq("id", managerId).in("role", ["user", "leader"]).then(()=>{});
    }

    // 🔄 ซิงค์ departments.approver_id ด้วย
    const defaultApproverId = managerId || supervisorId || null;
    try {
      await sb.from("departments").update({ approver_id: defaultApproverId }).eq("id", departmentId);
    } catch (deptErr) {
      console.warn("Sync departments.approver_id warning:", deptErr);
    }

    // 🔄 ซิงค์ l1_approver_id และ l2_approver_id ให้พนักงานทุกคนในแผนก
    try {
      await sb.from("employees")
        .update({ l1_approver_id: supervisorId || null, l2_approver_id: managerId || null })
        .eq("department_id", departmentId);
      
      if (supervisorId) {
        await sb.from("employees")
          .update({ l1_approver_id: null, l2_approver_id: managerId || null })
          .eq("id", supervisorId);
      }
      if (managerId) {
        await sb.from("employees")
          .update({ l1_approver_id: null, l2_approver_id: null })
          .eq("id", managerId);
      }
    } catch (empSyncErr) {
      console.warn("Sync employees approvers warning:", empSyncErr);
    }

    approverMap.set(String(departmentId), data);
    if (currentLineFilter === "no_approver") {
      currentLineFilter = "all";
      document.querySelectorAll("#approverFilterTabs .filter-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-filter") === "all");
      });
    }
    await loadAllData();

    // ซิงค์ฟอร์มหลักถ้ากำลังเปิดแผนกเดียวกัน
    const mainDeptSelect = document.getElementById("departmentSelect");
    if (String(mainDeptSelect?.value) === String(departmentId)) {
      handleDepartmentChange();
    }

    const modal = document.getElementById("approverModalBackdrop");
    if (modal) modal.classList.remove("show");

    Swal.fire({
      icon: "success",
      title: "บันทึกเรียบร้อย",
      text: "บันทึกสายอนุมัติของแผนกสำเร็จ",
      timer: 1500,
      showConfirmButton: false
    });
  } catch (err) {
    console.error("saveApproverFromModal:", err);
    Swal.fire("บันทึกไม่สำเร็จ", err.message || "กรุณาลองใหม่อีกครั้ง", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">save</span> บันทึกการตั้งค่า';
  }
};

window.deleteApprover = async function(departmentId) {
  const dept = departments.find(d => String(d.id) === String(departmentId));
  const deptName = dept?.department_name || "แผนกนี้";
  const map = approverMap.get(String(departmentId));
  const supId = map?.supervisor_id;
  const mgrId = map?.manager_id;
  const sup = employees.find(e => String(e.id) === String(supId));
  const mgr = employees.find(e => String(e.id) === String(mgrId));

  let approverDetailsHtml = "";
  if (sup || mgr) {
    approverDetailsHtml = `
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin: 12px 0; text-align: left; font-size: 13.5px; line-height: 1.6;">
        <div style="font-weight: 700; color: #b91c1c; margin-bottom: 4px;">
          ⚠️ รายการที่จะถูกล้างสายอนุมัติและปลดการผูก LINE ID:
        </div>
        ${sup ? `<div>• หัวหน้างาน L1: <b>${escapeHtml(sup.full_name)}</b> ${sup.line_id ? '<span style="color:#059669; font-weight:600;">(มี LINE ID ผูกอยู่ ➔ จะถูกล้างออก)</span>' : '<span style="color:#94a3b8;">(ยังไม่ได้ผูก LINE)</span>'}</div>` : ''}
        ${mgr ? `<div>• ผู้จัดการฝ่าย L2: <b>${escapeHtml(mgr.full_name)}</b> ${mgr.line_id ? '<span style="color:#059669; font-weight:600;">(มี LINE ID ผูกอยู่ ➔ จะถูกล้างออก)</span>' : '<span style="color:#94a3b8;">(ยังไม่ได้ผูก LINE)</span>'}</div>` : ''}
        <div style="margin-top: 6px; font-size: 12px; color: #7f1d1d; border-top: 1px dashed #fca5a5; padding-top: 4px;">
          📌 ระบบจะลบการตั้งค่าสายอนุมัติของแผนก และ<b>ล้างค่า LINE User ID ของหัวหน้างาน/ผู้จัดการฝ่าย</b>ออกจากระบบทันที
        </div>
      </div>
    `;
  }

  const result = await Swal.fire({
    title: "ล้างสายอนุมัติและ LINE ID?",
    html: `
      <div>ต้องการล้างสายอนุมัติของแผนก <b>${escapeHtml(deptName)}</b> ใช่หรือไม่?</div>
      ${approverDetailsHtml}
    `,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#64748b",
    confirmButtonText: "🗑️ ยืนยันล้างข้อมูลและ LINE ID",
    cancelButtonText: "ยกเลิก"
  });

  if (!result.isConfirmed) return;

  const empIdsToClear = [supId, mgrId].filter(Boolean);

  try {
    // 1. เรียกผ่าน Server API (/api/clear-approver-line) เพื่อหลีกเลี่ยง RLS limitation
    let apiSuccess = false;
    try {
      const apiRes = await fetch("/api/clear-approver-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department_id: departmentId,
          employee_ids: empIdsToClear
        })
      });
      if (apiRes.ok) {
        apiSuccess = true;
      }
    } catch (apiErr) {
      console.warn("API /api/clear-approver-line warning:", apiErr);
    }

    // 2. ลบผ่าน Supabase Client Direct Fallback
    if (!apiSuccess && sb) {
      const { error: delErr } = await sb
        .from("department_approvers")
        .delete()
        .eq("department_id", departmentId);

      if (delErr) throw delErr;

      // เคลียร์ approver_id ใน departments และ employees
      try {
        await sb.from("departments").update({ approver_id: null }).eq("id", departmentId);
        await sb.from("employees").update({ l1_approver_id: null, l2_approver_id: null }).eq("department_id", departmentId);
      } catch (clearErr) {
        console.warn("Clear dept/emp approvers warning:", clearErr);
      }

      for (const empId of empIdsToClear) {
        await sb
          .from("employees")
          .update({ line_id: null })
          .eq("id", empId);

        try {
          await sb.from("line_link_tokens").delete().eq("employee_id", empId);
        } catch (tokErr) {}
      }
    }

    // 3. ปรับปรุง Local in-memory state
    approverMap.delete(String(departmentId));
    empIdsToClear.forEach(empId => {
      const emp = employees.find(e => String(e.id) === String(empId));
      if (emp) {
        emp.line_id = null;
      }
    });

    // 4. Render UI ใหม่
    await loadAllData();

    const deptSelect = document.getElementById("departmentSelect");
    if (String(deptSelect?.value) === String(departmentId)) {
      deptSelect.value = "";
      if (typeof handleDepartmentChange === "function") {
        handleDepartmentChange();
      }
    }

    Swal.fire({
      icon: "success",
      title: "ล้างข้อมูลสำเร็จ",
      html: `ล้างสายอนุมัติและ LINE ID ของ <b>${escapeHtml(deptName)}</b> เรียบร้อยแล้ว`,
      timer: 1800,
      showConfirmButton: false
    });
  } catch (err) {
    console.error("deleteApprover error:", err);
    Swal.fire("ล้างข้อมูลไม่สำเร็จ", err.message || "เกิดข้อผิดพลาดในการล้างข้อมูล", "error");
  }
};


// ============================================================
// 🔗 LINE OA - สร้างรหัสเชื่อมบัญชี 6 หลัก
// ============================================================

window.createLineLinkCode = async function(employeeId) {
  try {
    const emp = employees.find(
      e => String(e.id) === String(employeeId)
    );

    if (!emp) {
      Swal.fire(
        "ไม่พบข้อมูล",
        "ไม่พบพนักงานที่ต้องการเชื่อม LINE",
        "warning"
      );
      return;
    }

    // ถ้ามี LINE ID อยู่แล้ว ให้ถามก่อนสร้างรหัสใหม่
    if (emp.line_id) {
      const confirm = await Swal.fire({
        icon: "question",
        title: "มี LINE เชื่อมอยู่แล้ว",
        html: `
          <b>${escapeHtml(emp.full_name || "-")}</b><br>
          มี LINE User ID อยู่ในระบบแล้ว<br><br>
          ต้องการสร้างรหัสเพื่อเชื่อม LINE ใหม่หรือไม่?
        `,
        showCancelButton: true,
        confirmButtonText: "สร้างรหัสใหม่",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#0f766e"
      });

      if (!confirm.isConfirmed) return;
    }

    let linkCode = "";
    let created = false;

    // 1. เรียกผ่าทาง Server API (/api/create-line-link) เพื่อหลีกเลี่ยง RLS Block
    try {
      const apiRes = await fetch("/api/create-line-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId })
      });
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        if (apiData.success && apiData.token) {
          linkCode = apiData.token;
          created = true;
        }
      }
    } catch (apiErr) {
      console.warn("API /api/create-line-link error:", apiErr);
    }

    // 2. Fallback สุ่มรหัส 6 หลักหาก API ตอบกลับช้า
    if (!linkCode) {
      linkCode = String(Math.floor(100000 + Math.random() * 900000));
    }

    // ลองบันทึกลง DB เผื่อ DB RLS อนุญาต
    if (!created && sb) {
      try {
        await sb.from("line_link_tokens").delete().eq("employee_id", employeeId);
        await sb.from("line_link_tokens").insert({
          employee_id: employeeId,
          token: linkCode,
          link_code: linkCode,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
        });
      } catch (dbErr) {
        // ละเว้น RLS error เพื่อไม่ให้การแสดงรหัสขัดข้อง
      }
    }

    // --------------------------------------------------------
    // แสดงรหัสให้ Admin พร้อมตัวเลือกระบุ LINE User ID โดยตรง
    // --------------------------------------------------------
    const resModal = await Swal.fire({
      icon: "success",
      title: "รหัสเชื่อม LINE",
      html: `
        <div style="font-size:14px;color:#64748b;">
          สำหรับพนักงาน
        </div>

        <div style="
          font-size:17px;
          font-weight:700;
          margin:5px 0 15px;
          color:#0f172a;
        ">
          ${escapeHtml(emp.full_name || "-")}
        </div>

        <div style="
          font-size:34px;
          font-weight:800;
          letter-spacing:8px;
          color:#0f766e;
          background:#f0fdfa;
          border:1px dashed #5eead4;
          border-radius:12px;
          padding:15px;
          margin:10px 0;
        ">
          ${linkCode}
        </div>

        <div style="
          margin-top:12px;
          font-size:13px;
          color:#64748b;
          line-height:1.7;
        ">
          ให้เจ้าของบัญชี Add LINE OA
          <b>ระบบใบลาออนไลน์</b><br>
          แล้วส่งรหัส <b>${linkCode}</b>
          ในแชต<br><br>

          ⏱ รหัสมีอายุ <b>15 นาที</b>
        </div>
      `,
      showDenyButton: true,
      denyButtonText: "✏️ กรอก LINE ID โดยตรง",
      denyButtonColor: "#475569",
      confirmButtonText: "เสร็จสิ้น",
      confirmButtonColor: "#0f766e"
    });

    if (resModal.isDenied) {
      const { value: inputLineId } = await Swal.fire({
        title: "ระบุ LINE User ID",
        input: "text",
        inputLabel: `สำหรับ ${emp.full_name}`,
        inputValue: emp.line_id || "",
        inputPlaceholder: "เช่น U1234567890abcdef...",
        showCancelButton: true,
        confirmButtonText: "บันทึก",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#0f766e"
      });

      if (inputLineId !== undefined) {
        const cleanId = inputLineId.trim();
        const { error: updErr } = await sb
          .from("employees")
          .update({ line_id: cleanId || null })
          .eq("id", employeeId);

        if (updErr) {
          Swal.fire("เกิดข้อผิดพลาด", updErr.message, "error");
        } else {
          emp.line_id = cleanId || null;
          Swal.fire({
            icon: "success",
            title: "บันทึก LINE ID สำเร็จ",
            text: `อัปเดต LINE ID ของ ${emp.full_name} เรียบร้อยแล้ว`,
            timer: 2000,
            showConfirmButton: false
          });
          if (typeof loadAllData === "function") loadAllData();
        }
      }
    }

  } catch (err) {

    console.error(
      "createLineLinkCode:",
      err
    );

    Swal.fire(
      "สร้างรหัสไม่สำเร็จ",
      err.message || "กรุณาลองใหม่",
      "error"
    );
  }
};







function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(value) { return escapeHtml(value); }

// ============================================================
// 🤖 3. ตั้งค่าการเชื่อมต่อ LINE Official Account (Bot & Webhook)
// ============================================================

window.toggleTokenVisibility = function(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    if (icon) icon.textContent = "visibility_off";
  } else {
    input.type = "password";
    if (icon) icon.textContent = "visibility";
  }
};

const DEFAULT_SUPABASE_WEBHOOK_URL = "https://pgogmhqjdchakcytsomx.supabase.co/functions/v1/line-webhook";

window.copyLineWebhookUrl = async function() {
  const input = document.getElementById("lineWebhookUrlInput");
  const webhookUrl = input?.value || DEFAULT_SUPABASE_WEBHOOK_URL;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(webhookUrl);
    } else {
      input.select();
      document.execCommand("copy");
    }

    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "คัดลอก Webhook URL เรียบร้อย",
      showConfirmButton: false,
      timer: 2000
    });
  } catch (err) {
    Swal.fire("คัดลอกไม่สำเร็จ", "กรุณาคัดลอกด้วยตนเอง: " + webhookUrl, "info");
  }
};

window.openLineQrModal = function() {
  const basicIdInput = document.getElementById("lineBasicIdInput");
  let basicId = (basicIdInput?.value || "").trim();

  if (!basicId) {
    Swal.fire({
      title: "ระบุ LINE Basic ID",
      input: "text",
      inputLabel: "Basic ID / Bot ID ของ LINE Official Account",
      inputPlaceholder: "เช่น @123abcde หรือ @pvtleave",
      showCancelButton: true,
      confirmButtonText: "สร้าง QR Code",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#16a34a"
    }).then(res => {
      if (res.isConfirmed && res.value) {
        if (basicIdInput) basicIdInput.value = res.value.trim();
        showQrModal(res.value.trim());
      }
    });
    return;
  }

  showQrModal(basicId);
};

function showQrModal(basicId) {
  const cleanId = basicId.startsWith("@") ? basicId : `@${basicId}`;
  const addFriendUrl = `https://line.me/R/ti/p/${encodeURIComponent(cleanId)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(addFriendUrl)}`;

  Swal.fire({
    title: "📱 เพิ่มเพื่อน LINE Official Account",
    html: `
      <div style="text-align:center; padding:10px 0;">
        <div style="font-weight:700; color:#15803d; font-size:16px; margin-bottom:8px;">${escapeHtml(cleanId)}</div>
        <div style="display:inline-block; padding:10px; background:#fff; border-radius:12px; border:2px solid #bbf7d0; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          <img src="${qrUrl}" alt="LINE OA QR Code" style="width:200px; height:200px; display:block;" />
        </div>
        <div style="margin-top:14px; font-size:13px; color:#475569;">
          ให้พนักงานสแกน QR Code นี้เพื่อเพิ่มเพื่อน LINE Bot ก่อนทำการผูกบัญชี
        </div>
        <div style="margin-top:10px;">
          <a href="${addFriendUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:6px; background:#06c755; color:#fff; padding:8px 16px; border-radius:8px; text-decoration:none; font-weight:600; font-size:13px;">
            <span class="material-symbols-outlined" style="font-size:18px;">open_in_new</span> เปิดลิงก์เพิ่มเพื่อน LINE
          </a>
        </div>
      </div>
    `,
    confirmButtonColor: "#16a34a",
    confirmButtonText: "ปิดหน้าต่าง"
  });
}

async function loadLineOaConfig() {
  try {
    const webhookInput = document.getElementById("lineWebhookUrlInput");
    if (webhookInput) {
      webhookInput.value = DEFAULT_SUPABASE_WEBHOOK_URL;
    }

    const { data, error } = await sb
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "line_oa_config")
      .maybeSingle();

    if (error && error.code !== "PGRST116") throw error;

    const config = data?.setting_value || {};
    const tokenInput = document.getElementById("lineChannelAccessTokenInput");
    const basicIdInput = document.getElementById("lineBasicIdInput");
    const liveStatus = document.getElementById("lineOaLiveStatus");

    if (tokenInput && config.channel_access_token) {
      tokenInput.value = config.channel_access_token;
    }
    if (basicIdInput && config.basic_id) {
      basicIdInput.value = config.basic_id;
    }
    if (webhookInput && config.webhook_url) {
      webhookInput.value = config.webhook_url;
    }

    if (liveStatus) {
      if (config.channel_access_token) {
        liveStatus.className = "line-badge line-ok";
        liveStatus.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> เชื่อมต่อแล้ว (มี Token)';
      } else {
        liveStatus.className = "line-badge line-no";
        liveStatus.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">cancel</span> ยังไม่ได้ตั้งค่า Token';
      }
    }
  } catch (err) {
    console.warn("loadLineOaConfig warning:", err);
  }
}

window.saveLineOaConfig = async function() {
  const tokenInput = document.getElementById("lineChannelAccessTokenInput");
  const basicIdInput = document.getElementById("lineBasicIdInput");
  const webhookInput = document.getElementById("lineWebhookUrlInput");
  const btn = document.getElementById("btnSaveLineOaConfig");

  const token = tokenInput?.value?.trim() || "";
  const basicId = basicIdInput?.value?.trim() || "";
  const webhookUrl = webhookInput?.value || DEFAULT_SUPABASE_WEBHOOK_URL;

  if (!token) {
    Swal.fire("กรุณาระบุ Token", "จำเป็นต้องระบุ LINE Channel Access Token เพื่อส่งการแจ้งเตือน", "warning");
    return;
  }

  const originalHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined spinning-icon" style="font-size:18px;">sync</span> กำลังบันทึก...';
  }

  try {
    const settingValue = {
      channel_access_token: token,
      basic_id: basicId,
      webhook_url: webhookUrl,
      updated_at: new Date().toISOString()
    };

    const { error } = await sb
      .from("system_settings")
      .upsert({
        setting_key: "line_oa_config",
        setting_value: settingValue,
        updated_at: new Date().toISOString()
      }, { onConflict: "setting_key" });

    if (error) throw error;

    // Update status badge
    const liveStatus = document.getElementById("lineOaLiveStatus");
    if (liveStatus) {
      liveStatus.className = "line-badge line-ok";
      liveStatus.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> บันทึกแล้ว (มี Token)';
    }

    Swal.fire({
      icon: "success",
      title: "บันทึกการตั้งค่า LINE OA สำเร็จ",
      text: "บันทึก Channel Access Token และการตั้งค่าเข้าสู่ระบบเรียบร้อยแล้ว",
      timer: 2000,
      showConfirmButton: false
    });

  } catch (err) {
    console.error("saveLineOaConfig error:", err);
    Swal.fire("บันทึกไม่สำเร็จ", err.message || "เกิดข้อผิดพลาดในการบันทึก", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml || '<span class="material-symbols-outlined" style="font-size: 18px;">save</span> บันทึกการเชื่อมต่อ LINE OA';
    }
  }
};

window.testLineOaConnection = async function() {
  const tokenInput = document.getElementById("lineChannelAccessTokenInput");
  const token = tokenInput?.value?.trim() || "";

  Swal.fire({
    title: "กำลังตรวจสอบการเชื่อมต่อ LINE...",
    text: "ระบบกำลังส่งคำขอตรวจสอบความถูกต้องของ Token ไปยัง LINE API...",
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    const res = await fetch("/api/test-line-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_access_token: token })
    });

    const resText = await res.text();
    let data = {};
    try {
      data = resText ? JSON.parse(resText) : {};
    } catch (parseErr) {
      throw new Error(resText || `HTTP ${res.status}: ไม่สามารถอ่านผลการตอบกลับจากระบบได้`);
    }

    if (!res.ok || !data.success) {
      throw new Error(data.error || `HTTP ${res.status}: ไม่สามารถเชื่อมต่อกับ LINE API ได้`);
    }

    const bot = data.bot || {};
    const botName = bot.displayName || "LINE Official Account";
    const basicId = bot.basicId ? `@${bot.basicId}` : "";
    const picUrl = bot.pictureUrl || "/assets/icons/check-circle.svg";

    // Update preview box in UI
    const previewBox = document.getElementById("lineBotInfoPreview");
    const nameEl = document.getElementById("lineBotDisplayName");
    const idEl = document.getElementById("lineBotBasicIdText");
    const picEl = document.getElementById("lineBotPicture");

    if (previewBox) previewBox.style.display = "flex";
    if (nameEl) nameEl.textContent = botName;
    if (idEl) idEl.textContent = `Basic ID: ${basicId || "-"}`;
    if (picEl && bot.pictureUrl) picEl.src = picUrl;

    const liveStatus = document.getElementById("lineOaLiveStatus");
    if (liveStatus) {
      liveStatus.className = "line-badge line-ok";
      liveStatus.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">verified</span> เชื่อมต่อ API สำเร็จ';
    }

    Swal.fire({
      icon: "success",
      title: "เชื่อมต่อ LINE API สำเร็จ!",
      html: `
        <div style="text-align:center; padding:10px 0;">
          <img src="${picUrl}" style="width:64px; height:64px; border-radius:50%; margin-bottom:10px; border:2px solid #16a34a;" />
          <div style="font-weight:700; font-size:16px; color:#1e293b;">${escapeHtml(botName)}</div>
          <div style="font-size:13px; color:#64748b; margin-top:2px;">${escapeHtml(basicId)}</div>
          <div style="margin-top:12px; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px; font-size:13px; color:#166534;">
            ✅ Token ถูกต้อง และบอทพร้อมส่ง Flex Message ข้อความแจ้งเตือนใบลาทุกขั้นตอน
          </div>
        </div>
      `,
      confirmButtonColor: "#16a34a",
      confirmButtonText: "ยอดเยี่ยม"
    });

  } catch (err) {
    console.error("testLineOaConnection error:", err);
    Swal.fire({
      icon: "error",
      title: "ตรวจสอบการเชื่อมต่อไม่สำเร็จ",
      html: `
        <div style="text-align:left; font-size:13.5px; color:#334155; line-height:1.6;">
          <p style="margin:0 0 8px; font-weight:600; color:#dc2626;">สาเหตุที่เป็นไปได้:</p>
          <ul style="margin:0; padding-left:20px; color:#475569;">
            <li>Channel access token ไม่ถูกต้องหรือหมดอายุ</li>
            <li>ยังไม่ได้ออก Channel access token (long-lived / v2.1) ใน LINE Developers Console</li>
            <li>คัดลอก Token มาไม่ครบถ้วน</li>
          </ul>
          <div style="margin-top:10px; font-size:12px; color:#b91c1c; background:#fef2f2; padding:8px; border-radius:6px;">
            รายละเอียด: ${escapeHtml(err.message)}
          </div>
        </div>
      `,
      confirmButtonColor: "#dc2626"
    });
  }
};

// ============================================================
// 🎛️ 4. ตั้งค่าการเปิด/ปิดแจ้งเตือน LINE รายขั้นตอน (Notification Steps)
// ============================================================

let lineNotifSaveTimer = null;

window.handleSwitchVisualChange = function(checkboxId, autoSave = true) {
  const checkbox = document.getElementById(checkboxId);
  const row = document.getElementById(`row-${checkboxId}`);
  const tag = document.getElementById(`tag-${checkboxId}`);
  if (!checkbox) return;

  const isChecked = checkbox.checked;
  if (row) {
    if (isChecked) {
      row.classList.add("is-active");
      row.classList.remove("is-inactive");
    } else {
      row.classList.remove("is-active");
      row.classList.add("is-inactive");
    }
  }

  if (tag) {
    if (isChecked) {
      tag.textContent = "เปิด";
      tag.className = "switch-status-tag on";
    } else {
      tag.textContent = "ปิด";
      tag.className = "switch-status-tag off";
    }
  }

  if (autoSave) {
    const indicator = document.getElementById("lineNotifAutoSaveIndicator");
    if (indicator) {
      indicator.style.display = "inline-flex";
      indicator.style.color = "#0284c7";
      indicator.style.background = "#f0f9ff";
      indicator.innerHTML = '<span class="material-symbols-outlined spinning-icon" style="font-size:14px;">sync</span> กำลังบันทึกอัตโนมัติ...';
    }
    clearTimeout(lineNotifSaveTimer);
    lineNotifSaveTimer = setTimeout(async () => {
      await saveLineNotificationSettings(true);
    }, 600);
  }
};

window.toggleAllLineNotifs = function(enable) {
  const ids = [
    "notif-new-request",
    "notif-new-request-l2",
    "notif-leader-approved",
    "notif-manager-approved",
    "notif-final-approved",
    "notif-rejected",
    "notif-cancellation",
    "notif-hr-review",
    "notif-hr-notify"
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.checked = Boolean(enable);
      handleSwitchVisualChange(id, false);
    }
  });

  saveLineNotificationSettings(false);
};

async function loadLineNotificationSettings() {
  try {
    const { data, error } = await sb
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "line_notification_settings")
      .maybeSingle();

    if (error) throw error;

    // Default values if no settings found
    const settings = data?.setting_value || {
      new_request: true,
      new_request_l2: true,
      leader_approved: true,
      manager_approved: true,
      final_approved: true,
      rejected: true,
      cancellation: true,
      hr_review: true,
      hr_notify: true
    };

    // Set DOM checkbox states & visual classes
    const mapList = [
      { id: "notif-new-request", val: settings.new_request !== false },
      { id: "notif-new-request-l2", val: settings.new_request_l2 !== false },
      { id: "notif-leader-approved", val: settings.leader_approved !== false },
      { id: "notif-manager-approved", val: settings.manager_approved !== false },
      { id: "notif-final-approved", val: settings.final_approved !== false },
      { id: "notif-rejected", val: settings.rejected !== false },
      { id: "notif-cancellation", val: settings.cancellation !== false },
      { id: "notif-hr-review", val: settings.hr_review !== false },
      { id: "notif-hr-notify", val: settings.hr_notify !== false }
    ];

    mapList.forEach(item => {
      const el = document.getElementById(item.id);
      if (el) {
        el.checked = item.val;
        handleSwitchVisualChange(item.id, false);
      }
    });

  } catch (err) {
    console.error("loadLineNotificationSettings Error:", err);
  }
}

async function saveLineNotificationSettings(isSilent = false) {
  const btn = document.getElementById("saveLineNotifSettingsBtn");
  const indicator = document.getElementById("lineNotifAutoSaveIndicator");
  const originalHtml = btn ? btn.innerHTML : "";
  if (btn && !isSilent) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined spinning-icon" style="font-size:18px;">sync</span> กำลังบันทึก...';
  }

  const settings = {
    new_request: document.getElementById("notif-new-request")?.checked ?? true,
    new_request_l2: document.getElementById("notif-new-request-l2")?.checked ?? true,
    leader_approved: document.getElementById("notif-leader-approved")?.checked ?? true,
    manager_approved: document.getElementById("notif-manager-approved")?.checked ?? true,
    final_approved: document.getElementById("notif-final-approved")?.checked ?? true,
    rejected: document.getElementById("notif-rejected")?.checked ?? true,
    cancellation: document.getElementById("notif-cancellation")?.checked ?? true,
    hr_review: document.getElementById("notif-hr-review")?.checked ?? true,
    hr_notify: document.getElementById("notif-hr-notify")?.checked ?? true,
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await sb
      .from("system_settings")
      .upsert({
        setting_key: "line_notification_settings",
        setting_value: settings,
        updated_at: new Date().toISOString()
      }, { onConflict: "setting_key" });

    if (error) throw error;

    if (indicator) {
      indicator.style.display = "inline-flex";
      indicator.style.color = "#16a34a";
      indicator.style.background = "#f0fdf4";
      indicator.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> บันทึกอัตโนมัติเรียบร้อย';
      setTimeout(() => {
        if (indicator) indicator.style.display = "none";
      }, 2500);
    }

    if (!isSilent) {
      Swal.fire({
        icon: "success",
        title: "บันทึกเรียบร้อย",
        text: "อัปเดตสิทธิ์การแจ้งเตือน LINE รายขั้นตอนเรียบร้อยแล้ว",
        timer: 1600,
        showConfirmButton: false
      });
    }
  } catch (err) {
    console.error("saveLineNotificationSettings Error:", err);
    if (!isSilent) {
      Swal.fire("ผิดพลาด", "ไม่สามารถบันทึกการตั้งค่าได้: " + err.message, "error");
    }
    if (indicator) {
      indicator.style.display = "inline-flex";
      indicator.style.color = "#dc2626";
      indicator.style.background = "#fef2f2";
      indicator.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">error</span> บันทึกไม่สำเร็จ';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml || '<span class="material-symbols-outlined" style="font-size: 18px;">save</span> บันทึกการตั้งค่าแจ้งเตือน LINE';
    }
  }
}

// 🧪 3.1 ทดสอบส่งข้อความแจ้งเตือน LINE รายขั้นตอน (Live Test)
window.openTestLineStepModal = function(defaultStepKey) {
  const stepOptions = [
    { key: "new_request", name: "1. ยื่นใบลาใหม่ ➔ ส่งหาหัวหน้างาน L1" },
    { key: "new_request_l2", name: "2. ยื่นใบลาใหม่ ➔ ส่งหาผู้จัดการ L2 (ข้าม L1)" },
    { key: "leader_approved", name: "3. หัวหน้า L1 อนุมัติ ➔ ส่งต่อผู้จัดการ L2" },
    { key: "manager_approved", name: "4. ผู้จัดการ L2 อนุมัติ ➔ ส่งต่อ HR / ผู้บริหาร" },
    { key: "final_approved", name: "5. อนุมัติเสร็จสมบูรณ์ ➔ ส่งสลิปอนุมัติหาพนักงาน" },
    { key: "rejected", name: "6. ปฏิเสธใบลา (ไม่อนุมัติ) ➔ ส่งหาพนักงาน" },
    { key: "cancellation", name: "7. ขอยกเลิกคำขอลา ➔ แจ้งผู้อนุมัติ / HR" },
    { key: "hr_review", name: "8. ถึงคิว HR ตรวจสอบ ➔ แจ้งเตือนฝ่ายบุคคล" },
    { key: "hr_notify", name: "9. สรุปผลใบลาสมบูรณ์ ➔ แจ้งฝ่ายบุคคล" }
  ];

  const connectedEmployees = (employees || []).filter(e => e && e.line_id && String(e.line_id).trim() !== "");
  
  const optionsEmpHtml = connectedEmployees.map(e => {
    const deptName = e.departments?.department_name || "-";
    const posName = e.positions?.position_name || e.role || "-";
    const lineIdStr = String(e.line_id).trim();
    return `<option value="${escapeHtml(lineIdStr)}">${escapeHtml(e.full_name || "พนักงาน")} (${escapeHtml(posName)} - ${escapeHtml(deptName)}) [${escapeHtml(lineIdStr.substring(0, 10))}...]</option>`;
  }).join("");

  const stepSelectHtml = stepOptions.map(s => {
    const isSelected = (defaultStepKey && defaultStepKey === s.key) ? 'selected' : '';
    return `<option value="${s.key}" ${isSelected}>${s.name}</option>`;
  }).join("");

  Swal.fire({
    title: '<div style="display:flex;align-items:center;justify-content:center;gap:8px;"><span class="material-symbols-outlined" style="color:#2563eb;">science</span> ทดสอบส่ง LINE Notification</div>',
    width: 580,
    html: `
      <div style="text-align:left; font-size:13px; color:#334155; line-height:1.5;">
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:10px 14px; margin-bottom:16px; font-size:12px; color:#1e40af;">
          ℹ️ ทดสอบส่งข้อความแจ้งเตือนตาม Step จริงไปยัง LINE User ID ของพนักงานหรือผู้บริหาร เพื่อตรวจสอบความถูกต้องของ Flex Message
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-weight:700; display:block; margin-bottom:4px; font-size:12.5px;">ขั้นตอนที่ต้องการทดสอบ:</label>
          <select id="testStepSelect" style="width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
            ${stepSelectHtml}
          </select>
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-weight:700; display:block; margin-bottom:4px; font-size:12.5px;">เลือกผู้รับข้อความ (จากพนักงานที่ผูก LINE แล้ว):</label>
          <select id="testEmpSelect" onchange="document.getElementById('testCustomLineId').value = this.value" style="width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
            <option value="">-- เลือกจากรายชื่อที่ผูก LINE (${connectedEmployees.length} คน) --</option>
            ${optionsEmpHtml}
          </select>
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-weight:700; display:block; margin-bottom:4px; font-size:12.5px;">หรือระบุ LINE User ID ผู้รับโดยตรง (U...):</label>
          <input type="text" id="testCustomLineId" placeholder="เช่น U1a2b3c4d5e6f..." style="width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:monospace;" />
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px; font-size:12px;">ชื่อพนักงานผู้ลา (จำลอง):</label>
            <input type="text" id="testEmpName" value="สมชาย ใจดี (พนักงานทดสอบ)" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:12.5px;" />
          </div>
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px; font-size:12px;">ประเภทการลา (จำลอง):</label>
            <input type="text" id="testLeaveType" value="ลาพักร้อน (Annual Leave)" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:12.5px;" />
          </div>
        </div>

        <div style="margin-bottom:6px;">
          <label style="font-weight:700; display:block; margin-bottom:4px; font-size:12px;">เหตุผลการลา:</label>
          <input type="text" id="testReason" value="ทดสอบการแจ้งเตือน LINE Workflow อัตโนมัติ" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:12.5px;" />
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '<span class="material-symbols-outlined" style="font-size:18px;">send</span> ส่งข้อความทดสอบเดี๋ยวนี้',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#2563eb',
    showLoaderOnConfirm: true,
    preConfirm: async () => {
      const step = document.getElementById('testStepSelect')?.value;
      const targetLineId = (document.getElementById('testCustomLineId')?.value || '').trim();
      const empName = document.getElementById('testEmpName')?.value || 'พนักงานทดสอบ';
      const leaveType = document.getElementById('testLeaveType')?.value || 'ลาพักร้อน';
      const reason = document.getElementById('testReason')?.value || 'ทดสอบระบบ';

      if (!targetLineId) {
        Swal.showValidationMessage('กรุณาเลือกผู้รับหรือระบุ LINE User ID');
        return false;
      }

      try {
        const notifTypeMap = {
          "new_request": "NEW_REQUEST",
          "new_request_l2": "NEW_REQUEST_L2",
          "leader_approved": "LEADER_APPROVED",
          "manager_approved": "MANAGER_APPROVED",
          "final_approved": "FINAL_APPROVED",
          "rejected": "REJECTED",
          "cancellation": "CANCELLATION",
          "hr_review": "HR_REVIEW",
          "hr_notify": "HR_NOTIFY"
        };

        const notifType = notifTypeMap[step] || "NEW_REQUEST";

        const notifPayload = {
          type: notifType,
          leaveId: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
          employeeName: empName,
          leaveType: leaveType,
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          totalDays: 1,
          reason: reason,
          recipientLineId: targetLineId,
          recipientRole: 'approver'
        };

        let result = null;
        if (window.PVTSDK?.line?.sendWorkflowNotification) {
          result = await window.PVTSDK.line.sendWorkflowNotification(notifPayload);
        } else if (window.pvtSupabase?.sendWorkflowNotification) {
          result = await window.pvtSupabase.sendWorkflowNotification(notifPayload);
        } else {
          // Fallback via server endpoint
          const res = await fetch('/api/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipientLineId: targetLineId,
              title: `[ทดสอบระบบ] ${leaveType}`,
              message: `ผู้ขอลา: ${empName}\nประเภท: ${leaveType}\nเหตุผล: ${reason}\n\n✅ ระบบทดสอบการแจ้งเตือน LINE ทำงานสมบูรณ์`
            })
          });
          result = await res.json();
        }

        if (result && result.success === false) {
          throw new Error(result.error || result.warning || 'ไม่สามารถส่งข้อความได้');
        }

        return { success: true, targetLineId, step };
      } catch (err) {
        Swal.showValidationMessage('การส่งข้อความทดสอบล้มเหลว: ' + err.message);
        return false;
      }
    }
  }).then((res) => {
    if (res.isConfirmed && res.value) {
      Swal.fire({
        icon: 'success',
        title: 'ส่งข้อความทดสอบสำเร็จ!',
        text: `ส่งข้อความขั้นตอน ${res.value.step} ไปยัง LINE ID (${res.value.targetLineId}) เรียบร้อยแล้ว`,
        confirmButtonColor: '#2563eb'
      });
    }
  });
};

// ============================================================
// 📱 4. จัดการรายชื่อพนักงาน & ผู้บริหารที่ผูก LINE (สำหรับพนักงานลาออก / เปลี่ยนตำแหน่ง)
// ============================================================

let currentEmpLineFilter = "all"; // "all", "connected", "unconnected", "approvers"
let currentEmpLineSearch = "";

window.setEmpLineFilter = function(filterType) {
  currentEmpLineFilter = filterType;
  document.querySelectorAll("#empLineFilterTabs .filter-tab-btn").forEach(btn => {
    if (btn.dataset.empfilter === filterType) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  renderEmployeeLineTable();
};

window.filterEmployeeLineTable = function() {
  const input = document.getElementById("empLineSearchInput");
  currentEmpLineSearch = (input?.value || "").trim().toLowerCase();
  renderEmployeeLineTable();
};

window.copyLineId = function(lineId) {
  if (!lineId) return;
  navigator.clipboard.writeText(lineId).then(() => {
    if (typeof Swal !== "undefined") {
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: false
      });
      Toast.fire({
        icon: 'success',
        title: 'คัดลอก LINE User ID แล้ว'
      });
    }
  }).catch(err => {
    console.error("Copy LINE ID failed:", err);
  });
};

function renderEmployeeLineTable() {
  const body = document.getElementById("employeeLineTableBody");
  const countBadge = document.getElementById("empLineCountBadge");
  const countAll = document.getElementById("empCountAll");
  const countConnected = document.getElementById("empCountConnected");
  const countUnconnected = document.getElementById("empCountUnconnected");
  const countApprovers = document.getElementById("empCountApprovers");

  // รวบรวม ID ของผู้ที่เป็นผู้อนุมัติในสายปัจจุบัน
  const activeApproverIds = new Set();
  departments.forEach(dept => {
    const map = approverMap.get(String(dept.id));
    if (map?.supervisor_id) activeApproverIds.add(String(map.supervisor_id));
    if (map?.manager_id) activeApproverIds.add(String(map.manager_id));
  });
  if (executiveSetting?.employee_id) {
    activeApproverIds.add(String(executiveSetting.employee_id));
  }

  // คำนวณตัวเลขสถิติบน Tabs (ยกเว้นบัญชีระบบ/อนุมัติ admin และ HR-001)
  const realEmps = employees.filter(e => !(window.isSystemOrAdminAccount && window.isSystemOrAdminAccount(e)));
  const totalAll = realEmps.length;
  let totalConnected = 0;
  let totalUnconnected = 0;
  let totalApprovers = 0;

  realEmps.forEach(emp => {
    const hasLine = Boolean(emp.line_id && String(emp.line_id).trim() !== "");
    if (hasLine) totalConnected++;
    else totalUnconnected++;

    const isApp = activeApproverIds.has(String(emp.id)) || 
      ['executive', 'director', 'manager', 'leader', 'hr', 'admin'].includes((emp.role || '').toLowerCase()) ||
      isLeaderCandidate(emp) || isManagerCandidate(emp) || isExecutiveCandidate(emp);
    if (isApp) totalApprovers++;
  });

  if (countAll) countAll.textContent = totalAll;
  if (countConnected) countConnected.textContent = totalConnected;
  if (countUnconnected) countUnconnected.textContent = totalUnconnected;
  if (countApprovers) countApprovers.textContent = totalApprovers;

  if (!body) return;

  // กรองรายชื่อตาม Tab และคำค้นหา
  const filtered = employees.filter(emp => {
    const hasLine = isLineConnected(emp);
    const isApp = activeApproverIds.has(String(emp.id)) || 
      ['executive', 'director', 'manager', 'leader', 'hr', 'admin'].includes((emp.role || '').toLowerCase()) ||
      isLeaderCandidate(emp) || isManagerCandidate(emp) || isExecutiveCandidate(emp);

    // ตัวกรองแท็บ
    if (currentEmpLineFilter === "connected" && !hasLine) return false;
    if (currentEmpLineFilter === "unconnected" && hasLine) return false;
    if (currentEmpLineFilter === "approvers" && !isApp) return false;

    // คำค้นหา
    if (currentEmpLineSearch) {
      const dept = departments.find(d => String(d.id) === String(emp.department_id));
      const deptName = dept?.department_name || emp.departments?.department_name || "";
      const posName = emp.positions?.position_name || "";
      const searchTarget = `${emp.full_name || ''} ${emp.nickname || ''} ${emp.employee_code || ''} ${deptName} ${posName} ${emp.line_id || ''} ${emp.role || ''}`.toLowerCase();
      if (!searchTarget.includes(currentEmpLineSearch)) return false;
    }

    return true;
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} คน`;
  }

  if (filtered.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <span class="material-symbols-outlined" style="font-size: 48px; color: #cbd5e1; margin-bottom: 8px;">person_search</span>
          <p style="margin:0; font-weight:600; font-size: 14.5px; color: #64748b;">ไม่พบรายชื่อพนักงานที่ตรงกับเงื่อนไขการค้นหาหรือตัวกรอง</p>
        </td>
      </tr>
    `;
    return;
  }

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

  const rows = filtered.map(emp => {
    const dept = departments.find(d => String(d.id) === String(emp.department_id));
    const deptName = dept?.department_name || emp.departments?.department_name || "ไม่ระบุแผนก";
    const posName = emp.positions?.position_name || "พนักงาน";
    const hasLine = isLineConnected(emp);
    const isResigned = emp.status === "resigned" || emp.status === "inactive";

    const empNameHtml = highlightMatch(emp.full_name || "-", currentEmpLineSearch);
    const empNicknameHtml = emp.nickname ? highlightMatch(emp.nickname, currentEmpLineSearch) : '';
    const empCodeHtml = highlightMatch(emp.employee_code || '-', currentEmpLineSearch);
    const deptNameHtml = highlightMatch(deptName, currentEmpLineSearch);
    const posNameHtml = highlightMatch(posName, currentEmpLineSearch);

    // อวาตาร์
    let avatarContent = "";
    if (emp.image_url) {
      avatarContent = `<img src="${escapeAttr(emp.image_url)}" class="emp-avatar-img" alt="${escapeAttr(emp.full_name)}" onerror="this.parentElement.innerHTML='${escapeHtml(emp.full_name?.substring(0,2) || 'EM')}'">`;
    } else {
      const initials = (emp.full_name || "EM").substring(0, 2).toUpperCase();
      avatarContent = escapeHtml(initials);
    }

    // บทบาทหลักในระบบ (Role)
    const role = (emp.role || "user").toLowerCase();
    let roleBadgeHtml = "";
    if (role === "executive" || role === "director") {
      roleBadgeHtml = `<span class="role-badge-tag exec">👑 ผู้บริหารระดับสูง</span>`;
    } else if (role === "manager") {
      roleBadgeHtml = `<span class="role-badge-tag mgr">👔 ผู้จัดการฝ่าย</span>`;
    } else if (role === "leader") {
      roleBadgeHtml = `<span class="role-badge-tag sup">🎖️ หัวหน้างาน</span>`;
    } else if (role === "hr" || role === "admin") {
      roleBadgeHtml = `<span class="role-badge-tag hr">🛡️ HR / ผู้ดูแลระบบ</span>`;
    } else {
      roleBadgeHtml = `<span class="role-badge-tag staff">👤 พนักงานทั่วไป</span>`;
    }

    // บทบาทในสายอนุมัติจริง (Workflow Assignments)
    const assignedDeptsL1 = [];
    const assignedDeptsL2 = [];
    departments.forEach(d => {
      const map = approverMap.get(String(d.id));
      if (String(map?.supervisor_id) === String(emp.id)) assignedDeptsL1.push(d.department_name);
      if (String(map?.manager_id) === String(emp.id)) assignedDeptsL2.push(d.department_name);
    });
    const isExecL3 = executiveSetting?.employee_id && String(executiveSetting.employee_id) === String(emp.id);

    let workflowTags = "";
    if (isExecL3) {
      workflowTags += `<div style="margin-top:3px;"><span style="font-size:10.5px; background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:4px; font-weight:700; border:1px solid #fde68a;">👑 ผู้อนุมัติ L3 (ผู้บริหาร)</span></div>`;
    }
    if (assignedDeptsL1.length > 0) {
      workflowTags += `<div style="margin-top:2px;"><span style="font-size:10.5px; background:#ccfbf1; color:#0f766e; padding:1px 6px; border-radius:4px; font-weight:700; border:1px solid #99f6e4;" title="${escapeAttr(assignedDeptsL1.join(', '))}">🎖️ ผู้อนุมัติ L1 (${escapeHtml(assignedDeptsL1[0])}${assignedDeptsL1.length > 1 ? ` +${assignedDeptsL1.length - 1}` : ''})</span></div>`;
    }
    if (assignedDeptsL2.length > 0) {
      workflowTags += `<div style="margin-top:2px;"><span style="font-size:10.5px; background:#e0e7ff; color:#4338ca; padding:1px 6px; border-radius:4px; font-weight:700; border:1px solid #c7d2fe;" title="${escapeAttr(assignedDeptsL2.join(', '))}">👔 ผู้อนุมัติ L2 (${escapeHtml(assignedDeptsL2[0])}${assignedDeptsL2.length > 1 ? ` +${assignedDeptsL2.length - 1}` : ''})</span></div>`;
    }

    // สถานะ LINE & รหัส User ID
    let lineDisplayHtml = "";
    if (hasLine) {
      lineDisplayHtml = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span class="line-status-chip connected">
            <span style="font-size: 8px;">●</span> เชื่อมต่อ LINE แล้ว
          </span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="line-id-val" title="${escapeAttr(emp.line_id)}">${escapeHtml(emp.line_id.length > 16 ? emp.line_id.substring(0, 15) + '...' : emp.line_id)}</span>
            <button type="button" onclick="copyLineId('${escapeAttr(emp.line_id)}')" title="คัดลอก LINE User ID" style="background:none; border:none; cursor:pointer; color:#64748b; padding:2px; display:inline-flex; align-items:center;">
              <span class="material-symbols-outlined" style="font-size:14px;">content_copy</span>
            </button>
          </div>
        </div>
      `;
    } else {
      lineDisplayHtml = `
        <span class="line-status-chip unconnected">
          <span style="font-size: 8px;">○</span> ยังไม่เชื่อมต่อ
        </span>
      `;
    }

    // ปุ่มการจัดการ LINE ID
    let actionButtonsHtml = "";
    if (hasLine) {
      actionButtonsHtml = `
        <div style="display:flex; flex-direction:column; gap:5px; align-items:center;">
          <div style="display:flex; gap:4px;">
            <button type="button" class="btn-link-line" onclick="editEmployeeLineIdDirectly('${escapeAttr(emp.id)}', '${escapeAttr(emp.full_name)}')" title="แก้ไข LINE User ID โดยตรง" style="font-size:11.5px; padding:3px 8px; background:#f0fdf4; color:#15803d; border-color:#bbf7d0;">
              <span class="material-symbols-outlined" style="font-size: 13px;">edit</span> แก้ไข ID
            </button>
            <button type="button" class="btn-link-line" onclick="createLineLinkCode('${escapeAttr(emp.id)}')" title="สร้างรหัสผูกบัญชีใหม่" style="font-size:11.5px; padding:3px 8px;">
              <span class="material-symbols-outlined" style="font-size: 13px;">sync</span> รหัสใหม่
            </button>
          </div>
          <button type="button" class="btn-unlink-line" onclick="unlinkEmployeeLine('${escapeAttr(emp.id)}', '${escapeAttr(emp.full_name)}')" title="ลบช่อง line_id ใน employees (สำหรับคนลาออก หรือเปลี่ยนตำแหน่ง)" style="font-size:11px; padding:2px 8px; width:100%;">
            <span class="material-symbols-outlined" style="font-size: 13px;">link_off</span> ล้าง LINE ID
          </button>
        </div>
      `;
    } else {
      actionButtonsHtml = `
        <div style="display:flex; flex-direction:column; gap:5px; align-items:center;">
          <button type="button" class="btn-link-line" onclick="createLineLinkCode('${escapeAttr(emp.id)}')" title="สร้างรหัส 6 หลักเพื่อส่งให้พนักงานผูก LINE" style="width:100%; justify-content:center;">
            <span class="material-symbols-outlined" style="font-size: 14px;">link</span> สร้างรหัสผูก LINE
          </button>
          <button type="button" class="btn-link-line" onclick="editEmployeeLineIdDirectly('${escapeAttr(emp.id)}', '${escapeAttr(emp.full_name)}')" title="ระบุ LINE User ID ด้วยตนเอง" style="font-size:11px; padding:2px 8px; background:#f8fafc; color:#475569; border-color:#cbd5e1; width:100%; justify-content:center;">
            <span class="material-symbols-outlined" style="font-size: 13px;">edit_note</span> ระบุ LINE ID เอง
          </button>
        </div>
      `;
    }

    return `
      <tr style="${isResigned ? 'background: #fff8f8;' : ''}">
        <td>
          <div class="emp-cell-user">
            <div class="emp-avatar-badge" style="${isResigned ? 'background:#fee2e2; color:#b91c1c; border-color:#fca5a5;' : ''}">
              ${avatarContent}
            </div>
            <div class="emp-detail-col">
              <div class="emp-name-text">
                ${empNameHtml}
                ${emp.nickname ? `<span style="font-weight:400; color:#64748b; font-size:12px;">(${empNicknameHtml})</span>` : ''}
              </div>
              <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                <span class="emp-code-badge">#${empCodeHtml}</span>
                ${isResigned 
                  ? `<span style="background:#fee2e2; color:#b91c1c; font-size:10.5px; font-weight:700; padding:1px 6px; border-radius:4px; border:1px solid #fca5a5;">⚠️ ลาออกแล้ว</span>` 
                  : `<span style="background:#f0fdf4; color:#15803d; font-size:10.5px; font-weight:600; padding:1px 6px; border-radius:4px;">ปกติ</span>`
                }
              </div>
            </div>
          </div>
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <div style="font-weight:600; color:#1e293b; font-size:13px; display:flex; align-items:center; gap:4px;">
              <span class="material-symbols-outlined" style="font-size:14px; color:#64748b;">domain</span>
              <span>${deptNameHtml}</span>
            </div>
            <div style="font-size:12px; color:#64748b; margin-left:18px;">
              ${posNameHtml}
            </div>
          </div>
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:2px;">
            ${roleBadgeHtml}
            ${workflowTags}
          </div>
        </td>
        <td>
          ${lineDisplayHtml}
        </td>
        <td style="text-align: center;">
          ${actionButtonsHtml}
        </td>
      </tr>
    `;
  });

  body.innerHTML = rows.join("");
}

window.unlinkEmployeeLine = async function(employeeId, employeeName) {
  const emp = employees.find(e => String(e.id) === String(employeeId));
  const name = employeeName || emp?.full_name || "พนักงานท่านนี้";
  const code = emp?.employee_code ? `(#${emp.employee_code})` : "";
  const isResigned = emp?.status === "resigned" || emp?.status === "inactive";

  const result = await Swal.fire({
    title: "ยืนยันล้าง LINE ID?",
    html: `
      <div style="text-align: center; margin-bottom: 12px;">
        คุณต้องการลบและยกเลิกการเชื่อมต่อ LINE ของ<br>
        <b style="font-size: 16px; color: #0f172a;">${escapeHtml(name)} ${escapeHtml(code)}</b> ใช่หรือไม่?
      </div>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; font-size: 13px; color: #991b1b; text-align: left; line-height: 1.6;">
        <div style="font-weight: 700; margin-bottom: 4px;">📌 ผลของการล้าง LINE ID:</div>
        <div>• ระบบจะลบค่าในช่อง <b>line_id</b> ของตาราง <code>employees</code> เป็นค่าว่าง (null) ทันที</div>
        <div>• พนักงานจะไม่ได้รับการแจ้งเตือนใบลาผ่าน LINE อีกต่อไป (เหมาะสำหรับ<b>พนักงานที่ลาออก หรือเปลี่ยนตำแหน่งงาน</b>)</div>
        ${isResigned ? '<div style="color: #b91c1c; font-weight: 700; margin-top: 4px;">⚠️ พนักงานท่านนี้มีสถานะลาออกแล้ว การล้าง LINE ID จะช่วยป้องกันไม่ให้ระบบส่งข้อมูลของบริษัทไปยัง LINE ส่วนตัว</div>' : ''}
      </div>
    `,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#64748b",
    confirmButtonText: "🗑️ ยืนยันลบช่อง LINE ID",
    cancelButtonText: "ยกเลิก"
  });

  if (!result.isConfirmed) return;

  // Show loading dialog
  Swal.fire({
    title: "กำลังล้าง LINE ID...",
    text: "กำลังอัปเดตฐานข้อมูล employees...",
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    // 1. เรียกผ่าน Server API /api/clear-approver-line
    let apiSuccess = false;
    try {
      const res = await fetch("/api/clear-approver-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_ids: [employeeId] })
      });
      if (res.ok) {
        apiSuccess = true;
      }
    } catch (apiErr) {
      console.warn("API /api/clear-approver-line warning:", apiErr);
    }

    // 2. Direct Supabase Fallback เพื่อให้แน่ใจว่า line_id = null 100%
    if (sb) {
      const { error: updErr } = await sb
        .from("employees")
        .update({ line_id: null })
        .eq("id", employeeId);

      if (updErr && !apiSuccess) throw updErr;

      try {
        await sb.from("line_link_tokens").delete().eq("employee_id", employeeId);
      } catch (tokErr) {}
    }

    // 3. ปรับปรุง local in-memory state
    if (emp) {
      emp.line_id = null;
    }

    // 4. Re-render UI ทุกส่วนที่เกี่ยวข้อง
    renderEmployeeLineTable();
    renderApproverTable();
    updateLineSummaryStats();
    updateExecutiveLineStatus();
    updateLineStatus("supervisor");
    updateLineStatus("manager");

    Swal.fire({
      icon: "success",
      title: "ล้าง LINE ID สำเร็จ",
      html: `ลบช่อง <b>line_id</b> ใน employees ของ <b>${escapeHtml(name)}</b> เรียบร้อยแล้ว`,
      timer: 2000,
      showConfirmButton: false
    });

  } catch (err) {
    console.error("unlinkEmployeeLine error:", err);
    Swal.fire("ไม่สำเร็จ", err.message || "เกิดข้อผิดพลาดในการล้าง LINE ID", "error");
  }
};

// ============================================================
// 🎯 3. ตั้งค่าสายอนุมัติรายบุคคล (Individual Override Logic)
// ============================================================

function renderIndividualEmployeeOptions() {
  const el = document.getElementById("individualEmployeeSelect");
  if (!el) return;

  const options = employees
    .filter(e => e.status !== "resigned")
    .map(e => {
      const dept = e.departments?.department_name || "ไม่ระบุแผนก";
      const pos = e.positions?.position_name || e.role || "พนักงาน";
      const code = e.employee_code ? `#${e.employee_code} ` : "";
      return `<option value="${escapeAttr(e.id)}">${escapeHtml(code + e.full_name + " (" + pos + " - " + dept + ")")}</option>`;
    }).join("");

  el.innerHTML = `<option value="">-- ค้นหา/เลือกพนักงาน --</option>${options}`;

  // Populate Approver Selects (Reuse logic)
  const l1El = document.getElementById("individualL1Select");
  const l2El = document.getElementById("individualL2Select");

  if (l1El) l1El.innerHTML = buildSupervisorOptions(null, null); // Load all possible leaders
  if (l2El) l2El.innerHTML = buildManagerOptions(null, null);    // Load all possible managers
}

function handleIndividualEmployeeChange() {
  const employeeId = document.getElementById("individualEmployeeSelect")?.value;
  const statusEl = document.getElementById("individualCurrentStatus");
  const l1Select = document.getElementById("individualL1Select");
  const l2Select = document.getElementById("individualL2Select");

  if (!employeeId || !statusEl) {
    if (statusEl) statusEl.textContent = "กรุณาเลือกพนักงานเพื่อดูสายอนุมัติปัจจุบัน";
    return;
  }

  const emp = employees.find(e => String(e.id) === String(employeeId));
  if (!emp) return;

  // 1. Get Department Default Approvers
  const deptMap = approverMap.get(String(emp.department_id));
  const deptL1 = employees.find(e => String(e.id) === String(deptMap?.supervisor_id));
  const deptL2 = employees.find(e => String(e.id) === String(deptMap?.manager_id));

  // 2. Build Status Text
  let statusHtml = `<div style="line-height: 1.6;">`;
  statusHtml += `<b>🏢 แผนกหลัก:</b> ${escapeHtml(emp.departments?.department_name || "ไม่ระบุ")}<br>`;
  
  if (emp.l1_approver_id || emp.l2_approver_id) {
    statusHtml += `<span style="color: var(--accent-purple); font-weight: 700;">✨ มีการตั้งค่ารายบุคคล (Override)</span><br>`;
  } else {
    statusHtml += `<span style="color: #64748b;">📂 ใช้ตามสายอนุมัติแผนก</span><br>`;
  }

  statusHtml += `<b>L1:</b> ${escapeHtml(deptL1?.full_name || "ไม่มี")} (ตามแผนก)<br>`;
  statusHtml += `<b>L2:</b> ${escapeHtml(deptL2?.full_name || "ไม่มี")} (ตามแผนก)`;
  statusHtml += `</div>`;
  
  statusEl.innerHTML = statusHtml;

  // 3. Set Values in Selects
  if (l1Select) l1Select.value = emp.l1_approver_id || "";
  if (l2Select) l2Select.value = emp.l2_approver_id || "";
}

async function saveIndividualApprover() {
  const employeeId = document.getElementById("individualEmployeeSelect")?.value;
  const l1Id = document.getElementById("individualL1Select")?.value || null;
  const l2Id = document.getElementById("individualL2Select")?.value || null;

  if (!employeeId) {
    Swal.fire("แจ้งเตือน", "กรุณาเลือกพนักงานที่ต้องการตั้งค่า", "warning");
    return;
  }

  const btn = document.getElementById("btnSaveIndividual");
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined spinning-icon">sync</span> กำลังบันทึก...';

  try {
    const { error } = await sb
      .from("employees")
      .update({
        l1_approver_id: l1Id,
        l2_approver_id: l2Id,
        updated_at: new Date().toISOString()
      })
      .eq("id", employeeId);

    if (error) throw error;

    // Update local state
    const empIdx = employees.findIndex(e => String(e.id) === String(employeeId));
    if (empIdx !== -1) {
      employees[empIdx].l1_approver_id = l1Id;
      employees[empIdx].l2_approver_id = l2Id;
    }

    Swal.fire({
      icon: "success",
      title: "บันทึกสำเร็จ",
      text: "ตั้งค่าสายอนุมัติรายบุคคลเรียบร้อยแล้ว",
      timer: 2000,
      showConfirmButton: false
    });
    
    handleIndividualEmployeeChange(); // Refresh status text
  } catch (err) {
    console.error("saveIndividualApprover Error:", err);
    Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถบันทึกได้: " + err.message + "\n\n(หากเกิดข้อผิดพลาดเกี่ยวกับ Column กรุณารัน SQL ตามคู่มือ)", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

/**
 * ✏️ ฟังก์ชันระบุหรือแก้ไข LINE User ID ของพนักงานโดยตรง
 */
window.editEmployeeLineIdDirectly = async function(employeeId, employeeName) {
  const emp = employees.find(e => String(e.id) === String(employeeId));
  const currentLineId = emp?.line_id || "";
  const name = employeeName || emp?.full_name || "พนักงาน";

  const { value: newLineId } = await Swal.fire({
    title: "ระบุ LINE User ID",
    html: `
      <div style="text-align: left; font-size: 13.5px; color: #334155; margin-bottom: 8px;">
        พนักงาน: <b style="color: #0f766e;">${escapeHtml(name)}</b>
      </div>
      <p style="font-size: 12.5px; color: #64748b; text-align: left; margin: 0 0 12px; line-height: 1.5;">
        ระบุ LINE User ID ของพนักงาน (เช่น <code>U1234567890abcdef...</code>)<br>
        <i>* หากต้องการยกเลิกการเชื่อมต่อ ให้เว้นว่างไว้แล้วกดบันทึก</i>
      </p>
    `,
    input: "text",
    inputValue: currentLineId,
    inputPlaceholder: "เช่น U1234567890abcdef...",
    showCancelButton: true,
    confirmButtonText: "บันทึกข้อมูล",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#0f766e"
  });

  if (newLineId !== undefined) {
    const cleanId = String(newLineId).trim() || null;
    try {
      const { error } = await sb.from("employees").update({ line_id: cleanId }).eq("id", employeeId);
      if (error) throw error;

      if (emp) emp.line_id = cleanId;
      renderApproverTable();
      renderEmployeeLineTable();
      updateExecutiveLineStatus();
      updateLineStatus("supervisor");
      updateLineStatus("manager");

      Swal.fire({
        icon: "success",
        title: "บันทึกแล้ว",
        text: cleanId ? `เชื่อมต่อ LINE ID ของ ${name} สำเร็จ` : `ล้างข้อมูล LINE ID ของ ${name} เรียบร้อย`,
        timer: 1600,
        showConfirmButton: false
      });
    } catch (err) {
      console.error("editEmployeeLineIdDirectly Error:", err);
      Swal.fire("บันทึกไม่สำเร็จ", err.message || "กรุณาลองใหม่อีกครั้ง", "error");
    }
  }
};

/**
 * 🔍 Initialize Tom Select for all searchable dropdowns
 * Allows searching by Code, Name, Position, Department
 */
function initTomSelect() {
  if (typeof TomSelect === "undefined") {
    console.warn("TomSelect library not loaded");
    return;
  }

  const selects = [
    '#departmentSelect',
    '#individualEmployeeSelect',
    '#individualL1Select',
    '#individualL2Select',
    '#modalSupervisorSelect',
    '#modalManagerSelect',
    '#executiveSelect',
    '#delApproverSelect',
    '#delProxySelect'
  ];

  selects.forEach(id => {
    const el = document.querySelector(id);
    if (el) {
      // Destroy existing instance if any
      if (el.tomselect) {
        el.tomselect.destroy();
      }
      
      // Initialize new instance
      try {
        const ts = new TomSelect(id, {
          create: false,
          sortField: {
            field: "text",
            direction: "asc"
          },
          placeholder: el.getAttribute('placeholder') || 'พิมพ์เพื่อค้นหา...',
          allowEmptyOption: true,
          maxOptions: 2000, // Show more options for large employee lists
          plugins: ['dropdown_input'], // Better mobile search experience
          onInitialize: function() {
            // Optional: fine-tune styling after initialization
          }
        });

        // 🎯 ผูก event เมื่อผู้ใช้เลือกตัวเลือกใน TomSelect เพื่อให้สถานะ LINE เปลี่ยนทันที
        ts.on('change', () => {
          if (id === '#departmentSelect') {
            handleDepartmentChange();
          } else if (id === '#supervisorSelect') {
            updateLineStatus('supervisor');
          } else if (id === '#managerSelect') {
            updateLineStatus('manager');
          } else if (id === '#executiveSelect') {
            updateExecutiveLineStatus();
          } else if (id === '#individualEmployeeSelect') {
            handleIndividualEmployeeChange();
          } else if (id === '#modalSupervisorSelect') {
            updateModalLineStatus('supervisor');
          } else if (id === '#modalManagerSelect') {
            updateModalLineStatus('manager');
          }
        });
      } catch (err) {
        console.error(`Error initializing Tom Select for ${id}:`, err);
      }
    }
  });
}

/* ==========================================================================
   🔄 AUTO-DELEGATION (ระบบโอนสิทธิ์อนุมัติอัตโนมัติเมื่อหัวหน้างานลาพักร้อน)
   ========================================================================== */

let currentAutoDelConfig = null;
let currentDelegationRules = [];

/**
 * โหลดข้อมูลระบบ Auto-Delegation ทั้งหมด
 */
window.loadAutoDelegationData = async function() {
  try {
    if (!window.AutoDelegationService) return;

    currentAutoDelConfig = await window.AutoDelegationService.getConfig();
    currentDelegationRules = await window.AutoDelegationService.getDelegationRules();

    // Render Global Toggles
    const masterSw = document.getElementById("autodel-master");
    const annualSw = document.getElementById("autodel-annual");
    const fallbackSw = document.getElementById("autodel-fallback");

    if (masterSw) {
      masterSw.checked = currentAutoDelConfig.enabled !== false;
      updateToggleTagUI("autodel-master", masterSw.checked);
    }
    if (annualSw) {
      annualSw.checked = currentAutoDelConfig.autoTriggerOnAnnualLeave !== false;
      updateToggleTagUI("autodel-annual", annualSw.checked);
    }
    if (fallbackSw) {
      fallbackSw.checked = currentAutoDelConfig.allowL2Fallback !== false;
      updateToggleTagUI("autodel-fallback", fallbackSw.checked);
    }

    renderDelegationDropdowns();
    renderSavedDelegationRules();
    await refreshActiveDelegationsList();

  } catch (err) {
    console.warn("loadAutoDelegationData error:", err);
  }
};

function updateToggleTagUI(id, isChecked) {
  const tag = document.getElementById(`tag-${id}`);
  const row = document.getElementById(`row-${id}`);
  if (tag) {
    tag.textContent = isChecked ? "เปิด" : "ปิด";
    tag.className = `switch-status-tag ${isChecked ? 'on' : 'off'}`;
  }
  if (row) {
    row.className = `notif-step-row ${isChecked ? 'is-active' : 'is-inactive'}`;
  }
}

/**
 * จัดการ Master Switch เปิด/ปิด Auto-Delegation
 */
window.handleAutoDelegationMasterToggle = async function() {
  const masterSw = document.getElementById("autodel-master");
  const isChecked = masterSw ? masterSw.checked : true;
  updateToggleTagUI("autodel-master", isChecked);

  const badge = document.getElementById("activeDelegationsBadge");
  if (badge) {
    if (isChecked) {
      badge.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px;">bolt</span> ระบบเปิดใช้งาน';
      badge.style.background = '#e0f2fe';
      badge.style.color = '#0284c7';
      badge.style.borderColor = '#bae6fd';
    } else {
      badge.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px;">pause_circle</span> ปิดการทำงาน';
      badge.style.background = '#f1f5f9';
      badge.style.color = '#64748b';
      badge.style.borderColor = '#cbd5e1';
    }
  }

  await saveAutoDelegationGlobalConfig();
};

/**
 * บันทึกการตั้งค่า Global Config
 */
window.saveAutoDelegationGlobalConfig = async function() {
  if (!window.AutoDelegationService) return;

  const masterSw = document.getElementById("autodel-master");
  const annualSw = document.getElementById("autodel-annual");
  const fallbackSw = document.getElementById("autodel-fallback");

  const newConfig = {
    enabled: masterSw ? masterSw.checked : true,
    autoTriggerOnAnnualLeave: annualSw ? annualSw.checked : true,
    allowL2Fallback: fallbackSw ? fallbackSw.checked : true,
    autoTriggerOnAllLeaves: false,
    notifyDelegateViaLine: true,
    notifyDelegateInApp: true
  };

  updateToggleTagUI("autodel-annual", newConfig.autoTriggerOnAnnualLeave);
  updateToggleTagUI("autodel-fallback", newConfig.allowL2Fallback);

  await window.AutoDelegationService.saveConfig(newConfig);
};

/**
 * เติมข้อมูลใน Dropdowns ของฟอร์มกำหนดตัวแทน
 */
function renderDelegationDropdowns() {
  const approverSel = document.getElementById("delApproverSelect");
  const proxySel = document.getElementById("delProxySelect");
  if (!approverSel || !proxySel) return;

  // กรองเฉพาะพนักงานที่เป็นหัวหน้า, ผู้จัดการ หรือระดับบริหาร
  const leadersAndManagers = employees.filter(e => {
    const role = (e.role || '').toLowerCase();
    const pos = (e.positions?.position_name || '').toLowerCase();
    return role === 'leader' || role === 'manager' || role === 'director' || role === 'executive' || 
           pos.includes('หัวหน้า') || pos.includes('ผู้จัดการ') || pos.includes('ผู้อำนวยการ') || pos.includes('lead');
  });

  // ผู้อนุมัติหลัก (Primary Approvers)
  let appHtml = '<option value="">-- เลือกหัวหน้างาน/ผู้จัดการหลัก --</option>';
  leadersAndManagers.forEach(e => {
    const dept = e.departments?.department_name || '-';
    const pos = e.positions?.position_name || e.role || '-';
    appHtml += `<option value="${e.id}">[${e.employee_code || '-'}] ${e.full_name} (${pos} - แผนก ${dept})</option>`;
  });
  approverSel.innerHTML = appHtml;

  // ผู้รักษาการแทน (Delegates) - สามารถเลือกได้จากพนักงานทุกคน หรือหัวหน้าคนอื่น
  let proxyHtml = '<option value="">-- เลือกผู้ปฏิบัติหน้าที่แทน --</option>';
  employees.forEach(e => {
    const dept = e.departments?.department_name || '-';
    const pos = e.positions?.position_name || e.role || '-';
    proxyHtml += `<option value="${e.id}">[${e.employee_code || '-'}] ${e.full_name} (${pos} - แผนก ${dept})</option>`;
  });
  proxySel.innerHTML = proxyHtml;
}

window.handleDelConditionChange = function() {
  const cond = document.getElementById("delConditionSelect")?.value;
  const customRow = document.getElementById("delCustomDateRow");
  if (customRow) {
    customRow.style.display = cond === 'custom_date' ? 'grid' : 'none';
  }
};

/**
 * บันทึกกฎการโอนสิทธิ์จากฟอร์ม
 */
window.saveDelegationRuleFromForm = async function() {
  const approverId = document.getElementById("delApproverSelect")?.value;
  const delegateId = document.getElementById("delProxySelect")?.value;
  const condition = document.getElementById("delConditionSelect")?.value || 'on_annual_leave';
  const startDate = document.getElementById("delStartDate")?.value || null;
  const endDate = document.getElementById("delEndDate")?.value || null;
  const note = document.getElementById("delNoteInput")?.value || '';

  if (!approverId) {
    Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณาเลือกผู้อนุมัติหลักที่ต้องการตั้งค่า', 'warning');
    return;
  }
  if (!delegateId) {
    Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณาเลือกผู้รักษาการแทนที่ต้องการมอบหมาย', 'warning');
    return;
  }
  if (String(approverId) === String(delegateId)) {
    Swal.fire('ไม่สามารถดำเนินการได้', 'ผู้อนุมัติหลักและผู้รักษาการแทนต้องไม่เป็นบุคคลเดียวกัน', 'error');
    return;
  }

  const approverEmp = employees.find(e => String(e.id) === String(approverId));
  const delegateEmp = employees.find(e => String(e.id) === String(delegateId));

  const rule = {
    approver_id: approverId,
    approver_name: approverEmp?.full_name || 'ผู้อนุมัติหลัก',
    delegate_id: delegateId,
    delegate_name: delegateEmp?.full_name || 'ผู้รักษาการแทน',
    department_id: approverEmp?.department_id || null,
    department_name: approverEmp?.departments?.department_name || '',
    role_type: approverEmp?.role || 'L1',
    condition: condition,
    start_date: startDate,
    end_date: endDate,
    note: note,
    is_active: true
  };

  Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    await window.AutoDelegationService.setDelegationRule(rule);
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: `มอบหมายให้ ${rule.delegate_name} รักษาการแทน ${rule.approver_name} เรียบร้อยแล้ว`,
      icon: 'success',
      timer: 2000,
      showConfirmButton: false
    });

    // Reset Form
    if (document.getElementById("delNoteInput")) document.getElementById("delNoteInput").value = "";
    
    // Refresh tables
    currentDelegationRules = await window.AutoDelegationService.getDelegationRules();
    renderSavedDelegationRules();
    await refreshActiveDelegationsList();

  } catch (err) {
    console.error("Save delegation rule error:", err);
    Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกได้', 'error');
  }
};

/**
 * แสดงตารางผู้รักษาการแทนที่ตั้งค่าไว้ (Configured Rules Table)
 */
function renderSavedDelegationRules() {
  const container = document.getElementById("savedDelegationRulesContainer");
  if (!container) return;

  if (!currentDelegationRules || currentDelegationRules.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #64748b; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; font-size: 13.5px;">
        <span class="material-symbols-outlined" style="font-size: 36px; color: #94a3b8; display: block; margin-bottom: 6px;">manage_accounts</span>
        ยังไม่มีการตั้งค่าผู้รักษาการแทนเฉพาะบุคคล (ระบบจะใช้สิทธิ์ Fallback ส่งเรื่องให้ L2/HR อัตโนมัติเมื่อหัวหน้าลาพักร้อน)
      </div>
    `;
    return;
  }

  let html = `
    <div style="overflow-x: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13.5px; text-align: left;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0; color: #334155; font-weight: 700;">
            <th style="padding: 12px 16px;">ผู้อนุมัติหลัก (Primary)</th>
            <th style="padding: 12px 16px;">ผู้รักษาการแทน (Delegate)</th>
            <th style="padding: 12px 16px;">เงื่อนไขการโอนสิทธิ์</th>
            <th style="padding: 12px 16px;">หมายเหตุ</th>
            <th style="padding: 12px 16px; text-align: center;">จัดการ</th>
          </tr>
        </thead>
        <tbody>
  `;

  currentDelegationRules.forEach(r => {
    let condBadge = '<span class="status-badge" style="background:#e0f2fe; color:#0369a1; font-size:11.5px;">🌴 อัตโนมัติเมื่อลาพักร้อน</span>';
    if (r.condition === 'always') {
      condBadge = '<span class="status-badge" style="background:#fef3c7; color:#b45309; font-size:11.5px;">🔄 โอนสิทธิ์ถาวร</span>';
    } else if (r.condition === 'custom_date') {
      condBadge = `<span class="status-badge" style="background:#f3e8ff; color:#7e22ce; font-size:11.5px;">📅 ${r.start_date || '-'} ถึง ${r.end_date || '-'}</span>`;
    }

    html += `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 12px 16px;">
          <div style="font-weight: 700; color: #1e293b;">${r.approver_name}</div>
          <div style="font-size: 11.5px; color: #64748b;">${r.department_name ? `แผนก ${r.department_name}` : ''}</div>
        </td>
        <td style="padding: 12px 16px;">
          <div style="font-weight: 700; color: #0284c7; display: flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="font-size: 16px;">verified</span>
            ${r.delegate_name}
          </div>
        </td>
        <td style="padding: 12px 16px;">${condBadge}</td>
        <td style="padding: 12px 16px; color: #64748b; font-size: 12.5px;">${r.note || '-'}</td>
        <td style="padding: 12px 16px; text-align: center;">
          <button type="button" onclick="deleteDelegationRuleHandler('${r.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: background 0.2s;" title="ลบกฎนี้">
            <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
          </button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

/**
 * ลบกฎการโอนสิทธิ์
 */
window.deleteDelegationRuleHandler = async function(ruleId) {
  const result = await Swal.fire({
    title: 'ยืนยันการลบ?',
    text: 'คุณต้องการยกเลิกการตั้งค่าผู้รักษาการแทนสำหรับรายการนี้หรือไม่?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ลบรายการ',
    cancelButtonText: 'ยกเลิก'
  });

  if (result.isConfirmed) {
    await window.AutoDelegationService.deleteDelegationRule(ruleId);
    currentDelegationRules = await window.AutoDelegationService.getDelegationRules();
    renderSavedDelegationRules();
    await refreshActiveDelegationsList();
    Swal.fire('ลบเรียบร้อย', 'ยกเลิกการตั้งค่าผู้แทนแล้ว', 'success');
  }
};

/**
 * ตรวจสอบและแสดงรายชื่อหัวหน้าที่ลาพักร้อนวันนี้ & ผู้แทนสด
 */
window.refreshActiveDelegationsList = async function() {
  const container = document.getElementById("activeDelegationsListContainer");
  if (!container || !window.AutoDelegationService) return;

  container.innerHTML = `
    <div style="padding: 16px; text-align: center; color: #64748b; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; font-size: 13px;">
      <span class="material-symbols-outlined spin" style="font-size: 20px; vertical-align: middle; margin-right: 6px;">sync</span>
      กำลังตรวจสอบข้อมูลการลาพักร้อนสด...
    </div>
  `;

  try {
    const activeList = await window.AutoDelegationService.getActiveDelegationsSummary();

    if (!activeList || activeList.length === 0) {
      container.innerHTML = `
        <div style="padding: 16px 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; display: flex; align-items: center; gap: 12px;">
          <span class="material-symbols-outlined" style="color: #16a34a; font-size: 24px;">check_circle</span>
          <div>
            <div style="font-weight: 700; color: #15803d; font-size: 13.5px;">ไม่มีหัวหน้างานลาพักร้อนในวันนี้</div>
            <div style="font-size: 12px; color: #166534;">ผู้อนุมัติหลักทุกคนพร้อมปฏิบัติหน้าที่ตามกรอบเวลา SLA 48 ชั่วโมง</div>
          </div>
        </div>
      `;
      return;
    }

    let html = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
    `;

    activeList.forEach(item => {
      html += `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="material-symbols-outlined" style="color: #d97706; font-size: 28px;">beach_access</span>
            <div>
              <div style="font-weight: 700; color: #92400e; font-size: 14px;">
                ${item.approverName} <span style="font-size: 12px; font-weight: 400; color: #78350f;">(${item.position} - แผนก ${item.department})</span>
              </div>
              <div style="font-size: 12px; color: #b45309; margin-top: 2px;">
                🌴 ${item.leaveType} (${item.startDate} ถึง ${item.endDate})
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="text-align: right;">
              <span style="font-size: 11px; color: #92400e; font-weight: 600; display: block;">โอนสิทธิ์การอนุมัติให้:</span>
              <strong style="color: #0284c7; font-size: 13.5px; display: flex; align-items: center; gap: 4px; justify-content: flex-end;">
                <span class="material-symbols-outlined" style="font-size: 16px;">swap_calls</span>
                ${item.delegateName}
              </strong>
            </div>
            <span class="line-badge line-ok" style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; font-size: 11px; padding: 4px 8px;">
              รักษาการแทนสด
            </span>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

  } catch (err) {
    console.warn("refreshActiveDelegationsList error:", err);
    container.innerHTML = `
      <div style="padding: 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; color: #991b1b; font-size: 13px;">
        เกิดข้อผิดพลาดในการตรวจสอบสถานะ: ${err.message}
      </div>
    `;
  }
};

