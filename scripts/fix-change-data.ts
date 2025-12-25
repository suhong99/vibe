/**
 * balance-changes.json의 stat/before/after 구조를 정리하는 스크립트
 *
 * 변경 사항:
 * 1. 괄호 안의 숫자는 무시 (E2, Q 등 스킬 표기)
 * 2. before/after 모두 괄호 밖 첫 숫자 기준으로 분리
 * 3. changeCategory 필드 추가 (numeric, mechanic, added, removed, unknown)
 */

import * as fs from 'fs';
import * as path from 'path';

type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

type Change = {
  target: string;
  stat: string;
  before: string;
  after: string;
  changeType: 'buff' | 'nerf' | 'mixed';
  changeCategory?: ChangeCategory;
};

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: 'buff' | 'nerf' | 'mixed';
  streak: number;
  devComment: string | null;
  changes: Change[];
};

type CharacterData = {
  name: string;
  nameEn?: string;
  stats: unknown;
  patchHistory: PatchEntry[];
};

type BalanceData = {
  updatedAt: string;
  characters: Record<string, CharacterData>;
};

type ValidationIssue = {
  character: string;
  patchId: number;
  target: string;
  original: Change;
  fixed: Change;
  issue: string;
};

const DATA_PATH = path.join(__dirname, '..', 'data', 'balance-changes.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'balance-changes-fixed.json');
const ISSUES_PATH = path.join(__dirname, '..', 'data', 'fix-issues.json');

// 괄호를 제외하고 첫 번째 숫자가 나오는 위치 찾기
function findFirstNumberIndexOutsideParens(str: string): number {
  let depth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && /\d/.test(char)) {
      return i;
    }
  }

  return -1;
}

// 문자열이 숫자로 시작하는지 확인
function startsWithNumber(str: string): boolean {
  const trimmed = str.trim();
  return /^\d/.test(trimmed);
}

// HTML 엔티티 정리
function cleanHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// 문자열에서 숫자 앞 텍스트 분리
function splitAtFirstNumber(str: string): { prefix: string; value: string } {
  const cleaned = cleanHtmlEntities(str);
  const numIndex = findFirstNumberIndexOutsideParens(cleaned);

  if (numIndex <= 0) {
    return { prefix: '', value: cleaned };
  }

  return {
    prefix: cleaned.slice(0, numIndex).trim(),
    value: cleaned.slice(numIndex).trim(),
  };
}

// changeCategory 결정
function determineChangeCategory(before: string, after: string): ChangeCategory {
  const beforeClean = cleanHtmlEntities(before).toLowerCase();
  const afterClean = cleanHtmlEntities(after).toLowerCase();

  // 효과 추가
  if (
    !beforeClean ||
    beforeClean === '없음' ||
    beforeClean === '-' ||
    beforeClean === 'x' ||
    beforeClean === '해당 없음'
  ) {
    return 'added';
  }

  // 효과 제거
  if (
    !afterClean ||
    afterClean === '삭제' ||
    afterClean === '없음' ||
    afterClean === '-' ||
    afterClean === 'x' ||
    afterClean === '제거'
  ) {
    return 'removed';
  }

  const beforeStartsNum = startsWithNumber(before);
  const afterStartsNum = startsWithNumber(after);

  // 둘 다 숫자로 시작 → numeric
  if (beforeStartsNum && afterStartsNum) {
    return 'numeric';
  }

  // 둘 다 텍스트로 시작 → mechanic
  if (!beforeStartsNum && !afterStartsNum) {
    return 'mechanic';
  }

  // 그 외 → unknown (수동 검토 필요)
  return 'unknown';
}

// Change 데이터 정리
function fixChange(
  change: Change,
  charName: string,
  patchId: number
): { fixed: Change; wasFixed: boolean; issue?: ValidationIssue } {
  let { stat, before, after } = change;

  // HTML 엔티티 정리
  stat = cleanHtmlEntities(stat);
  before = cleanHtmlEntities(before);
  after = cleanHtmlEntities(after);

  // before에서 숫자 앞 텍스트 분리
  const beforeSplit = splitAtFirstNumber(before);
  // after에서 숫자 앞 텍스트 분리
  const afterSplit = splitAtFirstNumber(after);

  let newStat = stat;
  let newBefore = before;
  let newAfter = after;
  let wasFixed = false;

  // before 처리
  if (beforeSplit.prefix) {
    newStat = (stat + ' ' + beforeSplit.prefix).trim();
    newBefore = beforeSplit.value;
    wasFixed = true;
  }

  // after 처리 - 무조건 숫자 앞 텍스트 분리
  if (afterSplit.prefix && afterSplit.value) {
    newAfter = afterSplit.value;
    wasFixed = true;
  }

  // changeCategory 결정
  const changeCategory = determineChangeCategory(newBefore, newAfter);

  const fixed: Change = {
    ...change,
    stat: newStat,
    before: newBefore,
    after: newAfter,
    changeCategory,
  };

  // unknown 카테고리는 이슈로 기록
  if (changeCategory === 'unknown') {
    return {
      fixed,
      wasFixed,
      issue: {
        character: charName,
        patchId,
        target: change.target,
        original: change,
        fixed,
        issue: `양식 불일치 - before: "${newBefore.slice(0, 30)}...", after: "${newAfter.slice(0, 30)}..."`,
      },
    };
  }

  return { fixed, wasFixed };
}

