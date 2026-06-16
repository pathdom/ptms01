/* ==========================================================================
   ATTENDANCE SERVICE — Chấm công bằng IP tĩnh mạng nội bộ (LAN) + Firestore
   - Admin: saveCompanyIP() lưu IP tĩnh (Gateway/Server máy chấm công) do
     Admin tự nhập vào Firestore (company_config/wifi_config, field allowed_ip),
     đồng thời đồng bộ xuống LAN Server (server/attendance-server.js) để
     server biết IP/subnet chuẩn dùng đối chiếu.
   - Nhân viên: checkInAttendance() gọi trực tiếp tới LAN Server tại địa chỉ
     allowed_ip (server đó tự bắt IP nguồn thật từ socket TCP, không qua
     header có thể giả mạo). Server đối chiếu dải mạng (subnet) và trả về
     kết quả hợp lệ/không hợp lệ. Hợp lệ -> ghi UID + Tên + Timestamp vào
     Firestore collection "attendance".
   ========================================================================== */
(() => {
  const db = firebase.firestore();
  const auth = firebase.auth();

  const IPIFY_URL = 'https://api.ipify.org?format=json';
  const LAN_SERVER_PORT = 4500;
  const LAN_REQUEST_TIMEOUT_MS = 4000;
  const ADMIN_KEY = 'aladdin-admin-key'; // phải khớp ATTENDANCE_ADMIN_KEY trên server/attendance-server.js

  // ---- Toast nội bộ (dùng lại #toastContainer + CSS .toast có sẵn trong dự án) ----
  const showServiceToast = (message, type = 'info') => {
    const container = document.getElementById('toastContainer');
    if (!container) { alert(message); return; }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '<svg viewBox="0 0 24 24"><path d="M11,9H13V7H11V9M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z"/></svg>';
    if (type === 'success') iconSvg = '<svg viewBox="0 0 24 24"><path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>';
    else if (type === 'error') iconSvg = '<svg viewBox="0 0 24 24"><path d="M12,2C5.9,2 1,6.9 1,13C1,19.1 5.9,24 12,24C18.1,24 23,19.1 23,13C23,6.9 18.1,2 12,2M13,18H11V16H13V18M13,14H11V8H13V14Z"/></svg>';

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-message">${message}</div>
      <button class="toast-close">&times;</button>
    `;
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 400);
    });
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 400);
      }
    }, 4000);
  };

  // ---- Lấy IP Public hiện tại qua ipify (chỉ dùng làm gợi ý điền sẵn ô nhập) ----
  const fetchPublicIP = async () => {
    const res = await fetch(IPIFY_URL);
    if (!res.ok) throw new Error('Không thể lấy địa chỉ IP công khai.');
    const data = await res.json();
    return data.ip;
  };

  const fetchWithTimeout = async (url, options = {}, timeoutMs = LAN_REQUEST_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  // ==========================================================================
  // 1. ADMIN: Thiết lập IP tĩnh văn phòng (Gateway / Server máy chấm công LAN)
  // ==========================================================================
  const renderOfficeIpDisplay = (ip) => {
    const el = document.getElementById('hrmCurrentOfficeIp');
    if (el) el.textContent = ip || 'Chưa cấu hình';
    const input = document.getElementById('hrmOfficeIpInput');
    if (input && !input.value) input.value = ip || '';
  };

  const loadOfficeIpDisplay = async () => {
    try {
      const doc = await db.collection('company_config').doc('wifi_config').get();
      renderOfficeIpDisplay(doc.exists ? doc.data().allowed_ip : null);
    } catch (err) {
      console.error('Lỗi tải IP văn phòng:', err);
      renderOfficeIpDisplay(null);
    }
  };

  const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const isValidIPv4 = (ip) => {
    if (!IPV4_REGEX.test(ip)) return false;
    return ip.split('.').every(octet => Number(octet) >= 0 && Number(octet) <= 255);
  };

  // Admin nhập IP tĩnh (Gateway/Server LAN) -> lưu Firestore + đồng bộ xuống LAN Server
  const saveCompanyIP = async () => {
    const input = document.getElementById('hrmOfficeIpInput');
    const ip = (input?.value || '').trim();

    if (!isValidIPv4(ip)) {
      showServiceToast('IP không hợp lệ! Nhập đúng định dạng VD: 192.168.1.1', 'error');
      return;
    }

    const btn = document.getElementById('btnSaveOfficeIp');
    const originalLabel = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Đang lưu...'; }

    try {
      await db.collection('company_config').doc('wifi_config').set({
        allowed_ip: ip,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.currentUser ? auth.currentUser.email : null
      }, { merge: true });

      // Đồng bộ IP tĩnh xuống LAN Server để server tự đối chiếu subnet khi nhân viên chấm công.
      // Best-effort: nếu admin đang ở máy không gọi tới LAN Server được, Firestore vẫn lưu thành công.
      try {
        await fetchWithTimeout(`http://${ip}:${LAN_SERVER_PORT}/api/admin/set-ip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
          body: JSON.stringify({ allowed_ip: ip, subnet_octets: 3 })
        }, 3000);
      } catch (syncErr) {
        console.warn('Không đồng bộ được tới LAN Server (server có thể chưa chạy):', syncErr);
      }

      renderOfficeIpDisplay(ip);
      showServiceToast(`Đã lưu IP tĩnh văn phòng: ${ip}`, 'success');
      return ip;
    } catch (err) {
      console.error('Lỗi lưu IP văn phòng:', err);
      showServiceToast('Lỗi lưu IP văn phòng: ' + err.message, 'error');
      throw err;
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
    }
  };

  // Nút phụ: dò IP Public hiện tại để điền gợi ý vào ô nhập (không tự lưu)
  const suggestPublicIP = async () => {
    try {
      const ip = await fetchPublicIP();
      const input = document.getElementById('hrmOfficeIpInput');
      if (input) input.value = ip;
      showServiceToast(`Đã điền gợi ý IP Public hiện tại: ${ip}. Kiểm tra lại rồi bấm Lưu.`, 'info');
    } catch (err) {
      showServiceToast('Không lấy được IP gợi ý: ' + err.message, 'error');
    }
  };

  // ==========================================================================
  // 2. NHÂN VIÊN: Bấm chấm công — gọi trực tiếp LAN Server, server tự bắt IP
  //    nguồn thật từ socket TCP và đối chiếu dải mạng (subnet) với IP tĩnh.
  // ==========================================================================
  const checkInAttendance = async () => {
    const user = auth.currentUser;
    if (!user || !user.uid) {
      showServiceToast('Bạn chưa đăng nhập!', 'error');
      return;
    }
    const uid = user.uid;

    const btn = document.getElementById('btnEmployeeCheckIn');
    const originalLabel = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Đang xử lý...'; }

    try {
      const [configDoc, userDoc] = await Promise.all([
        db.collection('company_config').doc('wifi_config').get(),
        db.collection('users').doc(uid).get()
      ]);

      if (!userDoc.exists) {
        showServiceToast('Không tìm thấy thông tin tài khoản nhân viên!', 'error');
        return;
      }
      const userInfo = userDoc.data();

      if (!configDoc.exists || !configDoc.data().allowed_ip) {
        showServiceToast('Quản trị viên chưa cấu hình IP tĩnh văn phòng!', 'error');
        return;
      }
      const allowedIp = configDoc.data().allowed_ip;

      // Gửi request trực tiếp tới Server máy chấm công trong mạng nội bộ.
      // Server tự bắt IP nguồn từ socket và đối chiếu dải mạng (subnet) — không
      // tin vào bất kỳ IP nào do client tự khai báo.
      let result;
      try {
        const res = await fetchWithTimeout(`http://${allowedIp}:${LAN_SERVER_PORT}/api/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, name: userInfo.name || user.email })
        });
        result = await res.json();
      } catch (netErr) {
        console.error('Không kết nối được tới máy chấm công nội bộ:', netErr);
        showServiceToast('Chấm công thất bại! Không kết nối được tới máy chấm công trong mạng văn phòng (bạn có thể đang ở mạng khác hoặc 4G bên ngoài).', 'error');
        return;
      }

      if (!result.valid) {
        showServiceToast('Chấm công thất bại! Thiết bị của bạn không nằm trong dải mạng văn phòng.', 'error');
        return;
      }

      // Hợp lệ -> lấy UID, Tên nhân viên + Timestamp, ghi nhận vào attendance
      const staffSnap = await db.collection('hrm_staff').where('email', '==', userInfo.email || user.email).limit(1).get();
      if (staffSnap.empty) {
        showServiceToast('Không tìm thấy hồ sơ nhân sự liên kết với tài khoản này!', 'error');
        return;
      }
      const staffDoc = staffSnap.docs[0];
      const staffId = staffDoc.id;
      const staffName = staffDoc.data().name || userInfo.name || user.email;

      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const day = String(now.getDate());

      await db.collection('attendance').doc(`${staffId}_${monthStr}`).set({
        staffId,
        uid,
        staffName,
        email: userInfo.email || user.email,
        month: monthStr,
        days: { [day]: '1' },
        checkLogs: {
          [day]: { time: firebase.firestore.FieldValue.serverTimestamp(), ip: result.clientIp, uid }
        },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      showServiceToast(`Chấm công thành công lúc ${now.toLocaleTimeString('vi-VN')}!`, 'success');
    } catch (err) {
      console.error('Lỗi chấm công:', err);
      showServiceToast('Lỗi chấm công: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
    }
  };

  window.AttendanceService = { fetchPublicIP, saveCompanyIP, suggestPublicIP, checkInAttendance, loadOfficeIpDisplay };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnSaveOfficeIp')?.addEventListener('click', saveCompanyIP);
    document.getElementById('btnSuggestPublicIp')?.addEventListener('click', suggestPublicIP);
    document.getElementById('btnEmployeeCheckIn')?.addEventListener('click', checkInAttendance);
  });
})();
