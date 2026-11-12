# seamless-fs-relay

[seamless-fs](https://github.com/NaeCqde/seamless-fs)(`sfs`)のサーバー同士をつなぐ Cloudflare Worker。

- トークンはサーバーごと。リレーにはそのSHA-256だけを置く。
- リレーからサーバーへの呼び出しは、Ed25519 で署名する。

設定、通信の仕様、古い版からの移行は [docs/SPEC.md](docs/SPEC.md)。

```bash
pnpm install
pnpm test      # 単体テスト
pnpm check     # 型
pnpm deploy
```
