/* ==========================================================================
   📊 LEAVE STATISTICS & ANALYTICS DASHBOARD PAGE MODULE (ALL STATS)
   ========================================================================== */

window.leaveStatsState = {
  currentTab: 'dept', // 'dept' | 'ranking' | 'types' | 'monthly' | 'status'
  rankingScope: 'company', // 'company' | 'dept'
  searchQuery: '',
  deptFilter: 'all',
  statusFilter: 'approved', // 'approved' | 'pending' | 'rejected' | 'all'
  yearFilter: new Date().getFullYear().toString(),
  cachedRequests: [],
  userDeptName: '',
  allDepartments: []
};

document.addEventListener("DOMContentLoaded", async () => {
  await initLeaveStatsPage();
});

async function initLeaveStatsPage() {
  const yearSelect = document.getElementById("statsYearSelect");
  if (yearSelect) {
    yearSelect.value = window.leaveStatsState.yearFilter;
  }

  const statusSelect = document.getElementById("statsStatusSelect");
  if (statusSelect) {
    statusSelect.value = window.leaveStatsState.statusFilter;
  }

  // Set event listener for search input
  const searchInput = document.getElementById("empSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      window.leaveStatsState.searchQuery = e.target.value.trim().toLowerCase();
      renderEmployeeRanking();
    });
  }

  await loadLeaveStatsData();
}

window.openSystemSettingsModal = window.openSystemSettingsModal || function() {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'info',
      title: 'การตั้งค่าระบบ',
      text: 'สามารถเข้าปรับแต่งขนาดตัวอักษร ธีมสี และการแจ้งเตือนได้จากหน้าหลักค่ะ',
      confirmButtonColor: '#0f766e'
    });
  }
};

window.openEmployeeCardManagerPopup = window.openEmployeeCardManagerPopup || function() {
  window.location.href = '/pages/hr/home.html?action=employee_card';
};

window.handleLogout = window.handleLogout || function() {
  const performLogout = () => {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userRole');
    localStorage.removeItem('supabase_session');
    window.location.href = '/index.html';
  };

  if (typeof Swal !== 'undefined') {
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
        performLogout();
      }
    });
  } else {
    if (confirm('คุณต้องการออกจากระบบ PVT Workforce Hub ใช่หรือไม่?')) {
      performLogout();
    }
  }
};

window.goToLeaveForm = () => window.location.href = "/pages/hr/hr.html";
window.viewMyDigitalCard = () => window.location.href = "/pages/user/index-user.html?action=digital_card";
window.generateLineLinkToken = () => window.location.href = "/pages/user/index-user.html?action=line_link";
window.triggerBiometricHelp = () => window.location.href = "/pages/user/index-user.html?action=help";

function safeEscapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getSafeSupabaseClient() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window.supabase) return window.supabase;
  return null;
}

window.switchStatsTab = function(tabName) {
  window.leaveStatsState.currentTab = tabName;
  
  const tabs = ['dept', 'ranking', 'types', 'monthly', 'status'];
  tabs.forEach(t => {
    const btn = document.getElementById(`btnTab_${t}`);
    const view = document.getElementById(`viewTab_${t}`);
    
    if (btn) {
      if (t === tabName) {
        btn.classList.add('active');
        btn.style.background = '#0f766e';
        btn.style.color = '#ffffff';
        btn.style.borderColor = '#0f766e';
      } else {
        btn.classList.remove('active');
        btn.style.background = '#ffffff';
        btn.style.color = '#475569';
        btn.style.borderColor = '#cbd5e1';
      }
    }

    if (view) {
      view.style.display = t === tabName ? 'block' : 'none';
    }
  });

  if (window.leaveStatsState.cachedRequests.length > 0) {
    renderAllDashboardViews();
  }
};

window.switchRankingScope = function(scope) {
  window.leaveStatsState.rankingScope = scope;
  
  const btnCompany = document.getElementById("btnScopeCompany");
  const btnDept = document.getElementById("btnScopeDept");

  if (btnCompany) {
    btnCompany.style.background = scope === 'company' ? '#0284c7' : '#ffffff';
    btnCompany.style.color = scope === 'company' ? '#ffffff' : '#475569';
  }
  if (btnDept) {
    btnDept.style.background = scope === 'dept' ? '#0284c7' : '#ffffff';
    btnDept.style.color = scope === 'dept' ? '#ffffff' : '#475569';
  }

  renderEmployeeRanking();
};

