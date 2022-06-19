import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut as fireBaseSignOut,
    onAuthStateChanged,
    getAuth
} from 'firebase/auth';

const app = initializeApp({
    apiKey: process.env.VUE_APP_FIREBASE_API_KEY,
    authDomain: 'moviebrowser-fc94c.firebaseapp.com',
    databaseURL: 'https://moviebrowser-fc94c.firebaseio.com',
    projectId: 'moviebrowser-fc94c',
    storageBucket: 'moviebrowser-fc94c.appspot.com',
    messagingSenderId: '885461279936',
    appId: '1:885461279936:web:02825eca43b8bf28b2b925',
    measurementId: 'G-H7YQ02DFNL',
});

const db = getFirestore(app);
// db.app.enablePersistence({ synchronizeTabs: true }).catch((err) => {
//     console.error(err);
// });
enableMultiTabIndexedDbPersistence(db);
const googleProvider = new GoogleAuthProvider();
const auth = getAuth(app);

const signIn = () => {
    signInWithPopup(auth, googleProvider)
        .then((result) => {
            // Sign in successful
        })
        .catch((error) => {
            console.error(error);
        });
};

const signOut = () => {
    fireBaseSignOut(auth)
        .then(() => {
            // Sign out successful
        })
        .catch((error) => {
            console.error(error);
        });
};

export { onAuthStateChanged, signIn, signOut, db, auth };
