import Table from 'cli-table3';

export function outputResult(data: any, json: boolean) {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function outputTable(headers: string[], rows: string[][]) {
  const table = new Table({ head: headers });
  rows.forEach((r) => table.push(r));
  console.log(table.toString());
}

export function handleError(err: any) {
  if (err?.code && err?.message) {
    console.error(`Error [${err.code}]: ${err.message}`);
  } else if (err?.message) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error('An unexpected error occurred');
  }
  process.exit(1);
}
