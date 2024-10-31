// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from 'firebase/database';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAcAgMeP-HwxgyCdE5AEgxvRuMjapfZFq0",
  authDomain: "trading-games.firebaseapp.com",
  projectId: "trading-games",
  storageBucket: "trading-games.firebasestorage.app",
  messagingSenderId: "313563345675",
  appId: "1:313563345675:web:0a873f9e1ca9b3da19280e",
  measurementId: "G-SC14R44CHP",
  databaseURL: "https://trading-games-default-rtdb.europe-west1.firebasedatabase.app/"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database and get a reference to the service
export const db = getDatabase(app);