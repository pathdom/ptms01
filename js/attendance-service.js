/* ==========================================================================
   ATTENDANCE SERVICE — Chấm công bằng IP mạng nội bộ (Firebase Firestore)
   - Admin: saveCompanyIP() lấy IP Public hiện tại qua ipify, lưu vào
     company_config/wifi_config (trường allowed_ip).
   - Nhân viên: checkInAttendance() lấy IP hiện tại, so khớp với allowed_ip,
     nếu khớp ghi UID + Tên + Timestamp vào collection attendance.
   ========================================================================== */
(() => {
  const db = firebase.firestore();
  const auth = firebase.auth();

  const IPIFY_URL = 'https://api.ipify.org?format=json';

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

  // ---- Lấy IP Public hiện tại qua ipify ----
  const fetchPublicIP = async () => {
    const res = await fetch(IPIFY_URL);
    if (!res.ok) throw new Error('Không thể lấy địa chỉ IP công khai.');
    const data = await res.json();
    return data.ip;
  };

  // ==========================================================================
  // 1. ADMIN: Thiết lập IP văn phòng
  // ==========================================================================
  const saveCompanyIP = async () => {
    const btn = document.getElementById('btnSaveOfficeIp');
    const originalLabel = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Đang lấy IP...'; }

    try {
      const ip = await fetchPublicIP();
      await db.collection('company_config').doc('wifi_config').set({
        allowed_ip: ip,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.currentUser ? auth.currentUser.email : null
      }, { merge: true });
      showServiceToast(`Đã cập nhật IP văn phòng: ${ip}`, 'success');
      return ip;
    } catch (err) {
      console.error('Lỗi cập nhật IP văn phòng:', err);
      showServiceToast('Lỗi cập nhật IP văn phòng: ' + err.message, 'error');
      throw err;
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
    }
  };

  // ==========================================================================
  // 2. NHÂN VIÊN: Bấm chấm công
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
      // a. + b. Lấy IP hiện tại và IP văn phòng đã lưu — chạy đồng thời
      const [currentIp, configDoc, userDoc] = await Promise.all([
        fetchPublicIP(),
        db.collection('company_config').doc('wifi_config').get(),
        db.collection('users').doc(uid).get()
      ]);

      if (!userDoc.exists) {
        showServiceToast('Không tìm thấy thông tin tài khoản nhân viên!', 'error');
        return;
      }
      const userInfo = userDoc.data();

      if (!configDoc.exists || !configDoc.data().allowed_ip) {
        showServiceToast('Quản trị viên chưa cấu hình IP mạng văn phòng!', 'error');
        return;
      }
      const allowedIp = configDoc.data().allowed_ip;

      // c. So sánh hai địa chỉ IP
      if (currentIp !== allowedIp) {
        showServiceToast('Bạn không kết nối đúng Wifi văn phòng', 'error');
        return;
      }

      // Trùng khớp -> lấy UID, Tên nhân viên + Timestamp, ghi nhận vào attendance
      // (doc gắn theo hồ sơ hrm_staff để đồng bộ với bảng chấm công cá nhân/admin)
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
          [day]: { time: firebase.firestore.FieldValue.serverTimestamp(), ip: currentIp, uid }
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

  window.AttendanceService = { fetchPublicIP, saveCompanyIP, checkInAttendance };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnSaveOfficeIp')?.addEventListener('click', saveCompanyIP);
    document.getElementById('btnEmployeeCheckIn')?.addEventListener('click', checkInAttendance);
  });
})();
