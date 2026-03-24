import { describe, expect, test } from "bun:test";

import { err, ok } from "@drsmile1001/utils";

import { Pipe } from "../src/Pipe";
import { parseRecordList } from "../src/RecordListParser";
import { type RecordDef } from "../src/RecordParser";
import {
  asString,
  checkUnique,
  checkUniqueInScope,
} from "../src/ValueProcessorFactories";

type ListRecord = {
  key: string;
  scope: string;
  value: string;
};

function createRecordDef(): RecordDef<ListRecord> {
  return {
    key: {
      parser: Pipe.from(asString({ required: true }))
        .check(checkUnique())
        .build(),
    },
    scope: {
      parser: asString({ required: true }),
    },
    value: {
      parser: asString({ required: true }),
      postChecker: checkUniqueInScope({
        getScope: (ctx) => ctx.record.scope,
      }),
    },
  };
}

describe("RecordListParser", () => {
  test("可解析全部合法列資料", async () => {
    const result = await parseRecordList(createRecordDef(), [
      { key: "K1", scope: "A", value: "v1" },
      { key: "K2", scope: "A", value: "v2" },
      { key: "K3", scope: "B", value: "v1" },
    ]);

    expect(result).toEqual(
      ok([
        { key: "K1", scope: "A", value: "v1" },
        { key: "K2", scope: "A", value: "v2" },
        { key: "K3", scope: "B", value: "v1" },
      ])
    );
  });

  test("可收集帶列索引的錯誤並保留部分解析結果", async () => {
    const result = await parseRecordList(createRecordDef(), [
      { key: "K1", scope: "A", value: "v1" },
      { key: "K1", scope: "A", value: "v2" },
      { key: "K3", scope: "B", value: "" },
      { key: "K4", scope: "A", value: "v1" },
    ]);

    expect(result).toEqual(
      err({
        records: [
          { key: "K1", scope: "A", value: "v1" },
          { scope: "A", value: "v2" },
          { key: "K3", scope: "B" },
          { key: "K4", scope: "A", value: "v1" },
        ],
        issues: [
          {
            index: 1,
            field: "key",
            code: "DUPLICATE",
            message: "此值重複",
          },
          {
            index: 2,
            field: "value",
            code: "REQUIRED",
            message: "必須填寫",
          },
          {
            index: 3,
            field: "value",
            code: "DUPLICATE",
            message: "此值在當前範圍內重複",
          },
        ],
      })
    );
  });
});
