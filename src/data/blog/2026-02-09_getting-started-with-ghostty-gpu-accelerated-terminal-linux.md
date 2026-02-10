---
title: "Getting Started with Ghostty: A Modern GPU-Accelerated Terminal for Linux"
author: sk
pubDatetime: 2026-02-09T12:00:00-05:00
featured: false
draft: false
tags:
  - linux
  - terminal
  - ghostty
  - setup-guide
  - ai
  - claude-code
  - tools
description: "A practical guide to Ghostty, the GPU-accelerated terminal emulator by Mitchell Hashimoto. Installation, configuration, keybindings, and tips for AI coding workflows."
---

The terminal emulator is the most-used tool on a developer's machine, yet most people never change from the default. Ghostty is worth changing for. Created by Mitchell Hashimoto -- the person behind Vagrant, Terraform, and Consul -- it is a GPU-accelerated, Wayland-native terminal built from scratch in Zig. It ships with sensible defaults, a simple text-file config, built-in Nerd Font support, and enough speed that you will notice the difference. This guide covers installation, configuration, and some specific tips for developers who work with AI coding agents.

## Table of contents

## What Is Ghostty and Why Consider It

Ghostty is a terminal emulator that uses GPU rendering (OpenGL on Linux, Metal on macOS) to draw text. This is not a gimmick -- GPU rendering means smoother scrolling, faster redraw on large output, and lower CPU usage during heavy terminal sessions. If you have ever watched your terminal stutter while a build script dumps thousands of lines, you will appreciate the difference.

The project has a few distinguishing characteristics:

- **GPU-accelerated rendering** via OpenGL (Linux) and Metal (macOS). Text rendering is offloaded to the GPU, keeping the CPU free for the processes actually running in your terminal.
- **Wayland-native.** On Linux desktops using Wayland (GNOME 4x, COSMIC, Sway, Hyprland), Ghostty renders directly through the Wayland protocol without X11 compatibility layers. It also works fine on X11.
- **Written in Zig** with a libvterm-based terminal parser. The codebase is lean and the binary is small.
- **Ships with JetBrains Mono and built-in Nerd Font glyphs.** You get ligatures and special characters (powerline symbols, progress bars, status icons) out of the box without installing additional fonts.
- **Simple key=value configuration.** No JSON, no YAML, no Lua scripting. One flat file with straightforward options.
- **Shell integration** auto-detected for Bash, Zsh, and Fish. This enables features like jump-to-prompt navigation and semantic zones.

### How It Compares to Alternatives

There are many GPU-accelerated terminals now. Here is where Ghostty sits relative to the common options:

| Terminal | GPU Rendering | Config Format | Wayland Native | Font Handling | Weight |
|----------|:---:|---|:---:|---|---|
| **Ghostty** | OpenGL/Metal | key=value text | Yes | Built-in JetBrains Mono + Nerd Fonts | Light |
| **Alacritty** | OpenGL | TOML | Yes | BYO fonts | Minimal |
| **Kitty** | OpenGL | Custom config + scripting | Yes | BYO fonts, kitten for Nerd Fonts | Heavy |
| **WezTerm** | OpenGL/Metal | Lua scripting | Yes | BYO fonts | Heavy |
| **GNOME Terminal** | CPU (VTE) | GUI/dconf | Via VTE | System fonts | Medium |
| **COSMIC Terminal** | GPU (iced) | COSMIC settings | Yes | System fonts | Light |

**Alacritty** is the minimalist benchmark -- fast, no tabs, no splits, no frills. If you want a pure terminal with zero extras, Alacritty is the right choice. Ghostty is slightly heavier but adds tabs, splits, and shell integration.

**Kitty** is the feature-maximum option -- image rendering, scripting via kittens, GPU shaders. If you need terminal graphics protocols or deep customization via scripting, Kitty has more features. The tradeoff is complexity.

**Ghostty** sits in the middle: fast like Alacritty, with enough built-in features (tabs, splits, themes, shell integration) that you do not need a tmux layer, but without the scripting complexity of Kitty or WezTerm.

## Installation on Linux

### Ubuntu / Pop!_OS (via PPA)

The `mkasberg/ghostty-ubuntu` PPA provides pre-built packages:

```bash
sudo add-apt-repository ppa:mkasberg/ghostty-ubuntu
sudo apt update
sudo apt install ghostty
```

