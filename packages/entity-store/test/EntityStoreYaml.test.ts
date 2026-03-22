import { expect, test } from "bun:test";

import { tmpdir } from "node:os";
import { describe } from "node:test";

import { Type as t } from "@sinclair/typebox";
import { ulid } from "ulid";

import { createDefaultLoggerFromEnv } from "@drsmile1001/logger";

import { EntityStoreYaml, MigrationBuilder } from "../index";

const logger = createDefaultLoggerFromEnv();

function createCrudRepo(path: string) {
  return new EntityStoreYaml({
    path,
    schema: t.Object({
      id: t.String(),
      name: t.String(),
    }),
    logger,
  });
}

function createMigratedRepo(path: string) {
  return new EntityStoreYaml({
    path,
    schema: t.Object({
      id: t.String(),
      name: t.String(),
      age: t.Union([t.Number(), t.Null()]),
      phone: t.Union([t.String(), t.Null()]),
    }),
    logger,
    migrations: MigrationBuilder.create<{
      id: string;
      name: string;
    }>()
      .addMigration("新增 age 欄位，預設為 null", (data) =>
        data.map((item) => ({
          ...item,
          age: null,
        }))
      )
      .addMigration("新增 phone 欄位，預設為 null", (data) =>
        data.map((item) => ({
          ...item,
          phone: null,
        }))
      )
      .build(),
  });
}

function createTransformedRepo(path: string) {
  return createTransformedRepoWithHelper(path);
}

function createTransformedRepoWithHelper(path: string) {
  return new EntityStoreYaml({
    path,
    schema: t.Object({
      id: t.String(),
      counter: t.Number(),
    }),
    logger,
    transformer: {
      toPersist: (data) => ({
        id: data.id,
        counter: `${data.counter}`,
      }),
      fromPersist: (data) => ({
        id: data.id,
        counter: Number(data.counter),
      }),
    },
  });
}

