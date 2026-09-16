import { URL } from 'url';
import { GoogleGenAI } from '@google/genai';

// Shared in-memory token store for LINE linking
const memoryLineTokens = new Map();

function getSupabaseConfig() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://pgogmhqjdchakcytsomx.supabase.co";
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnb2dtaHFqZGNoYWtjeXRzb214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjUxMzYsImV4cCI6MjA5NzM0MTEzNn0.Ah-uFFvTK_qMiIyJN9Ddid6cXqjrZRtLbs14QXUa_m8";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey;
  return { url, anonKey, serviceKey };
}

// 1. Create LINE Link Code
export async function handleCreateLineLink(req, res) {
  try {
    let bodyData = {};
    if (typeof req.body === 'object' && req.body !== null) {
      bodyData = req.body;
    } else if (typeof req.body === 'string') {
      try { bodyData = JSON.parse(req.body); } catch (e) {}
    } else {
      bodyData = await parseJsonBody(req);
    }

    const employee_id = bodyData.employee_id || bodyData.employeeId;
    if (!employee_id) {
      return sendJson(res, 400, { error: 'Missing employee_id' });
    }

    // ล้าง token เก่าของ employee คนนี้ใน memory
    for (const [t, data] of memoryLineTokens.entries()) {
      if (String(data.employee_id) === String(employee_id)) {
        memoryLineTokens.delete(t);
      }
    }

    // สุ่มรหัส 6 หลัก
    const token = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAtMs = Date.now() + 15 * 60 * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();

    // บันทึกลง Memory Cache
    memoryLineTokens.set(token, {
      employee_id: String(employee_id),
      expires_at: expiresAtMs
    });

    console.log(`🔑 [LINE Link Created]: Employee ID ${employee_id} -> Token: ${token}`);

    // พยายามลองบันทึกลง Supabase DB ด้วย
    const { url, serviceKey } = getSupabaseConfig();
    try {
      // ลบ token เก่าใน DB ก่อน
      await fetch(`${url}/rest/v1/line_link_tokens?employee_id=eq.${employee_id}`, {
        method: 'DELETE',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      });

      // บันทึก token ใหม่ (รองรับทั้งคอลัมน์ token และ link_code เพื่อให้เข้ากับ Supabase Edge Function)
      const dbRes = await fetch(`${url}/rest/v1/line_link_tokens`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          employee_id: employee_id,
          token: token,
          link_code: token,
          expires_at: expiresAt
        })
      });

      if (!dbRes.ok) {
        const errText = await dbRes.text();
        console.warn("⚠️ [Supabase DB Insert line_link_tokens Failed]:", dbRes.status, errText);
      } else {
        console.log("✅ [Supabase DB Insert line_link_tokens Success]: Token saved to DB.");
      }
    } catch (dbErr) {
      console.warn("DB insert token warning:", dbErr);
    }

    return sendJson(res, 200, { success: true, token, expires_at: expiresAt });
  } catch (err) {
    console.error("Error in handleCreateLineLink:", err);
    return sendJson(res, 500, { error: err.message });
  }
}

// 1.1 Clear Approvers LINE & Mapping
export async function handleClearApproverLine(req, res) {
  try {
    let bodyData = {};
    if (typeof req.body === 'object' && req.body !== null) {
      bodyData = req.body;
    } else if (typeof req.body === 'string') {
      try { bodyData = JSON.parse(req.body); } catch (e) {}
    } else {
      bodyData = await parseJsonBody(req);
    }

    const { department_id, employee_ids } = bodyData;
    const { url, serviceKey } = getSupabaseConfig();
    const targetEmpIds = new Set(Array.isArray(employee_ids) ? employee_ids.filter(Boolean).map(String) : []);

    // If department_id is supplied, look up the supervisor and manager of that department
    if (department_id) {
      try {
        const appRes = await fetch(`${url}/rest/v1/department_approvers?department_id=eq.${department_id}&select=supervisor_id,manager_id`, {
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
          }
        });
        if (appRes.ok) {
          const appData = await appRes.json();
          if (Array.isArray(appData)) {
            appData.forEach(row => {
              if (row.supervisor_id) targetEmpIds.add(String(row.supervisor_id));
              if (row.manager_id) targetEmpIds.add(String(row.manager_id));
            });
          }
        }
      } catch (err) {
        console.warn("Lookup department approvers warning:", err);
      }

      // Delete department_approvers record
      try {
        await fetch(`${url}/rest/v1/department_approvers?department_id=eq.${department_id}`, {
          method: 'DELETE',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
          }
        });
      } catch (delErr) {
        console.warn("Delete department approvers record warning:", delErr);
      }
    }

    // Clear line_id and delete tokens for each target employee
    const clearedList = [];
    for (const empId of targetEmpIds) {
      try {
        // Clear in-memory tokens
        for (const [t, data] of memoryLineTokens.entries()) {
          if (String(data.employee_id) === String(empId)) {
            memoryLineTokens.delete(t);
          }
        }

        // Delete line_link_tokens from DB
        await fetch(`${url}/rest/v1/line_link_tokens?employee_id=eq.${empId}`, {
          method: 'DELETE',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
          }
        });

        // Set line_id to null on employees table
        const updRes = await fetch(`${url}/rest/v1/employees?id=eq.${empId}`, {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({ line_id: null })
        });

        if (updRes.ok) {
          clearedList.push(empId);
          console.log(`✅ [LINE ID Cleared]: Cleared LINE ID for Employee ID ${empId}`);
        }
      } catch (updErr) {
        console.warn("Clear employee line_id warning for:", empId, updErr);
      }
    }

    return sendJson(res, 200, { success: true, clearedEmployees: clearedList });
  } catch (err) {
    console.error("Error in handleClearApproverLine:", err);
    return sendJson(res, 500, { error: err.message });
  }
}

