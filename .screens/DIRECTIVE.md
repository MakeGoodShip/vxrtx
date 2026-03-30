# Screenshot Directive

Look at the `.screens/` folder and identify the last commit that was screenshotted (the highest-numbered subfolder). Then find all commits after that one in `git log --oneline --reverse`. For each new commit:

1. Check `git diff <prev>.. --stat -- apps/extension/src/sidepanel/ apps/extension/src/styles/` for UI-relevant changes. If no sidepanel/style changes exist, check for icon or CSS changes in the full diff. If there are truly no visual changes, create the numbered subfolder with a single reference screenshot and a `NOTE.md` explaining no UI change.

2. For commits with UI changes:
   - `git checkout <commit>` (stash if needed)
   - Build: use `pnpm build:extension` (post-monorepo) or `npm install --legacy-peer-deps && npx vite build` then copy `dist/` to `apps/extension/dist/` (pre-monorepo)
   - Serve from `apps/extension/dist/` via `python3 -m http.server 8765`
   - Navigate Chrome to `http://localhost:8765/src/sidepanel/index.html` with this initScript to mock Chrome extension APIs:
     ```js
     const mockEvent = () => ({ addListener: () => {}, removeListener: () => {}, hasListener: () => false });
     const mockStorage = { get: () => Promise.resolve({}), set: () => Promise.resolve(), remove: () => Promise.resolve(), clear: () => Promise.resolve(), onChanged: mockEvent() };
     window.chrome = {
       storage: { local: {...mockStorage}, sync: {...mockStorage}, session: {...mockStorage}, onChanged: mockEvent() },
       runtime: { sendMessage: () => Promise.resolve({}), onMessage: mockEvent(), getURL: (p) => p, id: 'mock', lastError: null },
       tabs: { query: () => Promise.resolve([]), onUpdated: mockEvent(), onRemoved: mockEvent(), onCreated: mockEvent(), remove: () => Promise.resolve() },
       tabGroups: { query: () => Promise.resolve([]), onUpdated: mockEvent(), onRemoved: mockEvent(), onCreated: mockEvent(), TAB_GROUP_ID_NONE: -1 },
       bookmarks: { getTree: () => Promise.resolve([{id:'0',title:'',children:[{id:'1',title:'Bookmarks Bar',children:[{id:'10',title:'Dev Tools',children:[{id:'100',title:'GitHub',url:'https://github.com'}]}]},{id:'2',title:'Other Bookmarks',children:[]}]}]), onChanged: mockEvent(), onCreated: mockEvent(), onRemoved: mockEvent(), onMoved: mockEvent(), remove: () => Promise.resolve(), move: () => Promise.resolve(), create: () => Promise.resolve() },
       contextMenus: { create: () => {}, remove: () => Promise.resolve(), removeAll: () => Promise.resolve(), onClicked: mockEvent() },
       sidePanel: {}
     };
     ```
   - Emulate viewport `400x700x2`
   - Screenshot every distinct screen: each nav tab, each sub-mode, each interactive state (expanded settings, form states, etc.)
   - Save to `.screens/NN_<short-hash>_<slug>/` with descriptive filenames showing position in UI flow
   - Use `fullPage: true` for screens with scrollable content

3. After all commits are captured, return to the original branch and kill the HTTP server.

## Naming conventions

- **Subfolder**: sequential two-digit prefix continuing from the last existing folder, then `<7-char hash>_<kebab-case description from commit message>` (e.g., `12_a1b2c3d_add-dark-mode-toggle/`)
- **Screenshots**: sequential two-digit prefix + kebab-case description of what's shown (e.g., `01_tabs-organizer-idle.png`, `03_settings-relaxed-openrouter.png`)

## Notes

- Chrome must be running with `--remote-debugging-port=9222`
- If the initScript mock causes errors, check for new Chrome API usage in the diff and extend the mock accordingly
- `chrome.storage.session` was added at commit `483b28d` — the mock above already covers it
