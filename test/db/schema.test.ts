import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

describe("D1 schema", () => {
  test("stores nullable product image URLs", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync("src/db/schema.sql", "utf8"));
    db.prepare("INSERT INTO products (id, upc, description, image_url) VALUES (?, ?, ?, ?)").run("p1", "0001", "Milk", "https://www.kroger.com/milk.jpg");
    expect(db.prepare("SELECT image_url FROM products WHERE id = 'p1'").get()).toEqual({ image_url: "https://www.kroger.com/milk.jpg" });
  });

  test("prevents duplicate draft weeks and duplicate products within a draft", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync("src/db/schema.sql", "utf8"));
    db.exec("INSERT INTO households (id, timezone) VALUES (1, 'America/New_York')");
    db.exec("INSERT INTO weekly_drafts (id, draft_week, status) VALUES (1, '2026-11-09', 'draft')");
    db.exec("INSERT INTO products (id, upc, description) VALUES ('p1', '0001', 'Milk')");
    db.exec("INSERT INTO draft_items (draft_id, product_id, quantity, source) VALUES (1, 'p1', 1, 'staple')");

    expect(() => db.exec("INSERT INTO weekly_drafts (id, draft_week, status) VALUES (2, '2026-11-09', 'draft')")).toThrow();
    expect(() => db.exec("INSERT INTO draft_items (draft_id, product_id, quantity, source) VALUES (1, 'p1', 2, 'search')")).toThrow();
  });

  test("prevents two submission operations for one draft", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync("src/db/schema.sql", "utf8"));
    db.exec("INSERT INTO households (id, timezone) VALUES (1, 'America/New_York')");
    db.exec("INSERT INTO weekly_drafts (id, draft_week, status) VALUES (1, '2026-11-09', 'draft')");
    db.exec("INSERT INTO extension_installations (id, credential_hash) VALUES ('ext', 'hash')");
    db.exec("INSERT INTO cart_snapshots (id, installation_id, payload_json, observed_at) VALUES ('snap', 'ext', '{\"items\":[]}', '2026-11-12T15:00:00Z')");
    db.exec("INSERT INTO submission_operations (id, draft_id, snapshot_id, status, items_json) VALUES ('one', 1, 'snap', 'pending', '[]')");

    expect(() => db.exec("INSERT INTO submission_operations (id, draft_id, snapshot_id, status, items_json) VALUES ('two', 1, 'snap', 'pending', '[]')")).toThrow();
  });
});
