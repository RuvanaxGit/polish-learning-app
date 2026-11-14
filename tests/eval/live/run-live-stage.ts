import { createOpenAiProvider } from '../../../server/core/modules/llm/index';
import type { EvalConfig } from '../config';
import { formatSummary, writeStageReport } from '../report';
import { runStage } from '../run-stage';
import type { StageReport } from '../run-stage';

/** Makes PAID OpenAI calls. Only reached when the stage is explicitly authorized (config.ts). */
export async function runLiveStage(config: EvalConfig): Promise<Readonly<{ report: StageReport; directory: string }>> {
  const provider = createOpenAiProvider({ apiKey: config.apiKey });
  const report = await runStage(config.stage, config, { provider });
  const directory = await writeStageReport(report, config.outputDir);
  console.info(`${formatSummary(report)}\nReport written to ${directory}`);
  return { report, directory };
}
