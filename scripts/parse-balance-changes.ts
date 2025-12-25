import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';

// ============================================
// 타입 정의
// ============================================

type ChangeType = 'buff' | 'nerf' | 'mixed';
type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

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
  nameEn: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};

type PatchNote = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  status?: string;
  hasCharacterData?: boolean;
  isParsed?: boolean;
};

// ============================================
// 유효한 캐릭터 목록 (공식 실험체)
// ============================================

const VALID_CHARACTERS = new Set([
  '가넷', '나딘', '나타폰', '니아', '니키', '다니엘', '다르코', '데비&마를렌',
  '띠아', '라우라', '레녹스', '레니', '레온', '로지', '루크', '르노어',
  '리 다이린', '리오', '마르티나', '마이', '마커스', '매그너스', '미르카',
  '바냐', '바바라', '버니스', '블레어', '비앙카', '샬럿', '셀린', '쇼우',
  '쇼이치', '수아', '슈린', '시셀라', '실비아', '아델라', '아드리아나',
  '아디나', '아르다', '아비게일', '아야', '아이솔', '아이작', '알렉스',
  '알론소', '얀', '에스텔', '에이든', '에키온', '엘레나', '엠마', '요한',
  '윌리엄', '유민', '유스티나', '유키', '이렘', '이바', '이슈트반', '이안',
  '일레븐', '자히르', '재키', '제니', '츠바메', '카밀로', '카티야', '칼라',
  '캐시', '케네스', '클로에', '키아라', '타지아', '테오도르', '펠릭스',
  '프리야', '피오라', '피올로', '하트', '헤이즈', '헨리', '현우', '혜진', '히스이',
]);

function normalizeCharacterName(name: string): string {
  return name.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function isValidCharacter(name: string): boolean {
  return VALID_CHARACTERS.has(normalizeCharacterName(name));
}

// ============================================
// stat/before/after 분리 및 changeCategory 결정
// ============================================

// 괄호를 제외하고 첫 번째 숫자가 나오는 위치 찾기
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

// 문자열이 숫자로 시작하는지 확인
function startsWithNumber(str: string): boolean {
  return /^\d/.test(str.trim());
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
  if (numIndex <= 0) return { prefix: '', value: cleaned };
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
  if (!beforeClean || beforeClean === '없음' || beforeClean === '-' || beforeClean === 'x') {
    return 'added';
  }
  // 효과 제거
  if (!afterClean || afterClean === '삭제' || afterClean === '없음' || afterClean === '-') {
    return 'removed';
  }

  const beforeStartsNum = startsWithNumber(before);
  const afterStartsNum = startsWithNumber(after);

  if (beforeStartsNum && afterStartsNum) return 'numeric';
  if (!beforeStartsNum && !afterStartsNum) return 'mechanic';
  return 'unknown';
}

// stat/before/after 정리 및 changeCategory 결정
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

  // before 처리
  if (beforeSplit.prefix) {
    newStat = (stat + ' ' + beforeSplit.prefix).trim();
    newBefore = beforeSplit.value;
  }

  // after 처리
  if (afterSplit.prefix && afterSplit.value) {
    newAfter = afterSplit.value;
  }

  const changeCategory = determineChangeCategory(newBefore, newAfter);

  return { stat: newStat, before: newBefore, after: newAfter, changeCategory };
}

// ============================================
// 버프/너프 판별 로직
// ============================================

