import { describe, it, expect } from "vitest";
import { tokenizeQuery, highlightSegments } from "./search-highlight";

describe("tokenizeQuery", () => {
  it("lowercases and splits on whitespace", () => {
    expect(tokenizeQuery("React Animation")).toEqual(["react", "animation"]);
  });

  it("collapses repeated whitespace", () => {
    expect(tokenizeQuery("compress    images")).toEqual(["compress", "images"]);
  });

  it("keeps meaningful technical punctuation (dots, plus, hash, hyphen)", () => {
    expect(tokenizeQuery("react.js")).toEqual(["react.js"]);
    expect(tokenizeQuery("c++")).toEqual(["c++"]);
    expect(tokenizeQuery("self-hosted")).toEqual(["self-hosted"]);
  });

  it("strips other punctuation", () => {
    expect(tokenizeQuery("what's this, exactly?!")).toEqual(["what", "this", "exactly"]);
  });

  it("drops single-character noise tokens", () => {
    expect(tokenizeQuery("a react b")).toEqual(["react"]);
  });

  it("returns an empty array for blank input", () => {
    expect(tokenizeQuery("   ")).toEqual([]);
  });
});

describe("highlightSegments", () => {
  it("marks a single matching token", () => {
    const segments = highlightSegments("React Bits", ["react"]);
    expect(segments.find((s) => s.match)?.text.toLowerCase()).toBe("react");
    expect(segments.some((s) => !s.match && s.text.includes("Bits"))).toBe(true);
  });

  it("marks multiple distinct tokens", () => {
    const segments = highlightSegments("Build animated React UI components", ["react", "animated"]);
    const matched = segments.filter((s) => s.match).map((s) => s.text.toLowerCase());
    expect(matched).toContain("react");
    expect(matched).toContain("animated");
  });

  it("is case-insensitive", () => {
    const segments = highlightSegments("REACT bits", ["react"]);
    expect(segments.some((s) => s.match && s.text === "REACT")).toBe(true);
  });

  it("prefers the longer token when one token is a substring of another (react.js over react)", () => {
    const segments = highlightSegments("Next.js and react.js tutorials", ["react", "react.js"]);
    const matchedTexts = segments.filter((s) => s.match).map((s) => s.text);
    expect(matchedTexts).toContain("react.js");
    // Should not have split "react.js" into a highlighted "react" + plain ".js"
    expect(matchedTexts).not.toContain("react");
  });

  it("returns the original text unmatched when there are no tokens", () => {
    expect(highlightSegments("Hello world", [])).toEqual([{ text: "Hello world", match: false }]);
  });

  it("returns the original text unmatched when nothing in it matches", () => {
    const segments = highlightSegments("Hello world", ["xyz"]);
    expect(segments.every((s) => !s.match)).toBe(true);
  });

  it("handles empty text without throwing", () => {
    expect(highlightSegments("", ["react"])).toEqual([{ text: "", match: false }]);
  });

  it("escapes regex-special characters in tokens safely", () => {
    expect(() => highlightSegments("c++ resources", ["c++"])).not.toThrow();
    const segments = highlightSegments("c++ resources", ["c++"]);
    expect(segments.some((s) => s.match && s.text === "c++")).toBe(true);
  });
});
