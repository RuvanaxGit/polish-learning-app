import { describe, expect, it } from 'vitest';
import { EvalConfigError, isStageAuthorized, parseEvalConfig } from './config';

describe('isStageAuthorized', () => {
  it('is off by default and authorizes exactly the named stage', () => {
    expect(isStageAuthorized('smoke', {})).toBe(false);
    expect(isStageAuthorized('smoke', { LLM_EVAL_LIVE: 'true' })).toBe(false);
    expect(isStageAuthorized('smoke', { LLM_EVAL_LIVE: 'smoke' })).toBe(true);
    expect(isStageAuthorized('pilot', { LLM_EVAL_LIVE: 'smoke' })).toBe(false);
    expect(isStageAuthorized('full', { LLM_EVAL_LIVE: 'pilot' })).toBe(false);
  });
});

describe('parseEvalConfig', () => {
  const env = { OPENAI_API_KEY: 'sk-test-placeholder', LLM_EVAL_FAST_MODELS: 'gpt-6-luna, gpt-6.1-terra', LLM_EVAL_DETAIL_MODELS: 'gpt-6.1-sol' };

  it('parses models and defaults the cap to the stage maximum', () => {
    expect(parseEvalConfig('smoke', env)).toMatchObject({
      fastModels: ['gpt-6-luna', 'gpt-6.1-terra'], detailModels: ['gpt-6.1-sol'], capMicroUsd: 250_000, outputDir: 'eval-results',
    });
    expect(parseEvalConfig('full', env).capMicroUsd).toBe(3_000_000);
  });

  it('lets LLM_EVAL_CAP_USD lower the cap but never raise it', () => {
    expect(parseEvalConfig('pilot', { ...env, LLM_EVAL_CAP_USD: '0.2' }).capMicroUsd).toBe(200_000);
    expect(parseEvalConfig('pilot', { ...env, LLM_EVAL_CAP_USD: '50' }).capMicroUsd).toBe(1_000_000);
  });

  it('names missing or invalid variables without printing any value', () => {
    const attempt = () => parseEvalConfig('smoke', { OPENAI_API_KEY: 'sk-secret-value', LLM_EVAL_FAST_MODELS: 'bad model id!' });
    expect(attempt).toThrow(EvalConfigError);
    try {
      attempt();
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '';
      expect(message).toContain('LLM_EVAL_FAST_MODELS');
      expect(message).toContain('LLM_EVAL_DETAIL_MODELS');
      expect(message).not.toContain('sk-secret-value');
      expect(message).not.toContain('bad model id');
    }
    expect(() => parseEvalConfig('smoke', { ...env, OPENAI_API_KEY: '' })).toThrow(/OPENAI_API_KEY/);
  });
});
