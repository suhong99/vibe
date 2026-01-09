/**
 * 중복된 패치 엔트리를 제거하는 스크립트
 * Usage: npx tsx scripts/fix-duplicate-patches.ts
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

async function fixDuplicatePatches(): Promise<void> {
  console.log('중복 패치 제거 시작...\n');

  const db = initFirebaseAdmin();
  const charactersSnapshot = await db.collection('characters').get();
  let totalFixed = 0;

  for (const doc of charactersSnapshot.docs) {
    const charData = doc.data() as CharacterData;
    const characterName = doc.id;

    // patchId별로 첫 번째 엔트리만 유지 (중복 제거)
    const seenPatchIds = new Set<number>();
    const uniquePatches: PatchEntry[] = [];
    let duplicatesRemoved = 0;

    for (const patch of charData.patchHistory) {
      if (seenPatchIds.has(patch.patchId)) {
        duplicatesRemoved++;
      } else {
        seenPatchIds.add(patch.patchId);
        uniquePatches.push(patch);
      }
    }

    if (duplicatesRemoved > 0) {
      console.log(`[${characterName}] ${duplicatesRemoved}개 중복 제거`);

      // Firestore 업데이트
      await db.collection('characters').doc(characterName).update({
        patchHistory: uniquePatches,
      });

      totalFixed += duplicatesRemoved;
    }
  }

  if (totalFixed === 0) {
    console.log('제거할 중복이 없습니다.');
  } else {
    console.log(`\n총 ${totalFixed}개의 중복 엔트리 제거 완료`);
  }
}

fixDuplicatePatches()
  .then(() => {
    console.log('\n완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('오류:', error);
    process.exit(1);
  });
