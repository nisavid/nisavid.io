/**
 * Persistent storage.
 */

import { stateStorageKey as stateKey } from "./config.js";
import { ValidationError } from "./errors.js";
import { q } from "./formatting.js";

/**
 * Persistent state that may be stored in local storage.
 */
export interface PersistentState {
  /**
   * User-configurable settings.
   */
  settings: Settings;
}

/**
 * User-configurable settings.
 */
export interface Settings {
  /**
   * The visual theme.
   */
  theme: "system" | "light" | "dark";
}

/**
 * Validate the given value as a `PersistentState`.
 * @param {unknown} value - The value to validate.
 * @returns {PersistentState} The validated value.
 * @throws {ValidationError}
 *   If the value is not a valid `PersistentState`.
 */
function validatePersistentState(value: unknown): PersistentState {
  if (
    value !== null &&
    typeof value === "object" &&
    "settings" in value &&
    value.settings !== null &&
    typeof value.settings === "object" &&
    "theme" in value.settings &&
    (value.settings.theme === "system" ||
      value.settings.theme === "light" ||
      value.settings.theme === "dark")
  ) {
    return value as PersistentState;
  } else {
    throw new ValidationError("Invalid persistent state", value);
  }
}

/**
 * Determine whether the given storage type is available.
 * @param {"localStorage" | "sessionStorage"} type - The type of storage to check.
 * @returns {boolean} `true` if the storage `type` is available, `false` otherwise.
 */
export function isAvailable(type: "localStorage" | "sessionStorage"): boolean {
  const storage = window[type];
  const x = "__storage_test__";
  try {
    storage.setItem(x, x);
    storage.removeItem(x);
    return true;
  } catch (exc) {
    return (
      exc instanceof DOMException &&
      (exc.name === "QuotaExceededError" ||
        exc.name === "NS_ERROR_DOM_QUOTA_REACHED") &&
      storage?.length !== 0
    );
  }
}

/**
 * Retrieve the persistent state from local storage.
 * @returns {PersistentState | null}
 *   The persistent state from local storage if it is available;
 *   `null` otherwise.
 */
export function getState(): PersistentState | null {
  if (isAvailable("localStorage")) {
    try {
      const stateJson = window.localStorage.getItem(stateKey);
      if (stateJson != null) {
        try {
          return validatePersistentState(JSON.parse(stateJson));
        } catch (exc) {
          console.error(
            q`Invalid persistent state in local storage at key ${stateKey}:`,
            exc instanceof ValidationError ? exc.value : stateJson,
            "\n",
            exc,
          );
        }
      }
    } catch (exc) {
      console.error(
        q`Cannot retrieve persistent state from local storage at key ${stateKey}:`,
        "\n",
        exc,
      );
    }
  }
  return null;
}

/**
 * Store the given persistent state in local storage.
 * @param {PersistentState | null} state - The persistent state to store.
 */
export function setState(state: PersistentState | null): void {
  try {
    if (state === null) {
      window.localStorage.removeItem(stateKey);
    } else {
      window.localStorage.setItem(stateKey, JSON.stringify(state));
    }
  } catch (exc) {
    console.error(
      q`Cannot store persistent state in local storage at key ${stateKey}:`,
      state,
      "\n",
      exc,
    );
  }
}

/**
 * Register a callback to be invoked on changes to the stored persistent state.
 * @param {(state: PersistentState | null) => void} callback - The callback to register.
 */
export function onStateChange(
  callback: (state: PersistentState | null) => void,
) {
  window.addEventListener(
    "storage",
    function (event) {
      if (event.storageArea === window.localStorage && event.key === stateKey) {
        let newValue: PersistentState | null = null;
        try {
          newValue =
            event.newValue != null
              ? validatePersistentState(JSON.parse(event.newValue))
              : null;
        } catch (exc) {
          console.error(
            q`Invalid persistent state in local storage at key ${stateKey}:`,
            exc instanceof ValidationError ? exc.value : event.newValue,
            "\n",
            exc,
          );
          return;
        }

        callback(newValue);
      }
    },
    false,
  );
}
