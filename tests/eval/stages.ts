import type { TranslationLanguage } from '../../shared/contracts/settings';
import type { ShortTranslationLexeme } from '../../server/core/modules/llm/index';
import type { EvalConfig, StageName } from './config';
import { goldenItem, llmBoundItems } from './golden/morphology';
import type { GoldenItem } from './golden/morphology';

// Staged evaluation (owner condition 4): smoke (3 calls) → pilot (12 words)
// → full, each authorized separately (config.ts).

export type PlannedStep
  = | Readonly<{ type: 'lookup'; model: string; item: GoldenItem; language: TranslationLanguage; repetition: number }>
    | Readonly<{ type: 'split'; model: string; item: GoldenItem; language: TranslationLanguage }>
    | Readonly<{ type: 'translation'; model: string; subject: string; lexemes: readonly ShortTranslationLexeme[]; language: TranslationLanguage }>
    | Readonly<{ type: 'details'; model: string; lexeme: ShortTranslationLexeme; language: TranslationLanguage }>;

export const PILOT_ITEM_IDS = [
  'noun-psa', 'amb-mam', 'amb-lata', 'verb-poszlam', 'adj-najlepszymi', 'conv-zamek',
  'pt-drzwi', 'refl-boje-sie', 'sugg-zolw', 'neg-hund', 'verb-czytajac', 'amb-lecz',
] as const;

export const TRANSLATION_SUBSET_IDS = [
  'base-pies', 'base-kot', 'base-dom', 'base-kobieta', 'base-okno', 'base-dobry', 'base-robic', 'base-zrobic',
  'base-szybko', 'amb-mam', 'amb-piec', 'conv-zamek', 'pt-drzwi', 'refl-boje-sie', 'verb-ide',
] as const;

export const DETAILS_LEXEMES: readonly ShortTranslationLexeme[] = [
  { lemma: 'pies', pos: 'noun', discriminator: 'm2' },
  { lemma: 'zamek', pos: 'noun', discriminator: 'm3' },
  { lemma: 'iść', pos: 'verb', discriminator: 'impf' },
  { lemma: 'pójść', pos: 'verb', discriminator: 'pf' },
  { lemma: 'dobry', pos: 'adj', discriminator: '' },
  { lemma: 'mieć', pos: 'verb', discriminator: 'impf' },
  { lemma: 'drzwi', pos: 'noun', discriminator: 'pt' },
  { lemma: 'bać się', pos: 'verb', discriminator: 'impf' },
  { lemma: 'piec', pos: 'noun', discriminator: 'm3' },
  { lemma: 'dzień dobry', pos: 'phrase', discriminator: '' },
];

const PILOT_DETAILS = ['zamek', 'iść'];

/** The product-convention lexeme of each required reading (first lemma, first POS). */
export function preferredLexemes(item: GoldenItem): ShortTranslationLexeme[] {
  return (item.required ?? []).flatMap((reading) => {
    const lemma = reading.lemmas[0];
    const pos = reading.pos[0];
    if (lemma === undefined || pos === undefined) return [];
    return [{ lemma, pos, discriminator: reading.discriminators?.[0] ?? '' }];
  });
}

export function describeLexeme(lexeme: ShortTranslationLexeme): string {
  return [lexeme.lemma, lexeme.pos, lexeme.discriminator].filter(part => part !== '').join(' ');
}

function first(models: readonly string[], kind: string): string {
  const model = models[0];
  if (model === undefined) throw new Error(`No ${kind} model configured`);
  return model;
}

export function planStage(stage: StageName, config: Pick<EvalConfig, 'fastModels' | 'detailModels'>): readonly PlannedStep[] {
  const fast = first(config.fastModels, 'fast');
  const detail = first(config.detailModels, 'detail');

  if (stage === 'smoke') {
    const pies: ShortTranslationLexeme = { lemma: 'pies', pos: 'noun', discriminator: 'm2' };
    return [
      { type: 'lookup', model: fast, item: goldenItem('noun-psa'), language: 'ru', repetition: 1 },
      { type: 'translation', model: fast, subject: describeLexeme(pies), lexemes: [pies], language: 'uk' },
      { type: 'details', model: detail, lexeme: pies, language: 'ru' },
    ];
  }

  if (stage === 'pilot') {
    const items = PILOT_ITEM_IDS.map(goldenItem);
    const details = DETAILS_LEXEMES.filter(lexeme => PILOT_DETAILS.includes(lexeme.lemma));
    return [
      ...config.fastModels.flatMap(model => items.map(item => ({ type: 'lookup', model, item, language: 'ru', repetition: 1 }) as const)),
      ...config.detailModels.flatMap(model => details.map(lexeme => ({ type: 'details', model, lexeme, language: 'ru' }) as const)),
    ];
  }

  // Full: two repetitions per fast model (stability), the split variant,
  // uk/en translations, and details on every detail model.
  const translationItems = TRANSLATION_SUBSET_IDS.map(goldenItem);
  return [
    ...[1, 2].flatMap(repetition => config.fastModels.flatMap(model =>
      llmBoundItems.map(item => ({ type: 'lookup', model, item, language: 'ru', repetition }) as const))),
    ...llmBoundItems.map(item => ({ type: 'split', model: fast, item, language: 'ru' }) as const),
    ...(['uk', 'en'] as const).flatMap(language => translationItems.map((item) => {
      const lexemes = preferredLexemes(item);
      return { type: 'translation', model: fast, subject: item.id, lexemes, language } as const;
    })),
    ...config.detailModels.flatMap(model => DETAILS_LEXEMES.map(lexeme => ({ type: 'details', model, lexeme, language: 'ru' }) as const)),
  ];
}
