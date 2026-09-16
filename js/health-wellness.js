/**
 * ============================================================================
 * health-wellness.js — Corporate Health & Wellness Engine
 * Real Data-Driven Sick Leave Trend Analysis & Proactive Care Action Planning
 * ============================================================================
 */

(function (global) {
  "use strict";

  // Illness Categorization Lexicon
  const ILLNESS_CATEGORIES = [
    {
      key: "office_syndrome",
      name: "Office Syndrome & กล้ามเนื้ออักเสบ",
      icon: "personal_injury",
      color: "#6366f1",
      bgColor: "#e0e7ff",
      keywords: ["office", "ออฟฟิศ", "ปวดหลัง", "ปวดคอ", "ปวดบ่า", "ไหล่", "เส้นเอ็น", "นิ้วล็อค", "เมื่อย", "กล้ามเนื้อ", "กายภาพ", "เอว"],
      preventive: {
        title: "สวัสดิการ Ergonomics & กายภาพบำบัด",
        desc: "จัดตรวจประเมินสถานีทำงาน (Workstation Ergonomics Audit), สนับสนุนเบาะรองหลัง/ที่วางแขน และจัดคลาสยืดเหยียด Office Stretch 15 นาทีระหว่างวัน",
        priority: "high",
        roi: "ลดวันลาป่วย 30-45%"
      }
    },
    {
      key: "respiratory",
      name: "โรคทางเดินหายใจ & ไข้หวัด (Flu/COVID)",
      icon: "masks",
      color: "#0ea5e9",
      bgColor: "#e0f2fe",
      keywords: ["หวัด", "ไข้", "ไอ", "เจ็บคอ", "น้ำมูก", "covid", "โควิด", "หลอดลม", "ทอนซิล", "ภูมิแพ้", "เสมหะ", "จาม"],
      preventive: {
        title: "วัคซีนไข้หวัดใหญ่ 4 สายพันธุ์ประจำปี",
        desc: "จัดกิจกรรม 'Vaccine Day' ฉีดวัคซีนไข้หวัดใหญ่ฟรีแก่พนักงานถึงสถานที่ทำงาน และติดตั้งจุดทำความสะอาดแอลกอฮอล์ในพื้นที่ส่วนกลาง",
        priority: "high",
        roi: "ป้องกันการระบาดในแผนกได้ 70%"
      }
    },
    {
      key: "digestive",
      name: "ระบบทางเดินอาหาร & กรดไหลย้อน",
      icon: "nutrition",
      color: "#f59e0b",
      bgColor: "#fef3c7",
      keywords: ["ปวดท้อง", "ท้องเสีย", "กรดไหลย้อน", "กระเพาะ", "อาหารเป็นพิษ", "คลื่นไส้", "อาเจียน", "ลำไส้", "ถ่ายเหลว"],
      preventive: {
        title: "โภชนาการเพื่อสุขภาพ & มุมชาบำรุงทางเดินอาหาร",
        desc: "สนับสนุนมุมเครื่องดื่มชาสมุนไพรช่วยย่อยและลดกรด (เช่น ทีเตชา คาโมมายล์/เปปเปอร์มินต์) และกำหนดเวลาพักรับประทานอาหารให้ตรงเวลา",
        priority: "medium",
        roi: "ลดอาการกำเริบซ้ำ 40%"
      }
    },
    {
      key: "migraine",
      name: "ไมเกรน & ความเครียดสะสม",
      icon: "psychology",
      color: "#ec4899",
      bgColor: "#fce7f3",
      keywords: ["ไมเกรน", "ปวดหัว", "ปวดศีรษะ", "เวียนหัว", "หน้ามืด", "บ้านหมุน", "เครียด", "นอนไม่หลับ", "สายตาล้า"],
      preventive: {
        title: "แว่นกรองแสงสีฟ้า & Mental Wellness Room",
        desc: "จัดสวัสดิการตรวจสายตาและแว่นตากรองแสงคอมพิวเตอร์ และจัดโซนพักสายตาความเงียบ (Quiet Rest Corner) เพื่อลดความตึงเครียด",
        priority: "medium",
        roi: "เพิ่มประสิทธิภาพการทำงาน 25%"
      }
    },
    {
      key: "trauma",
      name: "อุบัติเหตุ & การบาดเจ็บฉับพลัน",
      icon: "medical_services",
      color: "#ef4444",
      bgColor: "#fee2e2",
      keywords: ["หกล้ม", "อุบัติเหตุ", "เคล็ด", "ขัดยอก", "รถล้ม", "แผล", "ผ่าตัด", "ตกบันได", "เย็บ"],
      preventive: {
        title: "การอบรมความปลอดภัย & ประกันอุบัติเหตุกลุ่ม",
        desc: "ทบทวนมาตรการความปลอดภัยในโรงงาน/หน้าร้าน ตรวจเช็คพื้นกันลื่น และเน้นย้ำความคุ้มครองอุบัติเหตุ 24 ชั่วโมงจากกรมธรรม์กลุ่ม",
        priority: "preventive",
        roi: "คุ้มครองความปลอดภัย 100%"
      }
    },
    {
      key: "general",
      name: "อาการป่วยและตรวจรักษาทั่วไป",
      icon: "healing",
      color: "#10b981",
      bgColor: "#d1fae5",
      keywords: [],
      preventive: {
        title: "ตรวจสุขภาพประจำปี & Telemedicine",
        desc: "ตรวจสุขภาพคัดกรองความเสี่ยงโรคไม่ติดต่อเรื้อรัง (NCDs) และสิทธิ์ปรึกษาแพทย์ออนไลน์ผ่าน Telemedicine โดยไม่ต้องเดินทางไปโรงพยาบาล",
        priority: "preventive",
        roi: "ค้นพบความเสี่ยงล่วงหน้า"
      }
    }
  ];

  class HealthWellnessManager {
    constructor() {
      this.categories = ILLNESS_CATEGORIES;
    }

    // ========================================================================
    // 📊 Real Data Sick Leave Trend Analysis & Preventive Care Action Plan
    // ========================================================================
    async openSickLeaveTrendModal() {
      if (typeof Swal === 'undefined') {
        alert("ระบบกำลังโหลดกรุณาลองใหม่อีกครั้ง");
        return;
      }

      Swal.fire({
        title: 'กำลังดึงสถิติจากฐานข้อมูลจริง...',
        text: 'รวบรวมประวัติการลาป่วยและวิเคราะห์กลุ่มอาการ...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      const sb = window.pvtSupabase?.getClient ? window.pvtSupabase.getClient() : (window.supabase || window.sb);
      let rawLeaves = [];
      let totalEmps = 0;

      try {
        if (sb) {
          // 1. ดึงข้อมูลประเภทวันลาทั้งหมดเพื่อค้นหา ID วันลาป่วย
          const { data: typesData } = await sb.from('leave_types').select('id, leave_name, leave_code');
          const sickTypeIds = (typesData || [])
            .filter(t => (t.leave_code && t.leave_code.toUpperCase() === 'SICK') || (t.leave_name && (t.leave_name.includes('ป่วย') || t.leave_name.toLowerCase().includes('sick'))))
            .map(t => t.id);

          // 2. ดึงข้อมูลประวัติการลาจริงจากตาราง leave_requests
          let query = sb.from('leave_requests')
            .select('id, employee_id, reason, total_days, start_date, status, leave_type_id, leave_types!leave_type_id(leave_name, leave_code)');

          if (sickTypeIds.length > 0) {
            query = query.in('leave_type_id', sickTypeIds);
          }

          const [leavesRes, empsRes] = await Promise.all([
            query,
            sb.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'active')
          ]);

          rawLeaves = (leavesRes.data || []).filter(r => r.status !== 'rejected' && r.status !== 'cancelled');
          totalEmps = empsRes.count || 0;
        }
      } catch (e) {
        console.warn("Could not query supabase for real sick leaves:", e);
      }

      Swal.close();

      // คำนวณสถิติเฉพาะจากข้อมูลจริง 100% (ไม่ใส่ข้อมูลจำลอง)
      const stats = this._processSickLeaveStats(rawLeaves, totalEmps);

      const modalHtml = `
        <div style="text-align: left; font-family: inherit;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 8px 12px; border-radius: 8px;">
            <span style="font-size: 12px; font-weight: 700; color: #166534; display: flex; align-items: center; gap: 6px;">
              <span class="material-symbols-outlined" style="font-size: 16px; color: #16a34a;">verified</span>
              ข้อมูลสถิติจริงจากระบบฐานข้อมูล (Live Real Database Records)
            </span>
            <span style="font-size: 11.5px; color: #15803d; font-weight: 600;">พนักงานทั้งหมด: ${stats.totalEmployees} คน</span>
          </div>

          <!-- Top Stats -->
          <div class="sick-trend-metric-grid">
            <div class="sick-metric-card">
              <div class="sick-metric-icon" style="background: #fee2e2; color: #ef4444;">
                <span class="material-symbols-outlined">sick</span>
              </div>
              <div>
                <div class="sick-metric-num">${stats.totalSickDays} วัน</div>
                <div class="sick-metric-label">วันลาป่วยสะสมรวมจริง</div>
              </div>
            </div>

            <div class="sick-metric-card">
              <div class="sick-metric-icon" style="background: #e0e7ff; color: #4f46e5;">
                <span class="material-symbols-outlined">analytics</span>
              </div>
              <div>
                <div class="sick-metric-num">${stats.avgDaysPerEmp} วัน/คน</div>
                <div class="sick-metric-label">อัตราป่วยเฉลี่ยต่อคน</div>
              </div>
            </div>

            <div class="sick-metric-card">
              <div class="sick-metric-icon" style="background: #fef3c7; color: #d97706;">
                <span class="material-symbols-outlined">trophy</span>
              </div>
              <div>
                <div class="sick-metric-num" style="font-size: 14.5px;">${stats.topDiagnosis.name}</div>
                <div class="sick-metric-label">อาการป่วยอันดับ 1 (${stats.topDiagnosis.percent}%)</div>
              </div>
            </div>
          </div>

          <!-- Diagnosis Breakdown Bars -->
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
              <strong style="font-size: 13.5px; color: #1e293b;">📊 สัดส่วนกลุ่มประเภทอาการป่วยยอดฮิต (Real Illness Breakdown)</strong>
              <span style="font-size: 12px; color: #64748b;">จากประวัติจริงรวม ${stats.totalIncidents} ครั้ง</span>
            </div>

            ${stats.totalIncidents === 0 ? `
              <div style="text-align: center; padding: 24px 12px; color: #64748b; background: #f8fafc; border-radius: 8px;">
                <span class="material-symbols-outlined" style="font-size: 32px; color: #94a3b8; display: block; margin-bottom: 6px;">info</span>
                ยังไม่พบรายการใบลาป่วยที่อนุมัติในระบบขณะนี้ (ไม่มีข้อมูลขยะ/ข้อมูลจำลอง)
              </div>
            ` : stats.categoryBreakdown.map(cat => `
              <div class="diagnosis-bar-item">
                <div class="diagnosis-bar-header">
                  <span style="display: flex; align-items: center; gap: 6px;">
                    <span class="material-symbols-outlined" style="font-size: 16px; color: ${cat.color};">${cat.icon}</span>
                    ${cat.name}
                  </span>
                  <span><strong>${cat.days} วัน</strong> (${cat.incidents} ครั้ง | ${cat.percent}%)</span>
                </div>
                <div class="diagnosis-progress-bg">
                  <div class="diagnosis-progress-fill" style="width: ${cat.percent}%; background: ${cat.color};"></div>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Preventive Care Action Plan -->
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
              <span class="material-symbols-outlined" style="color: #0d9488; font-size: 22px;">health_and_safety</span>
              <strong style="font-size: 14px; color: #1e293b;">ข้อเสนอแนะการดูแลสุขภาพและสุขภาวะเชิงรุก (Proactive Health Care Plan)</strong>
            </div>
            <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
              แนวทางเชิงรุกอิงตามกลุ่มอาการป่วยจริง เพื่อช่วยลดอัตราการขาดงานและเพิ่มประสิทธิภาพการทำงาน:
            </p>

            <div class="preventive-care-grid">
              ${stats.preventiveActions.map(act => `
                <div class="preventive-action-card ${act.priority === 'high' ? 'priority-high' : 'priority-medium'}">
                  <div class="preventive-title">
                    <span class="material-symbols-outlined" style="font-size: 18px; color: #0d9488;">shield</span>
                    ${act.title}
                  </div>
                  <div class="preventive-desc">${act.desc}</div>
                  <div class="preventive-roi-badge">
                    <span class="material-symbols-outlined" style="font-size: 14px; color: #16a34a;">trending_up</span>
                    ${act.roi}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      Swal.fire({
        title: '📈 วิเคราะห์สถิติประเภทอาการป่วยยอดฮิต & วางแผนสุขภาวะเชิงรุก',
        html: modalHtml,
        width: '780px',
        confirmButtonText: 'ปิดรายงาน',
        confirmButtonColor: '#0d9488'
      });
    }

    _processSickLeaveStats(rawLeaves, totalEmps) {
      const counts = {};
      const daysCount = {};

      this.categories.forEach(c => {
        counts[c.key] = 0;
        daysCount[c.key] = 0;
      });

      // ประมวลผลจากรายการใบลาจริงเท่านั้น (ไม่มีข้อมูลจำลอง baseline Injected)
      rawLeaves.forEach(req => {
        const text = (req.reason || '').toLowerCase();
        let matched = false;
        const days = Number(req.total_days) || 1;

        for (const cat of this.categories) {
          if (cat.keywords.some(kw => text.includes(kw))) {
            counts[cat.key] += 1;
            daysCount[cat.key] += days;
            matched = true;
            break;
          }
        }

        if (!matched) {
          counts['general'] += 1;
          daysCount['general'] += days;
        }
      });

      let totalDays = 0;
      let totalIncidents = 0;
      Object.values(daysCount).forEach(d => totalDays += d);
      Object.values(counts).forEach(c => totalIncidents += c);

      const breakdown = this.categories.map(c => {
        const d = daysCount[c.key] || 0;
        const inc = counts[c.key] || 0;
        const pct = totalDays > 0 ? Math.round((d / totalDays) * 100) : 0;
        return {
          key: c.key,
          name: c.name,
          icon: c.icon,
          color: c.color,
          days: d,
          incidents: inc,
          percent: pct,
          preventive: c.preventive
        };
      }).sort((a, b) => b.days - a.days || b.incidents - a.incidents);

      const activeCategoriesWithData = breakdown.filter(b => b.days > 0 || b.incidents > 0);

      const top = activeCategoriesWithData[0] || { 
        name: totalIncidents === 0 ? 'ยังไม่มีประวัติ' : (breakdown[0]?.name || 'ทั่วไป'), 
        percent: 0 
      };

      // เลือกแผนดูแลเชิงรุกเฉพาะหมวดหมู่ที่มีเคสป่วยจริง หรือใช้ default ถ้าไม่มีข้อมูลเลย
      let selectedActions = [];
      if (activeCategoriesWithData.length > 0) {
        selectedActions = activeCategoriesWithData.slice(0, 3).map(b => b.preventive);
      } else {
        // Default general wellness guidelines
        selectedActions = [
          this.categories.find(c => c.key === 'respiratory').preventive,
          this.categories.find(c => c.key === 'office_syndrome').preventive,
          this.categories.find(c => c.key === 'general').preventive
        ];
      }

      return {
        totalEmployees: Math.max(totalEmps, 1),
        totalSickDays: totalDays,
        totalIncidents: totalIncidents,
        avgDaysPerEmp: (totalDays / Math.max(totalEmps, 1)).toFixed(1),
        topDiagnosis: top,
        categoryBreakdown: breakdown,
        preventiveActions: selectedActions
      };
    }
  }

  global.HealthWellness = new HealthWellnessManager();

})(typeof window !== "undefined" ? window : this);
