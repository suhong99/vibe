import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// 서버 전용 - Firebase Admin 초기화
const initializeFirebaseAdmin = (): void => {
  if (getApps().length === 0) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT 환경 변수가 설정되지 않았습니다.');
    }

    const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;

    initializeApp({
      credential: cert(serviceAccount),
    });
  }
};

// 초기화 실행
initializeFirebaseAdmin();

// Firestore 인스턴스 export
export const db = getFirestore();

// Auth 인스턴스 export (토큰 검증용)
export const adminAuth = getAuth();