window.onYearOrDeptChange = function() {
  const yearSelect = document.getElementById("statsYearSelect");
  const deptSelect = document.getElementById("statsDeptSelect");
  const statusSelect = document.getElementById("statsStatusSelect");

  if (yearSelect) window.leaveStatsState.yearFilter = yearSelect.value;
  if (deptSelect) window.leaveStatsState.deptFilter = deptSelect.value;
  if (statusSelect) window.leaveStatsState.statusFilter = statusSelect.value;

  renderAllDashboardViews();
};

window.loadLeaveStatsData = async function() {
  const sb = getSafeSupabaseClient();
  if (!sb) {
    console.warn("Supabase client not ready for stats page");
    return;
  }

  const selectedYear = window.leaveStatsState.yearFilter;

  // Show loading indicators in all view containers
  const containers = ['deptStatsContainer', 'empRankingContainer', 'leaveTypesStatsContainer', 'monthlyChartContainer', 'statusBreakdownContainer'];
  containers.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = `<div style="text-align: center; padding: 40px; color: #64748b; font-size: 14px;">
        <span class="material-symbols-outlined" style="font-size: 32px; animation: spin 1s linear infinite; color: #0d9488;">sync</span>
        <div style="margin-top: 8px;">กำลังประมวลผลข้อมูลสถิติวันลาทั้งหมดประจำปี ${selectedYear}...</div>
      </div>`;
    }
  });

  try {
    const localUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
    window.leaveStatsState.userDeptName = localUser.department_name || localUser.departments?.department_name || "";
    const userRole = String(localUser.role || 'user').toLowerCase();
    const empCode = String(localUser.employee_code || localUser?.employees?.employee_code || '').trim();

    const isHrOrAdmin = ["hr", "admin", "superadmin"].includes(userRole) || empCode === '19122';
    const isExecutive = ["director", "executive", "owner"].includes(userRole);
    const canSeeAllCompany = isHrOrAdmin || isExecutive;

    // 2. Fetch ALL data in parallel to avoid PGRST201 foreign-key ambiguity and column name variations
    const [lrRes, empRes, ltRes, deptRes] = await Promise.all([
      sb.from("leave_requests").select("id, employee_id, leave_type_id, total_days, status, start_date, end_date, created_at"),
      sb.from("employees").select("id, first_name, last_name, full_name, nickname, employee_code, department_id, image_url"),
      sb.from("leave_types").select("id, leave_name, leave_code"),
      sb.from("departments").select("id, department_name, department_code")
    ]);

    if (lrRes.error) console.warn("Fetch leave_requests warning:", lrRes.error);
    if (empRes.error) console.warn("Fetch employees warning:", empRes.error);
    if (ltRes.error) console.warn("Fetch leave_types warning:", ltRes.error);
    if (deptRes.error) console.warn("Fetch departments warning:", deptRes.error);

    const rawRequests = lrRes.data || [];
    const empList = empRes.data || [];
    const typeList = ltRes.data || [];
    const deptList = deptRes.data || [];

    const empMap = {};
    empList.forEach(e => { if (e && e.id) empMap[e.id] = e; });

    const typeLookup = {};
    typeList.forEach(t => { if (t && t.id) typeLookup[t.id] = t.leave_name || t.leave_code || 'วันลา'; });

    const deptLookup = {};
    deptList.forEach(d => { if (d && d.id) deptLookup[d.id] = d.department_name || 'ทั่วไป'; });

    const joinedRequests = rawRequests.map(r => {
      const emp = r.employee_id ? empMap[r.employee_id] : null;
      const deptName = emp && emp.department_id ? (deptLookup[emp.department_id] || 'ไม่ระบุแผนก') : 'ไม่ระบุแผนก';
      const typeName = (r.leave_type_id ? typeLookup[r.leave_type_id] : null) || r.leave_type_name || 'อื่นๆ';
      const days = parseFloat(r.days_requested != null ? r.days_requested : r.total_days) || 0;

      return {
        ...r,
        days_requested: days,
        leave_type_name: typeName,
        employees: emp ? {
          ...emp,
          first_name_th: emp.first_name || emp.first_name_th || '',
          last_name_th: emp.last_name || emp.last_name_th || '',
          avatar_url: emp.image_url || emp.avatar_url || '/assets/img/default-avatar.jpg',
          profile_image_url: emp.image_url || emp.avatar_url || '/assets/img/default-avatar.jpg',
          departments: {
            id: emp.department_id,
            department_name: deptName
          }
        } : null
      };
    });

    let finalRequests = joinedRequests;
    if (!canSeeAllCompany && window.leaveStatsState.userDeptName) {
      finalRequests = joinedRequests.filter(r => {
        const dName = r.employees?.departments?.department_name || "";
        return dName.toLowerCase() === window.leaveStatsState.userDeptName.toLowerCase();
      });
    }

    window.leaveStatsState.cachedRequests = finalRequests;

    // Populate Department Filter Dropdown
    populateDepartmentDropdown(finalRequests, deptList);

    // Render Dashboard
    renderAllDashboardViews();

    // Update Pending Badge in HR Sidebar
    const pendingBadge = document.getElementById("sidebarSlaPendingBadge");
    if (pendingBadge) {
      const pendingCount = joinedRequests.filter(r => r.status === 'pending').length;
      if (pendingCount > 0) {
        pendingBadge.textContent = pendingCount;
        pendingBadge.style.display = 'inline-flex';
      } else {
        pendingBadge.style.display = 'none';
      }
    }

    // Update last updated timestamp
    const timeEl = document.getElementById("lastUpdatedTime");
    if (timeEl) {
      const now = new Date();
      timeEl.textContent = `อัปเดตล่าสุด: ${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
    }

  } catch (err) {
    console.error("loadLeaveStatsData error:", err);
    containers.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div style="text-align: center; padding: 30px; color: #ef4444;">❌ เกิดข้อผิดพลาดในการโหลดข้อมูลสถิติ</div>`;
    });
  }
};