const DECREASE_IS_BUFF = [
  '쿨다운', 'cooldown', 'cd', '마나', 'mana', 'sp', 'mp', '소모',
  '시전', 'cast', 'casting', '딜레이', 'delay', '대기', 'wait',
  '충전', 'charge time', '선딜', '후딜',
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

function determineOverallChange(changes: Change[]): ChangeType {
  const buffCount = changes.filter((c) => c.changeType === 'buff').length;
  const nerfCount = changes.filter((c) => c.changeType === 'nerf').length;

  if (buffCount > 0 && nerfCount === 0) return 'buff';
  if (nerfCount > 0 && buffCount === 0) return 'nerf';
  return 'mixed';
}

const NERF_KEYWORDS = [
  'reducing', 'reduce', 'decreased', 'decrease', 'lowering', 'lower',
  'nerfing', 'nerf', 'weaken', 'weakening', 'toning down', 'tune down',
  'too strong', 'very strong', 'overperforming', 'high win rate',
  'high pick rate', 'dominant', 'oppressive', 'keep in check',
  '너프', '하향', '감소', '약화', '줄이', '낮추', '너무 강', '강력해서',
  '승률이 높', '픽률이 높', '지배적',
];

const BUFF_KEYWORDS = [
  'buffing', 'buff', 'increasing', 'increase', 'improving', 'improve',
  'enhancing', 'enhance', 'strengthening', 'strengthen', 'boosting', 'boost',
  'underperforming', 'low win rate', 'low pick rate', 'weak', 'struggling',
  'needs help', 'giving more',
  '버프', '상향', '증가', '강화', '올리', '높이', '약해서',
  '승률이 낮', '픽률이 낮', '부족', '개선',
];

function extractIntentFromComment(comment: string | null): ChangeType | null {
  if (!comment) return null;
  const commentLower = comment.toLowerCase();

  const hasNerfIntent = NERF_KEYWORDS.some((k) => commentLower.includes(k.toLowerCase()));
  const hasBuffIntent = BUFF_KEYWORDS.some((k) => commentLower.includes(k.toLowerCase()));

  if (hasNerfIntent && !hasBuffIntent) return 'nerf';
  if (hasBuffIntent && !hasNerfIntent) return 'buff';
  return null;
}

function determineOverallChangeWithComment(changes: Change[], comment: string | null): ChangeType {
  const result = determineOverallChange(changes);
  if (result === 'mixed' && comment) {
    const intent = extractIntentFromComment(comment);
    if (intent) return intent;
  }
  return result;
}

// ============================================
// 패치노트 파싱
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

      const html = content.innerHTML;
      const charMatch = html.match(/<h5[^>]*>실험체<\/h5>/);
      if (!charMatch || charMatch.index === undefined) return [];

      const charStart = charMatch.index;
      const weaponMatch = html.slice(charStart).match(/<h5[^>]*>무기<\/h5>/);
      const cobaltMatch = html.slice(charStart).match(/<h5[^>]*>코발트 프로토콜<\/h5>/);
      const loneWolfMatch = html.slice(charStart).match(/<h5[^>]*>론울프<\/h5>/);

      const endIndices = [weaponMatch?.index, cobaltMatch?.index, loneWolfMatch?.index].filter(
        (i): i is number => i !== undefined
      );

      const endIndex = endIndices.length > 0 ? charStart + Math.min(...endIndices) : html.length;
      const characterSection = html.slice(charStart, endIndex);

      const characterPattern = /<p[^>]*><span[^>]*><strong>([^<]+)<\/strong><\/span><\/p>/g;
      const results: Array<{
        name: string;
        nameEn: string;
        devComment: string | null;
        changes: Array<{ target: string; stat: string; before: string; after: string }>;
      }> = [];

      let match;
      const matches: Array<{ name: string; index: number; fullMatch: string }> = [];

      while ((match = characterPattern.exec(characterSection)) !== null) {
        const name = match[1].trim();
        if (!name.match(/^(실험체|무기|시스템|특성)$/)) {
          matches.push({ name, index: match.index, fullMatch: match[0] });
        }
      }

      for (let i = 0; i < matches.length; i++) {
        const { name, index: matchStart, fullMatch } = matches[i];
        const startIdx = matchStart + fullMatch.length;
        const endIdx = i + 1 < matches.length ? matches[i + 1].index : characterSection.length;
        const block = characterSection.slice(startIdx, endIdx);

        const commentParts: string[] = [];
        const ulIndex = block.indexOf('<ul');
        const beforeUl = ulIndex > 0 ? block.slice(0, ulIndex) : block.slice(0, 1000);

        const pTagPattern = /<p[^>]*><span[^>]*>([^]*?)<\/span><\/p>/g;
        let pMatch;
        while ((pMatch = pTagPattern.exec(beforeUl)) !== null) {
          const rawText = pMatch[1];
          const cleanText = rawText
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .trim();

          if (cleanText && !cleanText.includes('→') && cleanText.length > 5) {
            commentParts.push(cleanText);
          }
        }

        const devComment = commentParts.length > 0 ? commentParts.join(' ') : null;
        const changes: Array<{ target: string; stat: string; before: string; after: string }> = [];
        let currentTarget = '기본 스탯';

        const liPattern = /<li[^>]*>([^]*?)<\/li>/g;
        let liMatch;

        while ((liMatch = liPattern.exec(block)) !== null) {
          const liContent = liMatch[1];
          const cleanText = liContent.replace(/<[^>]+>/g, '').trim();

          const skillMatch = cleanText.match(/^([^→]+\([QWERP]\))|^([^→]+\(패시브\))/);
          if (skillMatch && !cleanText.includes('→')) {
            currentTarget = skillMatch[0].trim();
            continue;
          }

          if (cleanText.includes('→')) {
            const fullMatch = cleanText.match(
              /^([^→]+\([QWERP]\)|[^→]+\(패시브\))?(.+?)\s+([^\s→]+(?:[^→]*?))\s*→\s*(.+)$/
            );
            if (fullMatch) {
              if (fullMatch[1]) currentTarget = fullMatch[1].trim();
              const stat = fullMatch[2]?.trim() || '수치';
              const before = fullMatch[3]?.trim() || '';
              const after = fullMatch[4]?.trim() || '';
              if (before && after) {
                changes.push({ target: currentTarget, stat, before, after });
              }
            } else {
              const simpleMatch = cleanText.match(
                /(.+?)\s+([^\s→]+(?:\([^)]+\))?(?:[^→]*?))\s*→\s*(.+)$/
              );
              if (simpleMatch) {
                changes.push({
                  target: currentTarget,
                  stat: simpleMatch[1].trim(),
                  before: simpleMatch[2].trim(),
                  after: simpleMatch[3].trim(),
                });
              }
            }
          }
        }

        if (changes.length > 0) {
          results.push({ name, nameEn: name, devComment, changes });
        }
      }

      return results;
    });

    return characters
      .filter((char) => isValidCharacter(char.name))
      .map((char) => ({
        ...char,
        name: normalizeCharacterName(char.name),
        nameEn: normalizeCharacterName(char.nameEn),
        changes: char.changes.map((change) => {
          // stat/before/after 분리 및 changeCategory 결정
          const processed = processChange(change.stat, change.before, change.after);
          return {
            target: change.target,
            stat: processed.stat,
            before: processed.before,
            after: processed.after,
            changeType: determineChangeType(processed.stat, processed.before, processed.after),
            changeCategory: processed.changeCategory,
          };
        }),
      }));
  } catch (error) {
    console.error(`파싱 오류 (${url}):`, error);
    return [];
  }
}

