-- TODO: Improve this API and extract it to a package


module Validation exposing
    ( Validity(..)
    , Constraint(..)
    , StandardConstraint(..), StandardSyntax(..), stdConstraintToAttr
    , CustomConstraint(..), customConstraintIsSatisfied
    , ConstraintViolation(..), constraintViolationErrorMessage
    )

{-| This module helps with defining and validating constraints for HTML form
elements in a way that integrates with the browser's built-in validation
facilities. It provides helpers for interoperating with JavaScript to access
the HTML constraint validation API in order to integrate with the constraints
and validity states that are managed by the browser.


# HTML Standard

The HTML Standard [defines][HTML Constraints] several browser behaviors and API
features that are employed here:

  - A set of [form element attributes] (`required`, `type`, `maxlength`,
    and others) that correspond to standard constraints checked by the browser
    when validating the user's interaction (or lack thereof)
    with the form element.

  - Built-in browser implementations of the standard constraint checks.
    These are triggered automatically by the browser at certain times and can
    also be triggered by the application via an element's [`checkValidity()`
    method].

  - An API for setting a custom validity message on a form element.
    The [`setCustomValidity()` method] can be used to customize the message
    displayed to the user when the standard constraints are violated. It can
    also be used to notify both the browser and the user of the violation
    of custom constraints that are defined and implemented by the application.

  - A set of validity states for each form element, corresponding to violations
    of both standard and custom constraints, that are set by the browser
    whenever the element is validated and can be queried via the element's
    [`validity` property] as a [`ValidityState` object].

  - A UI mechanism (typically presented visually as a tooltip) for displaying
    a validity message (i.e. constraint violation) to the user when a form
    cannot be submitted due to failing validation. This is triggered
    automatically by the browser at certain times and can also be triggered
    by the application via the element's [`reportValidity()` method].

[HTML Constraints]: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#constraints "HTML · Forms · Constraints"
[form element attributes]: https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation#intrinsic_and_basic_constraints "MDN · Constraint validation · Intrinsic and basic constraints"
[`checkValidity()` method]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/checkValidity "MDN · HTMLInputElement · checkValidity() method"
[`setCustomValidity()` method]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/setCustomValidity "MDN · HTMLInputElement · setCustomValidity() method"
[`validity` property]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement#validity "MDN · HTMLInputElement · validity property"
[`ValidityState` object]: https://developer.mozilla.org/en-US/docs/Web/API/ValidityState "MDN · ValidityState"
[`reportValidity()` method]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/reportValidity "MDN · HTMLInputElement · reportValidity() method"

This module assists in integrating with these features. The [`Constraint` type]
provides a uniform representation of both standard and custom constraints.
The [`ConstraintViolation` type] provides a uniform representation
of violations thereof. The [`Validation.Interop` module] provides helpers
for interoperating with the browser's constraint validation API.

[`Constraint` type]: #Constraint
[`ConstraintViolation` type]: #ConstraintViolation
[`Validation.Interop` module]: Validation-Interop


# Validity

@docs Validity


# Constraints

@docs Constraint


## Standard Constraints

@docs StandardConstraint, StandardSyntax, stdConstraintToAttr


## Custom Constraints

@docs CustomConstraint, customConstraintIsSatisfied


# Constraint Violations

@docs ConstraintViolation, constraintViolationErrorMessage

-}

import Html exposing (Attribute)
import Html.Attributes as Attr
    exposing
        ( maxlength
        , minlength
        , pattern
        , required
        , step
        , type_
        )
import Validate exposing (isBlank, isValidEmail)



-- VALIDITY


{-| The validity of a form element.

This represents the combined result of validating the form element
via the browser's built-in checks and the application's custom checks.
If it passed all checks, then it's `Valid`. Otherwise, it's `Invalid`
with a list of constraint violations.

-}
type Validity
    = Valid
    | Invalid (List ConstraintViolation)



-- CONSTRAINTS


{-| A validation constraint for a form element.

This may be a constraint defined by the HTML Standard and implemented
by the browser, or it may be a custom constraint defined and implemented
by the application.

-}
type Constraint
    = StandardConstraint StandardConstraint
    | CustomConstraint CustomConstraint


{-| A validation constraint defined by the HTML Standard and implemented
by the browser.

See the [HTML Standard definitions] or the [MDN documentation] for details.

[HTML Standard definitions]: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#definitions "HTML · Forms · Constraints · Definitions"
[MDN documentation]: https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation#intrinsic_and_basic_constraints "MDN · Constraint validation · Intrinsic and basic constraints"

-}
type StandardConstraint
    = Required
    | StandardSyntax StandardSyntax
    | Pattern String
    | MaxLength Int
    | MinLength Int
    | Max String
    | Min String
    | Step String


