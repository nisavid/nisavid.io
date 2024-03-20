module Page.Contact exposing
    ( Model, init
    , Msg, update
    , subscriptions
    , view
    )

{-| The _Contact Me_ page.


# Data Model

@docs Model, init


# Messages

@docs Msg, update


# Subscriptions

@docs subscriptions


# View

@docs view

-}

import Basics.Extra exposing (flip)
import Browser exposing (Document)
import Dict exposing (Dict)
import Effect exposing (Effect)
import Html
    exposing
        ( Attribute
        , Html
        , button
        , div
        , form
        , h1
        , input
        , label
        , li
        , p
        , span
        , text
        , textarea
        , ul
        )
import Html.Attributes
    exposing
        ( attribute
        , autofocus
        , class
        , classList
        , disabled
        , for
        , id
        , name
        , placeholder
        , rows
        , spellcheck
        , type_
        , value
        )
import Html.Attributes.Aria exposing (ariaHidden)
import Html.Attributes.Autocomplete as Autocomplete
import Html.Attributes.Extra
    exposing
        ( attributeIf
        , attributeMaybe
        , autocomplete
        )
import Html.Events exposing (onBlur, onClick, onInput, onSubmit)
import Html.Extra exposing (nothing, viewIfLazy)
import Interop
import List.Extra as List
import Maybe.Extra as Maybe
import Validation
    exposing
        ( Constraint(..)
        , ConstraintViolation(..)
        , CustomConstraint(..)
        , StandardConstraint(..)
        , StandardSyntax(..)
        , Validity(..)
        , constraintViolationErrorMessage
        , customConstraintIsSatisfied
        , stdConstraintToAttr
        )
import Validation.Interop
    exposing
        ( ValidityState
        , constraintViolationsFromValidityState
        , customValidity
        )



-- DATA MODEL


{-| The data model.
-}
type alias Model =
    { form : FormModel
    }


{-| The data model for the form.
-}
type alias FormModel =
    { state : FormState
    , name : FormFieldModel
    , email : FormFieldModel
    , subject : FormFieldModel
    , body : FormFieldModel
    }


{-| The state of the form.
-}
type FormState
    = Virgin
    | SubmitRequested
    | Submitting
    | SubmitSucceeded
    | SubmitFailed


{-| The data model for a form field.
-}
type alias FormFieldModel =
    { value : String
    , validity : Maybe Validity
    }


{-| A form field.
-}
type FormField
    = Name
    | Email
    | Subject
    | Body


{-| A form field HTML element.
-}
type FormFieldElement
    = InputElement
    | TextareaElement


{-| Initial data model.
-}
init : Model
init =
    { form =
        { state = Virgin
        , name = initFormField
        , email = initFormField
        , subject = initFormField
        , body = initFormField
        }
    }


{-| Initial form field data model.
-}
initFormField : FormFieldModel
initFormField =
    { value = ""
    , validity = Nothing
    }


{-| Update the form state.
-}
updateFormState : FormState -> Model -> Model
updateFormState state model =
    let
        formModel : FormModel
        formModel =
            model.form
    in
    { model | form = { formModel | state = state } }


{-| Get the data model for a form field.
-}
formFieldModel : FormField -> Model -> FormFieldModel
formFieldModel field model =
    case field of
        Name ->
            model.form.name

        Email ->
            model.form.email

        Subject ->
            model.form.subject

        Body ->
            model.form.body


{-| Get the value of a form field.
-}
formFieldValue : FormField -> Model -> String
formFieldValue field model =
    formFieldModel field model |> .value


{-| Update the value of a form field.
-}
updateFormFieldValue : FormField -> String -> Model -> Model
updateFormFieldValue field value model =
    let
        formModel : FormModel
        formModel =
            model.form

        newFormFieldModel : FormFieldModel
        newFormFieldModel =
            { value = value
            , validity = Nothing
            }
    in
    { model
        | form =
            case field of
                Name ->
                    { formModel | name = newFormFieldModel }

                Email ->
                    { formModel | email = newFormFieldModel }

                Subject ->
                    { formModel | subject = newFormFieldModel }

                Body ->
                    { formModel | body = newFormFieldModel }
    }


