import type {
  Discriminator,
  GrammaticalCase,
  GrammaticalNumber,
  GrammaticalTags,
  PartOfSpeech,
} from '../../../shared/contracts/dictionary';

// Golden dataset for Polish morphological accuracy (Phase 3 plan R2-4).
//
// Tiers:
// - A:          uncontested lemma/POS/key tags; gates model choice.
// - A-amb:      genuine ambiguity, every listed reading required; gates ambiguity coverage.
// - C:          product conventions (ARCHITECTURE 7.3 / 10.2); reported as prompt adherence only.
// - negative:   not Polish.
// - suggestion: Polish typed without diacritics; a suggestion is expected.
// Tier B (accepted lemma variants) is expressed inside readings: `lemmas` is an
// equivalence set whose FIRST entry is the product convention. Tier D
// (optional readings) is `optional`: neither required nor penalized.

export const GOLDEN_SET_STATUS = 'draft: expectations not yet verified against SGJP/Morfeusz 2 or reviewed by a native speaker (plan Q-6)';

export type GoldenTier = 'A' | 'A-amb' | 'C' | 'negative' | 'suggestion';
export type TagSpec = Partial<GrammaticalTags>;

export type GoldenReading = Readonly<{
  /** Accepted lemmas; the first is the product convention. */
  lemmas: readonly string[];
  pos: readonly PartOfSpeech[];
  /** Accepted lexeme discriminators (convention check); omitted = not checked. */
  discriminators?: readonly Discriminator[];
  /** Acceptable tag combinations: every matching analysis must fit one; omitted = not checked. */
  tags?: readonly TagSpec[];
}>;

export type GoldenItem = Readonly<{
  id: string;
  input: string;
  category: string;
  tier: GoldenTier;
  /** Rejected locally before any LLM call (no letters, or non-Latin script). Never sent. */
  localReject?: boolean;
  required?: readonly GoldenReading[];
  optional?: readonly GoldenReading[];
  suggestion?: Readonly<{ mode: 'required' | 'optional'; accepted: readonly string[] }>;
  forbiddenLemmas?: readonly string[];
  singleLexeme?: boolean;
  note?: string;
}>;

type ReadingOptions = Readonly<{ d?: readonly Discriminator[]; tags?: readonly TagSpec[] }>;

function r(lemmas: string | readonly string[], pos: PartOfSpeech | readonly PartOfSpeech[], options: ReadingOptions = {}): GoldenReading {
  return {
    lemmas: typeof lemmas === 'string' ? [lemmas] : lemmas,
    pos: typeof pos === 'string' ? [pos] : pos,
    ...(options.d ? { discriminators: options.d } : {}),
    ...(options.tags ? { tags: options.tags } : {}),
  };
}

const cn = (grammaticalCase: GrammaticalCase, number: GrammaticalNumber): TagSpec => ({ case: grammaticalCase, number });

