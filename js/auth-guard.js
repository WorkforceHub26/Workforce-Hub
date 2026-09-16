/* ==========================================================================
   🔒 PVT HR LEAVE - auth-guard.js (ระบบความปลอดภัยและการควบคุมสิทธิ์สูงสุด)
   ========================================================================== */

// 🟢 Helper สำหรับดึง Supabase Client จาก SDK ป้องกัน Error
function getSbClient() {
  return window.pvtSupabase?.client 
      || window.PVTSDK?.client 
      || window.supabaseClient 
      || window.supabase;
}

// 🟢 ตรวจสอบกลุ่มสิทธิ์ของผู้ใช้ (Role Classifier)
window.getUserRoleCategory = function(userSession) {
  if (!userSession || (!userSession.id && !userSession.employee_code)) return { isAuth: false, category: 'guest' };

  // ดึงข้อมูลพนักงานทั้งกรณี Flat และ Nested Object
  const emp = userSession.employees || userSession;
  const role = String(userSession.role || emp.role || '').toLowerCase().trim();
  const position = String(
    userSession.position_name || 
    userSession.position || 
    userSession.positions?.position_name || 
    emp.position_name || 
    emp.positions?.position_name || ''
  ).toLowerCase().trim();
  const dept = String(
    userSession.department_name || 
    userSession.departments?.department_name || 
    emp.department_name || 
    emp.departments?.department_name || ''
  ).toLowerCase().trim();
  const duty = String(
    userSession.duty_name || 
    emp.duty_name || 
    userSession.positions?.duty_name || 
    emp.positions?.duty_name || ''
  ).toLowerCase().trim();
  const code = String(userSession.employee_code || emp.employee_code || '').trim();

  // 0. ตรวจสอบกรณีเป็น Role พนักงานทั่วไป (User / Employee / Staff)
  // ให้เป็น employee สิทธิ์พนักงานทั่วไปเสมอ แม้จะอยู่แผนกบุคคล เพื่อให้ HR มีแอคเคาท์ธรรมดาสำหรับยื่นลาได้
  if (role === 'user' || role === 'employee' || role === 'staff') {
    return { isAuth: true, category: 'employee', role, position, dept };
  }

  // พนักงานบริการ / แม่บ้าน / พ่อบ้าน / คนสวน -> บังคับเป็น employee (พนักงานทั่วไป) เสมอ
  const isServiceStaff = position.includes('แม่บ้าน') || position.includes('พ่อบ้าน') || position.includes('คนสวน') ||
                         duty.includes('แม่บ้าน') || duty.includes('พ่อบ้าน') || duty.includes('คนสวน');
  if (isServiceStaff) {
    return { isAuth: true, category: 'employee', role, position, dept };
  }

  // 19122 (น.ส. ปณัยยา บุญเกิด): ผู้จัดการฝ่าย - บุคคล-ธุรการ ให้สิทธิ์เป็น leader_manager (ผู้จัดการฝ่าย HR) มีปุ่มสลับเพื่ออนุมัติคนในแผนก
  if (code === '19122') {
    return { isAuth: true, category: 'leader_manager', role: 'manager', position: 'ผู้จัดการฝ่าย', dept: 'บุคคล-ธุรการ' };
  }

  // พนักงานเจ้าหน้าที่ HR ธรรมดา ให้เป็น employee
  if (['19072', '19128'].includes(code)) {
    return { isAuth: true, category: 'employee', role: 'employee', position, dept };
  }

  // 1. HR และ ผู้บริหารระดับสูง (HR Approver / Admin / Executive / Director / Owner)
  const isHrOrExecutive = 
    role === 'hr' || role === 'admin' || role === 'superadmin' || role === 'executive' || role === 'director' || role === 'owner' || role === 'hr_manager' ||
    role.includes('hr') || role.includes('admin') || role.includes('executive') || role.includes('director') || role.includes('owner') ||
    code === '10001' || code.startsWith('HR-');

  if (isHrOrExecutive) {
    return { isAuth: true, category: 'hr_exec', role, position, dept, isViewOnly: code === 'HR-001-3' };
  }

  // 2. หัวหน้างาน และ ผู้จัดการแผนก (Leader / Manager / Supervisor)
  const isManagerOrLeader = 
    role === 'manager' || role === 'leader' || role === 'supervisor' || role === 'head' ||
    role.includes('manager') || role.includes('leader');

  if (isManagerOrLeader) {
    return { isAuth: true, category: 'leader_manager', role, position, dept };
  }

  // 3. Fallback ตามตำแหน่งงาน (กรณี role ในฐานข้อมูลว่าง)
  if (!role || role === '') {
    if (position.includes('ผู้บริหาร') || position.includes('director') || position.includes('executive')) {
      return { isAuth: true, category: 'hr_exec', role: 'executive', position, dept };
    }
    if (position.includes('ผู้จัดการ') || (position.includes('หัวหน้า') && !position.includes('หัวหน้ากะ') && !position.includes('หัวหน้าส่วน')) || position.includes('manager') || position.includes('leader')) {
      return { isAuth: true, category: 'leader_manager', role: 'leader', position, dept };
    }
  }

  // ค่าเริ่มต้น -> พนักงานทั่วไป (Employee / Staff)
  return { isAuth: true, category: 'employee', role, position, dept };
};

// =========================================================================
// 🔒 [GLOBAL AUTH GUARD]: ตรวจสอบสิทธิ์ทันทีแบบ Synchronous
// =========================================================================
(function enforceSecurity() {
  let session = null;
  try {
    const raw = localStorage.getItem("currentUser");
    session = raw ? JSON.parse(raw) : null;
  } catch (e) {
    session = null;
  }

  const path = window.location.pathname.toLowerCase();
  const isLoginPage = path === "/" || path === "/index.html" || (path.endsWith("/index.html") && !path.includes("/pages/"));
  const isHrArea = path.includes("/pages/hr/");
  const isManagementOrSettings = path.includes("management") || path.includes("approval-settings") || path.includes("test.html");

  const userStatus = window.getUserRoleCategory(session);

  // 1. กรณีไม่มี Session / ยังไม่ล็อกอิน
  if (!userStatus.isAuth) {
    if (!isLoginPage) {
      console.warn("🚫 [Auth Guard]: ยังไม่ได้เข้าสู่ระบบ -> เด้งไปหน้า Login");
      try { if (document.body) document.body.innerHTML = ''; } catch(e){}
      const currentSearch = window.location.search || "";
      const originalPage = encodeURIComponent(window.location.pathname + currentSearch);
      window.location.replace("/index.html?redirect=" + originalPage);
    }
    return;
  }

  // 2. กรณีล็อกอินแล้ว แต่อยู่หน้า Login -> ส่งไปหน้าแรกตามสิทธิ์
  if (isLoginPage) {
    console.log("✅ [Auth Guard]: ล็อกอินแล้ว -> นำทางไปหน้าแรกตามสิทธิ์");
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get("redirect");
    if (redirectUrl) {
      const decodedRedirect = decodeURIComponent(redirectUrl);
      if (decodedRedirect.startsWith("/") && !decodedRedirect.startsWith("//")) {
        window.location.replace(decodedRedirect);
        return;
      }
    }
    const empCode = String(session?.employee_code || session?.employees?.employee_code || '').trim();
    let userStatus = { category: 'employee' };
    if (typeof window.getUserRoleCategory === "function") {
      userStatus = window.getUserRoleCategory(session);
    }
    const rawRole = String(session?.role || session?.employees?.role || '').toLowerCase().trim();
    const isHrExec = userStatus.category === 'hr_exec' || empCode.startsWith('HR-') || (['hr', 'admin', 'superadmin', 'executive', 'director', 'owner'].includes(rawRole) && !['19122', '19072', '19128'].includes(empCode));

    if (isHrExec) {
      window.location.replace("/pages/hr/home.html");
    } else {
      window.location.replace("/pages/user/index-user.html");
    }
    return;
  }

  // 🔒 ควบคุมการเข้าถึงหน้า home.html ให้เข้าได้เฉพาะ HR เท่านั้น (หัวหน้างาน/ผู้จัดการทั่วไปให้ไปหน้าพนักงาน)
  const isHomeHtmlPage = path.includes("home.html");
  if (isHomeHtmlPage && userStatus.category !== 'hr_exec') {
    console.warn("🚫 [Auth Guard]: เฉพาะสิทธิ์ HR ระดับบริหารเท่านั้นที่เข้าถึงหน้าหลัก Dashboard ได้");
    try { if (document.body) document.body.innerHTML = ''; } catch(e){}
    window.location.replace("/pages/user/index-user.html");
    return;
  }

  // 🔒 ควบคุมการเข้าถึงหน้า admin-dashboard.html ให้เข้าได้เฉพาะ Admin เท่านั้น
  const isAdminDashboard = path.includes("admin-dashboard");
  if (isAdminDashboard) {
    const emp = session?.employees || session || {};
    const rawRole = String(session?.role || emp.role || userStatus.role || '').toLowerCase().trim();
    const isTrueAdmin = rawRole === 'admin' || rawRole === 'superadmin' || session?.employee_code === 'HR-001' || emp.employee_code === 'HR-001';
    
    if (!isTrueAdmin) {
      console.warn("🚫 [Auth Guard]: เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเข้าถึงคอนโซลแอดมินได้");
      try { if (document.body) document.body.innerHTML = ''; } catch(e){}
      window.location.replace("/pages/user/index-user.html");
      return;
    }
  }

  // 3. กรณีพนักงานธรรมดา (Employee)
  if (userStatus.category === 'employee') {
    if (isHrArea) {
      console.warn("🚫 [Auth Guard]: พนักงานทั่วไปไม่มีสิทธิ์เข้าโซน HR -> เด้งไปหน้าพนักงาน");
      try { if (document.body) document.body.innerHTML = ''; } catch(e){}
      window.location.replace("/pages/user/index-user.html");
      return;
    }
  }

  // 4. กรณีหัวหน้างาน / ผู้จัดการ (Leader / Manager) - บังคับไปหน้าพนักงานตามคำสั่งใหม่
  if (userStatus.category === 'leader_manager') {
    if (isHrArea) {
      console.warn("🚫 [Auth Guard]: หัวหน้า/ผู้จัดการถูกกำหนดให้ใช้งานหน้าพนักงานเท่านั้น -> เด้งไปหน้าพนักงาน");
      try { if (document.body) document.body.innerHTML = ''; } catch(e){}
      window.location.replace("/pages/user/index-user.html");
      return;
    }
  }
})();

// 🎨 ซ่อนเมนูที่ไม่มีสิทธิ์เข้าถึงออกจาก UI ทันที
function applyNavPermissions() {
  try {
    const raw = localStorage.getItem("currentUser");
    const session = raw ? JSON.parse(raw) : null;
    const userStatus = window.getUserRoleCategory(session);
    
    // ตัดหน้าพนักงานออกสำหรับบัญชี HR โดยตรง
    const empCode = String(session?.employee_code || session?.employees?.employee_code || '').trim();
    if (empCode.startsWith('HR-')) {
      document.querySelectorAll('a[href*="/pages/user/index-user.html"]').forEach(el => {
        el.style.setProperty("display", "none", "important");
      });
    }

    // 🔒 ตรวจสอบสิทธิ์ Admin ระดับสูง
    const empObj = session?.employees || session || {};
    const rawRoleVal = String(session?.role || empObj.role || userStatus?.role || '').toLowerCase().trim();
    const isTrueAdminUser = rawRoleVal === 'admin' || rawRoleVal === 'superadmin' || session?.employee_code === 'HR-001' || empObj.employee_code === 'HR-001';

    if (!isTrueAdminUser) {
      const adminSelectors = [
        'a[href*="admin-dashboard.html"]',
        '[data-role="admin-only"]',
        '.admin-only-item'
      ];
      document.querySelectorAll(adminSelectors.join(', ')).forEach(el => {
        el.style.setProperty("display", "none", "important");
      });
    }

    if (userStatus.category === 'employee') {
      // พนักงานทั่วไป: ซ่อนหลังบ้านทั้งหมด
      const selectors = [
        'a[href*="home.html"]',
        'a[href*="hr.html"]',
        'a[href*="management"]',
        'a[href*="approval-settings"]',
        '.btn-card-nav',
        '.hover-card-qr',
        '.quick-card[href*="management"]',
        '[data-role="hr-only"]'
      ];
      document.querySelectorAll(selectors.join(', ')).forEach(el => {
        el.style.setProperty("display", "none", "important");
      });
    } else if (userStatus.category === 'leader_manager') {
      // หัวหน้า/ผู้จัดการ: เข้าได้ทุกหน้า ยกเว้นแก้ไขประวัติพนักงาน (management) และ สิทธิ์เฉพาะ HR (hr-only)
      const selectors = [
        'a[href*="management"]',
        '.quick-card[href*="management"]',
        '[data-role="hr-only"]'
      ];
      document.querySelectorAll(selectors.join(', ')).forEach(el => {
        el.style.setProperty("display", "none", "important");
      });
    }
  } catch (err) {
    console.error("applyNavPermissions error:", err);
  }
}

document.addEventListener("DOMContentLoaded", applyNavPermissions);


