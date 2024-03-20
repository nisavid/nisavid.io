module Route exposing
    ( Route(..)
    , href, replaceUrl, pushUrl, fromUrl
    )

{-| URL routing.

@docs Route
@docs href, replaceUrl, pushUrl, fromUrl

-}

import Browser.Navigation as Nav
import Html exposing (Attribute)
import Html.Attributes as Attr
import Url exposing (Url)
import Url.Builder
import Url.Parser as Parser exposing (Parser, oneOf, s)


{-| A URL route.
-}
type Route
    = Home
    | About
    | Projects
    | Contact


{-| Convert a route to an [`href`] attribute.

[`href`]: /packages/elm/html/latest/Html-Attributes#href "elm/html · Html.Attributes.href"

-}
href : Route -> Attribute msg
href targetRoute =
    Attr.href (toString targetRoute)


{-| Replace the current URL without adding an entry to the browser history.
-}
replaceUrl : Nav.Key -> Route -> Cmd msg
replaceUrl key route =
    Nav.replaceUrl key (toString route)


{-| Change the URL and add a new entry to the browser history.
-}
pushUrl : Nav.Key -> Route -> Cmd msg
pushUrl key route =
    Nav.pushUrl key (toString route)


{-| Convert a URL to a route.
-}
fromUrl : Url -> Maybe Route
fromUrl url =
    Parser.parse parser url


{-| A parser for routes.
-}
parser : Parser (Route -> a) a
parser =
    oneOf
        [ Parser.map Home Parser.top
        , Parser.map About (s "about")
        , Parser.map Projects (s "projects")
        , Parser.map Contact (s "contact")
        ]


{-| Convert a route to a URL.
-}
toString : Route -> String
toString route =
    Url.Builder.absolute (routeToPieces route) []


{-| Convert a route to a list of URL pieces.
-}
routeToPieces : Route -> List String
routeToPieces route =
    case route of
        Home ->
            []

        About ->
            [ "about" ]

        Projects ->
            [ "projects" ]

        Contact ->
            [ "contact" ]
