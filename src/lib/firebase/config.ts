import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// 強制使用 Long Polling 避免 WebChannel 在某些網路環境/瀏覽器被阻擋 (ERR_ABORTED 400)
// 並使用最新 API 啟用 Firestore 離線緩存 (IndexedDB) 支援多分頁，避免 deprecation warning
let db: Firestore;
try {
  db = initializeFirestore(app, { 
    localCache: typeof window !== "undefined" ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : undefined
  });
} catch (e) {
  // 如果在 Next.js HMR 環境下已經初始化過，會跳到這
  db = getFirestore(app);
}

// 全局設定持久化為 localStorage，確保關閉瀏覽器重開後仍維持登入
setPersistence(auth, browserLocalPersistence).catch(console.error);

export { app, auth, db };
