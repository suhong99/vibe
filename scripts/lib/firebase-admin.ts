/**
 * 스크립트용 Firebase Admin 초기화
 * - 로컬: firebase-service-account.json 파일 사용
 * - GitHub Actions: FIREBASE_SERVICE_ACCOUNT 환경변수 사용
 */

import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

let db: Firestore | null = null;

export const initFirebaseAdmin = (): Firestore => {
  // 이미 초기화된 경우 재사용
  if (db) return db;

  let serviceAccount: ServiceAccount;

  // 환경변수에서 서비스 계정 읽기 (GitHub Actions)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('Firebase: 환경변수에서 인증 정보 로드');
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
  } else {
    // 로컬 파일에서 읽기
    const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');

    if (!existsSync(serviceAccountPath)) {
      throw new Error(
        'Firebase 인증 정보를 찾을 수 없습니다.\n' +
          '- 로컬: firebase-service-account.json 파일 필요\n' +
          '- CI: FIREBASE_SERVICE_ACCOUNT 환경변수 필요'
      );
    }

    console.log('Firebase: 로컬 파일에서 인증 정보 로드');
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8')) as ServiceAccount;
  }

  // 이미 앱이 초기화되어 있는지 확인
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  db = getFirestore();
  return db;
};
