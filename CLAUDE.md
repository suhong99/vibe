# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 기술 스택 (버전 명시)

- **Next.js**: 16.1.0 (App Router)
- **React**: 19.2.3
- **TypeScript**: 5.x (strict mode)
- **Tailwind CSS**: 4.x
- **Node.js**: 18+ 권장

## Build & Development Commands

- `npm run dev` - Start development server at http://localhost:3000
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Architecture

Next.js 16 프로젝트 (App Router + TypeScript + Tailwind CSS 4)

**프로젝트 구조:**
```
src/app/          # App Router 페이지 및 레이아웃
  layout.tsx      # 루트 레이아웃 (Geist 폰트 설정)
  page.tsx        # 홈페이지
  globals.css     # 글로벌 스타일 및 Tailwind 설정
public/           # 정적 에셋 (SVG 아이콘 등)
```

**스타일링:**
- Tailwind CSS 4 사용 (`@import "tailwindcss"` 방식)
- `@theme inline` 디렉티브로 커스텀 색상/폰트 정의
- CSS 변수 기반 테마: `--background`, `--foreground`
- 다크모드: `prefers-color-scheme` 미디어 쿼리 자동 적용

**경로 별칭:**
- `@/*` → `./src/*`

## 개발 규칙

**TypeScript:**
- `any` 타입 사용 금지 → `unknown` 또는 구체적 타입 사용
- 모든 함수에 명시적 반환 타입 선언
- interface보다 type 선호 (일관성 유지)

**명명 규칙:**
- 컴포넌트: PascalCase (`UserProfile.tsx`)
- 함수/변수: camelCase (`getUserData`)
- 상수: UPPER_SNAKE_CASE (`API_BASE_URL`)
- 파일명: kebab-case (컴포넌트 제외)

**컴포넌트 작성:**
- Server Component 기본, 필요시에만 `'use client'` 사용
- Props는 별도 type으로 정의 (`type Props = { ... }`)
- 한 파일에 하나의 컴포넌트만 export

**스타일링:**
- 인라인 스타일 금지, Tailwind 클래스 사용
- 반복되는 스타일은 `@apply`로 추출하지 말고 컴포넌트화

**Git 커밋:**
- 한글 커밋 메시지 사용
- 형식: `[타입] 설명` (예: `[기능] 로그인 페이지 추가`)
