'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Character, FilterOption, SortOption, SortDirection } from '@/types/patch';
import { filterAndSortCharacters } from '@/lib/patch-utils';
import CharacterCard from './CharacterCard';
import FilterSort from './FilterSort';

type Props = {
  characters: Character[];
};

// 순수 함수: 상태 초기값 생성
const createInitialState = () => ({
  filter: 'all' as FilterOption,
  sort: 'name' as SortOption,
  direction: 'asc' as SortDirection,
  search: '',
});

export default function CharacterList({ characters }: Props): React.ReactElement {
  const [state, setState] = useState(createInitialState);

  // 함수형 상태 업데이트
  const updateState = useCallback(
    <K extends keyof ReturnType<typeof createInitialState>>(
      key: K,
      value: ReturnType<typeof createInitialState>[K]
    ) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // 메모이제이션된 필터링/정렬 결과
  const filteredCharacters = useMemo(
    () =>
      filterAndSortCharacters(characters, {
        filter: state.filter,
        sort: state.sort,
        direction: state.direction,
        search: state.search,
      }),
    [characters, state.filter, state.sort, state.direction, state.search]
  );

  // 핸들러 함수들 (커링 패턴)
  const handleFilterChange = useCallback(
    (filter: FilterOption) => updateState('filter', filter),
    [updateState]
  );
  const handleSortChange = useCallback(
    (sort: SortOption) => updateState('sort', sort),
    [updateState]
  );
  const handleDirectionChange = useCallback(
    (direction: SortDirection) => updateState('direction', direction),
    [updateState]
  );
  const handleSearchChange = useCallback(
    (search: string) => updateState('search', search),
    [updateState]
  );

  return (
    <div>
      {/* 헤더 정보 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#2a2d35] bg-[#13151a] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
            <svg
              className="h-5 w-5 text-violet-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-zinc-200">
              총 <span className="text-violet-400">{characters.length}</span>명
              {filteredCharacters.length !== characters.length && (
                <span className="text-zinc-500"> / {filteredCharacters.length}명 표시</span>
              )}
            </p>
            <p className="text-xs text-zinc-500">실험체 데이터</p>
          </div>
        </div>
      </div>

      {/* 필터 및 정렬 */}
      <FilterSort
        filter={state.filter}
        sort={state.sort}
        direction={state.direction}
        search={state.search}
        onFilterChange={handleFilterChange}
        onSortChange={handleSortChange}
        onDirectionChange={handleDirectionChange}
        onSearchChange={handleSearchChange}
      />

      {/* 캐릭터 그리드 */}
      {filteredCharacters.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCharacters.map((character) => (
            <CharacterCard key={character.name} character={character} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a2d35] bg-[#13151a]/50 py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/10">
            <svg
              className="h-8 w-8 text-violet-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <p className="text-lg font-medium text-zinc-400">검색 결과가 없습니다</p>
          <p className="mt-1 text-sm text-zinc-600">다른 검색어를 시도해보세요</p>
        </div>
      )}
    </div>
  );
}
