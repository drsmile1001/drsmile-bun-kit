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

  test("match + otherwise 可得到分支聯集型別並供 then 使用", async () => {
    const parser = Pipe.from((value: unknown) => ok(value as "A" | "B" | "C"))
      .match()
      .when(
        (value): value is "A" => value === "A",
        () => ok(100)
      )
      .when(
        (value): value is "B" => value === "B",
        () => ok(true)
      )
      .otherwise(() => ok("fallback"))
      .then((value) => {
        if (typeof value === "number") {
          return ok(`N:${value}`);
        }
        if (typeof value === "boolean") {
          return ok(`B:${value}`);
        }
        return ok(`S:${value}`);
      })
      .build();

    expect(await parser("A", { record: {} })).toEqual(ok("N:100"));
    expect(await parser("B", { record: {} })).toEqual(ok("B:true"));
    expect(await parser("C", { record: {} })).toEqual(ok("S:fallback"));
  });

  test("match 可用 exhaustive 建立嚴格分支", async () => {
    const parser = Pipe.from((value: unknown) => ok(value as "A" | "B"))
      .match()
      .when(
        (value): value is "A" => value === "A",
        () => ok(1)
      )
      .when(
        (value): value is "B" => value === "B",
        () => ok(2)
      )
      .exhaustive()
      .build();

    expect(await parser("A", { record: {} })).toEqual(ok(1));
    expect(await parser("B", { record: {} })).toEqual(ok(2));
  });

  test("exhaustive 在執行期未命中時回傳 NO_MATCH", async () => {
    const parser = Pipe.from((value: unknown) => ok(value as "A" | "B"))
      .match()
      .when(
        (value): value is "A" => value === "A",
        () => ok(1)
      )
      .when(
        (value): value is "B" => value === "B",
        () => ok(2)
      )
      .exhaustive()
      .build();

    expect(await parser("C", { record: {} })).toEqual(
      err([
        {
          code: "NO_MATCH",
          message: "沒有符合條件的分支",
        },
      ])
    );
  });
});
