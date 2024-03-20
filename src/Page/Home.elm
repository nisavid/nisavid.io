module Page.Home exposing (view)

{-| The home page.


# View

@docs view

-}

import Browser exposing (Document)
import Html exposing (h1, p, text)
import Html.Attributes exposing (class)



-- VIEW


{-| View the page.
-}
view : Document Never
view =
    { title = ""
    , body =
        [ h1 [ class "welcome" ]
            [ text "Welcome" ]
        , p [ class "welcome-intro" ]
            [ text "My name is Ivan D Vasin.  This is my website." ]
        ]
    }
