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

## 작업 로그

작업 시작 전 반드시 `docs/work-logs/`에 로그 파일 생성 후 진행.

| 작업 로그                             | 설명                          |
| ------------------------------------- | ----------------------------- |
| `docs/work-logs/README.md`            | 작업 로그 템플릿 및 작성 규칙 |
| `docs/work-logs/YYYY-MM-DD-작업명.md` | 개별 작업 로그                |

**현재/최근 작업:**

- `docs/work-logs/2026-01-07-온디맨드캐시무효화.md` - On-demand 캐시 무효화 (feature/25)
- `docs/work-logs/2026-01-02-시즌별패치구분.md` - 시즌별 패치 구분 기능 (feature/17)

## Claude 작업 규칙

### 작업 시작 전

1. `docs/work-logs/YYYY-MM-DD-작업명.md` 파일 생성
2. 목표, 실행 스크립트, 예상 단계 작성
3. 진행하면서 상태 업데이트

### 작업 로그 생성 시점

**명확한 작업 요청:**

> "OOO 기능 추가해줘" → 즉시 작업 로그 생성

**질문/디버깅으로 시작하는 경우:**

> "왜 안 돼?", "이거 뭐가 문제야?" → 원인 분석 → 해결책 제안

이 경우 다음 시점에서 작업 로그 생성:

- 사용자가 해결책을 선택/확정할 때 (예: "3번 방식으로 해줘")
- 코드 수정을 시작하기 직전

### 작업 중단 시

- "중단 시 이어서 할 작업" 섹션에 다음 단계 기록
- 상태를 "중단"으로 변경

### 작업 재개 시

- 작업 로그 파일 읽고 이어서 진행
- 새 날짜 섹션 추가하여 진행 상황 기록
