export function productImage(document, imageUrl) {
  const placeholder = () => {
    const node = document.createElement("span");
    node.className = "product-image product-image-placeholder";
    node.setAttribute("aria-hidden", "true");
    node.textContent = "🛒";
    return node;
  };
  if (!imageUrl) return placeholder();
  const image = document.createElement("img");
  image.className = "product-image";
  image.setAttribute("src", imageUrl);
  image.setAttribute("alt", "");
  image.setAttribute("loading", "lazy");
  image.setAttribute("decoding", "async");
  image.addEventListener("error", () => image.replaceWith(placeholder()), { once: true });
  return image;
}
