---
title: "Running Local LLMs on Linux: A Practical Guide"
author: sk
pubDatetime: 2026-02-08T00:00:00Z
featured: false
draft: false
tags:
  - ai
  - llm
  - local-models
  - ollama
  - linux
  - guide
description: "A practical guide to running large language models locally on Linux with Ollama and LM Studio, organized by GPU VRAM budget."
---

Running large language models on your own hardware gives you privacy, eliminates per-token API costs, and lets you experiment without rate limits. The tooling has matured significantly -- you no longer need to compile CUDA kernels by hand or manage Python dependency hell. This guide covers the practical choices: which inference engines to use, which models to run, and how to match them to your GPU.

## Table of contents

## Why Run Local?

There are three main reasons to run LLMs locally rather than through an API:

1. **Privacy.** Your prompts and data never leave your machine. This matters for proprietary code, personal documents, or any scenario where you do not want a third party processing your inputs.
2. **Cost.** API calls add up quickly, especially for agentic workflows that make dozens of LLM calls per task. A local model running on your GPU has zero marginal cost per token.
3. **Latency and availability.** No network round-trip, no rate limits, no outages. Local inference is especially fast for small models -- you can get sub-second responses for simple tasks.

The tradeoff is capability. As of early 2026, the best local models (70B parameter class) are strong but still a step below frontier cloud models like Claude Opus or GPT-4o on complex reasoning tasks. The practical approach is to use local models for routine work and reserve API calls for tasks that demand the strongest reasoning.

## The Two Inference Engines Worth Using

### Ollama

