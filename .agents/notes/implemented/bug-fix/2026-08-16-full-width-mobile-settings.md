# Agent Note: Full-width mobile settings

Status: implemented

English | [中文](2026-08-16-full-width-mobile-settings.zh.md)

## Problem

The settings dialog used the same fixed two-column layout at every viewport width. Its 188-pixel navigation column and content padding consumed most of a phone viewport, leaving the active section narrow enough for Chinese labels and descriptions to wrap one character per line. This made settings reached through the remote website effectively unusable on phones.

## Decision

At viewports up to 640 pixels wide, the shared settings shell switches to a three-row grid. The title and dialog actions occupy the first row, the section list becomes a horizontally scrollable rail in the second row, and the active section receives the full dialog width in a separately scrollable third row. The semantic navigation and section DOM order remain unchanged, and wider viewports retain the existing fixed-sidebar layout.

The keyless assembled-Web test opens the real settings dialog, resizes Chromium to 390 by 844 pixels, and asserts that navigation and content both span the dialog, the content starts below navigation, the document has no horizontal overflow, section switching still works, and closing remains available.

## Alternatives considered

**Shrink the desktop sidebar.** Rejected because even a narrower fixed column would continue competing with settings rows and touch targets on small screens, and would reproduce the defect for longer localized labels.

**Hide navigation behind another menu.** Rejected because the four settings sections fit in a horizontal rail, while an extra menu would add state and make section discovery less direct.

## Consequences

Phone users can read and operate settings at normal line lengths without horizontal page overflow. The section rail may scroll horizontally when labels do not fit, and the compact title row plus rail consume more vertical space than a single desktop header; in exchange, the active section keeps the full usable width. The breakpoint is owned by the shared settings shell, so local, LAN, and website-relayed Web clients receive the same behavior.
