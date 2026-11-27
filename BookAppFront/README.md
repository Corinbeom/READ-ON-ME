# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.


## Shared UI rules

Main screens use `components/TabScreen.tsx` and `src/styles/screenLayout.ts`: a centered web canvas up to 640px wide, 24px horizontal gutters, and a 440px maximum width for authentication forms/dialogs. Native screens keep safe area insets.

Use `src/styles/designTokens.ts` for spacing, type sizes and control dimensions. `components/ui/AppButton.tsx` provides primary, secondary, ghost and destructive buttons (minimum height 48px, compact 44px). `AppTextInput.tsx` and `FormField` keep inputs, persistent field labels, hints and validation errors consistent. `ScreenState` provides loading/empty/error presentation.

`components/navigation/MainTabBar.tsx` renders floating icon + label navigation with a 64px full-cell target, selected state and keyboard focus. Theme-aware styles live in `components/styles/MainTabBar.styles.ts`; the capsule is up to 480px wide with 16px side gutters and a 12px gap above the bottom safe area. Its normal layout space reserves the full height so lists can scroll their final items clear of the menu. Keep tab links and navigation events intact when changing its presentation. Home typing state stays inside `HomeAiPrompt`, separate from book lists.

See [UI consistency validation](qa/ui-consistency-2026-11-16.md) for the responsive and interaction checks.

## Home AI discovery

The mascot is introduced as **AI 사서 갈피**. `HomeAiPrompt` keeps its isolated typing animation in a compact introduction; search examples remain available in the search tab and AI entry screen.

The public home collection uses `GET /api/books/daily-choices`. The server selects up to three distinct titles from the active reviewed Galpi release, rotating each Korean calendar day through story, nonfiction and practical books. Guests and signed-in readers see the same selection. Picking a book shows its credited description, edition detail link and an editable topic for Galpi. The selection uses existing classifications and does not call a model. Covers use the existing ISBN edition lookup and bundled fallback.

The Galpi button prefills `/ai-books` through the `prompt` route parameter. Authentication preserves the draft using `returnTo=ai-books`. A queued or running search stays visible until it finishes.

Local verification on 2026-11-27 used a reviewed release of 176 editions. The seven Korean dates from November 27 through December 3 produced 21 distinct ISBNs. In mobile and desktop browser checks, the three choices stayed in order after refresh, the edition links matched their selections, and the selected question survived guest sign-in with zero search submissions. A simulated collection outage offered a retry and an empty response cleared the cards.

See [initial discovery validation](qa/home-ai-discovery-2026-11-16.md) and [Galpi home validation](qa/home-galpi-discovery-2026-11-18.md) for the tested flows and remaining device coverage.

Home displays up to six recently viewed editions after the themed collection. A successfully displayed detail screen moves the book to the front. History is stored on the device/browser and can be cleared from Home. Opening Home does not fetch book records for this section.

The home route exports link preview metadata with `public/galpi-share-card.png`. The web tab icon is configured in `app.json`. All web routes link to `public/apple-touch-icon.png` for iOS home-screen shortcuts and to `public/manifest.webmanifest` for web app installation on Android. Update the home URL in the preview metadata if the public website domain changes. The web build verifies the image references and installation icon sizes.

UI progress and follow-up tasks are tracked in [UI improvements](UI_IMPROVEMENTS.md). See [floating navigation validation](qa/floating-tabs-2026-11-17.md) for layout, hit targets and keyboard checks.


## Search discovery and recent queries

The search tab offers title/author search, the last eight successful queries stored on the device, and AI discovery entry points. Autocomplete does not add history. Queries can be replayed, removed individually, or cleared together. History writes are serialized to protect deletion during slow reads/writes.

`hooks/useBookSearch.ts` cancels superseded requests and ignores stale responses. Search failures are shown inline with retry; empty results have a separate state. The optional `bookApi.searchBooks` request flag `handleErrorLocally` suppresses duplicate global alerts only for callers that handle their own errors. Cancelled Axios requests never show a global alert.

