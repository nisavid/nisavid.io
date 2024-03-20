module Env exposing
    ( Env, init
    , deviceInfo, navKey
    , replaceDeviceInfo
    )

{-| The application environment.

@docs Env, init
@docs deviceInfo, navKey
@docs replaceDeviceInfo

-}

import Browser.Navigation as Nav
import Device


{-| The application environment.
-}
type Env
    = Env
        { deviceInfo : Device.Info
        , navKey : Nav.Key
        }


{-| Initialize the application environment.
-}
init : Device.Info -> Nav.Key -> Env
init deviceInfo_ navKey_ =
    Env
        { deviceInfo = deviceInfo_
        , navKey = navKey_
        }


{-| Get the device info from the application environment.
-}
deviceInfo : Env -> Device.Info
deviceInfo (Env env) =
    env.deviceInfo


{-| Get the navigation key from the application environment.
-}
navKey : Env -> Nav.Key
navKey (Env env) =
    env.navKey


{-| Replace the device info in the application environment.
-}
replaceDeviceInfo : Device.Info -> Env -> Env
replaceDeviceInfo deviceInfo_ (Env env) =
    Env { env | deviceInfo = deviceInfo_ }
