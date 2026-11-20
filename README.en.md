# seamless-fs-relay

English | [日本語](README.md)

A Cloudflare Worker that connects the servers of [seamless-fs](https://github.com/NaeCqde/seamless-fs) (`sfs`).

- Tokens are per server. The relay stores only their SHA-256.
- Calls from the relay to the servers are signed with Ed25519.

For the settings, the wire protocol and the migration from old versions, see [docs/SPEC.md](docs/SPEC.md).

```bash
pnpm install
pnpm test      # unit tests
pnpm check     # types
pnpm deploy
```