See [search discovery validation](qa/search-discovery-2026-11-16.md).


## Library shelves

The library tab shows reading, to-read and completed books before reading keywords and reviews. Each shelf previews up to six books, with the full category available in a modal. Cards link to book detail only when their ISBN is valid. Missing covers have a placeholder.

Long press a book or use its more button to manage it from the shelf or full list. The menu changes reading status or confirms removal from the signed-in user's library. A successful write refreshes the library, including any open shelf list.

Reading keywords count distinct books marked as reading or completed. Selecting a keyword shows the books that informed it and can prefill AI discovery. On web, choose up to three labels for a 1080×1920 story card. The preview redraws in place, and tapping “이미지로 저장” encodes the PNG. “스토리 링크 복사” copies a public link containing the chosen labels. The linked page shows up to three matches from the catalog and opens their book details without signing in. Older keyword responses can still show counts and be used to create cards.

An empty library offers search and AI discovery. Guest login and the signup/login roundtrip retain the fixed `returnTo=my-library` destination; AI entry still supports `returnTo=ai-books` with its prompt. Arbitrary return destinations are rejected.

`hooks/useLibraryOverview.ts` loads books, reviews and keywords independently with local error handling and retry. It preserves same-user data while refreshing on focus, aborts obsolete requests and gates cached data by user ID. Loading or a failed library request is never presented as a successful empty library. This change adds no dependencies or environment variables.

See [library validation](qa/library-shelves-2026-11-17.md).


## Library save feedback

Guests can start from “읽고 싶어요” on a book detail page. Login and signup keep that edition's ISBN-13 in the `returnTo=book-detail` flow and reopen the detail page. The user then confirms the reading status to save it.

Book detail uses `components/BookLibraryStatus.tsx` and `src/store/libraryStatusSlice.ts` to show the confirmed reading status, inline loading/success feedback and a shortcut to the library. Selection changes only after a successful write. Status lookup and writes block duplicate requests, and selecting the current status does not write again.

Lookup failures are distinct from an unsaved book. A failed write preserves the last confirmed selection and offers retry of the intended status or a fresh server lookup, since a timeout may occur after the server saved the change. Errors are handled inline without a second global alert. Other API consumers retain their existing default error handling.

Status state is keyed by account and book, cleared on logout/new login, and protected by request IDs. Writes continue across screen changes; refocusing book detail does not start a conflicting read while a write is pending. A successful write also refreshes the library when it is visible, covering navigation back before a slow save finishes. No API, database, dependency or environment changes are required.

See [save feedback validation](qa/library-save-feedback-2026-11-17.md).


## Production web deployment

Production deployment is driven by main in `.github/workflows/validation.yml`. PRs run validation only. A main push deploys the exact frontend build artifact after backend, AI and frontend checks pass. A stale main run skips deployment, and the live `/release.json` records the published commit. Cloudflare credentials are injected into deployment steps only.

See [deployment setup and recovery](../deploy/README.md#웹-자동-배포) and [CI deployment verification](qa/main-pages-deployment-2026-11-17.md). Local feature builds are for validation; production releases follow the main workflow.


## Book list skeletons

`components/ui/BookListSkeleton.tsx` reserves the real card/row sizes for home carousels, search results and the first library load. Shapes fade in after 150ms; results are shown as soon as they arrive. Each list uses one opacity animation, stops it off screen and cleans up its timer/subscription on removal. Reduced motion uses static shapes. Placeholders have no links and expose one labelled busy state rather than fake book contents.

`hooks/useHomeBooks.ts` keeps popular lists keyed by age group and recommendations by user, aborts obsolete requests and offers inline retry. A first failure is distinct from an empty response. `useBookSearch` retains the last completed result for a same-query refresh (including refresh failure); a different query or editing the input never displays those books as new results. The library continues preserving same-user data during focus refresh.

See [skeleton verification](qa/book-list-skeletons-2026-11-17.md). No new dependencies, environment variables or backend changes are required.
