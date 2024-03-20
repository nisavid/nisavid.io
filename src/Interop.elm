module Interop exposing
    ( VoidResult
    , Error(..), JsError(..), JsErrorInfo
    , callSendContactFormEmail, callSendContactFormEmailResult
    , checkValidity, checkValidityResult, CheckValidityResult, CheckValidityValue, CheckValidityError(..), CheckValidityErrorInfo
    , consoleError, consoleErrorSubst, consoleErrorValues, consoleErrorDecodeError, consoleErrorInteropError, consoleErrorCheckValidityError
    )

{-| Helpers for interoperating with JavaScript.


# Generic Helpers


## Results

@docs VoidResult


### Errors

@docs Error, JsError, JsErrorInfo


# Port-Specific Helpers

These functions encode and decode commands and subscriptions related
to the corresponding ports declared in [Interop.Ports](Interop-Ports).


## `callSendContactFormEmail`

@docs callSendContactFormEmail, callSendContactFormEmailResult


## `checkValidity`

@docs checkValidity, checkValidityResult, CheckValidityResult, CheckValidityValue, CheckValidityError, CheckValidityErrorInfo


## `consoleError`

@docs consoleError, consoleErrorSubst, consoleErrorValues, consoleErrorDecodeError, consoleErrorInteropError, consoleErrorCheckValidityError

-}

import Basics.Extra exposing (flip)
import Interop.Ports
import Json.Decode as Decode exposing (Value, decodeValue, field, keyValuePairs)
import Json.Decode.Extra as Decode exposing (optionalNullableField)
import Json.Encode as Encode
import List.Extra as List
import Maybe.Extra as Maybe
import Result.Extra as Result
import Validation.Interop exposing (ValidityState, validityStateDecoder)



-- GENERIC HELPERS | RESULTS


{-| The result of a port command that does not return a value.
-}
type alias VoidResult =
    Result Error ()


{-| Subscribe to the result of a port command that does not return a value.
-}
voidResult : ((Value -> msg) -> Sub msg) -> (VoidResult -> msg) -> Sub msg
voidResult port_ tagger =
    port_ <| tagger << decodeVoidResult



-- GENERIC HELPERS | RESULTS | DECODING


{-| Decode the result of a port command that does not return a value.
-}
decodeVoidResult : Value -> Result Error ()
decodeVoidResult =
    decodeValue voidResultDecoder >> Result.extract (Err << DecodeErr)


{-| Decoder for the result of a port command that does not return a value.
-}
voidResultDecoder : Decode.Decoder (Result Error ())
voidResultDecoder =
    field "success" Decode.bool
        |> Decode.andThen
            (\success ->
                if success then
                    Decode.succeed (Ok ())

                else
                    voidErrDecoder
            )



-- GENERIC HELPERS | RESULTS | ERRORS


{-| An interop error.

This type wraps errors that occur during interoperation with JavaScript.

An error that is passed from JavaScript to Elm is wrapped in a `JsErr`.
An error that occurs during decoding is wrapped in a `DecodeErr`.

-}
type Error
    = JsErr JsError
    | DecodeErr Decode.Error


{-| An error that occurred within JavaScript code.
-}
type JsError
    = JsError JsErrorInfo


