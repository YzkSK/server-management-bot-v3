import { describe, expect, test } from "bun:test";

import { parseCookieHeader } from "./parse-cookie-header";

describe("parseCookieHeader", () => {
  test("returns an empty object when header is undefined", () => {
    expect(parseCookieHeader(undefined)).toEqual({});
  });

  test("parses a single cookie", () => {
    expect(parseCookieHeader("next-auth.session-token=abc123")).toEqual({
      "next-auth.session-token": "abc123"
    });
  });

  test("parses multiple cookies separated by '; '", () => {
    expect(parseCookieHeader("a=1; b=2; c=3")).toEqual({ a: "1", b: "2", c: "3" });
  });

  test("URL-decodes cookie values", () => {
    expect(parseCookieHeader("token=a%2Bb%3Dc")).toEqual({ token: "a+b=c" });
  });

  test("ignores malformed segments without '='", () => {
    expect(parseCookieHeader("a=1; malformed; b=2")).toEqual({ a: "1", b: "2" });
  });
});
