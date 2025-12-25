# src 디렉토리 구조

## 폴더 구조

```
app/
├── layout.tsx              # 루트 레이아웃 (Providers 포함)
├── page.tsx                # 홈 (캐릭터 목록 + 통계)
├── character/[name]/       # 캐릭터 상세 (SSG)
├── admin/                  # 관리자 페이지
│   ├── layout.tsx          # 인증 가드
│   ├── page.tsx            # 대시보드
│   ├── login/              # 로그인
│   └── character/[name]/   # 패치 수정
└── api/
    ├── auth/verify/        # 토큰 검증
    └── admin/characters/   # 패치 수정 API

components/
├── CharacterList.tsx       # 캐릭터 목록 (필터/정렬)
├── CharacterCard.tsx       # 캐릭터 카드
├── PatchCard.tsx           # 패치 상세
├── FilterSort.tsx          # 필터/정렬 UI
├── Providers.tsx           # AuthProvider 래퍼
└── admin/                  # 관리자 컴포넌트
    ├── PatchEditForm.tsx   # 패치 수정 모달
    └── ChangeEditRow.tsx   # 변경사항 행

lib/
├── firebase-admin.ts       # Admin SDK (서버)
├── firebase-client.ts      # Client SDK
├── patch-data.ts           # Firestore 데이터 로드
└── patch-utils.ts          # 필터/정렬/포맷 유틸

contexts/
└── AuthContext.tsx         # 인증 상태 관리
```

## 주요 타입 (types/patch.ts)

```typescript
type ChangeType = 'buff' | 'nerf' | 'mixed';
type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

type Change = {
  target: string;      // 스킬명
  stat: string;        // 변경 스탯
  before: string;
  after: string;
  changeType: ChangeType;
  changeCategory?: ChangeCategory;
};

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: ChangeType;
  streak: number;
  devComment: string | null;
  changes: Change[];
};

type Character = {
  name: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};
```

## Firebase 구조

```
Firestore:
├── characters/{name}       # 캐릭터 데이터 + patchHistory
├── patchNotes/{id}         # 크롤링된 패치노트
└── metadata/admins         # 관리자 이메일 목록
```

## 주요 함수

| 함수 | 파일 | 역할 |
|------|------|------|
| `loadBalanceData()` | patch-data.ts | Firestore에서 전체 데이터 로드 |
| `extractCharacters()` | patch-data.ts | 데이터를 Character[] 배열로 변환 |
| `findCharacterByName()` | patch-data.ts | 이름으로 캐릭터 찾기 |
| `filterAndSortCharacters()` | patch-utils.ts | 필터링 + 정렬 |

## 인증 흐름

```
로그인 → Firebase Auth → ID Token
→ API 요청 시 Authorization: Bearer {token}
→ 서버에서 adminAuth.verifyIdToken() + metadata/admins 확인
```
