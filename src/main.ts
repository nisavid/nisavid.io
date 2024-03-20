import "./main.css";

import * as CloudFunctions from "./cloudFunctions.js";
import * as Config from "./config.js";
import * as Device from "./device.js";
import * as Dom from "./dom.js";
import * as Storage from "./storage.js";
import * as Vitals from "./vitals.js";

if (module.hot) {
  module.hot.accept();
}

Vitals.registerHandlers();
Dom.defineProperties();

document.addEventListener("DOMContentLoaded", async () => {
  // @ts-expect-error Elm module
  const { Elm } = await import("./Main.elm");
  const elm = Elm.Main.init({
    node: document.getElementById(Config.elmRootId),
    flags: {
      deviceInfo: Device.getInfo(),
      storedState: Storage.getState(),
    },
  });

  Device.onInfoChange(elm.ports.deviceInfoChanged.send);

  if (Storage.isAvailable("localStorage")) {
    elm.ports.storeState.subscribe(Storage.setState);
    Storage.onStateChange(elm.ports.storedStateChanged.send);
  }

  elm.ports.consoleError.subscribe((args: any[]) => {
    console.error(...args);
  });

  elm.ports.checkValidity.subscribe((id: string) => {
    Dom.checkValidity(id).then((validity: ValidityState) => {
      elm.ports.checkValidityResult.send({
        id: id,
        success: true,
        validity: validity,
      });
    }).catch((error) => {
      elm.ports.checkValidityResult.send({
        id: id,
        success: false,
        error: error,
      });
    });
  });

  elm.ports.callSendContactFormEmail.subscribe(
    (email: CloudFunctions.ContactFormEmailParams) => {
      CloudFunctions.callSendContactFormEmail(email).then(() => {
        elm.ports.callSendContactFormEmailResult.send({ success: true });
      }).catch((error) => {
        elm.ports.callSendContactFormEmailResult.send({
          success: false,
          error: error,
        });
      });
    },
  );
});
