import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { adminAuth, db } from '@/lib/firebase-admin';
import type { ChangeType } from '@/types/patch';

type AdminsDoc = {
  emails: string[];
};

type PatchEntryData = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: ChangeType;
  streak: number;
  devComment: string | null;
  changes: unknown[];
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
  patchHistory: PatchEntryData[];
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

// 전체 패치 히스토리의 streak 재계산
function recalculateAllStreaks(patchHistory: PatchEntryData[]): PatchEntryData[] {
  if (patchHistory.length === 0) return patchHistory;

  // 날짜순 정렬 (오래된 것 먼저)
  const chronological = [...patchHistory].sort(
    (a, b) => new Date(a.patchDate).getTime() - new Date(b.patchDate).getTime()
  );

  let currentStreakType: ChangeType | null = null;
  let currentStreakCount = 0;

  for (let i = 0; i < chronological.length; i++) {
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
function recalculateStats(patchHistory: PatchEntryData[]): CharacterData['stats'] {
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
): Promise<NextResponse> {
  try {
    // 관리자 권한 확인
    const authHeader = request.headers.get('Authorization');
    const isAdmin = await verifyAdmin(authHeader);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await params;
    const characterName = decodeURIComponent(name);

    // Firestore에서 캐릭터 데이터 조회
    const docRef = db.collection('characters').doc(characterName);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const charData = doc.data() as CharacterData;

    // streak 재계산
    const updatedPatchHistory = recalculateAllStreaks(charData.patchHistory);

    // 통계 재계산
    const updatedStats = recalculateStats(updatedPatchHistory);

    // Firestore 업데이트
    await docRef.update({
      patchHistory: updatedPatchHistory,
      stats: updatedStats,
    });

    // 캐시 무효화
    revalidateTag('balance-data', 'max');
    revalidateTag('patch-notes-data', 'max');
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath(`/character/${encodeURIComponent(characterName)}`, 'page');
    revalidatePath(`/admin/character/${encodeURIComponent(characterName)}`, 'page');

    return NextResponse.json({
      success: true,
      message: `${characterName}의 연속 기록이 재계산되었습니다.`,
      stats: updatedStats,
    });
  } catch (error) {
    console.error('Streak recalculation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
