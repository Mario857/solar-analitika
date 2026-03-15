# Solar Analitika - Project Rules

## Stack
- Next.js 16 (App Router), React 19, TypeScript 5
- Chart.js with react-chartjs-2 for visualizations
- CSS custom properties dark theme (no Tailwind utility classes for styling)
- localStorage for client state (no external state library)
- npm as package manager
- Vercel deployment target

## Architecture
- **API routes** (`src/app/api/`) proxy requests to HEP and FusionSolar APIs to solve CORS
- **Client-side SPA** — all dashboard logic runs client-side with `"use client"`
- **No database** — config stored in localStorage, data fetched fresh each analysis

## Code Rules

### Descriptive Variable Names
All variables, interfaces, and fields must have clear, self-documenting names. Never use single-letter or cryptic abbreviations. Domain terms (Croatian energy billing) should use English descriptive equivalents in code.
```tsx
// Good
const totalFeedInKwh = 42.5;
const peakGenerationKw = 3.8;
interface DailyEnergyData { feedInKwh: number; consumedKwh: number; }

// Bad
const tP = 42.5;
const gp = 3.8;
interface DayData { gk: number; ck: number; }
```

### No Rendering Conditionals in JSX
Never use inline ternaries or `&&` for conditional rendering inside JSX. Extract to a named `const` before the return statement.
```tsx
// Good
const content = isReady ? <Ready /> : <Loading />;
return <div>{content}</div>;

// Bad
return <div>{isReady ? <Ready /> : <Loading />}</div>;
```

### Props Interface for 3+ Props
Components with 3+ props must define a named `interface`.

### Absolute Imports Only
Always use `@/` alias. Never use relative imports (`./` or `../`).

### IIFE Over Nested Ternaries
Use an IIFE with early returns instead of nested ternaries.

### Prefer Simplicity
Always prefer the simplest solution. Avoid over-engineering and unnecessary abstractions.

### No TypeScript Type Hacks
Never use `as` type assertions to work around type errors. Fix the actual types.

### Meaningful Comments
Comment **why**, not what. Domain-specific Croatian energy terms deserve inline explanations.

## Naming Conventions
- **camelCase** for variables and functions
- **UPPER_SNAKE_CASE** for constants
- **PascalCase** for components, types, interfaces
- **Booleans**: prefix with `is`, `has`, `should`

## File Structure
```
src/
├── app/
│   ├── api/          # Proxy routes (HEP, FusionSolar)
│   ├── globals.css   # Dark theme with CSS custom properties
│   ├── layout.tsx    # Root layout with fonts
│   └── page.tsx      # Main SPA entry (client component)
├── components/       # All UI components
│   ├── ChartSetup.ts # Chart.js registration and shared options
│   └── *.tsx         # Dashboard panel components
└── lib/
    ├── types.ts      # All TypeScript interfaces
    ├── config.ts     # Default config, localStorage helpers, API URLs
    └── calculations.ts # Energy processing, billing, derived metrics
```

## Domain Context
- **HEP** = Hrvatska elektroprivreda (Croatian electricity provider)
- **FusionSolar** = Huawei solar inverter monitoring platform
- **Net billing** = Croatian solar billing model (feed-in offsets consumption)
- **VT/NT** = Visa/Niza tarifa (high/low tariff periods)
- **JT** = Jednotarifni (single tariff model)
- **OIE** = Obnovljivi izvori energije (renewable energy surcharge)
- **PDV** = Porez na dodanu vrijednost (VAT)
