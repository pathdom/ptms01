/* ==========================================================================
   ATTENDANCE SERVER — Chấm công qua Public IP
   Chạy: node server/attendance-server.js  (hoặc npm run attendance-server)

   Endpoints:
     GET  /api/status                          → kiểm tra server + cấu hình IP hiện tại
     POST /api/admin/set-ip  (x-admin-key)     → Admin lưu Public IP công ty
     POST /api/checkin                          → Nhân viên chấm công / checkout
   ========================================================================== */

const path = require('path');
const express = require('express');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp({ credential: cert(require(path.join(__dirname, 'service-account.json'))) });
const db = getFirestore();

const PORT = process.env.ATTENDANCE_PORT || 4500;
const ADMIN_KEY = process.env.ATTENDANCE_ADMIN_KEY || 'aladdin-admin-key';
const WIFI_CONFIG_DOC = 'wifi_configs/office';

const app = express();
app.set('trust proxy', true); // bật để đọc đúng IP qua reverse proxy / cloud
app.use(cors());
app.use(express.json());

// ---- Lấy Public IP thật của request ----
const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
  // bỏ tiền tố IPv6-mapped
  return ip?.replace(/^::ffff:/, '') ?? null;
};

// ---- Middleware xác thực Admin key ----
const requireAdmin = (_req, res, next) => {
  if (_req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  next();
};

// ------------------------------------------------------------------
// GET /api/status — health check
// ------------------------------------------------------------------
app.get('/api/status', async (req, res) => {
  try {
    const doc = await db.doc(WIFI_CONFIG_DOC).get();
    const cfg = doc.exists ? doc.data() : null;
    res.json({ ok: true, config: cfg });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ------------------------------------------------------------------
// POST /api/admin/set-ip — Admin lưu Public IP công ty lên Firestore
// Body: { public_ip: "14.161.xx.xx", label: "Văn phòng HN" }
// ------------------------------------------------------------------
app.post('/api/admin/set-ip', requireAdmin, async (req, res) => {
  const { public_ip, label } = req.body || {};
  if (!public_ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(public_ip)) {
    return res.status(400).json({ error: 'INVALID_IP' });
  }
  await db.doc(WIFI_CONFIG_DOC).set({
    public_ip,
    label: label || 'Văn phòng',
    updatedAt: FieldValue.serverTimestamp()
  });
  res.json({ ok: true, public_ip, label });
});

// ------------------------------------------------------------------
// POST /api/checkin — Nhân viên chấm công
// Body: { uid, name, email, type: "checkin" | "checkout" }
// Server tự đọc IP từ request — client không cần gửi IP
// ------------------------------------------------------------------
app.post('/api/checkin', async (req, res) => {
  const { uid, name, email, type = 'checkin' } = req.body || {};

  if (!uid || !email) {
    return res.status(400).json({ error: 'MISSING_FIELDS', valid: false });
  }

  const clientIp = getClientIp(req);

  // Đọc cấu hình IP công ty từ Firestore
  const configDoc = await db.doc(WIFI_CONFIG_DOC).get();
  if (!configDoc.exists) {
    return res.status(400).json({ error: 'NO_CONFIG', valid: false,
      message: 'Admin chưa cấu hình IP công ty. Gọi POST /api/admin/set-ip trước.' });
  }

  const { public_ip: allowedIp } = configDoc.data();
  const valid = clientIp === allowedIp;

  // Ghi log vào Firestore dù hợp lệ hay không (để audit)
  const log = {
    uid, name: name || '', email,
    type,
    timestamp: FieldValue.serverTimestamp(),
    client_ip: clientIp,
    valid,
    reason: valid ? null : 'IP_MISMATCH'
  };
  const logRef = await db.collection('checkin_logs').add(log);

  if (!valid) {
    return res.status(403).json({
      valid: false,
      reason: 'IP_MISMATCH',
      clientIp,
      allowedIp,
      message: 'Bạn không ở trong mạng Wi-Fi công ty.'
    });
  }

  res.json({
    valid: true,
    type,
    clientIp,
    logId: logRef.id,
    message: type === 'checkin' ? 'Chấm công vào thành công!' : 'Chấm công ra thành công!'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Attendance Server] http://0.0.0.0:${PORT}`);
  console.log('Endpoints: GET /api/status | POST /api/admin/set-ip | POST /api/checkin');
});