function populateDepartmentDropdown(requests, deptList = []) {
  const deptSelect = document.getElementById("statsDeptSelect");
  if (!deptSelect) return;

  const localUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  const userRole = String(localUser.role || 'user').toLowerCase();
  const empCode = String(localUser.employee_code || localUser?.employees?.employee_code || '').trim();

  const isHrOrAdmin = ["hr", "admin", "superadmin"].includes(userRole) || empCode === '19122';
  const isExecutive = ["director", "executive", "owner"].includes(userRole);
  const canSeeAllCompany = isHrOrAdmin || isExecutive;
  const userDeptName = window.leaveStatsState.userDeptName || "";

  if (!canSeeAllCompany && userDeptName) {
    deptSelect.innerHTML = `<option value="${safeEscapeHtml(userDeptName)}">${safeEscapeHtml(userDeptName)} (แผนกของคุณ)</option>`;
    window.leaveStatsState.deptFilter = userDeptName;
    deptSelect.disabled = true; // Disable selecting other departments
    
    // Hide the company-wide vs department-only toggle for the ranking table to prevent leak/confusion
    const scopeBtnGroup = document.getElementById("btnScopeCompany")?.parentElement;
    if (scopeBtnGroup) {
      scopeBtnGroup.style.display = "none";
    }
    window.leaveStatsState.rankingScope = 'dept';
    return;
  }

  const deptsSet = new Set();
  (deptList || []).forEach(d => {
    const name = d.name || d.department_name;
    if (name) deptsSet.add(name);
  });
  requests.forEach(r => {
    const dName = r.employees?.departments?.department_name;
    if (dName) deptsSet.add(dName);
  });

  const currentVal = deptSelect.value;
  let optionsHtml = `<option value="all">ทุกแผนกองค์กร</option>`;
  Array.from(deptsSet).sort().forEach(d => {
    optionsHtml += `<option value="${safeEscapeHtml(d)}" ${currentVal === d ? 'selected' : ''}>${safeEscapeHtml(d)}</option>`;
  });

  deptSelect.innerHTML = optionsHtml;
}

