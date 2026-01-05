import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

type DataVersionResponse = {
  buildId: string;
  balanceUpdatedAt: string;
  patchNotesUpdatedAt: string;
};

// Vercel 배포 시 VERCEL_GIT_COMMIT_SHA, 로컬에서는 타임스탬프
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.BUILD_ID ?? 'dev';

export async function GET(): Promise<NextResponse<DataVersionResponse>> {
  const [balanceMetadata, patchNotesMetadata] = await Promise.all([
    db.collection('metadata').doc('balanceChanges').get(),
    db.collection('metadata').doc('patchNotes').get(),
  ]);

  return NextResponse.json({
    buildId: BUILD_ID,
    balanceUpdatedAt: balanceMetadata.data()?.updatedAt ?? '',
    patchNotesUpdatedAt: patchNotesMetadata.data()?.crawledAt ?? '',
  });
}
