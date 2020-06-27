import firebase from 'firebase';

firebase.initializeApp({
    apiKey: process.env.VUE_APP_FIREBASE_API_KEY,
    authDomain: "moviebrowser-fc94c.firebaseapp.com",
    databaseURL: "https://moviebrowser-fc94c.firebaseio.com",
    projectId: "moviebrowser-fc94c",
    storageBucket: "moviebrowser-fc94c.appspot.com",
    messagingSenderId: "885461279936",
    appId: "1:885461279936:web:02825eca43b8bf28b2b925",
    measurementId: "G-H7YQ02DFNL"
});
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

const signIn = () => {
    console.log(process.env);
    firebase.auth().signInWithPopup(googleProvider).then(
        (result) => {
            // Sign in successful
        }
    ).catch(
          (error) => {
            console.error(error);
        }
    );
}

const signOut = () => {
    firebase.auth().signOut().then(
        () => {
            // Sign out successful
        }
    ).catch(
          (error) => {
            console.error(error);
        }
    );
}

export { firebase, signIn, signOut, db };
