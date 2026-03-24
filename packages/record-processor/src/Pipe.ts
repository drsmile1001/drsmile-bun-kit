import { type Result, err, isErr, ok } from "@drsmile1001/utils";

import type { ValueIssue, ValueProcessor } from "./ValueProcessor";

type MatchBranch<TOutput, TRecord extends Record<string, unknown>> = {
  condition: (value: TOutput) => boolean;
  processor: ValueProcessor<TOutput, unknown, TRecord>;
};

class MatchBuilder<
  TInput,
  TOutput,
  TMatched,
  TRemain extends TOutput,
  TRecord extends Record<string, unknown>,
> {
  constructor(
    private base: ValueProcessor<TInput, TOutput, TRecord>,
    private branches: MatchBranch<TOutput, TRecord>[]
  ) {}

  when<TCase extends TRemain, TNext>(
    condition: (value: TRemain) => value is TCase,
    processor: ValueProcessor<TCase, TNext, TRecord>
  ): MatchBuilder<
    TInput,
    TOutput,
    TMatched | TNext,
    Exclude<TRemain, TCase>,
    TRecord
  > {
    const branch: MatchBranch<TOutput, TRecord> = {
      condition: condition as unknown as (value: TOutput) => boolean,
      processor: processor as ValueProcessor<TOutput, unknown, TRecord>,
    };
    return new MatchBuilder(this.base, [...this.branches, branch]);
  }

  otherwise<TNext>(
    processor: ValueProcessor<TRemain, TNext, TRecord>
  ): Pipe<TInput, TMatched | TNext, TRecord> {
    return new Pipe<TInput, TMatched | TNext, TRecord>(async (value, row) => {
      const baseResult = await this.base(value, row);
      if (isErr(baseResult)) {
        return baseResult;
      }

      for (const branch of this.branches) {
        if (branch.condition(baseResult.value)) {
          const branchResult = await branch.processor(baseResult.value, row);
          if (isErr(branchResult)) {
            return branchResult;
          }
          return ok(branchResult.value as TMatched | TNext);
        }
      }

      return processor(baseResult.value as TRemain, row);
    });
  }

  exhaustive(
    this: MatchBuilder<TInput, TOutput, TMatched, any, TRecord>
  ): Pipe<TInput, TMatched, TRecord> {
    return new Pipe<TInput, TMatched, TRecord>(async (value, row) => {
      const baseResult = await this.base(value, row);
      if (isErr(baseResult)) {
        return baseResult;
      }

      for (const branch of this.branches) {
        if (branch.condition(baseResult.value)) {
          const branchResult = await branch.processor(baseResult.value, row);
          if (isErr(branchResult)) {
            return branchResult;
          }
          return ok(branchResult.value as TMatched);
        }
      }

      return err([
        {
          code: "NO_MATCH",
          message: "沒有符合條件的分支",
        },
      ]);
    });
  }
}

export class Pipe<TInput, TOutput, TRecord extends Record<string, unknown>> {
  constructor(private fn: ValueProcessor<TInput, TOutput, TRecord>) {}

  static from<TInput, TOutput, TRecord extends Record<string, unknown>>(
    fn: ValueProcessor<TInput, TOutput, TRecord>
  ): Pipe<TInput, TOutput, TRecord> {
    return new Pipe(fn);
  }

  then<TNext>(
    next: ValueProcessor<TOutput, TNext, TRecord>
  ): Pipe<TInput, TNext, TRecord> {
    return new Pipe<TInput, TNext, TRecord>(async (value, row) => {
      const result = await this.fn(value, row);
      if (isErr(result)) {
        return result;
      }
      return next(result.value, row);
    });
  }

  check(
    checker: ValueProcessor<TOutput, TOutput, TRecord>
  ): Pipe<TInput, TOutput, TRecord> {
    return this.then(checker);
  }

  checkAll(
    checkers: ValueProcessor<TOutput, TOutput, TRecord>[]
  ): Pipe<TInput, TOutput, TRecord> {
    return new Pipe<TInput, TOutput, TRecord>(async (value, row) => {
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
    processor: ValueProcessor<TCondition, TNext, TRecord>
  ) {
    return new Pipe<TInput, Exclude<TOutput, TCondition> | TNext, TRecord>(
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

  ifNotNull<TNext>(
    processor: ValueProcessor<NonNullable<TOutput>, TNext, TRecord>
  ) {
    return this.if(
      (value): value is NonNullable<TOutput> =>
        value !== null && value !== undefined,
      processor
    );
  }

  match(): MatchBuilder<TInput, TOutput, never, TOutput, TRecord> {
    return new MatchBuilder(this.fn, []);
  }

  default(builder: () => TOutput): Pipe<TInput, NonNullable<TOutput>, TRecord> {
    return new Pipe<TInput, NonNullable<TOutput>, TRecord>(
      async (input, row) => {
        const result = await this.fn(input, row);
        if (isErr(result)) {
          return result;
        }
        if (result.value === null || result.value === undefined) {
          return ok(builder() as NonNullable<TOutput>);
        }
        return ok(result.value as NonNullable<TOutput>);
      }
    );
  }

  build(): ValueProcessor<TInput, TOutput, TRecord> {
    return this.fn;
  }
}
