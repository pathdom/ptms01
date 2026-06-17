/* ==========================================================================
   ATTENDANCE SERVICE — Chấm công theo Public IP + Firestore
   Schema:
     wifi_configs/office          → { public_ip, label, updatedAt }
     checkin_logs/{uid}_{date}    → { uid, name, email, date, month,
                                      checkin_time, checkin_ip,
                                      checkout_time, checkout_ip }
   ========================================================================== */
(() => {
  'use strict';

  const IPIFY_URL = 'https://api.ipify.org?format=json';
  const WIFI_DOC  = 'wifi_configs/office';

  let _db = null, _auth = null;
  let _monthUnsubscribe = null;
  let _todayUnsubscribe = null;

  // Lazy-init: chỉ lấy db/auth sau khi firebase.initializeApp() đã chạy
  const db   = () => _db   || (_db   = firebase.firestore());
  const auth = () => _auth || (_auth = firebase.auth());

  // ---- Helpers ----
  const pad = (n) => String(n).padStart(2, '0');

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const currentMonthStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };

  const getDaysInMonth = (monthStr) => {
    const [y, m] = monthStr.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };

  const fmtTime = (ts) => {
    if (!ts) return null;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const fmtDow = (dateStr) => {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return days[new Date(dateStr + 'T00:00:00').getDay()];
  };

  const isWeekend = (dateStr) => {
    const dow = fmtDow(dateStr);
    return dow === 'CN' || dow === 'T7';
  };

  const shiftMonth = (monthStr, delta) => {
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };

  const svcToast = (msg, type = 'info') => {
    if (typeof showToast === 'function') { showToast(msg, type); return; }
    const c = document.getElementById('toastContainer');
    if (!c) { alert(msg); return; }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<div class="toast-message">${msg}</div><button class="toast-close">&times;</button>`;
    el.querySelector('.toast-close').addEventListener('click', () => el.remove());
    c.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  };

  // ---- Fetch Public IP ----
  const fetchPublicIp = async () => {
    const res = await fetch(IPIFY_URL);
    if (!res.ok) throw new Error('Không lấy được Public IP');
    return (await res.json()).ip;
  };

  // ==========================================================================
  // RENDER: Thẻ trạng thái hôm nay
  // ==========================================================================
  const renderTodayCard = (data) => {
    const elIn    = document.getElementById('att-checkin-time');
    const elOut   = document.getElementById('att-checkout-time');
    const btnIn   = document.getElementById('btnCheckin');
    const btnOut  = document.getElementById('btnCheckout');

    const timeIn  = fmtTime(data?.checkin_time);
    const timeOut = fmtTime(data?.checkout_time);

    if (elIn)  elIn.textContent  = timeIn  || '--:--';
    if (elOut) elOut.textContent = timeOut || '--:--';

    // Nút vào: disable khi đã chấm vào
    if (btnIn)  btnIn.disabled  = !!data?.checkin_time;
    // Nút ra: chỉ bật khi đã chấm vào nhưng chưa chấm ra
    if (btnOut) btnOut.disabled = !data?.checkin_time || !!data?.checkout_time;
  };

  // ==========================================================================
  // RENDER: Bảng + KPI tháng
  // ==========================================================================
  const renderMonthView = (logs, monthStr) => {
    const body = document.getElementById('att-month-body');
    const kpi  = document.getElementById('att-month-kpi');
    if (!body) return;

    const byDate = {};
    logs.forEach(l => { byDate[l.date] = l; });

    const daysInMonth = getDaysInMonth(monthStr);
    let cntFull = 0, cntHalfOut = 0, cntAbsent = 0;
    let rows = '';

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthStr}-${pad(d)}`;
      const log     = byDate[dateStr];
      const dow     = fmtDow(dateStr);
      const weekend = isWeekend(dateStr);

      const hasIn  = !!log?.checkin_time;
      const hasOut = !!log?.checkout_time;

      let badge, rowCls = '';
      if (weekend) {
        badge = `<span class="att-badge att-badge-off">Nghỉ</span>`;
        rowCls = 'att-row-weekend';
      } else if (hasIn && hasOut) {
        cntFull++;
        badge = `<span class="att-badge att-badge-full">Đủ công</span>`;
      } else if (hasIn) {
        cntHalfOut++;
        badge = `<span class="att-badge att-badge-half">Chưa ra</span>`;
      } else {
        cntAbsent++;
        badge = `<span class="att-badge att-badge-absent">Chưa chấm</span>`;
      }

      rows += `
        <tr class="${rowCls}">
          <td class="att-col-date">${pad(d)}</td>
          <td class="att-col-dow" style="color:${weekend ? '#EF4444' : 'var(--text-muted)'};">${dow}</td>
          <td class="att-col-time">${hasIn  ? fmtTime(log.checkin_time)  : '<span class="att-dash">—</span>'}</td>
          <td class="att-col-time">${hasOut ? fmtTime(log.checkout_time) : '<span class="att-dash">—</span>'}</td>
          <td>${badge}</td>
        </tr>`;
    }
    body.innerHTML = rows;

    if (kpi) {
      const box = (val, color, label) => `
        <div class="att-kpi-box">
          <div class="att-kpi-val" style="color:${color};">${val}</div>
          <div class="att-kpi-label">${label}</div>
        </div>`;
      kpi.innerHTML =
        box(cntFull + cntHalfOut, '#10B981', 'Ngày có mặt') +
        box(cntFull,              '#3B82F6', 'Đủ công')      +
        box(cntHalfOut,           '#F59E0B', 'Chưa ra')      +
        box(cntAbsent,            '#6B7280', 'Vắng / chưa chấm');
    }
  };

  // ==========================================================================
  // SUBSCRIBE: Real-time theo dõi trạng thái hôm nay
  // ==========================================================================
  const subscribeTodayStatus = (uid) => {
    if (_todayUnsubscribe) { _todayUnsubscribe(); _todayUnsubscribe = null; }
    const docId = `${uid}_${todayStr()}`;
    _todayUnsubscribe = db().collection('checkin_logs').doc(docId)
      .onSnapshot(doc => renderTodayCard(doc.exists ? doc.data() : null));
  };

  // ==========================================================================
  // LOAD: Dữ liệu tháng
  // ==========================================================================
  const loadMonthData = async (monthStr) => {
    const user = auth().currentUser;
    if (!user) return;

    const monthInput = document.getElementById('attMonth');
    if (monthInput) monthInput.value = monthStr;

    try {
      const snap = await db().collection('checkin_logs')
        .where('uid',   '==', user.uid)
        .where('month', '==', monthStr)
        .get();
      renderMonthView(snap.docs.map(d => d.data()), monthStr);
    } catch (err) {
      console.error('Lỗi tải dữ liệu tháng:', err);
    }
  };

  // ==========================================================================
  // CORE: Chấm công vào / ra
  // ==========================================================================
  const doCheckin = async (type) => {
    const user = auth().currentUser;
    if (!user) { svcToast('Bạn chưa đăng nhập!', 'error'); return; }

    const btnId = type === 'checkin' ? 'btnCheckin' : 'btnCheckout';
    const btn   = document.getElementById(btnId);
    const orig  = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Đang xử lý...'; }

    try {
      const [clientIp, configDoc, userDoc] = await Promise.all([
        fetchPublicIp(),
        db().doc(WIFI_DOC).get(),
        db().collection('users').doc(user.uid).get(),
      ]);

      const cfg = configDoc.exists ? configDoc.data() : null;
      if (!cfg) {
        svcToast('Admin chưa cấu hình IP văn phòng!', 'error'); return;
      }

      // Hỗ trợ cả allowed_prefixes (dải) và public_ip (IP chính xác)
      const prefixes = cfg.allowed_prefixes || (cfg.public_ip ? [cfg.public_ip] : []);
      if (!prefixes.length) {
        svcToast('Admin chưa cấu hình IP văn phòng!', 'error'); return;
      }
      const matched = prefixes.some(p =>
        p.endsWith('.') ? clientIp.startsWith(p) : clientIp === p
      );
      if (!matched) {
        svcToast(`Không hợp lệ! IP của bạn (${clientIp}) không thuộc mạng văn phòng.`, 'error'); return;
      }

      const name    = userDoc.exists ? (userDoc.data().name || user.email) : user.email;
      const dateStr = todayStr();
      const month   = currentMonthStr();
      const docId   = `${user.uid}_${dateStr}`;

      const update = { uid: user.uid, name, email: user.email, date: dateStr, month };
      if (type === 'checkin') {
        update.checkin_time = firebase.firestore.FieldValue.serverTimestamp();
        update.checkin_ip   = clientIp;
      } else {
        update.checkout_time = firebase.firestore.FieldValue.serverTimestamp();
        update.checkout_ip   = clientIp;
      }

      await db().collection('checkin_logs').doc(docId).set(update, { merge: true });

      // Đồng bộ lên bảng admin (collection "attendance" dùng staffId từ hrm_staff)
      try {
        const staffSnap = await db().collection('hrm_staff')
          .where('email', '==', user.email).limit(1).get();
        if (!staffSnap.empty) {
          const staffId   = staffSnap.docs[0].id;
          const staffName = staffSnap.docs[0].data().name || name;
          const day       = String(parseInt(dateStr.split('-')[2])); // "07" → "7"
          const logEntry  = {
            time: firebase.firestore.FieldValue.serverTimestamp(),
            ip: clientIp,
            uid: user.uid,
            type
          };
          await db().collection('attendance').doc(`${staffId}_${month}`).set({
            staffId, staffName, uid: user.uid,
            email: user.email, month,
            days:      { [day]: '1' },
            checkLogs: { [day]: logEntry },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      } catch (syncErr) {
        console.warn('Không đồng bộ được lên attendance:', syncErr);
      }

      const label = type === 'checkin' ? '✅ Chấm công vào thành công!' : '🚪 Chấm công ra thành công!';
      svcToast(label, 'success');

      const monthInput = document.getElementById('attMonth');
      const shownMonth = monthInput?.value || currentMonthStr();
      if (shownMonth === month) await loadMonthData(month);

    } catch (err) {
      console.error('Lỗi chấm công:', err);
      svcToast('Lỗi: ' + err.message, 'error');
    } finally {
      // Luôn khôi phục nút — kể cả khi thất bại hoặc return sớm
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
  };

  // ==========================================================================
  // ADMIN: Lưu IP văn phòng
  // ==========================================================================
  const saveOfficeIp = async () => {
    const input = document.getElementById('hrmOfficeIpInput');
    const ip = (input?.value || '').trim();
    const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!IPV4.test(ip) || ip.split('.').some(o => Number(o) > 255)) {
      svcToast('IP không hợp lệ! Ví dụ: 14.161.22.33', 'error'); return;
    }
    const btn = document.getElementById('btnSaveOfficeIp');
    const orig = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Đang lưu...'; }
    try {
      await db().doc(WIFI_DOC).set({
        public_ip: ip,
        label: 'Văn phòng',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth().currentUser?.email || null,
      });
      const el = document.getElementById('hrmCurrentOfficeIp');
      if (el) el.textContent = ip;
      svcToast(`Đã lưu IP văn phòng: ${ip}`, 'success');
    } catch (err) {
      svcToast('Lỗi lưu IP: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
  };

  const loadOfficeIpDisplay = async () => {
    try {
      const doc = await db().doc(WIFI_DOC).get();
      const ip = doc.exists ? doc.data().public_ip : null;
      const el = document.getElementById('hrmCurrentOfficeIp');
      if (el) el.textContent = ip || 'Chưa cấu hình';
      const input = document.getElementById('hrmOfficeIpInput');
      if (input && !input.value && ip) input.value = ip;
    } catch {}
  };

  // ==========================================================================
  // INIT: Khởi động dashboard chấm công nhân viên
  // ==========================================================================
  const init = () => {
    // Hiển thị ngày hôm nay (không cần user)
    const todayLabel = document.getElementById('att-today-label');
    if (todayLabel) {
      todayLabel.textContent = new Date().toLocaleDateString('vi-VN', {
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
      });
    }

    // Month input
    const monthInput = document.getElementById('attMonth');
    if (monthInput && !monthInput.value) monthInput.value = currentMonthStr();

    // Gắn sự kiện nút (chỉ 1 lần, không cần user ở đây)
    const once = (id, fn) => {
      const el = document.getElementById(id);
      if (el && !el.dataset.attBound) { el.dataset.attBound = '1'; el.addEventListener('click', fn); }
    };
    once('btnCheckin',  () => doCheckin('checkin'));
    once('btnCheckout', () => doCheckin('checkout'));
    once('btnAttPrev',  () => {
      const m = shiftMonth(monthInput?.value || currentMonthStr(), -1);
      loadMonthData(m);
    });
    once('btnAttNext',  () => {
      const m = shiftMonth(monthInput?.value || currentMonthStr(), 1);
      loadMonthData(m);
    });
    if (monthInput && !monthInput.dataset.attBound) {
      monthInput.dataset.attBound = '1';
      monthInput.addEventListener('change', () => loadMonthData(monthInput.value));
    }

    // Lấy user để load dữ liệu — dùng onAuthStateChanged phòng trường hợp auth chưa sẵn sàng
    const user = auth().currentUser;
    if (user) {
      subscribeTodayStatus(user.uid);
      loadMonthData(monthInput?.value || currentMonthStr());
    } else {
      const unsub = auth().onAuthStateChanged((u) => {
        unsub();
        if (!u) return;
        subscribeTodayStatus(u.uid);
        loadMonthData(monthInput?.value || currentMonthStr());
      });
    }
  };

  window.AttendanceService = { init, doCheckin, loadMonthData, saveOfficeIp, loadOfficeIpDisplay };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnSaveOfficeIp')?.addEventListener('click', saveOfficeIp);
    document.getElementById('btnSuggestPublicIp')?.addEventListener('click', async () => {
      try {
        const ip = await fetchPublicIp();
        const input = document.getElementById('hrmOfficeIpInput');
        if (input) input.value = ip;
        svcToast(`IP Public hiện tại: ${ip} — Kiểm tra rồi bấm Lưu.`, 'info');
      } catch (e) { svcToast('Không lấy được IP: ' + e.message, 'error'); }
    });
  });
})();
