import { z } from 'zod';

// Polish grammar vocabulary shared by LLM prompt schemas, the dictionary module,
// and (later) the client. Category names mirror the NKJP/SGJP tagset with
// readable values (ARCHITECTURE.md section 7.3).
//
// DRAFT (Phase 3 step 3.1): finalized against the golden set in the live
// evaluation (step 3.2) before the prompts are frozen as v1.

export const partsOfSpeech = ['noun', 'verb', 'adj', 'adv', 'pron', 'num', 'prep', 'conj', 'part', 'interj', 'phrase'] as const;
/** Lexeme-level noun gender; `pt` = plural-only noun (plurale tantum). */
export const nounGenders = ['m1', 'm2', 'm3', 'f', 'n', 'pt'] as const;
export const verbAspects = ['impf', 'pf', 'biasp'] as const;
/** Lexeme identity discriminator (ARCHITECTURE.md 7.3): derived by code, never free text. */
export const discriminators = ['', 'm1', 'm2', 'm3', 'f', 'n', 'pt', 'impf', 'pf', 'biasp'] as const;

/** Form-level gender; `nonvir` covers plural non-virile forms (e.g. "poszły"). */
export const formGenders = ['m1', 'm2', 'm3', 'f', 'n', 'nonvir'] as const;
export const grammaticalCases = ['nom', 'gen', 'dat', 'acc', 'inst', 'loc', 'voc'] as const;
export const grammaticalNumbers = ['sg', 'pl'] as const;
export const grammaticalPersons = ['1', '2', '3'] as const;
export const tenses = ['present', 'past', 'future'] as const;
export const moods = ['indicative', 'imperative', 'conditional'] as const;
export const degrees = ['pos', 'com', 'sup'] as const;
/** Non-finite verb forms map to the verb lemma (participles, gerund, impersonal). */
export const verbForms = ['finite', 'infinitive', 'pact', 'ppas', 'pcon', 'pant', 'ger', 'impersonal'] as const;

export const confidenceLevels = ['high', 'medium', 'low'] as const;
export const registers = ['formal', 'neutral', 'colloquial', 'vulgar'] as const;

export type PartOfSpeech = typeof partsOfSpeech[number];
export type NounGender = typeof nounGenders[number];
export type VerbAspect = typeof verbAspects[number];
export type Discriminator = typeof discriminators[number];
export type FormGender = typeof formGenders[number];
export type GrammaticalCase = typeof grammaticalCases[number];
export type GrammaticalNumber = typeof grammaticalNumbers[number];
export type Confidence = typeof confidenceLevels[number];
export type Register = typeof registers[number];

/** Fixed category order; also the order used by the tag key (shared/dictionary/tags.ts). */
export const tagCategories = ['verbForm', 'case', 'number', 'gender', 'person', 'tense', 'mood', 'degree'] as const;
export type TagCategory = typeof tagCategories[number];

// Every property is required and nullable: OpenAI Structured Outputs require all
// properties to be present (ARCHITECTURE.md 9.5).
export const grammaticalTagsSchema = z.object({
  verbForm: z.enum(verbForms).nullable(),
  case: z.enum(grammaticalCases).nullable(),
  number: z.enum(grammaticalNumbers).nullable(),
  gender: z.enum(formGenders).nullable(),
  person: z.enum(grammaticalPersons).nullable(),
  tense: z.enum(tenses).nullable(),
  mood: z.enum(moods).nullable(),
  degree: z.enum(degrees).nullable(),
});

export type GrammaticalTags = z.infer<typeof grammaticalTagsSchema>;