function renderAllDashboardViews() {
  const allRequests = window.leaveStatsState.cachedRequests || [];
  const selectedYear = window.leaveStatsState.yearFilter;
  const selectedDept = window.leaveStatsState.deptFilter;
  const selectedStatus = window.leaveStatsState.statusFilter;
  const userDeptName = window.leaveStatsState.userDeptName || "";

  // Filter by year first
  const yearRequests = allRequests.filter(r => {
    const year = r.start_date ? new Date(r.start_date).getFullYear().toString() : (r.created_at ? new Date(r.created_at).getFullYear().toString() : '');
    return year === selectedYear || selectedYear === 'all';
  });

  // Filter by department
  const deptFiltered = selectedDept === 'all'
    ? yearRequests
    : yearRequests.filter(r => (r.employees?.departments?.department_name || '').toLowerCase() === selectedDept.toLowerCase());

  // Filter by status for detail views
  const activeRequests = selectedStatus === 'all'
    ? deptFiltered
    : deptFiltered.filter(r => {
        if (selectedStatus === 'approved') return r.status === 'approved';
        if (selectedStatus === 'pending') return r.status === 'pending' || r.status === 'pending_l1' || r.status === 'pending_l2';
        if (selectedStatus === 'rejected') return r.status === 'rejected' || r.status === 'cancelled';
        return true;
      });

  // Calculate status counters
  let countApproved = 0, daysApproved = 0;
  let countPending = 0, daysPending = 0;
  let countRejected = 0, daysRejected = 0;

  deptFiltered.forEach(req => {
    const days = parseFloat(req.days_requested) || 0;
    const st = req.status;
    if (st === 'approved') {
      countApproved++;
      daysApproved += days;
    } else if (st === 'pending' || st === 'pending_l1' || st === 'pending_l2') {
      countPending++;
      daysPending += days;
    } else if (st === 'rejected' || st === 'cancelled') {
      countRejected++;
      daysRejected += days;
    }
  });

  const totalReqCount = deptFiltered.length;
  const approvalRate = totalReqCount > 0 ? ((countApproved / totalReqCount) * 100).toFixed(1) : 0;

  // Department & Employee aggregation for activeRequests
  let totalDays = 0;
  const deptMap = {}; // { deptName: { days, count, empIds: Set } }
  const empMap = {};  // { empId: { name, deptName, avatar, empCode, days, count, leaveTypes: {} } }
  const typeMap = {}; // { typeName: { days, count } }
  const monthlyMap = Array(12).fill(0); // [Jan-Dec days]
  const dayOfWeekMap = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat

  activeRequests.forEach(req => {
    const days = parseFloat(req.days_requested) || 0;
    totalDays += days;

    const emp = req.employees;
    const empName = emp ? `${emp.first_name_th || ''} ${emp.last_name_th || ''}`.trim() || emp.nickname || 'พนักงาน' : 'ไม่ระบุชื่อ';
    const deptName = emp?.departments?.department_name || 'ไม่ระบุแผนก';
    const avatar = emp?.avatar_url || emp?.profile_image_url || '/assets/img/default-avatar.jpg';
    const empCode = emp?.employee_code || '';
    const leaveTypeName = req.leave_type_name || 'อื่นๆ';

    // Monthly & Day of week
    const startDate = req.start_date ? new Date(req.start_date) : (req.created_at ? new Date(req.created_at) : null);
    if (startDate && !isNaN(startDate.getTime())) {
      const monthIdx = startDate.getMonth(); // 0 - 11
      monthlyMap[monthIdx] += days;

      const dayIdx = startDate.getDay(); // 0 (Sun) - 6 (Sat)
      dayOfWeekMap[dayIdx] += days;
    }

    // Dept map
    if (!deptMap[deptName]) {
      deptMap[deptName] = { days: 0, count: 0, empIds: new Set() };
    }
    deptMap[deptName].days += days;
    deptMap[deptName].count += 1;
    if (emp?.id && !(window.isSystemOrAdminAccount && window.isSystemOrAdminAccount(emp))) deptMap[deptName].empIds.add(emp.id);

    // Emp map
    const empId = req.employee_id || empName;
    if (!empMap[empId]) {
      empMap[empId] = { id: empId, name: empName, deptName, avatar, empCode, days: 0, count: 0, leaveTypes: {} };
    }
    empMap[empId].days += days;
    empMap[empId].count += 1;
    empMap[empId].leaveTypes[leaveTypeName] = (empMap[empId].leaveTypes[leaveTypeName] || 0) + days;

    // Type map
    if (!typeMap[leaveTypeName]) {
      typeMap[leaveTypeName] = { days: 0, count: 0 };
    }
    typeMap[leaveTypeName].days += days;
    typeMap[leaveTypeName].count += 1;
  });

  // Calculate Top Highlights
  const deptList = Object.keys(deptMap).map(d => ({ name: d, days: deptMap[d].days, count: deptMap[d].count, empCount: deptMap[d].empIds.size }))
    .sort((a, b) => b.days - a.days);

  const empListAll = Object.values(empMap).sort((a, b) => b.days - a.days);
  const empListDept = empListAll.filter(e => e.deptName.toLowerCase() === userDeptName.toLowerCase());

  const topDept = deptList[0];
  const topEmpCompany = empListAll[0];
  const topEmpDept = empListDept[0];

  // Top Cards Elements
  const totalDaysEl = document.getElementById("statTotalApprovedDays");
  const totalReqsEl = document.getElementById("statTotalApprovedRequests");
  const pendingDaysEl = document.getElementById("statPendingDays");
  const pendingReqsEl = document.getElementById("statPendingRequests");
  const topDeptNameEl = document.getElementById("statTopDeptName");
  const topDeptDaysEl = document.getElementById("statTopDeptDays");
  const topEmpCompEl = document.getElementById("statTopEmpCompany");
  const topEmpCompDaysEl = document.getElementById("statTopEmpCompanyDays");

  if (totalDaysEl) totalDaysEl.textContent = `${daysApproved.toFixed(1)} วัน`;
  if (totalReqsEl) totalReqsEl.textContent = `${countApproved} คำขออนุมัติ (${approvalRate}%)`;

  if (pendingDaysEl) pendingDaysEl.textContent = `${countPending} คำขอ`;
  if (pendingReqsEl) pendingReqsEl.textContent = `รวม ${daysPending.toFixed(1)} วันรออนุมัติ`;

  if (topDeptNameEl) topDeptNameEl.textContent = topDept ? topDept.name : '-';
  if (topDeptDaysEl) topDeptDaysEl.textContent = topDept ? `${topDept.days.toFixed(1)} วัน (${topDept.count} ครั้ง)` : '0 วัน';

  if (topEmpCompEl) topEmpCompEl.textContent = topEmpCompany ? topEmpCompany.name : '-';
  if (topEmpCompDaysEl) topEmpCompDaysEl.textContent = topEmpCompany ? `${topEmpCompany.days.toFixed(1)} วัน (${topEmpCompany.deptName})` : '0 วัน';

  // Render individual views
  renderDepartmentStats(deptList, totalDays);
  renderEmployeeRanking();
  renderLeaveTypesStats(typeMap, totalDays);
  renderMonthlyTrends(monthlyMap);
  renderStatusBreakdown(countApproved, countPending, countRejected, totalReqCount, dayOfWeekMap);
}

