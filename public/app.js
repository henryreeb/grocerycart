const root = document.querySelector("#app");
let csrf = sessionStorage.getItem("csrf") ?? "";
let draft = null;

async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (options.method && options.method !== "GET" && csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch(path, { ...options, headers });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw Object.assign(new Error(body?.error ?? "Request failed"), { status: response.status });
  return body;
}

function money(cents) {
  return cents === null || cents === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function element(name, properties = {}, children = []) {
  const node = document.createElement(name);
  Object.assign(node, properties);
  node.append(...children);
  return node;
}

function showMessage(message, kind = "status") {
  const output = document.querySelector("#message");
  if (output) {
    output.textContent = message;
    output.dataset.kind = kind;
  }
}

function loginView() {
  const password = element("input", { type: "password", name: "password", required: true, autocomplete: "current-password" });
  const form = element("form", { className: "login-card" }, [
    element("h1", { textContent: "Household Grocery Cart" }),
    element("label", { textContent: "Household password" }, [password]),
    element("button", { type: "submit", textContent: "Sign in" }),
    element("p", { id: "message", role: "status", ariaLive: "polite" })
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/login", { method: "POST", body: JSON.stringify({ password: password.value }) });
      csrf = result.csrf;
      sessionStorage.setItem("csrf", csrf);
      await loadApp();
    } catch (error) {
      showMessage(error.message, "error");
    }
  });
  root.replaceChildren(form);
  password.focus();
}

function itemCard(item) {
  const change = item.previousPriceCents === null || item.previousPriceCents === undefined
    ? "No prior price"
    : item.currentPriceCents > item.previousPriceCents
      ? `${money(item.currentPriceCents - item.previousPriceCents)} higher`
      : item.currentPriceCents < item.previousPriceCents
        ? `${money(item.previousPriceCents - item.currentPriceCents)} lower`
        : "Same as last week";
  const quantity = element("input", { type: "number", min: "1", step: "1", value: String(item.quantity), ariaLabel: `Quantity for ${item.description}` });
  const save = element("button", { type: "button", textContent: "Update" });
  save.addEventListener("click", () => stage(item.productId, Number(quantity.value)));
  const remove = element("button", { type: "button", textContent: "Remove", className: "secondary" });
  remove.addEventListener("click", () => removeItem(item.productId));
  const priceText = item.weightPriceCents !== null && item.weightPriceCents !== undefined
    ? `${money(item.weightPriceCents)}${item.weightUnit ? ` / ${item.weightUnit}` : " per weight unit"} · final cost depends on fulfilled weight`
    : `${money(item.currentPriceCents)} · ${change}`;
  return element("article", { className: `item-card${item.available ? "" : " unavailable"}` }, [
    element("div", {}, [
      element("h3", { textContent: item.description }),
      element("p", { textContent: [item.brand, item.size].filter(Boolean).join(" · ") }),
      element("p", { textContent: priceText, className: "price" }),
      element("p", { textContent: item.available ? (item.stale ? "Price refresh needed" : "Available for pickup") : "Unavailable for pickup", className: "availability" })
    ]),
    element("div", { className: "item-actions" }, [quantity, save, remove])
  ]);
}

async function stage(productId, quantity) {
  try {
    await api(`/api/drafts/${draft.id}/items`, { method: "POST", body: JSON.stringify({ productId, quantity }) });
    await refreshDraft();
    showMessage("Draft updated.");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function removeItem(productId) {
  try {
    await api(`/api/drafts/${draft.id}/items/${encodeURIComponent(productId)}`, { method: "DELETE" });
    await refreshDraft();
    showMessage("Item removed.");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function renderDraft() {
  const list = document.querySelector("#draft-items");
  list.replaceChildren(...(draft?.items ?? []).map(itemCard));
  document.querySelector("#draft-empty").hidden = Boolean(draft?.items?.length);
}

async function refreshDraft() {
  const result = await api("/api/drafts/current");
  draft = result.draft;
  renderDraft();
}

async function search(event) {
  event.preventDefault();
  const term = new FormData(event.currentTarget).get("q");
  try {
    const result = await api(`/api/products?q=${encodeURIComponent(term)}`);
    const results = document.querySelector("#search-results");
    results.replaceChildren(...result.products.map((product) => {
      const add = element("button", { type: "button", textContent: "Add to draft", disabled: !draft });
      add.addEventListener("click", () => stage(product.id, 1));
      return element("article", { className: "search-result" }, [
        element("div", {}, [element("strong", { textContent: product.description }), element("p", { textContent: [product.brand, product.size, money(product.promoPriceCents ?? product.regularPriceCents)].filter(Boolean).join(" · ") })]),
        add
      ]);
    }));
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function loadApp() {
  root.replaceChildren(element("div", { className: "shell" }, [
    element("header", {}, [element("div", {}, [element("p", { textContent: "Thursday pickup planner", className: "eyebrow" }), element("h1", { textContent: "This week’s draft" })]), element("a", { href: "/api/oauth/start", textContent: "Connect Kroger", className: "button-link" })]),
    element("p", { id: "message", role: "status", ariaLive: "polite" }),
    element("section", { ariaLabel: "Add groceries" }, [
      element("h2", { textContent: "Add something" }),
      (() => { const form = element("form", { className: "search-form" }, [element("label", { textContent: "Search your pickup store", className: "sr-only", htmlFor: "search" }), element("input", { id: "search", name: "q", minLength: 2, required: true, placeholder: "Milk, coffee, paper towels…" }), element("button", { type: "submit", textContent: "Search" })]); form.addEventListener("submit", search); return form; })(),
      element("div", { id: "search-results", className: "results" })
    ]),
    element("section", { ariaLabel: "Weekly draft" }, [element("h2", { textContent: "Staged items" }), element("p", { id: "draft-empty", textContent: "No draft is ready yet. Use Prepare now after setup." }), element("div", { id: "draft-items", className: "items" })])
  ]));
  try {
    await refreshDraft();
  } catch (error) {
    if (error.status === 401) return loginView();
    showMessage(error.message, "error");
  }
}

loadApp();
