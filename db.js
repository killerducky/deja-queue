// utils/db.js

let dbPromise; // promise while opening
let dbInstance; // actual IDBDatabase

export let VERSION = 4;

export function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
}

async function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("YouTubeDJ", VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("videos")) {
          const videoStore = db.createObjectStore("videos", {
            keyPath: "uuid",
          });
          videoStore.createIndex(
            "source_foreignKey",
            ["source", "foreignKey"],
            { unique: true }
          );
        }
        if (!db.objectStoreNames.contains("log")) {
          const logStore = db.createObjectStore("log", { autoIncrement: true });
          logStore.createIndex("videoUuid", "videoUuid", { unique: false });
        }
        if (!db.objectStoreNames.contains("playlists")) {
          db.createObjectStore("playlists", { keyPath: "uuid" });
        }
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };
      request.onerror = () => reject(request.error);
    });
  }
  return dbInstance || (await dbPromise);
}

export async function closeDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPromise = null;
  }
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
  // console.log(saving #:${videos.length R:${videos[0].rating T:${videos[0].title}}}``)
  // console.trace();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("videos", "readwrite");
    const store = tx.objectStore("videos");
    videoArray.forEach((v) => {
      if (v.type && v.type !== "video") {
        console.log("saveVideos: Error wrong type", v);
        alert(
          "DB integrity check fail. saveVideos: Error wrong type Check dev console."
        );
      } else {
        const actual = v.ref ? v.ref : v;
        store.put(actual);
      }
    });
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

export async function savePlaylists(playlists) {
  const playlistArray = Array.isArray(playlists) ? playlists : [playlists];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("playlists", "readwrite");
    const store = tx.objectStore("playlists");
    playlistArray.forEach((p) => {
      if (p.type && p.type !== "playlist") {
        console.log("saveVideos: Error wrong type", v);
        alert(
          "DB integrity check fail. saveVideos: Error wrong type. Check dev console."
        );
      } else {
        const actual = p.ref ? p.ref : p;
        store.put(actual);
      }
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPlaylists() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("playlists", "readonly");
    const store = tx.objectStore("playlists");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPlaylist(uuid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("playlists", "readonly");
    const store = tx.objectStore("playlists");
    const req = store.get(uuid);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function getPlaylistBySourceAndForeignKey(source, foreignKey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("playlists", "readonly");
    const store = tx.objectStore("playlists");
    const req = store.getAll();

    req.onsuccess = () => {
      const result = req.result.find(
        (p) => p.source === source && p.foreignKey === foreignKey
      );
      resolve(result || null);
    };

    req.onerror = () => reject(req.error);
  });
}
export async function deletePlaylist(uuid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("playlists", "readwrite");
    const store = tx.objectStore("playlists");
    const req = store.delete(uuid);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDB() {
  await closeDB();
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
