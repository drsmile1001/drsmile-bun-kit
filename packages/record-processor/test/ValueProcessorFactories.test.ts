import { describe, expect, test } from "bun:test";

import { err, ok } from "@drsmile1001/utils";

import {
  asBoolean,
  asNumber,
  asString,
  checkInSet,
  checkUnique,
  checkUniqueInScope,
  mapEnum,
  mapRef,
  pickFields,
} from "../src/ValueProcessorFactories";

describe("ValueProcessorFactories", () => {
  test("asString 可處理必填與非必填值", () => {
    const requiredParser = asString({ required: true });
    const optionalParser = asString({ required: false });

    expect(requiredParser("  abc  ")).toEqual(ok("abc"));
    expect(requiredParser(" ")).toEqual(
      err([
        {
          code: "REQUIRED",
          message: "必須填寫",
        },
      ])
    );
    expect(optionalParser(" ")).toEqual(ok(null));
  });

  test("asNumber 可驗證型別與範圍", () => {
    const parser = asNumber({ required: true, min: 0, max: 10 });

    expect(parser("8")).toEqual(ok(8));
    expect(parser("x")).toEqual(
      err([
        {
          code: "TYPE",
          message: "必須是數字",
        },
      ])
    );
    expect(parser("11")).toEqual(
      err([
        {
          code: "RANGE",
          message: "數值過大，最大值為 10",
        },
      ])
    );
  });

  test("asBoolean 可解析 true 與 false 並支援空值", () => {
    const parser = asBoolean({ required: false });

    expect(parser("true")).toEqual(ok(true));
    expect(parser("FALSE")).toEqual(ok(false));
    expect(parser(" ")).toEqual(ok(null));
  });

  test("mapEnum 可映射已知值並拒絕未知值", () => {
    const parser = mapEnum({
      pairs: [
        ["A", "alpha"],
        ["B", "beta"],
      ],
    });

    expect(parser("A")).toEqual(ok("alpha"));
    expect(parser("X")).toEqual(
      err([
        {
          code: "ENUM",
          message: "無效的選項，請從 A, B 中選擇",
        },
      ])
    );
  });

  test("checkUnique 可追蹤重複值", () => {
    const checker = checkUnique<string>();

    expect(checker("K1")).toEqual(ok("K1"));
    expect(checker("K2")).toEqual(ok("K2"));
    expect(checker("K1")).toEqual(
      err([
        {
          code: "DUPLICATE",
          message: "此值重複",
        },
      ])
    );
  });

  test("checkUniqueInScope 僅在相同 scope 內驗證重複", () => {
    const checker = checkUniqueInScope<string, { scope: string }>({
      getScope: (ctx) => ctx.record.scope,
    });

    expect(checker("A", { record: { scope: "s1" } })).toEqual(ok("A"));
    expect(checker("A", { record: { scope: "s2" } })).toEqual(ok("A"));
    expect(checker("A", { record: { scope: "s1" } })).toEqual(
      err([
        {
          code: "DUPLICATE",
          message: "此值在當前範圍內重複",
        },
      ])
    );
  });

  test("mapRef 與 checkInSet 可驗證參照", () => {
    const referenceMap = new Map<string, number>([["A", 1]]);
    const refParser = mapRef({ map: referenceMap });
    const setChecker = checkInSet({ set: new Set(["A", "B"]) });

    expect(refParser("A")).toEqual(ok({ value: "A", ref: 1 }));
    expect(refParser("X")).toEqual(
      err([
        {
          code: "REFERENCE",
          message: "找不到 X 的對應資料",
        },
      ])
    );

    expect(setChecker("B")).toEqual(ok("B"));
    expect(setChecker("X")).toEqual(
      err([
        {
          code: "REFERENCE",
          message: "找不到 X 的對應資料",
        },
      ])
    );
  });

  test("pickFields 可回傳 context record 的指定欄位", () => {
    const picker = pickFields<{ a: number; b: string; c: boolean }, "a" | "c">({
      fields: ["a", "c"],
    });

    expect(
      picker(undefined, {
        record: { a: 10, b: "x", c: true },
      })
    ).toEqual(ok({ a: 10, c: true }));
  });
});
