module Page exposing
    ( Page, blank, changeRouteTo
    , Msg, update
    , subscriptions
    , view, staticDocument, mapDocument
    )

{-| This module provides representations and functionality for all the common
elements and aspects of the site's pages.


# Pages

@docs Page, blank, changeRouteTo


# Messages

@docs Msg, update


# Subscriptions

@docs subscriptions


# View

@docs view, staticDocument, mapDocument

-}

import Browser exposing (Document)
import Browser.Events exposing (onResize)
import Effect exposing (Effect)
import Env exposing (Env)
import Html exposing (Html)
import List.Extra as List
import Page.About as About
import Page.Blank as Blank
import Page.Contact as Contact
import Page.Home as Home
import Page.NotFound as NotFound
import Page.Projects as Projects
import Route exposing (Route)
import Session exposing (Session)
import String
import Theme exposing (Theme)
import View



-- PAGES


{-| A page.

This type combines the generic [`Model`] with the particular
[`Main`] page content.

[`Model`]: #Model
[`Main`]: #Main

-}
type Page
    = Page Model Main


{-| The main content of a page.

Each variant corresponds to a different particular page and is implemented
by one of the submodules of this module. Pages that have their own data models
carry those as payload of this type.

  - `Blank`: [`Page.Blank`]
  - `Home`: [`Page.Home`]
  - `About`: [`Page.About`]
  - `Projects`: [`Page.Projects`]
  - `Contact`: [`Page.Contact`]
  - `NotFound`: [`Page.NotFound`]

[`Page.Blank`]: Page-Blank
[`Page.Home`]: Page-Home
[`Page.About`]: Page-About
[`Page.Projects`]: Page-Projects
[`Page.Contact`]: Page-Contact
[`Page.NotFound`]: Page-NotFound

-}
type Main
    = Blank
    | Home
    | About
    | Projects
    | Contact Contact.Model
    | NotFound


{-| A blank page.
-}
blank : Page
blank =
    Page init Blank


