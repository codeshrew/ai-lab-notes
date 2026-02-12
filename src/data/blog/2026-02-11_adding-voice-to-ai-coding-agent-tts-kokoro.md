---
title: "Adding Voice to Your AI Coding Agent: Text-to-Speech with Kokoro"
author: sk
pubDatetime: 2026-02-11T12:00:00-05:00
featured: false
draft: false
tags:
  - ai
  - claude-code
  - tts
  - voice
  - docker
  - linux
  - setup-guide
description: "Give your AI coding agent a voice with Kokoro TTS. Deploy a local, GPU-accelerated text-to-speech server and wire it into Claude Code for spoken responses."
---

AI coding agents are text-first by nature. You type a prompt, the agent reads files, runs commands, writes code, and reports back in text. That works -- but there are moments when hearing a short spoken response is genuinely better. A quick "Done, all tests pass" while you are looking at another monitor. A spoken question when you are reading documentation. A confirmation that the agent understood your intent before it starts a long task. This guide walks through adding text-to-speech output to a CLI coding agent like Claude Code, using Kokoro -- a tiny, fast, open-source TTS model that runs locally on your GPU.

## Table of contents

## Why Voice Output (and Why Not Voice Everything)

The instinct is to make the agent read everything aloud. That instinct is wrong. Code is a visual medium. Hearing an AI read a function definition, a diff, or an error traceback is painful and useless. The same goes for long explanations, file paths, or multi-step plans -- these need to be read at your own pace, not listened to at the model's pace.

What voice output does well is the conversational glue between those text-heavy blocks:

- **Acknowledgments.** "Got it, looking into that now." You hear it and know the agent is working, without shifting your eyes to the terminal.
- **Short status updates.** "Found the issue. Fixing it now." You get the gist while you stay focused on what you are reading.
- **Questions.** "Should I refactor the test file too, or just the source?" You hear it, think, and answer -- no context switch to read.
- **Completions.** "Done. Three files changed, all tests pass." You know the task finished without checking.

The design principle: speak the things a coworker sitting next to you would say out loud. Keep everything else as text.

## Kokoro TTS: The Right Tool for This Job

