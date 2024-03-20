module Validation.Interop exposing
    ( ValidityState, validityStateDecoder, constraintViolationsFromValidityState
    , customValidity
    )

{-| This module provides helpers for interoperating with the browser's
constraint validation API.


# Validity State

@docs ValidityState, validityStateDecoder, constraintViolationsFromValidityState


# Custom Validity

@docs customValidity

-}

import Html exposing (Attribute)
import Html.Attributes.Extra exposing (stringProperty)
import Json.Decode as Decode exposing (Decoder)
import Json.Decode.Pipeline as Decode
import Validation
    exposing
        ( Constraint(..)
        , ConstraintViolation(..)
        , StandardConstraint(..)
        , StandardSyntax(..)
        )



-- VALIDITY STATE


{-| A form element's validity state.

This type is a direct representation of the HTML [`ValidityState` interface],
which is implemented by the object that is returned by any form element's
[`validity` property].

[`ValidityState` interface]: https://developer.mozilla.org/en-US/docs/Web/API/ValidityState "MDN · ValidityState"
[`validity` property]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement#validity "MDN · HTMLInputElement · validity property"

-}
type alias ValidityState =
    { valueMissing : Bool
    , typeMismatch : Bool
    , patternMismatch : Bool
    , tooLong : Bool
    , tooShort : Bool
    , rangeUnderflow : Bool
    , rangeOverflow : Bool
    , stepMismatch : Bool
    , badInput : Bool
    , customError : Bool
    , valid : Bool
    }


{-| Decode a [`ValidityState`](#ValidityState) from JSON.
-}
validityStateDecoder : Decoder ValidityState
validityStateDecoder =
    Decode.succeed ValidityState
        |> Decode.optional "valueMissing" Decode.bool False
        |> Decode.optional "typeMismatch" Decode.bool False
        |> Decode.optional "patternMismatch" Decode.bool False
        |> Decode.optional "tooLong" Decode.bool False
        |> Decode.optional "tooShort" Decode.bool False
        |> Decode.optional "rangeUnderflow" Decode.bool False
        |> Decode.optional "rangeOverflow" Decode.bool False
        |> Decode.optional "stepMismatch" Decode.bool False
        |> Decode.optional "badInput" Decode.bool False
        |> Decode.optional "customError" Decode.bool False
        |> Decode.optional "valid" Decode.bool False


{-| Convert a [`ValidityState`] to a list of [`ConstraintViolation`]s.

[`ValidityState`]: #ValidityState
[`ConstraintViolation`]: Validation#ConstraintViolation

-}
constraintViolationsFromValidityState : List Constraint -> ValidityState -> List ConstraintViolation
constraintViolationsFromValidityState constraints validityState =
    constraints
        |> List.map
            (\constraint ->
                ( ConstraintViolation constraint
                , case constraint of
                    StandardConstraint Required ->
                        validityState.valueMissing

                    StandardConstraint (StandardSyntax syntax) ->
                        case syntax of
                            EmailSyntax ->
                                validityState.typeMismatch

                            URLSyntax ->
                                validityState.typeMismatch

                            _ ->
                                validityState.badInput

                    StandardConstraint (Pattern _) ->
                        validityState.patternMismatch

                    StandardConstraint (MaxLength _) ->
                        validityState.tooLong

                    StandardConstraint (MinLength _) ->
                        validityState.tooShort

                    StandardConstraint (Min _) ->
                        validityState.rangeUnderflow

                    StandardConstraint (Max _) ->
                        validityState.rangeOverflow

                    StandardConstraint (Step _) ->
                        validityState.stepMismatch

                    CustomConstraint _ ->
                        False
                )
            )
        |> List.filter Tuple.second
        |> List.map Tuple.first



-- CUSTOM VALIDITY


{-| Set a custom validity message on an input element.

This returns an [`Html.Attribute`] that sets the element's `customValidity`
property. That's not a standard property, but it can be defined in JavaScript
like this:

```javascript
for (const class_ of [
  HTMLButtonElement,
  HTMLInputElement,
  HTMLSelectElement,
  HTMLTextAreaElement,
]) {
  Object.defineProperty(class_.prototype, "customValidity", {
    get() {
      return this.validationMessage;
    },

    set(value) {
      this.setCustomValidity(value);
    },
  });
}
```

[`Html.Attribute`]: /packages/elm/html/latest/Html#Attribute "elm/html · Html.Attribute"

-}
customValidity : String -> Attribute msg
customValidity =
    stringProperty "customValidity"
