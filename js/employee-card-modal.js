/**
 * =========================================================================
 * 🪪 PVT WORKFORCE HUB - UNIVERSAL EMPLOYEE CARD & BATCH PRINT MANAGER
 * =========================================================================
 * Provides full digital employee card viewing, search, and batch printing
 * across all HR and administrative pages in the system.
 */

(function () {
  let cachedEmployeeList = null;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getBaseUrl() {
    const currentOrigin = window.location.origin;
    if (!currentOrigin || currentOrigin.includes("localhost") || currentOrigin.includes("127.0.0.1") || currentOrigin.includes("file://")) {
      return "https://dev-workforcehub-2026.pages.dev";
    }
    return currentOrigin;
  }

  function generateEmployeeQrUrl(empCode) {
    if (!empCode) return "";
    const cleanCode = String(empCode).trim();
    const baseUrl = getBaseUrl();
    try {
      const targetUrl = new URL("/index.html", baseUrl);
      targetUrl.searchParams.set("auto_login", cleanCode);
      const encodedTarget = encodeURIComponent(targetUrl.toString());
      return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodedTarget}`;
    } catch (err) {
      console.error("❌ Error generating QR URL:", err);
      const fallbackTarget = `${baseUrl}/index.html?auto_login=${encodeURIComponent(cleanCode)}`;
      return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(fallbackTarget)}`;
    }
  }

  async function getClient() {
    if (window.sb) return window.sb;
    if (window.pvtSupabase?.getClient) return window.pvtSupabase.getClient();
    if (typeof getSupabaseClient === 'function') return getSupabaseClient();
    return null;
  }

  // 🟢 1. Open Employee Card Selection & Batch Print Modal
  window.openEmployeeCardManagerPopup = async function (forceRefresh = false) {
    if (typeof Swal === "undefined") {
      alert("⚠️ กำลังโหลดไลบรารี กรุณารอสักครู่");
      return;
    }

    if (!cachedEmployeeList || forceRefresh) {
      Swal.fire({
        title: 'กำลังโหลดบัญชีรายชื่อพนักงาน...',
        html: '<div style="padding:20px; font-size:14px; color:#0f766e;">⌛ กำลังเชื่อมต่อและดึงข้อมูลพนักงานทุกคน...</div>',
        showConfirmButton: false,
        allowOutsideClick: false
      });

      const client = await getClient();
      if (!client) {
        // Fallback to local storage or dummy
        const fallbackUsers = JSON.parse(localStorage.getItem('allEmployees') || '[]');
        if (fallbackUsers.length > 0) {
          cachedEmployeeList = fallbackUsers;
        } else {
          Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง', 'error');
          return;
        }
      } else {
        try {
          const { data: employees, error } = await client
            .from('employees')
            .select(`
              id,
              employee_code,
              full_name,
              image_url,
              line_id,
              department_id,
              departments!department_id ( department_name ),
              positions ( position_name )
            `)
            .order('employee_code', { ascending: true });

          if (error) throw error;
          cachedEmployeeList = employees || [];
        } catch (err) {
          console.error("Error loading employees for cards:", err);
          Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงรายชื่อพนักงานได้: ' + (err.message || ''), 'error');
          return;
        }
      }
    }

    // Filter by user's department to only see their own department (meaning employees in the department)
    const savedSession = localStorage.getItem("currentUser") || sessionStorage.getItem("currentUser");
    let sessionUser = {};
    try {
      sessionUser = savedSession ? JSON.parse(savedSession) : {};
    } catch (e) {}
    const myProfile = window.currentUserProfile || sessionUser || {};
    const myDeptId = myProfile?.department_id || myProfile?.employees?.department_id;
    const myRole = (myProfile?.role || "").toLowerCase();

    let displayEmployees = cachedEmployeeList || [];
    if (myDeptId && myRole !== 'admin' && myRole !== 'hr') {
      displayEmployees = displayEmployees.filter(emp => String(emp.department_id) === String(myDeptId));
    }

    let rowsHtml = "";
    if (displayEmployees.length === 0) {
      rowsHtml = `<div style="text-align:center; padding:32px; color:#64748b; font-size:14px;">ไม่พบข้อมูลพนักงานในระบบ</div>`;
    } else {
      displayEmployees.forEach(emp => {
        const empRole = emp.positions?.position_name || emp.position_name || 'พนักงาน';
        const empDept = emp.departments?.department_name || emp.department_name || 'ไม่ระบุแผนก';
        const empName = emp.full_name || 'ไม่ระบุชื่อ';
        const empCode = emp.employee_code || '';
        const fullAvatarUrl = emp.image_url || '/assets/img/default-avatar.jpg';

        rowsHtml += `
          <div class="emp-card-selection-item" style="display: flex; align-items: center; padding: 12px 14px; border-bottom: 1px solid #f1f5f9; gap: 12px; transition: background 0.15s ease;">
            <div style="flex-shrink: 0; display: flex; align-items: center;">
              <input type="checkbox" class="emp-card-checkbox" 
                     data-code="${escapeHtml(empCode)}" 
                     data-name="${escapeHtml(empName)}" 
                     data-role="${escapeHtml(empRole)}" 
                     data-dept="${escapeHtml(empDept)}"
                     style="cursor: pointer; width: 19px; height: 19px; accent-color: #0f766e;" />
            </div>
            <div style="flex-shrink: 0;">
              <img src="${fullAvatarUrl}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;" onerror="this.src='/assets/img/default-avatar.jpg';">
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 700; color: #0f172a; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(empName)}</div>
              <div style="color: #64748b; font-size: 12px; margin-top: 2px; display: flex; align-items: center; gap: 6px;">
                <span style="font-weight: 600; color: #0f766e; background: #ccfbf1; padding: 1px 6px; border-radius: 4px;">#${escapeHtml(empCode)}</span>
                <span>•</span>
                <span>${escapeHtml(empRole)}</span>
                <span>•</span>
                <span>${escapeHtml(empDept)}</span>
              </div>
            </div>
            <div style="flex-shrink: 0;">
              <button type="button" class="btn-view-card" 
                      data-code="${escapeHtml(empCode)}" 
                      data-name="${escapeHtml(empName)}" 
                      data-role="${escapeHtml(empRole)}" 
                      data-dept="${escapeHtml(empDept)}"
                      data-avatar="${escapeHtml(fullAvatarUrl)}"
                style="background: #0284c7; color: white; border: none; padding: 7px 12px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <span class="material-symbols-outlined" style="font-size:18px;">badge</span>
                <span>ดูบัตร</span>
              </button>
            </div>
          </div>
        `;
      });
    }

    Swal.fire({
      title: '🪪 ระบบจัดการและพิมพ์บัตรพนักงานดิจิทัล',
      width: '640px',
      html: `
        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; text-align: left;">
          <div style="display: flex; gap: 8px;">
            <input type="text" id="cardSearchInput" placeholder="🔍 ค้นหารหัสพนักงาน, ชื่อ-สกุล, ตำแหน่ง, หรือแผนก..." 
              style="flex: 1; padding: 11px 14px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 10px; outline: none; font-family: inherit;" />
            <button type="button" onclick="window.openEmployeeCardManagerPopup(true)" title="รีเฟรชข้อมูลล่าสุด"
              style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #475569;">
              <span class="material-symbols-outlined" style="font-size: 20px;">sync</span>
            </button>
          </div>
          
          <div style="display: flex; align-items: center; justify-content: space-between; background: #f8fafc; padding: 10px 14px; border-radius: 10px; border: 1px solid #e2e8f0;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; font-weight: 600; color: #334155;">
              <input type="checkbox" id="selectAllCardsCheckbox" onchange="window.toggleSelectAllCards(this)" style="cursor: pointer; width: 18px; height: 18px; accent-color: #0f766e;" />
              <span>เลือกทั้งหมด (<span id="totalVisibleCardCount">${displayEmployees.length}</span> คน)</span>
            </label>
            <button id="btnPrintSelectedCards" onclick="window.handlePrintSelectedCardsFromPopup()" disabled
              style="background: #0f766e; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: not-allowed; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; opacity: 0.5; transition: all 0.2s;">
              <span class="material-symbols-outlined" style="font-size:18px;">print</span> 
              พิมพ์ชุด (<span id="selectedCardCount">0</span>)
            </button>
          </div>
        </div>
        
        <div id="employeeCardTableBody" style="max-height: 420px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; text-align: left;">
          ${rowsHtml}
        </div>
        <div id="noMatchCardMessage" style="display: none; padding: 28px; text-align: center; color: #64748b; font-size: 14px;">
          ❌ ไม่พบข้อมูลพนักงานที่ตรงกับคำค้นหา
        </div>
      `,
      confirmButtonText: 'ปิดหน้าต่าง',
      confirmButtonColor: '#64748b',
      didOpen: () => {
        const searchInput = document.getElementById("cardSearchInput");
        const container = document.getElementById("employeeCardTableBody");
        const noMatchMsg = document.getElementById("noMatchCardMessage");
        const totalVisibleEl = document.getElementById("totalVisibleCardCount");

        if (container) {
          container.addEventListener('change', (e) => {
            if (e.target.classList.contains('emp-card-checkbox')) {
              window.updateCardSelectionCount();
            }
          });

          container.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-view-card');
            if (btn) {
              const { code, name, role, dept, avatar } = btn.dataset;
              window.showIndividualIdCard(code, name, role, dept, avatar);
            }
          });
        }

        if (searchInput && container) {
          searchInput.focus();
          searchInput.addEventListener("input", (e) => {
            const keyword = e.target.value.trim().toLowerCase();
            const items = container.querySelectorAll(".emp-card-selection-item");
            let visibleCount = 0;

            items.forEach(item => {
              const text = item.innerText.toLowerCase();
              if (text.includes(keyword)) {
                item.style.display = "flex";
                visibleCount++;
              } else {
                item.style.display = "none";
              }
            });

            if (totalVisibleEl) totalVisibleEl.textContent = visibleCount;
            if (noMatchMsg) {
              noMatchMsg.style.display = (visibleCount === 0 && items.length > 0) ? "block" : "none";
            }
            window.updateCardSelectionCount();
          });
        }
      }
    });
  };

  // 🟢 2. Checkbox selection helpers
  window.toggleSelectAllCards = function (masterCb) {
    const checkboxes = document.querySelectorAll('.emp-card-checkbox');
    checkboxes.forEach(cb => {
      const row = cb.closest('.emp-card-selection-item');
      if (row && row.style.display !== 'none') {
        cb.checked = masterCb.checked;
      }
    });
    window.updateCardSelectionCount();
  };

  window.updateCardSelectionCount = function () {
    const checkedBoxes = document.querySelectorAll('.emp-card-checkbox:checked');
    const countEl = document.getElementById('selectedCardCount');
    const btnPrint = document.getElementById('btnPrintSelectedCards');

    const count = checkedBoxes.length;
    if (countEl) countEl.textContent = count;

    if (btnPrint) {
      if (count > 0) {
        btnPrint.disabled = false;
        btnPrint.style.opacity = '1';
        btnPrint.style.cursor = 'pointer';
      } else {
        btnPrint.disabled = true;
        btnPrint.style.opacity = '0.5';
        btnPrint.style.cursor = 'not-allowed';
      }
    }
  };

  window.handlePrintSelectedCardsFromPopup = function () {
    const checkedBoxes = document.querySelectorAll('.emp-card-checkbox:checked');
    if (checkedBoxes.length === 0) return;

    const selectedEmployees = Array.from(checkedBoxes).map(cb => ({
      empCode: cb.dataset.code,
      empName: cb.dataset.name,
      empRole: cb.dataset.role,
      empDept: cb.dataset.dept
    }));

    window.printMultipleCards(selectedEmployees);
  };

  // 🟢 3. Show Single Digital ID Card Modal
  window.showIndividualIdCard = function (empCode, empName, empRole, empDept, avatarUrl) {
    const qrUrl = generateEmployeeQrUrl(empCode);
    const imgUrl = avatarUrl || '/assets/img/default-avatar.jpg';
    
    Swal.fire({
      title: '💳 บัตรประจำตัวพนักงานดิจิทัล',
      width: '420px',
      html: `
        <div id="pvt-id-card" style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); width: 320px; margin: 15px auto; border-radius: 20px; padding: 24px; color: white; box-shadow: 0 15px 30px rgba(30,58,138,0.3); text-align: center; border: 1px solid rgba(255,255,255,0.1);">
          <div style="font-weight: 700; font-size: 13px; letter-spacing: 1.5px; color: #38bdf8; margin-bottom: 16px;">PVT WORKFORCE HUB</div>
          <div style="width: 84px; height: 84px; margin: 0 auto 14px auto; border-radius: 50%; border: 3px solid #38bdf8; overflow: hidden; background: #1e293b;">
            <img src="${imgUrl}" onerror="this.src='/assets/img/default-avatar.jpg';" style="width: 100%; height: 100%; object-fit: cover;" alt="Employee Photo" />
          </div>
          <div style="font-size: 18px; font-weight: 700; margin-bottom: 4px; color: #ffffff;">${escapeHtml(empName)}</div>
          <div style="font-size: 13px; color: #38bdf8; font-weight: 600; margin-bottom: 2px;">ตำแหน่ง: ${escapeHtml(empRole)}</div>
          <div style="font-size: 12px; color: #94a3b8; font-weight: 500; margin-bottom: 16px;">แผนก: ${escapeHtml(empDept)}</div>
          <div style="background: white; padding: 10px; border-radius: 14px; display: inline-block; margin-bottom: 16px; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
            <img src="${qrUrl}" alt="Employee QR Code" style="width: 130px; height: 130px; display: block;" 
                 onerror="this.onerror=null; this.src='https://via.placeholder.com/130?text=QR+Error';" />
          </div>
          <div>
            <span style="font-size: 11px; color: #94a3b8; display: block; text-transform: uppercase; margin-bottom: 2px;">Employee ID</span>
            <span style="font-size: 16px; font-weight: 800; background: rgba(255,255,255,0.12); padding: 4px 18px; border-radius: 30px; display: inline-block; letter-spacing: 1px; font-family: monospace;">
              ${escapeHtml(empCode)}
            </span>
          </div>
        </div>
      `,
      showCancelButton: true,
      cancelButtonText: '🔙 ย้อนกลับ',
      confirmButtonText: '🖨️ สั่งพิมพ์บัตร',
      confirmButtonColor: '#0f766e',
      cancelButtonColor: '#64748b',
    }).then((result) => {
      if (result.dismiss === Swal.DismissReason.cancel) {
        window.openEmployeeCardManagerPopup();
      } else if (result.isConfirmed) {
        window.printSingleCard(empCode, empName, empRole, empDept, imgUrl);
      }
    });
  };

  // 🟢 4. Single Card Print
  window.printSingleCard = function (empCode, empName, position, department, pictureUrl) {
    let employee = {};
    if (typeof empCode === 'object' && empCode !== null) {
      employee = {
        code: empCode.employee_code || empCode.empCode || empCode.id || '',
        name: empCode.name || empCode.empName || empCode.full_name || '-',
        position: empCode.position || empCode.empRole || '-',
        department: empCode.department || empCode.empDept || '-',
        avatar: empCode.image_url || empCode.avatarUrl || '/assets/img/default-avatar.jpg',
        qr_url: empCode.qr_url || generateEmployeeQrUrl(empCode.employee_code || empCode.empCode)
      };
    } else {
      employee = {
        code: empCode || '',
        name: empName || '-',
        position: position || '-',
        department: department || '-',
        avatar: pictureUrl || '/assets/img/default-avatar.jpg',
        qr_url: (pictureUrl && pictureUrl.includes('qrserver.com')) ? pictureUrl : generateEmployeeQrUrl(empCode)
      };
    }

    const printWindow = window.open('', '_blank', 'width=500,height=600');
    if (!printWindow) {
      alert('⚠️ เบราว์เซอร์ระงับการเปิด Pop-up! กรุณากด "อนุญาตให้เปิด Pop-up" ที่แถบ URL ด้านบน');
      return;
    }

    const cardHtml = `
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="UTF-8">
        <title>พิมพ์บัตรพนักงาน - ${escapeHtml(employee.name)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
          @page { size: 85.6mm 53.98mm; margin: 0; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { font-family: 'Sarabun', sans-serif; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f1f5f9; }
          .card {
            position: relative; width: 85.6mm; height: 53.98mm; border-radius: 8px; padding: 8px 12px;
            background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: white;
            display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .card-header { font-size: 10px; font-weight: 700; color: #38bdf8; text-align: center; letter-spacing: 1px; }
          .card-body { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
          .avatar-box { width: 44px; height: 44px; border-radius: 50%; overflow: hidden; border: 2px solid #38bdf8; flex-shrink: 0; background: #1e293b; }
          .avatar-box img { width: 100%; height: 100%; object-fit: cover; }
          .details { flex: 1; font-size: 9px; line-height: 1.3; }
          .name { font-weight: 700; font-size: 11px; color: #fff; margin-bottom: 2px; }
          .meta { color: #94a3b8; font-size: 9px; }
          .role { color: #38bdf8; font-weight: 600; }
          .qr-box { background: white; padding: 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
          .qr-box img { width: 50px; height: 50px; display: block; }
          .card-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px; }
          .emp-id { font-size: 10px; font-weight: 700; background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 10px; font-family: monospace; }
          @media print { body { background: transparent; } .card { border: none; box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="card-header">PVT WORKFORCE HUB</div>
          <div class="card-body">
            <div class="avatar-box">
              <img src="${employee.avatar}" onerror="this.src='/assets/img/default-avatar.jpg';" alt="Avatar" />
            </div>
            <div class="details">
              <div class="name">${escapeHtml(employee.name)}</div>
              <div class="meta role">ตำแหน่ง: ${escapeHtml(employee.position)}</div>
              <div class="meta">แผนก: ${escapeHtml(employee.department)}</div>
            </div>
            <div class="qr-box">
              <img id="singleQrImg" src="${employee.qr_url}" alt="QR Code" />
            </div>
          </div>
          <div class="card-footer">
            <span style="font-size: 8px; color: #94a3b8;">EMPLOYEE ID</span>
            <span class="emp-id">${escapeHtml(employee.code)}</span>
          </div>
        </div>
        <script>
          const img = document.getElementById('singleQrImg');
          let printed = false;
          function triggerPrint() {
            if (printed) return;
            printed = true;
            setTimeout(() => {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            }, 300);
          }
          if (img.complete) { triggerPrint(); } 
          else { img.onload = triggerPrint; img.onerror = triggerPrint; }
          setTimeout(triggerPrint, 1500);
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(cardHtml);
    printWindow.document.close();
  };

  // 🟢 5. Batch Print Multiple Cards (A4 Sheet)
  window.printMultipleCards = function (selectedList = []) {
    if (!Array.isArray(selectedList) || selectedList.length === 0) {
      alert("⚠️ กรุณาเลือกพนักงานที่ต้องการพิมพ์บัตร");
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('⚠️ เบราว์เซอร์ระงับการเปิด Pop-up! กรุณากด "อนุญาตให้เปิด Pop-up" ที่แถบ URL ด้านบน');
      return;
    }

    let cardsHtml = selectedList.map(item => {
      const empCode = item.empCode || item.employee_code || '';
      const qrUrl = generateEmployeeQrUrl(empCode);

      return `
        <div class="card">
          <div class="lanyard-hole"></div>
          <div class="company">PVT WORKFORCE HUB</div>
          <div class="profile-section">
            <div class="name">${escapeHtml(item.empName)}</div>
            <div class="badge-container">
              <span class="role-badge">${escapeHtml(item.empRole)}</span>
              <span class="dept-text">แผนก: ${escapeHtml(item.empDept)}</span>
            </div>
          </div>
          <div class="qr-box"><img class="batch-qr-img" src="${qrUrl}" alt="QR Code" /></div>
          <div class="footer-section"><div class="id-tag">${escapeHtml(empCode)}</div></div>
        </div>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="th">
        <head>
          <meta charset="UTF-8">
          <title>Batch Print ID Cards (${selectedList.length} รายการ)</title>
          <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { font-family: 'Sarabun', sans-serif; background: #f1f5f9; padding: 20px; margin: 0; }
            .card-grid { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
            .card { 
              position: relative; background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%); 
              width: 240px; height: 380px; border-radius: 16px; padding: 18px 14px; color: white; 
              text-align: center; border: 1px solid rgba(255, 255, 255, 0.1); display: flex; flex-direction: column;
              justify-content: space-between; align-items: center; overflow: hidden; page-break-inside: avoid;
            }
            .card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 5px; background: linear-gradient(90deg, #06b6d4, #3b82f6, #6366f1); }
            .lanyard-hole { width: 32px; height: 6px; background: #020617; border-radius: 10px; margin-bottom: 6px; border: 1px solid rgba(255, 255, 255, 0.15); }
            .company { font-weight: 700; font-size: 10px; letter-spacing: 2px; color: #38bdf8; text-transform: uppercase; margin-bottom: 6px; }
            .profile-section { margin-bottom: 4px; width: 100%; }
            .name { font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 4px; line-height: 1.2; word-break: break-word; }
            .badge-container { display: flex; flex-direction: column; gap: 3px; align-items: center; justify-content: center; }
            .role-badge { font-size: 10px; color: #38bdf8; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25); padding: 2px 8px; border-radius: 12px; font-weight: 500; }
            .dept-text { font-size: 10px; color: #94a3b8; font-weight: 400; }
            .qr-box { background: #ffffff; padding: 6px; border-radius: 10px; display: inline-block; border: 2px solid #38bdf8; }
            .qr-box img { width: 110px; height: 110px; display: block; }
            .footer-section { width: 100%; }
            .id-tag { font-size: 13px; font-weight: 700; letter-spacing: 1.5px; color: #f8fafc; background: rgba(255, 255, 255, 0.08); padding: 4px 14px; border-radius: 20px; display: inline-block; border: 1px solid rgba(255,255,255,0.15); font-family: monospace, 'Sarabun'; }
            @media print { body { background: transparent; padding: 0; } .card-grid { gap: 15px; } }
          </style>
        </head>
        <body>
          <div class="card-grid">${cardsHtml}</div>
          <script>
            const images = document.querySelectorAll('.batch-qr-img');
            let loadedCount = 0;
            let printed = false;

            function triggerPrint() {
              if (printed) return;
              printed = true;
              setTimeout(() => {
                window.print();
                setTimeout(() => { window.close(); }, 500);
              }, 400);
            }

            function checkAllLoaded() {
              loadedCount++;
              if (loadedCount >= images.length) {
                triggerPrint();
              }
            }

            if (images.length === 0) {
              triggerPrint();
            } else {
              images.forEach(img => {
                if (img.complete) { checkAllLoaded(); } 
                else { img.onload = checkAllLoaded; img.onerror = checkAllLoaded; }
              });
            }

            setTimeout(triggerPrint, 2500);
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  window.generateEmployeeQrUrl = generateEmployeeQrUrl;
})();
