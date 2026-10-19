/**
 * Formatting.
 */

/**
 * A tag function that safely quotes all interpolated values.
 * @param {TemplateStringsArray} strings - The string parts of the template literal.
 * @param {...unknown} values - The interpolated values.
 * @returns {string} The resulting string.
 */
export function q(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((acc, curr, i) => {
    acc += curr;
    if (i < values.length) {
      acc += JSON.stringify(values[i]);
    }
    return acc;
  }, "");
}
