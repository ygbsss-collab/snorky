(function (global) {
  "use strict";

  const TEST_MODE_ALLOW_DUPLICATE_USERS = true;

  global.SNORKYTestMode = Object.freeze({
    TEST_MODE_ALLOW_DUPLICATE_USERS
  });
})(typeof window !== "undefined" ? window : globalThis);
