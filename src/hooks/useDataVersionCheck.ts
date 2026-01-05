'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 빌드 ID가 변경되면 자동으로 새로고침 (404 방지)
 * - 새 빌드 배포 시에만 hard refresh
 * - 데이터 업데이트는 Next.js 캐시가 자연스럽게 처리
 */
export function useBuildVersionCheck(): void {
  const pathname = usePathname();
  const cachedBuildIdRef = useRef<string | null>(null);
  const isCheckingRef = useRef(false);

  const checkBuildId = useCallback(async (): Promise<void> => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      const response = await fetch('/api/data-version', {
        cache: 'no-store',
      });

      if (!response.ok) return;

      const { buildId } = (await response.json()) as { buildId: string };

      // 첫 체크면 빌드 ID 저장
      if (!cachedBuildIdRef.current) {
        cachedBuildIdRef.current = buildId;
        return;
      }

      // 빌드 ID가 다르면 hard refresh (새 빌드 배포됨 → 404 방지)
      if (cachedBuildIdRef.current !== buildId) {
        window.location.reload();
      }
    } catch {
      // 네트워크 오류는 무시
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  // 초기 로드 시 빌드 ID 저장
  useEffect(() => {
    checkBuildId();
  }, [checkBuildId]);

  // 페이지 이동 시 체크
  useEffect(() => {
    if (cachedBuildIdRef.current) {
      checkBuildId();
    }
  }, [pathname, checkBuildId]);
}
