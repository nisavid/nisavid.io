/**
 * Formatting.
 */

/**
 * A tag function that safely quotes all interpolated values.
 * @param strings - The string parts of the template literal.
 * @param values - The interpolated values.
 * @returns The resulting string.
 */
export function q(strings: TemplateStringsArray, ...values: any[]): string {
  return strings.reduce((acc, curr, i) => {
    acc += curr;
    if (i < values.length) {
      acc += JSON.stringify(values[i]);
    }
    return acc;
  }, "");
}
