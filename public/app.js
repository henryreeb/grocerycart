const root = document.querySelector("#app");
let csrf = sessionStorage.getItem("csrf") ?? "";
let draft = null;

async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (options.method && options.method !== "GET" && csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch(path, { ...options, headers });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw Object.assign(new Error(body?.error ?? "Request failed"), { status: response.status, body });
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
  save.disabled = draft?.status !== "draft";
  save.addEventListener("click", () => stage(item.productId, Number(quantity.value)));
  const remove = element("button", { type: "button", textContent: "Remove", className: "secondary" });
  remove.disabled = draft?.status !== "draft";
  remove.addEventListener("click", () => removeItem(item.productId));
  const priceText = item.weightPriceCents !== null && item.weightPriceCents !== undefined
    ? `${money(item.weightPriceCents)}${item.weightUnit ? ` / ${item.weightUnit}` : " per weight unit"} · final cost depends on fulfilled weight`
    : `${money(item.currentPriceCents)} · ${change}`;
  const stateText = { gray: "No coupon evidence", amber: "Coupon needs a fresh or exact check", green: "Clipped coupon applies", blue: "Discount appears in Kroger cart", red: "Coupon does not apply" }[item.couponState ?? "gray"];
  return element("article", { className: `item-card evidence-${item.couponState ?? "gray"}${item.available ? "" : " unavailable"}` }, [
    element("div", {}, [
      element("h3", { textContent: item.description }),
      element("p", { textContent: [item.brand, item.size].filter(Boolean).join(" · ") }),
      element("p", { textContent: priceText, className: "price" }),
      element("p", { textContent: item.available ? (item.stale ? "Price refresh needed" : "Available for pickup") : "Unavailable for pickup", className: "availability" }),
      element("p", { textContent: `${stateText}${item.coupon?.label ? `: ${item.coupon.label}` : ""}`, className: "coupon-status" })
    ]),
    element("div", { className: "item-actions" }, [quantity, save, remove])
  ]);
}

