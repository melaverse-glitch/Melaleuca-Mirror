import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as path from 'path';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const serviceAccountPath = path.join(
      process.cwd(),
      'from_richard',
      'melaleuca-mirror-firebase-adminsdk-fbsvc-530d25589e.json'
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
      projectId: 'melaleuca-mirror',
      storageBucket: 'melaleuca-mirror.firebasestorage.app',
    });

    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
  }
}

export const db = getFirestore();
export const storage = getStorage();
export { admin };
