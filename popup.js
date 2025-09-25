// Cross-browser shim
if (typeof browser === "undefined") {
    var browser = chrome;
}

const input = document.getElementById("videoId");
const addBtn = document.getElementById("add");
const list = document.getElementById("queue");
const loadBtn = document.getElementById("loadFile");
const fileInput = document.getElementById("fileInput");

function renderQueue(queue, current) {
    list.innerHTML = "";
    queue.forEach((id, i) => {
        const li = document.createElement("li");
        li.textContent = id + (i === current ? " <- now" : "");
        list.appendChild(li);
    });
}

addBtn.addEventListener("click", async () => {
    const id = input.value.trim();
    if (!id) return;

    const data = await browser.storage.local.get(["queue", "current"]);
    let queue = data.queue || [];
    queue.push(id);
    console.log(queue);
    await browser.storage.local.set({ queue });
    renderQueue(queue, data.current ?? 0);
    input.value = "";
});

loadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
    console.log("hi");
    const file = e.target.files[0];
    console.log(file);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const jsonList = JSON.parse(reader.result);
            queue = jsonList.map((item) => item.id);
            console.log(queue);
            await browser.storage.local.set({ queue, current: 0 });
            renderQueue(queue, 0);
        } catch (err) {
            alert("Invalid JSON file: " + err.message);
        }
    };
    reader.readAsText(file);
});

// Initial load
(async () => {
    const data = await browser.storage.local.get(["queue", "current"]);
    renderQueue(data.queue || [], data.current ?? 0);
})();