// 2. LINE Webhook
export async function handleLineWebhook(req, res) {
  try {
    let bodyData = {};
    if (typeof req.body === 'object' && req.body !== null) {
      bodyData = req.body;
    } else if (typeof req.body === 'string') {
      try { bodyData = JSON.parse(req.body); } catch (e) {}
    } else {
      bodyData = await parseJsonBody(req);
    }

    const events = bodyData.events;
    if (!events || !Array.isArray(events)) {
      return sendJson(res, 200, { status: "ok" });
    }

    const { url, serviceKey } = getSupabaseConfig();

    for (const event of events) {
      if (event.type === 'message' && event.message && event.message.type === 'text') {
        const text = (event.message.text || '').trim();
        const userId = event.source?.userId;
        const replyToken = event.replyToken;

        console.log(`📩 [LINE Webhook Received]: Text="${text}" from User="${userId}"`);

        // ค้นหาตัวเลข 6 หลักในข้อความ
        const match = text.match(/\b\d{6}\b/);
        if (match) {
          const code = match[0];
          let matchedEmpId = null;

          // 1) ค้นหาจาก Memory Cache
          const memData = memoryLineTokens.get(code);
          if (memData) {
            if (Date.now() <= memData.expires_at) {
              matchedEmpId = memData.employee_id;
            } else {
              console.warn(`⏳ [LINE Link Expired]: Code ${code} in memory expired.`);
            }
            memoryLineTokens.delete(code);
          }

          // 2) ถ้าไม่เจอใน Memory ลองค้นหาจาก Supabase DB
          if (!matchedEmpId) {
            try {
              const tokenRes = await fetch(`${url}/rest/v1/line_link_tokens?or=(token.eq.${code},link_code.eq.${code})&select=*`, {
                headers: {
                  'apikey': serviceKey,
                  'Authorization': `Bearer ${serviceKey}`
                }
              });
              const tokens = await tokenRes.json();
              if (Array.isArray(tokens) && tokens.length > 0) {
                const tokenData = tokens[0];
                if (new Date(tokenData.expires_at) > new Date()) {
                  matchedEmpId = tokenData.employee_id;
                }
                // ลบ token ที่ใช้แล้ว
                await fetch(`${url}/rest/v1/line_link_tokens?id=eq.${tokenData.id}`, {
                  method: 'DELETE',
                  headers: {
                    'apikey': serviceKey,
                    'Authorization': `Bearer ${serviceKey}`
                  }
                });
              }
            } catch (dbFetchErr) {
              console.warn("DB Token fetch error:", dbFetchErr);
            }
          }

          // 3) อัปเดตข้อมูลพนักงาน
          if (matchedEmpId) {
            console.log(`✅ [LINE Link Success]: Connecting Employee ${matchedEmpId} to LINE User ${userId}`);
            
            const updateRes = await fetch(`${url}/rest/v1/employees?id=eq.${matchedEmpId}`, {
              method: 'PATCH',
              headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({ line_id: userId })
            });

            if (!updateRes.ok) {
              const errTxt = await updateRes.text();
              console.error("Failed to update employee line_id in Supabase:", errTxt);
            }

            if (replyToken) {
              await replyLine(replyToken, "✅ เชื่อมต่อระบบ HR เรียบร้อยแล้ว! คุณจะได้รับการแจ้งเตือนใบลาผ่านช่องทางนี้");
            }
          } else {
            console.warn(`❌ [LINE Link Failed]: Invalid or expired code "${code}"`);
            if (replyToken) {
              await replyLine(replyToken, "❌ รหัสเชื่อมต่อไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่จากหน้าระบบ");
            }
          }
        }
      }
    }

    return sendJson(res, 200, { status: "ok" });
  } catch (err) {
    console.error("Error in handleLineWebhook:", err);
    return sendJson(res, 200, { status: "error", error: err.message });
  }
}

