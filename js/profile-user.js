/**
 * profile-user.js — (ดึงข้อมูลจริงจาก Supabase สำหรับ HR / Employee)
 */

document.addEventListener("DOMContentLoaded", loadProfile);

async function loadProfile() {
  const box = document.getElementById("profileBox");
  if (!box) return;

  try {
    let currentUserData = null;
    const client = window.pvtSupabase?.getClient ? window.pvtSupabase.getClient() : (window.supabase || window.sb);

    // 1️⃣ ดึงข้อมูลผ่าน Helper Function pvtSupabase (ถ้ามี)
    if (window.pvtSupabase && typeof window.pvtSupabase.getCurrentProfile === "function") {
      try {
        currentUserData = await window.pvtSupabase.getCurrentProfile();
      } catch (e) {
        console.warn("⚠️ getCurrentProfile error:", e);
      }
    }

    // 2️⃣ ถ้าไม่มี ให้เช็กจาก Supabase Auth Session
    if (!currentUserData && client?.auth) {
      const { data } = await client.auth.getSession();
      if (data?.session?.user) {
        currentUserData = data.session.user;
      }
    }

    // 3️⃣ ถ้ายังไม่มี ให้กวาดหาจาก Storage ทุกชื่อที่เป็นไปได้ในระบบ
    if (!currentUserData) {
      const possibleKeys = [
        "currentUser", "pvt_user", "user", "profile", 
        "employee_session", "hr_session", "loggedInUser"
      ];

      for (const key of possibleKeys) {
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.id || parsed.employee_id || parsed.email || parsed.employee_code)) {
              currentUserData = parsed;
              break;
            }
          } catch (e) { /* ignore parse error */ }
        }
      }
    }

    if (currentUserData) {
      window.currentEmpProfile = currentUserData;
      window.currentUserProfile = currentUserData;
    }

    // ⛔ หากค้นหาจากทุกจุดแล้วไม่พบข้อมูลจริงใดๆ
    if (!currentUserData) {
      console.warn("🔒 ไม่พบข้อมูลการเข้าสู่ระบบในเครื่อง");
      box.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0;">
          <div style="font-size: 40px; margin-bottom: 12px;">🔒</div>
          <h3 style="font-size: 16px; color: #1e293b; margin-bottom: 8px; font-weight: 600;">ยังไม่ได้เข้าสู่ระบบ</h3>
          <p style="font-size: 13px; color: #64748b; margin-bottom: 20px;">กรุณาเข้าสู่ระบบใหม่อีกครั้ง</p>
          <a href="/index.html" style="display: inline-block; padding: 10px 20px; background: #10b981; color: #ffffff; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
            กลับหน้าเข้าสู่ระบบ
          </a>
        </div>`;
      return;
    }

    // -------------------------------------------------------------
    // 🔍 ดึงข้อมูลโปรไฟล์แบบ Real-time จากตาราง Supabase
    // -------------------------------------------------------------
    let realProfile = null;
    const targetId = currentUserData.employee_id || currentUserData.id;
    const targetEmail = currentUserData.email;
    const targetCode = currentUserData.employee_code;

    if (client) {
      let query = client.from('employees').select('*, departments!department_id(department_name), positions(position_name)');

      if (targetId) query = query.eq('id', targetId);
      else if (targetCode) query = query.eq('employee_code', targetCode);
      else if (targetEmail) query = query.eq('email', targetEmail);

      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        realProfile = data;
      }
    }

    // รวมข้อมูลที่ดึงจาก DB หรือจาก Session
    const emp = realProfile || currentUserData.employees || currentUserData;
    const deptName = emp?.departments?.department_name || emp?.department_name || "-";
    const posName = emp?.positions?.position_name || emp?.position_name || "-";
    const rawStartDate = emp?.start_date || emp?.join_date || emp?.created_at || currentUserData?.created_at;

    const escapeFn = window.pvtSupabase?.escapeHtml || ((str) => str || "-");
    const dateFn = window.pvtSupabase?.formatThaiDate || ((dateStr) => {
      if (!dateStr) return "-";
      try {
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (e) {
        return dateStr;
      }
    });

    const lang = window.getGlobalLanguage ? window.getGlobalLanguage() : "th";
    const t = window.globalAppTranslations ? (window.globalAppTranslations[lang] || window.globalAppTranslations.th) : {
      lblFullName: "ชื่อ-นามสกุล",
      lblEmpCode: "รหัสพนักงาน",
      lblDept: "ฝ่าย / แผนก",
      lblPos: "ตำแหน่งงาน",
      lblEmail: "อีเมล / บัญชี",
      lblRole: "สิทธิ์การใช้งาน",
      lblStartDate: "วันเริ่มงาน"
    };

    // 🌟 พ่น HTML แสดงผลข้อมูลโปรไฟล์จริง
    box.innerHTML = `
      <article class="recent-item" style="margin-bottom: 12px; padding: 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #64748b; font-size: 14px;">${t.lblFullName || "ชื่อ-นามสกุล"}</span>
        <strong style="color: #1e293b; font-size: 15px;">${escapeFn(emp?.full_name || currentUserData?.display_name || currentUserData?.full_name)}</strong>
      </article>

      <article class="recent-item" style="margin-bottom: 12px; padding: 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #64748b; font-size: 14px;">${t.lblEmpCode || "รหัสพนักงาน"}</span>
        <strong style="color: #1e293b; font-size: 15px;">${escapeFn(emp?.employee_code || currentUserData?.employee_code)}</strong>
      </article>

      <article class="recent-item" style="margin-bottom: 12px; padding: 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #64748b; font-size: 14px;">${t.lblDept || "ฝ่าย / แผนก"}</span>
        <strong style="color: #1e293b; font-size: 15px;">${escapeFn(deptName)}</strong>
      </article>

      <article class="recent-item" style="margin-bottom: 12px; padding: 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #64748b; font-size: 14px;">${t.lblPos || "ตำแหน่งงาน"}</span>
        <strong style="color: #1e293b; font-size: 15px;">${escapeFn(posName)}</strong>
      </article>

      <article class="recent-item" style="margin-bottom: 12px; padding: 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #64748b; font-size: 14px;">${t.lblEmail || "อีเมล / บัญชี"}</span>
        <strong style="color: #1e293b; font-size: 15px;">${escapeFn(emp?.email || currentUserData?.email)}</strong>
      </article>

      <article class="recent-item" style="margin-bottom: 12px; padding: 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #64748b; font-size: 14px;">${t.lblRole || "สิทธิ์การใช้งาน"}</span>
        <strong style="color: #1e293b; font-size: 15px; text-transform: uppercase;">${escapeFn(emp?.role || currentUserData?.role || "HR")}</strong>
      </article>

      <article class="recent-item" style="margin-bottom: 12px; padding: 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #64748b; font-size: 14px;">${t.lblStartDate || "วันเริ่มงาน"}</span>
        <strong style="color: #1e293b; font-size: 15px;">${dateFn(rawStartDate)}</strong>
      </article>
    `;

    // Populate LINE User ID input
    const lineInput = document.getElementById("userLineIdInput");
    if (lineInput) {
      lineInput.value = emp?.line_id || "";
    }
    window.currentEmpProfile = emp;



    // Initialize WebAuthn biometric settings
    try {
      await initBiometricProfile();
    } catch (bioErr) {
      console.warn("Error initializing biometrics in profile:", bioErr);
    }

    console.log("✅ [SUCCESS] โหลดข้อมูลโปรไฟล์จริงของ HR/User สำเร็จ!");

  } catch (error) {
    console.error("❌ Error loading profile page:", error);
    box.innerHTML = `<div class="empty-state" style="color: #ef4444; text-align: center; padding: 20px;">เกิดข้อผิดพลาดในการโหลดข้อมูลโปรไฟล์</div>`;
  }
}

async function saveUserLineId() {
  const lineInput = document.getElementById("userLineIdInput");
  const newLineId = lineInput ? lineInput.value.trim() : "";
  const emp = window.currentEmpProfile;

  if (!emp || !emp.id) {
    if (window.Swal) {
      Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลโปรไฟล์พนักงานสำหรับบันทึก', 'error');
    } else {
      alert('ไม่พบข้อมูลโปรไฟล์พนักงานสำหรับบันทึก');
    }
    return;
  }

  try {
    const client = window.pvtSupabase?.getClient ? window.pvtSupabase.getClient() : (window.supabase || window.sb);
    if (!client) throw new Error('ไม่สามารถเชื่อมต่อฐานข้อมูล Supabase ได้');

    const { error } = await client
      .from('employees')
      .update({ line_id: newLineId || null })
      .eq('id', emp.id);

    if (error) throw error;

    emp.line_id = newLineId;

    if (window.Swal) {
      Swal.fire({
        icon: 'success',
        title: 'บันทึก LINE User ID สำเร็จ!',
        text: 'ระบบได้อัปเดตข้อมูล LINE ID สำหรับรับแจ้งเตือนใบลาเรียบร้อยแล้ว',
        confirmButtonColor: '#059669'
      });
    } else {
      alert('บันทึก LINE User ID สำเร็จ!');
    }
  } catch (err) {
    console.error("❌ Save LINE ID error:", err);
    if (window.Swal) {
      Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึก LINE ID ได้', 'error');
    } else {
      alert('เกิดข้อผิดพลาดในการบันทึก LINE ID');
    }
  }
}

async function testLineNotification() {
  const lineInput = document.getElementById("userLineIdInput");
  const lineId = lineInput ? lineInput.value.trim() : "";
  const emp = window.currentEmpProfile;

  if (!lineId) {
    if (window.Swal) {
      Swal.fire('กรุณาระบุ LINE User ID', 'โปรดใส่ LINE User ID ก่อนทดสอบส่งข้อความ', 'warning');
    } else {
      alert('โปรดใส่ LINE User ID ก่อนทดสอบส่งข้อความ');
    }
    return;
  }

  if (window.Swal) {
    Swal.fire({
      title: 'กำลังส่งข้อความทดสอบ...',
      text: 'กรุณารอสักครู่ ระบบกำลังส่งข้อความไปยัง LINE',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });
  }

  try {
    if (window.PVTSDK?.line?.sendWorkflowNotification) {
      const res = await window.PVTSDK.line.sendWorkflowNotification({
        type: 'TEST',
        recipientId: emp?.id || '',
        recipientLineId: lineId,
        employeeName: emp?.full_name || 'พนักงาน',
        employeeCode: emp?.employee_code || '',
        leaveType: 'ทดสอบระบบแจ้งเตือน LINE',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        totalDays: 1,
        reason: 'ทดสอบการส่งข้อความแจ้งเตือนใบลาผ่าน LINE',
        attachmentUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80'
      });

      if (res && res.lineSent) {
        if (window.Swal) {
          Swal.fire({
            icon: 'success',
            title: 'ส่งข้อความทดสอบสำเร็จ! 🎉',
            text: 'ส่งข้อความไปยัง LINE เรียบร้อยแล้ว กรุณาเช็กข้อความในแอป LINE ของคุณ',
            confirmButtonColor: '#0284c7'
          });
        }
      } else {
        if (window.Swal) {
          Swal.fire({
            icon: 'info',
            title: 'บันทึกการส่งแล้ว',
            text: res?.message || 'ส่งแจ้งเตือนในระบบเรียบร้อย (หากยังไม่ได้รับใน LINE กรุณาตรวจสอบว่าบอท LINE OA เปิดทำงานและได้รับ LINE User ID ที่ถูกต้อง)',
            confirmButtonColor: '#0284c7'
          });
        }
      }
    } else {
      throw new Error('ไม่พบเอนจิน PVTSDK.line');
    }
  } catch (err) {
    console.error("❌ Test LINE Notification error:", err);
    if (window.Swal) {
      Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถส่งข้อความทดสอบได้', 'error');
    }
  }
}

async function generateLineLinkCode() {
  const emp = window.currentEmpProfile;
  if (!emp || !emp.id) {
    Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลพนักงาน', 'error');
    return;
  }

  const client = window.pvtSupabase?.getClient ? window.pvtSupabase.getClient() : (window.supabase || window.sb);
  if (!client) return;

  try {
    let code = "";
    let created = false;

    // 1. Try server API (/api/create-line-link) first
    try {
      const apiRes = await fetch("/api/create-line-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: emp.id })
      });
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        if (apiData.success && apiData.token) {
          code = apiData.token;
          created = true;
        }
      }
    } catch (e) {}

    // 2. Fallback to direct client insert if API is unavailable
    if (!created && client) {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      try {
        await client.from('line_link_tokens').delete().eq('employee_id', emp.id);
      } catch (e) {}

      const { error } = await client
        .from('line_link_tokens')
        .insert([
          { 
            employee_id: emp.id, 
            token: code,
            link_code: code,
            expires_at: expiresAt 
          }
        ]);

      if (!error) created = true;
    }

    if (!code) {
      throw new Error("ไม่สามารถสร้างรหัสเชื่อมต่อ LINE ได้");
    }

    Swal.fire({
      title: 'รหัสเชื่อมต่อ LINE ของคุณ',
      html: `
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #059669; margin: 20px 0;">
          ${code}
        </div>
        <p style="font-size: 14px; color: #64748b;">
          กรุณาส่งรหัสนี้ไปยัง LINE Official Account ของบริษัท<br>
          รหัสมีอายุใช้งาน 10 นาที
        </p>
      `,
      icon: 'info',
      confirmButtonText: 'รับทราบ',
      confirmButtonColor: '#059669'
    });

  } catch (err) {
    console.error("Generate Token Error:", err);
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถสร้างรหัสได้: ' + err.message, 'error');
  }
}

window.saveUserLineId = saveUserLineId;
window.testLineNotification = testLineNotification;
window.generateLineLinkCode = generateLineLinkCode;

window.addEventListener("pvt-lang-changed", () => {
  if (typeof loadProfile === "function") {
    loadProfile();
  }
});


// ============================================================================
// 🔐 Biometric / WebAuthn Settings in Profile Page
// ============================================================================
async function initBiometricProfile() {
  const statusEl = document.getElementById("biometricSupportStatus");
  const registerBtn = document.getElementById("btnRegisterBiometric");
  const nicknameInput = document.getElementById("biometricDeviceName");
  
  if (!statusEl || !registerBtn) return;

  const emp = window.currentEmpProfile;
  if (!emp || !emp.id) {
    statusEl.innerHTML = `⚠️ <span style="color:#b91c1c;">กรุณารอโหลดโปรไฟล์ให้สำเร็จก่อน</span>`;
    statusEl.style.backgroundColor = "#fee2e2";
    statusEl.style.color = "#991b1b";
    registerBtn.disabled = true;
    return;
  }

  // Set default nickname to browser/OS name if possible
  if (nicknameInput && !nicknameInput.value) {
    const ua = navigator.userAgent;
    let deviceName = "เบราว์เซอร์ปัจจุบัน";
    if (ua.includes("Windows")) deviceName = "Windows Device";
    else if (ua.includes("Macintosh")) deviceName = "MacBook / iMac";
    else if (ua.includes("iPhone")) deviceName = "iPhone Device";
    else if (ua.includes("iPad")) deviceName = "iPad Device";
    else if (ua.includes("Android")) deviceName = "Android Device";
    else if (ua.includes("Linux")) deviceName = "Linux Device";
    nicknameInput.value = deviceName;
  }

  if (!window.PVTWebAuthn) {
    statusEl.innerHTML = `⚠️ <span style="color:#b91c1c;">ไม่สามารถโหลดไลบรารีระบบชีวมาตรได้</span>`;
    statusEl.style.backgroundColor = "#fee2e2";
    statusEl.style.color = "#991b1b";
    registerBtn.disabled = true;
    return;
  }

  const check = await window.PVTWebAuthn.isBiometricAvailable();
  if (check.supported) {
    statusEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;">check_circle</span> <span>อุปกรณ์นี้รองรับการสแกนลายนิ้วมือ / ใบหน้า</span>`;
    statusEl.style.backgroundColor = "#dcfce7";
    statusEl.style.color = "#166534";
    registerBtn.disabled = false;
  } else {
    statusEl.innerHTML = `⚠️ <span style="color:#b91c1c;">ไม่รองรับ: ${check.reason}</span>`;
    statusEl.style.backgroundColor = "#fee2e2";
    statusEl.style.color = "#991b1b";
    registerBtn.disabled = true;
  }

  // List registered devices
  await loadRegisteredBiometrics();
}

