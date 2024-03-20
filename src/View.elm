module View exposing
    ( RootConfig, root
    , MenuConfig, ThemeSwitcherConfig, header, menuItem, themeSwitcherOptionId
    , main_
    )

{-| View helpers.


# Root Element

@docs RootConfig, root


# Page Header

@docs MenuConfig, ThemeSwitcherConfig, header, menuItem, themeSwitcherOptionId


# Main Content

@docs main_

-}

import Array exposing (Array)
import Device
import Html
    exposing
        ( Html
        , a
        , button
        , div
        , h2
        , img
        , label
        , li
        , nav
        , section
        , span
        , text
        , ul
        )
import Html.Attributes
    exposing
        ( alt
        , attribute
        , class
        , classList
        , href
        , id
        , src
        , tabindex
        )
import Html.Attributes.Aria
    exposing
        ( ariaChecked
        , ariaControls
        , ariaDescribedby
        , ariaExpanded
        , ariaHidden
        , ariaLabel
        , ariaLabelledby
        , ariaPressed
        , role
        )
import Html.Events
    exposing
        ( on
        , onBlur
        , onClick
        , onFocus
        , stopPropagationOn
        )
import Json.Decode as Decode
import Route exposing (Route)
import Theme exposing (Theme(..))



-- ROOT ELEMENT


{-| Configuration for the root element of the Elm application.
-}
type alias RootConfig msg =
    { deviceInfo : Device.Info
    , currentTheme : Theme
    , noop : msg
    , closeAllMenus : msg
    }


{-| View the root element of the Elm application.
-}
root : RootConfig msg -> List (Html msg) -> Html msg
root { deviceInfo, currentTheme, noop, closeAllMenus } =
    let
        ( themeClass, catFlavorClass ) =
            case currentTheme of
                Theme.System ->
                    case deviceInfo.prefersColorScheme of
                        Device.PrefersLight ->
                            ( "theme-system", "cat-latte" )

                        Device.PrefersDark ->
                            ( "theme-system", "cat-mocha" )

                Theme.Light ->
                    ( "theme-light", "cat-latte" )

                Theme.Dark ->
                    ( "theme-dark", "cat-mocha" )
    in
    div
        [ class <| ([ "page", themeClass, catFlavorClass ] |> String.join " ")
        , onClick closeAllMenus
        , on "keydown"
            (Decode.field "key" Decode.string
                |> Decode.map
                    (\key ->
                        if key == "Escape" then
                            closeAllMenus

                        else
                            noop
                    )
            )
        ]



-- PAGE HEADER


{-| Configuration for the navigation menu.
-}
type alias MenuConfig msg =
    { isMenuOpen : Bool
    , openMenu : msg
    , closeMenu : msg
    , noop : msg
    }


{-| Configuration for the theme switcher.
-}
type alias ThemeSwitcherConfig msg =
    { currentTheme : Theme
    , isThemeSwitcherOpen : Bool
    , openThemeSwitcher : msg
    , closeThemeSwitcher : msg
    , focusedTheme : Maybe Theme
    , focusedThemeChanged : Maybe Theme -> msg
    , focusNode : String -> msg
    , replaceTheme : Theme -> msg
    , noop : msg
    }


{-| View the page header.
-}
header :
    MenuConfig msg
    -> ThemeSwitcherConfig msg
    -> List (Html msg)
    -> List (Html msg)
header menuConfig themeSwitcherConfig menuItems =
    [ a [ class "skip-link", href "#main" ] [ text "Skip to main content" ]
    , Html.header []
        [ section [ ariaLabel "Logo and title", class "site-badge" ]
            [ a [ href "/" ]
                [ img [ alt "Logo", class "logo", src "./assets/img/edward.webp" ] []
                , h2 [ id "site-title", class "title" ] [ text "nisavid.io" ]
                ]
            ]
        , div [ class "banner-wrapper" ]
            [ menu menuConfig menuItems
            , themeSwitcher themeSwitcherConfig
            ]
        ]
    ]


