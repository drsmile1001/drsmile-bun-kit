import { type Result, err, ok } from "@drsmile1001/utils";

import { type FieldIssue, type RecordDef, parseRecord } from "./RecordParser";

export type RecordIssue = FieldIssue & { index: number };

export type ParseRecordListResult<TRecord> = Result<
  TRecord[],
  {
    records: Partial<TRecord>[];
    issues: RecordIssue[];
  }
>;

export async function parseRecordList<TRecord extends Record<string, unknown>>(
  recordDef: RecordDef<TRecord>,
  record: Record<string, unknown>[]
): Promise<ParseRecordListResult<TRecord>> {
  const result: Partial<TRecord>[] = [];
  const issues: RecordIssue[] = [];
  for (let index = 0; index < record.length; index++) {
    const recordItem = record[index];
    const parseResult = await parseRecord(recordDef, recordItem!);
    if (parseResult.ok) {
      result.push(parseResult.value);
    } else {
      for (const issue of parseResult.error.issues) {
        issues.push({ ...issue, index: index });
      }
      result.push(parseResult.error.record);
    }
  }
  if (issues.length) {
    return err({
      records: result,
      issues,
    });
  }
  return ok(result as TRecord[]);
}