{-| Update the validity of a form field.
-}
updateFormFieldValidity : FormField -> Validity -> Model -> Model
updateFormFieldValidity field validity model =
    let
        formModel : FormModel
        formModel =
            model.form

        value : String
        value =
            formFieldValue field model

        newFormFieldModel : FormFieldModel
        newFormFieldModel =
            { value = value
            , validity = Just validity
            }
    in
    { model
        | form =
            case field of
                Name ->
                    { formModel | name = newFormFieldModel }

                Email ->
                    { formModel | email = newFormFieldModel }

                Subject ->
                    { formModel | subject = newFormFieldModel }

                Body ->
                    { formModel | body = newFormFieldModel }
    }



-- FORM FIELDS


{-| The list of form fields.
-}
formFieldList : List FormField
formFieldList =
    [ Name, Email, Subject, Body ]


{-| Get the HTML element for a form field.
-}
formFieldElement : FormField -> FormFieldElement
formFieldElement field =
    case field of
        Name ->
            InputElement

        Email ->
            InputElement

        Subject ->
            InputElement

        Body ->
            TextareaElement


{-| Get the validation constraints for a form field.
-}
formFieldConstraints : FormField -> List Constraint
formFieldConstraints field =
    case field of
        Name ->
            [ StandardConstraint Required
            , StandardConstraint <| MaxLength 100
            , CustomConstraint NotBlank
            ]

        Email ->
            [ StandardConstraint Required
            , StandardConstraint <| StandardSyntax EmailSyntax
            , StandardConstraint <| MaxLength 254
            , CustomConstraint NotBlank
            , CustomConstraint ValidEmail
            ]

        Subject ->
            [ StandardConstraint Required
            , StandardConstraint <| MaxLength 150
            , CustomConstraint NotBlank
            ]

        Body ->
            [ StandardConstraint Required
            , StandardConstraint <| MaxLength 1000
            , CustomConstraint NotBlank
            ]


{-| Get the autocompletion setting for a form field.
-}
formFieldAutocomplete : FormField -> Autocomplete.Completion
formFieldAutocomplete field =
    case field of
        Name ->
            Autocomplete.Detailed Autocomplete.Name

        Email ->
            Autocomplete.Detailed <|
                Autocomplete.Contact Nothing <|
                    Autocomplete.Email

        Subject ->
            Autocomplete.Off

        Body ->
            Autocomplete.Off


{-| Get the spellcheck setting for a form field.
-}
formFieldSpellcheck : FormField -> Bool
formFieldSpellcheck field =
    List.member field [ Subject, Body ]



-- MESSAGES


{-| A message.
-}
type Msg
    = NoOp
    | Input FormField String
    | CheckValidity FormField
    | GotCheckValidityResult Interop.CheckValidityResult
    | ClickedSubmit
    | Submit
    | GotSubmitResult Interop.VoidResult
    | ClickedReset


{-| Handle a message.
-}
update : Msg -> Model -> ( Model, Effect Msg )
update msg model =
    case msg of
        NoOp ->
            model |> Effect.withNone

        Input field value ->
            updateFormFieldValue field value model |> Effect.withNone

        CheckValidity field ->
            ( model, Effect.checkValidity <| formFieldId field )

        GotCheckValidityResult result ->
            case result of
                Ok { id, validity } ->
                    case Dict.get id formFieldById of
                        Just field ->
                            model
                                |> updateFormFieldValidity field
                                    (generateFormFieldValidity field validity model)
                                |> Effect.withNone

                        Nothing ->
                            model |> Effect.withNone

                Err err ->
                    ( model, Effect.consoleErrorCheckValidityError err )

        ClickedSubmit ->
            ( model |> updateFormState SubmitRequested
            , Effect.batch <|
                List.map (Effect.checkValidity << formFieldId) formFieldList
            )

        Submit ->
            ( model |> updateFormState Submitting
            , Effect.callSendContactFormEmail
                { name = formFieldValue Name model
                , email = formFieldValue Email model
                , subject = formFieldValue Subject model
                , body = formFieldValue Body model
                }
            )

        GotSubmitResult result ->
            case result of
                Ok () ->
                    model |> updateFormState SubmitSucceeded |> Effect.withNone

                Err err ->
                    ( model |> updateFormState SubmitFailed
                    , Effect.consoleErrorInteropError err
                    )

        ClickedReset ->
            ( init, Effect.focusNode <| formFieldId Name )


