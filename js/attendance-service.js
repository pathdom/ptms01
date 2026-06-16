/* ==========================================================================
   ATTENDANCE SERVICE — Chấm công theo IP mạng văn phòng (Firebase Firestore)
   - Admin: lưu IP Public hiện tại của mạng làm IP văn phòng chuẩn.
   - Nhân viên: bấm chấm công -> lấy IP hiện tại -> so khớp với IP văn phòng
     trong Firestore -> chỉ ghi nhận lịch sử nếu khớp, sai IP thì chặn lại.
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

  // ---- ADMIN: Lưu IP mạng văn phòng hiện tại vào Firestore ----
  const saveOfficeWifiIP = async () => {
    try {
      const ip = await fetchPublicIP();
      await db.collection('company_config').doc('wifi_config').set({
        officeIp: ip,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.currentUser ? auth.currentUser.email : null
      }, { merge: true });
      showServiceToast(`Đã lưu IP văn phòng hiện tại: ${ip}`, 'success');
      return ip;
    } catch (err) {
      console.error('Lỗi lưu IP văn phòng:', err);
      showServiceToast('Lỗi lưu IP văn phòng: ' + err.message, 'error');
      throw err;
    }
  };

  // ---- NHÂN VIÊN: Chấm công — chỉ ghi nhận nếu IP khớp IP văn phòng ----
  // Chấm công = xác thực kết hợp UID đang đăng nhập (Firebase Auth) + IP mạng văn phòng hiện tại
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
      // 1. Xác thực UID -> lấy thông tin user + role từ Firestore
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists || userDoc.data().role !== 'employee') {
        showServiceToast('Tài khoản này không có quyền chấm công nhân viên!', 'error');
        return;
      }
      const userInfo = userDoc.data();

      // 2. Lấy IP Public hiện tại + IP văn phòng đã cấu hình, so khớp
      const [currentIp, configDoc] = await Promise.all([
        fetchPublicIP(),
        db.collection('company_config').doc('wifi_config').get()
      ]);

      if (!configDoc.exists || !configDoc.data().officeIp) {
        showServiceToast('Quản trị viên chưa cấu hình IP mạng văn phòng!', 'error');
        return;
      }

      const officeIp = configDoc.data().officeIp;
      if (currentIp !== officeIp) {
        showServiceToast(`Chấm công thất bại! Bạn không ở trong mạng văn phòng (IP hiện tại: ${currentIp}).`, 'error');
        return;
      }

      // 3. UID + IP đều hợp lệ -> tìm hồ sơ nhân sự (hrm_staff) tương ứng để ghi nhận
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

      // 4. Ghi nhận chấm công Realtime vào Firestore (onSnapshot phía nhân viên sẽ tự cập nhật UI)
      await db.collection('attendance').doc(`${staffId}_${monthStr}`).set({
        staffId,
        staffName,
        uid,
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

  window.AttendanceService = { fetchPublicIP, saveOfficeWifiIP, checkInAttendance };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnSaveOfficeIp')?.addEventListener('click', saveOfficeWifiIP);
    document.getElementById('btnEmployeeCheckIn')?.addEventListener('click', checkInAttendance);
  });
})();
