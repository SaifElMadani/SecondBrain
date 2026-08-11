// ─── FIREBASE CONFIG ─────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAJxEsYONHpHlcQ-p9oeCeYE5svaIQBLDI",
  authDomain: "website-todo-ae952.firebaseapp.com",
  projectId: "website-todo-ae952",
  storageBucket: "website-todo-ae952.firebasestorage.app",
  messagingSenderId: "865375487797",
  appId: "1:865375487797:web:fea94104f6e121a425ae7c"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch(() => { });

export { auth, db, storage, firebaseConfig };

Object.assign(window, { auth, db, storage, firebaseConfig });
