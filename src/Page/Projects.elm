module Page.Projects exposing (view)

{-| The _Projects_ page.


# View

@docs view

-}

import Browser exposing (Document)
import Html exposing (a, article, h1, h2, p, text)
import Html.Attributes exposing (href, rel)



-- VIEW


{-| View the page.
-}
view : Document Never
view =
    { title = "Projects"
    , body =
        [ h1 [] [ text "Projects" ]
        , article []
            [ h2 [] [ text "nisavid.io" ]
            , p []
                [ text "This website is a single-page application written mostly in "
                , a [ rel "external", href "https://elm-lang.org" ]
                    [ text "Elm" ]
                , text " with a bit of "
                , a [ rel "external", href "https://typescriptlang.org" ]
                    [ text "TypeScript" ]
                , text ", styled with "
                , a [ rel "external", href "https://tailwindcss.com" ]
                    [ text "Tailwind CSS" ]
                , text " and the "
                , a [ rel "external", href "https://catppuccin.com" ]
                    [ text "Catppuccin color schemes" ]
                , text ", and built with "
                , a [ rel "external", href "https://parceljs.org" ]
                    [ text "Parcel" ]
                , text ".  It is deployed on the "
                , a [ rel "external", href "https://firebase.google.com" ]
                    [ text "Firebase" ]
                , text " platform, using "
                , a [ rel "external", href "https://firebase.google.com/docs/hosting" ]
                    [ text "Firebase Hosting" ]
                , text " for web hosting and "
                , a [ rel "external", href "https://firebase.google.com/docs/functions" ]
                    [ text "Cloud Functions" ]
                , text " for serverless backend functionality."
                ]
            , p []
                [ text "The source code is available "
                , a [ rel "external", href "https://github.com/nisavid/nisavid.io" ]
                    [ text "on GitHub" ]
                , text "."
                ]
            ]
        , article []
            [ h2 [] [ text "astronvim-config" ]
            , p []
                [ text "My "
                , a [ rel "external", href "https://neovim.io" ]
                    [ text "Neovim" ]
                , text " configuration, based on "
                , a [ rel "external", href "https://astronvim.com" ]
                    [ text "AstroNvim" ]
                , text ", integrating the productivity of modern IDE features into the efficiency of modal editing."
                ]
            , p []
                [ text "The source code is available "
                , a [ rel "external", href "https://github.com/nisavid/astronvim-config" ]
                    [ text "on GitHub" ]
                , text "."
                ]
            ]
        , article []
            [ h2 [] [ text "zsh-config" ]
            , p []
                [ text "My "
                , a [ rel "external", href "https://zsh.sourceforge.io" ]
                    [ text "Zsh" ]
                , text " configuration.  Fast, convenient, and pretty."
                ]
            , p []
                [ text "The source code is available "
                , a [ rel "external", href "https://github.com/nisavid/zsh-config" ]
                    [ text "on GitHub" ]
                , text "."
                ]
            ]
        , article []
            [ h2 [] [ text "dotfiles" ]
            , p []
                [ text "My "
                , a [ rel "external", href "https://dotfiles.github.io" ]
                    [ text "dotfiles" ]
                , text ", managed by "
                , a [ rel "external", href "https://chezmoi.io" ]
                    [ text "chezmoi" ]
                , text "."
                ]
            , p []
                [ text "The source code is available "
                , a [ rel "external", href "https://github.com/nisavid/dotfiles" ]
                    [ text "on GitHub" ]
                , text "."
                ]
            ]
        ]
    }
