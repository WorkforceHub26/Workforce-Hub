/**
 * ============================================================================
 * 📢 COMPANY NEWS & ANNOUNCEMENTS MODULE - PVT WORKFORCE HUB
 * รองรับการจัดการข่าวสารองค์กรโดย HR และแสดงผลในหน้าจอพนักงาน
 * ============================================================================
 */

(function (global) {
  "use strict";

  const STORAGE_KEY = "pvt_company_announcements";

  // Initial seed news to ensure rich content exists on first run
  const DEFAULT_ANNOUNCEMENTS = [
    {
      id: "news-001",
      title: "ประกาศกำหนดการยื่นขอวันลาหยุดเทศกาลสงกรานต์ ประจำปี 2569",
      category: "holiday",
      content: "ฝ่ายทรัพยากรบุคคลขอแจ้งให้พนักงานทุกท่านทราบ กำหนดการยื่นคำขอลาหยุดต่อเนื่องในช่วงเทศกาลสงกรานต์ ประจำปี 2569\n\n1. สามารถยื่นคำขอลาผ่านระบบล่วงหน้าได้ตั้งแต่วันนี้ ถึงวันที่ 31 มีนาคม 2569\n2. หัวหน้างาน (L1/L2) จะพิจารณาจัดเวรและอนุมัติให้แล้วเสร็จภายในวันที่ 5 เมษายน 2569\n3. ขอให้ตรวจสอบสิทธิ์วันลาพักร้อนคงเหลือในหน้าแดชบอร์ดก่อนส่งคำขอ",
      date: "2026-03-01",
      author: "ฝ่ายทรัพยากรบุคคล (HR)",
      is_pinned: true,
      link_url: "/pages/user/holidays.html",
      created_at: new Date("2026-03-01T08:00:00").toISOString(),
    },
    {
      id: "news-002",
      title: "เปิดให้บริการเชื่อมต่อการแจ้งเตือนผลอนุมัติใบลาผ่านแอปพลิเคชัน LINE",
      category: "urgent",
      content: "เพื่อความสะดวกรวดเร็วในการติดตามผลอนุมัติใบลา พนักงานสามารถผูกบัญชี LINE กับระบบ PVT Workforce Hub ได้แล้ววันนี้!\n\nเมื่อผูกบัญชีสำเร็จ ระบบจะส่งผลการพิจารณาใบลาของหัวหน้างานตรงเข้าห้องแชต LINE ส่วนตัวของคุณทันทีแบบเรียลไทม์ สามารถกดปุ่ม 'เชื่อมต่อ LINE' ในแถบเมนูข้างเพื่อเริ่มใช้งานได้เลยค่ะ",
      date: "2026-02-15",
      author: "ทีมพัฒนาระบบ & HR",
      is_pinned: true,
      link_url: "",
      created_at: new Date("2026-02-15T09:30:00").toISOString(),
    },
    {
      id: "news-003",
      title: "โครงการตรวจสุขภาพประจำปี 2569 ณ อาคารสำนักงานใหญ่",
      category: "welfare",
      content: "บริษัท พี.วี.ที. แอนด์ ที.พลาส จำกัด ร่วมกับโรงพยาบาลชั้นนำ จัดกิจกรรมตรวจสุขภาพประจำปีให้กับพนักงานทุกท่านโดยไม่มีค่าใช้จ่าย\n\nวันและเวลา: วันศุกร์ที่ 24 เมษายน 2569 เวลา 08:00 - 14:00 น.\nสถานที่: ห้องประชุมใหญ่ ชั้น 2\nข้อปฏิบัติ: กรุณางดน้ำและอาหารหลัง 20:00 น. ในคืนก่อนวันตรวจ",
      date: "2026-02-10",
      author: "ฝ่ายสวัสดิการพนักงาน",
      is_pinned: false,
      link_url: "",
      created_at: new Date("2026-02-10T10:00:00").toISOString(),
    },
    {
      id: "news-004",
      title: "ยินดีต้อนรับเพื่อนร่วมงานใหม่ประจำไตรมาสที่ 1/2569",
      category: "announcement",
      content: "บริษัทขอต้อนรับพนักงานใหม่ทุกท่านเข้าสู่ครอบครัว PVT Workforce Hub อย่างเป็นทางการ ขอให้ทุกท่านมีความสุขและประสบความสำเร็จในการทำงานร่วมกัน หากมีข้อสงสัยเกี่ยวกับระบบลาหรือสวัสดิการ สามารถติดต่อสอบถามพี่ๆ ฝ่ายบุคคลได้ตลอดเวลาทำการค่ะ",
      date: "2026-01-20",
      author: "ฝ่ายทรัพยากรบุคคล (HR)",
      is_pinned: false,
      link_url: "",
      created_at: new Date("2026-01-20T11:00:00").toISOString(),
    }
  ];

  const CATEGORY_NAMES = {
    all: "ทั้งหมด",
    urgent: "🚨 ประกาศด่วน",
    announcement: "📢 ประชาสัมพันธ์",
    holiday: "📅 วันหยุด/ปฏิทิน",
    welfare: "🎁 สวัสดิการ",
    activity: "🎉 กิจกรรมองค์กร",
  };

  const CompanyNews = {
    // 1. ดึงรายการข่าวสารทั้งหมด
    async getAnnouncements() {
      let announcements = [];
      
      // ลองดึงจาก Supabase ก่อน
      try {
        const sb = window.pvtSupabase?.getClient?.() || window.supabaseClient;
        if (sb) {
          const { data, error } = await sb
            .from("company_announcements")
            .select("*")
            .order("is_pinned", { ascending: false })
            .order("date", { ascending: false });

          if (!error && Array.isArray(data) && data.length > 0) {
            announcements = data;
            // บันทึกสำรองไว้ใน LocalStorage เสมอ
            localStorage.setItem(STORAGE_KEY, JSON.stringify(announcements));
            return announcements;
          }
        }
      } catch (e) {
        console.warn("[CompanyNews] Supabase fetch fallback to local:", e.message);
      }

      // ดึงจาก LocalStorage
      try {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          announcements = JSON.parse(local);
        }
      } catch (e) {
        console.warn("[CompanyNews] LocalStorage parse error:", e);
      }

      // ถ้ายังไม่มี ให้ใช้ค่าตั้งต้น
      if (!Array.isArray(announcements) || announcements.length === 0) {
        announcements = [...DEFAULT_ANNOUNCEMENTS];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(announcements));
      }

      // เรียงลำดับ ปักหมุดขึ้นก่อน ตามด้วยวันที่ล่าสุด
      announcements.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.date || b.created_at) - new Date(a.date || a.created_at);
      });

      return announcements;
    },

    // 2. บันทึก/เพิ่ม/แก้ไข ข่าวสาร
    async saveAnnouncement(data) {
      const announcements = await this.getAnnouncements();
      const now = new Date().toISOString();
      let updatedItem = null;

      if (data.id) {
        // แก้ไข
        const index = announcements.findIndex((item) => item.id === data.id);
        if (index !== -1) {
          announcements[index] = {
            ...announcements[index],
            ...data,
            updated_at: now,
          };
          updatedItem = announcements[index];
        }
      } else {
        // เพิ่มใหม่
        updatedItem = {
          id: "news-" + Date.now(),
          title: data.title,
          category: data.category || "announcement",
          content: data.content || "",
          date: data.date || new Date().toISOString().split("T")[0],
          author: data.author || "ฝ่ายทรัพยากรบุคคล (HR)",
          is_pinned: Boolean(data.is_pinned),
          link_url: data.link_url || "",
          created_at: now,
        };
        announcements.unshift(updatedItem);
      }

      // บันทึกลง LocalStorage ทันที
      localStorage.setItem(STORAGE_KEY, JSON.stringify(announcements));

      // ส่งไปยัง Supabase แบบ Asynchronous (Best Effort)
      try {
        const sb = window.pvtSupabase?.getClient?.() || window.supabaseClient;
        if (sb && updatedItem) {
          await sb.from("company_announcements").upsert(updatedItem);
        }
      } catch (e) {
        console.warn("[CompanyNews] Supabase upsert non-blocking error:", e.message);
      }

      return updatedItem;
    },

    // 3. ลบข่าวสาร
    async deleteAnnouncement(id) {
      let announcements = await this.getAnnouncements();
      announcements = announcements.filter((item) => item.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(announcements));

      try {
        const sb = window.pvtSupabase?.getClient?.() || window.supabaseClient;
        if (sb) {
          await sb.from("company_announcements").delete().eq("id", id);
        }
      } catch (e) {
        console.warn("[CompanyNews] Supabase delete non-blocking error:", e.message);
      }
      return true;
    },

    // 4. แสดงผล Feed ข่าวสารในหน้าแดชบอร์ดพนักงาน (index-user.html)
    async renderUserNewsFeed(containerId = "companyNewsFeed", filterCategory = "all") {
      const container = document.getElementById(containerId);
      if (!container) return;

      const announcements = await this.getAnnouncements();
      const filtered = filterCategory === "all"
        ? announcements
        : announcements.filter((n) => n.category === filterCategory);

      if (filtered.length === 0) {
        container.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 36px 16px; text-align: center; color: #64748b; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">
            <span class="material-symbols-outlined" style="font-size: 36px; color: #94a3b8; display: block; margin-bottom: 8px;">campaign</span>
            <p style="margin: 0; font-size: 14px; font-weight: 600;">ยังไม่มีข่าวสารในหมวดหมู่นี้</p>
          </div>
        `;
        return;
      }

      container.innerHTML = filtered
        .map((item) => {
          const catClass = item.category || "announcement";
          const catLabel = CATEGORY_NAMES[catClass] || "ประชาสัมพันธ์";
          const formattedDate = formatThaiNewsDate(item.date || item.created_at);
          const pinnedIcon = item.is_pinned
            ? `<span class="material-symbols-outlined news-pin-tag" title="ปักหมุดข่าวสำคัญ">push_pin</span>`
            : "";

          return `
            <div class="news-card ${item.is_pinned ? "pinned" : ""}" onclick="CompanyNews.openNewsDetailModal('${item.id}')">
              <div class="news-card-top">
                <span class="news-badge ${catClass}">${catLabel}</span>
                ${pinnedIcon}
              </div>
              <h3 class="news-card-title">${escapeHtml(item.title)}</h3>
              <p class="news-card-snippet">${escapeHtml(String(item.content || '').replace(/\\n/g, ' ').replace(/<[^>]*>/g, ''))}</p>
              <div class="news-card-meta">
                <span><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: -2px;">schedule</span> ${formattedDate}</span>
                <span class="news-read-more">อ่านต่อ <span class="material-symbols-outlined" style="font-size: 16px;">arrow_forward</span></span>
              </div>
            </div>
          `;
        })
        .join("");
    },

    // 5. เปิดหน้าต่างป๊อปอัปอ่านรายละเอียดข่าวสาร
    async openNewsDetailModal(id) {
      const announcements = await this.getAnnouncements();
      const item = announcements.find((n) => n.id === id);
      if (!item) return;

      const formattedDate = formatThaiNewsDate(item.date || item.created_at);
      const catLabel = CATEGORY_NAMES[item.category] || "ประชาสัมพันธ์";
      const catClass = item.category || "announcement";
      const formattedContent = formatRichNewsContent(item.content);
      const actionLink = item.link_url
        ? `<div style="margin-top: 20px;"><a href="${item.link_url}" class="news-btn-primary" style="text-decoration: none;" target="_blank"><span class="material-symbols-outlined">open_in_new</span> ไปยังลิงก์ที่เกี่ยวข้อง</a></div>`
        : "";

      Swal.fire({
        title: null,
        html: `
          <div style="text-align: left; font-family: 'Sarabun', sans-serif;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
              <span class="news-badge ${catClass}" style="font-size: 12px; padding: 4px 10px;">${catLabel}</span>
              <span style="font-size: 12.5px; color: #64748b;">${formattedDate}</span>
            </div>
            <h2 style="font-size: 19px; font-weight: 700; color: #0f172a; line-height: 1.4; margin: 0 0 16px 0;">${escapeHtml(item.title)}</h2>
            <div style="font-size: 14.5px; line-height: 1.7; color: #334155; max-height: 380px; overflow-y: auto; padding-right: 6px;">
              ${formattedContent}
            </div>
            ${actionLink}
            <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; color: #94a3b8;">
              <span>ผู้ประกาศ: <strong>${escapeHtml(item.author || "ฝ่ายบุคคล")}</strong></span>
              <span>PVT Workforce Hub</span>
            </div>
          </div>
        `,
        confirmButtonText: "ปิดหน้าต่าง",
        confirmButtonColor: "#0f766e",
        width: 620,
        customClass: {
          popup: "news-detail-swal-popup",
        }
      });
    },

    // 6. เปิดหน้าต่าง HR จัดการข่าวสาร (เพิ่ม/แก้ไข/ลบ) สำหรับ /pages/hr/management.html
    async openHRManagerModal() {
      let modalBackdrop = document.getElementById("pvtNewsManagerModal");
      if (!modalBackdrop) {
        modalBackdrop = document.createElement("div");
        modalBackdrop.id = "pvtNewsManagerModal";
        modalBackdrop.className = "news-modal-backdrop";
        document.body.appendChild(modalBackdrop);
      }

      const announcements = await this.getAnnouncements();

      modalBackdrop.innerHTML = `
        <div class="news-modal-card">
          <div class="news-modal-header">
            <h3><span class="material-symbols-outlined">campaign</span> จัดการข่าวสารและประกาศองค์กร</h3>
            <button type="button" class="news-modal-close" onclick="CompanyNews.closeHRManagerModal()">&times;</button>
          </div>
          
          <div class="news-modal-body">
            <!-- ส่วนหัวการจัดการ & สลับฟอร์ม -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
              <div>
                <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">รายการประกาศทั้งหมด (${announcements.length} รายการ)</h4>
                <p style="margin: 2px 0 0 0; font-size: 12.5px; color: #64748b;">ข่าวสารที่เผยแพร่จะแสดงทันทีในหน้าจอของพนักงานทุกคน</p>
              </div>
              <button type="button" class="news-btn-primary" id="btnToggleNewForm" onclick="CompanyNews.toggleCreateForm()">
                <span class="material-symbols-outlined">add_circle</span> เขียนข่าวสารใหม่
              </button>
            </div>

            <!-- ฟอร์มสร้าง/แก้ไขข่าวสาร (ซ่อนเป็นค่าเริ่มต้น) -->
            <div id="newsFormContainer" style="display: none; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
              <h4 id="newsFormTitle" style="margin: 0 0 16px 0; font-size: 15px; font-weight: 700; color: #0f766e; display: flex; align-items: center; gap: 6px;">
                <span class="material-symbols-outlined">edit_note</span> สร้างข่าวสารใหม่
              </h4>
              <input type="hidden" id="newsFormId" value="" />
              
              <div class="news-form-group">
                <label>หัวข้อข่าวสาร / ประกาศ <span style="color:#ef4444;">*</span></label>
                <input type="text" id="newsFormTitleInput" placeholder="เช่น ประกาศวันหยุดสงกรานต์, อัปเดตสวัสดิการพนักงาน" required />
              </div>

              <div class="news-form-row">
                <div class="news-form-group">
                  <label>หมวดหมู่ข่าวสาร</label>
                  <select id="newsFormCategorySelect">
                    <option value="announcement">📢 ประชาสัมพันธ์ทั่วไป</option>
                    <option value="urgent">🚨 ประกาศด่วน / สำคัญมาก</option>
                    <option value="holiday">📅 วันหยุด / ปฏิทินงาน</option>
                    <option value="welfare">🎁 สวัสดิการ & สิทธิประโยชน์</option>
                    <option value="activity">🎉 กิจกรรมองค์กร</option>
                  </select>
                </div>
                <div class="news-form-group">
                  <label>วันที่ประกาศ</label>
                  <input type="date" id="newsFormDateInput" value="${new Date().toISOString().split("T")[0]}" />
                </div>
              </div>

              <div class="news-form-row">
                <div class="news-form-group">
                  <label>ผู้ประกาศ / แผนก</label>
                  <input type="text" id="newsFormAuthorInput" value="ฝ่ายทรัพยากรบุคคล (HR)" />
                </div>
                <div class="news-form-group">
                  <label>ลิงก์เพิ่มเติม (ถ้ามี เช่น ลิงก์ฟอร์ม/เอกสาร)</label>
                  <input type="url" id="newsFormLinkInput" placeholder="https://..." />
                </div>
              </div>

              <div class="news-form-group">
                <label>เนื้อหาประกาศ / รายละเอียด <span style="color:#ef4444;">*</span></label>
                <textarea id="newsFormContentInput" rows="5" placeholder="พิมพ์รายละเอียดประกาศ (สามารถกด Enter เพื่อขึ้นบรรทัดใหม่ได้)..." required></textarea>
              </div>

              <div class="news-form-group">
                <label class="news-form-check">
                  <input type="checkbox" id="newsFormPinnedCheck" />
                  <div>
                    <strong style="color: #92400e; font-size: 13.5px; display: block;">📌 ปักหมุดเป็นข่าวสารสำคัญ</strong>
                    <span style="font-size: 12px; color: #b45309;">ข่าวที่ปักหมุดจะแสดงอยู่ด้านบนสุดเสมอ</span>
                  </div>
                </label>
              </div>

              <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
                <button type="button" class="news-btn-secondary" onclick="CompanyNews.toggleCreateForm(false)">ยกเลิก</button>
                <button type="button" class="news-btn-primary" onclick="CompanyNews.handleSaveForm()">
                  <span class="material-symbols-outlined">send</span> บันทึกและเผยแพร่
                </button>
              </div>
            </div>

            <!-- ตารางแสดงรายการข่าวสารที่มีอยู่ -->
            <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 12px;">
              <table class="news-table">
                <thead>
                  <tr>
                    <th style="width: 130px;">หมวดหมู่</th>
                    <th>หัวข้อประกาศ</th>
                    <th style="width: 120px;">วันที่</th>
                    <th style="width: 130px; text-align: center;">จัดการ</th>
                  </tr>
                </thead>
                <tbody id="newsTableBody">
                  ${this.renderHRNewsTableRows(announcements)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      // แสดง Backdrop
      setTimeout(() => {
        modalBackdrop.classList.add("active");
      }, 10);
    },

    renderHRNewsTableRows(announcements) {
      if (announcements.length === 0) {
        return `
          <tr>
            <td colspan="4" style="text-align: center; padding: 24px; color: #94a3b8;">
              ยังไม่มีข่าวสารในระบบ กดปุ่ม "เขียนข่าวสารใหม่" เพื่อเพิ่มข่าวสารแรก
            </td>
          </tr>
        `;
      }

      return announcements
        .map((item) => {
          const catClass = item.category || "announcement";
          const catLabel = CATEGORY_NAMES[catClass] || "ประชาสัมพันธ์";
          const pinBadge = item.is_pinned ? "📌 " : "";

          return `
            <tr>
              <td><span class="news-badge ${catClass}">${catLabel}</span></td>
              <td>
                <strong style="color: #0f172a; font-size: 13.5px;">${pinBadge}${escapeHtml(item.title)}</strong>
                <div style="font-size: 12px; color: #64748b; margin-top: 2px;">โดย: ${escapeHtml(item.author || "HR")}</div>
              </td>
              <td style="color: #64748b; font-size: 12.5px;">${formatThaiNewsDate(item.date || item.created_at)}</td>
              <td style="text-align: center;">
                <div style="display: flex; gap: 6px; justify-content: center;">
                  <button type="button" class="action-btn" style="padding: 5px 8px; font-size: 12px;" onclick="CompanyNews.handleEditItem('${item.id}')" title="แก้ไข">
                    <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
                  </button>
                  <button type="button" class="action-btn" style="padding: 5px 8px; font-size: 12px; color: #ef4444; border-color: #fecaca;" onclick="CompanyNews.handleDeleteItem('${item.id}')" title="ลบ">
                    <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
                  </button>
                </div>
              </td>
            </tr>
          `;
        })
        .join("");
    },

    toggleCreateForm(forceState) {
      const container = document.getElementById("newsFormContainer");
      const btn = document.getElementById("btnToggleNewForm");
      if (!container) return;

      const isVisible = forceState !== undefined ? !forceState : container.style.display !== "none";
      container.style.display = isVisible ? "none" : "block";

      if (btn) {
        btn.innerHTML = isVisible
          ? `<span class="material-symbols-outlined">add_circle</span> เขียนข่าวสารใหม่`
          : `<span class="material-symbols-outlined">expand_less</span> ซ่อนฟอร์ม`;
      }

      if (!isVisible) {
        // Reset form
        document.getElementById("newsFormId").value = "";
        document.getElementById("newsFormTitleInput").value = "";
        document.getElementById("newsFormCategorySelect").value = "announcement";
        document.getElementById("newsFormDateInput").value = new Date().toISOString().split("T")[0];
        document.getElementById("newsFormAuthorInput").value = "ฝ่ายทรัพยากรบุคคล (HR)";
        document.getElementById("newsFormLinkInput").value = "";
        document.getElementById("newsFormContentInput").value = "";
        document.getElementById("newsFormPinnedCheck").checked = false;
        document.getElementById("newsFormTitle").innerHTML = `<span class="material-symbols-outlined">edit_note</span> สร้างข่าวสารใหม่`;
        document.getElementById("newsFormTitleInput").focus();
      }
    },

    async handleEditItem(id) {
      const announcements = await this.getAnnouncements();
      const item = announcements.find((n) => n.id === id);
      if (!item) return;

      this.toggleCreateForm(true);

      document.getElementById("newsFormId").value = item.id;
      document.getElementById("newsFormTitleInput").value = item.title || "";
      document.getElementById("newsFormCategorySelect").value = item.category || "announcement";
      document.getElementById("newsFormDateInput").value = item.date || new Date().toISOString().split("T")[0];
      document.getElementById("newsFormAuthorInput").value = item.author || "ฝ่ายทรัพยากรบุคคล (HR)";
      document.getElementById("newsFormLinkInput").value = item.link_url || "";
      document.getElementById("newsFormContentInput").value = item.content || "";
      document.getElementById("newsFormPinnedCheck").checked = Boolean(item.is_pinned);
      document.getElementById("newsFormTitle").innerHTML = `<span class="material-symbols-outlined">edit</span> แก้ไขข่าวสาร: ${escapeHtml(item.title)}`;

      // Scroll to form smoothly
      document.getElementById("newsFormContainer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    async handleDeleteItem(id) {
      const confirm = await Swal.fire({
        title: "ยืนยันการลบข่าวสาร?",
        text: "เมื่อลบแล้ว ข่าวสารนี้จะไม่แสดงในหน้าแดชบอร์ดของพนักงานอีกต่อไป",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "ใช่, ลบเลย",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#ef4444",
      });

      if (confirm.isConfirmed) {
        await this.deleteAnnouncement(id);
        const announcements = await this.getAnnouncements();
        const tbody = document.getElementById("newsTableBody");
        if (tbody) {
          tbody.innerHTML = this.renderHRNewsTableRows(announcements);
        }
        Swal.fire({
          icon: "success",
          title: "ลบข่าวสารเรียบร้อย",
          timer: 1500,
          showConfirmButton: false,
        });
      }
    },

    async handleSaveForm() {
      const title = document.getElementById("newsFormTitleInput")?.value?.trim();
      const content = document.getElementById("newsFormContentInput")?.value?.trim();
      const id = document.getElementById("newsFormId")?.value;
      const category = document.getElementById("newsFormCategorySelect")?.value || "announcement";
      const date = document.getElementById("newsFormDateInput")?.value || new Date().toISOString().split("T")[0];
      const author = document.getElementById("newsFormAuthorInput")?.value?.trim() || "ฝ่ายทรัพยากรบุคคล (HR)";
      const link_url = document.getElementById("newsFormLinkInput")?.value?.trim() || "";
      const is_pinned = Boolean(document.getElementById("newsFormPinnedCheck")?.checked);

      if (!title || !content) {
        Swal.fire({
          icon: "warning",
          title: "ข้อมูลไม่ครบถ้วน",
          text: "กรุณากรอกหัวข้อข่าวและเนื้อหาประกาศให้ครบถ้วนค่ะ",
          confirmButtonColor: "#0f766e",
        });
        return;
      }

      const item = {
        title,
        content,
        category,
        date,
        author,
        link_url,
        is_pinned,
      };

      if (id) {
        item.id = id;
      }

      await this.saveAnnouncement(item);

      Swal.fire({
        icon: "success",
        title: id ? "แก้ไขข่าวสารสำเร็จ" : "เผยแพร่ข่าวสารสำเร็จ",
        text: "ข่าวสารนี้ถูกอัปเดตไปยังหน้าจอของพนักงานเรียบร้อยแล้ว",
        confirmButtonColor: "#0f766e",
        timer: 2000,
      });

      this.toggleCreateForm(false);
      const announcements = await this.getAnnouncements();
      const tbody = document.getElementById("newsTableBody");
      if (tbody) {
        tbody.innerHTML = this.renderHRNewsTableRows(announcements);
      }
    },

    closeHRManagerModal() {
      const modal = document.getElementById("pvtNewsManagerModal");
      if (modal) {
        modal.classList.remove("active");
      }
    },
  };

  // Helper functions
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatRichNewsContent(rawContent) {
    if (!rawContent) return "";
    let content = String(rawContent).replace(/\\n/g, "\n");
    const hasHtml = /<[a-z][\s\S]*>/i.test(content);
    if (!hasHtml) {
      content = escapeHtml(content);
    }
    const lines = content.split(/\r?\n/);
    const formattedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "<div style='height: 8px;'></div>";

      // Match numbered lists: "1. ", "2) "
      const numMatch = trimmed.match(/^(\d+[\.\)])\s*(.*)/);
      if (numMatch) {
        const numLabel = numMatch[1].replace(/[\.\)]/, "");
        const itemText = numMatch[2];
        return `<div style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 12px; padding: 10px 14px; margin: 8px 0; color: #166534; font-weight: 600; display: flex; align-items: flex-start; gap: 10px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.06);"><span style="background: #16a34a; color: #ffffff; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; margin-top: 1px;">${numLabel}</span><div style="flex: 1; line-height: 1.5;">${itemText}</div></div>`;
      }

      // Match bullets
      if (/^[•\-\*]\s+/.test(trimmed)) {
        const bulletText = trimmed.replace(/^[•\-\*]\s+/, "");
        return `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0284c7; border-radius: 8px; padding: 8px 12px; margin: 6px 0; color: #1e293b; font-weight: 500; display: flex; align-items: center; gap: 8px;"><span style="color: #0284c7; font-size: 16px;">•</span><span>${bulletText}</span></div>`;
      }

      // Auto highlight dates & keywords
      let lineHtml = line;
      lineHtml = lineHtml.replace(/(สำคัญมาก|หมายเหตุ|ด่วนที่สุด|ข้อปฏิบัติ|เงื่อนไข|สิทธิประโยชน์)/g, '<mark style="background: #fef08a; padding: 2px 8px; border-radius: 6px; color: #854d0e; font-weight: 800; border: 1px solid #fde047;">$1</mark>');
      lineHtml = lineHtml.replace(/(\d{1,2}\s+(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+\d{4})/g, '<span style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 6px; font-weight: 700; display: inline-block;">📅 $1</span>');

      return `<div style="margin-bottom: 4px;">${lineHtml}</div>`;
    });

    return formattedLines.join("");
  }

  function formatThaiNewsDate(dateStr) {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const thMonths = [
        "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
        "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
      ];
      const day = d.getDate();
      const month = thMonths[d.getMonth()];
      const year = d.getFullYear() + 543;
      return `${day} ${month} ${year}`;
    } catch (e) {
      return dateStr;
    }
  }

  // Export to global window
  global.CompanyNews = CompanyNews;
  global.openNewsManagerModal = () => CompanyNews.openHRManagerModal();
  global.openHrNewsManagerModal = () => CompanyNews.openHRManagerModal();

})(window);
