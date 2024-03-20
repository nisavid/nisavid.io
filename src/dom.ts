/**
 * Interface with the Document Object Model (DOM).
 */

import { q } from "./formatting.js";

/**
 * Define custom DOM properties.
 */
export function defineProperties() {
  for (
    const class_ of [
      HTMLButtonElement,
      HTMLInputElement,
      HTMLSelectElement,
      HTMLTextAreaElement,
    ]
  ) {
    if (!("customValidity" in class_.prototype)) {
      Object.defineProperty(class_.prototype, "customValidity", {
        get() {
          return this.validationMessage;
        },

        set(value) {
          this.setCustomValidity(value);
        },
      });
    }
  }
}

/**
 * Call the
 * {@link HTMLInputElement.prototype.checkValidity | `checkValidity()` method}
 * of the element with the given ID.
 * @param id - The ID of the element to check.
 * @returns
 *   A promise that resolves to the the element's
 *   {@link HTMLInputElement.prototype.validity | `validity`}.
 */
export function checkValidity(id: string): Promise<ValidityState> {
  return new Promise((resolve, reject) => {
    const element = document.getElementById(id);
    try {
      if (element == null) {
        throw new Error(q`Element with ID ${id} not found`);
      }
      if (
        !("checkValidity" in element) ||
        typeof element.checkValidity !== "function"
      ) {
        throw new Error(
          q`Element with ID ${id} does not have a checkValidity method`,
        );
      }
      if (
        !("validity" in element) ||
        !(element.validity instanceof ValidityState)
      ) {
        throw new Error(
          q`Element with ID ${id} does not have a validity property`,
        );
      }

      element.checkValidity();

      resolve(element.validity);
    } catch (exc) {
      reject(exc);
    }
  });
}