{-| Generate the validity for a form field.
-}
generateFormFieldValidity : FormField -> ValidityState -> Model -> Validity
generateFormFieldValidity field validityState model =
    let
        constraints : List Constraint
        constraints =
            formFieldConstraints field

        validityStateViolations : List ConstraintViolation
        validityStateViolations =
            constraintViolationsFromValidityState constraints validityState

        customViolations : List ConstraintViolation
        customViolations =
            generateFormFieldCustomConstraintViolations field model
    in
    if List.isEmpty validityStateViolations && List.isEmpty customViolations then
        Valid

    else
        Invalid (validityStateViolations ++ customViolations)


{-| Generate the custom constraint violations for a form field.
-}
generateFormFieldCustomConstraintViolations : FormField -> Model -> List ConstraintViolation
generateFormFieldCustomConstraintViolations field model =
    let
        fieldModel : FormFieldModel
        fieldModel =
            formFieldModel field model

        value : String
        value =
            fieldModel.value

        customConstraints : List CustomConstraint
        customConstraints =
            formFieldConstraints field
                |> List.filterMap
                    (\constraint ->
                        case constraint of
                            CustomConstraint customConstraint ->
                                Just customConstraint

                            _ ->
                                Nothing
                    )
    in
    customConstraints
        |> List.filterNot (flip customConstraintIsSatisfied value)
        |> List.map (ConstraintViolation << CustomConstraint)



-- SUBSCRIPTIONS


{-| Subscriptions.
-}
subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch <|
        List.concat
            [ if List.member model.form.state [ Virgin, SubmitRequested ] then
                [ Interop.checkValidityResult GotCheckValidityResult ]

              else
                []
            , if model.form.state == Submitting then
                [ Interop.callSendContactFormEmailResult GotSubmitResult ]

              else
                []
            ]



-- VIEW


{-| View the page.
-}
view : Model -> Document Msg
view model =
    { title = "Contact Me"
    , body =
        [ h1 [] [ text "Contact me" ]
        , p [] [ text "To get in touch, send me an email by submitting this form." ]
        , viewForm model
        ]
    }


{-| View the form.
-}
viewForm : Model -> Html Msg
viewForm model =
    form
        [ id formId
        , classList
            [ ( "contact", True )
            , ( "virgin", model.form.state == Virgin )
            ]
        , onSubmit Submit
        ]
    <|
        (formFieldList |> List.concatMap (flip viewFormField model))
            ++ [ viewFormActions model
               , viewFormStatus model
               ]


