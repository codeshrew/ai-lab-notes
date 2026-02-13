---
title: "Claude Code Hooks: Making Voice Mode Persistent Across Turns"
author: sk
pubDatetime: 2026-02-13T12:00:00-05:00
featured: false
draft: false
tags:
  - ai
  - claude-code
  - voice
  - hooks
  - linux
description: "Use Claude Code's Stop hook to inject a system reminder after every response, so the agent remembers voice mode without burning tokens on verbose skill instructions."
---

In a [previous post](/ai-lab-notes/posts/2026-02-11_adding-voice-to-ai-coding-agent-tts-kokoro), I set up Kokoro TTS so Claude Code could speak short conversational responses via a `/voice` slash command. It worked -- but it had a problem. The agent would sometimes forget to speak after a few turns, because the voice behavior instructions only lived in the skill invocation context and faded as the conversation grew. This post covers how I fixed that with a Claude Code hook, and the design tradeoffs I considered along the way.

## Table of contents

## The Problem: Skills Are One-Shot Context

When you invoke `/voice on` in Claude Code, the skill's instructions get injected into the conversation for that turn. Claude reads the rules ("speak short responses, skip code and diffs"), enables the config, and speaks a confirmation. Great.

But those instructions are not permanent. As the conversation grows and context compresses, the behavioral rules gradually lose influence. Ten turns later, Claude is back to text-only responses -- not because voice is disabled, but because the instructions are no longer salient in context.

The original skill tried to solve this by being thorough: 56 lines of detailed rules about when to speak and when not to. But verbose instructions do not help if they are 4000 tokens back in context and competing with recent code diffs for attention.

## Three Approaches I Considered

### 1. Hook as Speaker

The most obvious idea: use a Stop hook (fires after every Claude response) to read the transcript, extract the response, and pipe it through `say`. Let the hook handle all speech.

This fails because the value of voice mode is *editorial judgment*. Claude does not just parrot its text output -- it composes a separate, shorter spoken version. It writes a 30-line diff as text but speaks "Done, fixed the import error." A hook script cannot make that editorial decision. You would need one of:

- **Heuristics** (length checks, regex for code fences) -- fragile, often wrong
- **An LLM in the hook** (agent-type hook) -- adds latency and cost to every response, even when voice is off
- **A special marker** in Claude's output (e.g., `<!-- voice: Done -->`) -- the most promising but still brittle

None of these are better than just letting Claude decide when to speak inline.

### 2. Hook as Reminder

Instead of having the hook *do* the speaking, have it *remind* Claude to speak. A Stop hook that injects a one-line system message: "Voice is on. Remember to speak short responses."

This is lightweight: the hook checks a config file, and if voice is enabled, returns a short JSON blob with a `systemMessage` field. That message gets injected into Claude's context for the next turn. The behavioral knowledge stays fresh without restating the full rules every time.

### 3. No Hook, Just Better Instructions

Alternatively, keep everything in the skill and make the instructions stickier. Shorter, punchier rules that survive context compression better.

This helps but does not solve the fundamental problem: skill instructions are injected once and decay over time. A hook is structural -- it fires after every response regardless of context pressure.

I went with approach 2 -- the reminder hook -- combined with slimming down the skill instructions.

## The Implementation

### The Hook Script

```bash
#!/bin/bash
# .claude/hooks/voice-reminder.sh
# Stop hook -- injects a short voice-mode reminder when enabled.
# Fires after every Claude response. No-ops instantly when voice is off.
set -euo pipefail

CONFIG="${CLAUDE_PROJECT_DIR:-.}/.claude/voice-config.json"

# Drain stdin (hook sends JSON context we don't need)
cat > /dev/null

# Bail fast if voice is off or config missing
if [[ ! -f "$CONFIG" ]]; then
    exit 0
fi

ENABLED=$(jq -r '.enabled // false' "$CONFIG" 2>/dev/null || echo "false")
if [[ "$ENABLED" != "true" ]]; then
    exit 0
fi

# Inject terse reminder for next turn
cat <<'EOF'
{"systemMessage":"Voice ON. Speak short responses (acks, status, questions, completions) via say \"message\". Skip code, diffs, long output, anything >2 sentences."}
EOF
```

Key design choices:

