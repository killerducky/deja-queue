// utils/db.js

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("YouTubeDJ", 2);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("videos")) {
                db.createObjectStore("videos", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("log")) {
                const logStore = db.createObjectStore("log", { autoIncrement: true });
                // Optional: create an index on videoId for easy queries
                logStore.createIndex("videoId", "videoId", { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveLog(entries) {
    const db = await openDB();
    const entriesArray = Array.isArray(entries) ? entries : [entries];
    return new Promise((resolve, reject) => {
        const tx = db.transaction("log", "readwrite");
        const store = tx.objectStore("log");
        entriesArray.forEach((e) => store.add(e));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getLastNLogs(n) {
    return new Promise(async (resolve, reject) => {
        const db = await openDB(); // your function that opens the DB
        const tx = db.transaction("log", "readonly");
        const store = tx.objectStore("log");

        const result = [];
        // Open a cursor in reverse order (largest key first)
        const request = store.openCursor(null, "prev");

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor && result.length < n) {
                result.push(cursor.value);
                cursor.continue();
            } else {
                resolve(result);
            }
        };

        request.onerror = () => reject(request.error);
    });
}

export async function saveVideos(videos) {
    // console.log(`Saving ${videos.length} videos`);
    const videoArray = Array.isArray(videos) ? videos : [videos];
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("videos", "readwrite");
        const store = tx.objectStore("videos");
        videoArray.forEach((v) => store.put(v));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function loadVideos() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("videos", "readonly");
        const store = tx.objectStore("videos");
        const req = store.getAll();
        req.onsuccess = () => {
            let results = req.result;
            resolve(results);
        };
        req.onerror = () => reject(req.error);
    });
}

export async function hasAnyVideos() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("videos", "readonly");
        const store = tx.objectStore("videos");
        const req = store.count();
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => reject(req.error);
    });
}

export function deleteDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase("YouTubeDJ"); // replace with your DB name
        request.onsuccess = () => {
            console.log("Database deleted successfully");
            resolve();
        };
        request.onerror = (event) => {
            console.error("Error deleting database:", event.target.error);
            reject(event.target.error);
        };
        request.onblocked = () => {
            console.warn("Delete blocked: close all connections to the DB first");
        };
    });
}