{-| View a form field.
-}
viewFormField : FormField -> Model -> List (Html Msg)
viewFormField field model =
    let
        fieldModel : FormFieldModel
        fieldModel =
            formFieldModel field model

        fieldName : String
        fieldName =
            formFieldName field

        fieldElement : List (Attribute Msg) -> List (Html Msg) -> Html Msg
        fieldElement =
            case formFieldElement field of
                InputElement ->
                    input

                TextareaElement ->
                    textarea

        ariaAttrs : List (Attribute Msg)
        ariaAttrs =
            case fieldModel.validity of
                Just (Invalid _) ->
                    [ attribute "aria-invalid" "true"
                    , attribute "aria-errormessage" <| formFieldErrorsId field
                    ]

                _ ->
                    []

        shouldDisable : Bool
        shouldDisable =
            not <|
                List.member model.form.state
                    [ Virgin, SubmitRequested, SubmitFailed ]

        constraintViolations : List ConstraintViolation
        constraintViolations =
            case fieldModel.validity of
                Just (Invalid violations) ->
                    violations

                _ ->
                    []

        shouldShowErrors : Bool
        shouldShowErrors =
            not <| List.isEmpty constraintViolations
    in
    [ div [ class "label-wrapper" ] <|
        [ label [ for fieldName ] [ text <| formFieldLabel field ]
        , viewIfLazy shouldShowErrors (\_ -> div [ class "errors-spacer" ] [])
        ]
    , div [ class "input-wrapper" ] <|
        [ fieldElement
            ([ id <| formFieldId field
             , name fieldName
             , attributeMaybe type_ <| formFieldType field
             , placeholder <| formFieldPlaceholder field
             , value <| fieldModel.value
             , attributeIf shouldDisable <| disabled True
             , attributeIf (field == Name) <| autofocus True
             , attributeIf (field == Body) <| rows 6
             ]
                ++ ariaAttrs
                ++ formFieldConstraintAttrs field
                ++ [ autocomplete <| formFieldAutocomplete field
                   , spellcheck <| formFieldSpellcheck field
                   , onInput <| Input field
                   , onBlur <| CheckValidity field

                   -- TODO: Set a list of disjoint constraint violations
                   --, customValidity
                   --     (constraintViolations
                   --         |> List.map constraintViolationErrorString
                   --         |> String.join "\n\n"
                   --     )
                   , customValidity
                        (List.head constraintViolations
                            |> Maybe.unwrap "" constraintViolationErrorMessage
                        )
                   ]
            )
            []
        , viewIfLazy shouldShowErrors
            (\_ ->
                div [ class "errors" ]
                    [ span [ class "material-symbols-outlined" ]
                        [ text "error" ]
                    , ul [ id <| formFieldErrorsId field ]
                        -- TODO: Display a list of disjoint constraint violations
                        --<| List.map viewConstraintViolation constraintViolations
                        (List.head constraintViolations
                            |> Maybe.unwrap []
                                (viewConstraintViolation >> List.singleton)
                        )
                    ]
            )
        ]
    ]
        |> (if field == Body then
                -- Wrap the `textarea` in a `div` to prevent the `onInput`
                -- attribute from being erroneously applied to the preceding
                -- `input` element.
                --
                -- TODO: Investigate whether this is a bug in `elm/html`.
                div [] >> List.singleton

            else
                identity
           )


{-| Get the label text for a form field.
-}
formFieldLabel : FormField -> String
formFieldLabel field =
    case field of
        Name ->
            "Name"

        Email ->
            "Email"

        Subject ->
            "Subject"

        Body ->
            "Body"


{-| Get the placeholder text for a form field.
-}
formFieldPlaceholder : FormField -> String
formFieldPlaceholder field =
    case field of
        Name ->
            "Your name"

        Email ->
            "Your email address"

        Subject ->
            "Message subject"

        Body ->
            "Message body"


{-| View the form actions.
-}
viewFormActions : Model -> Html Msg
viewFormActions model =
    div [ class "actions" ]
        [ button
            [ type_ "submit"
            , disabled <|
                List.member model.form.state
                    [ Submitting, SubmitSucceeded ]
            , onClick ClickedSubmit
            ]
            [ span [ class "label" ] [ text "Send" ]
            , span
                [ class "icon material-symbols-outlined"
                , ariaHidden True
                ]
                [ text "send" ]
            ]
        , viewIfLazy (model.form.state == SubmitSucceeded)
            (\_ ->
                button
                    [ type_ "reset"
                    , onClick ClickedReset
                    ]
                    [ span
                        [ class "icon material-symbols-outlined"
                        , ariaHidden True
                        ]
                        [ text "restart_alt" ]
                    , span [ class "label" ] [ text "Reset" ]
                    ]
            )
        ]


{-| The displayed status of the form.
-}
type FormDisplayStatus
    = DisplayStatusInvalid
    | DisplayStatusSubmitting
    | DisplayStatusSucceeded
    | DisplayStatusFailed


