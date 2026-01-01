/**
 * 패치 데이터 검증 스크립트
 * - Firebase에 저장된 캐릭터 패치 데이터가 실제 패치노트와 일치하는지 검증
 * - 누락된 변경사항이나 코멘트를 찾아 리포트
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';
import { writeFileSync } from 'fs';

// ============================================
// 타입 정의
// ============================================

type Change = {
  target: string;
  stat?: string;
  before?: string;
  after?: string;
  description?: string;
  changeType: string;
  changeCategory: string;
};

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  devComment: string | null;
  changes: Change[];
};

type CharacterData = {
  name: string;
  patchHistory: PatchEntry[];
};

type CrawledPatchData = {
  characterName: string;
  devComment: string | null;
  changes: string[]; // li 항목들의 텍스트
};

type ValidationIssue = {
  characterName: string;
  patchId: number;
  patchVersion: string;
  issueType: 'missing_changes' | 'missing_comment' | 'comment_mismatch' | 'change_count_mismatch';
  expected: number | string | null;
  actual: number | string | null;
  details?: string;
};

// ============================================
// 패치노트 크롤링 (검증용)
// ============================================

async function crawlPatchNoteForCharacter(
  page: Page,
  url: string,
  characterName: string
): Promise<CrawledPatchData | null> {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const result = await page.evaluate((targetChar: string) => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return null;

      // 실험체 섹션 찾기
      const h5Elements = content.querySelectorAll('h5');
      let inCharacterSection = false;

      for (const h5 of Array.from(h5Elements)) {
        if (h5.textContent?.trim() === '실험체') {
          inCharacterSection = true;
          break;
        }
      }

      if (!inCharacterSection) return null;

      // 해당 캐릭터 블록 찾기
      const allElements = Array.from(content.children);
      let foundCharacter = false;
      const devCommentLines: string[] = [];
      const changeLines: string[] = [];
      let collectingComment = false;

      for (const el of allElements) {
        // 캐릭터명 찾기
        if (el.tagName === 'P') {
          const strong = el.querySelector('span > strong');
          if (strong) {
            const name = strong.textContent?.trim() || '';
            if (name === targetChar) {
              foundCharacter = true;
              collectingComment = true;
              continue;
            } else if (foundCharacter && /^[가-힣&\s]+$/.test(name)) {
              // 다음 캐릭터 시작 -> 종료
              break;
            }
          }

          // 개발자 코멘트 수집
          if (foundCharacter && collectingComment) {
            const text = el.textContent?.trim() || '';
            if (text && text.length > 5) {
              devCommentLines.push(text);
            }
          }
        }

        // ul 요소에서 변경사항 수집
        if (el.tagName === 'UL' && foundCharacter) {
          collectingComment = false; // 코멘트 수집 종료

          // 모든 li 항목 수집
          const allLis = el.querySelectorAll('li');
          for (const li of Array.from(allLis)) {
            const p = li.querySelector(':scope > p');
            if (p) {
              const span = p.querySelector('span');
              if (span) {
                const text = span.textContent?.replace(/\s+/g, ' ').trim() || '';
                if (text && text.length > 3) {
                  changeLines.push(text);
                }
              }
            }
          }
        }

        // 다음 섹션(h5) 시작 시 종료
        if (el.tagName === 'H5' && foundCharacter) {
          break;
        }
      }

      if (!foundCharacter) return null;

      return {
        characterName: targetChar,
        devComment: devCommentLines.length > 0 ? devCommentLines.join(' ') : null,
        changes: changeLines,
      };
    }, characterName);

    return result;
  } catch (error) {
    console.error(`크롤링 오류 (${url}, ${characterName}):`, error);
    return null;
  }
}

// ============================================
// 검증 로직
// ============================================

function countActualChanges(changes: Change[]): number {
  // 실제 변경사항 개수 (스킬 헤더 제외)
  return changes.filter((c) => {
    // 수치형 변경
    if (c.stat && c.before && c.after) return true;
    // 설명형 변경
    if (c.description) return true;
    return false;
  }).length;
}

function validatePatchEntry(
  characterName: string,
  stored: PatchEntry,
  crawled: CrawledPatchData
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. 코멘트 검증
  if (!stored.devComment && crawled.devComment) {
    issues.push({
      characterName,
      patchId: stored.patchId,
      patchVersion: stored.patchVersion,
      issueType: 'missing_comment',
      expected: crawled.devComment,
      actual: null,
    });
  } else if (stored.devComment && crawled.devComment) {
    // 코멘트 길이 비교 (완전 일치는 어려우므로 길이 차이로 판단)
    const storedLen = stored.devComment.length;
    const crawledLen = crawled.devComment.length;
    if (Math.abs(storedLen - crawledLen) > 50) {
      issues.push({
        characterName,
        patchId: stored.patchId,
        patchVersion: stored.patchVersion,
        issueType: 'comment_mismatch',
        expected: crawled.devComment.slice(0, 100) + '...',
        actual: stored.devComment.slice(0, 100) + '...',
        details: `길이 차이: ${crawledLen} vs ${storedLen}`,
      });
    }
  }

  // 2. 변경사항 개수 검증
  // 크롤링된 li 개수 중 실제 변경사항 (화살표 포함 또는 설명형)
  const crawledChangeCount = crawled.changes.filter((line) => {
    // 스킬 헤더만 있는 경우 제외 (예: "거합일섬(W)")
    if (/^[^(]+\([QWERP]\)$/.test(line)) return false;
    if (/^[^(]+\(패시브\)$/.test(line)) return false;
    return true;
  }).length;

  const storedChangeCount = countActualChanges(stored.changes);

  if (crawledChangeCount > storedChangeCount) {
    issues.push({
      characterName,
      patchId: stored.patchId,
      patchVersion: stored.patchVersion,
      issueType: 'change_count_mismatch',
      expected: crawledChangeCount,
      actual: storedChangeCount,
      details: `누락 가능성: ${crawledChangeCount - storedChangeCount}개\n크롤링된 항목:\n${crawled.changes.join('\n')}`,
    });
  }

  return issues;
}

// ============================================
// Firebase 데이터 로드
// ============================================

async function loadAllCharacters(): Promise<Record<string, CharacterData>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').get();
  const characters: Record<string, CharacterData> = {};

  snapshot.forEach((doc) => {
    const data = doc.data() as CharacterData;
    characters[data.name] = data;
  });

  return characters;
}

// ============================================
// 메인 함수
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const testCharacter = args.find((a) => a.startsWith('--character='))?.split('=')[1];
  const testPatchId = args.find((a) => a.startsWith('--patch='))?.split('=')[1];

  console.log('패치 데이터 검증 시작...\n');

  // Firebase에서 캐릭터 데이터 로드
  const characters = await loadAllCharacters();
  console.log(`총 ${Object.keys(characters).length}명의 캐릭터 로드됨\n`);

  // 브라우저 시작
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  const allIssues: ValidationIssue[] = [];

  // 테스트 모드: 특정 캐릭터/패치만 검증
  if (testMode && testCharacter && testPatchId) {
    console.log(`테스트 모드: ${testCharacter} - patchId ${testPatchId}\n`);

    const char = characters[testCharacter];
    if (!char) {
      console.error(`캐릭터 "${testCharacter}"를 찾을 수 없습니다.`);
      await browser.close();
      return;
    }

    const patch = char.patchHistory.find((p) => p.patchId === parseInt(testPatchId));
    if (!patch) {
      console.error(`patchId ${testPatchId}를 찾을 수 없습니다.`);
      await browser.close();
      return;
    }

    const url = `https://playeternalreturn.com/posts/news/${testPatchId}`;
    console.log(`크롤링: ${url}`);

    const crawled = await crawlPatchNoteForCharacter(page, url, testCharacter);
    if (crawled) {
      console.log('\n=== 크롤링 결과 ===');
      console.log(`코멘트: ${crawled.devComment?.slice(0, 100)}...`);
      console.log(`변경사항 (${crawled.changes.length}개):`);
      crawled.changes.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));

      console.log('\n=== 저장된 데이터 ===');
      console.log(`코멘트: ${patch.devComment?.slice(0, 100)}...`);
      console.log(`변경사항 (${patch.changes.length}개):`);
      patch.changes.forEach((c, i) => {
        if ('stat' in c && c.stat) {
          console.log(`  ${i + 1}. [${c.target}] ${c.stat}: ${c.before} → ${c.after}`);
        } else if ('description' in c) {
          console.log(`  ${i + 1}. [${c.target}] ${c.description}`);
        }
      });

      const issues = validatePatchEntry(testCharacter, patch, crawled);
      if (issues.length > 0) {
        console.log('\n=== 발견된 이슈 ===');
        issues.forEach((issue) => {
          console.log(`- ${issue.issueType}`);
          console.log(`  예상: ${issue.expected}`);
          console.log(`  실제: ${issue.actual}`);
          if (issue.details) console.log(`  상세: ${issue.details}`);
        });
      } else {
        console.log('\n✅ 이슈 없음');
      }
    } else {
      console.log('크롤링 실패: 해당 캐릭터를 찾을 수 없음');
    }

    await browser.close();
    return;
  }

  // 전체 검증 모드
  console.log('전체 캐릭터 검증 시작...\n');

  // 중복 패치 URL 방지를 위해 패치별로 그룹화
  const patchCharacterMap: Map<number, { url: string; characters: string[] }> = new Map();

  for (const [name, char] of Object.entries(characters)) {
    for (const patch of char.patchHistory) {
      if (!patchCharacterMap.has(patch.patchId)) {
        patchCharacterMap.set(patch.patchId, {
          url: `https://playeternalreturn.com/posts/news/${patch.patchId}`,
          characters: [],
        });
      }
      patchCharacterMap.get(patch.patchId)!.characters.push(name);
    }
  }

  console.log(`총 ${patchCharacterMap.size}개 패치 검증 예정\n`);

  let patchIndex = 0;
  for (const [patchId, patchInfo] of patchCharacterMap) {
    patchIndex++;
    const progress = `[${patchIndex}/${patchCharacterMap.size}]`;
    console.log(`${progress} 패치 ${patchId} 검증 중... (${patchInfo.characters.length}명)`);

    for (const charName of patchInfo.characters) {
      const crawled = await crawlPatchNoteForCharacter(page, patchInfo.url, charName);
      if (!crawled) continue;

      const char = characters[charName];
      const patch = char.patchHistory.find((p) => p.patchId === patchId);
      if (!patch) continue;

      const issues = validatePatchEntry(charName, patch, crawled);
      allIssues.push(...issues);
    }

    // 속도 제한
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  await browser.close();

  // 결과 출력
  console.log('\n' + '='.repeat(60));
  console.log('검증 완료');
  console.log('='.repeat(60));
  console.log(`총 이슈: ${allIssues.length}개\n`);

  if (allIssues.length > 0) {
    // 이슈 유형별 분류
    const byType = {
      missing_changes: allIssues.filter((i) => i.issueType === 'missing_changes'),
      missing_comment: allIssues.filter((i) => i.issueType === 'missing_comment'),
      comment_mismatch: allIssues.filter((i) => i.issueType === 'comment_mismatch'),
      change_count_mismatch: allIssues.filter((i) => i.issueType === 'change_count_mismatch'),
    };

    console.log('=== 이슈 유형별 요약 ===');
    console.log(`- 변경사항 개수 불일치: ${byType.change_count_mismatch.length}개`);
    console.log(`- 코멘트 누락: ${byType.missing_comment.length}개`);
    console.log(`- 코멘트 불일치: ${byType.comment_mismatch.length}개`);

    // 결과를 JSON 파일로 저장
    const output = {
      validatedAt: new Date().toISOString(),
      totalIssues: allIssues.length,
      summary: {
        change_count_mismatch: byType.change_count_mismatch.length,
        missing_comment: byType.missing_comment.length,
        comment_mismatch: byType.comment_mismatch.length,
      },
      issues: allIssues,
    };

    writeFileSync('data/validation-issues.json', JSON.stringify(output, null, 2));
    console.log('\n결과가 data/validation-issues.json에 저장되었습니다.');
  } else {
    console.log('✅ 모든 데이터가 일치합니다!');
  }
}

main().catch(console.error);
