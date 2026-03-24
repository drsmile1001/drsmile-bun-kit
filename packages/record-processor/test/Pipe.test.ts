import { describe, expect, test } from "bun:test";

import { err, ok } from "@drsmile1001/utils";

import { Pipe } from "../src/Pipe";

describe("Pipe", () => {
  test("then 可依序串接處理器", async () => {
    const parser = Pipe.from((value: unknown) => ok(String(value)))
      .then((value) => ok(value.trim()))
      .then((value) => ok(value.length))
      .build();

    expect(await parser("  abc  ", { record: {} })).toEqual(ok(3));
  });

  test("前一處理器失敗時 then 會短路", async () => {
    let nextCalled = false;
    const parser = Pipe.from(() =>
      err([
        {
          code: "FAIL",
          message: "first failed",
        },
      ])
    )
      .then(() => {
        nextCalled = true;
        return ok("should-not-run");
      })
      .build();

    const result = await parser("ignored", { record: {} });
    expect(result).toEqual(
      err([
        {
          code: "FAIL",
          message: "first failed",
        },
      ])
    );
    expect(nextCalled).toBe(false);
  });

  test("checkAll 會聚合所有 checker 錯誤", async () => {
    const parser = Pipe.from((value: unknown) => ok(Number(value)))
      .checkAll([
        (value) =>
          value % 2 === 0
            ? ok(value)
            : err([
                {
                  code: "ODD",
                  message: "must be even",
                },
              ]),
        (value) =>
          value > 10
            ? ok(value)
            : err([
                {
                  code: "SMALL",
                  message: "must be greater than 10",
                },
              ]),
      ])
      .build();

    expect(await parser("7", { record: {} })).toEqual(
      err([
        {
          code: "ODD",
          message: "must be even",
        },
        {
          code: "SMALL",
          message: "must be greater than 10",
        },
      ])
    );
  });

  test("if 僅在條件成立時套用處理器", async () => {
    const parser = Pipe.from((value: unknown) => ok(value as string | null))
      .if(
        (value): value is string => value !== null,
        (value) => ok(value.toUpperCase())
      )
      .build();

    expect(await parser("abc", { record: {} })).toEqual(ok("ABC"));
    expect(await parser(null, { record: {} })).toEqual(ok(null));
  });

  test("ifNotNull 與 default 可搭配使用", async () => {
    const parser = Pipe.from((value: unknown) => ok(value as string | null))
      .ifNotNull((value) => ok(value.trim()))
      .default(() => "fallback")
      .build();

    expect(await parser("  value ", { record: {} })).toEqual(ok("value"));
    expect(await parser(null, { record: {} })).toEqual(ok("fallback"));
  });
});
