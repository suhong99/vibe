'use client';

import type { FilterOption, SortOption, SortDirection } from '@/types/patch';

type Props = {
  filter: FilterOption;
  sort: SortOption;
  direction: SortDirection;
  search: string;
  onFilterChange: (filter: FilterOption) => void;
  onSortChange: (sort: SortOption) => void;
  onDirectionChange: (direction: SortDirection) => void;
  onSearchChange: (search: string) => void;
};

// 순수 함수: 필터 옵션 정의
const filterOptions: { value: FilterOption; label: string; color: string }[] = [
  { value: 'all', label: '전체', color: 'violet' },
  { value: 'buffStreak', label: '연속 상향 중', color: 'emerald' },
  { value: 'nerfStreak', label: '연속 하향 중', color: 'rose' },
  { value: 'recent', label: '최근 패치', color: 'cyan' },
];

// 순수 함수: 정렬 옵션 정의
const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'name', label: '이름순' },
  { value: 'totalPatches', label: '패치 횟수' },
  { value: 'buffCount', label: '상향 횟수' },
  { value: 'nerfCount', label: '하향 횟수' },
  { value: 'recentPatch', label: '최근 패치' },
];

export default function FilterSort({
  filter,
  sort,
  direction,
  search,
  onFilterChange,
  onSortChange,
  onDirectionChange,
  onSearchChange,
}: Props): React.ReactElement {
  const handleFilterClick = (value: FilterOption) => () => onFilterChange(value);
  const toggleDirection = (): void => onDirectionChange(direction === 'asc' ? 'desc' : 'asc');

  return (
    <div className="mb-8 space-y-4">
      {/* 검색 */}
      <div className="relative">
        <input
          type="text"
          placeholder="실험체 검색..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-lg border border-[#2a2d35] bg-[#13151a] px-4 py-3 pl-11 text-sm text-zinc-100 placeholder-zinc-600 transition-all focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
        />
        <svg
          className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {/* 필터 버튼 */}
        <div className="flex flex-wrap gap-2">
          {filterOptions.map(({ value, label, color }) => {
            const isActive = filter === value;
            const colorClasses = {
              violet: isActive
                ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                : 'border-[#2a2d35] text-zinc-500 hover:border-violet-500/50 hover:text-violet-400',
              emerald: isActive
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                : 'border-[#2a2d35] text-zinc-500 hover:border-emerald-500/50 hover:text-emerald-400',
              rose: isActive
                ? 'border-rose-500 bg-rose-500/20 text-rose-300'
                : 'border-[#2a2d35] text-zinc-500 hover:border-rose-500/50 hover:text-rose-400',
              cyan: isActive
                ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                : 'border-[#2a2d35] text-zinc-500 hover:border-cyan-500/50 hover:text-cyan-400',
            }[color];

            return (
              <button
                key={value}
                onClick={handleFilterClick(value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${colorClasses}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="h-8 w-px bg-[#2a2d35]" />

        {/* 정렬 드롭다운 */}
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="rounded-lg border border-[#2a2d35] bg-[#13151a] px-4 py-2 text-sm text-zinc-300 focus:border-violet-500/50 focus:outline-none"
          >
            {sortOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {/* 정렬 방향 토글 */}
          <button
            onClick={toggleDirection}
            className="rounded-lg border border-[#2a2d35] bg-[#13151a] p-2 text-zinc-500 transition-colors hover:border-violet-500/50 hover:text-violet-400"
            title={direction === 'asc' ? '오름차순' : '내림차순'}
          >
            <svg
              className={`h-5 w-5 transition-transform duration-200 ${direction === 'desc' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
