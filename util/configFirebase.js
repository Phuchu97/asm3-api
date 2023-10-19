const { initializeApp } = require('firebase/app');
const { getStorage } = require('firebase/storage');

const firebaseConfig = {
    apiKey: "AIzaSyDgyKzx38wx_MxYPZBBdxZwq6byNeO58ZE",
    authDomain: "funix-chat.firebaseapp.com",
    projectId: "funix-chat",
    storageBucket: "funix-chat.appspot.com",
    messagingSenderId: "402511139405",
    appId: "1:402511139405:web:0f314e8e15c01fd3a70204",
    measurementId: "G-NJ6RXDYCW3"
};

const app = initializeApp(firebaseConfig);

const storage = getStorage(app);

module.exports = {
    storage,
}