import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 타입 정의
// ============================================

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

type BalanceData = {
  updatedAt: string;
  characters: Record<string, CharacterData>;
};

type ValidationResult = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  status: string;
  httpStatus: number;
  hasCharacterData: boolean;
};

type ValidationData = {
  results: ValidationResult[];
};

// ============================================
// 버프/너프 판별 로직
// ============================================

// 감소가 버프인 스탯들 (쿨다운, 마나 소모, 시전 시간, 딜레이 등)
const DECREASE_IS_BUFF = [
  '쿨다운', 'cooldown', 'cd',
  '마나', 'mana', 'sp', 'mp', '소모',
  '시전', 'cast', 'casting',
  '딜레이', 'delay',
  '대기', 'wait',
  '충전', 'charge time',
  '선딜', '후딜',
];

// 증가가 버프인 스탯들 (데미지, 회복량, 공격력 등)
const INCREASE_IS_BUFF = [
  '피해', 'damage', '데미지',
  '회복', 'heal', 'recovery',
  '공격력', 'attack',
  '체력', 'health', 'hp',
  '방어', 'defense', 'armor',
  '속도', 'speed',
  '범위', 'range', 'radius',
  '지속', 'duration',
  '증폭', 'amplification',
  '흡혈', 'lifesteal', 'omnivamp',
  '관통', 'penetration',
  '치명타', 'critical', 'crit',
  '보호막', 'shield',
];

function extractNumbers(value: string): number[] {
  const matches = value.match(/[\d.]+/g);
  return matches ? matches.map(Number) : [];
}

function determineChangeType(stat: string, before: string, after: string): ChangeType {
  const statLower = stat.toLowerCase();
  const beforeNums = extractNumbers(before);
  const afterNums = extractNumbers(after);

  if (beforeNums.length === 0 || afterNums.length === 0) {
    return 'mixed';
  }

  // 평균값으로 비교
  const beforeAvg = beforeNums.reduce((a, b) => a + b, 0) / beforeNums.length;
  const afterAvg = afterNums.reduce((a, b) => a + b, 0) / afterNums.length;

  if (beforeAvg === afterAvg) {
    return 'mixed';
  }

  const isIncrease = afterAvg > beforeAvg;

  // 감소가 버프인 스탯인지 확인
  const isDecreaseBuffStat = DECREASE_IS_BUFF.some(keyword =>
    statLower.includes(keyword.toLowerCase())
  );

  if (isDecreaseBuffStat) {
    return isIncrease ? 'nerf' : 'buff';
  }

  // 기본: 증가가 버프
  return isIncrease ? 'buff' : 'nerf';
}

function determineOverallChange(changes: Change[]): ChangeType {
  const buffCount = changes.filter(c => c.changeType === 'buff').length;
  const nerfCount = changes.filter(c => c.changeType === 'nerf').length;

  if (buffCount > 0 && nerfCount === 0) return 'buff';
  if (nerfCount > 0 && buffCount === 0) return 'nerf';
  return 'mixed';
}

// 개발자 코멘트에서 너프/버프 의도 추출
const NERF_KEYWORDS = [
  // 영어
  'reducing', 'reduce', 'decreased', 'decrease', 'lowering', 'lower',
  'nerfing', 'nerf', 'weaken', 'weakening', 'toning down', 'tune down',
  'too strong', 'very strong', 'overperforming', 'high win rate',
  'high pick rate', 'dominant', 'oppressive', 'keep in check',
  // 한글
  '너프', '하향', '감소', '약화', '줄이', '낮추',
  '너무 강', '강력해서', '승률이 높', '픽률이 높', '지배적',
];

const BUFF_KEYWORDS = [
  // 영어
  'buffing', 'buff', 'increasing', 'increase', 'improving', 'improve',
  'enhancing', 'enhance', 'strengthening', 'strengthen', 'boosting', 'boost',
  'underperforming', 'low win rate', 'low pick rate', 'weak', 'struggling',
  'needs help', 'giving more',
  // 한글
  '버프', '상향', '증가', '강화', '올리', '높이',
  '약해서', '승률이 낮', '픽률이 낮', '부족', '개선',
];

