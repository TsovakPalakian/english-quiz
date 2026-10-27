# CI/CD Fix: Paravirtual Video Scaler in inspect-quiz-media

## Problem Summary
In GitHub Actions CI on `macos-15-arm64` virtual machines, `test-quiz-media-preview.mjs` failed with:
`cause: 'IOServiceMatchingfailed for: AppleM2ScalerParavirtDriver\nNo decodable media samples.\n'`
The failure was caused by `ops/inspect-quiz-media.m` configuring `AVAssetReaderTrackOutput` with `kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA)`. The guest macOS kernel inside Apple Virtualization framework cannot match the paravirtualized hardware scaler driver (`AppleM2ScalerParavirtDriver`), failing pixel decompression and returning 0 samples.

## Implementation Steps & Stages

- 🟩 **Stage 1**: Update `ops/inspect-quiz-media.m` to avoid forcing BGRA conversion via hardware scaler, using native track sample output (`outputSettings: nil`) for video track verification.
- 🟩 **Stage 2**: Compile and test `ops/inspect-quiz-media.m` locally via `test-quiz-media-preview.mjs`.
- 🟩 **Stage 3**: Run full check suite (`npm run check -- --mode=ci`) to verify zero regressions (165 scripts passed, 0 failed).
- 🟩 **Stage 4**: Mark all checklist items green `🟩` and provide commit message.
