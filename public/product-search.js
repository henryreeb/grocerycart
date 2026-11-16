export function createProductSearch(fetchPage, render, notify) {
  let version = 0;
  let state = { term: "", products: [], nextStart: 0, loading: false, hasMore: false };
  const publish = () => render(state);

  async function load(start, requestVersion) {
    try {
      const page = await fetchPage(state.term, start);
      if (requestVersion !== version) return;
      const products = [...state.products, ...page.products].filter((product, index, all) => all.findIndex(({ id }) => id === product.id) === index);
      const nextStart = page.start + page.limit;
      if (page.products.length === 0) notify(state.products.length ? "No more products found." : "No products found.");
      state = { ...state, products, nextStart, loading: false, hasMore: nextStart < page.total };
      publish();
    } catch (error) {
      if (requestVersion !== version) return;
      state = { ...state, loading: false };
      publish();
      notify(error, true);
    }
  }

  return {
    async start(term) {
      const requestVersion = ++version;
      state = { term, products: [], nextStart: 0, loading: true, hasMore: false };
      publish();
      await load(0, requestVersion);
    },
    async more() {
      if (state.loading || !state.hasMore) return;
      state = { ...state, loading: true };
      publish();
      await load(state.nextStart, version);
    }
  };
}

export function bindSearchForm(form, submit) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit(form.querySelector('[name="q"]').value);
  });
}
