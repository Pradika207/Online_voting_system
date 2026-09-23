import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAeBnmMIgjL9eK9j0jpyzbQpwX59Fii4KY",
  authDomain: "voting-f1c90.firebaseapp.com",
  projectId: "voting-f1c90",
  storageBucket: "voting-f1c90.firebasestorage.app",
  messagingSenderId: "951137692783",
  appId: "1:951137692783:web:8f1d91cede7a557e52319a",
  measurementId: "G-ZB90KWFF56",
};

export const firebaseReady = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

export const firebaseApp = firebaseReady ? initializeApp(firebaseConfig) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
