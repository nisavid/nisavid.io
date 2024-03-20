module RoutingTests exposing (..)

import Expect
import Route exposing (Route(..))
import Test exposing (..)
import Url exposing (Url)


fromUrl : Test
fromUrl =
    describe "Route.fromUrl"
        [ testUrl "/" Home
        , testUrl "/about" About
        , testUrl "/projects" Projects
        , testUrl "/contact" Contact
        ]



-- HELPERS


testUrl : String -> Route -> Test
testUrl path route =
    test ("Parsing path: \"" ++ path ++ "\"") <|
        \() ->
            url path
                |> Route.fromUrl
                |> Expect.equal (Just route)


url : String -> Url
url path =
    { protocol = Url.Https
    , host = "nisavid.io"
    , port_ = Nothing
    , path = path
    , query = Nothing
    , fragment = Nothing
    }
