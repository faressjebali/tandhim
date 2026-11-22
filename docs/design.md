# Tandhim design

Direction: **soft retro neo-brutalism**, chosen from my own references (neo-brutalist UI boards, a retro palette, journaling apps).

## What the first screen shows

1. A scrollable **strip of days** (the selected day in a yellow circle); tapping a day shows it.
2. The **current projects** (school and personal) as colored cards with progress.
3. **To-do**, sorted by nearest deadline **and** importance (`trierTaches` in `@tandhim/core`).
4. The **sessions of the selected day** (day bar C1–C5 + list).

## Style

- Cream background, blocks with a **2 px ink outline**, a **solid offset shadow** (3 px), rounded corners (18 px), a "pressed" effect on tap.
- Text on a pastel color is always dark ink (`text-sur-couleur`).
- **Light mode only**, even when the phone or the computer is in dark mode.
- Floating **yellow** tab bar at the bottom (active tab: ink background, yellow text); sidebar on desktop.
- Floating pink **+** button to add a task from anywhere.

## Colors

| Token                              | Value     |
| ---------------------------------- | --------- |
| `papier` (background)              | `#FFF3DC` |
| `surface` (blocks)                 | `#FFFCF5` |
| `encre` (text, outlines)           | `#1E1B2E` |
| `gris`                             | `#6B6478` |
| `ligne` (dotted lines, separators) | `#EAD9B8` |

Retro palette: yellow `#FFC567`, pink `#FB7DA8`, coral `#FD5A46` (late, urgent), purple `#552CB7` (periods: holidays, exams), green `#00995E` (done), blue `#058CD7` (keyboard focus).
Subjects: pastels of the same family (`subjects.color`).

## Typography

**Readex Pro** (derived from Lexend; Latin + Arabic "تنظيم"), headings at 700, body 400–600, tabular figures for times.

## Desktop

Sidebar, content up to 1152 px, "Today" in two columns (projects + to-do | sessions of the day).