function extractPatchVersion(title: string): string {
  const versionMatch = title.match(/(?:^|\s|-)(\d{1,2}\.\d{1,2}[a-z]?)(?:\s|$|-|패치)/i);
  if (versionMatch) return versionMatch[1];
  const hotfixMatch = title.match(/(\d+\.\d+[a-z]?)\s*핫픽스/i);
  if (hotfixMatch) return hotfixMatch[1];
  return title;
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
// Firestore 데이터 로드/저장
// ============================================

// 파싱 대상 패치노트 조회 (hasCharacterData: true, isParsed: false 또는 undefined)
async function getUnparsedPatchNotes(): Promise<PatchNote[]> {
  const db = initFirebaseAdmin();
  const snapshot = await db
    .collection('patchNotes')
    .where('hasCharacterData', '==', true)
    .where('status', '==', 'success')
    .orderBy('id', 'desc')
    .get();

  const unparsed: PatchNote[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as PatchNote;
    if (!data.isParsed) {
      unparsed.push(data);
    }
  });

  return unparsed;
}

// 기존 캐릭터 데이터 로드
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

// 캐릭터 데이터 저장
async function saveCharacters(characters: Record<string, CharacterData>): Promise<void> {
  const db = initFirebaseAdmin();
  const batchSize = 500;
  const entries = Object.entries(characters);

  console.log(`\nFirestore에 ${entries.length}개 캐릭터 저장 중...`);

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = db.batch();
    const chunk = entries.slice(i, i + batchSize);

    for (const [name, data] of chunk) {
      const docRef = db.collection('characters').doc(name);
      batch.set(docRef, data);
    }

    await batch.commit();
    console.log(`  - ${Math.min(i + batchSize, entries.length)}/${entries.length} 저장 완료`);
  }
}

// 패치노트 isParsed 업데이트
async function markPatchAsParsed(patchId: number): Promise<void> {
  const db = initFirebaseAdmin();
  await db.collection('patchNotes').doc(patchId.toString()).update({
    isParsed: true,
    parsedAt: new Date().toISOString(),
  });
}

