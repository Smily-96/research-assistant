const admin = require("firebase-admin");

function serviceAccountFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

if (!admin.apps.length) {
  const credential = serviceAccountFromEnv();
  const options = {
    projectId: process.env.FIREBASE_PROJECT_ID || "imra---research-agent",
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ||
      "imra---research-agent.firebasestorage.app",
  };

  if (credential) {
    admin.initializeApp({
      credential: admin.credential.cert(credential),
      ...options,
    });
  } else {
    admin.initializeApp(options);
  }
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

module.exports = { admin, db, bucket };
