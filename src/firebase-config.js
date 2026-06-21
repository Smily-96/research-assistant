import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  setDoc,
  updateDoc,
  doc,
  getDoc,
  deleteDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  listAll,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBCDcwKKePwTPOf0iNsAuQxrq84AZcuYC8",
  authDomain: "imra---research-agent.firebaseapp.com",
  projectId: "imra---research-agent",
  storageBucket: "imra---research-agent.firebasestorage.app",
  messagingSenderId: "512102709729",
  appId: "1:512102709729:web:c9e068b536409a70a83aa0",
  measurementId: "G-6WLXP4EDD6",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
const db = getFirestore(app);
const storage = getStorage(app);

export {
  app,
  auth,
  provider,
  db,
  storage,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  setDoc,
  updateDoc,
  doc,
  getDoc,
  deleteDoc,
  Timestamp,
  ref,
  uploadBytes,
  getDownloadURL,
  listAll
};