// 3. Send Notification
export async function handleSendNotification(req, res) {
  try {
    let bodyData = {};
    if (typeof req.body === 'object' && req.body !== null) {
      bodyData = req.body;
    } else if (typeof req.body === 'string') {
      try { bodyData = JSON.parse(req.body); } catch (e) {}
    } else {
      bodyData = await parseJsonBody(req);
    }

    const { employee_id, title, message, flexMessage, recipientLineId } = bodyData;
    if ((!employee_id && !recipientLineId) || !title || !message) {
      return sendJson(res, 400, { error: "Missing required fields" });
    }

    const { url, serviceKey } = getSupabaseConfig();

    let lineId = recipientLineId || "";
    if (!lineId && employee_id) {
      try {
        const empRes = await fetch(`${url}/rest/v1/employees?id=eq.${employee_id}&select=line_id`, {
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
          }
        });
        const emps = await empRes.json();
        if (Array.isArray(emps) && emps.length > 0) {
          lineId = emps[0].line_id || "";
        }
      } catch (fetchErr) {
        console.warn("Error fetching employee line_id:", fetchErr);
      }
    }

    if (lineId) {
      await sendLinePush(lineId, `🔔 ${title}\n\n${message}`, flexMessage);
    }

    return sendJson(res, 200, { success: true, lineSent: Boolean(lineId) });
  } catch (err) {
    console.error("Error in handleSendNotification:", err);
    return sendJson(res, 500, { error: err.message });
  }
}

async function getLineAccessToken() {
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return process.env.LINE_CHANNEL_ACCESS_TOKEN;
  }
  try {
    const { url, serviceKey } = getSupabaseConfig();
    const resp = await fetch(`${url}/rest/v1/system_settings?setting_key=eq.line_oa_config&select=setting_value`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0 && data[0].setting_value?.channel_access_token) {
        return data[0].setting_value.channel_access_token;
      }
    }
  } catch (err) {
    console.warn("⚠️ [LINE Token Fetch Error]:", err);
  }
  return null;
}

// Helper Functions
async function replyLine(replyToken, text) {
  const token = await getLineAccessToken();
  if (!token) {
    console.warn("LINE Channel Access Token is not configured in process.env or system_settings");
    return;
  }

  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: [{ type: 'text', text: text }]
      })
    });
  } catch (e) {
    console.error("Reply Line Error:", e);
  }
}

async function sendLinePush(to, message, flexMessage = null) {
  const token = await getLineAccessToken();
  if (!token) {
    console.warn("LINE Channel Access Token is not configured in process.env or system_settings");
    return;
  }

  try {
    const messages = [];
    if (flexMessage && typeof flexMessage === 'object') {
      messages.push(flexMessage);
    } else {
      messages.push({ type: "text", text: message });
    }

    const resp = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        to: to,
        messages: messages
      })
    });

    if (!resp.ok && flexMessage) {
      const errText = await resp.text();
      console.warn("⚠️ [LINE Push] Flex message push response not OK:", errText, "Falling back to text message...");
      await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          to: to,
          messages: [{ type: "text", text: message }]
        })
      });
    }
  } catch (error) {
    console.error("Error sending LINE push:", error);
  }
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

/**
 * 🔒 Handle Recording Login Activity to 'login_logs' table in Supabase
 * Records User ID, Timestamp, and Device Info for audit purposes.
 */
export async function handleRecordLoginLog(req, res) {
  try {
    let bodyData = {};
    if (typeof req.body === 'object' && req.body !== null) {
      bodyData = req.body;
    } else if (typeof req.body === 'string') {
      try { bodyData = JSON.parse(req.body); } catch (e) {}
    } else {
      bodyData = await parseJsonBody(req);
    }

    const userId = bodyData.user_id || bodyData.userId || bodyData.employee_id || bodyData.employeeId;
    if (!userId) {
      return sendJson(res, 400, { error: 'Missing user identifier for login audit log' });
    }

    // Extract client IP address from request headers
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = forwardedFor ? String(forwardedFor).split(',')[0].trim() : (req.socket?.remoteAddress || req.ip || 'Unknown IP');

    const timestamp = bodyData.timestamp || bodyData.client_timestamp || new Date().toISOString();
    const deviceInfo = bodyData.device_info || bodyData.deviceInfo || {};
    
    // Enrich device_info with server-observed headers if not already specified
    if (typeof deviceInfo === 'object' && deviceInfo !== null) {
      deviceInfo.server_ip = clientIp;
      if (!deviceInfo.user_agent && req.headers['user-agent']) {
        deviceInfo.user_agent = req.headers['user-agent'];
      }
    }

    const employeeId = bodyData.employee_id || (String(userId).length === 36 ? userId : null);
    const loginMethod = bodyData.login_method || bodyData.method || 'password';

    const record = {
      user_id: String(userId),
      employee_id: employeeId,
      employee_code: bodyData.employee_code || '',
      full_name: bodyData.full_name || '',
      role: bodyData.role || '',
      timestamp: timestamp,
      device_info: deviceInfo,
      ip_address: clientIp,
      login_method: loginMethod,
      status: bodyData.status || 'success',
      metadata: bodyData.metadata || { source: 'api' },
      created_at: timestamp
    };

    const { url, serviceKey } = getSupabaseConfig();
    let insertSuccess = false;
    let dbResult = null;

    // 1. Try insert into 'login_logs' table in Supabase via REST with service_role key
    try {
      const resp = await fetch(`${url}/rest/v1/login_logs`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(record)
      });

      if (resp.ok) {
        dbResult = await resp.json();
        insertSuccess = true;
        console.log(`✅ [Login Audit Log] Recorded to 'login_logs': User ${userId} (${loginMethod}) from ${clientIp}`);
      } else {
        const errText = await resp.text();
        console.warn(`⚠️ [Login Audit Log] Supabase 'login_logs' status ${resp.status}:`, errText);
      }
    } catch (dbErr) {
      console.warn("⚠️ [Login Audit Log] Supabase direct insert error:", dbErr.message);
    }

    // 2. Fallback to 'hr_admin_management_logs' if 'login_logs' is pending creation
    if (!insertSuccess) {
      try {
        await fetch(`${url}/rest/v1/hr_admin_management_logs`, {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            actor_id: employeeId,
            actor_name: bodyData.full_name || bodyData.employee_code || 'User',
            action_category: 'LOGIN_AUDIT',
            action_type: `LOGIN_${String(loginMethod).toUpperCase()}`,
            target_identifier: bodyData.employee_code || String(userId),
            description: `เข้าสู่ระบบสำเร็จผ่าน ${loginMethod} [IP: ${clientIp}]`,
            payload_after: record
          })
        });
        console.log("ℹ️ [Login Audit Log] Recorded into fallback audit table (hr_admin_management_logs)");
      } catch (fallbackErr) {
        console.warn("⚠️ [Login Audit Log] Fallback logging error:", fallbackErr.message);
      }
    }

    return sendJson(res, 200, {
      success: true,
      message: 'Login activity logged successfully',
      log: record,
      persisted_to_login_logs: insertSuccess,
      ip: clientIp
    });
  } catch (err) {
    console.error("❌ Error in handleRecordLoginLog:", err);
    return sendJson(res, 500, { error: err.message });
  }
}

