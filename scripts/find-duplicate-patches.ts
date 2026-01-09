/**
 * 중복된 패치 엔트리를 찾는 스크립트
 * Usage: npx tsx scripts/find-duplicate-patches.ts
 */

import { initFirebaseAdmin } from './lib/firebase-admin';

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

type CharacterData = {
  name: string;
  patchHistory: PatchEntry[];
};

async function findDuplicatePatches(): Promise<void> {
  console.log('중복 패치 검색 시작...\n');

  const db = initFirebaseAdmin();
  const charactersSnapshot = await db.collection('characters').get();
  let totalDuplicates = 0;

  for (const doc of charactersSnapshot.docs) {
    const charData = doc.data() as CharacterData;
    const characterName = doc.id;

    // patchId별로 그룹화
    const patchIdCounts = new Map<number, number>();
    for (const patch of charData.patchHistory) {
      const count = patchIdCounts.get(patch.patchId) || 0;
      patchIdCounts.set(patch.patchId, count + 1);
    }

    // 중복된 patchId 찾기
    const duplicates: number[] = [];
    for (const [patchId, count] of patchIdCounts) {
      if (count > 1) {
        duplicates.push(patchId);
      }
    }

    if (duplicates.length > 0) {
      console.log(`\n[${characterName}] 중복 발견:`);
      for (const patchId of duplicates) {
        const count = patchIdCounts.get(patchId)!;
        console.log(`  - patchId ${patchId}: ${count}번 중복`);
        totalDuplicates += count - 1;
      }
    }
  }

  if (totalDuplicates === 0) {
    console.log('중복된 패치가 없습니다.');
  } else {
    console.log(`\n총 ${totalDuplicates}개의 중복 엔트리 발견`);
  }
}

findDuplicatePatches()
  .then(() => {
    console.log('\n완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('오류:', error);
    process.exit(1);
  });
