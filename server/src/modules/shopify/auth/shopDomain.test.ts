import { describe, expect, it } from "vitest";
import { InvalidShopDomainError, normalizeShopDomain } from "./shopDomain.js";

describe("normalizeShopDomain", () => {
  it("accepts and lowercases a valid shop domain", () => {
    expect(normalizeShopDomain("My-Shop.myshopify.com")).toBe("my-shop.myshopify.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeShopDomain("  my-shop.myshopify.com  ")).toBe("my-shop.myshopify.com");
  });

  it.each([
    undefined,
    null,
    123,
    "",
    "not-a-shop",
    "my-shop.example.com",
    "javascript:alert(1)",
    "my-shop.myshopify.com.evil.com",
    "-leading-hyphen.myshopify.com",
    "trailing-hyphen-.myshopify.com",
    "https://my-shop.myshopify.com",
    "my shop.myshopify.com",
  ])("rejects %p", (input) => {
    expect(() => normalizeShopDomain(input)).toThrow(InvalidShopDomainError);
  });
});
