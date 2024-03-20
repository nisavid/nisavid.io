module Effect exposing
    ( Effect, map
    , none, withNone, batch
    , replaceUrl, pushUrl, loadUrl
    , focusNode, replaceTheme, scrollToTop
    , callSendContactFormEmail
    , checkValidity
    , consoleError, consoleErrorSubst, consoleErrorValues, consoleErrorDecodeError, consoleErrorInteropError, consoleErrorCheckValidityError
    , Model, MainInitFn, application
    )

{-| Application effects.

Effects represent the side effects that can be produced by all the `init`
and `update` functions in the application. They can represent commands
to the Elm runtime or changes to global state. The [`Effect`] type generalizes
and subsumes the [`Cmd`] type.

The implementation here is inspired by the one found
in [dmy/elm-realworld-example-app].

[`Effect`]: #Effect
[`Cmd`]: /packages/elm/core/latest/Platform-Cmd#Cmd "elm/core · Cmd"
[dmy/elm-realworld-example-app]: https://github.com/dmy/elm-realworld-example-app "GitHub · dmy/elm-realworld-example-app"


# Effects

@docs Effect, map


## Generic Effects

@docs none, withNone, batch


## Navigation Effects

@docs replaceUrl, pushUrl, loadUrl


## Common Effects

@docs focusNode, replaceTheme, scrollToTop


## JavaScript Interoperation Effects

@docs callSendContactFormEmail
@docs checkValidity
@docs consoleError, consoleErrorSubst, consoleErrorValues, consoleErrorDecodeError, consoleErrorInteropError, consoleErrorCheckValidityError


# Application

@docs Model, MainInitFn, application

-}

import Basics.Extra exposing (flip)
import Browser
import Browser.Dom as Dom
import Browser.Navigation as Nav
import Device
import Env exposing (Env)
import Interop
import Json.Decode as Decode
import Route exposing (Route)
import Session exposing (Session)
import Task exposing (attempt)
import Theme exposing (Theme)
import Url exposing (Url)



-- EFFECTS


{-| An effect.
-}
type Effect msg
    = -- Generic
      None
    | Batch (List (Effect msg))
      -- Navigation
    | ReplaceUrl Route
    | PushUrl Url
    | LoadUrl String
      -- Session
    | ReplaceSession Session
      -- Common
    | Focus String
    | ReplaceTheme Theme
    | ScrollToTop
      -- Interop
    | CallSendContactFormEmail { name : String, email : String, subject : String, body : String }
    | CheckValidity String
    | ConsoleError String
    | ConsoleErrorSubst String (List String)
    | ConsoleErrorValues (List Decode.Value)
    | ConsoleErrorDecodeError Decode.Error
    | ConsoleErrorInteropError Interop.Error
    | ConsoleErrorCheckValidityError Interop.CheckValidityError


{-| Transform the messages produced by an effect.

This is analogous to [`Cmd.map`].

[`Cmd.map`]: /packages/elm/core/latest/Platform-Cmd#map "elm/core · Cmd.map"

-}
map : (msg1 -> msg2) -> Effect msg1 -> Effect msg2
map changeMsg effect =
    case effect of
        None ->
            None

        Batch effects ->
            Batch (List.map (map changeMsg) effects)

        ReplaceUrl route ->
            ReplaceUrl route

        PushUrl url ->
            PushUrl url

        LoadUrl href ->
            LoadUrl href

        ReplaceSession session ->
            ReplaceSession session

        Focus id ->
            Focus id

        ReplaceTheme theme ->
            ReplaceTheme theme

        ScrollToTop ->
            ScrollToTop

        CallSendContactFormEmail args ->
            CallSendContactFormEmail args

        CheckValidity id ->
            CheckValidity id

        ConsoleError message ->
            ConsoleError message

        ConsoleErrorSubst message substitutions ->
            ConsoleErrorSubst message substitutions

        ConsoleErrorValues values ->
            ConsoleErrorValues values

        ConsoleErrorDecodeError error ->
            ConsoleErrorDecodeError error

        ConsoleErrorInteropError error ->
            ConsoleErrorInteropError error

        ConsoleErrorCheckValidityError error ->
            ConsoleErrorCheckValidityError error


