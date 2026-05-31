## 1. CLI Defaults

- [x] 1.1 Enable review synthesis by default in the generated config.
- [x] 1.2 Add `--evidence-only` as an explicit no-provider scan mode.
- [x] 1.3 Make CI use the same scan synthesis default unless evidence-only/local-only mode is selected.
- [x] 1.4 Keep `--synthesize` backward compatible.

## 2. Tests

- [x] 2.1 Prove `deepclean scan` invokes configured Codex synthesis by default.
- [x] 2.2 Prove `deepclean scan --evidence-only` does not invoke a provider.
- [x] 2.3 Update deterministic scan tests to use evidence-only mode.
- [x] 2.4 Update CI synthesis policy coverage for the new default.

## 3. Documentation

- [x] 3.1 Update CLI help and README examples.
- [x] 3.2 Update privacy/trust and troubleshooting docs for the new default and escape hatch.

## 4. Verification

- [x] 4.1 Run typecheck and tests.
- [x] 4.2 Run OpenSpec validation.
- [x] 4.3 Run package/release smoke checks if practical.