async function loadRegisteredBiometrics() {
  const listEl = document.getElementById("registeredBiometricList");
  if (!listEl) return;

  const emp = window.currentEmpProfile;
  if (!emp || !emp.id) return;

  if (!window.PVTWebAuthn) return;

  try {
    const creds = await window.PVTWebAuthn.listEmployeeCredentials(emp.id);
    if (creds.length === 0) {
      listEl.innerHTML = `
        <div style="font-size: 12.5px; color: #64748b; padding: 12px; text-align: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          ไม่มีอุปกรณ์ที่ลงทะเบียนไว้ในปัจจุบัน
        </div>
      `;
      return;
    }

    let html = "";
    creds.forEach(cred => {
      const addedDate = new Date(cred.created_at).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="material-symbols-outlined" style="color: #0d9488; font-size: 24px; background: #f0fdfa; padding: 6px; border-radius: 8px;">fingerprint</span>
            <div>
              <div style="font-size: 14px; font-weight: 600; color: #1e293b;">${cred.device_name || 'อุปกรณ์ลงทะเบียน'}</div>
              <div style="font-size: 11.5px; color: #64748b;">ลงทะเบียนเมื่อ: ${addedDate}</div>
            </div>
          </div>
          <button type="button" onclick="deleteBiometricDevice('${cred.id}')" style="background: transparent; color: #ef4444; border: 1px solid #fca5a5; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='transparent'">
            <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
            ลบ
          </button>
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (err) {
    console.error("Error rendering biometric list:", err);
    listEl.innerHTML = `
      <div style="font-size: 12.5px; color: #ef4444; padding: 10px; text-align: center; background: #fef2f2; border-radius: 8px;">
        ไม่สามารถโหลดรายการอุปกรณ์ได้
      </div>
    `;
  }
}

async function registerCurrentBiometricDevice() {
  let sessionCheck = null;
  if (window.PVTWebAuthn?.verifyActiveSession) {
    try {
      sessionCheck = await window.PVTWebAuthn.verifyActiveSession();
    } catch (e) {}
  }

  let resolvedEmp = sessionCheck?.valid ? sessionCheck.employee : null;

  if (!resolvedEmp) {
    if (window.PVTWebAuthn?.resolveEmployeeObject) {
      try {
        resolvedEmp = await window.PVTWebAuthn.resolveEmployeeObject(window.currentEmpProfile);
      } catch (e) {}
    }
  }

  if (!resolvedEmp || (!resolvedEmp.id && !resolvedEmp.employee_code)) {
    // กวาดหาข้อมูลจาก session/localStorage สำรอง
    try {
      const keys = ["currentUser", "pvt_user", "employee_session", "hr_session", "profile", "loggedInUser"];
      for (const k of keys) {
        const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.id || parsed.employee_id || parsed.employee_code)) {
            resolvedEmp = {
              id: parsed.id || parsed.employee_id || parsed.employee_code,
              employee_id: parsed.id || parsed.employee_id || parsed.employee_code,
              employee_code: parsed.employee_code || parsed.id,
              full_name: parsed.full_name || parsed.emp_name || 'พนักงาน'
            };
            window.currentEmpProfile = parsed;
            break;
          }
        }
      }
    } catch (e) {}
  }

  if (!resolvedEmp || (!resolvedEmp.id && !resolvedEmp.employee_code)) {
    Swal.fire({
      icon: 'warning',
      title: 'ไม่พบข้อมูลการเข้าสู่ระบบ',
      text: 'กรุณาเข้าสู่ระบบใหม่อีกครั้งก่อนลงทะเบียนอุปกรณ์ไบโอเมตริก',
      confirmButtonText: 'ไปหน้าเข้าสู่ระบบ',
      confirmButtonColor: '#0d9488',
      showCancelButton: true,
      cancelButtonText: 'ปิด'
    }).then((res) => {
      if (res.isConfirmed) {
        window.location.href = '/index.html';
      }
    });
    return;
  }

  const nicknameInput = document.getElementById("biometricDeviceName");
  const nickname = nicknameInput ? nicknameInput.value.trim() : "";
  if (!nickname) {
    Swal.fire('ข้อผิดพลาด', 'กรุณาระบุชื่อเรียกอุปกรณ์เพื่อความจดจำ', 'warning');
    return;
  }

  const registerBtn = document.getElementById("btnRegisterBiometric");
  if (registerBtn) registerBtn.disabled = true;

  try {
    Swal.fire({
      title: 'กำลังลงทะเบียนอุปกรณ์',
      text: 'กรุณาแตะเซนเซอร์สแกนนิ้วหรือมองกล้องตามคําแนะนําของระบบ',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const result = await window.PVTWebAuthn.registerBiometricCredential(resolvedEmp, { deviceName: nickname });

    if (result && (result.success || result.id || result.credential_id)) {
      Swal.fire({
        icon: 'success',
        title: 'ลงทะเบียนสำเร็จ!',
        text: `ลงทะเบียนอุปกรณ์ "${nickname}" สำหรับคุณ ${resolvedEmp.full_name || ''} เรียบร้อยแล้ว`,
        confirmButtonColor: '#0d9488'
      });
      await loadRegisteredBiometrics();
    } else {
      throw new Error(result?.error || 'การยืนยันสิทธิล้มเหลว');
    }
  } catch (err) {
    console.error("Register device failure:", err);

    const errMsg = String(err.message || err || '');
    const isCancelOrTimeout = (
      err.code === 'NOT_ALLOWED_ERROR' ||
      errMsg.includes('ถูกยกเลิก') ||
      errMsg.includes('หมดเวลา') ||
      errMsg.includes('NotAllowedError') ||
      errMsg.includes('NotSupportedError') ||
      errMsg.includes('canceled')
    );

    if (isCancelOrTimeout) {
      const fallbackPrompt = await Swal.fire({
        icon: 'warning',
        title: 'การสแกนถูกยกเลิก หรือไม่พบอุปกรณ์ไบโอเมตริก',
        html: `
          <div style="text-align: left; font-size: 14px; color: #475569; line-height: 1.5;">
            <p style="margin-bottom: 8px;">การสแกนลายนิ้วมือ/ใบหน้าถูกยกเลิก หรืออุปกรณ์ไม่มีเซนเซอร์ฮาร์ดแวร์ไบโอเมตริก</p>
            <p style="margin-bottom: 0; font-weight: 600; color: #0d9488;">คุณต้องการเปิดใช้งาน <strong>Passkey / กุญแจดิจิทัลประจำอุปกรณ์ (Virtual Passkey SIM)</strong> สำหรับอุปกรณ์ "${nickname}" แทนหรือไม่?</p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: '🔑 ลงทะเบียน Passkey สำรอง',
        cancelButtonText: 'ปิดหน้าต่าง',
        confirmButtonColor: '#0d9488',
        cancelButtonColor: '#64748b'
      });

      if (fallbackPrompt.isConfirmed) {
        try {
          Swal.fire({
            title: 'กำลังเปิดใช้งาน Passkey สำรอง...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
          });

          const virtualResult = await window.PVTWebAuthn.registerVirtualBiometricCredential(resolvedEmp, { deviceName: nickname });
          if (virtualResult && (virtualResult.success || virtualResult.id)) {
            Swal.fire({
              icon: 'success',
              title: 'ลงทะเบียน Passkey สำเร็จ!',
              text: `ลงทะเบียนกุญแจดิจิทัลประจำอุปกรณ์ "${nickname}" สำหรับคุณ ${resolvedEmp.full_name || ''} เรียบร้อยแล้ว`,
              confirmButtonColor: '#0d9488'
            });
            await loadRegisteredBiometrics();
            return;
          }
        } catch (vErr) {
          Swal.fire({
            icon: 'error',
            title: 'ลงทะเบียนสำรองล้มเหลว',
            text: vErr.message || 'ไม่สามารถลงทะเบียน Passkey สำรองได้',
            confirmButtonColor: '#ef4444'
          });
          return;
        }
      }
      return;
    }

    Swal.fire({
      icon: 'error',
      title: 'ลงทะเบียนไม่สำเร็จ',
      text: err.message || 'เกิดปัญหาในการเรียกใช้งานอุปกรณ์รักษาความปลอดภัยชีวมาตร',
      confirmButtonColor: '#ef4444'
    });
  } finally {
    if (registerBtn) registerBtn.disabled = false;
  }
}

async function deleteBiometricDevice(credId) {
  const confirmRes = await Swal.fire({
    title: 'ยืนยันการลบอุปกรณ์?',
    text: 'เมื่อลบแล้ว คุณจะไม่สามารถใช้ลายนิ้วมือหรือการสแกนใบหน้าของอุปกรณ์นี้ล็อกอินได้อีกต่อไป',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ใช่, ต้องการลบ',
    cancelButtonText: 'ยกเลิก'
  });

  if (!confirmRes.isConfirmed) return;

  try {
    const deleted = await window.PVTWebAuthn.deleteBiometricCredential(credId);
    if (deleted) {
      Swal.fire({
        icon: 'success',
        title: 'ลบสำเร็จ',
        text: 'ลบกุญแจความปลอดภัยอุปกรณ์นี้เสร็จเรียบร้อย',
        confirmButtonColor: '#0d9488',
        timer: 1500,
        showConfirmButton: false
      });
      await loadRegisteredBiometrics();
    } else {
      throw new Error("ลบข้อมูลไม่สำเร็จ");
    }
  } catch (err) {
    Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
  }
}

window.registerCurrentBiometricDevice = registerCurrentBiometricDevice;
window.deleteBiometricDevice = deleteBiometricDevice;



