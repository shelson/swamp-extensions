## 2026.06.28.3

**Fixed:** Local docker commands now respect the declared `timeoutSec` via
`AbortSignal.timeout()` — previously only SSH's `ConnectTimeout` was wired. Both
local and SSH branches now convert abort/timeout to a clean error result rather
than propagating an exception.

**Fixed:** SSH base64 encoding now safely handles non-ASCII characters in
project/service names and paths (`encodeURIComponent` + `unescape` before
`btoa`).

**Changed:** Model type renamed from `@shelson/compose-refresher` to
`@shelson/docker-compose-refresher` to align with the package name. **Upgrade
note:** Update existing model definitions — change
`type: "@shelson/compose-refresher"` to
`type: "@shelson/docker-compose-refresher"` and rename the model directory from
`models/@shelson/compose-refresher/` to
`models/@shelson/docker-compose-refresher/`.
