module Page.About exposing (view)

{-| The _About Me_ page.


# View

@docs view

-}

import Browser exposing (Document)
import Html exposing (h1, p, text)



-- VIEW


{-| View the page.
-}
view : Document Never
view =
    { title = "About Me"
    , body =
        [ h1 [] [ text "About me" ]
        , p [] [ text """
Professionally, I am a software engineer.  My most extensive experience
comprises backend web development, distributed data processing,
and developer tooling.  Recently, I've been expanding my frontier into
full-stack web development.  I've also dabbled in desktop applications
and systems programming.  My preferred languages are Elm, Python, Rust,
and Zsh; I also know my way around C, C++, JavaScript, Lua, POSIX sh, Ruby,
and TypeScript.  My work style innately leans toward favoring product quality
(i.e. correctness, usability, reliability, maintainability, extensibility,
performance, presentation, and so on) over quick-and-dirty rapid delivery.
Presently, I'm seeking a new venture to which I shall dedicate my engineering
efforts.
        """ ]
        , p [] [ text """
When I'm not crafting software or tinkering with it, I immerse myself
in an ever-growing assortment of hobbies: cooking, running, home improvement,
gaming, music shows, hiking, snowboarding, woodworking, gardening…
As with software, my style in those endeavors tends to favor doing things
meticulously and laboriously in pursuit of greater rewards.
""" ]
        , p []
            [ text """
In a nutshell, I like to learn, to analyze, to solve problems, to make things,
to adapt myself to my environment and vice versa, and to enjoy myself
while I'm at it.  I'm never bored.
"""
            ]
        ]
    }
