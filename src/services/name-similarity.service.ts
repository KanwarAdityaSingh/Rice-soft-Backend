import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

const ACCOUNT_HOLDER_NAME_SIMILARITY_SYSTEM_PROMPT = `You are a bank account holder name similarity scorer for Indian business and individual names.

You receive exactly two name strings: A (from the bank) and B (entered by the user).

Return ONLY a single integer from 0 to 100. No words, no JSON, no punctuation, no explanation.

Scoring rules:
- Score how likely A and B refer to the same account holder, based only on the strings provided.
- Ignore case, extra spaces, and punctuation differences (including periods in initials).
- Treat common Indian business suffix variants as similar when the core name matches, e.g.:
  PVT / PRIVATE, LTD / LIMITED, CO / COMPANY, AND / &, LLP, SON / SONS.
- Do NOT treat different core business or person names as a match (e.g. "GOEL" vs "GUPTA").
- Do NOT match when one name is a clear subset of a different entity unless the shared core clearly indicates the same entity.
- Do NOT expand abbreviations in your output. Do not rewrite, correct, or suggest alternative names.
- If unsure, score lower rather than higher.`;

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string;
    };
  }>;
}

/**
 * Returns 0–100 similarity score, or null if OpenAI is unavailable or the response is invalid.
 */
export async function scoreAccountHolderNameSimilarity(
  bankRecordName: string,
  enteredName: string
): Promise<number | null> {
  const { apiKey, model, enabled } = appConfig.openai;

  if (!enabled || !apiKey) {
    logger.warn('Account holder name similarity skipped: OpenAI not configured');
    return null;
  }

  try {
    const isGpt5Family = /^gpt-5/i.test(model);
    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: ACCOUNT_HOLDER_NAME_SIMILARITY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `A: ${bankRecordName}\nB: ${enteredName}`,
        },
      ],
    };
    // GPT-5 models use reasoning tokens that count against max_completion_tokens.
    // A low limit (e.g. 16) often yields empty message.content after reasoning only.
    if (isGpt5Family) {
      requestBody.max_completion_tokens = appConfig.openai.maxCompletionTokens;
      requestBody.reasoning_effort = appConfig.openai.reasoningEffort;
    } else {
      requestBody.temperature = 0;
      requestBody.max_tokens = 16;
    }

    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.warn('OpenAI name similarity request failed', {
        status: response.status,
        body: errorBody.slice(0, 500),
      });
      return null;
    }

    const data = (await response.json()) as OpenAIChatCompletionResponse;
    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim() ?? '';
    const match = content.match(/\b(\d{1,3})\b/);
    if (!match) {
      logger.warn('OpenAI name similarity returned non-numeric content', {
        content,
        finishReason: choice?.finish_reason,
        model,
      });
      return null;
    }

    const score = Math.min(100, Math.max(0, parseInt(match[1], 10)));
    logger.info('Account holder name similarity scored', {
      bankRecordName,
      enteredName,
      score,
      model,
    });
    return score;
  } catch (error) {
    logger.error('OpenAI name similarity request error', { error });
    return null;
  }
}

export const nameSimilarityService = {
  scoreAccountHolderNameSimilarity,
};
