// Tests for the EDN micro-parser.
// Run: cd leftglove/mcp-server && npx tsx src/edn/parser.test.ts

import { describe, it } from "node:test";
import { deepStrictEqual, throws } from "node:assert";
import { parseEdn } from "./parser.js";

describe("parseEdn", () => {
  // --- Primitives ---

  it("parses keywords", () => {
    deepStrictEqual(parseEdn(":foo"), "foo");
    deepStrictEqual(parseEdn(":a-b"), "a-b");
    deepStrictEqual(parseEdn(":a_b"), "a_b");
    deepStrictEqual(parseEdn(":a.b/c"), "a.b/c");
    deepStrictEqual(parseEdn(":ok?"), "ok?");
  });

  it("parses strings", () => {
    deepStrictEqual(parseEdn('"hello"'), "hello");
    deepStrictEqual(parseEdn('""'), "");
    deepStrictEqual(parseEdn('"line\\nbreak"'), "line\nbreak");
    deepStrictEqual(parseEdn('"tab\\there"'), "tab\there");
    deepStrictEqual(parseEdn('"escaped\\\\"'), "escaped\\");
    deepStrictEqual(parseEdn('"quote\\""'), 'quote"');
    deepStrictEqual(parseEdn('"cr\\rhere"'), "cr\rhere");
  });

  it("parses integers", () => {
    deepStrictEqual(parseEdn("0"), 0);
    deepStrictEqual(parseEdn("42"), 42);
    deepStrictEqual(parseEdn("-7"), -7);
    deepStrictEqual(parseEdn("1024"), 1024);
  });

  it("parses booleans", () => {
    deepStrictEqual(parseEdn("true"), true);
    deepStrictEqual(parseEdn("false"), false);
  });

  it("parses nil", () => {
    deepStrictEqual(parseEdn("nil"), null);
  });

  it("boolean/nil tokens require delimiter after", () => {
    // "trueness" should not parse as true
    throws(() => parseEdn("trueness"));
    throws(() => parseEdn("falsehood"));
    throws(() => parseEdn("nilly"));
  });

  // --- Vectors ---

  it("parses empty vector", () => {
    deepStrictEqual(parseEdn("[]"), []);
  });

  it("parses vector of keywords", () => {
    deepStrictEqual(parseEdn("[:a :b :c]"), ["a", "b", "c"]);
  });

  it("parses vector of mixed types", () => {
    deepStrictEqual(parseEdn('[1 "two" :three true nil]'), [
      1,
      "two",
      "three",
      true,
      null,
    ]);
  });

  it("parses nested vectors", () => {
    deepStrictEqual(parseEdn("[[:a] [:b :c]]"), [["a"], ["b", "c"]]);
  });

  // --- Maps ---

  it("parses empty map", () => {
    deepStrictEqual(parseEdn("{}"), {});
  });

  it("parses simple map", () => {
    deepStrictEqual(parseEdn('{:name "Alice" :age 30}'), {
      name: "Alice",
      age: 30,
    });
  });

  it("parses nested maps", () => {
    deepStrictEqual(parseEdn('{:a {:b "c"}}'), { a: { b: "c" } });
  });

  it("parses map with vector values", () => {
    deepStrictEqual(parseEdn("{:items [1 2 3]}"), { items: [1, 2, 3] });
  });

  // --- Comments ---

  it("strips line comments", () => {
    deepStrictEqual(parseEdn(";; this is a comment\n42"), 42);
    deepStrictEqual(
      parseEdn('{;; comment\n:a 1 ;; another\n:b 2}'),
      { a: 1, b: 2 },
    );
  });

  // --- Whitespace and commas ---

  it("treats commas as whitespace", () => {
    deepStrictEqual(parseEdn("{:a 1, :b 2}"), { a: 1, b: 2 });
    deepStrictEqual(parseEdn("[1, 2, 3]"), [1, 2, 3]);
  });

  it("handles leading/trailing whitespace", () => {
    deepStrictEqual(parseEdn("  \n  42  \n  "), 42);
  });

  // --- Real glossary EDN ---

  it("parses a realistic glossary intent file", () => {
    const edn = `
;; Intent region: Login
;; The login page — form fields, submit button.

{:intent "Login"
 :description "Login page with email/password form"
 :elements
 {:email-input     {:desc "Email address field"
                    :type :typable
                    :bindings {:web {:testid "email-input"}}}
  :password-input  {:desc "Password field"
                    :type :typable
                    :bindings {:web {:testid "password-input"}}}
  :login-submit    {:desc "Sign In button"
                    :type :clickable
                    :bindings {:web {:testid "login-submit"}}}}}
`;
    const result = parseEdn(edn) as Record<string, unknown>;
    deepStrictEqual(result["intent"], "Login");
    deepStrictEqual(result["description"], "Login page with email/password form");
    const elements = result["elements"] as Record<string, Record<string, unknown>>;
    deepStrictEqual(elements["email-input"]["type"], "typable");
    deepStrictEqual(
      (elements["login-submit"]["bindings"] as Record<string, Record<string, string>>)["web"]["testid"],
      "login-submit",
    );
  });

  // --- Error cases ---

  it("throws on empty input", () => {
    throws(() => parseEdn(""), /Unexpected end/);
  });

  it("throws on unterminated string", () => {
    throws(() => parseEdn('"hello'), /Unterminated string/);
  });

  it("throws on unterminated map", () => {
    throws(() => parseEdn("{:a 1"), /Unterminated map/);
  });

  it("throws on unterminated vector", () => {
    throws(() => parseEdn("[:a"), /Unterminated vector/);
  });

  it("throws on unexpected character", () => {
    throws(() => parseEdn("@invalid"), /Unexpected character/);
  });
});
