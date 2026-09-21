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
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfVz-VumbL9al4mHBkx1dS0pjVnJpC_5w",
  authDomain: "verifyai-38ef0.firebaseapp.com",
  projectId: "verifyai-38ef0",
  storageBucket: "verifyai-38ef0.firebasestorage.app",
  messagingSenderId: "872409124590",
  appId: "1:872409124590:web:4b45ca11169fb940d46dff",
  measurementId: "G-9QCJF1Z5R4",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// Used only by the researcher/ pages (participant pages never touch auth).
export const auth = getAuth(app);
