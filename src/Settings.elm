module Settings exposing
    ( Settings, default
    , encode
    , decoder
    )

{-| User-configurable application settings.


# Settings

@docs Settings, default


# JavaScript Interoperation

@docs encode
@docs decoder

-}

import Json.Decode as Decode exposing (Decoder, field)
import Json.Encode exposing (Value, object)
import Theme exposing (Theme)



-- SETTINGS


{-| User-configurable application settings.
-}
type alias Settings =
    { theme : Theme
    }


{-| Default [`Settings`](#Settings).
-}
default : Settings
default =
    { theme = Theme.default
    }



-- INTEROP | SEND


{-| Encode a [`Settings`](#Settings) value as JSON.
-}
encode : Settings -> Value
encode settings =
    object [ ( "theme", Theme.encode settings.theme ) ]



-- INTEROP | RECEIVE


{-| A decoder for [`Settings`](#Settings) from JSON.
-}
decoder : Decoder Settings
decoder =
    field "theme" Theme.decoder |> Decode.map Settings
