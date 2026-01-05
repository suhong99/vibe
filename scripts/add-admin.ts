import { initFirebaseAdmin } from './lib/firebase-admin';

async function addAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;

  if (!email) {
    console.error('ADMIN_EMAIL 환경변수가 필요합니다.');
    console.log('사용법: ADMIN_EMAIL=your@email.com npx tsx scripts/add-admin.ts');
    process.exit(1);
  }

  const db = initFirebaseAdmin();

  await db
    .collection('metadata')
    .doc('admins')
    .set({
      emails: [email],
      updatedAt: new Date().toISOString(),
    });

  console.log(`관리자 등록 완료: ${email}`);
}

addAdmin().catch(console.error);
