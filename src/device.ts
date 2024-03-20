/**
 * Interface with the user's device.
 */

const prefersLightColorSchemeMediaQuery = window.matchMedia(
  "(prefers-color-scheme: light)",
);
const prefersDarkColorSchemeMediaQuery = window.matchMedia(
  "(prefers-color-scheme: dark)",
);

/**
 * Information about the user's device.
 */
export interface Info {
  prefersColorScheme: "light" | "dark" | null;
}

/**
 * Get information about the user's device.
 * @returns Information about the user's device.
 */
export function getInfo(): Info {
  /**
   * Get the device's preferred color scheme.
   * @returns The device's preferred color scheme.
   */
  function getPrefersColorScheme(): "light" | "dark" | null {
    if (prefersLightColorSchemeMediaQuery.matches) {
      return "light";
    } else if (prefersDarkColorSchemeMediaQuery.matches) {
      return "dark";
    } else {
      return null;
    }
  }

  return {
    prefersColorScheme: getPrefersColorScheme(),
  };
}

/**
 * Call a callback when the device's information changes.
 * @param callback - The callback to call when the device's information changes.
 */
export function onInfoChange(callback: (deviceInfo: Info) => any) {
  /**
   * Call the callback with the device information.
   */
  function callbackWithInfo() {
    callback(getInfo());
  }

  prefersLightColorSchemeMediaQuery.addEventListener(
    "change",
    callbackWithInfo,
  );
  prefersDarkColorSchemeMediaQuery.addEventListener("change", callbackWithInfo);
}