describe("EntityStoreYaml", () => {
  test("CRUD: 可從空白檔案讀取", async () => {
    const testFilePath = `${tmpdir()}/${ulid()}.yaml`;
    const repo = createCrudRepo(testFilePath);

    await repo.init();

    expect(await repo.list()).toEqual([]);

    const newYaml = await Bun.file(testFilePath).text();
    const parsed = Bun.YAML.parse(newYaml);
    expect(parsed).toEqual({
      version: 0,
      data: [],
    });
  });

  test("CRUD: 可執行 set/get/list", async () => {
    const testFilePath = `${tmpdir()}/${ulid()}.yaml`;
    const repo = createCrudRepo(testFilePath);

    await repo.init();
    await repo.set({ id: "1", name: "Alice" });
    await repo.set({ id: "2", name: "Bob" });

    expect(await repo.get("1")).toEqual({ id: "1", name: "Alice" });
    expect(await repo.get("2")).toEqual({ id: "2", name: "Bob" });
    expect(await repo.list()).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);

    const newYaml = await Bun.file(testFilePath).text();
    const parsed = Bun.YAML.parse(newYaml);
    expect(parsed).toEqual({
      version: 0,
      data: [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ],
    });
  });

  test("CRUD: 可執行 remove 與 replaceAll", async () => {
    const testFilePath = `${tmpdir()}/${ulid()}.yaml`;
    const repo = createCrudRepo(testFilePath);

    await repo.init();
    await repo.set({ id: "1", name: "Alice" });
    await repo.set({ id: "2", name: "Bob" });
    await repo.remove("1");

    expect(await repo.get("1")).toBeUndefined();
    expect(await repo.list()).toEqual([{ id: "2", name: "Bob" }]);

    await repo.replaceAll([
      { id: "3", name: "Carol" },
      { id: "4", name: "Dave" },
    ]);

    expect(await repo.list()).toEqual([
      { id: "3", name: "Carol" },
      { id: "4", name: "Dave" },
    ]);

    const newYaml = await Bun.file(testFilePath).text();
    const parsed = Bun.YAML.parse(newYaml);
    expect(parsed).toEqual({
      version: 0,
      data: [
        { id: "3", name: "Carol" },
        { id: "4", name: "Dave" },
      ],
    });
  });

  test("遷移: 可從未有 metadata 遷移", async () => {
    const testFilePath = `${tmpdir()}/${ulid()}.yaml`;
    const oldData = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ];
    const oldYaml = Bun.YAML.stringify(oldData, null, 2);
    await Bun.file(testFilePath).write(oldYaml);
    const repo = createMigratedRepo(testFilePath);

    await repo.init();

    expect(await repo.list()).toEqual([
      { id: "1", name: "Alice", age: null, phone: null },
      { id: "2", name: "Bob", age: null, phone: null },
    ]);

    const newYaml = await Bun.file(testFilePath).text();
    const parsed = Bun.YAML.parse(newYaml);
    expect(parsed).toEqual({
      version: 2,
      data: [
        { id: "1", name: "Alice", age: null, phone: null },
        { id: "2", name: "Bob", age: null, phone: null },
      ],
    });
  });

  test("遷移: 可從空白檔案讀取", async () => {
    const testFilePath = `${tmpdir()}/${ulid()}.yaml`;
    const repo = createMigratedRepo(testFilePath);

    await repo.init();

    expect(await repo.list()).toEqual([]);

    const newYaml = await Bun.file(testFilePath).text();
    const parsed = Bun.YAML.parse(newYaml);
    expect(parsed).toEqual({
      version: 2,
      data: [],
    });
  });

  test("遷移: 可以從中間版本遷移", async () => {
    const testFilePath = `${tmpdir()}/${ulid()}.yaml`;
    const oldData = {
      version: 1,
      data: [
        { id: "1", name: "Alice", age: 30 },
        { id: "2", name: "Bob", age: 25 },
      ],
    };
    const oldYaml = Bun.YAML.stringify(oldData, null, 2);
    await Bun.file(testFilePath).write(oldYaml);
    const repo = createMigratedRepo(testFilePath);

    await repo.init();

    expect(await repo.list()).toEqual([
      { id: "1", name: "Alice", age: 30, phone: null },
      { id: "2", name: "Bob", age: 25, phone: null },
    ]);

    const newYaml = await Bun.file(testFilePath).text();
    const parsed = Bun.YAML.parse(newYaml);
    expect(parsed).toEqual({
      version: 2,
      data: [
        { id: "1", name: "Alice", age: 30, phone: null },
        { id: "2", name: "Bob", age: 25, phone: null },
      ],
    });
  });

  test("transformer: 可將持久化資料轉換為實體", async () => {
    const testFilePath = `${tmpdir()}/${ulid()}.yaml`;
    const persistedData = {
      version: 0,
      data: [{ id: "1", counter: "123" }],
    };
    const oldYaml = Bun.YAML.stringify(persistedData, null, 2);
    await Bun.file(testFilePath).write(oldYaml);
    const repo = createTransformedRepo(testFilePath);

    await repo.init();

    expect(await repo.list()).toEqual([{ id: "1", counter: 123 }]);
  });

  test("transformer: 可將實體轉換為持久化資料", async () => {
    const testFilePath = `${tmpdir()}/${ulid()}.yaml`;
    const repo = createTransformedRepo(testFilePath);

    await repo.init();
    await repo.set({ id: "1", counter: 123 });

    const newYaml = await Bun.file(testFilePath).text();
    const parsed = Bun.YAML.parse(newYaml);
    expect(parsed).toEqual({
      version: 0,
      data: [{ id: "1", counter: "123" }],
    });
  });

  test("transformer helper: 可推導持久化型別", async () => {
    const testFilePath = `${tmpdir()}/${ulid()}.yaml`;
    const repo = createTransformedRepoWithHelper(testFilePath);

    await repo.init();
    await repo.set({ id: "1", counter: 123 });

    const newYaml = await Bun.file(testFilePath).text();
    const parsed = Bun.YAML.parse(newYaml);
    expect(parsed).toEqual({
      version: 0,
      data: [{ id: "1", counter: "123" }],
    });
  });
});