async function sendDraft() {
  try {
    const estimated = draft.items.reduce((sum, item) => sum + (item.weightPriceCents == null ? (item.currentPriceCents ?? 0) * item.quantity : 0), 0);
    const weighted = draft.items.filter((item) => item.weightPriceCents != null).length;
    const uncertain = draft.items.filter((item) => ["gray", "amber", "red"].includes(item.couponState)).length;
    if (!window.confirm(`Send ${draft.items.length} items to Kroger? Estimated fixed-price subtotal: ${money(estimated)}.${weighted ? ` ${weighted} variable-weight item(s) are additional.` : ""}${uncertain ? ` ${uncertain} item(s) do not have confirmed coupon savings.` : ""}`)) return;
    const { snapshot } = await api("/api/extension/latest-cart");
    const age = snapshot ? Date.now() - new Date(snapshot.observedAt).getTime() : Infinity;
    if (!snapshot || age < -60_000 || age > 5 * 60_000) {
      showMessage("Open your Kroger cart in a tab, wait for the extension to scan it, then try again.", "error");
      return;
    }
    const discounts = new Map(snapshot.items.map((item) => [item.upc, item.discountCents]));
    for (const item of draft.items) if ((discounts.get(item.upc) ?? 0) > 0) item.couponState = "blue";
    renderDraft();
    let result;
    try {
      result = await api(`/api/drafts/${draft.id}/submit`, { method: "POST", body: JSON.stringify({ snapshotId: snapshot.id }) });
    } catch (error) {
      const duplicateText = error.body?.duplicates?.map((item) => `${item.description} (${item.existingQuantity} existing, ${item.proposedQuantity} proposed)`).join(", ");
      if (error.status !== 409 || !duplicateText || !window.confirm(`Already in the Kroger cart: ${duplicateText}. Add them again?`)) throw error;
      result = await api(`/api/drafts/${draft.id}/submit`, { method: "POST", body: JSON.stringify({ snapshotId: snapshot.id, confirmDuplicates: true }) });
    }
    showMessage(`Sent ${result.added ?? draft.items.length} item(s) to Kroger.`);
    await refreshDraft();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function prepareNow() {
  try {
    await api("/api/drafts/prepare", { method: "POST" });
    await refreshDraft();
    showMessage("Weekly draft prepared.");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function pairExtension() {
  try {
    const { code } = await api("/api/extension/pair-code", { method: "POST" });
    window.postMessage({ type: "GC_PAIR", code }, location.origin);
    showMessage("Pairing request sent to the browser extension.");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

window.addEventListener("message", (event) => {
  if (event.source === window && event.origin === location.origin && event.data?.type === "GC_PAIR_RESULT") showMessage(event.data.ok ? "Browser extension paired." : event.data.error || "Extension pairing failed.", event.data.ok ? "status" : "error");
});

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

async function approveStaple(productId, quantity = 1) {
  try {
    await api("/api/staples", { method: "POST", body: JSON.stringify({ productId, quantity }) });
    showMessage("Staple saved for future Thursday drafts.");
    await loadSuggestions();
  } catch (error) { showMessage(error.message, "error"); }
}

async function loadSuggestions() {
  const target = document.querySelector("#staple-suggestions");
  if (!target) return;
  const { suggestions } = await api("/api/staples/suggestions");
  target.replaceChildren(...suggestions.filter((item) => item.productId).map((item) => {
    const add = element("button", { type: "button", textContent: "Use weekly" });
    add.addEventListener("click", () => approveStaple(item.productId));
    return element("article", { className: "search-result" }, [element("span", { textContent: `${item.description} · ${item.orderCount} recent orders` }), add]);
  }));
}

function renderDraft() {
  const list = document.querySelector("#draft-items");
  list.replaceChildren(...(draft?.items ?? []).map(itemCard));
  document.querySelector("#draft-empty").hidden = Boolean(draft?.items?.length);
  const send = document.querySelector("#send-draft");
  if (send) send.disabled = !draft?.items?.length || !["draft", "partial"].includes(draft.status);
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
      const staple = element("button", { type: "button", textContent: "Use weekly", className: "secondary" });
      staple.addEventListener("click", () => approveStaple(product.id));
      return element("article", { className: "search-result" }, [
        element("div", {}, [element("strong", { textContent: product.description }), element("p", { textContent: [product.brand, product.size, money(product.promoPriceCents ?? product.regularPriceCents)].filter(Boolean).join(" · ") })]),
        element("div", { className: "item-actions" }, [add, staple])
      ]);
    }));
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function loadApp() {
  if (!csrf) {
    try {
      const session = await api("/api/session");
      csrf = session.csrf;
      sessionStorage.setItem("csrf", csrf);
    } catch (error) {
      if (error.status === 401) return loginView();
      throw error;
    }
  }
  root.replaceChildren(element("div", { className: "shell" }, [
    element("header", {}, [element("div", {}, [element("p", { textContent: "Thursday pickup planner", className: "eyebrow" }), element("h1", { textContent: "This week’s draft" })]), element("div", { className: "item-actions" }, [(() => { const button = element("button", { type: "button", textContent: "Pair extension", className: "secondary" }); button.addEventListener("click", pairExtension); return button; })(), (() => { const button = element("button", { type: "button", textContent: "Prepare now", className: "secondary" }); button.addEventListener("click", prepareNow); return button; })(), element("a", { href: "/api/oauth/start", textContent: "Connect Kroger", className: "button-link" })])]),
    element("p", { id: "message", role: "status", ariaLive: "polite" }),
    element("section", { ariaLabel: "Add groceries" }, [
      element("h2", { textContent: "Add something" }),
      (() => { const form = element("form", { className: "search-form" }, [element("label", { textContent: "Search your pickup store", className: "sr-only", htmlFor: "search" }), element("input", { id: "search", name: "q", minLength: 2, required: true, placeholder: "Milk, coffee, paper towels…" }), element("button", { type: "submit", textContent: "Search" })]); form.addEventListener("submit", search); return form; })(),
      element("div", { id: "search-results", className: "results" })
    ]),
    element("section", { ariaLabel: "Suggested staples" }, [element("h2", { textContent: "Suggested from recent purchases" }), element("div", { id: "staple-suggestions", className: "results" })]),
    element("section", { ariaLabel: "Weekly draft" }, [element("h2", { textContent: "Staged items" }), element("p", { id: "draft-empty", textContent: "No draft is ready yet. Use Prepare now after setup." }), element("div", { id: "draft-items", className: "items" }), (() => { const button = element("button", { type: "button", textContent: "Send approved items", className: "send-draft", id: "send-draft" }); button.addEventListener("click", sendDraft); return button; })()]),
    element("footer", {}, [element("a", { href: "/api/household-data", textContent: "Export household data" }), (() => { const button = element("button", { type: "button", textContent: "Delete household data", className: "danger" }); button.addEventListener("click", async () => { const password = window.prompt("Enter the household password"); if (!password || window.prompt("Type DELETE to permanently remove this app's household data. Export first if you need a backup.") !== "DELETE") return; try { await api("/api/household-data", { method: "POST", body: JSON.stringify({ password, confirmation: "DELETE" }) }); sessionStorage.clear(); loginView(); } catch (error) { showMessage(error.message, "error"); } }); return button; })()])
  ]));
  try {
    await refreshDraft();
    await loadSuggestions();
    setInterval(() => refreshDraft().catch(() => {}), 60_000);
  } catch (error) {
    if (error.status === 401) return loginView();
    showMessage(error.message, "error");
  }
}

loadApp();