{-| View the navigation menu.
-}
menu : MenuConfig msg -> List (Html msg) -> Html msg
menu { isMenuOpen, openMenu, closeMenu, noop } menuItems =
    div [ class "menu-wrapper" ]
        [ nav
            [ id "menu"
            , ariaLabel "Navigation menu"
            , classList [ ( "menu", True ), ( "open", isMenuOpen ) ]
            , stopPropagationOn "click" (Decode.map (\msg -> ( msg, True )) (Decode.succeed noop))
            ]
            [ Html.header []
                [ button
                    [ ariaLabel "Toggle navigation menu"
                    , ariaDescribedby "menu-tooltip"
                    , ariaControls "menu"
                    , ariaPressed isMenuOpen
                    , ariaExpanded
                        (if isMenuOpen then
                            "true"

                         else
                            "false"
                        )
                    , onClick <|
                        if isMenuOpen then
                            closeMenu

                        else
                            openMenu
                    ]
                    [ div [ class "highlight" ] []
                    , span [ class "material-symbols-outlined", ariaHidden True ] [ text "menu" ]
                    , div [ id "menu-tooltip", role "tooltip", class "tooltip below" ]
                        [ text "Menu" ]
                    , div [ class "tooltip-caret" ] []
                    ]
                , div [ class "heading-wrapper" ] [ h2 [] [ text "Menu" ] ]
                ]
            , ul [] menuItems
            ]
        ]


{-| View a navigation menu item.
-}
menuItem : Bool -> Route -> String -> Html msg
menuItem isCurrent route label =
    li []
        [ div [ class "wrapper" ]
            [ div [ class "highlight" ] []
            , a
                [ Route.href route
                , attribute "aria-current" <|
                    if isCurrent then
                        "page"

                    else
                        "false"
                , tabindex 0
                ]
                [ text label ]
            ]
        ]


{-| The list of available themes.
-}
themeList : List Theme
themeList =
    [ Theme.System, Theme.Light, Theme.Dark ]


{-| View the theme switcher.
-}
themeSwitcher : ThemeSwitcherConfig msg -> Html msg
themeSwitcher { currentTheme, isThemeSwitcherOpen, openThemeSwitcher, closeThemeSwitcher, focusedTheme, focusedThemeChanged, focusNode, replaceTheme, noop } =
    section
        [ id "theme-switcher"
        , ariaLabel "Theme switcher"
        , classList [ ( "theme-switcher", True ), ( "open", isThemeSwitcherOpen ) ]
        , stopPropagationOn "click" (Decode.map (\msg -> ( msg, True )) (Decode.succeed noop))
        ]
        [ Html.header []
            [ button
                ([ ariaLabel "Toggle theme switcher"
                 , ariaDescribedby "theme-switcher-tooltip"
                 , ariaControls "theme-switcher"
                 , ariaPressed isThemeSwitcherOpen
                 ]
                    ++ (if isThemeSwitcherOpen then
                            [ ariaExpanded "true"
                            , onClick closeThemeSwitcher
                            ]

                        else
                            [ ariaExpanded "false"
                            , onClick openThemeSwitcher
                            ]
                       )
                )
                [ div [ class "highlight" ] []
                , span [ class "material-symbols-outlined", ariaHidden True ] [ text "contrast" ]
                , div [ id "theme-switcher-tooltip", role "tooltip", class "tooltip below" ]
                    [ text "Theme" ]
                , div [ class "tooltip-caret" ] []
                ]
            , div [ class "heading-wrapper" ] [ h2 [] [ text "Theme" ] ]
            ]
        , Html.menu
            [ ariaLabel "Theme options"
            , tabindex 0
            , onFocus <| focusNode (themeSwitcherOptionId currentTheme)
            , on "keydown" <|
                let
                    themeArray : Array Theme
                    themeArray =
                        Array.fromList themeList

                    themeIndex : Theme -> Maybe Int
                    themeIndex theme =
                        List.indexedMap (\index theme_ -> ( index, theme_ )) themeList
                            |> List.filter (\( _, theme_ ) -> theme_ == theme)
                            |> List.head
                            |> Maybe.map Tuple.first

                    focusedThemeIndex : Maybe Int
                    focusedThemeIndex =
                        Maybe.map themeIndex focusedTheme
                            |> Maybe.withDefault Nothing

                    prevTheme : Maybe Theme
                    prevTheme =
                        Maybe.map
                            (\index -> Array.get (modBy (List.length themeList) (index - 1)) themeArray)
                            focusedThemeIndex
                            |> Maybe.withDefault Nothing

                    prevThemeOptionId : Maybe String
                    prevThemeOptionId =
                        Maybe.map themeSwitcherOptionId prevTheme

                    nextTheme : Maybe Theme
                    nextTheme =
                        Maybe.map
                            (\index -> Array.get (modBy (List.length themeList) (index + 1)) themeArray)
                            focusedThemeIndex
                            |> Maybe.withDefault Nothing

                    nextThemeOptionId : Maybe String
                    nextThemeOptionId =
                        Maybe.map themeSwitcherOptionId nextTheme
                in
                case ( prevThemeOptionId, nextThemeOptionId, focusedTheme ) of
                    ( Just prevId, Just nextId, Just theme ) ->
                        themeSwitcherKeyDecoder noop (focusNode prevId) (focusNode nextId) (replaceTheme theme)

                    ( _, _, Just theme ) ->
                        themeSwitcherKeyDecoder noop noop noop (replaceTheme theme)

                    ( _, _, _ ) ->
                        themeSwitcherKeyDecoder noop noop noop noop
            ]
          <|
            List.map (themeSwitcherOption currentTheme replaceTheme focusedThemeChanged) themeList
        ]


