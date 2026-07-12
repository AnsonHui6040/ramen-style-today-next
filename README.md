# Ramen Style Today Next

`ramen-style-today-next` 是 Ramen Style Today 的下一代 monorepo。它會以分批遷移方式重建分類底層架構，讓規則更容易修改、驗證、追蹤和除錯，同時保留現有產品流程與結果行為。

## Current status

Batch 1 compiler foundation 已完成實作，正在執行本地與 GitHub Actions acceptance gate。現階段所有分類內容仍是 synthetic proof inventory，不是正式問卷或評分資料；production migration 只會在 Batch 2A 開始。

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
