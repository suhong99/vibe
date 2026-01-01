/**
 * 패치 수정본 Firebase 적용 스크립트
 * - data/patch-fixes.json의 수정 내용을 Firebase에 반영
 * - --dry-run 옵션으로 실제 반영 없이 확인 가능
 */

import { initFirebaseAdmin } from './lib/firebase-admin';
import { readFileSync, existsSync } from 'fs';

// ============================================
// 타입 정의
// ============================================

type ChangeType = 'buff' | 'nerf' | 'mixed';

type NumericChange = {
  target: string;
  stat: string;
  before: string;
  after: string;
  changeType: ChangeType;
  changeCategory: 'numeric';
};

type DescriptionChange = {
  target: string;
  description: string;
  changeType: ChangeType;
  changeCategory: 'mechanic' | 'added' | 'removed' | 'unknown';
};

type Change = NumericChange | DescriptionChange;

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: ChangeType;
  streak: number;
  devComment: string | null;
  changes: Change[];
};

type CharacterData = {
  name: string;
  nameEn: string;
  patchHistory: PatchEntry[];
};

type FixEntry = {
  characterName: string;
  patchId: number;
  patchVersion: string;
  oldData: {
    devComment: string | null;
    changes: Change[];
  };
  newData: {
    devComment: string | null;
    changes: Change[];
  };
  diff: {
    commentChanged: boolean;
    oldCommentLength: number;
    newCommentLength: number;
    oldChangeCount: number;
    newChangeCount: number;
    addedChanges: number;
  };
};

type FixesFile = {
  generatedAt: string;
  totalFixes: number;
  summary: {
    patchesProcessed: number;
    charactersAffected: number;
    totalAddedChanges: number;
    commentsFixes: number;
  };
  fixes: FixEntry[];
};

// ============================================
// 버프/너프 판별 (streak 계산용)
// ============================================

function determineOverallChange(changes: Change[]): ChangeType {
  const buffCount = changes.filter((c) => c.changeType === 'buff').length;
  const nerfCount = changes.filter((c) => c.changeType === 'nerf').length;

  if (buffCount > 0 && nerfCount === 0) return 'buff';
  if (nerfCount > 0 && buffCount === 0) return 'nerf';
  return 'mixed';
}

function calculateStreak(history: PatchEntry[], newOverall: ChangeType): number {
  if (history.length === 0) {
    return newOverall === 'buff' ? 1 : newOverall === 'nerf' ? -1 : 0;
  }

  const lastPatch = history[0]; // 가장 최근 패치
  const lastStreak = lastPatch.streak || 0;

  if (newOverall === 'mixed') return 0;
  if (newOverall === 'buff') return lastStreak > 0 ? lastStreak + 1 : 1;
  if (newOverall === 'nerf') return lastStreak < 0 ? lastStreak - 1 : -1;
  return 0;
}

// ============================================
// 메인 함수
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const characterFilter = args.find((a) => a.startsWith('--character='))?.split('=')[1];
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = limitArg ? parseInt(limitArg) : undefined;

  console.log('=== 패치 수정본 적용 ===\n');

  if (dryRun) {
    console.log('🔍 DRY RUN 모드 - 실제 반영 없이 확인만 합니다.\n');
  }

  // 수정본 파일 로드
  if (!existsSync('data/patch-fixes.json')) {
    console.error('data/patch-fixes.json 파일이 없습니다.');
    console.error('먼저 reparse-patches.ts를 실행하세요.');
    return;
  }

  const fixesData: FixesFile = JSON.parse(readFileSync('data/patch-fixes.json', 'utf-8'));

  console.log(`수정본 생성 시각: ${fixesData.generatedAt}`);
  console.log(`총 수정 항목: ${fixesData.totalFixes}개\n`);

  // 필터링
  let fixes = fixesData.fixes;

  if (characterFilter) {
    fixes = fixes.filter((f) => f.characterName === characterFilter);
    console.log(`필터: ${characterFilter} (${fixes.length}개 항목)\n`);
  }

  if (limit) {
    fixes = fixes.slice(0, limit);
    console.log(`제한: ${limit}개 항목만 처리\n`);
  }

  if (fixes.length === 0) {
    console.log('처리할 수정 항목이 없습니다.');
    return;
  }

  // Firebase 초기화
  const db = initFirebaseAdmin();

  // 캐릭터별로 그룹화
  const fixesByCharacter = new Map<string, FixEntry[]>();
  for (const fix of fixes) {
    const existing = fixesByCharacter.get(fix.characterName) || [];
    existing.push(fix);
    fixesByCharacter.set(fix.characterName, existing);
  }

  console.log(`처리 대상: ${fixesByCharacter.size}명 캐릭터, ${fixes.length}개 패치\n`);
  console.log('-'.repeat(60) + '\n');

  let updatedCount = 0;
  let errorCount = 0;

  for (const [characterName, characterFixes] of fixesByCharacter) {
    console.log(`📝 ${characterName} (${characterFixes.length}개 패치)`);

    try {
      // 현재 캐릭터 데이터 로드
      const docRef = db.collection('characters').doc(characterName);
      const doc = await docRef.get();

      if (!doc.exists) {
        console.log(`  ⚠️ 캐릭터 데이터 없음 - 건너뜀\n`);
        continue;
      }

      const charData = doc.data() as CharacterData;
      let modified = false;

      // 각 패치 수정 적용
      for (const fix of characterFixes) {
        const patchIndex = charData.patchHistory.findIndex((p) => p.patchId === fix.patchId);

        if (patchIndex === -1) {
          console.log(`  ⚠️ 패치 ${fix.patchId} 없음`);
          continue;
        }

        const existingPatch = charData.patchHistory[patchIndex];

        // 새 데이터로 업데이트
        const newOverall = determineOverallChange(fix.newData.changes);

        // streak 계산 (이전 패치들 기준)
        const previousPatches = charData.patchHistory.slice(patchIndex + 1);
        const newStreak = calculateStreak(previousPatches, newOverall);

        const updatedPatch: PatchEntry = {
          ...existingPatch,
          devComment: fix.newData.devComment, // null 포함 그대로 적용 (기존 ?? 연산자 버그 수정)
          changes: fix.newData.changes,
          overallChange: newOverall,
          streak: newStreak,
        };

        charData.patchHistory[patchIndex] = updatedPatch;
        modified = true;

        console.log(
          `  ✓ 패치 ${fix.patchId}: ${fix.diff.oldChangeCount} → ${fix.diff.newChangeCount}개 변경사항` +
            (fix.diff.commentChanged
              ? `, 코멘트 ${fix.diff.oldCommentLength} → ${fix.diff.newCommentLength}자`
              : '')
        );
      }

      if (modified && !dryRun) {
        await docRef.update({ patchHistory: charData.patchHistory });
        console.log(`  ✅ Firebase 업데이트 완료\n`);
        updatedCount++;
      } else if (modified && dryRun) {
        console.log(`  🔍 (DRY RUN) 업데이트 예정\n`);
        updatedCount++;
      }
    } catch (error) {
      console.error(`  ❌ 오류:`, error);
      errorCount++;
    }
  }

  console.log('='.repeat(60));
  console.log('적용 완료');
  console.log('='.repeat(60));
  console.log(`업데이트된 캐릭터: ${updatedCount}명`);
  console.log(`오류: ${errorCount}건`);

  if (dryRun) {
    console.log('\n⚠️ DRY RUN 모드였습니다. 실제 반영하려면 --dry-run 옵션 없이 실행하세요.');
  }
}

main().catch(console.error);
