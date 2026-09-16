/**
 * 📊 RECHARTS ANALYTICS COMPONENT FOR PVT WORKFORCE HUB
 * Renders daily login counts and leave request trends for the current month.
 */
(function() {
  const e = React.createElement;

  // React Component definition
  class RechartsSummaryDashboard extends React.Component {
    constructor(props) {
      super(props);
      this.state = {
        loginLogs: [],
        loading: true,
        error: null
      };
    }

    async componentDidMount() {
      await this.fetchLogs();
    }

    async fetchLogs() {
      this.setState({ loading: true, error: null });
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth(); // 0-indexed
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthStr = String(month + 1).padStart(2, '0');

      const startDate = `${year}-${monthStr}-01`;
      const endDate = `${year}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

      try {
        let logs = [];

        // 1. Try server-side API first with safe JSON header verification
        try {
          const res = await fetch(`/api/login-logs?startDate=${startDate}&endDate=${endDate}&limit=500`);
          if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const json = await res.json();
              if (Array.isArray(json?.data)) {
                logs = json.data;
              }
            }
          }
        } catch (apiErr) {
          console.warn("Recharts server API fetch notice:", apiErr);
        }

        // 2. Client-side Supabase fallback if server API returned empty
        if (logs.length === 0) {
          try {
            const client = window.supabaseClient || window.pvtSupabase?.client || window.pvtSupabase?.getClient?.();
            if (client) {
              const { data, error } = await client
                .from('login_logs')
                .select('*')
                .gte('timestamp', `${startDate}T00:00:00.000Z`)
                .lte('timestamp', `${endDate}T23:59:59.999Z`)
                .order('timestamp', { ascending: false })
                .limit(500);

              if (!error && Array.isArray(data) && data.length > 0) {
                logs = data;
              }
            }
          } catch (sdkErr) {
            console.warn("Recharts Supabase fallback notice:", sdkErr);
          }
        }

        this.setState({ loginLogs: logs, loading: false });
      } catch (err) {
        console.error("Recharts logs fetch error:", err);
        // Display chart with clean zero baselines rather than a broken screen
        this.setState({ loginLogs: [], loading: false, error: null });
      }
    }

    render() {
      const { loading, loginLogs, error } = this.state;
      const leaveRequests = window.leaveRequests || [];

      // Calculate date parameters
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonthIndex = now.getMonth(); // 0-indexed
      const currentMonthName = now.toLocaleString('th-TH', { month: 'long' });
      const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();

      // Aggregate data day-by-day
      const chartData = [];
      let totalLogins = 0;
      let totalLeaves = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        // Filter logins for this day
        const dayLogins = loginLogs.filter(log => {
          const logDate = new Date(log.timestamp || log.created_at);
          return logDate.getFullYear() === currentYear &&
                 logDate.getMonth() === currentMonthIndex &&
                 logDate.getDate() === day;
        });

        // Filter leave requests created on this day
        const dayLeaves = leaveRequests.filter(req => {
          const reqDate = new Date(req.created_at);
          return reqDate.getFullYear() === currentYear &&
                 reqDate.getMonth() === currentMonthIndex &&
                 reqDate.getDate() === day;
        });

        totalLogins += dayLogins.length;
        totalLeaves += dayLeaves.length;

        chartData.push({
          day: day,
          dayLabel: `${day} ${now.toLocaleString('th-TH', { month: 'short' })}`,
          logins: dayLogins.length,
          leaves: dayLeaves.length
        });
      }

      const currentDay = now.getDate();
      const avgLogins = chartData.length ? (totalLogins / currentDay).toFixed(1) : 0;

      // React-create-element shorthand for Recharts components
      const {
        ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip
      } = window.Recharts;

      if (loading) {
        return e('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '240px',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            border: '1px solid #e2e8f0',
            fontFamily: 'Sarabun, sans-serif',
            color: '#64748b',
            gap: '12px'
          }
        },
          e('div', {
            style: {
              width: '32px',
              height: '32px',
              border: '3px solid #f3f3f3',
              borderTop: '3px solid #0d9488',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }
          }),
          e('span', { style: { fontSize: '14px', fontWeight: 500 } }, 'กำลังประมวลผลข้อมูล Recharts...')
        );
      }

      if (error) {
        return e('div', {
          style: {
            padding: '24px',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '12px',
            color: '#b91c1c',
            fontFamily: 'Sarabun, sans-serif',
            fontSize: '14px',
            textAlign: 'center'
          }
        }, `⚠️ ข้อผิดพลาด: ${error}`);
      }

      return e('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          fontFamily: 'Sarabun, sans-serif'
        }
      },
        // Stat counters bar
        e('div', {
          className: 'recharts-stats-bar',
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
            gap: '14px',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box'
          }
        },
          e('div', {
            style: {
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              minWidth: 0,
              boxSizing: 'border-box'
            }
          },
            e('div', {
              style: {
                background: '#eff6ff',
                color: '#2563eb',
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }
            }, e('span', { className: 'material-symbols-outlined' }, 'login')),
            e('div', { style: { minWidth: 0 } },
              e('div', { style: { fontSize: '12px', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, 'ประวัติเข้าใช้งานในเดือนนี้'),
              e('div', { style: { fontSize: '20px', fontWeight: 700, color: '#1e293b' } }, `${totalLogins} ครั้ง`),
              e('div', { style: { fontSize: '11px', color: '#10b981', marginTop: '2px' } }, `เฉลี่ย ${avgLogins} ครั้ง/วัน`)
            )
          ),
          e('div', {
            style: {
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              minWidth: 0,
              boxSizing: 'border-box'
            }
          },
            e('div', {
              style: {
                background: '#f0fdf4',
                color: '#16a34a',
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }
            }, e('span', { className: 'material-symbols-outlined' }, 'rate_review')),
            e('div', { style: { minWidth: 0 } },
              e('div', { style: { fontSize: '12px', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, `ใบลาสะสมเดือน ${currentMonthName}`),
              e('div', { style: { fontSize: '20px', fontWeight: 700, color: '#1e293b' } }, `${totalLeaves} ใบ`),
              e('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '2px' } }, `จากคำขอทั้งหมดที่มีอยู่ในระบบ`)
            )
          )
        ),

        // Grid charts container
        e('div', {
          className: 'recharts-charts-grid',
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
            gap: '16px',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box'
          }
        },
          // Login counts Area Chart
          e('div', {
            className: 'recharts-chart-card',
            style: {
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '18px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              minWidth: 0,
              maxWidth: '100%',
              width: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden'
            }
          },
            e('div', {
              style: {
                fontSize: '14.5px',
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: 0
              }
            },
              e('span', { className: 'material-symbols-outlined', style: { color: '#0ea5e9', fontSize: '20px', flexShrink: 0 } }, 'trending_up'),
              e('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, 'สถิติจำนวนผู้ล็อกอินเข้าระบบรายวัน')
            ),
            e('div', { style: { width: '100%', maxWidth: '100%', height: 260, minWidth: 0 } },
              e(ResponsiveContainer, { width: '100%', height: '100%' },
                e(AreaChart, { data: chartData, margin: { top: 10, right: 10, left: -25, bottom: 0 } },
                  e('defs', null,
                    e('linearGradient', { id: 'loginColor', x1: '0', y1: '0', x2: '0', y2: '1' },
                      e('stop', { offset: '5%', stopColor: '#0ea5e9', stopOpacity: 0.3 }),
                      e('stop', { offset: '95%', stopColor: '#0ea5e9', stopOpacity: 0 })
                    )
                  ),
                  e(CartesianGrid, { strokeDasharray: '3 3', stroke: '#f1f5f9' }),
                  e(XAxis, { dataKey: 'day', stroke: '#94a3b8', fontSize: 11, fontWeight: 500 }),
                  e(YAxis, { stroke: '#94a3b8', fontSize: 11, fontWeight: 500, allowDecimals: false }),
                  e(Tooltip, {
                    contentStyle: {
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                      fontFamily: 'Sarabun, sans-serif'
                    }
                  }),
                  e(Area, {
                    type: 'monotone',
                    dataKey: 'logins',
                    stroke: '#0284c7',
                    strokeWidth: 2.5,
                    fillOpacity: 1,
                    fill: 'url(#loginColor)',
                    name: 'ล็อกอินเข้าใช้งาน (ครั้ง)'
                  })
                )
              )
            )
          ),

          // Leave requests trend Area Chart
          e('div', {
            className: 'recharts-chart-card',
            style: {
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '18px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              minWidth: 0,
              maxWidth: '100%',
              width: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden'
            }
          },
            e('div', {
              style: {
                fontSize: '14.5px',
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: 0
              }
            },
              e('span', { className: 'material-symbols-outlined', style: { color: '#10b981', fontSize: '20px', flexShrink: 0 } }, 'stacked_line_chart'),
              e('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, 'แนวโน้มการยื่นคำขอลาประจำวัน')
            ),
            e('div', { style: { width: '100%', maxWidth: '100%', height: 260, minWidth: 0 } },
              e(ResponsiveContainer, { width: '100%', height: '100%' },
                e(AreaChart, { data: chartData, margin: { top: 10, right: 10, left: -25, bottom: 0 } },
                  e('defs', null,
                    e('linearGradient', { id: 'leaveColor', x1: '0', y1: '0', x2: '0', y2: '1' },
                      e('stop', { offset: '5%', stopColor: '#10b981', stopOpacity: 0.3 }),
                      e('stop', { offset: '95%', stopColor: '#10b981', stopOpacity: 0 })
                    )
                  ),
                  e(CartesianGrid, { strokeDasharray: '3 3', stroke: '#f1f5f9' }),
                  e(XAxis, { dataKey: 'day', stroke: '#94a3b8', fontSize: 11, fontWeight: 500 }),
                  e(YAxis, { stroke: '#94a3b8', fontSize: 11, fontWeight: 500, allowDecimals: false }),
                  e(Tooltip, {
                    contentStyle: {
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                      fontFamily: 'Sarabun, sans-serif'
                    }
                  }),
                  e(Area, {
                    type: 'monotone',
                    dataKey: 'leaves',
                    stroke: '#059669',
                    strokeWidth: 2.5,
                    fillOpacity: 1,
                    fill: 'url(#leaveColor)',
                    name: 'คำขอส่งใบลา (ใบ)'
                  })
                )
              )
            )
          )
        )
      );
    }
  }

  // Expose mount trigger globally
  window.renderRechartsDashboard = function() {
    const rootEl = document.getElementById("rechartsSummaryPanel");
    if (!rootEl) return;

    if (window.ReactDOM && window.React) {
      try {
        // Render or update using React 18 createRoot if available
        if (window.ReactDOM.createRoot) {
          if (!window.rechartsRootInstance) {
            window.rechartsRootInstance = window.ReactDOM.createRoot(rootEl);
          }
          window.rechartsRootInstance.render(e(RechartsSummaryDashboard));
        } else {
          window.ReactDOM.render(e(RechartsSummaryDashboard), rootEl);
        }
      } catch (err) {
        console.error("Failed to render Recharts dashboard:", err);
      }
    }
  };

  // Initial trigger if React and ReactDOM are available
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      window.renderRechartsDashboard();
    }, 1500);
  });
})();
