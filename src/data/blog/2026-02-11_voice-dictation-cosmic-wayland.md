---
title: "Voice Dictation on Linux Wayland: Getting Push-to-Talk Working on COSMIC Desktop"
author: sk
pubDatetime: 2026-02-11T12:00:00-05:00
featured: false
draft: false
tags:
  - linux
  - wayland
  - pop-os
  - ai
  - tools
  - setup-guide
description: "How to set up push-to-talk voice dictation on Wayland Linux desktops using Voxtype and ydotool, with solutions for wtype failures and hotkey passthrough issues."
---

Voice dictation on Linux has historically been a mess. On X11 you had xdotool and a handful of dictation tools that mostly worked. Wayland changed the rules -- the security model that protects you from keyloggers also blocks the tools that type text into windows on your behalf. If you use a Wayland-native desktop like COSMIC, GNOME, or Sway, getting push-to-talk dictation to actually work requires navigating a few non-obvious problems. This guide covers what those problems are and how to solve them, using Voxtype as the dictation tool and ydotool as the text injection layer.

## Table of contents

## Why Voice Dictation on a Developer Machine

Voice dictation is not about replacing your keyboard. Dictating code syntax -- brackets, semicolons, camelCase identifiers -- is slower than typing. Where voice input genuinely helps is natural language: dictating prompts to AI coding agents, explaining bugs, writing commit messages, drafting documentation, or describing what you want refactored. Speaking a three-sentence prompt is faster than typing it, and you can do it while leaning back from the screen.

The target workflow is simple: press a key, speak, release the key, and your words appear as text wherever the cursor is. No mouse interaction, no separate app window, no copy-paste. Just push-to-talk that works in any application -- terminal, editor, browser.

## The Tools

### Voxtype: Wayland-Native Push-to-Talk