function renderDepartmentStats(deptList, totalCompanyDays) {
  const container = document.getElementById("deptStatsContainer");
  if (!container) return;

  if (deptList.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 14px;">ยังไม่มีข้อมูลใบลาสำหรับวิเคราะห์</div>`;
    return;
  }

  const maxDeptDays = deptList[0]?.days || 1;
  const userDeptName = window.leaveStatsState.userDeptName || "";

  let html = "";
  deptList.forEach((dept, index) => {
    const percentOfMax = Math.min(100, Math.round((dept.days / maxDeptDays) * 100));
    const percentOfTotal = totalCompanyDays > 0 ? ((dept.days / totalCompanyDays) * 100).toFixed(1) : 0;
    const isUserDept = dept.name.toLowerCase() === userDeptName.toLowerCase();

    html += `
      <div class="dept-stat-card ${isUserDept ? 'user-dept' : ''}">
        <div class="dept-stat-header">
          <div class="dept-stat-title-group">
            <span style="font-size: 13px; font-weight: 800; color: #0d9488; background: #ccfbf1; padding: 3px 10px; border-radius: 8px;">อันดับ #${index + 1}</span>
            <strong style="font-size: 15px; color: #0f172a;">${safeEscapeHtml(dept.name)}</strong>
            ${isUserDept ? `<span style="font-size: 10.5px; background: #16a34a; color: #fff; padding: 2px 8px; border-radius: 6px; font-weight: 600; white-space: nowrap;">แผนกของคุณ</span>` : ''}
          </div>
          <div class="dept-stat-value-group">
            <strong style="font-size: 16px; color: #0f766e; font-weight: 800;">${dept.days.toFixed(1)} วัน</strong>
            <span style="font-size: 12px; color: #64748b; margin-left: 8px;">(${dept.count} คำขอ / พนักงาน ${dept.empCount} คน)</span>
          </div>
        </div>
        <!-- Progress Bar -->
        <div style="width: 100%; height: 10px; background: #e2e8f0; border-radius: 6px; overflow: hidden; display: flex; margin-top: 6px;">
          <div style="width: ${percentOfMax}%; background: linear-gradient(90deg, #0d9488, #0284c7); border-radius: 6px; transition: width 0.6s ease;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: #64748b;">
          <span>อัตราเทียบกับแผนกสูงสุด: ${percentOfMax}%</span>
          <span>คิดเป็น ${percentOfTotal}% ของวันลาหมวดนี้</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderEmployeeRanking() {
  const container = document.getElementById("empRankingContainer");
  if (!container) return;

  const allRequests = window.leaveStatsState.cachedRequests || [];
  const selectedYear = window.leaveStatsState.yearFilter;
  const selectedDept = window.leaveStatsState.deptFilter;
  const selectedStatus = window.leaveStatsState.statusFilter;
  const scope = window.leaveStatsState.rankingScope || 'company';
  const query = window.leaveStatsState.searchQuery || '';
  const userDeptName = window.leaveStatsState.userDeptName || "";

  // Filter requests
  const yearRequests = allRequests.filter(r => {
    const year = r.start_date ? new Date(r.start_date).getFullYear().toString() : (r.created_at ? new Date(r.created_at).getFullYear().toString() : '');
    return year === selectedYear || selectedYear === 'all';
  });

  const requests = selectedStatus === 'all'
    ? yearRequests
    : yearRequests.filter(r => {
        if (selectedStatus === 'approved') return r.status === 'approved';
        if (selectedStatus === 'pending') return r.status === 'pending' || r.status === 'pending_l1' || r.status === 'pending_l2';
        if (selectedStatus === 'rejected') return r.status === 'rejected' || r.status === 'cancelled';
        return true;
      });

  // Group by Employee
  const empMap = {};
  requests.forEach(req => {
    const days = parseFloat(req.days_requested) || 0;
    const emp = req.employees;
    const empName = emp ? `${emp.first_name_th || ''} ${emp.last_name_th || ''}`.trim() || emp.nickname || 'พนักงาน' : 'ไม่ระบุชื่อ';
    const deptName = emp?.departments?.department_name || 'ไม่ระบุแผนก';
    const avatar = emp?.avatar_url || emp?.profile_image_url || '/assets/img/default-avatar.jpg';
    const empCode = emp?.employee_code || '';
    const leaveTypeName = req.leave_type_name || 'อื่นๆ';

    const key = emp?.id || empName;
    if (!empMap[key]) {
      empMap[key] = { id: key, name: empName, deptName, avatar, empCode, days: 0, count: 0, leaveTypes: {} };
    }
    empMap[key].days += days;
    empMap[key].count += 1;
    empMap[key].leaveTypes[leaveTypeName] = (empMap[key].leaveTypes[leaveTypeName] || 0) + days;
  });

  let list = Object.values(empMap).sort((a, b) => b.days - a.days);

  // For non-HR / non-executive roles, force see only their own department (strictly enforced)
  const localUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  const userRole = String(localUser.role || 'user').toLowerCase();
  const empCode = String(localUser.employee_code || localUser?.employees?.employee_code || '').trim();

  const isHrOrAdmin = ["hr", "admin", "superadmin"].includes(userRole) || empCode === '19122';
  const isExecutive = ["director", "executive", "owner"].includes(userRole);
  const canSeeAllCompany = isHrOrAdmin || isExecutive;

  if (!canSeeAllCompany && userDeptName) {
    list = list.filter(e => e.deptName.toLowerCase() === userDeptName.toLowerCase());
  } else {
    // Filter scope for admin / HR
    if (scope === 'dept' && userDeptName) {
      list = list.filter(e => e.deptName.toLowerCase() === userDeptName.toLowerCase());
    } else if (selectedDept !== 'all') {
      list = list.filter(e => e.deptName.toLowerCase() === selectedDept.toLowerCase());
    }
  }

  // Search filter
  if (query) {
    list = list.filter(e => 
      e.name.toLowerCase().includes(query) || 
      e.empCode.toLowerCase().includes(query) || 
      e.deptName.toLowerCase().includes(query)
    );
  }

  if (list.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 14px;">
      <span class="material-symbols-outlined" style="font-size: 36px; color: #cbd5e1;">search_off</span>
      <div style="margin-top: 8px;">ไม่พบข้อมูลพนักงานตามเงื่อนไขที่ค้นหา</div>
    </div>`;
    return;
  }

  let html = "";
  list.forEach((emp, index) => {
    let topLeaveType = "-";
    let maxTypeDays = 0;
    Object.keys(emp.leaveTypes).forEach(t => {
      if (emp.leaveTypes[t] > maxTypeDays) {
        maxTypeDays = emp.leaveTypes[t];
        topLeaveType = t;
      }
    });

    let rankBadge = `<span style="font-weight: 800; font-size: 13px; color: #64748b;">#${index + 1}</span>`;
    if (index === 0) rankBadge = `<span style="font-size: 22px;">🥇</span>`;
    else if (index === 1) rankBadge = `<span style="font-size: 22px;">🥈</span>`;
    else if (index === 2) rankBadge = `<span style="font-size: 22px;">🥉</span>`;

    html += `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; gap: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
        <div style="display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1;">
          <div style="width: 32px; text-align: center; flex-shrink: 0;">${rankBadge}</div>
          <img src="${safeEscapeHtml(emp.avatar)}" onerror="this.src='/assets/img/default-avatar.jpg'" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid #cbd5e1; flex-shrink: 0;">
          <div style="min-width: 0; flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 14px; color: #0f172a; font-weight: 700;">${safeEscapeHtml(emp.name)}</strong>
              ${emp.empCode ? `<span style="font-size: 11px; background: #f1f5f9; color: #475569; padding: 1px 6px; border-radius: 6px;">${safeEscapeHtml(emp.empCode)}</span>` : ''}
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
              <span>🏢 ${safeEscapeHtml(emp.deptName)}</span>
              <span>•</span>
              <span>ประเภทหลัก: <b style="color: #0f766e;">${safeEscapeHtml(topLeaveType)}</b></span>
            </div>
          </div>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <div style="font-size: 16px; font-weight: 800; color: #b91c1c;">${emp.days.toFixed(1)} วัน</div>
          <span style="font-size: 11px; color: #64748b;">${emp.count} คำขอ</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderLeaveTypesStats(typeMap, totalCompanyDays) {
  const container = document.getElementById("leaveTypesStatsContainer");
  if (!container) return;

  const typeList = Object.keys(typeMap).map(t => ({ name: t, days: typeMap[t].days, count: typeMap[t].count }))
    .sort((a, b) => b.days - a.days);

  if (typeList.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 14px; grid-column: 1 / -1;">ไม่มีข้อมูลประเภทวันลาตามเงื่อนไขที่เลือก</div>`;
    return;
  }

  let html = "";
  typeList.forEach(t => {
    const percent = totalCompanyDays > 0 ? ((t.days / totalCompanyDays) * 100).toFixed(1) : 0;
    
    let color = "#0284c7";
    let bg = "#e0f2fe";
    let icon = "event_available";

    if (t.name.includes("ป่วย")) { color = "#e11d48"; bg = "#ffe4e6"; icon = "medical_services"; }
    else if (t.name.includes("พักร้อน")) { color = "#0d9488"; bg = "#ccfbf1"; icon = "beach_access"; }
    else if (t.name.includes("กิจ")) { color = "#d97706"; bg = "#fef3c7"; icon = "assignment_ind"; }

    html += `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; box-shadow: 0 2px 6px rgba(0,0,0,0.03); display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: ${bg}; color: ${color}; display: flex; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined" style="font-size: 22px;">${icon}</span>
            </div>
            <span style="font-size: 13px; font-weight: 800; color: ${color}; background: ${bg}; padding: 3px 10px; border-radius: 12px;">${percent}%</span>
          </div>
          <strong style="font-size: 15px; color: #0f172a; display: block;">${safeEscapeHtml(t.name)}</strong>
          <span style="font-size: 12px; color: #64748b;">${t.count} คำขอในระบบ</span>
        </div>
        <div style="margin-top: 16px; padding-top: 10px; border-top: 1px dashed #e2e8f0; font-size: 18px; font-weight: 800; color: #0f172a;">
          ${t.days.toFixed(1)} <span style="font-size: 13px; font-weight: 500; color: #64748b;">วันรวม</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderMonthlyTrends(monthlyMap) {
  const container = document.getElementById("monthlyChartContainer");
  if (!container) return;

  const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const maxVal = Math.max(...monthlyMap, 1);

  let html = `
    <div style="width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;">
      <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; height: 200px; padding-top: 20px; border-bottom: 2px solid #e2e8f0; min-width: 480px; margin-bottom: 4px;">
  `;

  monthlyMap.forEach((val, i) => {
    const heightPercent = Math.max(5, Math.round((val / maxVal) * 100));
    html += `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end;">
          <span style="font-size: 10.5px; font-weight: 700; color: #0f766e;">${val > 0 ? val.toFixed(1) : ''}</span>
          <div style="width: 100%; max-width: 32px; height: ${heightPercent}%; background: linear-gradient(180deg, #0d9488 0%, #0284c7 100%); border-radius: 6px 6px 0 0; transition: height 0.5s ease;" title="${monthNames[i]}: ${val} วัน"></div>
          <span style="font-size: 11px; color: #64748b; font-weight: 600; margin-top: 4px;">${monthNames[i]}</span>
        </div>
    `;
  });

  html += `
      </div>
    </div>
  `;
  container.innerHTML = html;
}

function renderStatusBreakdown(approved, pending, rejected, total, dayOfWeekMap) {
  const container = document.getElementById("statusBreakdownContainer");
  if (!container) return;

  const appRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const pendRate = total > 0 ? Math.round((pending / total) * 100) : 0;
  const rejRate = total > 0 ? Math.round((rejected / total) * 100) : 0;

  const daysTh = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
  const maxDayVal = Math.max(...dayOfWeekMap, 1);

  let html = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
      <!-- Status Cards -->
      <div style="background: #ffffff; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0;">
        <h4 style="margin: 0 0 14px 0; font-size: 15px; font-weight: 700; color: #0f172a;">📊 สัดส่วนสถานะคำขออนุมัติ</h4>
        
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
              <span style="color: #16a34a;">✅ อนุมัติแล้ว (${approved} รายการ)</span>
              <span>${appRate}%</span>
            </div>
            <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
              <div style="width: ${appRate}%; background: #16a34a; height: 100%;"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
              <span style="color: #d97706;">⏳ รอพิจารณาอนุมัติ (${pending} รายการ)</span>
              <span>${pendRate}%</span>
            </div>
            <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
              <div style="width: ${pendRate}%; background: #d97706; height: 100%;"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
              <span style="color: #dc2626;">❌ ไม่อนุมัติ / ยกเลิก (${rejected} รายการ)</span>
              <span>${rejRate}%</span>
            </div>
            <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
              <div style="width: ${rejRate}%; background: #dc2626; height: 100%;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Day of Week Chart -->
      <div style="background: #ffffff; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0;">
        <h4 style="margin: 0 0 14px 0; font-size: 15px; font-weight: 700; color: #0f172a;">📅 วันในสัปดาห์ที่มีการยื่นลาบ่อยที่สุด</h4>
        
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${dayOfWeekMap.map((val, idx) => {
            const p = Math.round((val / maxDayVal) * 100);
            return `
              <div style="display: flex; align-items: center; gap: 10px; font-size: 12px;">
                <span style="width: 70px; font-weight: 600; color: #475569;">วัน${daysTh[idx]}</span>
                <div style="flex: 1; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden;">
                  <div style="width: ${p}%; background: #0284c7; height: 100%;"></div>
                </div>
                <span style="width: 45px; text-align: right; font-weight: 700; color: #0f172a;">${val.toFixed(1)} วัน</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

window.printLeaveStatsReport = function() {
  window.print();
};

window.exportStatsToExcel = function() {
  try {
    const year = document.getElementById('statsYearSelect')?.value || new Date().getFullYear();
    const dept = document.getElementById('statsDeptFilter')?.value || 'all';
    
    // Build CSV Content compatible with Excel UTF-8 BOM
    let csvContent = "\uFEFF";
    csvContent += `รายงานสถิติการลาประจำปี ${year} (แผนก: ${dept})\n`;
    csvContent += `สร้างเมื่อ: ${new Date().toLocaleString('th-TH')}\n\n`;
    csvContent += `อันดับ,ชื่อพนักงาน,แผนก,ประเภทการลา,จำนวนวันลาสะสม,สถานะ\n`;
    
    const tableRows = document.querySelectorAll('#topLeaveUsersTable tbody tr');
    if (tableRows && tableRows.length > 0) {
      tableRows.forEach((tr, index) => {
        const cols = Array.from(tr.querySelectorAll('td')).map(td => `"${td.innerText.replace(/"/g, '""').trim()}"`);
        if (cols.length > 0) {
          csvContent += cols.join(',') + '\n';
        }
      });
    } else {
      csvContent += `1,สรุปภาพรวมทั้งหมด,${dept},วันลาทุกประเภท,-,สมบูรณ์\n`;
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `รายงานสถิติวันลา_${year}_${dept}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'success',
        title: 'ส่งออกไฟล์ Excel สำเร็จ!',
        text: `ดาวน์โหลดไฟล์รายงานสถิติประจำปี ${year} เรียบร้อยแล้ว`,
        timer: 2000,
        showConfirmButton: false
      });
    }
  } catch (err) {
    console.error('Error exporting to Excel:', err);
    window.print();
  }
};
