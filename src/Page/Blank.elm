module Page.Blank exposing (view)

{-| A blank page.


# View

@docs view

-}

import Browser exposing (Document)
import Html.Extra exposing (nothing)



-- VIEW


{-| View the page.
-}
view : Document Never
view =
    { title = "", body = [ nothing ] }
