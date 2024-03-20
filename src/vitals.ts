/**
 * Web Vitals.
 * @see {@link https://web.dev/articles/vitals/ | Web Vitals}
 */

import {
  CLSMetricWithAttribution,
  FIDMetricWithAttribution,
  INPMetricWithAttribution,
  LCPMetricWithAttribution,
  onCLS,
  onFID,
  onINP,
  onLCP,
} from "web-vitals/attribution";

import * as Analytics from "./firebase/analytics.js";

/**
 * Log a Web Vital to Google Analytics.
 * @param metric - A {@link https://github.com/GoogleChrome/web-vitals} metric.
 * @see https://web.dev/vitals-field-measurement-best-practices/
 */
function log(
  { name, delta, value, id, attribution }:
    | CLSMetricWithAttribution
    | FIDMetricWithAttribution
    | INPMetricWithAttribution
    | LCPMetricWithAttribution,
) {
  const eventParams: Record<string, any> = {
    event_category: "Web Vitals",
    // Use a non-interaction event to avoid affecting bounce rate
    non_interaction: true,
    // Built-in params:
    value: delta, // Use `delta` so the value can be summed
    // Custom params:
    metric_id: id, // Needed to aggregate events
    metric_value: value, // Value for querying in BQ
    metric_delta: delta, // Delta for querying in BQ
  };

  switch (name) {
    case "CLS":
      eventParams.debug_target = attribution.largestShiftTarget;
      break;
    case "FID":
      eventParams.debug_target = attribution.eventTarget;
      break;
    case "INP":
      eventParams.debug_target = attribution.eventTarget;
      break;
    case "LCP":
      eventParams.debug_target = attribution.element;
      break;
  }

  Analytics.logEvent(name, eventParams);
}

/**
 * Register Web Vitals handlers.
 */
export function registerHandlers() {
  [onCLS, onFID, onINP, onLCP].forEach((onVital) => {
    switch (process.env.NODE_ENV) {
      case "production":
        onVital(log);
        break;
      case "development":
        onVital(console.log);
        break;
    }
  });
}
