---
name: translation-cache-optimizer
description: Proactive caching and deduplication agent that eliminates redundant LLM translations across repetitive presentation slides, saving 40-60% tokens and preventing rate limits.
---

# Translation Cache & Deduplication Optimizer Agent

## Purpose
Solves **Inefficiency #3 (Redundant LLM Re-translation & Quota Waste)** by hashing and resolving repeated manufacturing boilerplate, table headers, and recurring inspection instructions.

## Execution Workflow
1. **Pre-Batch Slide Extraction**:
   - Collects all candidate paragraphs across the presentation.
   - Normalizes whitespace, casing, and language identifiers.
2. **Exact Hash Lookup**:
   - Generates SHA-256 hash for `${sourceLang}:${targetLang}:${normalizedText}`.
   - Immediately resolves matching items from in-memory / persistent cache (0ms latency, 0 tokens).
3. **Deck Deduplication**:
   - Compresses remaining paragraphs into unique items only (e.g. 50 repetitions of `GOOD` or `NO GOOD` collapse into 1 item).
4. **Broadcast & Cache**:
   - Once the LLM translates the unique batch, results are broadcast back to all sibling IDs across slides and cached for future presentations.

## Integration Point
- Class: `TranslationCacheService` (`translationCache`) in `services/translation/cache.ts`.
- Integrated in `services/documents/pptx-translator.ts`.
