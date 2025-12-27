import type { PatchEntry, Change } from '@/types/patch';
import { isNumericChange } from '@/types/patch';
import { getChangeTypeLabel, getChangeTypeColor, formatDate } from '@/lib/patch-utils';

type Props = {
  patch: PatchEntry;
};

// 순수 함수: 변경 사항 그룹핑
const groupChangesByTarget = (changes: Change[]): Map<string, Change[]> =>
  changes.reduce((acc, change) => {
    const existing = acc.get(change.target) ?? [];
    acc.set(change.target, [...existing, change]);
    return acc;
  }, new Map<string, Change[]>());

// 순수 함수: 변경 아이콘 렌더링
const getChangeIcon = (type: Change['changeType']): string => {
  const icons = {
    buff: '▲',
    nerf: '▼',
    mixed: '◆',
  };
  return icons[type];
};

// 순수 함수: 패치 타입별 테두리 색상
const getBorderColor = (type: PatchEntry['overallChange']): string => {
  const colors = {
    buff: 'border-l-emerald-500',
    nerf: 'border-l-rose-500',
    mixed: 'border-l-amber-500',
  };
  return colors[type];
};

// 순수 함수: 패치노트 원본 링크 생성
const getPatchNoteUrl = (patchId: number): string =>
  `https://playeternalreturn.com/posts/news/${patchId}`;

export default function PatchCard({ patch }: Props): React.ReactElement {
  const groupedChanges = groupChangesByTarget(patch.changes);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-[#2a2d35] border-l-4 bg-[#13151a] ${getBorderColor(patch.overallChange)}`}
    >
      {/* 패치 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a2d35] bg-[#0f1014] px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`font-mono text-xl font-black ${getChangeTypeColor(patch.overallChange)}`}
          >
            v{patch.patchVersion}
          </span>
          <span
            className={`rounded border px-2 py-0.5 text-xs font-bold ${
              patch.overallChange === 'buff'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : patch.overallChange === 'nerf'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
            }`}
          >
            {getChangeTypeLabel(patch.overallChange)}
          </span>
          {patch.streak > 1 && <span className="text-xs text-zinc-500">{patch.streak}연속</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-zinc-500">{formatDate(patch.patchDate)}</span>
          <a
            href={getPatchNoteUrl(patch.patchId)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-cyan-500 hover:text-cyan-400"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            원문
          </a>
        </div>
      </div>

      <div className="p-5">
        {/* 개발자 코멘트 */}
        {patch.devComment && (
          <div className="mb-5 rounded-lg border border-violet-500/20 bg-violet-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-violet-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              개발자 코멘트
            </div>
            <p className="text-sm leading-relaxed text-zinc-300">{patch.devComment}</p>
          </div>
        )}

        {/* 변경 사항 */}
        <div className="space-y-4">
          {Array.from(groupedChanges.entries()).map(([target, changes]) => (
            <div key={target} className="rounded-lg bg-[#0f1014] p-4">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                {target}
              </h4>
              <div className="space-y-2">
                {changes.map((change, idx) => (
                  <div
                    key={`${target}-${idx}`}
                    className="flex items-start gap-3 rounded border border-[#2a2d35] bg-[#13151a] p-3"
                  >
                    <span className={`mt-0.5 text-sm ${getChangeTypeColor(change.changeType)}`}>
                      {getChangeIcon(change.changeType)}
                    </span>
                    <div className="min-w-0 flex-1">
                      {isNumericChange(change) ? (
                        <>
                          <span className="text-sm font-medium text-zinc-300">{change.stat}</span>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-xs">
                            <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-500 line-through">
                              {change.before}
                            </span>
                            <svg
                              className="h-3 w-3 text-zinc-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 7l5 5m0 0l-5 5m5-5H6"
                              />
                            </svg>
                            <span
                              className={`rounded px-2 py-1 ${
                                change.changeType === 'buff'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : change.changeType === 'nerf'
                                    ? 'bg-rose-500/10 text-rose-400'
                                    : 'bg-amber-500/10 text-amber-400'
                              }`}
                            >
                              {change.after}
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                          {change.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
