# Contributing to Rovant

Thank you for contributing! Rovant is built by the community for robotics engineers.

## Getting Started

```bash
git clone https://github.com/octaboomai/rovant
cd rovant && yarn install
yarn workspace o1-extension build
yarn workspace o1-app start
```

## Pull Request Guidelines

1. **Branch naming:** `feat/...`, `fix/...`, `docs/...`, `chore/...`
2. **Commits:** Use [Conventional Commits](https://www.conventionalcommits.org/)
3. **Tests required:** New features need tests. Run `cd tests && yarn test`
4. **TypeScript:** No `any` without comment. Prefer explicit return types.
5. **One concern per PR:** Keep PRs focused and small.

## Project Structure

```
o1-app/src/          Electron main process
o1-extension/src/
  browser/           Theia browser-side widgets
  node/              Theia backend REST API
  common/            Shared types and utilities
tests/
  unit/              Jest unit tests
  integration/       Integration tests (real HTTP)
docs/                Architecture, security, deployment
scripts/             Build and install scripts
resources/           App icons, NSIS config, LICENSE
website/             Marketing site (GitHub Pages)
```

## Testing

```bash
cd tests
yarn test          # all tests + coverage
yarn test:unit     # unit only
yarn test:integration  # integration only
```

Target: 80% line coverage.

## Code of Conduct

Be respectful. Follow [Contributor Covenant](https://www.contributor-covenant.org/).

## Questions?

Open a [Discussion](https://github.com/octaboomai/rovant/discussions) or join the [Discord](https://discord.gg/o1ide).