function extractIntentFromComment(comment: string | null): ChangeType | null {
  if (!comment) return null;

  const commentLower = comment.toLowerCase();

  const hasNerfIntent = NERF_KEYWORDS.some(keyword =>
    commentLower.includes(keyword.toLowerCase())
  );
  const hasBuffIntent = BUFF_KEYWORDS.some(keyword =>
    commentLower.includes(keyword.toLowerCase())
  );

  if (hasNerfIntent && !hasBuffIntent) return 'nerf';
  if (hasBuffIntent && !hasNerfIntent) return 'buff';
  return null;
}

function determineOverallChangeWithComment(changes: Change[], comment: string | null): ChangeType {
  const changeBasedResult = determineOverallChange(changes);

  // mixed인 경우 코멘트에서 의도 추출
  if (changeBasedResult === 'mixed' && comment) {
    const commentIntent = extractIntentFromComment(comment);
    if (commentIntent) {
      return commentIntent;
    }
  }

  return changeBasedResult;
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
    await new Promise(resolve => setTimeout(resolve, 1000));

    const characters = await page.evaluate(() => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return [];

      const html = content.innerHTML;

      // 실험체 섹션 찾기 (h5 태그)
      const charMatch = html.match(/<h5[^>]*>실험체<\/h5>/);
      if (!charMatch || charMatch.index === undefined) return [];

      const charStart = charMatch.index;

      // 무기 섹션 또는 코발트/론울프 섹션까지
      const weaponMatch = html.slice(charStart).match(/<h5[^>]*>무기<\/h5>/);
      const cobaltMatch = html.slice(charStart).match(/<h5[^>]*>코발트 프로토콜<\/h5>/);
      const loneWolfMatch = html.slice(charStart).match(/<h5[^>]*>론울프<\/h5>/);

      const endIndices = [
        weaponMatch?.index,
        cobaltMatch?.index,
        loneWolfMatch?.index,
      ].filter((i): i is number => i !== undefined);

      const endIndex = endIndices.length > 0 ? charStart + Math.min(...endIndices) : html.length;
      const characterSection = html.slice(charStart, endIndex);

      // 캐릭터별로 파싱
      // 패턴: <p><strong>캐릭터명</strong></p> 다음에 코멘트와 변경사항
      const characterPattern = /<p[^>]*><span[^>]*><strong>([^<]+)<\/strong><\/span><\/p>/g;
      const results: Array<{ name: string; nameEn: string; devComment: string | null; changes: Array<{ target: string; stat: string; before: string; after: string }> }> = [];

      let match;
      const matches: Array<{ name: string; index: number; fullMatch: string }> = [];

      while ((match = characterPattern.exec(characterSection)) !== null) {
        const name = match[1].trim();
        // 섹션 제목 건너뛰기
        if (!name.match(/^(실험체|무기|시스템|특성)$/)) {
          matches.push({ name, index: match.index, fullMatch: match[0] });
        }
      }

      // 각 캐릭터 블록 파싱
      for (let i = 0; i < matches.length; i++) {
        const { name, index: matchStart, fullMatch } = matches[i];
        const startIdx = matchStart + fullMatch.length; // 캐릭터 이름 태그 끝나는 위치부터
        const endIdx = i + 1 < matches.length ? matches[i + 1].index : characterSection.length;
        const block = characterSection.slice(startIdx, endIdx);

        // 개발자 코멘트: 캐릭터 이름 바로 다음 <p> 태그 (변경사항 <ul> 전)
        let devComment: string | null = null;

        // <ul> 태그 전까지의 <p> 태그들에서 코멘트 찾기
        const ulIndex = block.indexOf('<ul');
        const beforeUl = ulIndex > 0 ? block.slice(0, ulIndex) : block.slice(0, 500);

        // 첫 번째 의미 있는 <p> 태그에서 코멘트 추출 (공백만 있는 건 건너뛰기)
        const pTagPattern = /<p[^>]*><span[^>]*>([^]*?)<\/span><\/p>/g;
        let pMatch;
        while ((pMatch = pTagPattern.exec(beforeUl)) !== null) {
          const rawText = pMatch[1];
          // HTML 태그 제거하고 텍스트만 추출
          const cleanText = rawText
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .trim();

          // 공백이 아니고, 변경사항(→)이 아니고, 의미 있는 길이인 경우
          if (cleanText && !cleanText.includes('→') && cleanText.length > 5) {
            devComment = cleanText;
            break;
          }
        }

        // 변경사항 파싱
        const changes: Array<{ target: string; stat: string; before: string; after: string }> = [];
        let currentTarget = '기본 스탯';

        // <li> 태그에서 변경사항 추출
        const liPattern = /<li[^>]*>([^]*?)<\/li>/g;
        let liMatch;

        while ((liMatch = liPattern.exec(block)) !== null) {
          const liContent = liMatch[1];
          const cleanText = liContent.replace(/<[^>]+>/g, '').trim();

          // 스킬 이름 감지 (Q, W, E, R, P)
          const skillMatch = cleanText.match(/^([^→]+\([QWERP]\))|^([^→]+\(패시브\))/);
          if (skillMatch && !cleanText.includes('→')) {
            currentTarget = skillMatch[0].trim();
            continue;
          }

          // 변경사항 감지 (→ 기호)
          if (cleanText.includes('→')) {
            // 스킬명이 같은 줄에 있는 경우
            const fullMatch = cleanText.match(/^([^→]+\([QWERP]\)|[^→]+\(패시브\))?(.+?)\s+([^\s→]+(?:[^→]*?))\s*→\s*(.+)$/);
            if (fullMatch) {
              if (fullMatch[1]) {
                currentTarget = fullMatch[1].trim();
              }
              const stat = fullMatch[2]?.trim() || '수치';
              const before = fullMatch[3]?.trim() || '';
              const after = fullMatch[4]?.trim() || '';

              if (before && after) {
                changes.push({ target: currentTarget, stat, before, after });
              }
            } else {
              // 간단한 형식
              const simpleMatch = cleanText.match(/(.+?)\s+([^\s→]+(?:\([^)]+\))?(?:[^→]*?))\s*→\s*(.+)$/);
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
          results.push({
            name,
            nameEn: name,
            devComment,
            changes,
          });
        }
      }

      return results;
    });

    // 변경 타입 결정
    return characters.map(char => ({
      ...char,
      changes: char.changes.map(change => ({
        ...change,
        changeType: determineChangeType(change.stat, change.before, change.after),
      })),
    }));
  } catch (error) {
    console.error(`파싱 오류 (${url}):`, error);
    return [];
  }
}

