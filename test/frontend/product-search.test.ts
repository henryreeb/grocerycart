import { parseHTML } from "linkedom";
import { describe, expect, test, vi } from "vitest";
import { bindSearchForm, createProductSearch } from "../../public/product-search.js";

const page = (products: Array<{ id: string }>, start: number, total: number) => ({ products, start, limit: 10, total });
type SearchState = { term: string; products: Array<{ id: string }>; loading: boolean; hasMore: boolean };

describe("product search", () => {
  test("starts a new search with an empty first page", async () => {
    const states: unknown[] = [];
    const search = createProductSearch(async () => page([], 0, 0), (state: SearchState) => states.push(structuredClone(state)), () => {});

    await search.start("milk");

    expect(states.at(-1)).toMatchObject({ term: "milk", products: [], loading: false, hasMore: false });
  });

  test("appends later pages without duplicate product ids and stops at the reported total", async () => {
    const states: Array<{ products: Array<{ id: string }>; hasMore: boolean }> = [];
    const responses = [page([{ id: "1" }, { id: "2" }], 0, 20), page([{ id: "2" }, { id: "3" }], 10, 20)];
    const search = createProductSearch(async () => responses.shift()!, (state: SearchState) => states.push(structuredClone(state)), () => {});

    await search.start("milk");
    await search.more();

    expect(states.at(-1)?.products.map(({ id }) => id)).toEqual(["1", "2", "3"]);
    expect(states.at(-1)?.hasMore).toBe(false);
  });

  test("ignores repeated load-more requests while one is pending", async () => {
    let release: (value: ReturnType<typeof page>) => void = () => {};
    const pending = new Promise<ReturnType<typeof page>>((resolve) => { release = resolve; });
    let calls = 0;
    const search = createProductSearch(async (_term: string, start: number) => {
      calls += 1;
      return start === 0 ? page([{ id: "1" }], 0, 20) : pending;
    }, () => {}, () => {});
    await search.start("milk");

    const first = search.more();
    const second = search.more();
    release(page([{ id: "2" }], 10, 20));
    await Promise.all([first, second]);

    expect(calls).toBe(2);
  });

  test("ignores a late response from an older query", async () => {
    let releaseMilk: (value: ReturnType<typeof page>) => void = () => {};
    const milk = new Promise<ReturnType<typeof page>>((resolve) => { releaseMilk = resolve; });
    const states: Array<{ term: string; products: Array<{ id: string }> }> = [];
    const search = createProductSearch(async (term: string) => term === "milk" ? milk : page([{ id: "coffee" }], 0, 1), (state: SearchState) => states.push(structuredClone(state)), () => {});

    const oldSearch = search.start("milk");
    await search.start("coffee");
    releaseMilk(page([{ id: "milk" }], 0, 1));
    await oldSearch;

    expect(states.at(-1)).toMatchObject({ term: "coffee", products: [{ id: "coffee" }] });
  });

  test("uses the form submit event so native Enter submission starts a search", () => {
    const { document, window } = parseHTML('<form><input name="q" value="milk"><button type="submit">Search</button></form>');
    const form = document.querySelector("form")!;
    const submitted = vi.fn();
    bindSearchForm(form, submitted);

    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

    expect(submitted).toHaveBeenCalledWith("milk");
  });
});
