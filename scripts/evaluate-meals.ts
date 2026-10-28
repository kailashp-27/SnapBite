import {readFile,stat,writeFile} from 'node:fs/promises';
import {evaluationReport,validateEvaluationExport} from '../src/meal-evaluation';

const [filename,output]=process.argv.slice(2);
try{
  if(!filename)throw Error('Usage: npm run evaluate:meals -- dataset.json [report.json]');
  if((await stat(filename)).size>100*1024*1024)throw Error('Dataset exceeds the 100 MB import limit.');
  const dataset=validateEvaluationExport(JSON.parse(await readFile(filename,'utf8')));
  const report={format:'snapbite-evaluation-report',version:1,reports:evaluationReport(dataset.cases),limits:'Human-associated food groups, not mask IoU. Portion errors use confirmed recipe references and original quantities. Coverage includes unscored weighed foods. No trained mass model or automatic calorie accuracy is implied.'};
  const json=JSON.stringify(report,null,2)+'\n';
  if(output)await writeFile(output,json);process.stdout.write(json);
}catch(error){process.stderr.write((error instanceof Error?error.message:String(error))+'\n');process.exitCode=1;}