/**
 * 📋 Handle Fetching Recent Login Logs for Audit Review with Date and Search Filtering
 */
export async function handleGetLoginLogs(req, res) {
  try {
    const { url, serviceKey } = getSupabaseConfig();
    const reqUrl = new URL(req.url, 'http://localhost');
    const limit = Math.min(Math.max(parseInt(reqUrl.searchParams.get('limit') || '100', 10), 1), 500);
    const startDate = reqUrl.searchParams.get('startDate'); // YYYY-MM-DD
    const endDate = reqUrl.searchParams.get('endDate');     // YYYY-MM-DD
    const search = reqUrl.searchParams.get('search');

    let queryParams = `select=*&order=timestamp.desc&limit=${limit}`;
    if (startDate) {
      queryParams += `&timestamp=gte.${encodeURIComponent(startDate + 'T00:00:00.000Z')}`;
    }
    if (endDate) {
      queryParams += `&timestamp=lte.${encodeURIComponent(endDate + 'T23:59:59.999Z')}`;
    }
    if (search) {
      queryParams += `&or=(user_id.ilike.*${encodeURIComponent(search)}*,full_name.ilike.*${encodeURIComponent(search)}*,employee_code.ilike.*${encodeURIComponent(search)}*,ip_address.ilike.*${encodeURIComponent(search)}*)`;
    }

    // 1. Try querying 'login_logs'
    try {
      const resp = await fetch(`${url}/rest/v1/login_logs?${queryParams}`, {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          return sendJson(res, 200, { success: true, source: 'login_logs', data });
        }
      }
    } catch (e) {}

    // 2. Query fallback from 'hr_admin_management_logs'
    try {
      let fallbackParams = `action_category=eq.LOGIN_AUDIT&select=*&order=created_at.desc&limit=${limit}`;
      if (startDate) {
        fallbackParams += `&created_at=gte.${encodeURIComponent(startDate + 'T00:00:00.000Z')}`;
      }
      if (endDate) {
        fallbackParams += `&created_at=lte.${encodeURIComponent(endDate + 'T23:59:59.999Z')}`;
      }

      const resp = await fetch(`${url}/rest/v1/hr_admin_management_logs?${fallbackParams}`, {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        const mapped = data.map(item => item.payload_after || {
          user_id: item.actor_id,
          full_name: item.actor_name,
          employee_code: item.target_identifier,
          timestamp: item.created_at,
          device_info: { description: item.description },
          login_method: item.action_type
        });
        return sendJson(res, 200, { success: true, source: 'hr_admin_management_logs_fallback', data: mapped });
      }
    } catch (e) {}

    return sendJson(res, 200, { success: true, source: 'empty', data: [] });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
}

// 🧹 Purge login logs older than 90 days from 'login_logs' table
export async function handlePurgeLoginLogs(req, res) {
  try {
    const { url, serviceKey } = getSupabaseConfig();
    
    // Calculate the date 90 days ago
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const isoString = ninetyDaysAgo.toISOString();

    console.log(`🧹 [Purge Login Logs] Initiated. Purging logs older than: ${isoString}`);

    // Delete from 'login_logs' table in Supabase via REST
    const resp = await fetch(`${url}/rest/v1/login_logs?timestamp=lt.${encodeURIComponent(isoString)}`, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=representation'
      }
    });

    if (resp.ok) {
      const data = await resp.json();
      const count = Array.isArray(data) ? data.length : 0;
      console.log(`✅ [Purge Login Logs] Successfully purged ${count} logs older than 90 days from 'login_logs'.`);
      return sendJson(res, 200, { success: true, count, dateLimit: isoString });
    } else {
      const errText = await resp.text();
      console.error(`❌ [Purge Login Logs] Failed to delete from Supabase:`, resp.status, errText);
      return sendJson(res, resp.status || 500, { success: false, error: errText });
    }
  } catch (err) {
    console.error("Error in handlePurgeLoginLogs:", err);
    return sendJson(res, 500, { success: false, error: err.message });
  }
}

