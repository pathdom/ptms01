const path = require('path');
const { initializeApp, cert }      = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth }                  = require('firebase-admin/auth');

initializeApp({ credential: cert(require(path.join(__dirname, 'service-account.json'))) });

const db   = getFirestore();
const auth = getAuth();

const PASSWORD = '123456';

async function createAccounts() {
  // 1. Fetch all students from Firestore
  const snap = await db.collection('students').get();
  const students = snap.empty ? [] : snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Tìm thấy ${students.length} học viên từ hồ sơ.`);

  let created = 0, reset = 0, skipped = 0, failed = 0;

  for (const s of students) {
    const email = (s.email || '').trim();
    const name  = s.name || 'Học viên';

    if (!email) {
      console.log(`⏭  Bỏ qua (không có email): ${name}`);
      skipped++;
      continue;
    }

    try {
      let uid;
      try {
        const existing = await auth.getUserByEmail(email);
        uid = existing.uid;
        // Reset password for existing Auth user
        await auth.updateUser(uid, {
          password: PASSWORD,
          displayName: name,
        });
        console.log(`🔄 Reset mật khẩu Auth: ${email}`);
        reset++;
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          const userRecord = await auth.createUser({
            email,
            password: PASSWORD,
            displayName: name,
          });
          uid = userRecord.uid;
          console.log(`✅ Tạo mới Auth: ${email}`);
          created++;
        } else {
          throw err;
        }
      }

      // Create / update users document in Firestore
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

  // 2. Fetch all users from Firestore with role === 'student' to catch any other student accounts
  console.log(`\nQuét tiếp các tài khoản trong collection 'users' có role = 'student'...`);
  const usersSnap = await db.collection('users').where('role', '==', 'student').get();
  let extraReset = 0;

  for (const doc of usersSnap.docs) {
    const uData = doc.data();
    const uUid = doc.id;
    const uEmail = (uData.email || '').trim();
    const uName = uData.name || 'Học viên';

    if (!uEmail) continue;

    // Check if already processed from students collection
    const alreadyProcessed = students.some(s => (s.email || '').trim().toLowerCase() === uEmail.toLowerCase());
    if (alreadyProcessed) continue;

    try {
      // Reset Auth password
      await auth.updateUser(uUid, {
        password: PASSWORD,
        displayName: uName,
      });

      // Update users collection document
      await db.collection('users').doc(uUid).set({
        defaultPassword: PASSWORD,
        passwordChanged: false,
      }, { merge: true });

      console.log(`🔄 Reset tài khoản học viên bổ sung (ngoài hồ sơ): ${uEmail}`);
      extraReset++;
    } catch (err) {
      console.error(`❌ Lỗi reset tài khoản bổ sung ${uEmail}:`, err.message);
      failed++;
    }
  }

  console.log(`\n=============================`);
  console.log(`Hoàn tất đồng bộ db học viên:`);
  console.log(`✅ Tạo mới Auth & Firestore: ${created}`);
  console.log(`🔄 Reset mật khẩu (trong hồ sơ): ${reset}`);
  console.log(`🔄 Reset mật khẩu (ngoài hồ sơ): ${extraReset}`);
  console.log(`⏭  Bỏ qua (không email): ${skipped}`);
  console.log(`❌ Lỗi: ${failed}`);
  console.log(`=============================`);
  process.exit(0);
}

createAccounts();
