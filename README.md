# Ramen Style Today Next

`ramen-style-today-next` 是 Ramen Style Today 的下一代 monorepo。它會以分批遷移方式重建分類底層架構，讓規則更容易修改、驗證、追蹤和除錯，同時保留現有產品流程與結果行為。

## Current status

Batch 1、Batch 2A 與 Batch 2B 已完成。Batch 2A（questions and flow）把舊版 8 題、form → archetype 分支、archetype 選項限制、選擇上限、自動前進、返回跳過與完成判定遷移成純函式流程。Batch 2B（persistence and repair）在 `@ramen-style/classification-core` 加入版本化的分類 payload（schema version 1）、含舊版無版本狀態的循序 migration、建立在該流程上的確定性 repair，以及 restore 與 resume 計算；`locale`、`phase`、`savedAt`、瀏覽器 envelope 與 localStorage adapter 留待 Batch 5A。`tools/parity` 以舊版 oracle 做窮舉比對，legacy parity 與已核准的 BC-1 至 BC-4 divergence 分開記錄；本地驗證、legacy parity 與遠端 CI 證據皆已記錄在 [migration ledger](docs/migration/ledger.md)。Styles 與 policy 仍是 synthetic proof data；scoring、catalog、Finder 與 React 尚未遷移。`weight` 只作為不被解讀的 `legacyWeight` 保留，語意留待 Batch 3B。

舊版 production 與行為基準仍在 [`AnsonHui6040/ramen-style-today`](https://github.com/AnsonHui6040/ramen-style-today)，凍結比較基準為 commit `eebf00b`。

## Planned workspace

```text
apps/web/                         React UI、i18n、瀏覽器儲存、catalog 與地圖
packages/classification-core/     純 TypeScript 分類 contracts、compiler 與 runtime
tools/migration/                  舊版資料轉換與 provenance
tools/parity/                     新舊輸出比較
tools/documentation/              分類索引與 manifest 產生器
docs/                             架構、分類、決策與遷移文件
```

## Documentation

- [Architecture design](docs/superpowers/specs/2026-07-11-classification-architecture-design.md)
- [Batch 1 implementation plan](docs/superpowers/plans/2026-07-11-batch-1-compiler-foundation.md)
- [Legacy baseline](docs/migration/baseline.md)
- [Migration ledger](docs/migration/ledger.md) ([machine source](docs/migration/ledger.json))
- [Repository rules](AGENTS.md)
- [Rights notice](RIGHTS.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Migration rule

每一批只遷移一個可獨立驗證的責任範圍。新舊 parity、資料驗證、測試、lint、build 和相關文件索引全部通過後，才可進入下一批。舊 repo 在正式 cutover 前保持可部署和不受新架構影響。

## Rights

本 repository 公開供展示與審閱，但未提供開源授權。詳見 [RIGHTS.md](RIGHTS.md)。
