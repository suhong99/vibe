/**
 * 누락된 패치 데이터 수정 스크립트
 * - data/missing-patches.json에서 누락된 항목 로드
 * - 웹페이지 크롤링하여 누락된 캐릭터의 패치 데이터 파싱
 * - Firebase characters 컬렉션에 patchHistory 추가
 *
 * 사용법:
 *   npx tsx scripts/fix-missing-patches.ts --dry-run           # 미리보기 (저장 안함)
 *   npx tsx scripts/fix-missing-patches.ts --patch=1920        # 특정 패치만 수정
 *   npx tsx scripts/fix-missing-patches.ts --character=이안    # 특정 캐릭터만 수정
 *   npx tsx scripts/fix-missing-patches.ts                     # 전체 수정
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';
import { readFileSync, existsSync } from 'fs';

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
  nameEn: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};

type MissingPatchesData = {
  checkedAt: string;
  totalMissing: number;
  missingByPatch: Record<
    string,
    {
      patchTitle: string;
      patchDate: string;
      missingCharacters: string[];
    }
  >;
  details: Array<{
    patchId: number;
    patchTitle: string;
    patchDate: string;
    characterName: string;
  }>;
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
// 버프/너프 판별 로직 (parse-balance-changes.ts에서 복사)
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

function determineOverallChange(changes: Change[]): ChangeType {
  const buffCount = changes.filter((c) => c.changeType === 'buff').length;
  const nerfCount = changes.filter((c) => c.changeType === 'nerf').length;

  if (buffCount > 0 && nerfCount === 0) return 'buff';
  if (nerfCount > 0 && buffCount === 0) return 'nerf';
  return 'mixed';
}

// ============================================
// 통계 계산
// ============================================

function calculateStats(patchHistory: PatchEntry[]): CharacterStats {
  const stats: CharacterStats = {
    totalPatches: patchHistory.length,
    buffCount: 0,
    nerfCount: 0,
    mixedCount: 0,
    currentStreak: { type: null, count: 0 },
    maxBuffStreak: 0,
    maxNerfStreak: 0,
  };

  if (patchHistory.length === 0) return stats;

  const chronological = [...patchHistory].reverse();
  let currentStreakType: ChangeType | null = null;
  let currentStreakCount = 0;

  for (const patch of chronological) {
    if (patch.overallChange === 'buff') stats.buffCount++;
    else if (patch.overallChange === 'nerf') stats.nerfCount++;
    else stats.mixedCount++;

    if (patch.overallChange === 'buff' || patch.overallChange === 'nerf') {
      if (currentStreakType === patch.overallChange) {
        currentStreakCount++;
      } else {
        if (currentStreakType === 'buff') {
          stats.maxBuffStreak = Math.max(stats.maxBuffStreak, currentStreakCount);
        } else if (currentStreakType === 'nerf') {
          stats.maxNerfStreak = Math.max(stats.maxNerfStreak, currentStreakCount);
        }
        currentStreakType = patch.overallChange;
        currentStreakCount = 1;
      }
    }
  }

  if (currentStreakType === 'buff') {
    stats.maxBuffStreak = Math.max(stats.maxBuffStreak, currentStreakCount);
  } else if (currentStreakType === 'nerf') {
    stats.maxNerfStreak = Math.max(stats.maxNerfStreak, currentStreakCount);
  }

  stats.currentStreak.type = currentStreakType;
  stats.currentStreak.count = currentStreakCount;

  return stats;
}

function calculateStreaks(patchHistory: PatchEntry[]): PatchEntry[] {
  const chronological = [...patchHistory].reverse();
  const result: PatchEntry[] = [];

  let currentStreakType: ChangeType | null = null;
  let currentStreakCount = 0;

  for (const patch of chronological) {
    if (patch.overallChange === 'buff' || patch.overallChange === 'nerf') {
      if (currentStreakType === patch.overallChange) {
        currentStreakCount++;
      } else {
        currentStreakType = patch.overallChange;
        currentStreakCount = 1;
      }
      result.push({ ...patch, streak: currentStreakCount });
    } else {
      result.push({ ...patch, streak: 1 });
    }
  }

  return result.reverse();
}

// ============================================
// 패치 버전 추출
// ============================================

function extractPatchVersion(title: string): string {
  const versionMatch = title.match(/(?:^|\s|-)(\d{1,2}\.\d{1,2}[a-z]?)(?:\s|$|-|패치)/i);
  if (versionMatch) return versionMatch[1];
  const hotfixMatch = title.match(/(\d+\.\d+[a-z]?)\s*핫픽스/i);
  if (hotfixMatch) return hotfixMatch[1];
  return title;
}

// ============================================
// 특정 캐릭터의 패치 데이터 파싱
// ============================================

type ParsedCharacter = {
  name: string;
  nameEn: string;
  devComment: string | null;
  changes: Change[];
};

async function parseCharacterFromPatchNote(
  page: Page,
  patchId: number,
  targetCharacter: string
): Promise<ParsedCharacter | null> {
  const url = `https://playeternalreturn.com/posts/news/${patchId}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const result = await page.evaluate((targetChar: string) => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return null;

      // 실험체 섹션 찾기
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

      if (!characterSectionStart) return null;

      const allElements = Array.from(content.children).filter(
        (el) => el.tagName === 'P' || el.tagName === 'UL' || el.tagName === 'H5'
      );

      let inCharacterSection = false;
      let foundTarget = false;
      let currentTarget = '기본 스탯';
      const devCommentLines: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const changes: any[] = [];

      const numericPattern = /^(.+?)\s+([^\s→]+(?:\([^)]*\))?(?:[^→]*?))\s*→\s*(.+)$/;

      for (const el of allElements) {
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

        // P 태그에서 캐릭터명 찾기
        if (el.tagName === 'P') {
          const strong = el.querySelector('span > strong');
          if (strong) {
            const name = strong.textContent?.trim() || '';
            const span = el.querySelector('span');
            const spanText = span?.textContent?.trim() || '';
            const strongText = strong.textContent?.trim() || '';

            if (spanText === strongText && /^[가-힣&\s]+$/.test(strongText)) {
              if (name === targetChar) {
                foundTarget = true;
                currentTarget = '기본 스탯';
                continue;
              } else if (foundTarget) {
                // 다음 캐릭터 시작 -> 종료
                break;
              }
            }
          }

          // 개발자 코멘트 수집
          if (foundTarget) {
            const text = el.textContent?.trim() || '';
            if (
              text &&
              !text.includes('→') &&
              text.length > 10 &&
              !/^[^(]+\([QWERP]\)/.test(text) &&
              !/^[^(]+\(패시브\)/.test(text) &&
              !/^\d/.test(text)
            ) {
              devCommentLines.push(text);
            }
          }
        }

        // UL 요소 처리
        if (el.tagName === 'UL' && foundTarget) {
          const topLevelLis = el.querySelectorAll(':scope > li');

          for (const topLi of Array.from(topLevelLis)) {
            const firstP = topLi.querySelector(':scope > p');
            let headerText = '';
            if (firstP) {
              const span = firstP.querySelector('span');
              if (span) {
                headerText = span.textContent?.replace(/\s+/g, ' ').trim() || '';
              }
            }

            // 스킬 헤더 확인
            const skillMatch = headerText.match(
              /^([^→]+\((?:[가-힣A-Za-z\s-]*)?[QWERP패시브]\d?\)(?:\s*-\s*[^→]+\([QWERP]\d?\))?)/
            );
            if (skillMatch && !headerText.includes('→')) {
              currentTarget = skillMatch[0].trim();
            } else if (headerText && headerText.length >= 5) {
              const isSkillHeader =
                /^[^(→]+\([QWERP]\)$/.test(headerText) ||
                /^[^(→]+\([가-힣A-Za-z\s-]+[QWERP]\d?\)$/.test(headerText) ||
                /^[^(→]+\(패시브\)$/.test(headerText);

              if (!isSkillHeader) {
                if (headerText.includes('→')) {
                  const numMatch = headerText.match(numericPattern);
                  if (numMatch) {
                    changes.push({
                      _type: 'numeric',
                      target: currentTarget,
                      stat: numMatch[1].trim(),
                      before: numMatch[2].trim(),
                      after: numMatch[3].trim(),
                    });
                  }
                } else if (headerText.length > 10) {
                  changes.push({
                    _type: 'description',
                    target: currentTarget,
                    description: headerText,
                    isNew: headerText.includes('(신규)') || /신규[^가-힣]/.test(headerText),
                    isRemoved: headerText.includes('(삭제)') || headerText.includes('삭제됩니다'),
                  });
                }
              }
            }

            // 자손 li에서 변경사항 추출
            const allDescendantLis = topLi.querySelectorAll('li');
            for (const descLi of Array.from(allDescendantLis)) {
              const descP = descLi.querySelector(':scope > p');
              let descSpan: Element | null = null;

              if (descP) {
                descSpan = descP.querySelector('span');
              } else {
                descSpan = descLi.querySelector(':scope > span');
              }

              if (descSpan) {
                const descText = descSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
                if (!descText || descText.length < 5) continue;

                const subSkillMatch = descText.match(
                  /^([^→]+\((?:[가-힣A-Za-z\s-]*)?[QWERP패시브]\d?\)(?:\s*-\s*[^→]+\([QWERP]\d?\))?)/
                );
                if (
                  subSkillMatch &&
                  !descText.includes('→') &&
                  descText === subSkillMatch[0].trim()
                ) {
                  currentTarget = subSkillMatch[0].trim();
                  continue;
                }

                const isDescSkillHeader =
                  /^[^(→]+\([QWERP]\)$/.test(descText) ||
                  /^[^(→]+\([가-힣A-Za-z\s-]+[QWERP]\d?\)$/.test(descText) ||
                  /^[^(→]+\(패시브\)$/.test(descText);

                if (!isDescSkillHeader) {
                  if (descText.includes('→')) {
                    const descNumMatch = descText.match(numericPattern);
                    if (descNumMatch) {
                      changes.push({
                        _type: 'numeric',
                        target: currentTarget,
                        stat: descNumMatch[1].trim(),
                        before: descNumMatch[2].trim(),
                        after: descNumMatch[3].trim(),
                      });
                    }
                  } else if (descText.length > 10) {
                    changes.push({
                      _type: 'description',
                      target: currentTarget,
                      description: descText,
                      isNew: descText.includes('(신규)') || /신규[^가-힣]/.test(descText),
                      isRemoved: descText.includes('(삭제)') || descText.includes('삭제됩니다'),
                    });
                  }
                }
              }
            }
          }
        }

        // UL > LI > P 구조에서 캐릭터명 찾기 (핫픽스 구조)
        if (el.tagName === 'UL' && !foundTarget) {
          const topLevelLis = el.querySelectorAll(':scope > li');
          for (const li of Array.from(topLevelLis)) {
            const firstP = li.querySelector(':scope > p');
            if (firstP) {
              const strong = firstP.querySelector('span > strong');
              if (strong) {
                const strongText = strong.textContent?.trim() || '';
                const span = firstP.querySelector('span');
                const spanText = span?.textContent?.trim() || '';

                if (spanText === strongText && strongText === targetChar) {
                  foundTarget = true;
                  currentTarget = '기본 스탯';

                  // 이 LI의 하위 UL에서 변경사항 파싱
                  const nestedUl = li.querySelector(':scope > ul');
                  if (nestedUl) {
                    const nestedLis = nestedUl.querySelectorAll(':scope > li');
                    for (const nestedLi of Array.from(nestedLis)) {
                      const nestedP = nestedLi.querySelector(':scope > p');
                      if (nestedP) {
                        const nestedSpan = nestedP.querySelector('span');
                        if (nestedSpan) {
                          const nestedText =
                            nestedSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
                          if (nestedText && nestedText.includes('→')) {
                            const numMatch = nestedText.match(numericPattern);
                            if (numMatch) {
                              changes.push({
                                _type: 'numeric',
                                target: currentTarget,
                                stat: numMatch[1].trim(),
                                before: numMatch[2].trim(),
                                after: numMatch[3].trim(),
                              });
                            }
                          }
                        }
                      }
                    }
                  }
                  break;
                }
              }
            }
          }
        }
      }

      if (!foundTarget || changes.length === 0) return null;

      return {
        name: targetChar,
        nameEn: targetChar,
        devComment: devCommentLines.length > 0 ? devCommentLines.join(' ') : null,
        changes,
      };
    }, targetCharacter);

    if (!result) return null;

    // 변경사항 처리
    const processedChanges: Change[] = result.changes.map((change): Change => {
      if (change._type === 'description') {
        let category: ChangeCategory = 'mechanic';
        if (change.isNew) category = 'added';
        else if (change.isRemoved) category = 'removed';
        return {
          target: change.target,
          description: change.description,
          changeType: 'mixed',
          changeCategory: category,
        } as DescriptionChange;
      } else {
        const processed = processChange(change.stat, change.before, change.after);
        return {
          target: change.target,
          stat: processed.stat,
          before: processed.before,
          after: processed.after,
          changeType: determineChangeType(processed.stat, processed.before, processed.after),
          changeCategory: 'numeric',
        } as NumericChange;
      }
    });

    return {
      name: normalizeCharacterName(result.name),
      nameEn: normalizeCharacterName(result.nameEn),
      devComment: result.devComment,
      changes: processedChanges,
    };
  } catch (error) {
    console.error(`  파싱 오류 (패치 ${patchId}, ${targetCharacter}):`, error);
    return null;
  }
}

// ============================================
// Firebase 데이터 로드/저장
// ============================================

async function loadExistingCharacters(): Promise<Record<string, CharacterData>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').get();
  const characters: Record<string, CharacterData> = {};

  snapshot.forEach((doc) => {
    const data = doc.data() as CharacterData;
    characters[data.name] = data;
  });

  return characters;
}

async function saveCharacter(name: string, data: CharacterData): Promise<void> {
  const db = initFirebaseAdmin();
  await db.collection('characters').doc(name).set(data);
}

// ============================================
// 메인 함수
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const patchArg = args.find((a) => a.startsWith('--patch='))?.split('=')[1];
  const characterArg = args.find((a) => a.startsWith('--character='))?.split('=')[1];

  const targetPatchIds = patchArg
    ? patchArg.split(',').map((id) => parseInt(id.trim(), 10))
    : undefined;
  const targetCharacter = characterArg;

  console.log('누락된 패치 데이터 수정 시작...\n');
  if (dryRun) {
    console.log('*** DRY RUN 모드 - 실제 저장하지 않음 ***\n');
  }

  // missing-patches.json 로드
  const missingDataPath = 'data/missing-patches.json';
  if (!existsSync(missingDataPath)) {
    console.error('data/missing-patches.json 파일이 없습니다.');
    console.error('먼저 npx tsx scripts/check-missing-patches.ts 를 실행하세요.');
    process.exit(1);
  }

  const missingData: MissingPatchesData = JSON.parse(readFileSync(missingDataPath, 'utf-8'));
  console.log(`누락 데이터 파일 로드: ${missingData.totalMissing}개 항목\n`);

  // 필터링
  let itemsToFix = missingData.details;
  if (targetPatchIds) {
    itemsToFix = itemsToFix.filter((item) => targetPatchIds.includes(item.patchId));
    console.log(`패치 필터: ${targetPatchIds.join(', ')}`);
  }
  if (targetCharacter) {
    itemsToFix = itemsToFix.filter((item) => item.characterName === targetCharacter);
    console.log(`캐릭터 필터: ${targetCharacter}`);
  }

  if (itemsToFix.length === 0) {
    console.log('수정할 항목이 없습니다.');
    return;
  }

  console.log(`수정 대상: ${itemsToFix.length}개 항목\n`);

  // 기존 캐릭터 데이터 로드
  console.log('Firebase에서 캐릭터 데이터 로드 중...');
  const characterMap = await loadExistingCharacters();
  console.log(`  - ${Object.keys(characterMap).length}명의 캐릭터 로드됨\n`);

  // 패치별로 그룹화
  const byPatch = new Map<number, { title: string; date: string; characters: string[] }>();
  for (const item of itemsToFix) {
    if (!byPatch.has(item.patchId)) {
      byPatch.set(item.patchId, {
        title: item.patchTitle,
        date: item.patchDate,
        characters: [],
      });
    }
    byPatch.get(item.patchId)!.characters.push(item.characterName);
  }

  // 브라우저 시작
  console.log('브라우저 시작...');
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  await page.setCookie({
    name: 'locale',
    value: 'ko_KR',
    domain: 'playeternalreturn.com',
  });

  const fixedItems: Array<{ patchId: number; character: string; changes: number }> = [];
  const failedItems: Array<{ patchId: number; character: string; reason: string }> = [];
  const modifiedCharacters = new Set<string>();

  // 패치별로 처리
  let patchIndex = 0;
  for (const [patchId, patchInfo] of byPatch) {
    patchIndex++;
    const progress = `[${patchIndex}/${byPatch.size}]`;
    console.log(`\n${progress} 패치 ${patchId} (${patchInfo.title}) 처리 중...`);

    for (const charName of patchInfo.characters) {
      console.log(`  - ${charName} 파싱 중...`);

      const parsed = await parseCharacterFromPatchNote(page, patchId, charName);

      if (!parsed || parsed.changes.length === 0) {
        console.log(`    실패: 파싱 결과 없음`);
        failedItems.push({ patchId, character: charName, reason: '파싱 결과 없음' });
        continue;
      }

      // 캐릭터 데이터 확인/생성
      if (!characterMap[charName]) {
        characterMap[charName] = {
          name: charName,
          nameEn: charName,
          stats: {
            totalPatches: 0,
            buffCount: 0,
            nerfCount: 0,
            mixedCount: 0,
            currentStreak: { type: null, count: 0 },
            maxBuffStreak: 0,
            maxNerfStreak: 0,
          },
          patchHistory: [],
        };
      }

      // 이미 해당 패치가 있는지 확인
      const existingPatch = characterMap[charName].patchHistory.find((p) => p.patchId === patchId);
      if (existingPatch) {
        console.log(`    스킵: 이미 존재함`);
        continue;
      }

      const patchVersion = extractPatchVersion(patchInfo.title);
      const overallChange = determineOverallChange(parsed.changes);

      const newPatchEntry: PatchEntry = {
        patchId,
        patchVersion,
        patchDate: patchInfo.date,
        overallChange,
        streak: 0,
        devComment: parsed.devComment,
        changes: parsed.changes,
      };

      characterMap[charName].patchHistory.push(newPatchEntry);
      modifiedCharacters.add(charName);

      console.log(`    성공: ${parsed.changes.length}개 변경사항 (${overallChange})`);
      fixedItems.push({ patchId, character: charName, changes: parsed.changes.length });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await browser.close();

  // 수정된 캐릭터 통계 재계산 및 저장
  if (!dryRun && modifiedCharacters.size > 0) {
    console.log(`\n${modifiedCharacters.size}명의 캐릭터 통계 재계산 및 저장 중...`);

    for (const charName of modifiedCharacters) {
      const char = characterMap[charName];

      // 날짜순 정렬
      char.patchHistory.sort(
        (a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime()
      );

      // streak 재계산
      char.patchHistory = calculateStreaks(char.patchHistory);

      // stats 재계산
      char.stats = calculateStats(char.patchHistory);

      // Firebase에 저장
      await saveCharacter(charName, char);
      console.log(`  - ${charName} 저장 완료 (총 ${char.patchHistory.length}개 패치)`);
    }
  }

  // 결과 출력
  console.log('\n' + '='.repeat(60));
  console.log('수정 완료');
  console.log('='.repeat(60));
  console.log(`성공: ${fixedItems.length}개`);
  console.log(`실패: ${failedItems.length}개`);

  if (fixedItems.length > 0) {
    console.log('\n=== 수정된 항목 ===');
    for (const item of fixedItems) {
      console.log(`  패치 ${item.patchId} - ${item.character}: ${item.changes}개 변경사항`);
    }
  }

  if (failedItems.length > 0) {
    console.log('\n=== 실패한 항목 ===');
    for (const item of failedItems) {
      console.log(`  패치 ${item.patchId} - ${item.character}: ${item.reason}`);
    }
  }

  if (dryRun) {
    console.log('\n*** DRY RUN 완료 - 실제 저장되지 않음 ***');
  }
}

main().catch(console.error);
