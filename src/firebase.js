import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getAuth, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB8hWXctYahlS01CSYqFVKvtxklWmi1hlU",
  authDomain: "lifolio-stag.firebaseapp.com",
  projectId: "lifolio-stag",
  storageBucket: "lifolio-stag.firebasestorage.app",
  messagingSenderId: "219224999349",
  appId: "1:219224999349:web:87f059cd412c176c4505fc",
  measurementId: "G-SCW4K2W6WM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Auth
const auth = getAuth(app);

// auth.setPersistence(browserLocalPersistence)
//   .then(() => {
//     // Sign in anonymously after setting persistence
//     signInAnonymously(auth)
//       .then(() => {
//         console.log("Anonymous user signed in");
//       })
//       .catch((error) => {
//         const errorCode = error.code;
//         const errorMessage = error.message;
//         console.error("Anonymous sign-in failed:", errorCode, errorMessage);
//       });
//   })
//   .catch((error) => {
//     console.error("Failed to set authentication persistence:", error);
//   });

export { db, auth };
