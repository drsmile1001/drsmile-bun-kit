import { type MaybePromise, type Result } from "@drsmile1001/utils";

export type ValueIssue = {
  code: string;
  message: string;
};

export type ValueProcessResult<TValue> = Result<TValue, ValueIssue[]>;
export type ValueProcessContext<TRecord extends Record<string, unknown>> = {
  record: TRecord;
};

export type ValueProcessor<
  TInput,
  TOutput,
  TRecord extends Record<string, unknown>,
> = (
  value: TInput,
  ctx: ValueProcessContext<TRecord>
) => MaybePromise<ValueProcessResult<TOutput>>;
