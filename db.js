// utils/db.js

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("YouTubeDJ", 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("videos")) {
                db.createObjectStore("videos", { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveVideos(videos) {
    console.log(`Saving ${videos.length} videos`);
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("videos", "readwrite");
        const store = tx.objectStore("videos");
        videos.forEach((v) => store.put(v));
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
        req.onsuccess = () => resolve(req.result);
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
