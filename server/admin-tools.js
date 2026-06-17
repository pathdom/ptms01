const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ credential: cert(require(path.join(__dirname, 'service-account.json'))) });
const auth = getAuth();
const db = getFirestore();

// ---- Liệt kê toàn bộ Auth users (phân trang) ----
const listAllAuthUsers = async () => {
  const users = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
};

// ---- Lấy role từ Firestore users collection ----
const getUserRoles = async () => {
  const snap = await db.collection('users').get();
  const map = {};
  snap.forEach(doc => { map[doc.id] = (doc.data().role || '').toLowerCase(); });
  return map;
};

// ---- Liệt kê tất cả users (Auth + role Firestore) ----
const listUsers = async () => {
  const [authUsers, roleMap] = await Promise.all([listAllAuthUsers(), getUserRoles()]);
  console.log(`\nTổng ${authUsers.length} tài khoản trong Firebase Auth:\n`);
  authUsers.forEach((u, i) => {
    const role = roleMap[u.uid] || '(không có trong Firestore)';
    console.log(`[${i + 1}] ${u.email || '(no email)'} | role: ${role} | uid: ${u.uid}`);
  });
};

// ---- Xóa toàn bộ nhân viên (giữ lại admin + student) ----
const purgeStaff = async () => {
  const [authUsers, roleMap] = await Promise.all([listAllAuthUsers(), getUserRoles()]);

  const toDelete = authUsers.filter(u => {
    const role = roleMap[u.uid] || '';
    return role !== 'admin' && role !== 'student';
  });

  if (!toDelete.length) {
    console.log('Không có tài khoản nhân viên nào cần xóa.');
    return;
  }

  console.log(`\nSắp xóa ${toDelete.length} tài khoản:\n`);
  toDelete.forEach(u => console.log(` - ${u.email} (uid: ${u.uid})`));

  for (const u of toDelete) {
    await auth.deleteUser(u.uid);
    // Xóa document Firestore nếu có
    try { await db.collection('hrm_staff').doc(u.uid).delete(); } catch {}
    try { await db.collection('users').doc(u.uid).delete(); } catch {}
    console.log(`Đã xóa: ${u.email}`);
  }

  console.log(`\nHoàn tất. Đã xóa ${toDelete.length} tài khoản nhân viên.`);
};

// ---- Liệt kê Firestore collection bất kỳ ----
const parseValue = (val) => {
  if (!val) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return Number(val.integerValue);
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.nullValue !== undefined) return null;
  if (val.mapValue) return parseFields(val.mapValue.fields || {});
  if (val.arrayValue) return (val.arrayValue.values || []).map(parseValue);
  return val;
};
const parseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, parseValue(v)]));

const listCollection = async (name) => {
  const snap = await db.collection(name).get();
  if (snap.empty) { console.log(`Collection "${name}" đang trống.`); return; }
  console.log(`\nCollection "${name}" — ${snap.size} document:\n`);
  snap.forEach(doc => {
    console.log(`[${doc.id}]`, JSON.stringify(doc.data(), null, 2));
  });
};

const main = async () => {
  const cmd = process.argv[2];
  switch (cmd) {
    case 'list-users':    await listUsers(); break;
    case 'purge-staff':   await purgeStaff(); break;
    case 'list':          await listCollection(process.argv[3] || 'users'); break;
    default:
      console.log('Dùng:\n  node server/admin-tools.js list-users\n  node server/admin-tools.js purge-staff\n  node server/admin-tools.js list <collection>');
  }
  process.exit(0);
};

main().catch(err => { console.error('Lỗi:', err.message); process.exit(1); });