{-| Perform an effect.
-}
perform : (String -> msg) -> ( Model r, Effect msg ) -> ( Model r, Cmd msg )
perform ignore ( model, effect ) =
    case effect of
        None ->
            ( model, Cmd.none )

        Batch effects ->
            List.foldl (batchEffect ignore) ( model, [] ) effects
                |> Tuple.mapSecond Cmd.batch

        ReplaceUrl route ->
            ( model, Route.replaceUrl (Env.navKey model.env) route )

        PushUrl url ->
            ( model, Nav.pushUrl (Env.navKey model.env) (Url.toString url) )

        LoadUrl href ->
            ( model, Nav.load href )

        ReplaceSession session ->
            ( { model | session = session }
            , Session.storeState session
            )

        Focus id ->
            ( model, attempt (\_ -> ignore "FocusNode") (Dom.focus id) )

        ReplaceTheme theme ->
            let
                session : Session
                session =
                    model.session

                newSession : Session
                newSession =
                    Session.updateSettings
                        (\settings -> { settings | theme = theme })
                        session
            in
            ( { model | session = newSession }
            , Session.storeState newSession
            )

        ScrollToTop ->
            ( model
            , Task.perform (\_ -> ignore "ScrollToTop") <|
                Dom.setViewport 0 0
            )

        CallSendContactFormEmail args ->
            ( model, Interop.callSendContactFormEmail args )

        CheckValidity id ->
            ( model, Interop.checkValidity id )

        ConsoleError message ->
            ( model, Interop.consoleError message )

        ConsoleErrorSubst message substitutions ->
            ( model, Interop.consoleErrorSubst message substitutions )

        ConsoleErrorValues values ->
            ( model, Interop.consoleErrorValues values )

        ConsoleErrorDecodeError error ->
            ( model, Interop.consoleErrorDecodeError error )

        ConsoleErrorInteropError error ->
            ( model, Interop.consoleErrorInteropError error )

        ConsoleErrorCheckValidityError error ->
            ( model, Interop.consoleErrorCheckValidityError error )


{-| Perform an effect and accumulate any commands it produces.
-}
batchEffect :
    (String -> msg)
    -> Effect msg
    -> ( Model r, List (Cmd msg) )
    -> ( Model r, List (Cmd msg) )
batchEffect ignore effect ( model, cmds ) =
    perform ignore ( model, effect ) |> Tuple.mapSecond (flip (::) cmds)



-- EFFECTS | GENERIC


{-| An effect that does nothing.

This passes [`Cmd.none`] to the Elm runtime.

[`Cmd.none`]: /packages/elm/core/latest/Platform-Cmd#none "elm/core · Cmd.none"

-}
none : Effect msg
none =
    None


{-| Combine a value with an effect that does nothing.
-}
withNone : x -> ( x, Effect msg )
withNone x =
    ( x, None )


{-| Combine several effects into a single effect.
-}
batch : List (Effect msg) -> Effect msg
batch =
    Batch



-- EFFECTS | NAVIGATION


{-| Replace the current URL without adding an entry to the browser history.
-}
replaceUrl : Route -> Effect msg
replaceUrl =
    ReplaceUrl


{-| Change the URL and add a new entry to the browser history.
-}
pushUrl : Url -> Effect msg
pushUrl =
    PushUrl


{-| Leave the current page and load the given URL.
-}
loadUrl : String -> Effect msg
loadUrl href =
    LoadUrl href



-- EFFECTS | COMMON


{-| Focus a DOM node.

This effect uses [`Browser.Dom.focus`] to focus the DOM node with the given ID.

[`Browser.Dom.focus`]: /packages/elm/browser/latest/Browser-Dom#focus "elm/browser · Browser.Dom.focus"

-}
focusNode : String -> Effect msg
focusNode =
    Focus


{-| Replace the current theme with the given theme.

This effect updates the theme in the [`Session`][`Settings`].

[`Session`]: Session#Session
[`Settings`]: Settings#Settings

-}
replaceTheme : Theme -> Effect msg
replaceTheme =
    ReplaceTheme


{-| Scroll to the top of the page.

This effect uses [`Browser.Dom.setViewport`] to scroll to the top of the page.

[`Browser.Dom.setViewport`]: /packages/elm/browser/latest/Browser-Dom#setViewport "elm/browser · Browser.Dom.setViewport"

-}
scrollToTop : Effect msg
scrollToTop =
    ScrollToTop



-- EFFECTS | INTEROP


{-| Call the `sendContactFormEmail` cloud function to send an email
from the contact form.

This effect uses [`Interop.callSendContactFormEmail`] to invoke the cloud
function.

[`Interop.callSendContactFormEmail`]: Interop#callSendContactFormEmail

-}
callSendContactFormEmail :
    { name : String
    , email : String
    , subject : String
    , body : String
    }
    -> Effect msg
callSendContactFormEmail =
    CallSendContactFormEmail


{-| Call the [`checkValidity()` method] of the form element
with the given ID.

This effect uses [`Interop.checkValidity`] to call the method.

[`checkValidity()` method]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/checkValidity "MDN · HTMLInputElement · checkValidity() method"
[`Interop.checkValidity`]: Interop#checkValidity

-}
checkValidity : String -> Effect msg
checkValidity =
    CheckValidity


