---
title: "Speaker Verification for a Wake Word Daemon: Keeping 'Hey Jarvis' Personal"
author: sk
pubDatetime: 2026-02-13T18:00:00-05:00
featured: false
draft: false
tags:
  - ai
  - voice
  - linux
  - security
  - setup-guide
description: "Add speaker verification to a wake word daemon so only your voice triggers it. Uses SpeechBrain ECAPA-TDNN, a rolling audio buffer, and cosine similarity -- 270ms latency, 86 MB VRAM."
---

A wake word daemon that listens for "Hey Jarvis" and triggers dictation is useful -- until the TV says something close enough. Or your phone plays a podcast. Or someone else in the room speaks. The daemon does not know who said the wake word, only that something sounded like it. This post covers how I added speaker verification to the daemon so it only responds to my voice, using an open-source speaker embedding model that runs locally on GPU with negligible latency and VRAM cost.

## Table of contents

## The Problem: Who Said That?

In [previous posts](/ai-lab-notes/posts/2026-02-11_voice-dictation-cosmic-wayland), I set up a voice pipeline on my workstation: openWakeWord listens for "Hey Jarvis", triggers Voxtype for speech-to-text, and the transcribed text appears at the cursor. Combined with [Kokoro TTS](/ai-lab-notes/posts/2026-02-11_adding-voice-to-ai-coding-agent-tts-kokoro) for spoken responses and a [persistent voice mode hook](/ai-lab-notes/posts/2026-02-13_claude-code-hooks-persistent-voice-mode), this gives me hands-free interaction with my AI coding agent.

The wake word detector (openWakeWord) does one thing: classify whether a chunk of audio sounds like "Hey Jarvis." It uses a small ONNX model that scores each audio frame from 0 to 1, and anything above the threshold triggers the action. This works well for intentional wake words in a quiet room. It falls apart in several common scenarios:

- **TV and media playback.** Movie dialogue, YouTube videos, podcasts -- any voice content can produce false positives.
- **Phone calls on speaker.** The other person's voice is picked up by the desk microphone.
- **Other people in the room.** Anyone who knows the wake word can trigger your workstation.
- **Smart speakers and voice assistants.** Other devices responding to similar-sounding wake words create cascading triggers.

Tuning the detection threshold higher reduces false positives but also makes it harder to trigger intentionally -- you end up needing to speak louder or more precisely. The fundamental issue is that the detector has no concept of *who* is speaking, only *what* was said.

Speaker verification solves this by adding a second gate: after the wake word is detected, check whether the voice that said it belongs to the enrolled user. If not, ignore the trigger silently.

## Architecture

The verification slot fits naturally between wake word detection and the action trigger:

```
Microphone (PipeWire, 16kHz mono)
    |
    v
openWakeWord (ONNX, CPU, ~0% overhead)
    |  "Hey Jarvis" score > 0.50?
    v
Rolling audio buffer (~3s)
    |
    v
ECAPA-TDNN speaker embedding (CUDA, ~50ms)
    |  cosine similarity > 0.25?
    v
Voxtype start recording
    |
    v
whisper.cpp transcription (GPU)
    |
    v
ydotool type (text at cursor)
```

The key insight is that the audio needed for speaker verification is already available. The microphone stream feeds openWakeWord continuously. By keeping a rolling buffer of recent audio, the verification step does not need its own recording phase -- it uses the audio that was already flowing through the pipeline when the wake word was detected.

## ECAPA-TDNN: The Speaker Embedding Model

