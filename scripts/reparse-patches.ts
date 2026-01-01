/**
 * 문제가 있는 패치 재파싱 스크립트
 * - 기존 데이터와 비교하여 수정이 필요한 항목만 추출
 * - 수정본을 JSON 파일로 저장 (Firebase 반영 전 확인용)
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ============================================
// 타입 정의
// ============================================

type ChangeType = 'buff' | 'nerf' | 'mixed';
type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

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

type PatchNote = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
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

// ============================================
// 유효한 캐릭터 목록
// ============================================

const VALID_CHARACTERS = new Set([
  '가넷',
  '나딘',
  '나타폰',
  '니아',
  '니키',
  '다니엘',
  '다르코',
  '데비&마를렌',
  '띠아',
  '라우라',
  '레녹스',
  '레니',
  '레온',
  '로지',
  '루크',
  '르노어',
  '리 다이린',
  '리오',
  '마르티나',
  '마이',
  '마커스',
  '매그너스',
  '미르카',
  '바냐',
  '바바라',
  '버니스',
  '블레어',
  '비앙카',
  '샬럿',
  '셀린',
  '쇼우',
  '쇼이치',
  '수아',
  '슈린',
  '시셀라',
  '실비아',
  '아델라',
  '아드리아나',
  '아디나',
  '아르다',
  '아비게일',
  '아야',
  '아이솔',
  '아이작',
  '알렉스',
  '알론소',
  '얀',
  '에스텔',
  '에이든',
  '에키온',
  '엘레나',
  '엠마',
  '요한',
  '윌리엄',
  '유민',
  '유스티나',
  '유키',
  '이렘',
  '이바',
  '이슈트반',
  '이안',
  '일레븐',
  '자히르',
  '재키',
  '제니',
  '츠바메',
  '카밀로',
  '카티야',
  '칼라',
  '캐시',
  '케네스',
  '클로에',
  '키아라',
  '타지아',
  '테오도르',
  '펠릭스',
  '프리야',
  '피오라',
  '피올로',
  '하트',
  '헤이즈',
  '헨리',
  '현우',
  '혜진',
  '히스이',
]);

function normalizeCharacterName(name: string): string {
  return name
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidCharacter(name: string): boolean {
  return VALID_CHARACTERS.has(normalizeCharacterName(name));
}

// ============================================
// 버프/너프 판별 로직
// ============================================

const DECREASE_IS_BUFF = [
  '쿨다운',
  'cooldown',
  'cd',
  '마나',
  'mana',
  'sp',
  'mp',
  '소모',
  '시전',
  'cast',
  'casting',
  '딜레이',
  'delay',
  '대기',
  'wait',
  '충전',
  'charge time',
  '선딜',
  '후딜',
];

function extractNumbers(value: string): number[] {
  const matches = value.match(/[\d.]+/g);
  return matches ? matches.map(Number) : [];
}

function determineChangeType(stat: string, before: string, after: string): ChangeType {
  const statLower = stat.toLowerCase();
  const beforeNums = extractNumbers(before);
  const afterNums = extractNumbers(after);

  if (beforeNums.length === 0 || afterNums.length === 0) return 'mixed';

  const beforeAvg = beforeNums.reduce((a, b) => a + b, 0) / beforeNums.length;
  const afterAvg = afterNums.reduce((a, b) => a + b, 0) / afterNums.length;

  if (beforeAvg === afterAvg) return 'mixed';

  const isIncrease = afterAvg > beforeAvg;
  const isDecreaseBuffStat = DECREASE_IS_BUFF.some((k) => statLower.includes(k.toLowerCase()));

  if (isDecreaseBuffStat) return isIncrease ? 'nerf' : 'buff';
  return isIncrease ? 'buff' : 'nerf';
}

// ============================================
// HTML 정리 함수
// ============================================

function cleanHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function findFirstNumberIndexOutsideParens(str: string): number {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && /\d/.test(char)) return i;
  }
  return -1;
}

function startsWithNumber(str: string): boolean {
  return /^\d/.test(str.trim());
}

function splitAtFirstNumber(str: string): { prefix: string; value: string } {
  const cleaned = cleanHtmlEntities(str);
  const numIndex = findFirstNumberIndexOutsideParens(cleaned);
  if (numIndex <= 0) return { prefix: '', value: cleaned };
  return {
    prefix: cleaned.slice(0, numIndex).trim(),
    value: cleaned.slice(numIndex).trim(),
  };
}

function determineChangeCategory(before: string, after: string): ChangeCategory {
  const beforeClean = cleanHtmlEntities(before).toLowerCase();
  const afterClean = cleanHtmlEntities(after).toLowerCase();

  if (!beforeClean || beforeClean === '없음' || beforeClean === '-' || beforeClean === 'x') {
    return 'added';
  }
  if (!afterClean || afterClean === '삭제' || afterClean === '없음' || afterClean === '-') {
    return 'removed';
  }

  const beforeStartsNum = startsWithNumber(before);
  const afterStartsNum = startsWithNumber(after);

  if (beforeStartsNum && afterStartsNum) return 'numeric';
  if (!beforeStartsNum && !afterStartsNum) return 'mechanic';
  return 'unknown';
}

function processChange(
  stat: string,
  before: string,
  after: string
): { stat: string; before: string; after: string; changeCategory: ChangeCategory } {
  stat = cleanHtmlEntities(stat);
  before = cleanHtmlEntities(before);
  after = cleanHtmlEntities(after);

  const beforeSplit = splitAtFirstNumber(before);
  const afterSplit = splitAtFirstNumber(after);

  let newStat = stat;
  let newBefore = before;
  let newAfter = after;

  if (beforeSplit.prefix) {
    newStat = (stat + ' ' + beforeSplit.prefix).trim();
    newBefore = beforeSplit.value;
  }

  if (afterSplit.prefix && afterSplit.value) {
    newAfter = afterSplit.value;
  }

  const changeCategory = determineChangeCategory(newBefore, newAfter);

  return { stat: newStat, before: newBefore, after: newAfter, changeCategory };
}

// ============================================
// 패치노트 파싱 (수정된 로직)
// ============================================

type ParsedCharacter = {
  name: string;
  nameEn: string;
  devComment: string | null;
  changes: Change[];
};

async function parsePatchNote(page: Page, url: string): Promise<ParsedCharacter[]> {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const characters = await page.evaluate(() => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return [];

      const h5Elements = content.querySelectorAll('h5');
      let characterSectionStart: Element | null = null;
      let characterSectionEnd: Element | null = null;

      for (let i = 0; i < h5Elements.length; i++) {
        const text = h5Elements[i].textContent?.trim();
        if (text === '실험체') {
          characterSectionStart = h5Elements[i];
          for (let j = i + 1; j < h5Elements.length; j++) {
            const nextText = h5Elements[j].textContent?.trim();
            if (
              nextText &&
              ['무기', '아이템', '코발트 프로토콜', '론울프', '특성', '시스템'].includes(nextText)
            ) {
              characterSectionEnd = h5Elements[j];
              break;
            }
          }
          break;
        }
      }

      if (!characterSectionStart) return [];

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const results: Array<{
        name: string;
        nameEn: string;
        devComment: string | null;
        changes: Array<any>;
      }> = [];
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const allElements = Array.from(content.children).filter(
        (el) => el.tagName === 'P' || el.tagName === 'UL' || el.tagName === 'H5'
      );
      let inCharacterSection = false;
      let currentCharName = '';
      let currentDevComment: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let currentChanges: Array<any> = [];
      let currentTarget = '기본 스탯';

      for (let idx = 0; idx < allElements.length; idx++) {
        const el = allElements[idx];

        if (
          el === characterSectionStart ||
          (characterSectionStart &&
            el.compareDocumentPosition(characterSectionStart) & Node.DOCUMENT_POSITION_PRECEDING)
        ) {
          inCharacterSection = true;
        }

        if (
          characterSectionEnd &&
          (el === characterSectionEnd ||
            (el.compareDocumentPosition(characterSectionEnd) & Node.DOCUMENT_POSITION_FOLLOWING) ===
              0)
        ) {
          break;
        }

        if (!inCharacterSection) continue;

        if (el.tagName === 'P') {
          const strong = el.querySelector('span > strong');
          if (strong) {
            const name = strong.textContent?.trim() || '';
            if (
              name &&
              !['실험체', '무기', '아이템', '시스템', '특성', '코발트 프로토콜', '론울프'].includes(
                name
              )
            ) {
              const span = el.querySelector('span');
              const spanText = span?.textContent?.trim() || '';
              const strongText = strong.textContent?.trim() || '';

              if (spanText === strongText && /^[가-힣&\s]+$/.test(strongText)) {
                if (currentCharName && currentChanges.length > 0) {
                  results.push({
                    name: currentCharName,
                    nameEn: currentCharName,
                    devComment: currentDevComment.length > 0 ? currentDevComment.join(' ') : null,
                    changes: currentChanges,
                  });
                }
                currentCharName = name;
                currentDevComment = [];
                currentChanges = [];
                currentTarget = '기본 스탯';
                continue;
              }
            }
          }

          if (currentCharName) {
            const text = el.textContent?.trim() || '';
            if (
              text &&
              !text.includes('→') &&
              text.length > 10 &&
              !/^[^(]+\([QWERP]\)/.test(text) &&
              !/^[^(]+\(패시브\)/.test(text) &&
              !/^\d/.test(text)
            ) {
              currentDevComment.push(text);
            }
          }
        }

        if (el.tagName === 'UL' && currentCharName) {
          const topLevelLis = el.querySelectorAll(':scope > li');

          // 숫자 변경 패턴: stat before → after
          const numericPattern = /^(.+?)\s+([^\s→]+(?:\([^)]*\))?(?:[^→]*?))\s*→\s*(.+)$/;

          for (let i = 0; i < topLevelLis.length; i++) {
            const topLi = topLevelLis[i];

            const firstP = topLi.querySelector(':scope > p');
            let headerText = '';
            if (firstP) {
              const span = firstP.querySelector('span');
              if (span) {
                headerText = span.textContent?.replace(/\s+/g, ' ').trim() || '';
              }
            }

            // topLi의 헤더가 스킬명인지 확인 (무기 스킬 포함)
            // 패턴: "스킬명(Q)", "스킬명(쌍검 E)", "스킬명(R) - 서브스킬(R2)", "스킬명(패시브)"
            const skillMatch = headerText.match(
              /^([^→]+\((?:[가-힣A-Za-z\s-]*)?[QWERP패시브]\d?\)(?:\s*-\s*[^→]+\([QWERP]\d?\))?)/
            );
            if (skillMatch && !headerText.includes('→')) {
              // 이 li는 스킬 헤더이므로 target으로 설정
              currentTarget = skillMatch[0].trim();
            } else if (headerText && headerText.length >= 5) {
              // 스킬 헤더 패턴인지 인라인 체크
              const isSkillHeader =
                /^[^(→]+\([QWERP]\)$/.test(headerText) ||
                /^[^(→]+\([가-힣A-Za-z\s-]+[QWERP]\d?\)$/.test(headerText) ||
                /^[^(→]+\(패시브\)$/.test(headerText) ||
                /^[^(→]+\([QWERP]\)\s*-\s*[^(→]+\([QWERP]\d?\)$/.test(headerText);

              if (!isSkillHeader) {
                // 스킬 헤더가 아닌 경우에만 변경사항으로 처리
                if (headerText.includes('→')) {
                  const numMatch = headerText.match(numericPattern);
                  if (numMatch) {
                    currentChanges.push({
                      _type: 'numeric',
                      target: currentTarget,
                      stat: numMatch[1].trim(),
                      before: numMatch[2].trim(),
                      after: numMatch[3].trim(),
                    });
                  }
                } else if (headerText.length > 10) {
                  currentChanges.push({
                    _type: 'description',
                    target: currentTarget,
                    description: headerText,
                    isNew: headerText.includes('(신규)') || /신규[^가-힣]/.test(headerText),
                    isRemoved: headerText.includes('(삭제)') || headerText.includes('삭제됩니다'),
                  });
                }
              }
            }

            // topLi 내부의 중첩 ul에서 변경사항 수집
            const nestedUl = topLi.querySelector(':scope > ul');
            if (nestedUl) {
              const nestedLis = nestedUl.querySelectorAll(':scope > li');
              for (let j = 0; j < nestedLis.length; j++) {
                const nestedLi = nestedLis[j];
                const nestedP = nestedLi.querySelector(':scope > p');
                if (nestedP) {
                  const nestedSpan = nestedP.querySelector('span');
                  if (nestedSpan) {
                    const nestedText = nestedSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
                    if (!nestedText || nestedText.length < 3) continue;

                    // 서브스킬 헤더인지 확인
                    const subSkillMatch = nestedText.match(
                      /^([^→]+\((?:[가-힣A-Za-z\s-]*)?[QWERP패시브]\d?\)(?:\s*-\s*[^→]+\([QWERP]\d?\))?)/
                    );
                    if (
                      subSkillMatch &&
                      !nestedText.includes('→') &&
                      nestedText === subSkillMatch[0].trim()
                    ) {
                      currentTarget = subSkillMatch[0].trim();
                      continue;
                    }

                    // 스킬 헤더 패턴인지 인라인 체크
                    const isNestedSkillHeader =
                      /^[^(→]+\([QWERP]\)$/.test(nestedText) ||
                      /^[^(→]+\([가-힣A-Za-z\s-]+[QWERP]\d?\)$/.test(nestedText) ||
                      /^[^(→]+\(패시브\)$/.test(nestedText) ||
                      /^[^(→]+\([QWERP]\)\s*-\s*[^(→]+\([QWERP]\d?\)$/.test(nestedText);

                    if (!isNestedSkillHeader) {
                      // 스킬 헤더가 아니면 변경사항으로 처리
                      if (nestedText.includes('→')) {
                        const nestedNumMatch = nestedText.match(numericPattern);
                        if (nestedNumMatch) {
                          currentChanges.push({
                            _type: 'numeric',
                            target: currentTarget,
                            stat: nestedNumMatch[1].trim(),
                            before: nestedNumMatch[2].trim(),
                            after: nestedNumMatch[3].trim(),
                          });
                        }
                      } else if (nestedText.length > 10) {
                        currentChanges.push({
                          _type: 'description',
                          target: currentTarget,
                          description: nestedText,
                          isNew: nestedText.includes('(신규)') || /신규[^가-힣]/.test(nestedText),
                          isRemoved:
                            nestedText.includes('(삭제)') || nestedText.includes('삭제됩니다'),
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (currentCharName && currentChanges.length > 0) {
        results.push({
          name: currentCharName,
          nameEn: currentCharName,
          devComment: currentDevComment.length > 0 ? currentDevComment.join(' ') : null,
          changes: currentChanges,
        });
      }

      return results;
    });

    return characters
      .filter((char) => isValidCharacter(char.name))
      .map((char) => ({
        ...char,
        name: normalizeCharacterName(char.name),
        nameEn: normalizeCharacterName(char.nameEn),
        changes: char.changes.map((change): Change => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawChange = change as any;

          if (rawChange._type === 'description') {
            let category: ChangeCategory = 'mechanic';
            if (rawChange.isNew) {
              category = 'added';
            } else if (rawChange.isRemoved) {
              category = 'removed';
            }
            return {
              target: rawChange.target,
              description: rawChange.description,
              changeType: 'mixed',
              changeCategory: category,
            } as DescriptionChange;
          } else {
            const processed = processChange(rawChange.stat, rawChange.before, rawChange.after);
            return {
              target: rawChange.target,
              stat: processed.stat,
              before: processed.before,
              after: processed.after,
              changeType: determineChangeType(processed.stat, processed.before, processed.after),
              changeCategory: 'numeric',
            } as NumericChange;
          }
        }),
      }));
  } catch (error) {
    console.error(`파싱 오류 (${url}):`, error);
    return [];
  }
}

// ============================================
// 패치 정보 조회
// ============================================

async function getPatchInfo(patchId: number): Promise<PatchNote | null> {
  const db = initFirebaseAdmin();
  const doc = await db.collection('patchNotes').doc(patchId.toString()).get();
  if (!doc.exists) return null;
  return doc.data() as PatchNote;
}

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

// 전체 패치 목록 조회 (characters 컬렉션에서 추출)
async function getAllPatchIds(): Promise<number[]> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').get();

  const patchIdSet = new Set<number>();
  snapshot.forEach((doc) => {
    const data = doc.data();
    for (const patch of data.patchHistory || []) {
      patchIdSet.add(patch.patchId);
    }
  });

  // 내림차순 정렬
  return Array.from(patchIdSet).sort((a, b) => b - a);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = limitArg ? parseInt(limitArg) : undefined;
  const allMode = args.includes('--all');
  const forceReplace = args.includes('--force');

  console.log('=== 패치 재파싱 시작 ===\n');

  let patchIds: number[];

  if (allMode) {
    // --all 모드: Firebase에서 전체 패치 목록 가져오기
    console.log('전체 패치 모드 (--all)\n');
    patchIds = await getAllPatchIds();
  } else {
    // 기본 모드: patches-to-reparse.json에서 로드
    if (!existsSync('data/patches-to-reparse.json')) {
      console.error('data/patches-to-reparse.json 파일이 없습니다.');
      console.error('--all 옵션을 사용하거나 validate-patch-data.ts를 먼저 실행하세요.');
      return;
    }
    patchIds = JSON.parse(readFileSync('data/patches-to-reparse.json', 'utf-8'));
  }

  const targetPatches = limit ? patchIds.slice(0, limit) : patchIds;

  console.log(`총 ${patchIds.length}개 패치 중 ${targetPatches.length}개 재파싱 예정`);
  if (forceReplace) {
    console.log('강제 교체 모드 (--force) - 모든 데이터를 새 데이터로 교체합니다.\n');
  } else {
    console.log('');
  }

  // 기존 캐릭터 데이터 로드
  const existingCharacters = await loadAllCharacters();
  console.log(`기존 캐릭터 데이터: ${Object.keys(existingCharacters).length}명\n`);

  // 브라우저 시작
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  const fixes: FixEntry[] = [];

  for (let i = 0; i < targetPatches.length; i++) {
    const patchId = targetPatches[i];
    const progress = `[${i + 1}/${targetPatches.length}]`;

    const patchInfo = await getPatchInfo(patchId);
    if (!patchInfo) {
      console.log(`${progress} 패치 ${patchId} 정보 없음 - 건너뜀`);
      continue;
    }

    console.log(`${progress} 패치 ${patchId} 파싱 중...`);

    const newParsed = await parsePatchNote(page, patchInfo.link);

    for (const parsed of newParsed) {
      const existingChar = existingCharacters[parsed.name];
      if (!existingChar) continue;

      const existingPatch = existingChar.patchHistory.find((p) => p.patchId === patchId);
      if (!existingPatch) continue;

      // 변경사항 비교
      const oldChangeCount = existingPatch.changes.length;
      const newChangeCount = parsed.changes.length;
      const oldCommentLength = existingPatch.devComment?.length || 0;
      const newCommentLength = parsed.devComment?.length || 0;

      // --force 모드면 무조건 교체, 아니면 개선된 경우만 추가
      const shouldReplace =
        forceReplace || newChangeCount > oldChangeCount || newCommentLength > oldCommentLength;

      if (shouldReplace) {
        fixes.push({
          characterName: parsed.name,
          patchId,
          patchVersion: existingPatch.patchVersion,
          oldData: {
            devComment: existingPatch.devComment,
            changes: existingPatch.changes,
          },
          newData: {
            devComment: parsed.devComment,
            changes: parsed.changes,
          },
          diff: {
            commentChanged: newCommentLength !== oldCommentLength,
            oldCommentLength,
            newCommentLength,
            oldChangeCount,
            newChangeCount,
            addedChanges: newChangeCount - oldChangeCount,
          },
        });
      }
    }

    // 속도 제한
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  await browser.close();

  // 결과 저장
  const output = {
    generatedAt: new Date().toISOString(),
    totalFixes: fixes.length,
    summary: {
      patchesProcessed: targetPatches.length,
      charactersAffected: new Set(fixes.map((f) => f.characterName)).size,
      totalAddedChanges: fixes.reduce((sum, f) => sum + f.diff.addedChanges, 0),
      commentsFixes: fixes.filter((f) => f.diff.commentChanged).length,
    },
    fixes,
  };

  writeFileSync('data/patch-fixes.json', JSON.stringify(output, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('재파싱 완료');
  console.log('='.repeat(60));
  console.log(`처리된 패치: ${targetPatches.length}개`);
  console.log(`수정 필요 항목: ${fixes.length}개`);
  console.log(`영향받는 캐릭터: ${output.summary.charactersAffected}명`);
  console.log(`추가될 변경사항: ${output.summary.totalAddedChanges}개`);
  console.log(`코멘트 수정: ${output.summary.commentsFixes}개`);
  console.log('\n결과가 data/patch-fixes.json에 저장되었습니다.');
  console.log('확인 후 apply-fixes.ts를 실행하여 Firebase에 반영하세요.');
}

main().catch(console.error);
