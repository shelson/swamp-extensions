## 2026.07.01.1

**Added:** Initial release. Issues Let's Encrypt certificates via ACME DNS-01
challenges, provisions `_acme-challenge` TXT records on Cloudflare through
the DNS API, polls the authoritative CF API for propagation, cleans up
challenge records after issuance, and writes cert + private key + chain to
a named vault for downstream consumption.
