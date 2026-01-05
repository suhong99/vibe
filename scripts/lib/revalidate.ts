/**
 * Vercel에 배포된 사이트의 캐시를 무효화합니다.
 * 환경변수:
 * - SITE_URL: 배포된 사이트 URL (예: https://er-patch-tracker.vercel.app)
 * - REVALIDATE_SECRET: revalidation API의 secret key
 */
export async function triggerRevalidation(): Promise<boolean> {
  const siteUrl = process.env.SITE_URL;
  const secret = process.env.REVALIDATE_SECRET;

  if (!siteUrl || !secret) {
    console.log('⚠️  SITE_URL 또는 REVALIDATE_SECRET이 설정되지 않아 revalidation을 건너뜁니다.');
    return false;
  }

  try {
    console.log('\n캐시 무효화 요청 중...');

    const response = await fetch(`${siteUrl}/api/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ secret }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ 캐시 무효화 실패: ${response.status} - ${errorText}`);
      return false;
    }

    const result = await response.json();
    console.log('✅ 캐시 무효화 완료:', result.timestamp);
    return true;
  } catch (error) {
    console.error('❌ 캐시 무효화 중 오류:', error);
    return false;
  }
}
