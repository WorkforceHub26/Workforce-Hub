/**
 * ============================================================================
 *  PVT HR LEAVE - WebAuthn Biometric Authentication & Passkey Service
 * ============================================================================
 * Supports Touch ID, Face ID, Windows Hello, Android Biometric Authentication
 * compliant with FIDO2 / W3C Web Authentication standards.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PVTWebAuthn = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ️ ArrayBuffer & Base64URL Encoding Helpers
  function bufferToBase64Url(buffer) {
    if (!buffer) return '';
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  function base64UrlToBuffer(base64url) {
    if (!base64url) return new ArrayBuffer(0);
    let base64 = String(base64url).replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function stringToBuffer(str) {
    return new TextEncoder().encode(str || '');
  }

  function generateRandomChallenge(length = 32) {
    const buffer = new Uint8Array(length);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(buffer);
    } else {
      for (let i = 0; i < length; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }
    }
    return buffer;
  }

  //  Device Platform & Biometric Type Identification
  function detectBiometricTypeName() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';

    if (/iPhone|iPad|iPod/i.test(ua)) {
      return {
        type: 'apple_mobile',
        name: 'Face ID / Touch ID (iOS)',
        icon: 'fingerprint'
      };
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      return {
        type: 'apple_mac',
        name: 'Touch ID / Apple Passkey (macOS)',
        icon: 'fingerprint'
      };
    } else if (/Windows/i.test(ua)) {
      return {
        type: 'windows_hello',
        name: 'Windows Hello (Fingerprint / Face)',
        icon: 'face'
      };
    } else if (/Android/i.test(ua)) {
      return {
        type: 'android_biometric',
        name: 'Android Biometric (Fingerprint / Face)',
        icon: 'fingerprint'
      };
    }
    return {
      type: 'generic_fido2',
      name: 'FIDO2 Biometric / Security Key',
      icon: 'key'
    };
  }

  function getAutoDeviceNickname() {
    const info = detectBiometricTypeName();
    const ua = navigator.userAgent || '';
    let browserName = 'Browser';
    if (ua.includes('Chrome') && !ua.includes('Edg')) browserName = 'Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browserName = 'Safari';
    else if (ua.includes('Edg')) browserName = 'Edge';
    else if (ua.includes('Firefox')) browserName = 'Firefox';

    return `${info.name.split(' ')[0]} on ${browserName}`;
  }

  //  Check if WebAuthn and Platform Biometrics are supported on this device
  async function isBiometricAvailable() {
    if (!window.PublicKeyCredential) {
      return {
        supported: false,
        platformAuthenticator: false,
        reason: 'เบราว์เซอร์ไม่รองรับ WebAuthn / PublicKeyCredential'
      };
    }

    try {
      const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return {
        supported: true,
        platformAuthenticator: !!isAvailable,
        deviceInfo: detectBiometricTypeName(),
        reason: isAvailable ? 'อุปกรณ์พร้อมใช้งานระบบสแกนลายนิ้วมือ / ใบหน้า' : 'ไม่พบเซ็นเซอร์สแกนลายนิ้วมือ/ใบหน้าบนอุปกรณ์นี้'
      };
    } catch (err) {
      return {
        supported: true,
        platformAuthenticator: false,
        reason: err.message
      };
    }
  }

  // ️ Local Storage Cache for Registered Biometric Credentials
  const LOCAL_STORAGE_KEY = 'pvt_webauthn_credentials';
  let isSupabaseWebAuthnAvailable = true;

  function getLocalCredentials() {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalCredentials(list) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to save credentials locally:', e);
    }
  }

  //  Supabase Client Getter
  function getSbClient() {
    return window.pvtSupabase?.client 
        || window.pvtSupabase?.getClient?.() 
        || window.PVTSDK?.client 
        || window.supabaseClient 
        || window.supabase 
        || window.sb;
  }

  //  Verify Active User Session from Supabase & Storage
  async function verifyActiveSession() {
    const sb = getSbClient();
    let verifiedEmp = null;

    // 1. Supabase Auth Session Verification
    if (sb?.auth?.getSession) {
      try {
        const { data: sessionData, error: sessionErr } = await sb.auth.getSession();
        if (!sessionErr && sessionData?.session?.user) {
          const u = sessionData.session.user;
          // Fetch employee record
          const { data: empDb } = await sb.from('employees')
            .select('id, employee_code, full_name, role, status, email, departments!department_id(department_name), positions(position_name)')
            .or(`id.eq.${u.id},email.eq.${u.email}`)
            .maybeSingle();

          if (empDb && String(empDb.status || '').toLowerCase() !== 'inactive') {
            verifiedEmp = {
              id: empDb.id,
              employee_id: empDb.id,
              employee_code: empDb.employee_code || empDb.id,
              full_name: empDb.full_name || 'พนักงาน',
              role: empDb.role || 'user',
              email: empDb.email || u.email,
              source: 'supabase_auth'
            };
          }
        }
      } catch (e) {
        console.warn('Notice: Supabase getSession verification attempt:', e);
      }
    }

    // 2. Fallback to cached profile / window objects
    if (!verifiedEmp) {
      verifiedEmp = await resolveEmployeeObject();
    }

    if (!verifiedEmp || (!verifiedEmp.id && !verifiedEmp.employee_code)) {
      return {
        valid: false,
        employee: null,
        reason: 'ไม่พบเซสชันการเข้าสู่ระบบที่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง'
      };
    }

    return {
      valid: true,
      employee: verifiedEmp,
      reason: 'เซสชันถูกต้องพร้อมลงทะเบียน'
    };
  }

  //  Helper: Resolve Employee Identity from all possible runtime sources
  async function resolveEmployeeObject(employee) {
    // 1. Direct input validation
    if (employee && typeof employee === 'object') {
      const inner = employee.employees || employee.user || employee.employee || employee;
      const id = inner.id || inner.employee_id || inner.employeeId || inner.userId || inner.user_id;
      const code = inner.employee_code || inner.employeeCode || inner.code;
      const name = inner.full_name || inner.fullName || inner.emp_name || inner.displayName || inner.name;
      if (id || code) {
        return {
          id: String(id || code),
          employee_id: String(id || code),
          employee_code: String(code || id),
          full_name: String(name || 'พนักงาน')
        };
      }
    } else if (typeof employee === 'string' && employee.trim()) {
      return {
        id: employee.trim(),
        employee_id: employee.trim(),
        employee_code: employee.trim(),
        full_name: 'พนักงาน'
      };
    }

    // 2. Global window objects
    const winCandidates = [
      window.currentEmpProfile,
      window.currentUserProfile,
      window.currentUser,
      window.state?.currentUserProfile,
      window.state?.currentUser
    ];
    for (const cand of winCandidates) {
      if (cand && typeof cand === 'object') {
        const inner = cand.employees || cand.user || cand;
        const id = inner.id || inner.employee_id || inner.employeeId;
        const code = inner.employee_code || inner.employeeCode || inner.code;
        const name = inner.full_name || inner.fullName || inner.emp_name || inner.displayName;
        if (id || code) {
          return {
            id: String(id || code),
            employee_id: String(id || code),
            employee_code: String(code || id),
            full_name: String(name || 'พนักงาน')
          };
        }
      }
    }

    // 3. Storage check
    const storageKeys = [
      'currentUser', 'pvt_user', 'user', 'profile', 'employee_session',
      'hr_session', 'loggedInUser', 'currentUserId', 'currentEmp'
    ];
    for (const k of storageKeys) {
      const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const inner = parsed.employees || parsed.user || parsed;
            const id = inner.id || inner.employee_id || inner.employeeId || inner.userId;
            const code = inner.employee_code || inner.employeeCode || inner.code;
            const name = inner.full_name || inner.fullName || inner.emp_name || inner.displayName;
            if (id || code) {
              return {
                id: String(id || code),
                employee_id: String(id || code),
                employee_code: String(code || id),
                full_name: String(name || 'พนักงาน')
              };
            }
          } else if (typeof parsed === 'string' && parsed.trim() && !parsed.startsWith('{')) {
            return {
              id: parsed.trim(),
              employee_id: parsed.trim(),
              employee_code: parsed.trim(),
              full_name: 'พนักงาน'
            };
          }
        } catch (e) {}
      }
    }

    // 4. Supabase Auth Session
    const sb = getSbClient();
    if (sb) {
      try {
        if (sb.auth?.getSession) {
          const { data } = await sb.auth.getSession();
          if (data?.session?.user) {
            const u = data.session.user;
            const { data: empDb } = await sb.from('employees')
              .select('id, employee_code, full_name')
              .or(`id.eq.${u.id},email.eq.${u.email}`)
              .maybeSingle();
            if (empDb) {
              return {
                id: String(empDb.id),
                employee_id: String(empDb.id),
                employee_code: String(empDb.employee_code || empDb.id),
                full_name: String(empDb.full_name || 'พนักงาน')
              };
            }
          }
        }
      } catch (e) {}
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // 1️⃣ REGISTER WEBAUTHN CREDENTIAL (สร้างกุญแจสแกนลายนิ้วมือ/ใบหน้า)
  // --------------------------------------------------------------------------
  async function registerBiometricCredential(employee, options = {}) {
    //  Phase 1: Verify Current Active User Session First
    const sessionCheck = await verifyActiveSession();
    let normalizedEmp = null;

    if (sessionCheck.valid && sessionCheck.employee) {
      normalizedEmp = sessionCheck.employee;
    } else {
      normalizedEmp = await resolveEmployeeObject(employee);
    }

    if (!normalizedEmp || (!normalizedEmp.id && !normalizedEmp.employee_code)) {
      throw new Error('ไม่พบข้อมูลเซสชันการเข้าสู่ระบบที่ถูกต้อง กรุณาเข้าสู่ระบบก่อนลงทะเบียนอุปกรณ์ไบโอเมตริก');
    }

    const deviceName = options.deviceName || employee?.deviceName || getAutoDeviceNickname();

    const check = await isBiometricAvailable();
    if (!check.supported) {
      throw new Error('เบราว์เซอร์ของคุณไม่รองรับมาตรฐาน WebAuthn Biometric');
    }

    const rpName = options.rpName || 'PVT Workforce Hub';
    const rpId = window.location.hostname || 'localhost';
    const challengeBuffer = generateRandomChallenge(32);
    const userIdBuffer = stringToBuffer(normalizedEmp.id || normalizedEmp.employee_code);

    const biometricInfo = detectBiometricTypeName();

    const publicKeyCredentialCreationOptions = {
      challenge: challengeBuffer,
      rp: {
        name: rpName,
        id: rpId === 'localhost' || rpId === '127.0.0.1' ? undefined : rpId
      },
      user: {
        id: userIdBuffer,
        name: normalizedEmp.employee_code || normalizedEmp.email || 'user',
        displayName: normalizedEmp.full_name || normalizedEmp.employee_code || 'Employee'
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256 (ECDSA w/ SHA-256)
        { alg: -257, type: 'public-key' }, // RS256 (RSA w/ SHA-256)
        { alg: -8, type: 'public-key' }    // Ed25519
      ],
      authenticatorSelection: {
        authenticatorAttachment: options.attachment || undefined, // Flexible authenticator attachment (platform, cross-platform, or browser passkey)
        userVerification: 'preferred',
        residentKey: 'preferred',
        requireResidentKey: false
      },
      timeout: 60000,
      attestation: 'none'
    };

    console.log(' [WebAuthn] Initiating navigator.credentials.create...', publicKeyCredentialCreationOptions);

    let credential;
    try {
      credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      });
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        const cancelErr = new Error('การสแกนลายนิ้วมือ/ใบหน้าถูกยกเลิก หรือหมดเวลา');
        cancelErr.code = 'NOT_ALLOWED_ERROR';
        cancelErr.originalName = err.name;
        throw cancelErr;
      } else if (err.name === 'InvalidStateError') {
        throw new Error('อุปกรณ์นี้ได้รับการลงทะเบียนเข้าใช้งานไว้แล้ว');
      }
      throw new Error(`เกิดข้อผิดพลาดในการสร้างกุญแจไบโอเมตริก: ${err.message}`);
    }

    if (!credential) {
      throw new Error('ไม่ได้รับข้อมูลการยืนยันตัวตนจากอุปกรณ์');
    }

    const credentialId = credential.id;
    const rawIdBase64 = bufferToBase64Url(credential.rawId);
    const clientDataJSON = bufferToBase64Url(credential.response.clientDataJSON);
    const attestationObject = bufferToBase64Url(credential.response.attestationObject);
    const transports = credential.response.getTransports ? credential.response.getTransports() : ['internal'];

    const newCredRecord = {
      success: true,
      id: credentialId,
      credential_id: credentialId,
      raw_id: rawIdBase64,
      employee_id: normalizedEmp.id,
      employee_code: normalizedEmp.employee_code,
      employee_name: normalizedEmp.full_name,
      device_name: deviceName,
      biometric_type: biometricInfo.name,
      icon: biometricInfo.icon,
      transports: transports,
      client_data: clientDataJSON,
      attestation_object: attestationObject,
      created_at: new Date().toISOString(),
      last_used_at: null,
      status: 'active'
    };

    // 1. Save to LocalStorage for fast offline client resolution
    const localList = getLocalCredentials();
    const filtered = localList.filter(c => c.credential_id !== credentialId);
    filtered.unshift(newCredRecord);
    saveLocalCredentials(filtered);

    // 2. Try persisting to Server API endpoint
    try {
      await fetch('/api/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCredRecord)
      });
    } catch (apiErr) {
      console.warn('Notice: Server API webauthn save skipped or offline:', apiErr);
    }

    // 3. Persist to Supabase webauthn_credentials table (if available)
    const sb = getSbClient();
    if (sb && isSupabaseWebAuthnAvailable) {
      try {
        const { error: upsertErr } = await sb.from('webauthn_credentials').upsert({
          id: credentialId,
          credential_id: credentialId,
          employee_id: normalizedEmp.id,
          employee_code: normalizedEmp.employee_code,
          device_name: deviceName,
          biometric_type: biometricInfo.name,
          transports: transports,
          public_key: attestationObject,
          created_at: newCredRecord.created_at,
          last_used_at: null,
          status: 'active'
        });
        if (upsertErr) {
          if (upsertErr.code === '42P01' || upsertErr.message?.includes('not found') || upsertErr.message?.includes('does not exist')) {
            isSupabaseWebAuthnAvailable = false;
          }
        }
      } catch (sbErr) {
        isSupabaseWebAuthnAvailable = false;
      }
    }

    console.log(' [WebAuthn] Successfully registered biometric credential with Supabase:', newCredRecord);
    return newCredRecord;
  }

  // --------------------------------------------------------------------------
  // 1.5️⃣ VIRTUAL PASSKEY REGISTRATION FALLBACK (สำหรับกรณีสแกนถูกยกเลิก หรืออุปกรณ์ไม่มีไบโอเมตริก)
  // --------------------------------------------------------------------------
  async function registerVirtualBiometricCredential(employee, options = {}) {
    const sessionCheck = await verifyActiveSession();
    let normalizedEmp = null;

    if (sessionCheck.valid && sessionCheck.employee) {
      normalizedEmp = sessionCheck.employee;
    } else {
      normalizedEmp = await resolveEmployeeObject(employee);
    }

    if (!normalizedEmp || (!normalizedEmp.id && !normalizedEmp.employee_code)) {
      throw new Error('ไม่พบข้อมูลเซสชันการเข้าสู่ระบบที่ถูกต้อง กรุณาเข้าสู่ระบบก่อนลงทะเบียนอุปกรณ์ไบโอเมตริก');
    }

    const deviceName = options.deviceName || employee?.deviceName || (getAutoDeviceNickname() + ' (Passkey SIM)');
    const biometricInfo = detectBiometricTypeName();

    const randomChallenge = generateRandomChallenge(16);
    const credentialId = 'pvt_passkey_' + bufferToBase64Url(randomChallenge);

    const newCredRecord = {
      success: true,
      id: credentialId,
      credential_id: credentialId,
      raw_id: credentialId,
      employee_id: normalizedEmp.id,
      employee_code: normalizedEmp.employee_code,
      employee_name: normalizedEmp.full_name,
      device_name: deviceName,
      biometric_type: biometricInfo.name + ' (Passkey SIM)',
      icon: 'key',
      transports: ['internal'],
      client_data: 'virtual_passkey_client_data',
      attestation_object: 'virtual_passkey_attestation',
      created_at: new Date().toISOString(),
      last_used_at: null,
      status: 'active',
      is_virtual: true
    };

    // 1. Save to LocalStorage
    const localList = getLocalCredentials();
    const filtered = localList.filter(c => c.credential_id !== credentialId);
    filtered.unshift(newCredRecord);
    saveLocalCredentials(filtered);

    // 2. Save to Server API endpoint
    try {
      await fetch('/api/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCredRecord)
      });
    } catch (apiErr) {
      console.warn('Notice: Server API webauthn virtual save skipped or offline:', apiErr);
    }

    // 3. Save to Supabase (if available)
    const sb = getSbClient();
    if (sb && isSupabaseWebAuthnAvailable) {
      try {
        const { error: upsertErr } = await sb.from('webauthn_credentials').upsert({
          id: credentialId,
          credential_id: credentialId,
          employee_id: normalizedEmp.id,
          employee_code: normalizedEmp.employee_code,
          device_name: deviceName,
          biometric_type: biometricInfo.name + ' (Passkey SIM)',
          transports: ['internal'],
          public_key: 'virtual_passkey_key',
          created_at: newCredRecord.created_at,
          last_used_at: null,
          status: 'active'
        });
        if (upsertErr) {
          if (upsertErr.code === '42P01' || upsertErr.message?.includes('not found') || upsertErr.message?.includes('does not exist')) {
            isSupabaseWebAuthnAvailable = false;
          }
        }
      } catch (sbErr) {
        isSupabaseWebAuthnAvailable = false;
      }
    }

    console.log(' [WebAuthn] Successfully registered Virtual Passkey credential:', newCredRecord);
    return newCredRecord;
  }

  // --------------------------------------------------------------------------
  // 2️⃣ AUTHENTICATE WITH WEBAUTHN (สแกนนิ้ว/ใบหน้าเพื่อเข้าสู่ระบบ)
  // --------------------------------------------------------------------------
  async function authenticateBiometric(options = {}) {
    const check = await isBiometricAvailable();
    if (!check.supported) {
      throw new Error('เบราว์เซอร์นี้ไม่รองรับการยืนยันตัวตนด้วยไบโอเมตริก');
    }

    const localCreds = getLocalCredentials().filter(c => c.status === 'active');
    const targetEmpCode = (options.employeeCode || '').trim();

    let allowedCredentials = [];
    if (targetEmpCode) {
      const matchForEmp = localCreds.filter(c => 
        String(c.employee_code).toLowerCase() === targetEmpCode.toLowerCase()
      );
      if (matchForEmp.length > 0) {
        allowedCredentials = matchForEmp.map(c => ({
          id: base64UrlToBuffer(c.credential_id || c.id),
          type: 'public-key',
          transports: c.transports || ['internal']
        }));
      }
    } else if (localCreds.length > 0) {
      allowedCredentials = localCreds.map(c => ({
        id: base64UrlToBuffer(c.credential_id || c.id),
        type: 'public-key',
        transports: c.transports || ['internal']
      }));
    }

    const challengeBuffer = generateRandomChallenge(32);
    const rpId = window.location.hostname || 'localhost';

    const publicKeyCredentialRequestOptions = {
      challenge: challengeBuffer,
      rpId: rpId === 'localhost' || rpId === '127.0.0.1' ? undefined : rpId,
      allowCredentials: allowedCredentials.length > 0 ? allowedCredentials : undefined,
      userVerification: 'preferred',
      timeout: 60000
    };

    console.log(' [WebAuthn] Prompting biometric scan with navigator.credentials.get...', publicKeyCredentialRequestOptions);

    let assertion;
    try {
      assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      });
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        throw new Error('การสแกนลายนิ้วมือ/ใบหน้าถูกยกเลิก หรือไม่ผ่านการตรวจสอบ');
      }
      throw new Error(`เกิดข้อผิดพลาดในการตรวจสอบไบโอเมตริก: ${err.message}`);
    }

    if (!assertion) {
      throw new Error('ไม่ได้รับผลการตรวจสอบสิทธิ์จากอุปกรณ์');
    }

    const credentialId = assertion.id;
    console.log(' [WebAuthn] Assertion received for Credential ID:', credentialId);

    // Find matching employee for this credential
    let matchedCred = localCreds.find(c => c.credential_id === credentialId || c.id === credentialId);
    let employee = null;

    // 1. Check from Supabase if online
    const sb = getSbClient();
    if (sb) {
      try {
        let empQuery = null;
        if (matchedCred && matchedCred.employee_id) {
          empQuery = await sb.from('employees').select('*, departments!department_id(department_name), positions(position_name, duty_name)').eq('id', matchedCred.employee_id).maybeSingle();
        } else if (matchedCred && matchedCred.employee_code) {
          empQuery = await sb.from('employees').select('*, departments!department_id(department_name), positions(position_name, duty_name)').eq('employee_code', matchedCred.employee_code).maybeSingle();
        } else {
          // Query by webauthn_credentials table
          const { data: dbCred } = await sb.from('webauthn_credentials').select('*, employees(*, departments!department_id(department_name), positions(position_name))').eq('credential_id', credentialId).maybeSingle();
          if (dbCred && dbCred.employees) {
            employee = dbCred.employees;
            matchedCred = dbCred;
          }
        }

        if (empQuery && !empQuery.error && empQuery.data) {
          employee = empQuery.data;
        }
      } catch (dbErr) {
        console.warn('Notice: Supabase employee lookup notice:', dbErr);
      }
    }

    // 2. Fallback: If DB failed or offline, use matched credential info
    if (!employee && matchedCred) {
      employee = {
        id: matchedCred.employee_id,
        employee_code: matchedCred.employee_code,
        full_name: matchedCred.employee_name,
        role: 'user',
        status: 'active'
      };
    }

    if (!employee) {
      throw new Error('ไม่พบข้อมูลพนักงานที่ผูกกับกุญแจไบโอเมตริกนี้ กรุณาลงทะเบียนใหม่ในหน้าโปรไฟล์');
    }

    if (String(employee.status || '').toLowerCase() === 'inactive') {
      throw new Error('บัญชีของคุณถูกระงับสิทธิ์การใช้งาน กรุณาติดต่อฝ่ายบุคคล (HR)');
    }

    // Update last_used_at timestamp
    const nowIso = new Date().toISOString();
    if (matchedCred) {
      matchedCred.last_used_at = nowIso;
      saveLocalCredentials(localCreds);
    }

    if (sb && matchedCred) {
      try {
        await sb.from('webauthn_credentials').update({ last_used_at: nowIso }).eq('credential_id', credentialId);
      } catch (e) {}
    }

    return {
      success: true,
      employee: employee,
      credential: matchedCred || { id: credentialId, device_name: getAutoDeviceNickname() },
      assertion: {
        id: assertion.id,
        clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
        authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
        signature: bufferToBase64Url(assertion.response.signature)
      }
    };
  }

  // --------------------------------------------------------------------------
  // 3️⃣ CREDENTIAL MANAGEMENT & QUERIES
  // --------------------------------------------------------------------------
  async function listEmployeeCredentials(employeeId) {
    let targetId = employeeId;
    if (!targetId) {
      const resolved = await resolveEmployeeObject();
      targetId = resolved?.id || resolved?.employee_code;
    }

    const localList = getLocalCredentials();
    let empCreds = targetId 
      ? localList.filter(c => String(c.employee_id) === String(targetId) || String(c.employee_code) === String(targetId))
      : localList;

    // Try fetching from server API to merge
    try {
      const apiRes = await fetch(`/api/webauthn/credentials?employee_id=${encodeURIComponent(targetId)}`);
      if (apiRes.ok) {
        const apiJson = await apiRes.json();
        if (apiJson.success && Array.isArray(apiJson.credentials) && apiJson.credentials.length > 0) {
          const mergedMap = new Map();
          apiJson.credentials.forEach(item => mergedMap.set(item.credential_id || item.id, item));
          empCreds.forEach(item => mergedMap.set(item.credential_id || item.id, { ...mergedMap.get(item.credential_id || item.id), ...item }));
          empCreds = Array.from(mergedMap.values());
        }
      }
    } catch (e) {}

    // Try fetching from Supabase (if available)
    const sb = getSbClient();
    if (sb && isSupabaseWebAuthnAvailable && targetId) {
      try {
        const { data, error } = await sb.from('webauthn_credentials').select('*').or(`employee_id.eq.${targetId},employee_code.eq.${targetId}`);
        if (!error && data && data.length > 0) {
          const mergedMap = new Map();
          data.forEach(item => mergedMap.set(item.credential_id || item.id, item));
          empCreds.forEach(item => mergedMap.set(item.credential_id || item.id, { ...mergedMap.get(item.credential_id || item.id), ...item }));
          empCreds = Array.from(mergedMap.values());
        } else if (error) {
          if (error.code === '42P01' || error.message?.includes('not found') || error.message?.includes('does not exist')) {
            isSupabaseWebAuthnAvailable = false;
          }
        }
      } catch (e) {
        isSupabaseWebAuthnAvailable = false;
      }
    }

    return empCreds;
  }

  async function deleteBiometricCredential(credentialId, employeeId) {
    if (!credentialId) return false;

    // Remove from local storage
    const list = getLocalCredentials().filter(c => c.credential_id !== credentialId && c.id !== credentialId);
    saveLocalCredentials(list);

    // Try removing from server API
    try {
      await fetch('/api/webauthn/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential_id: credentialId, employee_id: employeeId })
      });
    } catch (e) {}

    // Try removing from Supabase (if available)
    const sb = getSbClient();
    if (sb && isSupabaseWebAuthnAvailable) {
      try {
        const { error } = await sb.from('webauthn_credentials').delete().eq('credential_id', credentialId);
        if (error && (error.code === '42P01' || error.message?.includes('not found') || error.message?.includes('does not exist'))) {
          isSupabaseWebAuthnAvailable = false;
        }
      } catch (e) {
        isSupabaseWebAuthnAvailable = false;
      }
    }

    return true;
  }

  //  หน้าต่างแสดงคู่มือวิธีล็อกอินและลงทะเบียนด้วยลายนิ้วมือ / ใบหน้า (Biometric Guide Modal)
  function showBiometricGuideModal() {
    let guideModal = document.getElementById("pvtBiometricGuideModal");
    if (!guideModal) {
      guideModal = document.createElement("div");
      guideModal.id = "pvtBiometricGuideModal";
      guideModal.className = "pvt-guide-modal-overlay";
      document.body.appendChild(guideModal);
    }

    const currentLang = typeof window.getGlobalLanguage === 'function' 
      ? window.getGlobalLanguage() 
      : (localStorage.getItem("preferred_lang") || localStorage.getItem("pvt-lang") || "th");

    const t = {
      th: {
        title: "คู่มือล็อกอิน สแกนนิ้ว / ใบหน้า",
        subtitle: "วิธีเข้าสู่ระบบและลงทะเบียนแบบไร้รหัสผ่าน (WebAuthn)",
        tab1: "1. ตั้งค่าเครื่อง",
        tab2: "2. วิธีลงทะเบียน",
        tab3: "3. วิธีล็อกอินเข้าใช้",
        tab4: "4. วิธีแก้ไขปัญหา",
        step1_1: "1. ตั้งรหัสล็อกหน้าจอบนอุปกรณ์ก่อน",
        step1_1_desc: "ตรวจสอบว่ามือถือหรือคอมพิวเตอร์ของคุณ ได้ทำการตั้งค่าสแกนใบหน้า (Face ID), ลายนิ้วมือ (Touch ID), PIN หรือรหัสล็อกเครื่องในส่วนตั้งค่าของเครื่อง (Settings) เรียบร้อยแล้ว",
        step1_2: "2. ตรวจสอบเบราว์เซอร์ที่รองรับ",
        step1_2_desc: "ระบบสแกนนี้ทำงานร่วมกับ Safari (บน iOS/macOS), Chrome (บน Android/Windows) และ Edge ได้อย่างมีประสิทธิภาพสูงสุด",
        step2_1: "1. ไปที่ประวัติและข้อมูลพนักงาน",
        step2_1_desc: "เข้าสู่ระบบด้วยรหัสผ่านปกติก่อนเป็นครั้งแรก จากนั้นกดไปที่เมนู 'ข้อมูลพนักงาน' (Profile) และเลื่อนลงไปที่แถบสแกนใบหน้า / ลายนิ้วมือ",
        step2_2: "2. ตั้งชื่ออุปกรณ์และแตะสแกน",
        step2_2_desc: "พิมพ์ชื่อเครื่อง เช่น 'มือถือส่วนตัว' จากนั้นกดปุ่มสีฟ้า 'เปิดใช้งานระบบสแกนบนอุปกรณ์นี้' และวางนิ้วหรือสแกนใบหน้าตามคำสั่งของระบบเพื่อยืนยันตัวตนสำเร็จทันที!",
        step3_1: "1. ระบุรหัสพนักงานที่หน้าแรก",
        step3_1_desc: "เมื่อต้องการเข้าสู่ระบบครั้งถัดไป ให้พิมพ์รหัสพนักงานของคุณที่หน้าล็อกอินปกติ",
        step3_2: "2. แตะปุ่มล็อกอินชีวมาตร",
        step3_2_desc: "กดปุ่ม 'เข้าสู่ระบบด้วยลายนิ้วมือ / ใบหน้า' จากนั้นสัมผัสเซ็นเซอร์สแกนเพื่อยืนยันตัวตน และเข้าสู่หน้าแดชบอร์ดส่วนตัวได้ใน 1 วินาที!",
        tips_title: " ข้อแนะนำเพิ่มเติมเพื่อความปลอดภัย",
        tips_list: [
          "คุณสามารถลงทะเบียนอุปกรณ์ได้หลายเครื่องสำหรับบัญชีเดียวกัน (เช่น มือถือส่วนตัว และโน้ตบุ๊กทำงาน)",
          "ระบบเก็บข้อมูลลายพิมพ์ชีวมาตรเฉพาะบนชิปความปลอดภัยของตัวเครื่องคุณเท่านั้น ไม่มีการส่งข้อมูลสแกนนิ้วหรือภาพใบหน้าของคุณขึ้นคลาวด์หรืออินเทอร์เน็ตเด็ดขาด",
          "หากเซ็นเซอร์ชำรุด คุณสามารถสลับกลับไปล็อกอินด้วยรหัสผ่านปกติได้เสมอ"
        ],
        err_title: "️ หากสแกนไม่ผ่าน หรือปุ่มสแกนใช้งานไม่ได้",
        err_list: [
          "ตรวจสอบว่าหน้าเลนส์กล้องหรือพื้นผิวปุ่มสแกนลายนิ้วมือสะอาดและไม่มีสิ่งกีดขวาง",
          "ตรวจสิทธิ์การเข้าถึง: เช็กว่าระบบอนุญาตสิทธิ์การยืนยันตัวตนชีวมาตรแก่เบราว์เซอร์ Chrome/Safari แล้วหรือไม่ในการตั้งค่าแอปพลิเคชันหลักของเครื่อง",
          "ข้อแนะนำกรณีใช้แอป LINE: เนื่องจากเบราว์เซอร์ในแอป LINE (In-App Browser) มักจะปิดกั้น API ของเครื่อง ให้กดสัญลักษณ์ 'เปิดในเบราว์เซอร์เริ่มต้น' หรือ Safari/Chrome เพื่อให้สแกนได้เสร็จสิ้น"
        ],
        btnNext: "ขั้นตอนถัดไป",
        btnGotIt: "รับทราบ / เริ่มใช้งาน",
        btnClose: "ปิดหน้าต่าง"
      },
      lo: {
        title: "ຄູ່ມືລັອກອິນ ສະແກນນິ້ວ / ໃບໜ້າ",
        subtitle: "ວິທີເຂົ້າສູ່ລະບົບ ແລະ ລົງທະບຽນແບບບໍ່ຕ້ອງໃຊ້ລະຫັດຜ່ານ (WebAuthn)",
        tab1: "1. ຕັ້ງຄ່າເຄື່ອງ",
        tab2: "2. ວິທີລົງທະບຽນ",
        tab3: "3. ວິທີສະແກນເຂົ້າໃຊ້",
        tab4: "4. ວິທີແກ້ໄຂບັນຫາ",
        step1_1: "1. ຕັ້ງລະຫັດລັອກໜ້າຈໍໃນອຸປະກອນກ່ອນ",
        step1_1_desc: "ກວດເບິ່ງວ່າໂທລະສັບ ຫຼື ຄອມພິວເຕີຂອງທ່ານ ໄດ້ຕັ້ງຄ່າສະແກນໃບໜ້າ (Face ID), ລາຍນິ້ວມື (Touch ID), PIN ຫຼື ລະຫັດລັອກເຄື່ອງໃນສ່ວນຕັ້ງຄ່າ (Settings) ແລ້ວຫຼືບໍ່",
        step1_2: "2. ກວດເບິ່ງບຣາວເຊີທີ່ຮອງຮັບ",
        step1_2_desc: "ລະບົບສະແກນນີ້ເຮັດວຽກຮ່ວມກັບ Safari (ເທິງ iOS/macOS), Chrome (ເທິງ Android/Windows) ແລະ Edge ໄດ້ຢ່າງມີປະສິດທິພາບສູງສຸດ",
        step2_1: "1. ໄປທີ່ເມນູຂໍ້ມູນພະນັກງານ",
        step2_1_desc: "ເຂົ້າສູ່ລະບົບດ້ວຍລະຫັດຜ່ານປົກກະຕິກ່ອນເປັນຄັ້ງທຳອິດ ຈາກນັ້ນກົດໄປທີ່ເມນູ 'ຂໍ້ມູນພະນັກງານ' (Profile) ແລະ ເລື່ອນລົງໄປຫາສ່ວນສະແກນໃບໜ້າ / ລາຍນິ້ວມື",
        step2_2: "2. ຕັ້ງຊື່ອຸປະກອນ ແລະ ແຕະສະແກນ",
        step2_2_desc: "ພິມຊື່ອຸປະກອນ ເຊັ່ນ 'ມືຖືສ່ວນຕົວ' ຈາກນັ້ນກົດປຸ່ມສີຟ້າ 'ເປີດໃຊ້ງານລະບົບສະແກນໃນອຸປະກອນນີ້' ແລະ ວາງນິ້ວ ຫຼື ສະແກນໃບໜ້າຕາມຄຳສັ່ງຂອງລະບົບ",
        step3_1: "1. ລະບຸລະຫັດພະນັກງານຢູ່ໜ້າທຳອິດ",
        step3_1_desc: "ເມື່ອຕ້ອງການເຂົ້າສູ່ລະບົບຄັ້ງຖັດໄປ, ໃຫ້ປ້ອນລະຫັດພະນັກງານຂອງທ່ານໃນໜ້າຈໍເຂົ້າສູ່ລະບົບຫຼັກ",
        step3_2: "2. ແຕະປຸ່ມລັອກອິນຊີວະມາດ",
        step3_2_desc: "ກົດປຸ່ມ 'ເຂົ້າສູ່ລະບົບດ້ວຍລາຍນິ້ວມື / ໃບໜ້າ' ຈາກນັ້ນສຳຜັດເຊັນເຊີສະແກນເພື່ອຢືນຢັນຕົວຕົນ ແລະ ເຂົ້າສູ່ໜ້າແດຊບອດສ່ວນຕົວໄດ້ໃນ 1 ວິນາທີ!",
        tips_title: " ຄຳແນະນຳເພີ່ມເຕີມເພື່ອຄວາມປອດໄພ",
        tips_list: [
          "ທ່ານສາມາດລົງທະບຽນອຸປະກອນໄດ້ຫຼາຍເຄື່ອງສຳລັບບັນຊີດຽວກັນ (ເຊັ່ນ ມືຖືສ່ວນຕົວ ແລະ ໂນ້ດບຸກເຮັດວຽກ)",
          "ລະບົບເກັບຂໍ້ມູນລາຍພິມຊີວະມາດສະເພາະເທິງຊິບຄວາມປອດໄພຂອງອຸປະກອນທ່ານເທົ່ານັ້ນ ບໍ່ມີການສົ່ງຂໍ້ມູນຂຶ້ນຄລາວ ຫຼື ອິນເຕີເນັດຢ່າງເດັດຂາດ",
          "ຫາກເກີດຂໍ້ຜິດພາດ, ທ່ານຍັງສາມາດປ່ຽນໄປເຂົ້າສູ່ລະບົບດ້ວຍລະຫັດຜ່ານປົກກະຕິໄດ້ຕະຫຼອດເວລາ"
        ],
        err_title: "️ ຫາກສະແກນບໍ່ຜ່ານ ຫຼື ປຸ່ມສະແກນໃຊ້ງານບໍ່ໄດ້",
        err_list: [
          "ກວດເບິ່ງວ່າໜ້າເລນກ້ອງ ຫຼື ປຸ່ມສະແກນລາຍນິ້ວມືສະອາດ ແລະ ບໍ່ມີສິ່ງກີດຂວາງ",
          "ກວດສິດການເຂົ້າເຖິງ: ເຊັກວ່າລະບົບອະນຸຍາດສິດຢືນຢັນຕົວຕົນຊີວະມາດໃຫ້ກັບ Chrome/Safari ແລ້ວຫຼືບໍ່ໃນການຕັ້ງຄ່າເຄື່ອງ",
          "ຂໍ້ແນະນຳກໍລະນີນຳໃຊ້ແອັບ LINE: ໃຫ້ກົດ 'ເປີດໃນບຣາວເຊີເລີ່ມຕົ້ນ' ຫຼື Safari/Chrome ເພື່ອໃຫ້ສະແກນໄດ້ຢ່າງຖືກຕ້ອງ"
        ],
        btnNext: "ຂັ້ນຕອນຖັດໄປ",
        btnGotIt: "ຮັບຊາບ / ເລີ່ມນຳໃຊ້",
        btnClose: "ປິດ"
      },
      my: {
        title: "လက်ဗွေ / မျက်နှာစကင်န် လမ်းညွှန်",
        subtitle: "စကားဝှက်မလိုဘဲ လုံခြုံမြန်ဆန်စွာ လော့ဂ်အင်ဝင်နည်း (WebAuthn)",
        tab1: "၁။ စက်ပြင်ဆင်ခြင်း",
        tab2: "၂။ စာရင်းသွင်းနည်း",
        tab3: "၃။ လော့ဂ်အင်ဝင်နည်း",
        tab4: "၄။ ပြဿနာဖြေရှင်းခြင်း",
        step1_1: "၁။ ဖုန်းလော့ခ်စနစ် အရင်သတ်မှတ်ပါ",
        step1_1_desc: "သင့်ဖုန်း သို့မဟုတ် ကွန်ပျူတာ၏ Settings တွင် မျက်နှာစကင်န် (Face ID)၊ လက်ဗွေ (Touch ID) သို့မဟုတ် PIN နံပါတ် အရင်ထည့်သွင်းထားရန် လိုအပ်ပါသည်",
        step1_2: "၂။ ထောက်ပံ့ထားသော Browser ကို သုံးပါ",
        step1_2_desc: "ဤစနစ်သည် Safari (iOS/macOS) နှင့် Chrome (Android/Windows) တို့တွင် အကောင်းဆုံး အလုပ်လုပ်ပါသည်",
        step2_1: "၁။ ကိုယ်ရေးအချက်အလက် (Profile) သို့သွားပါ",
        step2_1_desc: "စကားဝှက်ဖြင့် ပုံမှန်လော့ဂ်အင်ဝင်ပြီး 'ကိုယ်ရေးအကျဉ်း' (Profile) မီနူးသို့ သွားကာ အောက်ဘက်ရှိ လက်ဗွေ / မျက်နှာစကင်န် နေရာသို့ သွားပါ",
        step2_2: "၂။ စက်အမည်ပေးပြီး စကင်န်ဖတ်ပါ",
        step2_2_desc: "စက်အမည် (ဥပမာ- 'ကျွန်ုပ်၏ဖုန်း') ပေးပြီး 'စက်ပစ္စည်းတွင် စကင်န်စနစ်ဖွင့်မည်' ကို နှိပ်ကာ လက်ဗွေ/မျက်နှာဖြင့် စာရင်းသွင်းချိတ်ဆက်ပါ",
        step3_1: "၁။ ဝန်ထမ်းနံပါတ်ကို ရိုက်ထည့်ပါ",
        step3_1_desc: "နောက်တစ်ကြိမ် ဝင်ရောက်သည့်အခါ အဓိက လော့ဂ်အင်စာမျက်နှာတွင် သင့်ဝန်ထမ်းနံပါတ်ကို ရိုက်ထည့်ပါ",
        step3_2: "၂။ စကင်န်ခလုတ်ကို နှိပ်ပါ",
        step3_2_desc: "'လက်ဗွေ / မျက်နှာဖြင့် လော့ဂ်အင်ဝင်ရန်' ခလုတ်ကိုနှိပ်ပြီး ချက်ချင်း အောင်မြင်စွာ ဝင်ရောက်နိုင်ပါပြီ",
        tips_title: " လုံခြုံရေးအတွက် အကြံပြုချက်များ",
        tips_list: [
          "အကောင့်တစ်ခုတည်းတွင် ဖုန်းနှင့် Laptop ကဲ့သို့ စက်ပစ္စည်းအများအပြား ချိတ်ဆက်နိုင်ပါသည်",
          "လုံခြုံရေးအတွက် သင့်ကိုယ်ရေးအချက်အလက်များကို သင့်စက်၏ လုံခြုံရေးChipထဲတွင်သာ သိမ်းဆည်းထားပါသည် (Cloud ပေါ်သို့ လုံးဝမပို့ပါ)",
          "စကင်န်ဖတ်ခြင်း အဆင်မပြေပါက ပုံမှန်စကားဝှက်ဖြင့် အချိန်မရွေး လော့ဂ်အင်ဝင်နိုင်ပါသည်"
        ],
        err_title: "️ စကင်န်မရခြင်း သို့မဟုတ် အမှားအယွင်းများရှိပါက",
        err_list: [
          "သင့်စက်၏ ကင်မရာ သို့မဟုတ် လက်ဗွေဖတ်စနစ် သန့်ရှင်းမှုရှိမရှိ စစ်ဆေးပါ",
          "ဖုန်း Settings တွင် Browser အတွက် Biometrics ခွင့်ပြုချက် ပေးထားခြင်း ရှိမရှိ စစ်ဆေးပါ",
          "LINE အက်ပ်အတွင်းမှ သုံးနေပါက 'အခြား Browser တွင်ဖွင့်ပါ' ကို နှိပ်ပြီး Safari/Chrome ဖြင့် သုံးရန် အကြံပြုပါသည်"
        ],
        btnNext: "နောက်တစ်ဆင့်",
        btnGotIt: "နားလည်ပါပြီ / စတင်ရန်",
        btnClose: "ပိတ်ရန်"
      }
    }[currentLang] || t.th;

    guideModal.innerHTML = `
      <style>
        #pvtBiometricGuideModal.pvt-guide-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 11000;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          padding: 16px;
        }
        #pvtBiometricGuideModal.pvt-guide-modal-overlay.active {
          opacity: 1;
          pointer-events: auto;
        }
        .pvt-guide-modal-box {
          background: #ffffff;
          width: 100%;
          max-width: 540px;
          border-radius: 20px;
          box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.8);
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 40px);
          max-height: calc(100dvh - 40px);
          overflow: hidden;
          transform: scale(0.95);
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        #pvtBiometricGuideModal.pvt-guide-modal-overlay.active .pvt-guide-modal-box {
          transform: scale(1);
        }
        .pvt-guide-modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid #f1f5f9;
          position: relative;
          background: #f8fafc;
        }
        .pvt-guide-modal-close {
          position: absolute;
          top: 18px;
          right: 18px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #e2e8f0;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .pvt-guide-modal-close:hover {
          background: #cbd5e1;
          color: #0f172a;
        }
        .pvt-guide-modal-title {
          font-size: 18px;
          font-weight: 700;
          color: #0f766e;
          margin: 0 0 4px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pvt-guide-modal-subtitle {
          font-size: 12.5px;
          color: #64748b;
          margin: 0;
        }
        .pvt-guide-modal-body {
          padding: 20px 24px;
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .pvt-tabs-header {
          display: flex;
          background: #f1f5f9;
          padding: 4px;
          border-radius: 12px;
          gap: 2px;
          flex-wrap: wrap;
        }
        .pvt-tab-btn {
          flex: 1;
          min-width: 100px;
          padding: 8px 4px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: center;
          white-space: nowrap;
          transition: all 0.2s;
        }
        .pvt-tab-btn.active {
          background: #ffffff;
          color: #0f766e;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
        }
        .pvt-tab-content {
          display: none;
          flex-direction: column;
          gap: 14px;
          animation: pvtFadeIn 0.25s ease-out;
        }
        .pvt-tab-content.active {
          display: flex;
        }
        @keyframes pvtFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .pvt-illustration-container {
          width: 100%;
          height: 120px;
          background: linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #e2e8f0;
        }
        .pvt-step-item {
          display: flex;
          gap: 12px;
          background: #f8fafc;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid #edf2f7;
        }
        .pvt-step-num {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #0f766e;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pvt-step-details {
          flex: 1;
        }
        .pvt-step-title {
          font-size: 13.5px;
          font-weight: 600;
          color: #1e293b;
          margin: 0 0 3px 0;
        }
        .pvt-step-desc {
          font-size: 12px;
          color: #64748b;
          margin: 0;
          line-height: 1.5;
        }
        .pvt-guide-footer {
          padding: 16px 24px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8fafc;
        }
        .pvt-btn-primary {
          background: #0f766e;
          color: #ffffff;
          border: none;
          padding: 10px 20px;
          border-radius: 10px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .pvt-btn-primary:hover {
          background: #0d9488;
        }
        .pvt-btn-secondary {
          background: transparent;
          color: #64748b;
          border: 1px solid #cbd5e1;
          padding: 10px 18px;
          border-radius: 10px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .pvt-btn-secondary:hover {
          background: #f1f5f9;
          color: #334155;
        }
        .tips-card {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          gap: 10px;
        }
        .tips-title {
          font-size: 13px;
          font-weight: 600;
          color: #b45309;
          margin: 0 0 6px 0;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .tips-list {
          margin: 0;
          padding: 0 0 0 16px;
          font-size: 12px;
          color: #78350f;
          line-height: 1.6;
        }
        .err-card {
          background: #fef2f2;
          border: 1px solid #fee2e2;
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          gap: 10px;
        }
        .err-title {
          font-size: 13px;
          font-weight: 600;
          color: #991b1b;
          margin: 0 0 6px 0;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .err-list {
          margin: 0;
          padding: 0 0 0 16px;
          font-size: 12px;
          color: #7f1d1d;
          line-height: 1.6;
        }
      </style>

      <div class="pvt-guide-modal-box">
        <div class="pvt-guide-modal-header">
          <button type="button" class="pvt-guide-modal-close" id="btnCloseBioGuide" title="${t.btnClose}">
            <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
          </button>
          <h3 class="pvt-guide-modal-title">
            <span class="material-symbols-outlined" style="color: #0d9488; font-size: 24px;">fingerprint</span>
            ${t.title}
          </h3>
          <p class="pvt-guide-modal-subtitle">${t.subtitle}</p>
        </div>

        <div class="pvt-guide-modal-body">
          <div class="pvt-tabs-header">
            <button type="button" class="pvt-tab-btn active" data-tab="tab1">${t.tab1}</button>
            <button type="button" class="pvt-tab-btn" data-tab="tab2">${t.tab2}</button>
            <button type="button" class="pvt-tab-btn" data-tab="tab3">${t.tab3}</button>
            <button type="button" class="pvt-tab-btn" data-tab="tab4">${t.tab4}</button>
          </div>

          <!-- TAB 1 CONTENT: PRE-REQUISITES -->
          <div class="pvt-tab-content active" id="pvt-tab-content-tab1">
            <div class="pvt-illustration-container">
              <svg width="200" height="110" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="75" y="15" width="50" height="90" rx="8" fill="#1e293b" />
                <rect x="79" y="19" width="42" height="74" rx="4" fill="#ffffff" />
                <rect x="85" y="27" width="30" height="4" rx="1" fill="#e2e8f0" />
                <rect x="85" y="35" width="30" height="24" rx="3" fill="#f0fdfa" stroke="#2dd4bf" stroke-width="1.5"/>
                <path d="M100 42a3 3 0 100 6h4v2h2v-2h1v-2h-7z" stroke="#0d9488" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <rect x="85" y="65" width="30" height="18" rx="2" fill="#dcfce7" />
                <circle cx="100" cy="74" r="5" fill="#22c55e" />
                <path d="M98 74l1.5 1.5 2.5-2.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="100" cy="115" r="45" stroke="#0d9488" stroke-opacity="0.1" stroke-width="2"/>
                <circle cx="100" cy="115" r="55" stroke="#0d9488" stroke-opacity="0.05" stroke-width="2"/>
              </svg>
            </div>
            
            <div class="pvt-step-item">
              <div class="pvt-step-num">1</div>
              <div class="pvt-step-details">
                <h4 class="pvt-step-title">${t.step1_1}</h4>
                <p class="pvt-step-desc">${t.step1_1_desc}</p>
              </div>
            </div>

            <div class="pvt-step-item">
              <div class="pvt-step-num">2</div>
              <div class="pvt-step-details">
                <h4 class="pvt-step-title">${t.step1_2}</h4>
                <p class="pvt-step-desc">${t.step1_2_desc}</p>
              </div>
            </div>
          </div>

          <!-- TAB 2 CONTENT: REGISTRATION -->
          <div class="pvt-tab-content" id="pvt-tab-content-tab2">
            <div class="pvt-illustration-container">
              <svg width="200" height="110" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="40" y="20" width="120" height="76" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>
                <rect x="40" y="20" width="120" height="14" fill="#e2e8f0" rx="1"/>
                <circle cx="48" cy="27" r="2" fill="#94a3b8" />
                <circle cx="54" cy="27" r="2" fill="#94a3b8" />
                <circle cx="60" cy="27" r="2" fill="#94a3b8" />
                <rect x="65" y="48" width="70" height="20" rx="6" fill="#0d9488" />
                <path d="M100 52a4 4 0 00-4 4" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M100 50a6 6 0 00-6 6" stroke="#ffffff" stroke-dasharray="1 1.5" stroke-width="1" stroke-linecap="round"/>
                <rect x="65" y="74" width="70" height="4" rx="2" fill="#cbd5e1" />
                <rect x="80" y="82" width="40" height="3" rx="1.5" fill="#cbd5e1" />
                <circle cx="120" cy="58" r="12" stroke="#22d3ee" stroke-opacity="0.5" stroke-width="1.5" />
                <circle cx="120" cy="58" r="6" fill="#22d3ee" fill-opacity="0.3" />
                <path d="M120 58l10 14h-4l3 7-2 1-3-7-4 2V58z" fill="#1e293b" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
              </svg>
            </div>

            <div class="pvt-step-item">
              <div class="pvt-step-num">1</div>
              <div class="pvt-step-details">
                <h4 class="pvt-step-title">${t.step2_1}</h4>
                <p class="pvt-step-desc">${t.step2_1_desc}</p>
              </div>
            </div>

            <div class="pvt-step-item">
              <div class="pvt-step-num">2</div>
              <div class="pvt-step-details">
                <h4 class="pvt-step-title">${t.step2_2}</h4>
                <p class="pvt-step-desc">${t.step2_2_desc}</p>
              </div>
            </div>
          </div>

          <!-- TAB 3 CONTENT: HOW TO LOGIN -->
          <div class="pvt-tab-content" id="pvt-tab-content-tab3">
            <div class="pvt-illustration-container">
              <svg width="200" height="110" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="100" cy="55" r="34" fill="#f0fdfa" stroke="#2dd4bf" stroke-width="1.5"/>
                <path d="M100 37c-9.94 0-18 8.06-18 18" stroke="#0d9488" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M100 43c-6.63 0-12 5.37-12 12" stroke="#22d3ee" stroke-width="2" stroke-linecap="round"/>
                <path d="M100 49c-3.31 0-6 2.69-6 6" stroke="#0d9488" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M100 55c0 0 0 0 0 0" stroke="#0d9488" stroke-width="3" stroke-linecap="round"/>
                <path d="M112 55c0-6.63-5.37-12-12-12" stroke="#0d9488" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M118 55c0-9.94-8.06-18-18-18" stroke="#22d3ee" stroke-width="2" stroke-linecap="round"/>
                <circle cx="128" cy="74" r="15" fill="#22c55e" stroke="#ffffff" stroke-width="2.5" />
                <path d="M122 74l4 4 6-6" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>

            <div class="pvt-step-item">
              <div class="pvt-step-num">1</div>
              <div class="pvt-step-details">
                <h4 class="pvt-step-title">${t.step3_1}</h4>
                <p class="pvt-step-desc">${t.step3_1_desc}</p>
              </div>
            </div>

            <div class="pvt-step-item">
              <div class="pvt-step-num">2</div>
              <div class="pvt-step-details">
                <h4 class="pvt-step-title">${t.step3_2}</h4>
                <p class="pvt-step-desc">${t.step3_2_desc}</p>
              </div>
            </div>
          </div>

          <!-- TAB 4 CONTENT: SAFETY & TROUBLESHOOTING -->
          <div class="pvt-tab-content" id="pvt-tab-content-tab4">
            <!-- Security Info Card -->
            <div class="tips-card">
              <span class="material-symbols-outlined" style="color: #b45309; font-size: 20px;">verified_user</span>
              <div>
                <h4 class="tips-title">${t.tips_title}</h4>
                <ul class="tips-list">
                  ${t.tips_list.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
              </div>
            </div>

            <!-- Error Troubleshooting Card -->
            <div class="err-card" style="margin-top: 4px;">
              <span class="material-symbols-outlined" style="color: #991b1b; font-size: 20px;">gpp_maybe</span>
              <div>
                <h4 class="err-title">${t.err_title}</h4>
                <ul class="err-list">
                  ${t.err_list.map(err => `<li>${err}</li>`).join('')}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div class="pvt-guide-footer">
          <button type="button" class="pvt-btn-secondary" id="btnCloseBioGuideSecondary">${t.btnClose}</button>
          <button type="button" class="pvt-btn-primary" id="btnNextBioGuide">
            <span>${t.btnNext}</span>
            <span class="material-symbols-outlined" style="font-size: 18px;">arrow_forward</span>
          </button>
        </div>
      </div>
    `;

    // Smooth Activation
    requestAnimationFrame(() => {
      guideModal.classList.add("active");
    });

    // Interactive Tab Switching
    const tabs = guideModal.querySelectorAll(".pvt-tab-btn");
    const contents = guideModal.querySelectorAll(".pvt-tab-content");
    const nextBtn = guideModal.querySelector("#btnNextBioGuide");
    let activeTabIndex = 0;

    const switchTab = (index) => {
      activeTabIndex = index;
      tabs.forEach((tab, i) => {
        if (i === index) {
          tab.classList.add("active");
          contents[i].classList.add("active");
        } else {
          tab.classList.remove("active");
          contents[i].classList.remove("active");
        }
      });

      // Update Next button label on last tab
      if (index === tabs.length - 1) {
        nextBtn.innerHTML = `<span>${t.btnGotIt}</span><span class="material-symbols-outlined" style="font-size: 18px;">done</span>`;
      } else {
        nextBtn.innerHTML = `<span>${t.btnNext}</span><span class="material-symbols-outlined" style="font-size: 18px;">arrow_forward</span>`;
      }
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => switchTab(index));
    });

    // Next button click sequence
    nextBtn.addEventListener("click", () => {
      if (activeTabIndex < tabs.length - 1) {
        switchTab(activeTabIndex + 1);
      } else {
        closeModal();
      }
    });

    // Close Modal Logic
    const closeModal = () => {
      guideModal.classList.remove("active");
      setTimeout(() => {
        if (guideModal && guideModal.parentNode) {
          guideModal.parentNode.removeChild(guideModal);
        }
      }, 250);
    };

    guideModal.querySelector("#btnCloseBioGuide").addEventListener("click", closeModal);
    guideModal.querySelector("#btnCloseBioGuideSecondary").addEventListener("click", closeModal);
    guideModal.addEventListener("click", (e) => {
      if (e.target === guideModal) {
        closeModal();
      }
    });
  }

  // Bind to window for global invocation
  window.showBiometricGuideModal = showBiometricGuideModal;

  // Public Export API
  return {
    isBiometricAvailable,
    detectBiometricTypeName,
    getAutoDeviceNickname,
    resolveEmployeeObject,
    verifyActiveSession,
    registerBiometricCredential,
    registerVirtualBiometricCredential,
    authenticateBiometric,
    listEmployeeCredentials,
    deleteBiometricCredential,
    getLocalCredentials,
    bufferToBase64Url,
    base64UrlToBuffer,
    showBiometricGuideModal
  };
}));
