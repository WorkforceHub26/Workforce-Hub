/**
 * ==========================================================================
 * ⏱️ LEAVE SLA TRACKER COMPONENT (2-DAY APPROVAL POLICY TRACKER)
 * PVT WORKFORCE HUB
 * ==========================================================================
 * Visual real-time countdown component for tracking 'Pending Approval' leave requests
 * with the 48-Hour (2-Day) approval policy for Team Leaders (L1) & Managers (L2).
 */

(function(window) {
  'use strict';

  let slaTimerInterval = null;
  let cachedPendingRequests = [];
  let currentFilter = 'all'; // 'all' | 'urgent' | 'overdue' | 'normal'
  let currentSearch = '';
  let currentSort = 'urgent_first'; // 'urgent_first' | 'newest' | 'oldest'

  const SLA_TOTAL_HOURS = 48; // 2 วัน = 48 ชั่วโมง
  const SLA_TOTAL_MS = SLA_TOTAL_HOURS * 60 * 60 * 1000;

  /**
   * คำนวณสถานะ SLA และเวลาที่เหลือ
   */
  function calculateSlaDetails(req) {
    if (!req || !req.created_at) {
      return {
        isOverdue: false,
        isUrgent: false,
        isNormal: true,
        elapsedHours: 0,
        remainingHours: SLA_TOTAL_HOURS,
        remainingMs: SLA_TOTAL_MS,
        percentElapsed: 0,
        countdownText: "48 ชม.",
        statusType: "normal",
        badgeText: "ปกติ",
        stepText: "รอพิจารณา"
      };
    }

    const createdTime = new Date(req.created_at).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - createdTime);
    const elapsedHours = diffMs / (1000 * 60 * 60);
    const remainingMs = SLA_TOTAL_MS - diffMs;
    const remainingHours = remainingMs / (1000 * 60 * 60);

    const isOverdue = diffMs >= SLA_TOTAL_MS;
    const isUrgent = !isOverdue && remainingHours <= 12;
    const isNormal = !isOverdue && !isUrgent;

    const percentElapsed = Math.min(100, Math.max(0, (diffMs / SLA_TOTAL_MS) * 100));

    // คำนวณข้อความนับถอยหลัง
    let countdownText = "";
    if (isOverdue) {
      const overdueMs = Math.abs(remainingMs);
      const days = Math.floor(overdueMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((overdueMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((overdueMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((overdueMs % (1000 * 60)) / 1000);
      
      if (days > 0) {
        countdownText = `เกินกำหนด ${days} วัน ${hours} ชม. ${mins} นาที`;
      } else {
        countdownText = `เกินกำหนด ${hours} ชม. ${mins} นาที ${secs} วิ`;
      }
    } else {
      const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((remainingMs % (1000 * 60)) / 1000);

      if (days > 0) {
        countdownText = `เหลือ ${days} วัน ${hours} ชม. ${mins} นาที`;
      } else if (hours > 0) {
        countdownText = `เหลือ ${hours} ชม. ${mins} นาที ${secs} วิ`;
      } else {
        countdownText = `เหลือ ${mins} นาที ${secs} วิ`;
      }
    }

    let statusType = "normal";
    let badgeText = "ปกติ (> 24 ชม.)";
    if (isOverdue) {
      statusType = "overdue";
      badgeText = "⚠️ เกินกำหนดแล้ว";
    } else if (isUrgent) {
      statusType = "urgent";
      badgeText = "🔥 ด่วน (< 12 ชม.)";
    } else if (remainingHours <= 24) {
      statusType = "moderate";
      badgeText = "⏳ ปานกลาง (< 24 ชม.)";
    }

    // 🚦 ลำดับขั้นตอนการรออนุมัติ (คำนวณตามโครงสร้างสายการอนุมัติจริง)
    let steps = [];
    if (typeof window.getApprovalWorkflowSteps === 'function') {
      steps = window.getApprovalWorkflowSteps(req) || [];
    } else {
      const reqEmp = req.employees || {};
      const reqDeptId = req.department_id || reqEmp.department_id;
      const deptApprover = (typeof window.deptApproversMap !== 'undefined' && window.deptApproversMap[reqDeptId]) || null;
      const empRole = String(reqEmp.role || req.role || '').toLowerCase();
      const empPos = String(reqEmp.positions?.position_name || reqEmp.position_name || '').toLowerCase();
      const deptName = String(req.departments?.department_name || reqEmp.departments?.department_name || '').toLowerCase();

      const isApplicantLeader = (empRole === 'leader' || empRole.includes('leader') || empRole.includes('supervisor') || empPos.includes('หัวหน้า')) && !empPos.includes('หัวหน้ากะ') && !empPos.includes('หัวหน้าส่วน');
      const isApplicantManager = empRole === 'manager' || empRole.includes('manager') || empPos.includes('ผู้จัดการ') || empPos.includes('ผจก');
      const isApplicantExecutive = empRole === 'director' || empRole === 'executive' || empRole === 'owner' || empPos.includes('ผู้บริหาร') || empPos.includes('ผู้อำนวยการ');
      const isHrDept = deptName.includes('บุคคล') || deptName.includes('hr') || deptName.includes('ธุรการ') || deptName.includes('ทรัพยากรบุคคล') || empRole === 'hr';

      let hasL1 = false;
      if (!isHrDept && !isApplicantLeader && !isApplicantManager && !isApplicantExecutive) {
        if (reqEmp.l1_approver_id) {
          hasL1 = true;
        } else {
          hasL1 = Boolean(deptApprover && deptApprover.hasLeader && deptApprover.supervisor_id);
        }
      }

      let hasL2 = false;
      if (!isApplicantManager && !isApplicantExecutive) {
        if (isHrDept) {
          hasL2 = true;
        } else if (reqEmp.l2_approver_id) {
          hasL2 = true;
        } else {
          hasL2 = Boolean(deptApprover && (deptApprover.hasManager || deptApprover.manager_id));
        }
      }

      let hasExecutive = false;
      if (reqEmp.l3_approver_id) {
        hasExecutive = true;
      } else if (isApplicantManager) {
        hasExecutive = true;
      } else if (isApplicantLeader && !hasL2) {
        hasExecutive = true;
      }

      if (hasL1) {
        steps.push({ role: 'leader', shortName: 'หัวหน้าแผนก (L1)', status: req.manager_status || 'pending' });
      }
      if (hasL2) {
        steps.push({ role: 'manager', shortName: 'ผู้จัดการฝ่าย (L2)', status: req.director_status || 'pending' });
      }
      if (hasExecutive) {
        steps.push({ role: 'executive', shortName: 'ผู้บริหาร (L3)', status: req.executive_status || 'pending' });
      }
    }

    let stepText = "รอพิจารณา";
    let stageClass = "waiting-l1";
    let stageIcon = "pending_actions";

    if (steps && steps.length > 0) {
      const pendingStep = steps.find(s => s.status === 'pending' || s.status === 'waiting');
      if (pendingStep) {
        if (pendingStep.role === 'leader') {
          stepText = "1. รอหัวหน้าแผนก (L1)";
          stageClass = "waiting-l1";
          stageIcon = "supervisor_account";
        } else if (pendingStep.role === 'manager') {
          stepText = steps.some(s => s.role === 'leader') ? "2. รอผู้จัดการฝ่าย (L2)" : "รอผู้จัดการฝ่าย (L2)";
          stageClass = "waiting-l2";
          stageIcon = "manage_accounts";
        } else if (pendingStep.role === 'executive') {
          stepText = "รอผู้บริหารพิจารณา (L3)";
          stageClass = "waiting-l3";
          stageIcon = "verified_user";
        } else {
          stepText = `รอ${pendingStep.shortName || pendingStep.role}`;
          stageClass = "waiting-l2";
          stageIcon = "manage_accounts";
        }
      } else {
        const st = String(req.status || '').toLowerCase();
        if (st === 'approved') {
          stepText = "อนุมัติครบสมบูรณ์";
          stageClass = "approved";
          stageIcon = "check_circle";
        } else if (st === 'rejected') {
          stepText = "ไม่อนุมัติ";
          stageClass = "rejected";
          stageIcon = "cancel";
        } else {
          stepText = "ผ่านการอนุมัติสายงานแล้ว";
          stageClass = "approved";
          stageIcon = "check_circle";
        }
      }
    } else {
      // กรณีไม่มีขั้นตอนระบุไว้ชัดเจน ให้ตรวจสอบจากฟิลด์สถานะโดยตรง
      if (req.director_status === 'pending') {
        stepText = "รอผู้จัดการฝ่าย (L2)";
        stageClass = "waiting-l2";
        stageIcon = "manage_accounts";
      } else if (req.manager_status === 'pending') {
        stepText = "รอหัวหน้าแผนก (L1)";
        stageClass = "waiting-l1";
        stageIcon = "supervisor_account";
      } else if (req.executive_status === 'pending') {
        stepText = "รอผู้บริหารพิจารณา (L3)";
        stageClass = "waiting-l3";
        stageIcon = "verified_user";
      } else {
        stepText = "รอตรวจสอบคำขอ";
        stageClass = "waiting-l1";
        stageIcon = "pending_actions";
      }
    }

    return {
      isOverdue,
      isUrgent,
      isNormal,
      elapsedHours: Math.round(elapsedHours * 10) / 10,
      remainingHours: Math.round(remainingHours * 10) / 10,
      remainingMs,
      percentElapsed,
      countdownText,
      statusType,
      badgeText,
      stepText,
      stageClass,
      stageIcon
    };
  }

  /**
   * แยกและสกัดข้อมูลพนักงานอย่างครอบคลุมทุกโครงสร้างข้อมูล
   */
  function extractEmployeeInfo(req) {
    if (!req) {
      return {
        name: 'ไม่ทราบชื่อ',
        code: '-',
        dept: 'ทั่วไป',
        position: '',
        nickname: '',
        avatar: '/assets/img/default-avatar.jpg'
      };
    }

    const emp = req.employees || {};
    const usr = req.users || {};
    const prof = req.profiles || {};

    const name = emp.full_name || emp.name || usr.name || usr.full_name || prof.name || prof.full_name || req.user_name || req.employee_name || req.full_name || req.name || (req.employee_code ? `รหัส ${req.employee_code}` : 'ไม่ทราบชื่อ');
    const nickname = emp.nickname || usr.nickname || prof.nickname || req.nickname || '';
    const code = emp.employee_code || usr.employee_code || prof.employee_code || req.employee_code || '-';
    
    let dept = 'ทั่วไป';
    if (emp.departments && emp.departments.department_name) {
      dept = emp.departments.department_name;
    } else if (emp.department_name) {
      dept = emp.department_name;
    } else if (req.departments && req.departments.department_name) {
      dept = req.departments.department_name;
    } else if (usr.department) {
      dept = usr.department;
    } else if (prof.department) {
      dept = prof.department;
    } else if (req.department) {
      dept = req.department;
    } else if (emp.positions && emp.positions.position_name) {
      dept = emp.positions.position_name;
    }

    const position = (emp.positions && emp.positions.position_name) || req.position_name || emp.position || '';

    let avatar = emp.image_url || usr.avatar_url || usr.image_url || prof.avatar_url || req.avatar_url || req.image_url || '';
    if (!avatar || avatar.trim() === '') {
      avatar = '/assets/img/default-avatar.jpg';
    } else if (typeof window.getAvatarUrl === 'function') {
      avatar = window.getAvatarUrl(avatar);
    }

    return {
      name,
      code,
      dept,
      position,
      nickname,
      avatar
    };
  }

  /**
   * แปลงชื่อประเภทการลา
   */
  function formatLeaveName(rawName) {
    if (!rawName) return "ลาทั่วไป";
    const map = {
      "ลาป่วย": "ลาป่วย",
      "sick": "ลาป่วย",
      "ลากิจ": "ลากิจ",
      "personal": "ลากิจ",
      "ลาพักร้อน": "ลาพักร้อน (Annual Leave)",
      "annual": "ลาพักร้อน",
      "ลาคลอด": "ลาคลอด",
      "maternity": "ลาคลอด",
      "ลาบวช": "ลาบวช / ลาปฏิบัติธรรม",
      "ordination": "ลาบวช"
    };
    return map[rawName] || rawName;
  }

  /**
   * วาด Component SLA Tracker
   */
  function renderLeaveSlaTracker(containerId = "leaveSlaTrackerContainer", requests = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (requests) {
      // กรองเฉพาะ pending requests ที่ยังคงรอการอนุมัติสำหรับระดับสิทธิ์ของผู้ใช้งานปัจจุบันเท่านั้น
      // (รายการที่ผู้ใช้งานท่านนี้ลงนามอนุมัติผ่านไปแล้ว จะถูกย้ายออกจากคิว SLA ค้างพิจารณา และไปอยู่ในหน้าประวัติแทน)
      cachedPendingRequests = requests.filter(r => {
        const st = String(r.status || '').toLowerCase();
        const isMainPending = (st === 'pending' || st === 'pending_l1' || st === 'pending_l2' || st === 'รออนุมัติ' || st.includes('pending') || st.includes('รออนุมัติ'));
        if (!isMainPending) return false;

        // ถ้ามีฟังก์ชันเช็กสิทธิ์ตามบทบาท ให้กรองรายการที่อนุมัติผ่านระดับนี้ไปแล้วออก
        if (typeof window.isPendingForRole === 'function') {
          const role = window.currentRole || localStorage.getItem("userRole") || 'hr';
          return window.isPendingForRole(r, role);
        }
        if (typeof window.isPendingForRoleHome === 'function') {
          const role = window.currentRole || localStorage.getItem("userRole") || 'hr';
          return window.isPendingForRoleHome(r, role);
        }

        return true;
      });
    }

    // คำนวณภาพรวมสถิติ
    let totalPending = cachedPendingRequests.length;
    let overdueCount = 0;
    let urgentCount = 0;
    let normalCount = 0;

    cachedPendingRequests.forEach(r => {
      const sla = calculateSlaDetails(r);
      if (sla.isOverdue) overdueCount++;
      else if (sla.isUrgent) urgentCount++;
      else normalCount++;
    });

    // กรองตามฟิลเตอร์
    let filteredList = cachedPendingRequests.filter(r => {
      const sla = calculateSlaDetails(r);
      if (currentFilter === 'overdue' && !sla.isOverdue) return false;
      if (currentFilter === 'urgent' && !sla.isUrgent) return false;
      if (currentFilter === 'normal' && (sla.isOverdue || sla.isUrgent)) return false;

      if (currentSearch.trim()) {
        const q = currentSearch.toLowerCase();
        const empInfo = extractEmployeeInfo(r);
        const name = empInfo.name.toLowerCase();
        const code = empInfo.code.toLowerCase();
        const dept = empInfo.dept.toLowerCase();
        const nick = empInfo.nickname.toLowerCase();
        const type = (r.leave_types?.leave_name || r.leave_type_name || '').toLowerCase();
        const reason = (r.reason || '').toLowerCase();
        return name.includes(q) || code.includes(q) || dept.includes(q) || nick.includes(q) || type.includes(q) || reason.includes(q);
      }

      return true;
    });

    // เรียงลำดับ
    filteredList.sort((a, b) => {
      const slaA = calculateSlaDetails(a);
      const slaB = calculateSlaDetails(b);

      if (currentSort === 'urgent_first') {
        // รายการที่ใกล้หมดเวลา / เกินกำหนดมากที่สุดขึ้นก่อน
        return slaA.remainingMs - slaB.remainingMs;
      } else if (currentSort === 'newest') {
        return new Date(b.created_at) - new Date(a.created_at);
      } else {
        return new Date(a.created_at) - new Date(b.created_at);
      }
    });

    // ตรวจสอบสถานะไอคอน
    let iconPulseClass = "";
    if (overdueCount > 0) iconPulseClass = "has-overdue";
    else if (urgentCount > 0) iconPulseClass = "has-urgent";

    // สร้าง HTML Wrapper
    let html = `
      <section class="sla-tracker-wrapper" id="slaTrackerComponent">
        <!-- 🎯 Header Bar -->
        <div class="sla-tracker-header">
          <div class="sla-tracker-title-group">
            <div class="sla-tracker-icon-pulse ${iconPulseClass}">
              <span class="material-symbols-outlined">${overdueCount > 0 ? 'timer_off' : 'hourglass_top'}</span>
            </div>
            <div class="sla-tracker-title-text">
              <h3>
                ระบบติดตามกรอบเวลาอนุมัติใบลา (2-Day SLA Countdown)
                ${overdueCount > 0 ? `<span class="sla-overdue-badge" style="background: #ef4444; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 700; white-space: nowrap;">เกินกำหนด ${overdueCount} รายการ</span>` : ''}
              </h3>
              <p>นโยบายกำหนดให้หัวหน้า (L1) และผู้จัดการ (L2) พิจารณาอนุมัติภายใน 48 ชั่วโมง (2 วันทำการ)</p>
            </div>
          </div>

          <!-- 🏷️ Metric Filter Pills -->
          <div class="sla-tracker-metrics-bar">
            <div class="sla-metric-pill pill-all ${currentFilter === 'all' ? 'active' : ''}" onclick="window.setSlaFilter('all')">
              <span class="material-symbols-outlined" style="font-size: 14px;">apps</span>
              ทั้งหมด (${totalPending})
            </div>
            <div class="sla-metric-pill pill-overdue ${currentFilter === 'overdue' ? 'active' : ''}" onclick="window.setSlaFilter('overdue')">
              <span class="material-symbols-outlined" style="font-size: 14px;">warning</span>
              เกินกำหนด (${overdueCount})
            </div>
            <div class="sla-metric-pill pill-urgent ${currentFilter === 'urgent' ? 'active' : ''}" onclick="window.setSlaFilter('urgent')">
              <span class="material-symbols-outlined" style="font-size: 14px;">bolt</span>
              ด่วน &lt; 12 ชม. (${urgentCount})
            </div>
            <div class="sla-metric-pill pill-normal ${currentFilter === 'normal' ? 'active' : ''}" onclick="window.setSlaFilter('normal')">
              <span class="material-symbols-outlined" style="font-size: 14px;">check_circle</span>
              ตามเวลา (${normalCount})
            </div>
          </div>
        </div>

        <!-- 🎛️ Search and Filter Row -->
        <div class="sla-tracker-body">
          <div class="sla-filter-row">
            <div class="sla-search-input-wrap">
              <span class="material-symbols-outlined">search</span>
              <input type="text" id="slaSearchInput" placeholder="ค้นหาชื่อพนักงาน, รหัส, แผนก, ประเภท..." value="${escapeHtml(currentSearch)}" oninput="window.handleSlaSearch(this.value)">
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <label for="slaSortSelect" style="font-size: 12.5px; color: #64748b; font-weight: 500;">เรียงตาม:</label>
              <select id="slaSortSelect" class="sla-sort-select" onchange="window.handleSlaSort(this.value)">
                <option value="urgent_first" ${currentSort === 'urgent_first' ? 'selected' : ''}>⏳ ใกล้ครบกำหนดที่สุดก่อน</option>
                <option value="newest" ${currentSort === 'newest' ? 'selected' : ''}>📅 ยื่นใหม่ล่าสุด</option>
                <option value="oldest" ${currentSort === 'oldest' ? 'selected' : ''}>📜 ยื่นเก่าที่สุด</option>
              </select>
              <button type="button" class="btn-sla-refresh" onclick="typeof window.loadPendingLeavesHR === 'function' ? window.loadPendingLeavesHR() : window.renderLeaveSlaTracker()" title="รีเฟรชข้อมูลคำขอลา">
                <span class="material-symbols-outlined" style="font-size: 15px;">sync</span>
                <span>รีเฟรช</span>
              </button>
            </div>
          </div>

          <!-- 🗂️ Cards Grid -->
          <div class="sla-cards-grid" id="slaCardsGrid">
    `;

    if (filteredList.length === 0) {
      html += `
        <div class="sla-empty-state" style="grid-column: 1 / -1;">
          <div class="sla-empty-icon">
            <span class="material-symbols-outlined">task_alt</span>
          </div>
          <strong style="color: #1e293b; font-size: 15px;">ไม่มีรายการคำขอลาค้างพิจารณาที่ตรงกับเงื่อนไข</strong>
          <span style="font-size: 13px;">คำขอลาทั้งหมดได้รับการพิจารณาเรียบร้อยแล้ว หรือไม่มีรายการในหมวดหมู่นี้</span>
        </div>
      `;
    } else {
      filteredList.forEach(req => {
        const sla = calculateSlaDetails(req);
        const emp = extractEmployeeInfo(req);
        const rawLeaveType = req.leave_types?.leave_name || req.leave_type_name || 'ลาทั่วไป';
        const leaveTypeName = formatLeaveName(rawLeaveType);
        const startDateStr = formatDateThai(req.start_date);
        const endDateStr = formatDateThai(req.end_date);
        const totalDays = req.total_days || 1;
        const leaveHours = req.leave_hours ? ` (${req.leave_hours} ชม.)` : '';
        const reason = req.reason || 'ไม่ได้ระบุเหตุผล';

        const displayName = emp.nickname ? `${emp.name} (${emp.nickname})` : emp.name;
        const attachUrl = req.file_url || req.attachment_url || req.document_url || req.image_url || '';
        const isImg = attachUrl && (/\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(attachUrl) || attachUrl.startsWith('data:image/'));

        // Circumference for SVG progress ring (radius = 18, circumference = 2 * PI * 18 = 113.1)
        const radius = 18;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (sla.percentElapsed / 100) * circumference;

        let cardClass = "is-normal";
        let ringBarClass = "ring-normal";
        let fillClass = "fill-normal";
        let centerIcon = "schedule";

        if (sla.isOverdue) {
          cardClass = "is-overdue";
          ringBarClass = "ring-overdue";
          fillClass = "fill-overdue";
          centerIcon = "timer_off";
        } else if (sla.isUrgent) {
          cardClass = "is-urgent";
          ringBarClass = "ring-urgent";
          fillClass = "fill-urgent";
          centerIcon = "warning";
        }

        const durationFriendly = window.PVTSDK?.formatLeaveDurationFriendly
          ? window.PVTSDK.formatLeaveDurationFriendly(totalDays, req.leave_hours, { compact: true })
          : `${totalDays} วัน${leaveHours}`;

        html += `
          <div class="sla-card ${cardClass}" id="sla-card-${req.id}" data-created-at="${req.created_at || ''}" data-leave-id="${req.id}">
            <!-- Card Top: User Info -->
            <div class="sla-card-top">
              <div class="sla-user-profile">
                <img src="${emp.avatar}" class="sla-user-avatar" onerror="this.src='/assets/img/default-avatar.jpg';" alt="${escapeHtml(displayName)}">
                <div class="sla-user-text">
                  <h4 class="sla-user-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</h4>
                  <div class="sla-user-sub">
                    <span class="sla-code-tag">${escapeHtml(emp.code)}</span>
                    <span class="sla-dept-tag">${escapeHtml(emp.dept)}</span>
                    ${emp.position ? `<span class="sla-pos-tag" style="font-size: 11px; color: #64748b; background: #f8fafc; padding: 1px 5px; border-radius: 4px; border: 1px solid #e2e8f0;">${escapeHtml(emp.position)}</span>` : ''}
                  </div>
                </div>
              </div>
              <span class="status-badge ${sla.isOverdue ? 'status-overdue' : (sla.isUrgent ? 'status-pending' : 'status-approved')}" style="font-size: 11px; padding: 2px 8px; flex-shrink: 0;">
                ${sla.badgeText}
              </span>
            </div>

            <!-- ⏳ Countdown Section -->
            <div class="sla-timer-section">
              <div class="sla-ring-wrap">
                <svg viewBox="0 0 48 48">
                  <circle class="sla-ring-bg" cx="24" cy="24" r="${radius}"></circle>
                  <circle class="sla-ring-bar ${ringBarClass}" cx="24" cy="24" r="${radius}" 
                          stroke-dasharray="${circumference}" 
                          stroke-dashoffset="${strokeDashoffset}" 
                          id="ring-bar-${req.id}"></circle>
                </svg>
                <div class="sla-ring-center-icon">
                  <span class="material-symbols-outlined" style="font-size: 18px; color: ${sla.isOverdue ? '#ea580c' : (sla.isUrgent ? '#d97706' : '#10b981')}">${centerIcon}</span>
                </div>
              </div>

              <div class="sla-timer-content">
                <div class="sla-timer-label">
                  <span>${sla.isOverdue ? 'ใบลาไม่ได้รับการพิจารณาในเวลา' : 'เวลาที่เหลือก่อนครบกำหนด 2 วัน'}</span>
                  <span>${Math.round(sla.percentElapsed)}%</span>
                </div>
                <div class="sla-countdown-digits" id="countdown-text-${req.id}">
                  ${sla.countdownText}
                </div>
                <div class="sla-progress-track">
                  <div class="sla-progress-fill ${fillClass}" id="progress-fill-${req.id}" style="width: ${sla.percentElapsed}%;"></div>
                </div>
              </div>
            </div>

            <!-- 📋 Leave Meta Info -->
            <div class="sla-leave-info">
              <div class="sla-leave-info-row">
                <span class="sla-leave-type-chip">
                  <span class="material-symbols-outlined" style="font-size: 16px; color: #0d9488;">event_note</span>
                  ${escapeHtml(leaveTypeName)}
                </span>
                <span class="sla-duration-badge">${durationFriendly}</span>
              </div>
              <div class="sla-dates-row">
                <span class="material-symbols-outlined" style="font-size: 14px;">calendar_month</span>
                <span>${startDateStr} - ${endDateStr}</span>
              </div>
              <div class="sla-reason-snippet" title="${escapeHtml(reason)}">
                <strong>เหตุผล:</strong> ${escapeHtml(reason)}
              </div>
            </div>

            <!-- 🚦 Stage Stepper -->
            <div class="sla-stage-status">
              <span>สถานะขั้นตอน:</span>
              <span class="sla-stage-badge ${sla.stageClass}">
                <span class="material-symbols-outlined" style="font-size: 13px;">${sla.stageIcon || 'assignment_ind'}</span>
                ${sla.stepText}
              </span>
            </div>

            ${req.delegationInfo ? `
              <div style="margin-top: 8px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 6px 10px; font-size: 12px; color: #0369a1; display: flex; align-items: center; gap: 6px;">
                <span class="material-symbols-outlined" style="font-size: 16px; color: #0284c7; flex-shrink: 0;">swap_calls</span>
                <div style="line-height: 1.3;">
                  <strong>โอนสิทธิ์อัตโนมัติ:</strong> คุณ ${escapeHtml(req.delegationInfo.delegateName)} รักษาการแทน (${escapeHtml(req.delegationInfo.reason)})
                </div>
              </div>
            ` : ''}

            <!-- 🔘 Action Buttons (อนุมัติ, ไม่อนุมัติ, รายละเอียด) -->
            <div class="sla-actions-row" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
              <button type="button" class="btn-sla-action btn-sla-approve" onclick="window.slaApproveLeave('${req.id}')" title="อนุมัติคำขอลาทันที" style="background: #10b981; color: white; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 7px 4px; border-radius: 8px; border: none; font-weight: 700; cursor: pointer; font-size: 13px; font-family: inherit; transition: all 0.2s;">
                <span class="material-symbols-outlined" style="font-size: 16px;">check_circle</span>
                <span>อนุมัติ</span>
              </button>
              <button type="button" class="btn-sla-action btn-sla-reject" onclick="window.slaRejectLeave('${req.id}')" title="ไม่อนุมัติ / ปฏิเสธคำขอลา" style="background: #ef4444; color: white; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 7px 4px; border-radius: 8px; border: none; font-weight: 700; cursor: pointer; font-size: 13px; font-family: inherit; transition: all 0.2s;">
                <span class="material-symbols-outlined" style="font-size: 16px;">cancel</span>
                <span>ไม่อนุมัติ</span>
              </button>
              <button type="button" class="btn-sla-action btn-sla-details" onclick="window.showSlaLeaveDetails('${req.id}')" title="ดูรายละเอียดใบลาฉบับเต็ม" style="background: #f1f5f9; color: #334155; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 7px 4px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 700; cursor: pointer; font-size: 13px; font-family: inherit; transition: all 0.2s;">
                <span class="material-symbols-outlined" style="font-size: 16px;">visibility</span>
                <span>รายละเอียด</span>
              </button>
            </div>
          </div>
        `;
      });
    }

    html += `
          </div>
        </div>
      </section>
    `;

    container.innerHTML = html;

    // Start live countdown ticker
    startSlaCountdownTicker();
  }

  /**
   * เริ่ม Ticker นับถอยหลังแบบเรียลไทม์ทุกวินาที
   */
  function startSlaCountdownTicker() {
    if (slaTimerInterval) {
      clearInterval(slaTimerInterval);
      slaTimerInterval = null;
    }

    slaTimerInterval = setInterval(() => {
      const cards = document.querySelectorAll('.sla-card[data-created-at]');
      if (!cards || cards.length === 0) return;

      cards.forEach(card => {
        const createdAt = card.getAttribute('data-created-at');
        const leaveId = card.getAttribute('data-leave-id');
        if (!createdAt || !leaveId) return;

        const sla = calculateSlaDetails({ created_at: createdAt });
        
        const countdownEl = document.getElementById(`countdown-text-${leaveId}`);
        const progressFillEl = document.getElementById(`progress-fill-${leaveId}`);
        const ringBarEl = document.getElementById(`ring-bar-${leaveId}`);

        if (countdownEl) {
          countdownEl.textContent = sla.countdownText;
        }

        if (progressFillEl) {
          progressFillEl.style.width = `${sla.percentElapsed}%`;
        }

        if (ringBarEl) {
          const radius = 18;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset = circumference - (sla.percentElapsed / 100) * circumference;
          ringBarEl.style.strokeDashoffset = strokeDashoffset;
        }
      });
    }, 1000);
  }

  /**
   * Helper formatting functions
   */
  function formatDateThai(dateStr) {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
    } catch (e) {
      return dateStr;
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Global Controls Handlers
   */
  window.setSlaFilter = function(filterType) {
    currentFilter = filterType;
    renderLeaveSlaTracker();
  };

  window.handleSlaSearch = function(val) {
    currentSearch = val;
    renderLeaveSlaTracker();
  };

  window.handleSlaSort = function(val) {
    currentSort = val;
    renderLeaveSlaTracker();
  };

  /**
   * ดึงข้อมูล Leave Request ตาม ID จาก Cache หรือ Window Variables
   */
  function findLeaveRequestById(leaveId) {
    if (!leaveId) return null;
    let found = (cachedPendingRequests || []).find(r => String(r.id) === String(leaveId));
    if (found) return found;

    if (window.allLeaveRequests && Array.isArray(window.allLeaveRequests)) {
      found = window.allLeaveRequests.find(r => String(r.id) === String(leaveId));
      if (found) return found;
    }

    if (window.myLeaveRows && Array.isArray(window.myLeaveRows)) {
      found = window.myLeaveRows.find(r => String(r.id) === String(leaveId));
      if (found) return found;
    }

    if (window.rawLeaveRequests && Array.isArray(window.rawLeaveRequests)) {
      found = window.rawLeaveRequests.find(r => String(r.id) === String(leaveId));
      if (found) return found;
    }

    return null;
  }

  /**
   * แสดงหน้าต่างดูรายละเอียดคำขอลาแบบเต็มรูปแบบ (Comprehensive Details Modal)
   */
  window.showSlaLeaveDetails = function(leaveId) {
    // กรณีที่อยู่ในหน้า hr.html ที่มี Modal DOM พร้อมใช้งาน
    const existingHrModal = document.getElementById("leavePreviewModal");
    if (existingHrModal && typeof window.previewLeaveModal === 'function') {
      window.previewLeaveModal(leaveId);
      return;
    }

    const req = findLeaveRequestById(leaveId);
    if (!req) {
      console.warn("Leave request not found for ID:", leaveId);
      if (window.Swal) {
        Swal.fire({
          icon: 'info',
          title: 'ไม่พบข้อมูลคำขอลา',
          text: 'อาจได้รับการพิจารณาหรืออัปเดตสถานะไปแล้ว',
          confirmButtonColor: '#0d9488'
        });
      }
      return;
    }

    const emp = extractEmployeeInfo(req);
    const sla = calculateSlaDetails(req);
    const rawType = req.leave_types?.leave_name || req.leave_type_name || "ลาทั่วไป";
    const typeName = formatLeaveName(rawType);
    const startStr = formatDateThai(req.start_date);
    const endStr = formatDateThai(req.end_date);
    const totalDays = req.total_days || req.days_requested || req.actual_days || 1;
    const leaveHours = req.leave_hours ? ` (${req.leave_hours} ชม.)` : '';
    const reason = req.reason || 'ไม่ได้ระบุเหตุผล';
    const createdAtStr = req.created_at ? new Date(req.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

    const modalDurationFriendly = window.PVTSDK?.formatLeaveDurationFriendly
      ? window.PVTSDK.formatLeaveDurationFriendly(totalDays, req.leave_hours)
      : `${totalDays} วัน${leaveHours}`;

    // ตรวจสอบไฟล์แนบ
    let attachHtml = '';
    const fileUrl = req.file_url || req.attachment_url || req.document_url || '';
    if (fileUrl && fileUrl.trim() !== '') {
      const isImg = /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(fileUrl) || fileUrl.startsWith('data:image/');
      if (isImg) {
        attachHtml = `
          <div style="margin-top: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px;">
            <div style="font-weight: 700; font-size: 12.5px; color: #475569; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 16px;">image</span> หลักฐาน / เอกสารแนบ
            </div>
            <a href="${fileUrl}" target="_blank" rel="noopener noreferrer">
              <img src="${fileUrl}" alt="หลักฐาน" style="max-height: 180px; max-width: 100%; border-radius: 8px; object-fit: contain; border: 1px solid #cbd5e1;" />
            </a>
          </div>
        `;
      } else {
        attachHtml = `
          <div style="margin-top: 12px;">
            <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; background: #f1f5f9; color: #0284c7; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; border: 1px solid #cbd5e1;">
              <span class="material-symbols-outlined" style="font-size: 18px;">description</span> เปิดดูเอกสารแนบ
            </a>
          </div>
        `;
      }
    }

    const modalContent = `
      <div style="text-align: left; font-family: 'Sarabun', sans-serif; color: #1e293b;">
        <!-- Employee Profile Header -->
        <div style="display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0; margin-bottom: 14px;">
          <img src="${emp.avatar}" onerror="this.src='/assets/img/default-avatar.jpg';" style="width: 54px; height: 54px; border-radius: 12px; object-fit: cover; border: 2px solid #cbd5e1; background: #f1f5f9; flex-shrink: 0;" />
          <div style="min-width: 0; flex: 1;">
            <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #0f172a; line-height: 1.3;">
              ${escapeHtml(emp.name)} ${emp.nickname ? `<span style="font-size: 14px; font-weight: 500; color: #64748b;">(${escapeHtml(emp.nickname)})</span>` : ''}
            </h3>
            <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 4px; font-size: 12px; color: #64748b;">
              <span style="background: #f1f5f9; padding: 2px 7px; border-radius: 4px; font-weight: 600; color: #334155; border: 1px solid #e2e8f0;">รหัส: ${escapeHtml(emp.code)}</span>
              <span style="background: #e0f2fe; padding: 2px 7px; border-radius: 4px; font-weight: 600; color: #0369a1; border: 1px solid #bae6fd;">แผนก: ${escapeHtml(emp.dept)}</span>
              ${emp.position ? `<span style="background: #f8fafc; padding: 2px 7px; border-radius: 4px; color: #475569; border: 1px solid #e2e8f0;">ตำแหน่ง: ${escapeHtml(emp.position)}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- ⏱️ SLA Status Callout -->
        <div style="background: ${sla.isOverdue ? '#fff7ed' : (sla.isUrgent ? '#fffbeb' : '#f0fdf4')}; border: 1.5px solid ${sla.isOverdue ? '#fed7aa' : (sla.isUrgent ? '#fde68a' : '#bbf7d0')}; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
            <div style="font-weight: 800; font-size: 13.5px; color: ${sla.isOverdue ? '#c2410c' : (sla.isUrgent ? '#b45309' : '#15803d')}; display: flex; align-items: center; gap: 6px;">
              <span class="material-symbols-outlined" style="font-size: 20px; color: ${sla.isOverdue ? '#ea580c' : (sla.isUrgent ? '#d97706' : '#16a34a')}">
                ${sla.isOverdue ? 'timer_off' : (sla.isUrgent ? 'warning' : 'schedule')}
              </span>
              ${sla.isOverdue ? '⚠️ ใบลาไม่ได้รับการพิจารณาในเวลาที่กำหนด (Overdue)' : '⏱️ กรอบเวลาการพิจารณา (2-Day SLA Policy)'}
            </div>
            <span style="font-size: 12px; font-weight: 700; background: ${sla.isOverdue ? '#ea580c' : (sla.isUrgent ? '#d97706' : '#16a34a')}; color: #ffffff; padding: 2px 8px; border-radius: 99px;">
              ${sla.badgeText}
            </span>
          </div>
          <div style="margin-top: 6px; font-size: 13px; line-height: 1.5; color: ${sla.isOverdue ? '#9a3412' : (sla.isUrgent ? '#92400e' : '#166534')};">
            ${sla.isOverdue 
              ? `คำขอนี้ค้างการพิจารณามาแล้ว <strong>${sla.elapsedHours} ชั่วโมง</strong> (${Math.floor(sla.elapsedHours / 24)} วัน) ซึ่งเกินเกณฑ์ 2 วันทำการที่ต้องอนุมัติ`
              : `เวลาที่เหลือก่อนครบกำหนด: <strong style="font-size: 14px; font-family: monospace;">${sla.countdownText}</strong>`
            }
          </div>
        </div>

        <!-- Leave Information Grid -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 14px; font-size: 13px;">
          <div style="background: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #f1f5f9;">
            <span style="color: #64748b; font-size: 11.5px; display: block; margin-bottom: 2px;">ประเภทการลา</span>
            <strong style="color: #0d9488; font-size: 14px; display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 16px;">event_note</span> ${escapeHtml(typeName)}
            </strong>
          </div>

          <div style="background: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #f1f5f9;">
            <span style="color: #64748b; font-size: 11.5px; display: block; margin-bottom: 2px;">ระยะเวลาที่ขอลา</span>
            <strong style="color: #0f172a; font-size: 14px; display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 16px;">timelapse</span> ${modalDurationFriendly}
            </strong>
          </div>

          <div style="background: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #f1f5f9;">
            <span style="color: #64748b; font-size: 11.5px; display: block; margin-bottom: 2px;">ตั้งแต่วันที่</span>
            <span style="font-weight: 600; color: #334155;">${startStr}</span>
          </div>

          <div style="background: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #f1f5f9;">
            <span style="color: #64748b; font-size: 11.5px; display: block; margin-bottom: 2px;">ถึงวันที่</span>
            <span style="font-weight: 600; color: #334155;">${endStr}</span>
          </div>
        </div>

        <!-- Reason -->
        <div style="background: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #f1f5f9; margin-bottom: 12px;">
          <span style="color: #64748b; font-size: 11.5px; display: block; margin-bottom: 4px; font-weight: 600;">เหตุผล / วัตถุประสงค์การลา:</span>
          <div style="color: #1e293b; font-size: 13.5px; line-height: 1.5;">${escapeHtml(reason)}</div>
        </div>

        <!-- Current Approval Stage -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f1f5f9; border-radius: 8px; font-size: 12.5px; margin-bottom: 10px;">
          <span style="color: #475569; font-weight: 500;">ขั้นตอนปัจจุบัน:</span>
          <span style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="font-size: 16px; color: #0d9488;">${sla.stageIcon || 'assignment_ind'}</span>
            ${sla.stepText}
          </span>
        </div>

        <div style="font-size: 11.5px; color: #94a3b8; text-align: right;">
          ยื่นคำขอเมื่อ: ${createdAtStr}
        </div>

         ${attachHtml}

        <!-- Actions moved here: ปริ้นเอกสาร และดูรูปภาพแนบ -->
        <div style="display: flex; gap: 10px; margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          <button type="button" class="btn-sla-action btn-sla-print" onclick="typeof window.printLeaveA4 === 'function' ? window.printLeaveA4('${req.id}') : (window.location.href='/pages/hr/hr.html?id=${req.id}&action=print')" 
                  style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #0284c7; color: white; border: none; padding: 10px 14px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 13.5px; font-family: inherit; transition: background 0.2s;">
            <span class="material-symbols-outlined" style="font-size: 18px;">print</span>
            <span>ปริ้นเอกสาร</span>
          </button>
          
          ${fileUrl ? `
            <button type="button" class="btn-sla-action btn-sla-image" onclick="${isImg ? `typeof window.openImageLightbox === 'function' ? window.openImageLightbox('${fileUrl}', 'หลักฐาน #${req.id}') : window.open('${fileUrl}', '_blank')` : `window.open('${fileUrl}', '_blank')`}" 
                    style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #475569; color: white; border: none; padding: 10px 14px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 13.5px; font-family: inherit; transition: background 0.2s;">
              <span class="material-symbols-outlined" style="font-size: 18px;">${isImg ? 'image' : 'attach_file'}</span>
              <span>${isImg ? 'ดูรูปภาพ' : 'เปิดไฟล์แนบ'}</span>
            </button>
          ` : `
            <button type="button" class="btn-sla-action btn-sla-image btn-sla-image-disabled" disabled 
                    style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #f8fafc; color: #94a3b8; border: 1px dashed #cbd5e1; padding: 10px 14px; border-radius: 8px; font-weight: 700; cursor: not-allowed; font-size: 13.5px; font-family: inherit;">
              <span class="material-symbols-outlined" style="font-size: 18px;">hide_image</span>
              <span>ไม่มีรูปภาพแนบ</span>
            </button>
          `}
        </div>
      </div>
    `;

    if (window.Swal) {
      Swal.fire({
        title: `<div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:18px;font-weight:700;"><span class="material-symbols-outlined" style="color:#0d9488;font-size:24px;">description</span> รายละเอียดคำขอลาหยุดงาน</div>`,
        html: modalContent,
        width: '600px',
        showCloseButton: true,
        showCancelButton: true,
        cancelButtonText: 'ปิด',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '<span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;margin-right:4px;">fact_check</span> ไปที่หน้าตรวจใบลา',
        confirmButtonColor: '#0d9488'
      }).then((res) => {
        if (res.isConfirmed) {
          window.location.href = `/pages/hr/hr.html?id=${leaveId}`;
        }
      });
    } else {
      alert(`รายละเอียดการลา: ${emp.name} (${typeName})\nวันที่: ${startStr} - ${endStr}\nเหตุผล: ${reason}`);
    }
  };

  /**
   * จัดการเมื่อคลิกปุ่มพิจารณาอนุมัติ
   */
  window.triggerSlaReview = function(leaveId) {
    const existingHrModal = document.getElementById("leavePreviewModal");
    if (existingHrModal && typeof window.previewLeaveModal === 'function') {
      window.previewLeaveModal(leaveId, true);
      return;
    }

    if (window.location.pathname.includes('/pages/hr/hr.html')) {
      if (typeof window.previewLeaveModal === 'function') {
        window.previewLeaveModal(leaveId, true);
      } else {
        window.showSlaLeaveDetails(leaveId);
      }
    } else {
      // หน้า home.html หรือหน้าอื่นๆ -> ส่งต่อไปยังหน้าตรวจใบลาพร้อมเปิดพิจารณา
      window.location.href = `/pages/hr/hr.html?id=${leaveId}&action=review`;
    }
  };

  /**
   * ดำเนินการอนุมัติใบลาโดยตรงจากตาราง SLA Tracker
   */
  window.slaApproveLeave = async function(leaveId) {
    if (typeof window.approveLeave === 'function') {
      await window.approveLeave(leaveId);
    } else if (typeof window.quickApproveFromDashboard === 'function') {
      await window.quickApproveFromDashboard(leaveId);
    } else {
      try {
        const { isConfirmed } = await Swal.fire({
          title: '<span style="font-size: 20px; font-weight: 800; color: #0f172a;">ยืนยันอนุมัติคำขอลา</span>',
          text: 'คุณแน่ใจหรือไม่ที่จะอนุมัติคำขอนี้ทันที? ระบบจะทำการบันทึกและตัดยอดวันลาตามขั้นตอน',
          icon: 'question',
          iconColor: '#10b981',
          showCancelButton: true,
          showDenyButton: false,
          confirmButtonText: '✔️ ยืนยันอนุมัติคำขอ',
          cancelButtonText: 'ยกเลิก',
          confirmButtonColor: '#10b981',
          cancelButtonColor: '#64748b',
          focusCancel: true,
          allowOutsideClick: false,
          customClass: {
            popup: 'swal-refined-popup',
            confirmButton: 'swal-btn-success',
            cancelButton: 'swal-btn-cancel'
          }
        });
        if (!isConfirmed) return;

        Swal.fire({
          title: 'กำลังบันทึกข้อมูล...',
          allowOutsideClick: false,
          didOpen: () => { Swal.showLoading(); }
        });

        const sb = window.PVTSDK?.client || window.pvtSupabase?.client;
        if (!sb) throw new Error("ไม่พบระบบฐานข้อมูลหลัก");

        const { error } = await sb.from('leave_requests').update({
          status: 'approved',
          approved_at: new Date().toISOString()
        }).eq('id', leaveId);

        if (error) throw error;

        await Swal.fire({
          icon: 'success',
          title: 'อนุมัติเรียบร้อย',
          showConfirmButton: false,
          timer: 1500
        });

        if (typeof window.loadPendingLeavesHR === 'function') {
          await window.loadPendingLeavesHR();
        } else if (typeof window.renderLeaveSlaTracker === 'function') {
          await window.renderLeaveSlaTracker();
        }
      } catch (err) {
        console.error("SLA Direct Approve Error:", err);
        Swal.fire({
          icon: 'error',
          title: 'ไม่สามารถทำรายการได้',
          text: err.message
        });
      }
    }
  };

  /**
   * ดำเนินการปฏิเสธ/ไม่อนุมัติใบลาโดยตรงจากตาราง SLA Tracker
   */
  window.slaRejectLeave = async function(leaveId) {
    if (typeof window.rejectLeave === 'function') {
      await window.rejectLeave(leaveId);
    } else if (typeof window.quickRejectFromDashboard === 'function') {
      await window.quickRejectFromDashboard(leaveId);
    } else {
      try {
        const { value: rejectComment, isConfirmed } = await Swal.fire({
          title: '<span style="font-size: 20px; font-weight: 800; color: #b91c1c;">ยืนยันไม่อนุมัติ / ปฏิเสธคำขอลา</span>',
          input: 'textarea',
          inputLabel: 'โปรดระบุเหตุผลการไม่อนุมัติ (จากหัวหน้างาน/ผู้จัดการ):',
          inputPlaceholder: 'กรอกเหตุผลการไม่อนุมัติ เช่น งานเร่งด่วน, กำลังพลไม่พอ, เอกสารไม่สมบูรณ์...',
          showCancelButton: true,
          showDenyButton: false,
          confirmButtonText: '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">cancel</span> ยืนยันไม่อนุมัติคำขอ',
          cancelButtonText: 'ยกเลิก',
          confirmButtonColor: '#ef4444',
          cancelButtonColor: '#64748b',
          focusCancel: true,
          allowOutsideClick: false,
          customClass: {
            popup: 'swal-refined-popup',
            confirmButton: 'swal-btn-danger',
            cancelButton: 'swal-btn-cancel'
          },
          inputValidator: (value) => {
            if (!value || !value.trim()) return 'กรุณาระบุเหตุผลการไม่อนุมัติด้วยครับ เพื่อแจ้งให้พนักงานทราบ';
          }
        });
        if (!isConfirmed || !rejectComment) return;

        Swal.fire({
          title: 'กำลังบันทึกข้อมูล...',
          allowOutsideClick: false,
          didOpen: () => { Swal.showLoading(); }
        });

        const sb = window.PVTSDK?.client || window.pvtSupabase?.client;
        if (!sb) throw new Error("ไม่พบระบบฐานข้อมูลหลัก");

        const { error } = await sb.from('leave_requests').update({
          status: 'rejected',
          approval_comment: rejectComment.trim()
        }).eq('id', leaveId);

        if (error) throw error;

        await Swal.fire({
          icon: 'success',
          title: 'ปฏิเสธเรียบร้อย',
          showConfirmButton: false,
          timer: 1500
        });

        if (typeof window.loadPendingLeavesHR === 'function') {
          await window.loadPendingLeavesHR();
        } else if (typeof window.renderLeaveSlaTracker === 'function') {
          await window.renderLeaveSlaTracker();
        }
      } catch (err) {
        console.error("SLA Direct Reject Error:", err);
        Swal.fire({
          icon: 'error',
          title: 'ไม่สามารถทำรายการได้',
          text: err.message
        });
      }
    }
  };

  window.renderLeaveSlaTracker = renderLeaveSlaTracker;
  window.calculateSlaDetails = calculateSlaDetails;

})(window);