- **Bail fast.** When voice is off (the common case), the script reads the config and exits in a few milliseconds. No wasted work.
- **Drain stdin.** Claude Code sends JSON context to hooks via stdin. We do not need it, but we read it to avoid a broken pipe.
- **Terse reminder.** The system message is one line, about 25 tokens. Compare to the original 56-line skill instructions. This fires after every response, so brevity matters.

### Registering the Hook

Add it to `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(say *)"
    ]
  },
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/voice-reminder.sh"
          }
        ]
      }
    ]
  }
}
```

Two things happening here:

1. **The Stop hook** registers `voice-reminder.sh` to fire after every response.
2. **The `say *` permission** auto-allows all `say` commands without a confirmation prompt. Without this, every spoken response triggers a "Allow Bash: say ...?" dialog, which defeats the purpose.

### Slimming the Skill

The `/voice` skill went from 56 lines to 27. Before, it contained all the behavioral rules (when to speak, when not to, how to sound natural). Now it is just a toggle:

```markdown
## Toggle

- **`on`**: Set `enabled: true`. Confirm: `say "Voice mode on."`.
- **`off`**: Set `enabled: false`. Print "Voice mode off." (don't speak).
- **`status`**: Report current state (enabled, voice name).
- **No argument**: Toggle current state.

A Stop hook automatically reminds you about voice behavior
while enabled -- no rules to memorize here.
```

The behavioral knowledge moved from the skill (injected once, decays) to the hook (injected every turn, persistent). The skill just flips the switch.

## How It Flows

```
User: /voice on
  -> Skill reads config, sets enabled: true
  -> Claude speaks "Voice mode on."
  -> Stop hook fires, sees enabled: true, injects reminder

User: "fix the auth bug"
  -> Claude sees reminder in context: "Voice ON. Speak short responses..."
  -> Claude speaks "Got it, looking into that."
  -> Claude reads files, writes fix, shows diff as text
  -> Claude speaks "Done. Fixed the token validation."
  -> Stop hook fires again, refreshes the reminder

User: /voice off
  -> Skill sets enabled: false
  -> Stop hook fires, sees enabled: false, exits silently
  -> No more reminders until re-enabled
```

The hook costs essentially nothing when voice is off (a config file read), and about 25 tokens per turn when voice is on. Compared to the original approach -- where the full behavioral instructions consumed 300+ tokens and still decayed over time -- this is both cheaper and more reliable.

## When This Pattern Is Useful Beyond Voice

The "Stop hook as persistent reminder" pattern works for any session-level behavior that should survive context compression:

- **Code style enforcement.** A hook that reminds the agent about project conventions (naming, error handling, test patterns) after every response.
- **Safety constraints.** A hook that reinforces rules like "never modify production config" or "always run tests after editing."
- **Mode toggles.** Any feature where the user expects the agent to "remember" a preference -- verbose mode, a specific output format, a target branch.

The key insight: skills inject context once, hooks inject it continuously. Use skills for actions (toggle a setting, run a command) and hooks for persistence (keep the agent aware of the setting).

## What I Would Do Differently

The main uncertainty is whether the Stop hook's `systemMessage` survives context compression as well as I hope. It gets injected fresh each turn, so even if old reminders get compressed away, the latest one should be in the hot zone of context. Early results are promising -- Claude consistently remembers to speak across 20+ turn sessions now -- but I have not stress-tested it with truly long conversations.

If that turns out to be a problem, the next step would be a smarter hook that reads the transcript (`$transcript_path` from the hook's stdin JSON), checks whether Claude actually called `say` in its last response, and only injects the reminder if it did not. That would trade a bit more hook complexity for targeted reminders instead of blanket ones. For now, 25 tokens per turn is cheap enough that blanket reminders are fine.

## Setup Summary

If you want to replicate this (assuming you already have the [Kokoro TTS setup](/ai-lab-notes/posts/2026-02-11_adding-voice-to-ai-coding-agent-tts-kokoro) from the previous post):

1. Create `.claude/hooks/voice-reminder.sh` with the script above
2. `chmod +x .claude/hooks/voice-reminder.sh`
3. Add the `Stop` hook and `Bash(say *)` permission to `.claude/settings.json`
4. Restart your Claude Code session (hooks are captured at session start)
5. `/voice on` to enable, `/voice off` to disable

The hook, the skill, and the `say` script are all in my [popos-management repo](https://github.com/codeshrew/popos-management) if you want to see the full implementation.