export const goldenItems: readonly GoldenItem[] = [
  // Baseline lemmas
  { id: 'base-pies', input: 'pies', category: 'baseline', tier: 'A', required: [r('pies', 'noun', { d: ['m2'], tags: [cn('nom', 'sg')] })] },
  { id: 'base-kot', input: 'kot', category: 'baseline', tier: 'A', required: [r('kot', 'noun', { d: ['m2'], tags: [cn('nom', 'sg')] })] },
  { id: 'base-dom', input: 'dom', category: 'baseline', tier: 'A', required: [r('dom', 'noun', { d: ['m3'], tags: [cn('nom', 'sg'), cn('acc', 'sg')] })] },
  { id: 'base-kobieta', input: 'kobieta', category: 'baseline', tier: 'A', required: [r('kobieta', 'noun', { d: ['f'], tags: [cn('nom', 'sg')] })] },
  { id: 'base-okno', input: 'okno', category: 'baseline', tier: 'A', required: [r('okno', 'noun', { d: ['n'], tags: [cn('nom', 'sg'), cn('acc', 'sg'), cn('voc', 'sg')] })] },
  { id: 'base-dobry', input: 'dobry', category: 'baseline', tier: 'A', required: [r('dobry', 'adj', { tags: [cn('nom', 'sg'), cn('acc', 'sg'), cn('voc', 'sg')] })] },
  { id: 'base-robic', input: 'robić', category: 'baseline', tier: 'A', required: [r('robić', 'verb', { d: ['impf'], tags: [{ verbForm: 'infinitive' }] })] },
  { id: 'base-zrobic', input: 'zrobić', category: 'baseline', tier: 'A', required: [r('zrobić', 'verb', { d: ['pf'], tags: [{ verbForm: 'infinitive' }] })] },
  { id: 'base-szybko', input: 'szybko', category: 'baseline', tier: 'A', required: [r('szybko', 'adv')] },
  { id: 'base-i', input: 'i', category: 'baseline', tier: 'A', required: [r('i', ['conj', 'part'])] },

  // Nouns: stem alternation, irregular and suppletive plurals
  { id: 'noun-psa', input: 'psa', category: 'noun-inflection', tier: 'A', required: [r('pies', 'noun', { d: ['m2'], tags: [cn('gen', 'sg'), cn('acc', 'sg')] })] },
  { id: 'noun-psy', input: 'psy', category: 'noun-inflection', tier: 'A', required: [r('pies', 'noun', { d: ['m2'], tags: [cn('nom', 'pl'), cn('acc', 'pl'), cn('voc', 'pl')] })] },
  { id: 'noun-rak', input: 'rąk', category: 'noun-inflection', tier: 'A', required: [r('ręka', 'noun', { d: ['f'], tags: [cn('gen', 'pl')] })] },
  { id: 'noun-oczu', input: 'oczu', category: 'noun-inflection', tier: 'A', required: [r('oko', 'noun', { d: ['n'], tags: [cn('gen', 'pl')] })] },
  { id: 'noun-bracmi', input: 'braćmi', category: 'noun-inflection', tier: 'A', required: [r('brat', 'noun', { d: ['m1'], tags: [cn('inst', 'pl')] })] },
  { id: 'noun-ksieza', input: 'księża', category: 'noun-inflection', tier: 'A', required: [r('ksiądz', 'noun', { d: ['m1'], tags: [cn('nom', 'pl'), cn('voc', 'pl')] })] },
  { id: 'noun-tygodnia', input: 'tygodnia', category: 'noun-inflection', tier: 'A', required: [r('tydzień', 'noun', { d: ['m3'], tags: [cn('gen', 'sg')] })] },
  { id: 'noun-miescie', input: 'mieście', category: 'noun-inflection', tier: 'A', required: [r('miasto', 'noun', { d: ['n'], tags: [cn('loc', 'sg')] })] },
  { id: 'noun-kosciele', input: 'kościele', category: 'noun-inflection', tier: 'A', required: [r('kościół', 'noun', { d: ['m3'], tags: [cn('loc', 'sg'), cn('voc', 'sg')] })] },
  { id: 'noun-koni', input: 'koni', category: 'noun-inflection', tier: 'A', required: [r('koń', 'noun', { d: ['m2'], tags: [cn('gen', 'pl')] })] },
  { id: 'noun-domu', input: 'domu', category: 'noun-inflection', tier: 'A', required: [r('dom', 'noun', { d: ['m3'], tags: [cn('gen', 'sg'), cn('loc', 'sg'), cn('voc', 'sg')] })] },
  { id: 'noun-polacy', input: 'Polacy', category: 'noun-inflection', tier: 'A', required: [r('Polak', 'noun', { d: ['m1'], tags: [cn('nom', 'pl'), cn('voc', 'pl')] })] },
  { id: 'noun-dzieci', input: 'dzieci', category: 'noun-inflection', tier: 'A', required: [r('dziecko', 'noun', { d: ['n'], tags: [cn('nom', 'pl'), cn('gen', 'pl'), cn('acc', 'pl'), cn('voc', 'pl')] })] },
  { id: 'noun-przyjaciele', input: 'przyjaciele', category: 'noun-inflection', tier: 'A', required: [r('przyjaciel', 'noun', { d: ['m1'], tags: [cn('nom', 'pl'), cn('voc', 'pl')] })] },
  {
    id: 'noun-ludzi', input: 'ludzi', category: 'noun-suppletion', tier: 'A',
    required: [r(['człowiek', 'ludzie'], 'noun', { d: ['m1', 'pt'], tags: [cn('gen', 'pl'), cn('acc', 'pl')] })],
    note: 'Suppletive plural; SGJP-style lemma człowiek, many dictionaries list ludzie.',
  },

  // Adjective and adverb degree (suppletive); the lemma choice is a convention, degree/case/number are not
  { id: 'adj-najlepszymi', input: 'najlepszymi', category: 'degree', tier: 'A', required: [r(['dobry', 'najlepszy'], 'adj', { tags: [{ case: 'inst', number: 'pl', degree: 'sup' }] })] },
  { id: 'adj-lepszy', input: 'lepszy', category: 'degree', tier: 'A', required: [r(['dobry', 'lepszy'], 'adj', { tags: [{ case: 'nom', number: 'sg', degree: 'com' }, { case: 'acc', number: 'sg', degree: 'com' }, { case: 'voc', number: 'sg', degree: 'com' }] })] },
  { id: 'adj-wiekszego', input: 'większego', category: 'degree', tier: 'A', required: [r(['duży', 'większy'], 'adj', { tags: [{ case: 'gen', number: 'sg', degree: 'com' }, { case: 'acc', number: 'sg', degree: 'com' }] })] },
  { id: 'adj-gorsza', input: 'gorsza', category: 'degree', tier: 'A', required: [r(['zły', 'gorszy'], 'adj', { tags: [{ case: 'nom', number: 'sg', degree: 'com' }, { case: 'voc', number: 'sg', degree: 'com' }] })] },
  { id: 'adv-lepiej', input: 'lepiej', category: 'degree', tier: 'A', required: [r(['dobrze', 'lepiej'], 'adv', { tags: [{ degree: 'com' }] })] },

  // Verbs: irregular stems, moods, non-finite forms (participles map to the verb by convention)
  { id: 'verb-poszlam', input: 'poszłam', category: 'verb', tier: 'A', required: [r('pójść', 'verb', { d: ['pf'], tags: [{ tense: 'past', person: '1', number: 'sg', gender: 'f' }] })] },
  { id: 'verb-szedl', input: 'szedł', category: 'verb', tier: 'A', required: [r('iść', 'verb', { d: ['impf'], tags: [{ tense: 'past', person: '3', number: 'sg' }] })] },
  { id: 'verb-ide', input: 'idę', category: 'verb', tier: 'A', required: [r('iść', 'verb', { d: ['impf'], tags: [{ tense: 'present', person: '1', number: 'sg' }] })] },
  { id: 'verb-jem', input: 'jem', category: 'verb', tier: 'A', required: [r('jeść', 'verb', { d: ['impf'], tags: [{ tense: 'present', person: '1', number: 'sg' }] })] },
  { id: 'verb-wiem', input: 'wiem', category: 'verb', tier: 'A', required: [r('wiedzieć', 'verb', { d: ['impf'], tags: [{ tense: 'present', person: '1', number: 'sg' }] })] },
  { id: 'verb-bede', input: 'będę', category: 'verb', tier: 'A', required: [r('być', 'verb', { d: ['impf'], tags: [{ tense: 'future', person: '1', number: 'sg' }] })] },
  { id: 'verb-wez', input: 'weź', category: 'verb', tier: 'A', required: [r('wziąć', 'verb', { d: ['pf'], tags: [{ mood: 'imperative', person: '2', number: 'sg' }] })] },
  { id: 'verb-wzialem', input: 'wziąłem', category: 'verb', tier: 'A', required: [r('wziąć', 'verb', { d: ['pf'], tags: [{ tense: 'past', person: '1', number: 'sg' }] })] },
  { id: 'verb-moglbym', input: 'mógłbym', category: 'verb', tier: 'A', required: [r('móc', 'verb', { d: ['impf'], tags: [{ mood: 'conditional', person: '1', number: 'sg' }] })] },
  { id: 'verb-spie', input: 'śpię', category: 'verb', tier: 'A', required: [r('spać', 'verb', { d: ['impf'], tags: [{ tense: 'present', person: '1', number: 'sg' }] })] },
  { id: 'verb-czytajac', input: 'czytając', category: 'verb-nonfinite', tier: 'A', required: [r('czytać', 'verb', { d: ['impf'], tags: [{ verbForm: 'pcon' }] })] },
  { id: 'verb-przeczytawszy', input: 'przeczytawszy', category: 'verb-nonfinite', tier: 'A', required: [r('przeczytać', 'verb', { d: ['pf'], tags: [{ verbForm: 'pant' }] })] },
  { id: 'verb-zrobiono', input: 'zrobiono', category: 'verb-nonfinite', tier: 'A', required: [r('zrobić', 'verb', { d: ['pf'], tags: [{ verbForm: 'impersonal' }] })] },
  { id: 'verb-zrobiony', input: 'zrobiony', category: 'verb-nonfinite', tier: 'A', required: [r(['zrobić', 'zrobiony'], ['verb', 'adj'])], note: 'Passive participle; verb lemma is our convention, adjective lemma is also defensible.' },
  { id: 'verb-pisanie', input: 'pisanie', category: 'verb-nonfinite', tier: 'A', required: [r(['pisać', 'pisanie'], ['verb', 'noun'])], note: 'Gerund; verb lemma is our convention, lexicalized noun is also defensible.' },

  // Genuine ambiguity: every required reading must be present
  {
    id: 'amb-mam', input: 'mam', category: 'ambiguity', tier: 'A-amb',
    required: [
      r('mieć', 'verb', { d: ['impf'], tags: [{ tense: 'present', person: '1', number: 'sg' }] }),
      r('mama', 'noun', { d: ['f'], tags: [cn('gen', 'pl')] }),
    ],
  },
  {
    id: 'amb-mamy', input: 'mamy', category: 'ambiguity', tier: 'A-amb',
    required: [
      r('mieć', 'verb', { d: ['impf'], tags: [{ tense: 'present', person: '1', number: 'pl' }] }),
      r('mama', 'noun', { d: ['f'], tags: [cn('gen', 'sg'), cn('nom', 'pl'), cn('acc', 'pl'), cn('voc', 'pl')] }),
    ],
  },
  {
    id: 'amb-piec', input: 'piec', category: 'ambiguity', tier: 'A-amb',
    required: [
      r('piec', 'noun', { d: ['m3'], tags: [cn('nom', 'sg'), cn('acc', 'sg')] }),
      r('piec', 'verb', { d: ['impf'], tags: [{ verbForm: 'infinitive' }] }),
    ],
  },
  {
    id: 'amb-bez', input: 'bez', category: 'ambiguity', tier: 'A-amb',
    required: [r('bez', 'prep'), r('bez', 'noun', { d: ['m3'], tags: [cn('nom', 'sg'), cn('acc', 'sg')] })],
  },
  {
    id: 'amb-lecz', input: 'lecz', category: 'ambiguity', tier: 'A-amb',
    required: [r('lecz', 'conj'), r('leczyć', 'verb', { d: ['impf'], tags: [{ mood: 'imperative', person: '2', number: 'sg' }] })],
  },
  {
    id: 'amb-lata', input: 'lata', category: 'ambiguity', tier: 'A-amb',
    required: [
      r('lato', 'noun', { d: ['n'], tags: [cn('gen', 'sg'), cn('nom', 'pl'), cn('acc', 'pl'), cn('voc', 'pl')] }),
      r('latać', 'verb', { d: ['impf'], tags: [{ tense: 'present', person: '3', number: 'sg' }] }),
    ],
    optional: [r('rok', 'noun', { d: ['m3'] })],
    note: 'Treating lata as the suppletive plural of rok is dictionary-dependent: optional.',
  },
  {
    id: 'amb-byla', input: 'była', category: 'ambiguity', tier: 'A-amb',
    required: [r('być', 'verb', { d: ['impf'], tags: [{ tense: 'past', person: '3', number: 'sg', gender: 'f' }] })],
    optional: [r('były', 'adj')],
  },
  {
    id: 'amb-stali', input: 'stali', category: 'ambiguity', tier: 'A-amb',
    required: [
      r('stal', 'noun', { d: ['f'], tags: [cn('gen', 'sg'), cn('dat', 'sg'), cn('loc', 'sg'), cn('voc', 'sg')] }),
      r('stać', 'verb', { d: ['impf'], tags: [{ tense: 'past', person: '3', number: 'pl' }] }),
    ],
    optional: [r('stały', 'adj')],
  },

  // Product conventions (Tier C): reported as prompt adherence, never gating
  { id: 'conv-zamek', input: 'zamek', category: 'convention', tier: 'C', singleLexeme: true, required: [r('zamek', 'noun', { d: ['m3'], tags: [cn('nom', 'sg'), cn('acc', 'sg')] })], note: 'Same-paradigm homonyms (castle/lock/zipper) are one lexeme by our rule; SGJP numbers them separately.' },
  { id: 'conv-dzien-dobry', input: 'dzień dobry', category: 'convention', tier: 'C', required: [r('dzień dobry', ['phrase', 'interj'])] },
  { id: 'conv-na-razie', input: 'na razie', category: 'convention', tier: 'C', required: [r('na razie', ['phrase', 'adv', 'interj'])] },
  { id: 'conv-piesek', input: 'piesek', category: 'convention', tier: 'C', forbiddenLemmas: ['pies'], required: [r('piesek', 'noun', { d: ['m2'], tags: [cn('nom', 'sg')] })] },
  { id: 'conv-bac-sie', input: 'bać się', category: 'convention', tier: 'C', required: [r(['bać się', 'bać'], 'verb', { d: ['impf'], tags: [{ verbForm: 'infinitive' }] })] },

  // Plural-only nouns
  { id: 'pt-drzwi', input: 'drzwi', category: 'plural-only', tier: 'A', required: [r('drzwi', 'noun', { d: ['pt'], tags: [cn('nom', 'pl'), cn('gen', 'pl'), cn('acc', 'pl'), cn('voc', 'pl')] })] },
  { id: 'pt-nozyczki', input: 'nożyczki', category: 'plural-only', tier: 'A', required: [r('nożyczki', 'noun', { d: ['pt'], tags: [cn('nom', 'pl'), cn('acc', 'pl'), cn('voc', 'pl')] })] },
  { id: 'pt-spodnie', input: 'spodnie', category: 'plural-only', tier: 'A', required: [r('spodnie', 'noun', { d: ['pt'], tags: [cn('nom', 'pl'), cn('acc', 'pl'), cn('voc', 'pl')] })] },

  // Proper noun, reflexive verb, numerals
  { id: 'proper-krakowie', input: 'Krakowie', category: 'proper-noun', tier: 'A', required: [r('Kraków', 'noun', { d: ['m3'], tags: [cn('loc', 'sg'), cn('voc', 'sg')] })] },
  { id: 'refl-boje-sie', input: 'boję się', category: 'reflexive', tier: 'A', required: [r(['bać się', 'bać'], 'verb', { d: ['impf'], tags: [{ tense: 'present', person: '1', number: 'sg' }] })] },
  { id: 'num-dwoch', input: 'dwóch', category: 'numeral', tier: 'A', required: [r('dwa', 'num', { tags: [{ case: 'gen' }, { case: 'loc' }, { case: 'acc' }] })] },
  { id: 'num-trzema', input: 'trzema', category: 'numeral', tier: 'A', required: [r('trzy', 'num', { tags: [{ case: 'inst' }] })] },

  // Missing diacritics
  { id: 'sugg-zolw', input: 'zolw', category: 'diacritics', tier: 'suggestion', suggestion: { mode: 'required', accepted: ['żółw'] } },
  { id: 'sugg-zrodlo', input: 'zrodlo', category: 'diacritics', tier: 'suggestion', suggestion: { mode: 'required', accepted: ['źródło'] } },
  { id: 'sugg-lodz', input: 'lodz', category: 'diacritics', tier: 'suggestion', suggestion: { mode: 'required', accepted: ['łódź'] } },
  { id: 'sugg-sie', input: 'sie', category: 'diacritics', tier: 'suggestion', suggestion: { mode: 'required', accepted: ['się'] } },
  { id: 'valid-laska', input: 'laska', category: 'diacritics', tier: 'A', suggestion: { mode: 'optional', accepted: ['łaska'] }, required: [r('laska', 'noun', { d: ['f'], tags: [cn('nom', 'sg')] })], note: 'Valid word; must not be forced into łaska.' },

  // Not Polish
  { id: 'neg-hund', input: 'hund', category: 'not-polish', tier: 'negative' },
  { id: 'neg-xyzq', input: 'xyzq', category: 'not-polish', tier: 'negative' },
  { id: 'neg-computer', input: 'computer', category: 'not-polish', tier: 'negative', note: 'English word; the Polish word is komputer.' },
  { id: 'local-sobaka', input: 'собака', category: 'not-polish', tier: 'negative', localReject: true },
  { id: 'local-123', input: '123', category: 'not-polish', tier: 'negative', localReject: true },
];

/** Items sent to the model (local rejects never are). */
export const llmBoundItems: readonly GoldenItem[] = goldenItems.filter(item => !item.localReject);

export function goldenItem(id: string): GoldenItem {
  const item = goldenItems.find(candidate => candidate.id === id);
  if (!item) throw new Error(`Unknown golden item ${id}`);
  return item;
}
