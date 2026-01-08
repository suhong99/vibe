import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

type RevalidateRequest = {
  secret: string;
  tags?: string[];
  paths?: string[];
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RevalidateRequest;

    // Secret 검증
    if (body.secret !== process.env.REVALIDATE_SECRET) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    // 태그 기반 캐시 무효화 (unstable_cache 캐시 무효화)
    const tags = body.tags ?? ['balance-data', 'patch-notes-data'];
    for (const tag of tags) {
      revalidateTag(tag, 'max');
    }

    // 경로 기반 캐시 무효화
    const paths = body.paths ?? ['/', '/admin'];
    for (const path of paths) {
      revalidatePath(path);
    }

    // 모든 캐릭터 페이지 무효화
    revalidatePath('/character/[name]', 'page');
    revalidatePath('/admin/character/[name]', 'page');

    return NextResponse.json({
      success: true,
      revalidated: { tags, paths },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Revalidation error:', error);
    return NextResponse.json({ error: 'Revalidation failed' }, { status: 500 });
  }
}
