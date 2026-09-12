/**
 * VERIFY-AI — Firebase initialization.
 *
 * This is the ONLY place Firebase is initialized. Every other module that
 * needs Firestore imports `db` from here rather than calling
 * initializeApp/getFirestore itself.
 *
 * SECURITY NOTE (see README "Security Principles" / the architecture
 * update's item 17): these config values identify which Firebase project
 * to talk to — they are not secrets, and Firebase Web apps are designed
 * to ship this in the client. They are NOT a substitute for Firestore
 * Security Rules (see /firestore.rules) — access control lives there, not
 * here. Never add an Admin SDK key or service-account credential to this
 * file or anywhere else in the frontend.
 *
 * TODO (research team / project owner): replace the placeholder values
 * below with the real Firebase Web config for the VERIFY-AI project
 * (Firebase Console → Project settings → General → Your apps → SDK
 * setup and configuration).
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