{-| A standard syntax for a form element's value.

These syntaxes are validated by the browser.

Strictly speaking, the HTML Standard only refers to the email and URL types
as [“syntaxes”]. These correspond to text input elements that enforce
a particular syntax on the user's input. When the user enters an invalid
string into such an element and the browser validates it, both the element's
user-entered input and the element's DOM [`value`] remain as-is,
and the element's [`validity`] indicates a `typeMismatch`.

The HTML Standard refers to the other syntaxes as [“microsyntaxes”]. Browsers
and applications are at liberty to present each of these types of input
elements using any knid of UI widget they choose to implement for it. For any
of these syntax types (e.g. date), some browsers may represent the form element
with a UI that makes invalid inputs impossible (e.g. a date picker without
freeform input), whereas others may present a UI that leaves open
the possibility of an invalid input (e.g. a date picker with freeform input
or a simple text box). Any UI that allows freeform input into such fields
should attempt to sanitize and convert the user's input to the standard
microsyntax before assigning the result as the element's new [`value`];
browsers implement this in their built-in UIs for these elements. If the user's
input cannot be converted, then the user-visible input in the UI may remain
as-is, but the element's DOM [`value`] is cleared, and the element's
[`validity`] indicates a `badInput`.

[“syntaxes”]: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#suffering-from-a-type-mismatch "HTML · Forms · Constraints · Definitions · Suffering from a type mismatch"
[“microsyntaxes”]: https://html.spec.whatwg.org/multipage/common-microsyntaxes.html "HTML · Common microsyntaxes"
[`value`]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement#value "MDN · HTMLInputElement · value property"
[`validity`]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement#validity "MDN · HTMLInputElement · validity property"

-}
type StandardSyntax
    = -- Syntax types for which violations are represented
      -- by the `typeMismatch` validity state flag
      EmailSyntax
    | URLSyntax
      -- Syntax types for which violations are represented
      -- by the `badInput` validity state flag
    | ColorSyntax
    | DateSyntax
    | DateTimeLocalSyntax
    | MonthSyntax
    | NumberSyntax
    | RangeSyntax
    | TimeSyntax
    | WeekSyntax


{-| Represent a standard constraint as an HTML attribute that declares it.
-}
stdConstraintToAttr : StandardConstraint -> Attribute msg
stdConstraintToAttr constraint =
    case constraint of
        Required ->
            required True

        StandardSyntax syntax ->
            type_ <| stdSyntaxToInputType syntax

        Pattern pattern_ ->
            pattern pattern_

        MaxLength length ->
            maxlength length

        MinLength length ->
            minlength length

        Max value ->
            Attr.max value

        Min value ->
            Attr.min value

        Step value ->
            step value


stdSyntaxToInputType : StandardSyntax -> String
stdSyntaxToInputType syntax =
    case syntax of
        EmailSyntax ->
            "email"

        URLSyntax ->
            "url"

        ColorSyntax ->
            "color"

        DateSyntax ->
            "date"

        DateTimeLocalSyntax ->
            "datetime-local"

        MonthSyntax ->
            "month"

        NumberSyntax ->
            "number"

        RangeSyntax ->
            "range"

        TimeSyntax ->
            "time"

        WeekSyntax ->
            "week"


{-| A non-standard validation constraint implemented by this module.

  - `NotBlank`: The value must contain non-whitespace characters.

  - `ValidEmail`: The value must be a valid email address with a domain that
    includes a TLD.

-}
type CustomConstraint
    = NotBlank
    | ValidEmail


{-| Check if a custom constraint is satisfied by a value.
-}
customConstraintIsSatisfied : CustomConstraint -> String -> Bool
customConstraintIsSatisfied constraint value =
    case constraint of
        NotBlank ->
            not <| isBlank value

        ValidEmail ->
            isValidEmail value



-- CONSTRAINT VIOLATIONS


{-| A violation of a validation constraint.
-}
type ConstraintViolation
    = ConstraintViolation Constraint


{-| A user-friendly error message for a constraint violation.
-}
constraintViolationErrorMessage : ConstraintViolation -> String
constraintViolationErrorMessage (ConstraintViolation constraint) =
    case constraint of
        StandardConstraint Required ->
            "This field is required."

        StandardConstraint (StandardSyntax syntax) ->
            case syntax of
                EmailSyntax ->
                    "Please enter a valid email address."

                URLSyntax ->
                    "Please enter a valid URL."

                ColorSyntax ->
                    "Please enter a valid color."

                DateSyntax ->
                    "Please enter a valid date."

                DateTimeLocalSyntax ->
                    "Please enter a valid date and time."

                MonthSyntax ->
                    "Please enter a valid month."

                NumberSyntax ->
                    "Please enter a valid number."

                RangeSyntax ->
                    "Please enter a valid range."

                TimeSyntax ->
                    "Please enter a valid time."

                WeekSyntax ->
                    "Please enter a valid week."

        StandardConstraint (Pattern pattern) ->
            -- TODO: Implement a way to define and present a user-friendly pattern description
            "Please enter a value that matches the following pattern: " ++ pattern

        StandardConstraint (MaxLength length) ->
            "Please enter a value that is no longer than " ++ String.fromInt length ++ " characters."

        StandardConstraint (MinLength length) ->
            "Please enter a value that is no shorter than " ++ String.fromInt length ++ " characters."

        StandardConstraint (Max value) ->
            "Please enter a value that is less than or equal to " ++ value ++ "."

        StandardConstraint (Min value) ->
            "Please enter a value that is greater than or equal to " ++ value ++ "."

        StandardConstraint (Step value) ->
            "Please enter a value that is a multiple of " ++ value ++ "."

        CustomConstraint NotBlank ->
            "This field cannot be blank."

        CustomConstraint ValidEmail ->
            "Please enter a valid email address."
