# AI Image Web local agent instructions

Before making any code/config/content change in this repository, create a rollback backup first:

```bash
./scripts/backup-before-change.sh
```

This script commits any current uncommitted work if present, creates an annotated rollback tag named `rollback-pre-change-YYYYMMDD-HHMMSS`, and pushes `main` plus tags to `origin`.

Do not run it in the middle of an in-progress edit unless the user explicitly asks for another backup point.
Runtime data is intentionally ignored by git: `data/` and `public/uploads/`.