[Kokoro](https://github.com/remsky/Kokoro-FastAPI) is a text-to-speech model with an unusual profile: it is only 82 million parameters (for comparison, a small language model is 1-8 billion), yet it produces natural-sounding speech with about 275ms latency on an NVIDIA GPU. It is Apache 2.0 licensed, ships as a Docker container with an OpenAI-compatible API, and comes loaded with 67 voice packs covering American, British, and other English accents.

Why Kokoro over alternatives:

| Option | Parameters | VRAM | Latency | License | API Compatible |
|--------|-----------|------|---------|---------|:---:|
| **Kokoro 82M** | 82M | ~0.5 GB | ~275ms | Apache 2.0 | OpenAI |
| Piper | Varies | CPU-only | <50ms | MIT | Custom |
| Chatterbox Turbo | ~300M+ | 1-2 GB | ~150ms | Apache 2.0 | Custom |
| OpenAI TTS | Cloud | N/A | ~250ms | Proprietary | OpenAI |
| gpt-4o-mini-tts | Cloud | N/A | ~250ms | Proprietary | OpenAI |

Kokoro wins on the combination of factors that matter here: low VRAM (it runs alongside large LLMs without competition for GPU memory), fast enough latency (under 300ms feels instant for conversational responses), an OpenAI-compatible API (easy to integrate), and fully local (no API keys, no usage costs, no data leaving your machine).

Piper is faster but CPU-only and uses a custom API. Chatterbox Turbo produces higher quality speech and supports voice cloning, but uses more VRAM. Cloud options like OpenAI TTS work well but introduce latency variance, cost, and a dependency on internet connectivity.

## Deploying Kokoro with Docker

Kokoro ships as a GPU-enabled Docker container. One command gets it running:

```bash
docker run -d \
  --name kokoro-tts \
  --gpus all \
  --restart unless-stopped \
  -p 8880:8880 \
  ghcr.io/remsky/kokoro-fastapi-gpu:latest
```

This starts Kokoro on port 8880 with GPU access and automatic restart on boot. The first launch downloads the model weights and voice packs (a few hundred MB total).

Verify it is running:

```bash
# Check the container
docker ps | grep kokoro

# Test speech generation
curl http://localhost:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model": "kokoro", "input": "Hello, this is a test.", "voice": "af_heart"}' \
  --output test.mp3

# Play the result
ffplay -nodisp -autoexit test.mp3
```

If you hear speech, the server is working. The web player at `http://localhost:8880/web/` lets you test different voices interactively.

### Choosing a Voice

Kokoro ships 67 voices. The naming convention indicates accent and gender:

- `af_` -- American female (e.g., `af_heart`, `af_bella`, `af_nova`, `af_sarah`)
- `am_` -- American male (e.g., `am_adam`, `am_echo`, `am_eric`, `am_michael`)
- `bf_` -- British female (e.g., `bf_emma`, `bf_lily`)
- `bm_` -- British male (e.g., `bm_george`, `bm_lewis`)

List all available voices:

```bash
curl -s http://localhost:8880/v1/audio/voices | jq '.voices[].voice_id'
```

Try a few and pick one that you find comfortable to listen to for extended sessions. `af_heart` is a good default -- clear, natural-sounding, and easy to understand at conversational speed.

### VRAM Considerations

Kokoro uses roughly 0.5 GB of VRAM. This is small enough to run alongside most LLM setups:

- **8 GB GPU:** Room for Kokoro plus a 7B model (quantized)
- **12 GB GPU:** Comfortable with Kokoro and a 13B model
- **24 GB GPU:** Kokoro is barely noticeable -- you still have 23+ GB for large models

If you are running other GPU-intensive services (like image generation), you may need to stop them before loading large language models. Kokoro itself is lightweight enough that it rarely matters.

## The `say` Script

The bridge between Kokoro and your terminal is a simple shell script. This script takes text as an argument (or from stdin), sends it to the Kokoro API, and plays the audio:

```bash
#!/bin/bash
# ~/.local/bin/say
# Speak text via Kokoro TTS.
# Usage: say "text to speak"
#    or: echo "text" | say
#    or: say --voice am_adam "text"
#
# Reads defaults from voice-config.json. Plays audio via ffplay (PipeWire default sink).
# Designed to be called by Claude Code for conversational voice responses.

set -euo pipefail

CONFIG="$HOME/.config/voice/config.json"

# Defaults
VOICE=""
TTS_URL="http://localhost:8880/v1/audio/speech"
MODEL="kokoro"

# Read config if it exists
if [[ -f "$CONFIG" ]]; then
    VOICE=$(jq -r '.voice // "af_heart"' "$CONFIG" 2>/dev/null || echo "af_heart")
    TTS_URL=$(jq -r '.tts_url // "http://localhost:8880/v1/audio/speech"' "$CONFIG" 2>/dev/null || echo "http://localhost:8880/v1/audio/speech")
    MODEL=$(jq -r '.model // "kokoro"' "$CONFIG" 2>/dev/null || echo "kokoro")
fi

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --voice) VOICE="$2"; shift 2 ;;
        --) shift; break ;;
        *) break ;;
    esac
done

# Get text from remaining args or stdin
if [[ $# -gt 0 ]]; then
    TEXT="$*"
else
    TEXT=$(cat)
fi

[[ -z "${TEXT:-}" ]] && exit 0

# Generate speech
TMPFILE=$(mktemp /tmp/say-XXXXXX.mp3)
trap "rm -f $TMPFILE" EXIT

curl -s "$TTS_URL" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg model "$MODEL" --arg input "$TEXT" --arg voice "$VOICE" \
        '{model: $model, input: $input, voice: $voice}')" \
    --output "$TMPFILE" 2>/dev/null

[[ ! -s "$TMPFILE" ]] && echo "TTS failed" >&2 && exit 1

# Play audio
ffplay -nodisp -autoexit -loglevel quiet "$TMPFILE" 2>/dev/null || true
```

Save this as `~/.local/bin/say` and make it executable:

```bash
chmod +x ~/.local/bin/say
```

Make sure `~/.local/bin` is in your `PATH` (it usually is on Ubuntu/Pop!_OS), and install the dependencies:

```bash
sudo apt install ffmpeg jq
```

Test it:

```bash
say "Testing one two three"
```

### How the Script Works

The script follows a simple pipeline:

1. **Read config.** Pulls voice, URL, and model from a JSON config file (if it exists). Falls back to sensible defaults.
2. **Accept text.** From command-line arguments or stdin.
3. **Call the API.** Sends a POST request to the Kokoro OpenAI-compatible endpoint with the text and voice parameters.
4. **Play audio.** Writes the MP3 response to a temp file and plays it with `ffplay` (part of FFmpeg). The `-autoexit` flag makes ffplay exit when the audio finishes. The temp file is cleaned up on exit via `trap`.

### A Bug Worth Knowing About

The original version of this script used a background process with `wait`:

```bash
# Broken version -- don't do this
ffplay -nodisp -autoexit -loglevel quiet "$TMPFILE" &
PID=$!
timeout 30 wait $PID
```

This looks reasonable but silently fails. `wait` is a shell builtin, and `timeout` only works with external commands -- it cannot wrap builtins. The result: `timeout` exits immediately, the `trap` fires, the temp file gets deleted, and `ffplay` tries to play a file that no longer exists. No error, no audio, just silence.

The fix is to run `ffplay` in the foreground. Since `-autoexit` already makes ffplay exit when playback finishes, there is no need for a background process or `wait` at all:

```bash
ffplay -nodisp -autoexit -loglevel quiet "$TMPFILE" 2>/dev/null || true
```

This is the kind of bug that costs an hour to find because everything looks correct and nothing produces an error message.

## Wiring It Into Claude Code

With the `say` script in place, you can integrate voice output into Claude Code (or any AI coding agent that can execute shell commands). The approach uses a skill -- a custom slash command that Claude Code can invoke.

### The Voice Config File

Create a config file that tracks whether voice mode is on or off:

```json
{
  "enabled": false,
  "voice": "af_heart",
  "tts_url": "http://localhost:8880/v1/audio/speech",
  "model": "kokoro"
}
```

Save this as `~/.config/voice/config.json` (matching the path in the `say` script). If you prefer a different location, update the `CONFIG` variable in the script to match.

### The Voice Skill

If you use Claude Code, you can create a skill (custom slash command) that toggles voice mode. The skill reads and writes the config file, and instructs Claude on when to speak versus when to stay silent.

The key behavioral rules in the skill:

**Speak** (via `say "message"`) for:
- Acknowledgments: "Got it, looking into that now."
- Short status: "Found the issue. Fixing it now."
- Questions: "Should I use approach A or B?"
- Completions: "Done. Three files changed, all tests pass."

**Do not speak** (text only) for:
- Code blocks, diffs, file contents
- Multi-step plans or long explanations
- Tool output or command results
- Anything longer than about two sentences

The skill gives Claude explicit instructions to check the config before speaking (the user might toggle it off mid-session) and to keep spoken output conversational and brief -- like a coworker sitting next to you, not a narrator reading the screen aloud.

In practice, a session with voice mode looks like this:

1. You type `/voice on`
2. Claude says "Voice mode enabled. I'll speak short responses to you now."
3. You type a task: "fix the failing test in auth.test.ts"
4. Claude says "Got it, looking into that now." Then it reads the file, analyzes the error, and shows you the diff as text. When it finishes: "Done. The assertion was comparing against the wrong expected value. Test passes now."
5. You type `/voice off` when you want silence again.

The result is a workflow that feels like pair programming with someone who tells you the important bits out loud and shows you the details on screen.

## Bonus: Open WebUI Voice Chat

If you run [Open WebUI](https://docs.openwebui.com/) for a chat interface to local LLMs, you can point its TTS engine at the same Kokoro instance. In the Admin Panel under Audio settings:

- Set **TTS Engine** to OpenAI
- Set **API Base URL** to `http://localhost:8880/v1`
- Set **TTS Model** to `kokoro`

This gives you full voice-in, voice-out conversations with local models -- Open WebUI handles the STT (speech-to-text) side, sends the transcript to your LLM, and plays the response through Kokoro. One TTS server, two interfaces.

## Wrapping Up

Adding voice output to an AI coding agent is a small change that improves the workflow in a specific, practical way. You are not replacing text -- you are adding a channel for the kind of short, conversational information that benefits from being heard rather than read.

The stack is straightforward: Kokoro TTS in a Docker container (0.5 GB VRAM, 275ms latency, 67 voices), a shell script that calls its API and plays audio, and a config-driven toggle so you control when the agent speaks. Total setup time is about 15 minutes, and the result is an agent that feels more like a collaborator and less like a log file.

The `say` script is reusable beyond coding agents -- pipe any text to it from other tools, cron jobs, or notification systems. And since Kokoro exposes an OpenAI-compatible API, anything that can talk to the OpenAI TTS endpoint can use it as a drop-in local replacement.
