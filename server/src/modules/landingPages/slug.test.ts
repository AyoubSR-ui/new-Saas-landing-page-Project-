import { describe, expect, it } from "vitest";
import { slugify } from "./slug.js";

describe("slugify", () => {
  it("lowercases and hyphenates a normal title", () => {
    expect(slugify("Summer Sale Landing Page")).toBe("summer-sale-landing-page");
  });

  it("strips punctuation and collapses runs of non-alphanumeric characters", () => {
    expect(slugify("50% Off!! Everything...")).toBe("50-off-everything");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  -Hello World-  ")).toBe("hello-world");
  });

  it("falls back to a safe default for a title with no usable characters", () => {
    expect(slugify("!!!")).toBe("page");
    expect(slugify("")).toBe("page");
  });
});