// 메타데이터 업데이트
async function updateMetadata(characterCount: number): Promise<void> {
  const db = initFirebaseAdmin();
  await db.collection('metadata').doc('balanceChanges').set(
    {
      updatedAt: new Date().toISOString(),
      characterCount,
    },
    { merge: true }
  );
}

// ============================================
// 메인 함수
// ============================================

async function main(): Promise<void> {
  console.log('밸런스 변경사항 파싱 시작...\n');

  // 기존 캐릭터 데이터 로드
  const characterMap = await loadExistingCharacters();
  console.log(`기존 캐릭터: ${Object.keys(characterMap).length}명`);

  // 파싱 대상 패치노트 조회
  const unparsedPatches = await getUnparsedPatchNotes();

  if (unparsedPatches.length === 0) {
    console.log('파싱이 필요한 신규 패치 없음');
    return;
  }

  console.log(`파싱 대상: ${unparsedPatches.length}개 패치\n`);

  // 브라우저 시작
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  const affectedCharacters = new Set<string>();

  for (let i = 0; i < unparsedPatches.length; i++) {
    const patch = unparsedPatches[i];
    const progress = `[${i + 1}/${unparsedPatches.length}]`;
    console.log(`${progress} ${patch.title} 파싱 중...`);

    const characters = await parsePatchNote(page, patch.link);
    const patchVersion = extractPatchVersion(patch.title);
    const patchDate = patch.createdAt.split('T')[0];

    for (const char of characters) {
      const key = char.name;
      affectedCharacters.add(key);

      if (!characterMap[key]) {
        characterMap[key] = {
          name: char.name,
          nameEn: char.nameEn,
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

      const overallChange = determineOverallChangeWithComment(char.changes, char.devComment);

      characterMap[key].patchHistory.push({
        patchId: patch.id,
        patchVersion,
        patchDate,
        overallChange,
        streak: 0,
        devComment: char.devComment,
        changes: char.changes,
      });

      const commentInfo = char.devComment ? ` (코멘트: "${char.devComment.slice(0, 30)}...")` : '';
      console.log(
        `  - ${char.name}: ${char.changes.length}개 변경 (${overallChange})${commentInfo}`
      );
    }

    // 패치를 파싱 완료로 표시
    await markPatchAsParsed(patch.id);

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await browser.close();

  // 변경된 캐릭터만 통계 재계산
  console.log(`\n${affectedCharacters.size}명의 캐릭터 통계 재계산 중...`);

  for (const key of affectedCharacters) {
    characterMap[key].patchHistory.sort(
      (a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime()
    );
    characterMap[key].patchHistory = calculateStreaks(characterMap[key].patchHistory);
    characterMap[key].stats = calculateStats(characterMap[key].patchHistory);
  }

  // Firestore에 저장
  await saveCharacters(characterMap);
  await updateMetadata(Object.keys(characterMap).length);

  // 요약 출력
  const characterCount = Object.keys(characterMap).length;
  const totalChanges = Object.values(characterMap).reduce(
    (sum, char) => sum + char.patchHistory.length,
    0
  );

  console.log('\n' + '='.repeat(60));
  console.log('파싱 완료 요약');
  console.log('='.repeat(60));
  console.log(`신규 파싱: ${unparsedPatches.length}개 패치`);
  console.log(`영향받은 캐릭터: ${affectedCharacters.size}명`);
  console.log(`총 캐릭터: ${characterCount}명`);
  console.log(`총 패치 기록: ${totalChanges}개`);
  console.log('Firestore 저장 완료!');

  // 연속 기록 Top 5 출력
  const streakRanking = Object.values(characterMap)
    .filter((c) => c.stats.currentStreak.count >= 2)
    .sort((a, b) => b.stats.currentStreak.count - a.stats.currentStreak.count)
    .slice(0, 5);

  if (streakRanking.length > 0) {
    console.log('\n=== 현재 연속 기록 Top 5 ===');
    streakRanking.forEach((char, i) => {
      const streak = char.stats.currentStreak;
      const emoji = streak.type === 'buff' ? '📈' : '📉';
      console.log(`${i + 1}. ${char.name}: ${emoji} ${streak.count}연속 ${streak.type}`);
    });
  }
}

main().catch(console.error);
