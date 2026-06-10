---
'@mysten/pas': minor
---

Add `beginSendObject` / `beginSendBalance` intents that resolve accounts + `new_auth` + the send call and return the raw `Request` hot potato for custom resolution (no approval templates, no `resolve`), plus `PASClient.deriveObjectPolicyAddress` for unwrapped object policy types.
