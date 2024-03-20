port module Interop.Ports exposing
    ( checkValidity, checkValidityResult
    , consoleError
    , storeState, storedStateChanged
    , deviceInfoChanged
    , callSendContactFormEmail, callSendContactFormEmailResult
    )

{-| JavaScript ports.


# Common Ports

These ports are applicable to multiple pages and components.

@docs checkValidity, checkValidityResult
@docs consoleError


# Global Ports

These ports are applicable to the application's global state and components.

@docs storeState, storedStateChanged
@docs deviceInfoChanged


# Bespoke Ports

These ports are applicable to specific pages or components.

@docs callSendContactFormEmail, callSendContactFormEmailResult

-}

import Json.Encode exposing (Value)



-- COMMON


{-| Call the [`checkValidity()` method] of a form element.

The argument should be the ID of the form element.

[`checkValidity()` method]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/checkValidity "MDN · HTMLInputElement · checkValidity() method"

-}
port checkValidity : String -> Cmd msg


{-| Subscribe to the results of [`checkValidity`] commands.

The argument should implement the following `Result` interface:

```typescript
type Result = OkResult | ErrResult;
interface OkResult {
  success: true;
  id: string;
  validity: ValidityState;
}
interface ErrResult {
  success: false;
  id: string;
  error: ErrorObject;
}
interface ErrorObject {
  name?: string | null;
  message?: string | null;
  stack?: string | null;
  cause?: ErrorObject | null;
  [key: string]: any;
}
```

[`checkValidity`]: #checkValidity

-}
port checkValidityResult : (Value -> msg) -> Sub msg


{-| Log an error message to the console.

The argument should be an array of arguments that shall be spread into a call
to [`console.error()`].

[`console.error()`]: https://developer.mozilla.org/en-US/docs/Web/API/console/error_static "MDN · console: error() static method"

-}
port consoleError : Value -> Cmd msg



-- GLOBAL


{-| Store the application's persistent state.

The argument should implement the following `Arg` interface:

```typescript
type Arg = JustArg | null;
interface JustArg {
  settings: {
    theme: "system" | "light" | "dark";
  };
}
```

-}
port storeState : Value -> Cmd msg


{-| Subscribe to external changes in the application's persistent state.

The argument should implement the following `Arg` interface:

```typescript
type Arg = JustArg | null;
interface JustArg {
  settings: {
    theme: "system" | "light" | "dark";
  };
}
```

-}
port storedStateChanged : (Value -> msg) -> Sub msg


{-| Subscribe to changes in the user device information.

The argument should implement the following `DeviceInfo` interface:

```typescript
interface DeviceInfo {
  prefersColorScheme?: string;
}
```

-}
port deviceInfoChanged : (Value -> msg) -> Sub msg



-- BESPOKE


{-| Call the `sendContactFormEmail` cloud function to send an email
from the contact form.

The argument should implement the following `Arg` interface:

```typescript
/**
 * @param name - The name of the sender.
 * @param email - The email address of the sender.
 * @param subject - The subject of the email.
 * @param body - The body of the email.
 */
interface Arg {
  name: string;
  email: string;
  subject: string;
  body: string;
}
```

-}
port callSendContactFormEmail : Value -> Cmd msg


{-| Subscribe to the results of [`callSendContactFormEmail`] commands.

The argument should implement the following `Result` interface:

```typescript
type Result = OkResult | ErrResult;
interface OkResult {
  success: true;
}
interface ErrResult {
  success: false;
  error: ErrorObject;
}
interface ErrorObject {
  name?: string | null;
  message?: string | null;
  stack?: string | null;
  cause?: ErrorObject | null;
  [key: string]: any;
}
```

[`callSendContactFormEmail`]: #callSendContactFormEmail

-}
port callSendContactFormEmailResult : (Value -> msg) -> Sub msg