[Voxtype](https://github.com/peteonrails/voxtype) is a Rust-based dictation tool built specifically for Wayland. It runs as a systemd user service, listens for a configurable hotkey, records audio from your microphone, transcribes it locally using Whisper models, and outputs the text at your cursor position. Key features:

- **Push-to-talk or toggle mode.** Hold-to-record or press-once-to-start, press-again-to-stop.
- **Multiple Whisper models.** Switch between a fast model (base.en, 142 MB) for quick dictation and a large model (large-v3-turbo, 1.6 GB) for difficult audio, using a modifier key.
- **Configurable output drivers.** Supports wtype, ydotool, and clipboard fallback.
- **Audio feedback.** Optional beeps when recording starts and stops.
- **Initial prompt for context.** Tell Whisper to expect technical terminology so it transcribes "systemd" instead of "system D".

Voxtype is available as a `.deb` package from its GitHub releases page and also builds from source via Cargo.

### ydotool: Text Injection That Actually Works

[ydotool](https://github.com/ReimuNotMoe/ydotool) is a command-line tool that simulates keyboard and mouse input at the kernel level via the uinput subsystem. Unlike Wayland-specific tools like wtype, ydotool does not go through the compositor at all -- it creates a virtual input device that the kernel treats as a real keyboard. This means it works on Wayland, X11, and even virtual consoles.

### Whisper Models

The speech recognition behind Voxtype is [whisper.cpp](https://github.com/ggml-org/whisper.cpp), a C/C++ port of OpenAI's Whisper. The model you choose determines the tradeoff between speed and accuracy:

| Model | Size | Speed | Best For |
|-------|------|-------|----------|
| tiny.en | 39 MB | Fastest | Quick commands, low-resource systems |
| base.en | 142 MB | Fast | Everyday dictation, good accuracy |
| small.en | 466 MB | Moderate | Better accuracy, still responsive |
| large-v3-turbo | 1.6 GB | Slower | Best accuracy, technical vocabulary |

For daily dictation, `base.en` provides a good balance. For difficult audio or when accuracy matters (long-form text, uncommon terminology), `large-v3-turbo` is worth the extra latency. On a system with a dedicated GPU (any modern NVIDIA or AMD card with 4+ GB VRAM), even the large model transcribes a typical sentence in under 500 milliseconds.

## The Problems You Will Hit on Wayland

Here is where it gets interesting. Each of the problems below cost real debugging time, and none of them are documented in obvious places.

### Problem 1: wtype Outputs Numbers Instead of Text

wtype is the standard Wayland text injection tool -- the equivalent of xdotool's `type` command. On many Wayland compositors (Sway, Hyprland), wtype works fine. On COSMIC desktop, it does not.

When Voxtype uses wtype as its output driver on COSMIC, the transcribed text comes out as numbers. You say "hello world" and get something like `84 101 108 108 111` in your terminal. The issue is in how COSMIC's Wayland implementation handles virtual keyboard events from wtype -- the keycodes are interpreted numerically instead of being mapped to characters.

**The fix:** Do not use wtype on COSMIC. Use ydotool instead (covered below).

### Problem 2: wtype Silently Fails from Compositor Spawn

If you try to work around Problem 1 by calling wtype from a COSMIC keybinding (using the `Spawn()` action), wtype fails silently. No error, no output, nothing happens. This is because COSMIC's `Spawn()` launches processes in a context where the virtual keyboard protocol is not routed to the focused window.

**The fix:** Same as above -- switch to ydotool, which bypasses the compositor entirely.

### Problem 3: Hotkey Passthrough Produces Visible Characters

Voxtype supports evdev-based hotkey detection, which listens for key events at the Linux input device level. This works on any compositor. However, the key you choose matters more than you might expect.

If you bind dictation to ScrollLock or Pause, those keys pass through to the focused application after Voxtype captures them. In a terminal, ScrollLock might insert a control character. In a browser text field, Pause might trigger unwanted behavior. The dictation works, but you get garbage characters mixed in with your transcribed text.

**The fix:** Use a **modifier key** like Right Alt. Modifier keys (Alt, Ctrl, Shift, Super) are designed to modify other keys -- they do not produce visible characters on their own. Right Alt is ideal because it is easy to reach, rarely used alone, and does not conflict with standard shortcuts. Voxtype's evdev mode captures the keypress before any compositor sees it, and since Right Alt produces no character output, nothing leaks through.

### Problem 4: COSMIC Keybinding Defaults Are Replaced, Not Merged

If you try to configure a custom keybinding in COSMIC by creating a user-level `defaults` file (the standard approach for COSMIC configuration), you will discover that COSMIC does not merge your custom keybindings with the system defaults -- it replaces them entirely. Create a file with one custom binding and you lose every system shortcut (Super+T for terminal, Super+Q to close, everything).

This is by design in COSMIC's configuration system for `defaults` files, but it is surprising if you come from desktops where user config is additive.

**The fix:** For Voxtype, you do not need a COSMIC keybinding at all. Use Voxtype's native evdev hotkey support instead. The evdev hotkey runs at the Linux input layer, below the compositor, so it works regardless of compositor configuration. This sidesteps the COSMIC keybinding system entirely.

### Problem 5: PipeWire Flat-Volume Hijacks Your Microphone

This one is subtle and affects the entire system, not just dictation. PipeWire's PulseAudio compatibility layer has a feature called "flat volume" that, by default, allows any application that opens an audio capture stream to control the source (microphone) volume. When Voxtype opens the microphone for recording, PipeWire may spike the microphone source volume to 100%, affecting all other applications that use the mic.

**The fix:** Create a PipeWire configuration file that blocks applications from changing the source volume:

```bash
mkdir -p ~/.config/pipewire/pipewire-pulse.conf.d
```

Create `~/.config/pipewire/pipewire-pulse.conf.d/10-block-source-volume.conf`:

```ini
pulse.rules = [
    {
        matches = [ { node.name = "~alsa_input.*" } ]
        actions = {
            quirks = [ block-source-volume ]
        }
    }
]
```

Restart PipeWire for the change to take effect:

```bash
systemctl --user restart pipewire pipewire-pulse
```

After this, applications can no longer change your microphone source volume. You set it once in your system settings and it stays there.

For a more targeted approach, you can match specific application binaries instead of all input sources:

```ini
pulse.rules = [
    {
        matches = [ { application.process.binary = "voxtype" } ]
        actions = { quirks = [ block-source-volume ] }
    }
]
```

The broad rule above is simpler and catches all offenders (Chrome is another common culprit). The targeted rule is more precise if you prefer to keep the default PipeWire behavior for other applications.

## Installation

### Install Voxtype

Download the latest `.deb` package from the [Voxtype releases page](https://github.com/peteonrails/voxtype/releases) and install it:

```bash
sudo dpkg -i voxtype_*.deb
sudo apt install -f  # Install any missing dependencies
```

This also installs `wl-clipboard` and `libnotify-bin` as dependencies.

### Install ydotool

```bash
sudo apt install ydotool
```

ydotool needs access to `/dev/uinput`. Your user must be in the `input` group, and the uinput device needs a udev rule for group access:

```bash
# Add your user to the input group
sudo usermod -aG input $USER

# Create a udev rule for uinput access
sudo tee /etc/udev/rules.d/99-uinput.rules > /dev/null <<'EOF'
KERNEL=="uinput", GROUP="input", MODE="0660"
EOF

# Reload udev rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

**You must log out and back in** for the group membership to take effect.

### Download Whisper Models

Voxtype downloads models on first use, or you can pre-download them:

```bash
mkdir -p ~/.local/share/voxtype/models

# Fast model for everyday use (142 MB)
curl -L -o ~/.local/share/voxtype/models/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin

# Accurate model for difficult audio (1.6 GB)
curl -L -o ~/.local/share/voxtype/models/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

## Configuration

Create or edit `~/.config/voxtype/config.toml`:

```toml
# Hotkey: Right Alt (modifier key, no visible char output)
[hotkey]
key = "RIGHTALT"
mode = "toggle"
model_modifier = "LEFTSHIFT"  # Shift+hotkey uses the large model

[audio]
device = "default"
sample_rate = 16000
max_duration_secs = 60

[audio.feedback]
enabled = true
theme = "subtle"
volume = 0.5

[whisper]
model = "base.en"
language = "en"
initial_prompt = "Technical discussion about Python, TypeScript, Rust, Docker, NVIDIA, CUDA, Ollama, Claude, Astro, Wayland, COSMIC, Pop!_OS, systemd, chezmoi."
secondary_model = "large-v3-turbo"

[output]
mode = "type"
# Skip wtype (broken on COSMIC), use ydotool
driver_order = ["ydotool", "clipboard"]
fallback_to_clipboard = true
type_delay_ms = 0
```

Key settings to note:

- **`key = "RIGHTALT"`** -- Uses the Right Alt key in toggle mode. Press once to start recording, press again to stop and transcribe.
- **`driver_order = ["ydotool", "clipboard"]`** -- Tries ydotool first (works everywhere), falls back to clipboard if ydotool is unavailable.
- **`initial_prompt`** -- Gives Whisper context about the vocabulary you use. This significantly improves accuracy for technical terms.
- **`model_modifier = "LEFTSHIFT"`** -- Hold Left Shift while pressing Right Alt to use the large model for better accuracy.

## Start the Service

Enable and start Voxtype as a systemd user service:

```bash
systemctl --user enable --now voxtype
```

Check that it is running:

```bash
systemctl --user status voxtype
```

View logs if something is not working:

```bash
journalctl --user -u voxtype -f
```

## Usage

Once the service is running:

1. **Press Right Alt** -- you hear a subtle beep (recording started).
2. **Speak your text** -- "refactor the authentication module to use JWT tokens".
3. **Press Right Alt again** -- you hear another beep (recording stopped, transcription begins).
4. **Text appears at your cursor** -- wherever the cursor is, in any application.

To use the high-accuracy model for a specific dictation, hold Left Shift while pressing Right Alt.

## Architecture: Why This Works

The final architecture is worth understanding because it explains why simpler approaches fail on Wayland.

```
Right Alt key press
    |
    v
evdev (Linux input subsystem)
    |
    v
Voxtype daemon (captures key, starts/stops recording)
    |
    v
PipeWire (audio capture from microphone)
    |
    v
whisper.cpp (local transcription, GPU or CPU)
    |
    v
ydotool (types text via /dev/uinput)
    |
    v
Kernel virtual keyboard device
    |
    v
Compositor receives input (COSMIC, GNOME, Sway, etc.)
    |
    v
Text appears in focused application
```

The critical insight is that both the hotkey detection (evdev) and the text output (uinput) operate at the Linux kernel level, **below** the Wayland compositor. This means:

- **No compositor-specific code needed.** The same setup works on COSMIC, GNOME, Sway, Hyprland, or any other Wayland compositor.
- **No virtual keyboard protocol issues.** wtype and other Wayland-protocol tools depend on the compositor correctly implementing the virtual keyboard protocol. ydotool does not.
- **No permission model conflicts.** Wayland's security model restricts inter-client communication (which is why tools like xdotool do not work). By going through the kernel's input subsystem, ydotool sidesteps this restriction entirely.

The tradeoff is that ydotool requires `/dev/uinput` access (hence the `input` group membership and udev rule). This is a one-time setup cost.

## Troubleshooting

### No text output after transcription

Check that ydotool is working independently:

```bash
# This should type "hello" wherever your cursor is
ydotool type "hello"
```

If nothing happens, verify your user is in the `input` group:

```bash
groups | grep input
```

If `input` is not listed, you need to log out and back in after adding the group membership.

### Microphone not detected

Check PipeWire is running and your microphone is visible:

```bash
systemctl --user status pipewire
pactl list sources short
```

Verify the default source is your microphone, not a monitor device:

```bash
pactl get-default-source
```

### Transcription accuracy is poor

- Switch to the large model: hold Left Shift while pressing the hotkey.
- Check your `initial_prompt` -- adding domain-specific terms helps.
- Ensure your microphone gain is set appropriately (not too low, not clipping).
- Reduce background noise or use a directional microphone.

### Right Alt conflicts with Compose key

On some keyboard layouts, Right Alt is mapped to the Compose key (for typing accented characters). If you need Compose key functionality, choose a different hotkey in Voxtype's config. Good alternatives include Pause (`PAUSE`) or a function key (`F13` through `F24` if your keyboard supports them), keeping in mind that non-modifier keys may produce visible characters in some applications.

## Beyond Basic Dictation

Once push-to-talk is working, there are natural next steps depending on your workflow:

- **LLM post-processing.** Voxtype supports piping transcribed text through an external command before output. You can use a local LLM (via Ollama) to clean up grammar, remove filler words, or reformat text for specific contexts.
- **Voice chat with local LLMs.** If you run Open WebUI or a similar chat interface, pair the dictation setup with a text-to-speech engine (Kokoro, Piper, or Chatterbox) for full voice conversations with local models.
- **Multiple profiles.** Voxtype supports named profiles with different post-processing commands -- one for Slack messages, one for code comments, one for documentation.

## Conclusion

Getting push-to-talk voice dictation working on Wayland requires solving a specific set of problems: text injection (ydotool over wtype), hotkey passthrough (modifier keys over regular keys), and audio capture quirks (PipeWire flat-volume). Once these are addressed, the setup is simple and compositor-agnostic. Voxtype handles the recording and transcription, ydotool handles the text output, and the whole pipeline runs at the kernel level below the compositor.

The result is push-to-talk dictation that works in any application on any Wayland compositor. Press a key, speak, and text appears. For dictating prompts to AI coding agents, explaining intent in natural language, or any situation where speaking is faster than typing, it is a genuine productivity improvement.
