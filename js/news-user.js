/**
 * ============================================================================
 * 📢 USER NEWS HUB JS - PVT WORKFORCE HUB
 * ควบคุมตรรกะการทำงาน กรองหมวดหมู่ ค้นหา และแสดงผลข่าวสารฝั่งพนักงาน
 * ============================================================================
 */

(function (global) {
  "use strict";

  let currentCategory = "all";
  let newsData = [];

  document.addEventListener("DOMContentLoaded", async () => {
    await loadNewsHub();
  });

  async function loadNewsHub() {
    try {
      if (window.CompanyNews?.getAnnouncements) {
        newsData = await window.CompanyNews.getAnnouncements();
      } else {
        const local = localStorage.getItem("pvt_company_announcements");
        newsData = local ? JSON.parse(local) : [];
      }
      renderPinnedHero();
      renderUserNewsGrid();
    } catch (e) {
      console.error("[UserNews] Error loading news hub:", e);
    }
  }

  function renderPinnedHero() {
    const hero = document.getElementById("pinnedHeroBanner");
    if (!hero) return;

    const pinned = newsData.find((n) => n.is_pinned);
    if (!pinned) {
      hero.style.display = "none";
      return;
    }

    hero.style.display = "block";
    hero.innerHTML = `
      <div class="pinned-hero">
        <div class="pinned-hero-badge">
          <span class="material-symbols-outlined" style="font-size: 14px;">push_pin</span>
          <span>ประกาศสำคัญปักหมุด</span>
        </div>
        <h2 class="pinned-hero-title">${escapeHtml(pinned.title)}</h2>
        <p class="pinned-hero-desc">${escapeHtml(String(pinned.content || '').replace(/\\n/g, ' ').replace(/<[^>]*>/g, ''))}</p>
        <button type="button" class="pinned-hero-btn" onclick="CompanyNews.openNewsDetailModal('${pinned.id}')">
          <span>อ่านรายละเอียดฉบับเต็ม</span>
          <span class="material-symbols-outlined" style="font-size: 16px;">arrow_forward</span>
        </button>
      </div>
    `;
  }

  function selectUserNewsCategory(cat, btn) {
    currentCategory = cat;
    document.querySelectorAll(".cat-pill").forEach((el) => el.classList.remove("active"));
    if (btn) btn.classList.add("active");
    renderUserNewsGrid();
  }

  function renderUserNewsGrid() {
    const search = (document.getElementById("userNewsSearchInput")?.value || "").toLowerCase().trim();
    const container = document.getElementById("userNewsGridContainer");
    const countEl = document.getElementById("userNewsCount");
    if (!container) return;

    const filtered = newsData.filter((item) => {
      const matchCat = currentCategory === "all" || item.category === currentCategory;
      const matchSearch =
        !search ||
        (item.title && item.title.toLowerCase().includes(search)) ||
        (item.content && item.content.toLowerCase().includes(search)) ||
        (item.author && item.author.toLowerCase().includes(search));
      return matchCat && matchSearch;
    });

    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 48px 16px; text-align: center; color: #64748b; background: #ffffff; border-radius: 16px; border: 1px dashed #cbd5e1;">
          <span class="material-symbols-outlined" style="font-size: 40px; color: #94a3b8; display: block; margin-bottom: 8px;">campaign</span>
          <h3 style="margin: 0 0 4px 0; font-size: 15px; color: #334155;">ไม่พบรายการข่าวสารในหมวดนี้</h3>
          <p style="margin: 0; font-size: 13px;">ลองค้นหาด้วยคำอื่น หรือเลือกหมวดหมู่อื่นๆ ด้านบน</p>
        </div>
      `;
      return;
    }

    const CATEGORY_MAP = {
      urgent: { label: "🚨 ประกาศด่วน", class: "urgent" },
      announcement: { label: "📢 ประชาสัมพันธ์", class: "announcement" },
      holiday: { label: "📅 วันหยุด/ปฏิทิน", class: "holiday" },
      welfare: { label: "🎁 สวัสดิการ", class: "welfare" },
      activity: { label: "🎉 กิจกรรมองค์กร", class: "activity" },
    };

    container.innerHTML = filtered
      .map((item) => {
        const catInfo = CATEGORY_MAP[item.category] || CATEGORY_MAP.announcement;
        const formattedDate = item.date
          ? new Date(item.date).toLocaleDateString("th-TH", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "-";

        return `
          <div class="user-news-card ${item.is_pinned ? "pinned" : ""}" onclick="CompanyNews.openNewsDetailModal('${item.id}')">
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span class="news-tag ${catInfo.class}" style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 9999px;">${catInfo.label}</span>
                ${
                  item.is_pinned
                    ? '<span style="color: #ea580c; display: flex; align-items: center; font-size: 11px; font-weight: 700; background: #ffedd5; padding: 2px 6px; border-radius: 4px;"><span class="material-symbols-outlined" style="font-size: 13px;">push_pin</span> ปักหมุด</span>'
                    : ""
                }
              </div>
              <h3 class="user-news-card-title">${escapeHtml(item.title)}</h3>
              <p class="user-news-card-desc">${escapeHtml(item.content)}</p>
            </div>
            
            <div class="user-news-card-footer">
              <span><span class="material-symbols-outlined" style="font-size: 13px; vertical-align: -2px;">calendar_today</span> ${formattedDate}</span>
              <span class="read-more-text">อ่านรายละเอียด <span class="material-symbols-outlined" style="font-size: 15px;">arrow_forward</span></span>
            </div>
          </div>
        `;
      })
      .join("");
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

  function viewMyDigitalCard() {
    if (window.openEmployeeCardManagerPopup) {
      window.openEmployeeCardManagerPopup();
    } else {
      window.location.href = "/pages/user/profile-user.html#digital-card";
    }
  }

  function generateLineLinkToken() {
    if (window.openSystemSettingsModal) {
      window.openSystemSettingsModal();
    }
  }

  function handleLogout() {
    if (window.AuthGuard?.logout) {
      window.AuthGuard.logout();
    } else {
      localStorage.removeItem("pvt_user");
      window.location.href = "/pages/user/index-user.html";
    }
  }

  // Export to global window scope for HTML event listeners
  global.loadNewsHub = loadNewsHub;
  global.selectUserNewsCategory = selectUserNewsCategory;
  global.renderUserNewsGrid = renderUserNewsGrid;
  global.viewMyDigitalCard = viewMyDigitalCard;
  global.generateLineLinkToken = generateLineLinkToken;
  global.handleLogout = handleLogout;
})(window);