{-| View the form status.
-}
viewFormStatus : Model -> Html Msg
viewFormStatus model =
    let
        displayStatusInvalid : Bool
        displayStatusInvalid =
            model.form.state
                == SubmitRequested
                && List.any
                    (\field ->
                        (formFieldModel field model |> .validity) /= Just Valid
                    )
                    formFieldList

        maybeDisplayStatus : Maybe FormDisplayStatus
        maybeDisplayStatus =
            if displayStatusInvalid then
                Just DisplayStatusInvalid

            else
                case model.form.state of
                    Submitting ->
                        Just DisplayStatusSubmitting

                    SubmitSucceeded ->
                        Just DisplayStatusSucceeded

                    SubmitFailed ->
                        Just DisplayStatusFailed

                    _ ->
                        Nothing
    in
    case maybeDisplayStatus of
        Just displayStatus ->
            let
                ( statusClass, iconName, message ) =
                    case displayStatus of
                        DisplayStatusInvalid ->
                            ( "invalid"
                            , "error"
                            , "Please correct the errors and try again."
                            )

                        DisplayStatusSubmitting ->
                            ( "submitting"
                            , "progress_activity"
                            , "Sending…"
                            )

                        DisplayStatusSucceeded ->
                            ( "succeeded"
                            , "mark_email_read"
                            , "Message sent."
                            )

                        DisplayStatusFailed ->
                            ( "failed"
                            , "error"
                            , "Failed to send your message."
                            )
            in
            div
                [ class <| "status " ++ statusClass ]
                [ span [ class "material-symbols-outlined", ariaHidden True ]
                    [ text iconName ]
                , span [ class "message" ]
                    [ text message ]
                ]

        Nothing ->
            nothing



-- VIEW | IDENTIFIERS


{-| The form element ID.
-}
formId : String
formId =
    "contact-form"


{-| Get the internal name of a form field.
-}
formFieldName : FormField -> String
formFieldName field =
    case field of
        Name ->
            "name"

        Email ->
            "email"

        Subject ->
            "subject"

        Body ->
            "body"


{-| Get the element ID of a form field.
-}
formFieldId : FormField -> String
formFieldId field =
    formId ++ "-" ++ formFieldName field


{-| A dictionary of form fields by element ID.
-}
formFieldById : Dict String FormField
formFieldById =
    formFieldList
        |> List.map (\field -> ( formFieldId field, field ))
        |> Dict.fromList


{-| Get the element ID of the errors element for a form field.
-}
formFieldErrorsId : FormField -> String
formFieldErrorsId field =
    formFieldId field ++ "-errors"



-- VIEW | CONSTRAINTS


{-| Get the `type` attribute value for a form field.
-}
formFieldType : FormField -> Maybe String
formFieldType field =
    case formFieldElement field of
        InputElement ->
            let
                isStdSyntaxConstraint : Constraint -> Bool
                isStdSyntaxConstraint constraint =
                    case constraint of
                        StandardConstraint (StandardSyntax _) ->
                            True

                        _ ->
                            False

                hasSyntaxType : Bool
                hasSyntaxType =
                    formFieldConstraints field |> List.any isStdSyntaxConstraint
            in
            if hasSyntaxType then
                -- The `type` attribute will be included in the
                -- `formFieldConstraintAttrs`
                Nothing

            else
                Just "text"

        TextareaElement ->
            Nothing


{-| Get the list of attributes for a form field's validation constraints.
-}
formFieldConstraintAttrs : FormField -> List (Attribute msg)
formFieldConstraintAttrs field =
    formFieldConstraints field
        |> List.filterMap
            (\constraint ->
                case constraint of
                    StandardConstraint builtinConstraint ->
                        Just <| stdConstraintToAttr builtinConstraint

                    CustomConstraint _ ->
                        Nothing
            )


{-| View a constraint violation.
-}
viewConstraintViolation : ConstraintViolation -> Html msg
viewConstraintViolation violation =
    li [] <| constraintViolationErrorHtml violation


{-| Get the HTML elements for a constraint violation.
-}
constraintViolationErrorHtml : ConstraintViolation -> List (Html msg)
constraintViolationErrorHtml violation =
    [ text <| constraintViolationErrorMessage violation ]
