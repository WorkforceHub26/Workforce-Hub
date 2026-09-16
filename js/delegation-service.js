/**
 * ==========================================================================
 * 🔄 AUTO-DELEGATION SERVICE (ระบบโอนสิทธิ์อนุมัติอัตโนมัติเมื่อหัวหน้างานลาพักร้อน)
 * PVT WORKFORCE HUB — บริษัท พี.วี.ที. & ที. พลาส จำกัด
 * ==========================================================================
 * วัตถุประสงค์:
 * 1. ป้องกันคำขอลาค้างเกินกรอบนโยบาย SLA 48 ชั่วโมง (2 วันทำการ) เมื่อหัวหน้างานลาพักร้อน
 * 2. ตรวจสอบสถานะการลาพักร้อนของผู้อนุมัติ (L1 / L2) โดยอัตโนมัติ
 * 3. โอนสิทธิ์การพิจารณาอนุมัติให้ผู้รักษาการแทน (Designated Delegate / Acting Approver) ทันที
 * 4. บันทึก Audit Trail ความโปร่งใสในการอนุมัติแทนตามกฎระเบียบบริษัท
 */

(function(window) {
  'use strict';

  const STORAGE_KEY = 'pvt_auto_delegation_rules';
  const SETTINGS_KEY = 'pvt_auto_delegation_config';

  // แคชข้อมูลเพื่อประสิทธิภาพ
  let cachedRules = null;
  let cachedConfig = null;
  let activeLeavesCache = null;
  let lastFetchTime = 0;

  const AutoDelegationService = {
    /**
     * ดึงการตั้งค่าระบบ Auto-Delegation
     */
    async getConfig() {
      if (cachedConfig) return cachedConfig;
      
      const defaultConfig = {
        enabled: true,
        autoTriggerOnAnnualLeave: true, // ตรวจจับใบลาพักร้อนที่อนุมัติแล้วอัตโนมัติ
        autoTriggerOnAllLeaves: false,  // โอนสิทธิ์เมื่อลาทุกประเภท
        slaThresholdHours: 24,          // เร่งโอนสิทธิ์เมื่อใกล้ถึง 24 ชม.
        allowL2Fallback: true,          // ถ้าไม่มีผู้แทน ให้ L2 อนุมัติแทน L1 ได้ทันที
        notifyDelegateViaLine: true,    // แจ้งเตือนผู้แทนผ่าน LINE
        notifyDelegateInApp: true       // แจ้งเตือนผู้แทนในระบบ
      };

      try {
        const sb = window.pvtSupabase?.getClient?.() || window.supabaseClient;
        if (sb) {
          const { data } = await sb
            .from('system_settings')
            .select('setting_key, employee_id')
            .eq('setting_key', SETTINGS_KEY)
            .maybeSingle();

          if (data && data.employee_id) {
            try {
              const parsed = JSON.parse(data.employee_id);
              cachedConfig = { ...defaultConfig, ...parsed };
              return cachedConfig;
            } catch (e) {
              console.warn("[Auto-Delegation] Parse config error:", e);
            }
          }
        }
      } catch (err) {
        console.warn("[Auto-Delegation] Get config failed, using local storage:", err);
      }

      const local = localStorage.getItem(SETTINGS_KEY);
      if (local) {
        try {
          cachedConfig = { ...defaultConfig, ...JSON.parse(local) };
          return cachedConfig;
        } catch (e) {}
      }

      cachedConfig = defaultConfig;
      return cachedConfig;
    },

    /**
     * บันทึกการตั้งค่าระบบ Auto-Delegation
     */
    async saveConfig(config) {
      cachedConfig = { ...config };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));

      try {
        const sb = window.pvtSupabase?.getClient?.() || window.supabaseClient;
        if (sb) {
          await sb.from('system_settings').upsert({
            setting_key: SETTINGS_KEY,
            employee_id: JSON.stringify(config)
          }, { onConflict: 'setting_key' });
        }
      } catch (err) {
        console.warn("[Auto-Delegation] Save config to DB error:", err);
      }
      return true;
    },

    /**
     * ดึงรายการกฎการโอนสิทธิ์ที่ตั้งไว้ทั้งหมด (Rules)
     */
    async getDelegationRules() {
      if (cachedRules && (Date.now() - lastFetchTime < 30000)) {
        return cachedRules;
      }

      let rules = [];
      try {
        const sb = window.pvtSupabase?.getClient?.() || window.supabaseClient;
        if (sb) {
          const { data } = await sb
            .from('system_settings')
            .select('setting_key, employee_id')
            .eq('setting_key', STORAGE_KEY)
            .maybeSingle();

          if (data && data.employee_id) {
            try {
              rules = JSON.parse(data.employee_id) || [];
            } catch (e) {
              console.warn("[Auto-Delegation] Parse rules error:", e);
            }
          }
        }
      } catch (err) {
        console.warn("[Auto-Delegation] Fetch rules error:", err);
      }

      if (!rules || rules.length === 0) {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          try {
            rules = JSON.parse(local) || [];
          } catch (e) {}
        }
      }

      cachedRules = rules;
      lastFetchTime = Date.now();
      return rules;
    },

    /**
     * บันทึกรายการกฎการโอนสิทธิ์ทั้งหมด
     */
    async saveDelegationRules(rules) {
      cachedRules = rules;
      lastFetchTime = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));

      try {
        const sb = window.pvtSupabase?.getClient?.() || window.supabaseClient;
        if (sb) {
          await sb.from('system_settings').upsert({
            setting_key: STORAGE_KEY,
            employee_id: JSON.stringify(rules)
          }, { onConflict: 'setting_key' });
        }
      } catch (err) {
        console.warn("[Auto-Delegation] Save rules to DB error:", err);
      }
      return true;
    },

    /**
     * เพิ่มหรืออัปเดตกฎการโอนสิทธิ์สำหรับผู้อนุมัติคนใดคนหนึ่ง
     */
    async setDelegationRule(rule) {
      const rules = await this.getDelegationRules();
      const existingIdx = rules.findIndex(r => String(r.approver_id) === String(rule.approver_id));
      
      const updatedRule = {
        id: rule.id || `del_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        approver_id: rule.approver_id,
        approver_name: rule.approver_name || '',
        delegate_id: rule.delegate_id,
        delegate_name: rule.delegate_name || '',
        department_id: rule.department_id || null,
        department_name: rule.department_name || '',
        role_type: rule.role_type || 'L1', // L1, L2, L3
        condition: rule.condition || 'on_annual_leave', // 'on_annual_leave' | 'always' | 'custom_date'
        start_date: rule.start_date || null,
        end_date: rule.end_date || null,
        note: rule.note || '',
        is_active: rule.is_active !== false,
        created_at: rule.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (existingIdx >= 0) {
        rules[existingIdx] = updatedRule;
      } else {
        rules.push(updatedRule);
      }

      await this.saveDelegationRules(rules);
      return updatedRule;
    },

    /**
     * ลบกฎการโอนสิทธิ์
     */
    async deleteDelegationRule(ruleId) {
      let rules = await this.getDelegationRules();
      rules = rules.filter(r => String(r.id) !== String(ruleId));
      await this.saveDelegationRules(rules);
      return true;
    },

    /**
     * ตรวจสอบว่าผู้อนุมัติคนนี้ (approverId) กำลังลาพักร้อน หรือมีใบลาที่มีผลอยู่ ณ วันที่ระบุหรือไม่
     * @param {string} approverId รหัสพนักงานของผู้อนุมัติ
     * @param {string|Date} checkDate วันที่ต้องการตรวจสอบ (ค่าเริ่มต้นคือ วันนี้)
     */
    async isApproverOnLeave(approverId, checkDate = new Date()) {
      if (!approverId) return { onLeave: false };

      const targetDateStr = typeof checkDate === 'string' 
        ? checkDate.split('T')[0] 
        : checkDate.toISOString().split('T')[0];

      try {
        const sb = window.pvtSupabase?.getClient?.() || window.supabaseClient;
        if (!sb) return { onLeave: false };

        const { data: leaves, error } = await sb
          .from('leave_requests')
          .select(`
            id, employee_id, start_date, end_date, status,
            leave_types!leave_type_id (id, leave_name, leave_code)
          `)
          .eq('employee_id', approverId)
          .eq('status', 'approved')
          .lte('start_date', targetDateStr)
          .gte('end_date', targetDateStr);

        if (error) throw error;

        if (leaves && leaves.length > 0) {
          const leave = leaves[0];
          const typeName = leave.leave_types?.leave_name || 'ลาหยุดงาน';
          const isAnnual = String(typeName).includes('พักร้อน') || 
                           String(leave.leave_types?.leave_code).toLowerCase().includes('annual') ||
                           String(typeName).includes('พักผ่อน');

          return {
            onLeave: true,
            isAnnualLeave: isAnnual,
            leaveDetails: leave,
            leaveName: typeName,
            startDate: leave.start_date,
            endDate: leave.end_date
          };
        }
      } catch (err) {
        console.warn("[Auto-Delegation] Check approver leave error:", err);
      }

      return { onLeave: false };
    },

    /**
     * ค้นหาว่าคำขอลาฉบับนี้ (req) มีการโอนสิทธิ์อนุมัติ (Delegation) หรือไม่
     * คืนค่าข้อมูลผู้รักษาการแทนที่มีอำนาจอนุมัติคำขอนี้
     */
    async resolveDelegationForRequest(req, currentUserId = null) {
      if (!req) return null;

      const config = await this.getConfig();
      if (!config.enabled) return null;

      const rules = await this.getDelegationRules();
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. ระบุผู้อนุมัติตามลำดับขั้น
      // Step L1: ตรวจสอบหัวหน้างาน L1
      const l1ApproverId = req.employees?.l1_approver_id || req.supervisor_id || req.department_supervisor_id;
      const l2ApproverId = req.employees?.l2_approver_id || req.manager_id || req.department_manager_id;

      // ตรวจสอบขั้น L1
      if (req.manager_status === 'pending' || !req.manager_status) {
        if (l1ApproverId) {
          // ตรวจสอบว่ามีกฎระบุตัวแทนไว้หรือไม่
          const rule = rules.find(r => String(r.approver_id) === String(l1ApproverId) && r.is_active);
          const leaveStatus = await this.isApproverOnLeave(l1ApproverId, todayStr);

          // เงื่อนไขเปิดการโอนสิทธิ์:
          // ก) หัวหน้าลาพักร้อน (และระบบเปิด autoTriggerOnAnnualLeave)
          // ข) หรือ มีกฎแบบ always / custom_date
          let shouldDelegate = false;
          let reasonText = "";

          if (leaveStatus.onLeave && (config.autoTriggerOnAllLeaves || leaveStatus.isAnnualLeave)) {
            shouldDelegate = true;
            reasonText = `หัวหน้างาน (${rule?.approver_name || 'L1'}) ลาพักร้อน (${leaveStatus.startDate} ถึง ${leaveStatus.endDate})`;
          } else if (rule && rule.condition === 'always') {
            shouldDelegate = true;
            reasonText = `ตั้งค่าโอนสิทธิ์ถาวร`;
          } else if (rule && rule.condition === 'custom_date') {
            if (rule.start_date && rule.end_date && todayStr >= rule.start_date && todayStr <= rule.end_date) {
              shouldDelegate = true;
              reasonText = `อยู่ในช่วงเวลาโอนสิทธิ์พิเศษ (${rule.start_date} - ${rule.end_date})`;
            }
          }

          if (shouldDelegate) {
            const delegateId = rule?.delegate_id || (config.allowL2Fallback ? l2ApproverId : null);
            const delegateName = rule?.delegate_name || (config.allowL2Fallback ? 'ผู้จัดการฝ่าย (L2 อนุมัติแทน)' : 'ผู้รักษาการแทน');

            return {
              isDelegated: true,
              step: 'L1',
              originalApproverId: l1ApproverId,
              originalApproverName: rule?.approver_name || 'หัวหน้างาน L1',
              delegateId: delegateId,
              delegateName: delegateName,
              reason: reasonText,
              leaveInfo: leaveStatus,
              isCurrentActorDelegate: currentUserId ? String(currentUserId) === String(delegateId) : false
            };
          }
        }
      }

      // ตรวจสอบขั้น L2
      if (req.manager_status === 'approved' && (req.director_status === 'pending' || !req.director_status)) {
        if (l2ApproverId) {
          const rule = rules.find(r => String(r.approver_id) === String(l2ApproverId) && r.is_active);
          const leaveStatus = await this.isApproverOnLeave(l2ApproverId, todayStr);

          let shouldDelegate = false;
          let reasonText = "";

          if (leaveStatus.onLeave && (config.autoTriggerOnAllLeaves || leaveStatus.isAnnualLeave)) {
            shouldDelegate = true;
            reasonText = `ผู้จัดการฝ่าย (${rule?.approver_name || 'L2'}) ลาพักร้อน (${leaveStatus.startDate} ถึง ${leaveStatus.endDate})`;
          } else if (rule && rule.condition === 'always') {
            shouldDelegate = true;
            reasonText = `ตั้งค่าโอนสิทธิ์ถาวร`;
          }

          if (shouldDelegate) {
            return {
              isDelegated: true,
              step: 'L2',
              originalApproverId: l2ApproverId,
              originalApproverName: rule?.approver_name || 'ผู้จัดการ L2',
              delegateId: rule?.delegate_id,
              delegateName: rule?.delegate_name || 'ผู้รักษาการแทน L2 / ผู้บริหาร',
              reason: reasonText,
              leaveInfo: leaveStatus,
              isCurrentActorDelegate: currentUserId ? String(currentUserId) === String(rule?.delegate_id) : false
            };
          }
        }
      }

      return null;
    },

    /**
     * ดึงรายการหัวหน้างานทั้งหมดที่กำลังลาพักร้อนอยู่ ณ วันนี้ พร้อมข้อมูลผู้รักษาการแทน (Live Delegations)
     */
    async getActiveDelegationsSummary() {
      const rules = await this.getDelegationRules();
      const todayStr = new Date().toISOString().split('T')[0];
      const activeList = [];

      try {
        const sb = window.pvtSupabase?.getClient?.() || window.supabaseClient;
        if (!sb) return [];

        // 1. ดึงใบลาพักร้อนที่กำลัง Active อยู่ในวันนี้ของพนักงานระดับหัวหน้า/ผู้จัดการ
        const { data: leaves, error } = await sb
          .from('leave_requests')
          .select(`
            id, employee_id, start_date, end_date, status,
            employees!employee_id (
              id, full_name, employee_code, nickname, role, image_url,
              departments!department_id (department_name),
              positions!position_id (position_name)
            ),
            leave_types!leave_type_id (leave_name)
          `)
          .eq('status', 'approved')
          .lte('start_date', todayStr)
          .gte('end_date', todayStr);

        if (error) throw error;

        (leaves || []).forEach(l => {
          const emp = l.employees || {};
          const role = String(emp.role || '').toLowerCase();
          const pos = String(emp.positions?.position_name || '').toLowerCase();
          const isLeaderOrManager = role === 'leader' || role === 'manager' || role === 'director' || 
                                    pos.includes('หัวหน้า') || pos.includes('ผู้จัดการ') || pos.includes('ผู้อำนวยการ');

          if (isLeaderOrManager) {
            const rule = rules.find(r => String(r.approver_id) === String(emp.id));
            activeList.push({
              leaveId: l.id,
              approverId: emp.id,
              approverName: emp.full_name || 'ไม่ทราบชื่อ',
              approverCode: emp.employee_code || '-',
              position: emp.positions?.position_name || '-',
              department: emp.departments?.department_name || '-',
              leaveType: l.leave_types?.leave_name || 'ลาพักร้อน',
              startDate: l.start_date,
              endDate: l.end_date,
              hasRule: Boolean(rule),
              delegateId: rule?.delegate_id || null,
              delegateName: rule?.delegate_name || 'ยังไม่ได้กำหนดผู้แทน (ส่งต่อ L2/HR อัตโนมัติ)',
              condition: rule?.condition || 'on_annual_leave'
            });
          }
        });
      } catch (err) {
        console.warn("[Auto-Delegation] getActiveDelegationsSummary error:", err);
      }

      return activeList;
    }
  };

  // Export to global window
  window.AutoDelegationService = AutoDelegationService;

})(window);
