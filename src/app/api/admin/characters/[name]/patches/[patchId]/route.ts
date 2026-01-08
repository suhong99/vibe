import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { adminAuth, db } from '@/lib/firebase-admin';
import type { PatchEntry, Change, ChangeType } from '@/types/patch';

type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

type ExtendedChange = Change & {
  changeCategory?: ChangeCategory;
};

type ExtendedPatchEntry = Omit<PatchEntry, 'changes'> & {
  changes: ExtendedChange[];
};

type CharacterData = {
  name: string;
  nameEn?: string;
  stats: {
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
  patchHistory: ExtendedPatchEntry[];
};

type AdminsDoc = {
  emails: string[];
};

async function verifyAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const email = decodedToken.email;

    if (!email) return false;

    const adminDoc = await db.collection('metadata').doc('admins').get();
    if (!adminDoc.exists) return false;

    const adminData = adminDoc.data() as AdminsDoc;
    return adminData.emails?.includes(email) ?? false;
  } catch {
    return false;
  }
}

// 변경된 패치부터 이후 패치들의 streak만 재계산 (최적화)
function recalculateStreaksFromIndex(
  patchHistory: ExtendedPatchEntry[],
  changedPatchId: number
): ExtendedPatchEntry[] {
  if (patchHistory.length === 0) return patchHistory;

  // 날짜순 정렬 (오래된 것 먼저)
  const chronological = [...patchHistory].sort(
    (a, b) => new Date(a.patchDate).getTime() - new Date(b.patchDate).getTime()
  );

  // 변경된 패치의 인덱스 찾기
  const changedIndex = chronological.findIndex((p) => p.patchId === changedPatchId);
  if (changedIndex === -1)
    // 최신순(내림차순)으로 다시 정렬해서 반환
    return chronological.sort(
      (a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime()
    );

  // 변경된 패치 이전의 마지막 streak 상태 가져오기
  let currentStreakType: ChangeType | null = null;
  let currentStreakCount = 0;

  if (changedIndex > 0) {
    // 변경된 패치 직전까지의 streak 상태 계산
    for (let i = 0; i < changedIndex; i++) {
      const patch = chronological[i];
      if (patch.overallChange === 'buff' || patch.overallChange === 'nerf') {
        if (currentStreakType === patch.overallChange) {
          currentStreakCount++;
        } else {
          currentStreakType = patch.overallChange;
          currentStreakCount = 1;
        }
      } else {
        currentStreakType = null;
        currentStreakCount = 0;
      }
    }
  }

  // 변경된 패치부터 이후 패치들만 streak 재계산
  for (let i = changedIndex; i < chronological.length; i++) {
    const patch = chronological[i];
    if (patch.overallChange === 'buff' || patch.overallChange === 'nerf') {
      if (currentStreakType === patch.overallChange) {
        currentStreakCount++;
      } else {
        currentStreakType = patch.overallChange;
        currentStreakCount = 1;
      }
      chronological[i] = { ...patch, streak: currentStreakCount };
    } else {
      currentStreakType = null;
      currentStreakCount = 0;
      chronological[i] = { ...patch, streak: 1 };
    }
  }

  // 최신순(내림차순)으로 다시 정렬해서 반환
  return chronological.sort(
    (a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime()
  );
}

// 통계 재계산
function recalculateStats(patchHistory: ExtendedPatchEntry[]): CharacterData['stats'] {
  const stats: CharacterData['stats'] = {
    totalPatches: patchHistory.length,
    buffCount: 0,
    nerfCount: 0,
    mixedCount: 0,
    currentStreak: { type: null, count: 0 },
    maxBuffStreak: 0,
    maxNerfStreak: 0,
  };

  if (patchHistory.length === 0) return stats;

  // 날짜순 정렬 (오래된 것 먼저)
  const chronological = [...patchHistory].sort(
    (a, b) => new Date(a.patchDate).getTime() - new Date(b.patchDate).getTime()
  );

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
    } else {
      if (currentStreakType === 'buff') {
        stats.maxBuffStreak = Math.max(stats.maxBuffStreak, currentStreakCount);
      } else if (currentStreakType === 'nerf') {
        stats.maxNerfStreak = Math.max(stats.maxNerfStreak, currentStreakCount);
      }
      currentStreakType = null;
      currentStreakCount = 0;
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string; patchId: string }> }
): Promise<NextResponse> {
  try {
    // 관리자 권한 확인
    const authHeader = request.headers.get('Authorization');
    const isAdmin = await verifyAdmin(authHeader);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, patchId } = await params;
    const characterName = decodeURIComponent(name);
    const patchIdNum = parseInt(patchId);

    // 요청 body 파싱
    const updatedPatch = (await request.json()) as ExtendedPatchEntry;

    // Firestore에서 캐릭터 데이터 조회
    const docRef = db.collection('characters').doc(characterName);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const charData = doc.data() as CharacterData;

    // 해당 패치 찾기
    const patchIndex = charData.patchHistory.findIndex((p) => p.patchId === patchIdNum);
    if (patchIndex === -1) {
      return NextResponse.json({ error: 'Patch not found' }, { status: 404 });
    }

    // 패치 업데이트
    charData.patchHistory[patchIndex] = {
      ...charData.patchHistory[patchIndex],
      ...updatedPatch,
      patchId: patchIdNum, // patchId는 변경 불가
    };

    // 변경된 패치부터 이후만 streak 재계산
    charData.patchHistory = recalculateStreaksFromIndex(charData.patchHistory, patchIdNum);

    // 통계 재계산
    charData.stats = recalculateStats(charData.patchHistory);

    // Firestore 저장
    await docRef.update({
      patchHistory: charData.patchHistory,
      stats: charData.stats,
    });

    // 태그 기반 캐시 무효화 (unstable_cache 캐시 무효화)
    revalidateTag('balance-data', 'max');
    revalidateTag('patch-notes-data', 'max');

    // 경로 기반 캐시 무효화 (전체 페이지)
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/character/[name]', 'page');
    revalidatePath('/admin/character/[name]', 'page');

    return NextResponse.json({
      success: true,
      message: 'Patch updated successfully',
    });
  } catch (error) {
    console.error('Patch update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
