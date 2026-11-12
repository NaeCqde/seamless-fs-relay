# Changes

## Unreleased (breaking: update the relay and all `sfs` servers together)

- Each server has its own token; the relay keeps only its SHA-256 (`SERVERS`). A server can register only its own address; the relay sends only to the addresses in `SERVERS` (it used to call any address that a holder of the shared token wrote), without following redirects, with a time limit.
- The relay signs what it sends to the servers (Ed25519, with the address of the server and the time in the signed text). The servers hold only the public key.
- The files of a server are cleaned: only `parent`, `name` and `size`, sorted. A server can no longer put a link of its own into the pages of the others.
- Fixes: `?first=false` counted as `first`; a bad body gave 500 (now 400/413); a wrong token gave 400 (now 401); `DELETE` did not remove the files of the server when the list of servers did not change; the whole payload was written to the log.
- The pushes go out at the same time instead of one by one, and are done after the answer.
- Split into modules; tests added.
