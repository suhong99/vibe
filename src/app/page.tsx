import {
  loadBalanceData,
  extractCharacters,
  calculateStatsSummary,
  getLatestPatchInfo,
  getDataCoverageInfo,
} from '@/lib/patch-data';
import { formatDate } from '@/lib/patch-utils';
import CharacterList from '@/components/CharacterList';

// 순수 함수: 통계 카드 데이터 생성
const createStatCards = (
  summary: ReturnType<typeof calculateStatsSummary>
): Array<{ label: string; value: string; subtext?: string; accent: string }> => [
  {
    label: '총 실험체',
    value: `${summary.totalCharacters}`,
    accent: 'from-violet-500 to-violet-400',
  },
  {
    label: '평균 패치',
    value: `${summary.avgPatches.toFixed(1)}`,
    accent: 'from-cyan-500 to-cyan-400',
  },
  {
    label: '최다 상향',
    value: summary.mostBuffed?.name ?? '-',
    subtext: summary.mostBuffed ? `${summary.mostBuffed.stats.buffCount}회` : undefined,
    accent: 'from-emerald-500 to-emerald-400',
  },
  {
    label: '최다 하향',
    value: summary.mostNerfed?.name ?? '-',
    subtext: summary.mostNerfed ? `${summary.mostNerfed.stats.nerfCount}회` : undefined,
    accent: 'from-rose-500 to-rose-400',
  },
];

export default async function Home(): Promise<React.ReactElement> {
  const data = await loadBalanceData();
  const characters = extractCharacters(data);
  const summary = calculateStatsSummary(characters);
  const statCards = createStatCards(summary);
  const latestPatch = await getLatestPatchInfo();
  const dataCoverage = getDataCoverageInfo(characters);

  return (
    <div className="min-h-screen bg-[#0a0b0f]">
      {/* 배경 효과 */}
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.1),transparent_50%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(34,211,238,0.05),transparent_50%)]"
        aria-hidden="true"
      />

      <main className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <header className="mb-12 text-center">
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
              </span>
              실시간 패치 데이터
            </div>
            {latestPatch && (
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-sm text-cyan-300">
                <span className="font-bold">v{latestPatch.version}</span>
                <span className="text-cyan-400/60">|</span>
                <span className="text-cyan-400/80">{formatDate(latestPatch.crawledAt)} 수정</span>
              </div>
            )}
          </div>
          <h1 className="bg-linear-to-r from-white via-violet-200 to-cyan-200 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl lg:text-6xl">
            ETERNAL RETURN
          </h1>
          <p className="mt-3 text-xl text-zinc-400">실험체별 밸런스 패치 히스토리</p>
          {dataCoverage && (
            <p className="mt-2 text-xs text-zinc-600">
              v{dataCoverage.oldestVersion} ({dataCoverage.oldestDate}) 이후 데이터 수집
            </p>
          )}
        </header>

        {/* 통계 카드 */}
        <section className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="group relative overflow-hidden rounded-xl border border-[#2a2d35] bg-[#13151a] p-6"
            >
              {/* 상단 악센트 라인 */}
              <div
                className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${card.accent} opacity-50`}
              />

              <p className="text-sm font-medium text-zinc-500">{card.label}</p>
              <p
                className={`mt-2 bg-gradient-to-r ${card.accent} bg-clip-text text-3xl font-black text-transparent`}
              >
                {card.value}
              </p>
              {card.subtext && <p className="mt-1 text-sm text-zinc-500">{card.subtext}</p>}

              {/* 배경 그라데이션 */}
              <div
                className={`pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-r ${card.accent} opacity-5 blur-2xl`}
              />
            </div>
          ))}
        </section>

        {/* 캐릭터 목록 */}
        <section aria-labelledby="character-list-heading">
          <h2 id="character-list-heading" className="sr-only">
            실험체 목록
          </h2>
          <CharacterList characters={characters} />
        </section>
      </main>
    </div>
  );
}
