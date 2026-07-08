const path = require('path');
const { initializeApp, cert }      = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth }                  = require('firebase-admin/auth');

initializeApp({ credential: cert(require(path.join(__dirname, 'service-account.json'))) });

const db   = getFirestore();
const auth = getAuth();

const PASSWORD = '123456';

async function createAccounts() {
  // Fetch all students from Firestore
  const snap = await db.collection('students').get();
  if (snap.empty) {
    console.log('Không có học viên nào trong Firestore.');
    process.exit(0);
  }

  const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Tìm thấy ${students.length} học viên. Bắt đầu tạo tài khoản...\n`);

  let created = 0, skipped = 0, failed = 0;

  for (const s of students) {
    const email = (s.email || '').trim();
    const name  = s.name || 'Học viên';

    if (!email) {
      console.log(`⏭  Bỏ qua (không có email): ${name}`);
      skipped++;
      continue;
    }

    try {
      // 1. Create Firebase Auth user (skip if already exists)
      let uid;
      try {
        const existing = await auth.getUserByEmail(email);
        uid = existing.uid;
        console.log(`⚠️  Đã tồn tại Auth: ${email}`);
      } catch {
        const userRecord = await auth.createUser({
          email,
          password: PASSWORD,
          displayName: name,
        });
        uid = userRecord.uid;
        console.log(`✅ Tạo Auth: ${email}`);
        created++;
      }

      // 2. Create / update users document in Firestore
      await db.collection('users').doc(uid).set({
        name,
        email,
        role: 'student',
        defaultPassword: PASSWORD,
        passwordChanged: false,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      console.log(`   📄 users/${uid} → role: student (${name})`);
    } catch (err) {
      console.error(`❌ Lỗi ${email}:`, err.message);
      failed++;
    }
  }

  console.log(`\n=============================`);
  console.log(`Tổng: ${students.length} học viên`);
  console.log(`✅ Tạo mới: ${created}`);
  console.log(`⚠️  Đã tồn tại (cập nhật): ${students.length - created - skipped - failed}`);
  console.log(`⏭  Bỏ qua (không email): ${skipped}`);
  console.log(`❌ Lỗi: ${failed}`);
  console.log(`=============================`);
  process.exit(0);
}

createAccounts();