[Ollama](https://ollama.com/) is the fastest path from zero to running a local model. It is a single binary that handles model downloads, quantization, GPU offloading, and serving an OpenAI-compatible API.

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull and run a model
ollama pull llama3.3
ollama run llama3.3
```

Ollama runs as a systemd service and listens on `http://localhost:11434`. Any tool that supports the OpenAI API format can connect to it.

**Strengths:**
- Dead-simple setup -- one command to install, one to pull a model
- Automatic GPU detection and VRAM management
- Wide ecosystem support (Open WebUI, Continue, Aider, Claude Code via MCP)
- Model library with pre-quantized versions of popular models

**Limitations:**
- Default context window is 4K tokens (you must create custom Modelfiles to increase it)
- Limited control over quantization and inference parameters compared to LM Studio
- Model storage is separate from LM Studio -- you end up with duplicate downloads if you use both

**Increasing the context window (important):**

Ollama defaults to 4K context, which is too small for coding or document analysis. Create a Modelfile to override:

```bash
# Create a custom model with 32K context
cat > Modelfile <<EOF
FROM llama3.3
PARAMETER num_ctx 32768
EOF

ollama create llama3.3-32k -f Modelfile
ollama run llama3.3-32k
```

### LM Studio

[LM Studio](https://lmstudio.ai/) is a desktop application with a GUI for downloading, managing, and running models. It also includes a CLI (`lms`) and an OpenAI-compatible API server.

```bash
# Start the API server via CLI
lms server start

# The server runs at http://localhost:1234
```

**Strengths:**
- Visual model browser with one-click downloads from Hugging Face
- Fine-grained control over quantization format, GPU layers, context length
- Built-in chat UI for quick testing
- Supports loading multiple models and switching between them

**Limitations:**
- Closed-source desktop application
- Less scriptable than Ollama for headless/server use cases
- Heavier resource footprint than Ollama when idle

### Which to Use?

Use both. They serve complementary roles:

- **Ollama** for always-on background service that tools connect to (coding agents, chat UIs, embeddings)
- **LM Studio** for experimentation, model evaluation, and when you want precise control over inference parameters

Both serve OpenAI-compatible APIs, so any downstream tool works with either.

## Model Selection by VRAM Budget

The most important constraint is your GPU's VRAM. Models are distributed in quantized formats (Q4, Q5, Q6, Q8, FP16) that trade quality for memory usage. Here is what fits at each tier:

### 8 GB VRAM (RTX 3060, RTX 4060, RTX 3070)

At 8 GB, you are limited to small models or aggressive quantization of medium ones.

| Model | Parameters | Quantization | VRAM Usage | Best For |
|-------|-----------|-------------|------------|----------|
| Llama 3.1 8B | 8B | Q4_K_M | ~6 GB | General chat, simple coding |
| Phi 4 Mini | 3.8B | Q8_0 | ~5 GB | Lightweight tasks, fast responses |
| Gemma 3 4B | 4B | Q6_K | ~4 GB | Compact general-purpose |
| Nomic Embed Text | 137M | FP16 | <1 GB | Embeddings for RAG |

**Practical note:** With 8 GB, you can run one model at a time with room for the OS and other applications. Close GPU-intensive applications before inference.

### 12 GB VRAM (RTX 3060 12GB, RTX 4070)

The 12 GB tier opens up medium-sized models that are genuinely useful for coding and analysis.

| Model | Parameters | Quantization | VRAM Usage | Best For |
|-------|-----------|-------------|------------|----------|
| Mistral Nemo 12B | 12B | Q4_K_M | ~8 GB | Chat, instruction following |
| Codestral 22B | 22B | Q4_K_M | ~14 GB* | Code generation, completion |
| Gemma 3 12B | 12B | Q6_K | ~10 GB | General purpose, multilingual |

*Codestral at Q4 will partially offload to system RAM on a 12 GB card. It works but is slower.

### 16 GB VRAM (RTX 4080, RTX 5060 Ti, RTX A4000)

With 16 GB, you comfortably run 12-22B parameter models at higher quantization.

| Model | Parameters | Quantization | VRAM Usage | Best For |
|-------|-----------|-------------|------------|----------|
| Codestral 22B | 22B | Q4_K_M | ~14 GB | Code generation (best-in-class local) |
| Mistral Nemo 12B | 12B | Q6_K | ~11 GB | High-quality chat |
| Llama 3.1 8B | 8B | FP16 | ~16 GB | Maximum quality small model |
| Phi 4 | 14B | Q4_K_M | ~10 GB | Reasoning, math |

### 24 GB VRAM (RTX 3090, RTX 4090, RTX A5000)

This is the sweet spot for local LLM work. You can run 27B-70B parameter models that approach cloud model quality for many tasks.

| Model | Parameters | Quantization | VRAM Usage | Best For |
|-------|-----------|-------------|------------|----------|
| Llama 3.3 70B | 70B | Q4_K_M | ~40 GB* | Best open general-purpose |
| Gemma 3 27B | 27B | Q4_K_M | ~18 GB | Strong all-rounder, multilingual |
| Codestral 22B | 22B | Q6_K | ~18 GB | Code at higher quality |
| GPT-OSS 20B | 20B | Q6_K | ~17 GB | OpenAI's open model |
| Phi 4 | 14B | Q8_0 | ~16 GB | Reasoning at near-max quality |

*70B models at Q4 need ~40 GB total and will spill into system RAM. Ollama and LM Studio handle this automatically (GPU + CPU split), but expect slower inference. For full GPU inference of 70B, you need 48+ GB VRAM (dual GPU or A6000).

**Practical 24 GB setup:**

Run Gemma 3 27B as your daily driver (fits entirely in VRAM, fast inference, strong quality). Keep Codestral 22B for coding tasks. Use Llama 3.3 70B when you need maximum local reasoning, accepting the speed penalty from RAM spill.

## Essential Configuration

### Flash Attention

Enable Flash Attention for faster inference and lower memory usage:

```bash
# For Ollama, set via environment variable
sudo systemctl edit ollama
# Add:
# [Service]
# Environment="OLLAMA_FLASH_ATTENTION=1"
sudo systemctl restart ollama
```

### KV Cache Quantization

Reduce memory usage of the context window cache:

```bash
# In Ollama Modelfile
PARAMETER num_ctx 32768
# KV cache quantization (Q4_0 or Q8_0)
# Saves ~50% KV cache memory at minimal quality loss
```

### Embedding Models for RAG

If you plan to build retrieval-augmented generation (RAG) pipelines, you need a separate embedding model. These are small and can run alongside your main LLM:

```bash
# Pull an embedding model
ollama pull nomic-embed-text

# Use via the API
curl http://localhost:11434/api/embeddings \
  -d '{"model": "nomic-embed-text", "prompt": "Your text here"}'
```

Good embedding models for local use:
- **nomic-embed-text** (137M params, ~270 MB) -- solid general-purpose
- **mxbai-embed-large** (335M params, ~670 MB) -- higher quality, multilingual
- **snowflake-arctic-embed-m** (110M params, ~220 MB) -- good for code

## Adding a Chat UI

Running models from the command line gets old fast. [Open WebUI](https://github.com/open-webui/open-webui) gives you a ChatGPT-like interface that connects to Ollama or LM Studio:

```bash
# Run Open WebUI connecting to your local Ollama
docker run -d -p 3000:8080 \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  -v open-webui:/app/backend/data \
  --name open-webui \
  ghcr.io/open-webui/open-webui:main
```

Open WebUI supports conversations, document upload (RAG), image generation integration, multi-user accounts, and tool/function calling -- all backed by your local models.

## Model Selection Principles

A few rules of thumb that hold true across GPU tiers:

1. **Quantization matters less than model size.** A 27B model at Q4 is almost always better than a 7B model at FP16. Prioritize larger models with lower quantization over smaller models with higher quantization.

2. **Q4_K_M is the sweet spot.** This quantization level retains the vast majority of model quality while cutting memory usage roughly in half compared to FP16. Go lower (Q3, Q2) only if you absolutely must fit the model.

3. **Context length eats VRAM.** Doubling the context window roughly doubles the KV cache memory. A model that fits at 4K context may not fit at 32K. Plan accordingly.

4. **Not all tasks need large models.** Code completion, text formatting, and simple Q&A work well with 7-12B models. Save the 27B+ models for complex reasoning, analysis, and creative tasks.

5. **Test with your actual workloads.** Benchmarks are helpful but your specific use case is what matters. Run your common prompts against a few candidate models and compare quality directly.

## What Local Models Are Not Good At (Yet)

Be honest about limitations:

- **Complex multi-step reasoning** -- Frontier cloud models (Claude Opus, GPT-4o) still outperform the best local models on tasks requiring long chains of reasoning.
- **Very long context** -- While some models support 128K+ context windows, local performance degrades significantly beyond 16-32K tokens in practice.
- **Tool calling reliability** -- Agentic tool use (function calling, structured output) works well with some local models (Llama 3.3, Mistral Nemo) but not all. Test this specifically if you need it.
- **Coding at scale** -- For large multi-file refactors, cloud models with 100K+ effective context still have a significant edge.

The practical approach: use local models for routine tasks and switch to cloud APIs when you hit a quality ceiling.

## Next Steps

Once you have a model running:

1. **Connect it to your editor.** [Continue](https://continue.dev/) is a VS Code extension that works with both Ollama and LM Studio for code completion and chat.
2. **Try agentic coding.** [OpenCode](https://opencode.ai/) and [Aider](https://aider.chat/) are terminal-based coding agents that can use your local models.
3. **Build a RAG pipeline.** Combine an embedding model with a vector database to query your own documents.
4. **Set up Open WebUI** for a polished chat experience with document upload support.

Running LLMs locally is no longer a bleeding-edge exercise. The tooling works, the models are capable, and the barrier to entry is a decent GPU and a few terminal commands.
