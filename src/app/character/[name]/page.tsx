import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadBalanceData, extractCharacters, findCharacterByName } from '@/lib/patch-data';
import { getChangeTypeLabel } from '@/lib/patch-utils';
import {
  groupPatchesBySeason,
  getSeasonsFromPatches,
  formatSeasonLabel,
  getSeasonEndDate,
} from '@/lib/seasons';
import PatchCard from '@/components/PatchCard';
import CharacterImage from '@/components/CharacterImage';
import SeasonNav from '@/components/SeasonNav';

type Props = {
  params: Promise<{ name: string }>;
};

// 순수 함수: 통계 항목 생성
const createStatsItems = (stats: {
  totalPatches: number;
  buffCount: number;
  nerfCount: number;
  mixedCount: number;
  maxBuffStreak: number;
  maxNerfStreak: number;
}): Array<{ label: string; value: number; color: string; bgColor: string }> => [
  {
    label: '총 패치',
    value: stats.totalPatches,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
  },
  {
    label: '상향',
    value: stats.buffCount,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  { label: '하향', value: stats.nerfCount, color: 'text-rose-400', bgColor: 'bg-rose-500/10' },
  { label: '조정', value: stats.mixedCount, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  {
    label: '최대 상향 연속',
    value: stats.maxBuffStreak,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  {
    label: '최대 하향 연속',
    value: stats.maxNerfStreak,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
  },
];

export async function generateStaticParams(): Promise<Array<{ name: string }>> {
  const data = await loadBalanceData();
  const characters = extractCharacters(data);
  return characters.map((char) => ({
    name: encodeURIComponent(char.name),
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const data = await loadBalanceData();
  const characters = extractCharacters(data);
  const character = findCharacterByName(characters, name);

  const title = `${decodedName} 패치 히스토리`;
  const description = character
    ? `이터널 리턴 ${decodedName} 실험체의 밸런스 패치 기록입니다. 총 ${character.stats.totalPatches}회 패치, 상향 ${character.stats.buffCount}회, 하향 ${character.stats.nerfCount}회.`
    : `이터널 리턴 ${decodedName} 실험체의 밸런스 패치 히스토리`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | 이터널 리턴 패치 트래커`,
      description,
      type: 'article',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function CharacterPage({ params }: Props): Promise<React.ReactElement> {
  const { name } = await params;
  const data = await loadBalanceData();
  const characters = extractCharacters(data);
  const character = findCharacterByName(characters, name);

  if (!character) {
    notFound();
  }

  const statsItems = createStatsItems(character.stats);
  const { currentStreak } = character.stats;

  return (
    <div className="min-h-screen bg-[#0a0b0f]">
      {/* 배경 효과 */}
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.1),transparent_50%)]"
        aria-hidden="true"
      />

      <main className="relative mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* 네비게이션 */}
        <nav aria-label="뒤로가기" className="mb-8">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-violet-400"
          >
            <svg
              className="h-4 w-4 transition-transform group-hover:-translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            목록으로 돌아가기
          </Link>
        </nav>

        {/* 헤더 */}
        <header className="mb-10">
          <div className="flex items-center gap-5">
            <CharacterImage name={character.name} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
                  {character.name}
                </h1>
                {currentStreak.type && currentStreak.count > 0 && (
                  <span
                    className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${
                      currentStreak.type === 'buff'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                        : currentStreak.type === 'nerf'
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {currentStreak.count}연속 {getChangeTypeLabel(currentStreak.type)}
                  </span>
                )}
              </div>
              <p className="mt-2 text-zinc-500">밸런스 패치 히스토리 및 통계</p>
            </div>
          </div>
        </header>

        {/* 통계 그리드 */}
        <section className="mb-10 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {statsItems.map((item) => (
            <div
              key={item.label}
              className={`rounded-xl border border-[#2a2d35] bg-[#13151a] p-4 text-center`}
            >
              <p className={`font-mono text-2xl font-black ${item.color}`}>{item.value}</p>
              <p className="mt-1 text-xs text-zinc-500">{item.label}</p>
            </div>
          ))}
        </section>

        {/* 타임라인 */}
        <section aria-labelledby="patch-history-heading">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
              <svg
                className="h-5 w-5 text-violet-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h2 id="patch-history-heading" className="text-xl font-bold text-zinc-100">
                패치 히스토리
              </h2>
              <p className="text-sm text-zinc-500">{character.patchHistory.length}개의 패치 기록</p>
            </div>
          </div>

          {/* 시즌별 그룹핑 */}
          <div className="space-y-8">
            {Array.from(groupPatchesBySeason(character.patchHistory).entries()).map(
              ([season, patches]) => (
                <div key={season.number} id={`season-${season.number}`} className="scroll-mt-6">
                  {/* 시즌 헤더 */}
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20">
                      <span className="text-sm font-bold text-violet-400">S{season.number}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-zinc-200">
                        {formatSeasonLabel(season)}
                      </h3>
                      <p className="text-xs text-zinc-500">
                        {patches.length}개 패치
                        {season.number !== 0 &&
                          ` · ${season.startDate} ~ ${getSeasonEndDate(season) ?? '현재'}`}
                      </p>
                    </div>
                  </div>

                  {/* 패치 목록 */}
                  <div className="relative space-y-4">
                    {/* 타임라인 라인 */}
                    <div
                      className="absolute bottom-0 left-6 top-0 w-px bg-gradient-to-b from-violet-500/50 via-[#2a2d35] to-transparent"
                      aria-hidden="true"
                    />

                    {patches.map((patch, index) => (
                      <article key={patch.patchId} className="relative pl-16">
                        {/* 타임라인 도트 */}
                        <div
                          className={`absolute left-4 top-6 h-4 w-4 rounded-full border-2 ${
                            index === 0
                              ? 'border-violet-500 bg-violet-500'
                              : 'border-[#2a2d35] bg-[#13151a]'
                          }`}
                          aria-hidden="true"
                        />
                        <PatchCard patch={patch} />
                      </article>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        {/* 시즌 네비게이션 */}
        <SeasonNav seasons={getSeasonsFromPatches(character.patchHistory)} />
      </main>
    </div>
  );
}
