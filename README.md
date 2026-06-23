# Starfinder Dashboard

A cyberpunk-style smartphone dashboard for **Foundry VTT** — designed for Starfinder and sci-fi tabletop campaigns.

The dashboard renders as a sleek sci-fi phone UI docked to your Foundry canvas, giving Game Masters and players quick access to music, contacts, encrypted comms, news, bounties, a calendar, a market, and a journal — all without leaving the VTT.

> **This module is a paid product.** A valid Patreon subscription is required to activate it.  
> Support and access: [patreon.com/gmredvelvet](https://www.patreon.com/gmredvelvet)

---

## Features

| App | Description |
|-----|-------------|
| **Music Player** | Controls Foundry playlists with per-client volume and mute. |
| **Contacts** | NPC contact book linked to world Actors, with online/offline status. |
| **Secure Comms** | Encrypted whisper UI — whisper messages appear as scrambled ciphertext with a decrypt reveal. |
| **News Terminal** | GM-controlled news feed for in-world broadcasts and lore. |
| **Bounty Network** | Post and track active bounties for the party. |
| **SF Calendar** | In-world Starfinder calendar with date tracking. |
| **Market** | In-world shop browser for items and gear. |
| **Journal** | Quick-access journal viewer inside the dashboard. |

Additional features:
- **Idle screensaver** — activates after 12 seconds of inactivity on the phone UI.
- **Draggable** — move the phone anywhere on the canvas.
- **Keyboard shortcut** — `Ctrl + Shift + D` toggles the dashboard open/closed.
- **Auto-open on login** — configurable per client in module settings.
- **Toggle button** — a `◈ DASH` button is added to the Players list for quick access.

---

## Requirements

- **Foundry VTT** v11 – v14 (verified on v12)
- **Patreon subscription** to [GM RedVelvet](https://www.patreon.com/gmredvelvet) — the GM must authenticate once per world to activate the module.

### Compatible Systems

Designed for **Starfinder (SFRPG / SF2E)**, but the dashboard is system-agnostic and works with any Foundry game system.

---

## Installation

### Via Manifest URL (recommended)

1. Open Foundry VTT → **Add-on Modules** → **Install Module**.
2. Paste the manifest URL:
   ```
   https://github.com/gmredvelvet-rgb/starfinderdashboard/releases/latest/download/module.json
   ```
3. Click **Install**.

### Manual

Download the latest `.zip` from the [Releases](https://github.com/gmredvelvet-rgb/starfinderdashboard/releases) page and extract it into your `Data/modules/` folder.

---

## Activation

1. Enable the module in your world's **Manage Modules** settings.
2. Log in as **GM**.
3. A Patreon authentication prompt will appear. Click **Connect Patreon** and follow the steps.
4. Once authenticated, the world is licensed for all players in that world session.

The license is stored at the world level. Players do not need individual Patreon accounts — only the GM does.

---

## Usage

| Action | How |
|--------|-----|
| Open / close dashboard | Click `◈ DASH` in the Players list, or press `Ctrl + Shift + D` |
| Switch apps | Click the icons in the bottom navigation bar |
| Add a contact | Go to **Contacts** → click the `+` button |
| Send encrypted whisper | Use Foundry's normal whisper — it renders as ciphertext in chat and can be opened in Comms |
| Adjust music volume | Use the slider in the **Music** tab (client-side only, does not affect other players) |

---

## Settings

| Setting | Scope | Description |
|---------|-------|-------------|
| Auto-open Dashboard on Load | Client | Automatically shows the dashboard when you log in. |

---

## Support & Bugs

- **Bug reports:** [GitHub Issues](https://github.com/gmredvelvet-rgb/starfinderdashboard/issues)
- **Support & updates:** [patreon.com/gmredvelvet](https://www.patreon.com/gmredvelvet)
- **Discord:** `gmredvelvet`

---

## Legal

Copyright © 2024 GM RedVelvet. All rights reserved.  
This module is proprietary software. See [LICENSE](LICENSE) for terms of use.

Foundry VTT is a trademark of Foundry Gaming LLC. This module is not affiliated with or endorsed by Foundry Gaming LLC.  
Starfinder is a trademark of Paizo Inc. This module is not affiliated with or endorsed by Paizo Inc.
