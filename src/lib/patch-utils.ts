import type { Character, SortOption, SortDirection, FilterOption, ChangeType } from '@/types/patch';

// 순수 함수: 파이프 유틸리티
const pipe =
  <T>(...fns: Array<(arg: T) => T>) =>
  (value: T): T =>
    fns.reduce((acc, fn) => fn(acc), value);

// 고차 함수: 정렬 함수 생성기
const createSorter =
  (option: SortOption, direction: SortDirection) =>
  (characters: Character[]): Character[] => {
    const multiplier = direction === 'asc' ? 1 : -1;

    const compareFn = (a: Character, b: Character): number => {
      switch (option) {
        case 'name':
          return a.name.localeCompare(b.name, 'ko') * multiplier;
        case 'totalPatches':
          return (a.stats.totalPatches - b.stats.totalPatches) * multiplier;
        case 'buffCount':
          return (a.stats.buffCount - b.stats.buffCount) * multiplier;
        case 'nerfCount':
          return (a.stats.nerfCount - b.stats.nerfCount) * multiplier;
        case 'recentPatch': {
          const dateA = a.patchHistory[0]?.patchDate ?? '1970-01-01';
          const dateB = b.patchHistory[0]?.patchDate ?? '1970-01-01';
          return dateA.localeCompare(dateB) * multiplier;
        }
        default:
          return 0;
      }
    };

    return [...characters].sort(compareFn);
  };

// 순수 함수: 최근 N개 패치 ID 추출
const getRecentPatchIds = (characters: Character[], count: number): Set<number> => {
  const allPatchIds = new Set<number>();
  for (const char of characters) {
    for (const patch of char.patchHistory) {
      allPatchIds.add(patch.patchId);
    }
  }
  const sortedIds = [...allPatchIds].sort((a, b) => b - a);
  return new Set(sortedIds.slice(0, count));
};

// 고차 함수: 필터 함수 생성기
const createFilter =
  (filter: FilterOption, allCharacters: Character[]) =>
  (characters: Character[]): Character[] => {
    if (filter === 'all') return characters;

    switch (filter) {
      case 'buffStreak':
        return characters.filter((char) => char.stats.currentStreak.type === 'buff');
      case 'nerfStreak':
        return characters.filter((char) => char.stats.currentStreak.type === 'nerf');
      case 'recent': {
        const recentPatchIds = getRecentPatchIds(allCharacters, 3);
        return characters.filter((char) =>
          char.patchHistory.some((patch) => recentPatchIds.has(patch.patchId))
        );
      }
      default:
        return characters;
    }
  };

// 고차 함수: 검색 필터 생성기
const createSearchFilter =
  (query: string) =>
  (characters: Character[]): Character[] => {
    if (!query.trim()) return characters;
    const lowerQuery = query.toLowerCase();
    return characters.filter((char) => char.name.toLowerCase().includes(lowerQuery));
  };

// 순수 함수: 캐릭터 필터링 및 정렬 (파이프 패턴)
export const filterAndSortCharacters = (
  characters: Character[],
  options: {
    filter?: FilterOption;
    sort?: SortOption;
    direction?: SortDirection;
    search?: string;
  }
): Character[] => {
  const { filter = 'all', sort = 'name', direction = 'asc', search = '' } = options;

  return pipe<Character[]>(
    createSearchFilter(search),
    createFilter(filter, characters),
    createSorter(sort, direction)
  )(characters);
};

// 순수 함수: 변경 타입에 따른 레이블
export const getChangeTypeLabel = (type: ChangeType): string => {
  const labels: Record<ChangeType, string> = {
    buff: '상향',
    nerf: '하향',
    mixed: '조정',
  };
  return labels[type];
};

// 순수 함수: 변경 타입에 따른 CSS 클래스
export const getChangeTypeColor = (type: ChangeType): string => {
  const colors: Record<ChangeType, string> = {
    buff: 'text-emerald-400',
    nerf: 'text-rose-400',
    mixed: 'text-amber-400',
  };
  return colors[type];
};

// 순수 함수: 변경 타입에 따른 배경 CSS 클래스
export const getChangeTypeBgColor = (type: ChangeType): string => {
  const colors: Record<ChangeType, string> = {
    buff: 'bg-emerald-500/10 border-emerald-500/40',
    nerf: 'bg-rose-500/10 border-rose-500/40',
    mixed: 'bg-amber-500/10 border-amber-500/40',
  };
  return colors[type];
};

// 순수 함수: 날짜 포맷팅 (서버/클라이언트 일관성을 위해 수동 포맷)
export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}년 ${month}월 ${day}일`;
};
