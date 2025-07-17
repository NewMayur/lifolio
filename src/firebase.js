import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCCnwiFhSiTVnoqmIUWBglzYZ1rkhHUcQs",
  authDomain: "lifolio-dev.firebaseapp.com",
  projectId: "lifolio-dev",
  storageBucket: "lifolio-dev.firebasestorage.app",
  messagingSenderId: "137728516716",
  appId: "1:137728516716:web:adc40fbf1092f77ea82e49"
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