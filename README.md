# [nisavid.io](https://nisavid.io)

My name is Ivan D Vasin. This is my website.

<!--toc:start-->

- [ℹ️ About This Site](#readme-about)
- [☑️ Features](#readme-features)
  - [🌐 Usability](#readme-usability)
  - [🌳 Robustness](#readme-robustness)
  - [⚡ Performance](#readme-performance)
  - [🎨 Aesthetics](#readme-aesthetics)
  - [🛡️ Security](#readme-security)
  - [📊 Analytics](#readme-analytics)

<!--toc:end-->

<a id="readme-about"></a>

## ℹ️ About This Site

This website is a [single-page application] written mostly in [**Elm**] with a
bit of [**TypeScript**], styled with [**Tailwind CSS**] and the [**Catppuccin**
color schemes], and built with [**Parcel**]. It is deployed on the
[**Firebase**] platform, using [**Firebase Hosting**] for web hosting and
[**Cloud Functions**] for [serverless] backend functionality.

<a id="readme-features"></a>

## ☑️ Features

<a id="readme-usability"></a>

### 🌐 Usability

Accessible, understandable, presentable, and operable across a wide range of
connection speeds, devices, physical interfaces, screen sizes, browsers, and
user ability impairments.

- Accessibility best-practices in [**HTML**][HTML accessibility] and
  [**CSS**/**JavaScript**][CSS/JavaScript accessibility], using [**ARIA**] as
  needed.

- [Responsive design] for good visual presentation on all screen sizes.

- [Client-side input validation] for immediate constraint checking and feedback.

- [Performance features](#readme-performance) for usability on low-end devices
  and network connections.

- [Keyboard navigability] for operability without a mouse or touchscreen.

- [**ARIA** semantics] for perceivability without a visual display.

- [**CSS** transpilation] for broad browser support.

<a id="readme-robustness"></a>

### 🌳 Robustness

Reliability, comprehensibility, maintainability, and extensibility.

- Primarily implemented in [**Elm**].

  - [**The Elm Architecture**] for managing state and data flow. All effects are
    explicitly represented and managed—none of the code produces side-effects.

  - A type system that guarantees [no runtime errors in practice].

  - [Pure functions] and [immutability] for consistent comprehensibility and
    unsurprising behavior.

  - [Custom types] and [explicit nullability] for [precisely defined variants]
    and exhaustive case handling, enabling design that [models application
    states as data structures], [makes impossible states impossible], and
    [avoids nonsensical handling of transient states].

  - [Helpful compile-time error messages] that are [beginner-friendly] and
    [include hints] for a pleasant and efficient developer experience and
    fearless refactoring.

- [**TypeScript**] for type-safe [**JavaScript**] code.

- Modern features of [**HTML**], [**CSS**], and [**JavaScript**].

- Automatic infrastructure provisioning via [**Firebase Hosting**] and [**Cloud
  Functions**].

<a id="readme-performance"></a>

### ⚡ Performance

Quickly, now!

- A [single-page application] for eliminating page loads.

- [Lazy virtual DOM updates] avoid building unnecessary virtual DOM nodes.

- Interactive and responsive elements leverage CSS features to obviate the need
  for JavaScript execution and DOM updates.

- [Fast DOM updates] and [optimized JavaScript assets] via [**Elm**].

- [Optimized asset bundling] via [**Parcel**].

- Fast content delivery via [**Cloudflare CDN**].

- Scalable infrastructure via [**Firebase Hosting**] and [**Cloud Functions**].

<a id="readme-aesthetics"></a>

### 🎨 Aesthetics

Good looks.

- A design system built from [utility classes] using [**Tailwind CSS**].

- [**Catppuccin** color schemes] for aesthetic [light and dark themes].

<a id="readme-security"></a>

### 🛡️ Security

Protection against a wide range of exploits.

- Against bots with [**Cloudflare Bot Fight Mode**], [**Firebase App Check**],
  and [**reCAPTCHA Enterprise**].

- Against distributed denial-of-service (DDoS) attacks with [**Cloudflare DDoS
  Protection**].

- Against DNS spoofing, DNS hijacking, DNS-based DDoS, and other [DNS attacks]
  via [**DNSSEC**] and [**Cloudflare DNS**].

- Against [email spoofing] via DNS [**SPF**], [**DKIM**], and [**DMARC**]
  records.

<a id="readme-analytics"></a>

### 📊 Analytics

Detailed analysis of performance and user interaction.

- [**Cloudflare Web Analytics**]

- [**Firebase Analytics**]

- [**Google Analytics**]

[**ARIA** semantics]:
  https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Techniques
[**ARIA**]:
  https://developer.mozilla.org/en-US/docs/Learn/Accessibility/WAI-ARIA_basics
[**CSS** transpilation]: https://parceljs.org/languages/css#transpilation
[**CSS**]: https://developer.mozilla.org/en-US/docs/Learn/CSS
[**Catppuccin** color schemes]: https://catppuccin.com
[**Cloud Functions**]: https://firebase.google.com/docs/functions
[**Cloudflare Bot Fight Mode**]:
  https://developers.cloudflare.com/bots/get-started/free
[**Cloudflare CDN**]:
  https://www.cloudflare.com/application-services/products/cdn
[**Cloudflare DDoS Protection**]:
  https://developers.cloudflare.com/ddos-protection
[**Cloudflare DNS**]:
  https://www.cloudflare.com/application-services/products/dns
[**Cloudflare Web Analytics**]: https://www.cloudflare.com/web-analytics
[**DKIM**]: https://www.cloudflare.com/learning/dns/dns-records/dns-dkim-record
[**DMARC**]:
  https://www.cloudflare.com/learning/dns/dns-records/dns-dmarc-record
[**DNSSEC**]: https://blog.cloudflare.com/dnssec-an-introduction
[**Elm**]: https://elm-lang.org
[**Firebase Analytics**]: https://firebase.google.com/docs/analytics
[**Firebase App Check**]: https://firebase.google.com/docs/app-check
[**Firebase Hosting**]: https://firebase.google.com/docs/hosting
[**Firebase**]: https://firebase.google.com
[**Google Analytics**]: https://marketingplatform.google.com/about/analytics
[**HTML**]: https://developer.mozilla.org/en-US/docs/Learn/HTML
[**JavaScript**]: https://developer.mozilla.org/en-US/docs/Learn/JavaScript
[**Parcel**]: https://parceljs.org
[**SPF**]: https://www.cloudflare.com/learning/dns/dns-records/dns-spf-record
[**Tailwind CSS**]: https://tailwindcss.com
[**The Elm Architecture**]: https://guide.elm-lang.org/architecture
[**TypeScript**]: https://typescriptlang.org
[**Web Vitals**]: https://web.dev/articles/vitals
[**reCAPTCHA Enterprise**]: https://cloud.google.com/security/products/recaptcha
[Accessibility]: https://developer.mozilla.org/en-US/docs/Web/Accessibility
[CSS/JavaScript accessibility]:
  https://developer.mozilla.org/en-US/docs/Learn/Accessibility/CSS_and_JavaScript
[Client-side input validation]:
  https://developer.mozilla.org/en-US/docs/Learn/Forms/Form_validation
[Custom types]: https://guide.elm-lang.org/types/custom_types
[DNS attacks]: https://www.cloudflare.com/learning/dns/dns-security#dns-attacks
[Fast DOM updates]: https://elm-lang.org/news/blazing-fast-html-round-two
[HTML accessibility]:
  https://developer.mozilla.org/en-US/docs/Learn/Accessibility/HTML
[Helpful compile-time error messages]:
  https://elm-lang.org/news/compiler-errors-for-humans
[Keyboard navigability]:
  https://developer.mozilla.org/en-US/docs/Web/Accessibility/Understanding_WCAG/Keyboard
[Lazy virtual DOM updates]: https://guide.elm-lang.org/optimization/lazy
[Optimized asset bundling]: https://parceljs.org/features/production
[Pure functions]:
  https://elmprogramming.com/pure-functions.html#benefits-of-pure-functions
[Responsive design]:
  https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design
[avoids nonsensical handling of transient states]:
  https://www.youtube.com/watch?v=NLcRzOyrH08
[beginner-friendly]: https://elm-lang.org/news/the-syntax-cliff
[email spoofing]: https://blog.cloudflare.com/tackling-email-spoofing
[explicit nullability]:
  https://guide.elm-lang.org/error_handling/maybe#aside-connection-to-null-references
[immutability]:
  https://elmprogramming.com/immutability.html#benefits-of-immutability
[include hints]: https://elm-lang.org/news/compilers-as-assistants
[light and dark themes]: https://web.dev/articles/prefers-color-scheme
[makes impossible states impossible]:
  https://www.youtube.com/watch?v=IcgmSRJHu_8
[models application states as data structures]:
  https://www.youtube.com/watch?v=x1FU3e0sT1I
[no runtime errors in practice]: https://guide.elm-lang.org/types
[optimized JavaScript assets]:
  https://elm-lang.org/news/small-assets-without-the-headache
[precisely defined variants]: https://guide.elm-lang.org/appendix/types_as_sets
[serverless]: https://cloud.google.com/discover/what-is-serverless-computing
[single-page application]: https://developer.mozilla.org/en-US/docs/Glossary/SPA
[utility classes]: https://tailwindcss.com/docs/utility-first
