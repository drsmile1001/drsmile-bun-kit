import { expect, test } from "bun:test";

import { EntityStoreInMemory } from "../src/EntityStoreInMemory";

type UserEntity = {
  id: string;
  name: string;
};

test("CRUD: init 不會清空初始資料", async () => {
  const repo = new EntityStoreInMemory<UserEntity>({
    initialItems: [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ],
  });

  await repo.init();

  expect(await repo.list()).toEqual([
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
  ]);
});

test("CRUD: 可執行 set/get/list", async () => {
  const repo = new EntityStoreInMemory<UserEntity>();

  await repo.init();
  await repo.set({ id: "1", name: "Alice" });
  await repo.set({ id: "2", name: "Bob" });

  expect(await repo.get("1")).toEqual({ id: "1", name: "Alice" });
  expect(await repo.get("2")).toEqual({ id: "2", name: "Bob" });
  expect(await repo.list()).toEqual([
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
  ]);
});

test("CRUD: 可執行 remove 與 replaceAll", async () => {
  const repo = new EntityStoreInMemory<UserEntity>();

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
});
