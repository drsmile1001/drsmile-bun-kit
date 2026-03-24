import { describe, expect, test } from "bun:test";

import { err, ok } from "@drsmile1001/utils";

import { Pipe } from "../src/Pipe";
import { type RecordDef, parseRecord } from "../src/RecordParser";
import { asNumber, asString, mapEnum } from "../src/ValueProcessorFactories";

type ItemRecord = {
  id: string;
  quantity: number;
  status: "ON" | "OFF";
};

function createRecordDef(): RecordDef<ItemRecord> {
  return {
    id: {
      parser: asString({ required: true }),
    },
    quantity: {
      parser: asNumber({ required: true, min: 0 }),
    },
    status: {
      parser: Pipe.from(asString({ required: true }))
        .then(
          mapEnum({
            pairs: [
              ["on", "ON"],
              ["off", "OFF"],
            ] as const,
          })
        )
        .build(),
      postChecker: (value, { record }) => {
        if (record.quantity === 0 && value === "ON") {
          return err([
            {
              code: "INVALID_STATE",
              message: "quantity 為 0 時不可為 ON",
            },
          ]);
        }
        return ok(value);
      },
    },
  };
}

describe("RecordParser", () => {
  test("可解析合法資料", async () => {
    const result = await parseRecord(createRecordDef(), {
      id: "A-1",
      quantity: "10",
      status: "on",
    });

    expect(result).toEqual(
      ok({
        id: "A-1",
        quantity: 10,
        status: "ON",
      })
    );
  });

  test("可依欄位聚合解析錯誤並保留部分解析結果", async () => {
    const result = await parseRecord(createRecordDef(), {
      id: "",
      quantity: "x",
      status: "off",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected error result");
    }

    expect(result.error.record).toEqual({
      status: "OFF",
    });
    expect(result.error.issues).toEqual([
      {
        field: "id",
        code: "REQUIRED",
        message: "必須填寫",
      },
      {
        field: "quantity",
        code: "TYPE",
        message: "必須是數字",
      },
    ]);
  });

  test("僅在前置解析成功後執行 postChecker", async () => {
    const result = await parseRecord(createRecordDef(), {
      id: "A-1",
      quantity: "0",
      status: "on",
    });

    expect(result).toEqual(
      err({
        record: {
          id: "A-1",
          quantity: 0,
          status: "ON",
        },
        issues: [
          {
            field: "status",
            code: "INVALID_STATE",
            message: "quantity 為 0 時不可為 ON",
          },
        ],
      })
    );
  });
});
