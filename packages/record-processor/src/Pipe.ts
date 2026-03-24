import { type Result, err, isErr, ok } from "@drsmile1001/utils";

import type { ValueIssue, ValueProcessor } from "./ValueProcessor";

export class Pipe<TInput, TOutput = TInput> {
  constructor(private fn: ValueProcessor<TInput, TOutput>) {}

  static from<TInput, TOutput>(
    fn: ValueProcessor<TInput, TOutput>
  ): Pipe<TInput, TOutput> {
    return new Pipe(fn);
  }

  then<TNext>(next: ValueProcessor<TOutput, TNext>): Pipe<TInput, TNext> {
    return new Pipe<TInput, TNext>(async (value, row) => {
      const result = await this.fn(value, row);
      if (isErr(result)) {
        return result;
      }
      return next(result.value, row);
    });
  }

  check(checker: ValueProcessor<TOutput, TOutput>): Pipe<TInput, TOutput> {
    return this.then(checker);
  }

  checkAll(
    checkers: ValueProcessor<TOutput, TOutput>[]
  ): Pipe<TInput, TOutput> {
    return new Pipe<TInput, TOutput>(async (value, row) => {
      const result = await this.fn(value, row);
      if (isErr(result)) {
        return result;
      }
      let currentValue = result.value;
      const issues: ValueIssue[] = [];
      for (const checker of checkers) {
        const checkResult = await checker(currentValue, row);
        if (isErr(checkResult)) {
          issues.push(...checkResult.error);
        }
      }
      if (issues.length) {
        return err(issues);
      }
      return ok(currentValue);
    });
  }

  if<TCondition extends TOutput, TNext>(
    condition: (value: TOutput) => value is TCondition,
    processor: ValueProcessor<TCondition, TNext>
  ) {
    return new Pipe<TInput, Exclude<TOutput, TCondition> | TNext>(
      async (value, row) => {
        const result = await this.fn(value, row);
        if (isErr(result)) {
          return result;
        }
        if (condition(result.value)) {
          return processor(result.value, row);
        }
        return result as Result<Exclude<TOutput, TCondition>, ValueIssue[]>;
      }
    );
  }

  ifNotNull<TNext>(processor: ValueProcessor<NonNullable<TOutput>, TNext>) {
    return this.if(
      (value): value is NonNullable<TOutput> =>
        value !== null && value !== undefined,
      processor
    );
  }

  default(builder: () => TOutput): Pipe<TInput, NonNullable<TOutput>> {
    return new Pipe<TInput, NonNullable<TOutput>>(async (input, row) => {
      const result = await this.fn(input, row);
      if (isErr(result)) {
        return result;
      }
      if (result.value === null || result.value === undefined) {
        return ok(builder() as NonNullable<TOutput>);
      }
      return ok(result.value as NonNullable<TOutput>);
    });
  }

  build(): ValueProcessor<TInput, TOutput> {
    return this.fn;
  }
}
