# Fix PC & Mobile Tab Selector (`Popular`, `This Season`, `Top Rated`) With Exact Card Limits (`9` on Mobile, `15` on PC)

Ensure Mobile always fetches **9** anime cards (`/anime?section=${activeTab}&limit=9`) and PC always fetches **15** anime cards (`/anime?section=${activeTab}&limit=15`) for `Popular`, `This Season`, and `Top Rated`, without Mobile ever fetching 15 and slicing 9.

## User Review & Critical Decisions

> [!IMPORTANT]
> Updated per your revision:
> - **Mobile Always Fetches 9 Cards**: On Mobile (`< 1024px`), the query always requests `/anime?section=${activeTab}&limit=9` to match the 3×3 mobile grid (never fetching 15 on mobile).
> - **PC Always Fetches 15 Cards**: On PC (`>= 1024px` or inside the `1280×720` PC Display), the query always requests `/anime?section=${activeTab}&limit=15` to match the 5×3 PC grid on the left side of the Top 10 list.

## 1. Overview & Core Concept
- **What It Does**: Dynamically selects the exact `?limit=` parameter (`9` on Mobile, `15` on PC) and fires `/anime?section=${activeTab}&limit=${tabLimit}` immediately without blocking the query behind a disabled `enabled: false` state.
- **Target Audience / Persona**: Users browsing the homepage on Mobile (3×3 grid = 9 cards) and PC (5×3 grid = 15 cards).
- **Key Value**: Mobile only downloads the 9 cards it displays (`?limit=9`), PC downloads the 15 cards it displays (`?limit=15`), and neither gets stuck on the skeleton loader.

## 2. User Experience & Visual Design
- **Key User Flows**:
  - **Mobile (`< 1024px`)**: Requests `/anime?section=popular&limit=9` on load, and `/anime?section=season&limit=9` or `/anime?section=top_rated&limit=9` when switching tabs.
  - **PC (`>= 1024px` / `1280×720` PC Display)**: Requests `/anime?section=popular&limit=15` on load, and `/anime?section=season&limit=15` or `/anime?section=top_rated&limit=15` when switching tabs.
- **Visual Identity & Theme**:
  - **Mobile View**: 3 columns × 3 rows = 9 compact cards (`?limit=9`).
  - **PC View**: Left column (`65%` width) displays 5 columns × 3 rows = 15 compact cards (`?limit=15`), aligned in one row beside the right column (`35%` width) `Top 10` list.

## 3. Key Product Decisions & Trade-Offs
- **Decision 1: Separate Exact Fetch Limits (`limit=9` for Mobile, `limit=15` for PC)**
  - *Chosen Approach*: Detect PC vs. Mobile synchronously (`window.name === "anikume_pc_display_frame" || window.location.search.includes("_pc_display=1") || window.innerWidth >= 1024`) so `tabLimit` is immediately `15` on PC and `9` on Mobile, and run `useQuery` without a blocking `enabled: false` gate.
  - *Why*: Ensures Mobile strictly requests `?limit=9` and PC strictly requests `?limit=15`, while preventing React Query (`refetchOnMount: false`) from getting stuck in a disabled initial state.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌────────────────────────────────────────────────────────────────────────┐
│                            Homepage (Home)                             │
│                                                                        │
│  isDesktop ──► true on PC (>=1024px / PC Display)  ──► tabLimit = 15   │
│            ──► false on Mobile (<1024px)           ──► tabLimit = 9    │
│                                                                        │
│  useQuery(["anime-section", activeTab, tabLimit])                      │
│       │                                                                │
│       ├──► Mobile: GET /anime?section={activeTab}&limit=9  (9 cards)   │
│       └──► PC:     GET /anime?section={activeTab}&limit=15 (15 cards)  │
└────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - `MOBILE_CARD_LIMIT = 9` (used for mobile skeleton count and mobile `?limit=9` fetch).
  - `PC_CARD_LIMIT = 15` (used for PC skeleton count and PC `?limit=15` fetch).
  - `tabLimit`: `15` when on PC, `9` when on Mobile.
- **Interactive Component & State Mapping**:
  - Switching between `Popular`, `This Season`, and `Top Rated` calls `fetchApikumeSection(activeTab, tabLimit)` with `limit=9` on Mobile and `limit=15` on PC, caching each response in the per-session store.
