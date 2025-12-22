import * as fs from 'fs';
import * as path from 'path';

type Change = {
  target: string;
  stat: string;
  before: string;
  after: string;
  changeType: string;
};

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: string;
  streak: number;
  devComment: string | null;
  changes: Change[];
};

type CharacterStats = {
  totalPatches: number;
  buffCount: number;
  nerfCount: number;
  mixedCount: number;
  currentStreak: {
    type: string | null;
    count: number;
  };
  maxBuffStreak: number;
  maxNerfStreak: number;
};

type CharacterDataOld = {
  name: string;
  nameEn: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};

type CharacterDataNew = {
  name: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};

type BalanceDataOld = {
  updatedAt: string;
  characters: Record<string, CharacterDataOld>;
};

type BalanceDataNew = {
  updatedAt: string;
  characters: Record<string, CharacterDataNew>;
};

function cleanHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function main(): void {
  const inputPath = path.join(__dirname, '..', 'data', 'balance-changes.json');
  const backupPath = path.join(__dirname, '..', 'data', 'balance-changes.backup.json');

  console.log('balance-changes.json 정리 시작...\n');

  // 원본 로드
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const data: BalanceDataOld = JSON.parse(rawData);

  // 백업 생성
  fs.writeFileSync(backupPath, rawData, 'utf-8');
  console.log(`백업 생성: ${backupPath}\n`);

  let nbspCount = 0;
  let ampCount = 0;
  let nameEnRemoved = 0;

  // 정리된 데이터 생성
  const cleanedData: BalanceDataNew = {
    updatedAt: data.updatedAt,
    characters: {},
  };

  for (const [key, char] of Object.entries(data.characters)) {
    nameEnRemoved++;

    // nameEn 필드 제거하고 새 객체 생성
    const cleanedChar: CharacterDataNew = {
      name: cleanHtmlEntities(char.name),
      stats: char.stats,
      patchHistory: char.patchHistory.map(patch => ({
        ...patch,
        devComment: patch.devComment ? cleanHtmlEntities(patch.devComment) : null,
        changes: patch.changes.map(change => {
          const beforeCleaned = cleanHtmlEntities(change.before);
          const afterCleaned = cleanHtmlEntities(change.after);
          const targetCleaned = cleanHtmlEntities(change.target);
          const statCleaned = cleanHtmlEntities(change.stat);

          if (change.before !== beforeCleaned) nbspCount++;
          if (change.after !== afterCleaned) nbspCount++;
          if (change.target !== targetCleaned) ampCount++;

          return {
            target: targetCleaned,
            stat: statCleaned,
            before: beforeCleaned,
            after: afterCleaned,
            changeType: change.changeType,
          };
        }),
      })),
    };

    // 키도 정리
    const cleanedKey = cleanHtmlEntities(key);
    cleanedData.characters[cleanedKey] = cleanedChar;
  }

  // 저장
  fs.writeFileSync(inputPath, JSON.stringify(cleanedData, null, 2), 'utf-8');

  console.log('='.repeat(50));
  console.log('정리 완료 요약');
  console.log('='.repeat(50));
  console.log(`HTML 엔티티 정리: ~${nbspCount + ampCount}개 필드`);
  console.log(`nameEn 필드 삭제: ${nameEnRemoved}개 캐릭터`);
  console.log(`저장 완료: ${inputPath}`);
}

main();
