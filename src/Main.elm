module Main exposing (main)

{-| The entry point of the application.


# Application

@docs main

-}

import Browser exposing (Document)
import Browser.Navigation as Nav
import Device
import Effect exposing (Effect)
import Env exposing (Env)
import Json.Decode as Decode
import Page exposing (Page)
import Route exposing (Route)
import Session exposing (Session)
import Url exposing (Url)



-- APPLICATION


{-| The application.
-}
main : Program Decode.Value Model Msg
main =
    Effect.application
        { init = init
        , view = view
        , update = update
        , ignore = Ignored
        , onUrlChange = ChangedUrl
        , onUrlRequest = ClickedLink
        , subscriptions = subscriptions
        }


{-| Initialize the application.
-}
init : Device.Info -> Session -> Url -> Nav.Key -> ( Model, Effect Msg )
init deviceInfo session url navKey =
    changeRouteTo
        (initModel deviceInfo session navKey)
        (Route.fromUrl url)



-- DATA MODEL


{-| The data model.
-}
type alias Model =
    { env : Env
    , session : Session
    , page : Page
    }


{-| Initial data model.
-}
initModel : Device.Info -> Session -> Nav.Key -> Model
initModel deviceInfo session navKey =
    { env = Env.init deviceInfo navKey
    , session = session
    , page = Page.blank
    }



-- MESSAGES


{-| A message.
-}
type Msg
    = Ignored String
    | ChangedUrl Url
    | ClickedLink Browser.UrlRequest
    | DeviceInfoChanged (Result Decode.Error Device.Info)
    | SessionChanged (Result Decode.Error Session)
    | GotPageMsg Page.Msg


{-| Handle a message.
-}
update : Msg -> Model -> ( Model, Effect Msg )
update msg model =
    case msg of
        Ignored _ ->
            ( model, Effect.none )

        ClickedLink urlRequest ->
            case urlRequest of
                Browser.Internal url ->
                    ( model, Effect.pushUrl url )

                Browser.External href ->
                    ( model, Effect.loadUrl href )

        ChangedUrl url ->
            changeRouteTo model (Route.fromUrl url)

        DeviceInfoChanged deviceInfoResult ->
            case deviceInfoResult of
                Ok deviceInfo ->
                    { model | env = Env.replaceDeviceInfo deviceInfo model.env }
                        |> Effect.withNone

                Err error ->
                    ( model, Effect.consoleErrorDecodeError error )

        SessionChanged sessionResult ->
            case sessionResult of
                Ok session ->
                    { model | session = session } |> Effect.withNone

                Err error ->
                    ( model, Effect.consoleErrorDecodeError error )

        GotPageMsg pageMsg ->
            Page.update model.session model.page pageMsg |> mapPage model


{-| Transform a [`Page`] and its [`Page.Msg`] into a [`Model`] and [`Msg`].

[`Page`]: Page#Page
[`Page.Msg`]: Page#Msg
[`Model`]: #Model
[`Msg`]: #Msg

-}
mapPage : Model -> ( Page, Effect Page.Msg ) -> ( Model, Effect Msg )
mapPage model ( page, effect ) =
    ( { model | page = page }
    , Effect.map GotPageMsg effect
    )


{-| Navigate to a [`Route`](Route#Route).
-}
changeRouteTo : Model -> Maybe Route -> ( Model, Effect Msg )
changeRouteTo model route =
    Page.changeRouteTo model.session model.page route |> mapPage model



-- SUBSCRIPTIONS


{-| Subscriptions.
-}
subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ Device.infoChanged DeviceInfoChanged
        , Session.storedStateChanged SessionChanged
        , Page.subscriptions model.page |> Sub.map GotPageMsg
        ]



-- VIEW


{-| View the application.
-}
view : Model -> Document Msg
view { env, session, page } =
    Page.view env session page |> Page.mapDocument GotPageMsg
