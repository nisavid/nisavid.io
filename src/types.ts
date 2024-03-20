/**
 * Generic types.
 */

/**
 * Construct a tuple type from all but the first element of a given tuple type.
 * @param T - The input tuple type.
 */
export type Shift<T extends any[]> = ((...args: T) => any) extends
  ((first: any, ...rest: infer R) => any) ? R : never;
