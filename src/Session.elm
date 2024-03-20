module Session exposing
    ( Session(..), settings, updateSettings
    , init
    , storeState
    , storedStateChanged
    )

{-| Manage the application session.


# Session

@docs Session, settings, updateSettings


# JavaScript Interoperation

@docs init
@docs storeState
@docs storedStateChanged

-}

import Interop.Ports as Ports
import Json.Decode as Decode exposing (Decoder, decodeValue, field, null)
import Json.Encode exposing (Value, object)
import Settings exposing (Settings)



-- SESSION


{-| Application session.
-}
type Session
    = Guest Settings


{-| Default application session.
-}
default : Session
default =
    Guest Settings.default


{-| Get the user-configurable settings of the application session.
-}
settings : Session -> Settings
settings session =
    case session of
        Guest settings_ ->
            settings_


{-| Update the user-configurable settings of the application session.
-}
updateSettings : (Settings -> Settings) -> Session -> Session
updateSettings update session =
    case session of
        Guest settings_ ->
            Guest <| update settings_



-- INTEROP | INIT


{-| Initialize the application session.

This function decodes the stored persistent state from the given Elm
initialization flags. If decoding fails, this returns a default value together
with the decoding error.

-}
init : Value -> ( Session, Maybe Decode.Error )
init flags =
    case decodeFromFlags flags of
        Ok info ->
            ( info, Nothing )

        Err error ->
            ( default, Just error )


{-| Decode the application session's stored persistent state from the Elm
initialization flags.
-}
decodeFromFlags : Value -> Result Decode.Error Session
decodeFromFlags =
    decodeValue (field "storedState" decoder)



-- INTEROP | SEND


{-| Store the persistent state of the application [`Session`].

[`Session`]: #Session

-}
storeState : Session -> Cmd msg
storeState session =
    Ports.storeState <| encode session


{-| Encode the persistent state of the application [`Session`] as JSON.

[`Session`]: #Session

-}
encode : Session -> Value
encode session =
    case session of
        Guest settings_ ->
            object [ ( "settings", Settings.encode settings_ ) ]



-- INTEROP | RECEIVE


{-| Subscribe to changes in the stored persistent state of the application
[`Session`].

[`Session`]: #Session

-}
storedStateChanged : (Result Decode.Error Session -> msg) -> Sub msg
storedStateChanged tagger =
    Ports.storedStateChanged <| tagger << decode


{-| Decode the application [`Session`] from a JSON representation
of its persistent state.

[`Session`]: #Session

-}
decode : Value -> Result Decode.Error Session
decode =
    decodeValue decoder


{-| A decoder for the application [`Session`] from a JSON representation
of its persistent state.

[`Session`]: #Session

-}
decoder : Decoder Session
decoder =
    Decode.oneOf
        [ null default
        , field "settings" Settings.decoder |> Decode.map Guest
        ]
