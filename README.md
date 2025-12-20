# 이터널리턴 패치노트 트래커

이터널리턴 게임의 실험체 패치 내역을 수집하고 정리하는 프로젝트

## 실행 방법

로컬 실행

```bash
npm i
npm run dev
```

패치노트 크롤링

```bash
npm run crawl
```

## 주요 기능

- 🔍 이터널리턴 공식 사이트에서 패치노트 목록 크롤링
- 📅 정확한 날짜 정보 추출 (ISO 8601 형식)
- 💾 JSON 형식으로 데이터 저장

## 폴더 구조

```
📦src
┣ 📂app              # Next.js App Router 페이지
┃ ┣ 📜layout.tsx     # 루트 레이아웃
┃ ┣ 📜page.tsx       # 홈페이지
┃ ┗ 📜globals.css    # 글로벌 스타일
📦scripts
┗ 📜crawl-patch-notes.ts  # 패치노트 크롤링 스크립트
📦data
┗ 📜patch-notes.json      # 크롤링된 패치노트 데이터
```

## 컨벤션

- **네이밍 컨벤션**

| 대상           | 명명법                   | 예시                 |
| -------------- | ------------------------ | -------------------- |
| 컴포넌트       | 파스칼 케이스            | UserProfile.tsx      |
| 함수/변수      | 카멜 케이스              | getUserData          |
| 상수           | 스크리밍 스네이크 케이스 | API_BASE_URL         |
| 파일명         | 케밥 케이스 (컴포넌트 제외) | patch-notes.json  |
| 타입           | 파스칼 케이스            | PatchNote            |

## 기술 스택

<div>
  <img src="https://img.shields.io/badge/typescript-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
  <img src="https://img.shields.io/badge/next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/react_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/tailwindcss_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/puppeteer-40B5A4?style=for-the-badge&logo=puppeteer&logoColor=white" />
</div>

## 커밋 컨벤션

| prefix   | 설명                     |
| -------- | ------------------------ |
| feat     | 기능 추가                |
| fix      | 버그 수정                |
| refactor | 리팩토링                 |
| docs     | 문서 추가/수정           |
| chore    | 설정, 빌드 관련 작업     |
| test     | 테스트 코드 추가         |

## 수집된 데이터

- 총 **270개** 패치노트 (2023-05-16 ~ 2025-12-16)
- 포함 정보: 제목, 링크, 작성일, 수정일, 썸네일, 조회수
