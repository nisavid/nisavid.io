module Page.NotFound exposing (view)

{-| The _Page Not Found_ page.


# View

@docs view

-}

import Browser exposing (Document)
import Html exposing (a, h1, p, text)
import Html.Attributes exposing (href)



-- VIEW


{-| View the page.
-}
view : Document Never
view =
    { title = "Page Not Found"
    , body =
        [ h1 [] [ text "Page not found" ]
        , p [] [ text "You've navigated to a page that doesn't exist." ]
        , p [] [ a [ href "/" ] [ text "Return home" ] ]
        ]
    }
