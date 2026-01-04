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
};

type ApiArticle = {
  id: number;
  thumbnail_url: string;
  view_count: number;
  created_at: string;
  updated_at: string;
  i18ns: {
    ko_KR?: {
      title: string;
      content_link: string;
    };
  };
  url: string;
};

type ApiResponse = {
  per_page: number;
  current_page: number;
  total_page: number;
  article_count: number;
  articles: ApiArticle[];
};

// Firestore에서 기존 패치 ID 조회
async function getExistingPatchIds(): Promise<Set<number>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('patchNotes').select().get();
  const ids = new Set<number>();

  snapshot.forEach((doc) => {
    ids.add(parseInt(doc.id, 10));
  });

  console.log(`Firestore에서 기존 패치노트 ${ids.size}개 확인`);
  return ids;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// API에서 직접 패치노트 목록 가져오기
async function fetchPatchNotesPage(page: Page, pageNum: number): Promise<ApiArticle[]> {
  const result = await page.evaluate(async (num: number) => {
    const response = await fetch(
      `https://playeternalreturn.com/api/v1/posts/news?category=patchnote&page=${num}&search_type=title&search_text=`
    );
    const data = await response.json();
    return data as ApiResponse;
  }, pageNum);

  return result.articles;
}

// 증분 크롤링: 신규 패치노트만 수집
async function crawlNewPatchNotes(existingIds: Set<number>): Promise<{
  newPatchNotes: PatchNote[];
  isFullCrawl: boolean;
}> {
  console.log('브라우저 시작...');

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

  // 첫 페이지 로드 (쿠키/세션 설정용)
  console.log('패치노트 목록 페이지 접속...');
  await page.goto('https://playeternalreturn.com/posts/news?categoryPath=patchnote', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await delay(1000);

  const newArticles: ApiArticle[] = [];
  let currentPage = 1;
  let foundExisting = false;
  const isFullCrawl = existingIds.size === 0;

  if (isFullCrawl) {
    console.log('기존 데이터 없음 - 전체 크롤링 진행');
  } else {
    console.log(`기존 패치노트 ${existingIds.size}개 확인됨 - 증분 크롤링 진행`);
  }

  // 페이지 순회하며 신규 패치 찾기
  while (!foundExisting) {
    console.log(`페이지 ${currentPage} 확인 중...`);

    const articles = await fetchPatchNotesPage(page, currentPage);

    if (articles.length === 0) {
      console.log('더 이상 패치노트 없음');
      break;
    }

    for (const article of articles) {
      if (existingIds.has(article.id)) {
        // 이미 있는 패치 발견 - 여기서 중단
        foundExisting = true;
        console.log(`기존 패치 발견 (ID: ${article.id}) - 크롤링 중단`);
        break;
      }
      newArticles.push(article);
    }

    if (!foundExisting) {
      currentPage++;
      await delay(300);
    }
  }

  console.log(`\n신규 패치노트 ${newArticles.length}개 발견`);

  await browser.close();

  // 데이터 변환
  const newPatchNotes: PatchNote[] = newArticles.map((article) => ({
    id: article.id,
    title: article.i18ns.ko_KR?.title || '',
    link: article.url || article.i18ns.ko_KR?.content_link || '',
    createdAt: article.created_at,
    updatedAt: article.updated_at,
    thumbnailUrl: article.thumbnail_url,
    viewCount: article.view_count,
  }));

  return { newPatchNotes, isFullCrawl };
}

// Firestore에 패치노트 저장
async function savePatchNotesToFirestore(patchNotes: PatchNote[]): Promise<void> {
  const db = initFirebaseAdmin();
  const batchSize = 500;

  console.log(`\nFirestore에 ${patchNotes.length}개 패치노트 저장 중...`);

  for (let i = 0; i < patchNotes.length; i += batchSize) {
    const batch = db.batch();
    const chunk = patchNotes.slice(i, i + batchSize);

    for (const patchNote of chunk) {
      const docRef = db.collection('patchNotes').doc(patchNote.id.toString());
      batch.set(docRef, patchNote);
    }

    await batch.commit();
    console.log(`  - ${Math.min(i + batchSize, patchNotes.length)}/${patchNotes.length} 저장 완료`);
  }
}

// 메타데이터 업데이트
async function updateMetadata(totalCount: number): Promise<void> {
  const db = initFirebaseAdmin();
  await db.collection('metadata').doc('patchNotes').set(
    {
      crawledAt: new Date().toISOString(),
      totalCount,
    },
    { merge: true }
  );
}

async function main(): Promise<void> {
  try {
    // Firestore에서 기존 ID 로드
    const existingIds = await getExistingPatchIds();

    // 증분 크롤링
    const { newPatchNotes, isFullCrawl } = await crawlNewPatchNotes(existingIds);

    // 신규 패치가 없으면 종료
    if (newPatchNotes.length === 0 && !isFullCrawl) {
      console.log('\n신규 패치노트 없음 - 업데이트 불필요');
      return;
    }

    // Firestore에 저장
    await savePatchNotesToFirestore(newPatchNotes);

    // 메타데이터 업데이트
    const totalCount = existingIds.size + newPatchNotes.length;
    await updateMetadata(totalCount);

    // 결과 출력
    if (newPatchNotes.length > 0) {
      console.log('\n=== 신규 패치노트 ===');
      newPatchNotes.forEach((note, i) => {
        const date = new Date(note.createdAt);
        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        console.log(`${i + 1}. ${note.title}`);
        console.log(`   날짜: ${formattedDate}`);
        console.log(`   링크: ${note.link}`);
      });
    }

    console.log(`\n총 패치노트: ${totalCount}개`);
    console.log('Firestore 저장 완료!');
  } catch (error) {
    console.error('크롤링 중 오류 발생:', error);
    process.exit(1);
  }
}

main();
