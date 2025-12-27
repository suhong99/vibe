'use client';

import { useState } from 'react';
import type { PatchEntry } from '@/types/patch';
import { isNumericChange } from '@/types/patch';
import { PatchEditForm } from './PatchEditForm';
import { getChangeTypeLabel, getChangeTypeBgColor, formatDate } from '@/lib/patch-utils';

type ExtendedPatchEntry = PatchEntry;

type AdminPatchListProps = {
  characterName: string;
  patches: ExtendedPatchEntry[];
  patchLinks: Record<number, string>;
};

export function AdminPatchList({
  characterName,
  patches,
  patchLinks,
}: AdminPatchListProps): React.JSX.Element {
  const [patchList, setPatchList] = useState<ExtendedPatchEntry[]>(patches);
  const [editingPatch, setEditingPatch] = useState<ExtendedPatchEntry | null>(null);

  const handleSave = (updatedPatch: ExtendedPatchEntry): void => {
    setPatchList((prev) =>
      prev.map((p) => (p.patchId === updatedPatch.patchId ? updatedPatch : p))
    );
    setEditingPatch(null);
  };

  return (
    <div className="space-y-4">
      {patchList.map((patch) => (
        <div
          key={patch.patchId}
          className="p-4 bg-[var(--er-surface)] border border-[var(--er-border)] rounded-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${getChangeTypeBgColor(patch.overallChange)}`}
              >
                {getChangeTypeLabel(patch.overallChange)}
              </span>
              <span className="text-white font-medium">{patch.patchVersion}</span>
              <span className="text-gray-400 text-sm">{formatDate(patch.patchDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              {patchLinks[patch.patchId] && (
                <a
                  href={patchLinks[patch.patchId]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-gray-600/20 border border-gray-500/30 rounded text-sm text-gray-400 hover:bg-gray-600/30 transition-colors"
                >
                  원문
                </a>
              )}
              <button
                onClick={() => setEditingPatch(patch)}
                className="px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 rounded text-sm text-violet-400 hover:bg-violet-600/30 transition-colors"
              >
                수정
              </button>
            </div>
          </div>

          {patch.devComment && (
            <p className="text-sm text-gray-400 mb-3 italic">&quot;{patch.devComment}&quot;</p>
          )}

          <div className="space-y-2">
            {patch.changes.map((change, index) => (
              <div key={index} className="text-sm p-2 bg-[#1a1c23] rounded flex items-start gap-2">
                <span className="text-gray-500 shrink-0">{change.target}</span>
                {isNumericChange(change) ? (
                  <>
                    <span className="text-gray-400">{change.stat}:</span>
                    <span className="text-rose-400 line-through">{change.before}</span>
                    <span className="text-gray-500">→</span>
                    <span className="text-emerald-400">{change.after}</span>
                  </>
                ) : (
                  <span className="text-gray-300 whitespace-pre-line">{change.description}</span>
                )}
                {change.changeCategory && (
                  <span className="ml-auto text-xs text-gray-500">[{change.changeCategory}]</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {editingPatch && (
        <PatchEditForm
          characterName={characterName}
          patch={editingPatch}
          onSave={handleSave}
          onCancel={() => setEditingPatch(null)}
        />
      )}
    </div>
  );
}