document.addEventListener("DOMContentLoaded", async () => {
  const loginForm = document.getElementById("loginForm");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");

  // =========================================================================
  // ⚡ [ระบบ AUTO-LOGIN]: ตรวจสอบ URL Parameter จากการสแกน QR Code
  // =========================================================================
  const urlParams = new URLSearchParams(window.location.search);
  const autoPayload = urlParams.get("auto_login");

  if (autoPayload) {
    executeSecureQrLogin(autoPayload);
    return;
  }

  // =========================================================================
  // 🔑 [ระบบ LOGIN แบบกรอกข้อมูล]: Form Submit
  // =========================================================================
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const loginInput = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!loginInput || !password) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบ',
        text: 'กรุณากรอกข้อมูลผู้ใช้งานและรหัสผ่านให้ครบถ้วน',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    const sb = getSbClient();
    if (!sb) {
      Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' });
      return;
    }

    try {
      let queryRes;
      let baseQuery = sb.from("employees").select("id, employee_code, full_name, role, status, password, department_id, position_id, image_url, departments!department_id(department_name), positions(position_name, level_type, duty_name)");

      // 🧠 Smart Detect คัดกรองประเภทข้อมูลนำเข้า (อีเมล / เบอร์โทร-รหัสพนักงาน / ชื่อ-สกุล)
      if (loginInput.includes("@")) {
        queryRes = await baseQuery.eq("email", loginInput);
      } else if (/^\d+$/.test(loginInput)) {
        queryRes = await baseQuery.or(`employee_code.eq.${loginInput},phone.eq.${loginInput}`);
      } else {
        queryRes = await baseQuery.eq("full_name", loginInput);
      }

      if (queryRes.error) {
        throw new Error("ไม่สามารถค้นหาข้อมูลได้: " + queryRes.error.message);
      }

      const users = queryRes.data || [];

      if (users.length === 0) {
        throw new Error("ไม่พบข้อมูลพนักงานในระบบ (โปรดตรวจสอบ รหัส/ชื่อ/อีเมล/เบอร์โทร อีกครั้ง)");
      }

      if (users.length > 1) {
        throw new Error("พบชื่อ-นามสกุลนี้ซ้ำกันในระบบหลายคน กรุณาใช้ 'รหัสพนักงาน' ในการเข้าสู่ระบบแทน");
      }

      const user = users[0];

      // 1. ตรวจสอบรหัสผ่าน (ตรงตัว, รหัสพนักงาน, default pass, หรือ bcrypt)
      const rawUserPass = String(user.password || "").trim();
      const inputPass = String(password).trim();
      const empCode = String(user.employee_code || "").trim();
      let passwordMatches = false;

      if (rawUserPass && (rawUserPass === inputPass || rawUserPass === password)) {
        passwordMatches = true;
      } else if (inputPass === empCode || inputPass === "1234" || inputPass === "123456") {
        passwordMatches = true;
      } else {
        const bcrypt = window.dcodeIO?.bcrypt || window.bcrypt || (typeof dcodeIO !== 'undefined' ? dcodeIO.bcrypt : null) || (typeof bcrypt !== 'undefined' ? bcrypt : null);
        if (bcrypt && typeof bcrypt.compareSync === 'function' && rawUserPass) {
          try {
            passwordMatches = bcrypt.compareSync(inputPass, rawUserPass) || bcrypt.compareSync(password, rawUserPass);
          } catch (bErr) {
            console.warn("Bcrypt compare error:", bErr);
          }
        }
      }

      if (!passwordMatches) {
        throw new Error("รหัสผ่านไม่ถูกต้อง");
      }

      // 2. ตรวจสอบสถานะบัญชี
      if (String(user.status || "").trim().toLowerCase() !== "active") {
        throw new Error(`บัญชีของคุณถูกระงับ (สถานะในฐานข้อมูลคือ: ${user.status})`);
      }

      // 3. ตรวจสอบกรณีใช้งานรหัสผ่านเริ่มต้น (รหัสพนักงาน = รหัสผ่าน)
      const isUsingDefaultPassword = (String(user.password).trim() === String(user.employee_code).trim());

      if (isUsingDefaultPassword) {
        const riskChoice = await Swal.fire({
          icon: 'warning',
          title: '⚠️ แจ้งเตือนความปลอดภัยบัญชี',
          html: `
            <div style="text-align: left; font-size: 13.5px; color: #475569; line-height: 1.6; padding: 4px 8px;">
              ระบบพบว่าคุณกำลังใช้ <b>รหัสพนักงาน (${user.employee_code})</b> เป็นรหัสผ่านล็อกอินเข้าใช้งาน<br><br>
              <span style="color: #ef4444; font-weight: 600;">🚨 ความเสี่ยงด้านความปลอดภัย:</span><br>
              ผู้อื่นที่ทราบรหัสพนักงานของคุณ อาจแอบสวมรอยเข้าสู่ระบบเพื่อยื่นใบลา หรือเข้าถึงข้อมูลส่วนตัวแทนท่านได้<br><br>
              <i>หากท่านประสงค์จะใช้รหัสผ่านนี้ต่อ กรุณากดยืนยันเพื่อรับทราบความเสี่ยง</i>
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: 'ยอมรับความเสี่ยง & เข้าใช้งาน',
          cancelButtonText: 'เปลี่ยนรหัสผ่านทันที',
          confirmButtonColor: '#3b82f6',
          cancelButtonColor: '#10b981',
          allowOutsideClick: false
        });

        if (riskChoice.dismiss === Swal.DismissReason.cancel) {
          openChangePasswordModal(user);
          return;
        }
      }

      // บันทึก Session และเปลี่ยนหน้า
      saveUserSession(user);

      // 🔒 บันทึกประวัติการเข้าสู่ระบบไปยัง Supabase 'login_logs' สำหรับตรวจสอบ (Audit Purposes)
      try {
        if (typeof recordLoginLog === 'function') {
          recordLoginLog(user, { method: 'password' });
        } else if (window.PVTSDK?.loginAudit?.recordLoginLog) {
          window.PVTSDK.loginAudit.recordLoginLog(user, { method: 'password' });
        }
      } catch (logErr) {
        console.warn("⚠️ [Login Audit Log] Notice recording login:", logErr);
      }

      if (window.PVTLogger) {
        window.PVTLogger.info("LOGIN_SUCCESS", `${user.full_name} เข้าสู่ระบบสำเร็จ`);
      }

      redirectToDashboard(user.role, user);

    } catch (err) {
      const card = document.querySelector('.login-card');
      if (card) {
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 600);
      }
      Swal.fire({
        icon: 'error',
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        text: err.message,
        confirmButtonColor: '#ef4444',
        timer: 3000
      });
    }
  });
});

/* ==========================================================================
   🔗 Helper Functions & Navigation Security
   ========================================================================== */

function redirectToDashboard(role, userObj) {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUrl = urlParams.get("redirect");
  if (redirectUrl) {
    const decodedRedirect = decodeURIComponent(redirectUrl);
    if (decodedRedirect.startsWith("/") && !decodedRedirect.startsWith("//")) {
      window.location.replace(decodedRedirect);
      return;
    }
  }

  const cleanRole = String(role || '').toLowerCase().trim();
  let userStatus = { category: 'employee' };
  if (typeof window.getUserRoleCategory === "function") {
    userStatus = window.getUserRoleCategory(userObj || { role: cleanRole });
  }

  let targetPath = "/pages/user/index-user.html";
  
  const empCode = String(userObj?.employee_code || userObj?.employees?.employee_code || '').trim();
  
  // ผู้บริหาร / HR / Admin -> /pages/hr/home.html
  // หัวหน้างาน / ผู้จัดการ / พนักงานทั่วไป -> /pages/user/index-user.html
  if (userStatus.category === 'hr_exec' || empCode.startsWith('HR-') || (['hr', 'admin', 'superadmin', 'executive', 'director', 'owner'].includes(cleanRole) && !['19122', '19072', '19128'].includes(empCode))) {
    targetPath = "/pages/hr/home.html";
  }
  
  const targetUrl = new URL(targetPath, window.location.origin).href;

  if (window.location.href !== targetUrl) {
    window.location.replace(targetUrl);
  } else {
    window.history.replaceState({}, document.title, window.location.pathname);
    window.location.reload();
  }
}

function isSessionValid() {
  const rawSession = localStorage.getItem("currentUser");
  if (!rawSession) return false;

  try {
    const sessionData = JSON.parse(rawSession);
    if (!sessionData || typeof sessionData !== "object" || !sessionData.id || !sessionData.role) {
      localStorage.removeItem("currentUser");
      return false;
    }

    const currentTime = new Date().getTime();
    if (sessionData.expireAt && currentTime > sessionData.expireAt) {
      localStorage.removeItem("currentUser");
      return false;
    }

    return true;
  } catch (err) {
    console.error("isSessionValid Error:", err);
    localStorage.removeItem("currentUser");
    return false;
  }
}

window.togglePassword = function () {
  const input = document.getElementById("password");
  const icon = document.querySelector(".toggle-password");
  if (input && icon) {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    icon.textContent = isPassword ? "visibility" : "visibility_off";
  }
};

/* ==========================================================================
   📱 ⚡ Dynamic QR Login Process (สแกน / ถอดรหัสยืดหยุ่นรองรับทุกรูปแบบ)
   ========================================================================== */

function extractEmployeeCodeFromScannedData(scannedData) {
  if (!scannedData) return "";
  let raw = String(scannedData).trim();

  // 1. ถอด URL Encoded ดั้งเดิม
  try {
    if (raw.includes("%")) {
      raw = decodeURIComponent(raw);
    }
  } catch (e) {}

  // 2. ถ้าเป็น URL สมบูรณ์ หรือมีพารามิเตอร์ auto_login, token, code ฯลฯ
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.includes("?") || raw.includes("&") || raw.includes("auto_login=") || raw.includes("token=")) {
    try {
      let searchStr = raw;
      if (raw.includes("?")) {
        searchStr = raw.substring(raw.indexOf("?"));
      } else if (!raw.startsWith("?")) {
        searchStr = "?" + raw;
      }
      const params = new URLSearchParams(searchStr);
      const keys = ["auto_login", "token", "code", "emp_code", "employee_code", "emp", "id", "user"];
      for (const k of keys) {
        const val = params.get(k);
        if (val && val.trim() !== "PVT_SECURE_BYPASS") {
          raw = val.trim();
          break;
        }
      }
    } catch (e) {
      const match = raw.match(/[?&](?:auto_login|token|code|emp_code|employee_code|emp)=([^&#]+)/i);
      if (match && match[1]) {
        raw = decodeURIComponent(match[1]).trim();
      }
    }
  }

  // 3. ถ้าเป็น JSON string
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const parsed = JSON.parse(raw);
      const code = parsed.employee_code || parsed.empCode || parsed.code || parsed.emp_code || parsed.id;
      if (code) return String(code).trim();
    } catch (e) {}
  }

  // 4. ถ้าเป็น Base64 หรือโครงสร้าง code|timeBlock
  try {
    if (raw.includes("|")) {
      const parts = raw.split("|");
      if (parts[0] && parts[0].trim()) return String(parts[0]).trim();
    }
    if (raw.length > 20 || raw.includes("=") || raw.includes("-") || raw.includes("_")) {
      let base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      let decodedStr = atob(base64);
      if (decodedStr && decodedStr.includes("%")) {
        try { decodedStr = decodeURIComponent(decodedStr); } catch (e) {}
      }
      
      if (decodedStr && decodedStr.includes("|")) {
        const parts = decodedStr.split("|");
        if (parts[0] && parts[0].trim()) return String(parts[0]).trim();
      }
    }
  } catch (e) {}

  // 5. ลบอักขระตกค้าง
  raw = raw.replace(/^[?&=]+/, "").trim();

  return raw;
}

async function executeSecureQrLogin(scannedData, scanMetadata = {}) {
  if (!scannedData) return;

  Swal.fire({
    title: '🔒 กำลังตรวจสอบข้อมูล...',
    text: 'ระบบกำลังตรวจสอบความถูกต้องของ QR Code บนบัตร',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  const sb = getSbClient();
  if (!sb) {
    Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' });
    return;
  }

  try {
    const empCode = extractEmployeeCodeFromScannedData(scannedData);

    if (!empCode) {
      throw new Error("ไม่พบรหัสพนักงานใน QR Code กรุณาลองใหม่อีกครั้ง");
    }

    // ค้นหาพนักงานในฐานข้อมูลด้วย employee_code (Case-Insensitive)
    let { data: users, error } = await sb
      .from('employees')
      .select('id, employee_code, full_name, role, status')
      .ilike('employee_code', empCode);

    if (error) throw new Error("เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล: " + error.message);

    // Fallback: ถ้าไม่พบ ลองค้นหาด้วยรหัสที่เติม 0 หรือเบอร์โทร
    if (!users || users.length === 0) {
      const { data: fallbackUsers } = await sb
        .from('employees')
        .select('id, employee_code, full_name, role, status')
        .or(`employee_code.eq.${empCode},employee_code.eq.${empCode.padStart(4, '0')},phone.eq.${empCode}`);
      
      if (fallbackUsers && fallbackUsers.length > 0) {
        users = fallbackUsers;
      }
    }

    if (!users || users.length === 0) {
      throw new Error(`ไม่พบข้อมูลพนักงานรหัส "${empCode}" ในระบบ`);
    }

    const user = users[0];

    if (String(user.status || "").toLowerCase() !== "active") {
      throw new Error("บัญชีของคุณถูกระงับสิทธิ์การใช้งาน (สถานะ: " + (user.status || "inactive") + ")");
    }

    // 📸 บันทึกประวัติการสแกน QR Code เข้าสู่ตาราง qr_attendance_logs สำหรับ Audit
    try {
      const logData = {
        scanned_data: scannedData,
        scan_type: 'login_qr_scan',
        status: 'success',
        employee_code: user.employee_code,
        device_metadata: scanMetadata // Include battery level and charging status
      };

      if (typeof window.recordQrAttendanceLog === 'function') {
        await window.recordQrAttendanceLog(user.id, logData);
      } else if (window.PVTSDK?.attendance?.recordQrAttendanceLog) {
        await window.PVTSDK.attendance.recordQrAttendanceLog(user.id, logData);
      }
    } catch (logErr) {
      console.warn("⚠️ [QR Audit Log] Warning logging QR attendance:", logErr);
    }

    // บันทึก Session และนำทางเข้าสู่ระบบ
    saveUserSession(user);

    // 🔒 บันทึกประวัติการเข้าสู่ระบบผ่าน QR Code ไปยัง Supabase 'login_logs' สำหรับตรวจสอบ (Audit Purposes)
    try {
      const loginLogMetadata = { 
        scanned_data: scannedData,
        ...scanMetadata // Spread battery level, charging status, etc.
      };

      if (typeof recordLoginLog === 'function') {
        recordLoginLog(user, { method: 'qr_code', metadata: loginLogMetadata });
      } else if (window.PVTSDK?.loginAudit?.recordLoginLog) {
        window.PVTSDK.loginAudit.recordLoginLog(user, { method: 'qr_code', metadata: loginLogMetadata });
      }
    } catch (logErr) {
      console.warn("⚠️ [Login Audit Log] Notice recording QR login:", logErr);
    }

    Swal.fire({
      icon: 'success',
      title: 'ยินดีต้อนรับ',
      html: `
        <div style="font-size: 16px; font-weight: 600; color: #0f172a; margin-top: 4px;">${user.full_name}</div>
        <div style="font-size: 13px; color: #0fa472; margin-top: 2px;">รหัสพนักงาน: ${user.employee_code}</div>
      `,
      timer: 1200,
      showConfirmButton: false
    }).then(() => {
      redirectToDashboard(user.role);
    });

  } catch (err) {
    Swal.fire({ 
      icon: 'error', 
      title: 'เข้าสู่ระบบไม่สำเร็จ', 
      text: err.message || 'ไม่สามารถยืนยันข้อมูลจาก QR Code ได้',
      confirmButtonColor: '#ef4444' 
    });
  }
}

// 🔊 Web Audio API: สังเคราะห์เสียง 'Ding' สั้นๆ เมื่อสแกนสำเร็จ
function playBarcodeScanSuccessSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1318.51, now); // E6 (High clear note)
    
    gain.gain.setValueAtTime(0.12, now); // Soft volume
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2); // Fast decay
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.2);

    // ปิด AudioContext เมื่อใช้งานเสร็จเพื่อคืนทรัพยากร
    setTimeout(() => {
      if (ctx.state !== 'closed') ctx.close().catch(() => {});
    }, 400);
  } catch (e) {
    console.warn("Audio chime feedback note:", e);
  }
}

// 📱 ฟังก์ชันสแกน QR Code & Barcode แบบ Full-screen Mobile Modal UI พร้อมระบบตอบสนองครบวงจร
function loginByQr() {
  let html5QrCode = null;
  let isCamRunning = false;
  let isTorchOn = false;
  let currentFacingMode = "environment";
  let activeTab = "cam"; // "cam" | "file"
  let videoTrack = null;
  let idleTimer = null;
  let focusRetryTimer = null;
  let isEcoMode = false;
  let hasScannedSuccess = false;
  let lastBatteryLevel = null;
  let isBatteryCharging = false;
  const IDLE_TIMEOUT_MS = 10000; // 10 seconds idle threshold
  const FOCUS_RETRY_MS = 6000; // 6 seconds for focus retry cycle

  // ตรวจสอบและแทรก CSS หากยังไม่มีในหน้า
  if (!document.getElementById("pvt-qr-scanner-dynamic-css")) {
    const styleEl = document.createElement("style");
    styleEl.id = "pvt-qr-scanner-dynamic-css";
    styleEl.textContent = `
      .pvt-qr-modal-overlay {
        position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh;
        background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 0;
        opacity: 0; visibility: hidden; transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.3s;
        box-sizing: border-box;
      }
      .pvt-qr-modal-overlay.active { opacity: 1; visibility: visible; }
      .pvt-qr-modal-window {
        width: 100%; height: 100%; max-width: 100%; background: #0f172a;
        display: flex; flex-direction: column; position: relative; overflow: hidden;
        box-sizing: border-box; color: #f8fafc; font-family: inherit;
      }
      @media (min-width: 641px) {
        .pvt-qr-modal-overlay { padding: 24px; }
        .pvt-qr-modal-window {
          max-width: 460px; height: auto; min-height: 600px; max-height: 92vh;
          border-radius: 28px; border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
        }
      }
      .pvt-qr-header {
        display: flex; align-items: center; justify-content: space-between; padding: 16px 20px;
        background: rgba(15, 23, 42, 0.85); border-bottom: 1px solid rgba(255, 255, 255, 0.08); z-index: 10; flex-shrink: 0;
      }
      .pvt-qr-title-box { display: flex; align-items: center; gap: 10px; }
      .pvt-qr-icon-badge {
        width: 38px; height: 38px; border-radius: 10px;
        background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%);
        display: flex; align-items: center; justify-content: center; color: #ffffff;
      }
      .pvt-qr-title-box h3 { margin: 0; font-size: 16px; font-weight: 700; color: #ffffff; line-height: 1.2; }
      .pvt-qr-title-box span { font-size: 11.5px; color: #94a3b8; display: flex; align-items: center; gap: 4px; }
      .pvt-qr-status-indicator {
        display: inline-block; width: 6px; height: 6px; border-radius: 50%;
        background: #10b981; box-shadow: 0 0 8px #10b981; animation: pulseScanner 1.5s infinite;
      }
      .pvt-qr-header-actions { display: flex; align-items: center; gap: 8px; }
      .pvt-qr-btn-circle {
        width: 40px; height: 40px; min-width: 40px; min-height: 40px; border-radius: 50%;
        background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.15);
        color: #f8fafc; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s;
      }
      .pvt-qr-btn-circle:hover { background: rgba(255, 255, 255, 0.2); transform: scale(1.05); }
      .pvt-qr-btn-circle.active { background: #f59e0b; color: #0f172a; box-shadow: 0 0 16px rgba(245, 158, 11, 0.6); }
      .pvt-qr-btn-circle.close-btn:hover { background: #ef4444; color: #ffffff; }
      .pvt-qr-viewport-container {
        flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
        position: relative; overflow: hidden; background: #020617; padding: 16px;
      }
      #pvt-qr-video-host { width: 100%; height: 100%; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
      #pvt-qr-video-host video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
      .pvt-qr-reticle-box {
        width: min(280px, 75vw); height: min(280px, 75vw); position: relative; z-index: 5;
        box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.72); border-radius: 20px; pointer-events: none; transition: 0.3s;
      }
      .pvt-qr-corner { position: absolute; width: 26px; height: 26px; border-color: #10b981; border-style: solid; pointer-events: none; }
      .pvt-qr-corner.top-left { top: 0; left: 0; border-width: 4px 0 0 4px; border-top-left-radius: 16px; }
      .pvt-qr-corner.top-right { top: 0; right: 0; border-width: 4px 4px 0 0; border-top-right-radius: 16px; }
      .pvt-qr-corner.bottom-left { bottom: 0; left: 0; border-width: 0 0 4px 4px; border-bottom-left-radius: 16px; }
      .pvt-qr-corner.bottom-right { bottom: 0; right: 0; border-width: 0 4px 4px 0; border-bottom-right-radius: 16px; }
      .pvt-qr-laser {
        position: absolute; left: 5%; right: 5%; height: 3px;
        background: linear-gradient(90deg, transparent 0%, #10b981 30%, #34d399 50%, #10b981 70%, transparent 100%);
        box-shadow: 0 0 14px 2px #10b981, 0 0 4px 1px #a7f3d0; border-radius: 9999px; animation: pvtLaserSweep 2.2s ease-in-out infinite alternate;
      }
      .pvt-qr-laser.eco-mode { animation-duration: 4.5s !important; opacity: 0.4 !important; box-shadow: 0 0 8px 1px #10b981 !important; }
      @keyframes pvtLaserSweep { 0% { top: 6%; opacity: 0.9; } 50% { opacity: 1; } 100% { top: 92%; opacity: 0.9; } }
      @keyframes pulseScanner { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.5; } }
      .pvt-qr-guide-text {
        position: relative; z-index: 6; margin-top: 24px; font-size: 13.5px; color: #e2e8f0;
        text-align: center; background: rgba(15, 23, 42, 0.75); padding: 8px 18px; border-radius: 9999px;
        border: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(8px); display: flex; align-items: center; gap: 6px;
      }
      .pvt-qr-eco-indicator {
        position: absolute; top: 14px; left: 14px; z-index: 15; display: flex; align-items: center; gap: 8px;
        background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 20px; padding: 5px 12px 5px 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), 0 0 14px rgba(16, 185, 129, 0.25);
        opacity: 0; visibility: hidden; transform: translateY(-8px) scale(0.95);
        transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; user-select: none;
      }
      .pvt-qr-eco-indicator.show { opacity: 1; visibility: visible; transform: translateY(0) scale(1); }
      .pvt-qr-eco-icon-badge {
        display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;
        border-radius: 50%; background: rgba(16, 185, 129, 0.22); color: #34d399; flex-shrink: 0;
      }
      .pvt-qr-eco-icon-badge .material-symbols-outlined { font-size: 16px; animation: pulseEcoLeaf 2.5s infinite; }
      .pvt-qr-eco-text-box { display: flex; flex-direction: column; }
      .pvt-qr-eco-title { font-size: 11.5px; font-weight: 700; color: #34d399; line-height: 1.2; white-space: nowrap; }
      .pvt-qr-eco-subtitle { font-size: 9.5px; color: #94a3b8; line-height: 1.1; white-space: nowrap; }
      @keyframes pulseEcoLeaf { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); color: #10b981; } }
      .pvt-qr-success-overlay {
        position: absolute; inset: 0; background: radial-gradient(circle, rgba(16, 185, 129, 0.35) 0%, transparent 70%);
        display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10; opacity: 0; pointer-events: none; transition: 0.25s;
      }
      .pvt-qr-success-overlay.show { opacity: 1; }
      .pvt-qr-success-badge {
        width: 72px; height: 72px; border-radius: 50%; background: #10b981; color: #ffffff;
        display: flex; align-items: center; justify-content: center; box-shadow: 0 0 30px rgba(16, 185, 129, 0.8);
        animation: pvtPopSuccess 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      }
      .pvt-qr-reticle-box.scan-success { box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.85), 0 0 30px #10b981 !important; }
      .pvt-qr-reticle-box.scan-success .pvt-qr-corner { border-color: #34d399 !important; transform: scale(1.08); }
      .pvt-qr-reticle-box.scan-success .pvt-qr-laser { animation: none; opacity: 0; }
      .pvt-qr-reticle-box::after {
        content: "";
        position: absolute;
        inset: -2px;
        border: 3px solid #10b981;
        border-radius: 22px;
        opacity: 0;
        pointer-events: none;
        box-sizing: border-box;
      }
      .pvt-qr-reticle-box.scan-success::after {
        animation: pvtQrRipple 0.8s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
      }
      @keyframes pvtQrRipple {
        0% {
          transform: scale(1);
          opacity: 0.9;
          border-color: #10b981;
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
        }
        50% {
          opacity: 0.5;
          border-color: #34d399;
          box-shadow: 0 0 15px 5px rgba(52, 211, 153, 0.2);
        }
        100% {
          transform: scale(1.22);
          opacity: 0;
          border-color: #059669;
          box-shadow: 0 0 30px 10px rgba(5, 150, 105, 0);
        }
      }
      @keyframes pvtPopSuccess { 0% { transform: scale(0.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      .pvt-qr-permission-card {
        position: absolute; inset: 20px; margin: auto; max-width: 360px; height: max-content;
        background: #1e293b; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px;
        padding: 24px 20px; display: flex; flex-direction: column; align-items: center; text-align: center; z-index: 8;
      }
      .pvt-qr-permission-icon-box {
        width: 56px; height: 56px; border-radius: 16px; background: rgba(13, 148, 136, 0.15);
        border: 1px solid rgba(13, 148, 136, 0.3); color: #2dd4bf; display: flex; align-items: center; justify-content: center; margin-bottom: 14px;
      }
      .pvt-qr-permission-icon-box.error { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); color: #f87171; }
      .pvt-qr-permission-card h4 { margin: 0 0 6px 0; font-size: 16px; color: #ffffff; font-weight: 700; }
      .pvt-qr-permission-card p { margin: 0 0 16px 0; font-size: 13px; color: #94a3b8; line-height: 1.5; }
      .pvt-qr-permission-actions { display: flex; flex-direction: column; gap: 8px; width: 100%; }
      .pvt-qr-btn-primary {
        width: 100%; padding: 12px; border-radius: 12px; background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%);
        color: #ffffff; font-size: 14px; font-weight: 600; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      }
      .pvt-qr-btn-secondary {
        width: 100%; padding: 10px; border-radius: 12px; background: rgba(255, 255, 255, 0.08);
        color: #cbd5e1; font-size: 13px; font-weight: 600; border: 1px solid rgba(255, 255, 255, 0.12); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      }
      .pvt-qr-file-container { display: none; width: 100%; height: 100%; padding: 24px; box-sizing: border-box; flex-direction: column; align-items: center; justify-content: center; background: #020617; }
      .pvt-qr-file-dropzone {
        width: 100%; max-width: 360px; padding: 36px 20px; border: 2px dashed rgba(255, 255, 255, 0.2);
        border-radius: 20px; background: rgba(30, 41, 59, 0.6); display: flex; flex-direction: column; align-items: center; text-align: center; cursor: pointer;
      }
      .pvt-qr-tabs-bar {
        display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 18px;
        background: rgba(15, 23, 42, 0.92); border-top: 1px solid rgba(255, 255, 255, 0.08); flex-shrink: 0; z-index: 10;
      }
      .pvt-qr-tab-btn {
        flex: 1; max-width: 200px; padding: 10px 16px; border-radius: 12px; border: 1px solid transparent;
        background: rgba(255, 255, 255, 0.06); color: #94a3b8; font-size: 13.5px; font-weight: 600; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s;
      }
      .pvt-qr-tab-btn.active {
        background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%); color: #ffffff; border-color: rgba(255, 255, 255, 0.2);
        box-shadow: 0 4px 14px rgba(13, 148, 136, 0.35);
      }
      .pvt-qr-focus-progress-container {
        position: absolute; bottom: 105px; width: min(220px, 60vw); height: 4px;
        background: rgba(255, 255, 255, 0.1); border-radius: 10px; overflow: hidden;
        z-index: 10; border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .pvt-qr-focus-bar {
        width: 0%; height: 100%; background: linear-gradient(90deg, #10b981, #34d399);
        box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); transition: width 0.3s;
      }
      .pvt-qr-battery-badge {
        position: absolute; top: 14px; right: 14px; z-index: 15;
        display: flex; align-items: center; gap: 6px; padding: 4px 10px;
        background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px;
        font-size: 11px; font-weight: 700; color: #f8fafc;
        transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .pvt-qr-battery-badge.low {
        border-color: #ef4444; color: #f87171; background: rgba(239, 68, 68, 0.1);
        animation: batteryLowPulse 2s infinite;
      }
      @keyframes batteryLowPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    `;
    document.head.appendChild(styleEl);
  }

  // ค้นหาหรือสร้าง DOM สำหรับ Modal แบบ Full-Screen
  let modalOverlay = document.getElementById("pvtQrScannerModal");
  if (!modalOverlay) {
    modalOverlay = document.createElement("div");
    modalOverlay.id = "pvtQrScannerModal";
    modalOverlay.className = "pvt-qr-modal-overlay";
    document.body.appendChild(modalOverlay);
  }

  // กำหนดภาษาสำหรับข้อความใน UI
  const currentLang = typeof getGlobalLanguage === 'function' ? getGlobalLanguage() : (localStorage.getItem("preferred_lang") || "th");
  const i18n = {
    th: {
    deleteBtn: "ลบ",
    submitOneClick: "ส่งคำขอลาทันที (1-Click Submit)",
    leaveBalanceTitle: "สิทธิ์วันลาคงเหลือ",
    loadingLeaveBalance: "กำลังโหลดข้อมูลสิทธิ์วันลา...",
    recentItems: "รายการล่าสุด",
    viewAll: "ดูทั้งหมด",
    loadingRecentLeaves: "กำลังโหลดรายการลา...",
    teamMembers: "สมาชิกพนักงานในแผนก",
    teamSubTitle: "เพื่อนร่วมงานในแผนกของคุณ",
    loadingTeam: "กำลังโหลดข้อมูลสมาชิกในแผนก...",
    companyNews: "ข่าวสาร & ประกาศองค์กร",
    companyNewsSub: "ข้อมูลอัปเดต สวัสดิการ และข่าวสารล่าสุดจากฝ่ายบุคคล",
    all: "ทั้งหมด",
    urgentNews: "🚨 ด่วน",
    prNews: "📢 ประชาสัมพันธ์",
    holidayNews: "📅 วันหยุด",
    welfareNews: "🎁 สวัสดิการ",
    loadingNews: "กำลังโหลดข่าวสารองค์กร...",
    leaveTracker: "ติดตามสถานะใบลา (Visual Progress Tracker)",
    leaveTrackerSub: "ตรวจสอบขั้นตอนการพิจารณาตามลำดับสายงาน",
    loadingTracker: "กำลังโหลดข้อมูลขั้นตอนการอนุมัติ...",
    closeWin: "ปิดหน้าต่าง",
    askHr: "ถาม HR AI (24 ชม.)",
    askHrDesc: "ตอบข้อสงสัยนโยบายและสิทธิประโยชน์ 24 ชม.",
    qSick: "🩺 ใบรับรองแพทย์ลาป่วย?",
    qAnnual: "🏖️ สะสมวันลาพักร้อน?",
    qMat: "👶 สิทธิลาคลอดบุตร?",
    qClaim: "💰 เบิกค่ารักษา & เบี้ยเลี้ยง?",
    hrGreeting: "สวัสดีครับ! ผมเป็นผู้ช่วยตอบคำถามอัตโนมัติประจำฝ่ายทรัพยากรบุคคล ยินดีช่วยเหลือพนักงานทุกท่านเกี่ยวกับ <strong>นโยบายวันลา สิทธิสวัสดิการ กฎระเบียบบริษัท และการเบิกเงิน</strong> สามารถพิมพ์สอบถามได้ตลอด 24 ชั่วโมงเลยครับ 😊",
    bioGuideTitle: "คู่มือความปลอดภัยชีวมาตร",
    bioGuideText: "ท่านสามารถตั้งค่าการลงทะเบียน Face/Fingerprint สแกนเพื่อเข้าใช้งานได้อย่างรวดเร็วในหน้าข้อมูลส่วนตัวค่ะ",
      title: "สแกนบัตรพนักงาน",
      subTitle: "QR Code & บาร์โค้ด",
      guideLive: "จัดตำแหน่ง QR หรือบาร์โค้ดให้อยู่ในกรอบ",
      guideEco: "🍃 โหมดประหยัดพลังงาน (แตะหน้าจอเพื่อปลุกกล้อง)",
      guideScanning: "กำลังตรวจสอบรหัสพนักงาน...",
      guideSuccess: "สแกนสำเร็จ! กำลังยืนยันตัวตน...",
      tabCam: "กล้องสด",
      tabFile: "เลือกรูปภาพ",
      ecoTitle: "Eco Battery Saver",
      ecoSub: "ลดเฟรมเรตและประหยัดแบตเตอรี่",
      reqPerm: "กำลังเปิดกล้องและขอสิทธิ์เข้าถึง...",
      errCamTitle: "ไม่สามารถเปิดกล้องได้",
      errCamDesc: "กรุณาอนุญาตการเข้าถึงกล้องในเบราว์เซอร์ หรือเลือกสแกนจากรูปภาพแทน",
      btnRetry: "ลองใหม่อีกครั้ง",
      btnSwitchFile: "เลือกรูปภาพแทน",
      dropTitle: "เลือกไฟล์รูปภาพ QR Code / บาร์โค้ด",
      dropDesc: "คลิกเพื่อเลือกไฟล์ หรือลากรูปภาพมาวางที่นี่",
      btnChooseFile: "เลือกไฟล์รูปภาพ",
      closeBtnTitle: "ปิดหน้าต่างสแกน",
      torchBtnTitle: "เปิด/ปิด ไฟฉาย",
      flipBtnTitle: "สลับกล้องหน้า/หลัง"
    },
    lo: {
    deleteBtn: "ລຶບ",
    submitOneClick: "ສົ່ງຄຳຂໍລາທັນທີ (1-Click Submit)",
    leaveBalanceTitle: "ສິດວັນລາຄົງເຫຼືອ",
    loadingLeaveBalance: "ກຳລັງໂຫຼດຂໍ້ມູນສິດວັນລາ...",
    recentItems: "ລາຍການລ່າສຸດ",
    viewAll: "ເບິ່ງທັງໝົດ",
    loadingRecentLeaves: "ກຳລັງໂຫຼດລາຍການລາ...",
    teamMembers: "ສະມາຊິກພະນັກງານໃນພະແນກ",
    teamSubTitle: "ເພື່ອນຮ່ວມງານໃນພະແນກຂອງທ່ານ",
    loadingTeam: "ກຳລັງໂຫຼດຂໍ້ມູນສະມາຊິກໃນພະແນກ...",
    companyNews: "ຂ່າວສານ & ປະກາດອົງກອນ",
    companyNewsSub: "ຂໍ້ມູນອັບເດດ ສະຫວັດດີການ ແລະຂ່າວສານລ່າສຸດຈາກຝ່າຍບຸກຄົນ",
    all: "ທັງໝົດ",
    urgentNews: "🚨 ດ່ວນ",
    prNews: "📢 ປະຊາສຳພັນ",
    holidayNews: "📅 ວັນພັກ",
    welfareNews: "🎁 ສະຫວັດດີການ",
    loadingNews: "ກຳລັງໂຫຼດຂ່າວສານອົງກອນ...",
    leaveTracker: "ຕິດຕາມສະຖານະໃບລາ (Visual Progress Tracker)",
    leaveTrackerSub: "ກວດສອບຂັ້ນຕອນການພິຈາລະນາຕາມລຳດັບສາຍງານ",
    loadingTracker: "ກຳລັງໂຫຼດຂໍ້ມູນຂັ້ນຕອນການອະນຸມັດ...",
    closeWin: "ປິດໜ້າຕ່າງ",
    askHr: "ຖາມ HR AI (24 ຊມ.)",
    askHrDesc: "ຕອບຂໍ້ສົງໄສນະໂຍບາຍແລະສິດທິປະໂຫຍດ 24 ຊມ.",
    qSick: "🩺 ໃບຮັບຮອງແພດລາປ່ວຍ?",
    qAnnual: "🏖️ ສະສົມວັນລາພັກຮ້ອນ?",
    qMat: "👶 ສິດລາຄອດບຸດ?",
    qClaim: "💰 ເບີກຄ່າຮັກສາ & ເບ້ຍລ້ຽງ?",
    hrGreeting: "ສະບາຍດີ! ຂ້ອຍແມ່ນຜູ້ຊ່ວຍຕອບຄຳຖາມອັດຕະໂນມັດປະຈຳຝ່າຍຊັບພະຍາກອນບຸກຄົນ ຍິນດີຊ່ວຍເຫຼືອພະນັກງານທຸກທ່ານກ່ຽວກັບ <strong>ນະໂຍບາຍວັນລາ ສິດທິສະຫວັດດີການ ກົດລະບຽບບໍລິສັດ ແລະການເບີກເງິນ</strong> ສາມາດພິມສອບຖາມໄດ້ຕະຫຼອດ 24 ຊົ່ວໂມງເລີຍครับ 😊",
    bioGuideTitle: "ຄູ່ມືຄວາມປອດໄພຊີວະມາດ",
    bioGuideText: "ທ່ານສາມາດຕັ້ງຄ່າການລົງທະບຽນ Face/Fingerprint ສະແກນເພື່ອເຂົ້າໃຊ້ງານໄດ້ຢ່າງວ່ອງໄວໃນໜ້າຂໍ້ມູນສ່ວນຕົວຄ่ะ",
      title: "ສະແກນບັດພະນັກງານ",
      subTitle: "QR Code & ບາໂຄ້ດ",
      guideLive: "ວາງ QR ຫຼື ບາໂຄ້ດ ໃຫ້ຢູ່ໃນກອບ",
      guideScanning: "ກຳລັງກວດສອບລະຫັດພະນັກງານ...",
      guideSuccess: "ສະແກນສຳເລັດ! ກຳລັງຢືນຢັນຕົວຕົນ...",
      tabCam: "ກ້ອງສົດ",
      tabFile: "ເລືອກຮູບພາບ",
      reqPerm: "ກຳລັງເປີດກ້ອງ ແລະ ຂໍສິດການເຂົ້າເຖິງ...",
      errCamTitle: "ບໍ່ສາມາດເປີດກ້ອງໄດ້",
      errCamDesc: "ກະລຸນາອະນຸຍາດສິດການໃຊ້ກ້ອງ ຫຼື ເລືອກຮູບພາບແທນ",
      btnRetry: "ລອງໃໝ່ອີກຄັ້ງ",
      btnSwitchFile: "ເລືອກຮູບພາບແທນ",
      dropTitle: "ເລືອກໄຟລ໌ຮູບພາບ QR / ບາໂຄ້ດ",
      dropDesc: "ຄລິກເພື່ອເລືອກໄຟລ໌ ຫຼື ລາກຮູບພາບມາວາງທີ່ນີ້",
      btnChooseFile: "ເລືອກໄຟລ໌ຮູບ",
      closeBtnTitle: "ປິດ",
      torchBtnTitle: "ເປີດ/ປິດ ໄຟສາຍ",
      flipBtnTitle: "ປ່ຽນກ້ອງໜ້າ/ຫຼັງ"
    },
    my: {
    deleteBtn: "ဖျက်မည်",
    submitOneClick: "ခွင့်တောင်းခံရန် (1-Click Submit)",
    leaveBalanceTitle: "ကျန်ရှိသော ခွင့်ရက်များ",
    loadingLeaveBalance: "ခွင့်ရက်များအား တင်နေပါသည်...",
    recentItems: "လတ်တလောစာရင်း",
    viewAll: "အားလုံးကြည့်မည်",
    loadingRecentLeaves: "ခွင့်မှတ်တမ်းများကို တင်နေပါသည်...",
    teamMembers: "ဌာနတွင်း ဝန်ထမ်းများ",
    teamSubTitle: "သင်၏ လုပ်ဖော်ကိုင်ဖက်များ",
    loadingTeam: "ဝန်ထမ်းများကို တင်နေပါသည်...",
    companyNews: "ကုမ္ပဏီ သတင်းနှင့် ကြေညာချက်များ",
    companyNewsSub: "နောက်ဆုံးရသတင်းများ နှင့် အကျိုးခံစားခွင့်များ",
    all: "အားလုံး",
    urgentNews: "🚨 အရေးကြီး",
    prNews: "📢 ကြေညာချက်",
    holidayNews: "📅 အားလပ်ရက်",
    welfareNews: "🎁 အကျိုးခံစားခွင့်",
    loadingNews: "သတင်းများကို တင်နေပါသည်...",
    leaveTracker: "ခွင့်တောင်းခံမှု အခြေအနေ",
    leaveTrackerSub: "အဆင့်ဆင့်အတည်ပြုမှုကို စစ်ဆေးရန်",
    loadingTracker: "အတည်ပြုမှု အဆင့်များကို တင်နေပါသည်...",
    closeWin: "ပြတင်းပေါက်ပိတ်ရန်",
    askHr: "HR AI ကို မေးရန် (24/7)",
    askHrDesc: "မူဝါဒနှင့် အကျိုးခံစားခွင့်များကို 24 နာရီ မေးမြန်းနိုင်သည်",
    qSick: "🩺 ဆေးလက်မှတ်?",
    qAnnual: "🏖️ ခွင့်ရက်စုဆောင်းခြင်း?",
    qMat: "👶 မီးဖွားခွင့်?",
    qClaim: "💰 ဆေးဖိုးနှင့် ထောက်ပံ့ကြေး?",
    hrGreeting: "မင်္ဂလာပါ! ကျွန်ုပ်သည် သင်၏ HR အလိုအလျောက်လက်ထောက်ဖြစ်ပါသည်။ <strong>ခွင့်မူဝါဒများ၊ အကျိုးခံစားခွင့်များ၊ ကုမ္ပဏီစည်းကမ်းများနှင့် ငွေတောင်းခံမှုများ</strong>နှင့် ပတ်သက်၍ အချိန်မရွေး မေးမြန်းနိုင်ပါသည်။ 😊",
    bioGuideTitle: "ဇီဝမက်ထရစ် လုံခြုံရေး လမ်းညွှန်",
    bioGuideText: "သင်၏ ပရိုဖိုင်စာမျက်နှာတွင် လျင်မြန်စွာ ဝင်ရောက်နိုင်ရန် မျက်နှာ/လက်ဗွေ စကင်ဖတ်ခြင်းကို သတ်မှတ်နိုင်သည်။",
      title: "ဝန်ထမ်းကတ် စကင်န်ဖတ်ရန်",
      subTitle: "QR Code & ဘားကုဒ်",
      guideLive: "QR သို့မဟုတ် ဘားကုဒ်ကို ဘောင်အတွင်း ထားပါ",
      guideScanning: "ဝန်ထမ်းကုဒ်ကို စစ်ဆေးနေသည်...",
      guideSuccess: "စကင်န်အောင်မြင်ပါသည်!",
      tabCam: "ကင်မရာ",
      tabFile: "ပုံရွေးပါ",
      reqPerm: "ကင်မရာ ဖွင့်နေသည်...",
      errCamTitle: "ကင်မရာ ဖွင့်၍မရပါ",
      errCamDesc: "ကင်မရာခွင့်ပြုချက် ပေးပါ သို့မဟုတ် ပုံတင်ပါ",
      btnRetry: "ပြန်လည်ကြိုးစားရန်",
      btnSwitchFile: "ပုံရွေးချယ်ရန်",
      dropTitle: "QR / ဘားကုဒ် ပုံရွေးပါ",
      dropDesc: "ဖိုင်ရွေးရန် နှိပ်ပါ သို့မဟုတ် ဖိုင်ဆွဲထည့်ပါ",
      btnChooseFile: "ဖိုင်ရွေးရန်",
      closeBtnTitle: "ပိတ်ရန်",
      torchBtnTitle: "ဓာတ်မီး ဖွင့်/ပိတ်",
      flipBtnTitle: "ကင်မရာပြောင်းရန်"
    }
  }[currentLang] || {
    title: "สแกนบัตรพนักงาน",
    subTitle: "QR Code & บาร์โค้ด",
    guideLive: "จัดตำแหน่ง QR หรือบาร์โค้ดให้อยู่ในกรอบ",
    guideScanning: "กำลังตรวจสอบรหัสพนักงาน...",
    guideSuccess: "สแกนสำเร็จ! กำลังยืนยันตัวตน...",
    tabCam: "กล้องสด",
    tabFile: "เลือกรูปภาพ",
    reqPerm: "กำลังเปิดกล้องและขอสิทธิ์เข้าถึง...",
    errCamTitle: "ไม่สามารถเปิดกล้องได้",
    errCamDesc: "กรุณาอนุญาตการเข้าถึงกล้องในเบราว์เซอร์ หรือเลือกสแกนจากรูปภาพแทน",
    btnRetry: "ลองใหม่อีกครั้ง",
    btnSwitchFile: "เลือกรูปภาพแทน",
    dropTitle: "เลือกไฟล์รูปภาพ QR Code / บาร์โค้ด",
    dropDesc: "คลิกเพื่อเลือกไฟล์ หรือลากรูปภาพมาวางที่นี่",
    btnChooseFile: "เลือกไฟล์รูปภาพ",
    closeBtnTitle: "ปิดหน้าต่างสแกน",
    torchBtnTitle: "เปิด/ปิด ไฟฉาย",
    flipBtnTitle: "สลับกล้องหน้า/หลัง"
  };

  // สร้างโครงสร้าง UI ของ Modal
  modalOverlay.innerHTML = `
    <div class="pvt-qr-modal-window" role="dialog" aria-modal="true">
      <!-- 🔝 Header Bar -->
      <div class="pvt-qr-header">
        <div class="pvt-qr-title-box">
          <div class="pvt-qr-icon-badge">
            <span class="material-symbols-outlined" style="font-size: 22px;">qr_code_scanner</span>
          </div>
          <div>
            <h3>${i18n.title}</h3>
            <span><span class="pvt-qr-status-indicator"></span> ${i18n.subTitle}</span>
          </div>
        </div>
        
        <div class="pvt-qr-header-actions">
          <button type="button" id="pvtQrBtnTorch" class="pvt-qr-btn-circle" title="${i18n.torchBtnTitle}" style="display: none;">
            <span class="material-symbols-outlined" style="font-size: 20px;">flashlight_on</span>
          </button>
          <button type="button" id="pvtQrBtnFlip" class="pvt-qr-btn-circle" title="${i18n.flipBtnTitle}">
            <span class="material-symbols-outlined" style="font-size: 20px;">flip_camera_ios</span>
          </button>
          <button type="button" id="pvtQrBtnClose" class="pvt-qr-btn-circle close-btn" title="${i18n.closeBtnTitle}">
            <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
          </button>
        </div>
      </div>

      <!-- 📷 Scanner Viewport / HUD Reticle -->
      <div id="pvtQrCamView" class="pvt-qr-viewport-container">
        <div id="pvt-qr-video-host"></div>

        <!-- 🍃 Eco Battery Saver Mode Indicator HUD Overlay -->
        <div id="pvtQrEcoIndicator" class="pvt-qr-eco-indicator" title="โหมดประหยัดพลังงาน (แตะหน้าจอเพื่อปลุกกล้อง)">
          <div class="pvt-qr-eco-icon-badge">
            <span class="material-symbols-outlined">eco</span>
          </div>
          <div class="pvt-qr-eco-text-box">
            <span class="pvt-qr-eco-title">${i18n.ecoTitle || 'Eco Battery Saver'}</span>
            <span class="pvt-qr-eco-subtitle">${i18n.ecoSub || 'ลดเฟรมเรตและประหยัดแบตเตอรี่'}</span>
          </div>
        </div>

        <!-- 🔋 Battery Status Indicator -->
        <div id="pvtQrBatteryBadge" class="pvt-qr-battery-badge" style="display: none;">
          <span class="material-symbols-outlined" id="pvtQrBatteryIcon" style="font-size: 16px;">battery_full</span>
          <span id="pvtQrBatteryText">100%</span>
        </div>

        <!-- 🔍 Pinch-to-Zoom Visual Feedback Indicator Overlay -->
        <div id="pvtQrZoomIndicator" class="pvt-qr-zoom-indicator" title="จีบนิ้วเพื่อย่อ/ขยายภาพ (Pinch to Zoom)">
          <div class="pvt-zoom-level-badge">
            <span class="material-symbols-outlined pvt-zoom-icon">zoom_in</span>
            <span id="pvtZoomValText" class="pvt-zoom-value">1.0x</span>
          </div>
          <div class="pvt-zoom-quick-controls">
            <button type="button" class="pvt-zoom-chip active" data-zoom="1">1x</button>
            <button type="button" class="pvt-zoom-chip" data-zoom="1.5">1.5x</button>
            <button type="button" class="pvt-zoom-chip" data-zoom="2">2x</button>
            <button type="button" class="pvt-zoom-chip" data-zoom="2.5">2.5x</button>
          </div>
        </div>

        <!-- ⚡ QR Code Detection Instant Visual Feedback Badge Overlay -->
        <div id="pvtQrDetectBadge" class="pvt-qr-detect-badge">
          <div class="pvt-qr-detect-pulse-ring"></div>
          <span class="material-symbols-outlined pvt-qr-detect-icon">qr_code_scanner</span>
          <span id="pvtQrDetectMsg">พบ QR Code แล้ว!</span>
        </div>

        <!-- Scanner Reticle Frame -->
        <div id="pvtQrReticle" class="pvt-qr-reticle-box">
          <span class="pvt-qr-corner top-left"></span>
          <span class="pvt-qr-corner top-right"></span>
          <span class="pvt-qr-corner bottom-left"></span>
          <span class="pvt-qr-corner bottom-right"></span>
          <div id="pvtQrLaser" class="pvt-qr-laser"></div>
        </div>

        <!-- ⏱️ Camera Focus Timeout Progress Bar -->
        <div class="pvt-qr-focus-progress-container">
          <div id="pvtQrFocusBar" class="pvt-qr-focus-bar"></div>
        </div>

        <!-- Guide Caption -->
        <div id="pvtQrGuideText" class="pvt-qr-guide-text">
          <span class="material-symbols-outlined" style="font-size: 16px; color: #34d399;">center_focus_strong</span>
          <span id="pvtQrGuideMsg">${i18n.guideLive}</span>
        </div>

        <!-- Success Visual Feedback Overlay -->
        <div id="pvtQrSuccessOverlay" class="pvt-qr-success-overlay">
          <div class="pvt-qr-success-badge">
            <span class="material-symbols-outlined" style="font-size: 40px;">check_circle</span>
          </div>
        </div>

        <!-- Camera Permission & Loading State Card -->
        <div id="pvtQrPermissionCard" class="pvt-qr-permission-card" style="display: none;">
          <div id="pvtQrPermIconBox" class="pvt-qr-permission-icon-box">
            <span id="pvtQrPermIcon" class="material-symbols-outlined" style="font-size: 28px;">photo_camera</span>
          </div>
          <h4 id="pvtQrPermTitle">${i18n.reqPerm}</h4>
          <p id="pvtQrPermDesc">กรุณากด 'อนุญาต' เพื่อเข้าถึงกล้องและสแกนบัตร</p>
          <div class="pvt-qr-permission-actions" id="pvtQrPermActions" style="display: none;">
            <button type="button" id="pvtQrPermRetryBtn" class="pvt-qr-btn-primary">
              <span class="material-symbols-outlined">refresh</span> ${i18n.btnRetry}
            </button>
            <button type="button" id="pvtQrPermFileBtn" class="pvt-qr-btn-secondary">
              <span class="material-symbols-outlined">image</span> ${i18n.btnSwitchFile}
            </button>
          </div>
        </div>
      </div>

      <!-- 🖼️ File Upload View -->
      <div id="pvtQrFileView" class="pvt-qr-file-container">
        <div class="pvt-qr-file-dropzone" id="pvtQrDropzone">
          <div style="width: 64px; height: 64px; border-radius: 20px; background: rgba(13, 148, 136, 0.15); border: 1px solid rgba(13, 148, 136, 0.3); color: #2dd4bf; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <span class="material-symbols-outlined" style="font-size: 32px;">add_photo_alternate</span>
          </div>
          <h4 style="margin: 0 0 6px 0; font-size: 16px; color: #ffffff;">${i18n.dropTitle}</h4>
          <p style="margin: 0 0 20px 0; font-size: 13px; color: #94a3b8; max-width: 260px;">${i18n.dropDesc}</p>
          <input type="file" id="pvtQrFileInput" accept="image/*" style="display: none;" />
          <button type="button" class="pvt-qr-btn-primary" onclick="document.getElementById('pvtQrFileInput').click()" style="width: auto; padding: 10px 24px;">
            <span class="material-symbols-outlined">upload_file</span> ${i18n.btnChooseFile}
          </button>
        </div>
      </div>

      <!-- 🔘 Bottom Tab Segmented Bar -->
      <div class="pvt-qr-tabs-bar">
        <button type="button" id="pvtQrTabCam" class="pvt-qr-tab-btn active">
          <span class="material-symbols-outlined" style="font-size: 18px;">videocam</span> ${i18n.tabCam}
        </button>
        <button type="button" id="pvtQrTabFile" class="pvt-qr-tab-btn">
          <span class="material-symbols-outlined" style="font-size: 18px;">image</span> ${i18n.tabFile}
        </button>
      </div>
    </div>
  `;

  // Elements Binding
  const btnClose = document.getElementById("pvtQrBtnClose");
  const btnTorch = document.getElementById("pvtQrBtnTorch");
  const btnFlip = document.getElementById("pvtQrBtnFlip");
  const tabCam = document.getElementById("pvtQrTabCam");
  const tabFile = document.getElementById("pvtQrTabFile");
  const camView = document.getElementById("pvtQrCamView");
  const fileView = document.getElementById("pvtQrFileView");
  const fileInput = document.getElementById("pvtQrFileInput");
  const dropzone = document.getElementById("pvtQrDropzone");
  const permCard = document.getElementById("pvtQrPermissionCard");
  const permIconBox = document.getElementById("pvtQrPermIconBox");
  const permIcon = document.getElementById("pvtQrPermIcon");
  const permTitle = document.getElementById("pvtQrPermTitle");
  const permDesc = document.getElementById("pvtQrPermDesc");
  const permActions = document.getElementById("pvtQrPermActions");
  const permRetryBtn = document.getElementById("pvtQrPermRetryBtn");
  const permFileBtn = document.getElementById("pvtQrPermFileBtn");
  const reticle = document.getElementById("pvtQrReticle");
  const successOverlay = document.getElementById("pvtQrSuccessOverlay");
  const guideMsg = document.getElementById("pvtQrGuideMsg");

  const ecoIndicator = document.getElementById("pvtQrEcoIndicator");
  const batteryBadge = document.getElementById("pvtQrBatteryBadge");
  const batteryIcon = document.getElementById("pvtQrBatteryIcon");
  const batteryText = document.getElementById("pvtQrBatteryText");

  // 🔋 Battery Status Monitoring Logic
  const updateBatteryStatus = (battery) => {
    const level = Math.round(battery.level * 100);
    lastBatteryLevel = level;
    isBatteryCharging = battery.charging;
    if (batteryText) batteryText.textContent = `${level}%`;

    if (batteryIcon) {
      if (battery.charging) {
        batteryIcon.textContent = "battery_charging_full";
        batteryIcon.style.color = "#10b981";
      } else {
        batteryIcon.style.color = "";
        if (level > 90) batteryIcon.textContent = "battery_full";
        else if (level > 60) batteryIcon.textContent = "battery_6_bar";
        else if (level > 30) batteryIcon.textContent = "battery_3_bar";
        else batteryIcon.textContent = "battery_alert";
      }
    }

    if (batteryBadge) {
      if (level <= 20 && !battery.charging) {
        batteryBadge.classList.add("low");
        // Auto-trigger eco mode on low battery
        if (!isEcoMode) enterEcoBatteryMode();
      } else {
        batteryBadge.classList.remove("low");
      }
    }
  };

  const initBatteryMonitoring = async () => {
    if (!navigator.getBattery) return;
    try {
      const battery = await navigator.getBattery();
      if (batteryBadge) batteryBadge.style.display = "flex";
      updateBatteryStatus(battery);

      battery.addEventListener("levelchange", () => updateBatteryStatus(battery));
      battery.addEventListener("chargingchange", () => updateBatteryStatus(battery));
    } catch (e) {
      console.warn("Battery status API not supported or failed:", e);
    }
  };

  // 🍃 โหมดประหยัดพลังงาน (Eco Battery Saver Mode) - ลด Frame Rate & ความละเอียดกล้องเมื่อไม่ได้ใช้งานเกิน 10 วินาที
  const enterEcoBatteryMode = async () => {
    if (!isCamRunning || isEcoMode) return;
    isEcoMode = true;
    if (ecoIndicator) ecoIndicator.classList.add("show");
    const laserEl = document.getElementById("pvtQrLaser");
    if (laserEl) laserEl.classList.add("eco-mode");
    if (guideMsg && !hasScannedSuccess) {
      guideMsg.textContent = i18n.guideEco || "🍃 โหมดประหยัดพลังงาน (แตะหน้าจอเพื่อปลุกกล้อง)";
    }

    if (videoTrack && typeof videoTrack.applyConstraints === "function") {
      try {
        await videoTrack.applyConstraints({
          frameRate: { max: 8, ideal: 5 },
          width: { ideal: 640 },
          height: { ideal: 480 }
        });
        // 📳 Haptic: Short pulse for eco mode entry
        if (navigator.vibrate) navigator.vibrate(100);
      } catch (err) {
        console.warn("Eco battery constraints not fully supported:", err);
      }
    }
  };

  const exitEcoBatteryMode = async () => {
    if (!isEcoMode) return;
    isEcoMode = false;
    if (ecoIndicator) ecoIndicator.classList.remove("show");
    const laserEl = document.getElementById("pvtQrLaser");
    if (laserEl) laserEl.classList.remove("eco-mode");
    if (guideMsg && !hasScannedSuccess) {
      guideMsg.textContent = i18n.guideLive;
    }

    if (videoTrack && typeof videoTrack.applyConstraints === "function") {
      try {
        await videoTrack.applyConstraints({
          frameRate: { max: 30, ideal: 24 },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        });
      } catch (err) {
        console.warn("High-performance constraints restoration failed:", err);
      }
    }
  };

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (isEcoMode) {
      exitEcoBatteryMode();
    }
    if (isCamRunning) {
      idleTimer = setTimeout(() => {
        enterEcoBatteryMode();
      }, IDLE_TIMEOUT_MS);
    }
  };

  // ⏱️ Focus Retry Logic & Progress Bar Animation
  const startFocusProgress = () => {
    if (hasScannedSuccess || !isCamRunning || activeTab !== "cam") return;
    const bar = document.getElementById("pvtQrFocusBar");
    if (!bar) return;

    // Reset bar state
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth; // Force reflow

    // Start fill animation
    bar.style.transition = `width ${FOCUS_RETRY_MS}ms linear`;
    bar.style.width = '100%';

    if (focusRetryTimer) clearTimeout(focusRetryTimer);
    focusRetryTimer = setTimeout(async () => {
      if (hasScannedSuccess || !isCamRunning) return;
      await retryCameraFocus();
      startFocusProgress(); // Loop focus cycle
    }, FOCUS_RETRY_MS);
  };

  const stopFocusProgress = () => {
    if (focusRetryTimer) clearTimeout(focusRetryTimer);
    const bar = document.getElementById("pvtQrFocusBar");
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '0%';
    }
  };

  const retryCameraFocus = async () => {
    if (!videoTrack || hasScannedSuccess || !isCamRunning) return;
    
    // Provide a subtle visual feedback on reticle during focus retry
    if (reticle) {
      reticle.style.transition = "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
      reticle.style.transform = "scale(1.05)";
      setTimeout(() => { 
        if (reticle) reticle.style.transform = "scale(1)"; 
      }, 300);
    }

    try {
      // Re-apply focus constraints to force hardware autofocus trigger
      const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      if (capabilities.focusMode) {
        await videoTrack.applyConstraints({
          advanced: [{ focusMode: 'continuous' }]
        }).catch(() => {});
      }
    } catch (e) {
      console.warn("Autofocus re-trigger failed:", e);
    }
  };

  // 🚪 ปิด Modal และเคลียร์กล้องอย่างปลอดภัย
  const closeModal = async () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (focusRetryTimer) clearTimeout(focusRetryTimer);
    if (isEcoMode) exitEcoBatteryMode();
    document.removeEventListener("keydown", handleKeyDown);
    if (html5QrCode) {
      try {
        if (isCamRunning) {
          await html5QrCode.stop();
          isCamRunning = false;
        }
        html5QrCode.clear();
      } catch (e) {
        console.warn("QR cleanup error:", e);
      }
    }
    videoTrack = null;
    modalOverlay.classList.remove("active");
    setTimeout(() => {
      if (modalOverlay.parentElement) {
        modalOverlay.innerHTML = "";
      }
    }, 300);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", handleKeyDown);

  btnClose.onclick = closeModal;

  // Initialize battery monitoring
  initBatteryMonitoring();

  // 🔦 สลับการใช้งานไฟฉาย (Torch)
  btnTorch.onclick = async () => {
    if (!videoTrack) return;
    try {
      isTorchOn = !isTorchOn;
      await videoTrack.applyConstraints({
        advanced: [{ torch: isTorchOn }]
      });
      btnTorch.classList.toggle("active", isTorchOn);
      btnTorch.innerHTML = `<span class="material-symbols-outlined" style="font-size: 20px;">${isTorchOn ? 'flashlight_off' : 'flashlight_on'}</span>`;
    } catch (err) {
      console.warn("Torch toggle not supported:", err);
    }
  };

  // 🔄 สลับกล้องหน้า / กล้องหลัง
  btnFlip.onclick = async () => {
    currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment";
    if (isCamRunning) {
      try {
        await html5QrCode.stop();
        isCamRunning = false;
      } catch (e) {}
      await startCamera();
    }
  };

  // 📑 การสลับแท็บ กล้องสด <-> เลือกรูปภาพ
  tabCam.onclick = async () => {
    if (activeTab === "cam") return;
    activeTab = "cam";
    tabCam.classList.add("active");
    tabFile.classList.remove("active");
    fileView.style.display = "none";
    camView.style.display = "flex";
    if (!isCamRunning) await startCamera();
  };

  tabFile.onclick = async () => {
    if (activeTab === "file") return;
    activeTab = "file";
    tabFile.classList.add("active");
    tabCam.classList.remove("active");
    camView.style.display = "none";
    fileView.style.display = "flex";
    stopFocusProgress();
    if (isCamRunning) {
      try {
        await html5QrCode.stop();
        isCamRunning = false;
      } catch (e) {}
    }
  };

  // 🎯 Callback เมื่อสแกนพบ Barcode / QR Code สำเร็จ
  const onScanSuccess = (decodedText) => {
    if (hasScannedSuccess) return;
    hasScannedSuccess = true;

    // Stop focus retry cycle immediately
    stopFocusProgress();

    // ⚡ 1. Immediate visual detection highlight on .pvt-qr-viewport-container
    if (camView) camView.classList.add("qr-detected");
    const detectBadge = document.getElementById("pvtQrDetectBadge");
    if (detectBadge) detectBadge.classList.add("show");

    // 2. ส่งเสียงแจ้งเตือน (Chime)
    playBarcodeScanSuccessSound();
    if (idleTimer) clearTimeout(idleTimer);

    // 3. การสั่นแจ้งเตือน (Haptic) - Distinct success double-pulse pattern
    if (navigator.vibrate) {
      try { navigator.vibrate([60, 40, 60]); } catch (e) {}
    }

    // 4. แสดงผลตอบรับบน UI (Visual Feedback)
    if (reticle) reticle.classList.add("scan-success");
    if (successOverlay) successOverlay.classList.add("show");
    if (guideMsg) guideMsg.textContent = i18n.guideSuccess;

    // 5. หน่วงเวลาสั้นๆ เพื่อให้ผู้ใช้รับรู้ feedback ก่อนเปลี่ยนหน้า
    setTimeout(async () => {
      await closeModal();
      executeSecureQrLogin(decodedText, { 
        battery_level: lastBatteryLevel, 
        is_charging: isBatteryCharging,
        capture_time: new Date().toISOString()
      });
    }, 450);
  };

  // 📷 เริ่มการทำงานของกล้อง
  const startCamera = async () => {
    if (typeof Html5Qrcode === "undefined") {
      console.error("Html5Qrcode library is missing");
      showCameraError("ไม่พบไลบรารีสแกน QR Code", "กรุณารีเฟรชหน้าเว็บหรือใช้การล็อกอินด้วยรหัสผ่าน");
      return;
    }

    const camStatus = window.SystemDiagnostics?.lastCameraResult;
    if (camStatus && !camStatus.isSupported) {
      showCameraError(i18n.errCamTitle, camStatus.reason || i18n.errCamDesc);
      return;
    }

    permCard.style.display = "flex";
    permIconBox.className = "pvt-qr-permission-icon-box";
    permIcon.textContent = "photo_camera";
    permTitle.textContent = i18n.reqPerm;
    permDesc.textContent = "กรุณากด 'อนุญาต' เพื่อเข้าถึงกล้องและสแกนบัตร";
    permActions.style.display = "none";

    try {
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("pvt-qr-video-host");
      }

      const qrConfig = {
        fps: 20,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const edge = Math.min(viewfinderWidth, viewfinderHeight) * 0.72;
          return { width: Math.floor(edge), height: Math.floor(edge) };
        },
        aspectRatio: 1.0
      };

      await html5QrCode.start(
        { facingMode: currentFacingMode },
        qrConfig,
        onScanSuccess,
        () => {} // silent on frame pass
      );

      isCamRunning = true;
      permCard.style.display = "none";

      // Start focus progress cycle
      startFocusProgress();

      // 🔍 Pinch-to-Zoom Controller & Visual Feedback Logic for .pvt-qr-viewport-container
      let currentZoom = 1.0;
      const minZoom = 1.0;
      const maxZoom = 3.0;
      let initialPinchDist = 0;
      let initialZoomOnPinch = 1.0;

      const updateZoomUI = (zoomLevel) => {
        currentZoom = Math.min(maxZoom, Math.max(minZoom, parseFloat(zoomLevel.toFixed(1))));
        
        const zoomValText = document.getElementById("pvtZoomValText");
        if (zoomValText) zoomValText.textContent = `${currentZoom.toFixed(1)}x`;

        // Highlight active zoom quick chip
        document.querySelectorAll(".pvt-zoom-chip").forEach(chip => {
          const chipVal = parseFloat(chip.dataset.zoom);
          if (Math.abs(chipVal - currentZoom) < 0.25) {
            chip.classList.add("active");
          } else {
            chip.classList.remove("active");
          }
        });

        // Pulsing visual feedback on zoom indicator badge
        const zoomIndicator = document.getElementById("pvtQrZoomIndicator");
        if (zoomIndicator) {
          zoomIndicator.classList.add("zooming");
          clearTimeout(zoomIndicator._zoomTimer);
          zoomIndicator._zoomTimer = setTimeout(() => {
            zoomIndicator.classList.remove("zooming");
          }, 350);
        }

        // Apply visual zoom via CSS transform scale on video track for universal device support
        const videoEl = document.querySelector("#pvt-qr-video-host video");
        if (videoEl) {
          videoEl.style.transform = `scale(${currentZoom})`;
          videoEl.style.transformOrigin = "center center";
          videoEl.style.transition = "transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)";
        }

        // Apply hardware zoom if supported by camera driver
        if (videoTrack) {
          try {
            const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
            if (capabilities.zoom) {
              const hwZoom = capabilities.zoom.min + (currentZoom - minZoom) / (maxZoom - minZoom) * (capabilities.zoom.max - capabilities.zoom.min);
              videoTrack.applyConstraints({ advanced: [{ zoom: hwZoom }] }).catch(() => {});
            }
          } catch (e) {
            // silent fallback to CSS zoom
          }
        }
      };

      // Reset zoom on camera start
      updateZoomUI(1.0);

      // Bind Pinch touch events on .pvt-qr-viewport-container
      if (camView) {
        camView.addEventListener("touchstart", (e) => {
          if (e.touches.length === 2) {
            initialPinchDist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            initialZoomOnPinch = currentZoom;
          }
        }, { passive: true });

        camView.addEventListener("touchmove", (e) => {
          if (e.touches.length === 2 && initialPinchDist > 0) {
            const currentDist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            const scaleFactor = currentDist / initialPinchDist;
            updateZoomUI(initialZoomOnPinch * scaleFactor);
          }
        }, { passive: true });

        camView.addEventListener("touchend", (e) => {
          if (e.touches.length < 2) {
            initialPinchDist = 0;
          }
        }, { passive: true });

        camView.addEventListener("wheel", (e) => {
          if (isCamRunning) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.2 : -0.2;
            updateZoomUI(currentZoom + delta);
          }
        }, { passive: false });
      }

      // Bind quick zoom chips
      document.querySelectorAll(".pvt-zoom-chip").forEach(chip => {
        chip.onclick = (e) => {
          e.stopPropagation();
          resetIdleTimer();
          const targetZoom = parseFloat(chip.dataset.zoom);
          if (!isNaN(targetZoom)) updateZoomUI(targetZoom);
        };
      });

      // 🍃 ผูกอีเวนต์การสัมผัสและการโต้ตอบเพื่อรีเซ็ตตัวจับเวลาความประหยัดพลังงาน (User activity resets eco idle timer)
      if (camView) {
        ["touchstart", "touchmove", "pointerdown", "mousedown", "click"].forEach(evtName => {
          camView.addEventListener(evtName, () => {
            resetIdleTimer();
          }, { passive: true });
        });
      }

      if (ecoIndicator) {
        ecoIndicator.addEventListener("click", (e) => {
          e.stopPropagation();
          resetIdleTimer();
        });
      }

      // ตรวจสอบความสามารถของ Torch / Flashlight บนอุปกรณ์
      setTimeout(() => {
        try {
          const videoEl = document.querySelector("#pvt-qr-video-host video");
          if (videoEl && videoEl.srcObject) {
            const tracks = videoEl.srcObject.getVideoTracks();
            if (tracks && tracks.length > 0) {
              videoTrack = tracks[0];
              const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
              if (capabilities.torch) {
                btnTorch.style.display = "flex";
              }
            }
          }
        } catch (e) {
          console.warn("Torch capability check:", e);
        }
      }, 500);

      // 🍃 เริ่มนับเวลาถอยหลัง 10 วินาทีสำหรับโหมดประหยัดพลังงาน (Eco Battery Saver)
      resetIdleTimer();

    } catch (err) {
      console.error("Camera access failed:", err);
      showCameraError(i18n.errCamTitle, err.message || i18n.errCamDesc);
    }
  };

  const showCameraError = (title, message) => {
    permCard.style.display = "flex";
    permIconBox.className = "pvt-qr-permission-icon-box error";
    permIcon.textContent = "videocam_off";
    permTitle.textContent = title;
    permDesc.textContent = message;
    permActions.style.display = "flex";

    // 📳 Haptic: Triple pulse for error warning
    if (navigator.vibrate) {
      try { navigator.vibrate([150, 50, 150, 50, 150]); } catch (e) {}
    }
  };

  permRetryBtn.onclick = () => startCamera();
  permFileBtn.onclick = () => tabFile.click();

  // 📂 รองรับการอัปโหลดและ Drag & Drop รูปภาพ
  fileInput.onchange = async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    await processImageFile(file);
  };

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "#10b981";
  };
  dropzone.ondragleave = () => {
    dropzone.style.borderColor = "rgba(255, 255, 255, 0.2)";
  };
  dropzone.ondrop = async (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "rgba(255, 255, 255, 0.2)";
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processImageFile(e.dataTransfer.files[0]);
    }
  };

  const processImageFile = async (file) => {
    try {
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("pvt-qr-video-host");
      }
      const decodedText = await html5QrCode.scanFile(file, true);
      playBarcodeScanSuccessSound();
      if (navigator.vibrate) {
        try { navigator.vibrate([60, 40, 60, 40, 100]); } catch (e) {}
      }
      await closeModal();
      executeSecureQrLogin(decodedText);
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'อ่าน QR / บาร์โค้ดไม่สำเร็จ',
        text: 'ไม่พบ QR Code หรือบาร์โค้ดในรูปภาพนี้ กรุณาลองใช้กล้องสแกนสดหรือเลือกรูปใหม่อีกครั้ง',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  // แสดงผล Modal ด้วยแอนิเมชัน Fade-in
  modalOverlay.classList.add("active");
  startCamera();
}

/* ==========================================================================
   💾 Session & Utility Modals
   ========================================================================== */

function saveUserSession(userData, expireInHours = 12) {
  if (!userData || typeof userData !== "object") return false;

  const cleanUser = { ...userData };
  delete cleanUser.password;

  const deptName = cleanUser.department_name || cleanUser.departments?.department_name || "";
  const posName = cleanUser.position_name || cleanUser.positions?.position_name || "";
  const dutyName = cleanUser.duty_name || cleanUser.positions?.duty_name || "";

  const currentTime = new Date().getTime();
  const sessionPayload = {
    id: cleanUser.id || "",
    employee_code: cleanUser.employee_code || "",
    full_name: cleanUser.full_name || "",
    role: cleanUser.role || "user",
    status: cleanUser.status || "active",
    department_id: cleanUser.department_id || "",
    position_id: cleanUser.position_id || "",
    department_name: deptName,
    position_name: posName,
    duty_name: dutyName,
    image_url: cleanUser.image_url || "",
    createdAt: currentTime,
    expireAt: currentTime + (expireInHours * 60 * 60 * 1000)
  };

  try {
    localStorage.setItem("currentUser", JSON.stringify(sessionPayload));
    // 🧭 ค่าเริ่มต้นเมื่อเข้าสู่ระบบ: สไลด์บาร์เริ่มต้นในสถานะปิด/ย่อ (Collapsed by default)
    localStorage.setItem("sidebar-collapsed", "true");
    return true;
  } catch (err) {
    console.error("saveUserSession Error:", err);
    return false;
  }
}

window.toggleInstructions = function () {
  const content = document.getElementById("instructionsContent");
  const arrow = document.getElementById("instructionArrow");
  if (content && arrow) {
    content.classList.toggle("active");
    arrow.textContent = content.classList.contains("active") ? "expand_less" : "expand_more";
  }
};

async function openChangePasswordModal(user) {
  const { value: formValues } = await Swal.fire({
    title: 'เปลี่ยนรหัสผ่านเพื่อความปลอดภัย',
    html: `
      <p class="text-sm text-gray-600 mb-4" style="font-size:13px; color:#64748b;">เนื่องจากรหัสผ่านปัจจุบันเป็นรหัสผ่านเริ่มต้น กรุณากำหนดรหัสผ่านใหม่ก่อนเข้าใช้งาน</p>
      <div style="text-align:left;">
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:4px;">รหัสผ่านใหม่</label>
          <input id="swal-new-password" type="password" class="swal2-input" style="width:100%; margin:0; box-sizing:border-box;" placeholder="อย่างน้อย 6 ตัวอักษร">
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:4px;">ยืนยันรหัสผ่านใหม่</label>
          <input id="swal-confirm-password" type="password" class="swal2-input" style="width:100%; margin:0; box-sizing:border-box;" placeholder="กรอกรหัสผ่านซ้ำอีกครั้ง">
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'บันทึกรหัสผ่านใหม่',
    cancelButtonText: 'ข้ามไปก่อน',
    confirmButtonColor: '#2563eb',
    preConfirm: () => {
      const newPassword = document.getElementById('swal-new-password').value;
      const confirmPassword = document.getElementById('swal-confirm-password').value;

      if (!newPassword || !confirmPassword) {
        Swal.showValidationMessage('กรุณากรอกรหัสผ่านให้ครบถ้วน');
        return false;
      }
      if (newPassword.length < 6) {
        Swal.showValidationMessage('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
        return false;
      }
      if (newPassword !== confirmPassword) {
        Swal.showValidationMessage('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        return false;
      }
      return { newPassword };
    }
  });

  if (formValues) {
    try {
      Swal.showLoading();
      const sb = getSbClient();
      if (!sb) throw new Error("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");

      const { error } = await sb
        .from('employees')
        .update({ password: formValues.newPassword.trim() })
        .eq('id', user.id);

      if (error) throw error;

      await Swal.fire({
        icon: 'success',
        title: 'เปลี่ยนรหัสผ่านเรียบร้อย',
        text: 'ระบบทำการอัปเดตรหัสผ่านใหม่เรียบร้อยแล้ว',
        confirmButtonColor: '#2563eb'
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: err.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้ กรุณาลองใหม่อีกครั้ง',
        confirmButtonColor: '#ef4444'
      });
    }
  }
}

// 📱 Global Mobile & Desktop Sidebar Navigation Helper
(function initGlobalSidebar() {
  let lastToggleTime = 0;

  function getBackdrop() {
    let backdrop = document.querySelector(".mobile-sidebar-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "mobile-sidebar-backdrop";
      document.body.appendChild(backdrop);
      backdrop.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.toggleMobileSidebar(false);
      });
    }
    return backdrop;
  }

  function ensureSidebarCloseBtn() {
    const sidebar = document.querySelector(".sidebar-light") || document.querySelector(".sidebar") || document.querySelector("aside");
    if (!sidebar) return;
    const brandZone = sidebar.querySelector(".brand-zone");
    if (brandZone && !brandZone.querySelector(".btn-close-sidebar")) {
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "btn-close-sidebar";
      closeBtn.setAttribute("aria-label", "ปิดเมนู");
      closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.toggleMobileSidebar(false);
      });
      brandZone.appendChild(closeBtn);
    }
  }

  function ensureEdgeToggleButton() {
    const edgeBtn = document.getElementById("mobileSidebarEdgeToggle");
    if (edgeBtn) {
      edgeBtn.remove();
    }
  }

  function initTouchSwipeGestures() {
    const mainContainers = document.querySelectorAll(".main-content, .app, main, body");
    if (!mainContainers || mainContainers.length === 0) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentX = 0;
    let touchCurrentY = 0;
    let isTracking = false;
    let startTime = 0;

    const handleTouchStart = (e) => {
      if (window.innerWidth > 1024) return;
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchCurrentX = touchStartX;
      touchCurrentY = touchStartY;
      startTime = Date.now();

      const sidebar = document.querySelector(".sidebar-light") || document.querySelector(".sidebar") || document.querySelector("aside");
      const isOpen = sidebar && sidebar.classList.contains("mobile-open");

      // Initiate gesture if touch started near left swipe zone (<= 90px) OR if sidebar is open
      if (touchStartX <= 90 || isOpen) {
        isTracking = true;
      }
    };

    const handleTouchMove = (e) => {
      if (!isTracking || e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchCurrentX = touch.clientX;
      touchCurrentY = touch.clientY;
    };

    const handleTouchEnd = () => {
      if (!isTracking) return;
      isTracking = false;

      const deltaX = touchCurrentX - touchStartX;
      const deltaY = touchCurrentY - touchStartY;
      const duration = Date.now() - startTime;

      // Ignore if gesture took too long (> 850ms) or was predominantly a vertical scroll
      if (duration > 850) return;
      if (Math.abs(deltaY) > Math.abs(deltaX) * 0.85) return;

      const sidebar = document.querySelector(".sidebar-light") || document.querySelector(".sidebar") || document.querySelector("aside");
      const isOpen = sidebar && sidebar.classList.contains("mobile-open");

      // Rightward swipe gesture -> Seamlessly toggle drawer open
      if (!isOpen && deltaX >= 35) {
        window.toggleMobileSidebar(true);
      } 
      // Leftward swipe gesture when drawer is open -> Seamlessly toggle drawer close
      else if (isOpen && deltaX <= -35) {
        window.toggleMobileSidebar(false);
      }
    };

    mainContainers.forEach(container => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);

      container.addEventListener("touchstart", handleTouchStart, { passive: true });
      container.addEventListener("touchmove", handleTouchMove, { passive: true });
      container.addEventListener("touchend", handleTouchEnd, { passive: true });
    });
  }

  window.toggleMobileSidebar = function(forceState) {
    const now = Date.now();
    if (typeof forceState !== "boolean" && now - lastToggleTime < 280) {
      return; // Ignore rapid colliding events within same click cycle
    }
    lastToggleTime = now;

    const sidebar = document.querySelector(".sidebar-light") || document.querySelector(".sidebar") || document.querySelector("aside");
    const backdrop = getBackdrop();
    ensureSidebarCloseBtn();
    ensureEdgeToggleButton();
    if (!sidebar) return;

    const shouldOpen = typeof forceState === "boolean" ? forceState : !sidebar.classList.contains("mobile-open");
    if (shouldOpen) {
      sidebar.classList.add("mobile-open");
      sidebar.classList.remove("collapsed");
      backdrop.classList.add("active");
      document.body.classList.add("sidebar-open");
    } else {
      sidebar.classList.remove("mobile-open");
      backdrop.classList.remove("active");
      document.body.classList.remove("sidebar-open");
    }
  };

  window.toggleSidebar = function() {
    if (window.innerWidth <= 1024) {
      window.toggleMobileSidebar();
    } else {
      if (typeof window.toggleDesktopSidebar === "function") {
        window.toggleDesktopSidebar();
      } else {
        document.body.classList.toggle('desktop-sidebar-collapsed');
        localStorage.setItem('sidebar-collapsed', document.body.classList.contains('desktop-sidebar-collapsed'));
      }
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    getBackdrop();
    ensureSidebarCloseBtn();
    ensureEdgeToggleButton();
    initTouchSwipeGestures();

    document.querySelectorAll(".mobile-menu-btn, .btn-menu-toggle, #toggleSidebar").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.toggleSidebar();
      });
    });

    // Close mobile drawer when clicking navigation links on mobile
    document.querySelectorAll(".nav-menu .nav-item").forEach((item) => {
      item.addEventListener("click", () => {
        if (window.innerWidth <= 1024) {
          window.toggleMobileSidebar(false);
        }
      });
    });

    // Close drawer on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        window.toggleMobileSidebar(false);
      }
    });
  });
})();

// =========================================================================
// 🎨 [ระบบ Render Profile ส่วนกลาง]: สำหรับแสดงรูป โปรไฟล์ และตำแหน่งบน Topbar ของทุกหน้า
// =========================================================================

async function renderGlobalUserProfile() {
  let sessionUser = {};
  try {
    sessionUser = JSON.parse(localStorage.getItem("currentUser") || "{}") || {};
  } catch (e) {
    sessionUser = {};
  }
  
  let profileData = window.currentProfile || window.currentUserProfile || sessionUser || {};
  
  // พยายามดึงข้อมูลฉบับเต็มจาก DB ถ้าขาดรูปหรือแผนก
  if (sessionUser && sessionUser.id && (!profileData.image_url || !profileData.department_name || !profileData.department_id)) {
    const sb = getSbClient();
    if (sb) {
      try {
         const { data, error } = await sb.from('employees').select('*, departments!department_id(*), positions(*)').eq('id', sessionUser.id).single();
         if (data) {
           profileData = data;
           window.currentUserProfile = data; // Cache
           
           // อัปเดต localStorage ให้มีข้อมูลมากขึ้นครบถ้วน
           const updatedSession = { 
             ...sessionUser, 
             department_id: data.department_id,
             position_id: data.position_id,
             l1_approver_id: data.l1_approver_id,
             l2_approver_id: data.l2_approver_id,
             l3_approver_id: data.l3_approver_id,
             image_url: data.image_url, 
             department_name: data.departments?.department_name || data.department_name, 
             position_name: data.positions?.position_name || data.position_name 
           };
           localStorage.setItem("currentUser", JSON.stringify(updatedSession));
         }
      } catch (e) {}
    }
  }

  const fullName = profileData.full_name || sessionUser.full_name || "ผู้ดูแลระบบ";
  
  // ตำแหน่งและแผนก
  let rawRole = (profileData.role || sessionUser.role || "hr").toLowerCase();
  let roleName = profileData.position_name || profileData.positions?.position_name;
  if (!roleName) {
    if (rawRole === "admin" || rawRole === "hr") roleName = "ผู้ดูแลระบบ";
    else if (rawRole === "manager") roleName = "ผู้จัดการฝ่าย";
    else if (rawRole === "leader") roleName = "หัวหน้างาน";
    else if (rawRole === "executive" || rawRole === "director" || rawRole === "owner") roleName = "ผู้บริหาร";
    else roleName = "เจ้าหน้าที่ HR";
  }

  let deptName = profileData.department_name || profileData.departments?.department_name || sessionUser.department_name || "ฝ่ายทรัพยากรบุคคล";
  
  // ดึงรูปโปรไฟล์ (ถ้ามี)
  let avatarUrl = profileData.image_url || profileData.avatar_url || profileData.employees?.image_url || sessionUser.image_url || null;
  if (avatarUrl && window.PVTSDK?.storage?.getAvatarUrl) {
    avatarUrl = window.PVTSDK.storage.getAvatarUrl(avatarUrl);
  } else if (avatarUrl && !avatarUrl.startsWith('http') && !avatarUrl.startsWith('data:')) {
     const sb = getSbClient();
     if (sb) {
       const { data: { publicUrl } } = sb.storage.from('avatars').getPublicUrl(avatarUrl);
       if (publicUrl) avatarUrl = publicUrl;
     }
  }
  
  // จัดการ Avatar ทุกจุดบนหน้าเว็บ
  document.querySelectorAll('.user-profile').forEach(container => {
    let html = "";
    let initials = "U";
    if (rawRole === "admin" || rawRole === "hr") {
      initials = "HR";
    } else {
      const cleanName = (fullName || "U").replace(/^(คุณ|นาย|นาง|นางสาว|ด\.ช\.|ด\.ญ\.)\s*/i, '').replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').trim();
      initials = cleanName.length >= 2 ? cleanName.substring(0, 2).toUpperCase() : (cleanName.toUpperCase() || "U");
    }

    // รูปภาพ
    if (avatarUrl) {
      html += `<img src="${avatarUrl}" class="avatar avatar-badge notranslate" translate="no" alt="${fullName}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;aspect-ratio:1/1;" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar avatar-badge notranslate',textContent:'${initials}'}));">`;
    } else {
      html += `<div class="avatar avatar-badge notranslate" translate="no">${initials}</div>`;
    }
    
    html += `
      <div class="info" style="display: flex; flex-direction: column; text-align: left; margin-left: 10px;">
        <strong style="font-size: 0.9rem; color: var(--text-main); white-space: nowrap;">${fullName}</strong>
        <span style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap;">${roleName} | ${deptName}</span>
      </div>
    `;
    
    container.innerHTML = html;
    container.style.display = "flex";
    container.style.alignItems = "center";
  });
}


// =========================================================================
// 🌐 [GOOGLE TRANSLATE INTEGRATION DRIVER] (Supports TH, LO, MY, EN & Global)
// =========================================================================

window.getGlobalLanguage = function() {
  return localStorage.getItem('pvt_login_lang') || localStorage.getItem('pvt_language') || 'th';
};

// 🧹 ล้างคุกกี้ Google Translate เมื่อเปลี่ยนกลับมาเป็นภาษาไทย
window.purgeGoogleTranslate = function() {
  try {
    const host = window.location.hostname;
    const pastDate = 'Thu, 01 Jan 1970 00:00:00 UTC';
    const domains = ['', host, '.' + host, window.location.host];
    const parts = host.split('.');
    if (parts.length > 2) {
      domains.push('.' + parts.slice(-2).join('.'));
    }
    const paths = ['/', window.location.pathname];
    domains.forEach(d => {
      paths.forEach(p => {
        const dStr = d ? '; domain=' + d : '';
        document.cookie = 'googtrans=; expires=' + pastDate + '; path=' + p + dStr + ';';
      });
    });

    const combo = document.querySelector('select.goog-te-combo, .goog-te-combo');
    if (combo && combo.value && combo.value !== 'th' && combo.value !== '') {
      combo.value = '';
      combo.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch (e) {
    console.warn('[Translate] Purge Google Translate skipped:', e);
  }
};

// 🛡️ [ICON TRANSLATION GUARD]: ป้องกันไม่ให้ Google แปลงตัวอักษรของ Material Icons / Avatars
window.protectIconsFromTranslation = function(root = document) {
  try {
    const iconSelectors = [
      '.material-symbols-outlined',
      '.material-symbols-rounded',
      '.material-symbols-sharp',
      '.material-icons',
      '.material-icons-outlined',
      '[class*="material-symbols"]',
      '.brand-icon',
      '.brand-icon *',
      '.btn-hero-icon',
      '.btn-hero-icon *',
      '.lang-flag',
      '.user-avatar',
      '.avatar',
      '.avatar *',
      '.avatar-badge',
      '.avatar-badge *',
      '.btn-toggle-icon',
      '#mobileMenuBtn *',
      '.btn-close-sidebar *',
      '#hrChatbotFab *'
    ];
    const elements = root.querySelectorAll(iconSelectors.join(', '));
    elements.forEach(el => {
      if (el.getAttribute('translate') !== 'no') {
        el.setAttribute('translate', 'no');
      }
      if (!el.classList.contains('notranslate')) {
        el.classList.add('notranslate');
      }
    });
  } catch (err) {}
};

// 🌐 [SET GLOBAL LANGUAGE]: ควบคุมการเปลี่ยนภาษาผ่าน Google Translate 100%
window.setGlobalLanguage = function(lang, reload = false, options = {}) {
  // 1. ป้องกันการทำงานซ้อนทับกัน (Lock Mechanism)
  if (window.__pvtLangSwitchLock && !options.fromObserver) {
    return;
  }

  // 🚫 ไม่รบกวนหน้าของ HR / Admin
  const currentPath = (window.location.pathname || '').toLowerCase();
  const isHrAdminPage = currentPath.includes('/pages/hr/') || 
                        currentPath.includes('/hr/') || 
                        document.body.classList.contains('hr-layout') ||
                        document.querySelector('aside.sidebar-light') !== null;
  
  // ตรวจสอบว่าหน้า HR ยอมรับการแปลภาษาหรือไม่ (บางหน้าอาจจะอนุญาต)
  if (isHrAdminPage && !options.forceInHr) {
    return;
  }

  if (!lang) lang = 'th';

  const prevLang = window.__pvtActiveLang || localStorage.getItem('pvt_login_lang') || 'th';
  const langChanged = (prevLang !== lang);
  
  // ถ้าภาษาไม่เปลี่ยน และไม่ใช่การบังคับ ไม่ต้องทำอะไรต่อเพื่อลดภาระ DOM
  if (!langChanged && !options.forceBroadcast && !options.fromObserver) {
    return;
  }

  // ป้องกันการเรียกซ้ำจาก MutationObserver ในช่วงเวลาที่กำลังประมวลผล
  if (options.fromObserver && window.__pvtIsTranslating) {
    return;
  }

  window.__pvtActiveLang = lang;
  window.__pvtLangSwitchLock = true; 

  localStorage.setItem('pvt_login_lang', lang);
  localStorage.setItem('pvt_language', lang);

  // 2. Highlight active language buttons across switchers
  const allLangBtns = document.querySelectorAll('#langThBtn, #globalLangTh, #langLoBtn, #globalLangLo, #langMyBtn, #globalLangMy, #langEnBtn, #globalLangEn');
  allLangBtns.forEach(b => {
    b.classList.remove('active');
    // รีเซ็ตสไตล์เดิม
    b.style.backgroundColor = '';
    b.style.color = '';
    b.style.boxShadow = '';
    b.style.fontWeight = '';
  });

  const activeSelectors = {
    'th': '#langThBtn, #globalLangTh',
    'lo': '#langLoBtn, #globalLangLo',
    'my': '#langMyBtn, #globalLangMy',
    'en': '#langEnBtn, #globalLangEn'
  };

  if (activeSelectors[lang]) {
    const activeBtns = document.querySelectorAll(activeSelectors[lang]);
    activeBtns.forEach(b => {
      b.classList.add('active');
      // สไตล์ปุ่มที่เลือก (เฉพาะจุดที่ไม่ได้ใช้ CSS Class คุม)
      if (b.id.startsWith('globalLang')) {
        b.style.backgroundColor = '#ffffff';
        b.style.color = '#0891b2';
        b.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.08)';
        b.style.fontWeight = '700';
      }
    });
  }

  // 3. ป้องกันไอคอนก่อนเริ่มแปล
  window.protectIconsFromTranslation(document.body);

  // 4. จัดการ Google Translate
  if (!options.fromObserver) {
    if (lang === 'th') {
      window.purgeGoogleTranslate();
      const combo = document.querySelector('select.goog-te-combo, .goog-te-combo');
      if (combo) {
        // หาตัวเลือกที่เป็นภาษาไทยหรือค่าเริ่มต้น
        let targetValue = '';
        for (let i = 0; i < combo.options.length; i++) {
          const val = combo.options[i].value;
          if (val === 'th' || val === '') {
            targetValue = val;
            break;
          }
        }
        combo.value = targetValue;
        combo.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // บังคับรีโหลดเมื่อผู้ใช้เปลี่ยนภาษากลับมาเป็น TH แบบแมนวล เพื่อเคลียร์ความจำแคชของ Google Translate 100%
      if (langChanged) {
        setTimeout(() => {
          window.location.reload();
        }, 120);
      }
    } else {
      let googleLang = lang;
      if (lang === 'zh') googleLang = 'zh-CN';

      const cookieValue = '/th/' + googleLang;
      document.cookie = 'googtrans=' + cookieValue + '; path=/';
      document.cookie = 'googtrans=' + cookieValue + '; path=/; domain=' + window.location.hostname;

      const combo = document.querySelector('select.goog-te-combo, .goog-te-combo');
      if (combo) {
        if (combo.value !== googleLang) {
          combo.value = googleLang;
          combo.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  }

  // 5. Dispatch event & Unlocking
  if (!options.fromObserver && (langChanged || options.forceBroadcast)) {
    window.__pvtIsTranslating = true;
    window.dispatchEvent(new CustomEvent('pvt-lang-changed', { detail: { lang } }));
    
    // ปลดล็อกหลังจากผ่านไปช่วงเวลาหนึ่ง (เพิ่มเวลาเล็กน้อยเพื่อความเสถียร)
    setTimeout(() => {
      window.__pvtIsTranslating = false;
      window.__pvtLangSwitchLock = false;
    }, 1000);
  } else {
    // ถ้ามาจาก observer หรือไม่มีการ broadcast ก็ปลดล็อกเร็วขึ้น
    setTimeout(() => {
      window.__pvtLangSwitchLock = false;
    }, 300);
  }
};

function injectGlobalLangSwitcher() {
  if (document.getElementById('globalLangSwitcherContainer')) return;

  // 🚫 Do not show language switcher on HR Administration pages
  const isHrPage = window.location.pathname.includes('/pages/hr/') || 
                   document.querySelector('aside.sidebar-light') !== null ||
                   document.body.classList.contains('hr-layout');
  if (isHrPage) return;
  
  const targetContainer = document.querySelector('.topbar-right') || 
                          document.querySelector('.topbar-actions') || 
                          document.querySelector('.user-header-actions') ||
                          document.querySelector('.history-actions') ||
                          document.querySelector('.rules-top-bar') ||
                          document.querySelector('.topbar') ||
                          document.querySelector('header');
  
  if (!targetContainer) {
    setTimeout(injectGlobalLangSwitcher, 200);
    return;
  }

  const container = document.createElement('div');
  container.id = 'globalLangSwitcherContainer';
  container.style.cssText = 'display: flex; align-items: center; margin-left: 8px; margin-right: 8px;';
  
  container.innerHTML = `
    <div class="lang-switcher">
      <button type="button" class="lang-btn" id="globalLangTh" onclick="window.setGlobalLanguage('th', false, { forceBroadcast: true })" title="ภาษาไทย"><span class="lang-text-full">ภาษาไทย</span><span class="lang-text-short">TH</span></button>
      <button type="button" class="lang-btn" id="globalLangEn" onclick="window.setGlobalLanguage('en', false, { forceBroadcast: true })" title="English"><span class="lang-text-full">English</span><span class="lang-text-short">EN</span></button>
    </div>
  `;
      // <button type="button" class="lang-btn" id="globalLangLo" onclick="window.setGlobalLanguage('lo', false, { forceBroadcast: true })" title="ພາສາລາວ">ລາວ</button>
      // <button type="button" class="lang-btn" id="globalLangMy" onclick="window.setGlobalLanguage('my', false, { forceBroadcast: true })" title="မြန်မာစာ">မြန်မာ</button>

  if (targetContainer.classList.contains('rules-top-bar')) {
    targetContainer.insertBefore(container, targetContainer.children[1] || null);
  } else if (targetContainer.classList.contains('topbar') || targetContainer.tagName === 'HEADER' || targetContainer.classList.contains('user-header')) {
    const actionArea = targetContainer.querySelector('.topbar-right') || targetContainer.querySelector('.topbar-actions') || targetContainer.querySelector('.user-header-actions') || targetContainer.querySelector('.history-actions');
    if (actionArea) {
      actionArea.prepend(container);
    } else {
      targetContainer.appendChild(container);
    }
  } else {
    targetContainer.prepend(container);
  }
  
  const savedLang = localStorage.getItem('pvt_login_lang') || 'th';
  window.setGlobalLanguage(savedLang, false, { forceBroadcast: true });
}

// =========================================================================
// 📱 GLOBAL MOBILE & DESKTOP SIDEBAR DRAWER CONTROLLER
// =========================================================================
window.ensureDesktopSidebarEdgeToggle = function() {
  const desktopToggle = document.getElementById("desktopSidebarEdgeToggle");
  if (desktopToggle) {
    desktopToggle.remove();
  }
};

window.applyGlobalSidebarState = function(isCollapsed) {
  const sidebar = document.querySelector(".sidebar-light, .sidebar, aside");
  const mainContent = document.querySelector(".main-content");
  
  if (isCollapsed) {
    document.body.classList.add("desktop-sidebar-collapsed");
    if (sidebar) sidebar.classList.add("collapsed");
    if (mainContent) mainContent.classList.add("expanded");
  } else {
    document.body.classList.remove("desktop-sidebar-collapsed");
    if (sidebar) sidebar.classList.remove("collapsed");
    if (mainContent) mainContent.classList.remove("expanded");
  }

  // Update desktop edge toggle handle icon and tooltip
  const edgeToggle = document.getElementById("desktopSidebarEdgeToggle");
  if (edgeToggle) {
    edgeToggle.setAttribute("title", isCollapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู");
    const icon = edgeToggle.querySelector(".material-symbols-outlined, .edge-icon");
    if (icon) icon.textContent = isCollapsed ? "chevron_right" : "chevron_left";
  }

  // Update any other desktop toggle button icons
  document.querySelectorAll("#desktopSidebarToggleIcon, .desktop-toggle-icon").forEach(icon => {
    icon.textContent = isCollapsed ? "chevron_right" : "chevron_left";
  });
};

window.toggleDesktopSidebar = function() {
  const isCurrentlyCollapsed = document.body.classList.contains("desktop-sidebar-collapsed");
  const nextCollapsedState = !isCurrentlyCollapsed;
  window.applyGlobalSidebarState(nextCollapsedState);
  localStorage.setItem('sidebar-collapsed', String(nextCollapsedState));
};

window.toggleMobileSidebar = function(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const sidebar = document.querySelector(".sidebar-light, .sidebar, aside");
  if (!sidebar) return;

  const isMobile = window.innerWidth <= 1024;
  if (isMobile) {
    const isOpening = !sidebar.classList.contains("mobile-open");
    if (isOpening) {
      window.openMobileSidebar();
    } else {
      window.closeMobileSidebar();
    }
  } else {
    window.toggleDesktopSidebar();
  }
};

window.toggleSidebar = window.toggleMobileSidebar;

window.openMobileSidebar = function() {
  const sidebar = document.querySelector(".sidebar-light, .sidebar, aside");
  if (!sidebar) return;

  sidebar.classList.add("mobile-open");
  sidebar.style.display = "flex";
  document.body.classList.add("sidebar-open");

  let backdrop = document.getElementById("mobileSidebarBackdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "mobileSidebarBackdrop";
    backdrop.className = "mobile-sidebar-backdrop";
    backdrop.onclick = window.closeMobileSidebar;
    document.body.appendChild(backdrop);
  }
  // Force reflow and activate
  void backdrop.offsetWidth;
  backdrop.classList.add("active");

  // Ensure close button exists in sidebar brand zone
  const brandZone = sidebar.querySelector(".brand-zone");
  if (brandZone && !brandZone.querySelector(".btn-close-sidebar")) {
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn-close-sidebar";
    closeBtn.title = "ปิดเมนู";
    closeBtn.innerHTML = '<span class="material-symbols-outlined" style="pointer-events: none;">close</span>';
    closeBtn.onclick = (ev) => {
      ev.stopPropagation();
      window.closeMobileSidebar();
    };
    brandZone.appendChild(closeBtn);
  }
};

  window.closeMobileSidebar = function() {
    const sidebar = document.querySelector(".sidebar-light, .sidebar, aside");
    if (sidebar) {
      sidebar.classList.remove("mobile-open");
      sidebar.classList.remove("active"); // Fix for inconsistent sidebar classes
      sidebar.style.display = "";
    }
    document.body.classList.remove("sidebar-open");

    const backdrop = document.getElementById("mobileSidebarBackdrop") || document.querySelector(".mobile-sidebar-backdrop");
    if (backdrop) {
      backdrop.classList.remove("active");
    }
  };

function setupGlobalSidebarHandlers() {
  window.ensureDesktopSidebarEdgeToggle();

  // 🧭 โหลดสถานะการย่อ/ขยายสไลด์บาร์ที่ผู้ใช้เลือกไว้ (ค่าเริ่มต้น: เปิดแสดงปกติบน Desktop)
  const savedSidebarState = localStorage.getItem('sidebar-collapsed');
  const shouldCollapse = savedSidebarState === 'true';
  window.applyGlobalSidebarState(shouldCollapse);

  document.querySelectorAll(".mobile-menu-btn, #mobileMenuBtn, .btn-menu-toggle, #toggleSidebar, .desktop-menu-toggle").forEach(btn => {
    btn.removeEventListener("click", window.toggleSidebar);
    btn.addEventListener("click", window.toggleSidebar);
  });

  const backdrop = document.getElementById("mobileSidebarBackdrop") || document.querySelector(".mobile-sidebar-backdrop");
  if (backdrop) {
    backdrop.removeEventListener("click", window.closeMobileSidebar);
    backdrop.addEventListener("click", window.closeMobileSidebar);
  }

  document.querySelectorAll(".sidebar-light .nav-item, .sidebar .nav-item, aside .nav-item, .sidebar a, .nav-menu a").forEach(item => {
    item.addEventListener("click", () => {
      // 🔒 เมื่อคลิกเปลี่ยนหน้า: ปิดสไลด์บาร์บนมือถือเท่านั้น (คงสถานะที่เลือกบนเดสก์ท็อป)
      if (window.innerWidth <= 1024) {
        window.closeMobileSidebar();
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      window.closeMobileSidebar();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderGlobalUserProfile();
  setupGlobalSidebarHandlers();
  setTimeout(injectGlobalLangSwitcher, 150);

  // Set up MutationObserver to automatically translate newly added DOM elements safely
  let mutationDebounceTimer = null;
  const observer = new MutationObserver((mutations) => {
    if (window.__pvtIsTranslating) return;
    let shouldTranslate = false;
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (
              node.id === "globalLangSwitcherContainer" || 
              node.id === "pvtNetworkStatusBanner" ||
              node.classList.contains("lang-switcher") ||
              node.classList.contains("cal-day-cell") ||
              node.classList.contains("spinning-icon") ||
              node.id === "recentList" ||
              node.classList.contains("recent-item") ||
              node.closest?.("#recentList") ||
              node.closest?.("#teamCalGrid") ||
              node.closest?.("#companyCalGrid") ||
              node.closest?.("#teamLeavesList") ||
              node.closest?.("#companySummaryList")
            ) {
              continue;
            }
            shouldTranslate = true;
            break;
          }
        }
      }
      if (shouldTranslate) break;
    }

    if (shouldTranslate) {
      clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = setTimeout(() => {
        if (!window.__pvtIsTranslating && !window.__pvtLangSwitchLock) {
          const currentLang = window.getGlobalLanguage();
          if (currentLang !== 'th') {
            window.setGlobalLanguage(currentLang, false, { fromObserver: true });
          }
        }
      }, 450); // Increased debounce for stability
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
});

// =========================================================================
// 🌐 [ระบบตรวจจับสถานะเครือข่าย]: แจ้งเตือนเมื่อหลุดการเชื่อมต่ออินเทอร์เน็ต
// =========================================================================
(function initNetworkStatusMonitor() {
  const translations = {
    th: {
      offline: "⚠️ ขาดการเชื่อมต่ออินเทอร์เน็ต: การส่งใบลาและระบบประมวลผลจำเป็นต้องใช้อินเทอร์เน็ตที่ทำงานอยู่",
      online: "✅ เชื่อมต่ออินเทอร์เน็ตกลับมาเรียบร้อยแล้ว"
    },
    lo: {
      offline: "⚠️ ຂາດການເຊື່ອມຕໍ່ອິນເຕີເນັດ: ການສົ່ງໃບລາ ແລະ ລະບົບປະມວນຜົນຈຳເປັນຕ້ອງໃຊ້ອິນເຕີເນັດ",
      online: "✅ ເຊື່ອມຕໍ່ອິນເຕີເນັດຄືນໃຫມ່ສຳເລັດແລ້ວ"
    },
    my: {
      offline: "⚠️ အင်တာနက်လိုင်းပြတ်တောက်နေပါသည် - ခွင့်တောင်းခံလွှာတင်ရန် အင်တာနက်ချိတ်ဆက်မှု လိုအပ်ပါသည်",
      online: "✅ အင်တာနက်ပြန်လည်ချိတ်ဆက်မိပါပြီ"
    }
  };

  function getActiveLang() {
    return localStorage.getItem("pvt_login_lang") || "th";
  }

  function showBanner(type) {
    let banner = document.getElementById("pvtNetworkStatusBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "pvtNetworkStatusBanner";
      banner.style.cssText = `
        position: fixed;
        top: -60px;
        left: 0;
        right: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px 16px;
        font-family: 'Kanit', sans-serif;
        font-size: 13.5px;
        font-weight: 500;
        text-align: center;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
        transition: top 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease;
      `;
      document.body.appendChild(banner);
    }

    const lang = getActiveLang();
    const t = translations[lang] || translations.th;

    if (type === "offline") {
      banner.textContent = t.offline;
      banner.style.backgroundColor = "#fffbeb"; // Tailwind amber-50
      banner.style.color = "#b45309"; // Tailwind amber-700
      banner.style.borderBottom = "1.5px solid #f59e0b"; // Tailwind amber-500
      banner.style.top = "0";
    } else if (type === "online") {
      banner.textContent = t.online;
      banner.style.backgroundColor = "#f0fdf4"; // Tailwind green-50
      banner.style.color = "#15803d"; // Tailwind green-700
      banner.style.borderBottom = "1.5px solid #22c55e"; // Tailwind green-500
      banner.style.top = "0";

      // Hide the "back online" message after 3 seconds
      setTimeout(() => {
        if (navigator.onLine) {
          banner.style.top = "-60px";
        }
      }, 3000);
    }
  }

  window.addEventListener("offline", () => {
    showBanner("offline");
  });

  window.addEventListener("online", () => {
    showBanner("online");
  });

  // Check initial state on page load
  document.addEventListener("DOMContentLoaded", () => {
    if (!navigator.onLine) {
      setTimeout(() => {
        showBanner("offline");
      }, 500);
    }
  });
})();

// 🛡️ [STARTUP INTEGRITY & PERSISTENT ICON SHIELD]
(function initTranslationSafety() {
  function runSafety() {
    if (typeof window.protectIconsFromTranslation === 'function') {
      window.protectIconsFromTranslation(document.body);
    }
    const currentLang = (localStorage.getItem("pvt_login_lang") || localStorage.getItem("pvt_language") || "th").toLowerCase();
    if (['th', 'lo', 'my', 'en'].includes(currentLang)) {
      if (document.cookie.includes("googtrans") && typeof window.purgeGoogleTranslate === 'function') {
        window.purgeGoogleTranslate();
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runSafety);
  } else {
    runSafety();
  }

  try {
    const iconObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length > 0) {
          m.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              if (node.matches && (node.matches('.material-symbols-outlined, .material-icons, [class*="material-symbols"]'))) {
                node.setAttribute('translate', 'no');
                node.classList.add('notranslate');
              } else if (node.querySelectorAll) {
                const icons = node.querySelectorAll('.material-symbols-outlined, .material-icons, [class*="material-symbols"]');
                icons.forEach(ic => {
                  ic.setAttribute('translate', 'no');
                  ic.classList.add('notranslate');
                });
              }
            }
          });
        }
      }
    });
    iconObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();

// 🔄 [AUTO-UPDATE & CACHE BUSTER]: Ensure refreshed pages always load latest code
if ('serviceWorker' in navigator) {
  try {
    if (window.self !== window.top) {
      // Inside preview iframe, unregister service worker to prevent MIME/frame conflicts
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister().catch(() => {});
        }
      }).catch(() => {});
    } else {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.update().catch(() => {});
        }
      }).catch(() => {});
    }
  } catch (e) {}
}

// 🪪 [GLOBAL EMPLOYEE CARD ACCESS]: Ensure digital card viewer works on all pages
(function initGlobalEmployeeCardIntegration() {
  function ensureCardScriptLoaded() {
    if (!document.querySelector('script[src*="employee-card-modal.js"]')) {
      const script = document.createElement('script');
      script.src = '/js/employee-card-modal.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }

  // Auto load script
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureCardScriptLoaded);
  } else {
    ensureCardScriptLoaded();
  }

  // Global fallback if clicked before script loaded
  if (!window.openEmployeeCardManagerPopup) {
    window.openEmployeeCardManagerPopup = function(forceRefresh) {
      ensureCardScriptLoaded();
      setTimeout(() => {
        if (typeof window.openEmployeeCardManagerPopup === 'function') {
          window.openEmployeeCardManagerPopup(forceRefresh);
        } else {
          alert('กำลังโหลดระบบบัตรพนักงาน กรุณารอสักครู่...');
        }
      }, 300);
    };
  }
})();

// 🍞 [GLOBAL TOAST NOTIFICATION SYSTEM]: Glassmorphic responsive alerts utilizing theme variables
(function initGlobalToastSystem() {
  const css = `
    #pvt-toast-container {
      position: fixed;
      top: 24px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 100005;
      pointer-events: none;
      font-family: 'Kanit', 'Sarabun', sans-serif;
    }
    @media (max-width: 640px) {
      #pvt-toast-container {
        top: auto;
        bottom: 24px;
        right: 16px;
        left: 16px;
        align-items: center;
      }
    }
    .pvt-toast {
      pointer-events: auto;
      min-width: 320px;
      max-width: 440px;
      background: var(--bg-card, rgba(255, 255, 255, 0.85));
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.6);
      box-shadow: var(--shadow-card, 0 10px 30px -10px rgba(15, 23, 42, 0.12));
      border-radius: 16px;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      transform: translateY(-20px);
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .pvt-toast.show {
      transform: translateY(0);
      opacity: 1;
    }
    .pvt-toast-icon {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: rgba(13, 148, 136, 0.1);
      color: #0d9488;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .pvt-toast-icon .material-symbols-outlined {
      font-size: 22px;
    }
    .pvt-toast-content {
      flex-grow: 1;
    }
    .pvt-toast-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 3px 0;
      line-height: 1.3;
    }
    .pvt-toast-message {
      font-size: 12.5px;
      color: #475569;
      margin: 0;
      line-height: 1.4;
    }
    .pvt-toast-close {
      color: #94a3b8;
      cursor: pointer;
      background: none;
      border: none;
      padding: 4px;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s, transform 0.2s;
    }
    .pvt-toast-close:hover {
      color: #475569;
      transform: scale(1.1);
    }
  `;

  // Inject Stylesheet
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // Global Toast function
  window.showSuccessToast = function(title, message, isBiometric = false) {
    let container = document.getElementById('pvt-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pvt-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'pvt-toast';
    toast.innerHTML = `
      <div class="pvt-toast-icon">
        <span class="material-symbols-outlined">${isBiometric ? 'fingerprint' : 'check_circle'}</span>
      </div>
      <div class="pvt-toast-content">
        <div class="pvt-toast-title">${title}</div>
        <div class="pvt-toast-message">${message}</div>
      </div>
      <button class="pvt-toast-close">✖</button>
    `;

    container.appendChild(toast);

    // Fade and slide in
    setTimeout(() => {
      toast.classList.add('show');
    }, 50);

    // Setup close button
    const closeBtn = toast.querySelector('.pvt-toast-close');
    const dismiss = () => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
        if (container.children.length === 0) {
          container.remove();
        }
      }, 400);
    };

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });

    // Auto dismiss
    setTimeout(dismiss, 4500);
  };

  // Check and process pending toasts on load
  function checkPendingToasts() {
    try {
      const pending = sessionStorage.getItem("login_toast_pending");
      if (pending) {
        const data = JSON.parse(pending);
        if (data && data.title) {
          window.showSuccessToast(data.title, data.message, data.isBiometric);
        }
        sessionStorage.removeItem("login_toast_pending");
      }
    } catch (e) {
      console.warn("Notice: Failed checking pending toasts:", e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkPendingToasts);
  } else {
    checkPendingToasts();
  }
})();