{-| Navigate to a [`Route`](Route#Route).
-}
changeRouteTo : Session -> Page -> Maybe Route -> ( Page, Effect Msg )
changeRouteTo _ _ maybeRoute =
    ( case maybeRoute of
        Just Route.Home ->
            Page init Home

        Just Route.About ->
            Page init About

        Just Route.Projects ->
            Page init Projects

        Just Route.Contact ->
            Page init (Contact Contact.init)

        Nothing ->
            Page init NotFound
    , Effect.none
    )



-- DATA MODEL


{-| The data model.

This models the data that is generic to all pages. Data that is specific
to a particular page is carried as a payload of the [`Main`] variant.

[`Main`]: #Main

-}
type alias Model =
    { isMenuOpen : Bool
    , isThemeSwitcherOpen : Bool
    , focusedTheme : Maybe Theme
    }


{-| Initial data model.
-}
init : Model
init =
    { isMenuOpen = False
    , isThemeSwitcherOpen = False
    , focusedTheme = Nothing
    }



-- MESSAGES


{-| A message.

  - `NoOp`: Do nothing.
  - `OpenMenu`: Open the collapsible navigation menu.
  - `CloseMenu`: Close the collapsible navigation menu.
  - `OpenThemeSwitcher`: Open the theme switcher.
  - `CloseThemeSwitcher`: Close the theme switcher.
  - `FocusedThemeChanged`: The focused theme has changed.
  - `CloseAllMenus`: Close all menus.
  - `FocusNode`: Focus a DOM node.
  - `ReplaceTheme`: Replace the current theme.
  - `GotMainMsg`: A [`MainMsg`].

[`MainMsg`]: #MainMsg

-}
type Msg
    = NoOp
    | OpenMenu
    | CloseMenu
    | OpenThemeSwitcher
    | CloseThemeSwitcher
    | FocusedThemeChanged (Maybe Theme)
    | CloseAllMenus
    | FocusNode String
    | ReplaceTheme Theme
    | GotMainMsg MainMsg


{-| A message from a particular page (the [`Main`] content).

[`Main`]: #Main

-}
type MainMsg
    = GotContactMsg Contact.Msg


{-| Handle a message.
-}
update : Session -> Page -> Msg -> ( Page, Effect Msg )
update session ((Page model main) as page) msg =
    case msg of
        NoOp ->
            page |> Effect.withNone

        OpenMenu ->
            Page
                { model
                    | isMenuOpen = True
                    , isThemeSwitcherOpen = False
                    , focusedTheme = Nothing
                }
                main
                |> Effect.withNone

        CloseMenu ->
            Page { model | isMenuOpen = False } main |> Effect.withNone

        OpenThemeSwitcher ->
            ( Page
                { model
                    | isThemeSwitcherOpen = True
                    , focusedTheme = Nothing
                    , isMenuOpen = False
                }
                main
            , Effect.focusNode <|
                View.themeSwitcherOptionId <|
                    (Session.settings session |> .theme)
            )

        CloseThemeSwitcher ->
            Page
                { model
                    | isThemeSwitcherOpen = False
                    , focusedTheme = Nothing
                }
                main
                |> Effect.withNone

        FocusedThemeChanged maybeTheme ->
            Page { model | focusedTheme = maybeTheme } main |> Effect.withNone

        CloseAllMenus ->
            Page
                { model
                    | isMenuOpen = False
                    , isThemeSwitcherOpen = False
                    , focusedTheme = Nothing
                }
                main
                |> Effect.withNone

        FocusNode id ->
            ( page, Effect.focusNode id )

        ReplaceTheme theme ->
            ( Page
                { model
                    | isThemeSwitcherOpen = False
                    , focusedTheme = Nothing
                }
                main
            , Effect.replaceTheme theme
            )

        GotMainMsg mainMsg ->
            -- TODO: Implement this in a way that's generic over all pages.
            case ( mainMsg, main ) of
                ( GotContactMsg contactMsg, Contact subModel ) ->
                    let
                        ( newSubModel, effect ) =
                            Contact.update contactMsg subModel
                                |> Tuple.mapSecond (Effect.map GotContactMsg)
                    in
                    ( Page model (Contact newSubModel), Effect.map GotMainMsg effect )

                ( _, _ ) ->
                    page |> Effect.withNone



-- SUBSCRIPTIONS


{-| Subscriptions.
-}
subscriptions : Page -> Sub Msg
subscriptions (Page model main) =
    Sub.batch
        [ if model.isMenuOpen then
            onResize
                (\width _ ->
                    if width >= 640 then
                        CloseMenu

                    else
                        NoOp
                )

          else
            Sub.none
        , case main of
            Blank ->
                Sub.none

            Home ->
                Sub.none

            About ->
                Sub.none

            Projects ->
                Sub.none

            Contact subModel ->
                Contact.subscriptions subModel
                    |> Sub.map (GotMainMsg << GotContactMsg)

            NotFound ->
                Sub.none
        ]



-- VIEW


{-| View a page.
-}
view : Env -> Session -> Page -> Document Msg
view env session ((Page model main) as page) =
    let
        wrapStaticDocument : Document Never -> Document Msg
        wrapStaticDocument =
            staticDocument >> wrapDocument model env session page

        mapAndWrapDocument : (msg -> MainMsg) -> Document msg -> Document Msg
        mapAndWrapDocument toMainMsg =
            mapDocument (toMainMsg >> GotMainMsg)
                >> wrapDocument model env session page
    in
    case main of
        Blank ->
            wrapStaticDocument Blank.view

        Home ->
            wrapStaticDocument Home.view

        About ->
            wrapStaticDocument About.view

        Projects ->
            wrapStaticDocument Projects.view

        Contact subModel ->
            mapAndWrapDocument GotContactMsg <| Contact.view subModel

        NotFound ->
            wrapStaticDocument NotFound.view


{-| Embed a static [`Browser.Document`].

This is analogous to [`Html.Extra.static`].

[`Browser.Document`]: /packages/elm/browser/latest/Browser#Document "elm/browser · Browser.Document"
[`Html.Extra.static`]: /packages/elm-community/html-extra/latest/Html-Extra#static "elm-community/html-extra · Html.Extra.static"

-}
staticDocument : Document Never -> Document Msg
staticDocument =
    mapDocument (always NoOp)


{-| Transform the messages produced by a [`Browser.Document`].

This is analogous to [`Html.map`].

[`Browser.Document`]: /packages/elm/browser/latest/Browser#Document "elm/browser · Browser.Document"
[`Html.map`]: /packages/elm/html/latest/Html#map "elm/html · Html.map"

-}
mapDocument : (msg1 -> msg2) -> Document msg1 -> Document msg2
mapDocument mapMsg { title, body } =
    { title = title, body = List.map (Html.map mapMsg) body }


{-| Wrap the [`Browser.Document`] of a particular [`Main`] page with the common
elements that surround the main content.

[`Browser.Document`]: /packages/elm/browser/latest/Browser#Document "elm/browser · Browser.Document"
[`Main`]: #Main

-}
wrapDocument : Model -> Env -> Session -> Page -> Document Msg -> Document Msg
wrapDocument model env session page { title, body } =
    { title = wrapTitle title
    , body =
        [ View.root
            { deviceInfo = Env.deviceInfo env
            , currentTheme = session |> Session.settings |> .theme
            , noop = NoOp
            , closeAllMenus = CloseAllMenus
            }
          <|
            viewHeader model session page
                ++ wrapMainContent body
                ++ View.footer
        ]
    }


{-| Wrap the title of a page with the name of the site.
-}
wrapTitle : String -> String
wrapTitle title =
    [ title, siteName ] |> List.filterNot String.isEmpty |> String.join " · "


{-| The name of the website.
-}
siteName : String
siteName =
    "nisavid.io"


{-| View the page header.
-}
viewHeader : Model -> Session -> Page -> List (Html Msg)
viewHeader { isMenuOpen, isThemeSwitcherOpen, focusedTheme } session page =
    View.header
        { isMenuOpen = isMenuOpen
        , openMenu = OpenMenu
        , closeMenu = CloseMenu
        , noop = NoOp
        }
        { currentTheme = session |> Session.settings |> .theme
        , isThemeSwitcherOpen = isThemeSwitcherOpen
        , openThemeSwitcher = OpenThemeSwitcher
        , closeThemeSwitcher = CloseThemeSwitcher
        , focusedTheme = focusedTheme
        , focusedThemeChanged = FocusedThemeChanged
        , focusNode = FocusNode
        , replaceTheme = ReplaceTheme
        , noop = NoOp
        }
        (viewMenuItems page)


{-| View the menu items.
-}
viewMenuItems : Page -> List (Html msg)
viewMenuItems page =
    List.map (viewMenuItemForRoute page) menuRoutesList


{-| The [`Route`]s that are listed in the menu.

[`Route`]: Route#Route

-}
menuRoutesList : List Route
menuRoutesList =
    [ Route.Home, Route.About, Route.Projects, Route.Contact ]


{-| View the menu item for a [`Route`].

[`Route`]: Route#Route

-}
viewMenuItemForRoute : Page -> Route -> Html msg
viewMenuItemForRoute currentPage route =
    View.menuItem (isCurrentRoute currentPage route)
        route
        (menuLabelForRoute route)


{-| Determine whether a [`Route`] corresponds to the current [`Page`].

[`Route`]: Route#Route
[`Page`]: #Page

-}
isCurrentRoute : Page -> Route -> Bool
isCurrentRoute (Page _ currentMain) route =
    case ( currentMain, route ) of
        ( Home, Route.Home ) ->
            True

        ( _, Route.Home ) ->
            False

        ( About, Route.About ) ->
            True

        ( _, Route.About ) ->
            False

        ( Projects, Route.Projects ) ->
            True

        ( _, Route.Projects ) ->
            False

        ( Contact _, Route.Contact ) ->
            True

        ( _, Route.Contact ) ->
            False


{-| Get the label text for a [`Route`]'s menu item.

[`Route`]: Route#Route

-}
menuLabelForRoute : Route -> String
menuLabelForRoute route =
    case route of
        Route.Home ->
            "Home"

        Route.About ->
            "About"

        Route.Projects ->
            "Projects"

        Route.Contact ->
            "Contact"


{-| Wrap the main content of a particular page.
-}
wrapMainContent : List (Html Msg) -> List (Html Msg)
wrapMainContent content =
    View.main_ content
