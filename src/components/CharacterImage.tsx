'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getCharacterImagePathByKorean } from '@/lib/character-names';

type Props = {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeMap = {
  sm: { container: 'h-12 w-12', text: 'text-lg' },
  md: { container: 'h-20 w-20', text: 'text-2xl' },
  lg: { container: 'h-28 w-28', text: 'text-4xl' },
};

export default function CharacterImage({
  name,
  size = 'md',
  className = '',
}: Props): React.ReactElement {
  const [imageError, setImageError] = useState(false);
  const imagePath = getCharacterImagePathByKorean(name);
  const initial = name.charAt(0);
  const { container, text } = sizeMap[size];

  // 서버/클라이언트 초기 렌더링 일치를 위해 항상 이미지 시도
  const showImage = imagePath && !imageError;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl border border-[#2a2d35] bg-[#1a1d24] ${container} ${className}`}
    >
      {showImage ? (
        <Image
          src={imagePath}
          alt={name}
          fill
          sizes={size === 'lg' ? '112px' : size === 'md' ? '80px' : '48px'}
          className="object-cover"
          onError={() => setImageError(true)}
          priority={size === 'lg'}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500/20 to-cyan-500/20">
          <span className={`font-bold text-zinc-400 ${text}`}>{initial}</span>
        </div>
      )}
    </div>
  );
}
