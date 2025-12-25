/**
 * 수정된 balance-changes.json 데이터를 Firebase에 업로드하는 스크립트
 */

import * as fs from 'fs';
import * as path from 'path';
import { initFirebaseAdmin } from './lib/firebase-admin';

type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';
type ChangeType = 'buff' | 'nerf' | 'mixed';

type Change = {
  target: string;
  stat: string;
  before: string;
  after: string;
  changeType: ChangeType;
  changeCategory: ChangeCategory;
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
  currentStreak: {
    type: ChangeType | null;
    count: number;
  };
  maxBuffStreak: number;
  maxNerfStreak: number;
};

type CharacterData = {
  name: string;
  nameEn?: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};

type BalanceData = {
  updatedAt: string;
  characters: Record<string, CharacterData>;
};

const DATA_PATH = path.join(__dirname, '..', 'data', 'balance-changes.json');

async function uploadToFirebase(): Promise<void> {
  console.log('수정된 데이터를 Firebase에 업로드합니다...\n');

  // 데이터 로드
  const rawData = fs.readFileSync(DATA_PATH, 'utf-8');
  const data: BalanceData = JSON.parse(rawData);

  const db = initFirebaseAdmin();
  const characters = Object.entries(data.characters);

  console.log(`총 ${characters.length}개 캐릭터 데이터 업로드 시작...\n`);

  // 배치 처리 (500개 단위)
  const batchSize = 500;

  for (let i = 0; i < characters.length; i += batchSize) {
    const batch = db.batch();
    const chunk = characters.slice(i, i + batchSize);

    for (const [name, charData] of chunk) {
      const docRef = db.collection('characters').doc(name);
      batch.set(docRef, charData);
    }

    await batch.commit();
    console.log(`  ${Math.min(i + batchSize, characters.length)}/${characters.length} 캐릭터 저장 완료`);
  }

  // 메타데이터 업데이트
  await db.collection('metadata').doc('balanceChanges').set(
    {
      updatedAt: new Date().toISOString(),
      characterCount: characters.length,
      dataVersion: 'v2-with-changeCategory',
    },
    { merge: true }
  );

  // 통계 출력
  let totalChanges = 0;
  const categoryCount: Record<ChangeCategory, number> = {
    numeric: 0,
    mechanic: 0,
    added: 0,
    removed: 0,
    unknown: 0,
  };

  for (const [, charData] of characters) {
    for (const patch of charData.patchHistory) {
      for (const change of patch.changes) {
        totalChanges++;
        categoryCount[change.changeCategory || 'unknown']++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Firebase 업로드 완료');
  console.log('='.repeat(60));
  console.log(`캐릭터: ${characters.length}명`);
  console.log(`총 변경사항: ${totalChanges}개`);
  console.log('');
  console.log('=== 카테고리 분포 ===');
  console.log(`  numeric (수치 변경): ${categoryCount.numeric}개`);
  console.log(`  mechanic (메커니즘 변경): ${categoryCount.mechanic}개`);
  console.log(`  added (효과 추가): ${categoryCount.added}개`);
  console.log(`  removed (효과 제거): ${categoryCount.removed}개`);
  console.log(`  unknown (미분류): ${categoryCount.unknown}개`);
}

uploadToFirebase().catch(console.error);
