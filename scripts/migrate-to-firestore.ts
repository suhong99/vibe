/**
 * JSON 데이터를 Firestore로 마이그레이션하는 스크립트
 * 실행: npx tsx scripts/migrate-to-firestore.ts
 */

import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import path from 'path';

// 타입 정의
type ChangeType = 'buff' | 'nerf' | 'mixed';

type Change = {
  target: string;
  stat: string;
  before: string;
  after: string;
  changeType: ChangeType;
};

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: ChangeType;
  streak: number;
  devComment: string | null;
  changes: Change[];
};

type CharacterStats = {
  totalPatches: number;
  buffCount: number;
  nerfCount: number;
  mixedCount: number;
  currentStreak: { type: ChangeType | null; count: number };
  maxBuffStreak: number;
  maxNerfStreak: number;
};

type Character = {
  name: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};

type BalanceChangesData = {
  updatedAt: string;
  characters: Record<string, Character>;
};

type PatchNote = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string;
  viewCount: number;
};

type PatchNotesData = {
  crawledAt: string;
  totalCount: number;
  patchNotes: PatchNote[];
};

// Firebase 초기화
const initFirebase = (): Firestore => {
  const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
  const serviceAccount = JSON.parse(
    readFileSync(serviceAccountPath, 'utf-8')
  ) as ServiceAccount;

  initializeApp({
    credential: cert(serviceAccount),
  });

  return getFirestore();
};

// 배치 쓰기로 캐릭터 데이터 마이그레이션
const migrateCharacters = async (
  db: Firestore,
  data: BalanceChangesData
): Promise<void> => {
  const characters = Object.values(data.characters);
  const batchSize = 500; // Firestore 배치 제한

  console.log(`캐릭터 ${characters.length}개 마이그레이션 시작...`);

  for (let i = 0; i < characters.length; i += batchSize) {
    const batch = db.batch();
    const chunk = characters.slice(i, i + batchSize);

    for (const character of chunk) {
      const docRef = db.collection('characters').doc(character.name);
      batch.set(docRef, {
        name: character.name,
        stats: character.stats,
        patchHistory: character.patchHistory,
      });
    }

    await batch.commit();
    console.log(`  - ${Math.min(i + batchSize, characters.length)}/${characters.length} 완료`);
  }

  // 메타데이터 저장
  await db.collection('metadata').doc('balanceChanges').set({
    updatedAt: data.updatedAt,
    characterCount: characters.length,
  });

  console.log('캐릭터 마이그레이션 완료!');
};

// 패치노트 마이그레이션
const migratePatchNotes = async (
  db: Firestore,
  data: PatchNotesData
): Promise<void> => {
  const batchSize = 500;

  console.log(`패치노트 ${data.patchNotes.length}개 마이그레이션 시작...`);

  for (let i = 0; i < data.patchNotes.length; i += batchSize) {
    const batch = db.batch();
    const chunk = data.patchNotes.slice(i, i + batchSize);

    for (const patchNote of chunk) {
      const docRef = db.collection('patchNotes').doc(patchNote.id.toString());
      batch.set(docRef, patchNote);
    }

    await batch.commit();
    console.log(`  - ${Math.min(i + batchSize, data.patchNotes.length)}/${data.patchNotes.length} 완료`);
  }

  // 메타데이터 저장
  await db.collection('metadata').doc('patchNotes').set({
    crawledAt: data.crawledAt,
    totalCount: data.totalCount,
  });

  console.log('패치노트 마이그레이션 완료!');
};

// 메인 실행
const main = async (): Promise<void> => {
  console.log('=== Firestore 마이그레이션 시작 ===\n');

  const db = initFirebase();

  // JSON 파일 읽기
  const balanceChangesPath = path.join(process.cwd(), 'data', 'balance-changes.json');
  const patchNotesPath = path.join(process.cwd(), 'data', 'patch-notes.json');

  const balanceChanges: BalanceChangesData = JSON.parse(
    readFileSync(balanceChangesPath, 'utf-8')
  );
  const patchNotes: PatchNotesData = JSON.parse(
    readFileSync(patchNotesPath, 'utf-8')
  );

  // 마이그레이션 실행
  await migrateCharacters(db, balanceChanges);
  console.log('');
  await migratePatchNotes(db, patchNotes);

  console.log('\n=== 마이그레이션 완료 ===');
  process.exit(0);
};

main().catch((error) => {
  console.error('마이그레이션 실패:', error);
  process.exit(1);
});
