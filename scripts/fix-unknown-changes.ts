/**
 * unknown 카테고리로 분류된 변경사항을 수동으로 수정하는 스크립트
 *
 * 사용법:
 *   npx tsx scripts/fix-unknown-changes.ts
 *
 * 수정 대상: fix-issues.json에 있는 11개 항목
 */

import * as fs from 'fs';
import * as path from 'path';
import { initFirebaseAdmin } from './lib/firebase-admin';

type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';
type ChangeType = 'buff' | 'nerf' | 'mixed';

type Change = {
  target: string;
  stat: string;
  before: string;
  after: string;
  changeType: ChangeType;
  changeCategory: ChangeCategory;
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

type CharacterData = {
  name: string;
  nameEn?: string;
  stats: unknown;
  patchHistory: PatchEntry[];
};

// 수동 수정 사항 정의
// 각 항목을 분석하여 적절한 changeCategory 지정
const MANUAL_FIXES: Array<{
  character: string;
  patchId: number;
  target: string;
  stat: string;
  newCategory: ChangeCategory;
  // 추가 수정이 필요한 경우
  newStat?: string;
  newBefore?: string;
  newAfter?: string;
}> = [
  // 1. 다니엘 - 영감 사용 조건 변경 → mechanic
  {
    character: '다니엘',
    patchId: 2132,
    target: '걸작(R)',
    stat: '영감',
    newCategory: 'mechanic',
  },
  // 2. 레온 - 물길 스킬 리워크 → mechanic
  {
    character: '레온',
    patchId: 2585,
    target: '물길(Q)',
    stat: '물 웅덩이',
    newCategory: 'mechanic',
  },
  // 3. 르노어 - 패시브 중첩 시스템 변경 → mechanic
  {
    character: '르노어',
    patchId: 2828,
    target: '고통의 선율(P)',
    stat: '쿨다운',
    newCategory: 'mechanic',
    newStat: '아첼레란도 치환',
    newBefore: '감소 스탯과 비명 중첩',
    newAfter: '비명 중첩만 (비명 1 당 아첼레란도 1)',
  },
  // 4. 리오 - 카에유미 공격 방식 변경 → mechanic
  {
    character: '리오',
    patchId: 2828,
    target: '카에유미(Q)',
    stat: '단궁2회',
    newCategory: 'mechanic',
  },
  // 5. 리오 - 카에유미 이동 조건 변경 → mechanic
  {
    character: '리오',
    patchId: 2828,
    target: '카에유미(Q)',
    stat: '2회',
    newCategory: 'mechanic',
    newStat: '이동 가능 시점',
    newBefore: '기본 공격 완료 후',
    newAfter: '1회 공격 완료 후',
  },
  // 6. 일레븐 - 햄버거 생성 조건 변경 → mechanic
  {
    character: '일레븐',
    patchId: 1515,
    target: '힘내자고!(P)',
    stat: '햄버거 생성 조건: 기본 공격',
    newCategory: 'mechanic',
    newStat: '햄버거 생성 조건',
    newBefore: '기본 공격 4회 적중 시',
    newAfter: '스킬 적중 시',
  },
  // 7. 에이든 - 적중 대상 범위 변경 → mechanic
  {
    character: '에이든',
    patchId: 3242,
    target: '뇌격(Q)',
    stat: '적중 대상',
    newCategory: 'mechanic',
    newBefore: '1명',
    newAfter: '범위 내 모두',
  },
  // 8. 펠릭스 - 연계 창술 발동 조건 변경 → mechanic
  {
    character: '펠릭스',
    patchId: 2828,
    target: '연계 창술(P)',
    stat: '최대',
    newCategory: 'mechanic',
    newStat: '두 번 연속 공격 조건',
    newBefore: '최대 사거리의 적 대상',
    newAfter: '스킬 사용 후 2초 동안 기본 공격',
  },
  // 9. 피오라 - 표식 피해량 공식 변경 (레벨 비례 → 고정+증폭) → numeric
  {
    character: '피오라',
    patchId: 1749,
    target: '뚜셰(P)',
    stat: '표식',
    newCategory: 'numeric',
    newStat: '표식 피해량',
    newBefore: '레벨*1/2/3',
    newAfter: '10/40/70(+스킬 증폭의 30%)',
  },
  // 10. 로지 - 초콜릿 효과 완전 변경 → mechanic
  {
    character: '로지',
    patchId: 2364,
    target: '더블 샷(P)',
    stat: '초콜릿',
    newCategory: 'mechanic',
    newStat: '초콜릿 효과',
    newBefore: '섭취 시 체력/스태미나 회복',
    newAfter: '10분 동안 공격력 1 증가',
  },
  // 11. 엠마 - 기본 공격 피해량 공식 변경 → numeric
  {
    character: '엠마',
    patchId: 2450,
    target: 'CheerUP♥(P)',
    stat: '기본',
    newCategory: 'numeric',
    newStat: '기본 공격 추가 피해량',
    newBefore: '(+스킬 증폭의 30/40/50%)(+최대 스태미나의 8%)',
    newAfter: '70/90/110(+스킬 증폭의 30/40/50%)(+최대 스태미나의 1%)',
  },
];

async function fixUnknownChanges(): Promise<void> {
  console.log('unknown 카테고리 수동 수정 시작...\n');

  const db = initFirebaseAdmin();
  let fixedCount = 0;

  for (const fix of MANUAL_FIXES) {
    console.log(`[${fix.character}] 패치 ${fix.patchId} - ${fix.target} 수정 중...`);

    // Firebase에서 캐릭터 데이터 조회
    const docRef = db.collection('characters').doc(fix.character);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log(`  ⚠️ 캐릭터 "${fix.character}" 없음`);
      continue;
    }

    const charData = doc.data() as CharacterData;

    // 해당 패치 찾기
    const patchIndex = charData.patchHistory.findIndex((p) => p.patchId === fix.patchId);
    if (patchIndex === -1) {
      console.log(`  ⚠️ 패치 ${fix.patchId} 없음`);
      continue;
    }

    const patch = charData.patchHistory[patchIndex];

    // 해당 변경사항 찾기
    const changeIndex = patch.changes.findIndex(
      (c) => c.target === fix.target && c.stat === fix.stat
    );
    if (changeIndex === -1) {
      console.log(`  ⚠️ 변경사항 없음: ${fix.target} - ${fix.stat}`);
      continue;
    }

    const change = patch.changes[changeIndex];

    // 수정 적용
    change.changeCategory = fix.newCategory;
    if (fix.newStat) change.stat = fix.newStat;
    if (fix.newBefore) change.before = fix.newBefore;
    if (fix.newAfter) change.after = fix.newAfter;

    // Firebase 업데이트
    await docRef.update({
      patchHistory: charData.patchHistory,
    });

    console.log(`  ✅ ${fix.newCategory} 로 수정 완료`);
    fixedCount++;
  }

  // 로컬 JSON 파일도 업데이트
  const dataPath = path.join(__dirname, '..', 'data', 'balance-changes.json');
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const data = JSON.parse(rawData) as {
    updatedAt: string;
    characters: Record<string, CharacterData>;
  };

  for (const fix of MANUAL_FIXES) {
    const charData = data.characters[fix.character];
    if (!charData) continue;

    const patch = charData.patchHistory.find((p) => p.patchId === fix.patchId);
    if (!patch) continue;

    const change = patch.changes.find((c) => c.target === fix.target && c.stat === fix.stat);
    if (!change) continue;

    change.changeCategory = fix.newCategory;
    if (fix.newStat) change.stat = fix.newStat;
    if (fix.newBefore) change.before = fix.newBefore;
    if (fix.newAfter) change.after = fix.newAfter;
  }

  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');

  console.log('\n' + '='.repeat(60));
  console.log('수정 완료');
  console.log('='.repeat(60));
  console.log(`총 ${fixedCount}/${MANUAL_FIXES.length}개 항목 수정됨`);
  console.log('Firebase 및 로컬 JSON 파일 업데이트 완료');
}

fixUnknownChanges().catch(console.error);
