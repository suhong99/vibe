/**
 * 패치 데이터 무결성 점검 스크립트
 * - 패치노트 웹페이지에서 언급된 캐릭터 목록 추출
 * - Firebase characters 컬렉션에 해당 patchId가 있는지 확인
 * - 누락된 패치 내역 리포트 생성
 *
 * 사용법:
 *   npx tsx scripts/check-missing-patches.ts                    # 전체 점검
 *   npx tsx scripts/check-missing-patches.ts --patch=1954,1967  # 특정 패치만 점검
 *   npx tsx scripts/check-missing-patches.ts --limit=10         # 최근 10개 패치만 점검
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

// ============================================
// 타입 정의
// ============================================

type PatchNote = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  hasCharacterData?: boolean;
  isParsed?: boolean;
};

type CharacterPatchInfo = {
  name: string;
  patchIds: Set<number>;
};

type MissingPatch = {
  patchId: number;
  patchTitle: string;
  patchDate: string;
  characterName: string;
  crawledFromWeb: boolean;
  existsInFirebase: boolean;
};

type ValidationResult = {
  checkedAt: string;
  totalPatchesChecked: number;
  totalMissing: number;
  missingByPatch: Record<
    number,
    {
      patchTitle: string;
      patchDate: string;
      missingCharacters: string[];
      foundCharacters: string[];
    }
  >;
  missingByCharacter: Record<string, number[]>;
  details: MissingPatch[];
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
// 패치노트에서 캐릭터 목록 추출
// ============================================

async function extractCharactersFromPatchNote(page: Page, patchId: number): Promise<string[]> {
  const url = `https://playeternalreturn.com/posts/news/${patchId}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const characters = await page.evaluate(() => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return [];

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

      if (!characterSectionStart) return [];

      const characterNames: string[] = [];
      const allElements = Array.from(content.children).filter(
        (el) => el.tagName === 'P' || el.tagName === 'UL' || el.tagName === 'H5'
      );

      let inCharacterSection = false;

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

            if (
              spanText === strongText &&
              /^[가-힣&\s]+$/.test(strongText) &&
              !['실험체', '무기', '아이템', '시스템', '특성', '코발트 프로토콜', '론울프'].includes(
                name
              )
            ) {
              characterNames.push(name);
            }
          }
        }

        // UL > LI > P 구조에서도 캐릭터명 찾기 (핫픽스 구조)
        if (el.tagName === 'UL') {
          const topLevelLis = el.querySelectorAll(':scope > li');
          for (const li of Array.from(topLevelLis)) {
            const firstP = li.querySelector(':scope > p');
            if (firstP) {
              const strong = firstP.querySelector('span > strong');
              if (strong) {
                const strongText = strong.textContent?.trim() || '';
                const span = firstP.querySelector('span');
                const spanText = span?.textContent?.trim() || '';

                if (
                  spanText === strongText &&
                  /^[가-힣&\s]+$/.test(strongText) &&
                  ![
                    '실험체',
                    '무기',
                    '아이템',
                    '시스템',
                    '특성',
                    '코발트 프로토콜',
                    '론울프',
                    '옷',
                    '팔/장식',
                    '머리',
                    '다리',
                    '악세서리',
                  ].includes(strongText)
                ) {
                  characterNames.push(strongText);
                }
              }
            }
          }
        }
      }

      return characterNames;
    });

    return characters
      .map(normalizeCharacterName)
      .filter(isValidCharacter)
      .filter((name, index, arr) => arr.indexOf(name) === index); // 중복 제거
  } catch (error) {
    console.error(`  오류 (패치 ${patchId}):`, error);
    return [];
  }
}

// ============================================
// Firebase 데이터 로드
// ============================================

async function loadPatchNotes(patchIds?: number[]): Promise<PatchNote[]> {
  const db = initFirebaseAdmin();

  const snapshot = await db.collection('patchNotes').get();
  const patchNotes: PatchNote[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as PatchNote;
    if (!patchIds || patchIds.includes(data.id)) {
      patchNotes.push(data);
    }
  });

  // id 내림차순 정렬
  patchNotes.sort((a, b) => b.id - a.id);

  return patchNotes;
}

// characters 컬렉션에서 사용된 모든 patchId 수집
async function getUsedPatchIds(): Promise<Set<number>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').get();
  const patchIds = new Set<number>();

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.patchHistory && Array.isArray(data.patchHistory)) {
      for (const patch of data.patchHistory) {
        if (patch.patchId) {
          patchIds.add(patch.patchId);
        }
      }
    }
  });

  return patchIds;
}

async function loadCharacterPatchMap(): Promise<Map<string, Set<number>>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').get();
  const characterMap = new Map<string, Set<number>>();

  snapshot.forEach((doc) => {
    const data = doc.data();
    const patchIds = new Set<number>();

    if (data.patchHistory && Array.isArray(data.patchHistory)) {
      for (const patch of data.patchHistory) {
        if (patch.patchId) {
          patchIds.add(patch.patchId);
        }
      }
    }

    characterMap.set(data.name, patchIds);
  });

  return characterMap;
}

// ============================================
// 메인 함수
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const patchArg = args.find((a) => a.startsWith('--patch='))?.split('=')[1];
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];

  const specificPatchIds = patchArg
    ? patchArg.split(',').map((id) => parseInt(id.trim(), 10))
    : undefined;
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  console.log('패치 데이터 무결성 점검 시작...\n');

  // Firebase에서 캐릭터별 patchId 맵 로드
  console.log('Firebase에서 캐릭터 데이터 로드 중...');
  const characterPatchMap = await loadCharacterPatchMap();
  console.log(`  - ${characterPatchMap.size}명의 캐릭터 로드됨`);

  // characters 컬렉션에서 사용된 patchId 수집
  const usedPatchIds = await getUsedPatchIds();
  console.log(`  - ${usedPatchIds.size}개의 고유 패치 ID 사용됨\n`);

  // 점검 대상 패치노트 로드
  console.log('패치노트 목록 로드 중...');

  // 특정 패치가 지정되지 않은 경우, characters에서 사용된 patchId들만 점검
  const targetPatchIds = specificPatchIds || Array.from(usedPatchIds);
  let patchNotes = await loadPatchNotes(targetPatchIds);

  if (limit && !specificPatchIds) {
    patchNotes = patchNotes.slice(0, limit);
  }

  console.log(`  - ${patchNotes.length}개 패치 점검 예정\n`);

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

  const result: ValidationResult = {
    checkedAt: new Date().toISOString(),
    totalPatchesChecked: patchNotes.length,
    totalMissing: 0,
    missingByPatch: {},
    missingByCharacter: {},
    details: [],
  };

  // 각 패치노트 점검
  for (let i = 0; i < patchNotes.length; i++) {
    const patch = patchNotes[i];
    const progress = `[${i + 1}/${patchNotes.length}]`;
    console.log(`${progress} 패치 ${patch.id} (${patch.title}) 점검 중...`);

    // 웹에서 캐릭터 목록 추출
    const webCharacters = await extractCharactersFromPatchNote(page, patch.id);

    if (webCharacters.length === 0) {
      console.log(`  - 캐릭터 데이터 없음 (스킵)`);
      continue;
    }

    // Firebase에서 해당 patchId를 가진 캐릭터 확인
    const firebaseCharacters: string[] = [];
    for (const [charName, patchIds] of characterPatchMap) {
      if (patchIds.has(patch.id)) {
        firebaseCharacters.push(charName);
      }
    }

    // 누락된 캐릭터 찾기 (웹에 있지만 Firebase에 없는 경우)
    const missingCharacters = webCharacters.filter((name) => !firebaseCharacters.includes(name));

    // 결과 기록
    if (missingCharacters.length > 0 || webCharacters.length !== firebaseCharacters.length) {
      const patchDate = patch.createdAt.split('T')[0];

      result.missingByPatch[patch.id] = {
        patchTitle: patch.title,
        patchDate,
        missingCharacters,
        foundCharacters: firebaseCharacters,
      };

      for (const charName of missingCharacters) {
        result.details.push({
          patchId: patch.id,
          patchTitle: patch.title,
          patchDate,
          characterName: charName,
          crawledFromWeb: true,
          existsInFirebase: false,
        });

        if (!result.missingByCharacter[charName]) {
          result.missingByCharacter[charName] = [];
        }
        result.missingByCharacter[charName].push(patch.id);
      }

      console.log(`  - 웹: ${webCharacters.length}명, Firebase: ${firebaseCharacters.length}명`);
      if (missingCharacters.length > 0) {
        console.log(`  - 누락: ${missingCharacters.join(', ')}`);
      }
    } else {
      console.log(`  - OK (${webCharacters.length}명)`);
    }

    // 속도 제한
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await browser.close();

  // 결과 집계
  result.totalMissing = result.details.length;

  // 결과 출력
  console.log('\n' + '='.repeat(60));
  console.log('점검 완료');
  console.log('='.repeat(60));
  console.log(`총 점검 패치: ${result.totalPatchesChecked}개`);
  console.log(`누락된 항목: ${result.totalMissing}개\n`);

  if (result.totalMissing > 0) {
    console.log('=== 패치별 누락 현황 ===');
    for (const [patchId, info] of Object.entries(result.missingByPatch)) {
      if (info.missingCharacters.length > 0) {
        console.log(`\n패치 ${patchId} (${info.patchTitle}):`);
        console.log(`  날짜: ${info.patchDate}`);
        console.log(`  누락: ${info.missingCharacters.join(', ')}`);
      }
    }

    console.log('\n=== 캐릭터별 누락 현황 ===');
    const sortedByCount = Object.entries(result.missingByCharacter).sort(
      (a, b) => b[1].length - a[1].length
    );
    for (const [charName, patchIds] of sortedByCount) {
      console.log(`${charName}: ${patchIds.length}개 패치 누락 (${patchIds.join(', ')})`);
    }

    // 결과 파일 저장
    if (!existsSync('data')) {
      mkdirSync('data');
    }
    writeFileSync('data/missing-patches.json', JSON.stringify(result, null, 2));
    console.log('\n결과가 data/missing-patches.json에 저장되었습니다.');
  } else {
    console.log('모든 패치 데이터가 일치합니다!');
  }
}

main().catch(console.error);
