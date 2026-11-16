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

`components/navigation/MainTabBar.tsx` renders icon + label navigation with a 64px full-cell target, selected state and keyboard focus. Keep tab links and navigation events intact when changing its presentation. Home typing state stays inside `HomeAiPrompt`, separate from book lists.

See [UI consistency validation](qa/ui-consistency-2026-11-16.md) for the responsive and interaction checks.

## Home AI discovery

Home examples prefill `/ai-books` through the `prompt` route parameter. Selecting an example does not submit a search. Authentication preserves that condition using the fixed `returnTo=ai-books` flow. `src/utils/aiSearchEntry.ts` keeps explicit new drafts separate from completed results and protects queued/running searches. After a job is saved locally, the entry prompt is removed so a refresh resumes the submitted job.

See [home discovery validation](qa/home-ai-discovery-2026-11-16.md) for the tested flows and remaining device coverage.

UI follow-up tasks, including floating bottom navigation, are tracked in [UI improvements](UI_IMPROVEMENTS.md).


## Search discovery and recent queries

The search tab offers title/author search, the last eight successful queries stored on the device, and AI discovery entry points. Autocomplete does not add history. Queries can be replayed, removed individually, or cleared together. History writes are serialized to protect deletion during slow reads/writes.

`hooks/useBookSearch.ts` cancels superseded requests and ignores stale responses. Search failures are shown inline with retry; empty results have a separate state. The optional `bookApi.searchBooks` request flag `handleErrorLocally` suppresses duplicate global alerts only for callers that handle their own errors. Cancelled Axios requests never show a global alert.

See [search discovery validation](qa/search-discovery-2026-11-16.md).
