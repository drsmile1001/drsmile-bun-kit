import { describe, expect, test } from "bun:test";

import { err, ok } from "@drsmile1001/utils";

import {
  Pipe,
  type RecordDef,
  asNumber,
  asString,
  checkInSet,
  checkUnique,
  mapEnum,
  parseRecord,
  parseRecordList,
} from "../index";

type GenericRecord = {
  id: string | null;
  name: string;
  amount: number;
  mode: "AUTO" | "MANUAL";
};

function createDef(): RecordDef<GenericRecord> {
  const existingIds = new Set(["u1", "u2"]);
  const existingNames = new Set(["GlobalTaken", "ExistingName"]);
  const existingIdNamePairs = new Set(["u1::ExistingName", "u2::NameForU2"]);

  const checkCreateNameUnique = checkUnique<string>({
    initSet: existingNames,
  });
  const checkUpdatePairUniqueInImport = checkUnique<string>();

  const ensureUpdateNameUnique = (value: { id: string; name: string }) => {
    const pairKey = `${value.id}::${value.name}`;
    if (existingIdNamePairs.has(pairKey)) {
      return ok(value);
    }

    const uniqueResult = checkUpdatePairUniqueInImport(pairKey);
    if (!uniqueResult.ok) {
      return err([
        {
          code: "DUPLICATE",
          message: "同一 id 的 name 不可重複",
        },
      ]);
    }

    return ok(value);
  };

  const ensureCreateNameUnique = (value: { id: null; name: string }) => {
    const uniqueResult = checkCreateNameUnique(value.name);
    if (!uniqueResult.ok) {
      return err([
        {
          code: "DUPLICATE",
          message: "新增資料的 name 不可與整體重複",
        },
      ]);
    }

    return ok(value);
  };

  return {
    id: {
      parser: Pipe.from(asString({ required: false }))
        .ifNotNull(checkInSet({ set: existingIds }))
        .build(),
    },
    name: {
      parser: asString({ required: true }),
      postChecker: (value, c) => {
        if (c.record.id) {
          return ensureUpdateNameUnique({ id: c.record.id, name: value });
        } else {
          return ensureCreateNameUnique({ id: null, name: value });
        }
      },
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
  };
}

describe("RecordProcessor 整合測試", () => {
  test("id-name 與既有資料完全一致時為合法，新增資料需全域唯一", async () => {
    const result = await parseRecord(createDef(), {
      id: "u1",
      name: "ExistingName",
      amount: "100",
      mode: "auto",
    });

    expect(result).toEqual(
      ok({
        id: "u1",
        name: "ExistingName",
        amount: 100,
        mode: "AUTO",
      })
    );
  });

  test("更新與新增規則衝突時，清單解析回傳帶 index 的錯誤", async () => {
    const result = await parseRecordList(createDef(), [
      {
        id: "u1",
        name: "ExistingName",
        amount: "100",
        mode: "auto",
      },
      {
        id: "u1",
        name: "NewForU1",
        amount: "50",
        mode: "manual",
      },
      {
        id: "u1",
        name: "NewForU1",
        amount: "20",
        mode: "manual",
      },
      {
        id: "",
        name: "GlobalTaken",
        amount: "60",
        mode: "auto",
      },
    ]);

    expect(result).toEqual(
      err({
        records: [
          {
            id: "u1",
            name: "ExistingName",
            amount: 100,
            mode: "AUTO",
          },
          {
            id: "u1",
            name: "NewForU1",
            amount: 50,
            mode: "MANUAL",
          },
          {
            id: "u1",
            name: "NewForU1",
            amount: 20,
            mode: "MANUAL",
          },
          {
            id: null,
            name: "GlobalTaken",
            amount: 60,
            mode: "AUTO",
          },
        ],
        issues: [
          {
            index: 2,
            field: "name",
            code: "DUPLICATE",
            message: "同一 id 的 name 不可重複",
          },
          {
            index: 3,
            field: "name",
            code: "DUPLICATE",
            message: "新增資料的 name 不可與整體重複",
          },
        ],
      })
    );
  });
});
