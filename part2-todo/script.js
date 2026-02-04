"use strict";

const BASE_URL = "http://localhost:3000";

const ROUTES = {
  register: "/register",
  login: "/login",
  logout: "/logout",
  todos: "/todos",
};

const TOKEN_COOKIE = "authToken";

const authView = document.getElementById("authView");
const todoView = document.getElementById("todoView");

const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");

const regUsername = document.getElementById("regUsername");
const regPassword = document.getElementById("regPassword");

const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");

const whoami = document.getElementById("whoami");
const todoForm = document.getElementById("todoForm");
const todoTitle = document.getElementById("todoTitle");
const todoDesc = document.getElementById("todoDesc");
const todoList = document.getElementById("todoList");

const statusEl = document.getElementById("status");

function setCookie(name, value) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/`;
}

function getCookie(name) {
  const target = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split(";").map(s => s.trim());
  for (const part of parts) {
    if (part.startsWith(target)) {
      return decodeURIComponent(part.slice(target.length));
    }
  }
  return null;
}

function deleteCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; path=/`;
}

function getToken() {
  return getCookie(TOKEN_COOKIE);
}

function setStatus(msg, kind = "") {
  const safeMsg =
    typeof msg === "string" && msg.includes("<!DOCTYPE")
      ? "Server returned an HTML error. Check your route/endpoint."
      : msg;

  statusEl.textContent = safeMsg;
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

function showLoggedOut() {
  authView.classList.remove("hidden");
  todoView.classList.add("hidden");
  whoami.textContent = "—";
}

function showLoggedIn(username) {
  authView.classList.add("hidden");
  todoView.classList.remove("hidden");
  whoami.textContent = username || "user";
}

async function apiFetch(path, { method = "GET", body = null, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const token = getToken();
    if (!token) throw new Error("Missing auth token. Please log in again.");
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (res.status === 204) return null;

  const data = isJson
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && (data.message || data.error)) ||
      (typeof data === "string" && data) ||
      `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return data;
}

function renderTodos(todos) {
  todoList.innerHTML = "";

  if (!Array.isArray(todos) || todos.length === 0) {
    const li = document.createElement("li");
    li.className = "todo-item";
    li.textContent = "No todos yet. Add one above.";
    todoList.appendChild(li);
    return;
  }

  for (const t of todos) {
    const id = t.id;
    const title = t.title ?? "(Untitled)";
    const description = t.description ?? "";
    const completed = Boolean(t.completed);

    const li = document.createElement("li");
    li.className = "todo-item";

    const top = document.createElement("div");
    top.className = "todo-top";

    const left = document.createElement("div");
    const titleEl = document.createElement("div");
    titleEl.className = "todo-title";
    titleEl.textContent = title;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = completed ? "Completed" : "Active";

    const descEl = document.createElement("div");
    descEl.className = "todo-desc";
    descEl.textContent = description;

    left.appendChild(titleEl);
    if (description) left.appendChild(descEl);

    const right = document.createElement("div");
    right.appendChild(badge);

    top.appendChild(left);
    top.appendChild(right);

    const actions = document.createElement("div");
    actions.className = "actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn-ghost";
    toggleBtn.textContent = completed ? "Mark Active" : "Mark Complete";
    toggleBtn.addEventListener("click", async () => {
      try {
        setStatus("Updating todo...");
        await updateTodo(id, { completed: !completed });
        await refreshTodos();
        setStatus("Updated.", "ok");
      } catch (err) {
        setStatus(err.message, "err");
      }
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", async () => {
      const newTitle = prompt("New title:", title);
      if (newTitle === null) return;

      const newDesc = prompt("New description (optional):", description);
      if (newDesc === null) return;

      try {
        setStatus("Editing todo...");
        await updateTodo(id, { title: newTitle.trim(), description: newDesc.trim() });
        await refreshTodos();
        setStatus("Edited.", "ok");
      } catch (err) {
        setStatus(err.message, "err");
      }
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete this todo?")) return;
      try {
        setStatus("Deleting todo...");
        await deleteTodo(id);
        await refreshTodos();
        setStatus("Deleted.", "ok");
      } catch (err) {
        setStatus(err.message, "err");
      }
    });

    actions.appendChild(toggleBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(top);
    li.appendChild(actions);
    todoList.appendChild(li);
  }
}

async function refreshTodos() {
  const todos = await apiFetch(ROUTES.todos, { auth: true });
  renderTodos(Array.isArray(todos) ? todos : []);
}

async function createTodo(title, description) {
  return apiFetch(ROUTES.todos, {
    method: "POST",
    auth: true,
    body: { title, description },
  });
}

async function updateTodo(id, patch) {
  return apiFetch(`${ROUTES.todos}/${encodeURIComponent(id)}`, {
    method: "PUT",
    auth: true,
    body: patch,
  });
}

async function deleteTodo(id) {
  return apiFetch(`${ROUTES.todos}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: true,
  });
}

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");

  const username = regUsername.value.trim();
  const password = regPassword.value;

  if (!username || !password) return;

  try {
    setStatus("Registering...");
    await apiFetch(ROUTES.register, {
      method: "POST",
      body: { username, password },
    });

    setStatus("Registered! Now log in.", "ok");
    loginUsername.value = username;
    loginPassword.value = password;
    regPassword.value = "";
  } catch (err) {
    setStatus(err.message, "err");
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");

  const username = loginUsername.value.trim();
  const password = loginPassword.value;

  if (!username || !password) return;

  try {
    setStatus("Logging in...");
    const data = await apiFetch(ROUTES.login, {
      method: "POST",
      body: { username, password },
    });

    const token = data.authToken || data.token;
    if (!token) throw new Error("Login response did not include token.");

    setCookie(TOKEN_COOKIE, token);
    showLoggedIn(username);

    setStatus("Logged in.", "ok");
    loginPassword.value = "";

    await refreshTodos();
  } catch (err) {
    setStatus(err.message, "err");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    const token = getToken();
    if (token) {
      await apiFetch(ROUTES.logout, { method: "POST", auth: true }).catch(() => {});
    }
  } finally {
    deleteCookie(TOKEN_COOKIE);
    todoList.innerHTML = "";
    todoTitle.value = "";
    todoDesc.value = "";
    showLoggedOut();
    setStatus("Logged out.", "ok");
  }
});

todoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");

  const title = todoTitle.value.trim();
  const description = todoDesc.value.trim();

  if (!title) return;

  try {
    setStatus("Adding todo...");
    await createTodo(title, description);
    todoTitle.value = "";
    todoDesc.value = "";
    await refreshTodos();
    setStatus("Added.", "ok");
  } catch (err) {
    setStatus(err.message, "err");
  }
});

(function init() {
  const token = getToken();
  if (token) {
    showLoggedIn("user");
    refreshTodos().catch((err) => {
      deleteCookie(TOKEN_COOKIE);
      showLoggedOut();
      setStatus(`Session expired: ${err.message}`, "err");
    });
  } else {
    showLoggedOut();
  }
})();