### Arch Linux

Ghostty is in the official repositories:

```bash
sudo pacman -S ghostty
```

### Fedora (via COPR)

```bash
sudo dnf copr enable pgdev/ghostty
sudo dnf install ghostty
```

### Building from Source

Ghostty is written in Zig, so building from source requires the Zig toolchain:

```bash
git clone https://github.com/ghostty-org/ghostty.git
cd ghostty
zig build -Doptimize=ReleaseFast
```

See the [Ghostty documentation](https://ghostty.org/docs/install) for detailed build instructions and dependencies.

### Other Platforms

Ghostty is also available as a native application on **macOS** (distributed as a `.dmg` from the official site). Windows support is in development.

### Setting as Default Terminal

On Ubuntu and Pop!_OS, you can set Ghostty as the default terminal emulator:

```bash
sudo update-alternatives --config x-terminal-emulator
```

Select Ghostty from the list. After this, applications that launch `x-terminal-emulator` will use Ghostty.

**Note for Pop!_OS / COSMIC desktop users:** The `update-alternatives` change does not affect the Super+T keyboard shortcut. COSMIC hardcodes `cosmic-term` in its system actions config. To make Super+T open Ghostty, create a user-level override:

```bash
mkdir -p ~/.config/cosmic/com.system76.CosmicSettings.Shortcuts/v1
```

Then create the file `~/.config/cosmic/com.system76.CosmicSettings.Shortcuts/v1/system_actions` as a copy of the system default at `/usr/share/cosmic/com.system76.CosmicSettings.Shortcuts/v1/system_actions`, and change the `Terminal` line:

```rust
    /// Opens the terminal
    Terminal: "ghostty",
```

Log out and back in for the change to take effect. This override file takes precedence over the system default, so it survives COSMIC updates.

## Configuration Basics

Ghostty uses a plain text config file at `~/.config/ghostty/config`. There is no JSON or YAML -- just `key = value` pairs, one per line. Lines starting with `#` are comments.

If the file does not exist, create it:

```bash
mkdir -p ~/.config/ghostty
touch ~/.config/ghostty/config
```

After editing, reload the config with **Ctrl+Shift+,** (no restart needed).

### A Solid Starter Config

Here is a practical starting configuration with explanations:

```bash
# ~/.config/ghostty/config

# --- Font ---
# Ghostty ships JetBrains Mono with built-in Nerd Font glyphs.
# You only need to set the size. font-thicken improves readability
# on high-DPI displays.
font-size = 13
font-thicken = true

# --- Theme ---
# Ghostty includes 200+ built-in themes. List them with:
#   ghostty +list-themes
# Some good options: GruvboxDark, catppuccin-mocha, Dracula,
# rose-pine, Tokyo Night, Solarized Dark Higher Contrast
theme = GruvboxDark

# --- Window ---
# Remove the GTK titlebar for a cleaner look (saves vertical space).
# Window padding adds breathing room around the text.
gtk-titlebar = false
window-padding-x = 8
window-padding-y = 4
window-padding-balance = true

# --- Tabs ---
# Tabs at the bottom keeps them out of the way and avoids
# conflict with window manager title bars.
gtk-tabs-location = bottom

# --- Cursor ---
# Bar cursor with no blink. Less distracting than the default block.
cursor-style = bar
cursor-style-blink = false

# --- Scrollback ---
# Default is 10,000,000 (10M) lines, which can use significant memory
# during heavy output sessions. 1,000,000 (1M) is more than enough
# for any practical use while keeping memory usage reasonable.
# This is especially relevant for AI coding agent sessions that
# produce large volumes of output.
scrollback-limit = 1000000

# --- Clipboard ---
# Paste protection prompts before pasting multi-line content.
# Prevents accidentally executing commands from clipboard.
# Copy-on-select copies highlighted text without Ctrl+C.
clipboard-paste-protection = true
copy-on-select = clipboard

# --- Shell integration ---
# Auto-detected for bash, zsh, and fish. Enables jump-to-prompt,
# semantic prompt zones, and other shell-aware features.
# This line is not strictly necessary (auto-detect works) but
# documents the intent.
shell-integration = detect

# --- Mouse ---
# Hide the mouse cursor while typing. It reappears when you move it.
mouse-hide-while-typing = true

# --- Window state ---
# Preserve window size, position, tabs, and splits across restarts.
window-save-state = always
```

### Exploring Themes

Ghostty ships with over 200 built-in themes. Browse them from your terminal:

```bash
# List all available themes
ghostty +list-themes

# Preview a theme (pipe through less for browsing)
ghostty +list-themes | grep -i gruvbox
```

You can also set `theme = light:GruvboxLight,dark:GruvboxDark` to automatically switch themes based on your desktop's light/dark mode setting.

## Essential Keybindings

Ghostty ships with sensible default keybindings. Here are the ones you will use most:

### Window Management

| Action | Shortcut |
|--------|----------|
| New tab | Ctrl+Shift+T |
| Close tab | Ctrl+Shift+W |
| Next tab | Ctrl+Tab |
| Previous tab | Ctrl+Shift+Tab |
| Split right | Ctrl+Shift+Enter |
| Split down | Ctrl+Shift+D (Linux) |
| Close split | Ctrl+Shift+W |
| Focus next split | Ctrl+Shift+] |
| Focus previous split | Ctrl+Shift+[ |
| Equalize splits | Ctrl+Shift+E |

### Navigation

| Action | Shortcut |
|--------|----------|
| Jump to previous prompt | Ctrl+Shift+PageUp |
| Jump to next prompt | Ctrl+Shift+PageDown |
| Scroll up one page | Shift+PageUp |
| Scroll down one page | Shift+PageDown |
| Scroll to top | Shift+Home |
| Scroll to bottom | Shift+End |

### Other

| Action | Shortcut |
|--------|----------|
| Increase font size | Ctrl+= |
| Decrease font size | Ctrl+- |
| Reset font size | Ctrl+0 |
| Reload config | Ctrl+Shift+, |
| Command palette | Ctrl+Shift+P |
| Toggle fullscreen | F11 |
| Quick terminal (quake mode) | Global hotkey (configurable) |

### Custom Vim-Style Split Navigation

If you prefer vim-style directional navigation between splits, add these to your config:

```bash
# Vim-style split navigation
keybind = ctrl+shift+h=goto_split:left
keybind = ctrl+shift+j=goto_split:bottom
keybind = ctrl+shift+k=goto_split:top
keybind = ctrl+shift+l=goto_split:right
```

## Tips for Working with AI Coding Agents

This is where Ghostty particularly shines. If you use CLI-based AI coding agents like Claude Code, Aider, or OpenCode, several of Ghostty's features directly address pain points in that workflow.

### Jump-to-Prompt for Long Agent Conversations

AI coding agents produce enormous amounts of terminal output -- file reads, diffs, command output, chain-of-thought reasoning. Scrolling through it manually is painful.

Ghostty's shell integration enables **jump-to-prompt** navigation: **Ctrl+Shift+PageUp** and **Ctrl+Shift+PageDown** skip directly from one shell prompt to the next, leaping over all the output in between. This is invaluable for reviewing what an agent did across a long session. Instead of scrolling through hundreds of lines of diff output, you jump straight to the next command or prompt.

### Set Scrollback to 1M, Not 10M

Ghostty defaults to 10 million lines of scrollback. That sounds generous, but with AI coding agents it becomes a liability. Agent sessions can produce tens of thousands of lines per task -- file contents, diffs, command output, reasoning traces. At 10M lines across multiple splits, memory usage can grow significantly.

Set `scrollback-limit = 1000000` (1M lines). This is still enough to scroll back through an entire multi-hour session while keeping memory consumption reasonable. In Ghostty v1.2.x, a memory leak related to heavy scrollback could cause the terminal to consume several gigabytes of RAM over long sessions (particularly noticeable with Claude Code). This was fixed in v1.3 (March 2026), but keeping a sensible scrollback limit is good practice regardless.

### Paste Protection for Agent Output

AI agents frequently produce code blocks, commands, and configuration snippets in their output. If you copy a multi-line block and paste it into a terminal, it can execute line by line -- potentially running commands you did not intend to run.

`clipboard-paste-protection = true` adds a confirmation prompt when pasting multi-line content. This small safeguard prevents accidental execution of copied agent output.

### Split Panes for Side-by-Side Workflows

A productive AI agent workflow often involves two terminals side by side: the agent session in one pane and a manual terminal in the other (for running tests, checking git status, reading files, or making quick edits).

Use **Ctrl+Shift+Enter** to split right and **Ctrl+Shift+D** to split down. With the vim-style keybindings from the previous section, you can navigate between splits without reaching for the mouse.

### Preserve Layout Across Restarts

`window-save-state = always` saves your tab and split layout when Ghostty exits and restores it on next launch. If you have a multi-pane setup for agent work, you do not need to recreate it every time you restart the terminal.

### Quick Terminal for Background Commands

Ghostty supports a quake-style dropdown terminal (the "quick terminal") triggered by a global hotkey. This is useful when an agent session is running in your main window and you need to quickly run a command -- check a service status, look up a man page, or test something -- without disrupting the agent's layout.

Configure it in your config:

```bash
# Bind a global hotkey for the quick terminal
keybind = global:ctrl+grave_accent=toggle_quick_terminal
```

### Built-in Nerd Fonts Mean Correct Rendering

AI agent output often includes special characters: progress bars, spinner animations, status indicators, directory tree characters, and other Unicode symbols. Many of these come from the Nerd Fonts character set.

Because Ghostty bundles Nerd Font glyphs with its default JetBrains Mono font, these characters render correctly without installing additional fonts. You will not see placeholder boxes or broken characters in agent output.

## Known Gotchas

Ghostty is a relatively young project (first public release in December 2024). It is stable and actively maintained, but there are a few things to be aware of:

### Memory Leak in v1.2.x (Fixed in v1.3)

Ghostty v1.2.x had a memory leak triggered by heavy scrollback -- the kind of output AI coding agents routinely produce. Over a multi-hour session, memory usage could grow to several gigabytes. This was fixed in v1.3 (released March 2026). If you are running v1.2.x, either upgrade or keep `scrollback-limit` conservative.

### Terminal Identification: Missing Prompt Colors

Ghostty sets `TERM=xterm-ghostty` by default. This can cause two issues:

**Local prompt colors missing.** The default `.bashrc` on Ubuntu and Pop!_OS only enables color prompts for terminals matching `xterm-color|*-256color`. Since `xterm-ghostty` does not match that pattern, your prompt will appear uncolored. Fix it by editing `~/.bashrc` and adding `xterm-ghostty` to the case statement (usually around line 40):

```bash
# Before:
    xterm-color|*-256color) color_prompt=yes;;
# After:
    xterm-color|*-256color|xterm-ghostty) color_prompt=yes;;
```

Then open a new tab or run `source ~/.bashrc`.

**SSH to older servers.** Remote hosts may not have the `xterm-ghostty` terminfo entry. If you see broken formatting or missing colors over SSH, override the TERM variable:

```bash
# In your .bashrc or .zshrc, for SSH sessions to older hosts
alias ssh='TERM=xterm-256color ssh'

# Or per-connection in your SSH config
Host oldserver
    SetEnv TERM=xterm-256color
```

### Background Opacity on Some GPU Drivers

Setting `background-opacity` to less than 1.0 (for transparency) can cause rendering issues on some Linux GPU driver combinations, particularly with older NVIDIA drivers or certain Mesa versions. If you see visual glitches with transparency enabled, set `background-opacity = 1` and use theme-based dark backgrounds instead.

### Check GitHub Issues for Edge Cases

As a newer project, Ghostty is still working through edge cases. If something seems off -- a rendering glitch, a keybinding that does not work, or unexpected behavior with a specific shell -- check the [GitHub issues](https://github.com/ghostty-org/ghostty/issues) before spending time debugging. The project is actively maintained and responsive to bug reports.

## Conclusion

Ghostty hits a practical sweet spot for terminal emulators: fast GPU-accelerated rendering, Wayland-native, simple text-file configuration, sensible defaults, and enough built-in features (tabs, splits, themes, shell integration) that you do not need to layer tmux or screen on top. The built-in Nerd Font support and 200+ themes mean it looks good immediately.

For developers working with AI coding agents, the combination of shell integration (jump-to-prompt), configurable scrollback limits, paste protection, and split panes makes it particularly well-suited to the heavy-output, multi-pane workflows that agent-driven development demands.

Install it, drop in the starter config from this guide, and give it a week. The GPU rendering and jump-to-prompt navigation alone are worth the switch.