[ECAPA-TDNN](https://arxiv.org/abs/2005.07143) (Emphasized Channel Attention, Propagation and Aggregation in Time Delay Neural Networks) is a speaker verification model that maps variable-length audio to a fixed-size embedding vector (192 dimensions). Two embeddings from the same speaker produce high cosine similarity; embeddings from different speakers produce low similarity.

Why ECAPA-TDNN over alternatives:

| Model | EER (VoxCeleb) | License | VRAM | Origin |
|-------|:---:|---------|:---:|--------|
| **ECAPA-TDNN** | 0.80% | Apache 2.0 | ~86 MB | Mila Quebec / Paris-Saclay |
| NVIDIA TitaNet | 0.68% | NeMo license | ~200 MB | US |
| X-Vectors | 3.1% | Apache 2.0 | ~50 MB | Johns Hopkins |
| ResNetSE34L | 1.2% | MIT | ~120 MB | VGGVox |

EER (Equal Error Rate) is the point where the false acceptance rate equals the false rejection rate -- lower is better. ECAPA-TDNN at 0.80% means that with the right threshold, fewer than 1 in 100 attempts will either let the wrong speaker through or reject the right speaker.

The model is available through [SpeechBrain](https://speechbrain.readthedocs.io/), an open-source speech toolkit developed at Mila (Montreal Institute for Learning Algorithms, Quebec) and Universit Paris-Saclay. Both are Canadian and French institutions -- no jurisdiction concerns.

On an RTX 3090, ECAPA-TDNN uses about 86 MB of VRAM and processes a 3-second audio clip in roughly 50ms. The total verification latency including data conversion and similarity computation is around 270ms -- perceptible but not annoying, especially since it only happens when a wake word is detected.

## The Rolling Audio Buffer

The daemon continuously feeds 320ms audio chunks to openWakeWord for detection. For speaker verification, I need a few seconds of audio from *before* the detection event -- the voice that said "Hey Jarvis" is in the recent past, not the future.

A `collections.deque` with a fixed max length handles this efficiently:

```python
import collections
import numpy as np

# Each chunk is ~320ms at 16kHz. 9 chunks = ~2.9s of audio.
audio_rolling: collections.deque[np.ndarray] = collections.deque(maxlen=9)

# In the audio processing loop:
audio_data = audio_chunk.flatten()  # int16
audio_rolling.append(audio_data)
```

The deque automatically discards the oldest chunk when a new one arrives. At 16kHz mono int16 (2 bytes per sample), 9 chunks of 5120 samples each is about 90 KB of memory. When the wake word triggers, the buffer contains the most recent ~3 seconds of audio -- enough for ECAPA-TDNN to produce a reliable embedding.

Why ~3 seconds? Speaker verification models work best with 2-5 seconds of speech. Less than 1 second produces unreliable embeddings. More than 5 seconds adds no meaningful accuracy. The "Hey Jarvis" wake phrase itself is about 0.8 seconds, and the rolling buffer captures it along with surrounding audio -- breathing, ambient sound, the start of the next sentence -- which all contribute to the speaker's voiceprint.

## Enrollment

Before verification can work, the system needs a reference embedding for the authorized speaker. The enrollment script records multiple voice samples, extracts an embedding from each, and averages them into a single reference:

```python
def enroll(model, num_samples: int, profile: str):
    embeddings = []
    for i in range(1, num_samples + 1):
        audio = record_sample(i, num_samples)  # 5 seconds each
        emb = extract_embedding(model, audio)
        embeddings.append(emb)

    # Average and L2-normalize
    stacked = torch.stack(embeddings)
    mean_emb = stacked.mean(dim=0)
    ref_emb = torch.nn.functional.normalize(mean_emb, dim=0)

    # Save as a .pt file
    torch.save(ref_emb.cpu(), enrolled_dir / f"{profile}.pt")
```

The enrollment process:

1. **Record 10 samples of 5 seconds each.** Speak naturally -- read aloud, count numbers, describe your day. Varying tone across samples makes the reference more robust.
2. **Extract an embedding from each sample.** Each becomes a 192-dimensional vector.
3. **Average the embeddings.** This smooths out variation from individual samples (mood, energy level, background noise).
4. **L2-normalize the result.** This ensures the reference embedding has unit length, which makes cosine similarity comparisons well-behaved.
5. **Save to disk.** A `.pt` file at `~/.local/share/wakeword/enrolled/default.pt` (~800 bytes).

The script also prints pairwise cosine similarities between all samples as a quality check. If your samples are consistent (similar speaking conditions, same mic), you should see pairwise similarities above 0.70. Low consistency (below 0.50) suggests too much background noise or too much variation between samples.

Running enrollment:

```bash
# Record 10 samples, save as "default" profile
python3 enroll-speaker.py

# Test verification against your enrollment
python3 enroll-speaker.py --test
```

The test mode records one new sample and reports the cosine similarity against the saved reference, with a guide for interpreting the score.

## Verification at Runtime

When the wake word triggers, the daemon checks the speaker before acting:

```python
def verify_speaker(sv_model, ref_emb, audio_buffer, threshold: float) -> bool:
    # Concatenate the rolling buffer into one signal
    audio = np.concatenate(list(audio_buffer)).flatten()
    if len(audio) < SAMPLE_RATE:  # need at least 1s
        return True  # not enough audio, fall through

    # Convert int16 -> float32 normalized
    signal = torch.tensor(audio, dtype=torch.float32) / 32768.0
    signal = signal.unsqueeze(0)

    with torch.no_grad():
        embedding = sv_model.encode_batch(signal).squeeze()

    similarity = torch.nn.functional.cosine_similarity(
        ref_emb.unsqueeze(0), embedding.unsqueeze(0)
    ).item()

    if similarity >= threshold:
        logger.info("Speaker verified (similarity=%.3f)", similarity)
        return True
    else:
        logger.info("Speaker rejected (similarity=%.3f)", similarity)
        return False
```

The flow in the main detection loop:

```python
if score >= args.threshold:
    logger.info("Wake word detected! (score=%.3f)", score)

    # Speaker verification gate
    if sv_model is not None and sv_ref_emb is not None:
        if not verify_speaker(sv_model, sv_ref_emb, audio_rolling, args.verify_threshold):
            logger.info("Wake word ignored -- speaker not verified")
            continue

    # Only reaches here if speaker is verified (or verification is disabled)
    voxtype_start()
```

### Choosing a Threshold

The cosine similarity threshold controls the tradeoff between security and convenience:

| Threshold | Behavior |
|:---------:|----------|
| 0.15 | Permissive -- fewer false rejections, more false accepts. Good if you prioritize not having to repeat yourself. |
| 0.25 | Balanced -- the default. Works well for a single-user workstation. |
| 0.40 | Strict -- more false rejections, fewer false accepts. Better if other people frequently speak near the mic. |

The threshold is a command-line argument, so you can tune it without editing code:

```bash
wakeword-daemon.py --verify-speaker --verify-threshold 0.30
```

In my testing, a threshold of 0.25 cleanly separates my voice (similarity 0.50-0.70) from TV audio and other voices (similarity below 0.15). There is a wide margin, which means the threshold could go significantly higher before I start getting false rejections.

## Live Test Results

After enrollment and restarting the daemon with `--verify-speaker`, the first live test:

```
Wake word detected! (score=0.858)
Speaker verified (similarity=0.620, threshold=0.25)
```

Wake score 0.858 is a strong detection (threshold is 0.50). Speaker similarity 0.620 is well above the 0.25 threshold -- the system is confident it is me. The total time from speaking the wake word to Voxtype starting recording is about 270ms, which feels like a brief natural pause rather than a delay.

TV audio playing through the desk speakers triggers wake detections occasionally (the score crosses 0.50), but speaker verification rejects them consistently -- the similarity scores come back in the 0.02-0.10 range, nowhere near the 0.25 threshold.

## Graceful Fallback

The verification system is designed to fail open rather than fail locked. If anything goes wrong, the daemon falls back to its pre-verification behavior (wake word triggers action immediately):

```python
def load_speaker_verification(profile: str):
    try:
        # Load model and reference embedding...
        return model, ref_emb
    except Exception as e:
        logger.warning("Failed to load speaker verification: %s -- disabled", e)
        return None, None
```

This handles several cases:

- **No enrollment file.** You just installed the daemon and have not run enrollment yet. The daemon works without verification.
- **Model download failure.** ECAPA-TDNN downloads on first use (~100 MB from HuggingFace). If the network is down, the daemon still works.
- **CUDA out of memory.** If the GPU is fully loaded, the model fails to load and verification is disabled.
- **Runtime errors.** If `verify_speaker()` throws any exception, it returns `True` (allow through) and logs a warning.

The principle: speaker verification is a convenience feature that reduces false triggers. It should never prevent the user from using their own workstation.

### External Trigger Bypass

The daemon also monitors for externally triggered recordings. If you press the Right Alt key (the push-to-talk hotkey for Voxtype), the daemon detects the recording state change and monitors for silence -- without speaker verification:

```python
vox_state = get_voxtype_state()
if vox_state == "recording":
    logger.info("Recording detected (external trigger), monitoring for silence")
    wait_for_silence(audio_queue, args.silence, lambda: running)
    continue  # No verification needed -- physical keypress = implicit auth
```

Physical presence at the keyboard is implicit authentication. You are sitting at the machine, you pressed the key, there is nothing to verify.

## VRAM and Resource Impact

The ECAPA-TDNN model is small by modern AI standards:

| Resource | Without Verification | With Verification |
|----------|:---:|:---:|
| VRAM | 0 MB | ~86 MB |
| RAM | ~300 MB | ~350 MB |
| CPU | ~7% (1 core) | ~7% (1 core) |
| Latency per trigger | 0 ms | ~270 ms |

On a 24 GB GPU (RTX 3090), 86 MB is negligible -- it disappears into the rounding error alongside Kokoro TTS (500 MB), the wake word model itself (runs on CPU), and whatever LLMs are loaded. On an 8 GB GPU, it is still small enough to not matter.

The verification only runs when a wake word is detected, which happens a few times per hour at most. Between detections, the model sits idle in VRAM. There is no continuous inference cost -- just the rolling buffer (90 KB of RAM) and the existing audio stream that openWakeWord was already consuming.

## Anti-Spoofing Limitations

Speaker verification is voice biometrics, and voice biometrics has known limitations that are worth being explicit about.

**What it does protect against:**
- TV, podcast, and media playback triggering the wake word
- Other people in the room (including people who know the wake word)
- Phone speakers, smart speakers, and other audio devices

**What it does NOT protect against:**
- **Recorded replay attacks.** Someone could record you saying "Hey Jarvis" and play it back. The embedding from a high-quality recording would match your enrolled profile.
- **Voice synthesis.** Modern TTS and voice cloning can produce speech that fools speaker verification systems. ECAPA-TDNN has no built-in anti-spoofing.
- **Physical access.** If someone is at your keyboard, they can use the push-to-talk key directly and bypass verification entirely (by design).

For a personal workstation in a home office, these limitations are acceptable. The threat model is not "attacker trying to compromise my system" -- it is "TV turned on in the same room." For that threat, speaker verification is effective and proportionate.

If you do need anti-spoofing, models like [AASIST-L](https://github.com/clovaai/aasist) (for detecting synthesized speech) and [VOID](https://arxiv.org/abs/2203.15195) (for detecting replayed audio) can be layered on top. But for a wake word daemon, that is overkill. The wake word triggers a dictation tool, not a bank transfer. Voice biometrics is a good convenience gate -- not a sole authentication factor for anything critical.

## Setup Summary

If you want to add speaker verification to your own wake word daemon (or a similar always-listening application):

### 1. Install Dependencies

```bash
# In your Python environment (pyenv, venv, etc.)
pip install speechbrain torch torchaudio
```

On a CUDA-capable system, make sure `torch` is installed with CUDA support. The model will fall back to CPU if CUDA is unavailable, but it will be slower.

### 2. Enroll Your Voice

```bash
python3 enroll-speaker.py
```

This records 10 five-second samples and saves a reference embedding. Speak naturally. The script prints pairwise similarities between samples -- you want to see values above 0.70 for consistency.

### 3. Enable Verification in the Daemon

```bash
wakeword-daemon.py --verify-speaker --verify-threshold 0.25
```

Or in a systemd service:

```ini
ExecStart=/path/to/python3 /path/to/wakeword-daemon.py \
    --threshold 0.5 --cooldown 2 \
    --verify-speaker --verify-threshold 0.25
```

### 4. Test and Tune

Run the daemon in debug mode to see scores:

```bash
wakeword-daemon.py --verify-speaker --debug
```

Say the wake word and check the similarity score. Then play audio from your TV or phone near the mic and confirm it gets rejected. Adjust `--verify-threshold` up or down based on your environment.

## Wrapping Up

Speaker verification adds about 270ms of latency and 86 MB of VRAM to a wake word daemon, and in exchange you get a system that only responds to your voice. The implementation is straightforward: a rolling audio buffer captures recent microphone input, ECAPA-TDNN produces a speaker embedding when the wake word triggers, and a cosine similarity check gates the action. Enrollment takes two minutes, and the system falls back gracefully if anything goes wrong.

The broader pattern -- a cheap always-on detector followed by a more expensive verification step -- is a good design for any voice-activated system. The wake word model runs continuously on CPU at near-zero cost. The speaker model runs on GPU only when needed (a few times per hour). You get the responsiveness of always-listening without paying the cost of always-verifying.

The [wakeword daemon](https://github.com/codeshrew/popos-management) and enrollment script are in my system management repo.
