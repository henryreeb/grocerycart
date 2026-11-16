import { parseHTML } from "linkedom";
import { describe, expect, test } from "vitest";
import { productImage } from "../../public/product-image.js";

describe("product image", () => {
  test("renders missing, lazy, and failed images without removing adjacent content", () => {
    const { document, window } = parseHTML("<html><body></body></html>");
    const missing = productImage(document, null);
    expect(missing.matches(".product-image-placeholder")).toBe(true);
    expect(missing.getAttribute("aria-hidden")).toBe("true");

    const container = document.createElement("article");
    const image = productImage(document, "https://www.kroger.com/milk.jpg");
    container.appendChild(image);
    container.appendChild(document.createTextNode("Milk"));
    container.appendChild(document.createElement("button"));
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("alt")).toBe("");

    image.dispatchEvent(new window.Event("error"));
    expect(container.querySelector(".product-image-placeholder")).not.toBeNull();
    expect(container.textContent).toContain("Milk");
    expect(container.querySelector("button")).not.toBeNull();
  });
});
