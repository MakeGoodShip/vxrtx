---
title: Installation
description: How to install the vxrtx Chrome extension
---

## Chrome Web Store

Install vxrtx directly from the [Chrome Web Store](#) (coming soon).

## Manual Installation (Development)

1. Clone the repository and build the extension:

```bash
git clone https://github.com/vxrtx/vxrtx.git
cd vxrtx
pnpm install
pnpm build:extension
```

2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the `apps/extension/dist` folder
5. The vxrtx icon will appear in your toolbar
