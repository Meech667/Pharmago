/**
 * Firebase configuration — PharmaGo
 *
 * Replace the placeholder values below with your real Firebase project config:
 *   Firebase console → Project settings → Your apps → Web app → SDK setup
 *
 * HOW TO GET YOUR CONFIG:
 *   1. Go to https://console.firebase.google.com
 *   2. Create project "pharmago" (or open existing)
 *   3. Add a Web app (the React Native SDK uses the Web config)
 *   4. Copy the firebaseConfig object here
 *   5. Enable: Authentication (Email/Password) + Firestore
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// ─── REPLACE WITH YOUR REAL CONFIG ───────────────────────────────────────────
const firebaseConfig = {
  apiKey: 'AIzaSyDScglKw4nIhEOMSjcexAdi6pc-qHdlxMI',
  authDomain: 'pharmago-inov.firebaseapp.com',
  projectId: 'pharmago-inov',
  storageBucket: 'pharmago-inov.firebasestorage.app',
  messagingSenderId: '938526253161',
  appId: '1:938526253161:web:21bae253e823dc792942f8',
};
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);

// Auth with AsyncStorage persistence (survives app restarts)
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Firestore
export const db = getFirestore(app);
