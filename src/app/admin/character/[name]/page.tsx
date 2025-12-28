import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  loadBalanceData,
  loadPatchNotesData,
  findCharacterByName,
  extractCharacters,
} from '@/lib/patch-data';
import { AdminPatchList } from '@/components/admin/AdminPatchList';

type PageProps = {
  params: Promise<{ name: string }>;
};

export default async function AdminCharacterPage({
  params,
}: PageProps): Promise<React.JSX.Element> {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  const [balanceData, patchNotesData] = await Promise.all([
    loadBalanceData(),
    loadPatchNotesData(),
  ]);
  const characters = extractCharacters(balanceData);
  const character = findCharacterByName(characters, decodedName);

  if (!character) {
    notFound();
  }

  // patchId → 원문 링크 맵 생성
  const patchLinks: Record<number, string> = {};
  for (const note of patchNotesData.patchNotes) {
    patchLinks[note.id] = note.link;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← 캐릭터 목록으로
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">{character.name}</h1>
        <p className="text-gray-400">
          총 {character.stats.totalPatches}개 패치 |{' '}
          <span className="text-emerald-400">상향 {character.stats.buffCount}</span> |{' '}
          <span className="text-rose-400">하향 {character.stats.nerfCount}</span> |{' '}
          <span className="text-amber-400">조정 {character.stats.mixedCount}</span>
        </p>
      </div>

      <AdminPatchList
        characterName={character.name}
        patches={character.patchHistory}
        patchLinks={patchLinks}
      />
    </div>
  );
}