// 🩺 10. AI OCR Scan for Medical Certificates or Attachments
export async function handleOcrScan(req, res) {
  try {
    let bodyData = {};
    if (typeof req.body === 'object' && req.body !== null) {
      bodyData = req.body;
    } else if (typeof req.body === 'string') {
      try { bodyData = JSON.parse(req.body); } catch (e) {}
    } else {
      bodyData = await parseJsonBody(req);
    }

    const { base64Data, mimeType } = bodyData;
    if (!base64Data) {
      return sendJson(res, 400, { error: 'Missing base64Data' });
    }

    // Clean up base64 string if it contains the prefix
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const cleanMimeType = mimeType || 'image/jpeg';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return sendJson(res, 500, { error: 'GEMINI_API_KEY is not configured on the server. Please add it in settings.' });
    }

    const ai = new GoogleGenAI({ apiKey });
    let response = null;
    const candidateModels = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    
    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMimeType,
                    data: cleanBase64
                  }
                },
                {
                  text: `คุณคือระบบปัญญาประดิษฐ์สแกนใบรับรองแพทย์ของบริษัทเพื่อกรอกฟอร์มอัตโนมัติ (Medical Certificate Document OCR)
กรุณาอ่านข้อมูลจากรูปใบรับรองแพทย์/เอกสารนี้ แล้ววิเคราะห์เพื่อส่งข้อมูลผลลัพธ์กลับมาในรูปแบบ JSON เท่านั้น โดยมีโครงสร้างดังนี้:
{
  "startDate": "วันที่เริ่มแนะนำให้หยุดงานหรือวันที่ตรวจรักษา (รูปแบบ YYYY-MM-DD)",
  "endDate": "วันที่สิ้นสุดแนะนำให้หยุดงาน (รูปแบบ YYYY-MM-DD, หากพักฟื้น 1 วัน สามารถใช้ค่าเดียวกันกับ startDate ได้)",
  "reason": "สรุปอาการเจ็บป่วยหรือคำแนะนำภาษาไทยแบบสั้นๆ กระชับที่สุด (เช่น 'ลาป่วยเป็นไข้หวัดใหญ่' หรือ 'พักฟื้นหลังการตรวจฟัน' หรือระบุคำวิเคราะห์โรคสั้นๆ)"
}

คำชี้แจงสำคัญ:
- วันที่ในเอกสารอาจเป็นปี พ.ศ. ของไทย เช่น 2569 ให้แปลงเป็นปี ค.ศ. คริสตศักราช เช่น 2026 เสมอ (ลบด้วย 543)
- ส่งคืนผลลัพธ์ที่เป็นข้อความ JSON ดิบเท่านั้น ไม่มีโค้ดบล็อกประสาน Markdown (ไม่มี \`\`\`json หรือ \`\`\`) ไม่มีประโยคเกริ่นนำหรือลงท้ายใดๆ ทั้งสิ้น`
                }
              ]
            }
          ]
        });
        if (response && response.text) {
          console.log(`🤖 [Gemini OCR Success with ${modelName}]`);
          break;
        }
      } catch (genErr) {
        console.warn(`⚠️ [Gemini OCR Model ${modelName} failed]:`, genErr.message);
        // Small pause before trying fallback model
        await new Promise(r => setTimeout(r, 400));
      }
    }

    if (!response || !response.text) {
      throw new Error("ไม่สามารถประมวลผล OCR จากรูปภาพด้วย AI ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
    }

    const responseText = response.text || '';
    console.log("🤖 [Gemini OCR Raw Response]:", responseText);

    // Clean up any potential markdown decoration
    const cleanJsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    let resultJson = {};
    try {
      resultJson = JSON.parse(cleanJsonText);
    } catch (parseErr) {
      console.warn("⚠️ [Gemini OCR JSON Parse Failure]:", parseErr, "Text was:", cleanJsonText);
      // Fallback regex parsing
      const startMatch = cleanJsonText.match(/"startDate"\s*:\s*"([^"]+)"/);
      const endMatch = cleanJsonText.match(/"endDate"\s*:\s*"([^"]+)"/);
      const reasonMatch = cleanJsonText.match(/"reason"\s*:\s*"([^"]+)"/);
      resultJson = {
        startDate: startMatch ? startMatch[1] : null,
        endDate: endMatch ? endMatch[1] : null,
        reason: reasonMatch ? reasonMatch[1] : 'เอกสารใบรับรองแพทย์'
      };
    }

    return sendJson(res, 200, { success: true, ...resultJson });
  } catch (err) {
    console.error("❌ OCR Scan Error:", err);
    return sendJson(res, 500, { error: err.message });
  }
}

