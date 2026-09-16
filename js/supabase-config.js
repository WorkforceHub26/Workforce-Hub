/**
 * ============================================================================
 * PVT SUPABASE ENTERPRISE HR SDK (v3.0 Ultra)
 * Full-featured, Resilient & Modular Client Engine for Supabase
 * ============================================================================
 */

(function (global) {
  "use strict";

  // Configuration Constants
  const CONFIG = {
    URL: "https://pgogmhqjdchakcytsomx.supabase.co",
    ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnb2dtaHFqZGNoYWtjeXRzb214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjUxMzYsImV4cCI6MjA5NzM0MTEzNn0.Ah-uFFvTK_qMiIyJN9Ddid6cXqjrZRtLbs14QXUa_m8",
    CACHE_PREFIX: "pvt_hr_cache_",
    OFFLINE_QUEUE_KEY: "pvt_offline_queue",
    DEFAULT_TTL: 5 * 1000, // 5 วินาที เพื่อให้ข้อมูลสดใหม่อยู่เสมอและไม่อมแคชเก่า
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
  };

  // ==========================================================================
  // 1. SMART CACHE ENGINE (Storage + Memory + Tag Invalidation)
  // ==========================================================================
  class CacheEngine {
    constructor() {
      this.memoryCache = new Map();
    }

    _getKey(key) {
      return CONFIG.CACHE_PREFIX + key;
    }

    set(key, value, ttlMs = CONFIG.DEFAULT_TTL, tags = []) {
      const payload = {
        value,
        expiry: Date.now() + ttlMs,
        tags,
      };
      this.memoryCache.set(key, payload);
      try {
        localStorage.setItem(this._getKey(key), JSON.stringify(payload));
      } catch (e) {
        console.warn("[SDK Cache] LocalStorage quota exceeded, using memory cache.");
      }
    }

    get(key) {
      // 1. Check Memory
      if (this.memoryCache.has(key)) {
        const item = this.memoryCache.get(key);
        if (Date.now() <= item.expiry) return item.value;
        this.memoryCache.delete(key);
      }

      // 2. Check Storage
      try {
        const raw = localStorage.getItem(this._getKey(key));
        if (!raw) return null;
        const item = JSON.parse(raw);
        if (Date.now() > item.expiry) {
          this.remove(key);
          return null;
        }
        this.memoryCache.set(key, item);
        return item.value;
      } catch (e) {
        return null;
      }
    }

    remove(key) {
      this.memoryCache.delete(key);
      localStorage.removeItem(this._getKey(key));
    }

    invalidateByTag(tag) {
      // Clear memory
      for (const [key, item] of this.memoryCache.entries()) {
        if (item.tags && item.tags.includes(tag)) {
          this.memoryCache.delete(key);
        }
      }
      // Clear storage
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith(CONFIG.CACHE_PREFIX)) {
          try {
            const item = JSON.parse(localStorage.getItem(k));
            if (item?.tags?.includes(tag)) {
              localStorage.removeItem(k);
            }
          } catch (e) {}
        }
      });
    }

    clearAll() {
      this.memoryCache.clear();
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith(CONFIG.CACHE_PREFIX)) {
          localStorage.removeItem(k);
        }
      });
    }
  }

  // ==========================================================================
  // 2. RESILIENT NETWORK ENGINE (Auto Retry + Offline Detection)
  // ==========================================================================
  class NetworkEngine {
    constructor() {
      this.isOnline = navigator.onLine;
      window.addEventListener("online", () => this._handleOnlineStatus(true));
      window.addEventListener("offline", () => this._handleOnlineStatus(false));
    }

    _handleOnlineStatus(status) {
      this.isOnline = status;
      console.log(`[SDK Network] Connection Status: ${status ? "ONLINE" : "OFFLINE"}`);
      if (status) {
        global.PVTSDK.offline.processQueue();
      }
    }

    async retry(fn, maxRetries = CONFIG.MAX_RETRIES, delay = CONFIG.RETRY_DELAY) {
      let lastError;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (err) {
          lastError = err;
          console.warn(`[SDK Network] Attempt ${attempt} failed. Retrying in ${delay}ms...`);
          if (attempt < maxRetries) {
            await new Promise((res) => setTimeout(res, delay * Math.pow(2, attempt - 1)));
          }
        }
      }
      throw lastError;
    }
  }

  // ==========================================================================
  // 3. AUTH & RBAC ENGINE
  // ==========================================================================
  class AuthEngine {
    constructor(client, cache) {
      this.client = client;
      this.cache = cache;
    }

    async getSession() {
      if (!this.client?.auth) return null;
      const { data, error } = await this.client.auth.getSession();
      if (error) return null;
      return data?.session || null;
    }

    async getUser() {
      const session = await this.getSession();
      return session?.user || null;
    }

    parseJwt(token) {
      try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
        return JSON.parse(jsonPayload);
      } catch (e) {
        return null;
      }
    }

    async hasRole(roles = []) {
      const profile = await global.PVTSDK.hr.getProfile();
      if (!profile) return false;
      const userRole = profile.role || "employee";
      if (Array.isArray(roles)) {
        return roles.includes(userRole);
      }
      return userRole === roles;
    }
  }

  // ==========================================================================
  // 4. HR & PROFILE ENGINE
  // ==========================================================================
  class HREngine {
    constructor(client, cache, network) {
      this.client = client;
      this.cache = cache;
      this.network = network;
    }

      // ค้นหาฟังก์ชัน getProfile() ในไฟล์ pvt-supabase-sdk.js แล้วปรับเป็นแบบนี้:
      // ใน class HREngine (pvt-supabase-sdk.js)
        async getProfile(forceRefresh = false) {
          const cacheKey = "user_profile";
          if (!forceRefresh) {
            const cached = this.cache.get(cacheKey);
            if (cached) return cached;
          }

          let userId = null;
          let empCode = null;

          // 1. เช็ก Supabase Auth Session ก่อน
          const session = await global.PVTSDK.auth.getSession();
          if (session?.user) {
            userId = session.user.id;
          } else {
            // 2. ถ้าไม่มี Supabase Auth ให้ดึงจาก LocalStorage (รองรับ RPC Login)
            try {
              const rawLocal = localStorage.getItem("currentUser");
              if (rawLocal) {
                const localUser = JSON.parse(rawLocal);
                // ตรวจสอบว่า session หมดอายุหรือยัง (12 ชั่วโมง)
                if (localUser.expireAt && Date.now() > localUser.expireAt) {
                  localStorage.removeItem("currentUser");
                  return null;
                }
                userId = localUser.id;
                empCode = localUser.employee_code;
              }
            } catch (e) {
              console.warn("[SDK getProfile] Failed to parse local session:", e);
            }
          }

          if (!userId && !empCode) return null;

          // 3. Query ดึงข้อมูลพนักงานพร้อมแผนกและตำแหน่ง
          let query = this.client.from("employees").select(`
            *,
            departments!department_id (department_name),
            positions (position_name)
          `);

          if (userId) {
            query = query.eq("id", userId);
          } else if (empCode) {
            query = query.eq("employee_code", empCode);
          }

          const { data: employeeData, error } = await query.maybeSingle();

          if (error || !employeeData) return null;

          const fullProfile = {
            ...employeeData,
            department_name: employeeData.departments?.department_name || 'ไม่ระบุแผนก',
            position_name: employeeData.positions?.position_name || 'ไม่ระบุตำแหน่ง'
          };

          this.cache.set(cacheKey, fullProfile, CONFIG.DEFAULT_TTL, ["profile"]);
          return fullProfile;
        }

    async getEmployeesList(options = {}) {
      const { search = "", departmentId = null, role = null, page = 1, limit = 20, status = "active" } = options;
      const cacheKey = `employees_list_${search}_${departmentId}_${role}_${page}_${status}`;
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      let query = this.client
        .from("employees")
        .select(`*, departments!department_id(department_name), positions(position_name)`, { count: "exact" });

      if (search) {
        query = query.or(`full_name.ilike.%${search}%,employee_code.ilike.%${search}%,nickname.ilike.%${search}%`);
      }
      if (departmentId) query = query.eq("department_id", departmentId);
      if (role) query = query.eq("role", role);
      if (status) query = query.eq("status", status); // กรองสถานะพนักงาน (ค่าเริ่มต้นเป็น active)

      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to).order("employee_code", { ascending: true });

      const { data, count, error } = await query;
      if (error) throw error;

      const result = { data, total: count, page, limit };
      this.cache.set(cacheKey, result, 5 * 60 * 1000, ["employees"]);
      return result;
    }
  }

  // ==========================================================================
  // 5. LEAVE & THAI DATE ENGINE
  // ==========================================================================
  window.getCurrentLeaveYear = function() {
    const d = new Date();
    const y = d.getFullYear();
    return d.getMonth() === 11 ? y + 1 : y; // เดือนธันวาคม (1 ธ.ค. เป็นต้นไป) นับเป็นรอบปีการลาถัดไป (1 ธ.ค. – 30 พ.ย.)
  };

  window.getADYear = function(dateOrYear) {
    if (!dateOrYear) {
      return window.getCurrentLeaveYear();
    }
    if (typeof dateOrYear === 'number') {
      return dateOrYear > 2400 ? dateOrYear - 543 : dateOrYear;
    }
    const str = String(dateOrYear).trim();
    const parts = str.split('T')[0].split('-');
    let yearPart = parseInt(parts[0], 10);
    if (isNaN(yearPart)) {
      return window.getCurrentLeaveYear();
    }
    if (yearPart > 2400) yearPart -= 543;
    if (parts.length >= 2) {
      const monthPart = parseInt(parts[1], 10);
      if (monthPart === 12) {
        yearPart += 1; // 1 ธันวาคม เป็นต้นไป เป็นรอบปีการลาถัดไป (1 ธ.ค. – 30 พ.ย.)
      }
    }
    return yearPart;
  };

  class LeaveEngine {
    constructor(client, cache) {
      this.client = client;
      this.cache = cache;
    }

    async getDashboardData(targetYear = window.getCurrentLeaveYear()) {
      const yearAD = window.getADYear(targetYear);
      const cacheKey = `dashboard_data_${yearAD}`;
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      try {
        const { data, error } = await this.client.rpc("get_my_dashboard_data", { p_year: yearAD });
        if (!error && data) {
          this.cache.set(cacheKey, data, CONFIG.DEFAULT_TTL, ["leaves", "profile"]);
          return data;
        }
      } catch (e) {}

      // Fallback Manual
      const profile = await global.PVTSDK.hr.getProfile();
      if (!profile) return null;

      const leaveBalances = await this.getLeaveBalances(profile.id, yearAD);

      const result = {
        profile,
        leave_balances: leaveBalances || [],
        year: yearAD,
      };

      this.cache.set(cacheKey, result, CONFIG.DEFAULT_TTL, ["leaves"]);
      return result;
    }

    calculateWorkingDays(startDateStr, endDateStr, excludeWeekends = true) {
      const start = new Date(global.PVTSDK.utils.toISODate(startDateStr));
      const end = new Date(global.PVTSDK.utils.toISODate(endDateStr));
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;

      let count = 0;
      const cur = new Date(start);
      while (cur <= end) {
        const dayOfWeek = cur.getDay();
        if (!excludeWeekends || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
          count++;
        }
        cur.setDate(cur.getDate() + 1);
      }
      return count;
    }
  }

  // ==========================================================================
  // 6. STORAGE & MEDIA COMPRESSOR ENGINE
  // ==========================================================================
  class StorageEngine {
    constructor(client) {
      this.client = client;
    }

    getAvatarUrl(imageUrl) {
      if (!imageUrl || !String(imageUrl).trim()) {
        return "/assets/img/default-avatar.jpg";
      }
      let url = String(imageUrl).trim();
      if (url.startsWith("http")) return url;
      return `${CONFIG.URL}/storage/v1/object/public/employee-images/${url.replace(/^\//, "")}`;
    }

    async compressImage(file, maxWidth = 1000, maxHeight = 1000, quality = 0.8) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                reject(new Error("Canvas compression failed"));
              }
            },
            "image/jpeg",
            quality
          );
        };
        img.onerror = (err) => reject(err);
      });
    }

    async uploadEmployeeAvatar(employeeId, file) {
      const compressed = await this.compressImage(file, 800, 800, 0.85);
      const fileExt = "jpg";
      const filePath = `avatars/${employeeId}_${Date.now()}.${fileExt}`;

      const { data, error } = await this.client.storage
        .from("employee-images")
        .upload(filePath, compressed, { upsert: true });

      if (error) throw error;
      const avatarUrl = this.getAvatarUrl(filePath);

      // Update Database
      await this.client.from("employees").update({ image_url: filePath }).eq("id", employeeId);
      global.PVTSDK.cache.invalidateByTag("profile");

      return avatarUrl;
    }
  }

      // ==========================================================================
      // 7. REALTIME SYNCHRONIZATION ENGINE
      // ==========================================================================
      class RealtimeEngine {
        constructor(client) {
          this.client = client;
          this.channels = new Map();
        }

        subscribeLeaveUpdates(employeeId, onUpdateCallback) {
          const channelName = `realtime_leaves_${employeeId}`;
          if (this.channels.has(channelName)) return this.channels.get(channelName);

          const channel = this.client
            .channel(channelName)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "leave_requests",
                filter: `employee_id=eq.${employeeId}`,
              },
              (payload) => {
                console.log("[SDK Realtime] Leave Request Change Detected:", payload);
                global.PVTSDK.cache.invalidateByTag("leaves");
                if (typeof onUpdateCallback === "function") {
                  onUpdateCallback(payload);
                }
              }
            )
            .subscribe();

          this.channels.set(channelName, channel);
          return channel;
        }

        unsubscribeAll() {
          for (const [name, channel] of this.channels.entries()) {
            this.client.removeChannel(channel);
          }
          this.channels.clear();
        }
      }

      // ==========================================================================
      // 8. OFFLINE QUEUE ENGINE
      // ==========================================================================
      class OfflineEngine {
        getQueue() {
          try {
            return JSON.parse(localStorage.getItem(CONFIG.OFFLINE_QUEUE_KEY) || "[]");
          } catch (e) {
            return [];
          }
        }

        enqueue(action) {
          const queue = this.getQueue();
          queue.push({ ...action, timestamp: Date.now() });
          localStorage.setItem(CONFIG.OFFLINE_QUEUE_KEY, JSON.stringify(queue));
          console.log("[SDK Offline] Action queued:", action);
        }

        async processQueue() {
          const queue = this.getQueue();
          if (queue.length === 0) return;

          console.log(`[SDK Offline] Processing ${queue.length} pending actions...`);
          const remaining = [];

          for (const item of queue) {
            try {
              // Process action based on table & payload
              await global.PVTSDK.client.from(item.table).insert(item.payload);
            } catch (err) {
              console.error("[SDK Offline] Failed to process queued item:", item, err);
              remaining.push(item);
            }
          }

          localStorage.setItem(CONFIG.OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
        }
      }

      // ==========================================================================
      // 9. UTILITIES & SANITIZER ENGINE
      // ==========================================================================
      class UtilsEngine {
        toISODate(input) {
          if (!input) return null;
          const str = String(input).trim();
          if (!str) return null;

          const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
          if (dmyMatch) {
            let [, day, month, year] = dmyMatch.map(Number);
            if (year > 2400) year -= 543;
            return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          }

          const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
          if (ymdMatch) {
            let [, year, month, day] = ymdMatch.map(Number);
            if (year > 2400) year -= 543;
            return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          }

          const parsed = new Date(str);
          if (!isNaN(parsed.getTime())) {
            let year = parsed.getFullYear();
            if (year > 2400) year -= 543;
            return `${year}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
          }
          return null;
        }

        formatThaiDate(dateValue, format = "short") {
          if (!dateValue) return "-";
          const iso = this.toISODate(dateValue);
          if (!iso) return dateValue;

          const d = new Date(`${iso}T00:00:00`);
          if (isNaN(d.getTime())) return dateValue;

          const yearType = format === "full" ? "numeric" : "2-digit";
          const monthType = format === "full" ? "long" : "short";

          return new Intl.DateTimeFormat("th-TH", {
            day: "2-digit",
            month: monthType,
            year: yearType,
          }).format(d);
        }

        escapeHtml(value) {
          return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
        }

        validateThaiCitizenId(id) {
          if (!id || id.length !== 13 || !/^\d+$/.test(id)) return false;
          let sum = 0;
          for (let i = 0; i < 12; i++) {
            sum += parseInt(id.charAt(i)) * (13 - i);
          }
          const check = (11 - (sum % 11)) % 10;
          return check === parseInt(id.charAt(12));
        }

        formatPhoneNumber(phone) {
          const clean = String(phone).replace(/\D/g, "");
          if (clean.length === 10) {
            return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
          }
          return phone;
        }
      }

    // ==========================================================================
    // 10. SDK INITIALIZER & BOOTSTRAP
    // ==========================================================================
    class PVTHRSdk {
      constructor() {
        this.client = null;
        this.cache = new CacheEngine();
        this.network = new NetworkEngine();
        this.utils = new UtilsEngine();
        this.offline = new OfflineEngine();

        this._initClient();

        this.auth = new AuthEngine(this.client, this.cache);
        this.hr = new HREngine(this.client, this.cache, this.network);
        this.leave = new LeaveEngine(this.client, this.cache);
        this.storage = new StorageEngine(this.client);
        this.realtime = new RealtimeEngine(this.client);
        
        // Modules
        this.user = new UserEngine(this.client, this.cache, this.network);
        this.card = new CardEngine(this.client);
        this.attendance = new AttendanceEngine(this.client, this.cache);
        this.loginAudit = new LoginAuditEngine(this.client, this.cache);
        this.notification = new NotificationEngine(this.client);
        this.line = new LineOAEngine(this.client);
        this.viewport = new ViewportEngine(); // ✅ เพิ่มเรียบร้อย
      }
      
      getClient() {
        return this.client;
      }

      _initClient() {
        if (window.supabaseClient) {
          this.client = window.supabaseClient;
          return;
        }
        if (global.supabase?.createClient) {
          this.client = global.supabase.createClient(CONFIG.URL, CONFIG.ANON_KEY);
          window.supabaseClient = this.client;
        } else {
          console.error("[SDK Error] Supabase JS Client is not loaded on window.");
        }
      }
    }

    // ==========================================================================
  // 11. USER & CENTRAL SERVICE ENGINE
  // ==========================================================================
  class UserEngine {
    constructor(client, cache, network) {
      this.client = client;
      this.cache = cache;
      this.network = network;
      this._leaveBalanceInsertForbidden = false;
      this._inflightBalances = new Map();
    }

    // ตรวจสอบว่าระบบถูกบล็อกสิทธิ์ INSERT ลง employee_leave_balances (401/403/RLS) หรือไม่
    isElbInsertBlocked() {
      if (this._leaveBalanceInsertForbidden) return true;
      try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pvt_elb_insert_forbidden') === 'true') {
          this._leaveBalanceInsertForbidden = true;
          return true;
        }
      } catch(e) {}
      return false;
    }

    markElbInsertBlocked() {
      this._leaveBalanceInsertForbidden = true;
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('pvt_elb_insert_forbidden', 'true');
        }
      } catch(e) {}
    }

    // ดึงโปรไฟล์พนักงาน + แผนก + ตำแหน่ง (พร้อมระบบ Cache)
    async getFullProfile(employeeId, forceRefresh = false) {
      if (!employeeId) throw new Error("ไม่พบ Employee ID");
      const cacheKey = `full_profile_${employeeId}`;

      if (!forceRefresh) {
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;
      }

      const { data, error } = await this.client
        .from('employees')
        .select(`
          id, employee_code, role, status,
          title, first_name, last_name, full_name, nickname,
          phone, email, line_id, image_url,
          department_id, position_id, employment_type, hospital, bank_account,
          start_date, converted_date, resign_date, created_at, updated_at,
          departments!department_id ( id, department_code, department_name, department_name_en, status, created_at ),
          positions ( id, position_name, department_id, status, created_at )
        `)
        .eq('id', employeeId)
        .maybeSingle();

      if (error) throw new Error("ดึงข้อมูลพนักงานไม่สำเร็จ: " + error.message);
      if (!data) throw new Error("ไม่พบข้อมูลพนักงานในระบบ");

      const result = {
        ...data,
        department_name: data.departments?.department_name || 'ไม่ระบุแผนก',
        position_name: data.positions?.position_name || 'ไม่ระบุตำแหน่ง'
      };

      this.cache.set(cacheKey, result, CONFIG.DEFAULT_TTL, ["profile"]);
      return result;
    }

    // Helper แปลง employee_leave_balances แถวเดียว ให้เป็นอาร์เรย์รายการวันลาตามประเภท
    transformEmployeeLeaveBalanceToItems(row, leaveTypesList) {
      if (!row) return [];
      const yr = row.year;
      const empId = row.employee_id;

      let typesToUse = leaveTypesList;
      if (!typesToUse || typesToUse.length === 0) {
        typesToUse = [
          { id: 'sick_type', leave_code: 'SICK', leave_name: 'ลาป่วย' },
          { id: 'personal_type', leave_code: 'PERSONAL', leave_name: 'ลากิจ' },
          { id: 'vacation_type', leave_code: 'VACATION', leave_name: 'ลาพักร้อน' },
          { id: 'maternity_type', leave_code: 'MATERNITY', leave_name: 'ลาคลอดบุตร' },
          { id: 'other_type', leave_code: 'OTHER', leave_name: 'ลาอื่นๆ' }
        ];
      }

      return typesToUse.map(lt => {
        const code = String(lt.leave_code || '').toUpperCase();
        const name = String(lt.leave_name || '').toLowerCase();

        let total = 0;
        let used = 0;

        if (code === 'SICK' || code === '01' || name.includes('ป่วย')) {
          total = Number(row.sick_total ?? 30);
          used = Number(row.sick_used ?? 0);
        } else if (code === 'PERSONAL' || code === '02' || name.includes('กิจ')) {
          total = Number(row.personal_total ?? 6);
          used = Number(row.personal_used ?? 0);
        } else if (code === 'VACATION' || code === '03' || name.includes('พักร้อน') || name.includes('พักผ่อน')) {
          total = Number(row.vacation_total ?? 6);
          used = Number(row.vacation_used ?? 0);
        } else if (code === 'MATERNITY' || name.includes('คลอด')) {
          total = Number(row.maternity_total ?? 98);
          used = Number(row.maternity_used ?? 0);
        } else {
          total = Number(row.other_total ?? 30);
          used = Number(row.other_used ?? 0);
        }

        return {
          id: `${row.id}_${lt.id}`,
          row_id: row.id,
          employee_id: empId,
          leave_type_id: lt.id,
          year: yr,
          entitlement_days: total,
          used_days: used,
          remaining_days: Math.max(0, total - used),
          quota: total,
          leave_types: {
            id: lt.id,
            leave_code: lt.leave_code || code,
            leave_name: lt.leave_name || name
          }
        };
      });
    }

    // ดึงวันลาคงเหลือ
    async getLeaveBalances(employeeId, year = window.getCurrentLeaveYear()) {
      if (!this.client || !employeeId) return [];
      const yearAD = window.getADYear(year);
      const thaiYear = yearAD + 543;

      const cacheKey = `user_leave_balances_${employeeId}_${yearAD}`;
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      // In-flight deduplication: หากมีคำขอเดียวกันกำลังทำงานอยู่ ให้รอผลจาก promise เดียวกัน
      if (!this._inflightBalances) this._inflightBalances = new Map();
      if (this._inflightBalances.has(cacheKey)) {
        return await this._inflightBalances.get(cacheKey);
      }

      const fetchPromise = (async () => {
        let result = [];
        try {
          const { data: empBalList, error: empBalErr } = await this.client
            .from('employee_leave_balances')
            .select('*')
            .eq('employee_id', employeeId)
            .in('year', [yearAD, thaiYear])
            .order('created_at', { ascending: false })
            .limit(1);

          const empBal = (empBalList && empBalList.length > 0) ? empBalList[0] : null;

          if (!empBalErr && empBal) {
            const { data: lTypes } = await this.client
              .from('leave_types')
              .select('*');
            result = this.transformEmployeeLeaveBalanceToItems(empBal, lTypes || []);
          }
        } catch (e) {
          console.warn("employee_leave_balances fetch notice:", e);
        }

        // 🛡️ หากยังไม่มีข้อมูลโควตาใน employee_leave_balances
        // เช็กก่อนว่า client มีสิทธิ์ INSERT หรือไม่ ถ้าไม่มีให้ข้ามไปคำนวณ Virtual ทันที (ป้องกัน Error 401 ใน Console)
        if (!result || result.length === 0) {
          if (!this.isElbInsertBlocked()) {
            try {
              const ensureRes = await this.ensureLeaveBalances(employeeId, yearAD);
              if (ensureRes?.status === 'created') {
                const { data: empBalList } = await this.client
                  .from('employee_leave_balances')
                  .select('*')
                  .eq('employee_id', employeeId)
                  .in('year', [yearAD, thaiYear])
                  .limit(1);

                if (empBalList && empBalList.length > 0) {
                  const { data: lTypes } = await this.client.from('leave_types').select('*');
                  result = this.transformEmployeeLeaveBalanceToItems(empBalList[0], lTypes || []);
                }
              }
            } catch (e) {
              // Silently handle
            }
          }
        }

        // 🛡️ Fallback: หากยังไม่มี record ใน employee_leave_balances (เช่น Client ยังไม่ได้ล็อกอิน Supabase Auth หรือ RLS 401)
        // คำนวณยอดโควตาจริงบนระบบทันทีโดยอิงจาก leave_types, อายุงาน และประวัติการลาจริง
        if (!result || result.length === 0) {
          try {
            let vacationDays = 6.0;
            try {
              const { data: empData } = await this.client
                .from('employees')
                .select('start_date, created_at')
                .eq('id', employeeId)
                .maybeSingle();
              if (empData) {
                const sDate = empData.start_date || empData.created_at;
                if (sDate && (Date.now() - new Date(sDate).getTime()) / (1000 * 3600 * 24) < 365) {
                  vacationDays = 0.0;
                }
              }
            } catch(e) {}

            const virtualRow = {
              id: `v_${employeeId}_${yearAD}`,
              employee_id: employeeId,
              year: yearAD,
              sick_total: 30.0,
              sick_used: 0.0,
              personal_total: 6.0,
              personal_used: 0.0,
              vacation_total: vacationDays,
              vacation_used: 0.0,
              maternity_total: 98.0,
              maternity_used: 0.0,
              other_total: 30.0,
              other_used: 0.0
            };

            const { data: reqs } = await this.client
              .from('leave_requests')
              .select('leave_type_id, total_days, status, start_date')
              .eq('employee_id', employeeId)
              .not('status', 'eq', 'rejected')
              .not('status', 'eq', 'cancelled');

            const { data: lTypes } = await this.client.from('leave_types').select('*');
            const typesMap = {};
            (lTypes || []).forEach(lt => { typesMap[String(lt.id)] = lt; });

            (reqs || []).forEach(r => {
              const reqYear = window.getADYear(r.start_date);
              if (reqYear === yearAD) {
                const lt = typesMap[String(r.leave_type_id)];
                const code = String(lt?.leave_code || '').toUpperCase();
                const name = String(lt?.leave_name || '').toLowerCase();
                const days = parseFloat(r.total_days) || 0;
                if (code === 'SICK' || code === '01' || name.includes('ป่วย')) virtualRow.sick_used += days;
                else if (code === 'PERSONAL' || code === '02' || name.includes('กิจ')) virtualRow.personal_used += days;
                else if (code === 'VACATION' || code === '03' || name.includes('พัก')) virtualRow.vacation_used += days;
                else if (code === 'MATERNITY' || name.includes('คลอด')) virtualRow.maternity_used += days;
                else virtualRow.other_used += days;
              }
            });

            result = this.transformEmployeeLeaveBalanceToItems(virtualRow, lTypes || []);
          } catch(fbErr) {
            console.warn("Virtual balance calculation fallback notice:", fbErr);
          }
        }

        this.cache.set(cacheKey, result || [], CONFIG.DEFAULT_TTL, ["leaves"]);
        return result || [];
      })();

      this._inflightBalances.set(cacheKey, fetchPromise);
      try {
        return await fetchPromise;
      } finally {
        this._inflightBalances.delete(cacheKey);
      }
    }

    // ตรวจสอบและสร้างโควตาวันลาอัตโนมัติหากยังไม่มีในปีนั้นๆ (ใช้ AD เป็นมาตรฐาน)
    async ensureLeaveBalances(employeeId, yearOrDate = window.getCurrentLeaveYear()) {
      if (!this.client || !employeeId) return { status: 'skipped', message: 'Missing parameters' };
      if (this.isElbInsertBlocked()) {
        return { status: 'skipped', message: 'Insert unauthorized for client' };
      }

      try {
        const yearAD = window.getADYear(yearOrDate);
        const thaiYear = yearAD + 543;
        
        // 1. ตรวจสอบตารางหลัก employee_leave_balances (อ่านได้เสมอ)
        const { data: empBalList } = await this.client
          .from('employee_leave_balances')
          .select('id')
          .eq('employee_id', employeeId)
          .in('year', [yearAD, thaiYear])
          .limit(1);

        if (empBalList && empBalList.length > 0) {
          return { status: 'existed', message: 'มีข้อมูลแล้ว', id: empBalList[0].id };
        }

        // 🎯 เช็กอายุงานของพนักงาน (ถ้าทำงานไม่ถึง 1 ปี / 365 วัน ให้ vacation_total = 0.0)
        let vacationTotalDays = 6.0;
        try {
          const { data: empData } = await this.client
            .from('employees')
            .select('start_date, created_at')
            .eq('id', employeeId)
            .maybeSingle();

          if (empData) {
            const startDateStr = empData.start_date || empData.created_at;
            if (startDateStr) {
              const startDate = new Date(startDateStr);
              const now = new Date();
              const diffMs = now.getTime() - startDate.getTime();
              const diffDays = diffMs / (1000 * 3600 * 24);
              if (diffDays < 365) {
                vacationTotalDays = 0.0;
              }
            }
          }
        } catch(e) {}

        const { error: insertError } = await this.client
          .from('employee_leave_balances')
          .insert([{
            employee_id: employeeId,
            year: yearAD,
            sick_total: 30.0,
            sick_used: 0.0,
            personal_total: 6.0,
            personal_used: 0.0,
            vacation_total: vacationTotalDays,
            vacation_used: 0.0,
            maternity_total: 98.0,
            maternity_used: 0.0,
            other_total: 30.0,
            other_used: 0.0
          }]);

        if (insertError) {
          // หากติด RLS หรือสิทธิ์ 401 Unauthorized ให้บันทึกสถานะไว้เพื่อไม่ส่ง Request ซ้ำ
          this.markElbInsertBlocked();
          return { status: 'error', message: insertError.message || insertError };
        }

        console.log("✅ Auto-created missing employee_leave_balances for year", yearAD);
        return { status: 'created', message: 'สร้างข้อมูลเรียบร้อยแล้ว' };
      } catch (err) {
        this.markElbInsertBlocked();
        return { status: 'error', message: err.message || err };
      }
    }

    // อัปเดต/หัก ยอดวันลาในตารางหลัก employee_leave_balances
    async updateLeaveBalance(employeeId, leaveTypeId, leaveCode, yearAD, deltaUsedDays, absoluteUsedDays = null, absoluteTotalDays = null) {
      if (!this.client || !employeeId) return;
      try {
        let code = (leaveCode || '').toUpperCase();
        if (!code && leaveTypeId) {
          const { data: lt } = await this.client.from('leave_types').select('leave_code, leave_name').eq('id', leaveTypeId).maybeSingle();
          if (lt) {
            code = (lt.leave_code || '').toUpperCase();
            if (!code && (lt.leave_name || '').includes('ป่วย')) code = 'SICK';
            if (!code && (lt.leave_name || '').includes('กิจ')) code = 'PERSONAL';
            if (!code && (lt.leave_name || '').includes('พัก')) code = 'VACATION';
          }
        }

        let usedCol = 'other_used';
        let totalCol = 'other_total';
        if (code === 'SICK' || code === '01' || code.includes('SICK') || code.includes('ป่วย')) {
          usedCol = 'sick_used'; totalCol = 'sick_total';
        } else if (code === 'PERSONAL' || code === '02' || code.includes('PERSONAL') || code.includes('กิจ')) {
          usedCol = 'personal_used'; totalCol = 'personal_total';
        } else if (code === 'VACATION' || code === '03' || code.includes('VACATION') || code.includes('พัก')) {
          usedCol = 'vacation_used'; totalCol = 'vacation_total';
        } else if (code === 'MATERNITY' || code.includes('MATERNITY') || code.includes('คลอด')) {
          usedCol = 'maternity_used'; totalCol = 'maternity_total';
        } else {
          usedCol = 'other_used'; totalCol = 'other_total';
        }

        const { data: row } = await this.client
          .from('employee_leave_balances')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('year', yearAD)
          .maybeSingle();

        const updates = { updated_at: new Date().toISOString() };
        if (absoluteTotalDays !== null) {
          updates[totalCol] = Math.max(0, absoluteTotalDays);
        }

        if (row) {
          const currentUsed = Number(row[usedCol] || 0);
          const newUsed = absoluteUsedDays !== null 
            ? Math.max(0, absoluteUsedDays)
            : Math.max(0, Math.round((currentUsed + deltaUsedDays) * 100) / 100);
          updates[usedCol] = newUsed;

          await this.client
            .from('employee_leave_balances')
            .update(updates)
            .eq('id', row.id);
        } else {
          if (this.isElbInsertBlocked()) return;
          const initialUsed = absoluteUsedDays !== null ? absoluteUsedDays : Math.max(0, deltaUsedDays);
          const initialTotal = absoluteTotalDays !== null ? absoluteTotalDays : 30;
          const { error: insErr } = await this.client
            .from('employee_leave_balances')
            .insert([{
              employee_id: employeeId,
              year: yearAD,
              sick_used: 0,
              sick_total: 30,
              personal_used: 0,
              personal_total: 6,
              vacation_used: 0,
              vacation_total: 6,
              maternity_used: 0,
              maternity_total: 98,
              other_used: 0,
              other_total: 30,
              [usedCol]: initialUsed,
              [totalCol]: initialTotal
            }]);
          if (insErr) {
            this.markElbInsertBlocked();
          }
        }
      } catch(err) {
        console.warn("⚠️ updateLeaveBalance error:", err);
      }
    }

    // ระบบ Logout กลาง (ล้างทั้ง Session และ SDK Cache)
    async logout() {
      this.cache.clearAll();
      localStorage.clear();
      sessionStorage.clear();
      if (this.client?.auth) {
        try { await this.client.auth.signOut(); } catch (e) {}
      }
      window.location.replace("/index.html");
    }
  }

    // ==========================================================================
    // 12. DIGITAL CARD ENGINE (PERMANENT INDIVIDUAL QR)
    // ==========================================================================
    class CardEngine {
      constructor(client) {
        this.client = client;
        this.timerInstance = null;
      }

      // สร้าง URL สำหรับ QR Code ถาวรประจำตัวพนักงาน
      getSecureToken(employeeCode) {
        const cleanCode = String(employeeCode || "").trim();
        const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
        const autoLoginUrl = `${origin}/index.html?auto_login=${encodeURIComponent(cleanCode)}`;
        return {
          qr_token: autoLoginUrl,
          employee_code: cleanCode
        };
      }

      // สั่งแสดง QR Code ถาวรประจำตัวพนักงาน
      async init(employeeCode, qrContainerId = "qrcode", countdownElementId = "qr-countdown") {
        if (!employeeCode) return;
        this.stop();

        try {
          const container = document.getElementById(qrContainerId);
          if (!container) return;

          const { qr_token } = this.getSecureToken(employeeCode);
          container.innerHTML = "";

          if (typeof QRCode !== 'undefined') {
            try {
              new QRCode(container, {
                text: qr_token,
                width: 160,
                height: 160,
                correctLevel: QRCode.CorrectLevel.M
              });
            } catch (qrErr) {
              console.warn("⚠️ [CardEngine] QRCode instance creation error, using img fallback:", qrErr);
              const qrImg = document.createElement('img');
              qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qr_token)}`;
              qrImg.alt = "Employee QR Code";
              qrImg.style.width = "160px";
              qrImg.style.height = "160px";
              qrImg.style.borderRadius = "8px";
              container.appendChild(qrImg);
            }
          } else {
            const qrImg = document.createElement('img');
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qr_token)}`;
            qrImg.alt = "Employee QR Code";
            qrImg.style.width = "160px";
            qrImg.style.height = "160px";
            qrImg.style.borderRadius = "8px";
            container.appendChild(qrImg);
          }

          const countdownEl = document.getElementById(countdownElementId);
          if (countdownEl) {
            countdownEl.textContent = "QR Code ถาวรประจำตัวพนักงาน";
          }
        } catch (err) {
          console.error("⚠️ [CardEngine] QR Error:", err);
          const container = document.getElementById(qrContainerId);
          if (container) {
            const origin = window.location.origin || "";
            const fallbackUrl = `${origin}/index.html?auto_login=${encodeURIComponent(employeeCode)}`;
            container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(fallbackUrl)}" style="width:160px; height:160px; border-radius:8px;" />`;
          }
        }
      }

      stop() {
        if (this.timerInstance) {
          clearInterval(this.timerInstance);
          this.timerInstance = null;
        }
      }
    }

    // ==========================================================================
    // 12.1 ATTENDANCE & QR LOG ENGINE
    // ==========================================================================
    class AttendanceEngine {
      constructor(client, cache) {
        this.client = client;
        this.cache = cache;
      }

      /**
       * Record successful QR code scans into 'qr_attendance_logs' table in Supabase.
       * Captures employee ID and timestamp for audit purposes.
       * 
       * @param {string} employeeId - UUID or Employee ID
       * @param {Object} [metadata={}] - Optional metadata (scanned_data, scan_type, status, etc.)
       * @returns {Promise<Object|null>} Inserted record or null
       */
      async recordQrAttendanceLog(employeeId, metadata = {}) {
        if (!employeeId) {
          console.warn("⚠️ [AttendanceEngine] Missing employeeId for QR attendance log");
          return null;
        }

        const client = this.client || window.supabaseClient || window.pvtSupabase?.getClient?.();
        if (!client) {
          console.error("❌ [AttendanceEngine] Supabase client is not available");
          return null;
        }

        const scannedAt = metadata.scanned_at || metadata.timestamp || new Date().toISOString();
        const payload = {
          employee_id: employeeId,
          scanned_at: scannedAt,
          status: metadata.status || 'success',
          scanned_data: metadata.scanned_data || metadata.scannedData || null,
          scan_type: metadata.scan_type || metadata.scanType || 'qr_scan',
          created_at: new Date().toISOString()
        };

        try {
          let { data, error } = await client
            .from('qr_attendance_logs')
            .insert([payload])
            .select();

          if (error) {
            console.warn("⚠️ [AttendanceEngine] Full insert into qr_attendance_logs failed, attempting fallback:", error.message);
            const minimalPayload = {
              employee_id: employeeId,
              scanned_at: scannedAt
            };
            const fallbackRes = await client
              .from('qr_attendance_logs')
              .insert([minimalPayload])
              .select();

            if (fallbackRes.error) {
              console.error("❌ [AttendanceEngine] Fallback insert failed:", fallbackRes.error.message);
              return null;
            }
            data = fallbackRes.data;
          }

          console.log("✅ [AttendanceEngine] QR attendance log recorded successfully:", { employeeId, scannedAt, data });
          return data ? (Array.isArray(data) ? data[0] : data) : null;
        } catch (err) {
          console.error("❌ [AttendanceEngine] Unexpected error recording QR scan:", err);
          return null;
        }
      }
    }

    // ==========================================================================
    // 12.2 LOGIN ACTIVITY & AUDIT TRACKING ENGINE
    // Records user ID, timestamp, and device info into 'login_logs' table
    // ==========================================================================
    class LoginAuditEngine {
      constructor(client, cache) {
        this.client = client;
        this.cache = cache;
      }

      /**
       * Collects comprehensive client device information for audit logging
       */
      getDeviceInfo() {
        const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';

        // Operating System detection
        let os = 'Unknown OS';
        if (/windows phone/i.test(ua)) os = 'Windows Phone';
        else if (/win/i.test(ua)) os = 'Windows';
        else if (/android/i.test(ua)) os = 'Android';
        else if (/ipad|iphone|ipod/i.test(ua)) os = 'iOS';
        else if (/mac/i.test(ua)) os = 'macOS';
        else if (/linux/i.test(ua)) os = 'Linux';

        // Browser detection
        let browser = 'Unknown Browser';
        if (/Line\//i.test(ua)) browser = 'LINE In-App Browser';
        else if (/FBAV|FBAN/i.test(ua)) browser = 'Facebook In-App Browser';
        else if (/Instagram/i.test(ua)) browser = 'Instagram In-App Browser';
        else if (/edg/i.test(ua)) browser = 'Microsoft Edge';
        else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
        else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
        else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Apple Safari';
        else if (/opera|opr/i.test(ua)) browser = 'Opera';

        // Form Factor / Device Category
        let deviceType = 'Desktop';
        if (/tablet|ipad/i.test(ua) || (typeof screen !== 'undefined' && Math.min(screen.width, screen.height) >= 600 && Math.min(screen.width, screen.height) <= 900)) {
          deviceType = 'Tablet';
        } else if (/mobile|iphone|ipod|android/i.test(ua) || (typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 600)) {
          deviceType = 'Mobile';
        }

        const screenRes = typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'N/A';
        const viewportRes = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A';
        const lang = typeof navigator !== 'undefined' ? (navigator.language || 'th-TH') : 'th-TH';
        let timezone = 'Asia/Bangkok';
        try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok'; } catch (e) {}

        return {
          os,
          browser,
          device_type: deviceType,
          screen: screenRes,
          viewport: viewportRes,
          language: lang,
          timezone,
          user_agent: ua
        };
      }

      /**
       * Records login activity into Supabase 'login_logs' table.
       * Captures User ID, Timestamp, and Device Info for audit purposes.
       * 
       * @param {Object|string} user - Employee object or User ID string
       * @param {Object} [options={}] - Additional metadata (method: 'password'|'qr_code'|'auto_token', status, etc.)
       * @returns {Promise<Object|null>}
       */
      async recordLoginLog(user, options = {}) {
        try {
          const userId = typeof user === 'object' && user ? (user.id || user.employee_code || user.employee_id) : user;
          if (!userId) {
            console.warn("⚠️ [LoginAuditEngine] Missing user identifier for login log");
            return null;
          }

          const timestamp = options.timestamp || new Date().toISOString();
          const deviceInfo = options.device_info || this.getDeviceInfo();
          const loginMethod = options.method || options.login_method || 'password';
          const status = options.status || 'success';

          const empCode = typeof user === 'object' && user ? (user.employee_code || '') : '';
          const fullName = typeof user === 'object' && user ? (user.full_name || '') : '';
          const role = typeof user === 'object' && user ? (user.role || '') : '';
          const employeeId = typeof user === 'object' && user && user.id ? user.id : (String(userId).length === 36 ? userId : null);

          const payload = {
            user_id: String(userId),
            employee_id: employeeId,
            employee_code: empCode,
            full_name: fullName,
            role: role,
            timestamp: timestamp,
            device_info: deviceInfo,
            login_method: loginMethod,
            status: status,
            metadata: options.metadata || { source: 'web_portal' },
            created_at: timestamp
          };

          // 1. Try server-side API first (best for capturing real client IP and using service_role)
          try {
            const apiRes = await fetch('/api/record-login-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            if (apiRes.ok) {
              const resJson = await apiRes.json();
              console.log("✅ [LoginAuditEngine] Login activity logged via server API:", resJson);
              this._bufferLocalLog(payload);
              return resJson;
            }
          } catch (apiErr) {
            // Proceed to direct SDK call
          }

          // 2. Direct Supabase SDK insert into 'login_logs' table
          const client = this.client || window.supabaseClient || window.pvtSupabase?.getClient?.();
          if (client) {
            try {
              const { data, error } = await client
                .from('login_logs')
                .insert([payload])
                .select();

              if (!error && data) {
                console.log("✅ [LoginAuditEngine] Login activity recorded directly in Supabase 'login_logs':", data);
                this._bufferLocalLog(payload);
                return Array.isArray(data) ? data[0] : data;
              }

              console.warn("⚠️ [LoginAuditEngine] Direct insert into 'login_logs' notice:", error?.message);

              // If 'login_logs' table is not yet migrated, save into hr_admin_management_logs fallback
              try {
                await client.from('hr_admin_management_logs').insert([{
                  actor_id: employeeId,
                  actor_name: fullName || empCode || 'User',
                  action_category: 'LOGIN_AUDIT',
                  action_type: `LOGIN_${String(loginMethod).toUpperCase()}`,
                  target_identifier: empCode || String(userId),
                  description: `เข้าสู่ระบบสำเร็จ (${deviceInfo.browser} บน ${deviceInfo.os})`,
                  payload_after: payload
                }]);
                console.log("ℹ️ [LoginAuditEngine] Fallback audit log saved in hr_admin_management_logs");
              } catch (fallbackErr) {}

            } catch (sdkErr) {
              console.warn("⚠️ [LoginAuditEngine] SDK error:", sdkErr);
            }
          }

          // 3. Keep local storage buffer
          this._bufferLocalLog(payload);
          return payload;
        } catch (err) {
          console.error("❌ [LoginAuditEngine] Unexpected error recording login log:", err);
          return null;
        }
      }

      _bufferLocalLog(payload) {
        try {
          const localLogs = JSON.parse(localStorage.getItem('pvt_login_logs_history') || '[]');
          localLogs.unshift({ ...payload, buffered_at: new Date().toISOString() });
          if (localLogs.length > 50) localLogs.length = 50;
          localStorage.setItem('pvt_login_logs_history', JSON.stringify(localLogs));
        } catch (e) {}
      }

      /**
       * Retrieve recent login logs for audit analysis
       */
      async getLoginLogs(limit = 50) {
        // Try server API first
        try {
          const res = await fetch(`/api/login-logs?limit=${limit}`);
          if (res.ok) {
            const json = await res.json();
            if (json.data && json.data.length > 0) return json.data;
          }
        } catch (e) {}

        const client = this.client || window.supabaseClient || window.pvtSupabase?.getClient?.();
        if (client) {
          try {
            const { data, error } = await client
              .from('login_logs')
              .select('*')
              .order('timestamp', { ascending: false })
              .limit(limit);
            if (!error && data && data.length > 0) return data;
          } catch (e) {}

          // Fallback to hr_admin_management_logs
          try {
            const { data } = await client
              .from('hr_admin_management_logs')
              .select('*')
              .eq('action_category', 'LOGIN_AUDIT')
              .order('created_at', { ascending: false })
              .limit(limit);
            if (data && data.length > 0) {
              return data.map(d => d.payload_after || {
                user_id: d.actor_id,
                full_name: d.actor_name,
                employee_code: d.target_identifier,
                timestamp: d.created_at,
                device_info: { description: d.description },
                login_method: d.action_type
              });
            }
          } catch (e) {}
        }

        // Local storage fallback
        try {
          return JSON.parse(localStorage.getItem('pvt_login_logs_history') || '[]');
        } catch (e) {
          return [];
        }
      }
    }
class NotificationEngine {
  constructor(client) {
    this.client = client;
  }

  // 1. ดึงรายการแจ้งเตือนที่ยังไม่ได้อ่าน
  async getUnread(userId) {
    if (!userId) return [];
    const { data, error } = await this.client
      .from('notifications')
      .select('id, employee_id, title, message, is_read, type, link_url, created_at')
      .eq('employee_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn("⚠️ [Notification] Fetch error:", error.message);
      return [];
    }
    return data || [];
  }

  // 2. เปลี่ยนสถานะเป็นอ่านแล้ว (Mark as Read)
  async markAsRead(notificationId) {
    if (!notificationId) return false;
    const { error } = await this.client
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) {
      console.error("❌ [Notification] Mark read error:", error.message);
      return false;
    }
    return true;
  }

  // 3. รับแจ้งเตือนแบบ Realtime เมื่อมีข้อความใหม่เด้งเข้า DB
  subscribe(userId, callback) {
    if (!userId) return null;
    return this.client
      .channel(`realtime_notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `employee_id=eq.${userId}`
        },
        (payload) => {
          if (typeof callback === 'function') {
            callback(payload.new);
          }
        }
      )
      .subscribe();
  }
}

// ==========================================================================
// 💬 LINE OA NOTIFICATION ENGINE (หัวหน้า -> ผู้จัดการ -> พนักงาน)
// ==========================================================================
class LineOAEngine {
  constructor(client) {
    this.client = client;
    this.webhookUrl = "";
    this.channelAccessToken = "";
    this._loadConfig(); // โหลดคอนฟิกจาก DB ทันที
  }

  async _loadConfig() {
    if (!this.client) return;
    try {
      const { data } = await this.client
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'line_oa_config')
        .maybeSingle();
      
      if (data?.setting_value) {
        this.webhookUrl = data.setting_value.webhook_url || "";
        this.channelAccessToken = data.setting_value.channel_access_token || "";
      }
    } catch (e) {
      console.warn("⚠️ [LINE OA] Failed to load config from system_settings:", e);
    }
  }

  async setConfig(webhookUrl, channelToken) {
    this.webhookUrl = webhookUrl;
    this.channelAccessToken = channelToken;
    if (this.client) {
      await this.client.from('system_settings').upsert({
        setting_key: 'line_oa_config',
        setting_value: { webhook_url: webhookUrl, channel_access_token: channelToken },
        updated_at: new Date().toISOString()
      });
    }
  }

  /**
   * แปลงจำนวนวัน/ชั่วโมงให้เป็นข้อความภาษาไทยที่อ่านเข้าใจง่าย
   * เช่น 0.0625 วัน -> 30 นาที, 0.125 วัน -> 1 ชั่วโมง, 5.875 วัน -> 5 วัน 7 ชั่วโมง
   */
  formatLeaveDurationFriendly(totalDays, totalHours = 0, options = {}) {
    const d = parseFloat(totalDays) || 0;
    const h = parseFloat(totalHours) || 0;
    const isCompact = Boolean(options.compact);

    const uDays = isCompact ? "วัน" : "วัน";
    const uHours = isCompact ? "ชม." : "ชั่วโมง";
    const uMins = "นาที";

    // 1) กรณีระบุ totalHours ชัดเจน
    if (h > 0) {
      const totalMinutes = Math.round(h * 60);
      const daysFromHours = Math.floor(totalMinutes / 480);
      const remMinutes = totalMinutes % 480;
      const wholeH = Math.floor(remMinutes / 60);
      const mins = remMinutes % 60;

      let parts = [];
      if (daysFromHours > 0) parts.push(`${daysFromHours} ${uDays}`);
      if (wholeH > 0) parts.push(`${wholeH} ${uHours}`);
      if (mins > 0) parts.push(`${mins} ${uMins}`);

      return parts.length > 0 ? parts.join(" ") : `${h} ${uHours}`;
    }

    if (d <= 0) return `0 ${uDays}`;

    // 2) คำนวณตามสูตร 1 วันทำงาน = 8 ชั่วโมง = 480 นาที (เพื่อความแม่นยำ 100% ป้องกันทศนิยมลอยน้ำ)
    const totalMinutes = Math.round(d * 480);
    const wholeDays = Math.floor(totalMinutes / 480);
    const remainingMinutes = totalMinutes % 480;
    const wholeH = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;

    // กรณีค่าน้อยกว่า 1 วัน
    if (wholeDays === 0) {
      if (wholeH === 4 && mins === 0) {
        return isCompact ? "4 ชม. (ครึ่งวัน)" : "4 ชั่วโมง (ลาครึ่งวัน)";
      }
      if (wholeH === 0 && mins === 30) return "30 นาที";
      if (wholeH === 0 && mins > 0) return `${mins} นาที`;
      if (wholeH > 0 && mins === 0) return `${wholeH} ${uHours}`;
      if (wholeH > 0 && mins > 0) return `${wholeH} ${uHours} ${mins} ${uMins}`;
      return `${Number(d.toFixed(2))} ${uDays}`;
    }

    // กรณีตั้งแต่ 1 วันขึ้นไป (เช่น 5.875 วัน -> 5 วัน 7 ชั่วโมง)
    let parts = [`${wholeDays} ${uDays}`];
    if (wholeH === 4 && mins === 0) {
      parts.push(isCompact ? `4 ชม. (ครึ่งวัน)` : `4 ชั่วโมง (ลาครึ่งวัน)`);
    } else {
      if (wholeH > 0) parts.push(`${wholeH} ${uHours}`);
      if (mins > 0) parts.push(`${mins} ${uMins}`);
    }

    return parts.join(" ");
  }

  /**
   * แปลงโควต้าวันลาคงเหลือให้มนุษย์เข้าใจง่ายทันที
   * เช่น 5.875 -> '5 วัน 7 ชม.'
   */
  formatLeaveQuotaFriendly(days) {
    const num = parseFloat(days) || 0;
    if (num <= 0) return "0 วัน";
    if (Number.isInteger(num)) return `${num} วัน`;
    return this.formatLeaveDurationFriendly(num, 0, { compact: true });
  }

  formatThaiDateShort(dateStr) {
    if (!dateStr) return '-';
    if (dateStr.includes('ม.ค.') || dateStr.includes('ก.พ.') || dateStr.includes('ส.ค.')) return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const day = d.getDate();
    const month = thaiMonths[d.getMonth()];
    const year = d.getFullYear() + 543;
    return `${day} ${month} ${year}`;
  }

  formatLineFlexCard(type, opts = {}) {
    const {
      leaveId = '',
      employeeName = 'พนักงาน',
      employeeCode = '',
      departmentName = '',
      leaveType = 'ใบลา',
      durationFormatted = '1 วัน',
      dateFormatted = '',
      reason = '',
      comment = '',
      nowStr = '',
      approvalUrl = '',
      historyUrl = '',
      attachmentUrl = ''
    } = opts;

    let headerTitle = "คำขอใบลาใหม่";
    let themeColor = "#4f46e5"; // Modern Indigo/Purple (SCB/KBank modern style)
    let highlightBg = "#f4f3ff";
    let highlightText = "#4338ca";
    let statusBadgeText = "⏳ รออนุมัติขั้นต้น (L1)";
    let statusBadgeBg = "#e0e7ff";
    let statusBadgeColor = "#3730a3";
    let actionLabel = "👉 ตรวจสอบใบลา";
    let actionUrl = approvalUrl;
    let showComment = false;

    switch (type) {
      case 'NEW_REQUEST':
        headerTitle = "คำขอใบลาใหม่ (รออนุมัติ L1)";
        themeColor = "#4f46e5"; // Indigo
        highlightBg = "#eff6ff";
        highlightText = "#1d4ed8";
        statusBadgeText = "⏳ รอการอนุมัติขั้นต้น (L1)";
        statusBadgeBg = "#dbeafe";
        statusBadgeColor = "#1e40af";
        actionLabel = "👉 ตรวจสอบใบลา";
        actionUrl = approvalUrl;
        break;

      case 'LEADER_APPROVED':
        headerTitle = "ผ่านการอนุมัติขั้นต้น (L1)";
        themeColor = "#059669"; // Emerald Green
        highlightBg = "#ecfdf5";
        highlightText = "#047857";
        statusBadgeText = "🟢 ผ่าน L1 (รออนุมัติ L2)";
        statusBadgeBg = "#d1fae5";
        statusBadgeColor = "#065f46";
        actionLabel = "👉 ตรวจสอบใบลา L2";
        actionUrl = approvalUrl;
        showComment = true;
        break;

      case 'MANAGER_APPROVED':
        headerTitle = "ผ่านการอนุมัติระดับผู้จัดการ (L2)";
        themeColor = "#0284c7"; // Sky Blue
        highlightBg = "#f0f9ff";
        highlightText = "#0369a1";
        statusBadgeText = "🔵 ผ่าน L2 (รอฝ่ายบุคคล)";
        statusBadgeBg = "#e0f2fe";
        statusBadgeColor = "#075985";
        actionLabel = "👉 ตรวจสอบใบลา";
        actionUrl = approvalUrl;
        showComment = true;
        break;

      case 'HR_REVIEW':
      case 'PENDING_HR':
        headerTitle = "คำขอใบลาส่งต่อฝ่ายบุคคล (HR Review)";
        themeColor = "#0d9488"; // Teal
        highlightBg = "#f0fdfa";
        highlightText = "#0f766e";
        statusBadgeText = "📋 รอฝ่ายบุคคลตรวจสอบ/บันทึก";
        statusBadgeBg = "#ccfbf1";
        statusBadgeColor = "#115e59";
        actionLabel = "👉 เข้าสู่ระบบ HR";
        actionUrl = approvalUrl;
        showComment = true;
        break;

      case 'HR_NOTIFY':
        headerTitle = "สรุปใบลาอนุมัติสมบูรณ์ (แจ้ง HR)";
        themeColor = "#0284c7"; // Sky Blue
        highlightBg = "#f0f9ff";
        highlightText = "#0369a1";
        statusBadgeText = "✅ อนุมัติสมบูรณ์ (บันทึกสถิติ HR)";
        statusBadgeBg = "#e0f2fe";
        statusBadgeColor = "#075985";
        actionLabel = "📂 เปิดระบบจัดการ HR";
        actionUrl = approvalUrl;
        showComment = true;
        break;

      case 'REQUEST_APPROVED':
      case 'FINAL_APPROVED':
        headerTitle = "ใบลาได้รับการอนุมัติเรียบร้อย";
        themeColor = "#16a34a"; // Vibrant Green
        highlightBg = "#f0fdf4";
        highlightText = "#15803d";
        statusBadgeText = "✅ อนุมัติสมบูรณ์เรียบร้อย";
        statusBadgeBg = "#dcfce7";
        statusBadgeColor = "#166534";
        actionLabel = "📋 ดูประวัติการลา";
        actionUrl = historyUrl;
        break;

      case 'REJECTED':
        headerTitle = "คำขอใบลาไม่อนุมัติ";
        themeColor = "#dc2626"; // Crimson Red
        highlightBg = "#fef2f2";
        highlightText = "#b91c1c";
        statusBadgeText = "❌ คำขอไม่อนุมัติ";
        statusBadgeBg = "#fee2e2";
        statusBadgeColor = "#991b1b";
        actionLabel = "📋 ดูรายละเอียด";
        actionUrl = historyUrl;
        showComment = true;
        break;

      case 'CANCELLATION':
        headerTitle = "แจ้งเตือนคำขอยกเลิกใบลา";
        themeColor = "#d97706"; // Amber / Gold
        highlightBg = "#fffbeb";
        highlightText = "#b45309";
        statusBadgeText = "⚠️ ขอยกเลิกใบลา";
        statusBadgeBg = "#fef3c7";
        statusBadgeColor = "#92400e";
        actionLabel = "👉 ดูคำขอยกเลิก";
        actionUrl = approvalUrl;
        break;
    }

    const detailRows = [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "👤 ชื่อผู้ขอลา", size: "sm", color: "#64748b", flex: 4 },
          { type: "text", text: employeeName, size: "sm", color: "#0f172a", weight: "bold", flex: 6, align: "end", wrap: true }
        ]
      }
    ];

    if (employeeCode) {
      detailRows.push({
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "🆔 รหัสพนักงาน", size: "sm", color: "#64748b", flex: 4 },
          { type: "text", text: employeeCode, size: "sm", color: "#0f172a", weight: "bold", flex: 6, align: "end", wrap: true }
        ]
      });
    }

    if (departmentName) {
      detailRows.push({
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "🏢 แผนก", size: "sm", color: "#64748b", flex: 4 },
          { type: "text", text: departmentName, size: "sm", color: "#334155", flex: 6, align: "end", wrap: true }
        ]
      });
    }

    detailRows.push(
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "📅 วันที่ลา", size: "sm", color: "#64748b", flex: 4 },
          { type: "text", text: dateFormatted, size: "sm", color: "#334155", flex: 6, align: "end", wrap: true }
        ]
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "💬 เหตุผล", size: "sm", color: "#64748b", flex: 4 },
          { type: "text", text: reason || "ไม่ได้ระบุ", size: "sm", color: "#334155", flex: 6, align: "end", wrap: true }
        ]
      }
    );

    if (showComment && comment) {
      detailRows.push({
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "✍️ ความเห็น", size: "sm", color: "#64748b", flex: 4 },
          { type: "text", text: comment, size: "sm", color: "#475569", flex: 6, align: "end", wrap: true }
        ]
      });
    }

    detailRows.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "⏰ วันเวลาทำรายการ", size: "xs", color: "#94a3b8", flex: 5 },
        { type: "text", text: nowStr, size: "xs", color: "#94a3b8", flex: 5, align: "end" }
      ]
    });

    // ตรวจสอบชนิดไฟล์แนบว่าเป็นรูปภาพหรือไม่
    const isImage = attachmentUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(attachmentUrl.split('?')[0]);

    return {
      type: "flex",
      altText: `🔔 ${headerTitle}: ${employeeName} - ${leaveType} (${durationFormatted})`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: themeColor,
          paddingAll: "18px",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: "PVT WORKFORCE",
                  weight: "bold",
                  color: "#ffffff",
                  size: "xs"
                },
                {
                  type: "text",
                  text: "SLIP NOTIFICATION",
                  color: "#ffffff",
                  size: "xxs",
                  align: "end"
                }
              ]
            },
            {
              type: "text",
              text: headerTitle,
              weight: "bold",
              color: "#ffffff",
              size: "lg",
              margin: "sm",
              wrap: true
            }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "20px",
          spacing: "md",
          contents: [
            // Big Amount-Style Hero Card (คล้ายสลิปโอนเงินธนาคาร)
            {
              type: "box",
              layout: "vertical",
              backgroundColor: highlightBg,
              paddingAll: "16px",
              cornerRadius: "12px",
              contents: [
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      text: "ระยะเวลาการลาทั้งหมด",
                      size: "xs",
                      color: highlightText,
                      weight: "bold"
                    },
                    {
                      type: "text",
                      text: `📝 ${leaveType}`,
                      size: "xs",
                      color: highlightText,
                      align: "end",
                      weight: "bold"
                    }
                  ]
                },
                {
                  type: "text",
                  text: durationFormatted,
                  weight: "bold",
                  size: "xl",
                  color: highlightText,
                  margin: "sm",
                  wrap: true
                }
              ]
            },

            // Status Badge Bar
            {
              type: "box",
              layout: "horizontal",
              backgroundColor: statusBadgeBg,
              paddingAll: "8px",
              cornerRadius: "8px",
              contents: [
                {
                  type: "text",
                  text: statusBadgeText,
                  size: "xs",
                  color: statusBadgeColor,
                  weight: "bold",
                  align: "center"
                }
              ]
            },

            // SLA Deadline warning box inside the LINE Flex Card
            ...(['NEW_REQUEST', 'LEADER_APPROVED', 'MANAGER_APPROVED', 'CANCELLATION'].includes(type) ? [
              {
                type: "box",
                layout: "horizontal",
                backgroundColor: "#fff7ed",
                borderColor: "#ffedd5",
                borderWidth: "1px",
                paddingAll: "8px",
                cornerRadius: "8px",
                margin: "md",
                contents: [
                  {
                    type: "text",
                    text: "⚠️ กรุณาดำเนินการอนุมัติภายใน 2 วันทำการ",
                    size: "xs",
                    color: "#ea580c",
                    weight: "bold",
                    align: "center"
                  }
                ]
              }
            ] : []),

            // Separator line (เส้นแบ่งสวยๆ แบบสลิป)
            {
              type: "separator",
              margin: "lg",
              color: "#e2e8f0"
            },

            // Clean Key-Value Table Details
            {
              type: "box",
              layout: "vertical",
              margin: "lg",
              spacing: "md",
              contents: detailRows
            },

            // 🖼️ Leave Attachment Preview (รูปหลักฐานการลาแบบสวยงามและเห็นชัดเจน)
            ...(isImage ? [
              {
                type: "separator",
                margin: "lg",
                color: "#e2e8f0"
              },
              {
                type: "box",
                layout: "vertical",
                spacing: "xs",
                margin: "lg",
                contents: [
                  {
                    type: "text",
                    text: "🖼️ หลักฐานแนบประกอบการลา",
                    size: "xs",
                    color: "#64748b",
                    weight: "bold"
                  },
                  {
                    type: "image",
                    url: attachmentUrl,
                    size: "full",
                    aspectMode: "cover",
                    aspectRatio: "16:9",
                    cornerRadius: "8px",
                    action: {
                      type: "uri",
                      label: "ดูรูปขนาดเต็ม",
                      uri: attachmentUrl
                    }
                  }
                ]
              }
            ] : []),

            // Dotted Separator line
            {
              type: "separator",
              margin: "lg",
              color: "#e2e8f0"
            },

            // Bottom Bot Credit
            {
              type: "text",
              text: "ระบบแจ้งเตือนอัตโนมัติ — PVT Workforce Bot",
              size: "xxs",
              color: "#cbd5e1",
              align: "center",
              margin: "sm"
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "16px",
          paddingTop: "0px",
          contents: (() => {
            const isApprovalNotif = ['NEW_REQUEST', 'LEADER_APPROVED', 'MANAGER_APPROVED', 'CANCELLATION'].includes(type);
            if (isApprovalNotif && leaveId) {
              return [
                {
                  type: "box",
                  layout: "horizontal",
                  spacing: "md",
                  margin: "none",
                  contents: [
                    {
                      type: "button",
                      style: "primary",
                      color: "#10b981",
                      height: "md",
                      action: {
                        type: "uri",
                        label: "✅ อนุมัติ (Approve)",
                        uri: `${approvalUrl}?id=${leaveId}&action=approve`
                      }
                    },
                    {
                      type: "button",
                      style: "primary",
                      color: "#ef4444",
                      height: "md",
                      action: {
                        type: "uri",
                        label: "❌ ปฏิเสธ (Reject)",
                        uri: `${approvalUrl}?id=${leaveId}&action=reject`
                      }
                    }
                  ]
                },
                {
                  type: "button",
                  style: "secondary",
                  height: "md",
                  margin: "sm",
                  action: {
                    type: "uri",
                    label: "🔍 รายละเอียดเพิ่มเติม",
                    uri: `${approvalUrl}?id=${leaveId}`
                  }
                }
              ];
            } else {
              return [
                {
                  type: "button",
                  style: "primary",
                  color: themeColor,
                  height: "md",
                  action: {
                    type: "uri",
                    label: actionLabel,
                    uri: actionUrl
                  }
                }
              ];
            }
          })()
        }
      }
    };
  }

  async sendWorkflowNotification(opts = {}) {
    const {
      type = 'NEW_REQUEST',
      leaveId = '',
      employeeName = 'พนักงาน',
      employeeCode = '',
      departmentName = '',
      recipientId = '',
      recipientRole = 'leader',
      recipientLineId = '',
      leaveType = 'ใบลา',
      startDate = '',
      endDate = '',
      totalDays = 1,
      leaveHours = 0,
      reason = '',
      comment = '',
      attachmentUrl = ''
    } = opts;

    const nowStr = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
    const origin = (typeof window !== 'undefined' && window.location.origin) 
      ? window.location.origin 
      : 'https://ais-dev-65m6k5jsxexajsrlv3c3x6-414501392488.asia-southeast1.run.app';
    const approvalUrl = `${origin}/pages/hr/hr.html`;
    const historyUrl = `${origin}/pages/user/leave-history.html`;

    // แปลงระยะเวลาลาและวันที่ให้เป็นข้อความเข้าใจง่าย
    const durationFormatted = this.formatLeaveDurationFriendly(totalDays, leaveHours);
    const startStr = this.formatThaiDateShort(startDate);
    const endStr = this.formatThaiDateShort(endDate);
    const dateFormatted = (startStr === endStr) ? startStr : `${startStr} ถึง ${endStr}`;

    let title = "";
    let messageText = "";

    switch (type) {
      case 'NEW_REQUEST':
        title = "📩 มีคำขอใบลาใหม่ (รออนุมัติ L1)";
        messageText = 
          `📩 [แจ้งเตือนคำขอใบลาใหม่ - รออนุมัติ]\n` +
          `⚠️ กรุณาดำเนินการอนุมัติภายใน 2 วันทำการ\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 ผู้ขอลา: ${employeeName} (${employeeCode || '-'})\n` +
          (departmentName ? `🏢 แผนก: ${departmentName}\n` : '') +
          `📝 ประเภทการลา: ${leaveType}\n` +
          `⏱️ ระยะเวลาลา: ${durationFormatted}\n` +
          `📅 วันที่ลา: ${dateFormatted}\n` +
          `💬 เหตุผลการลา: ${reason || 'ไม่ได้ระบุ'}\n` +
          `⏰ วันเวลาที่ยื่น: ${nowStr}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👉 กดลิงก์ด้านล่างเพื่อพิจารณาอนุมัติ:\n` +
          `🔗 ${approvalUrl}`;
        break;

      case 'LEADER_APPROVED':
        title = "🟢 หัวหน้างานอนุมัติแล้ว (รออนุมัติ L2)";
        messageText = 
          `🟢 [คำขอลาผ่านการอนุมัติขั้นต้น (L1)]\n` +
          `⚠️ กรุณาดำเนินการอนุมัติภายใน 2 วันทำการ\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 ผู้ขอลา: ${employeeName} (${employeeCode || '-'})\n` +
          (departmentName ? `🏢 แผนก: ${departmentName}\n` : '') +
          `📝 ประเภทการลา: ${leaveType}\n` +
          `⏱️ ระยะเวลาลา: ${durationFormatted}\n` +
          `📅 วันที่ลา: ${dateFormatted}\n` +
          `💬 เหตุผลการลา: ${reason || 'ไม่ได้ระบุ'}\n` +
          `💬 ความเห็นหัวหน้า (L1): ${comment || 'เห็นควรอนุมัติ'}\n` +
          `⏰ ดำเนินการเมื่อ: ${nowStr}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👉 กดลิงก์เพื่อพิจารณาอนุมัติขั้นสุดท้าย (L2):\n` +
          `🔗 ${approvalUrl}`;
        break;

      case 'MANAGER_APPROVED':
        title = "🔵 ผู้จัดการฝ่ายอนุมัติแล้ว (รอการพิจารณาถัดไป)";
        messageText = 
          `🔵 [คำขอลาผ่านการอนุมัติระดับผู้จัดการ (L2)]\n` +
          `⚠️ กรุณาดำเนินการอนุมัติภายใน 2 วันทำการ\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 ผู้ขอลา: ${employeeName} (${employeeCode || '-'})\n` +
          (departmentName ? `🏢 แผนก: ${departmentName}\n` : '') +
          `📝 ประเภทการลา: ${leaveType}\n` +
          `⏱️ ระยะเวลาลา: ${durationFormatted}\n` +
          `📅 วันที่ลา: ${dateFormatted}\n` +
          `💬 เหตุผลการลา: ${reason || 'ไม่ได้ระบุ'}\n` +
          `💬 ความเห็นผู้จัดการ (L2): ${comment || 'เห็นควรอนุมัติ'}\n` +
          `⏰ ดำเนินการเมื่อ: ${nowStr}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👉 กดลิงก์เพื่อเข้าสู่ระบบอนุมัติ:\n` +
          `🔗 ${approvalUrl}`;
        break;

      case 'HR_REVIEW':
      case 'PENDING_HR':
        title = "📋 ถึงคิวฝ่ายบุคคล (HR) ตรวจสอบใบลา";
        messageText = 
          `📋 [คำขอลาส่งต่อฝ่ายบุคคล (HR Review)]\n` +
          `⚠️ กรุณาดำเนินการตรวจสอบและบันทึกสถิติ\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 ผู้ขอลา: ${employeeName} (${employeeCode || '-'})\n` +
          (departmentName ? `🏢 แผนก: ${departmentName}\n` : '') +
          `📝 ประเภทการลา: ${leaveType}\n` +
          `⏱️ ระยะเวลาลา: ${durationFormatted}\n` +
          `📅 วันที่ลา: ${dateFormatted}\n` +
          `💬 เหตุผลการลา: ${reason || 'ไม่ได้ระบุ'}\n` +
          `💬 ความเห็นผู้อนุมัติ: ${comment || 'ผ่านการอนุมัติระดับสายงานแล้ว'}\n` +
          `⏰ ส่งเรื่องเมื่อ: ${nowStr}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👉 กดลิงก์เพื่อเข้าสู่ระบบ HR:\n` +
          `🔗 ${approvalUrl}`;
        break;

      case 'HR_NOTIFY':
        title = "📢 แจ้งฝ่ายบุคคล: อนุมัติใบลาสมบูรณ์แล้ว";
        messageText = 
          `📢 [แจ้งฝ่ายบุคคล (HR) - สรุปผลอนุมัติใบลา]\n` +
          `✨ ใบลาได้รับการอนุมัติเรียบร้อยและบันทึกลงระบบแล้ว\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 พนักงาน: ${employeeName} (${employeeCode || '-'})\n` +
          (departmentName ? `🏢 แผนก: ${departmentName}\n` : '') +
          `📝 ประเภทการลา: ${leaveType}\n` +
          `⏱️ ระยะเวลาลา: ${durationFormatted}\n` +
          `📅 วันที่ลา: ${dateFormatted}\n` +
          `💬 เหตุผลการลา: ${reason || '-'}\n` +
          `💬 ความเห็นผู้อนุมัติ: ${comment || 'อนุมัติเรียบร้อย'}\n` +
          `⏰ ดำเนินการเมื่อ: ${nowStr}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🔗 ตรวจสอบข้อมูลในระบบ HR:\n` +
          `${approvalUrl}`;
        break;

      case 'REQUEST_APPROVED':
      case 'FINAL_APPROVED':
        title = "🎉 ใบลาของคุณได้รับการอนุมัติสมบูรณ์แล้ว";
        messageText = 
          `🎉 [ผลการพิจารณาใบลา - อนุมัติเรียบร้อย]\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 พนักงาน: ${employeeName} (${employeeCode || '-'})\n` +
          `📝 ประเภทการลา: ${leaveType}\n` +
          `⏱️ ระยะเวลาลา: ${durationFormatted}\n` +
          `📅 วันที่ลา: ${dateFormatted}\n` +
          `💬 เหตุผลการลา: ${reason || '-'}\n` +
          `✨ สถานะ: อนุมัติสมบูรณ์เรียบร้อยแล้ว\n` +
          `⏰ ดำเนินการเมื่อ: ${nowStr}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🔗 ตรวจสอบประวัติใบลาของคุณ:\n` +
          `${historyUrl}`;
        break;

      case 'REJECTED':
        title = "❌ คำขอใบลาไม่ได้รับการอนุมัติ";
        messageText = 
          `❌ [ผลการพิจารณาใบลา - ไม่อนุมัติ]\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 พนักงาน: ${employeeName} (${employeeCode || '-'})\n` +
          `📝 ประเภทการลา: ${leaveType}\n` +
          `⏱️ ระยะเวลาลา: ${durationFormatted}\n` +
          `📅 วันที่ลา: ${dateFormatted}\n` +
          `💬 เหตุผลการลา: ${reason || '-'}\n` +
          `⚠️ เหตุผลที่ไม่ผ่าน: ${comment || 'ไม่ได้ระบุ'}\n` +
          `⏰ ดำเนินการเมื่อ: ${nowStr}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🔗 ตรวจสอบรายละเอียดใบลาของคุณ:\n` +
          `${historyUrl}`;
        break;

      case 'CANCELLATION':
        title = "⚠️ แจ้งเตือนคำขอยกเลิกใบลา";
        messageText = 
          `⚠️ [แจ้งเตือนคำขอยกเลิกใบลา]\n` +
          `⚠️ กรุณาดำเนินการอนุมัติภายใน 2 วันทำการ\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 พนักงาน: ${employeeName} (${employeeCode || '-'})\n` +
          (departmentName ? `🏢 แผนก: ${departmentName}\n` : '') +
          `📝 ประเภทการลา: ${leaveType}\n` +
          `⏱️ ระยะเวลาลา: ${durationFormatted}\n` +
          `📅 วันที่ลา: ${dateFormatted}\n` +
          `💬 เหตุผลในการขอยกเลิก: ${reason || 'ไม่ได้ระบุ'}\n` +
          `⏰ ยื่นเรื่องเมื่อ: ${nowStr}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👉 กดลิงก์ด้านล่างเพื่อพิจารณาคำขอยกเลิก:\n` +
          `🔗 ${approvalUrl}`;
        break;

      default:
        title = "📢 แจ้งเตือนระบบใบลา PVT HR";
        messageText = `ข้อมูลคำขอลาของคุณมีความเคลื่อนไหว (${type})`;
    }

    console.log(`💬 [LINE OA Engine] Processing [${type}] for ${recipientRole}:`, messageText);

    // 1. บันทึกแจ้งเตือนลงฐานข้อมูล (In-App Notifications)
    const isApprovalNotice = ['NEW_REQUEST', 'LEADER_APPROVED', 'MANAGER_APPROVED', 'CANCELLATION'].includes(type);
    const targetLinkUrl = isApprovalNotice ? '/pages/hr/hr.html' : '/pages/user/leave-history.html';

    if (this.client && recipientId) {
      try {
        await this.client.from('notifications').insert([{
          employee_id: recipientId,
          title: title,
          message: messageText.replace(/\*\*/g, ''),
          type: 'leave',
          link_url: targetLinkUrl,
          is_read: false
        }]);
      } catch (err) {
        console.warn("⚠️ [LINE OA Engine] DB notification log fallback:", err);
      }
    }

    // 2. 💬 กรองให้ส่งแจ้งเตือน LINE ภายนอกครอบคลุมทั้งกระบวนการลา:
    //   - ส่งคำขอลาใหม่ -> แจ้งเตือนผู้อนุมัติ (L1)
    //   - อนุมัติเบื้องต้น -> แจ้งเตือนผู้จัดการ (L2)
    //   - อนุมัติระดับผู้จัดการ -> แจ้งเตือนผู้บริหาร (L3) / HR
    //   - อนุมัติสมบูรณ์ / ปฏิเสธ -> แจ้งเตือนพนักงานผู้ขอลา
    //   - ขอยกเลิกใบลา -> แจ้งเตือนผู้อนุมัติ
    const allowedLineTypes = [
      'NEW_REQUEST', 
      'LEADER_APPROVED', 
      'MANAGER_APPROVED', 
      'EXECUTIVE_APPROVED',
      'PENDING_HR',
      'HR_REVIEW',
      'HR_NOTIFY',
      'REQUEST_APPROVED', 
      'FINAL_APPROVED', 
      'REJECTED', 
      'CANCELLATION', 
      'TEST'
    ];
    if (!allowedLineTypes.includes(type)) {
      console.log(`ℹ️ [LINE OA Engine] Skip external LINE message for [${type}] per workflow setting.`);
      return { success: true, title, message: messageText, lineSent: false };
    }

    // 🎛️ ตรวจสอบการตั้งค่าสวิตช์ LINE Notification Steps จากตาราง system_settings
    if (this.client) {
      try {
        const { data: notifSettingsRes } = await this.client
          .from('system_settings')
          .select('setting_value')
          .eq('setting_key', 'line_notification_settings')
          .maybeSingle();

        if (notifSettingsRes?.setting_value) {
          const settings = notifSettingsRes.setting_value;
          let isEnabled = true;

          if (type === 'NEW_REQUEST') {
            if (recipientRole === 'leader' && settings.new_request === false) {
              isEnabled = false;
            } else if (recipientRole === 'manager' && settings.new_request_l2 === false) {
              isEnabled = false;
            } else if ((recipientRole === 'hr' || recipientRole === 'admin') && settings.hr_review === false) {
              isEnabled = false;
            } else if (settings.new_request === false) {
              isEnabled = false;
            }
          } else if (type === 'LEADER_APPROVED' || type === 'MANAGER_APPROVED' || type === 'EXECUTIVE_APPROVED' || type === 'PENDING_HR' || type === 'HR_REVIEW') {
            if ((recipientRole === 'hr' || recipientRole === 'admin' || type === 'HR_REVIEW') && settings.hr_review === false) {
              isEnabled = false;
            } else if (type === 'LEADER_APPROVED' && settings.leader_approved === false) {
              isEnabled = false;
            } else if (type === 'MANAGER_APPROVED' && settings.manager_approved === false) {
              isEnabled = false;
            }
          } else if (type === 'HR_NOTIFY') {
            if (settings.hr_notify === false) {
              isEnabled = false;
            }
          } else if (type === 'REQUEST_APPROVED' || type === 'FINAL_APPROVED') {
            if ((recipientRole === 'hr' || recipientRole === 'admin') && settings.hr_notify === false) {
              isEnabled = false;
            } else if (settings.final_approved === false) {
              isEnabled = false;
            }
          } else if (type === 'REJECTED') {
            if (settings.rejected === false) isEnabled = false;
          } else if (type === 'CANCELLATION') {
            if ((recipientRole === 'hr' || recipientRole === 'admin') && settings.hr_notify === false) {
              isEnabled = false;
            } else if (settings.cancellation === false) {
              isEnabled = false;
            }
          }

          if (!isEnabled) {
            console.log(`ℹ️ [LINE OA Engine] Skip external LINE message for [${type}] to [${recipientRole}] per LINE Notification settings.`);
            return { success: true, title, message: messageText, lineSent: false, disabledBySetting: true };
          }
        }
      } catch (err) {
        console.warn("⚠️ [LINE OA Engine] Failed to evaluate LINE notification settings:", err);
      }
    }

    // Auto-lookup line_id if recipientLineId is missing but recipientId is provided
    let targetLineId = recipientLineId;
    if (!targetLineId && recipientId && this.client) {
      try {
        const { data: empData } = await this.client.from('employees').select('line_id').eq('id', recipientId).maybeSingle();
        if (empData && empData.line_id) {
          targetLineId = empData.line_id;
        }
      } catch (lookupErr) {
        console.warn("⚠️ [LINE OA Engine] Failed to lookup recipient line_id:", recipientId, lookupErr);
      }
    }

    // สร้าง Flex Message Card สไตล์เดียวกับสลิปธนาคาร (SCB Slip Card UI)
    const flexCardObj = this.formatLineFlexCard(type, {
      leaveId,
      employeeName,
      employeeCode,
      departmentName,
      leaveType,
      durationFormatted,
      dateFormatted,
      reason,
      comment,
      nowStr,
      approvalUrl,
      historyUrl,
      attachmentUrl
    });

    // 3. ส่ง LINE ผ่าน Supabase Edge Function: line-send หรือ Server API: /api/send-notification
    if (!targetLineId) {
      console.warn(
        "⚠️ [LINE OA] ผู้รับยังไม่ได้ผูก LINE User ID (หรือไม่มีในระบบ):",
        recipientId
      );

      return {
        success: true,
        title,
        message: messageText,
        lineSent: false,
        warning: "ผู้รับยังไม่ได้ผูกบัญชี LINE ID ในโปรไฟล์"
      };
    }

    try {
      const LINE_SEND_URL = `${CONFIG.URL}/functions/v1/line-send`;

      let response = await fetch(LINE_SEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": CONFIG.ANON_KEY,
          "Authorization": `Bearer ${CONFIG.ANON_KEY}`
        },
        body: JSON.stringify({
          to: targetLineId,
          message: messageText.replace(/\*\*/g, ""),
          flexMessage: flexCardObj
        })
      });

      if (!response.ok) {
        console.warn("⚠️ [LINE OA] line-send Edge Function fallback to /api/send-notification");
        response = await fetch('/api/send-notification', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientLineId: targetLineId,
            employee_id: recipientId,
            title: title,
            message: messageText.replace(/\*\*/g, ""),
            flexMessage: flexCardObj
          })
        });
      }

      if (!response.ok) {
        const resultText = await response.text();
        console.error(
          "❌ [LINE OA] line-send & API Error:",
          response.status,
          resultText
        );

        return {
          success: false,
          title,
          message: messageText,
          lineSent: false
        };
      }

      console.log(
        "✅ [LINE OA] Push Flex Card message sent successfully to:",
        targetLineId
      );

      return {
        success: true,
        title,
        message: messageText,
        lineSent: true
      };

    } catch (lineErr) {
      console.error(
        "❌ [LINE OA] line-send failed, trying server endpoint fallback:",
        lineErr
      );
      try {
        await fetch('/api/send-notification', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientLineId: targetLineId,
            employee_id: recipientId,
            title: title,
            message: messageText.replace(/\*\*/g, ""),
            flexMessage: flexCardObj
          })
        });
      } catch (fallbackErr) {
        console.error("❌ Fallback server notification also failed:", fallbackErr);
      }

      return {
        success: false,
        title,
        message: messageText,
        lineSent: false
      };
    }
  }

  // 🚀 สะดวกเรียกใช้ส่งแจ้งเตือนใบลาทั่วไป
  async notifyLeaveRequest(leaveReq = {}) {
    const role = leaveReq.recipientRole || leaveReq.approver_role || 'leader';
    return await this.sendWorkflowNotification({
      type: 'NEW_REQUEST',
      leaveId: leaveReq.id,
      employeeName: leaveReq.applicant_name || leaveReq.employee_name || 'พนักงาน',
      employeeCode: leaveReq.employee_code || '',
      departmentName: leaveReq.department_name || '',
      recipientId: leaveReq.approver_id || leaveReq.recipientId,
      recipientRole: role,
      leaveType: leaveReq.leave_type_name || 'ใบลา',
      startDate: leaveReq.start_date,
      endDate: leaveReq.end_date,
      totalDays: leaveReq.total_days || 1,
      leaveHours: leaveReq.leave_hours || 0,
      reason: leaveReq.reason || '',
      attachmentUrl: leaveReq.attachment_url || ''
    });
  }

  // 👥 ดึงรายชื่อฝ่ายบุคคล (HR / Admin) ที่เชื่อมต่อ LINE ไว้
  async getHrRecipients() {
    if (!this.client) return [];
    try {
      const sb = this.client;
      
      // 1. ตรวจสอบการกำหนดเฉพาะใน system_settings (leave_hr_approver)
      const { data: hrSetting } = await sb
        .from('system_settings')
        .select('setting_value, employee_id')
        .eq('setting_key', 'leave_hr_approver')
        .maybeSingle();

      if (hrSetting?.employee_id) {
        const { data: specificHr } = await sb
          .from('employees')
          .select('id, full_name, employee_code, line_id, role')
          .eq('id', hrSetting.employee_id)
          .maybeSingle();
        if (specificHr && specificHr.line_id && specificHr.line_id.trim()) {
          return [specificHr];
        }
      }

      // 2. ดึงจากพนักงาน role = 'hr', 'admin', 'superadmin' ที่มี line_id
      const { data: hrList, error: hrErr } = await sb
        .from('employees')
        .select('id, full_name, employee_code, line_id, role, departments(department_name)')
        .in('role', ['hr', 'admin', 'superadmin'])
        .not('line_id', 'is', null);

      if (!hrErr && Array.isArray(hrList) && hrList.length > 0) {
        const valid = hrList.filter(e => e.line_id && e.line_id.trim().length > 0);
        if (valid.length > 0) return valid;
      }

      // 3. Fallback: หาพนักงานในแผนกบุคคล (HR/Human Resources)
      const { data: deptEmps } = await sb
        .from('employees')
        .select('id, full_name, employee_code, line_id, role, departments(department_name)')
        .not('line_id', 'is', null);

      if (Array.isArray(deptEmps)) {
        const matched = deptEmps.filter(e => {
          const dName = String(e.departments?.department_name || '').toLowerCase();
          return (dName.includes('hr') || dName.includes('บุคคล') || dName.includes('human')) && e.line_id && e.line_id.trim().length > 0;
        });
        if (matched.length > 0) return matched;
      }

      return [];
    } catch (err) {
      console.warn("⚠️ [LINE OA Engine] getHrRecipients failed:", err);
      return [];
    }
  }

  // 📢 ส่งแจ้งเตือนไปยังฝ่ายบุคคล (HR) ทุกท่านที่เชื่อมต่อ LINE ไว้
  async notifyHrWorkflow(leaveReq = {}, notifType = 'HR_NOTIFY') {
    const hrRecipients = await this.getHrRecipients();
    console.log(`📢 [LINE OA Engine] Dispatches [${notifType}] to ${hrRecipients.length} HR recipients.`);

    const results = [];
    for (const hr of hrRecipients) {
      if (!hr.line_id) continue;
      try {
        const res = await this.sendWorkflowNotification({
          type: notifType,
          recipientId: hr.id,
          recipientLineId: hr.line_id,
          recipientRole: 'hr',
          leaveId: leaveReq.id,
          employeeName: leaveReq.applicant_name || leaveReq.employee_name || leaveReq.employees?.full_name || 'พนักงาน',
          employeeCode: leaveReq.employee_code || leaveReq.employees?.employee_code || '',
          departmentName: leaveReq.department_name || leaveReq.departments?.department_name || leaveReq.employees?.departments?.department_name || '',
          leaveType: leaveReq.leave_type_name || leaveReq.leave_types?.leave_name || 'ใบลา',
          startDate: leaveReq.start_date,
          endDate: leaveReq.end_date,
          totalDays: leaveReq.total_days || 1,
          leaveHours: leaveReq.leave_hours || 0,
          reason: leaveReq.reason || '',
          comment: leaveReq.comment || leaveReq.approval_comment || '',
          attachmentUrl: leaveReq.attachment_url || ''
        });
        results.push({ recipient: hr.full_name, ...res });
      } catch (e) {
        console.warn(`⚠️ [LINE OA Engine] Failed notifying HR (${hr.full_name}):`, e);
      }
    }
    return results;
  }
}

// ==========================================================================
  // 14. VIEWPORT & RESPONSIVE ENGINE
  // ==========================================================================
  class ViewportEngine {
    constructor() {
      this.isMobile = window.innerWidth <= 768;
      this.init();
    }

    init() {
      this.updateVh();
      // ลิสเซนเนอร์ตรวจจับการหมุนจอหรือย่อขยายเบราว์เซอร์
      window.addEventListener('resize', () => {
        this.updateVh();
        this.isMobile = window.innerWidth <= 768;
      });
    }

    // แก้ปัญหา 100vh บนมือถือ (แถบ URL บัง)
    updateVh() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    // คำนวณขนาด QR Code ให้เหมาะสมกับขนาดจออัตโนมัติ
    getAdaptiveQrSize() {
      const width = window.innerWidth;
      if (width < 360) return 130; // จอเล็กมาก (iPhone SE)
      if (width < 768) return 160; // จอมือถือทั่วไป
      return 200;                  // จอแท็บเล็ต / คอมพิวเตอร์
    }
  }

  // Export Global Instance
  global.PVTSDK = new PVTHRSdk();
  global.pvtSupabase = global.PVTSDK; // Backward Compatibility

  // Global Function for Recording QR Attendance Logs
  global.recordQrAttendanceLog = async function(employeeId, metadata = {}) {
    if (global.PVTSDK?.attendance?.recordQrAttendanceLog) {
      return await global.PVTSDK.attendance.recordQrAttendanceLog(employeeId, metadata);
    }
    return null;
  };

  // Global Function for Recording Login Activity Audit Logs ('login_logs')
  global.recordLoginLog = async function(user, options = {}) {
    if (global.PVTSDK?.loginAudit?.recordLoginLog) {
      return await global.PVTSDK.loginAudit.recordLoginLog(user, options);
    }
    return null;
  };

  // Global Function for Retrieving Login Activity Logs
  global.getLoginLogs = async function(limit = 50) {
    if (global.PVTSDK?.loginAudit?.getLoginLogs) {
      return await global.PVTSDK.loginAudit.getLoginLogs(limit);
    }
    return [];
  };

  // Global Helpers for Friendly Leave Duration & Quotas
  global.formatLeaveDurationFriendly = function(totalDays, totalHours = 0, options = {}) {
    return global.PVTSDK?.formatLeaveDurationFriendly
      ? global.PVTSDK.formatLeaveDurationFriendly(totalDays, totalHours, options)
      : `${totalDays} วัน`;
  };

  global.formatLeaveQuotaFriendly = function(days) {
    return global.PVTSDK?.formatLeaveQuotaFriendly
      ? global.PVTSDK.formatLeaveQuotaFriendly(days)
      : `${days} วัน`;
  };

  global.formatLeaveDurationText = global.formatLeaveDurationFriendly;

  /**
   * ⏱️ GLOBAL AUTOMATIC SLA 2-DAY EXPIRE SERVICE
   * ตรวจสอบและปรับสถานะใบลาที่รออนุมัติเกิน 2 วัน (48 ชั่วโมง) ให้เป็น "ไม่อนุมัติ" อัตโนมัติ
   * เหตุผล: "เนื่องจากหัวหน้าไม่อนุมัติในเวลาที่กำหนด (เกิน 2 วัน)"
   */
  global.autoRejectOverdueLeaves = async function() {
    try {
      const sb = global.PVTSDK?.client || global.pvtSupabase?.client || global.pvtSupabase?.getClient?.();
      if (!sb) return [];

      const now = Date.now();
      const TWO_DAYS_MS = 48 * 60 * 60 * 1000; // 48 ชม. (2 วัน)

      // 1. ดึงข้อมูลใบลาที่ยังค้างในสถานะรออนุมัติ
      const { data: pendingReqs, error } = await sb
        .from("leave_requests")
        .select("id, created_at, status")
        .or("status.ilike.pending,status.ilike.รออนุมัติ%");

      if (error || !pendingReqs || pendingReqs.length === 0) return [];

      const overdueIds = [];
      for (const req of pendingReqs) {
        if (!req.created_at) continue;
        const createdTime = new Date(req.created_at).getTime();
        if (isNaN(createdTime)) continue;

        if (now - createdTime >= TWO_DAYS_MS) {
          overdueIds.push(req.id);
        }
      }

      if (overdueIds.length === 0) return [];

      console.log(`⏱️ [SLA Auto-Expire] พบใบลาค้างเกิน 2 วัน (48 ชม.) จำนวน ${overdueIds.length} รายการ กำลังปรับเป็นไม่อนุมัติ...`, overdueIds);

      const autoReason = "เนื่องจากหัวหน้าไม่อนุมัติในเวลาที่กำหนด (เกิน 2 วัน)";

      for (const reqId of overdueIds) {
        const { error: updateErr } = await sb
          .from("leave_requests")
          .update({
            status: "rejected",
            approval_comment: autoReason
          })
          .eq("id", reqId);

        if (updateErr) {
          console.warn(`⚠️ [SLA Auto-Expire] ล้มเหลวในการอัปเดตใบลา ID ${reqId}:`, updateErr.message);
        } else {
          console.log(`✅ [SLA Auto-Expire] ปรับสถานะใบลา ID ${reqId} เป็นไม่อนุมัติเรียบร้อย`);
        }
      }

      return overdueIds;
    } catch (err) {
      console.error("💥 [SLA Auto-Expire Error]:", err);
      return [];
    }
  };

  // เรียกทำงานครั้งแรกเมื่อโหลดระบบเสร็จ และตั้งเวลารันอัตโนมัติทุกๆ 5 นาที
  setTimeout(() => {
    if (typeof global.autoRejectOverdueLeaves === 'function') {
      global.autoRejectOverdueLeaves();
    }
  }, 3000);

  setInterval(() => {
    if (typeof global.autoRejectOverdueLeaves === 'function') {
      global.autoRejectOverdueLeaves();
    }
  }, 5 * 60 * 1000);

})(typeof window !== "undefined" ? window : this);