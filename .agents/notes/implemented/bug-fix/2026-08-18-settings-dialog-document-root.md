# Agent Note: Settings dialog mounted at the document root

Status: implemented

English | [中文](2026-08-18-settings-dialog-document-root.zh.md)

## Problem

The settings dialog was rendered inside the responsive sidebar subtree. Opening it on a narrow viewport triggered the shell's sidebar collapse, which could clip or unmount the dialog and leave the conversation surface above its controls. The dialog's full-viewport CSS could not preserve interaction while an ancestor controlled its lifetime and stacking context.

## Decision

`SettingsPanel` renders through a React portal into `document.body`. Its ownership, active entry fallback, focus placement, Escape handling, mask dismissal, and slot rendering remain in the settings plugin; only the DOM mount point leaves the sidebar subtree. The overlay therefore survives responsive sidebar collapse and participates in the document-level stacking order on desktop-sized and mobile-sized windows.

## Testing

The settings root unit suite verifies dialog interaction through the portal. The mobile-settings browser scenario opens the real shell at a narrow viewport and changes a setting after the responsive sidebar has collapsed, proving that the overlay remains visible and receives pointer input.

## Alternatives considered

**Keep the dialog inside the sidebar and raise its z-index.** Rejected: z-index cannot escape clipping or preserve a child after the responsive owner unmounts its subtree.

**Keep the sidebar expanded while settings are open.** Rejected: this couples a plugin-owned dialog to shell navigation state and reserves scarce mobile width for content hidden behind the modal.

## Consequences

The dialog now depends on `react-dom` as an explicit package dependency and requires a browser document when it is rendered. Its lifecycle still follows `SettingsRoot`, so closing settings or unmounting the plugin removes the portal normally. Overlay styles must be evaluated against document-level stacking rather than sidebar-local stacking, while narrow desktop windows retain the same controls and zero-configuration behavior as larger windows.
