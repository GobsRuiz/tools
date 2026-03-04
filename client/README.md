# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Node version

Use Node.js `>=20.0.0`.

## Typecheck

Run TypeScript validation using the local toolchain:

```bash
npm run typecheck
```

From the repository root, you can also run:

```bash
npm run typecheck
```

Do not rely on ad-hoc `npx nuxi typecheck` executions; use the project scripts above.

## Quality Checklist

Before merging code (local or CI), run:

```bash
npm run typecheck
npm run test
```

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
