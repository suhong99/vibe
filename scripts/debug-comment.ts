import puppeteer from 'puppeteer';

async function debugComment(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // 최근 패치노트 URL (9.5 패치노트 - 개발자 코멘트가 있을 가능성 높음)
  await page.goto('https://playeternalreturn.com/posts/news/3209', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  const html = await page.evaluate(() => {
    const content = document.querySelector('.er-article-detail__content');
    if (!content) return '';

    const fullHtml = content.innerHTML;

    // 실험체 섹션 찾기
    const charMatch = fullHtml.match(/<h5[^>]*>실험체<\/h5>/);
    if (!charMatch || charMatch.index === undefined) return 'No character section found';

    const charStart = charMatch.index;
    const weaponMatch = fullHtml.slice(charStart).match(/<h5[^>]*>무기<\/h5>/);
    const endIndex = weaponMatch?.index ? charStart + weaponMatch.index : charStart + 5000;

    // 실험체 섹션만 추출 (처음 3000자)
    return fullHtml.slice(charStart, Math.min(endIndex, charStart + 3000));
  });

  console.log('=== 실험체 섹션 HTML 구조 ===\n');
  console.log(html);

  await browser.close();
}

debugComment().catch(console.error);
