import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';

type PatchNote = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  // 검증 결과 필드
  status?: 'success' | 'no_content' | 'error' | 'redirect';
  hasCharacterData?: boolean;
  validatedAt?: string;
};

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Firestore에서 검증이 필요한 패치노트 조회
async function getUnvalidatedPatchNotes(): Promise<PatchNote[]> {
  const db = initFirebaseAdmin();

  // status 필드가 없는 패치노트 조회
  const snapshot = await db.collection('patchNotes').orderBy('id', 'desc').get();

  const unvalidated: PatchNote[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as PatchNote;
    // status가 없거나 undefined인 경우만 검증 대상
    if (!data.status) {
      unvalidated.push(data);
    }
  });

  return unvalidated;
}

// 패치노트 검증 결과 업데이트
async function updatePatchNoteValidation(
  id: number,
  status: 'success' | 'no_content' | 'error' | 'redirect',
  hasCharacterData: boolean
): Promise<void> {
  const db = initFirebaseAdmin();
  await db.collection('patchNotes').doc(id.toString()).update({
    status,
    hasCharacterData,
    validatedAt: new Date().toISOString(),
  });
}

async function validateLinks(): Promise<void> {
  // 검증이 필요한 패치노트 조회
  const unvalidatedPatches = await getUnvalidatedPatchNotes();

  if (unvalidatedPatches.length === 0) {
    console.log('검증이 필요한 신규 패치노트 없음');
    return;
  }

  console.log(`${unvalidatedPatches.length}개의 신규 패치노트 링크 검사 시작...\n`);

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // 한국어 페이지 렌더링을 위한 쿠키 설정
  await page.setCookie({
    name: 'locale',
    value: 'ko_KR',
    domain: 'playeternalreturn.com',
  });

  let successCount = 0;
  let failedCount = 0;
  let withCharacterDataCount = 0;

  for (let i = 0; i < unvalidatedPatches.length; i++) {
    const note = unvalidatedPatches[i];
    const progress = `[${i + 1}/${unvalidatedPatches.length}]`;

    try {
      const response = await page.goto(note.link, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      const httpStatus = response?.status() || 0;
      const finalUrl = page.url();

      // 리다이렉트 확인
      if (!finalUrl.includes(`/posts/news/${note.id}`)) {
        console.log(`${progress} ⚠️ 리다이렉트: ${note.title}`);
        await updatePatchNoteValidation(note.id, 'redirect', false);
        failedCount++;
        continue;
      }

      if (httpStatus !== 200) {
        console.log(`${progress} ❌ HTTP ${httpStatus}: ${note.title}`);
        await updatePatchNoteValidation(note.id, 'error', false);
        failedCount++;
        continue;
      }

      await delay(500);

      // 콘텐츠 확인
      const pageCheck = await page.evaluate(() => {
        const contentEl = document.querySelector('.er-article-detail__content');
        const content = contentEl?.textContent?.trim() || '';

        // 실험체 관련 키워드 확인
        const hasCharacterData =
          content.includes('실험체') ||
          content.includes('스킬') ||
          content.includes('패시브') ||
          content.includes('쿨다운') ||
          content.includes('피해량') ||
          content.includes('체력') ||
          content.includes('공격력');

        return {
          hasContent: content.length > 100,
          contentLength: content.length,
          hasCharacterData,
        };
      });

      if (!pageCheck.hasContent) {
        console.log(`${progress} ⚠️ 콘텐츠 없음: ${note.title}`);
        await updatePatchNoteValidation(note.id, 'no_content', false);
        failedCount++;
      } else {
        console.log(
          `${progress} ✅ ${pageCheck.hasCharacterData ? '실험체 데이터 있음' : '일반 패치'}: ${note.title}`
        );
        await updatePatchNoteValidation(note.id, 'success', pageCheck.hasCharacterData);
        successCount++;
        if (pageCheck.hasCharacterData) {
          withCharacterDataCount++;
        }
      }
    } catch (error) {
      console.log(`${progress} ❌ 오류: ${note.title} - ${error}`);
      await updatePatchNoteValidation(note.id, 'error', false);
      failedCount++;
    }

    // 서버 부하 방지를 위한 딜레이
    await delay(300);
  }

  await browser.close();

  // 요약 출력
  console.log('\n' + '='.repeat(60));
  console.log('검증 완료 요약');
  console.log('='.repeat(60));
  console.log(`검사 완료: ${unvalidatedPatches.length}개`);
  console.log(`  - 성공: ${successCount}개`);
  console.log(`  - 실패: ${failedCount}개`);
  console.log(`  - 실험체 데이터 포함: ${withCharacterDataCount}개`);
  console.log('\nFirestore 업데이트 완료!');
}

validateLinks().catch(console.error);
