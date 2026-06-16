/* ==========================================================================
   ATTENDANCE LAN SERVER — Máy chấm công nội bộ
   Chạy server này trên một máy/Raspberry Pi nằm trong mạng văn phòng (LAN).
   Nhân viên (trên cùng mạng) gọi tới server này để chấm công; server tự bắt
   IP nguồn (client IP) thật từ kết nối TCP — không qua proxy nào can thiệp
   được — và đối chiếu với IP tĩnh (Gateway/Server) do Admin cấu hình.

   Chạy:
     npm install
     npm run attendance-server
   Mặc định lắng nghe ở cổng 4500 trên TẤT CẢ network interface (0.0.0.0)
   để các máy khác trong cùng mạng LAN gọi vào được, ví dụ:
     http://192.168.1.10:4500/api/checkin
   ========================================================================== */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const PORT = process.env.ATTENDANCE_SERVER_PORT || 4500;
const CONFIG_PATH = path.join(__dirname, 'config.json');
const ADMIN_KEY = process.env.ATTENDANCE_ADMIN_KEY || 'aladdin-admin-key'; // đổi qua biến môi trường khi deploy thật

const app = express();
app.set('trust proxy', false); // KHÔNG tin header X-Forwarded-For — chỉ tin IP socket thật (chống giả mạo)
app.use(cors());
app.use(express.json());

// ---- Đọc / Lưu cấu hình IP tĩnh + subnet mask ----
const loadConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { allowed_ip: null, subnet_octets: 3 }; // mặc định so khớp subnet lớp C (3 octet đầu)
  }
};

const saveConfig = (cfg) => {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
};

// ---- Chuẩn hoá IP lấy từ socket (bỏ tiền tố IPv6-mapped "::ffff:") ----
const normalizeIp = (ip) => {
  if (!ip) return ip;
  if (ip === '::1') return '127.0.0.1';
  return ip.startsWith('::ffff:') ? ip.substring(7) : ip;
};

// ---- So khớp dải mạng (subnet) theo N octet đầu ----
const isSameSubnet = (ipA, ipB, octets = 3) => {
  if (!ipA || !ipB) return false;
  if (ipA === ipB) return true;
  const a = ipA.split('.');
  const b = ipB.split('.');
  if (a.length !== 4 || b.length !== 4) return false;
  for (let i = 0; i < octets; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const requireAdminKey = (req, res, next) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  next();
};

// ---- Health check ----
app.get('/api/status', (req, res) => {
  const cfg = loadConfig();
  res.json({ ok: true, allowed_ip: cfg.allowed_ip, subnet_octets: cfg.subnet_octets });
});

// ---- ADMIN: thiết lập IP tĩnh văn phòng (đồng bộ với Firestore từ phía client) ----
app.post('/api/admin/set-ip', requireAdminKey, (req, res) => {
  const { allowed_ip, subnet_octets } = req.body || {};
  if (!allowed_ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(allowed_ip)) {
    return res.status(400).json({ error: 'INVALID_IP' });
  }
  const cfg = { allowed_ip, subnet_octets: Number(subnet_octets) || 3 };
  saveConfig(cfg);
  res.json({ ok: true, ...cfg });
});

// ---- NHÂN VIÊN: chấm công — server tự bắt IP nguồn thật từ socket TCP ----
app.post('/api/checkin', (req, res) => {
  const cfg = loadConfig();
  const clientIp = normalizeIp(req.socket.remoteAddress);

  if (!cfg.allowed_ip) {
    return res.status(400).json({ valid: false, reason: 'NOT_CONFIGURED', clientIp });
  }

  const valid = isSameSubnet(clientIp, cfg.allowed_ip, cfg.subnet_octets);
  res.json({
    valid,
    clientIp,
    allowedIp: cfg.allowed_ip,
    reason: valid ? null : 'IP_OUT_OF_SUBNET'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Attendance LAN Server] Đang chạy tại http://0.0.0.0:${PORT}`);
  console.log('Nhân viên trong mạng văn phòng gọi tới địa chỉ LAN của máy này, ví dụ: http://192.168.1.10:' + PORT);
});