function main(): void {
  console.log('balance-changes.json 데이터 정리 시작...\n');

  // 데이터 로드
  const rawData = fs.readFileSync(DATA_PATH, 'utf-8');
  const data: BalanceData = JSON.parse(rawData);

  let totalChanges = 0;
  let fixedChanges = 0;
  const issues: ValidationIssue[] = [];
  const categoryCount: Record<ChangeCategory, number> = {
    numeric: 0,
    mechanic: 0,
    added: 0,
    removed: 0,
    unknown: 0,
  };
  const fixedExamples: Array<{ character: string; before: Change; after: Change }> = [];

  // 각 캐릭터의 패치 히스토리 순회
  for (const [charName, charData] of Object.entries(data.characters)) {
    for (const patch of charData.patchHistory) {
      const newChanges: Change[] = [];

      for (const change of patch.changes) {
        totalChanges++;
        const result = fixChange(change, charName, patch.patchId);
        newChanges.push(result.fixed);

        // 카테고리 카운트
        categoryCount[result.fixed.changeCategory || 'unknown']++;

        if (result.wasFixed) {
          fixedChanges++;
          if (fixedExamples.length < 10) {
            fixedExamples.push({
              character: charName,
              before: change,
              after: result.fixed,
            });
          }
        }

        if (result.issue) {
          issues.push(result.issue);
        }
      }

      patch.changes = newChanges;
    }
  }

  // 수정된 데이터 저장
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf-8');

  // 이슈 목록 저장
  if (issues.length > 0) {
    fs.writeFileSync(ISSUES_PATH, JSON.stringify(issues, null, 2), 'utf-8');
  }

  // 결과 출력
  console.log('='.repeat(60));
  console.log('데이터 정리 완료');
  console.log('='.repeat(60));
  console.log(`총 변경 사항: ${totalChanges}개`);
  console.log(`수정된 항목: ${fixedChanges}개`);
  console.log(`수정 비율: ${((fixedChanges / totalChanges) * 100).toFixed(1)}%`);
  console.log('');
  console.log('=== 카테고리 분류 ===');
  console.log(`  numeric (수치 변경): ${categoryCount.numeric}개`);
  console.log(`  mechanic (메커니즘 변경): ${categoryCount.mechanic}개`);
  console.log(`  added (효과 추가): ${categoryCount.added}개`);
  console.log(`  removed (효과 제거): ${categoryCount.removed}개`);
  console.log(`  unknown (수동 검토 필요): ${categoryCount.unknown}개`);
  console.log(`\n저장 위치: ${OUTPUT_PATH}`);

  // 수정 예시 출력
  if (fixedExamples.length > 0) {
    console.log('\n=== 수정 예시 (최대 10개) ===\n');
    for (const example of fixedExamples) {
      console.log(`[${example.character}] ${example.after.changeCategory}`);
      console.log(`  수정 전:`);
      console.log(`    stat: "${example.before.stat}"`);
      console.log(`    before: "${example.before.before}"`);
      console.log(`    after: "${example.before.after}"`);
      console.log(`  수정 후:`);
      console.log(`    stat: "${example.after.stat}"`);
      console.log(`    before: "${example.after.before}"`);
      console.log(`    after: "${example.after.after}"`);
      console.log('');
    }
  }

  // 이슈 출력
  if (issues.length > 0) {
    console.log('\n=== unknown 카테고리 이슈 (수동 검토 필요) ===\n');
    const displayCount = Math.min(issues.length, 10);
    for (let i = 0; i < displayCount; i++) {
      const issue = issues[i];
      console.log(`[${issue.character}] 패치 ${issue.patchId} - ${issue.target}`);
      console.log(`  stat: "${issue.fixed.stat}"`);
      console.log(`  before: "${issue.fixed.before}"`);
      console.log(`  after: "${issue.fixed.after}"`);
      console.log('');
    }
    if (issues.length > displayCount) {
      console.log(`... 외 ${issues.length - displayCount}개 이슈`);
    }
    console.log(`\n전체 이슈 목록: ${ISSUES_PATH}`);
  } else {
    console.log('\n모든 항목이 정상적으로 분류되었습니다!');
  }
}

main();