{-| JavaScript error information.

  - `name`: The error [`name`].
  - `message`: The error [`message`].
  - `stack`: The error [`stack`] trace.
  - `cause`: The error [`cause`].
  - `properties`: Additional error properties passed in by the JavaScript
    error-handling code.

[`name`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/name "MDN · Error · name"
[`message`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/message "MDN · Error · message"
[`stack`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/stack "MDN · Error · stack"
[`cause`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause "MDN · Error · cause"

-}
type alias JsErrorInfo =
    { name : Maybe String
    , message : Maybe String
    , stack : Maybe String
    , cause : Maybe JsError
    , properties : List ( String, Value )
    }



-- GENERIC HELPERS | RESULTS | ERRORS | DECODING


{-| Decoder for the unsuccessful result of a port command that does not return
a value.

This decoder assumes that the JavaScript error handler for the port sends
an error object in the `error` field of the result.

-}
voidErrDecoder : Decode.Decoder (Result Error ())
voidErrDecoder =
    Decode.map (Err << JsErr) (field "error" jsErrorDecoder)


{-| Decoder for a JavaScript error.
-}
jsErrorDecoder : Decode.Decoder JsError
jsErrorDecoder =
    Decode.map5 JsErrorInfo
        (optionalNullableField "name" Decode.string)
        (optionalNullableField "message" Decode.string)
        (optionalNullableField "stack" Decode.string)
        (optionalNullableField "cause" <| Decode.lazy (\_ -> jsErrorDecoder))
        (keyValuePairs Decode.value
            |> Decode.map (List.filterNot (Tuple.first >> flip List.member [ "name", "message", "stack", "cause" ]))
        )
        |> Decode.map JsError



-- GENERIC HELPERS | RESULTS | ERRORS | REPRESENTATION


{-| Format a JavaScript error as a human-readable string.

The string includes the error name and message, if available.

-}
jsErrorToString : JsError -> String
jsErrorToString (JsError info) =
    let
        ( maybeName, maybeMessage, maybeCause ) =
            ( info.name, info.message, info.cause )
    in
    "JS "
        ++ (maybeName |> Maybe.withDefault "error")
        ++ (maybeMessage |> Maybe.unwrap "" ((++) ": "))
        ++ (maybeCause |> Maybe.unwrap "" ((++) "\n ↳ " << jsErrorToString))


{-| Convert a JavaScript error to a JSON object.

The object includes all the error properties passed in by the JavaScript
error-handling code, except `stack`.

-}
jsErrorToObject : JsError -> Value
jsErrorToObject (JsError { name, message, cause, properties }) =
    let
        optProp : String -> Maybe Value -> List ( String, Value )
        optProp propName maybeValue =
            maybeValue
                |> Maybe.unwrap [] (Tuple.pair propName >> List.singleton)
    in
    Encode.object <|
        optProp "name" (name |> Maybe.map Encode.string)
            ++ optProp "message" (message |> Maybe.map Encode.string)
            --++ optProp "stack" (stack |> Maybe.map Encode.string)
            ++ optProp "cause" (cause |> Maybe.map jsErrorToObject)
            ++ properties



-- PORT-SPECIFIC HELPERS | callSendContactFormEmail


{-| Call the `sendContactFormEmail` cloud function to send an email
from the contact form.
-}
callSendContactFormEmail :
    { name : String
    , email : String
    , subject : String
    , body : String
    }
    -> Cmd msg
callSendContactFormEmail { name, email, subject, body } =
    Interop.Ports.callSendContactFormEmail <|
        Encode.object
            [ ( "name", Encode.string name )
            , ( "email", Encode.string email )
            , ( "subject", Encode.string subject )
            , ( "body", Encode.string body )
            ]


{-| Subscribe to the result of a [`callSendContactFormEmail`] command.

[`callSendContactFormEmail`]: #callSendContactFormEmail

-}
callSendContactFormEmailResult : (VoidResult -> msg) -> Sub msg
callSendContactFormEmailResult =
    voidResult Interop.Ports.callSendContactFormEmailResult



-- PORT-SPECIFIC HELPERS | checkValidity


{-| Call the [`checkValidity()` method] of the form element
with the given ID.

[`checkValidity()` method]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/checkValidity "MDN · HTMLInputElement · checkValidity() method"

-}
checkValidity : String -> Cmd msg
checkValidity =
    Interop.Ports.checkValidity


{-| Subscribe to the result of a [`checkValidity`](#checkValidity) command.
-}
checkValidityResult : (CheckValidityResult -> msg) -> Sub msg
checkValidityResult tagger =
    Interop.Ports.checkValidityResult <| tagger << decodeCheckValidityResult


{-| The result of a [`checkValidity`](#checkValidity) command.
-}
type alias CheckValidityResult =
    Result CheckValidityError CheckValidityValue


{-| The successful result of a [`checkValidity`](#checkValidity) command.
-}
type alias CheckValidityValue =
    { id : String
    , validity : ValidityState
    }


{-| The unsuccessful result of a [`checkValidity`] command.

In case the JavaScript handler for the [`checkValidity`] command throws
an error, the error is wrapped in a `CheckValidityError`. If decoding
that value totally fails, the decoding error is wrapped
in a `CheckValidityErrorDecodeError`.

[`checkValidity`]: #checkValidity

-}
type CheckValidityError
    = CheckValidityError CheckValidityErrorInfo
    | CheckValidityErrorDecodeError Decode.Error


{-| Information about an error that occurred during the invocation
of a [`checkValidity`] command.

This includes the ID of the form element whose validity we tried to check.

[`checkValidity`]: #checkValidity

-}
type alias CheckValidityErrorInfo =
    { id : String
    , error : Error
    }


{-| Decode the result of a [`checkValidity`] command.

[`checkValidity`]: #checkValidity

-}
decodeCheckValidityResult : Value -> CheckValidityResult
decodeCheckValidityResult value =
    decodeValue checkValidityResultDecoder value
        |> Result.extract
            (\decodeError ->
                Err <|
                    let
                        idResult : Result Decode.Error String
                        idResult =
                            decodeValue (field "id" Decode.string) value
                    in
                    case idResult of
                        Ok id ->
                            CheckValidityError <| CheckValidityErrorInfo id <| DecodeErr decodeError

                        Err idDecodeError ->
                            CheckValidityErrorDecodeError idDecodeError
            )


{-| Decoder for the result of a [`checkValidity`] command.

[`checkValidity`]: #checkValidity

-}
checkValidityResultDecoder : Decode.Decoder CheckValidityResult
checkValidityResultDecoder =
    field "success" Decode.bool
        |> Decode.andThen
            (\success ->
                if success then
                    checkValidityOkDecoder

                else
                    checkValidityErrDecoder
            )


{-| Decoder for the successful result of a [`checkValidity`] command.

[`checkValidity`]: #checkValidity

-}
checkValidityOkDecoder : Decode.Decoder CheckValidityResult
checkValidityOkDecoder =
    Decode.map2 CheckValidityValue
        (field "id" Decode.string)
        (field "validity" validityStateDecoder)
        |> Decode.map Ok


{-| Decoder for the unsuccessful result of a [`checkValidity`] command.

[`checkValidity`]: #checkValidity

-}
checkValidityErrDecoder : Decode.Decoder CheckValidityResult
checkValidityErrDecoder =
    Decode.map2 CheckValidityErrorInfo
        (field "id" Decode.string)
        (field "error" (jsErrorDecoder |> Decode.map JsErr))
        |> Decode.map CheckValidityError
        |> Decode.map Err



-- PORT-SPECIFIC HELPERS | consoleError


{-| Log an error message to the console.
-}
consoleError : String -> Cmd msg
consoleError message =
    consoleErrorSubst message []


{-| Log an error message to the console using a format string and a list of
substitute strings.

See the [MDN documentation] for details on the format string and supported
substitutions.

[MDN documentation]: https://developer.mozilla.org/en-US/docs/Web/API/console#using_string_substitutions "MDN · console · Using string substitutions"

-}
consoleErrorSubst : String -> List String -> Cmd msg
consoleErrorSubst message substitutes =
    Interop.Ports.consoleError <| Encode.list Encode.string <| message :: substitutes


{-| Log an error message to the console using an arbitrary list of values.
-}
consoleErrorValues : List Value -> Cmd msg
consoleErrorValues values =
    Interop.Ports.consoleError <| Encode.list identity values


{-| Log a [`Json.Decode.Error`] to the console.

[`Json.Decode.Error`]: /packages/elm/json/latest/Json-Decode#Error "elm/json · Json.Decode.Error"

-}
consoleErrorDecodeError : Decode.Error -> Cmd msg
consoleErrorDecodeError error =
    consoleError <| Decode.errorToString error


{-| Log an interop [`Error`](#Error) to the console.
-}
consoleErrorInteropError : Error -> Cmd msg
consoleErrorInteropError error =
    case error of
        JsErr jsError ->
            consoleErrorValues
                [ Encode.string <| jsErrorToString jsError
                , jsErrorToObject jsError
                ]

        DecodeErr decodeError ->
            consoleErrorDecodeError decodeError


{-| Log a [`CheckValidityError`](#CheckValidityError) to the console.
-}
consoleErrorCheckValidityError : CheckValidityError -> Cmd msg
consoleErrorCheckValidityError error =
    case error of
        CheckValidityError info ->
            consoleErrorValues <|
                (Encode.string <|
                    "checkValidity("
                        ++ info.id
                        ++ "):\n"
                        ++ (case info.error of
                                JsErr jsError ->
                                    jsErrorToString jsError

                                DecodeErr decodeError ->
                                    Decode.errorToString decodeError
                           )
                )
                    :: (case info.error of
                            JsErr jsError ->
                                [ jsErrorToObject jsError ]

                            DecodeErr _ ->
                                []
                       )

        CheckValidityErrorDecodeError decodeError ->
            consoleErrorDecodeError decodeError
