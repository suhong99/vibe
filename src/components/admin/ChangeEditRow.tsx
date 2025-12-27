'use client';

import type {
  Change,
  ChangeType,
  ChangeCategory,
  NumericChange,
  DescriptionChange,
} from '@/types/patch';
import { isNumericChange } from '@/types/patch';

type ChangeEditRowProps = {
  change: Change;
  index: number;
  onChange: (index: number, updated: Change) => void;
  onDelete: (index: number) => void;
};

const CHANGE_TYPES: { value: ChangeType; label: string; color: string }[] = [
  { value: 'buff', label: '상향', color: 'text-emerald-400' },
  { value: 'nerf', label: '하향', color: 'text-rose-400' },
  { value: 'mixed', label: '조정', color: 'text-amber-400' },
];

const CHANGE_CATEGORIES: { value: ChangeCategory; label: string }[] = [
  { value: 'numeric', label: '수치 변경' },
  { value: 'mechanic', label: '메커니즘' },
  { value: 'added', label: '효과 추가' },
  { value: 'removed', label: '효과 제거' },
  { value: 'unknown', label: '미분류' },
];

export function ChangeEditRow({
  change,
  index,
  onChange,
  onDelete,
}: ChangeEditRowProps): React.JSX.Element {
  const handleCategoryChange = (newCategory: ChangeCategory): void => {
    if (newCategory === 'numeric') {
      // 설명형 → 수치형으로 변환
      const numericChange: NumericChange = {
        target: change.target,
        stat: '',
        before: '',
        after: '',
        changeType: change.changeType,
        changeCategory: 'numeric',
      };
      onChange(index, numericChange);
    } else {
      // 수치형 → 설명형으로 변환
      const descChange: DescriptionChange = {
        target: change.target,
        description: isNumericChange(change)
          ? `${change.stat}: ${change.before} → ${change.after}`
          : (change as DescriptionChange).description || '',
        changeType: change.changeType,
        changeCategory: newCategory,
      };
      onChange(index, descChange);
    }
  };

  const handleNumericFieldChange = (field: keyof NumericChange, value: string): void => {
    if (isNumericChange(change)) {
      onChange(index, { ...change, [field]: value });
    }
  };

  const handleDescriptionFieldChange = (field: keyof DescriptionChange, value: string): void => {
    if (!isNumericChange(change)) {
      onChange(index, { ...change, [field]: value });
    }
  };

  const handleTargetChange = (value: string): void => {
    onChange(index, { ...change, target: value });
  };

  const handleChangeTypeChange = (value: ChangeType): void => {
    onChange(index, { ...change, changeType: value });
  };

  return (
    <div className="p-4 bg-[#1a1c23] border border-[var(--er-border)] rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">#{index + 1}</span>
        <button
          type="button"
          onClick={() => onDelete(index)}
          className="text-xs text-rose-400 hover:text-rose-300"
        >
          삭제
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">스킬/대상</label>
          <input
            type="text"
            value={change.target}
            onChange={(e) => handleTargetChange(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">카테고리</label>
          <select
            value={change.changeCategory}
            onChange={(e) => handleCategoryChange(e.target.value as ChangeCategory)}
            className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
          >
            {CHANGE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isNumericChange(change) ? (
        <>
          <div>
            <label className="block text-xs text-gray-400 mb-1">스탯</label>
            <input
              type="text"
              value={change.stat}
              onChange={(e) => handleNumericFieldChange('stat', e.target.value)}
              className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">변경 전</label>
              <input
                type="text"
                value={change.before}
                onChange={(e) => handleNumericFieldChange('before', e.target.value)}
                className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">변경 후</label>
              <input
                type="text"
                value={change.after}
                onChange={(e) => handleNumericFieldChange('after', e.target.value)}
                className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
              />
            </div>
          </div>
        </>
      ) : (
        <div>
          <label className="block text-xs text-gray-400 mb-1">설명</label>
          <textarea
            value={change.description}
            onChange={(e) => handleDescriptionFieldChange('description', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white resize-none"
            placeholder="변경 내용을 설명해주세요..."
          />
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-400 mb-1">변경 타입</label>
        <select
          value={change.changeType}
          onChange={(e) => handleChangeTypeChange(e.target.value as ChangeType)}
          className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
        >
          {CHANGE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
