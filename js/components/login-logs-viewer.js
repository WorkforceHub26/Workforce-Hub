/**
 * ==============================================================================
 * 🔒 PVT Workforce Hub: Read-Only Admin View Component - Login Activity Logs
 * Target Table: 'login_logs' (Supabase)
 * ==============================================================================
 * This component provides a comprehensive, read-only administrative view for 
 * querying, filtering, and visualizing authentication and login activities.
 */

(function (window) {
  'use strict';

  class LoginLogsViewerComponent {
    constructor(options = {}) {
      this.containerId = options.containerId || null;
      this.limit = options.limit || 200;
      this.logs = [];
      this.filteredLogs = [];
      this.isLoading = false;
      this.activePreset = 'all'; // 'all', 'today', '7days', '30days', 'month', 'custom'
      this.startDate = '';
      this.endDate = '';
      this.searchQuery = '';
      this.methodFilter = 'all';
      this.statusFilter = 'all';
      this.currentPage = 1;
      this.pageSize = 15;
    }

    /**
     * 🌐 Fetch login logs directly from Supabase or server API
     */
    async fetchLogs() {
      this.isLoading = true;
      this.updateLoadingUI(true);

      try {
        let fetchedData = [];

        // 1. Try server-side API with date filters if applicable
        try {
          let url = `/api/login-logs?limit=${this.limit}`;
          if (this.startDate) url += `&startDate=${encodeURIComponent(this.startDate)}`;
          if (this.endDate) url += `&endDate=${encodeURIComponent(this.endDate)}`;
          if (this.searchQuery) url += `&search=${encodeURIComponent(this.searchQuery)}`;

          const res = await fetch(url);
          if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const json = await res.json();
              if (Array.isArray(json?.data) && json.data.length > 0) {
                fetchedData = json.data;
              }
            }
          }
        } catch (apiErr) {
          console.warn('[LoginLogsViewer] API fetch fallback:', apiErr);
        }

        // 2. If API returned empty, try direct client-side Supabase SDK
        if (fetchedData.length === 0) {
          const client = window.supabaseClient || window.pvtSupabase?.getClient?.();
          if (client) {
            try {
              let query = client
                .from('login_logs')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(this.limit);

              if (this.startDate) {
                query = query.gte('timestamp', `${this.startDate}T00:00:00.000Z`);
              }
              if (this.endDate) {
                query = query.lte('timestamp', `${this.endDate}T23:59:59.999Z`);
              }

              const { data, error } = await query;
              if (!error && Array.isArray(data) && data.length > 0) {
                fetchedData = data;
              }
            } catch (sbErr) {
              console.warn('[LoginLogsViewer] Supabase SDK query fallback:', sbErr);
            }
          }
        }

        // 3. Fallback to global helper or LocalStorage audit history
        if (fetchedData.length === 0) {
          if (typeof window.getLoginLogs === 'function') {
            fetchedData = await window.getLoginLogs(this.limit);
          } else if (window.PVTSDK?.loginAudit?.getLoginLogs) {
            fetchedData = await window.PVTSDK.loginAudit.getLoginLogs(this.limit);
          } else {
            try {
              fetchedData = JSON.parse(localStorage.getItem('pvt_login_logs_history') || '[]');
            } catch (e) {
              fetchedData = [];
            }
          }
        }

        this.logs = Array.isArray(fetchedData) ? fetchedData : [];
        this.applyFilters();
      } catch (err) {
        console.error('[LoginLogsViewer] Failed to load login activity logs:', err);
        this.logs = [];
        this.filteredLogs = [];
      } finally {
        this.isLoading = false;
        this.updateLoadingUI(false);
        this.render();
      }
    }

    /**
     * 🔍 Filter logs based on date range, preset, search query, method, and status
     */
    applyFilters() {
      let result = [...this.logs];

      // Date filtering
      if (this.startDate || this.endDate) {
        const start = this.startDate ? new Date(`${this.startDate}T00:00:00`) : null;
        const end = this.endDate ? new Date(`${this.endDate}T23:59:59.999`) : null;

        result = result.filter(item => {
          const itemDate = new Date(item.timestamp || item.created_at || item.login_at);
          if (isNaN(itemDate.getTime())) return true;
          if (start && itemDate < start) return false;
          if (end && itemDate > end) return false;
          return true;
        });
      }

      // Keyword search
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.trim().toLowerCase();
        result = result.filter(item => {
          const name = String(item.full_name || '').toLowerCase();
          const code = String(item.employee_code || '').toLowerCase();
          const uid = String(item.user_id || '').toLowerCase();
          const ip = String(item.ip_address || '').toLowerCase();
          const role = String(item.role || '').toLowerCase();
          return name.includes(q) || code.includes(q) || uid.includes(q) || ip.includes(q) || role.includes(q);
        });
      }

      // Login method filter
      if (this.methodFilter !== 'all') {
        result = result.filter(item => {
          const m = String(item.login_method || 'password').toLowerCase();
          return m.includes(this.methodFilter.toLowerCase());
        });
      }

      // Status filter
      if (this.statusFilter !== 'all') {
        result = result.filter(item => {
          const s = String(item.status || 'success').toLowerCase();
          return s === this.statusFilter.toLowerCase();
        });
      }

      this.filteredLogs = result;
      this.currentPage = 1;
    }

    /**
     * 📅 Set date preset (today, 7days, 30days, month, all)
     */
    setDatePreset(preset) {
      this.activePreset = preset;
      const today = new Date();
      const formatDate = (d) => d.toISOString().split('T')[0];

      if (preset === 'today') {
        this.startDate = formatDate(today);
        this.endDate = formatDate(today);
      } else if (preset === '7days') {
        const past7 = new Date();
        past7.setDate(today.getDate() - 6);
        this.startDate = formatDate(past7);
        this.endDate = formatDate(today);
      } else if (preset === '30days') {
        const past30 = new Date();
        past30.setDate(today.getDate() - 29);
        this.startDate = formatDate(past30);
        this.endDate = formatDate(today);
      } else if (preset === 'month') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        this.startDate = formatDate(firstDay);
        this.endDate = formatDate(today);
      } else if (preset === 'all') {
        this.startDate = '';
        this.endDate = '';
      }

      this.fetchLogs();
    }

    /**
     * 📊 Calculate summary statistics for filtered logs
     */
    calculateStats() {
      const total = this.filteredLogs.length;
      const uniqueUsers = new Set();
      let mobileCount = 0;
      let desktopCount = 0;
      let todayCount = 0;

      const todayStr = new Date().toISOString().split('T')[0];

      this.filteredLogs.forEach(log => {
        if (log.user_id || log.employee_code) {
          uniqueUsers.add(log.user_id || log.employee_code);
        }

        const logDateStr = (log.timestamp || log.created_at || '').substring(0, 10);
        if (logDateStr === todayStr) {
          todayCount++;
        }

        let devInfo = log.device_info;
        if (typeof devInfo === 'string') {
          try { devInfo = JSON.parse(devInfo); } catch (e) {}
        }
        devInfo = devInfo || {};

        const devType = String(devInfo.device_type || '').toLowerCase();
        if (devType === 'mobile' || (devInfo.screen && parseInt(devInfo.screen) < 640)) {
          mobileCount++;
        } else {
          desktopCount++;
        }
      });

      return {
        total,
        uniqueUsers: uniqueUsers.size,
        mobileCount,
        desktopCount,
        todayCount
      };
    }

    /**
     * 📥 Export filtered logs to CSV
     */
    exportToCsv() {
      if (!this.filteredLogs || this.filteredLogs.length === 0) {
        if (window.Swal) {
          Swal.fire({
            icon: 'info',
            title: 'ไม่มีข้อมูลสำหรับการส่งออก',
            text: 'กรุณาปรับตัวกรองวันที่หรือข้อมูลเพื่อค้นหารายการที่ต้องการส่งออก',
            confirmButtonColor: '#0d9488'
          });
        }
        return;
      }

      const headers = ['วัน-เวลา (Timestamp)', 'รหัสผู้ใช้งาน (User ID)', 'รหัสพนักงาน', 'ชื่อ-นามสกุล', 'ตำแหน่ง/สิทธิ์', 'ช่องทางการเข้าสู่ระบบ', 'อุปกรณ์ (Device)', 'ระบบปฏิบัติการ (OS)', 'เบราว์เซอร์', 'IP Address', 'สถานะ'];
      const rows = this.filteredLogs.map(log => {
        let devInfo = log.device_info;
        if (typeof devInfo === 'string') {
          try { devInfo = JSON.parse(devInfo); } catch (e) {}
        }
        devInfo = devInfo || {};

        return [
          `"${log.timestamp || log.created_at || ''}"`,
          `"${log.user_id || ''}"`,
          `"${log.employee_code || ''}"`,
          `"${(log.full_name || '').replace(/"/g, '""')}"`,
          `"${log.role || ''}"`,
          `"${log.login_method || 'password'}"`,
          `"${devInfo.device_type || ''}"`,
          `"${devInfo.os || ''}"`,
          `"${devInfo.browser || ''}"`,
          `"${log.ip_address || ''}"`,
          `"${log.status || 'success'}"`
        ];
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `login_activity_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    /**
     * 🎨 Escape HTML to prevent injection
     */
    escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    /**
     * 🔄 Update Loading UI State
     */
    updateLoadingUI(isLoading) {
      const refreshBtn = document.getElementById('btnRefreshLoginLogs');
      if (refreshBtn) {
        if (isLoading) {
          refreshBtn.classList.add('loading-spin');
          refreshBtn.disabled = true;
        } else {
          refreshBtn.classList.remove('loading-spin');
          refreshBtn.disabled = false;
        }
      }
    }

    /**
     * 🖥️ Generate Main Component HTML
     */
    renderHTML() {
      const stats = this.calculateStats();
      const totalPages = Math.max(1, Math.ceil(this.filteredLogs.length / this.pageSize));
      const startIndex = (this.currentPage - 1) * this.pageSize;
      const paginatedLogs = this.filteredLogs.slice(startIndex, startIndex + this.pageSize);

      let rowsHtml = '';
      if (paginatedLogs.length === 0) {
        rowsHtml = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 48px 20px; color: #64748b;">
              <div style="font-size: 36px; margin-bottom: 8px;">📋</div>
              <div style="font-weight: 600; font-size: 15px; color: #334155; margin-bottom: 4px;">ไม่พบรายการประวัติการเข้าสู่ระบบ</div>
              <div style="font-size: 13px; color: #94a3b8;">ลองปรับตัวกรองช่วงเวลา หรือคำค้นหาใหม่อีกครั้ง</div>
            </td>
          </tr>
        `;
      } else {
        paginatedLogs.forEach((log) => {
          const rawTime = log.timestamp || log.created_at || log.login_at;
          const timeObj = rawTime ? new Date(rawTime) : null;
          const dateStr = timeObj && !isNaN(timeObj.getTime())
            ? timeObj.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
            : '-';
          const timeStr = timeObj && !isNaN(timeObj.getTime())
            ? timeObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '-';

          const userId = this.escapeHtml(log.user_id || log.employee_id || '-');
          const empCode = this.escapeHtml(log.employee_code || '');
          const fullName = this.escapeHtml(log.full_name || 'ผู้ใช้งานระบบ');
          const role = this.escapeHtml(log.role || '');

          // Device info formatting
          let devInfo = log.device_info;
          if (typeof devInfo === 'string') {
            try { devInfo = JSON.parse(devInfo); } catch (e) {}
          }
          devInfo = devInfo || {};

          const devType = devInfo.device_type || (devInfo.screen && parseInt(devInfo.screen) < 640 ? 'Mobile' : 'Desktop');
          const os = this.escapeHtml(devInfo.os || 'ระบบปฏิบัติการ');
          const browser = this.escapeHtml(devInfo.browser || 'Browser');
          const screen = this.escapeHtml(devInfo.screen || '');
          const ip = this.escapeHtml(log.ip_address || devInfo.server_ip || '-');

          const isMobile = String(devType).toLowerCase() === 'mobile';
          const devIcon = isMobile ? 'smartphone' : (String(devType).toLowerCase() === 'tablet' ? 'tablet_mac' : 'laptop_mac');
          const devBadgeColor = isMobile ? '#d97706' : '#0284c7';
          const devBadgeBg = isMobile ? '#fef3c7' : '#e0f2fe';

          // Method formatting
          const method = String(log.login_method || 'password').toLowerCase();
          let methodBadge = `<span style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 3px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 14px;">key</span> รหัสผ่าน</span>`;
          if (method.includes('qr')) {
            methodBadge = `<span style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 3px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 14px;">qr_code_scanner</span> QR Code</span>`;
          } else if (method.includes('token') || method.includes('auto')) {
            methodBadge = `<span style="background: #fdf4ff; color: #a21caf; border: 1px solid #f5d0fe; padding: 3px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 14px;">vpn_key</span> โทเค็น</span>`;
          }

          // Status badge
          const status = String(log.status || 'success').toLowerCase();
          const isSuccess = status === 'success' || status === 'ok';
          const statusBadge = isSuccess
            ? `<span style="background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; padding: 3px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">check_circle</span> สำเร็จ</span>`
            : `<span style="background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; padding: 3px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 13px;">cancel</span> ล้มเหลว</span>`;

          rowsHtml += `
            <tr style="border-bottom: 1px solid #f1f5f9; font-size: 12.5px; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
              <td style="padding: 12px 10px; color: #334155; white-space: nowrap;">
                <div style="font-weight: 600; color: #0f172a; font-family: monospace;">${timeStr}</div>
                <div style="font-size: 11px; color: #64748b;">${dateStr}</div>
              </td>
              <td style="padding: 12px 10px; min-width: 180px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 32px; height: 32px; border-radius: 50%; background: #e2e8f0; color: #475569; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; flex-shrink: 0;">
                    ${fullName.charAt(0) || 'U'}
                  </div>
                  <div style="overflow: hidden;">
                    <div style="font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${fullName}">${fullName}</div>
                    <div style="font-size: 11px; color: #64748b; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                      ${empCode ? `<span style="background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-weight: 600; color: #334155;">${empCode}</span>` : ''}
                      ${role ? `<span style="background: #f0fdf4; color: #166534; padding: 1px 5px; border-radius: 4px; font-size: 10.5px;">${role}</span>` : ''}
                      <span style="font-family: monospace; font-size: 10px; color: #94a3b8;" title="Supabase User ID: ${userId}">${userId.length > 14 ? userId.substring(0, 14) + '...' : userId}</span>
                    </div>
                  </div>
                </div>
              </td>
              <td style="padding: 12px 10px; white-space: nowrap;">
                ${methodBadge}
              </td>
              <td style="padding: 12px 10px; min-width: 180px;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span style="background: ${devBadgeBg}; color: ${devBadgeColor}; padding: 3px 6px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600;">
                    <span class="material-symbols-outlined" style="font-size: 14px;">${devIcon}</span>
                    ${devType}
                  </span>
                  <span style="font-weight: 600; color: #1e293b; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${browser}</span>
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${os} ${screen ? `· ${screen}` : ''}
                </div>
              </td>
              <td style="padding: 12px 10px; white-space: nowrap;">
                <div style="display: inline-flex; align-items: center; gap: 4px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 6px; font-family: monospace; font-size: 11.5px; color: #334155;">
                  <span class="material-symbols-outlined" style="font-size: 13px; color: #64748b;">public</span>
                  ${ip}
                </div>
              </td>
              <td style="padding: 12px 10px; text-align: center; white-space: nowrap;">
                ${statusBadge}
              </td>
            </tr>
          `;
        });
      }

      return `
        <style>
          .login-logs-component *, .login-logs-component *::before, .login-logs-component *::after {
            box-sizing: border-box;
          }
          .login-logs-component .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
          }
          .login-logs-component .filter-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 10px;
          }
          .login-logs-component table {
            width: 100%;
            min-width: 850px;
            border-collapse: collapse;
          }
          @media (max-width: 640px) {
            .login-logs-component .header-bar {
              flex-direction: column;
              align-items: flex-start !important;
            }
            .login-logs-component .header-actions {
              width: 100%;
              justify-content: flex-start !important;
              margin-top: 10px;
            }
          }
        </style>
        <div class="login-logs-component" style="font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif; color: #1e293b; text-align: left; width: 100%; overflow: hidden;">
          
          <!-- Header Bar with Read-Only Indicator and Target Table Badge -->
          <div class="header-bar" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; background: #f8fafc; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="material-symbols-outlined" style="color: #0d9488; font-size: 24px;">shield_lock</span>
                <span style="font-weight: 700; font-size: 15px; color: #0f172a;">ประวัติการเข้าสู่ระบบ (Login Activity Logs)</span>
              </div>
              <span style="background: #e6fffa; color: #0f766e; border: 1px solid #b2f5ea; padding: 2px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 13px;">visibility</span> โหมดอ่านอย่างเดียว (Read-Only)
              </span>
              <span style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 6px; font-size: 11.5px; font-family: monospace;">
                ตาราง Supabase: <strong>login_logs</strong>
              </span>
            </div>

            <div class="header-actions" style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
              <button type="button" onclick="window.PVTLoginLogsViewer?.purgeOlderLogs()" style="background: #fef2f2; border: 1px solid #fca5a5; padding: 6px 12px; border-radius: 8px; font-size: 12.5px; color: #b91c1c; cursor: pointer; display: flex; align-items: center; gap: 5px; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.background='#fee2e2'; this.style.borderColor='#ef4444'" onmouseout="this.style.background='#fef2f2'; this.style.borderColor='#fca5a5'">
                <span class="material-symbols-outlined" style="font-size: 16px; color: #ef4444;">delete_sweep</span> ล้างประวัติ > 90 วัน
              </button>
              <button type="button" id="btnRefreshLoginLogs" onclick="window.PVTLoginLogsViewer?.fetchLogs()" style="background: white; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 8px; font-size: 12.5px; color: #334155; cursor: pointer; display: flex; align-items: center; gap: 5px; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.borderColor='#0d9488'; this.style.color='#0d9488'" onmouseout="this.style.borderColor='#cbd5e1'; this.style.color='#334155'">
                <span class="material-symbols-outlined" style="font-size: 16px;">refresh</span> รีเฟรชข้อมูล
              </button>
              <button type="button" onclick="window.PVTLoginLogsViewer?.exportToCsv()" style="background: #0d9488; border: none; padding: 6px 12px; border-radius: 8px; font-size: 12.5px; color: white; cursor: pointer; display: flex; align-items: center; gap: 5px; font-weight: 600; transition: background 0.2s;" onmouseover="this.style.background='#0f766e'" onmouseout="this.style.background='#0d9488'">
                <span class="material-symbols-outlined" style="font-size: 16px;">download</span> ส่งออก CSV
              </button>
            </div>
          </div>

          <!-- Summary Metric Cards -->
          <div class="stats-grid">
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <div style="font-size: 12px; color: #64748b; font-weight: 600; display: flex; align-items: center; gap: 5px;">
                <span class="material-symbols-outlined" style="font-size: 16px; color: #0d9488;">history</span> เข้าสู่ระบบทั้งหมด
              </div>
              <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px;">${stats.total.toLocaleString()} <span style="font-size: 12px; font-weight: 500; color: #64748b;">ครั้ง</span></div>
            </div>

            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <div style="font-size: 12px; color: #64748b; font-weight: 600; display: flex; align-items: center; gap: 5px;">
                <span class="material-symbols-outlined" style="font-size: 16px; color: #0284c7;">people</span> ผู้ใช้งานที่ไม่ซ้ำ
              </div>
              <div style="font-size: 22px; font-weight: 700; color: #0284c7; margin-top: 4px;">${stats.uniqueUsers.toLocaleString()} <span style="font-size: 12px; font-weight: 500; color: #64748b;">คน</span></div>
            </div>

            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <div style="font-size: 12px; color: #64748b; font-weight: 600; display: flex; align-items: center; gap: 5px;">
                <span class="material-symbols-outlined" style="font-size: 16px; color: #16a34a;">today</span> เข้าสู่ระบบวันนี้
              </div>
              <div style="font-size: 22px; font-weight: 700; color: #16a34a; margin-top: 4px;">${stats.todayCount.toLocaleString()} <span style="font-size: 12px; font-weight: 500; color: #64748b;">ครั้ง</span></div>
            </div>

            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <div style="font-size: 12px; color: #64748b; font-weight: 600; display: flex; align-items: center; gap: 5px;">
                <span class="material-symbols-outlined" style="font-size: 16px; color: #d97706;">devices</span> คอมพิวเตอร์ / มือถือ
              </div>
              <div style="font-size: 18px; font-weight: 700; color: #334155; margin-top: 6px;">
                💻 ${stats.desktopCount} <span style="font-size: 13px; color: #94a3b8; font-weight: 400;">/</span> 📱 ${stats.mobileCount}
              </div>
            </div>
          </div>

          <!-- Date Filtering and Search Controls -->
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
            <!-- Presets Buttons Row -->
            <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-size: 12.5px; font-weight: 700; color: #475569; margin-right: 4px;">ช่วงเวลา:</span>
                <button type="button" onclick="window.PVTLoginLogsViewer?.setDatePreset('all')" style="padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid ${this.activePreset === 'all' ? '#0d9488' : '#e2e8f0'}; background: ${this.activePreset === 'all' ? '#f0fdfa' : '#ffffff'}; color: ${this.activePreset === 'all' ? '#0f766e' : '#64748b'};">ทั้งหมด</button>
                <button type="button" onclick="window.PVTLoginLogsViewer?.setDatePreset('today')" style="padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid ${this.activePreset === 'today' ? '#0d9488' : '#e2e8f0'}; background: ${this.activePreset === 'today' ? '#f0fdfa' : '#ffffff'}; color: ${this.activePreset === 'today' ? '#0f766e' : '#64748b'};">วันนี้</button>
                <button type="button" onclick="window.PVTLoginLogsViewer?.setDatePreset('7days')" style="padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid ${this.activePreset === '7days' ? '#0d9488' : '#e2e8f0'}; background: ${this.activePreset === '7days' ? '#f0fdfa' : '#ffffff'}; color: ${this.activePreset === '7days' ? '#0f766e' : '#64748b'};">7 วันล่าสุด</button>
                <button type="button" onclick="window.PVTLoginLogsViewer?.setDatePreset('30days')" style="padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid ${this.activePreset === '30days' ? '#0d9488' : '#e2e8f0'}; background: ${this.activePreset === '30days' ? '#f0fdfa' : '#ffffff'}; color: ${this.activePreset === '30days' ? '#0f766e' : '#64748b'};">30 วันล่าสุด</button>
                <button type="button" onclick="window.PVTLoginLogsViewer?.setDatePreset('month')" style="padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid ${this.activePreset === 'month' ? '#0d9488' : '#e2e8f0'}; background: ${this.activePreset === 'month' ? '#f0fdfa' : '#ffffff'}; color: ${this.activePreset === 'month' ? '#0f766e' : '#64748b'};">เดือนนี้</button>
              </div>

              <div style="font-size: 12px; color: #64748b;">
                แสดงผล <strong>${this.filteredLogs.length}</strong> จากทั้งหมด ${this.logs.length} รายการ
              </div>
            </div>

            <!-- Custom Date Inputs & Search -->
            <div class="filter-grid">
              <!-- Start Date -->
              <div>
                <label style="display: block; font-size: 11.5px; font-weight: 600; color: #64748b; margin-bottom: 4px;">ตั้งแต่วันที่:</label>
                <input 
                  type="date" 
                  id="loginLogsStartDate" 
                  value="${this.startDate}" 
                  onchange="window.PVTLoginLogsViewer?.onCustomDateChange(this.value, 'start')"
                  style="width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 12.5px; outline: none; background: #fff;"
                />
              </div>

              <!-- End Date -->
              <div>
                <label style="display: block; font-size: 11.5px; font-weight: 600; color: #64748b; margin-bottom: 4px;">ถึงวันที่:</label>
                <input 
                  type="date" 
                  id="loginLogsEndDate" 
                  value="${this.endDate}" 
                  onchange="window.PVTLoginLogsViewer?.onCustomDateChange(this.value, 'end')"
                  style="width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 12.5px; outline: none; background: #fff;"
                />
              </div>

              <!-- Keyword Search -->
              <div>
                <label style="display: block; font-size: 11.5px; font-weight: 600; color: #64748b; margin-bottom: 4px;">ค้นหาผู้ใช้งาน / IP / รหัส:</label>
                <input 
                  type="text" 
                  id="loginLogsSearch" 
                  placeholder="พิมพ์ชื่อ, รหัสพนักงาน, IP..." 
                  value="${this.escapeHtml(this.searchQuery)}" 
                  oninput="window.PVTLoginLogsViewer?.onSearchChange(this.value)"
                  style="width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 12.5px; outline: none; background: #fff;"
                />
              </div>

              <!-- Method Filter -->
              <div>
                <label style="display: block; font-size: 11.5px; font-weight: 600; color: #64748b; margin-bottom: 4px;">ช่องทางเข้าสู่ระบบ:</label>
                <select 
                  onchange="window.PVTLoginLogsViewer?.onMethodFilterChange(this.value)"
                  style="width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 12.5px; outline: none; background: #fff;"
                >
                  <option value="all" ${this.methodFilter === 'all' ? 'selected' : ''}>ทุกช่องทาง (All Methods)</option>
                  <option value="password" ${this.methodFilter === 'password' ? 'selected' : ''}>🔑 รหัสผ่าน (Password)</option>
                  <option value="qr" ${this.methodFilter === 'qr' ? 'selected' : ''}>📱 QR Code</option>
                  <option value="token" ${this.methodFilter === 'token' ? 'selected' : ''}>🔗 Security Token / Auto</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Table Container -->
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
            <div style="max-height: 520px; overflow-y: auto; overflow-x: auto; width: 100%; -webkit-overflow-scrolling: touch;">
              <table style="text-align: left;">
                <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 2; border-bottom: 2px solid #e2e8f0;">
                  <tr style="font-size: 12px; color: #475569;">
                    <th style="padding: 10px; font-weight: 700;">เวลา (Timestamp)</th>
                    <th style="padding: 10px; font-weight: 700;">ผู้ใช้งาน (User & Employee)</th>
                    <th style="padding: 10px; font-weight: 700;">ช่องทาง</th>
                    <th style="padding: 10px; font-weight: 700;">อุปกรณ์ & เบราว์เซอร์ (Device Info)</th>
                    <th style="padding: 10px; font-weight: 700;">IP Address</th>
                    <th style="padding: 10px; font-weight: 700; text-align: center;">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            <!-- Pagination Bar -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; flex-wrap: wrap; gap: 8px;">
              <div>
                หน้า <strong>${this.currentPage}</strong> จาก <strong>${totalPages}</strong> (รายการที่ ${startIndex + 1} - ${Math.min(startIndex + this.pageSize, this.filteredLogs.length)} จาก ${this.filteredLogs.length})
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <button 
                  type="button" 
                  onclick="window.PVTLoginLogsViewer?.setPage(${this.currentPage - 1})" 
                  ${this.currentPage <= 1 ? 'disabled' : ''}
                  style="padding: 4px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: ${this.currentPage <= 1 ? '#f1f5f9' : '#ffffff'}; color: ${this.currentPage <= 1 ? '#94a3b8' : '#334155'}; cursor: ${this.currentPage <= 1 ? 'default' : 'pointer'}; font-weight: 600;"
                >
                  ◀ ก่อนหน้า
                </button>
                <button 
                  type="button" 
                  onclick="window.PVTLoginLogsViewer?.setPage(${this.currentPage + 1})" 
                  ${this.currentPage >= totalPages ? 'disabled' : ''}
                  style="padding: 4px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: ${this.currentPage >= totalPages ? '#f1f5f9' : '#ffffff'}; color: ${this.currentPage >= totalPages ? '#94a3b8' : '#334155'}; cursor: ${this.currentPage >= totalPages ? 'default' : 'pointer'}; font-weight: 600;"
                >
                  ถัดไป ▶
                </button>
              </div>
            </div>
          </div>

          <!-- Bottom Footer Compliance Note -->
          <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: #64748b; flex-wrap: wrap; gap: 8px;">
            <div>
              🔒 ระบบบันทึกประวัติการเข้าสู่ระบบแบบอัตโนมัติตามมาตรฐานความปลอดภัยและ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <button type="button" onclick="window.copyLoginLogsMigrationSql?.()" style="background: none; border: none; color: #0d9488; cursor: pointer; text-decoration: underline; font-size: 11.5px; padding: 0;">
                📋 ดูคำสั่ง SQL ตาราง login_logs
              </button>
            </div>
          </div>

        </div>
      `;
    }

    /**
     * ⚙️ Event Handlers
     */
    onCustomDateChange(val, type) {
      this.activePreset = 'custom';
      if (type === 'start') this.startDate = val;
      if (type === 'end') this.endDate = val;
      this.applyFilters();
      this.render();
    }

    onSearchChange(val) {
      this.searchQuery = val;
      this.applyFilters();
      this.render();
    }

    onMethodFilterChange(val) {
      this.methodFilter = val;
      this.applyFilters();
      this.render();
    }

    setPage(page) {
      const totalPages = Math.max(1, Math.ceil(this.filteredLogs.length / this.pageSize));
      if (page < 1 || page > totalPages) return;
      this.currentPage = page;
      this.render();
    }

    /**
     * 🧹 Purge login logs older than 90 days from Supabase
     */
    async purgeOlderLogs() {
      if (!window.Swal) return;

      const confirmRes = await Swal.fire({
        title: 'ยืนยันการล้างประวัติการเข้าสู่ระบบ?',
        text: 'ระบบจะลบข้อมูลประวัติการเข้าสู่ระบบที่มีอายุมากกว่า 90 วันออกจากตาราง login_logs ทั้งหมดอย่างถาวรและไม่สามารถย้อนคืนได้',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ใช่, ลบข้อมูลทันที',
        cancelButtonText: 'ยกเลิก',
        focusCancel: true
      });

      if (!confirmRes.isConfirmed) return;

      Swal.fire({
        title: 'กำลังล้างข้อมูล...',
        text: 'กรุณารอสักครู่ ระบบกำลังลบประวัติที่เก่ากว่า 90 วันจากเซิร์ฟเวอร์',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      try {
        const response = await fetch('/api/purge-login-logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const result = await response.json();
        
        if (response.ok && result.success) {
          await Swal.fire({
            icon: 'success',
            title: 'ล้างข้อมูลสำเร็จ!',
            text: `ระบบได้ลบประวัติการเข้าสู่ระบบที่เก่ากว่า 90 วัน จำนวน ${result.count || 0} รายการ เรียบร้อยแล้ว`,
            confirmButtonColor: '#0d9488'
          });
          
          // Re-fetch log list to update UI
          this.fetchLogs();
        } else {
          throw new Error(result.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
        }
      } catch (err) {
        console.error('[LoginLogsViewer] Purge failed:', err);
        Swal.fire({
          icon: 'error',
          title: 'ไม่สามารถล้างข้อมูลได้',
          text: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง',
          confirmButtonColor: '#64748b'
        });
      }
    }

    /**
     * 📋 Show SQL Migration for login_logs table
     */
    showSqlMigration() {
      const sql = `
CREATE TABLE IF NOT EXISTS public.login_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID,
    employee_code TEXT,
    full_name TEXT,
    role TEXT,
    login_method TEXT, -- 'password', 'qr', 'token'
    status TEXT DEFAULT 'success',
    ip_address TEXT,
    device_info JSONB, -- {browser, os, device_type, screen}
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_login_logs_timestamp ON public.login_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_emp_code ON public.login_logs (employee_code);
      `.trim();

      if (window.Swal) {
        Swal.fire({
          title: 'คำสั่ง SQL สำหรับสร้างตาราง login_logs',
          html: `<pre style="text-align: left; background: #f8fafc; padding: 12px; border-radius: 8px; font-size: 11px; overflow-x: auto; font-family: monospace; border: 1px solid #e2e8f0; color: #334155;">${sql}</pre>`,
          width: 'min(90vw, 600px)',
          confirmButtonText: 'คัดลอกคำสั่ง SQL',
          confirmButtonColor: '#0d9488',
          showCancelButton: true,
          cancelButtonText: 'ปิด'
        }).then((result) => {
          if (result.isConfirmed) {
            navigator.clipboard.writeText(sql);
            Swal.fire({
              icon: 'success',
              title: 'คัดลอกแล้ว!',
              toast: true,
              position: 'top-end',
              showConfirmButton: false,
              timer: 2000
            });
          }
        });
      }
    }

    /**
     * 🚀 Main Render Function
     */
    render() {
      if (!this.containerId) return;
      const container = document.getElementById(this.containerId);
      if (container) {
        container.innerHTML = this.renderHTML();
      }
    }

    /**
     * 📢 Static Method to open viewer in a Modal
     */
    static async openModal() {
      const viewer = new LoginLogsViewerComponent({ limit: 300 });
      viewer.containerId = 'pvtLoginLogsViewerContainer';

      const { value: formValues } = await Swal.fire({
        title: null,
        html: `<div id="pvtLoginLogsViewerContainer" style="min-height: 400px; padding: 4px;">กำลังเตรียมข้อมูล...</div>`,
        width: 'min(96vw, 1020px)',
        padding: '12px',
        showConfirmButton: false,
        showCloseButton: true,
        allowOutsideClick: true,
        didOpen: () => {
          window.PVTLoginLogsViewer = viewer;
          window.copyLoginLogsMigrationSql = () => viewer.showSqlMigration();
          viewer.fetchLogs();
        },
        willClose: () => {
          delete window.PVTLoginLogsViewer;
          delete window.copyLoginLogsMigrationSql;
        }
      });
    }
  }

  // Expose to window
  window.LoginLogsViewerComponent = LoginLogsViewerComponent;
  window.openLoginLogsViewerModal = LoginLogsViewerComponent.openModal;

  // Auto-init for legacy support
  window.viewLoginAuditLogs = LoginLogsViewerComponent.openModal;

})(window);