function extractPatchVersion(title: string): string {
  // "9.5c 핫픽스", "2025.12.11 - 9.5 패치노트" 등에서 버전 추출
  // 버전 패턴: 1~2자리.1~2자리 + 선택적 알파벳 (예: 9.5, 9.5c, 1.50)
  // 날짜 패턴 (2025.12.11)은 제외해야 함
  const versionMatch = title.match(/(?:^|\s|-)(\d{1,2}\.\d{1,2}[a-z]?)(?:\s|$|-|패치)/i);
  if (versionMatch) {
    return versionMatch[1];
  }

  // 대안: 핫픽스 앞의 버전
  const hotfixMatch = title.match(/(\d+\.\d+[a-z]?)\s*핫픽스/i);
  if (hotfixMatch) {
    return hotfixMatch[1];
  }

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

  // 패치 히스토리는 최신순이므로, 통계 계산을 위해 오래된 순으로 정렬
  const chronological = [...patchHistory].reverse();

  let currentStreakType: ChangeType | null = null;
  let currentStreakCount = 0;

  for (const patch of chronological) {
    // 카운트 증가
    if (patch.overallChange === 'buff') stats.buffCount++;
    else if (patch.overallChange === 'nerf') stats.nerfCount++;
    else stats.mixedCount++;

    // 연속 계산 (mixed는 연속을 끊지 않고 무시)
    if (patch.overallChange === 'buff' || patch.overallChange === 'nerf') {
      if (currentStreakType === patch.overallChange) {
        currentStreakCount++;
      } else {
        // 이전 연속 기록 저장
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

  // 마지막 연속 기록
  if (currentStreakType === 'buff') {
    stats.maxBuffStreak = Math.max(stats.maxBuffStreak, currentStreakCount);
  } else if (currentStreakType === 'nerf') {
    stats.maxNerfStreak = Math.max(stats.maxNerfStreak, currentStreakCount);
  }

  // 현재 연속 상태 (최신 패치부터)
  stats.currentStreak.type = currentStreakType;
  stats.currentStreak.count = currentStreakCount;

  return stats;
}

function calculateStreaks(patchHistory: PatchEntry[]): PatchEntry[] {
  // 패치 히스토리는 최신순, 연속 계산을 위해 오래된 순으로 처리
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
      // mixed는 연속 1로 표시
      result.push({ ...patch, streak: 1 });
    }
  }

  // 다시 최신순으로 정렬
  return result.reverse();
}

// ============================================
// 메인 함수
// ============================================

async function main(): Promise<void> {
  console.log('밸런스 변경사항 파싱 시작...\n');

  // validation-results.json 로드
  const validationPath = path.join(__dirname, '..', 'data', 'validation-results.json');
  const validationData: ValidationData = JSON.parse(fs.readFileSync(validationPath, 'utf-8'));

  // hasCharacterData가 true인 패치만 필터링
  const targetPatches = validationData.results
    .filter(r => r.status === 'success' && r.hasCharacterData)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 테스트 모드: 명령줄 인수로 제한된 수만 처리
  const testLimit = process.argv[2] ? parseInt(process.argv[2], 10) : targetPatches.length;
  const patchesToProcess = targetPatches.slice(0, testLimit);

  console.log(`캐릭터 데이터가 있는 패치: ${targetPatches.length}개`);
  if (testLimit < targetPatches.length) {
    console.log(`테스트 모드: ${testLimit}개만 처리합니다.`);
  }
  console.log('');

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

  // 캐릭터별 데이터 수집
  const characterMap: Record<string, CharacterData> = {};

  for (let i = 0; i < patchesToProcess.length; i++) {
    const patch = patchesToProcess[i];
    const progress = `[${i + 1}/${patchesToProcess.length}]`;
    console.log(`${progress} ${patch.title} 파싱 중...`);

    const characters = await parsePatchNote(page, patch.link);
    const patchVersion = extractPatchVersion(patch.title);
    const patchDate = patch.createdAt.split('T')[0];

    for (const char of characters) {
      const key = char.name;

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
        streak: 0, // 나중에 계산
        devComment: char.devComment,
        changes: char.changes,
      });

      const commentInfo = char.devComment ? ` (코멘트: "${char.devComment.slice(0, 30)}...")` : '';
      console.log(`  - ${char.name}: ${char.changes.length}개 변경 (${overallChange})${commentInfo}`);
    }

    // 서버 부하 방지
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await browser.close();

  // 통계 및 연속 계산
  for (const key of Object.keys(characterMap)) {
    // 패치 히스토리 날짜순 정렬 (최신순)
    characterMap[key].patchHistory.sort(
      (a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime()
    );

    // 연속 계산
    characterMap[key].patchHistory = calculateStreaks(characterMap[key].patchHistory);

    // 통계 계산
    characterMap[key].stats = calculateStats(characterMap[key].patchHistory);
  }

  // 결과 저장
  const outputData: BalanceData = {
    updatedAt: new Date().toISOString(),
    characters: characterMap,
  };

  const outputPath = path.join(__dirname, '..', 'data', 'balance-changes.json');
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');

  // 요약 출력
  const characterCount = Object.keys(characterMap).length;
  const totalChanges = Object.values(characterMap).reduce(
    (sum, char) => sum + char.patchHistory.length,
    0
  );

  console.log('\n' + '='.repeat(60));
  console.log('파싱 완료 요약');
  console.log('='.repeat(60));
  console.log(`총 캐릭터: ${characterCount}명`);
  console.log(`총 패치 기록: ${totalChanges}개`);
  console.log(`저장 위치: ${outputPath}`);

  // 연속 기록 Top 5 출력
  const streakRanking = Object.values(characterMap)
    .filter(c => c.stats.currentStreak.count >= 2)
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
