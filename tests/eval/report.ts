import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { CallRecord } from './call';
import type { StageReport } from './run-stage';
import type { Ratio } from './scoring';

const usd = (microUsd: number) => `$${(microUsd / 1_000_000).toFixed(4)}`;
const pct = (value: Ratio | null) => (value?.value == null ? 'n/a' : `${(value.value * 100).toFixed(1)}% (${value.numerator}/${value.denominator})`);

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function sum(records: readonly CallRecord[], pick: (record: CallRecord) => number): number {
  return records.reduce((total, record) => total + pick(record), 0);
}

export function formatSummary(report: StageReport): string {
  const lines: string[] = [];
  const { records } = report;
  lines.push(`# Live evaluation: ${report.stage}`, '');
  lines.push(`- Golden set: ${report.goldenSetStatus}`);
  lines.push(`- Prompts: ${Object.entries(report.promptVersions).map(([name, version]) => `${name}=${version}`).join(', ')}`);
  lines.push(`- Models: fast=${report.fastModels.join(', ')}; detail=${report.detailModels.join(', ')}`);
  lines.push(`- Spend (application estimate, not provider billing): ${usd(report.spentMicroUsd)} of cap ${usd(report.capMicroUsd)}`);
  lines.push(`- Calls: ${records.length}; planned steps: ${report.plannedSteps}; skipped: ${report.skippedSteps}; stop reason: ${report.stopReason ?? 'none'}`);
  lines.push(`- Charged at worst-case estimate (usage unknown): ${records.filter(record => record.accounting === 'estimate').length}`);
  lines.push('');

  lines.push('## Calls by status', '', '| feature | model | ok | refusal | provider error | schema invalid | refine failed | input tok | cached tok | output tok (reasoning) | cost |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const groups = new Map<string, CallRecord[]>();
  for (const record of records) {
    const groupKey = `${record.feature}|${record.model}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), record]);
  }
  for (const [groupKey, group] of groups) {
    const [feature, model] = groupKey.split('|');
    const count = (status: CallRecord['status']) => group.filter(record => record.status === status).length;
    lines.push(`| ${feature} | ${model} | ${count('ok')} | ${count('refusal')} | ${count('provider_error')} | ${count('schema_invalid')} | ${count('refine_failed')} | ${sum(group, r => r.usage?.inputTokens ?? 0)} | ${sum(group, r => r.usage?.cachedInputTokens ?? 0)} | ${sum(group, r => r.usage?.outputTokens ?? 0)} (${sum(group, r => r.usage?.reasoningTokens ?? 0)}) | ${usd(sum(group, r => r.chargedCostMicroUsd))} |`);
  }
  lines.push('');

  if (report.lookupMetrics.length > 0) {
    lines.push('## Lookup accuracy', '');
    for (const entry of report.lookupMetrics) {
      const m = entry.metrics;
      lines.push(`### ${entry.model} (${entry.variant})`, '');
      lines.push(`- ok rate: ${pct(m.okRate)}`);
      lines.push(`- Tier A lemma recall: ${pct(m.tierALemmaRecall)}`);
      lines.push(`- ambiguity coverage: ${pct(m.ambiguityCoverage)}`);
      lines.push(`- tag accuracy: ${pct(m.tagAccuracy)}`);
      lines.push(`- negatives: ${pct(m.negativeAccuracy)}; suggestions: ${pct(m.suggestionAccuracy)}`);
      lines.push(`- convention adherence (not gating): ${pct(m.conventionAdherence)}`);
      lines.push(`- repeat stability: ${pct(entry.stability)}; lookup latency p95: ${entry.lookupLatencyP95Ms ?? 'n/a'} ms; extra analyses for review: ${m.extraAnalyses}`);
      lines.push(`- gates: ${entry.gates.map(gate => `${gate.name} ${gate.passed ? 'PASS' : 'FAIL'}`).join(', ')}`);
      lines.push('');
    }
  }

  const problems = records.filter(record => record.status !== 'ok' || record.warnings.length > 0);
  if (problems.length > 0) {
    lines.push('## Calls with problems or warnings', '');
    for (const record of problems) {
      lines.push(`- ${record.callId} [${record.model}] ${record.status}${record.errorKind ? `/${record.errorKind}` : ''}${record.refineReason ? ` (${record.refineReason})` : ''}${record.warnings.length > 0 ? `; warnings: ${record.warnings.join(', ')}` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Writes report.json, summary.md, and translations.csv into a new timestamped directory. */
export async function writeStageReport(report: StageReport, outputDir: string): Promise<string> {
  const directory = resolve(outputDir, `${report.startedAt.replaceAll(':', '-')}-${report.stage}`);
  await mkdir(directory, { recursive: true });
  const csv = [
    ['subject', 'model', 'variant', 'language', 'lemma', 'pos', 'translation'].join(','),
    ...report.translationRows.map(row => [row.subject, row.model, row.variant, row.language, row.lemma, row.pos, row.translation].map(csvCell).join(',')),
  ].join('\n');
  await writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(directory, 'summary.md'), `${formatSummary(report)}\n`, 'utf8');
  await writeFile(join(directory, 'translations.csv'), `${csv}\n`, 'utf8');
  return directory;
}
