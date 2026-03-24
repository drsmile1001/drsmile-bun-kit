import { type Result, err, ok } from "@drsmile1001/utils";

import { type ValueIssue, type ValueProcessContext } from "./ValueProcessor";

export function asString<Required extends boolean>(options?: {
  required?: Required;
}): (
  value: unknown
) => Result<Required extends true ? string : string | null, ValueIssue[]> {
  const { required = false } = options ?? {};
  return (value: unknown) => {
    const str = String(value ?? "").trim();
    if (required && !str) {
      return err([
        {
          code: "REQUIRED",
          message: "必須填寫",
        },
      ]);
    }
    if (!required && !str) {
      return ok(null as Required extends true ? string : string | null);
    }
    return ok(str);
  };
}

export function asNumber<Required extends boolean>(options?: {
  required?: Required;
  min?: number;
  max?: number;
}): (
  value: unknown
) => Result<Required extends true ? number : number | null, ValueIssue[]> {
  const { required = false, min, max } = options ?? {};
  return (value: unknown) => {
    const str = String(value ?? "").trim();
    if (required && !str) {
      return err([
        {
          code: "REQUIRED",
          message: "必須填寫",
        },
      ]);
    }
    if (!required && !str) {
      return ok(null as Required extends true ? number : number | null);
    }
    const num = Number(str);
    if (Number.isNaN(num)) {
      return err([
        {
          code: "TYPE",
          message: "必須是數字",
        },
      ]);
    }
    if (min !== undefined && num < min) {
      return err([
        {
          code: "RANGE",
          message: `數值過小，最小值為 ${min}`,
        },
      ]);
    }
    if (max !== undefined && num > max) {
      return err([
        {
          code: "RANGE",
          message: `數值過大，最大值為 ${max}`,
        },
      ]);
    }
    return ok(num);
  };
}

export function asBoolean<Required extends boolean>(options?: {
  required?: Required;
}): (
  value: unknown
) => Result<Required extends true ? boolean : boolean | null, ValueIssue[]> {
  const { required = false } = options ?? {};
  return (value: unknown) => {
    const str = String(value ?? "").trim();
    if (required && !str) {
      return err([
        {
          code: "REQUIRED",
          message: "必須填寫",
        },
      ]);
    }
    if (!required && !str) {
      return ok(null as Required extends true ? boolean : boolean | null);
    }
    const b = str.toLowerCase() === "true";
    return ok(b);
  };
}

export type LocalDate = {
  date: Date;
  text: string;
};

export function mapEnum<EnumPairs extends [string, string][]>(options: {
  pairs: EnumPairs;
}): (value: unknown) => Result<EnumPairs[number][1], ValueIssue[]> {
  const map = new Map(options.pairs);
  const validValues = options.pairs.map((p) => p[0]);
  return (value: unknown) => {
    const str = String(value ?? "").trim();
    if (!validValues.includes(str)) {
      return err([
        {
          code: "ENUM",
          message: `無效的選項，請從 ${validValues.join(", ")} 中選擇`,
        },
      ]) as any;
    }
    return ok(map.get(str)!);
  };
}

export function checkUnique<T>(options?: {
  initSet?: Iterable<T>;
}): (value: unknown) => Result<T, ValueIssue[]> {
  const seen = new Set<T>(options?.initSet);
  return (value: unknown) => {
    if (seen.has(value as T)) {
      return err([
        {
          code: "DUPLICATE",
          message: "此值重複",
        },
      ]);
    }
    seen.add(value as T);
    return ok(value as T);
  };
}

export function checkUniqueInScope<
  TValue,
  TRecord extends Record<string, unknown>,
>(options: {
  getScope: (ctx: ValueProcessContext<TRecord>) => string;
}): (
  value: TValue,
  ctx: ValueProcessContext<TRecord>
) => Result<TValue, ValueIssue[]> {
  const scopeMap = new Map<string, Set<TValue>>();
  return (value: TValue, ctx: ValueProcessContext<TRecord>) => {
    const scope = options.getScope(ctx);
    if (!scopeMap.has(scope)) {
      scopeMap.set(scope, new Set());
    }
    const seen = scopeMap.get(scope)!;
    if (seen.has(value)) {
      return err([
        {
          code: "DUPLICATE",
          message: "此值在當前範圍內重複",
        },
      ]);
    }
    seen.add(value);
    return ok(value);
  };
}

export type RefValue<TRef = string> = {
  value: string;
  ref: TRef;
};

export function mapRef<TRef = string>(options: {
  map: Map<string, TRef>;
}): (value: string) => Result<RefValue<TRef>, ValueIssue[]> {
  return (value: string) => {
    const ref = options.map.get(value);
    if (!ref) {
      return err([
        {
          code: "REFERENCE",
          message: `找不到 ${value} 的對應資料`,
        },
      ]);
    }
    return ok({ value, ref });
  };
}

export function checkInSet<TValue>(options: {
  set: Set<TValue>;
}): (value: TValue) => Result<TValue, ValueIssue[]> {
  return (value: TValue) => {
    if (!options.set.has(value)) {
      return err([
        {
          code: "REFERENCE",
          message: `找不到 ${value} 的對應資料`,
        },
      ]);
    }
    return ok(value);
  };
}
