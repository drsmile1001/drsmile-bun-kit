import { type Result, err, isErr, ok } from "@drsmile1001/utils";

import type { ValueIssue, ValueProcessor } from "./ValueProcessor";

export type RecordDef<TRecord extends Record<string, unknown>> = {
  [K in keyof TRecord]: {
    parser: ValueProcessor<unknown, TRecord[K], Record<string, unknown>>;
    postChecker?: ValueProcessor<TRecord[K], unknown, TRecord>;
  };
};

export type FieldIssue = ValueIssue & { field: string };

export type ParseRecordResult<TRecord> = Result<
  TRecord,
  {
    record: Partial<TRecord>;
    issues: FieldIssue[];
  }
>;

export async function parseRecord<TRecord extends Record<string, unknown>>(
  recordDef: RecordDef<TRecord>,
  record: Record<string, unknown>
): Promise<ParseRecordResult<TRecord>> {
  const partialParsedRecord: Partial<TRecord> = {};
  const issues: FieldIssue[] = [];
  for (const key of Object.keys(recordDef) as (keyof TRecord)[]) {
    const { parser } = recordDef[key];
    const input = record[key as string];
    const result = await parser(input, { record });
    if (isErr(result)) {
      for (const issue of result.error) {
        issues.push({ ...issue, field: key as string });
      }
    } else {
      partialParsedRecord[key] = result.value;
    }
  }
  if (issues.length) {
    return err({
      record: partialParsedRecord,
      issues,
    });
  }
  const parsedRecord = partialParsedRecord as TRecord;

  for (const key of Object.keys(recordDef) as (keyof TRecord)[]) {
    const { postChecker } = recordDef[key];
    if (postChecker) {
      const checkResult = await postChecker(parsedRecord[key], {
        record: parsedRecord,
      });
      if (isErr(checkResult)) {
        for (const issue of checkResult.error) {
          issues.push({ ...issue, field: key as string });
        }
      }
    }
  }
  if (issues.length) {
    return err({
      record: parsedRecord,
      issues,
    });
  }
  return ok(parsedRecord);
}