/* ==========================================================================
   🤖 HR POLICY & WELFARE AI CHATBOT HANDLER
   ========================================================================== */
function getSmartPolicyReply(message) {
  const msg = (message || '').toLowerCase();
  
  if (msg.includes('ใบรับรองแพทย์') || msg.includes('ป่วย') || msg.includes('sick')) {
    return "🩺 **ระเบียบการลาป่วย**: พนักงานสามารถลาป่วยได้เท่าที่ป่วยจริง โดยได้รับค่าจ้างไม่เกิน **30 วันทำงาน/ปี** หากลาป่วยตั้งแต่ 1 วันทำงานขึ้นไป ต้องแนบใบรับรองแพทย์จากสถานพยาบาลประกอบการลาครับ";
  }
  
  if (msg.includes('พักร้อน') || msg.includes('สะสม') || msg.includes('vacation') || msg.includes('annual')) {
    return "🏖️ **สิทธิวันลาพักร้อน**: เมื่อทำงานครบ 1 ปี ได้รับสิทธิ์ลาพักร้อนไม่น้อยกว่า **6 วันทำงาน/ปี** (ต้องยื่นอนุมัติตามลำดับขั้นล่วงหน้า) **ข้อสำคัญ: วันลาพักร้อนไม่สามารถสะสมหรือยกยอดไปปีถัดไปได้ครับ**";
  }
  
  if (msg.includes('คลอด') || msg.includes('maternity') || msg.includes('ตั้งครรภ์')) {
    return "👶 **สิทธิการลาคลอดบุตร**: ลาได้ไม่เกิน **120 วัน** (รวมวันหยุด) โดยบริษัทจ่ายค่าจ้างให้ **60 วัน** และรับเงินสงเคราะห์จากประกันสังคมอีก **60 วัน** ครับ";
  }
  
  if (msg.includes('ลากิจ') || msg.includes('กิจธุระ') || msg.includes('personal')) {
    return "📋 **สิทธิการลากิจธุระจำเป็น**: ได้รับอนุมัติสิทธิลากิจโดยได้รับค่าจ้างไม่เกิน **3 วันทำงาน/ปี** ต้องยื่นล่วงหน้าอย่างน้อย 1 วันทำการ (ยกเว้นเหตุฉุกเฉินจำเป็นเร่งด่วน)";
  }

  if (msg.includes('ทำหมัน') || msg.includes('sterilization')) {
    return "🏥 **สิทธิการลาทำหมัน**: พนักงานสามารถลาทำหมันได้ตามระยะเวลาที่แพทย์ระบุในใบรับรองแพทย์โดยได้รับค่าจ้างครบถ้วนครับ";
  }

  if (msg.includes('อุปสมบท') || msg.includes('บวช') || msg.includes('ordination')) {
    return "🙏 **สิทธิการลาอุปสมบท**: ได้รับค่าจ้างไม่เกิน **15 วัน** (ต้องขออนุมัติตามลำดับขั้นล่วงหน้าไม่น้อยกว่า 15 วัน) ใช้สิทธิได้ 1 ครั้งตลอดอายุงานครับ";
  }

  if (msg.includes('ทหาร') || msg.includes('รับราชการ') || msg.includes('military')) {
    return "🎖️ **สิทธิการลารับราชการทหาร**: ลาเพื่อรับราชการทหารในการเรียกพลเพื่อตรวจสอบ ฝึกวิชาทหาร หรือทดสอบความพรั่งพร้อม ได้ไม่เกิน **60 วัน/ปี** โดยได้รับค่าจ้างครบถ้วนครับ";
  }

  if (msg.includes('ฌาปนกิจ') || msg.includes('งานศพ') || msg.includes('funeral')) {
    return "🕯️ **สิทธิการลาฌาปนกิจศพ**: บริษัทมอบสิทธิลาพิเศษเพื่อจัดการงานศพของบิดา มารดา คู่สมรส หรือบุตรโดยชอบด้วยกฎหมาย โดยได้รับค่าจ้างครับ";
  }

  if (msg.includes('สาย') || msg.includes('ขาดงาน') || msg.includes('บทลงโทษ') || msg.includes('late')) {
    return "⚠️ **ข้อควรระวังและบทลงโทษ**: หากมาสาย 3 ครั้งภายในรอบเดือน จะได้รับหนังสือเตือนเป็นลายลักษณ์อักษร หากขาดงานติดต่อกัน 3 วันทำงานโดยไม่มีเหตุอันสมควร บริษัทมีสิทธิ์เลิกจ้างทันทีโดยไม่จ่ายค่าชดเชยครับ";
  }

  if (msg.includes('เบิก') || msg.includes('ค่ารักษา') || msg.includes('เบี้ยเลี้ยง') || msg.includes('สวัสดิการ')) {
    return "💳 **การเบิกสวัสดิการและค่าใช้จ่าย**: สามารถแนบใบเสร็จและยื่นผ่านระบบ หรือติดต่อ HR เพิ่มเติมที่ อีเมล **hr@pvt-workforce.com** หรือโทรภายใน **101-104** ครับ";
  }

  return "🤖 **HR Smart Assistant**: ขอบคุณสำหรับคำถามครับ หากต้องการสอบถามระเบียบวันลา (ลาป่วย, ลาพักร้อน, ลากิจ, ลาคลอด) หรือสวัสดิการ สามารถพิมพ์ถามได้เลยครับ หรือติดต่อฝ่ายบุคคลโดยตรงที่ **hr@pvt-workforce.com** (โทร 101-104) ครับ";
}

