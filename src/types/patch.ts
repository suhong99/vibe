// 패치 변경 사항 타입
export type ChangeType = 'buff' | 'nerf' | 'mixed';
export type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

// 수치 변경 (before → after)
export type NumericChange = {
  target: string;
  stat: string;
  before: string;
  after: string;
  changeType: ChangeType;
  changeCategory: 'numeric';
};

// 설명형 변경 (기능 변경, 추가, 제거 등)
export type DescriptionChange = {
  target: string;
  description: string;
  changeType: ChangeType;
  changeCategory: 'mechanic' | 'added' | 'removed' | 'unknown';
};

// 통합 타입
export type Change = NumericChange | DescriptionChange;

// 타입 가드
export const isNumericChange = (change: Change): change is NumericChange => {
  return change.changeCategory === 'numeric';
};

export const isDescriptionChange = (change: Change): change is DescriptionChange => {
  return change.changeCategory !== 'numeric';
};

export type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: ChangeType;
  streak: number;
  devComment: string | null;
  changes: Change[];
};

export type CurrentStreak = {
  type: ChangeType | null;
  count: number;
};

export type CharacterStats = {
  totalPatches: number;
  buffCount: number;
  nerfCount: number;
  mixedCount: number;
  currentStreak: CurrentStreak;
  maxBuffStreak: number;
  maxNerfStreak: number;
};

export type Character = {
  name: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};

export type BalanceChangesData = {
  updatedAt: string;
  characters: Record<string, Character>;
};

// 정렬 옵션
export type SortOption = 'name' | 'totalPatches' | 'buffCount' | 'nerfCount' | 'recentPatch';

export type SortDirection = 'asc' | 'desc';

// 필터 옵션
export type FilterOption = 'all' | 'buffStreak' | 'nerfStreak' | 'recent';

// 패치노트 타입
export type PatchNote = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string;
  viewCount: number;
};

export type PatchNotesData = {
  crawledAt: string;
  totalCount: number;
  patchNotes: PatchNote[];
};

// 최신 패치 정보 타입
export type LatestPatchInfo = {
  version: string;
  title: string;
  crawledAt: string;
  patchDate: string;
};