{-| Log an error message to the console.

This effect uses [`Interop.consoleError`] to log the message.

[`Interop.consoleError`]: Interop#consoleError

-}
consoleError : String -> Effect msg
consoleError =
    ConsoleError


{-| Log an error message to the console using a format string and a list of
substitute strings.

This effect uses [`Interop.consoleErrorSubst`] to log the message.

See the [MDN documentation] for details on the format string and supported
substitutions.

[`Interop.consoleErrorSubst`]: Interop#consoleErrorSubst
[MDN documentation]: https://developer.mozilla.org/en-US/docs/Web/API/console#using_string_substitutions "MDN · console · Using string substitutions"

-}
consoleErrorSubst : String -> List String -> Effect msg
consoleErrorSubst =
    ConsoleErrorSubst


{-| Log an error message to the console using an arbitrary list of values.

This effect uses [`Interop.consoleErrorValues`] to log the message.

[`Interop.consoleErrorValues`]: Interop#consoleErrorValues

-}
consoleErrorValues : List Decode.Value -> Effect msg
consoleErrorValues =
    ConsoleErrorValues


{-| Log a [`Json.Decode.Error`] to the console.

This effect uses [`Interop.consoleErrorDecodeError`] to log the error.

[`Json.Decode.Error`]: /packages/elm/json/latest/Json-Decode#Error "elm/json · Json.Decode.Error"
[`Interop.consoleErrorDecodeError`]: Interop#consoleErrorDecodeError

-}
consoleErrorDecodeError : Decode.Error -> Effect msg
consoleErrorDecodeError =
    ConsoleErrorDecodeError


{-| Log an interop [`Error`](Interop#Error) to the console.

This effect uses [`Interop.consoleErrorInteropError`] to log the error.

[`Interop.consoleErrorInteropError`]: Interop#consoleErrorInteropError

-}
consoleErrorInteropError : Interop.Error -> Effect msg
consoleErrorInteropError =
    ConsoleErrorInteropError


{-| Log an [`Interop.CheckValidityError`] to the console.

This effect uses [`Interop.consoleErrorCheckValidityError`] to log the error.

[`Interop.CheckValidityError`]: Interop#CheckValidityError
[`Interop.consoleErrorCheckValidityError`]: Interop#consoleErrorCheckValidityError

-}
consoleErrorCheckValidityError : Interop.CheckValidityError -> Effect msg
consoleErrorCheckValidityError =
    ConsoleErrorCheckValidityError



-- APPLICATION


{-| The data model.
-}
type alias Model model =
    { model
        | session : Session
        , env : Env
    }


{-| The main `init` function.
-}
type alias MainInitFn model msg =
    Device.Info
    -> Session
    -> Url
    -> Nav.Key
    -> ( Model model, Effect msg )


{-| The application.
-}
application :
    { init : MainInitFn model msg
    , view : Model model -> Browser.Document msg
    , update : msg -> Model model -> ( Model model, Effect msg )
    , ignore : String -> msg
    , subscriptions : Model model -> Sub msg
    , onUrlChange : Url -> msg
    , onUrlRequest : Browser.UrlRequest -> msg
    }
    -> Program Decode.Value (Model model) msg
application ({ view, update, ignore, subscriptions, onUrlChange, onUrlRequest } as main) =
    Browser.application
        { init = init main.init ignore
        , view = view
        , update = \msg model -> update msg model |> perform ignore
        , subscriptions = subscriptions
        , onUrlChange = onUrlChange
        , onUrlRequest = onUrlRequest
        }


{-| Initialize the application.

1.  Initialize the [`Device.Info`] and [`Session`] from the Elm initialization
    flags.

2.  Call the main `init` function with the device info, session, URL, and
    navigation key.

3.  Log any flag-decoding errors to the console.

4.  Perform any effects produced by the main `init` function.

-}
init :
    MainInitFn model msg
    -> (String -> msg)
    -> Decode.Value
    -> Url
    -> Nav.Key
    -> ( Model model, Cmd msg )
init mainInit ignore flags url navKey =
    let
        ( deviceInfo, maybeDeviceInfoError ) =
            Device.initInfo flags

        ( session, maybeSessionError ) =
            Session.init flags

        ( model, mainEffect ) =
            mainInit deviceInfo session url navKey

        effect : Effect msg
        effect =
            batch
                [ case maybeDeviceInfoError of
                    Just error ->
                        consoleErrorDecodeError error

                    Nothing ->
                        none
                , case maybeSessionError of
                    Just error ->
                        consoleErrorDecodeError error

                    Nothing ->
                        none
                , mainEffect
                ]
    in
    ( model, effect ) |> perform ignore
