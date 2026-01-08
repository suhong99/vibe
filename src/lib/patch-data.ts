import { unstable_cache } from 'next/cache';
import { db } from './firebase-admin';
import type {
  BalanceChangesData,
  Character,
  PatchNotesData,
  LatestPatchInfo,
  PatchNote,
} from '@/types/patch';

// 내부 함수: 밸런스 데이터 fetch (Firebase에서 직접 조회)
const fetchBalanceData = async (): Promise<BalanceChangesData> => {
  // 메타데이터 조회
  const metadataDoc = await db.collection('metadata').doc('balanceChanges').get();
  const metadata = metadataDoc.data();

  // 모든 캐릭터 조회
  const charactersSnapshot = await db.collection('characters').get();
  const characters: Record<string, Character> = {};

  charactersSnapshot.forEach((doc) => {
    const data = doc.data() as Character;
    characters[data.name] = data;
  });

  return {
    updatedAt: metadata?.updatedAt ?? new Date().toISOString(),
    characters,
  };
};

// 내부 함수: 패치노트 데이터 fetch (Firebase에서 직접 조회)
const fetchPatchNotesData = async (): Promise<PatchNotesData> => {
  // 메타데이터 조회
  const metadataDoc = await db.collection('metadata').doc('patchNotes').get();
  const metadata = metadataDoc.data();

  // 모든 패치노트 조회 (id 내림차순 정렬)
  const patchNotesSnapshot = await db.collection('patchNotes').orderBy('id', 'desc').get();

  const patchNotes: PatchNote[] = [];
  patchNotesSnapshot.forEach((doc) => {
    patchNotes.push(doc.data() as PatchNote);
  });

  return {
    crawledAt: metadata?.crawledAt ?? new Date().toISOString(),
    totalCount: metadata?.totalCount ?? patchNotes.length,
    patchNotes,
  };
};

// 캐싱된 데이터 로드 함수 (unstable_cache로 캐싱, revalidateTag로 무효화)
export const loadBalanceData = unstable_cache(fetchBalanceData, ['balance-data'], {
  revalidate: 3600,
  tags: ['balance-data'],
});

export const loadPatchNotesData = unstable_cache(fetchPatchNotesData, ['patch-notes-data'], {
  revalidate: 3600,
  tags: ['patch-notes-data'],
});

// 순수 함수: 패치 버전 추출 (제목에서)
const extractPatchVersion = (title: string): string => {
  const match = title.match(/(\d{1,2}\.\d{1,2}[a-z]?)/);
  return match ? match[1] : title;
};

// 순수 함수: 최신 패치 정보 가져오기
export const getLatestPatchInfo = async (): Promise<LatestPatchInfo | null> => {
  const patchNotesData = await loadPatchNotesData();
  const latestPatch = patchNotesData.patchNotes[0];

  if (!latestPatch) return null;

  return {
    version: extractPatchVersion(latestPatch.title),
    title: latestPatch.title,
    crawledAt: patchNotesData.crawledAt,
    patchDate: latestPatch.createdAt,
  };
};

// 순수 함수: 데이터 수집 범위 가져오기 (가장 오래된 패치)
export const getDataCoverageInfo = (
  characters: Character[]
): { oldestVersion: string; oldestDate: string } | null => {
  let oldestPatch: { patchId: number; patchVersion: string; patchDate: string } | null = null;

  for (const char of characters) {
    for (const patch of char.patchHistory) {
      if (!oldestPatch || patch.patchId < oldestPatch.patchId) {
        oldestPatch = {
          patchId: patch.patchId,
          patchVersion: patch.patchVersion,
          patchDate: patch.patchDate,
        };
      }
    }
  }

  if (!oldestPatch) return null;

  // 버전 정규화 (87.0c -> 0.87.0c)
  let version = oldestPatch.patchVersion;
  if (/^\d{2}\.\d/.test(version)) {
    version = `0.${version}`;
  }

  return {
    oldestVersion: version,
    oldestDate: oldestPatch.patchDate,
  };
};

// 순수 함수: 캐릭터 목록 추출
export const extractCharacters = (data: BalanceChangesData): Character[] =>
  Object.values(data.characters);

// 순수 함수: 캐릭터 이름으로 찾기
export const findCharacterByName = (characters: Character[], name: string): Character | undefined =>
  characters.find((char) => char.name === name || encodeURIComponent(char.name) === name);

// 순수 함수: 통계 요약 계산
export const calculateStatsSummary = (
  characters: Character[]
): {
  totalCharacters: number;
  avgPatches: number;
  mostBuffed: Character | null;
  mostNerfed: Character | null;
} => {
  const totalCharacters = characters.length;

  const avgPatches =
    totalCharacters > 0
      ? characters.reduce((sum, char) => sum + char.stats.totalPatches, 0) / totalCharacters
      : 0;

  const mostBuffed = characters.reduce<Character | null>(
    (max, char) => (!max || char.stats.buffCount > max.stats.buffCount ? char : max),
    null
  );

  const mostNerfed = characters.reduce<Character | null>(
    (max, char) => (!max || char.stats.nerfCount > max.stats.nerfCount ? char : max),
    null
  );

  return { totalCharacters, avgPatches, mostBuffed, mostNerfed };
};

// 순수 함수: 모든 캐릭터 이름 추출 (검색 자동완성용)
export const getAllCharacterNames = (characters: Character[]): string[] =>
  characters.map((char) => char.name).sort((a, b) => a.localeCompare(b, 'ko'));

// 클라이언트 공용 유틸리티 재export
export {
  filterAndSortCharacters,
  getChangeTypeLabel,
  getChangeTypeColor,
  getChangeTypeBgColor,
  formatDate,
} from './patch-utils';
