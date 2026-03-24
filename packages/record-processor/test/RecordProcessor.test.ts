import { describe, expect, test } from "bun:test";

import { err, ok } from "@drsmile1001/utils";

import {
  Pipe,
  type RecordDef,
  asNumber,
  asString,
  checkUnique,
  checkUniqueInScope,
  mapEnum,
  parseRecord,
  parseRecordList,
} from "../index";

type GenericRecord = {
  key: string;
  group: string;
  amount: number;
  mode: "AUTO" | "MANUAL";
  alias: string;
};

function createDef(): RecordDef<GenericRecord> {
  return {
    key: {
      parser: Pipe.from(asString({ required: true }))
        .check(checkUnique())
        .build(),
    },
    group: {
      parser: asString({ required: true }),
    },
    amount: {
      parser: asNumber({ required: true, min: 0 }),
    },
    mode: {
      parser: Pipe.from(asString({ required: true }))
        .then(
          mapEnum({
            pairs: [
              ["auto", "AUTO"],
              ["manual", "MANUAL"],
            ] as const,
          })
        )
        .build(),
    },
    alias: {
      parser: asString({ required: true }),
      postChecker: checkUniqueInScope({
        getScope: (ctx) => ctx.record.group,
      }),
    },
  };
}

describe("RecordProcessor 整合測試", () => {
  test("整合流程可解析單筆資料", async () => {
    const result = await parseRecord(createDef(), {
      key: "K1",
      group: "G1",
      amount: "100",
      mode: "auto",
      alias: "A1",
    });

    expect(result).toEqual(
      ok({
        key: "K1",
        group: "G1",
        amount: 100,
        mode: "AUTO",
        alias: "A1",
      })
    );
  });

  test("整合流程在清單解析時回傳帶 index 的錯誤", async () => {
    const result = await parseRecordList(createDef(), [
      {
        key: "K1",
        group: "G1",
        amount: "100",
        mode: "auto",
        alias: "A1",
      },
      {
        key: "K1",
        group: "G1",
        amount: "50",
        mode: "manual",
        alias: "A2",
      },
      {
        key: "K3",
        group: "G1",
        amount: "20",
        mode: "manual",
        alias: "A1",
      },
    ]);

    expect(result).toEqual(
      err({
        records: [
          {
            key: "K1",
            group: "G1",
            amount: 100,
            mode: "AUTO",
            alias: "A1",
          },
          {
            group: "G1",
            amount: 50,
            mode: "MANUAL",
            alias: "A2",
          },
          {
            key: "K3",
            group: "G1",
            amount: 20,
            mode: "MANUAL",
            alias: "A1",
          },
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
            field: "alias",
            code: "DUPLICATE",
            message: "此值在當前範圍內重複",
          },
        ],
      })
    );
  });
});
