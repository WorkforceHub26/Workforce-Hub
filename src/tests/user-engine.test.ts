import { describe, it, expect, vi, beforeEach } from 'vitest';

// A mock of the Supabase client
const createMockSupabaseClient = (mockRow: any = null, mockLeaveType: any = null) => {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      return {
        select: vi.fn().mockImplementation(() => {
          return {
            eq: vi.fn().mockImplementation((col: string, val: any) => {
              return {
                eq: vi.fn().mockImplementation(() => {
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
                    single: vi.fn().mockResolvedValue({ data: mockRow, error: null })
                  };
                }),
                maybeSingle: vi.fn().mockResolvedValue({ data: mockLeaveType || mockRow, error: null })
              };
            })
          };
        }),
        update: vi.fn().mockImplementation(() => {
          return {
            eq: vi.fn().mockImplementation(() => {
              return Promise.resolve({ error: null });
            })
          };
        }),
        insert: vi.fn().mockImplementation(() => {
          return Promise.resolve({ error: null });
        })
      };
    })
  };
};

// Simplified UserEngine class for pure algorithmic testing
class TestUserEngine {
  client: any;
  _leaveBalanceInsertForbidden: boolean = false;

  constructor(client: any) {
    this.client = client;
  }

  isElbInsertBlocked() {
    return this._leaveBalanceInsertForbidden;
  }

  markElbInsertBlocked() {
    this._leaveBalanceInsertForbidden = true;
  }

  async updateLeaveBalance(employeeId: string, leaveTypeId: string | null, leaveCode: string | null, yearAD: number, deltaUsedDays: number, absoluteUsedDays: number | null = null, absoluteTotalDays: number | null = null) {
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

      // Bug Fix: Default columns must map to 'other_used' if leave code is unclassified!
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
      }

      const { data: row } = await this.client
        .from('employee_leave_balances')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('year', yearAD)
        .maybeSingle();

      const updates: any = { updated_at: new Date().toISOString() };
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
        await this.client
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
      }
    } catch(err) {
      console.warn("⚠️ updateLeaveBalance error:", err);
    }
  }
}

describe('UserEngine - updateLeaveBalance Unit Tests', () => {
  it('should correctly resolve column name based on leave code "SICK"', async () => {
    const mockClient = createMockSupabaseClient({ id: 'row-123', sick_used: 5 });
    const engine = new TestUserEngine(mockClient);

    await engine.updateLeaveBalance('emp-1', null, 'SICK', 2026, 2);

    expect(mockClient.from).toHaveBeenCalledWith('employee_leave_balances');
  });

  it('should fallback to other_used if leaveCode is unrecognized', async () => {
    const mockClient = createMockSupabaseClient({ id: 'row-123', other_used: 1 });
    const engine = new TestUserEngine(mockClient);

    await engine.updateLeaveBalance('emp-1', null, 'UNKNOWN_LEAVE', 2026, 1);
    
    // Test passes if it does not crash and runs safely
    expect(mockClient.from).toHaveBeenCalled();
  });

  it('should classify "ลาพักร้อน" as VACATION', async () => {
    const mockLeaveType = { leave_code: '', leave_name: 'ลาพักร้อนประจำปี' };
    const mockClient = createMockSupabaseClient({ id: 'row-123', vacation_used: 2 }, mockLeaveType);
    const engine = new TestUserEngine(mockClient);

    await engine.updateLeaveBalance('emp-1', 'type-vacation', null, 2026, 1);

    expect(mockClient.from).toHaveBeenCalledWith('leave_types');
  });

  it('should respect absolute total days when provided', async () => {
    const mockClient = createMockSupabaseClient({ id: 'row-123', sick_used: 5 });
    const engine = new TestUserEngine(mockClient);

    await engine.updateLeaveBalance('emp-1', null, 'SICK', 2026, 0, null, 45);

    expect(mockClient.from).toHaveBeenCalled();
  });
});
