'use client';

import { useState } from 'react';
import type { PatchEntry, Change, ChangeType } from '@/types/patch';
import { ChangeEditRow } from './ChangeEditRow';
import { useAuth } from '@/contexts/AuthContext';

type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

type ExtendedChange = Change & {
  changeCategory?: ChangeCategory;
};

type ExtendedPatchEntry = Omit<PatchEntry, 'changes'> & {
  changes: ExtendedChange[];
};

type PatchEditFormProps = {
  characterName: string;
  patch: ExtendedPatchEntry;
  onSave: (updatedPatch: ExtendedPatchEntry) => void;
  onCancel: () => void;
};

const CHANGE_TYPES: { value: ChangeType; label: string }[] = [
  { value: 'buff', label: '상향' },
  { value: 'nerf', label: '하향' },
  { value: 'mixed', label: '조정' },
];

export function PatchEditForm({
  characterName,
  patch,
  onSave,
  onCancel,
}: PatchEditFormProps): React.JSX.Element {
  const [editedPatch, setEditedPatch] = useState<ExtendedPatchEntry>(patch);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { getIdToken } = useAuth();

  const handleChangeUpdate = (index: number, updated: ExtendedChange): void => {
    const newChanges = [...editedPatch.changes];
    newChanges[index] = updated;
    setEditedPatch({ ...editedPatch, changes: newChanges });
  };

  const handleChangeDelete = (index: number): void => {
    const newChanges = editedPatch.changes.filter((_, i) => i !== index);
    setEditedPatch({ ...editedPatch, changes: newChanges });
  };

  const handleAddChange = (): void => {
    const newChange: ExtendedChange = {
      target: '기본 스탯',
      stat: '',
      before: '',
      after: '',
      changeType: 'mixed',
      changeCategory: 'unknown',
    };
    setEditedPatch({ ...editedPatch, changes: [...editedPatch.changes, newChange] });
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const idToken = await getIdToken();
      if (!idToken) {
        throw new Error('인증 토큰을 가져올 수 없습니다.');
      }

      const response = await fetch(
        `/api/admin/characters/${encodeURIComponent(characterName)}/patches/${patch.patchId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(editedPatch),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '저장에 실패했습니다.');
      }

      onSave(editedPatch);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--er-surface)] border border-[var(--er-border)] rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[var(--er-border)]">
          <h2 className="text-lg font-bold text-white">
            패치 수정 - {patch.patchVersion} ({patch.patchDate})
          </h2>
          <p className="text-sm text-gray-400">{characterName}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">전체 변경 타입</label>
            <select
              value={editedPatch.overallChange}
              onChange={(e) =>
                setEditedPatch({ ...editedPatch, overallChange: e.target.value as ChangeType })
              }
              className="w-full px-3 py-2 bg-[#1a1c23] border border-[var(--er-border)] rounded text-white"
            >
              {CHANGE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">개발자 코멘트</label>
            <textarea
              value={editedPatch.devComment || ''}
              onChange={(e) =>
                setEditedPatch({ ...editedPatch, devComment: e.target.value || null })
              }
              rows={3}
              className="w-full px-3 py-2 bg-[#1a1c23] border border-[var(--er-border)] rounded text-white resize-none"
              placeholder="코멘트 없음"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-gray-400">
                변경 사항 ({editedPatch.changes.length}개)
              </label>
              <button
                type="button"
                onClick={handleAddChange}
                className="text-xs text-violet-400 hover:text-violet-300"
              >
                + 추가
              </button>
            </div>
            <div className="space-y-3">
              {editedPatch.changes.map((change, index) => (
                <ChangeEditRow
                  key={index}
                  change={change}
                  index={index}
                  onChange={handleChangeUpdate}
                  onDelete={handleChangeDelete}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 text-sm">
              {error}
            </div>
          )}
        </form>

        <div className="p-4 border-t border-[var(--er-border)] flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-800 text-white rounded-lg transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
