/**
 * 🕵️‍♂️ PVT HR LEAVE - DIAGNOSTIC & DEBUGGING TOOL (หน้าบ้าน)
 * ใช้สำหรับแกะรอยบั๊ก ดักจับ Error และจำลองสถานะระบบ
 */
const PVTDebugger = {
  // เปิด-ปิด โหมดการทำงาน (ถ้าขึ้น Production ให้ปรับเป็น false)
  enabled: true,

  log(message, context = null) {
    if (!this.enabled) return;
    console.log(`%c[PVT INFO] 🟢 ${message}`, "color: #10b981; font-weight: bold;", context || "");
  },

  warn(message, context = null) {
    if (!this.enabled) return;
    console.warn(`%c[PVT WARN] 🟡 ${message}`, "color: #f59e0b; font-weight: bold;", context || "");
  },

  // 🚨 พระเอกหลัก: ใช้ดักเวลาพวก API หรือ Auth พัง
  async error(errorInstance, customMessage = "") {
    if (!this.enabled) return;
    
    const errorDetails = {
      message: errorInstance?.message || errorInstance,
      status: errorInstance?.status || "N/A",
      stack: errorInstance?.stack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    console.error(
      `%c[PVT CRITICAL ERROR] 🔴 ${customMessage || 'พบจุดพังในระบบ'}`, 
      "color: #ef4444; font-size: 14px; font-weight: bold;", 
      errorDetails
    );

    // ✨ ฟังก์ชันเสริม: ส่ง Log บั๊กกลับไปเซฟในตารางฐานข้อมูลอัตโนมัติ (ถ้าต้องการ)
    // await this.sendReportToSupabase(errorDetails);
  },

  // 🧪 ตัวช่วยเช็คความพร้อมของ Supabase Client หน้าบ้าน
  checkSystemHealth() {
    this.log("กำลังตรวจสอบสถานะการเชื่อมต่อฐานข้อมูล...");
    const sb = window.pvtSupabase?.getClient();
    if (!sb) {
      this.warn("Supabase Client ยังไม่ได้ติดตั้ง หรือติดตั้งผิดโฟลเดอร์ (window.pvtSupabase ไม่ทำงาน)");
      return false;
    }
    this.log("Supabase Client เชื่อมต่อหน้าบ้านพร้อมใช้งานแล้ว ✅");
    return true;
  }
};

// 🛑 ดักจับกรณี Code พังกลางทางแต่ไม่มีใครเขียน try-catch ครอบไว้ (Global Error Listener)
window.addEventListener("error", (event) => {
  PVTDebugger.error(event.error, `บั๊กหลุดที่ไฟล์: ${event.filename} บรรทัดที่ ${event.lineno}`);
});

// 🛑 ดักจับกรณีคำสั่ง Promise/Async-Await พัง (เช่น Supabase ยิงไม่ผ่าน)
window.addEventListener("unhandledrejection", (event) => {
  PVTDebugger.error(event.reason, "Async/Await (Promise) พังกลางทางโดยไม่มีการดัก Catch");
});

// รันตรวจสุขภาพระบบทันทีที่โหลดสคริปต์
document.addEventListener("DOMContentLoaded", () => {
  PVTDebugger.checkSystemHealth();
});