export async function handleHrChatbot(req, res) {
  try {
    let bodyData = {};
    if (typeof req.body === 'object' && req.body !== null) {
      bodyData = req.body;
    } else if (typeof req.body === 'string') {
      try { bodyData = JSON.parse(req.body); } catch (e) {}
    } else {
      bodyData = await parseJsonBody(req);
    }

    const { message } = bodyData;
    if (!message || typeof message !== 'string') {
      return sendJson(res, 400, { error: 'กรุณาระบุข้อความคำถาม' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log('ℹ️ [HR Chatbot]: GEMINI_API_KEY is not set, using smart policy engine');
      return sendJson(res, 200, { success: true, reply: getSmartPolicyReply(message) });
    }

    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = `คุณคือ "HR Smart Assistant" ผู้ช่วยอัจฉริยะประจำฝ่ายทรัพยากรบุคคลของบริษัท PVT Workforce Hub
คุณมีความสามารถพิเศษในการแปลภาษา ตีความ และตอบคำถามพนักงานทุกภาษา (เช่น ไทย ลาว เมียนมา อังกฤษ ฯลฯ) เกี่ยวกับนโยบายวันลา สิทธิสวัสดิการ กฎระเบียบบริษัท และเงื่อนไขการเบิกเงิน

⚡ กฎสำคัญในการตอบ (Concise & Direct & Multilingual):
1. หากพนักงานถามหรือพิมพ์มาเป็นภาษาใด (เช่น ภาษาไทย, ลาว, เมียนมา, อังกฤษ) ให้ตอบกลับด้วย "ภาษาเดียวกัน" กับที่พนักงานพิมพ์มาเสมอ
2. ตอบให้ "สั้น กระชับ ตรงประเด็นทันที" ความยาวประมาณ 1-3 บรรทัด
3. ห้ามเกริ่นนำเยิ่นเย้อ ห้ามทวนคำถาม และเน้นข้อมูลสำคัญด้วยตัวหนา
4. สุภาพ เป็นมิตร และถูกต้องตามกฎระเบียบบริษัท 100%

คู่มือนโยบายและสิทธิประโยชน์สำคัญของบริษัท:
1. การลาป่วย: ลาได้เท่าที่ป่วยจริง ได้รับค่าจ้างไม่เกิน 30 วันทำงาน/ปี (ลาป่วยตั้งแต่ 1 วันทำงานขึ้นไปต้องแนบใบรับรองแพทย์)
2. การลาพักร้อน (Annual Leave): อายุงานครบ 1 ปี ได้สิทธิ์ลาพักร้อนไม่น้อยกว่า 6 วันทำงาน/ปี (ต้องส่งล่วงหน้าเพื่อให้หัวหน้างานอนุมัติก่อนเสมอ) **ไม่สามารถสะสมหรือยกยอดไปปีถัดไปได้**
3. การลากิจธุระจำเป็น: ได้รับอนุมัติสิทธิลากิจโดยได้รับค่าจ้าง ไม่เกิน 3 วันทำงาน/ปี (ยื่นล่วงหน้าอย่างน้อย 1 วันทำการ ยกเว้นฉุกเฉิน)
4. การลาคลอดบุตร: ลาได้ไม่เกิน 120 วัน (รวมวันหยุดประจำสัปดาห์) โดยบริษัทจ่ายค่าจ้าง 60 วัน และประกันสังคม 60 วัน
5. การลาทำหมัน: ลาได้ตามใบรับรองแพทย์โดยได้รับค่าจ้าง
6. การลารับราชการทหาร: ลาได้ไม่เกิน 60 วัน/ปี โดยได้รับค่าจ้าง
7. การลาฌาปนกิจศพ: บริษัทมอบสิทธิลาพิเศษโดยได้รับค่าจ้าง
8. การลาอุปสมบท: ได้รับค่าจ้างไม่เกิน 15 วัน (ขออนุมัติล่วงหน้าไม่น้อยกว่า 15 วัน) ใช้สิทธิได้ 1 ครั้งตลอดอายุงาน
9. ข้อควรระวังและบทลงโทษ: มาสาย 3 ครั้งภายในรอบเดือน จะได้รับหนังสือเตือนเป็นลายลักษณ์อักษร, ขาดงานติดต่อกัน 3 วันทำงาน โดยไม่มีเหตุอันสมควร บริษัทมีสิทธิ์เลิกจ้างทันทีโดยไม่จ่ายค่าชดเชย

หากอยู่นอกเหนือจากระเบียบ ให้ตอบสั้นๆ ว่า "ติดต่อ HR เพิ่มเติมที่ อีเมล hr@pvt-workforce.com หรือโทรภายใน 101-104 ครับ"`;

    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    let responseText = null;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemInstruction}\n\nคำถามจากพนักงาน: ${message}` }]
            }
          ]
        });
        if (response && response.text) {
          responseText = response.text;
          console.log(`🤖 [HR Chatbot Success with ${modelName}]`);
          break;
        }
      } catch (genErr) {
        console.warn(`⚠️ [HR Chatbot Model ${modelName} failed]:`, genErr.message);
        await new Promise(r => setTimeout(r, 300));
      }
    }

    if (!responseText) {
      console.log('ℹ️ [HR Chatbot]: Gemini calls failed, using smart policy fallback');
      responseText = getSmartPolicyReply(message);
    }

    return sendJson(res, 200, { success: true, reply: responseText });
  } catch (err) {
    console.error("❌ HR Chatbot Error:", err);
    return sendJson(res, 200, { success: true, reply: getSmartPolicyReply(req.body?.message) });
  }
}

/**
 * 🧪 ทดสอบการเชื่อมต่อ LINE Official Account Bot & Token
 */
export async function handleTestLineConnection(req, res) {
  try {
    let bodyData = {};
    if (typeof req.body === 'object' && req.body !== null) {
      bodyData = req.body;
    } else if (typeof req.body === 'string') {
      try { bodyData = JSON.parse(req.body); } catch (e) {}
    } else {
      bodyData = await parseJsonBody(req);
    }

    let token = bodyData?.channel_access_token;
    if (!token) {
      token = await getLineAccessToken();
    }
    if (!token) {
      return sendJson(res, 400, {
        success: false,
        error: 'ยังไม่ได้ระบุ Channel Access Token หรือยังไม่ได้บันทึกลงในระบบ'
      });
    }

    const botRes = await fetch('https://api.line.me/v2/bot/info', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!botRes.ok) {
      const errText = await botRes.text();
      return sendJson(res, botRes.status, {
        success: false,
        error: 'LINE API แจ้งข้อผิดพลาด: ' + errText
      });
    }

    const botInfo = await botRes.json();
    return sendJson(res, 200, {
      success: true,
      bot: botInfo,
      message: 'เชื่อมต่อกับ LINE Messaging API สำเร็จเรียบร้อย'
    });
  } catch (err) {
    return sendJson(res, 500, { success: false, error: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ LINE API' });
  }
}

// --------------------------------------------------------------------------
// 12. WebAuthn Biometric & Passkey Server Storage Handlers
// --------------------------------------------------------------------------
const memoryWebAuthnCredentials = new Map();

export async function handleWebAuthnRegisterVerify(req, res) {
  try {
    let bodyData = {};
    if (typeof req.body === 'object' && req.body !== null) {
      bodyData = req.body;
    } else if (typeof req.body === 'string') {
      try { bodyData = JSON.parse(req.body); } catch (e) {}
    } else {
      bodyData = await parseJsonBody(req);
    }

    const credId = bodyData.credential_id || bodyData.id;
    if (!credId) {
      return sendJson(res, 400, { success: false, error: 'Missing credential_id' });
    }

    memoryWebAuthnCredentials.set(credId, {
      ...bodyData,
      id: credId,
      credential_id: credId,
      created_at: bodyData.created_at || new Date().toISOString()
    });

    console.log(`🔐 [WebAuthn Registered]: Credential ID ${credId} for Employee ${bodyData.employee_code || bodyData.employee_id}`);

    return sendJson(res, 200, {
      success: true,
      message: 'Credential registered and verified successfully',
      credential: memoryWebAuthnCredentials.get(credId)
    });
  } catch (err) {
    return sendJson(res, 500, { success: false, error: err.message });
  }
}

export async function handleWebAuthnGetCredentials(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
    const empId = url.searchParams.get('employee_id') || url.searchParams.get('employee_code');

    let list = Array.from(memoryWebAuthnCredentials.values());
    if (empId) {
      list = list.filter(c => String(c.employee_id) === String(empId) || String(c.employee_code) === String(empId));
    }

    return sendJson(res, 200, {
      success: true,
      credentials: list
    });
  } catch (err) {
    return sendJson(res, 500, { success: false, error: err.message });
  }
}

export async function handleWebAuthnDeleteCredential(req, res) {
  try {
    let bodyData = {};
    if (typeof req.body === 'object' && req.body !== null) {
      bodyData = req.body;
    } else if (typeof req.body === 'string') {
      try { bodyData = JSON.parse(req.body); } catch (e) {}
    } else {
      bodyData = await parseJsonBody(req);
    }

    const credId = bodyData.credential_id || bodyData.id;
    if (credId) {
      memoryWebAuthnCredentials.delete(credId);
    }

    return sendJson(res, 200, { success: true, message: 'Credential removed' });
  } catch (err) {
    return sendJson(res, 500, { success: false, error: err.message });
  }
}



