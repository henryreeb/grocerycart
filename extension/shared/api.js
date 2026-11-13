(function (scope) {
  const raw = globalThis.browser ?? globalThis.chrome;
  function sendMessage(message) {
    const result = raw.runtime.sendMessage(message);
    return result && typeof result.then === "function" ? result : new Promise((resolve, reject) => raw.runtime.sendMessage(message, (response) => raw.runtime.lastError ? reject(raw.runtime.lastError) : resolve(response)));
  }
  scope.GroceryCartExtension = { ...scope.GroceryCartExtension, extensionApi: { raw, sendMessage } };
})(globalThis);
