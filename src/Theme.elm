module Theme exposing
    ( Theme(..), default
    , encode
    , decoder
    )

{-| Visual themes.


# Theme

@docs Theme, default


# JavaScript Interoperation

@docs encode
@docs decoder

-}

import Json.Decode as Decode exposing (Decoder)
import Json.Decode.Extra as Decode
import Json.Encode as Encode exposing (Value)



-- THEME


{-| A visual theme.
-}
type Theme
    = System
    | Light
    | Dark


{-| Default visual theme.
-}
default : Theme
default =
    System



-- INTEROP | SEND


{-| Encode a [`Theme`](#Theme) as JSON.
-}
encode : Theme -> Value
encode theme =
    theme
        |> toString
        |> Encode.string


{-| Convert a [`Theme`](#Theme) to a machine-readable string.
-}
toString : Theme -> String
toString theme =
    case theme of
        System ->
            "system"

        Light ->
            "light"

        Dark ->
            "dark"



-- INTEROP | RECEIVE


{-| A decoder for a [`Theme`](#Theme) from JSON.
-}
decoder : Decoder Theme
decoder =
    Decode.string
        |> Decode.andThen (fromString >> Decode.fromMaybe "Invalid theme")


{-| Get a [`Theme`](#Theme) from its string representation.
-}
fromString : String -> Maybe Theme
fromString string =
    case string of
        "system" ->
            Just System

        "light" ->
            Just Light

        "dark" ->
            Just Dark

        _ ->
            Nothing
