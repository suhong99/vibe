# CLAUDE.md

이터널 리턴 패치 트래커 - 캐릭터별 밸런스 패치 히스토리 추적 웹앱

## 기술 스택

- Next.js 16.1.0 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 + Firebase (Firestore, Auth)

## 명령어

```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
```

## 개발 규칙

- `any` 금지, 명시적 반환 타입 선언
- Server Component 기본, 필요시만 `'use client'`
- 컴포넌트: PascalCase, 함수/변수: camelCase
- Tailwind 클래스 사용 (인라인 스타일 금지)

## Git 워크플로우

- `main` → `feature/<이슈번호>` → PR 머지
- 한글 커밋: `[타입] 설명`

## 상세 문서

- `src/CLAUDE.md` - 소스 코드 구조, 타입, 컴포넌트
- `scripts/CLAUDE.md` - 크롤링/관리 스크립트
