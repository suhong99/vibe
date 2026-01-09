# scripts 디렉토리

데이터 크롤링 및 관리용 스크립트. GitHub Actions에서 매일 실행됨.

## 크롤링 파이프라인

```bash
# 1. 패치노트 크롤링 → patchNotes 컬렉션
npx tsx scripts/crawl-patch-notes.ts

# 2. 링크 검증 → hasCharacterData 표시
npx tsx scripts/validate-links.ts

# 3. 밸런스 파싱 → characters 컬렉션
npx tsx scripts/parse-balance-changes.ts
```

## 스크립트 목록

### 크롤링/파싱

| 스크립트                   | 역할                                        |
| -------------------------- | ------------------------------------------- |
| `crawl-patch-notes.ts`     | 공식 사이트에서 패치노트 크롤링             |
| `validate-links.ts`        | 패치노트 링크 검증, 캐릭터 데이터 유무 확인 |
| `parse-balance-changes.ts` | 패치노트 HTML 파싱, 변경사항 추출           |

### 데이터 수정

| 스크립트                    | 역할                                             |
| --------------------------- | ------------------------------------------------ |
| `fix-change-data.ts`        | stat/before/after 구조 정리, changeCategory 추가 |
| `fix-unknown-changes.ts`    | unknown 카테고리 수동 수정                       |
| `find-duplicate-patches.ts` | 중복된 patchId 검색 (검사용)                     |
| `fix-duplicate-patches.ts`  | 중복된 patchId 제거                              |
| `upload-fixed-data.ts`      | 로컬 JSON → Firestore 업로드                     |

### 관리

| 스크립트       | 역할               |
| -------------- | ------------------ |
| `add-admin.ts` | 관리자 이메일 등록 |

## 환경 설정

```bash
# 로컬 실행 시
firebase-service-account.json  # 프로젝트 루트에 필요

# GitHub Actions
FIREBASE_SERVICE_ACCOUNT  # Secret에 JSON 문자열로 저장
```

## 주요 로직 (parse-balance-changes.ts)

```typescript
// changeCategory 분류
'numeric'  → before/after 모두 숫자로 시작
'mechanic' → 둘 다 텍스트로 시작
'added'    → before가 없음/X
'removed'  → after가 삭제/없음
'unknown'  → 위 조건에 안 맞음 (수동 검토 필요)

// 괄호 내 숫자 무시 (E2, Q 등)
findFirstNumberIndexOutsideParens()
```

## 중복 패치 검사/수정

크롤링 오류로 인해 동일한 patchId가 중복 저장될 수 있음.

```bash
# 1. 중복 검사 (읽기 전용)
npx tsx scripts/find-duplicate-patches.ts

# 출력 예시:
# [니키] 중복 발견:
#   - patchId 1654: 2번 중복
# 총 41개의 중복 엔트리 발견

# 2. 중복 제거 (Firestore 직접 수정)
npx tsx scripts/fix-duplicate-patches.ts

# 출력 예시:
# [니키] 1개 중복 제거
# 총 41개의 중복 엔트리 제거 완료
```

## 데이터 파일 (data/)

| 파일                   | 용도                          |
| ---------------------- | ----------------------------- |
| `balance-changes.json` | 파싱된 캐릭터 데이터 (백업용) |
| `fix-issues.json`      | unknown 카테고리 항목 목록    |
| `patch-notes.json`     | 크롤링된 패치노트 (레거시)    |
