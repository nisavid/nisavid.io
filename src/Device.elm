module Device exposing
    ( Info, PrefersColorScheme(..)
    , initInfo
    , infoChanged
    )

{-| Interface with the user's device.


# Device Information

@docs Info, PrefersColorScheme


## JavaScript Interoperation

@docs initInfo
@docs infoChanged

-}

import Interop.Ports as Ports
import Json.Decode as Decode exposing (Decoder, Value, decodeValue, field)
import Json.Decode.Extra as Decode exposing (optionalNullableField)



-- INFO


{-| Information about the user's device.
-}
type alias Info =
    { prefersColorScheme : PrefersColorScheme }


{-| The device's color scheme preference.
-}
type PrefersColorScheme
    = PrefersLight
    | PrefersDark



-- INFO | INTEROP | INIT


{-| Initialize user device [`Info`](#Info).

This function decodes the device information from the given Elm initialization
flags. If decoding fails, this returns a default value together with
the decoding error.

-}
initInfo : Value -> ( Info, Maybe Decode.Error )
initInfo flags =
    case decodeInfoFromFlags flags of
        Ok info ->
            ( info, Nothing )

        Err error ->
            ( defaultInfo, Just error )


{-| Decode user device [`Info`](#Info) from the Elm initialization flags.
-}
decodeInfoFromFlags : Value -> Result Decode.Error Info
decodeInfoFromFlags =
    decodeValue (field "deviceInfo" infoDecoder)


{-| Default user device [`Info`](#Info).
-}
defaultInfo : Info
defaultInfo =
    { prefersColorScheme = defaultPrefersColorScheme }


{-| Default [`PrefersColorScheme`](#PrefersColorScheme) setting.
-}
defaultPrefersColorScheme : PrefersColorScheme
defaultPrefersColorScheme =
    PrefersLight



-- INFO | INTEROP | RECEIVE


{-| Subscribe to changes in the user device [`Info`](#Info).
-}
infoChanged : (Result Decode.Error Info -> msg) -> Sub msg
infoChanged tagger =
    Ports.deviceInfoChanged <| tagger << decodeInfo


{-| Decode user device [`Info`](#Info).
-}
decodeInfo : Value -> Result Decode.Error Info
decodeInfo =
    decodeValue infoDecoder


{-| A decoder for user device [`Info`](#Info).
-}
infoDecoder : Decoder Info
infoDecoder =
    Decode.map Info
        (optionalNullableField "prefersColorScheme" prefersColorSchemeDecoder
            |> Decode.map (Maybe.withDefault defaultPrefersColorScheme)
        )


{-| A decoder for a [`PrefersColorScheme`] setting.

[`PrefersColorScheme`]: #PrefersColorScheme

-}
prefersColorSchemeDecoder : Decoder PrefersColorScheme
prefersColorSchemeDecoder =
    Decode.string
        |> Decode.andThen
            (prefersColorSchemeFromString
                >> Decode.fromMaybe "Invalid color scheme"
            )


{-| Get a [`PrefersColorScheme`] setting from its string representation.

[`PrefersColorScheme`]: #PrefersColorScheme

-}
prefersColorSchemeFromString : String -> Maybe PrefersColorScheme
prefersColorSchemeFromString string =
    case string of
        "light" ->
            Just PrefersLight

        "dark" ->
            Just PrefersDark

        _ ->
            Nothing