{-| A decoder for keyboard events in the theme switcher.

This decoder transforms a keyboard event into the corresponding message.

-}
themeSwitcherKeyDecoder : msg -> msg -> msg -> msg -> Decode.Decoder msg
themeSwitcherKeyDecoder noop focusPrevTheme focusNextTheme replaceTheme =
    Decode.field "key" Decode.string
        |> Decode.map
            (\key ->
                case key of
                    "ArrowUp" ->
                        focusPrevTheme

                    "ArrowLeft" ->
                        focusPrevTheme

                    "ArrowDown" ->
                        focusNextTheme

                    "ArrowRight" ->
                        focusNextTheme

                    "Enter" ->
                        replaceTheme

                    " " ->
                        replaceTheme

                    _ ->
                        noop
            )


{-| View a theme switcher option.
-}
themeSwitcherOption :
    Theme
    -> (Theme -> msg)
    -> (Maybe Theme -> msg)
    -> Theme
    -> Html msg
themeSwitcherOption currentTheme replaceTheme focusedThemeChanged theme =
    let
        id_ : String
        id_ =
            themeSwitcherOptionId theme

        labelId : String
        labelId =
            id_ ++ "-label"

        ( iconName, labelText ) =
            case theme of
                Theme.System ->
                    ( "night_sight_auto", "System" )

                Theme.Light ->
                    ( "light_mode", "Light" )

                Theme.Dark ->
                    ( "dark_mode", "Dark" )
    in
    li
        [ id id_
        , role "menuitemradio"
        , ariaLabelledby labelId
        , ariaChecked <|
            if currentTheme == theme then
                "true"

            else
                "false"
        , tabindex 0
        , onFocus <| focusedThemeChanged (Just theme)
        , onBlur <| focusedThemeChanged Nothing
        , onClick <| replaceTheme theme
        ]
        [ div [ class "wrapper" ]
            [ div [ class "highlight" ] []
            , div [ class "label-wrapper" ]
                [ span [ class "material-symbols-outlined", ariaHidden True ] [ text iconName ]
                , span [ id labelId, class "label" ] [ text labelText ]
                ]
            ]
        ]


{-| Get the element ID of a theme switcher option.
-}
themeSwitcherOptionId : Theme -> String
themeSwitcherOptionId theme =
    case theme of
        Theme.System ->
            "theme-system"

        Theme.Light ->
            "theme-light"

        Theme.Dark ->
            "theme-dark"



-- MAIN CONTENT


{-| Wrap the main content.
-}
main_ : List (Html msg) -> List (Html msg)
main_ content =
    [ div [ class "main-wrapper" ] [ Html.main_ [ id "main" ] content ] ]
