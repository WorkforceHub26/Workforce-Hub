# 📖 คู่มือสถาปัตยกรรมและคำอธิบายโค้ดโดยละเอียด (PVT Workforce Hub Developer Manual)

เอกสารนี้จัดทำขึ้นสำหรับโปรแกรมเมอร์และทีมพัฒนาที่จะเข้ามารับช่วงต่อ (Maintainers / Next Developers) โดยอธิบายโค้ดอย่างละเอียดทีละโมดูล ทีละฟังก์ชัน และทีละส่วนประกอบของระบบ **PVT Workforce Hub & Leave Management System**

---

## 📚 สารบัญ (Table of Contents)
1. [ภาพรวมสถาปัตยกรรมระบบ (System Architecture Overview)](#1-ภาพรวมสถาปัตยกรรมระบบ)
2. [เจาะลึก auth/index.js (ระบบล็อกอินและการกระจายสิทธิ์)](#2-เจาะลึก-authindexjs)
3. [เจาะลึก js/supabase-config.js (เอนจินหลัก ฐานข้อมูล และ LINE Notification)](#3-เจาะลึก-jssupabase-configjs)
4. [เจาะลึก js/auth-guard.js (ระบบ Middleware ตรวจสอบสิทธิ์เข้าใช้งาน)](#4-เจาะลึก-jsauth-guardjs)
5. [เจาะลึก js/index-user.js (หน้าหลักพนักงาน โควตา และเมนูลัด)](#5-เจาะลึก-jsindex-userjs)
6. [เจาะลึก js/leave-user.js (ระบบคำนวณวันลา การบีบอัดรูป และการยื่นใบลา)](#6-เจาะลึก-jsleave-userjs)
7. [เจาะลึก js/leave-history.js (ประวัติการลา การกรอง การยกเลิก และการพิมพ์ใบลา)](#7-เจาะลึก-jsleave-historyjs)
8. [เจาะลึก js/holidays.js (ปฏิทินวันหยุด สรุปรายเดือน และสรุปรายปี)](#8-เจาะลึก-jsholidaysjs)
9. [เจาะลึก js/profile-user.js (โปรไฟล์พนักงานและการผูก LINE User ID)](#9-เจาะลึก-jsprofile-userjs)
10. [เจาะลึก js/home.js (HR Analytics Dashboard & Charts)](#10-เจาะลึก-jshomejs)
11. [เจาะลึก js/hr.js (ระบบอนุมัติใบลา 2 ขั้นตอน L1/L2 และการส่ง LINE)](#11-เจาะลึก-jshrjs)
12. [เจาะลึก js/management.js (ระบบบริหารพนักงาน โควตา Excel และ QR Code)](#12-เจาะลึก-jsmanagementjs)
13. [โครงสร้างตารางฐานข้อมูล Supabase (Database Schema)](#13-โครงสร้างตารางฐานข้อมูล-supabase)
14. [เทคนิคการพัฒนาต่อยอดและการแก้ไขข้อผิดพลาด (Troubleshooting & Best Practices)](#14-เทคนิคการพัฒนาต่อยอดและการแก้ไขข้อผิดพลาด)

---

## 1. ภาพรวมสถาปัตยกรรมระบบ

ระบบถูกออกแบบเป็น **Vanilla JavaScript (ES6 Modules/Global Architecture)** ร่วมกับ **HTML5 + CSS3 (Modular Stylesheets)** และใช้ **Supabase (PostgreSQL + Auth + Storage)** เป็น Backend-as-a-Service (BaaS)

### 🛠️ เทคโนโลยีหลักที่ใช้ (Tech Stack)
* **Frontend UI:** HTML5, CSS3 (CSS Variables, Flexbox, CSS Grid), Vanilla JavaScript (No Framework)
* **Build System & Dev Server:** Vite 6
* **Database & BaaS:** Supabase (PostgreSQL, Storage Buckets, Row Level Security)
* **LINE Notification Engine:** Supabase Edge Functions (`line-send`) + LINE Messaging API (Flex Messages / Direct Notifications)
* **PWA (Progressive Web App):** Service Worker (`sw.js`), Web App Manifest (`manifest.json`) รองรับการติดตั้งบนหน้าจอมือถือ
* **Third-Party Libraries:**
  * `SweetAlert2` (Swal): แสดงผล Modal Dialog และข้อความแจ้งเตือนที่สวยงาม
  * `Chart.js`: วาดกราฟสรุปสถิติสำหรับ HR (Doughnut, Pie, Bar Charts)
  * `ExcelJS` & `SheetJS (XLSX)`: อ่านและเขียนไฟล์ Excel สำหรับนำเข้า/ส่งออกพนักงาน
  * `QRCode.js`: สร้าง QR Code ประจำตัวพนักงานสำหรับบัตรพนักงานและการสแกนล็อกอิน

---

## 2. เจาะลึก `auth/index.js`
> **หน้าที่:** ควบคุมหน้าแรก (`index.html`), จัดการการล็อกอินด้วยรหัสผ่านหรือสแกน QR Code, และทำ Role Routing นำทางผู้ใช้ไปยังหน้าที่เหมาะสม

### 📌 ฟังก์ชันและกลไกสำคัญทีละบล็อก

```javascript
// 1. ฟังก์ชันดึง Supabase Client จาก Global Window
function getSbClient() {
  return window.pvtSupabase?.client 
      || window.PVTSDK?.client 
      || window.supabaseClient 
      || window.supabase;
}
```
* **คำอธิบาย:** ตรวจสอบและดึง Instance ของ Supabase Client จากที่ต่างๆ ที่อาจถูกประกาศไว้ในระบบ ป้องกันปัญหา `undefined` กรณี Script โหลดก่อนหลัง

```javascript
// 2. ฟังก์ชันตรวจสอบสิทธิ์และนำทางไป Dashboard ตาม Role (Role Routing)
function redirectToDashboard(role) {
  const cleanRole = String(role || '').toLowerCase().trim();
  let targetPath = "/pages/user/index-user.html";
  
  const executiveRoles = ['executive', 'director', 'owner'];
  const isExecutive = executiveRoles.includes(cleanRole) ||
    cleanRole.includes('director') || cleanRole.includes('executive') ||
    cleanRole.includes('ผู้บริหาร') || cleanRole.includes('ผู้อำนวยการ');
  
  if (isExecutive) {
    targetPath = "/pages/hr/home.html"; // ผู้บริหาร/HR ไปหน้า Dashboard
  } else {
    targetPath = "/pages/user/index-user.html"; // พนักงานทั่วไปไปหน้าหลักพนักงาน
  }

  sessionStorage.removeItem("redirect_attempt");
  const targetUrl = new URL(targetPath, window.location.origin).href;
  window.location.replace(targetUrl); // ใช้ replace เพื่อไม่ให้กด Back กลับมาหน้า Login ได้ง่าย
}
```
* **คำอธิบาย:** ทำหน้าที่แยกเส้นทางตามระดับสิทธิ์ (Role) โดยล้างค่า `redirect_attempt` ก่อนเพื่อป้องกันปัญหาการ Redirect วนลูป (Infinite Loop)

```javascript
// 3. ฟังก์ชันตรวจสอบเซสชันเดิมที่เคยล็อกอินไว้ (Auto-Login Check)
document.addEventListener("DOMContentLoaded", async () => {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('/sw.js'); // ลงทะเบียน PWA Service Worker
  }
  const rawSession = localStorage.getItem("currentUser");
  if (rawSession) {
    const session = JSON.parse(rawSession);
    if (session.expireAt && Date.now() < session.expireAt) {
      redirectToDashboard(session.role); // ล็อกอินค้างไว้และยังไม่หมดอายุ -> นำเข้าแดชบอร์ดทันที
    }
  }
});
```
* **คำอธิบาย:** ตรวจสอบ `localStorage` เพื่อให้พนักงานไม่ต้องพิมพ์รหัสผ่านใหม่ทุกครั้งที่เปิดแอปพลิเคชันขึ้นมา

---

## 3. เจาะลึก `js/supabase-config.js`
> **หน้าที่:** หัวใจหลักของระบบ จัดเตรียมการเชื่อมต่อ Supabase, จัดการ Offline Queue คิวคำขอลาเมื่อเน็ตหลุด, และเอนจินส่งแจ้งเตือนเข้า LINE Official Account

### 📌 ส่วนประกอบหลัก

#### 3.1 คิวบันทึกข้อมูลแบบออฟไลน์ (Offline Queue System)
* **`saveOfflineLeaveRequest(leaveData)`**: กรณีเครื่องพนักงานไม่มีอินเทอร์เน็ต ระบบจะเซฟข้อมูลใบลาลง `localStorage` ชื่อ `pvt_offline_queue`
* **`syncOfflineQueue()`**: ตรวจสอบเมื่อระบบกลับมาออนไลน์ (`window.addEventListener('online')`) แล้วทยอยส่งข้อมูลใบลาค้างจ่ายเข้าฐานข้อมูล Supabase อัตโนมัติ

#### 3.2 เอนจินส่ง LINE Notification (`PVTSDK.line.sendWorkflowNotification`)
```javascript
async sendWorkflowNotification(opts = {}) {
  const { type, recipientId, recipientLineId, employeeName, leaveType, startDate, endDate, totalDays, reason } = opts;
  
  // 1. ตรวจสอบว่าประเภทของ Event อยู่ในรายชื่อที่อนุญาตให้ส่งแจ้งเตือน LINE ภายนอกหรือไม่
  const allowedLineTypes = ['NEW_REQUEST', 'LEADER_APPROVED', 'REQUEST_APPROVED', 'FINAL_APPROVED', 'REJECTED', 'TEST'];
  if (!allowedLineTypes.includes(type)) return;

  // 2. เรียกไปยัง Supabase Edge Function: line-send
  const res = await fetch("https://pgogmhqjdchakyctsomx.supabase.co/functions/v1/line-send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type, recipientLineId, employeeName, leaveType, startDate, endDate, totalDays, reason
    })
  });
}
```
* **คำอธิบาย:** 
  1. รับพารามิเตอร์ข้อมูลคำขอลา และ LINE User ID ของผู้รับปลายทาง
  2. กรองเฉพาะ Event ที่กำหนดเพื่อส่งออกข้อความ
  3. ยิง HTTP POST เข้าไปยัง Supabase Edge Function เพื่อสร้าง Flex Message สวยงามส่งตรงเข้าแอป LINE บนมือถือของผู้รับ

---

## 4. เจาะลึก `js/auth-guard.js`
> **หน้าที่:** ตรวจสอบความปลอดภัย ป้องกันไม่ให้ผู้ใช้แอบพิมพ์ URL เข้าถึงหน้าต่างๆ โดยไม่ผ่านการล็อกอิน

### 📌 การทำงานทีละบรรทัด
```javascript
(function () {
  const sessionStr = localStorage.getItem('currentUser');
  if (!sessionStr) {
    window.location.replace('/index.html'); // ไม่มีเซสชัน -> เด้งกลับหน้าล็อกอิน
    return;
  }

  const session = JSON.parse(sessionStr);
  if (!session.expireAt || Date.now() > session.expireAt) {
    localStorage.removeItem('currentUser'); // เซสชันหมดอายุ -> ล้างเซสชันแล้วส่งกลับหน้าล็อกอิน
    window.location.replace('/index.html');
    return;
  }

  window.currentUserProfile = session; // บันทึกข้อมูลโปรไฟล์พนักงานลงตารางกลาง Window
})();
```

---

## 5. เจาะลึก `js/index-user.js`
> **หน้าที่:** ควบคุมหน้าหลักพนักงาน (`pages/user/index-user.html`), คำนวณวันลาคงเหลือ, เมนูลัด, และเปิดดูคู่มือการใช้งาน

### 📌 ฟังก์ชันสำคัญ
* **`loadUserLeaveQuota()`**: 
  * อ่านข้อมูลโควตาวันลาจากตาราง `leave_balances` สัมพันธ์กับ `employee_id`
  * อัปเดตตัวเลขแสดงผลบนการ์ด: **ลาป่วย (Sick Leave)**, **ลากิจ (Personal Leave)**, **ลาพักผ่อน (Annual Leave)**
* **`openUserGuideModal()` / `closeUserGuideModal()`**:
  * แสดง Modal คู่มือการใช้งานแอปพลิเคชันสำหรับพนักงานใหม่ พร้อมปุ่มลิงก์ตรงไปยังหน้าระเบียบการลาฉบับเต็ม

---

## 6. เจาะลึก `js/leave-user.js`
> **หน้าที่:** ควบคุมฟอร์มการยื่นใบลาออนไลน์ คำนวณจำนวนวันลา ตัดวันหยุด ย่อขนาดไฟล์ภาพแนบ และบันทึกลงฐานข้อมูล

### 📌 ฟังก์ชันสำคัญ

```javascript
// 1. ฟังก์ชันคำนวณวันลาสุทธิ (คำนวณตามจริง หักเสาร์-อาทิตย์ และวันหยุดบริษัท)
async function calculateLeaveDays() {
  const startDateStr = document.getElementById('startDate').value;
  const endDateStr = document.getElementById('endDate').value;
  const timeSlot = document.getElementById('timeSlot').value; // เต็มวัน / ครึ่งเช้า / ครึ่งบ่าย

  if (!startDateStr || !endDateStr) return;

  let start = new Date(startDateStr);
  let end = new Date(endDateStr);
  let count = 0;

  // ดึงวันหยุดบริษัทประจำปีมาเปรียบเทียบ
  const holidays = window.companyHolidaysList || [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // ข้ามวันเสาร์ (6) และวันอาทิตย์ (0)

    const dateStr = d.toISOString().split('T')[0];
    const isHoliday = holidays.some(h => h.holiday_date === dateStr);
    if (isHoliday) continue; // ข้ามวันหยุดนักขัตฤกษ์/วันหยุดบริษัท

    count++;
  }

  if (timeSlot === 'half_morning' || timeSlot === 'half_afternoon') {
    count = count > 0 ? 0.5 : 0; // ลาครึ่งวันนับ 0.5 วัน
  }

  document.getElementById('totalDaysDisplay').innerText = count;
}
```

```javascript
// 2. ฟังก์ชันย่อขนาดรูปภาพก่อนอัปโหลด (Image Compressor)
async function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
    };
  });
}
```
* **คำอธิบาย:** ช่วยบีบอัดรูปถ่ายใบรับรองแพทย์จากมือถือขนาด 5-10MB ให้เหลือเพียง ~200KB เพิ่มความเร็วในการยื่นคำขอและประหยัดพื้นที่บน Supabase Storage

---

## 7. เจาะลึก `js/leave-history.js`
> **หน้าที่:** จัดการหน้าประวัติใบลา การกรองตามสถานะ การดูรายละเอียด การยกเลิกใบลา และการสั่งพิมพ์ใบลา

### 📌 ฟังก์ชันสำคัญ
* **`fetchLeaveHistory()`**: ดึงรายการใบลาของผู้ใช้จากตาราง `leave_requests` เรียงลำดับจากล่าสุด
* **`filterHistory(status)`**: กรองใบลาตามแท็บสถานะ เช่น `pending` (รอพิจารณา), `approved` (อนุมัติแล้ว), `rejected` (ไม่อนุมัติ)
* **`cancelLeaveRequest(requestId)`**: อนุญาตให้พนักงานยกเลิกคำขอลาของตนเองได้ หากคำขอนั้นยังไม่ได้รับการอนุมัติขั้นสุดท้ายจาก Manager
* **`printLeaveForm(requestId)`**: จัดรูปแบบใบลาและสั่งเปิดหน้าต่างพิมพ์ (`window.print()`) ออกเป็นเอกสาร PDF/กระดาษทางการ

---

## 8. เจาะลึก `js/holidays.js`
> **หน้าที่:** จัดการตารางปฏิทินวันหยุดบริษัท ปฏิทินแสดงการลาของเพื่อนร่วมทีม และระบบสรุปรายเดือน / **สรุปรายปี**

### 📌 ฟังก์ชันและสวิทช์โหมดการทำงาน
```javascript
// 1. ฟังก์ชันกรองและอัปเดตปฏิทิน
function filterHolidays() {
  const yearSelect = document.getElementById('yearSelect');
  const monthSelect = document.getElementById('monthSelect');
  
  const selectedYear = yearSelect ? parseInt(yearSelect.value, 10) : new Date().getFullYear();
  const selectedMonthVal = monthSelect ? monthSelect.value : 'all';

  if (selectedMonthVal === 'all') {
    // 🌟 โหมดแสดงผล "สรุปวันหยุดทั้งปี"
    const titleEl = document.getElementById('companyCalMonthYear');
    if (titleEl) titleEl.innerText = `ปี ${selectedYear + 543} (สรุปวันหยุดทั้งปี)`;
    
    // สั่งเรนเดอร์ Sidebar ด้านขวาด้วยรายการวันหยุดของทั้งปี
    window.renderCompanySummarySidebar(holidaysData, null, true);
  } else {
    // 🗓️ โหมดแสดงผลปฏิทินแบบรายเดือน
    const monthIndex = parseInt(selectedMonthVal, 10);
    companyCalCurrentDate.setMonth(monthIndex);
    
    window.renderCompanyCalendarGrid(selectedYear, monthIndex, holidaysData);
  }
}

// 2. ฟังก์ชันปุ่มลูกศรเลื่อนเดือน (< และ >)
window.companyCalPrevMonth = function() {
  const oldYear = companyCalCurrentDate.getFullYear();
  companyCalCurrentDate.setMonth(companyCalCurrentDate.getMonth() - 1);
  const newYear = companyCalCurrentDate.getFullYear();

  // ซิงค์ค่าไปยัง Dropdown เลือกเดือนและปีให้อัตโนมัติ
  document.getElementById('monthSelect').value = companyCalCurrentDate.getMonth().toString();
  document.getElementById('yearSelect').value = newYear.toString();

  if (oldYear !== newYear) fetchHolidays();
  else filterHolidays();
};
```

---

## 9. เจาะลึก `js/profile-user.js`
> **หน้าที่:** แสดงข้อมูลโปรไฟล์พนักงาน ผูก/บันทึก **LINE User ID** และทดสอบการส่งแจ้งเตือนเข้า LINE

### 📌 ฟังก์ชันสำคัญ
* **`saveUserLineId()`**: 
  * อ่านค่าจากอินพุต `#userLineIdInput` แล้วส่งไปอัปเดตฟิลด์ `line_id` ในตาราง `employees` บนฐานข้อมูล Supabase
* **`testLineNotification()`**: 
  * เรียกใช้ `window.PVTSDK.line.sendWorkflowNotification` ชนิด `type: 'TEST'` เพื่อส่งข้อความทดสอบไปยัง LINE ของพนักงานทันที ช่วยตรวจสอบว่า LINE User ID ถูกต้องหรือไม่

---

## 10. เจาะลึก `js/home.js`
> **หน้าที่:** ควบคุมหน้า Dashboard สรุปสถิติสำหรับ HR/ผู้บริหาร (`pages/hr/home.html`) พร้อมวาดกราฟ Chart.js

### 📌 การทำงานสำคัญ
* **`renderLeaveTypeChart(type)`**:
  * สร้างและเปลี่ยนประเภทกราฟสัดส่วนการลาแบบไดนามิก รองรับ `doughnut` (โดนัท), `pie` (วงกลม), และ `bar` (กราฟแท่ง)
* **`renderDepartmentChart()`**:
  * วาดกราฟแท่งเปรียบเทียบจำนวนวันลาแยกตามแผนกในองค์กร โดยสุ่มจานสีสวยงาม (Color Palette) ให้แท่งของแต่ละแผนกมีสีสันที่แตกต่างและอ่านง่าย

---

## 11. เจาะลึก `js/hr.js`
> **หน้าที่:** ระบบพิจารณาอนุมัติใบลา 2 ขั้นตอน (Level 1: Leader, Level 2: Manager) และส่ง LINE แจ้งเตือนผู้ขอลา

### 📌 เวิร์กโฟลว์การอนุมัติ (Approval Process)

```javascript
// ฟังก์ชันอนุมัติใบลา
async function approveLeaveRequest(requestId, currentApprovalLevel) {
  // 1. อัปเดตสถานะใบลาในตาราง leave_requests
  let nextStatus = 'approved';
  if (currentApprovalLevel === 'L1') {
    nextStatus = 'leader_approved'; // อนุมัติขั้นต้น ให้ส่งต่อหา Manager
  } else if (currentApprovalLevel === 'L2') {
    nextStatus = 'approved'; // อนุมัติสมบูรณ์
    // หักวันลาออกจากตาราง leave_balances อัตโนมัติ
    await deductUserLeaveQuota(requestId);
  }

  await sb.from('leave_requests').update({ status: nextStatus }).eq('id', requestId);

  // 2. ส่งแจ้งเตือน LINE หาผู้เกี่ยวข้องทันที
  const notificationType = currentApprovalLevel === 'L1' ? 'LEADER_APPROVED' : 'FINAL_APPROVED';
  await window.PVTSDK.line.sendWorkflowNotification({
    type: notificationType,
    recipientId: applicantEmployeeId,
    recipientLineId: applicantLineId,
    leaveType: leaveTypeName,
    startDate: startDate,
    endDate: endDate
  });
}
```

---

## 12. เจาะลึก `js/management.js`
> **หน้าที่:** ระบบบริหารพนักงาน เพิ่ม/แก้ไขข้อมูล ปรับโควตา นำเข้าข้อมูลผ่าน Excel และสร้างบัตรพนักงานพร้อม QR Code

### 📌 ฟังก์ชันสำคัญ
* **`exportEmployeesToExcel()`**: ส่งออกรายชื่อพนักงานและสิทธิ์วันลาเป็นไฟล์ `.xlsx` ด้วย `ExcelJS`
* **`importEmployeesFromExcel(file)`**: อ่านไฟล์ Excel และทำการ Upsert ข้อมูลพนักงานและโควตาวันลาเข้าฐานข้อมูล
* **`generateEmployeeQRCode(employeeCode)`**: ใช้ไลบรารี `QRCode.js` สร้างภาพ QR Code ประจำตัวพนักงาน สำหรับพิมพ์ลงบัตรหรือสแกนล็อกอิน

---

## 13. โครงสร้างตารางฐานข้อมูล Supabase

### 📊 ตารางหลักในระบบ (Core Tables)
1. **`employees` (ข้อมูลพนักงาน):**
   * `id` (uuid, Primary Key)
   * `employee_code` (varchar) - รหัสพนักงาน
   * `full_name` (varchar) - ชื่อ-นามสกุล
   * `email` / `phone` / `line_id` (varchar) - ช่องทางติดต่อ & LINE User ID
   * `department_id` (uuid) - สังกัดแผนก
   * `role` (varchar) - สิทธิ์ (`employee`, `leader`, `manager`, `hr`, `executive`)

2. **`leave_requests` (คำขออนุมัติใบลา):**
   * `id` (uuid, Primary Key)
   * `employee_id` (uuid, Foreign Key -> employees.id)
   * `leave_type_id` (uuid, Foreign Key -> leave_types.id)
   * `start_date` / `end_date` (date) - วันที่เริ่มและสิ้นสุด
   * `total_days` (numeric) - จำนวนวันลาสุทธิ
   * `reason` (text) - เหตุผลการลา
   * `attachment_url` (text) - ลิงก์รูปถ่ายใบรับรองแพทย์
   * `status` (varchar) - สถานะ (`pending`, `leader_approved`, `approved`, `rejected`, `cancelled`)

3. **`leave_balances` (สิทธิ์โควตาวันลาคงเหลือ):**
   * `employee_id` (uuid)
   * `leave_type_id` (uuid)
   * `year` (int) - ปี พ.ศ./ค.ศ.
   * `quota_amount` (numeric) - สิทธิ์วันลาทั้งหมด
   * `used_amount` (numeric) - วันลาที่ใช้ไปแล้ว
   * `remaining_amount` (numeric) - วันลาคงเหลือ

4. **`holidays` (วันหยุดประจำปีของบริษัท):**
   * `id` (uuid)
   * `holiday_date` (date) - วันที่หยุด
   * `holiday_name` (varchar) - ชื่อวันหยุด
   * `holiday_type` (varchar) - ประเภท (`official`, `company`, `substitution`)

---

## 14. เทคนิคการพัฒนาต่อยอดและการแก้ไขข้อผิดพลาด

### 💡 ข้อควรระวังและการทำ Maintenance
1. **การตรวจสอบสิทธิ์ LINE Notification:**
   * หาก LINE แจ้งเตือนไม่เด้ง ให้ตรวจสอบว่าฟิลด์ `line_id` ของพนักงานในตาราง `employees` ถูกต้องหรือไม่ และบอท LINE OA / Edge Function `line-send` เปิดทำงานปกติ
2. **การล้าง Cache บน PWA มือถือ:**
   * หากมีการแก้ไขโค้ด JS หรือ CSS แต่หน้าจอมือถือผู้ใช้ไม่อัปเดต ให้ทำการเปลี่ยนเลขเวอร์ชันใน `sw.js` เพื่อบังคับให้ Service Worker ทำการ Re-fetch ไฟล์ใหม่
3. **การทดสอบฐานข้อมูลออฟไลน์ (Offline Queue):**
   * ทดสอบได้โดยกด F12 -> Network -> เลือก `Offline` แล้วลองกดส่งใบลา ระบบจะบันทึกลง `localStorage` และเมื่อเปลี่ยนกลับเป็น `Online` ระบบจะยิ่งข้อมูลเข้า Supabase ให้อัตโนมัติ
