/**
 * 이터널 리턴 시즌 정보
 * - 프리시즌은 다음 시즌 시작으로 포함
 * - S8부터 버전 체계 변경 (1.x → 8.x)
 */

export type Season = {
  number: number;
  name: string;
  nameKo: string;
  startPatch: string;
  startDate: string;
  endPatch: string | null; // null = 현재 시즌
};

export const SEASONS: Season[] = [
  {
    number: 1,
    name: 'Vacation',
    nameKo: '휴가',
    startPatch: '1.0',
    startDate: '2023-07-20',
    endPatch: '1.6',
  },
  {
    number: 2,
    name: 'Battle Maid',
    nameKo: '전투 메이드',
    startPatch: '1.7',
    startDate: '2023-10-26',
    endPatch: '1.14',
  },
  {
    number: 3,
    name: 'Change',
    nameKo: '변화',
    startPatch: '1.15',
    startDate: '2024-02-15',
    endPatch: '1.21',
  },
  {
    number: 4,
    name: 'Sunset',
    nameKo: '선셋',
    startPatch: '1.22',
    startDate: '2024-05-23',
    endPatch: '1.28',
  },
  {
    number: 5,
    name: 'Lucky',
    nameKo: '럭키',
    startPatch: '1.29',
    startDate: '2024-08-29',
    endPatch: '1.35',
  },
  {
    number: 6,
    name: 'Legion',
    nameKo: '레기온',
    startPatch: '1.36',
    startDate: '2024-12-05',
    endPatch: '1.42',
  },
  {
    number: 7,
    name: 'Academy',
    nameKo: '아카데미',
    startPatch: '1.43',
    startDate: '2025-03-20',
    endPatch: '1.50',
  },
  {
    number: 8,
    name: 'Splash',
    nameKo: '스플래시',
    startPatch: '8.0',
    startDate: '2025-07-10',
    endPatch: '8.6',
  },
  {
    number: 9,
    name: 'Season 9',
    nameKo: '마츠리',
    startPatch: '9.0',
    startDate: '2025-10-16',
    endPatch: null,
  },
];

/**
 * 패치 버전을 비교 가능한 숫자로 변환
 * 예: "1.43" → 1.43, "8.0" → 8.0, "1.43a" → 1.43
 */
function parsePatchVersion(patchVersion: string): number {
  // 앞의 0. 제거 (예: 0.87.0 → 87.0)
  const normalized = patchVersion.replace(/^0\./, '');
  // 알파벳 제거 (예: 1.43a → 1.43)
  const numericPart = normalized.replace(/[a-z]/gi, '');
  // 첫 번째 숫자.두 번째 숫자 형태로 파싱
  const match = numericPart.match(/^(\d+)\.?(\d+)?/);
  if (!match) return 0;

  const major = parseInt(match[1], 10);
  const minor = match[2] ? parseInt(match[2], 10) : 0;

  return major + minor / 100;
}

/**
 * 패치 버전으로 시즌 찾기
 */
export function getSeasonByPatchVersion(patchVersion: string): Season | null {
  const version = parsePatchVersion(patchVersion);

  for (let i = SEASONS.length - 1; i >= 0; i--) {
    const season = SEASONS[i];
    const startVersion = parsePatchVersion(season.startPatch);
    const endVersion = season.endPatch ? parsePatchVersion(season.endPatch) : Infinity;

    if (version >= startVersion && version <= endVersion) {
      return season;
    }
  }

  return null;
}

/**
 * 시즌 번호로 시즌 찾기
 */
export function getSeasonByNumber(seasonNumber: number): Season | null {
  return SEASONS.find((s) => s.number === seasonNumber) ?? null;
}

/**
 * 현재 시즌 가져오기
 */
export function getCurrentSeason(): Season {
  return SEASONS[SEASONS.length - 1];
}

/**
 * 모든 시즌 번호 배열 (필터용)
 */
export function getAllSeasonNumbers(): number[] {
  return SEASONS.map((s) => s.number);
}

/**
 * 시즌 표시 문자열 생성
 */
export function formatSeasonLabel(season: Season): string {
  return `S${season.number} ${season.nameKo}`;
}

/**
 * 패치 목록을 시즌별로 그룹핑
 */
export function groupPatchesBySeason<T extends { patchVersion: string }>(
  patches: T[]
): Map<Season, T[]> {
  const grouped = new Map<Season, T[]>();

  for (const patch of patches) {
    const season = getSeasonByPatchVersion(patch.patchVersion);
    if (season) {
      const existing = grouped.get(season) ?? [];
      grouped.set(season, [...existing, patch]);
    }
  }

  // 시즌 번호 내림차순 정렬 (최신 시즌 먼저)
  const sortedEntries = Array.from(grouped.entries()).sort(([a], [b]) => b.number - a.number);

  return new Map(sortedEntries);
}

/**
 * 패치에 포함된 시즌 목록 추출 (내림차순)
 */
export function getSeasonsFromPatches<T extends { patchVersion: string }>(patches: T[]): Season[] {
  const seasonSet = new Set<number>();

  for (const patch of patches) {
    const season = getSeasonByPatchVersion(patch.patchVersion);
    if (season) {
      seasonSet.add(season.number);
    }
  }

  return Array.from(seasonSet)
    .sort((a, b) => b - a)
    .map((num) => getSeasonByNumber(num))
    .filter((s): s is Season => s !== null);
}
