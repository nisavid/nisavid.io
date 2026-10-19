/**
 * Generic types.
 */

/**
 * Construct a tuple type from all but the first element of a given tuple type.
 * @param T - The input tuple type.
 */
export type Shift<T extends unknown[]> = ((...args: T) => unknown) extends (
  first: never,
  ...rest: infer Rest
) => unknown
  ? Rest
  : never;
